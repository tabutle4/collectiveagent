import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  listAgentInvoices,
  isMonthlyFeeInvoice,
  sleep,
  PAUSE_MS,
} from '@/lib/payload/agentInvoiceList'

// One list call per page per agent, plus one PUT and one read-back per invoice
// changed. Around 100 agents carry a Payload customer id and one page each is
// the norm. Manual one-time repair, not a schedule. Matches the 300 the offset
// cleanup and the other long routes use.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const PAYLOAD_API = 'https://api.payload.com'

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * One-time repair: take automatic collection off every open agent invoice that
 * is not a monthly brokerage fee.
 *
 * ## Why this is needed
 *
 * Payload charges a customer's default payment method against ANY open invoice
 * on its due date, not just the one the agent had in mind. Each invoice carries
 * its own `autopay_allowed` switch, and **Payload's default is on** - confirmed
 * in the dashboard on 15 September 2026, where pre-existing custom invoices (an
 * E&O Recovery and an MLS fee) both offered "Disable Auto-payments", meaning
 * collection was permitted on them.
 *
 * Invoices created after the autopay work shipped set the flag explicitly:
 * monthly fees allow it, onboarding and custom invoices do not. Everything
 * older carries the default, so every unpaid MLS fee, eCommission balance and
 * E&O recovery is collectable the moment that agent turns autopay on.
 *
 * This closes the backlog. New invoices are already handled at creation.
 *
 * ## Scope
 *
 * Agents only. The list comes from `users.payload_payee_id`, so tenant and
 * landlord customers are excluded by construction - PM bills different Payload
 * customers entirely and is deliberately out of scope.
 *
 * Inactive and departed agents are INCLUDED. Their unpaid invoices are the ones
 * most likely to be old, and a departed agent with a saved card is no less
 * exposed.
 *
 * Changed:    open (amount_due > 0), no Monthly Fee line item, not already off.
 * Left alone: monthly fees (autopay is the point of them), anything settled,
 *             anything already explicitly exempt.
 *
 * ## Why this write is safe
 *
 * It sends `PUT /invoices/{id}` carrying only `autopay_allowed`. An earlier
 * version of this work refused to do that, on the reading that Payload's
 * "Deleting an Existing Nested Object" note meant a partial update strips
 * omitted line items. **That was tested against live Payload on 15 September
 * 2026 and is wrong**: a partial PUT carrying only `due_date`, which
 * app/api/payload/update-invoice-due-date has been doing in production all
 * along, leaves the line items intact.
 *
 * The body is JSON so `false` is a real boolean rather than a string Payload
 * might read as truthy. https://docs.payload.com/apis/api-design/
 *
 * Every write is read back, and the line item count is compared before and
 * after. That check is the reason this route may write to invoices at all, so
 * it is not optional: if a partial PUT ever does strip items, the run stops on
 * the first one rather than walking the whole agent base.
 *
 * GET  = dry run. Reads only, changes nothing.
 * POST = performs the updates.
 */

interface SweepFinding {
  invoice_id: string
  agent_id: string
  agent_name: string
  description: string
  amount_due: number
  due_date: string | null
  /** Populated on POST only. */
  updated?: boolean
  error?: string
}

const num = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const label = (inv: any) =>
  inv?.description || inv?.items?.[0]?.description || inv?.items?.[0]?.type || 'Invoice'

/** Open, not a monthly fee, and not already exempt. */
const needsSweeping = (inv: any) =>
  num(inv?.amount_due) > 0 && !isMonthlyFeeInvoice(inv) && inv?.autopay_allowed !== false

/** Returns null on success, or a sentence explaining what went wrong. */
async function disableAutopay(inv: any): Promise<string | null> {
  const itemsBefore = (inv?.items || []).length

  const res = await fetch(`${PAYLOAD_API}/invoices/${inv.id}`, {
    method: 'PUT',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ autopay_allowed: false }),
  })
  if (!res.ok) return `PUT failed with HTTP ${res.status}`

  const check = await fetch(`${PAYLOAD_API}/invoices/${inv.id}?fields[]=*&fields[]=items`, {
    headers: { Authorization: authHeader() },
  })
  if (!check.ok) return `Updated, but could not be read back (HTTP ${check.status})`

  const after = await check.json().catch(() => null)
  if (after?.autopay_allowed !== false) return 'Payload did not take the change'

  const itemsAfter = (after?.items || []).length
  if (itemsAfter < itemsBefore) {
    return `LINE ITEMS LOST: had ${itemsBefore}, now ${itemsAfter}. Stop and restore this invoice.`
  }

  return null
}

