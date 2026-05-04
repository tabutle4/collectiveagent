#!/usr/bin/env bash
# Combined patch:
# 1. New Transaction Modal  — replaces /transactions/new with inline modal,
#    role-aware redirect to admin or agent detail page after create
# 2. Hide team prompt        — only render when team has agreement splits
# 3. Reload after TIA update — server-side cascade results show in UI
# 4. Custom plan parser      — extracted to lib helper, fixes "Custom Lease 90/10"
#    and similar custom plan strings
# 5. Stage debt = mark paid  — checking a debt on the panel marks it paid
#    immediately (status=paid, offset, amount_paid). Unstaging reverts.
#    Mark Paid sums staged records into agent_net.
#    Payouts tab shows staged debts under each agent with deduction preview.
set -e

cp NewTransactionModal.tsx components/transactions/NewTransactionModal.tsx
cp AgentBillingPanel.tsx   components/transactions/AgentBillingPanel.tsx
cp transactions_page.tsx   app/transactions/page.tsx
cp admin_txn_id_page.tsx   'app/admin/transactions/[id]/page.tsx'
cp admin_txn_id_route.ts   'app/api/admin/transactions/[id]/route.ts'
cp smart-calc_route.ts     'app/api/admin/transactions/smart-calc/route.ts'
cp customPlanParser.ts     lib/transactions/customPlanParser.ts

echo "Files copied."
echo "Run: npx tsc --noEmit  (should be clean)"
echo "Then: git add -A && git commit -m 'New txn modal + team prompt + reload after update + custom plan parser + stage-as-paid debts' && git push"
