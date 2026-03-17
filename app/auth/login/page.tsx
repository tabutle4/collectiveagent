'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthFooter from '@/components/shared/AuthFooter'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')
  const authError = searchParams.get('error')
  const showEmailLogin = searchParams.get('dev') === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [microsoftLoading, setMicrosoftLoading] = useState(false)

  const errorMessages: Record<string, string> = {
    microsoft_auth_failed: 'Microsoft sign-in failed. Please try again.',
    not_authorized: 'Your Microsoft account is not registered with Collective Agent. Contact your administrator.',
    account_inactive: 'Your account is inactive. Please contact support.',
    server_error: 'Something went wrong. Please try again.',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }
      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
        return
      }
      router.push(data.redirectTo)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleMicrosoftSignIn = () => {
    setMicrosoftLoading(true)
    window.location.href = '/api/auth/microsoft'
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
          <rect x="1" y="1" width="9" height="9" fill="#fff" fillOpacity="0.9"/>
          <rect x="11" y="1" width="9" height="9" fill="#fff" fillOpacity="0.7"/>
          <rect x="1" y="11" width="9" height="9" fill="#fff" fillOpacity="0.7"/>
          <rect x="11" y="11" width="9" height="9" fill="#fff" fillOpacity="0.9"/>
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
            <label htmlFor="email" className="block text-xs mb-1.5 font-medium uppercase tracking-wider" style={{ color: '#777' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-luxury"
              placeholder="you@collectiverealtyco.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider" style={{ color: '#777' }}>
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-xs transition-colors" style={{ color: '#C5A278' }}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}>

      {/* Corner lines SVG background */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        {/* Top-left corner lines */}
        <line x1="0" y1="0" x2="500" y2="500" stroke="#C5A278" strokeWidth="0.8" strokeOpacity="0.18"/>
        <line x1="0" y1="60" x2="500" y2="560" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.13"/>
        <line x1="0" y1="120" x2="400" y2="520" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.09"/>
        <line x1="60" y1="0" x2="560" y2="500" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.13"/>
        <line x1="120" y1="0" x2="520" y2="400" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.09"/>
        {/* Bottom-right corner lines */}
        <line x1="100%" y1="100%" x2="calc(100% - 500px)" y2="calc(100% - 500px)" stroke="#C5A278" strokeWidth="0.8" strokeOpacity="0.15"/>
        <line x1="100%" y1="calc(100% - 60px)" x2="calc(100% - 500px)" y2="calc(100% - 560px)" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.1"/>
        <line x1="calc(100% - 60px)" y1="100%" x2="calc(100% - 560px)" y2="calc(100% - 500px)" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.1"/>
      </svg>

      {/* Top accent bar */}
      <div style={{ height: '3px', backgroundColor: '#C5A278', width: '100%', position: 'relative', zIndex: 1 }} />

      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '0.5px solid #ebebeb', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <img
          src="/logo.png"
          alt="Collective Realty Co."
          style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
        />
        <span style={{ fontSize: '11px', color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Agent Portal</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>

          {/* Card — solid white, no transparency */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '0.5px solid #e8e0d8',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            {/* Card accent strip */}
            <div style={{ height: '2px', backgroundColor: '#C5A278' }} />

            <div style={{ padding: '72px 48px 64px' }}>
              <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                  Welcome back
                </h1>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: 1.5 }}>
                  Sign in to access Collective Agent, your agent portal for transactions and account management
                </p>
              </div>

              <Suspense fallback={<div style={{ textAlign: 'center', fontSize: '13px', color: '#999' }}>Loading...</div>}>
                <LoginForm />
              </Suspense>
            </div>
          </div>

          {/* Tagline */}
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#ccc', marginTop: '24px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
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