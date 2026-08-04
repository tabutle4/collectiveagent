#!/usr/bin/env python3
"""One-off repair: write a .moved marker for every zip already in storage.

The first offload run deleted zips without leaving a trace, so the downloader
saw them as missing and fetched them all over again. This writes the markers
retroactively from offload_log.csv, so the downloader stops re-fetching work
that is already safe in Supabase.

Reads the log only. Creates marker files. Deletes nothing.
"""
import csv, os

LOG = 'offload_log.csv'
DOCS = 'bm_api_out/backups'

made = already = 0
for r in csv.DictReader(open(LOG, newline='', encoding='utf-8')):
    if r['result'] != 'moved':
        continue
    m = os.path.join(DOCS, r['file'][:-4] + '.moved')
    if os.path.exists(m):
        already += 1
        continue
    open(m, 'w').write(r['bytes'] + '\n')
    made += 1
print(f'markers written {made}, already there {already}')
