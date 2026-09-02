-- Delete the duplicate contact rows the Payload retainer webhook inserted blind.
--
-- DESTRUCTIVE. Deletes 2 rows. Nothing is renamed and nothing is added, which is
-- why it is a separate file from 20260902_contact_projection.sql.
--
-- RUN THIS ONLY AFTER 20260902_contact_projection.sql has run and its
-- verification queries came back as expected. The delete below fires the
-- projection trigger that file creates.
--
-- ORDER RELATIVE TO THE CODE DEPLOY: after the code, and after the projection
-- migration.
--
--
-- WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT NO LONGER DOES
--
-- app/api/payload/commission-retainer-webhook/route.ts recorded the paying
-- customer as a transaction_contacts row typed 'title', with a bare .insert()
-- and no existence check. Two problems:
--
--   The insert was blind, so a webhook firing more than once for the same
--   payment added a row each time. 6321 Foster St carries the same person three
--   times: 2026-08-15 at 14:38:15, 19:05:10 and 19:08:33.
--
--   The type was wrong. 'title' is not a title company.
--
-- AN EARLIER VERSION OF THIS FILE RENAMED THOSE 9 SURVIVING ROWS TO
-- 'title_company'. THAT WAS A MISTAKE AND THE RENAME HAS BEEN REMOVED.
--
-- title_company_email is the Send to Title recipient. Here is what those rows
-- actually hold:
--
--   1303 S Second Street Unit #1   cancelled  Blavesco LTD      heather@blavesco.com
--   1917 W Daytona Referral        cancelled  KW Revolution     klrw852@kw.com
--   210 Ridgecrest Dr              cancelled  Teresa Baxter     tpbaxter@hotmail.com
--   21430 Poppy Park Ave  lease    closed     Hollye Ballard    noemail@noemail.com
--   23535 San Ricci Court          cancelled  Bryant stewart    nini103@hotmail.com
--   23731 Ruby Bramble Tr lease    closed     Pharissa Robinson pharissa.robinson@gmail.com
--   4210 Justin Lane      lease    closed     Heynel Sevilla    heynelsevilla3@gmail.com
--   6321 Foster St                 closed     Andrea reyna      reynandreajess@gmail.com  (x3)
--   8619 Arranmore Ln     lease    closed     Shazia Raza       shaziaraza331926@aol.com
--
-- Not one is a title company. Four sit on leases, which have no title company.
-- One is a competing brokerage. The rest are personal gmail, hotmail and aol
-- addresses, and one literal noemail@noemail.com. Every one of those deals has
-- title_company_email NULL today and no other title contact, so the rename plus
-- the projection would have written these addresses in unopposed - and a CDA is
-- a commission disclosure.
--
-- The webhook itself settles what the payer is: its retainer branch already
-- records the same payerName/payerEmail as contact_type 'client'. The paying
-- customer is the client. The 'title' sites were simply a bug, and the code in
-- this patch removes them rather than relabelling their output.
--
-- The 9 surviving rows therefore STAY as contact_type 'title', where nothing
-- reads them:
--   - TITLE_CONTACT_TYPES in lib/transactions/constants.ts is
--     ['title_company', 'title_officer'] - 'title' is excluded.
--   - project_transaction_contacts() excludes it too, so it never reaches
--     title_company_email.
--   - 'title' is now a labelled legacy option in the Contacts tab dropdown
--     ("Title (legacy - reclassify)"), so opening one of those rows no longer
--     blanks its type.
-- Reclassify them by hand to the party they actually are. They are real people
-- and real data, so they are not deleted here.
--
-- LEGITIMATE duplicates are deliberately left alone. Three co-tenants on
-- 14112 Faith Forest Dr and two buyers on 20427 Lakeside Dr are real: 15 deals
-- carry same-type rows and only the 6321 Foster St trio is junk. This is also
-- why no UNIQUE (transaction_id, contact_type) constraint is added - it could
-- not be created without deleting real co-buyers and co-tenants.


-- ── Look first ──────────────────────────────────────────────────────────────
-- Expect 11 rows across 9 deals (8 deals with 1 row, plus 6321 Foster St with 3).
-- Read them before deleting.
SELECT c.id, t.id AS transaction_id, t.property_address, t.status,
       c.name, c.email::text, c.created_at
FROM transaction_contacts c JOIN transactions t ON t.id = c.transaction_id
WHERE c.contact_type = 'title'
ORDER BY t.property_address, c.created_at;

-- Expect 2. This is the SELECT form of the DELETE's WHERE clause - check the
-- count before running the write.
SELECT count(*) AS rows_to_delete
FROM transaction_contacts c
WHERE c.contact_type = 'title'
  AND EXISTS (
    SELECT 1 FROM transaction_contacts k
    WHERE k.transaction_id = c.transaction_id
      AND k.contact_type = 'title'
      AND coalesce(k.name, '') = coalesce(c.name, '')
      AND coalesce(k.email::text, '') = coalesce(c.email::text, '')
      AND (k.created_at < c.created_at OR (k.created_at = c.created_at AND k.id < c.id))
  );


