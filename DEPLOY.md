# Self-Collect Landlord Support — Deploy Instructions

## Overview
One zip, three SQL migrations, one deploy.

---

## Step 1: Run Migration 01 (schema) — BEFORE deploying code

In Supabase SQL Editor, run `migrations/01_schema.sql`.

Adds:
- `crc_collects_rent`, `crc_holds_deposit`, `crc_invoices_mgmt_fee` to `pm_agreements` (all default `true`)
- `landlord_payment_instructions` to `pm_leases`
- New `pm_landlord_invoices` table
- `landlord_invoice_id` column to `pm_fee_payouts`

Verify the four SELECT statements at the bottom all return rows.

---

## Step 2: Deploy the code

In your Codespace (`glorious-waddle`):

```bash
cd /workspaces/collectiveagent
unzip -o selfcollect.zip
```

Vercel auto-deploys on push to main. Wait for deploy to finish before running backfill migrations.

---

## Step 3: Run Migration 02 (backfill invoices) — AFTER deploy

In Supabase SQL Editor, run `migrations/02_backfill_invoices.sql`.

**Run STEP A first** (the SELECT preview). Review the results to confirm the leases and fee amounts look correct.

Then run **STEP B** (the INSERT). This creates one `pm_landlord_invoice` per month per active lease.

Check the final verification count — it should match your expected number of invoice months.

---

## Step 4: Run Migration 03 (backfill mark paid + connect fee payouts)

In Supabase SQL Editor, run `migrations/03_backfill_mark_paid.sql`.

Run each STEP in order:
- **STEP A**: Preview which invoices will be marked paid. Review.
- **STEP B**: Run the UPDATE. Marks invoices paid where a landlord_disbursement exists.
- **STEP C**: Preview which pm_fee_payouts will be connected. Review.
- **STEP D**: Run the UPDATE. Sets `landlord_invoice_id` on existing fee payout rows.

Final verification shows counts. All existing `pm_fee_payouts` rows should be connected.

---

## What changed

### New
- `pm_landlord_invoices` table and full CRUD API
- `/api/pm/landlord-invoices` (GET list)
- `/api/pm/landlord-invoices/[id]` (GET + PATCH)
- `/api/pm/landlord-invoices/[id]/mark-paid` (POST — creates pm_fee_payouts)
- `/api/pm/landlord-invoices/send` (POST — Payload invoice + payment link)

### Modified
- **Agreement form** (`/admin/pm/landlords/[id]`): three new toggle fields under "Collection Model"
- **Lease creation** (`/api/pm/leases` + `/admin/pm/leases/new`): generates landlord invoices for all landlords; conditionally skips tenant invoices when `crc_collects_rent = false`; updated banner copy
- **Lease detail** (`/admin/pm/leases/[id]`): new `landlord_payment_instructions` textarea field
- **Disbursements page**: new Disbursement Type dropdown (Rent/Deposit/Reserve) in landlord path; property dropdown filters based on type
- **Disbursements API**: marks landlord invoice paid and links pm_fee_payouts when Rent Disbursement created
- **Invoices page**: two tabs (Tenants / Landlords); mark-paid modal on both; stats cards filter list when clicked
- **Statement generator**: mgmt fees now pulled from paid landlord invoices instead of disbursements
- **All-payouts report**: pm_fee_payouts join through landlord invoices for property/period
- **Tenant portal**: hides invoice/payment section when `crc_collects_rent = false`; shows landlord payment instructions instead
- **Landlord portal**: new Management Fee Invoices section (sent/paid only); Receipt icon added
- **Repairs detail**: hides "Deducted from Rent" payment status for self-collect properties
- **Landlords API**: includes toggle flags in pm_agreements join
- **Properties API**: includes toggle flags in pm_agreements join

---

## Required onboarding order for new landlords

Every new landlord must be set up in this exact sequence. Each step is a prerequisite for the next.

1. **Landlord** - Create the landlord record at `/admin/pm/landlords/new`
2. **Agreement** - Create a PM agreement on the landlord detail page (Agreement tab). This sets the fee structure and collection model toggles. A property cannot be linked without an agreement.
3. **Property** - Add the managed property and link it to the agreement just created.
4. **Tenant** - Create the tenant record at `/admin/pm/tenants/new`
5. **Lease** - Create the lease at `/admin/pm/leases/new`, selecting the landlord, property, and tenant. This step generates all tenant invoices (if CRC collects rent) and all landlord management fee invoices for the lease term.

**Why order matters:** Landlord invoices are generated at lease creation using the fee percentage and collection model from the agreement. If the agreement does not exist when the lease is created, no invoices will be generated and the fee terms will not be applied correctly.



1. Open the landlord in `/admin/pm/landlords/[id]`
2. Go to the Agreement tab
3. Under "Collection Model", uncheck the relevant toggles
4. Save
5. New leases for that property will automatically skip tenant invoice creation
6. Existing leases are not retroactively changed — backfill already handled historical records
