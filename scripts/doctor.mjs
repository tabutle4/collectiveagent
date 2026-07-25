// Data doctor for Collective Agent.
//
// Most production incidents in this app have been DATA problems, not code
// problems: plan values the payout engine cannot match, commission fields
// holding a sales price, duplicate users, drifted stored math. Code tests
// cannot catch those - this script checks the live database for them.
//
// Run from Codespaces (needs the same .env.local the app uses):
//   npm run doctor
//
// Read-only: this script never writes anything. Exit code 1 when any ALERT
// is found so it can gate a deploy; INFO findings never fail the run.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

// Load .env.local / .env the way Next does, without adding a dependency.
for (const file of ['../.env.local', '../.env', '../.env.development.local']) {
  try {
    const env = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch { /* fine - env may come from the shell */ }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run from the repo root where .env.local lives)')
  process.exit(2)
}
const db = createClient(url, key)

// Paged fetch - never trust a single .select() beyond 1000 rows.
async function all(table, select, filter) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).order('id').range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

const alerts = []
const infos = []
const alert = (check, msg) => alerts.push(`[ALERT] ${check}: ${msg}`)
const info = (check, msg) => infos.push(`[info] ${check}: ${msg}`)
const money = n => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`

const plans = await all('commission_plans', 'code, name, is_active')
const planMatch = v => {
  if (!v) return true // empty is allowed; the cascade uses defaults
  const lc = String(v).toLowerCase()
  if (plans.some(p => String(p.code || '').toLowerCase() === lc || String(p.name || '').toLowerCase() === lc)) return true
  const m = String(v).match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  return !!(m && parseInt(m[1]) + parseInt(m[2]) === 100)
}

// ── 1. Plan values the payout engine cannot match ─────────────────────────
const users = await all('users', 'id, first_name, last_name, is_active, role, commission_plan, lease_commission_plan, qualifying_transaction_count, qualifying_transaction_target')
const activeAgents = users.filter(u => u.is_active !== false)
for (const u of activeAgents) {
  if (!planMatch(u.commission_plan)) {
    alert('plan-codes', `${u.first_name} ${u.last_name}: commission_plan "${u.commission_plan}" matches no plan and no custom split - deals will compute at the 85/15 default`)
  }
  if (u.lease_commission_plan && !planMatch(u.lease_commission_plan)) {
    alert('plan-codes', `${u.first_name} ${u.last_name}: lease_commission_plan "${u.lease_commission_plan}" matches no plan and no custom split`)
  }
}

// ── 2. Duplicate users (the fake-Courtney / double-A'Imee class) ──────────
const byName = new Map()
for (const u of activeAgents) {
  const k = `${(u.first_name || '').toLowerCase().replace(/[^a-z]/g, '')}|${(u.last_name || '').toLowerCase().replace(/[^a-z]/g, '')}`
  if (!k.replace(/\|/g, '')) continue
  byName.set(k, (byName.get(k) || []).concat(u))
}
for (const [, list] of byName) {
  if (list.length > 1) {
    alert('duplicate-users', `${list.length} active users named "${list[0].first_name} ${list[0].last_name}" (${list.map(u => u.id.slice(0, 8)).join(', ')})`)
  }
}

// ── 3. Commission that is really a sales price (the July import bug) ──────
const txns = await all(
  'transactions',
  'id, property_address, status, transaction_type, sales_price, monthly_rent, gross_commission, closing_date, move_in_date'
)
for (const t of txns) {
  const price = parseFloat(t.sales_price || 0)
  const gross = parseFloat(t.gross_commission || 0)
  if (price > 10000 && gross > 0.25 * price && String(t.status) !== 'cancelled') {
    alert('gross-vs-price', `${t.property_address || t.id}: gross_commission ${money(gross)} is more than 25% of sales price ${money(price)} - commission field may hold the price`)
  }
}

// ── 4. Closed sales without dates / leases without move-in ────────────────
const isLease = t => /tenant|landlord|lease|apartment|rent/i.test(String(t.transaction_type || ''))
for (const t of txns) {
  if (String(t.status) === 'closed' && !isLease(t) && !t.closing_date) {
    alert('missing-dates', `${t.property_address || t.id}: closed sale with no closing_date - invisible to the quarterly report`)
  }
  if (String(t.status) !== 'cancelled' && isLease(t) && !t.move_in_date && !t.closing_date) {
    info('missing-dates', `${t.property_address || t.id}: lease with no move-in or closing date`)
  }
}

// ── 5. Stored math vs canonical formula ───────────────────────────────────
const tias = await all(
  'transaction_internal_agents',
  'id, transaction_id, agent_id, agent_role, side, payment_status, uses_canonical_math, agent_gross, btsa_amount, processing_fee, coaching_fee, other_fees, rebate_amount, credits_applied, debts_deducted, amount_1099_reportable, agent_net, units, sales_volume'
)
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
let driftCount = 0
for (const r of tias) {
  if (!r.uses_canonical_math || r.payment_status === 'paid') continue
  const a1099 = Math.round((num(r.agent_gross) + num(r.btsa_amount) - num(r.processing_fee) - num(r.coaching_fee) - num(r.other_fees) - num(r.rebate_amount) + num(r.credits_applied)) * 100) / 100
  const net = Math.round((a1099 - num(r.debts_deducted)) * 100) / 100
  if (Math.abs(a1099 - num(r.amount_1099_reportable)) > 0.02 || Math.abs(net - num(r.agent_net)) > 0.02) {
    driftCount++
    if (driftCount <= 10) {
      alert('math-drift', `row ${r.id.slice(0, 8)} (txn ${String(r.transaction_id).slice(0, 8)}): stored 1099 ${money(num(r.amount_1099_reportable))} / net ${money(num(r.agent_net))} vs formula ${money(a1099)} / ${money(net)}`)
    }
  }
}
if (driftCount > 10) alert('math-drift', `...and ${driftCount - 10} more drifted rows (showing first 10)`)

// ── 6. Production rows missing a side tag (office-net pass-through bug) ───
const noSide = tias.filter(r => ['primary_agent', 'listing_agent'].includes(r.agent_role) && !r.side)
if (noSide.length) {
  alert('missing-side', `${noSide.length} production commission rows have no side tag - office_net treats their side as pass-through income (txns: ${[...new Set(noSide.map(r => String(r.transaction_id).slice(0, 8)))].slice(0, 8).join(', ')}...)`)
}

// ── 7. New Agent Plan graduations due. The official counter is
//      users.qualifying_transaction_count - Mark Paid increments it for
//      qualifying closed SALES only, and the office's "counts toward"
//      checkbox can exclude a deal. That checkbox decision is final, so the
//      stored counter is the truth, not a re-count of rows.
for (const u of activeAgents) {
  const code = String(u.commission_plan || '').toLowerCase()
  const target = Number(u.qualifying_transaction_target ?? 5) || 5
  const count = Number(u.qualifying_transaction_count ?? 0) || 0
  if ((code === '70_30_new' || code.includes('new agent')) && count >= target) {
    info('graduations', `${u.first_name} ${u.last_name} has ${count} of ${target} qualifying sales on the New Agent Plan - due to pick Cap or No Cap`)
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`\nCollective Agent data doctor - ${txns.length} transactions, ${tias.length} commission rows, ${activeAgents.length} active users\n`)
for (const a of alerts) console.log(a)
if (!alerts.length) console.log('No alerts. Data invariants hold.')
if (infos.length) {
  console.log('')
  for (const i of infos) console.log(i)
}
console.log(`\n${alerts.length} alert(s), ${infos.length} info finding(s).`)
process.exit(alerts.length ? 1 : 0)
