#!/bin/bash
# Deploys the All Payouts report fix:
#   1. API route now also fetches pm_fee_payouts and landlord_disbursements,
#      returns pendingByType + countByType, and respects the type filter.
#   2. Page useEffect no longer drops keystrokes during in-flight requests
#      (the search box stays in sync with rendered rows; 300ms debounce).

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_ROOT="${REPO_ROOT}"

cp "${PATCH_ROOT}/app/api/admin/all-payouts/route.ts" \
   "${REPO_ROOT}/app/api/admin/all-payouts/route.ts"

cp "${PATCH_ROOT}/app/admin/reports/all-payouts/page.tsx" \
   "${REPO_ROOT}/app/admin/reports/all-payouts/page.tsx"

echo "All Payouts fix deployed."
echo "  - app/api/admin/all-payouts/route.ts"
echo "  - app/admin/reports/all-payouts/page.tsx"
echo ""
echo "Next: git add -A && git commit -m 'Fix All Payouts: include PM rows, fix search debounce' && git push"
