'use client'

// Admin view of a generated PM statement.
//
// Layout: action bar at top (Send, Open in new tab, View on portal) +
// iframe rendering the actual HTML statement at /api/pm/statements/[id].
//
// Why iframe: the statement HTML is a complete <html><body> document with
// its own styles (designed to be standalone-printable). Embedding via
// iframe isolates its styles from the admin app's Tailwind, gives us the
// print button + portal-view in one rendering, and lets the same HTML be
// served to landlords on the portal route too.

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ExternalLink, Loader2, CheckCircle, RefreshCw } from 'lucide-react'

interface Statement {
  id: string
  landlord_id: string
  property_id: string
  period_type: 'monthly' | 'annual'
  period_month: number | null
  period_year: number
  statement_date: string
  total_net_disbursed: number
  sent_at: string | null
  sent_to_email: string | null
  landlords?: { first_name: string; last_name: string; email: string }
  managed_properties?: { property_address: string; unit: string | null }
}

export default function AdminStatementViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [statement, setStatement] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/statements/${id}?format=json`)
      if (res.ok) {
        const data = await res.json()
        setStatement(data.statement)
      } else if (res.status === 404) {
        router.push('/admin/pm/disbursements')
      }
    } catch (err) {
      console.error('Failed to load statement:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    if (!statement) return
    const wasSent = !!statement.sent_at
    const msg = wasSent
      ? `This statement was already sent to ${statement.sent_to_email}. Regenerate it with current data? You can resend it after.`
      : `Regenerate this statement with current data?`
    if (!confirm(msg)) return

    setRegenerating(true)
    setSendError(null)
    try {
      // Delete existing
      const delRes = await fetch(`/api/pm/statements/${id}?force=true`, { method: 'DELETE' })
      if (!delRes.ok) {
        const d = await delRes.json()
        setSendError(d.error || 'Failed to delete statement')
        return
      }
      // Regenerate
      const body: Record<string, any> = {
        landlord_id: statement.landlord_id,
        property_id: statement.property_id,
        period_type: statement.period_type,
        period_year: statement.period_year,
      }
      if (statement.period_month) body.period_month = statement.period_month
      const genRes = await fetch('/api/pm/statements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const genData = await genRes.json()
      if (genRes.ok) {
        // Redirect to new statement id
        router.push(`/admin/pm/statements/${genData.statement.id}`)
      } else {
        setSendError(genData.error || 'Failed to regenerate statement')
      }
    } catch (err: any) {
      setSendError(err.message || 'Regenerate failed')
    } finally {
      setRegenerating(false)
    }
  }

  const handleSend = async () => {
    if (!statement?.landlords?.email) {
      alert('Landlord has no email on file')
      return
    }
    const ok = confirm(
      `Send this statement to ${statement.landlords.email}? Office will be BCC'd.`
    )
    if (!ok) return

    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/pm/statements/${id}/send`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setJustSent(true)
        load()
      } else {
        setSendError(data.error || 'Send failed')
      }
    } catch (err: any) {
      setSendError(err.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const monthName = (m: number | null) =>
    m ? new Date(2000, m - 1).toLocaleString('default', { month: 'long' }) : ''

  const periodLabel = statement
    ? statement.period_type === 'annual'
      ? `${statement.period_year}`
      : `${monthName(statement.period_month)} ${statement.period_year}`
    : ''

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-luxury-gray-3">
          <Loader2 size={16} className="animate-spin" />
          Loading statement...
        </div>
      </div>
    )
  }

  if (!statement) {
    return (
      <div className="p-6">
        <p className="text-luxury-gray-3">Statement not found</p>
      </div>
    )
  }

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/admin/pm/disbursements"
          className="text-luxury-gray-3 hover:text-luxury-gray-1"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">PM Statement</h1>
          <p className="text-sm text-luxury-gray-3 mt-1">
            {statement.landlords
              ? `${statement.landlords.first_name} ${statement.landlords.last_name}`
              : 'Unknown landlord'}
            {' · '}
            {periodLabel}
            {statement.managed_properties && (
              <> · {statement.managed_properties.property_address}
              {statement.managed_properties.unit ? ` ${statement.managed_properties.unit}` : ''}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/pm/statements/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <ExternalLink size={14} /> Open in new tab
          </a>
          <button
            onClick={handleRegenerate}
            disabled={regenerating || sending}
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || regenerating}
            className="btn btn-primary inline-flex items-center gap-2 text-sm"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending...' : statement.sent_at ? 'Resend' : 'Send to Landlord'}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {justSent && (
        <div className="alert-success mb-4">
          Statement sent to {statement.sent_to_email}.
        </div>
      )}
      {sendError && (
        <div className="alert-error mb-4">{sendError}</div>
      )}
      {statement.sent_at && statement.sent_to_email && !justSent && (
        <div className="inner-card mb-4 text-sm">
          <span className="text-luxury-gray-3">Sent to </span>
          <span className="text-luxury-gray-1 font-medium">{statement.sent_to_email}</span>
          <span className="text-luxury-gray-3"> on </span>
          <span className="text-luxury-gray-1 font-medium">
            {new Date(statement.sent_at).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Statement iframe */}
      <div className="container-card p-0 overflow-hidden">
        <iframe
          src={`/api/pm/statements/${id}`}
          className="w-full"
          style={{ height: 'calc(100vh - 220px)', border: 'none' }}
          title={`Statement - ${periodLabel}`}
        />
      </div>
    </div>
  )
}
