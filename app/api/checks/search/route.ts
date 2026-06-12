import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']

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

    const userRole = (auth.user.role || '').toLowerCase()
    const isAdmin = ADMIN_ROLES.includes(userRole)

    // Build base query joining transaction and contacts
    let query = supabaseAdmin
      .from('checks_received')
      .select(`
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
      `)
      .order('received_date', { ascending: false })
      .limit(200)

    // Agent filter: only checks where they are an internal agent on the transaction
    if (!isAdmin) {
      // We need to filter server-side after fetch since Supabase doesn't support
      // nested join filters in a single query elegantly. Fetch with a reasonable
      // limit and filter in JS below.
    }

    // Date range filter
    const allowedDateFields = ['received_date', 'cleared_date', 'deposited_date', 'check_date']
    const safeField = allowedDateFields.includes(dateField) ? dateField : 'received_date'
    if (from) query = query.gte(safeField, from)
    if (to) query = query.lte(safeField, to)

    // Status filter
    if (status) query = query.eq('status', status)

    // Payment method filter
    if (method) query = query.eq('payment_method', method)

    const { data: rows, error } = await query
    if (error) throw error

    let results = rows || []

    // Self-heal stale check status. The DB trigger derive_check_status only
    // runs on INSERT/UPDATE, so a check saved with a future cleared_date stays
    // 'deposited' even after that date passes. Recompute from dates here so the
    // page is always correct, and write back any corrections so the stored
    // value (read by reports etc.) stays accurate too.
    const today = new Date().toISOString().split('T')[0]
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
      results = results.filter(r => {
        const txn = (r as any).transactions
        const contacts: string[] = []

        if (txn) {
          // Contact names/email/company
          for (const c of txn.transaction_contacts || []) {
            if (c.name) contacts.push(c.name.toLowerCase())
            if (c.email) contacts.push(c.email.toLowerCase())
            if (c.company) contacts.push(c.company.toLowerCase())
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
          ...contacts,
        ].join(' ').toLowerCase()

        return haystack.includes(search)
      })
    }

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
        compliance_complete_date: r.compliance_complete_date,
        notes: r.notes,
        agents,
        contacts,
      }
    })

    return NextResponse.json({ checks: shaped, total: shaped.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
