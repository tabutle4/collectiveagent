'use client'

import { useState } from 'react'

interface ContactDrawerProps {
  open: boolean
  onClose: () => void
}

export default function ContactDrawer({ open, onClose }: ContactDrawerProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
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
        body: JSON.stringify({ userName: name, userEmail: email, subject, message }),
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
      setSubject('')
      setMessage('')
      setError('')
    }, 500)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          style={{ transition: 'opacity 0.5s ease' }}
          onClick={handleClose}
        />
      )}
      <div
        className={`fixed bottom-0 left-0 z-50 bg-white rounded-tr-2xl shadow-2xl border-t border-r border-luxury-gray-5 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          width: '380px',
          maxHeight: '85vh',
          transition: 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-luxury-gray-5">
          <h2 className="text-base font-semibold text-luxury-gray-1">Contact Us</h2>
          <button
            onClick={handleClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 70px)' }}>
          {sent ? (
            <div className="text-center py-6">
              <h3 className="text-base font-semibold text-luxury-gray-1 mb-2">Message Sent</h3>
              <p className="text-sm text-luxury-gray-3 mb-6">
                We will get back to you as soon as possible.
              </p>
              <button onClick={handleClose} className="btn btn-primary">
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-sm mb-1.5 text-luxury-gray-2 font-medium"
                >
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-sm mb-1.5 text-luxury-gray-2 font-medium"
                >
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="contact-subject"
                  className="block text-sm mb-1.5 text-luxury-gray-2 font-medium"
                >
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-sm mb-1.5 text-luxury-gray-2 font-medium"
                >
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="textarea-luxury"
                  rows={4}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
