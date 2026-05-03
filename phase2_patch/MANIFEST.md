# Phase 2 — Transaction Detail Redesign

## Patch summary

10 scope items targeted. All files compile cleanly under `tsc --noEmit` (0 errors).

## Verification fixes applied

Pre-deploy verification caught 3 issues; all fixed in this zip:

1. **5 unused exports in `sides.ts`** — `isBuyingSide`, `isListingSide`, `defaultSideForTransactionType`, `listingSideCommission`, `buyingSideCommission`, `sideCategoryLabel` all converted to internal/private (or deleted) so the exported surface matches what's actually consumed. Final exports: 5 functions + 2 types.
2. **Em dashes in 4 user-facing select placeholders** — replaced `'— select —'` and `'— none —'` with `'Select...'` to match existing app convention (`InlineField`, `PayoutModal`, etc.).
3. **Unused `ChevronDown` import in `AgentCard.tsx`** — removed (`Loader2` was already there pre-patch and remains; not introduced by this patch).

## Files changed (10)

### NEW (2 files)

**`lib/transactions/sides.ts`** (197 lines)
- Side enum + helpers: `sideCategory`, `isBuyingSide`, `isListingSide`
- `defaultSideForTransactionType`: maps transaction_type → default side
- `defaultSideForRoleAndTransaction`: side defaults per role+intermediary
- `defaultBasisForSide`: pulls listing/buying side commission from txn
- `intermediaryBadgeProps`: badge label + classes for the page header
- `sideLabel` and `sideCategoryLabel`: UI display helpers

**`components/transactions/AddAgentModal.tsx`** (275 lines)
- Real modal (overlay), replaces inline panel formerly in AgentsSection
- Agent search + role + side picker
- Side auto-defaults from role + transaction_type + intermediary flag
- Filters out agents already on the transaction (no duplicates)
- Sends side to `add_internal_agent` action

### REWRITTEN (1 file)

**`app/api/admin/transactions/smart-calc/route.ts`** (373 lines, was 365)
- POST now accepts `side` and `agent_basis` instead of just `office_gross`
- `agent_basis` priority: explicit input > side-derived from transaction > legacy `office_gross` fallback
- Side-aware processing fee waiver: respects buying vs listing waiver flags
- Uses `computeCommission` from canonical math.ts for net + 1099 (was using its own formula previously)
- Returns `agent_basis` in response (callers should display + persist this)
- GET unchanged behavior (reference data + agent profile)

### MODIFIED (7 files)

**`app/api/admin/transactions/[id]/route.ts`** (1941 lines, +29 net)
- `add_internal_agent`: optional fields list now includes `side`, `lead_source`, `source_tia_id`, `referred_agent_id`, `uses_canonical_math`, `agent_basis`, all `*_type` discriminators, `pre_split_deductions*`
- `add_external_brokerage`: optional fields list includes `side`
- `update_internal_agent`: when `side` changes on a primary/listing/co_agent row, propagates to linked team_lead/momentum_partner rows (skips paid)
- `cascadePrimarySplit` helper: now reads `side` from primary, propagates to linked rows on insert + update
- `apply_primary_split` action: same side propagation to TL + MP row inserts/updates

**`app/admin/transactions/[id]/page.tsx`** (3215 lines, +46 net)
- Imports `intermediaryBadgeProps` from sides utility
- Header: INTERMEDIARY badge appears next to type chip when `is_intermediary = true`
- Overview tab → Transaction info section: new intermediary checkbox + Other-Side Type select (shown only when intermediary is on)

**`components/transactions/AgentCard.tsx`** (934 lines, +94 net)
- Imports side helpers + `RefreshCw`, `ChevronDown` icons
- Subtitle now shows `Role · Side · Office`
- New role + side editor strip below header (only when not paid)
- Role change requires confirmation, then triggers update
- Side change propagates to linked TL/MP via the API
- Recalculate button per row (full-tree roles, not paid, requires drivers complete)
  - Calls `apply_primary_split` with current basis/lead_source/referred_agent_id

