# Migrations

**Nothing runs these files.** There is no migration runner in this project — no
Prisma, no Drizzle, no Supabase CLI migration flow. Each of these was pasted by
hand into the Supabase SQL editor at some point and has already been applied.

The database is the source of truth. These are the historical record of how it
got that way, kept for one reason: they explain *why* a column exists, which a
schema dump cannot tell you. For *what* currently exists, read
[`../docs/schema-reference.sql`](../docs/schema-reference.sql).

They cannot rebuild the database. There is no baseline `CREATE TABLE` for
`users`, `transactions`, or any other core table anywhere in this folder, so
replaying these against an empty database would fail immediately.

## If you are adding a new migration

1. Write it additive-first and idempotent (`IF NOT EXISTS`, `ON CONFLICT DO
   NOTHING`). Never mix `ADD COLUMN` and `DROP COLUMN` in one file.
2. Run the `SELECT` version of any `UPDATE`/`DELETE` `WHERE` clause first and
   check the row count before running the write.
3. Paste it into the Supabase SQL editor and run it.
4. Save it into the matching folder below and add a row to the table.
5. Update `../docs/schema-reference.sql` if the shape of any table changed.

## Folders

| Folder | What it covers |
|---|---|
| `pm/` | Property management: landlords, leases, disbursements, statements |
| `transactions/` | Transactions, commission splits, fee types, agent overrides |
| `checks/` | Checks received, bank holds, Payload payment sources |
| `cda/` | CDA generation and send tracking |
| `agent-email/` | Agent email dashboard and Graph subscriptions |
| `platform/` | Everything else: help center, signatures, licences, Zoom, offices |

## What each file did

### pm/

| File | What it did |
|---|---|
| `01_schema.sql` | Self-collect landlord support. Three toggles on `pm_agreements` (`crc_collects_rent`, `crc_holds_deposit`, `crc_invoices_mgmt_fee`) plus payment instructions on `pm_leases`. Despite the name this is a PM migration, not the database schema. |
| `02_backfill_invoices.sql` | Backfilled `pm_landlord_invoices` for leases that were already active. |
| `03_backfill_mark_paid.sql` | Marked historical invoices paid and connected them to `pm_fee_payouts`. |
| `04_pm_statements.sql` | Created the `pm_statements` table and indexed `landlord_disbursement_deductions`. |
| `05_statement_token.sql` | Added `pm_statements.access_token` for the shareable statement link. |
| `06_pm_fee_payouts_1099.sql` | Added `pm_fee_payouts.amount_1099_reportable` and backfilled agent rows. |
| `07_reserve.sql` | Added `disbursement_type` and `reserve_amount` to `landlord_disbursements`. |
| `08_recurring_deductions.sql` | Recurring deduction templates that auto-apply monthly. |
| `zip2_1_repair_deduction_link.sql` | Added `source_repair_id` linking a deduction back to its repair request. |
| `zip3_statements_charged_basis.sql` | Charged-basis management fees and statement totals. |
| `supabase_migration_pm_agreement_flat_fee.sql` | Added `management_fee_flat`, so a management fee can be a flat amount rather than only a percentage. |

### transactions/

| File | What it did |
|---|---|
| `add_lease_commission_plan.sql` | Added `users.lease_commission_plan` defaulting to `'lease'`, and renamed the `85_15_lease` plan row to name `Lease Plan`, code `lease`. **This is why the default is the literal string `lease` and what that string points at.** |
| `supabase_migration.sql` | Patch T1. Added `transaction_internal_agents.source_tia_id`, linking auto-created team lead and momentum partner rows back to the row that spawned them. |
| `supabase_migration_fee_types.sql` | Patch T1.5. `processing_fee_types` cleanup, verified 2026-04-22 against transaction CSVs. |
| `supabase_migration_tia_lead_source.sql` | T2. Added `lead_source` and `referred_agent_id` to `transaction_internal_agents`, plus `company_settings.executive_email`. |
| `supabase_migration_agent_overrides.sql` | T3. Per-agent custom commission terms overriding the standard New Agent Plan. |
| `supabase_migration_tia_basis_input_mode.sql` | Phase 2.8. Percentage-based referral basis on `transaction_internal_agents`. |
| `20260424_transaction_page_unification.sql` | Transaction detail page unification, 2026-04-24. Added `transactions.released_to_agent_at`. Column drops were deliberately deferred to a follow-up. |
| `20260902_contact_projection.sql` | Made `transaction_contacts` the source of truth for a deal's people and the flat contact columns on `transactions` a projection of it, maintained by the `project_contacts_to_transaction` trigger. Nothing had ever copied between the two stores, so editing the Contacts tab left the Overview cards and ~40 other readers stale. `client_name` now carries **all** clients, comma-separated. Also backfilled 69 missing contact rows (62 client + 7 title; 10 more were skipped because `representing` does not name a side) and filled 83 empty `client_name`s. Additive; created three functions and one trigger. |
| `20260902_contact_cleanup.sql` | Deleted 2 exact-duplicate contact rows the Payload retainer webhook had inserted blind on 6321 Foster St. Destructive; run only after `20260902_contact_projection.sql` is verified. The surviving 9 `contact_type = 'title'` rows are left as-is on purpose: they hold the paying **customer**, not a title company (four are leases), so they are excluded from `TITLE_CONTACT_TYPES` and from the projection rather than relabelled. Legitimate same-type duplicates (co-buyers, co-tenants) were also left alone. |

