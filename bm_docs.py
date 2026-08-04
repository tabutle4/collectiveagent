#!/usr/bin/env python3
"""
Pull the transaction BACKUP zips out of Brokermint. This is where the checklist
documents live.

Why this and not the Drive sync:

The API Nation sync only carries a deal's loose "Unsorted documents" unless a
backup zip already exists for that deal - and when one does, the zip contains
the whole file organised by checklist. Confirmed on 25310 Evergreen Bend
(4655326), whose zip holds:

    Tenant (not Apartment) Compliance and Transaction Process Checklist/
        Broker Notice to Buyer/Tenant (HAR 410) v4
        IABS - Tenant Information About Brokerage Services (TXR 2501) v3
        Residential Buyer/Tenant Representation Agreement (TXR 1501) v6
        Agreement Between Brokers (ABB) v2
        lease_pet agreement - Lease
    Unsorted documents/
        JUST LEASED ....jpg
    activity.pdf

So `/v1/transactions/{id}/backup` returns the real transaction file. It 404s on
deals that have no backup generated - three 2024 deals probed all 404'd - so
this script records which deals have one and which do not, and you can decide
what to do about the gaps.

IMPORTANT: the response is BINARY zip, not JSON. The main puller called .json()
on it, which is why this needs its own script.

Usage, from Codespaces:

    export BM_API_KEY='...'
    python3 bm_docs.py            # walk every transaction
    python3 bm_docs.py 4655326    # or just one, to test

Re-runnable: a zip already on disk is skipped. Paced and 429-aware like the
main puller. READ ONLY - GET requests only, nothing is created in Brokermint.
"""

import json, os, sys, time, csv
try:
    import requests
except ImportError:
    sys.exit('pip install requests')

BASE = 'https://my.brokermint.com/api'
KEY = os.environ.get('BM_API_KEY') or ''
OUT = os.environ.get('BM_OUT', 'bm_api_out')
DOCS = os.path.join(OUT, 'backups')
MIN_INTERVAL = float(os.environ.get('BM_INTERVAL', '1.3'))
THROTTLE_WAITS = [60, 120, 300, 600, 900]
ZIP_MAGIC = b'PK\x03\x04'

if not KEY:
    sys.exit("export BM_API_KEY='...' first")
os.makedirs(DOCS, exist_ok=True)

_last = [0.0]


def pace():
    w = MIN_INTERVAL - (time.time() - _last[0])
    if w > 0:
        time.sleep(w)
    _last[0] = time.time()


def fetch_backup(tid):
    """Returns ('zip', bytes) | ('none', None) | ('error', text)."""
    throttles = 0
    for _ in range(12):
        pace()
        try:
            r = requests.get(f'{BASE}/v1/transactions/{tid}/backup',
                             params={'api_key': KEY}, timeout=180)
        except Exception as e:                                    # noqa: BLE001
            return 'error', repr(e)
        if r.status_code == 429:
            wait = THROTTLE_WAITS[min(throttles, len(THROTTLE_WAITS) - 1)]
            throttles += 1
            print(f'   throttled - waiting {wait}s')
            time.sleep(wait)
            continue
        if r.status_code == 404:
            return 'none', None
        if not r.ok:
            return 'error', f'HTTP {r.status_code} {r.text[:120]}'
        body = r.content or b''
        if body[:4] == ZIP_MAGIC:
            return 'zip', body
        # Some accounts hand back a JSON pointer to a download url instead of
        # the bytes. Follow it once if that is what arrived.
        try:
            j = r.json()
        except ValueError:
            return 'error', f'not a zip and not json, {len(body)} bytes'
        url = None
        if isinstance(j, dict):
            for k in ('url', 'download_url', 'file_url', 'link'):
                if j.get(k):
                    url = j[k]
                    break
        if not url:
            return 'error', f'json with no url: {json.dumps(j)[:200]}'
        pace()
        r2 = requests.get(url, timeout=300)
        if r2.ok and (r2.content or b'')[:4] == ZIP_MAGIC:
            return 'zip', r2.content
        return 'error', f'followed url, got HTTP {r2.status_code}'
    return 'error', 'still throttled after all waits'


