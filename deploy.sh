#!/bin/bash
# deploy.sh — Apply Financials reorder, per-agent billing on sidebar,
# Rev Share name fix, sales_volume auto-broadcast, move_in_date sync,
# CloseDialog Gross fix.
#
# Run from the repository root. Expects:
#   app/api/admin/transactions/[id]/route.ts
#   app/admin/transactions/[id]/page.tsx
#   components/transactions/CloseDialog.tsx
# placed at correct paths (NOT under any patch/ directory).

set -e

echo "─── Verifying environment ───"
if [ ! -f "package.json" ]; then
  echo "ERROR: must run from repository root (no package.json found here)"
  exit 1
fi

if [ ! -d "app/admin/transactions/[id]" ]; then
  echo "ERROR: app/admin/transactions/[id] missing — wrong dir?"
  exit 1
fi

echo "─── Cleaning up leftover patch artifacts ───"
if [ -d "patch" ]; then
  echo "  Removing leftover patch/ directory"
  rm -rf patch
fi

for f in all-payouts-fix.zip payouts-report-fix.zip redeploy-payouts-fix.zip momentum-and-fees-fix.zip linked-row-and-markpaid-fix.zip overview-and-sidebar-fix.zip; do
  if [ -f "$f" ]; then
    echo "  Removing $f"
    rm -f "$f"
  fi
done

echo "─── Verifying patch markers ───"

if grep -q "primary agent on this deal by TIA role" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: primary-by-role lookup added (replaces submitted_by)"
else
  echo "  FAIL route.ts: primary-by-role NOT added"
  exit 1
fi

if grep -q "Resolve referred-agent UUIDs" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: referred_agents UUID -> name enrichment added"
else
  echo "  FAIL route.ts: referred_agents enrichment NOT added"
  exit 1
fi

if grep -q "'sales_price', 'monthly_rent', 'lease_term', 'move_in_date'" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: COMPUTE_TRIGGERS includes sales_price + move_in_date"
else
  echo "  FAIL route.ts: COMPUTE_TRIGGERS missing new triggers"
  exit 1
fi

if grep -q "Move-in date IS the closing date" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: move_in_date -> closing_date sync added"
else
  echo "  FAIL route.ts: closing_date sync NOT added"
  exit 1
fi

if grep -q "Intermediary commission flow" app/api/admin/transactions/\[id\]/route.ts; then
  echo "  OK route.ts: intermediary auto-derive added (sides -> office_gross + gross_commission)"
else
  echo "  FAIL route.ts: intermediary auto-derive NOT added"
  exit 1
fi

if grep -q "Office Gross is read-only" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: Office Gross is read-only FieldRow"
else
  echo "  FAIL page.tsx: Office Gross still editable"
  exit 1
fi

if grep -q "BTSA breakdown — itemized lines per agent" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: BTSA breakdown above Gross row added"
else
  echo "  FAIL page.tsx: BTSA breakdown NOT added"
  exit 1
fi

if grep -q "per-agent debts/credits across all" app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: per-agent Billing inside agent card added"
else
  echo "  FAIL page.tsx: per-agent Billing NOT added"
  exit 1
fi

if ! grep -q 'label="Gross Commission"' app/admin/transactions/\[id\]/page.tsx; then
  echo "  OK page.tsx: legacy Gross Commission row removed"
else
  echo "  FAIL page.tsx: Gross Commission row still present"
  exit 1
fi

if grep -q "Gross = office_gross + sum(BTSA)" components/transactions/CloseDialog.tsx; then
  echo "  OK CloseDialog.tsx: Gross now computed (sides + BTSA)"
else
  echo "  FAIL CloseDialog.tsx: Gross display NOT updated"
  exit 1
fi

if grep -q "'Office gross is not set'" components/transactions/CloseDialog.tsx; then
  echo "  OK CloseDialog.tsx: warning text updated"
else
  echo "  FAIL CloseDialog.tsx: warning text NOT updated"
  exit 1
fi

echo ""
echo "─── All patch markers verified ───"
echo ""
echo "Now run:"
echo "  git add -A"
echo "  git commit -m \"Reorder Financials, per-agent Billing on sidebar, Rev Share names, sales_volume auto-broadcast, Move-In Date = Closing Date for leases, Close modal Gross with BTSA\""
echo "  git push origin main"
