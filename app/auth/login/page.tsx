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
    <div className="space-y-6">
      {(error || authError) && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          {error || errorMessages[authError!] || 'An error occurred.'}
        </div>
      )}

      <button
        onClick={handleMicrosoftSignIn}
        disabled={microsoftLoading}
        className="w-full flex items-center justify-center gap-3 border border-luxury-gray-5 rounded px-4 py-2.5 text-sm font-medium text-luxury-gray-1 hover:bg-luxury-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        {microsoftLoading ? 'Redirecting...' : 'Sign in with Microsoft'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-luxury-gray-5" />
        </div>
        <div className="relative flex justify-center text-xs text-luxury-gray-3">
          <span className="bg-white px-2">or sign in with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">
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
            <label htmlFor="password" className="text-sm text-luxury-gray-2 font-medium">
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
            >
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
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-luxury-light flex flex-col">
      <div className="px-8 pt-4">
        <img
          src="/logo.png"
          alt="Collective Realty Co."
          className="w-48 h-48 object-contain"
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 -mt-16">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 p-10">
            <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-1">
              Sign in to Collective Agent
            </h1>
            <p className="text-sm text-luxury-gray-3 mb-10">
              Welcome back
            </p>

            <Suspense fallback={<div className="text-center text-sm text-luxury-gray-3">Loading...</div>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>

      <AuthFooter />
    </div>
  )
}
