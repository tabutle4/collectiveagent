#!/usr/bin/env bash
# Two fixes in this patch:
# 1. Auto-derive sales_volume from monthly_rent x lease_term on lease updates.
# 2. Fix transaction type label in detail-page header — use canonical helper
#    so post-migration codes (tenant_non_apt_v2 etc.) render with friendly names.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/app" ]; then
  echo "ERROR: $PROJECT_ROOT does not look like the project root."
  exit 1
fi
cp -v "$SCRIPT_DIR/admin_txn_id_route.ts" "$PROJECT_ROOT/app/api/admin/transactions/[id]/route.ts"
cp -v "$SCRIPT_DIR/admin_txn_id_page.tsx" "$PROJECT_ROOT/app/admin/transactions/[id]/page.tsx"
echo ""
echo "Then commit:"
echo "  cd $PROJECT_ROOT"
echo "  git add -A"
echo "  git commit -m 'Auto-derive sales_volume + fix friendly type label in header'"
echo "  git push origin main"
