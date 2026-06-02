import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI review not configured' }, { status: 503 })
  }

  try {
    const { transaction, agents, checklist, checks, agent_billing } = await request.json()

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction data required' }, { status: 400 })
    }

    // Build a plain-text summary of the transaction for Claude to reason about
    const isLease = (t: string | null) => {
      if (!t) return false
      const lower = t.toLowerCase()
      return lower.includes('lease') || lower.includes('tenant') || lower.includes('landlord') || lower.includes('apartment')
    }

    const txnIsLease = isLease(transaction.transaction_type)

    const agentSummaries = (agents || []).map((a: any) => {
      const u = a.user
      const name = u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : a.agent_id
      const plan = a.commission_plan_friendly || u?.commission_plan || 'Unknown plan'
      const billing = a.billing || {}
      const debts = (billing.debts || []).map((d: any) => `${d.description}: $${d.amount_remaining ?? d.amount_owed}`).join(', ')
      const credits = (billing.credits || []).map((c: any) => `${c.description}: $${c.amount_remaining ?? c.amount_owed}`).join(', ')
      const licenseExp = u?.license_expiration ? new Date(u.license_expiration).toLocaleDateString() : 'unknown'
      const today = new Date()
      const expDate = u?.license_expiration ? new Date(u.license_expiration) : null
      const licenseExpired = expDate ? expDate < today : false
      const licenseExpiringSoon = expDate ? (expDate.getTime() - today.getTime()) < 60 * 24 * 60 * 60 * 1000 : false // 60 days

      return `
Agent: ${name} (role: ${a.agent_role}, side: ${a.side || 'N/A'})
  Commission Plan: ${plan}
  Agent Gross: $${a.agent_gross || 0} | Agent Net: $${a.agent_net || 0} | Payment: ${a.payment_status || 'pending'}
  Processing Fee: $${a.processing_fee || 0} | Coaching Fee: $${a.coaching_fee || 0}
  BTSA: $${a.btsa_amount || 0}
  Team Lead Commission: $${a.team_lead_commission || 0}
  License Expiration: ${licenseExp}${licenseExpired ? ' [EXPIRED]' : licenseExpiringSoon ? ' [EXPIRING WITHIN 60 DAYS]' : ''}
  Outstanding Debts: ${debts || 'none'}
  Credits: ${credits || 'none'}
  Referring Agent: ${a.user?.referring_agent || 'none'}
  Lead Source: ${a.lead_source || 'unknown'}`
    }).join('\n')

    const checkSummary = (checks || []).map((c: any, i: number) => {
      return `Check ${i + 1}: $${c.check_amount || 0} from "${c.check_from || 'unknown'}" | Status: ${c.status || 'received'} | Received: ${c.received_date || 'not set'} | Cleared: ${c.cleared_date || 'not set'} | Compliance complete: ${c.compliance_complete_date || 'not set'}`
    }).join('\n')

    const checklistItems = (checklist || []).map((item: any) => {
      return `- [${item.completion ? 'DONE' : 'PENDING'}] ${item.label}${item.description ? ': ' + item.description : ''}`
    }).join('\n')

    const context = `
TRANSACTION SUMMARY
-------------------
Address: ${transaction.property_address || 'N/A'}
Type: ${transaction.transaction_type || 'N/A'}
Status: ${transaction.status || 'N/A'}
Compliance Status: ${transaction.compliance_status || 'not submitted'}
${txnIsLease ? `Monthly Rent: $${transaction.monthly_rent || 0} | Lease Term: ${transaction.lease_term || 'N/A'} months | Move-In: ${transaction.move_in_date || 'not set'}` : `Sales Price: $${transaction.sales_price || 0} | Closing Date: ${transaction.closing_date || 'not set'}`}
Office Gross: $${transaction.office_gross || 0}
Office Net: $${transaction.office_net || 0}
Has Internal Referral: ${transaction.internal_referral ? 'YES - $' + transaction.internal_referral_fee : 'No'}
Has External Referral: ${transaction.external_referral ? 'YES - $' + transaction.external_referral_fee : 'No'}

AGENTS ON TRANSACTION
---------------------
${agentSummaries || 'No agents'}

CHECKS RECEIVED
---------------
${checkSummary || 'No checks recorded'}

CHECKLIST ITEMS
---------------
${checklistItems || 'No checklist'}
`

    const prompt = `You are a transaction review assistant for Collective Realty Co., a real estate brokerage. You are helping the operations officer review this transaction before paying agents.

${context}

Review each PENDING checklist item based on the transaction data above. For each item, tell me:
1. What you can confirm looks good (based on the data)
2. What is missing or needs attention
3. Any red flags you notice

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "overall": "<1-2 sentence overall status summary>",
  "ready_to_pay": <true | false - is everything in order to pay agents>,
  "items": [
    {
      "label": "<exact checklist item label>",
      "status": "ok" | "needs_attention" | "missing" | "flagged",
      "note": "<1-2 sentences explaining what you found or what to check>"
    }
  ],
  "flags": [
    "<any critical issues not tied to a specific checklist item - e.g. license expired, large outstanding debt>"
  ]
}

Be specific and practical. Reference actual values from the data (dollar amounts, names, dates). Do not invent information not in the data. If you cannot confirm something from the data provided, say "Cannot verify from available data - check manually."`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Claude API error: ${response.status} ${JSON.stringify(err)}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const review = JSON.parse(clean)

    return NextResponse.json({ review })
  } catch (err: any) {
    console.error('AI checklist review error:', err)
    return NextResponse.json({ error: err.message || 'Review failed' }, { status: 500 })
  }
}
