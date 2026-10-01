/**
 * What is wrong with the deals on the quarterly report.
 *
 * The quarterly report is presented to the office and to the broker, and until
 * now nothing checked the deals behind it. The numbers were taken on trust.
 * They should not have been: a survey on 2026-09-29 found $357,205 of lease
 * volume missing from twelve deals that were counting for a fraction of what
 * they earned, and 38 agent rows whose stored 1099 figure cannot be reproduced
 * from their own fields.
 *
 * Every rule here is written against a real fault found in live data, with the
 * count it fired on that day recorded beside it. A check that has never fired
 * is marked as such. See claude/quarterly-report-data-gaps-sep29-2026.md.
 *
 * THE DEAL SET IS NOT DECIDED HERE. Which deals belong to a quarter is
 * lib/reporting/production.ts, the same module the quarterly report and the
 * dashboard charts use. This file is handed that set and only inspects it.
 * Re-deriving qualification here is how this report would drift away from the
 * report it exists to check, which is the one thing it must never do.
 *
 * Nothing in this file touches the database, matching production.ts, so the
 * page can import the labels without pulling the server in.
 */

import { canonicalAddressKey } from '@/lib/transactions/addressKey'
import { computeCommission } from '@/lib/transactions/math'
import { MATH_TOLERANCE } from '@/lib/transactions/funding'
import { PRODUCTION_ROLES, productionDate } from '@/lib/reporting/production'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

/** How far apart two deals at one address can sit and still look like one deal. */
export const DUPLICATE_DAY_WINDOW = 14


export type FlagKey =
  | 'lease_volume'
  | 'missing_figure'
  | 'checklist_not_run'
  | 'wrong_checklist'
  | 'no_execution_date'
  | 'duplicate_deal'
  | 'commission_mismatch'
  | 'office_gross_mismatch'
  | 'gross_commission_mismatch'
  | 'agent_net_over_intake'

export const FLAG_ORDER: FlagKey[] = [
  'lease_volume',
  'missing_figure',
  'agent_net_over_intake',
  'gross_commission_mismatch',
  'office_gross_mismatch',
  'commission_mismatch',
  'duplicate_deal',
  'no_execution_date',
  'checklist_not_run',
  'wrong_checklist',
]

export const FLAG_LABELS: Record<FlagKey, string> = {
  lease_volume: 'Lease volume looks wrong',
  missing_figure: 'Volume or units missing',
  commission_mismatch: 'Commission does not add up',
  duplicate_deal: 'Possible duplicate deal',
  no_execution_date: 'No execution date',
  checklist_not_run: 'Checklist not run',
  wrong_checklist: 'Wrong checklist run',
  office_gross_mismatch: 'Office gross does not match the sides',
  gross_commission_mismatch: 'Gross commission is missing its BTSA',
  agent_net_over_intake: 'Paid out more than the deal brought in',
}

/** One plain sentence per flag, shown under the filter bar. */
export const FLAG_HELP: Record<FlagKey, string> = {
  lease_volume:
    'The volume on this lease is not the monthly rent times the lease term, which is how almost every other lease is worked out.',
  missing_figure: 'A production row on this deal has no volume, or no units.',
  commission_mismatch:
    "The 1099 amount stored on an agent row is not what the commission formula produces from that row's own figures.",
  duplicate_deal:
    'Another deal that is not cancelled sits at the same address and unit within two weeks of this one. A unit typed into the address line instead of the unit field still matches.',
  no_execution_date:
    'This sale has no execution date, so team credit and the commission split both fall back to the closing date without saying so.',
  checklist_not_run:
    'The checklist for this kind of deal is not finished. CDA Checklist for a sale, Commission Check Processing for a lease.',
  wrong_checklist:
    'The checklist belonging to the other kind of deal has been started on this one.',
  office_gross_mismatch:
    'The office gross stored on this deal is not the two side commissions added together.',
  gross_commission_mismatch:
    'Gross commission should be the office gross plus the BTSA on the deal, and it is not. Usually means the compliance form wrote one side and the recalculation never ran because the deal was already closed.',
  agent_net_over_intake:
    'The agents on this deal were paid more in total than the deal brought in. This one should never fire.',
}

