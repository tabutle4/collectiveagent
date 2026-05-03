#!/bin/bash
# Phase 2.1 deploy — applies all changed files to the repo root.
# Run from inside the unzipped folder.

set -e
REPO_ROOT="${REPO_ROOT:-..}"
echo "Deploying Phase 2.1 patch to: $REPO_ROOT"

FILES=(
  # Phase 2 baseline (re-applied, identical to prior unless noted)
  "lib/transactions/sides.ts"
  "components/transactions/AddAgentModal.tsx"
  "components/transactions/AgentCard.tsx"
  "components/transactions/AgentsSection.tsx"
  "components/transactions/BrokerageCard.tsx"
  "components/transactions/BrokeragesSection.tsx"
  "components/transactions/PayoutModal.tsx"
  "app/admin/transactions/[id]/page.tsx"

  # Phase 2.1 calc fix + auth refactor + new actions
  "app/api/admin/transactions/[id]/route.ts"
  "app/api/admin/transactions/smart-calc/route.ts"

  # Phase 2.1 auth refactor only
  "app/api/checks/notify-agent/route.ts"
  "app/api/checks/upload-image/route.ts"
  "app/api/statements/[id]/route.ts"
  "app/api/training-center/announcement/route.ts"
  "app/api/training-center/bookmarks/route.ts"
  "app/api/transactions/[id]/route.ts"
  "app/api/users/unlock-all-onboarding/route.ts"
  "app/api/users/upload-headshot/route.ts"

  # Phase 2.1 constants consolidation
  "lib/transactions/constants.ts"

  # Phase 2.1 new files
  "lib/transactions/lowCommissionFlag.ts"
  "components/transactions/LowCommissionFlagPanel.tsx"
)

for f in "${FILES[@]}"; do
  src="$f"
  dst="$REPO_ROOT/$f"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "  copied → $f"
done

echo ""
echo "Deploy complete. Run 'npx tsc --noEmit' to verify, then commit and push."
