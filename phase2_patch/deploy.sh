#!/bin/bash
# Phase 2 deploy script — applies all changed files to the repo root.
# Run from inside the unzipped folder.

set -e

REPO_ROOT="${REPO_ROOT:-..}"
echo "Deploying Phase 2 patch to: $REPO_ROOT"

# Files to copy (relative paths, both source and destination match)
FILES=(
  "lib/transactions/sides.ts"
  "app/api/admin/transactions/smart-calc/route.ts"
  "app/api/admin/transactions/[id]/route.ts"
  "app/admin/transactions/[id]/page.tsx"
  "components/transactions/AddAgentModal.tsx"
  "components/transactions/AgentCard.tsx"
  "components/transactions/AgentsSection.tsx"
  "components/transactions/BrokerageCard.tsx"
  "components/transactions/BrokeragesSection.tsx"
  "components/transactions/PayoutModal.tsx"
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
