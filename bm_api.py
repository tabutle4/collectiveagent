#!/usr/bin/env python3
"""
Brokermint API puller. Run from the Codespaces terminal.

    pip install requests
    export BM_API_KEY='...'

    python3 bm_api.py probe      <-- DO THIS FIRST. ~20 calls, 10 seconds.
    python3 bm_api.py pull       <-- the bulk pull, after we look at the probe
    python3 bm_api.py archive    <-- everything else, for the closing account

WHY PROBE FIRST
The published docs describe /v1/transactions/{id}/commissions as commission
*structure* - item_type tgc/award_distribution, tiers, minimum and maximum
dollar amounts. That may not be the per-agent payout. The payout may live on
/v1/transactions/{id}/participants/users instead.

Guessing wrong means 1,100+ wasted calls against an account that is about to be
closed. `probe` pulls every endpoint for three real deals and prints the raw
JSON so we can see which one actually holds the money, then `pull` goes wide
against the endpoint that does.

DATES: the API returns 13-digit unix millisecond timestamps, NOT the MM/DD/YYYY
the report exports used. Converted on the way out.

READ ONLY. GET requests only. Never writes to Brokermint.
"""

import csv, json, os, sys, time, threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    sys.exit('pip install requests   then run this again')

BASE = 'https://my.brokermint.com/api'
KEY = os.environ.get('BM_API_KEY') or ''
OUT = os.environ.get('BM_OUT', 'bm_api_out')
WORKERS = int(os.environ.get('BM_WORKERS', '4'))
STATUSES = ['listing', 'pending', 'closed', 'cancelled']

if not KEY:
    sys.exit("export BM_API_KEY='...'   then run this again")

_lock = threading.Lock()
_n = {'ok': 0, 'cached': 0, 'err': 0}


def _bump(k):
    with _lock:
        _n[k] += 1


def p(*parts):
    f = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    return f


def get(ep, params=None, cache=None):
    if cache:
        f = p(cache)
        if os.path.exists(f) and os.path.getsize(f) > 1:
            _bump('cached')
            try:
                return json.load(open(f, encoding='utf-8'))
            except json.JSONDecodeError:
                pass
    q = dict(params or {})
    q['api_key'] = KEY
    for attempt in range(4):
        try:
            r = requests.get(f'{BASE}{ep}', params=q, timeout=60)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            data = None if r.status_code == 404 else (r.json() if r.ok else None)
            if not r.ok and r.status_code != 404:
                _bump('err')
                print(f'   ! {ep} HTTP {r.status_code} {r.text[:100]}')
                return None
            _bump('ok')
            if cache:
                json.dump(data, open(p(cache), 'w', encoding='utf-8'))
            return data
        except Exception as e:                                   # noqa: BLE001
            if attempt == 3:
                _bump('err')
                print(f'   ! {ep} {e!r}')
                return None
            time.sleep(2 ** attempt)
    return None


def ms(v):
    """13-digit unix ms -> YYYY-MM-DD. Passes through anything else."""
    if v in (None, '', 0):
        return ''
    s = str(v)
    if s.isdigit() and len(s) >= 12:
        return datetime.fromtimestamp(int(s) / 1000, timezone.utc).strftime('%Y-%m-%d')
    return s[:10] if '-' in s else s


def paged(ep, extra=None):
    out, seen, cursor = [], set(), None
    while True:
        q = dict(extra or {}); q['count'] = 1000
        if cursor is not None:
            q['starting_from_id'] = cursor
        page = get(ep, q)
        if not page:
            break
        if isinstance(page, dict):
            page = page.get('data') or [page]
        fresh = [r for r in page if r.get('id') not in seen]
        if not fresh:
            break
        seen.update(r.get('id') for r in fresh)
        out.extend(fresh)
        print(f'   {ep} +{len(fresh)} (total {len(out)})')
        if len(page) < 1000:
            break
        ints = [r['id'] for r in fresh if isinstance(r.get('id'), int)]
        if not ints:
            break
        cursor = max(ints)
    return out


def txn_index():
    """Every transaction, all statuses, cached so later runs are instant."""
    f = p('transactions_index.json')
    if os.path.exists(f):
        idx = json.load(open(f, encoding='utf-8'))
        print(f'   index cached: {len(idx)} transactions')
        return idx
    by_id = {}
    for st in STATUSES:
        print(f'   status={st}')
        for t in paged('/v2/transactions', {'statuses': st}):
            by_id[t['id']] = t
    for t in paged('/v2/transactions'):
        by_id.setdefault(t['id'], t)
    idx = list(by_id.values())
    json.dump(idx, open(f, 'w', encoding='utf-8'))
    print(f'   index: {len(idx)} unique transactions')
    return idx


