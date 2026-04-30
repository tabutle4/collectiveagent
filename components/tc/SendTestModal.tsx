'use client'

import { useState } from 'react'
import {
  X,
  Loader2,
  Send,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

/**
 * SendTestModal
 *
 * Opened from the template editor header. Lets an admin (Leah or Tara)
 * send a rendered test of the current saved template to any email
 * address, from any @collectiverealtyco.com mailbox.
 *
 * Both From and To default to the logged-in admin's email. A soft warning
 * fires if the From address is not on the CRC domain, but the final gate
 * is Microsoft Graph itself. A 403 from Graph is translated server-side
 * into a message about Exchange licensing.
 */

interface SendTestModalProps {
  templateId: string
  templateName: string
  defaultFromEmail: string
  defaultToEmail: string
  onClose: () => void
}

const CRC_DOMAIN = '@collectiverealtyco.com'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SendTestModal({
  templateId,
  templateName,
  defaultFromEmail,
  defaultToEmail,
  onClose,
}: SendTestModalProps) {
  const [fromEmail, setFromEmail] = useState(defaultFromEmail)
  const [toEmail, setToEmail] = useState(defaultToEmail)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const fromTrimmed = fromEmail.trim()
  const toTrimmed = toEmail.trim()

  const fromDomainWarning =
    fromTrimmed && !fromTrimmed.toLowerCase().endsWith(CRC_DOMAIN)
      ? `The sender mailbox should be a ${CRC_DOMAIN} address. Microsoft Graph will reject outside mailboxes.`
      : null

  const canSend =
    !busy &&
    !successMsg &&
    EMAIL_REGEX.test(fromTrimmed) &&
    EMAIL_REGEX.test(toTrimmed)

  const submit = async () => {
    setBusy(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setWarnings([])
    try {
      const res = await fetch(`/api/tc/templates/${templateId}/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail: fromTrimmed, toEmail: toTrimmed }),
      })
      const data = await res.json()
      if (Array.isArray(data.warnings)) setWarnings(data.warnings)
      if (!res.ok) {
        setErrorMsg(data.error || `Send failed (${res.status})`)
      } else {
        setSuccessMsg(`Test sent to ${toTrimmed}. Check the inbox.`)
        setTimeout(onClose, 3000)
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="container-card max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-luxury-gray-1">Send test</h2>
            <p className="text-xs text-luxury-gray-3 truncate mt-0.5">
              Template: {templateName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="field-label">From mailbox</label>
            <input
              type="email"
              className="input-luxury"
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
              disabled={busy || !!successMsg}
              placeholder="name@collectiverealtyco.com"
              autoComplete="off"
            />
            {fromDomainWarning && (
              <p className="text-[11px] text-amber-700 mt-1 flex items-start gap-1.5">
                <AlertTriangle
                  size={11}
                  strokeWidth={1.75}
                  className="flex-shrink-0 mt-0.5"
                />
                {fromDomainWarning}
              </p>
            )}
          </div>

          <div>
            <label className="field-label">Send to</label>
            <input
              type="email"
              className="input-luxury"
              value={toEmail}
              onChange={e => setToEmail(e.target.value)}
              disabled={busy || !!successMsg}
              placeholder="name@example.com"
              autoComplete="off"
            />
          </div>

          <div className="inner-card">
            <p className="text-[11px] text-luxury-gray-2 leading-relaxed">
              Placeholder values substitute for client, property, agent, and
              TC merge fields. Office settings, preferred vendors, and the
              Harris County homestead link use real data from the database.
            </p>
          </div>

          {warnings.length > 0 && (
            <div className="alert-warning space-y-1.5">
              {warnings.map((w, i) => (
                <p
                  key={i}
                  className="text-[11px] text-amber-800 flex items-start gap-1.5"
                >
                  <AlertTriangle
                    size={11}
                    strokeWidth={1.75}
                    className="flex-shrink-0 mt-0.5"
                  />
                  {w}
                </p>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="alert-error">
              <p className="text-[11px] text-red-700 flex items-start gap-1.5">
                <AlertCircle
                  size={11}
                  strokeWidth={1.75}
                  className="flex-shrink-0 mt-0.5"
                />
                {errorMsg}
              </p>
            </div>
          )}

          {successMsg && (
            <div className="alert-success">
              <p className="text-[11px] text-emerald-800 flex items-start gap-1.5">
                <CheckCircle2
                  size={11}
                  strokeWidth={1.75}
                  className="flex-shrink-0 mt-0.5"
                />
                {successMsg}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn text-luxury-gray-2 border border-luxury-gray-5"
          >
            {successMsg ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2
                  size={14}
                  strokeWidth={1.75}
                  className="animate-spin"
                />
                Sending
              </>
            ) : (
              <>
                <Send size={14} strokeWidth={1.75} />
                Send test
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