### checks/

| File | What it did |
|---|---|
| `09_payload_holds_and_pending.sql` | Per-check bank holds and Payload pending-payment sources. Additive and idempotent. |
| `10_check_status_central_time.sql` | Fixed `derive_check_status` to use the Central date rather than UTC. `CURRENT_DATE` is UTC, so after roughly 7pm Texas time a check cleared "tomorrow" was being read a day early. |
| `11_payouts_ledger.sql` | The payouts account: sweep, ledger, reconciliation and recurring bills. Added `checks_received.funds_destination` (payouts / income / title_direct, default payouts) so money title paid direct is never counted as unswept; `payout_expenses.category`, `.status`, `.released_at`, `.released_by` so an earmark is released rather than deleted; widened `brokerage_ledger.entry_type` to allow `transfer` and added `parent_entry_id` so one bank line holds a real child row per deal; and created `recurring_bills`. Additive and idempotent throughout. Runs BEFORE the code deploy: the new routes filter on `funds_destination` and write `transfer` entries, and both fail against the old schema. |
| `12_payment_method_casing.sql` | Lowercased stored `payment_method` and `funding_source` so one value stops producing two buckets. `funding_source` was also a live defect: the transaction page compares it case-sensitively against `crc`, so rows stored as `CRC` rendered a stray "Funding: CRC" line. Runs AFTER `11_payouts_ledger.sql` is verified and after the code deploy, because it rewrites existing values. Deliberately records no expected row counts: the figures moved three times in one afternoon as agents were marked paid, and a stale number in a migration invites reconciling live data to a comment. The file's own SELECT block queries every column it rewrites; run it and use what it returns. |
| `13_drop_paid_by_party.sql` | Dropped `transaction_internal_agents.paid_by_party`, which migration 11 originally added by mistake. `funding_source` on the same table already recorded whether Collective Realty Co. or title paid an agent, already carried `title_direct`, and had 52 rows saying so; `paid_by_party` defaulted to `brokerage` and therefore contradicted it on all 52. Nothing ever read or wrote it. Destructive, so it runs last, after 11 and 12 are verified and the code is deployed. Verified before the drop: 1,562 rows, every one at the default. |

### cda/

| File | What it did |
|---|---|
| `supabase_migration_cda_due_soon_days.sql` | Added `company_settings.cda_due_soon_days` so the Needs CDA threshold is editable in Settings rather than hardcoded. |
| `supabase_migration_cda_sent_manual.sql` | Manual "CDA sent" override, for CDAs sent to title outside the app. |

### agent-email/

| File | What it did |
|---|---|
| `agent_email_dashboard_phase1.sql` | Schema, permissions, and Graph subscription support for the agent email dashboard. |
| `agent_email_dashboard_phase2.sql` | One table for in-app notifications. |
| `agent_email_dashboard_phase3.sql` | Three further additions to the dashboard. |

### platform/

| File | What it did |
|---|---|
| `phase1_help_center_and_signature_tracking.sql` | Email signature tracking plus the help center foundation. |
| `email_signatures.sql` | Created `email_signatures`. One row per user and layout, form data as JSONB. |
| `office_locations.sql` | Added per-office fields (Houston, DFW, Referral Collective) to `company_settings`, powering the signature builder office selector. |
| `supabase_migration_license_monitor.sql` | Licence monitor support. Additive only, safe to re-run. |
| `zoom_recording_jobs.sql` | Created `zoom_recording_jobs` for recording webhooks and SharePoint upload status. |
| `payload_invoice_settlements.sql` | Created `payload_invoice_settlements`. Payload has no field for the CRC user who marked an invoice paid, so Payment History could only ever say "Recorded manually". **This is why the Billing page can name who settled an invoice, and why it cannot for anything settled before this ran.** |

## Known stale references

Three places in the codebase point at migration files that do not exist. They
predate this reorganisation and are not fixed by it:

- `types/tc-module.ts:5` references `deploy/sql/01_schema.sql`
- `docs/FORM-BUILDER-SUMMARY.md` references `supabase-forms-schema.sql`
- `docs/HEADSHOT-SETUP.md` references `supabase-headshot-schema.sql`
