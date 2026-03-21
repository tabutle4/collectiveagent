'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthFooter from '@/components/shared/AuthFooter'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'An error occurred')
        setLoading(false)
        return
      }

      setMessage(data.message)
      setEmail('')
      setLoading(false)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-luxury-light flex flex-col">
      <div className="px-8 pt-4">
        <img src="/logo.png" alt="Collective Realty Co." className="w-48 h-48 object-contain" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 -mt-16">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 p-10">
            <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-1">Reset Password</h1>
            <p className="text-sm text-luxury-gray-3 mb-10">
              Enter your email and we will send you a reset link
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded text-sm">
                  {message}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm mb-1.5 text-luxury-gray-2 font-medium"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-luxury"
                  placeholder="you@collectiverealtyco.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link
                  href="/auth/login"
                  className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>

      <AuthFooter />
    </div>
  )
}
