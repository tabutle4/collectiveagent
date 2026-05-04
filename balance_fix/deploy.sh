#!/usr/bin/env bash
# Balance bar fix — subtract staged debts (and add staged credits) when computing
# Payouts tab balance, so it nets to $0 when staged amounts are accounted for.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/app" ]; then
  echo "ERROR: $PROJECT_ROOT does not look like the project root."
  exit 1
fi
cp -v "$SCRIPT_DIR/admin_txn_id_page.tsx" "$PROJECT_ROOT/app/admin/transactions/[id]/page.tsx"
echo ""
echo "Then commit:"
echo "  cd $PROJECT_ROOT"
echo "  git add -A"
echo "  git commit -m 'Payout balance accounts for staged debts/credits'"
echo "  git push origin main"