# ------------------------------------------------------------------ probe
PROBE_EPS = [
    ('transaction',        '/v2/transactions/{id}'),
    ('commissions',        '/v1/transactions/{id}/commissions'),
    ('participants',       '/v1/transactions/{id}/participants'),
    ('participants_users', '/v1/transactions/{id}/participants/users'),
    ('backup',             '/v1/transactions/{id}/backup'),
    ('checklists',         '/v1/transactions/{id}/checklists'),
]


def probe():
    print('=' * 72)
    print('PROBE - three closed deals, every endpoint, raw JSON')
    print('=' * 72)
    closed = paged('/v2/transactions', {'statuses': 'closed'})
    if not closed:
        sys.exit('No closed transactions came back. Check the key.')
    # pick three with money on them so the payout fields are populated
    def gci(t):
        for k in ('total_gross_commission', 'gross_commission', 'price'):
            try:
                return float(t.get(k) or 0)
            except (TypeError, ValueError):
                pass
        return 0.0
    picks = sorted(closed, key=lambda t: -gci(t))[:3]
    print(f'\nprobing ids: {[t["id"] for t in picks]}\n')
    for t in picks:
        tid = t['id']
        print('#' * 72)
        print(f'# TRANSACTION {tid}   {t.get("address") or t.get("full_address") or ""}')
        print('#' * 72)
        for name, tpl in PROBE_EPS:
            data = get(tpl.format(id=tid), cache=f'probe/{tid}_{name}.json')
            print(f'\n----- {name}  {tpl.format(id=tid)}')
            if data is None:
                print('  (no data / 404)')
                continue
            print(json.dumps(data, indent=2)[:4000])
        print()
    print('=' * 72)
    print(f'requests {_n["ok"]}  cached {_n["cached"]}  errors {_n["err"]}')
    print(f'raw JSON written under {OUT}/probe/')
    print()
    print('Paste the output above (or zip the probe folder and upload it).')
    print('Once we can see which endpoint holds the per-agent payout, run:')
    print('    python3 bm_api.py pull')
    print('=' * 72)


# ------------------------------------------------------------------ pull
def flat(prefix, obj, into):
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f'{prefix}{k}'
            if isinstance(v, (dict, list)):
                flat(f'{key}_', v, into)
            else:
                into[key] = v
    elif isinstance(obj, list):
        if obj and all(not isinstance(x, (dict, list)) for x in obj):
            into[prefix.rstrip('_')] = '; '.join(str(x) for x in obj)
        else:
            for i, v in enumerate(obj):
                flat(f'{prefix}{i}_', v, into)


