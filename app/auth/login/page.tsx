'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthFooter from '@/components/shared/AuthFooter'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

      localStorage.setItem('user', JSON.stringify(data.user))

      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
        return
      }

      const userRole = data.user.role || ''
      if (userRole === 'Admin') {
        router.push('/admin/dashboard')
      } else {
        router.push('/profile')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

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
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-luxury-light flex flex-col">
      <div className="px-8 pt-8">
        <img
          src="/logo.png"
          alt="Collective Realty Co."
          className="w-32 h-32 object-contain"
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
