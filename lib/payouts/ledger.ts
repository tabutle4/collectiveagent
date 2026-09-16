// lib/payouts/ledger.ts
//
// One vocabulary for the payouts account ledger, shared by every surface that
// reads or writes it. Nothing else may re-implement these.
//
// Courtney reads this ledger through the Full ledger link on her day view, so
// every stored value has a plain-English label here and no screen ever renders
// a raw category. "sweep" on screen means nothing to someone who does not work
// the report; "Moved to our income account" does.

/**
 * `brokerage_ledger.entry_type`. Constrained in the database to exactly these
 * three. `transfer` was added for the sweep: moving office net from the payouts
 * account to the income account is neither income nor expense, because the
 * money never leaves Collective Realty Co.
 */
export const LEDGER_ENTRY_TYPES = ['income', 'expense', 'transfer'] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

/**
 * `brokerage_ledger.category`. The real kind of thing that happened.
 * `entry_type` only says which way the balance moved.
 */
export const LEDGER_CATEGORIES = [
  'opening_balance',
  'deposit',
  'agent_payout',
  'external_payout',
  'sweep',
  'bill',
  'transfer_in',
  'transfer_out',
  'earmark_release',
  'adjustment_in',
  'adjustment_out',
  'sweep_reversal',
] as const
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number]

/** What a person reads. Never render a raw category. */
const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  opening_balance: 'Starting balance',
  deposit: 'Check deposited',
  agent_payout: 'Paid an agent',
  external_payout: 'Paid another brokerage',
  sweep: 'Moved to our income account',
  bill: 'Bill paid',
  transfer_in: 'Money moved in',
  transfer_out: 'Money moved out',
  earmark_release: 'Money set aside, released',
  adjustment_in: 'Correction, money added',
  adjustment_out: 'Correction, money taken out',
  sweep_reversal: 'Moved back from our income account',
}

export function ledgerCategoryLabel(category: string | null | undefined): string {
  const key = String(category || '') as LedgerCategory
  return CATEGORY_LABELS[key] || 'Other'
}

/**
 * Which way a category moves the payouts account balance, from the account's
 * own point of view. A sweep leaves the payouts account even though it stays
 * inside the company, so it reads as money out here, and reversing one brings
 * it back in.
 *
 * 'none' is a deliberate and narrow claim: this row explains something without
 * the account balance changing. Only `earmark_release` qualifies, because an
 * earmark is a reservation held in payout_expenses and was never part of the
 * ledger balance to begin with; releasing it changes what is spoken for, not
 * what is there.
 *
 * Every other category has to be signed. A category that can be written but
 * sums to zero is money that silently vanishes from the balance: the opening
 * balance did exactly that, so the whole ledger opened at zero however much
 * was actually in the account, and a single unsigned 'adjustment' would put a
 * correction on the screen that corrected nothing. Before adding a category
 * here, decide which way it moves the account. If the answer is "either", it
 * is two categories, not one.
 */
const CATEGORY_DIRECTION: Record<LedgerCategory, 'in' | 'out' | 'none'> = {
  opening_balance: 'in',
  deposit: 'in',
  agent_payout: 'out',
  external_payout: 'out',
  sweep: 'out',
  bill: 'out',
  transfer_in: 'in',
  transfer_out: 'out',
  earmark_release: 'none',
  adjustment_in: 'in',
  adjustment_out: 'out',
  sweep_reversal: 'in',
}

export function ledgerDirection(category: string | null | undefined): 'in' | 'out' | 'none' {
  const key = String(category || '') as LedgerCategory
  return CATEGORY_DIRECTION[key] || 'none'
}

/** The entry_type the database expects for a given category. */
const CATEGORY_ENTRY_TYPE: Record<LedgerCategory, LedgerEntryType> = {
  opening_balance: 'transfer',
  deposit: 'income',
  agent_payout: 'expense',
  external_payout: 'expense',
  sweep: 'transfer',
  bill: 'expense',
  transfer_in: 'transfer',
  transfer_out: 'transfer',
  earmark_release: 'transfer',
  adjustment_in: 'transfer',
  adjustment_out: 'transfer',
  sweep_reversal: 'transfer',
}

export function entryTypeForCategory(category: LedgerCategory): LedgerEntryType {
  return CATEGORY_ENTRY_TYPE[category]
}

/**
 * Signed effect on the running balance. Callers summing a ledger must use this
 * rather than the raw amount, because amounts are stored positive.
 */
export function signedAmount(category: string | null | undefined, amount: number): number {
  const dir = ledgerDirection(category)
  if (dir === 'in') return amount
  if (dir === 'out') return -amount
  return 0
}

/**
 * Which account a ledger line belongs to. Only the payouts account exists
 * today; the trust account is the reason the column is there from the start,
 * so adding it later is configuration rather than a migration across every row
 * and every query.
 */
/**
 * Everything dated before this is settled history: the ledger opens at the
 * bank balance rather than reconstructing what came before it.
 *
 * A deliberate cutover constant, not a setting, because moving it would
 * reopen a closed period. It lived under two names in two files
 * (REPORT_FROM_DATE and CUTOVER_DATE) with the same value, which is how two
 * screens come to disagree about where history starts.
 */
export const CUTOVER_DATE = '2026-01-01'

export const LEDGER_ACCOUNTS = ['payouts'] as const
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number]
export const DEFAULT_LEDGER_ACCOUNT: LedgerAccount = 'payouts'

/**
 * Where a check's money landed. Only `payouts` money is in the payouts
 * account, so only `payouts` money can be swept and only `payouts` money
 * belongs in that report's balance.
 */
export const FUNDS_DESTINATIONS = ['payouts', 'income', 'title_direct'] as const
export type FundsDestination = (typeof FUNDS_DESTINATIONS)[number]

const DESTINATION_LABELS: Record<FundsDestination, string> = {
  payouts: 'Payouts account',
  income: 'Income account',
  title_direct: 'Paid direct by title',
}

export function fundsDestinationLabel(d: string | null | undefined): string {
  const key = String(d || 'payouts') as FundsDestination
  return DESTINATION_LABELS[key] || 'Payouts account'
}

/**
 * The three office net states shown on All Payouts. Derived, never stored:
 * a deal with no payouts-destined check never had office net in the payouts
 * account, so it was never sweepable and must not read as Not swept. Without
 * this distinction 906 deals and $1.18m read as money waiting to be moved.
 */
export type OfficeNetState = 'paid_at_closing' | 'not_swept' | 'swept'

export function officeNetState(args: {
  hasPayoutsCheck: boolean
  sweptAt: string | null | undefined
}): OfficeNetState {
  if (!args.hasPayoutsCheck) return 'paid_at_closing'
  return args.sweptAt ? 'swept' : 'not_swept'
}

const OFFICE_NET_STATE_LABELS: Record<OfficeNetState, string> = {
  paid_at_closing: 'Paid at closing',
  not_swept: 'Not swept',
  swept: 'Swept',
}

export function officeNetStateLabel(s: OfficeNetState): string {
  return OFFICE_NET_STATE_LABELS[s]
}
