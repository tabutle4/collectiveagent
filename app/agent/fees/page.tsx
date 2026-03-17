'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export default function AgentFeesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { router.push('/auth/login'); return }
        const data = await res.json()
        setUser(data.user)
      } catch { router.push('/auth/login') }
    }
    fetchUser()
  }, [router])

  useEffect(() => {
    if (!user) return
    // Fetch fresh user data including fee status
    const loadUser = async () => {
      const { data } = await supabase
        .from('users')
        .select('onboarding_fee_paid, onboarding_fee_paid_date, monthly_fee_paid_through, payload_payee_id')
        .eq('id', user.id)
        .single()
      if (data) setUser((prev: any) => ({ ...prev, ...data }))
      setLoading(false)
    }
    loadUser()
  }, [user?.id])

  const getMonthlyStatus = () => {
    if (!user?.monthly_fee_paid_through) return 'unpaid'
    const paidThrough = new Date(user.monthly_fee_paid_through)
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (paidThrough >= endOfMonth) return 'current'
    if (paidThrough >= today) return 'current'
    return 'overdue'
  }

  const monthlyStatus = getMonthlyStatus()

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const handlePayMonthly = async () => {
    setInvoiceLoading(true)
    try {
      const res = await fetch('/api/payload/onboarding-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (data.invoice_url) {
        setInvoiceUrl(data.invoice_url)
        window.open(data.invoice_url, '_blank')
      } else {
        alert('Could not generate invoice. Please contact the office.')
      }
    } catch (e) {
      alert('Something went wrong. Please contact the office.')
    } finally {
      setInvoiceLoading(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">FEES & BILLING</h1>

      {/* Onboarding Fee */}
      <div className="container-card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">Onboarding Fee</p>
            <p className="text-sm font-semibold text-luxury-gray-1">$399 — One Time</p>
            {user?.onboarding_fee_paid_date && (
              <p className="text-xs text-luxury-gray-3 mt-1">Paid {formatDate(user.onboarding_fee_paid_date)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {user?.onboarding_fee_paid ? (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Paid</span>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-red-500" />
                <span className="text-xs font-medium text-red-500">Unpaid</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Fee */}
      <div className="container-card mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">Monthly Fee</p>
            <p className="text-sm font-semibold text-luxury-gray-1">$50 / month</p>
            {user?.monthly_fee_paid_through && (
              <p className="text-xs text-luxury-gray-3 mt-1">Paid through {formatDate(user.monthly_fee_paid_through)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {monthlyStatus === 'current' ? (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Current</span>
              </>
            ) : monthlyStatus === 'overdue' ? (
              <>
                <AlertCircle size={18} className="text-red-500" />
                <span className="text-xs font-medium text-red-500">Overdue</span>
              </>
            ) : (
              <>
                <Clock size={18} className="text-yellow-500" />
                <span className="text-xs font-medium text-yellow-500">Not Set Up</span>
              </>
            )}
          </div>
        </div>

        {monthlyStatus !== 'current' && (
          <div className={`rounded p-3 mb-4 ${monthlyStatus === 'overdue' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <p className={`text-xs font-medium ${monthlyStatus === 'overdue' ? 'text-red-700' : 'text-yellow-700'}`}>
              {monthlyStatus === 'overdue'
                ? 'Your monthly fee is overdue. Please pay to avoid interruption of services.'
                : 'Your monthly fee has not been set up yet. Please contact the office to get started.'}
            </p>
          </div>
        )}

        <div className="border-t border-luxury-gray-5/50 pt-4">
          <p className="text-xs text-luxury-gray-3 mb-3">Payment options:</p>
          <div className="space-y-2">
            
              href="https://agent.collectiverealtyco.com/pay/retainer"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary text-xs w-full text-center block"
            >Pay Online</a>
            <div className="inner-card">
              <p className="text-xs font-medium text-luxury-gray-2 mb-1">Zelle</p>
              <p className="text-xs text-luxury-gray-3">Send to <span className="font-medium text-luxury-gray-2">info@collectiverealtyco.com</span></p>
              <p className="text-xs text-luxury-gray-3 mt-1">Include your name in the memo.</p>
            </div>
            <div className="inner-card">
              <p className="text-xs font-medium text-luxury-gray-2 mb-1">Check</p>
              <p className="text-xs text-luxury-gray-3">Make payable to <span className="font-medium text-luxury-gray-2">Collective Realty Co.</span> and mail or drop off at the office.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="inner-card">
        <p className="text-xs text-luxury-gray-3">Questions about your billing? Email <a href="mailto:office@collectiverealtyco.com" className="text-luxury-accent hover:underline">office@collectiverealtyco.com</a></p>
      </div>
    </div>
  )
}
