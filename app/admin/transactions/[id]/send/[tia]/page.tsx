'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'

// Preview-then-send page for transaction documents. Reached from the
// Commissions tab. Nothing sends blind — the exact document is shown first,
// then sent from here. Four modes via ?type=:
//   statement -> commission statement to the agent
//   cda       -> approved CDA to the agent (view/download link)
//   approval  -> send the CDA to operations + broker for approval (deal-level)
//   title     -> email the CDA + wiring instructions to the title company
type Mode = 'statement' | 'cda' | 'approval' | 'title'

function SendDocumentInner() {
  const params = useParams()
  const router = useRouter()
  const search = useSearchParams()
  const id = String(params?.id || '')
  const tia = String(params?.tia || '')
  const raw = search.get('type')
  const mode: Mode = raw === 'cda' || raw === 'approval' || raw === 'title' ? raw : 'statement'

  const [data, setData] = useState<any>(null)
  const [title, setTitle] = useState<any>(null) // title-mode context
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  // Editable fields for title mode
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const txnRes = await fetch(`/api/admin/transactions/${id}`)
      const txnJson = await txnRes.json()
      if (!txnRes.ok) throw new Error(txnJson.error || 'Failed to load')
      setData(txnJson)

      if (mode === 'title') {
        const tRes = await fetch(`/api/admin/transactions/${id}/cda/${tia}/send-to-title`)
        const tJson = await tRes.json()
        if (!tRes.ok) throw new Error(tJson.error || 'Failed to load title details')
        setTitle(tJson)
        setSubject(tJson.default_subject || '')
        setBody(tJson.default_body || '')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (id) load() }, [id, mode])

  if (loading) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-luxury-gray-3">Loading…</div>
  if (error) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-red-600">{error}</div>

  const txn = data.transaction
  const agent = (data.agents || []).find((a: any) => a.id === tia)
  const u = agent?.user
  const agentName = u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : 'Agent'
  const agentEmail = u?.office_email || u?.email || ''
  const cdaApproved = txn.cda_status === 'approved' || txn.cda_status === 'sent'

  // Document shown in the iframe
  const docSrc = mode === 'statement'
    ? `/api/statements/${tia}`
    : `/api/admin/transactions/${id}/cda/${tia}`

  const heading =
    mode === 'statement' ? 'Send Commission Statement'
    : mode === 'cda' ? 'Send CDA to Agent'
    : mode === 'approval' ? 'Send CDA for Approval'
    : 'Send CDA to Title'

  // Per-mode send blocking
  const blocked =
    (mode === 'cda' && !cdaApproved) ||
    (mode === 'title' && (!cdaApproved || !title?.to || !title?.wiring_ready))

  async function send() {
    setSending(true)
    try {
      let res: Response
      if (mode === 'approval') {
        res = await fetch(`/api/admin/transactions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_cda_for_approval' }),
        })
      } else if (mode === 'title') {
        res = await fetch(`/api/admin/transactions/${id}/cda/${tia}/send-to-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body }),
        })
      } else {
        res = await fetch(`/api/admin/transactions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send_email', email_type: mode, internal_agent_id: tia }),
        })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed')

      if (mode === 'approval') {
        setDoneMsg(json.warning || `Sent for approval to: ${(json.sent_to || []).join(', ')}`)
      } else if (mode === 'title') {
        setDoneMsg(`Sent to ${json.sent_to}${json.cc?.length ? ` (cc: ${json.cc.join(', ')})` : ''}`)
      } else {
        setDoneMsg(`Sent to ${json.sent_to}${json.cc ? ` (cc: ${json.cc})` : ''}`)
      }
    } catch (e: any) {
      alert(e.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const sendLabel =
    mode === 'approval' ? 'Send for approval'
    : mode === 'title' ? 'Send to title'
    : mode === 'statement' ? 'Send statement to agent'
    : 'Send CDA to agent'

  const recipientLine =
    mode === 'approval' ? 'Operations + broker (resolved by role)'
    : mode === 'title' ? (title?.title_company ? `${title.title_company}${title?.to ? ` · ${title.to}` : ''}` : (title?.to || 'No title contact on this deal'))
    : `${agentName}${agentEmail ? ` · ${agentEmail}` : ''}`

  return (
    <div className="min-h-screen bg-luxury-cream p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="container-card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <button
                onClick={() => router.push(`/admin/transactions/${id}`)}
                className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 mb-2"
              >
                <ArrowLeft size={12} />
                Back to transaction
              </button>
              <h1 className="page-title">{heading}</h1>
              <p className="text-sm text-luxury-gray-3">{recipientLine}</p>
              <p className="text-xs text-luxury-gray-3">{txn.property_address || 'Transaction'}</p>
              {mode === 'title' && title?.cc?.length > 0 && (
                <p className="text-xs text-luxury-gray-3">CC: {title.cc.join(', ')}</p>
              )}
            </div>
            {doneMsg ? (
              <span className="text-sm font-semibold text-green-600">{doneMsg}</span>
            ) : (
              <button
                onClick={send}
                disabled={sending || blocked}
                className="btn btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? 'Sending…' : sendLabel}
              </button>
            )}
          </div>

          {mode === 'cda' && !cdaApproved && (
            <p className="text-xs text-red-600 mt-3">
              This CDA must be approved before it can be sent to the agent. Send it for approval from the Commissions tab first.
            </p>
          )}
          {mode === 'title' && !cdaApproved && (
            <p className="text-xs text-red-600 mt-3">
              This CDA must be approved before it can be sent to title.
            </p>
          )}
          {mode === 'title' && cdaApproved && !title?.to && (
            <p className="text-xs text-red-600 mt-3">
              No Title Company contact with an email on this transaction. Add one under Contacts first.
            </p>
          )}
          {mode === 'title' && cdaApproved && !title?.wiring_ready && (
            <p className="text-xs text-red-600 mt-3">
              No commission wiring instructions uploaded. Add it in Settings → Brokerage Information before sending to title.
            </p>
          )}
        </div>

        {mode === 'title' && (
          <div className="container-card space-y-3">
            <div>
              <label className="field-label">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input-luxury"
              />
            </div>
            <div>
              <label className="field-label">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="input-luxury"
              />
              <p className="text-xs text-luxury-gray-3 mt-1">
                Your saved email signature is added automatically. Attaches the CDA and{title?.wiring_filename ? ` ${title.wiring_filename}` : ' the wiring instructions'}.
              </p>
            </div>
          </div>
        )}

        {mode === 'approval' && agent && (() => {
          // Review breakdown for the approver: everything the statement would
          // show, plus agent standing, so Courtney can approve from one screen.
          const n = (v: any) => parseFloat(String(v ?? 0)) || 0
          const f$ = (v: any) => `$${n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          const staged = agent.billing?.staged || []
          const stagedTotal = staged.reduce((s: number, d: any) => s + n(d.amount_paid), 0)
          const netToAgent = Math.round((n(agent.amount_1099_reportable) - stagedTotal) * 100) / 100
          const outstanding = (agent.billing?.debts || []).filter((d: any) => !staged.some((s: any) => s.id === d.id))
          const outstandingTotal = outstanding.reduce((s: number, d: any) => s + n(d.amount_remaining ?? d.amount_owed), 0)
          const licExp = u?.license_expiration ? new Date(u.license_expiration) : null
          const licDays = licExp ? Math.floor((licExp.getTime() - Date.now()) / 86400000) : null
          const ecAmount = n(txn.ecommission_amount)
          const ecCovered = staged.some((d: any) => String(d.description || '').toLowerCase().includes('ecommission'))
          const line = (label: string, value: string, cls = '') => (
            <div className={`flex justify-between gap-4 py-1 border-b border-luxury-gray-5/30 text-xs ${cls}`}>
              <span className="text-luxury-gray-3">{label}</span>
              <span className="text-luxury-gray-1 whitespace-nowrap">{value}</span>
            </div>
          )
          return (
            <div className="container-card">
              <h2 className="section-title mb-3">Review Breakdown</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Agent</p>
                  {line('Agent', agentName)}
                  {line('Plan', agent.commission_plan_friendly || u?.commission_plan || '-')}
                  {u?.lease_commission_plan && line('Lease plan', u.lease_commission_plan)}
                  {u?.division && line('Division', String(u.division))}
                  {line('License #', u?.license_number || '-')}
                  {licExp && line(
                    'License expires',
                    licExp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    licDays != null && licDays < 60 ? 'text-red-600 font-semibold' : ''
                  )}
                  {licDays != null && licDays < 0 && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">License is EXPIRED - resolve before paying out.</p>
                  )}
                  {u?.monthly_fee_paid_through && line('Monthly fee paid through', new Date(u.monthly_fee_paid_through).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}
                  {outstanding.length > 0 && line(
                    `Other outstanding balances (${outstanding.length})`,
                    f$(outstandingTotal),
                    'text-amber-700'
                  )}
                  {u?.special_commission_notes && (
                    <p className="text-xs text-amber-700 mt-2">Note: {u.special_commission_notes}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Money on this deal</p>
                  {n(txn.sales_price) > 0 && line('Sales price', f$(txn.sales_price))}
                  {n(txn.monthly_rent) > 0 && line('Monthly rent', f$(txn.monthly_rent))}
                  {agent.side && line('Side', String(agent.side))}
                  {line('Agent basis', f$(agent.agent_basis))}
                  {line(`Agent split (${n(agent.split_percentage) || '-'}%)`, f$(agent.agent_gross))}
                  {line('Brokerage split', f$(agent.brokerage_split))}
                  {n(agent.btsa_amount) > 0 && line('+ BTSA (no split)', f$(agent.btsa_amount))}
                  {n(agent.processing_fee) > 0 && line('- Processing fee', `-${f$(agent.processing_fee)}`)}
                  {n(agent.coaching_fee) > 0 && line('- Coaching fee', `-${f$(agent.coaching_fee)}`)}
                  {n(agent.other_fees) > 0 && line(`- Other fees${agent.other_fees_description ? ` (${agent.other_fees_description})` : ''}`, `-${f$(agent.other_fees)}`)}
                  {n(agent.rebate_amount) > 0 && line('- Rebate', `-${f$(agent.rebate_amount)}`)}
                  {line('1099 amount', f$(agent.amount_1099_reportable), 'font-semibold')}
                  {staged.map((d: any) => line(`- ${d.description || d.debt_type || 'Debt'}`, `-${f$(d.amount_paid)}`, 'text-amber-700'))}
                  {line('Net to agent', f$(netToAgent), 'font-semibold')}
                  {line('Office net (deal)', f$(txn.office_net))}
                  {ecAmount > 0 && (
                    ecCovered
                      ? <p className="text-xs text-amber-700 mt-2">eCommission advance {f$(ecAmount)} - repayment is applied above.</p>
                      : <p className="text-xs text-red-600 mt-2 font-semibold">eCommission advance {f$(ecAmount)} reported on this deal but NO repayment is applied to this payout.</p>
                  )}
                  {agent.adjustment_notes && (
                    <p className="text-xs text-luxury-gray-3 mt-2">{agent.adjustment_notes}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        <div className="container-card">
          <h2 className="section-title mb-3">Preview</h2>
          <iframe
            src={docSrc}
            className="w-full rounded border border-luxury-gray-5/40"
            style={{ height: '720px' }}
            title="Document preview"
          />
        </div>
      </div>
    </div>
  )
}

export default function SendDocumentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-luxury-cream flex items-center justify-center text-luxury-gray-3">Loading…</div>}>
      <SendDocumentInner />
    </Suspense>
  )
}
