#!/usr/bin/env bash
# Re-deploys the All Payouts and Payouts Report fixes at the correct
# repo paths. The previous deploys committed files under patch/ instead
# of overwriting the real app/ files, so the fixes never went live.
#
# Run from the repo root:
#   bash deploy.sh
#
# Then:
#   git add -A
#   git commit -m "Re-deploy All Payouts + Payouts Report fixes (correct paths)"
#   git push origin main
set -euo pipefail

echo ""
echo "=== Cleanup leftover patch artifacts at repo root ==="
if [ -d "patch" ]; then
  echo "Removing leftover patch/ directory..."
  rm -rf patch
fi

for stale_zip in all-payouts-fix.zip payouts-report-fix.zip; do
  if [ -f "$stale_zip" ]; then
    echo "Removing leftover $stale_zip..."
    rm -f "$stale_zip"
  fi
done

echo ""
echo "=== Verify patched files are in place at correct paths ==="
fail=0
for f in \
  app/api/admin/all-payouts/route.ts \
  app/api/admin/payouts-report/route.ts \
  app/admin/reports/all-payouts/page.tsx; do
  if [ ! -f "$f" ]; then
    echo "MISSING: $f"
    fail=1
  else
    echo "OK: $f"
  fi
done

if [ "$fail" = "1" ]; then
  echo ""
  echo "ERROR: One or more files are missing. Re-extract the zip from the repo root."
  exit 1
fi

echo ""
echo "=== Verify patches are applied ==="
if ! grep -q "pendingByType" app/api/admin/all-payouts/route.ts; then
  echo "ERROR: app/api/admin/all-payouts/route.ts does NOT contain pendingByType."
  echo "       The deployed file is still the unpatched version."
  exit 1
fi
echo "OK: all-payouts route has pendingByType"

if ! grep -q "pm_fees" app/api/admin/payouts-report/route.ts; then
  echo "ERROR: app/api/admin/payouts-report/route.ts does NOT contain pm_fees key."
  exit 1
fi
echo "OK: payouts-report route returns pm_fees"

if ! grep -q "setTimeout(() => loadData(), 300)" app/admin/reports/all-payouts/page.tsx; then
  echo "ERROR: page.tsx does NOT have the 300ms debounce."
  exit 1
fi
echo "OK: page.tsx has debounce"

echo ""
echo "=== Done ==="
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'Re-deploy All Payouts + Payouts Report fixes (correct paths)'"
echo "  git push origin main"
