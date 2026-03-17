'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle } from 'lucide-react'

declare global {
  interface Window { Payload: any }
}

export default function AgentFeesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [paying, setPaying] = useState<string | null>(null)
  const payloadScriptLoaded = useRef(false)

  useEffect(() => {
    if (payloadScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://payload.com/Payload.js'
    script.async = true
    document.head.appendChild(script)
    payloadScriptLoaded.current = true
  }, [])

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
    if (!user?.id) return
    loadData()
  }, [user?.id])

  const loadData = async () => {
    const { data } = await supabase
      .from('users')
      .select('onboarding_fee_paid, onboarding_fee_paid_date, monthly_fee_paid_through, payload_payee_id, division')
      .eq('id', user.id)
      .single()
    if (data) setUser((prev: any) => ({ ...prev, ...data }))

    const [invoiceRes, receiptRes] = await Promise.all([
      fetch(`/api/payload/open-invoices?user_id=${user.id}`),
      fetch(`/api/payload/receipts?user_id=${user.id}`),
    ])
    const invoiceData = await invoiceRes.json()
    const receiptData = await receiptRes.json()
    setOpenInvoices(invoiceData.invoices || [])
    setReceipts(receiptData.receipts || [])
    setLoading(false)
  }

  const getMonthlyStatus = () => {
    if (!user?.monthly_fee_paid_through) return 'unpaid'
    const paidThrough = new Date(user.monthly_fee_paid_through)
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    return paidThrough >= endOfMonth ? 'current' : 'overdue'
  }

  const monthlyStatus = getMonthlyStatus()

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatCurrency = (amount: number) =>
    typeof amount === 'number' ? `$${amount.toFixed(2)}` : `$${amount}`

  const openCheckout = async (invoice: any) => {
    setPaying(invoice.id)
    try {
      const tokenRes = await fetch('/api/payload/checkout-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          description: invoice.description,
        }),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.client_token) throw new Error(tokenData.error || 'Failed to create checkout session')

      window.Payload(tokenData.client_token)
      const checkout = new window.Payload.Checkout({
        style: {
          default: {
            primaryColor: '#C5A278',
            backgroundColor: '#ffffff',
            color: '#1A1A1A',
            input: { borderColor: '#e5e5e5', boxShadow: 'none' },
            header: { backgroundColor: '#1A1A1A', color: '#ffffff' },
            button: { boxShadow: 'none' },
          },
        },
      })

      checkout.on('success', async (evt: any) => {
        await fetch('/api/payload/confirm-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: evt.transaction_id }),
        })
        await loadData()
        setPaying(null)
      })

      checkout.on('closed', () => setPaying(null))
    } catch (err: any) {
      alert(err.message || 'Something went wrong. Please contact the office.')
      setPaying(null)
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
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">Monthly Fee</p>
            <p className="text-sm font-semibold text-luxury-gray-1">$50 / month</p>
            {user?.monthly_fee_paid_through && (
              <p className="text-xs text-luxury-gray-3 mt-1">Paid through {formatDate(user.monthly_fee_paid_through)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {monthlyStatus === 'current' && (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Current</span>
              </>
            )}
            {monthlyStatus === 'overdue' && (
              <>
                <AlertCircle size={18} className="text-red-500" />
                <span className="text-xs font-medium text-red-500">Overdue</span>
              </>
            )}
            {monthlyStatus === 'unpaid' && (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Current</span>
              </>
            )}
          </div>
        </div>

        {user?.division ? (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="text-xs font-medium text-green-700">Your monthly fee has been waived due to your division status.</p>
          </div>
        ) : (
          <div className="inner-card">
            <p className="text-xs font-medium text-luxury-gray-2 mb-1">Prefer Zelle?</p>
            <p className="text-xs text-luxury-gray-3">Send to <span className="font-medium text-luxury-gray-2">info@collectiverealtyco.com</span> — include your name in the memo.</p>
          </div>
        )}
      </div>

      {/* Open Invoices */}
      {openInvoices.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Outstanding Invoices</h2>
          <div className="space-y-3">
            {openInvoices.map((inv) => (
              <div key={inv.id} className="inner-card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold text-luxury-gray-1">{inv.description}</p>
                    {inv.due_date && (
                      <p className="text-xs text-luxury-gray-3 mt-0.5">Due {formatDate(inv.due_date)}</p>
                    )}
                    {/* Show line items if more than one */}
                    {inv.items?.length > 1 && (
                      <div className="mt-1.5 space-y-0.5">
                        {inv.items.filter((item: any) => item.entry_type === 'charge').map((item: any, i: number) => (
                          <p key={i} className="text-xs text-luxury-gray-3">
                            {item.type}: {formatCurrency(item.amount)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-luxury-gray-1 ml-4">
                    {formatCurrency(inv.amount_due ?? inv.amount)}
                  </p>
                </div>
                <button
                  onClick={() => openCheckout(inv)}
                  disabled={paying === inv.id}
                  className="btn btn-primary text-xs w-full disabled:opacity-50"
                >
                  {paying === inv.id ? 'Opening Checkout...' : `Pay ${formatCurrency(inv.amount_due ?? inv.amount)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment History */}
      {receipts.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Payment History</h2>
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="inner-card flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-luxury-gray-1">{r.description}</p>
                  <p className="text-xs text-luxury-gray-3">{formatDate(r.paid_at)}</p>
                </div>
                <p className="text-sm font-semibold text-luxury-gray-1">{formatCurrency(r.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inner-card">
        <p className="text-xs text-luxury-gray-3">
          Questions about your billing? Email{' '}
          <a href="mailto:office@collectiverealtyco.com" className="text-luxury-accent hover:underline">
            office@collectiverealtyco.com
          </a>
        </p>
      </div>
    </div>
  )
}