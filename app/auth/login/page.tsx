'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'

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

      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify(data.user))
      
      // If there's a redirect URL, use it (but validate it's a local path)
      if (redirectTo && redirectTo.startsWith('/')) {
        router.push(redirectTo)
        return
      }
      
      // Default redirect based on user role
      const userRole = data.user.role || ''
      if (userRole === 'Admin') {
        router.push('/admin/dashboard')
      } else if (userRole === 'Agent') {
        router.push('/profile')
      } else {
        // Default to agent checklist for other roles
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
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
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
      
      <div>
        <label htmlFor="password" className="block text-sm mb-2 text-luxury-gray-1">
          Password
        </label>
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
        className="btn btn-primary w-full"
      >
        {loading ? 'Signing In...' : 'Sign In'}
      </button>
      
      <div className="text-center space-y-2">
        <Link
          href="/auth/forgot-password"
          className="block text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors"
        >
          Forgot your password?
        </Link>
        <Link
          href="/auth/register"
          className="block text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors"
        >
          Create first admin account
        </Link>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <PageContainer>

      
      <div className="max-w-md mx-auto px-6 py-16" style={{ paddingTop: '120px' }}>
        <h2 className="text-xl md:text-2xl font-semibold text-center mb-8 tracking-luxury" >
          <span className="border-b-2 border-luxury-accent pb-1">Sign In</span>
        </h2>
        
        <Suspense fallback={<div className="text-center">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </PageContainer>
  )
}