#!/usr/bin/env bash
# Two related fixes for team-lead-sourced deals:
# 1. Cascade now writes brokerage_split_percentage and team_lead_percentage
#    on the primary TIA row so the agent card displays correct % labels.
# 2. getLeadSourceBucket now accepts bucket names ('team_lead'/'own'/'firm')
#    as pass-through. The lead-source picker buttons send those bucket names
#    directly; previously 'team_lead' fell through to 'own', applying the
#    wrong split (e.g. agent's own splits instead of team-lead-sourced).
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -d "$PROJECT_ROOT/app" ]; then
  echo "ERROR: $PROJECT_ROOT does not look like the project root."
  exit 1
fi
cp -v "$SCRIPT_DIR/admin_txn_id_route.ts" "$PROJECT_ROOT/app/api/admin/transactions/[id]/route.ts"
cp -v "$SCRIPT_DIR/constants.ts"           "$PROJECT_ROOT/lib/transactions/constants.ts"
echo ""
echo "Then commit:"
echo "  cd $PROJECT_ROOT"
echo "  git add -A"
echo "  git commit -m 'Fix team_lead lead-source bucket + write split %s on cascade'"
echo "  git push origin main"