def load_ids():
    f = os.path.join(OUT, 'transactions_index.json')
    if not os.path.exists(f):
        sys.exit(f'{f} not found - run "python3 bm_api.py pull" first')
    idx = json.load(open(f, encoding='utf-8'))
    return [(t['id'], t.get('address') or t.get('custom_id') or '',
             t.get('status') or '') for t in idx]


def main():
    if len(sys.argv) > 1:
        targets = [(int(sys.argv[1]), '(single)', '')]
    else:
        targets = load_ids()

    print('=' * 70)
    print(f'BACKUP ZIPS - {len(targets)} transactions')
    print(f'writing to {DOCS}')
    print('=' * 70)

    rows, got, none, err, cached = [], 0, 0, 0, 0
    for i, (tid, addr, status) in enumerate(targets, 1):
        path = os.path.join(DOCS, f'{tid}.zip')
        marker = os.path.join(DOCS, f'{tid}.none')
        moved = os.path.join(DOCS, f'{tid}.moved')
        if os.path.exists(moved):
            # already uploaded to storage and cleared off this disk
            cached += 1
            rows.append({'bm_transaction_id': tid, 'status': status,
                         'address': addr, 'result': 'moved to storage', 'bytes': 0})
        elif os.path.exists(path) and os.path.getsize(path) > 4:
            cached += 1
            rows.append({'bm_transaction_id': tid, 'status': status,
                         'address': addr, 'result': 'cached',
                         'bytes': os.path.getsize(path)})
        elif os.path.exists(marker):
            cached += 1
            rows.append({'bm_transaction_id': tid, 'status': status,
                         'address': addr, 'result': 'no backup', 'bytes': 0})
        else:
            kind, payload = fetch_backup(tid)
            if kind == 'zip':
                open(path, 'wb').write(payload)
                got += 1
                rows.append({'bm_transaction_id': tid, 'status': status,
                             'address': addr, 'result': 'zip',
                             'bytes': len(payload)})
            elif kind == 'none':
                open(marker, 'w').write('404')
                none += 1
                rows.append({'bm_transaction_id': tid, 'status': status,
                             'address': addr, 'result': 'no backup', 'bytes': 0})
            else:
                err += 1
                print(f'   ! {tid} {payload}')
                rows.append({'bm_transaction_id': tid, 'status': status,
                             'address': addr, 'result': f'error: {payload}',
                             'bytes': 0})
        if i % 25 == 0 or i == len(targets):
            print(f'   {i}/{len(targets)}  zips {got}  none {none}  '
                  f'cached {cached}  errors {err}')

    man = os.path.join(OUT, 'backup_manifest.csv')
    with open(man, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['bm_transaction_id', 'status',
                                           'address', 'result', 'bytes'])
        w.writeheader()
        w.writerows(rows)

    total = sum(r['bytes'] for r in rows)
    have = [r for r in rows if r['result'] in ('zip', 'cached')]
    missing = [r for r in rows if r['result'] == 'no backup']
    print()
    print(f'  transactions with a backup zip : {len(have)}')
    print(f'  transactions with NO backup    : {len(missing)}')
    print(f'  errors                         : {err}')
    print(f'  total downloaded               : {total / 1_048_576:.1f} MB')
    print(f'  manifest: {man}')
    if missing:
        from collections import Counter
        print()
        print('  deals with no backup, by status:')
        for s, n in Counter(r['status'] for r in missing).most_common():
            print(f'     {s or "(blank)":<12} {n}')
        print()
        print('  A missing backup means Brokermint never generated one for that')
        print('  deal. Its checklist documents are NOT retrievable this way -')
        print('  only whatever loose files the Drive sync picked up.')
    print('=' * 70)


if __name__ == '__main__':
    main()
