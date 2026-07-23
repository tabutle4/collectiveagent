'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'

// Preview-then-send page for agent-facing documents. Reached from the
// transaction Commissions tab (Send Statement / Send CDA). It shows the
// exact document the agent will receive a link to, then sends from here —
// so nothing goes out blind. CDA sending stays gated on deal-level broker
// approval, matching the server-side gate on send_email.
function SendDocumentInner() {
  const params = useParams()
  const router = useRouter()
  const search = useSearchParams()
  const id = String(params?.id || '')
  const tia = String(params?.tia || '')
  const type: 'statement' | 'cda' = search.get('type') === 'cda' ? 'cda' : 'statement'

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/transactions/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (id) load() }, [id])

  if (loading) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-luxury-gray-3">Loading…</div>
  if (error) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-red-600">{error}</div>

  const txn = data.transaction
  const agent = (data.agents || []).find((a: any) => a.id === tia)
  const u = agent?.user
  const agentName = u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : 'Agent'
  const agentEmail = u?.office_email || u?.email || ''

  const docLabel = type === 'cda' ? 'CDA' : 'Commission Statement'
  const docSrc = type === 'cda'
    ? `/api/admin/transactions/${id}/cda/${tia}`
    : `/api/statements/${tia}`

  const cdaApproved = txn.cda_status === 'approved' || txn.cda_status === 'sent'
  const blocked = type === 'cda' && !cdaApproved

  async function send() {
    if (!confirm(`Send this ${docLabel.toLowerCase()} to ${agentName}?`)) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_email', email_type: type, internal_agent_id: tia }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed')
      setSentTo(`${json.sent_to}${json.cc ? ` (cc: ${json.cc})` : ''}`)
    } catch (e: any) {
      alert(e.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

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
              <h1 className="page-title">Send {docLabel}</h1>
              <p className="text-sm text-luxury-gray-3">
                {agentName}{agentEmail ? ` · ${agentEmail}` : ''}
              </p>
              <p className="text-xs text-luxury-gray-3">{txn.property_address || 'Transaction'}</p>
            </div>
            {sentTo ? (
              <span className="text-sm font-semibold text-green-600">Sent to {sentTo}</span>
            ) : (
              <button
                onClick={send}
                disabled={sending || blocked}
                title={blocked ? 'CDA must be approved before sending' : ''}
                className="btn btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? 'Sending…' : `Send ${docLabel} to agent`}
              </button>
            )}
          </div>
          {blocked && (
            <p className="text-xs text-red-600 mt-3">
              This CDA must be approved before it can be sent to the agent. Send it for approval from the Commissions tab first.
            </p>
          )}
        </div>

        <div className="container-card">
          <h2 className="section-title mb-3">Preview</h2>
          <iframe
            src={docSrc}
            className="w-full rounded border border-luxury-gray-5/40"
            style={{ height: '720px' }}
            title={`${docLabel} preview`}
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
