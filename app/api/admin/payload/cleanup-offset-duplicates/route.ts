import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  isStagedCommissionOffset,
  isCommissionOffsetReversal,
  isCommissionOffsetItem,
} from '@/lib/payload/commissionOffsetItems'
// The paging walk moved to a shared module when the autopay sweep needed the
// same one. Moved verbatim; aliased here so every call site below is unchanged.
import {
  listAgentInvoices as fetchInvoices,
  sleep,
  PAUSE_MS,
} from '@/lib/payload/agentInvoiceList'

// 100 users carry a Payload customer ID as of Sept 2 2026, and all 100 are
// scanned - the query filters on payload_payee_id only, with no status filter.
// Of those 100: 96 have status = 'active', 84 have is_active = true, and 12
// have one but not the other, which is why neither flag is used to narrow the
// set. Inactive and departed agents are deliberately INCLUDED: their invoices
// were doubled by the same bug and their invoice history should still be
// correct.
//
// One list call per page per user, plus a delete per stray line item,
// sequential with a short pause. Heaviest agent on record carries 36 invoice
// payment links, so one page per agent is the norm. Well inside 300s. Manual
// one-time repair, not a schedule.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const PAYLOAD_API = 'https://api.payload.com'

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * One-time repair for Payload invoices inflated by the old unstage path.
 *
 * Until the debtoffsetduplication fix, unstaging a staged debt reversed the
 * commission offset by appending a POSITIVE charge line item rather than
 * removing the offset. A $50 fee staged then unstaged left the invoice holding
 * $50 of real charge, a -$50 offset, and a +$50 reversal: balance due correct,
 * gross charges doubled. Every further cycle added another pair.
 *
 * The shipped fix stops it happening and self-heals any invoice that gets
 * staged again, but an invoice nobody touches again stays inflated inside
 * Payload's own dashboard and on any invoice emailed from Payload. This route
 * repairs those.
 *
 * GET  = dry run. Reports what it would delete. Changes nothing.
 * POST = performs the deletions.
 *
 * ── The pairing rule, which is the whole safety argument ───────────────────
 *
 * Line items are deleted only in MATCHED PAIRS: one reversal (+X) together
 * with one offset (-X) of the same magnitude. Deleting a +X and a -X together
 * moves amount_due by exactly zero, so an invoice's balance is never changed
 * by this repair - only its gross charges come back down to what was really
 * billed.
 *
 * The OFFSET is deleted before its reversal, deliberately. Both orders end in
 * the same place, but they fail differently if the second DELETE does not go
 * through. Offset first leaves the balance temporarily too HIGH, which an
 * agent queries. Reversal first would leave it too LOW - an invoice reading
 * fully settled that the agent still owes, which nobody notices and which
 * quietly stops the fee being billed at all.
 *
 * A staged offset is identified by type AND an exact description, never type
 * alone: the Mark Paid modal's "Commission Offset" method writes the same
 * type string, and deleting one of those would erase a real payment the
 * office had recorded. See lib/payload/commissionOffsetItems.ts.
 *
 * Each stage writes one offset and each unstage writes one reversal, so an
 * invoice has either an equal number of each (currently unstaged) or exactly
 * one offset more (currently staged, and that surviving offset is what keeps
 * the balance at zero). Pairing therefore always leaves the correct live state
 * behind, whichever it is.
 *
 * Anything that does not pair cleanly - a reversal with no equal-magnitude
 * offset, most likely because the invoice balance changed between cycles - is
 * LEFT ALONE and reported for manual review. amount_due is re-read after every
 * invoice and any drift is reported, so a wrong assumption surfaces as a
 * flagged row rather than as a silently wrong balance.
 *
 * Rate limiting: Payload publishes no numeric limit, only a documented 429
 * (https://docs.payload.com/apis/api-design/), so calls are sequential with a
 * small pause and a 429 stops the run rather than hammering. Re-running is
 * safe: a repaired invoice has no reversals left and is skipped.
 */


interface PlannedDeletion {
  reversal_id: string
  offset_id: string
  amount: number
}

interface InvoiceFinding {
  invoice_id: string
  agent_id: string
  agent_name: string
  description: string
  amount_due_before: number
  real_charges: number
  gross_charges_before: number
  planned: PlannedDeletion[]
  unpaired_reversals: { id: string; amount: number }[]
  surviving_offsets: number
  // Populated on POST only.
  deleted?: number
  delete_failures?: number
  amount_due_after?: number
  balance_drifted?: boolean
  error?: string
}

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Work out which line items to remove on one invoice, without touching
 * anything. Returns null when the invoice is already clean.
 */
function planInvoice(inv: any): Omit<InvoiceFinding, 'agent_id' | 'agent_name'> | null {
  const items = (inv?.items || []) as any[]
  const reversals = items.filter(i => isCommissionOffsetReversal(i) && i?.id)
  if (reversals.length === 0) return null

  // Staged offsets only. A settlement recorded through the Mark Paid modal
  // with method "Commission Offset" shares the type string and is excluded by
  // its description, so it is never a deletion candidate.
  const offsets = items.filter(i => isStagedCommissionOffset(i) && i?.id)
  const availableOffsets = [...offsets]
  const planned: PlannedDeletion[] = []
  const unpaired: { id: string; amount: number }[] = []

  for (const rev of reversals) {
    const revAmount = num(rev.amount)
    // Match on magnitude to the cent. The offset is stored negative.
    const idx = availableOffsets.findIndex(
      o => Math.abs(Math.abs(num(o.amount)) - Math.abs(revAmount)) < 0.005
    )
    if (idx === -1) {
      unpaired.push({ id: String(rev.id), amount: revAmount })
      continue
    }
    const [offset] = availableOffsets.splice(idx, 1)
    planned.push({
      reversal_id: String(rev.id),
      offset_id: String(offset.id),
      amount: Math.abs(revAmount),
    })
  }

  const realCharges = items.reduce((sum, i) => {
    if (isCommissionOffsetItem(i)) return sum
    const amt = num(i?.amount)
    return amt > 0 ? sum + amt : sum
  }, 0)
  const grossBefore = items.reduce((sum, i) => {
    const amt = num(i?.amount)
    return amt > 0 ? sum + amt : sum
  }, 0)

  return {
    invoice_id: String(inv.id),
    description: String(inv.description || inv.items?.[0]?.type || 'Invoice'),
    amount_due_before: num(inv.amount_due),
    real_charges: realCharges,
    gross_charges_before: grossBefore,
    planned,
    unpaired_reversals: unpaired,
    surviving_offsets: availableOffsets.length,
  }
}

async function fetchAmountDue(invoiceId: string): Promise<number | null> {
  try {
    const res = await fetch(`${PAYLOAD_API}/invoices/${invoiceId}?fields[]=amount_due`, {
      headers: { Authorization: authHeader() },
    })
    if (!res.ok) return null
    const inv = await res.json()
    return num(inv?.amount_due)
  } catch {
    return null
  }
}

async function run(execute: boolean) {
  const { data: agents, error: agentsError } = await supabaseAdmin
    .from('users')
    .select('id, payload_payee_id, first_name, last_name, preferred_first_name, preferred_last_name')
    .not('payload_payee_id', 'is', null)
    .order('first_name')

  // Do not swallow this. An empty list from a failed query would otherwise be
  // reported as a clean "nothing to fix", which reads as reassurance.
  if (agentsError) throw new Error(`Could not load the agent list: ${agentsError.message}`)

  const findings: InvoiceFinding[] = []
  const incompleteAgents: string[] = []
  let agentsScanned = 0
  let invoicesScanned = 0
  let stoppedEarly: string | null = null

  for (const agent of agents || []) {
    if (stoppedEarly) break
    const name = `${agent.preferred_first_name || agent.first_name || ''} ${
      agent.preferred_last_name || agent.last_name || ''
    }`.trim()

    const { values, rateLimited, incomplete, reason } = await fetchInvoices(
      agent.payload_payee_id as string
    )
    if (rateLimited) {
      stoppedEarly = 'Payload returned 429 (too many requests). Stopped to avoid hammering the API. Re-run in a few minutes to continue where this left off.'
      break
    }
    if (incomplete) incompleteAgents.push(`${name} (${reason})`)
    agentsScanned += 1
    invoicesScanned += values.length

    for (const inv of values) {
      const plan = planInvoice(inv)
      if (!plan) continue

      const finding: InvoiceFinding = { ...plan, agent_id: agent.id, agent_name: name }

      if (execute && plan.planned.length > 0) {
        let deleted = 0
        let failures = 0
        for (const pair of plan.planned) {
          // Offset BEFORE reversal. See the module comment: if the second
          // DELETE fails, this order leaves the balance too high (visible,
          // an agent asks) rather than too low (an invoice reading settled
          // that the agent still owes, which nobody notices).
          for (const lineItemId of [pair.offset_id, pair.reversal_id]) {
            try {
              const res = await fetch(`${PAYLOAD_API}/line_items/${lineItemId}`, {
                method: 'DELETE',
                headers: { Authorization: authHeader() },
              })
              if (res.status === 429) {
                stoppedEarly = 'Payload returned 429 (too many requests) partway through. Stopped. Re-run to finish - already repaired invoices are skipped.'
                failures += 1
                break
              }
              if (res.ok) deleted += 1
              else {
                failures += 1
                finding.error = await res.text().catch(() => `HTTP ${res.status}`)
              }
            } catch (err) {
              failures += 1
              finding.error = String(err)
            }
            await sleep(PAUSE_MS)
          }
          if (stoppedEarly) break
        }
        finding.deleted = deleted
        finding.delete_failures = failures

        // Prove the balance did not move. A pair is +X and -X, so amount_due
        // must be identical afterwards. Anything else is reported, not hidden.
        const after = await fetchAmountDue(plan.invoice_id)
        finding.amount_due_after = after ?? undefined
        finding.balance_drifted =
          after !== null && Math.abs(after - plan.amount_due_before) >= 0.005
      }

      findings.push(finding)
      if (stoppedEarly) break
    }

    await sleep(PAUSE_MS)
  }

  const totalPairs = findings.reduce((s, f) => s + f.planned.length, 0)
  const inflatedBy = findings.reduce(
    (s, f) => s + f.planned.reduce((t, p) => t + p.amount, 0),
    0
  )

  return {
    mode: execute ? 'executed' : 'dry_run',
    agents_scanned: agentsScanned,
    agents_total: (agents || []).length,
    invoices_scanned: invoicesScanned,
    invoices_affected: findings.length,
    pairs_to_delete: totalPairs,
    line_items_to_delete: totalPairs * 2,
    total_inflation: Math.round(inflatedBy * 100) / 100,
    drifted: findings.filter(f => f.balance_drifted).length,
    needs_manual_review: findings.filter(f => f.unpaired_reversals.length > 0).length,
    stopped_early: stoppedEarly,
    // Non-empty means at least one agent's invoice list could not be read in
    // full - an HTTP error, an unrecognised customer_id, or more invoices than
    // the page loop walks. Their totals are incomplete, so the run is not a
    // clean bill of health for those agents whatever else it says.
    incomplete_agents: incompleteAgents,
    findings,
  }
}

// Dry run. Reads only, changes nothing in Payload or Supabase.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_agent_debts')
  if (auth.error) return auth.error

  try {
    return NextResponse.json(await run(false))
  } catch (error: any) {
    console.error('cleanup-offset-duplicates dry run failed', error)
    return NextResponse.json({ error: error.message || 'Scan failed' }, { status: 500 })
  }
}

// Performs the deletions.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const result = await run(true)
    console.log(
      'cleanup-offset-duplicates executed by',
      auth.user.email,
      JSON.stringify({
        invoices_affected: result.invoices_affected,
        line_items_to_delete: result.line_items_to_delete,
        drifted: result.drifted,
      })
    )
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('cleanup-offset-duplicates failed', error)
    return NextResponse.json({ error: error.message || 'Cleanup failed' }, { status: 500 })
  }
}
