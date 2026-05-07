#!/bin/bash
# deploy.sh — Apply momentum partner + sales_volume + Other Fees/Rebate fixes
#
# Run from the repository root. Expects:
#   app/api/admin/transactions/[id]/route.ts
#   app/api/admin/transactions/smart-calc/route.ts
#   app/admin/transactions/[id]/page.tsx
#   components/transactions/AgentCardFinancials.tsx
# placed directly at correct paths (NOT under any patch/ directory).

set -e

echo "─── Verifying environment ───"
if [ ! -f "package.json" ]; then
  echo "ERROR: must run from repository root (no package.json found here)"
  exit 1
fi

if [ ! -d "app/api/admin/transactions/[id]" ]; then
  echo "ERROR: app/api/admin/transactions/[id] directory missing — wrong dir?"
  exit 1
fi

echo "─── Cleaning up leftover patch artifacts ───"
if [ -d "patch" ]; then
  echo "  Removing leftover patch/ directory"
  rm -rf patch
fi

for f in all-payouts-fix.zip payouts-report-fix.zip redeploy-payouts-fix.zip momentum-and-fees-fix.zip; do
  if [ -f "$f" ]; then
    echo "  Removing $f"
    rm -f "$f"
  fi
done

echo "─── Verifying patch markers ───"

if grep -q "momentumPartnerPayout = commissionAmount \* (momentumPartnerPct / 100)" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: momentum formula uses commissionAmount"
else
  echo "  FAIL route.ts: momentum formula NOT updated"
  exit 1
fi

if grep -q "momentumPayoutsTotal" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: recomputeOfficeNet subtracts momentum payouts"
else
  echo "  FAIL route.ts: recomputeOfficeNet NOT updated"
  exit 1
fi

if grep -q "round2(agentBasis \* (momentumPartnerPct / 100))" app/api/admin/transactions/smart-calc/route.ts; then
  echo "  OK smart-calc: momentum formula uses agentBasis"
else
  echo "  FAIL smart-calc: momentum formula NOT updated"
  exit 1
fi

if grep -q "const isLinkedRow =" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: isLinkedRow guard added"
else
  echo "  FAIL page.tsx: isLinkedRow guard NOT added"
  exit 1
fi

if grep -q "(otherFees > 0 || editable)" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: Other Fees visibility guard added"
else
  echo "  FAIL AgentCardFinancials.tsx: Other Fees visibility NOT updated"
  exit 1
fi

if grep -q "(rebate > 0 || editable)" components/transactions/AgentCardFinancials.tsx; then
  echo "  OK AgentCardFinancials.tsx: Rebate visibility guard added"
else
  echo "  FAIL AgentCardFinancials.tsx: Rebate visibility NOT updated"
  exit 1
fi

echo ""
echo "─── All patch markers verified ───"
echo ""
echo "Now run:"
echo "  rm momentum-and-fees-fix.zip"
echo "  git add -A"
echo "  git commit -m \"Fix momentum partner basis (commission_amount, not brokerage_split), Other Fees/Rebate visibility on commissions tab\""
echo "  git push origin main"
