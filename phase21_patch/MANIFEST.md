# Phase 2.1 — Calc fix, constants, auth, BTSA flag

Builds on Phase 2. **Phase 2 must be deployed first** (or this patch supersedes it — the Phase 2 files are included unchanged where applicable).

## What this patch does

1. **Calc fix** — Recalculate now writes correct agent_net and amount_1099
2. **Constants consolidation** — option arrays moved to one file, no more drift
3. **Auth refactor** — 11 routes now use central supabaseAdmin
4. **BTSA low-commission flag** — flags + redistribute + undo on transaction detail page

## Files (21 total)

### Phase 2 baseline (8 files, identical to phase2_patch)
- `lib/transactions/sides.ts`
- `components/transactions/AddAgentModal.tsx`
- `components/transactions/AgentCard.tsx`
- `components/transactions/AgentsSection.tsx`
- `components/transactions/BrokerageCard.tsx`
- `components/transactions/BrokeragesSection.tsx`
- `components/transactions/PayoutModal.tsx`
- `app/admin/transactions/[id]/page.tsx`

### Phase 2.1 modifications

**`lib/transactions/constants.ts`** — added 5 exports
- `SIDE_OPTIONS` (5 values incl. empty placeholder)
- `BROKERAGE_ROLE_OPTIONS` (3 values)
- `AGENT_ROLE_OPTIONS` (6 values)
- `PAYMENT_METHOD_OPTIONS` (5 values)
- `FEDERAL_ID_TYPE_OPTIONS` (2 values)
- All consumers (BrokerageCard, BrokeragesSection, PayoutModal, AddAgentModal, AgentCard) updated to import these instead of defining locally

**`lib/transactions/lowCommissionFlag.ts`** — NEW
- `thresholdForSide` — returns dollar threshold per side
- `computeLowCommissionFlags` — returns one entry per side, flagged or not
- `planRedistribution` — computes the move amount + which TIA's btsa to reduce
- `planUndoRedistribution` — inverse plan

**`components/transactions/LowCommissionFlagPanel.tsx`** — NEW
- Self-contained panel; loads its own settings; renders amber alert when flagged
- "Apply redistribution" button (visible only when redistributable)
- "Undo prior redistribution" button (admin enters moved_amount + tia_id)
- Disabled when admin lacks edit permission (gated server-side too)

**`app/api/admin/transactions/[id]/route.ts`** — calc fix + auth + 2 new actions
- Auth: `import { supabaseAdmin as supabase } from '@/lib/supabase'` (was inline `createClient`)
- `computeCommissionBreakdown`: now loads existing `btsa_amount, other_fees, rebate_amount, debts_deducted` from the row and passes them to `computeCommission()` from `math.ts`
- New action `redistribute_btsa`: validates flag, runs `planRedistribution`, updates `transactions.{listing,buying}_side_commission`, reduces TIA `btsa_amount`, appends note
- New action `undo_redistribute_btsa`: takes `side`, `moved_amount`, `tia_id`; reverses the change; appends note
- Both reject if transaction is closed or BTSA row is paid

**`app/api/admin/transactions/smart-calc/route.ts`** — auth only
- Same auth swap as above; preview formula already correct from Phase 2

**`app/admin/transactions/[id]/page.tsx`** — UI insert
- Imports `LowCommissionFlagPanel`
- Renders panel above Gross Commission field on Overview tab
- Passes `transaction`, `agents` (existing TIA list), `loadData` (existing refresh callback), `canEdit={true}` (server enforces)

### Phase 2.1 auth-only refactor (8 files)

`createClient` from `@supabase/supabase-js` → `supabaseAdmin` from `@/lib/supabase`. No other changes.

- `app/api/checks/notify-agent/route.ts`
- `app/api/checks/upload-image/route.ts`
- `app/api/statements/[id]/route.ts`
- `app/api/training-center/announcement/route.ts`
- `app/api/training-center/bookmarks/route.ts`
- `app/api/transactions/[id]/route.ts`
- `app/api/users/unlock-all-onboarding/route.ts`
- `app/api/users/upload-headshot/route.ts`

