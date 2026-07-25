# AGENTS.md - Collective Agent codebase rules

Instructions for ANY AI assistant (Claude, Codex, Cursor, Gemini) or human
working in this repo. Follow these or your change will be rejected in review.
When a rule here conflicts with something you were about to do, the rule wins.
If a rule seems wrong for your task, STOP and ask Tara - do not silently deviate.

## What this app is

Next.js (App Router) + Supabase (Postgres) + Vercel brokerage back office for
Collective Realty Co. (~80 agents, Houston + Dallas). It moves real money:
agent commission payouts, 1099s, invoices. A wrong formula here is a wrong
paycheck for a real person.

## Non-negotiable invariants

1. **Commission math has ONE source of truth**: `computeCommission()` in
   `lib/transactions/math.ts`.
   `amount_1099 = agent_gross + btsa - processing - coaching - other_fees - rebate + credits`
   `agent_net = amount_1099 - debts`
   Never inline this formula anywhere. Never add a new place that computes
   agent_net. The cascade (`lib/transactions/cascade.ts`) is the only writer
   of computed commission fields; UIs display stored values.
2. **Paid rows are frozen.** Any code that updates `transaction_internal_agents`
   must skip rows with `payment_status = 'paid'`.
3. **Plan codes are canonical.** `users.commission_plan` must hold a
   `commission_plans.code` (e.g. `70_30_new`, `85_15_no_cap`, `70_30_cap`,
   `post_cap`, `broker_100`) or a parseable custom string
   (`Custom - 80/20 Cap`, `Custom Lease 90/10`). Never save UI dropdown words
   like `cap` / `no_cap` / `new_agent` - the payout engine cannot match them
   and silently falls back to 85/15 (this was a real production bug).
4. **Leases vs sales are separate plans.** Lease deals use
   `users.lease_commission_plan` (default Lease Plan 85/15). Lease detection:
   `isLeaseTransactionType()` for transaction types,
   `complianceIsLease()` for form submissions. Never regex ad hoc.
   New Agent Plan graduation = 5 CLOSED SALES, then the agent picks Cap or
   No Cap. Leases never count toward the 5. Progress reads
   users.qualifying_transaction_count (set by Mark Paid + its "counts toward"
   checkbox) - never re-count rows.
   CAP PROGRESS (Cap Plan $18,000): sum of brokerage_split on
   primary_agent/listing_agent rows only, counts_toward_progress = true,
   deals closed this calendar year. Same recipe in the statement, agent
   dashboard, smart-calc, and commission preview - all four must stay
   identical.
5. **fetchAllRows for any table that can exceed 1000 rows** (transactions,
   transaction_internal_agents, checklist_completions, agent_form_submissions).
   A bare `.select()` silently truncates at 1000. fetchAllRows must keep its
   stable `.order('id')` - removing it reintroduces the quarterly report bug.
6. **Broker plan** (`broker_100`, `Custom Lease 0/100`, or any 0/100 split):
   the broker keeps nothing - BTSA goes to brokerage_split, eCommission
   advances repay from brokerage net (external record), never an agent invoice.
7. **eCommission advances**: every deal reporting one gets an external payout
   record (brokerage_name "eCommission (advance repayment)") so the money
   routes to the eCommission company, never into brokerage net. Non-broker
   plans ALSO get the matching agent debt with debt_type `ecommission`
   (withheld at payout, funding the external record). The pair nets to zero
   for CRC.
8. **Referral fees from the compliance form come out of the agent's NET**
   (written to `other_fees` with the `[referral fees - compliance form]` tag).
   Office-entered carve-out referrals (agent_basis set on the referral row)
   are the legacy style - do not convert one into the other.
9. **Firm minimum**: when a side's pool (commission + additional comp) is
   below Settings' `minimum_percent` of price/rent, CRC's split is computed
   on the minimum basis and the shortfall comes out of the agent's share.
   The user-facing label is exactly "Firm Minimum Adjustment".

## Auth - every API route uses exactly one of these

- `requirePermission(request, 'can_x')` - all `/api/admin/**` routes and any
  route reading admin-scoped data. Permission codes must exist in the
  `permissions` table, the `PermissionCode` type union AND `getPermissionsObject`
  in `lib/permissions.ts`, with `role_permissions` rows. All five layers.
- `requireAuth(request)` - only routes every authenticated agent may call.
  NEVER under `/api/admin/`.
