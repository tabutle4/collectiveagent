import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

const BROKER_ID = '7d99cfe9-db1e-42db-aa2a-7a42a68765f6'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_agents')
  if (auth.error) return auth.error

  // Get settings for zoom links
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('coaching_zoom_link, coaching_client_zoom_link')
    .single()

  // Get all active licensed agents (excluding broker)
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, email, mls_choice, payload_payee_id, is_coaching_client, is_licensed_agent, is_active')
    .eq('is_active', true)
    .neq('id', BROKER_ID)
    .order('first_name')

  if (!users) return NextResponse.json({ agents: [], coachingClients: [], zoomLink: '', clientZoomLink: '' })

  const licensedAgents = users.filter(u => u.is_licensed_agent === true && !u.is_coaching_client)
  const coachingClientUsers = users.filter(u => u.is_coaching_client === true)

  // Get billing status from Payload for agents who have a Payload account
  const agentsWithPayload = licensedAgents.filter(u => u.payload_payee_id)
  const today = new Date().toISOString().split('T')[0]

  const overdueMap: Record<string, number> = {}

  // Batch fetch Payload invoices
  const BATCH_SIZE = 10
  for (let i = 0; i < agentsWithPayload.length; i += BATCH_SIZE) {
    const batch = agentsWithPayload.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async u => {
      try {
        const res = await fetch(
          `https://api.payload.com/invoices/?customer_id=${u.payload_payee_id}&limit=50`,
          { headers: { Authorization: authHeader() } }
        )
        if (!res.ok) return
        const data = await res.json()
        const invoices: any[] = data.values || []

        // Monthly fee invoices only
        const monthlyInvoices = invoices.filter((inv: any) =>
          typeof inv?.description === 'string' &&
          inv.description.toLowerCase().includes('monthly brokerage fee')
        )

        // Overdue = unpaid AND past due date
        const overdue = monthlyInvoices.filter((inv: any) => {
          if (Number(inv.amount_due ?? 0) <= 0) return false
          const d = inv?.due_date
          if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return true
          return d.slice(0, 10) < today
        })

        overdueMap[u.id] = overdue.length
      } catch {
        // No Payload data available - treat as eligible
      }
    }))
  }

  const agents = licensedAgents.map(u => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`,
    email: u.email,
    office: u.mls_choice || null,
    overdue_count: overdueMap[u.id] ?? 0,
    eligible: (overdueMap[u.id] ?? 0) === 0, // No Payload account = no billing = eligible
  }))

  // Coaching clients - check their monthly fee paid status
  // Coaching clients with no Payload account are treated as eligible (manual billing)
  const coachingClientOverdue: Record<string, number> = {}
  const clientsWithPayload = coachingClientUsers.filter(u => u.payload_payee_id)

  for (let i = 0; i < clientsWithPayload.length; i += BATCH_SIZE) {
    const batch = clientsWithPayload.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async u => {
      try {
        const res = await fetch(
          `https://api.payload.com/invoices/?customer_id=${u.payload_payee_id}&limit=50`,
          { headers: { Authorization: authHeader() } }
        )
        if (!res.ok) return
        const data = await res.json()
        const invoices: any[] = data.values || []

        const monthlyInvoices = invoices.filter((inv: any) =>
          typeof inv?.description === 'string' &&
          inv.description.toLowerCase().includes('monthly')
        )

        const overdue = monthlyInvoices.filter((inv: any) => {
          if (Number(inv.amount_due ?? 0) <= 0) return false
          const d = inv?.due_date
          if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return true
          return d.slice(0, 10) < today
        })

        coachingClientOverdue[u.id] = overdue.length
      } catch { }
    }))
  }

  const coachingClients = coachingClientUsers.map(u => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`,
    email: u.email,
    fee_paid: (coachingClientOverdue[u.id] ?? 0) === 0,
  }))

  return NextResponse.json({
    agents,
    coachingClients,
    zoomLink: settings?.coaching_zoom_link || '',
    clientZoomLink: settings?.coaching_client_zoom_link || '',
  })
}