## Verification done

- `npx tsc --noEmit` on full repo with patch applied: **0 errors, exit 0**
- All 21 files traced for em dashes (3 found in error strings, removed)
- All option-array constants verified single source: 0 stale local definitions
- All 10 inline-`createClient` routes verified to now import `supabaseAdmin`
- Recalculate flow traced end-to-end: UI → API → `computeCommission()` → DB write
- Redistribute flow traced end-to-end: UI → API → `planRedistribution()` → DB write + note
- Sensitive files (`package.json`, `tsconfig.json`, `middleware.ts`, etc.) unchanged

## Behavior changes admins should know about

### Recalculate now uses canonical math
Rows that were Recalculated in the past with the broken formula currently have stale `agent_net` / `amount_1099`. **This patch does NOT retroactively fix them.** Click Recalculate on each affected row again, or run a one-time SQL backfill (separate task).

### BTSA redistribution writes to transaction notes
Each redistribute or undo appends a line to `transactions.notes`. This is the audit trail for now (you can later add a structured audit table without changing this behavior).

### Manual BTSA distribution warning
If multiple TIAs on the same side have BTSA set, only the largest gets reduced. The response includes a warning. This matches your rule "they not giving out multiple btsa" but the safety net is there.

## Deploy

```bash
unzip phase21_patch.zip -d phase21_patch
cd phase21_patch
bash deploy.sh
cd ..
npx tsc --noEmit          # should be 0 errors
git add -A
git commit -m "Phase 2.1: Calc fix, constants consolidation, auth refactor, BTSA flag + redistribute"
git push
```

Vercel auto-deploys.

## Smoke tests (after deploy)

1. **Calc fix** — Open any closed transaction with btsa_amount > 0 on a TIA. Note `agent_net`. Click Recalculate. Verify `agent_net` matches: `agent_gross + btsa - processing - coaching - other_fees - rebate - debts`. Should change for any row that was previously recalculated under the old formula.

2. **Constants** — Open Add Agent modal: roles list shows 6 options, side list shows 4. Open external brokerage add form: roles list shows 3 options. PayoutModal: brokerage roles shows 3.

3. **Auth refactor** — Open `/admin/transactions/<id>` and use Recalculate, Add Agent, Add External Brokerage. All should still work. Statement download: still works. Training center bookmarks: still loads.

4. **BTSA flag (no BTSA)** — Open a transaction where listing_side_commission is 1.5% of sales_price (below 3% threshold) AND no TIA has btsa_amount > 0. Amber flag visible. **No redistribute button.**

5. **BTSA flag (with BTSA)** — Open a transaction where listing_side_commission is 2% of $100,000 ($2,000), threshold is $3,000, and a TIA on the listing side has $2,000 btsa_amount. Click Apply redistribution. Verify:
   - `transactions.listing_side_commission` is now $3,000
   - TIA's `btsa_amount` is now $1,000
   - `transactions.notes` has a new line: `[YYYY-MM-DD] Listing side commission redistributed from $2000.00 to $3000.00 ...`

6. **Undo** — On the same transaction, click Undo prior redistribution. Enter `1000` for moved amount, paste the TIA id. Verify side commission is back to $2,000 and BTSA back to $2,000.

## Rollback

- **Code**: `git revert <commit-hash>` and push
- **Data**: any redistribution that ran will need manual reversal via SQL. The notes field shows: which side, old/new amounts, which TIA. Reverse with:
  ```sql
  UPDATE transactions SET listing_side_commission = <old> WHERE id = '<txn_id>';
  UPDATE transaction_internal_agents SET btsa_amount = <old> WHERE id = '<tia_id>';
  ```
  (Or use the Undo button before reverting code.)
