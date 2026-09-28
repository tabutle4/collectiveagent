-- Who did it.
--
-- transaction_activity rows are written by a database trigger, and the
-- database sees one service credential rather than a person. actor_id has
-- been there since 16 but nothing ever filled it in, because the trigger has
-- no way to know which human was logged into the app.
--
-- The app fills it in after the fact instead: a route that changed a deal
-- stamps the rows its own edit just produced. actor_id carries a real person;
-- actor_label carries the name of an automatic job, which has no user row to
-- point at. Exactly one of the two is set on any stamped row, and a row with
-- neither was not stamped by anything and reads as "System".
--
-- Additive only, and idempotent, but NOT order-free: run this BEFORE the code
-- deploy. The new activity route puts actor_label in its SELECT list, so code
-- deployed against a database without the column gets PostgREST 42703 and the
-- Activity tab dies on every deal until this runs. The reverse order is safe:
-- old code never asks for the column.

alter table public.transaction_activity
  add column if not exists actor_label text;

comment on column public.transaction_activity.actor_label is
  'Name of the automatic job that made this change, when no person did. Mutually exclusive with actor_id; both null means nothing stamped it.';

-- Stamping looks up a transaction''s recent unstamped rows. Without this the
-- lookup is a sequential scan of the whole table on every edit.
create index if not exists transaction_activity_unstamped_idx
  on public.transaction_activity (transaction_id, occurred_at)
  where actor_id is null and actor_label is null;
