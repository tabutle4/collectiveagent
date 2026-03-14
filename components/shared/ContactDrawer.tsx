'use client'

import { useState } from 'react'

interface ContactDrawerProps {
  open: boolean
  onClose: () => void
}

export default function ContactDrawer({ open, onClose }: ContactDrawerProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: name, userEmail: email, message }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send message')
      }

      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setSent(false)
      setName('')
      setEmail('')
      setMessage('')
      setError('')
    }, 300)
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={handleClose} />
      )}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t border-luxury-gray-5 transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-luxury-gray-5">
          <h2 className="text-lg font-semibold text-luxury-gray-1">Contact Us</h2>
          <button onClick={handleClose} className="text-luxury-gray-3 hover:text-luxury-gray-1 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {sent ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-semibold text-luxury-gray-1 mb-2">Message Sent</h3>
              <p className="text-sm text-luxury-gray-3 mb-6">We'll get back to you as soon as possible.</p>
              <button onClick={handleClose} className="btn btn-primary">Close</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="contact-name" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">Name</label>
                <input id="contact-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-luxury" required />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">Email</label>
                <input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-luxury" required />
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">Message</label>
                <textarea id="contact-message" value={message} onChange={(e) => setMessage(e.target.value)} className="textarea-luxury" rows={5} required />
              </div>
              <button type="submit" disabled={sending} className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
