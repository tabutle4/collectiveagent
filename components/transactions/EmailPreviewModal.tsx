'use client'

import { useEffect, useState } from 'react'
import { X, Send, Loader2 } from 'lucide-react'

interface EmailPreview {
  subject: string
  html: string
  to: string
  cc: string | null
  replyTo: string
}

export default function EmailPreviewModal({
  transactionId,
  internalAgentId,
  emailType,
  onClose,
  onSent,
}: {
  transactionId: string
  internalAgentId: string
  emailType: 'statement' | 'cda'
  onClose: () => void
  onSent: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/transactions/${transactionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'preview_email',
            email_type: emailType,
            internal_agent_id: internalAgentId,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Failed to load preview')
        }
        const d = await res.json()
        if (cancelled) return
        setPreview(d.preview)
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Preview failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transactionId, internalAgentId, emailType])

  const send = async () => {
    if (!preview) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          email_type: emailType,
          internal_agent_id: internalAgentId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Send failed')
      }
      onSent()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Send failed')
      setSending(false)
    }
  }

  const title =
    emailType === 'statement' ? 'Send commission statement' : 'Send CDA'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
          <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-luxury-gray-3">
            <Loader2 className="inline-block animate-spin mr-2" size={14} />
            Loading preview...
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-xs text-red-600">{error}</p>
            <button
              onClick={onClose}
              className="btn btn-secondary text-xs mt-3"
            >
              Close
            </button>
          </div>
        ) : preview ? (
          <>
            <div className="px-6 py-4 border-b border-luxury-gray-5 space-y-2 text-xs">
              <div className="flex">
                <span className="w-16 text-luxury-gray-3">To</span>
                <span className="text-luxury-gray-1">
                  {preview.to || '(no email on file)'}
                </span>
              </div>
              {preview.cc && (
                <div className="flex">
                  <span className="w-16 text-luxury-gray-3">Cc</span>
                  <span className="text-luxury-gray-1">{preview.cc}</span>
                </div>
              )}
              <div className="flex">
                <span className="w-16 text-luxury-gray-3">Reply-to</span>
                <span className="text-luxury-gray-2">{preview.replyTo}</span>
              </div>
              <div className="flex">
                <span className="w-16 text-luxury-gray-3">Subject</span>
                <span className="text-luxury-gray-1 font-medium">
                  {preview.subject}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-luxury-light">
              <iframe
                srcDoc={preview.html}
                className="w-full border-0"
                style={{ minHeight: '500px' }}
                sandbox="allow-same-origin"
                title="Email preview"
              />
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-luxury-gray-5">
              <p className="text-xs text-luxury-gray-3">
                Preview is read-only. Click Send to deliver.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="btn btn-secondary text-xs"
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  onClick={send}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                  disabled={sending || !preview.to}
                >
                  {sending ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
