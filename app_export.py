#!/usr/bin/env python3
"""
Dump the app's tables straight out of Supabase to CSV, from the Codespaces
terminal. Replaces exporting tables by hand in the SQL Editor.

    export NEXT_PUBLIC_SUPABASE_URL='https://xxxx.supabase.co'
    export SUPABASE_SERVICE_ROLE_KEY='...'
    python3 app_export.py

Or, if those are already in a .env / .env.local in the repo, it reads them from
there and you can just run it.

READ ONLY BY CONSTRUCTION. It issues GET requests to the PostgREST endpoint and
nothing else. There is no code path here that writes, updates or deletes.

The service role key bypasses row-level security, so:
  * the key is never printed, never logged, never written to any output file
  * keep it out of git - see the warning this prints about .gitignore

Handles the 1000-row cap. Supabase caps a single response at 1000 rows, which is
the same limitation that keeps biting the app itself, so this pages with the
Range header until a short page comes back and asserts the total it got matches
the count the server reports.
"""

import csv, json, os, re, sys

try:
    import requests
except ImportError:
    sys.exit('pip install requests')

TABLES = [
    'transactions',
    'transaction_internal_agents',
    'transaction_external_brokerages',
    'users',
    'agent_form_submissions',
    'checks_received',
    'agent_debts',
    'company_settings',
    'processing_fee_types',
    'commission_plans',
    'permissions',
    'role_permissions',
]

PAGE = 1000
OUT = os.environ.get('APP_OUT', 'app_export')


def load_dotenv():
    """Pick up the keys from a .env file if they are not already exported."""
    for name in ('.env.local', '.env', '.env.development.local'):
        if not os.path.exists(name):
            continue
        for line in open(name, encoding='utf-8', errors='replace'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY') \
                    and not os.environ.get(k):
                os.environ[k] = v


load_dotenv()
URL = (os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''

if not URL or not KEY:
    print('Missing credentials. Either export them:')
    print("    export NEXT_PUBLIC_SUPABASE_URL='https://xxxx.supabase.co'")
    print("    export SUPABASE_SERVICE_ROLE_KEY='...'")
    print('or put them in .env.local in the repo root, then run this again.')
    print()
    print('Both values are in Vercel under Settings -> Environment Variables.')
    sys.exit(1)

os.makedirs(OUT, exist_ok=True)
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}


def fetch_table(name):
    """Every row of one table, paged past the 1000-row cap."""
    rows, offset, reported_total = [], 0, None
    while True:
        h = dict(H)
        h['Range-Unit'] = 'items'
        h['Range'] = f'{offset}-{offset + PAGE - 1}'
        h['Prefer'] = 'count=exact'
        r = requests.get(f'{URL}/rest/v1/{name}', headers=h,
                         params={'select': '*'}, timeout=120)
        if r.status_code in (401, 403):
            return None, 'permission denied'
        if r.status_code == 404:
            return None, 'table not found'
        if not r.ok:
            return None, f'HTTP {r.status_code} {r.text[:120]}'
        cr = r.headers.get('content-range', '')
        m = re.match(r'(\d+)-(\d+)/(\d+|\*)', cr)
        if m and m.group(3).isdigit():
            reported_total = int(m.group(3))
        batch = r.json()
        if not isinstance(batch, list):
            return None, 'unexpected response shape'
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
        if offset > 500_000:
            return None, 'runaway pagination, stopped'
    if reported_total is not None and len(rows) != reported_total:
        return None, f'row loss: got {len(rows)}, server says {reported_total}'
    return rows, None


def write_csv(name, rows):
    cols = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    path = os.path.join(OUT, f'{name}.csv')
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v) if isinstance(v, (dict, list)) else v)
                        for k, v in r.items()})
    return path, len(cols)


print('=' * 70)
print(f'SUPABASE EXPORT -> {OUT}/')
print(f'  project: {URL}')
print('=' * 70)
total = 0
for t in TABLES:
    rows, err = fetch_table(t)
    if err:
        print(f'  {t:<34} skipped: {err}')
        continue
    path, ncols = write_csv(t, rows)
    total += len(rows)
    print(f'  {t:<34}{len(rows):>7} rows  {ncols:>3} cols')
print()
print(f'  {total:,} rows written')

if os.path.exists('.gitignore'):
    ig = open('.gitignore', encoding='utf-8').read()
    missing = [p for p in ('.env', f'{OUT}/') if p not in ig]
    if missing:
        print()
        print('  WARNING - add these to .gitignore before committing anything:')
        for p in missing:
            print(f'      {p}')
        print('  A bare ".env" is NOT covered by the existing ".env*.local" rule,')
        print('  and the service role key bypasses row-level security.')
print('=' * 70)