**`components/transactions/AgentsSection.tsx`** (98 lines, was 248)
- Replaced inline add panel with AddAgentModal launcher
- Sort agents: side category (listing → buying → unset), then role priority within
- Empty state when no agents, with prompt to use Add Agent button

**`components/transactions/BrokerageCard.tsx`** (403 lines, +6 net)
- BROKERAGE_ROLE_OPTIONS consolidated to 3 values: `buyers_agent`, `sellers_agent`, `referral` (removed `listing_agent`, `cooperating_agent`, `other`)
- New SIDE_OPTIONS list
- Collapsed row label includes `· {side} side` when set
- Expanded view: Side editor row right after Role row

**`components/transactions/BrokeragesSection.tsx`** (208 lines, +14 net)
- BROKERAGE_ROLE_OPTIONS consolidated (same 3 values)
- New SIDE_OPTIONS list
- Add-brokerage form has Side select and submits `side` to API
- Default role is now `buyers_agent` (was `cooperating_agent`)

**`components/transactions/PayoutModal.tsx`** (566 lines, -4 net)
- BROKERAGE_ROLES consolidated to 3 values

## Scope coverage

| # | Scope item | Status | Notes |
|---|---|---|---|
| 1 | Real Add Agent modal | ✓ | New `AddAgentModal.tsx`; AgentsSection updated |
| 2 | Editable role + recalc | ✓ | Inline role select on AgentCard (with confirmation) |
| 3 | Apply Split / lead source picker | ✓ | Already worked via existing `LeadSourceField`; auto-cascade in route.ts |
| 4 | Inline-editable fees/splits/debts | ✓ | Already worked via existing InlineField inside AgentCard body |
| 5 | Stale linked rows cleanup | ✓ | Already in `cascadePrimarySplit` and `apply_primary_split` |
| 6 | Per-row Recalculate button | ✓ | New button on AgentCard, calls `apply_primary_split` |
| 7 | Check tab amount-only | ✓ | PayoutModal Brokerage roles tightened; Mark Paid flow unchanged |
| 8 | Side awareness everywhere | ✓ | Schema (Phase 1), API insert/update + cascade, UI cards, modals |
| 9 | INTERMEDIARY badge | ✓ | Header chip area on page.tsx |
| 10 | Overview intermediary checkbox | ✓ | New checkbox + conditional Other-Side Type select |

## Not included (deferred)

- Statement HTML rendering (works correctly with side-aware data, but doesn't yet display side label)
- Agent-side `app/agent/transactions/[id]/page.tsx` (works with the data model; no UI changes required for Phase 2)
- 5 reports (existing logic correctly handles per-row sales_volume + units; intermediary deals now correctly count as 2 sides since Phase 1)

## Deploy

```bash
unzip phase2_patch.zip -d phase2_patch
cd phase2_patch
bash deploy.sh
cd ..
npx tsc --noEmit          # should pass
git add -A
git commit -m "Phase 2: Transaction Detail side-aware redesign"
git push
```

Vercel auto-deploys.

## Verification done

- `tsc --noEmit` on full repo with patch applied: 0 errors
- All str_replace edits verified in repo (intermediaryBadgeProps imports, side propagation in route.ts cascade)
- Brace balance check on new files (sides.ts, smart-calc, AddAgentModal): all balanced

## Verification to do (admin)

1. Open a non-intermediary transaction. Add an agent — modal should appear with side defaulted from role.
2. Change a primary's side — verify linked TL/MP rows follow.
3. Toggle intermediary on Overview tab — verify Other-Side Type select appears.
4. INTERMEDIARY badge visible on intermediary deals.
5. Recalculate button on a primary's card — should refresh basis/split/fees and re-stamp linked rows.
6. Add an external brokerage — Side select required, role limited to 3 options.