def write_csv(name, rows):
    if not rows:
        print(f'   {name}: empty')
        return
    cols = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    f = p('csv', f'{name}.csv')
    with open(f, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader(); w.writerows(rows)
    print(f'   {name}.csv  {len(rows)} rows  {len(cols)} cols')


DATE_KEYS = ('date', '_at', 'closed', 'expiration', 'acceptance', 'listing')


def pull():
    print('=' * 72)
    print('PULL - the data needed to compare Brokermint against the app')
    print('=' * 72)
    # Users: never let a transient failure clobber a good file. A re-run that
    # gets nothing back (rate limit, blip) must fall back to what is on disk
    # rather than writing an empty list over 160 real records.
    users_file = p('users.json')
    on_disk = []
    if os.path.exists(users_file):
        try:
            on_disk = json.load(open(users_file, encoding='utf-8')) or []
        except json.JSONDecodeError:
            on_disk = []
    if on_disk:
        users = on_disk
        print(f'   users: {len(users)} (from cache)')
    else:
        users = paged('/v1/users') or []
        if users:
            json.dump(users, open(users_file, 'w', encoding='utf-8'))
            print(f'   users: {len(users)}')
        else:
            print('   users: 0 - the endpoint returned nothing and there is no '
                  'cached copy. Continuing; agent names come from the ledger '
                  'payee fields anyway.')

    idx = txn_index()
    ids = [t['id'] for t in idx]

    def one(tid):
        get(f'/v2/transactions/{tid}',              cache=f'txn/{tid}/transaction.json')
        get(f'/v1/transactions/{tid}/commissions',  cache=f'txn/{tid}/commissions.json')
        get(f'/v1/transactions/{tid}/participants', cache=f'txn/{tid}/participants.json')
        return tid

    print(f'\n   {len(ids)} transactions x 3 endpoints, {WORKERS} workers')
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for _ in as_completed([ex.submit(one, t) for t in ids]):
            done += 1
            if done % 50 == 0 or done == len(ids):
                print(f'   {done}/{len(ids)}  ok {_n["ok"]}  cached {_n["cached"]}  err {_n["err"]}')

    # ---- the per-agent ledger --------------------------------------------
    # The probe proved the shape. /commissions returns one flat list mixing
    # account-level items and per-agent items, keyed by payee_type:
    #
    #   Account-level   tgc, award_distribution, GROSS_INCOME,
    #                   COMMISSION_ALLOCATION_BASE, AGENT_COMMISSIONS,
    #                   OFFICE_NET, post_split_deduction
    #   Per-agent       award_allocation, sales_volume, split, ADJUSTED_BASIS,
    #                   COMPANY_SPLIT, NET_COMMISSION,
    #                   COMPANY_DOLLAR_CONTRIBUTION
    #
    # Verified on deal 2799430: split + COMPANY_SPLIT = tgc,
    # split - post_split_deductions = NET_COMMISSION, and
    # COMPANY_SPLIT + deductions = OFFICE_NET. So NET_COMMISSION is the
    # equivalent of our amount_1099_reportable and `split` is our agent_gross.
    # Brokermint has no debt line, so nothing here maps to our agent_net.
    USER_ITEMS = ['award_allocation', 'sales_volume', 'split', 'ADJUSTED_BASIS',
                  'COMPANY_SPLIT', 'NET_COMMISSION', 'COMPANY_DOLLAR_CONTRIBUTION']
    ACCT_ITEMS = ['tgc', 'GROSS_INCOME', 'COMMISSION_ALLOCATION_BASE',
                  'AGENT_COMMISSIONS', 'OFFICE_NET']

    def amt(c):
        try:
            return float(c.get('calculated_dollar_amount') or 0)
        except (TypeError, ValueError):
            return 0.0

    ledger = []
    for t in idx:
        tid = t['id']
        f = p(f'txn/{tid}/commissions.json')
        if not os.path.exists(f):
            continue
        items = json.load(open(f, encoding='utf-8')) or []
        if isinstance(items, dict):
            items = [items]

        base = {
            'bm_transaction_id': tid,
            'bm_custom_id': t.get('custom_id'),
            'address': t.get('address'),
            'city': t.get('city'), 'state': t.get('state'), 'zip': t.get('zip'),
            'status': t.get('status'),
            'representing': t.get('representing'),
            'transaction_type': t.get('transaction_type'),
            'closing_date': ms(t.get('closing_date')),
            'price': t.get('price'),
            'txn_sales_volume': t.get('sales_volume'),
            'total_gross_commission': t.get('total_gross_commission'),
        }
        for it in ACCT_ITEMS:
            base[f'acct_{it}'] = sum(amt(c) for c in items if c.get('item_type') == it)
        # outside brokerage on the other side, if any
        ext = [c for c in items if c.get('item_type') == 'award_distribution'
               and c.get('payee_type') == 'Contact']
        base['outside_brokerage'] = '; '.join(
            f"{c.get('payee_name')} ({c.get('payee_company')}) {amt(c):.2f}" for c in ext)

        # deductions carry payee Account but belong to a side
        ded_by_side = {}
        for c in items:
            if c.get('item_type') == 'post_split_deduction':
                s = c.get('side') or ''
                d = ded_by_side.setdefault(s, {'total': 0.0, 'detail': []})
                d['total'] += amt(c)
                d['detail'].append(f"{c.get('name') or 'fee'} {amt(c):.2f}")

        # one row per (agent, side)
        agents = {}
        for c in items:
            if c.get('payee_type') != 'User' or c.get('item_type') not in USER_ITEMS:
                continue
            k = (c.get('payee_id'), c.get('side') or '')
            row = agents.setdefault(k, dict(base, **{
                'bm_user_id': c.get('payee_id'),
                'agent_name': c.get('payee_name'),
                'agent_first_name': c.get('payee_first_name'),
                'agent_last_name': c.get('payee_last_name'),
                'agent_team': c.get('payee_team'),
                'side': c.get('side'),
                'applied_plan': '',
            }))
            row[c['item_type']] = amt(c)
            if c.get('applied_plan'):
                row['applied_plan'] = c['applied_plan']
        for (pid, side), row in agents.items():
            d = ded_by_side.get(side or '', {'total': 0.0, 'detail': []})
            row['post_split_deductions'] = round(d['total'], 2)
            row['deduction_detail'] = '; '.join(d['detail'])
            for it in USER_ITEMS:
                row.setdefault(it, 0.0)
            # does the ledger close the way the probe showed it should?
            row['check_split_minus_deds_eq_net'] = (
                'ok' if abs(row['split'] - d['total'] - row['NET_COMMISSION']) < 0.01
                else f"OFF {row['split'] - d['total'] - row['NET_COMMISSION']:.2f}")
            ledger.append(row)

    write_csv('bm_agent_ledger', ledger)
    off = [r for r in ledger if r['check_split_minus_deds_eq_net'] != 'ok']
    print(f'   ledger rows {len(ledger)}, agents on more than one side included')
    print(f'   rows where split - deductions != NET_COMMISSION: {len(off)}')
    for r in off[:10]:
        print(f"      {r['bm_transaction_id']} {r['agent_name']} {r['check_split_minus_deds_eq_net']}")

    # flatten
    txns, comms, parts = [], [], []
    for t in idx:
        tid = t['id']
        d = json.load(open(p(f'txn/{tid}/transaction.json'), encoding='utf-8')) \
            if os.path.exists(p(f'txn/{tid}/transaction.json')) else t
        row = {}
        flat('', d or t, row)
        for k in list(row):
            if any(s in k.lower() for s in DATE_KEYS):
                row[k] = ms(row[k])
        txns.append(row)
        for name, bucket in (('commissions', comms), ('participants', parts)):
            f = p(f'txn/{tid}/{name}.json')
            if not os.path.exists(f):
                continue
            payload = json.load(open(f, encoding='utf-8')) or []
            if isinstance(payload, dict):
                payload = [payload]
            for item in payload:
                r = {'bm_transaction_id': tid}
                flat('', item, r)
                for k in list(r):
                    if any(s in k.lower() for s in DATE_KEYS):
                        r[k] = ms(r[k])
                bucket.append(r)

    write_csv('bm_transactions', txns)
    write_csv('bm_commissions', comms)
    write_csv('bm_participants', parts)
    user_rows = []
    for u in users:
        r = {}
        flat('', u, r)
        user_rows.append(r)
    write_csv('bm_users', user_rows)

    def num(v):
        try:
            return float(str(v).replace(',', '').replace('$', ''))
        except (TypeError, ValueError):
            return 0.0

    print('\n   MONEY COLUMNS FOUND, WITH TOTALS - sanity check these against the UI')
    for label, rows in (('transactions', txns), ('commissions', comms), ('participants', parts)):
        if not rows:
            continue
        keys = [k for k in rows[0] if any(s in k.lower() for s in
                ('gci', 'net', 'gross', 'amount', 'commission', 'price', 'volume'))]
        for k in keys:
            tot = sum(num(r.get(k)) for r in rows)
            if tot:
                print(f'      {label:<14} {k:<40} {tot:>16,.2f}')

    print(f'\n   zip {OUT} and upload it')
    print('=' * 72)


# ------------------------------------------------------------------ archive
def archive():
    print('ARCHIVE - the rest, for the closing account')
    idx = txn_index()
    for name, ep in (('users', '/v1/users'), ('contacts', '/v1/contacts')):
        json.dump(paged(ep), open(p(f'{name}.json'), 'w', encoding='utf-8'))
    json.dump(get('/v1/commission_plans'), open(p('commission_plans.json'), 'w', encoding='utf-8'))
    reports = paged('/v2/reports') or []
    for r in reports:
        rid = r.get('id')
        if rid is not None:
            get(f'/v2/reports/{rid}', cache=f'reports/{rid}.json')
    print(f'   saved reports: {len(reports)}')

    def one(tid):
        get(f'/v1/transactions/{tid}/participants/users', cache=f'txn/{tid}/participants_users.json')
        get(f'/v1/transactions/{tid}/backup',             cache=f'txn/{tid}/backup.json')
        get(f'/v1/transactions/{tid}/offers',             cache=f'txn/{tid}/offers.json')
        cl = get(f'/v1/transactions/{tid}/checklists',    cache=f'txn/{tid}/checklists.json')
        for c in (cl or []):
            cid = c.get('id')
            if cid is not None:
                get(f'/v1/transactions/{tid}/checklists/{cid}/tasks',
                    cache=f'txn/{tid}/checklist_{cid}_tasks.json')
        return tid

    done = 0
    ids = [t['id'] for t in idx]
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for _ in as_completed([ex.submit(one, t) for t in ids]):
            done += 1
            if done % 50 == 0 or done == len(ids):
                print(f'   {done}/{len(ids)}  ok {_n["ok"]}  cached {_n["cached"]}  err {_n["err"]}')
    print(f'   done. zip {OUT}')


if __name__ == '__main__':
    mode = (sys.argv[1] if len(sys.argv) > 1 else 'probe').lower()
    t0 = time.time()
    {'probe': probe, 'pull': pull, 'archive': archive}.get(mode, probe)()
    print(f'{int(time.time() - t0)}s')
