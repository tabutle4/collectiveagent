'use client'

import { useState } from 'react'
import Link from 'next/link'
import LuxuryHeader from '@/components/LuxuryHeader'

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
    <div className="min-h-screen bg-white">
      <LuxuryHeader />
      
      <div className="max-w-md mx-auto px-6 py-16">
        <h2 className="text-2xl font-light text-center mb-4 tracking-luxury">
          Reset Password
        </h2>
        <p className="text-sm text-center text-luxury-gray-2 mb-8">
          Enter your email and we'll send you a reset link
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {message && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
              {message}
            </div>
          )}
          
          <div>
            <label htmlFor="email" className="block text-sm mb-2 text-luxury-gray-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-luxury"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="btn btn-black w-full"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          
          <div className="text-center">
            <Link
              href="/auth/login"
              className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors"
            >
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
