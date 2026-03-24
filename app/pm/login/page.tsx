'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Mail, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Check for error from redirect (e.g., expired token)
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setError(errorParam)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/pm/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send login link')
      }

      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-card">
      {sent ? (
        /* Success state */
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-luxury-gray-1 mb-2">Check Your Email</h2>
          <p className="text-sm text-luxury-gray-3 mb-4">
            We sent a login link to <span className="font-medium text-luxury-gray-1">{email}</span>
          </p>
          <p className="text-xs text-luxury-gray-3">
            The link will expire in 15 minutes. If you don't see it, check your spam folder.
          </p>
          <button
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
            className="text-sm text-luxury-accent hover:underline mt-6"
          >
            Use a different email
          </button>
        </div>
      ) : (
        /* Email entry form */
        <>
          <h2 className="text-lg font-semibold text-luxury-gray-1 mb-1">Sign In</h2>
          <p className="text-sm text-luxury-gray-3 mb-6">
            Enter your email to receive a secure login link
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="field-label">Email Address</label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="input-luxury pl-10"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                'Sending...'
              ) : (
                <>
                  Send Login Link
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="container-card">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-24 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="h-10 bg-gray-200 rounded mb-4"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
}

export default function PMLoginPage() {
  return (
    <div className="min-h-screen bg-luxury-light flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="CRC Property Management"
            width={180}
            height={180}
            className="mx-auto mb-4"
            priority
          />
          <h1 className="text-xl font-semibold text-luxury-gray-1">Property Management Portal</h1>
          <p className="text-sm text-luxury-gray-3 mt-1">Landlord & Tenant Access</p>
        </div>

        <Suspense fallback={<LoadingCard />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-luxury-gray-3 mt-6">
          Questions? Contact{' '}
          <a href="mailto:pm@collectiverealtyco.com" className="text-luxury-accent hover:underline">
            pm@collectiverealtyco.com
          </a>
          {' '}or call{' '}
          <a href="tel:+12816389407" className="text-luxury-accent hover:underline">
            (281) 638-9407
          </a>
        </p>
      </div>
    </div>
  )
}
