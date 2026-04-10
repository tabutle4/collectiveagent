'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthFooter from '@/components/shared/AuthFooter'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import CornerLines from '@/components/shared/CornerLines'
import { useAuth } from '@/lib/context/AuthContext'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const authError = searchParams.get('error')
  const showEmailLogin = searchParams.get('dev') === 'true'

  const { login, clearAuth } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [microsoftLoading, setMicrosoftLoading] = useState(false)

  const errorMessages: Record<string, string> = {
    microsoft_auth_failed: 'Microsoft sign-in failed. Please try again.',
    not_authorized:
      'Your Microsoft account is not registered with Collective Agent. Contact your administrator.',
    account_inactive: 'Your account is inactive. Please contact support.',
    server_error: 'Something went wrong. Please try again.',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login({ email, password })

    if (!result.success) {
      setError(result.error || 'Login failed')
      setLoading(false)
      return
    }

    // Navigate to redirect or default path
    if (redirectTo && redirectTo.startsWith('/')) {
      router.push(redirectTo)
    } else {
      router.push(result.redirectTo || '/agent/profile')
    }
  }

  const handleMicrosoftSignIn = () => {
    setMicrosoftLoading(true)
    // Clear existing auth state before Microsoft redirect
    clearAuth()
    // Pass redirect param so callback knows where to send user after auth
    const redirectParam = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''
    window.location.href = `/api/auth/microsoft${redirectParam}`
  }

  return (
    <div className="space-y-5">
      {(error || authError) && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          {error || errorMessages[authError!] || 'An error occurred.'}
        </div>
      )}

      <button
        onClick={handleMicrosoftSignIn}
        disabled={microsoftLoading}
        className="w-full flex items-center justify-center gap-3 rounded px-4 py-3 text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        style={{ backgroundColor: '#C5A278', color: 'white' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 21 21">
          <rect x="1" y="1" width="9" height="9" fill="#fff" fillOpacity="0.9" />
          <rect x="11" y="1" width="9" height="9" fill="#fff" fillOpacity="0.7" />
          <rect x="1" y="11" width="9" height="9" fill="#fff" fillOpacity="0.7" />
          <rect x="11" y="11" width="9" height="9" fill="#fff" fillOpacity="0.9" />
        </svg>
        {microsoftLoading ? 'Redirecting...' : 'Sign in with Microsoft'}
      </button>

      {showEmailLogin && (
        <div className="relative pt-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#e8e0d8]" />
          </div>
          <div className="relative flex justify-center text-xs text-[#999]">
            <span className="bg-white px-2">or sign in with email</span>
          </div>
        </div>
      )}

      {showEmailLogin && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs mb-1.5 font-medium uppercase tracking-wider"
              style={{ color: '#777' }}
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: '#777' }}
              >
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs transition-colors"
                style={{ color: '#C5A278' }}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-luxury"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}
    >
      {/* Corner lines background */}
      <CornerLines thickness="thick" />

      {/* Top accent bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: '#C5A278',
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <LuxuryHeader showTrainingCenter={false} />
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ width: '100%', maxWidth: '480px' }}>
          {/* Card - solid white, no transparency */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '0.5px solid #e8e0d8',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Card accent strip */}
            <div style={{ height: '2px', backgroundColor: '#C5A278' }} />

            <div style={{ padding: '72px 48px 64px' }}>
              <div style={{ marginBottom: '32px' }}>
                <h1
                  style={{
                    fontSize: '22px',
                    fontWeight: 600,
                    color: '#1A1A1A',
                    margin: '0 0 6px',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Welcome back
                </h1>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: 1.5 }}>
                  Sign in to access Collective Agent, your agent portal for transactions and account
                  management
                </p>
              </div>

              <Suspense
                fallback={
                  <div style={{ textAlign: 'center', fontSize: '13px', color: '#999' }}>
                    Loading...
                  </div>
                }
              >
                <LoginForm />
              </Suspense>
            </div>
          </div>

          {/* Tagline */}
          <p
            style={{
              textAlign: 'center',
              fontSize: '11px',
              color: '#ccc',
              marginTop: '24px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Coaching Brokerage Tools
          </p>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <AuthFooter />
      </div>
    </div>
  )
}