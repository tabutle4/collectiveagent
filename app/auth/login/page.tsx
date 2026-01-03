'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LuxuryHeader from '@/components/LuxuryHeader'

export default function LoginPage() {
  const router = useRouter()
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
      
      // Redirect based on user role (simple string, not array)
      const userRole = data.user.role || ''
      if (userRole === 'Admin') {
        router.push('/admin/dashboard')
      } else if (userRole === 'Agent') {
        router.push('/agent/checklist')
      } else {
        // Default to agent checklist for other roles
        router.push('/agent/checklist')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <LuxuryHeader />
      
      <div className="max-w-md mx-auto px-6 py-16" style={{ paddingTop: '120px' }}>
        <h2 className="text-xl md:text-2xl font-semibold text-center mb-8 tracking-luxury" style={{ fontWeight: '600' }}>
          <span style={{ borderBottom: '2px solid #C9A961', paddingBottom: '4px' }}>Sign In</span>
        </h2>
        
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
            className="btn btn-black w-full"
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
      </div>
    </div>
  )
}
