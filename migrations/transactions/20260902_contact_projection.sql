-- Keep the Contacts tab and the Overview cards in agreement, permanently.
--
-- ADDITIVE ONLY. Creates three functions and one trigger, inserts missing
-- contact rows, and fills empty flat columns. Nothing is dropped, nothing is
-- deleted, no existing non-empty value is overwritten. Safe to re-run.
--
-- The duplicate cleanup and the 'title' -> 'title_company' rename are NOT here.
-- They delete and rewrite rows, so they live in 20260902_contact_cleanup.sql
-- and must run only after this file is verified.
--
-- ORDER RELATIVE TO THE CODE DEPLOY: run this SECOND, after the code.
--   Nothing in the new code reads a column or function this file creates, so
--   the code is safe without it. Running it first is also harmless, but running
--   it second means the app is already resolving title contacts by priority
--   when the backfill starts creating rows.
--
--
-- WHY THIS EXISTS
--
-- Every deal stores its people twice: as rows in transaction_contacts (the
-- Contacts tab) and as flat columns on transactions (client_name, client_email,
-- client_phone, title_company, title_officer_name, title_company_email,
-- title_officer_phone, which the Overview cards display). Nothing copied
-- between them. Send to Title reads only the rows; flyers, coordination,
-- compliance, search and the agent forms read only the columns.
--
-- Eight code paths write contacts and only three of them wrote both stores, so
-- editing a contact on the Contacts tab left the columns stale.
--
-- An app-level helper was considered and rejected: it only protects writers
-- that call it, and a ninth writer, or an edit made by hand in the Supabase
-- table editor, would drift again. A trigger cannot be bypassed.
--
-- DIRECTION: transaction_contacts is the source of truth. The flat columns are
-- a PROJECTION of it. They are not a second place to type a client's name -
-- editing them directly is overwritten the next time that deal's contacts
-- change. That is why the Overview cards are read-only.
--
-- THE COLUMNS CANNOT HOLD THE WHOLE TRUTH, and that is accepted. 14112 Faith
-- Forest Dr has three co-tenants; client_name is one column. Per Tara
-- (2026-09-02) it carries ALL of them, comma-separated - which is already how
-- the office writes multiple clients by hand: 31 of 217 deals with a client
-- name already list more than one person.
--
-- SIDE EFFECT WORTH KNOWING: the projection UPDATEs transactions, so the
-- existing update_transactions_updated_at trigger bumps transactions.updated_at
-- whenever a contact changes. Anything sorting by updated_at will see contact
-- edits as deal activity.


-- ── HOW TO READ THE "Expect N" LINES IN THIS FILE ───────────────────────────
-- Every expectation below is scoped to the SAME population as the write it
-- checks. That is not decoration: three separate defects in this patch's review
-- history were a verification query that did not carry a scope restriction
-- added to the write beside it, so a correct migration reported failure.
--
-- If you add or narrow a WHERE clause on a write in this file, re-derive EVERY
-- expectation downstream of it against live data before shipping. Do not assume
-- a count that was right yesterday is right after a scope change - that
-- assumption is what produced all three.
--
-- The guards that pair with a write are marked where they appear.


-- ── Look first ──────────────────────────────────────────────────────────────
-- Expect: no project_transaction_contacts function, no projection trigger.
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('project_transaction_contacts', 'trg_project_transaction_contacts',
                    'contact_jsonb_first_text', 'client_contact_types_for');

SELECT t.tgname, c.relname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND c.relname = 'transaction_contacts';

-- Expect 62 client + 7 title = 69 rows created, and 10 client rows SKIPPED
-- because `representing` does not name a side (W5). Before that guard the
-- counts were 72 + 7 = 79 and those 10 would have been labelled 'buyer'.
SELECT
  count(*) FILTER (WHERE COALESCE(client_name,'') <> ''
    AND array_length(public.client_contact_types_for(t.representing), 1) = 1
    AND NOT EXISTS (SELECT 1 FROM transaction_contacts c
                    WHERE c.transaction_id = t.id
                      AND c.contact_type IN ('buyer','seller','tenant','landlord','client'))
  ) AS client_rows_to_create,
  count(*) FILTER (WHERE COALESCE(title_company_email,'') <> ''
    AND NOT EXISTS (SELECT 1 FROM transaction_contacts c
                    WHERE c.transaction_id = t.id
                      AND c.contact_type IN ('title_company','title_officer'))
  ) AS title_rows_to_create
