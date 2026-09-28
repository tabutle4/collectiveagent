-- Linking an item in Also In Payouts back to the bill it came from.
--
-- Everything needed to reserve and then pay a bill already exists:
-- payout_expenses holds the reservation and is subtracted from the bottom
-- line, and its 'pay' action writes the brokerage_ledger line with the real
-- amount, an idempotency key and compensation if the write fails. The only
-- thing missing was a way to put a recurring bill into that list by picking it
-- rather than retyping its name and amount.
--
-- This column is that link. It lets the picker say which bills are already
-- waiting so the same one is not reserved twice, and it ties a reservation to
-- the ledger line it eventually produced, which is where the figure that
-- actually left the bank lives. The reservation keeps the RESERVED amount, not
-- the paid one - the pay path deliberately asks again, and only the ledger
-- records the answer.
--
-- Nullable on purpose: an earmark typed by hand has no bill behind it, and
-- that is the ordinary case. ON DELETE SET NULL so deleting a bill definition
-- loses the link and never the reservation.
--
-- Additive only, idempotent. Runs BEFORE the code deploy: the picker selects
-- and writes this column, so code deployed first gets PostgREST 42703.

alter table public.payout_expenses
  add column if not exists recurring_bill_id uuid
    references public.recurring_bills(id) on delete set null;

comment on column public.payout_expenses.recurring_bill_id is
  'The recurring bill this reservation came from, when it was picked rather than typed. Null for a hand-entered earmark.';

-- "Which bills are already waiting" on every open of the picker.
create index if not exists payout_expenses_recurring_bill_idx
  on public.payout_expenses (recurring_bill_id, status)
  where recurring_bill_id is not null;

-- One live reservation per bill, enforced rather than checked.
--
-- The route looks for an existing active reservation before inserting, but a
-- read followed by a write is two requests and PostgREST scopes a transaction
-- to one, so two people confirming the same bill in the same moment both pass
-- the check and both insert. The result is the bill held back twice, which
-- reads as money the account does not have. This index is what actually
-- prevents it; the check in the route is there to produce a civil message.
--
-- Partial on status so a released or paid reservation never blocks the next
-- month's. Safe to create: recurring_bill_id is new, so no existing row
-- qualifies and nothing can already be in violation.
create unique index if not exists payout_expenses_one_active_per_bill_idx
  on public.payout_expenses (recurring_bill_id)
  where recurring_bill_id is not null and status = 'active';