async function run(execute: boolean) {
  const { data: agents, error: agentsError } = await supabaseAdmin
    .from('users')
    .select('id, payload_payee_id, first_name, last_name, preferred_first_name, preferred_last_name')
    .not('payload_payee_id', 'is', null)
    .order('first_name')

  // Do not swallow this. An empty list from a failed query would be reported as
  // a clean "nothing to fix", which reads as reassurance.
  if (agentsError) throw new Error(`Could not load the agent list: ${agentsError.message}`)

  const findings: SweepFinding[] = []
  const incompleteAgents: string[] = []
  let agentsScanned = 0
  let invoicesScanned = 0
  let stoppedEarly: string | null = null

  for (const agent of agents || []) {
    if (stoppedEarly) break

    const name = `${agent.preferred_first_name || agent.first_name || ''} ${
      agent.preferred_last_name || agent.last_name || ''
    }`.trim()

    const { values, rateLimited, incomplete, reason } = await listAgentInvoices(
      agent.payload_payee_id as string
    )
    if (rateLimited) {
      stoppedEarly =
        'Payload returned 429 (too many requests). Stopped rather than hammering the API. Re-run in a few minutes; invoices already switched off stay off, so a second run picks up where this left off.'
      break
    }
    if (incomplete) incompleteAgents.push(`${name} (${reason})`)
    agentsScanned += 1
    invoicesScanned += values.length

    for (const inv of values) {
      if (!needsSweeping(inv)) continue

      const finding: SweepFinding = {
        invoice_id: inv.id,
        agent_id: agent.id,
        agent_name: name,
        description: label(inv),
        amount_due: num(inv.amount_due),
        due_date: inv.due_date ?? null,
      }

      if (execute) {
        const problem = await disableAutopay(inv)
        finding.updated = problem === null
        if (problem) finding.error = problem
        await sleep(PAUSE_MS)

        // A lost line item means the safety assumption behind this whole route
        // is wrong. Stop rather than doing it to anyone else.
        if (problem?.startsWith('LINE ITEMS LOST')) {
          findings.push(finding)
          stoppedEarly = `Stopped on invoice ${inv.id}: ${problem} No further invoices were touched.`
          break
        }
      }

      findings.push(finding)
    }

    await sleep(PAUSE_MS)
  }

  const exposedTotal = findings.reduce((s, f) => s + f.amount_due, 0)

  return {
    mode: execute ? 'executed' : 'dry_run',
    agents_scanned: agentsScanned,
    agents_total: (agents || []).length,
    invoices_scanned: invoicesScanned,
    invoices_to_change: findings.length,
    updated: findings.filter(f => f.updated === true).length,
    failed: findings.filter(f => f.error).length,
    total_exposed: Math.round(exposedTotal * 100) / 100,
    stopped_early: stoppedEarly,
    // Non-empty means at least one agent's invoice list could not be read in
    // full. Their totals are incomplete, so this run is not a clean bill of
    // health for those agents whatever else it says.
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
    console.error('autopay-sweep dry run failed', error)
    return NextResponse.json({ error: error.message || 'Scan failed' }, { status: 500 })
  }
}

// Performs the updates.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const result = await run(true)
    console.log(
      'autopay-sweep executed by',
      auth.user.email,
      JSON.stringify({
        invoices_to_change: result.invoices_to_change,
        updated: result.updated,
        failed: result.failed,
        stopped_early: result.stopped_early,
      })
    )
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('autopay-sweep failed', error)
    return NextResponse.json({ error: error.message || 'Sweep failed' }, { status: 500 })
  }
}
