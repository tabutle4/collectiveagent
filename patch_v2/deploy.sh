#!/usr/bin/env bash
# Deploys patch files into the project root.
#
# Usage: from the project root (e.g. /workspaces/collectiveagent), run:
#   bash patch_v2/deploy.sh
#
# Or from inside patch_v2/, run:
#   bash deploy.sh   (auto-detects parent as project root)
set -e

# Detect project root: parent of this script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Script dir:    $SCRIPT_DIR"
echo "Project root:  $PROJECT_ROOT"

# Sanity check: project root should contain package.json and an app/ dir
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/app" ]; then
  echo "ERROR: $PROJECT_ROOT does not look like the collectiveagent project root."
  echo "Expected to find package.json and app/ there."
  exit 1
fi

# Make sure target directories exist
mkdir -p "$PROJECT_ROOT/components/transactions"
mkdir -p "$PROJECT_ROOT/app/transactions"
mkdir -p "$PROJECT_ROOT/app/admin/transactions/[id]"
mkdir -p "$PROJECT_ROOT/app/api/admin/transactions/[id]"
mkdir -p "$PROJECT_ROOT/app/api/admin/transactions/smart-calc"
mkdir -p "$PROJECT_ROOT/lib/transactions"

# Copy each file to its real destination
cp -v "$SCRIPT_DIR/NewTransactionModal.tsx" "$PROJECT_ROOT/components/transactions/NewTransactionModal.tsx"
cp -v "$SCRIPT_DIR/AgentBillingPanel.tsx"   "$PROJECT_ROOT/components/transactions/AgentBillingPanel.tsx"
cp -v "$SCRIPT_DIR/transactions_page.tsx"   "$PROJECT_ROOT/app/transactions/page.tsx"
cp -v "$SCRIPT_DIR/admin_txn_id_page.tsx"   "$PROJECT_ROOT/app/admin/transactions/[id]/page.tsx"
cp -v "$SCRIPT_DIR/admin_txn_id_route.ts"   "$PROJECT_ROOT/app/api/admin/transactions/[id]/route.ts"
cp -v "$SCRIPT_DIR/smart-calc_route.ts"     "$PROJECT_ROOT/app/api/admin/transactions/smart-calc/route.ts"
cp -v "$SCRIPT_DIR/customPlanParser.ts"     "$PROJECT_ROOT/lib/transactions/customPlanParser.ts"

echo ""
echo "All files deployed. Verify with:"
echo "  cd $PROJECT_ROOT"
echo "  ls lib/transactions/customPlanParser.ts components/transactions/NewTransactionModal.tsx"
echo "  grep -c stage_debt 'app/api/admin/transactions/[id]/route.ts'"
echo ""
echo "Then commit:"
echo "  cd $PROJECT_ROOT"
echo "  git add -A"
echo "  git commit -m 'New txn modal + team prompt + reload after update + custom plan parser + stage-as-paid debts'"
echo "  git push origin main"