/**
 * Which checklist belongs to which kind of deal. CDA Checklist for a sale,
 * Commission Check Processing for a lease - Tara, 2026-09-29.
 *
 * Keyed on checklist_templates.applies_to rather than the display name.
 * Matching on the name meant an admin renaming a template in the UI would make
 * the lookup miss, the item total read zero, the guard below short-circuit,
 * and the flag disappear with no error and no log. A report built to catch
 * silent faults must not have one of its own. applies_to is the column the
 * template already carries for exactly this question ('sale' / 'lease').
 */
export const SALE_TEMPLATE_KEY = 'sale'
export const LEASE_TEMPLATE_KEY = 'lease'

/** Display names, for the sentence on the row. */
export const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  sale: 'CDA Checklist',
  lease: 'Commission Check Processing',
}

export interface ReconTransaction {
  id: string
  office_gross?: number | string | null
  gross_commission?: number | string | null
  listing_side_commission?: number | string | null
  buying_side_commission?: number | string | null
  property_address?: string | null
  unit?: string | null
  transaction_type?: string | null
  status?: string | null
  sales_price?: number | string | null
  monthly_rent?: number | string | null
  lease_term?: number | string | null
  acceptance_date?: string | null
  move_in_date?: string | null
  closing_date?: string | null
}

export interface ReconAgentRow {
  id?: string | null
  transaction_id: string
  agent_id: string
  agent_role?: string | null
  installment_kind?: string | null
  sales_volume?: number | string | null
  units?: number | string | null
  agent_gross?: number | string | null
  btsa_amount?: number | string | null
  processing_fee?: number | string | null
  coaching_fee?: number | string | null
  other_fees?: number | string | null
  rebate_amount?: number | string | null
  debts_deducted?: number | string | null
  amount_1099_reportable?: number | string | null
  agent_net?: number | string | null
  agent?: any
}

/** Completion counts per deal per template, already filtered to active items. */
export interface ChecklistProgress {
  /** transaction_id -> template name -> items completed */
  done: Record<string, Record<string, number>>
  /** template name -> active item count */
  totals: Record<string, number>
}

export interface ReconFlag {
  key: FlagKey
  /** What is wrong on THIS deal, with its figures in it. */
  detail: string
}

