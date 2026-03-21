'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const nameFields = ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name']
    if (nameFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: formatNameToTitleCase(value) }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      // Format names before submission
      const formattedData = {
        ...formData,
        first_name: formatNameToTitleCase(formData.first_name),
        last_name: formatNameToTitleCase(formData.last_name),
        preferred_first_name: formatNameToTitleCase(formData.preferred_first_name),
        preferred_last_name: formatNameToTitleCase(formData.preferred_last_name),
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formattedData.email,
          password: formattedData.password,
          first_name: formattedData.first_name,
          last_name: formattedData.last_name,
          preferred_first_name: formattedData.preferred_first_name,
          preferred_last_name: formattedData.preferred_last_name,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      // Store user in localStorage
      localStorage.setItem('user', JSON.stringify(data.user))

      // Redirect to admin dashboard
      router.push('/admin/dashboard')
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="max-w-md mx-auto py-16">
        <h2 className="text-2xl font-light text-center mb-4 tracking-luxury">
          Create First Admin Account
        </h2>
        <p className="text-sm text-center text-luxury-gray-2 mb-8">
          This registration is only for the first admin user
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="first_name" className="block text-sm mb-2 text-luxury-gray-1">
              First Name (Legal) *
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              value={formData.first_name}
              onChange={handleChange}
              onBlur={handleNameBlur}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="last_name" className="block text-sm mb-2 text-luxury-gray-1">
              Last Name (Legal) *
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              value={formData.last_name}
              onChange={handleChange}
              onBlur={handleNameBlur}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="preferred_first_name" className="block text-sm mb-2 text-luxury-gray-1">
              Preferred First Name *
            </label>
            <input
              id="preferred_first_name"
              name="preferred_first_name"
              type="text"
              value={formData.preferred_first_name}
              onChange={handleChange}
              onBlur={handleNameBlur}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="preferred_last_name" className="block text-sm mb-2 text-luxury-gray-1">
              Preferred Last Name *
            </label>
            <input
              id="preferred_last_name"
              name="preferred_last_name"
              type="text"
              value={formData.preferred_last_name}
              onChange={handleChange}
              onBlur={handleNameBlur}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm mb-2 text-luxury-gray-1">
              Email *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-luxury-gray-1">
              Password * <span className="text-xs text-luxury-gray-3">(min 8 characters)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="input-luxury"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm mb-2 text-luxury-gray-1">
              Confirm Password *
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input-luxury"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>

          <div className="text-center">
            <Link
              href="/auth/login"
              className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </PageContainer>
  )
}
