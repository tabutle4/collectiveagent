#!/usr/bin/env python3
"""Fill in the transactions the paged list endpoint returned incomplete.

    python3 fix_transactions.py

Brokermint's /v2/transactions list returns a sparse record for some deals -
custom_id, closing_date, sales_volume and total_gross_commission all come back
empty - while fetching the same deal individually returns everything. The main
puller builds bm_transactions.csv from the list, so those deals land in the CSV
with holes and every downstream comparison reads them as missing data.

This finds the incomplete rows, fetches each deal on its own, and rewrites the
CSV with the real values. Nothing else is touched: a row that already has a
custom_id is copied across untouched, and no column is dropped.

Read only against Brokermint - GET requests, nothing written to their side.
"""

import csv, json, os, sys, time

try:
    import requests
except ImportError:
    sys.exit('pip install requests')

KEY = os.environ.get('BM_API_KEY') or ''
if not KEY:
    sys.exit("export BM_API_KEY='...' first")

BASE = 'https://my.brokermint.com/api'
CSV = 'bm_api_out/csv/bm_transactions.csv'
MIN_INTERVAL = 1.3
_last = [0.0]


def fetch(tid):
    for _ in range(8):
        gap = MIN_INTERVAL - (time.time() - _last[0])
        if gap > 0:
            time.sleep(gap)
        _last[0] = time.time()
        try:
            r = requests.get(f'{BASE}/v2/transactions/{tid}',
                             params={'api_key': KEY}, timeout=60)
        except Exception as e:
            print(f'   {tid} network error: {type(e).__name__}')
            time.sleep(5)
            continue
        if r.status_code == 429:
            print('   throttled 60s')
            time.sleep(60)
            continue
        if not r.ok:
            return None, f'HTTP {r.status_code}'
        try:
            return r.json(), None
        except json.JSONDecodeError:
            return None, 'bad json'
    return None, 'gave up after repeated throttling'


def main():
    with open(CSV, newline='', encoding='utf-8-sig') as fh:
        rdr = csv.DictReader(fh)
        cols = list(rdr.fieldnames)
        rows = list(rdr)

    bad = [r for r in rows if not (r.get('custom_id') or '').strip()]
    print(f'rows in file      {len(rows)}')
    print(f'incomplete        {len(bad)}')
    if not bad:
        print('nothing to do')
        return

    fixed = failed = 0
    for i, r in enumerate(bad, 1):
        tid = (r.get('id') or '').strip()
        data, err = fetch(tid)
        if err or not isinstance(data, dict):
            print(f'   {tid}  FAILED  {err}')
            failed += 1
            continue
        # Only overwrite what the detail call actually returned. A key the
        # detail response does not carry is left as it was rather than blanked,
        # which is the mistake that produced these holes in the first place.
        for k, v in data.items():
            if k not in cols:
                cols.append(k)
            r[k] = '' if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else v)
        fixed += 1
        if i % 10 == 0 or i == len(bad):
            print(f'   {i}/{len(bad)}   fixed {fixed}  failed {failed}')

    with open(CSV, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)

    still = sum(1 for r in rows if not (r.get('custom_id') or '').strip())
    print()
    print(f'done. fixed {fixed}, failed {failed}, still incomplete {still}')


if __name__ == '__main__':
    main()