export interface ReconRow {
  transaction_id: string
  property_address: string
  unit: string | null
  is_lease: boolean
  production_date: string | null
  /**
   * Everyone who holds a row on this deal, in any role, retainers included.
   *
   * Not production roles only. Agent net is a quarterly figure and it is paid
   * to every role - team leads alone hold 219 rows app-wide and submit almost
   * none of them, so a production-only list made a lead invisible on the deals
   * they earn from. Tara, 2026-09-30: the reconciliation report is about
   * whoever gets money on the deal.
   */
  agents: { id: string; name: string; roles: string[] }[]
  volume: number
  units: number
  /** Across every payee row, the way the quarterly report sums it. */
  agentNet: number
  /** That deal's team at its governing date, or null. */
  teamId: string | null
  teamName: string | null
  /** Imported from Brokermint with no side breakdown - money checks skip it. */
  legacyImport: boolean
  flags: ReconFlag[]
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

export function money(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Address key for duplicate matching.
 *
 * Delegates to lib/transactions/addressKey.ts, which is the app's only address
 * matcher and says so: three separate ones existed before and disagreed, which
 * is how one property ended up with two transactions. A naive strip-the-
 * punctuation key written here would have been a fourth, and a weaker one -
 * measured across all 1,233 non-cancelled deals it finds 10 same-property pairs
 * where the canonical key finds 21, missing "Grove Lane" against "Grove Ln" and
 * "Texas" against "TX". A duplicate check that silently finds nothing is worse
 * than none.
 *
 * The unit is appended before keying because two apartments in one building are
 * two deals, not one (Tara, 2026-09-29). The canonical key keeps unit and zip
 * tokens, so they still do not collapse into each other.
 */
export function addressKey(txn: ReconTransaction): string {
  const parts = [txn.property_address, txn.unit].filter(Boolean).join(' ')
  return canonicalAddressKey(parts)
}

function dayGap(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ms = Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')
  if (!Number.isFinite(ms)) return null
  return Math.abs(Math.round(ms / 86400000))
}

/**
 * Every fault on one deal.
 *
 * `productionDateOf` is passed in rather than imported so this file cannot
 * accidentally hold a second opinion about which date files a deal.
 */
export function flagsForDeal(args: {
  txn: ReconTransaction
  rows: ReconAgentRow[]
  productionDate: string | null
  checklists: ChecklistProgress
  /** Non-cancelled deals sharing this address key, this one excluded. */
  addressTwins: { id: string; production_date: string | null }[]
  /**
   * Credit applied per agent row id. Mark Paid folds a credit into the stored
   * 1099 figure but there is no credits column on the row, so recomputing
   * without it reports a mismatch that is not one. See the commission check.
   */
  creditsByRow?: Record<string, number>
}): ReconFlag[] {
  const { txn, rows, productionDate, checklists, addressTwins } = args
  const creditsByRow = args.creditsByRow || {}
  const flags: ReconFlag[] = []
  const isLease = isLeaseTransactionType(txn.transaction_type)

  // Production rows only. Retainer and installment rows carry zero volume and
  // zero units by construction, so measuring them finds faults that are not
  // there - it is what made an earlier pass report a duplicate on
  // 7711 Longmire Road that was never a duplicate.
  const production = rows.filter(
    r => !r.installment_kind && PRODUCTION_ROLES.includes(String(r.agent_role || ''))
  )

  // 1. Lease volume against rent x term. 12 deals, $357,205 missing, 2026-09-29.
  if (isLease) {
    const rent = num(txn.monthly_rent)
    const term = num(txn.lease_term)
    if (rent > 0 && term > 0) {
      const expected = rent * term
      for (const r of production) {
        if (r.sales_volume === null || r.sales_volume === undefined) continue
        const actual = num(r.sales_volume)
        if (Math.abs(actual - expected) <= MATH_TOLERANCE) continue
        const oneMonth = Math.abs(actual - rent) <= MATH_TOLERANCE && term > 1
        flags.push({
          key: 'lease_volume',
          detail: oneMonth
            ? `Recorded ${money(actual)}, which is one month of rent. ${money(rent)} x ${term} months is ${money(expected)}, so ${money(expected - actual)} is missing.`
            : `Recorded ${money(actual)} against ${money(rent)} x ${term} months, which is ${money(expected)}.`,
        })
        break
      }
    }
  }

  // 2. A production row with nothing in it. 4 rows, 2026-09-29.
  // A NULL units column is a legacy row that productionUnits() counts as 1, so
  // flagging it here would have the same deal read "1 unit" in its summary and
  // "1 with no units" in its flag. Only an explicit zero is a fault.
  const blankVolume = production.filter(
    r => r.sales_volume === null || r.sales_volume === undefined || num(r.sales_volume) === 0
  ).length
  const blankUnits = production.filter(r => r.units != null && num(r.units) === 0).length
  if (blankVolume > 0 || blankUnits > 0) {
    const parts: string[] = []
    if (blankVolume > 0) parts.push(`${blankVolume} with no volume`)
    if (blankUnits > 0) parts.push(`${blankUnits} with no units`)
    flags.push({
      key: 'missing_figure',
      detail: `Production rows ${parts.join(' and ')}. The deal counts for less than it earned.`,
    })
  }

  // 3. Stored 1099 against the canonical formula. This says the row does not
  //    agree with itself. It does NOT say which figure is right, and nothing
  //    here rewrites one.
  //
  //    Every payee row, not just the two production roles. The row above shows
  //    agent net for everyone who gets money on the deal, which is what Tara
  //    asked for, so checking only primary and listing agents left the other
  //    four roles shown but unchecked - 17 rows and $5,928.33 of real
  //    disagreement across team leads, momentum partners and referral agents on
  //    the 2026 report. Installment and retainer rows are still excluded: they
  //    are scheduled payments, not a commission calculation.
  for (const r of rows) {
    if (r.installment_kind) continue
    if (r.amount_1099_reportable === null || r.amount_1099_reportable === undefined) continue
    if (r.agent_gross === null || r.agent_gross === undefined) continue
    const { amount_1099 } = computeCommission({
      agent_gross: r.agent_gross,
      btsa_amount: r.btsa_amount,
      processing_fee: r.processing_fee,
      coaching_fee: r.coaching_fee,
      other_fees: r.other_fees,
      rebate_amount: r.rebate_amount,
      credits_applied: r.id ? creditsByRow[r.id] || 0 : 0,
      debts_deducted: r.debts_deducted,
    })
    const stored = num(r.amount_1099_reportable)
    if (Math.abs(stored - amount_1099) <= 0.01) continue
    flags.push({
      key: 'commission_mismatch',
      detail: `Stored 1099 is ${money(stored)}, the formula gives ${money(amount_1099)} from this row's own figures. Open the deal and decide which is right before changing anything.`,
    })
    break
  }

  // 4. Another live deal at the same address. Fires on nothing today: every
  //    near match found on 2026-09-29 was a duplicate that had been cancelled
  //    the same day, which is the office catching it. Cancelled twins are
  //    excluded by the caller for that reason.
  const near = addressTwins.filter(t => {
    const gap = dayGap(t.production_date, productionDate)
    return gap !== null && gap <= DUPLICATE_DAY_WINDOW
  })
  if (near.length > 0) {
    flags.push({
      key: 'duplicate_deal',
      detail: `${near.length} other deal${near.length === 1 ? '' : 's'} at this address and unit within ${DUPLICATE_DAY_WINDOW} days, none of them cancelled.`,
    })
  }

  // 5. Sale with no execution date. 8 in Q3, 79 across 2026, 2026-09-29.
  if (!isLease && !txn.acceptance_date) {
    flags.push({
      key: 'no_execution_date',
      detail:
        'No execution date on this sale, so the team credit and the commission split both use the closing date instead without saying so.',
    })
  }

  // 8, 9 and 10. The deal's own money figures.
  //
  // ALL THREE SKIP LEGACY IMPORTS. A deal with both side-commission columns
  // NULL came from Brokermint with office_gross populated and no per-side
  // breakdown, and lib/transactions/cascade.ts refuses to recompute it on
  // purpose - computing 0 + 0 would wipe real commission data. 72 of the 386
  // deals on the 2026 report are in that state. Treating a NULL side as zero
  // is what made an earlier pass of this file report 69 broken deals when 1
  // was broken; the app was told never to touch the other 68.
  const bothSidesNull =
    (txn.listing_side_commission === null || txn.listing_side_commission === undefined) &&
    (txn.buying_side_commission === null || txn.buying_side_commission === undefined)

  if (!bothSidesNull) {
    const officeGross = num(txn.office_gross)
    const sides = num(txn.listing_side_commission) + num(txn.buying_side_commission)
    const btsa = rows.reduce((sum, r) => sum + num(r.btsa_amount), 0)

    // 8. office_gross is defined as the two sides added together
    // (lib/transactions/math.ts, computeGrossFromSides). 1 deal on the 2026
    // report disagrees, and it is swept, so the recompute endpoint refuses it.
    if (txn.office_gross !== null && txn.office_gross !== undefined
        && Math.abs(officeGross - sides) > MATH_TOLERANCE) {
      flags.push({
        key: 'office_gross_mismatch',
        detail: `Office gross is ${money(officeGross)}, the two sides add up to ${money(sides)}.`,
      })
    }

    // 9. gross_commission is office_gross plus the BTSA on the deal. Six deals
    // on the 2026 report disagree and every one is closed AND swept, which is
    // unfixable from inside the app: the cascade skips closed deals and the
    // recompute endpoint skips swept ones. The cause is two writers with two
    // meanings - the compliance form writes one side's base commission, the
    // cascade writes office_gross + BTSA, and on a closed deal the form wins.
    if (txn.gross_commission !== null && txn.gross_commission !== undefined
        && txn.office_gross !== null && txn.office_gross !== undefined) {
      const expected = officeGross + btsa
      const stored = num(txn.gross_commission)
      if (Math.abs(stored - expected) > MATH_TOLERANCE) {
        flags.push({
          key: 'gross_commission_mismatch',
          detail: `Gross commission is ${money(stored)}, office gross plus BTSA is ${money(expected)}, a gap of ${money(stored - expected)}.`,
        })
      }
    }

    // 10. A ceiling, not a formula: the payees cannot take out more than the
    // deal brought in. office_gross is gross of the co-op and excludes BTSA,
    // so the intake is office_gross + BTSA. True on all 386 deals today - if
    // it ever fires, something is badly wrong rather than merely untidy.
    if (txn.office_gross !== null && txn.office_gross !== undefined) {
      const paidOut = rows
        .filter(r => !r.installment_kind)
        .reduce((sum, r) => sum + num(r.agent_net), 0)
      const intake = officeGross + btsa
      if (paidOut > intake + MATH_TOLERANCE) {
        flags.push({
          key: 'agent_net_over_intake',
          detail: `Agents were paid ${money(paidOut)} in total, the deal brought in ${money(intake)}.`,
        })
      }
    }
  }

  // 6 and 7. Checklists, by deal type. CDA for sales, Check Processing for
  //    leases - Tara, 2026-09-29. Scoped this way it is 9 deals in Q3; scoped
  //    as "every template on every deal" it is 92, almost all of them leases
  //    correctly ignoring the sales checklist.
  const mine = isLease ? LEASE_TEMPLATE_KEY : SALE_TEMPLATE_KEY
  const theirs = isLease ? SALE_TEMPLATE_KEY : LEASE_TEMPLATE_KEY
  const mineName = TEMPLATE_DISPLAY_NAMES[mine] || mine
  const theirsName = TEMPLATE_DISPLAY_NAMES[theirs] || theirs
  const doneMine = checklists.done[txn.id]?.[mine] || 0
  const totalMine = checklists.totals[mine] || 0
  const doneTheirs = checklists.done[txn.id]?.[theirs] || 0

  if (totalMine > 0 && doneMine < totalMine) {
    flags.push({
      key: 'checklist_not_run',
      detail:
        doneMine === 0
          ? `${mineName} has not been started. ${totalMine} items outstanding.`
          : `${mineName} is part done, ${doneMine} of ${totalMine} items.`,
    })
  }
  if (doneTheirs > 0) {
    flags.push({
      key: 'wrong_checklist',
      detail: `${theirsName} has ${doneTheirs} item${doneTheirs === 1 ? '' : 's'} ticked, and this is a ${isLease ? 'lease' : 'sale'}.`,
    })
  }

  return flags
}

/** How many deals carry each flag, for the filter bar. */
export function countByFlag(rows: ReconRow[]): Record<FlagKey, number> {
  const counts = {} as Record<FlagKey, number>
  for (const key of FLAG_ORDER) counts[key] = 0
  for (const row of rows) {
    for (const key of new Set(row.flags.map(f => f.key))) counts[key] += 1
  }
  return counts
}

/**
 * Why a deal in the date range did not make the report.
 *
 * A deal wrongly excluded is the error no amount of checking the included rows
 * will ever find, because it is not on the page to check. Reasons mirror
 * countsTowardProduction, in the order it applies them.
 */
export function exclusionReason(
  txn: ReconTransaction,
  opts: { complianceRequested: boolean; today: string }
): string | null {
  if (String(txn.status || '') === 'cancelled') return 'Cancelled'
  const isLease = isLeaseTransactionType(txn.transaction_type)
  // productionDate() rather than a second copy of its rule. The copy that used
  // to live here would not have followed a change to the original, and the
  // symptom would have been a vague sentence rather than an error.
  const date = productionDate(txn)
  if (!date) {
    return isLease ? 'No move-in date entered' : 'No closing date entered'
  }
  if (isLease) {
    if (String(date).split('T')[0] > opts.today) return 'Move-in date has not arrived yet'
    if (!opts.complianceRequested) return 'No compliance request filed on this lease'
    return null
  }
  if (String(txn.status || '') !== 'closed') {
    return `Sale is not closed, status is ${txn.status || 'blank'}`
  }
  return null
}
