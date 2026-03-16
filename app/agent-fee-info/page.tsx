'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import PageContainer from '@/components/shared/PageContainer'
import { supabase } from '@/lib/supabase'
import { Edit, Copy, Mail, CheckCircle2 } from 'lucide-react'

export default function AgentFeeInfoPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
        const data = await response.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    if (!user) fetchUser()
  }, [router, user])
  const [loading, setLoading] = useState(true)
  const [editingOnboardingFee, setEditingOnboardingFee] = useState(false)
  const [editingMonthlyFee, setEditingMonthlyFee] = useState(false)
  const [onboardingFee, setOnboardingFee] = useState(450)
  const [monthlyFee, setMonthlyFee] = useState(50)
  const [joinDate, setJoinDate] = useState('')
  const [processing, setProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showWhatIncluded, setShowWhatIncluded] = useState(false)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      // Check localStorage for user (same auth method as rest of app)


      // Fetch fresh user data from database
      const { data: freshUserData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .single()

      if (error) throw error
      setUser(freshUserData)

      // Set default join date to today if not set
      if (!joinDate) {
        const today = new Date()
        setJoinDate(today.toISOString().split('T')[0])
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading user data:', error)
      setLoading(false)
    }
  }

  const calculateTotal = () => {
    if (!joinDate) return onboardingFee

    const selectedDate = new Date(joinDate)
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    // If join date is in the future, use join date as start
    const startDate = selectedDate > today ? selectedDate : today
    const daysInMonth = endOfMonth.getDate()
    const daysRemaining = endOfMonth.getDate() - startDate.getDate() + 1
    const proratedAmount = (monthlyFee / daysInMonth) * daysRemaining

    return onboardingFee + proratedAmount
  }

  const getProratedBreakdown = () => {
    if (!joinDate) return { prorated: 0, days: 0 }

    const selectedDate = new Date(joinDate)
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    const startDate = selectedDate > today ? selectedDate : today
    const daysInMonth = endOfMonth.getDate()
    const daysRemaining = endOfMonth.getDate() - startDate.getDate() + 1
    const proratedAmount = (monthlyFee / daysInMonth) * daysRemaining

    return {
      prorated: Math.round(proratedAmount * 100) / 100,
      days: daysRemaining,
    }
  }

  const getNextPaymentDate = () => {
    const today = new Date()
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    return nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const handleCopyTotal = () => {
    const total = calculateTotal().toFixed(2)
    navigator.clipboard.writeText(`$${total}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePay = async () => {
    if (!joinDate) {
      alert('Please select your join date')
      return
    }

    setProcessing(true)
    try {
      const total = calculateTotal()

      // Process payment via API
      const response = await fetch('/api/payments/process-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          amount: total,
          join_date: joinDate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process payment')
      }

      // TODO: In production, redirect to payment processor (Stripe Checkout, etc.)
      // For now, mark as paid and redirect
      // Redirect back to onboarding checklist
      router.push('/forms/success')
    } catch (error: any) {
      console.error('Error processing payment:', error)
      alert('Failed to process payment: ' + (error.message || 'Please try again.'))
      setProcessing(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading...</p>
        </div>
      </PageContainer>
    )
  }

  const total = calculateTotal()
  const breakdown = getProratedBreakdown()
  const hasProrated = breakdown.prorated > 0

  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="text-3xl font-light mb-2 tracking-luxury">Agent Onboarding Fees</h1>
        <p className="text-luxury-gray-2">Review your fee breakdown</p>
      </div>

      <div className="card-section mb-6">
        {/* One-Time Onboarding Fee */}
        <div className="flex-between-border">
            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-luxury-gray-1">One-Time Onboarding Fee</label>
              <button
                onClick={() => setEditingOnboardingFee(!editingOnboardingFee)}
                className="text-luxury-gray-3 hover:text-luxury-black"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
            {editingOnboardingFee ? (
              <div className="flex items-center gap-2">
                <span className="text-luxury-gray-2">$</span>
                <input
                  type="number"
                  value={onboardingFee}
                  onChange={(e) => setOnboardingFee(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm border border-luxury-gray-5 rounded focus:outline-none focus:ring-1 focus:ring-luxury-black"
                  autoFocus
                />
                <button
                  onClick={() => setEditingOnboardingFee(false)}
                  className="text-sm text-luxury-gold hover:underline"
                >
                  Save
                </button>
              </div>
            ) : (
              <span className="text-lg font-medium text-luxury-gray-1">{formatCurrency(onboardingFee)}</span>
            )}
          </div>

          {/* Monthly Fee */}
          <div className="flex-between-border">
            <div className="flex items-center gap-2">
              <label className="text-base font-medium text-luxury-gray-1">Monthly Fee</label>
              <button
                onClick={() => setShowWhatIncluded(!showWhatIncluded)}
                className="text-sm text-luxury-gold hover:underline"
              >
                What's Included?
              </button>
              <button
                onClick={() => setEditingMonthlyFee(!editingMonthlyFee)}
                className="text-luxury-gray-3 hover:text-luxury-black"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>
            {editingMonthlyFee ? (
              <div className="flex items-center gap-2">
                <span className="text-luxury-gray-2">$</span>
                <input
                  type="number"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm border border-luxury-gray-5 rounded focus:outline-none focus:ring-1 focus:ring-luxury-black"
                  autoFocus
                />
                <span className="text-luxury-gray-2">/mo</span>
                <button
                  onClick={() => setEditingMonthlyFee(false)}
                  className="text-sm text-luxury-gold hover:underline"
                >
                  Save
                </button>
              </div>
            ) : (
              <span className="text-lg font-medium text-luxury-gray-1">${monthlyFee}/mo</span>
            )}
          </div>

          {/* What's Included Modal/Expansion */}
          {showWhatIncluded && (
            <div className="py-4 border-b border-luxury-gray-5">
              <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Monthly Plan Includes:</h3>
              <ul className="space-y-2 text-sm text-luxury-gray-2">
                <li>• E&O Insurance</li>
                <li>• Microsoft 365</li>
                <li>• Training Center</li>
                <li>• Group Coaching</li>
                <li>• Broker Support</li>
                <li>• Office Access</li>
                <li>• Agent Menu</li>
              </ul>
            </div>
          )}

          {/* Select Your Join Date */}
          <div className="py-4 border-b border-luxury-gray-5">
            <label className="block text-base font-medium text-luxury-gray-1 mb-2">Select Your Join Date</label>
            <input
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              className="input-luxury max-w-xs"
            />
          </div>

          {/* Calculated Total */}
          <div className="mt-6 p-6 bg-luxury-light rounded-lg border-2 border-luxury-black">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-luxury-gray-2 mb-1">
                  Onboarding Fee + {hasProrated ? `Prorated Monthly (${formatCurrency(breakdown.prorated)})` : 'Monthly Fee'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-light text-luxury-black">{formatCurrency(total)}</span>
                  <button
                    onClick={handleCopyTotal}
                    className="text-luxury-gray-3 hover:text-luxury-black transition-colors"
                    title="Copy amount"
                  >
                    {copied ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-luxury-gray-2 mt-2">
              This covers your onboarding and {hasProrated ? 'prorated monthly fee through the end of this month' : 'first month'}. Next payment due on the 1st.
            </p>
          </div>

          {/* Pay Button */}
          <div className="mt-6 text-center">
            <button
              onClick={handlePay}
              disabled={processing || !joinDate}
              className="w-full px-6 py-4 text-base rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Processing...
                </>
              ) : (
                <>
                  <span>💳</span>
                  Pay {formatCurrency(total)}
                </>
              )}
            </button>
          </div>
        </div>

        {/* How It Works */}
        <div className="card-section bg-yellow-50 border-yellow-200 border-2">
          <h3 className="text-base font-semibold text-luxury-gray-1 mb-3">How It Works</h3>
          <p className="text-sm text-luxury-gray-2 leading-relaxed">
            Click "Pay" above to process your payment of {formatCurrency(total)}. Your payment will be processed securely and you'll receive a confirmation email. Once payment is confirmed, you can continue with your onboarding checklist.
          </p>
        </div>
    </PageContainer>
  )
}