FROM transactions t;

-- Expect 83: deals whose client_name is empty and whose contact rows can fill it.
-- The four deals where a NON-empty client_name disagrees with its rows are
-- listed at the bottom of this file and are deliberately left alone.


-- ── 1. Read one value out of the jsonb email/phone columns ──────────────────
-- transaction_contacts.email and .phone are jsonb and hold three shapes in live
-- data: a bare string (232 email rows), a one-element array (30), and null
-- (160). The object form {value: ...} is handled because titleContactEmail in
-- lib/documents/cdaData.ts handles it.
CREATE OR REPLACE FUNCTION public.contact_jsonb_first_text(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL THEN NULL
    WHEN jsonb_typeof(v) = 'string' THEN nullif(btrim(v #>> '{}'), '')
    WHEN jsonb_typeof(v) = 'array' THEN nullif(btrim(
      CASE WHEN jsonb_typeof(v -> 0) = 'object' THEN v -> 0 ->> 'value' ELSE v ->> 0 END), '')
    WHEN jsonb_typeof(v) = 'object' THEN nullif(btrim(v ->> 'value'), '')
    ELSE NULL
  END
$$;


-- ── 2. Which contact types are OUR client on this deal ──────────────────────
-- This has to key off `representing`, not "any client-side row". 23 deals record
-- BOTH parties to a lease (a landlord row and a tenant row), which is normal
-- practice - so taking every client-side row would put the other party's name
-- into client_name and onto flyers.
--
-- nc_buyer, new_construction_buyer and commercial_buyer all match '%buyer%'.
-- 'dual' means we represent both sides, so both sides are the client.
-- NULL and 'referred_out' fall through to every side type: all 42 such deals
-- that have contacts carry exactly one side type, so there is nothing to
-- disambiguate today.
CREATE OR REPLACE FUNCTION public.client_contact_types_for(p_representing text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_representing, '')) LIKE '%landlord%' THEN ARRAY['landlord']
    WHEN lower(coalesce(p_representing, '')) LIKE '%seller%'   THEN ARRAY['seller']
    WHEN lower(coalesce(p_representing, '')) LIKE '%tenant%'   THEN ARRAY['tenant']
    WHEN lower(coalesce(p_representing, '')) LIKE '%buyer%'    THEN ARRAY['buyer']
    WHEN lower(coalesce(p_representing, '')) = 'dual' THEN ARRAY['buyer','seller','tenant','landlord']
    ELSE ARRAY['buyer','seller','tenant','landlord','client']
  END
$$;


-- ── 3. The projection ───────────────────────────────────────────────────────
-- Recompute one deal's flat contact columns from its contact rows.
--
-- coalesce(<projected>, <existing>) on every column is the no-data-loss rule: a
-- column is only written when the rows actually produce a value. Deleting a
-- deal's last client contact therefore leaves client_name as it was rather than
-- silently blanking it, and adding an unrelated lender contact to a deal that
-- has no client rows cannot wipe a client name the agent forms wrote.
CREATE OR REPLACE FUNCTION public.project_transaction_contacts(p_txn_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_types            text[];
  v_names            text;
  v_emails           text;
  v_phones           text;
  v_title_company    text;
  v_title_officer    text;
  v_title_email      text;
  v_title_phone      text;
BEGIN
  IF p_txn_id IS NULL THEN
    RETURN;
  END IF;

  SELECT public.client_contact_types_for(t.representing)
  INTO v_types
  FROM public.transactions t
  WHERE t.id = p_txn_id;

  IF v_types IS NULL THEN
    -- No such transaction (a contact row can outlive nothing, but be safe).
    RETURN;
  END IF;

  -- ALL clients, comma-separated, in the order they were added. string_agg
  -- skips NULLs, so a client with no email contributes nothing to client_email
  -- rather than an empty slot.
  SELECT
    nullif(string_agg(nullif(btrim(coalesce(c.name, '')), ''), ', ' ORDER BY c.created_at, c.id), ''),
    nullif(string_agg(public.contact_jsonb_first_text(c.email),  ', ' ORDER BY c.created_at, c.id), ''),
    nullif(string_agg(public.contact_jsonb_first_text(c.phone),  ', ' ORDER BY c.created_at, c.id), '')
  INTO v_names, v_emails, v_phones
  FROM public.transaction_contacts c
  WHERE c.transaction_id = p_txn_id
    AND c.contact_type = ANY (v_types);

  -- The title side is one officer at one company, so one row wins.
  --
  -- Order matches resolveTitleContact in lib/documents/cdaData.ts EXACTLY: a
  -- row that carries an email beats one that does not, then title_company
  -- beats title_officer beats title, then oldest first. The email comes first
  -- because this is the Send to Title recipient - a title_company row with a
  -- name but no address is useless next to a title_officer row that can be
  -- written to. If SQL and TypeScript ever disagree here, the Overview card
  -- and the CDA would name different people.
  --
  -- contact_type 'title' is EXCLUDED, matching TITLE_CONTACT_TYPES in
  -- lib/transactions/constants.ts. The Payload retainer webhook used to write
  -- the paying customer under that type: 11 live rows that are clients,
  -- tenants and one competing brokerage, on personal gmail/hotmail/aol
  -- addresses plus one literal noemail@noemail.com, four of them on leases
  -- that have no title company. Reading them here would put a commission
  -- disclosure in a private individual's inbox.
  SELECT
    nullif(btrim(coalesce(c.company, '')), ''),
    nullif(btrim(coalesce(c.name, '')), ''),
    public.contact_jsonb_first_text(c.email),
    public.contact_jsonb_first_text(c.phone)
  INTO v_title_company, v_title_officer, v_title_email, v_title_phone
  FROM public.transaction_contacts c
  WHERE c.transaction_id = p_txn_id
    AND c.contact_type IN ('title_company', 'title_officer')
  ORDER BY
    (public.contact_jsonb_first_text(c.email) IS NULL),
    CASE c.contact_type WHEN 'title_company' THEN 0 ELSE 1 END,
    c.created_at, c.id
  LIMIT 1;

  IF v_names IS NOT NULL OR v_emails IS NOT NULL OR v_phones IS NOT NULL THEN
    UPDATE public.transactions SET
      client_name  = coalesce(v_names,  client_name),
      client_email = coalesce(v_emails, client_email),
      client_phone = coalesce(v_phones, client_phone)
    WHERE id = p_txn_id;
  END IF;

  IF v_title_company IS NOT NULL OR v_title_officer IS NOT NULL
     OR v_title_email IS NOT NULL OR v_title_phone IS NOT NULL THEN
    UPDATE public.transactions SET
      title_company       = coalesce(v_title_company, title_company),
      title_officer_name  = coalesce(v_title_officer, title_officer_name),
      title_company_email = coalesce(v_title_email,   title_company_email),
      title_officer_phone = coalesce(v_title_phone,   title_officer_phone)
    WHERE id = p_txn_id;
  END IF;
END
$$;


-- ── 4. The trigger ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_project_transaction_contacts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.project_transaction_contacts(OLD.transaction_id);
    RETURN OLD;
  END IF;

  PERFORM public.project_transaction_contacts(NEW.transaction_id);

  -- A contact moved between deals leaves the old deal needing a recompute too.
  IF TG_OP = 'UPDATE' AND NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
    PERFORM public.project_transaction_contacts(OLD.transaction_id);
  END IF;

  RETURN NEW;
END
$$;

-- AFTER, so the row being written is already visible to the recompute.
-- No recursion: this writes to transactions, whose only trigger is the
-- updated_at bump, which does not write back to transaction_contacts.
DROP TRIGGER IF EXISTS project_contacts_to_transaction ON public.transaction_contacts;
CREATE TRIGGER project_contacts_to_transaction
AFTER INSERT OR UPDATE OR DELETE ON public.transaction_contacts
FOR EACH ROW EXECUTE FUNCTION public.trg_project_transaction_contacts();


-- ── 5. Backfill the missing contact rows ────────────────────────────────────
-- 72 deals carry a client name on the flat columns with no client contact row at
-- all, and 7 carry a title email with no title contact row. Those deals show a
-- populated Overview card and an empty Contacts tab, and Send to Title refuses
-- the 7 outright.
--
-- NOTE: a flat client_name holding two people ("Barry Saunders And Angela
-- Freeman Saunders") becomes ONE contact row carrying that whole string. It is
-- not split. Splitting it reliably is not possible - "Grapevine Capital
-- Investments Llc (tyson Guy, Manager)" is one party, not two - so the string
-- is preserved as typed and the projection returns it unchanged. Split them by
-- hand on the Contacts tab where it matters.
--
-- W5: deals whose `representing` does not name a side are SKIPPED rather than
-- guessed. client_contact_types_for(NULL) returns all five types and its first
-- element is 'buyer', so 9 NULL-representing deals plus 1 'referred_out' would
-- have been silently labelled buyer. A missing row is easy to add on the
-- Contacts tab; a confidently wrong one is not. They are listed at the bottom.
INSERT INTO public.transaction_contacts (transaction_id, contact_type, name, email, phone, company)
SELECT
  t.id,
  (public.client_contact_types_for(t.representing))[1],
  nullif(btrim(t.client_name), ''),
  CASE WHEN COALESCE(t.client_email, '') <> '' THEN to_jsonb(btrim(t.client_email)) ELSE NULL END,
  CASE WHEN COALESCE(t.client_phone, '') <> '' THEN to_jsonb(btrim(t.client_phone)) ELSE NULL END,
  NULL
FROM public.transactions t
WHERE COALESCE(t.client_name, '') <> ''
  AND array_length(public.client_contact_types_for(t.representing), 1) = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.transaction_contacts c
    WHERE c.transaction_id = t.id
      AND c.contact_type IN ('buyer', 'seller', 'tenant', 'landlord', 'client')
  );

INSERT INTO public.transaction_contacts (transaction_id, contact_type, name, email, phone, company)
SELECT
  t.id,
  'title_company',
  nullif(btrim(t.title_officer_name), ''),
  CASE WHEN COALESCE(t.title_company_email, '') <> '' THEN to_jsonb(btrim(t.title_company_email)) ELSE NULL END,
  CASE WHEN COALESCE(t.title_officer_phone, '') <> '' THEN to_jsonb(btrim(t.title_officer_phone)) ELSE NULL END,
  nullif(btrim(t.title_company), '')
FROM public.transactions t
WHERE COALESCE(t.title_company_email, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.transaction_contacts c
    WHERE c.transaction_id = t.id
      AND c.contact_type IN ('title_company', 'title_officer')
  );


-- ── 6. One-time projection, deals with an EMPTY client_name ────────────────
-- SCOPE, measured not estimated. This runs on every deal that has any contact
-- row and an empty client_name - 106 deals, not 83. Of those:
--
--   83  gain a client_name
--    4  gain a title_company_email that was blank
--    4  gain a title_company that was blank
--    5  gain a title_officer_name that was blank
--    0  gain a title_officer_phone
--
-- It never overwrites a non-empty value, because every assignment is
-- coalesce(<projected>, <existing>).
--
-- An earlier draft of this comment said "roughly 14 title emails". That was
-- wrong by 3.5x, in the one comment written specifically to be precise about
-- write scope. The numbers above are counted, per column, against live data.
--
-- The
-- most useful case: 20427 Lakeside Dr has buyers Jessica Cardenas and Albert
-- Cardenas and a null client_name, and its CDA has already gone to title
-- naming one of them.
--
-- Deals whose client_name is already populated are NOT touched, even where it
-- disagrees with the rows. Four do; they are listed below for manual review,
-- because in one case the rows are worse than the column (a duplicated person)
-- and blindly projecting would make the data worse, not better.
SELECT public.project_transaction_contacts(t.id)
FROM public.transactions t
WHERE COALESCE(t.client_name, '') = ''
  AND EXISTS (SELECT 1 FROM public.transaction_contacts c WHERE c.transaction_id = t.id);


-- ── 7. Verify ───────────────────────────────────────────────────────────────
-- Expect 0 for both: every deal with a client name now has a client row, and
-- every deal with a title email now has a title row.
--
-- The array_length guard is repeated here ON PURPOSE. The look-first count, the
-- INSERT and this check must all describe the SAME population, or the check
-- counts the deliberately-skipped deals as failures. Without it this read 10
-- while the deploy notes said to expect 0, which would have reported a correct
-- migration as failed.
SELECT
  count(*) FILTER (WHERE COALESCE(client_name,'') <> ''
    AND array_length(public.client_contact_types_for(t.representing), 1) = 1
    AND NOT EXISTS (SELECT 1 FROM transaction_contacts c
                    WHERE c.transaction_id = t.id
                      AND c.contact_type IN ('buyer','seller','tenant','landlord','client'))
  ) AS client_rows_still_missing,
  count(*) FILTER (WHERE COALESCE(title_company_email,'') <> ''
    AND NOT EXISTS (SELECT 1 FROM transaction_contacts c
                    WHERE c.transaction_id = t.id
                      AND c.contact_type IN ('title_company','title_officer'))
  ) AS title_rows_still_missing
FROM transactions t;

-- Expect "Jessica Cardenas, Albert Cardenas".
SELECT property_address, client_name
FROM transactions
WHERE id = '38139842-90a3-421c-9bf1-31291b496b24';

-- The four deals where a populated client_name disagrees with its contact rows.
-- Review each on the Contacts tab; the rows are the source of truth, so fix the
-- ROWS and the column follows on the next save.
--
--   5907 Dawning Sun Road, Katy TX      column "Prosperity Bank"
--                                       rows   "Prosperity Bank, Sarah Shboul"
--                                       -> rows are right, column is missing a seller
--
--   7604 Victory Reserve Dr, Houston    column "Christine Nedrick & Jonathan Nedrick"
--                                       rows   "Jonathan and Christine Nedrick"
--                                       -> same two people, one row holds both names
--
--   1303 Gardenia Drive (438b0b3f-…)    column "Cari Bielamowicz, Adam Bielamowicz"
--                                       rows   "Cari Bielamowicz, Adam Bielamowicz, Adam J Bielamowicz"
--                                       -> ROWS ARE WRONG: Adam is in twice. Merge the
--                                          duplicate row before letting this project.
--
--   4940 Empire Way, Irving TX          column "Seshagiri Mummana & Swathi Pinnamaneni"
--                                       rows   "Pinnamaneni Swathi &  Mummana Seshagiri"
--                                       -> same two people, surname-first and double-spaced
-- Deals skipped by the backfill because `representing` does not name a side.
-- Add their client contact by hand on the Contacts tab.
SELECT t.property_address, t.representing, t.client_name, t.transaction_type
FROM transactions t
WHERE COALESCE(t.client_name, '') <> ''
  AND array_length(public.client_contact_types_for(t.representing), 1) <> 1
  AND NOT EXISTS (SELECT 1 FROM transaction_contacts c
                  WHERE c.transaction_id = t.id
                    AND c.contact_type IN ('buyer','seller','tenant','landlord','client'))
ORDER BY t.property_address;

-- IMPORTANT: the four deals below are left alone by section 6, but the TRIGGER
-- is not scoped to empty columns - it recomputes client_name from the rows on
-- any contact change. So fix the ROWS on these four BEFORE anyone edits a
-- contact on them, or the column picks up the wrong value automatically.
--
-- Do this one FIRST, and note the ID - three transactions share the address
-- '1303 Gardenia Drive, Houston, TX 77018' and only one is wrong:
--
--   438b0b3f-08f7-4f6c-a248-33a4390c705b   tenant_non_apt_v2, closed, tenant
--     client_name : "Cari Bielamowicz, Adam Bielamowicz"
--     from rows   : "Cari Bielamowicz, Adam Bielamowicz" + "Adam J Bielamowicz"
--     -> Adam is in twice. Merge the second row.
--
-- The other two at that address are fine: 05440d34-3c4d-43d3-944f-4a6022ff1a29
-- (cancelled, landlord) agrees with its rows, and
-- a4d3b523-7fb8-4afc-bfdb-3755ca6f6b2a has no contacts at all.
SELECT t.property_address, t.representing, t.client_name AS flat_column,
       (SELECT string_agg(nullif(btrim(coalesce(c.name,'')),''), ', ' ORDER BY c.created_at, c.id)
        FROM transaction_contacts c
        WHERE c.transaction_id = t.id
          AND c.contact_type = ANY (public.client_contact_types_for(t.representing))) AS from_rows
FROM transactions t
WHERE COALESCE(t.client_name,'') <> ''
  AND (SELECT string_agg(nullif(btrim(coalesce(c.name,'')),''), ', ' ORDER BY c.created_at, c.id)
       FROM transaction_contacts c
       WHERE c.transaction_id = t.id
         AND c.contact_type = ANY (public.client_contact_types_for(t.representing))) IS NOT NULL
  AND lower(btrim(t.client_name)) <> lower(btrim(
       (SELECT string_agg(nullif(btrim(coalesce(c.name,'')),''), ', ' ORDER BY c.created_at, c.id)
        FROM transaction_contacts c
        WHERE c.transaction_id = t.id
          AND c.contact_type = ANY (public.client_contact_types_for(t.representing)))));
