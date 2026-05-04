#!/usr/bin/env bash
# Payouts Report fix — agent rows now subtract staged debts (and add staged
# credits) from agent_net so the report shows the actual cash payout. Only
# applied to TIAs that are still pending; paid TIAs already have debts
# baked into agent_net.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/app" ]; then
  echo "ERROR: $PROJECT_ROOT does not look like the project root."
  exit 1
fi
mkdir -p "$PROJECT_ROOT/app/api/admin/payouts-report"
cp -v "$SCRIPT_DIR/payouts-report_route.ts" "$PROJECT_ROOT/app/api/admin/payouts-report/route.ts"
echo ""
echo "Then commit:"
echo "  cd $PROJECT_ROOT"
echo "  git add -A"
echo "  git commit -m 'Payouts report subtracts staged debts from pending agent rows'"
echo "  git push origin main"
