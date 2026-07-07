-- Migration 10: derive_check_status should use CENTRAL date, not UTC.
--
-- Why: CURRENT_DATE in Postgres is UTC. After ~7pm Texas time, UTC has already
-- rolled to the next calendar day. So a check whose cleared_date is "tomorrow"
-- (a future date the staff entered) was being stamped 'cleared' this evening,
-- and it dropped out of the Holds list a full day before it actually clears.
--
-- Fix: compare cleared_date against the current date in America/Chicago.
-- (now() AT TIME ZONE 'America/Chicago')::date is today's date in Texas.
--
-- Idempotent: CREATE OR REPLACE. Additive: no schema change, only the function
-- body. The trigger trg_derive_check_status keeps pointing at this function.

CREATE OR REPLACE FUNCTION public.derive_check_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  central_today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
  IF NEW.cleared_date IS NOT NULL AND NEW.cleared_date <= central_today THEN
    NEW.status := 'cleared';
  ELSIF NEW.deposited_date IS NOT NULL THEN
    NEW.status := 'deposited';
  ELSE
    NEW.status := 'received';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- One-time cleanup: fix rows that were wrongly stamped 'cleared' by the old
-- UTC logic. Any check whose stored status disagrees with the Central-time
-- rule gets recomputed. This is the same logic the trigger now uses.
--
-- SELECT-before preview. Run this first, eyeball the rows, then run the UPDATE.
-- Expect to see the two July 7 checks with status 'cleared' -> should_be 'deposited'.
-- ---------------------------------------------------------------------------
SELECT id, property_address, cleared_date, deposited_date, status,
       CASE
         WHEN cleared_date IS NOT NULL AND cleared_date <= (now() AT TIME ZONE 'America/Chicago')::date THEN 'cleared'
         WHEN deposited_date IS NOT NULL THEN 'deposited'
         ELSE 'received'
       END AS should_be
  FROM checks_received
 WHERE status IS DISTINCT FROM (
         CASE
           WHEN cleared_date IS NOT NULL AND cleared_date <= (now() AT TIME ZONE 'America/Chicago')::date THEN 'cleared'
           WHEN deposited_date IS NOT NULL THEN 'deposited'
           ELSE 'received'
         END
       );

-- After reviewing the preview above, run this UPDATE to correct the rows.
-- It only touches rows whose status is wrong; correct rows are untouched.
UPDATE checks_received
   SET status = CASE
         WHEN cleared_date IS NOT NULL AND cleared_date <= (now() AT TIME ZONE 'America/Chicago')::date THEN 'cleared'
         WHEN deposited_date IS NOT NULL THEN 'deposited'
         ELSE 'received'
       END,
       updated_at = now()
 WHERE status IS DISTINCT FROM (
         CASE
           WHEN cleared_date IS NOT NULL AND cleared_date <= (now() AT TIME ZONE 'America/Chicago')::date THEN 'cleared'
           WHEN deposited_date IS NOT NULL THEN 'deposited'
           ELSE 'received'
         END
       );

-- ---------------------------------------------------------------------------
-- VERIFY: after the UPDATE, this should return 0 rows (everything consistent).
-- ---------------------------------------------------------------------------
SELECT count(*) AS still_wrong
  FROM checks_received
 WHERE status IS DISTINCT FROM (
         CASE
           WHEN cleared_date IS NOT NULL AND cleared_date <= (now() AT TIME ZONE 'America/Chicago')::date THEN 'cleared'
           WHEN deposited_date IS NOT NULL THEN 'deposited'
           ELSE 'received'
         END
       );
