-- Who settled a Payload invoice outside of Payload.
--
-- Payload has no field for the CRC user who marked an invoice paid, so the
-- Billing page's Payment History could only ever say "Recorded manually".
-- This table is the app's own record of the actor, the method, and the note,
-- keyed by the Payload invoice ID (a text id like "inv_3fPo3MtPFoleY8MpnUNfM",
-- which is why invoice_id is text and not a uuid).
--
-- Written by:
--   POST /api/payload/mark-invoice-paid          source = 'mark_invoice_paid'
--   stage_debt / stage_monthly_invoice           source = 'commission_offset'
--   settlePayloadInvoiceForDebt (payout path)    source = 'payout_auto_settle'
-- Read by:
--   GET /api/payload/receipts
--
-- reversed_at is stamped when a staged commission offset is unstaged, so a
-- settlement that no longer stands is not attributed to anyone. Rows are kept
-- rather than deleted so the trail survives.
--
-- Additive only, four statements: one CREATE TABLE, two CREATE INDEX, and one
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY. Nothing dropped or updated, and
-- no UPDATE/DELETE, so there are no row counts to check first. Safe to
-- re-run: the creates are IF NOT EXISTS and re-enabling RLS on a table that
-- already has it is a no-op.
-- Safe to re-run. Run this BEFORE deploying the code, because the receipts
-- route selects from this table on every load and would 500 without it,
-- whereas the old code never touches it.

CREATE TABLE IF NOT EXISTS public.payload_invoice_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  invoice_id text NOT NULL,
  agent_id uuid,
  settled_by uuid,
  settled_by_name text,
  method text NOT NULL,
  source text NOT NULL,
  amount numeric,
  note text,
  reversed_at timestamp with time zone,
  CONSTRAINT payload_invoice_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT payload_invoice_settlements_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES public.users(id),
  CONSTRAINT payload_invoice_settlements_settled_by_fkey
    FOREIGN KEY (settled_by) REFERENCES public.users(id)
);

-- The receipts route looks these up with WHERE invoice_id IN (...).
CREATE INDEX IF NOT EXISTS idx_payload_invoice_settlements_invoice_id
  ON public.payload_invoice_settlements (invoice_id);

-- Open settlements for one agent, for any future "who settled what" view.
CREATE INDEX IF NOT EXISTS idx_payload_invoice_settlements_agent_open
  ON public.payload_invoice_settlements (agent_id)
  WHERE reversed_at IS NULL;

-- RLS with no policies, matching all 118 existing public tables (verified
-- live: 118 of 118 have relrowsecurity = true).
--
-- This is not optional. The database's default ACL for new public tables is
-- anon=arwdDxtm, which is INSERT/SELECT/UPDATE/DELETE for the anon role, and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle. Without this
-- line the table would be the only one in the app that anyone holding the
-- publishable key could read in full and write to - and it holds agent names,
-- settlement amounts, staff names, and free-text notes.
--
-- No policies are needed. Everything that touches this table goes through the
-- service role (lib/supabase/server.ts and lib/supabase both use
-- SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS. Verified: the only reader is
-- app/api/payload/receipts/route.ts and the only writer is
-- lib/payload/commissionOffset.ts, both service-role.
ALTER TABLE public.payload_invoice_settlements ENABLE ROW LEVEL SECURITY;
