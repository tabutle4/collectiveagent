import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows, type FetchAllRowsOptions } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']

// Some contact fields (email, phone) are stored as jsonb and can come back as a
// string, an array of strings, an object, or null. Flatten any of those shapes
// into a single searchable string so the text filter never calls a string
// method on a non-string (which would throw and 500 the whole request).
function flattenSearchable(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(flattenSearchable).join(' ')
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattenSearchable).join(' ')
  return ''
}

// Build several searchable representations of a money value so a user can find
// it however they type it: "1500", "1500.00", "1,500", "1,500.00". The check
// amount is numeric and may arrive as a number or a string from the database.
function amountTokens(value: unknown): string {
  if (value == null || value === '') return ''
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return ''
  const fixed = n.toFixed(2)
  const grouped = n.toLocaleString('en-US')
  const groupedFixed = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return [String(n), fixed, grouped, groupedFixed].join(' ')
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase().trim() || ''
    const status = searchParams.get('status') || ''
    const method = searchParams.get('method') || ''
    const from   = searchParams.get('from') || ''
    const to     = searchParams.get('to') || ''
    const dateField = searchParams.get('date_field') || 'received_date'
    const paidFilter = searchParams.get('paid') || ''

    const userRole = (auth.user.role || '').toLowerCase()
    const isAdmin = ADMIN_ROLES.includes(userRole)

    // Build base query joining transaction and contacts. fetchAllRows pages
    // through in batches of 1000 so search covers the whole table, not just a
    // capped slice. The nested select (the transactions embed) is passed
    // straight through to PostgREST and works the same way under pagination.
    const selectFields = `
        id,
        property_address,
        check_amount,
        brokerage_amount,
        check_number,
        check_from,
        check_image_url,
        check_date,
        received_date,
        deposited_date,
        cleared_date,
        status,
        payment_method,
        agents_paid,
        crc_transferred,
        compliance_complete_date,
        notes,
        transaction_id,
        agent_id,
        transactions (
          id,
          property_address,
          transaction_type,
          status,
          submitted_by,
          transaction_contacts ( id, contact_type, name, email, company ),
          transaction_internal_agents ( id, agent_id, agent_role, payment_status,
            users!transaction_internal_agents_agent_id_fkey (
              id, first_name, last_name, preferred_first_name, preferred_last_name
            )
          )
        )
      `

    // Agent filter: only checks where they are an internal agent on the
    // transaction. Supabase cannot filter on a nested join in one query, so we
    // fetch and filter in JS below.

    // Date range filter
    const allowedDateFields = ['received_date', 'cleared_date', 'deposited_date', 'check_date']
    const safeField = allowedDateFields.includes(dateField) ? dateField : 'received_date'

    const filters: NonNullable<FetchAllRowsOptions['filters']> = []
    if (from) filters.push({ type: 'gte', column: safeField, value: from })
    if (to) filters.push({ type: 'lte', column: safeField, value: to })
    if (status) filters.push({ type: 'eq', column: 'status', value: status })
    if (method) filters.push({ type: 'eq', column: 'payment_method', value: method })

    const rows = await fetchAllRows<any>('checks_received', selectFields, {
      filters,
      orderBy: { column: 'received_date', ascending: false },
    })

    let results = rows || []

    // Self-heal stale check status. The DB trigger derive_check_status only
    // runs on INSERT/UPDATE, so a check saved with a future cleared_date stays
    // 'deposited' even after that date passes. Recompute from dates here so the
    // page is always correct, and write back any corrections so the stored
    // value (read by reports etc.) stays accurate too.
    // Central date, not UTC: matches the trigger and the payouts report so a
    // check clearing tomorrow is not re-stamped 'cleared' during the evening
    // hours when UTC has already rolled to tomorrow.
    const today = getCentralDateString()
    const deriveStatus = (depositedDate: string | null, clearedDate: string | null): string => {
      if (clearedDate && clearedDate <= today) return 'cleared'
      if (depositedDate) return 'deposited'
      return 'received'
    }
    const staleIds: string[] = []
    for (const r of results) {
      const derived = deriveStatus((r as any).deposited_date, (r as any).cleared_date)
      if (derived !== (r as any).status) {
        ;(r as any).status = derived
        if (derived === 'cleared') staleIds.push((r as any).id)
      }
    }
    if (staleIds.length > 0) {
      // Best-effort write-back; never block the response on it.
      supabaseAdmin
        .from('checks_received')
        .update({ status: 'cleared' })
        .in('id', staleIds)
        .then(() => {}, () => {})
    }

    // Agent filter: keep only checks tied to transactions where agent is an internal agent
    if (!isAdmin) {
      results = results.filter(r => {
        const txn = (r as any).transactions
        if (!txn) return false
        const agents = txn.transaction_internal_agents || []
        return agents.some((a: any) => a.agent_id === auth.user.id)
      })
    }

    // Text search across: check_from, check_number, property_address,
    // agent names, contact names/email/company
    if (search) {
      // Drop a leading currency symbol so "$1,500" matches the amount tokens.
      // Commas are left intact so comma-containing addresses still match.
      const searchNorm = search.replace(/\$/g, '')
      results = results.filter(r => {
        const txn = (r as any).transactions
        const contacts: string[] = []

        if (txn) {
          // Contact names/email/company. email is jsonb, so flatten any
          // string/array/object shape before lowercasing.
          for (const c of txn.transaction_contacts || []) {
            const nm = flattenSearchable(c.name)
            const em = flattenSearchable(c.email)
            const co = flattenSearchable(c.company)
            if (nm) contacts.push(nm.toLowerCase())
            if (em) contacts.push(em.toLowerCase())
            if (co) contacts.push(co.toLowerCase())
          }
          // Agent names
          for (const a of txn.transaction_internal_agents || []) {
            const u = a.users
            if (u) {
              const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
              contacts.push(name)
            }
          }
        }

        const haystack = [
          r.check_from || '',
          r.check_number || '',
          r.property_address || '',
          txn?.property_address || '',
          r.notes || '',
          r.status || '',
          r.payment_method || '',
          r.received_date || '',
          r.check_date || '',
          r.deposited_date || '',
          r.cleared_date || '',
          r.compliance_complete_date || '',
          txn?.transaction_type || '',
          amountTokens(r.check_amount),
          amountTokens(r.brokerage_amount),
          ...contacts,
        ].join(' ').toLowerCase()

        return haystack.includes(searchNorm)
      })
    }

    // Compliance is single-sourced from the compliance request page.
    // Derive per transaction and use it in place of the stored per-check
    // compliance_complete_date column.
    const complianceByTxn = await deriveComplianceForTransactions(
      results.map((r: any) => r.transaction_id).filter(Boolean)
    )

    // Shape the response
    const shaped = results.map(r => {
      const txn = (r as any).transactions
      const agents = (txn?.transaction_internal_agents || []).map((a: any) => {
        const u = a.users
        return {
          agent_id: a.agent_id,
          agent_role: a.agent_role,
          name: u ? `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim() : 'Unknown',
        }
      })
      const contacts = (txn?.transaction_contacts || []).map((c: any) => ({
        contact_type: c.contact_type,
        name: c.name,
        email: c.email,
        company: c.company,
      }))

      const allTiaRows = txn?.transaction_internal_agents || []
      const tiaRows = isAdmin
        ? allTiaRows
        : allTiaRows.filter((a: any) => a.agent_id === auth.user.id)
      const paidTotal = tiaRows.length
      const paidCount = tiaRows.filter((a: any) => a.payment_status === 'paid').length
      const selfTia = tiaRows.find((a: any) => a.agent_id === auth.user.id)
      const paidSelf = selfTia ? selfTia.payment_status === 'paid' : false

      return {
        id: r.id,
        transaction_id: r.transaction_id,
        property_address: r.property_address || txn?.property_address || '',
        transaction_type: txn?.transaction_type || null,
        check_amount: r.check_amount,
        brokerage_amount: r.brokerage_amount,
        check_number: r.check_number,
        check_from: r.check_from,
        check_image_url: r.check_image_url,
        check_date: r.check_date,
        received_date: r.received_date,
        deposited_date: r.deposited_date,
        cleared_date: r.cleared_date,
        status: r.status,
        payment_method: r.payment_method,
        agents_paid: r.agents_paid,
        crc_transferred: r.crc_transferred,
        paid_self: paidSelf,
        paid_count: paidCount,
        paid_total: paidTotal,
        compliance_complete_date: r.transaction_id
          ? (complianceByTxn[r.transaction_id]?.complete_date?.split('T')[0] ?? null)
          : null,
        compliance_status: r.transaction_id
          ? (complianceByTxn[r.transaction_id]?.status ?? null)
          : null,
        notes: r.notes,
        agents,
        contacts,
      }
    })

    let finalShaped = shaped
    if (paidFilter === 'paid') {
      finalShaped = shaped.filter(c => c.paid_total > 0 && c.paid_count === c.paid_total)
    } else if (paidFilter === 'pending') {
      finalShaped = shaped.filter(c => c.crc_transferred && c.paid_count < c.paid_total)
    } else if (paidFilter === 'unpaid') {
      finalShaped = shaped.filter(c => c.paid_count === 0)
    }

    return NextResponse.json({ checks: finalShaped, total: finalShaped.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
