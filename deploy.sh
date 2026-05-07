#!/bin/bash
# deploy.sh — Apply linked-row visibility, Other Fees description, and Mark Paid modal fixes
#
# Run from the repository root. Expects:
#   app/admin/transactions/[id]/page.tsx
#   components/transactions/AgentCardFinancials.tsx
# placed directly at correct paths (NOT under any patch/ directory).

set -e

echo "─── Verifying environment ───"
if [ ! -f "package.json" ]; then
  echo "ERROR: must run from repository root (no package.json found here)"
  exit 1
fi

if [ ! -d "app/admin/transactions/[id]" ]; then
  echo "ERROR: app/admin/transactions/[id] directory missing — wrong dir?"
  exit 1
fi

echo "─── Cleaning up leftover patch artifacts ───"
if [ -d "patch" ]; then
  echo "  Removing leftover patch/ directory"
  rm -rf patch
fi

for f in all-payouts-fix.zip payouts-report-fix.zip redeploy-payouts-fix.zip momentum-and-fees-fix.zip linked-row-and-markpaid-fix.zip; do
  if [ -f "$f" ]; then
    echo "  Removing $f"
    rm -f "$f"
  fi
done

echo "─── Verifying patch markers ───"

if grep -q "const isLinkedRow =" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: isLinkedRow constant added"
else
  echo "  FAIL AgentCardFinancials.tsx: isLinkedRow NOT added"
  exit 1
fi

if grep -q "!isLinkedRow && (btsa > 0 || editable)" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: BTSA hidden on linked rows"
else
  echo "  FAIL AgentCardFinancials.tsx: BTSA linked-row guard NOT added"
  exit 1
fi

if grep -q "!isLinkedRow && (rebate > 0 || editable)" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: Rebate hidden on linked rows"
else
  echo "  FAIL AgentCardFinancials.tsx: Rebate linked-row guard NOT added"
  exit 1
fi

if grep -q "function InlineTextRow" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: InlineTextRow component added"
else
  echo "  FAIL AgentCardFinancials.tsx: InlineTextRow component NOT added"
  exit 1
fi

if grep -q "label=\"Description\"" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: Other Fees Description input wired"
else
  echo "  FAIL AgentCardFinancials.tsx: Other Fees Description NOT added"
  exit 1
fi

if grep -q "import { computeCommission } from '@/lib/transactions/math'" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: computeCommission import added"
else
  echo "  FAIL page.tsx: computeCommission import NOT added"
  exit 1
fi

if grep -q "Mark Paid modal matches" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: Mark Paid modal uses canonical formula"
else
  echo "  FAIL page.tsx: Mark Paid modal NOT updated"
  exit 1
fi

if grep -q "onSaveTextField={(field, value)" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: onSaveTextField wired through"
else
  echo "  FAIL page.tsx: onSaveTextField NOT wired"
  exit 1
fi

echo ""
echo "─── All patch markers verified ───"
echo ""
echo "Now run:"
echo "  git add -A"
echo "  git commit -m \"Hide BTSA/Rebate on linked rows, add Other Fees description, fix Mark Paid modal 1099 (BTSA + rebate)\""
echo "  git push origin main"