-- ── Delete exact duplicates, keeping the earliest ───────────────────────────
-- Same deal, same type, same name, same email: keep the oldest, drop the rest.
-- Scoped to contact_type = 'title', so no hand-entered contact can match, and
-- an exact duplicate by definition loses no information.
DELETE FROM public.transaction_contacts c
WHERE c.contact_type = 'title'
  AND EXISTS (
    SELECT 1 FROM public.transaction_contacts k
    WHERE k.transaction_id = c.transaction_id
      AND k.contact_type = 'title'
      AND coalesce(k.name, '') = coalesce(c.name, '')
      AND coalesce(k.email::text, '') = coalesce(c.email::text, '')
      AND (k.created_at < c.created_at OR (k.created_at = c.created_at AND k.id < c.id))
  );


-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 9 rows of type 'title' remaining, none duplicated.
SELECT contact_type, count(*)
FROM transaction_contacts
WHERE contact_type IN ('title', 'title_company', 'title_officer')
GROUP BY contact_type
ORDER BY contact_type;

-- 6321 Foster St, BY ID, because three transactions share that address
-- (W6 - filtering on property_address returned all three and made the
-- expectation unreadable).
-- Expect exactly one 'title' row, Andrea reyna, and title_company_email still
-- NULL, because 'title' is not a title type.
SELECT t.id, t.property_address, t.title_company_email, c.contact_type, c.name, c.created_at
FROM transactions t
LEFT JOIN transaction_contacts c
  ON c.transaction_id = t.id
 AND c.contact_type IN ('title_company', 'title_officer', 'title')
WHERE t.id = 'a1e38419-2743-4366-b06d-cce7b73d18bd';

-- Expect 0: no deal that section 6 projected should be missing a title address
-- it genuinely has. Counts only real title types, so the 9 payer rows correctly
-- do not appear.
--
-- SCOPED TO client_name = '' ON PURPOSE, matching what section 6 of
-- 20260902_contact_projection.sql actually runs on. project_transaction_contacts()
-- writes the client AND title columns in one call, so gating section 6 on an
-- empty client_name gates the title columns too: a deal with a populated
-- client_name never gets its title columns filled either.
--
-- Without this condition the query reads 1, not 0. The one deal is
-- 5725 Adamite Way, Houston (91acd9ec-1252-4e13-b3dc-5d6982d1b0ca, closed),
-- whose client_name is "QUIANA CRAIG" so section 6 skips it - and whose
-- title_company row's email is the literal string 'N/A' anyway, not an address.
-- See the sentinel note at the end of this file.
SELECT count(*) AS deals_with_a_title_contact_email_but_no_flat_email
FROM transactions t
WHERE COALESCE(t.title_company_email, '') = ''
  AND COALESCE(t.client_name, '') = ''
  AND EXISTS (
    SELECT 1 FROM transaction_contacts c
    WHERE c.transaction_id = t.id
      AND c.contact_type IN ('title_company', 'title_officer')
      AND public.contact_jsonb_first_text(c.email) IS NOT NULL
  );

-- The 9 payer rows to reclassify by hand, for convenience.
SELECT t.id AS transaction_id, t.property_address, t.transaction_type, t.status,
       c.id AS contact_id, c.name, c.email::text
FROM transaction_contacts c JOIN transactions t ON t.id = c.transaction_id
WHERE c.contact_type = 'title'
ORDER BY t.property_address;


-- ── KNOWN, NOT FIXED HERE: junk sentinels in email/phone ────────────────────
-- 12 contact rows hold the literal string 'n/a' or 'N/A' in email or phone, and
-- three of those are title_company rows:
--
--   10606 Knox Landing Dr, Bryan     PENDING    email 'n/a'
--   10606 Knox Landing Drive, Bryan  cancelled  email 'n/a'
--   5725 Adamite Way, Houston        closed     email 'N/A'
--
-- contact_jsonb_first_text() strips empty strings but not sentinels, so it
-- returns 'n/a' as a value. This is PRE-EXISTING for Send to Title:
-- titleContactEmail() in lib/documents/cdaData.ts already returns 'n/a' as a
-- truthy address, and the base code's .find() picked the same row, so this
-- patch changes nothing about who gets emailed. One of the three is PENDING, so
-- it is reachable today independent of this deploy.
--
-- What this patch does add is display: the trigger will write 'n/a' into the
-- flat title_company_email on the next contact edit. That column is never a
-- send recipient, so the effect is an Overview card reading "n/a".
--
-- NOT fixed here on purpose. Treating sentinels as NULL would have to change
-- contact_jsonb_first_text() AND titleContactEmail() together - the two are
-- required to agree - and changing titleContactEmail() changes who Send to Title
-- resolves on a pending deal. That needs a decision, not a migration.
SELECT t.property_address, t.status, c.contact_type, c.name, c.email::text, c.phone::text
FROM transaction_contacts c JOIN transactions t ON t.id = c.transaction_id
WHERE lower(btrim(coalesce(c.email #>> '{}', ''))) IN ('n/a', 'na', 'none')
   OR lower(btrim(coalesce(c.phone #>> '{}', ''))) IN ('n/a', 'na', 'none')
ORDER BY t.status, t.property_address;
