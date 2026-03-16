'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthFooter from '@/components/shared/AuthFooter'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validToken, setValidToken] = useState(false)
  const [checkingToken, setCheckingToken] = useState(true)

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setError('Invalid or missing reset token')
        setCheckingToken(false)
        return
      }
      try {
        const response = await fetch('/api/auth/verify-reset-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        if (response.ok) {
          setValidToken(true)
        } else {
          setError('Invalid or expired reset token')
        }
      } catch (err) {
        setError('Failed to verify reset token')
      } finally {
        setCheckingToken(false)
      }
    }
    verifyToken()
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const token = searchParams.get('token')
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })
      if (response.ok) {
        alert('Password updated successfully! Please log in.')
        router.push('/auth/login')
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to update password')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingToken) {
    return (
      <div className="text-center text-sm text-luxury-gray-3">Verifying reset token...</div>
    )
  }

  if (!validToken) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">Invalid Reset Link</h1>
        <p className="text-sm text-red-600 mb-6">{error}</p>
        <button onClick={() => router.push('/auth/forgot-password')} className="btn btn-primary w-full">
          Request New Reset Link
        </button>
        <div className="mt-4 text-center">
          <Link href="/auth/login" className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">
            Back to Sign In
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-1">Reset Your Password</h1>
      <p className="text-sm text-luxury-gray-3 mb-10">Enter your new password below</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">{error}</div>
        )}
        <div>
          <label htmlFor="password" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">New Password</label>
          <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-luxury" required minLength={6} />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm mb-1.5 text-luxury-gray-2 font-medium">Confirm New Password</label>
          <input type="password" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-luxury" required minLength={6} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
      <div className="mt-4 text-center">
        <Link href="/auth/login" className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">Back to Sign In</Link>
      </div>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-luxury-light flex flex-col">
      <div className="px-8 pt-4">
        <img src="/logo.png" alt="Collective Realty Co." className="w-48 h-48 object-contain" />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 -mt-16">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 p-10">
            <Suspense fallback={<div className="text-center text-sm text-luxury-gray-3">Loading...</div>}>
              <ResetPasswordContent />
            </Suspense>
          </div>
        </div>
      </div>
      <AuthFooter />
    </div>
  )
}