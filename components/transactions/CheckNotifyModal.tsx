'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, Loader2 } from 'lucide-react'
import { getEmailLayout, emailSection, emailButton, emailSignature } from '@/lib/email/layout'

const ROLE_LABELS: Record<string, string> = {
  primary_agent:    'Primary Agent',
  listing_agent:    'Listing Agent',
  co_agent:         'Co-Agent',
  team_lead:        'Team Lead',
  referral_agent:   'Referral Agent',
  momentum_partner: 'Momentum Partner',
}

interface TiaRecipient {
  id: string
  agent_role: string
  name: string
  firstName: string
  email: string
}

interface Props {
  checkId: string
  address: string
  clearedDate: string | null   // YYYY-MM-DD or null
  checkImageUrl: string | null
  agents: any[]                // TIA rows with .user
  onClose: () => void
  onSent: (sent: number, failed: number) => void
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function buildPreviewHtml(opts: {
  firstName: string
  roleLabel: string
  address: string
  clearedDate: string | null
  checkImageUrl: string | null
  intro: string
  nextStepsBody: string
  savedSigHtml?: string | null
}): string {
  const { firstName, roleLabel, address, clearedDate, checkImageUrl, intro, nextStepsBody, savedSigHtml } = opts

  const clearSentence = clearedDate
    ? `<p>The check is expected to clear on <strong>${fmtDate(clearedDate)}</strong>.</p>`
    : ''

  const photoLink = checkImageUrl
    ? emailButton('View Check Photo', checkImageUrl)
    : ''

  const body = `
    <p class="email-greeting">Hi ${firstName},</p>
    <p>${intro}</p>
    <p style="font-size:13px;color:#888;margin:4px 0 16px 0;">Your role: <strong>${roleLabel}</strong></p>
    ${clearSentence}
    ${photoLink}
    ${emailSection('What Happens Next', `<p>${nextStepsBody}</p>`)}
    ${emailButton('View Compliance Process', 'https://visit.collectiverealtyco.com/compliance')}
    ${savedSigHtml
      ? `<div style="margin-top:24px;">${savedSigHtml}</div>`
      : emailSignature('Transactions Team', 'Operations', 'transactions@collectiverealtyco.com')}
  `

  return getEmailLayout(body, {
    title: 'Check Received',
    subtitle: address,
    preheader: `Your check for ${address} is being processed`,
  })
}

const DEFAULT_NEXT_STEPS = 'Commission payments are processed within 10-14 business days from receiving completed compliance and check. This often happens faster, but the guarantee per your agent agreement is 30 days.'

export default function CheckNotifyModal({
  checkId,
  address,
  clearedDate,
  checkImageUrl,
  agents,
  onClose,
  onSent,
}: Props) {
  // Build recipient list from TIA agents
  const recipients: TiaRecipient[] = agents
    .map((a: any) => {
      const u = a.user
      if (!u) return null
      const email = u.office_email || u.email
      if (!email) return null
      return {
        id: a.id,
        agent_role: a.agent_role,
        name: `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim(),
        firstName: u.preferred_first_name || u.first_name || 'Agent',
        email,
      }
    })
    .filter(Boolean) as TiaRecipient[]

  const defaultIntro = `A check has been received for ${address}. Your commission is being processed.`

  const [selected, setSelected] = useState<Set<string>>(() => new Set(recipients.map(r => r.id)))
  const [intro, setIntro] = useState(defaultIntro)
  const [nextSteps, setNextSteps] = useState(DEFAULT_NEXT_STEPS)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSigHtml, setSavedSigHtml] = useState<string | null>(null)

  // Fetch sender's saved signature HTML on mount for preview
  useEffect(() => {
    fetch('/api/email-signature?layout=classic')
      .then(r => r.json())
      .then(data => {
        const html = data?.signature?.html_content
        if (html) setSavedSigHtml(html)
      })
      .catch(() => {})
  }, [])

  const selectedRecipients = recipients.filter(r => selected.has(r.id))
  const previewAgent = recipients[previewIndex]

  const previewHtml = previewAgent
    ? buildPreviewHtml({
        firstName: previewAgent.firstName,
        roleLabel: ROLE_LABELS[previewAgent.agent_role] || previewAgent.agent_role,
        address,
        clearedDate,
        checkImageUrl,
        intro,
        nextStepsBody: nextSteps,
        savedSigHtml,
      })
    : ''

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/checks/notify-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: checkId, intro, next_steps: nextSteps, tia_ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      onSent(data.sent, data.failed)
    } catch (err: any) {
      setError(err.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (recipients.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
          <p className="text-sm text-luxury-gray-1 font-semibold mb-2">No recipients</p>
          <p className="text-xs text-luxury-gray-3 mb-4">No agents with email addresses are linked to this transaction.</p>
          <button onClick={onClose} className="btn btn-secondary text-xs w-full">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl my-6 flex flex-col" style={{ maxHeight: 'calc(100vh - 48px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-luxury-gray-1">Notify Agents: Check Received</h2>
            <p className="text-xs text-luxury-gray-3 mt-0.5">{address}</p>
          </div>
          <button type="button" onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <X size={16} />
          </button>
        </div>

        {/* Body: split left/right */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

          {/* Left: edit pane */}
          <div className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-luxury-gray-5 overflow-y-auto px-5 py-4 space-y-4">

            {/* Recipients */}
            <div>
              <p className="field-label mb-2">Recipients ({selectedRecipients.length} of {recipients.length} selected)</p>
              <div className="space-y-1">
                {recipients.map(r => {
                  const checked = selected.has(r.id)
                  return (
                    <label key={r.id} className={`inner-card py-2 px-3 flex items-start gap-2.5 cursor-pointer ${!checked ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelected(prev => {
                          const next = new Set(prev)
                          if (next.has(r.id)) next.delete(r.id)
                          else next.add(r.id)
                          return next
                        })}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-luxury-gray-1">{r.name}</p>
                        <p className="text-xs text-luxury-gray-3">{ROLE_LABELS[r.agent_role] || r.agent_role} &middot; {r.email}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Editable intro */}
            <div>
              <label className="field-label">Opening paragraph</label>
              <textarea
                className="input-luxury text-xs w-full"
                rows={3}
                value={intro}
                onChange={e => setIntro(e.target.value)}
              />
            </div>

            {/* Editable next steps */}
            <div>
              <label className="field-label">What Happens Next</label>
              <textarea
                className="input-luxury text-xs w-full"
                rows={4}
                value={nextSteps}
                onChange={e => setNextSteps(e.target.value)}
              />
            </div>

            {/* Info notes */}
            <div className="space-y-1 text-xs text-luxury-gray-3">
              {clearedDate && (
                <p>Clear date: <span className="text-luxury-gray-2">{fmtDate(clearedDate)}</span></p>
              )}
              {!clearedDate && (
                <p className="italic">No clear date set. That line will be omitted from the email.</p>
              )}
              {checkImageUrl && (
                <p>Check photo link will be included.</p>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          {/* Right: preview pane */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {/* Preview agent picker */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-luxury-gray-5 flex-shrink-0">
              <p className="text-xs text-luxury-gray-3 flex-shrink-0">Preview as:</p>
              <div className="relative flex-1">
                <select
                  className="select-luxury text-xs w-full pr-7 appearance-none"
                  value={previewIndex}
                  onChange={e => setPreviewIndex(Number(e.target.value))}
                >
                  {recipients.map((r, i) => (
                    <option key={r.id} value={i} disabled={!selected.has(r.id)}>
                      {r.name} ({ROLE_LABELS[r.agent_role] || r.agent_role}){!selected.has(r.id) ? ' (skipped)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-luxury-gray-3 pointer-events-none" />
              </div>
            </div>

            {/* Email preview */}
            <div className="flex-1 overflow-y-auto bg-luxury-cream p-4">
              <div className="text-xs text-luxury-gray-3 mb-3 space-y-0.5">
                <p><span className="font-medium text-luxury-gray-2">From:</span> Your @collectiverealtyco.com mailbox</p>
                <p><span className="font-medium text-luxury-gray-2">To:</span> {previewAgent?.email}</p>
                <p><span className="font-medium text-luxury-gray-2">Subject:</span> Check Received - {address} - {previewAgent?.name}</p>
              </div>
              <div
                className="bg-white rounded-lg overflow-hidden shadow-sm"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-luxury-gray-5 flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={sending} className="btn btn-secondary text-xs flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selectedRecipients.length === 0}
            className="btn btn-primary text-xs flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {sending && <Loader2 size={12} className="animate-spin" />}
            {sending ? 'Sending...' : selectedRecipients.length === 0 ? 'No recipients selected' : `Send to ${selectedRecipients.length} agent${selectedRecipients.length !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  )
}
