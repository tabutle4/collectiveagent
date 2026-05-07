# Re-deploy: All Payouts + Payouts Report fixes

## What went wrong

Both prior commits (`74b76f4` and `728cff5`) shipped to `main` but the
patched files never reached their real paths.

- `74b76f4` committed the patched `route.ts` and `page.tsx` to
  `patch/app/api/admin/all-payouts/route.ts` and
  `patch/app/admin/reports/all-payouts/page.tsx`
  instead of overwriting the real files at `app/api/admin/...` and
  `app/admin/reports/...`.
- `728cff5` committed only the zip archive itself and no extracted files.

The files at `app/api/admin/all-payouts/route.ts` and
`app/api/admin/payouts-report/route.ts` on `main` are therefore still
the original pre-patch code. That is why:
- All status tiles on `/admin/reports/all-payouts` show $0/0
  (the original API never returns `pendingByType` / `countByType`)
- Paid PM fee and landlord rows do not appear in the table
  (the original API only queries `transaction_internal_agents`
   and `transaction_external_brokerages`)

## What this re-deploy does

1. Drops the patched files at the correct repo-relative paths:
   - `app/api/admin/all-payouts/route.ts`
   - `app/api/admin/payouts-report/route.ts`
   - `app/admin/reports/all-payouts/page.tsx`
2. Removes the leftover `patch/` directory and the two stale
   `*-fix.zip` files at the repo root.
3. Verifies key markers in each patched file before you commit.

The patched contents are identical to what was supposed to deploy
last time. No new logic, only correct placement.

## How to deploy

From the repo root in Codespaces:

```bash
unzip -o redeploy-payouts-fix.zip
bash deploy.sh
git add -A
git commit -m "Re-deploy All Payouts + Payouts Report fixes (correct paths)"
git push origin main
```

The `git add -A` will pick up the three modified files **and** the
deletions of `patch/` and the two stale zips. Vercel will redeploy.

## Verification after deploy

On `/admin/reports/all-payouts`:
- Tiles should show real pending totals for Agents and External
- Paid PM fee rows (4 rows, $620 total) should appear in the table
- Paid landlord disbursement rows (2 rows, $5,580 total) should appear
- Type filter dropdown should let you isolate PM fees or Landlords

If tiles still show $0/0 after redeploy, hard-refresh the page to
clear any stale browser bundle, then check the Network tab response
for `/api/admin/all-payouts` and confirm it includes the
`pendingByType` and `countByType` keys.
