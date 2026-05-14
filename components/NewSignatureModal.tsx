'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, X } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'

/**
 * NewSignatureModal
 *
 * Renders a one-time-per-session modal prompting agents to update their
 * email signature using the in-app generator. Shown when:
 *   1. The user is logged in
 *   2. user.new_signature_completed_at IS NULL (they have never saved
 *      a signature in the new tool)
 *   3. They haven't dismissed it in the last 24 hours (localStorage flag)
 *
 * Once they click "Generate Now" they go to /agent/email-signature.
 * Once they actually save a signature there, the column is set server-side
 * and this modal stops appearing forever.
 *
 * "Remind me in 24 hours" sets a localStorage flag that hides the modal
 * for 24h on this device only. After that window, the modal returns until
 * they actually complete the signature.
 *
 * Placement: render this once in app/profile/page.tsx so it appears on
 * the agent's dashboard landing.
 */

const DISMISS_KEY = 'new_signature_modal_dismissed_until'

export default function NewSignatureModal() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [checkedDismissal, setCheckedDismissal] = useState(false)

  useEffect(() => {
    if (loading || !user) {
      return
    }

    // If the user has already saved a new signature, never show.
    if (user.new_signature_completed_at) {
      setOpen(false)
      setCheckedDismissal(true)
      return
    }

    // Check localStorage for a 24h dismissal flag.
    try {
      const dismissedUntilRaw = window.localStorage.getItem(DISMISS_KEY)
      if (dismissedUntilRaw) {
        const dismissedUntil = parseInt(dismissedUntilRaw, 10)
        if (!isNaN(dismissedUntil) && Date.now() < dismissedUntil) {
          // Still within dismissal window.
          setOpen(false)
          setCheckedDismissal(true)
          return
        }
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR weirdness). Just show.
    }

    setOpen(true)
    setCheckedDismissal(true)
  }, [user, loading])

  const handleRemindLater = () => {
    try {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000
      window.localStorage.setItem(DISMISS_KEY, String(tomorrow))
    } catch {
      // ignore
    }
    setOpen(false)
  }

  const handleGenerate = () => {
    setOpen(false)
    router.push('/agent/email-signature')
  }

  if (!checkedDismissal || !open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-signature-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#C5A27819' }}
            >
              <Mail size={18} className="text-luxury-accent" />
            </div>
            <h2
              id="new-signature-modal-title"
              className="text-base font-semibold text-luxury-gray-1"
            >
              Update Your Email Signature
            </h2>
          </div>
          <button
            onClick={handleRemindLater}
            className="p-1 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-luxury-gray-2 leading-relaxed">
            We've moved the email signature generator into Collective Agent.
            Please update your email signature using the new tool by{' '}
            <strong className="text-luxury-gray-1">Friday, June 19, 2026</strong>.
          </p>
          <p className="text-sm text-luxury-gray-2 leading-relaxed">
            After June 19, photos in your current email signature will stop
            loading. Clients and leads who receive your emails will see a
            broken image placeholder. Take two minutes now to swap to the new
            generator.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-luxury-gray-5 flex gap-2 justify-end bg-luxury-light">
          <button
            onClick={handleRemindLater}
            className="btn btn-secondary text-sm"
          >
            Remind me in 24 hours
          </button>
          <button onClick={handleGenerate} className="btn btn-primary text-sm">
            Generate Now
          </button>
        </div>
      </div>
    </div>
  )
}
