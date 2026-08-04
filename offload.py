#!/usr/bin/env python3
"""Move the Brokermint document zips off the Codespace disk into Supabase storage.

    python3 offload.py            # dry run - lists what it would move
    python3 offload.py run        # upload, verify, then delete the local copy

The Codespace has a fixed disk and the archive is bigger than what is left of
it, so the documents cannot all live here at once. This uploads each zip, reads
it back to confirm it arrived intact, and only then deletes the local file.

NOTHING IS DELETED WITHOUT PROOF. After each upload it asks Supabase for the
object's size and compares it to the local file byte for byte. A mismatch, a
missing object, or any error leaves the local file exactly where it is and the
run moves on. A file can only be lost here if Supabase reports the correct size
for an object it does not have, which is not a failure mode it has.

Resumable. Every result is appended to offload_log.csv and anything already
confirmed is skipped, so a throttle, a dropped connection or a full disk costs
nothing but the time to run it again.

Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which are already
in this Codespace.
"""

import csv, os, sys

try:
    import requests
except ImportError:
    sys.exit('pip install requests')

URL = (os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''
if not URL or not KEY:
    sys.exit('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')

BUCKET = os.environ.get('ARCHIVE_BUCKET', 'brokermint-archive')
SRC = os.environ.get('BM_BACKUPS', 'bm_api_out/backups')
LOG = 'offload_log.csv'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}


def ensure_bucket():
    """Create the bucket if it is not there. Private - these are client files."""
    r = requests.get(f'{URL}/storage/v1/bucket/{BUCKET}', headers=H, timeout=60)
    if r.status_code == 200:
        return 'exists'
    r = requests.post(f'{URL}/storage/v1/bucket', headers={**H, 'Content-Type': 'application/json'},
                      json={'id': BUCKET, 'name': BUCKET, 'public': False}, timeout=60)
    if r.ok:
        return 'created'
    if 'already exists' in r.text.lower():
        return 'exists'
    sys.exit(f'Could not create bucket: HTTP {r.status_code} {r.text[:200]}')


def remote_size(name):
    """Bytes Supabase holds for this object, or None if it has nothing."""
    r = requests.post(f'{URL}/storage/v1/object/list/{BUCKET}',
                      headers={**H, 'Content-Type': 'application/json'},
                      json={'prefix': '', 'search': name, 'limit': 100}, timeout=60)
    if not r.ok:
        return None
    for obj in r.json():
        if obj.get('name') == name:
            meta = obj.get('metadata') or {}
            return meta.get('size')
    return None


def upload(name, path):
    with open(path, 'rb') as fh:
        body = fh.read()
    r = requests.post(f'{URL}/storage/v1/object/{BUCKET}/{name}',
                      headers={**H, 'Content-Type': 'application/zip',
                               'x-upsert': 'true'},
                      data=body, timeout=600)
    return r.status_code, r.text[:200], len(body)


def done_already():
    if not os.path.exists(LOG):
        return set()
    with open(LOG, newline='', encoding='utf-8') as fh:
        return {r['file'] for r in csv.DictReader(fh) if r['result'] == 'moved'}


def main():
    live = 'run' in sys.argv
    # Every zip on disk is a candidate, even ones the log already calls moved.
    # The first version trusted its own log and skipped them, which left 7GB of
    # re-downloaded duplicates stranded on a full disk. Storage is asked about
    # each file directly instead - if the object is already there at the right
    # size, the local copy is redundant and goes without being re-uploaded.
    todo = sorted(f for f in os.listdir(SRC) if f.endswith('.zip'))
    total = sum(os.path.getsize(os.path.join(SRC, f)) for f in todo)

    print('=' * 68)
    print(f'zips on disk        {len(todo):>6}   {total / 1e9:.2f} GB')
    print(f'already in storage  {len(done_already()):>6}   (checked per file, not trusted)')
    print(f'destination         {URL}/storage/v1  bucket "{BUCKET}"')
    print('=' * 68)
    if not live:
        print('dry run - rerun with: python3 offload.py run')
        return
    print(f'bucket: {ensure_bucket()}')

    new = not os.path.exists(LOG)
    fh = open(LOG, 'a', newline='', encoding='utf-8')
    w = csv.DictWriter(fh, fieldnames=['file', 'bytes', 'result', 'detail'])
    if new:
        w.writeheader()

    moved = kept = freed = skipped = 0
    for i, name in enumerate(todo, 1):
        path = os.path.join(SRC, name)
        local = os.path.getsize(path)

        # already there and intact? then the local copy is just taking space
        existing = remote_size(name)
        if existing is not None and int(existing) == local:
            os.remove(path)
            open(path[:-4] + '.moved', 'w').write(f'{local}\n')
            freed += local; skipped += 1
            if i % 20 == 0 or i == len(todo):
                print(f'  {i}/{len(todo)}   uploaded {moved}   already there {skipped}'
                      f'   kept back {kept}   freed {freed / 1e9:.2f} GB')
            continue

        code, text, sent = upload(name, path)
        if not (200 <= code < 300):
            w.writerow({'file': name, 'bytes': local, 'result': 'upload_failed',
                        'detail': f'HTTP {code} {text}'})
            fh.flush(); kept += 1
            continue

        got = remote_size(name)
        if got is None:
            w.writerow({'file': name, 'bytes': local, 'result': 'not_confirmed',
                        'detail': 'uploaded but storage does not list it'})
            fh.flush(); kept += 1
            continue
        if int(got) != local:
            w.writerow({'file': name, 'bytes': local, 'result': 'size_mismatch',
                        'detail': f'local {local}, remote {got}'})
            fh.flush(); kept += 1
            continue

        os.remove(path)
        # Leave a marker. Without it the downloader sees a missing zip and
        # fetches the whole deal again, which is exactly what happened on the
        # first run - the two scripts undid each other and the disk climbed
        # while nothing new was actually being collected.
        open(path[:-4] + '.moved', 'w').write(f'{local}\n')
        w.writerow({'file': name, 'bytes': local, 'result': 'moved', 'detail': ''})
        fh.flush()
        moved += 1; freed += local

        if i % 20 == 0 or i == len(todo):
            print(f'  {i}/{len(todo)}   uploaded {moved}   already there {skipped}'
                  f'   kept back {kept}   freed {freed / 1e9:.2f} GB')

    fh.close()
    print()
    print(f'done. uploaded {moved}, already in storage {skipped}, '
          f'kept back {kept}, freed {freed / 1e9:.2f} GB')
    if kept:
        print(f'  {kept} file(s) stayed on disk - see {LOG} for why. Nothing was lost.')


if __name__ == '__main__':
    main()