- CRON secret - `/api/cron/*` only.
- PM portal resolver - `/api/pm/portal/*` only.
- Public token validation - only routes listed in `middleware.ts` PUBLIC_PATHS,
  and they must validate their own token internally.
- `requireRole` - do NOT use in new code; it bypasses per-user overrides.
- Webhooks (Payload, Track1099, Resend, Zoom) must verify an HMAC signature
  against the raw body. No signature check = rejected.
- Payment routes never accept amounts from the request body - fetch the
  canonical amount from the provider.
- Identity joins use `users.microsoft_oid`, never email.

## Email - six systems, never a seventh

| Recipients | Use | Transport |
|---|---|---|
| Prospects / not-yet-agents | `lib/email.ts` (sendMailAs) | Graph, from real CRC mailboxes |
| PM landlords/tenants | `lib/email/pm-layout.ts` | Graph |
| CRC agents / internal ops | `lib/email/layout.ts` getEmailLayout | Resend, notifications@ / onboarding@coachingbrokeragetools.com |
| Transaction emails (CDA, statements) | `lib/email/buildTransactionEmails.ts` / `buildComplianceEmail.ts` | Resend, transactions@ |
| TC module | `email_templates` table + `wrapTcEmail` | Graph - never hardcode TC content in routes |
| Coaching clients | `lib/email/coaching-layout.ts` | Resend, The Coaching Brokerage branding |

External recipients via Resend (except coaching clients) = spam folder = rejected.
Bare inline HTML email = rejected. Campaign emails always come from
`email_templates`; no template = return an error, never fall back.

## UI conventions

- Tailwind with the `luxury-*` palette only (`luxury-gray-1..5`, `luxury-accent`,
  `luxury-light`). `luxury-gray-6` does not exist. No default `text-gray-*`.
- Icons: `lucide-react` only.
- NO em dashes or en dashes in any user-facing string (UI, emails, toasts).
  Use a plain hyphen. This is enforced in CI.
- Reuse `input-luxury`, `select-luxury`, `btn btn-primary/secondary`,
  `container-card`, `inner-card`, `page-title`, `th-luxury` classes. Read 3
  sibling components before styling anything new.
- Brand name is "Collective Realty Co." - never truncated.
- Match source-text casing of sibling call sites, not just rendered output
  (CSS uppercase means "Paid" in JSX renders as PAID; still write "Paid").
- Mobile matters: every admin table needs a usable `md:hidden` card layout.
  Courtney runs the brokerage from her phone.

## Data conventions

- Supabase server access: `supabaseAdmin` from `lib/supabase.ts` in API routes.
- Money columns are numeric; always `parseFloat(String(v ?? 0)) || 0` before math;
  round with `Math.round(x * 100) / 100`.
- Dates: sales close on `closing_date`; leases key on `move_in_date`
  (fallback closing_date). Quarterly counting: leases = any status except
  cancelled by move-in date; sales = status closed by closing date.
- `office_net` is derived by `recomputeOfficeNet` ONLY. If you add a new money
  record type that leaves or enters the brokerage, extend that one function.
- Never hardcode dollar amounts, URLs, UUIDs (especially Courtney's broker id),
  or dates - read from `processing_fee_types`, `commission_plans`,
  `company_settings`, or env.

## Workflow rules (how changes ship)

- Changes are delivered as git patch files applied in Codespaces, then pushed
  to main (Vercel deploys). `*.patch` is gitignored - never commit one.
- Before any deploy: `./node_modules/.bin/tsc --noEmit` must be silent and
  `npm test` must pass.
- Additive SQL first, destructive SQL in a separate later migration. All SQL
  idempotent (IF NOT EXISTS / ON CONFLICT / WHERE guards). SELECT-count before
  every UPDATE/DELETE.
- The full pre-deployment verification protocol lives with Tara; large patches
  run it end to end (scope mapping, deletion parity, plain-English accounting).
- After schema or money-logic changes, run `npm run doctor` against production
  and fix anything it flags before announcing done.

## Known sharp edges (do not "fix" casually)

- `autoCascadeTransaction` skips closed transactions and paid rows on purpose.
- Recalculate wipes TIA sales_volume/units; restore scripts guard with
  `sales_volume IS NULL`.
- Two-sided deals: commission goes in ONE side's field; the app sums sides.
- `team_lead_commission` on a primary TIA row is informational only.
- `users.division` is free text, sometimes "A | B" joined - split on `|`.
- Old imported rows may predate canonical math; `uses_canonical_math` flags
  the ones the cascade owns.
