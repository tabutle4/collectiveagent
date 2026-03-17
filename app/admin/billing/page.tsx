'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Clock, Search, ChevronDown, ChevronUp } from 'lucide-react'

declare global {
  interface Window { Payload: any }
}

export default function AdminBillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Record<string, any[]>>({})
  const [loadingReceipts, setLoadingReceipts] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [showCustomForm, setShowCustomForm] = useState<string | null>(null)
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
    if (!user) return
    loadAgents()
  }, [user])

  const loadAgents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, division, onboarding_fee_paid, onboarding_fee_paid_date, monthly_fee_paid_through, payload_payee_id, status')
      .eq('status', 'active')
      .order('first_name')
    setAgents(data || [])
    setLoading(false)
  }

  const getMonthlyStatus = (agent: any) => {
    if (agent.division) return 'waived'
    if (!agent.monthly_fee_paid_through) return 'unpaid'
    const paidThrough = new Date(agent.monthly_fee_paid_through)
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    return paidThrough >= endOfMonth ? 'current' : 'overdue'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const loadReceipts = async (agentId: string) => {
    if (receipts[agentId]) return
    setLoadingReceipts(agentId)
    try {
      const res = await fetch(`/api/payload/receipts?user_id=${agentId}`)
      const data = await res.json()
      setReceipts(prev => ({ ...prev, [agentId]: data.receipts || [] }))
    } catch {
      setReceipts(prev => ({ ...prev, [agentId]: [] }))
    } finally {
      setLoadingReceipts(null)
    }
  }

  const toggleAgent = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null)
    } else {
      setExpandedAgent(agentId)
      loadReceipts(agentId)
    }
  }

  const openCheckout = async (agentId: string, type: 'onboarding' | 'monthly' | 'custom') => {
    const key = `${agentId}-${type}`
    setPaying(key)
    try {
      const body: any = { user_id: agentId, type }
      if (type === 'custom') {
        body.amount = parseFloat(customAmount)
        body.description = customDesc
      }

      const invoiceRes = await fetch('/api/payload/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const invoiceData = await invoiceRes.json()
      if (!invoiceData.invoice_id) throw new Error(invoiceData.error || 'Failed to create invoice')

      const tokenRes = await fetch('/api/payload/checkout-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceData.invoice_id,
          description: type === 'onboarding' ? 'Onboarding Fee' : type === 'monthly' ? 'Monthly Brokerage Fee' : customDesc,
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
        // Refresh receipts and agent list
        delete receipts[agentId]
        await loadReceipts(agentId)
        await loadAgents()
        setShowCustomForm(null)
        setCustomAmount('')
        setCustomDesc('')
      })

      checkout.on('closed', () => setPaying(null))
    } catch (err: any) {
      alert(err.message || 'Something went wrong')
      setPaying(null)
    }
  }

  const filtered = agents.filter(a => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
    return name.includes(q) || a.email.toLowerCase().includes(q)
  })

  const stats = {
    total: agents.length,
    onboardingUnpaid: agents.filter(a => !a.onboarding_fee_paid).length,
    monthlyOverdue: agents.filter(a => getMonthlyStatus(a) === 'overdue').length,
    monthlyUnpaid: agents.filter(a => getMonthlyStatus(a) === 'unpaid').length,
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">BILLING</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Total Agents</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Onboarding Unpaid</p>
          <p className="text-2xl font-semibold text-red-500">{stats.onboardingUnpaid}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Monthly Overdue</p>
          <p className="text-2xl font-semibold text-red-500">{stats.monthlyOverdue}</p>
        </div>
        <div className="container-card text-center">
          <p className="text-xs text-luxury-gray-3 mb-1">Monthly Not Set Up</p>
          <p className="text-2xl font-semibold text-yellow-500">{stats.monthlyUnpaid}</p>
        </div>
      </div>

      <div className="container-card mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-luxury pl-8"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(agent => {
          const name = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
          const monthlyStatus = getMonthlyStatus(agent)
          const isExpanded = expandedAgent === agent.id
          const agentReceipts = receipts[agent.id] || []

          return (
            <div key={agent.id} className="container-card">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleAgent(agent.id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">{name}</p>
                    <p className="text-xs text-luxury-gray-3">{agent.email}</p>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-luxury-gray-3 mb-0.5">Onboarding</p>
                      {agent.onboarding_fee_paid
                        ? <span className="text-xs text-green-600 font-medium">Paid</span>
                        : <span className="text-xs text-red-500 font-medium">Unpaid</span>}
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-luxury-gray-3 mb-0.5">Monthly</p>
                      {monthlyStatus === 'current' && <span className="text-xs text-green-600 font-medium">Current</span>}
                      {monthlyStatus === 'overdue' && <span className="text-xs text-red-500 font-medium">Overdue</span>}
                      {monthlyStatus === 'unpaid' && <span className="text-xs text-yellow-500 font-medium">Not Set Up</span>}
                      {monthlyStatus === 'waived' && <span className="text-xs text-luxury-gray-3 font-medium">Waived</span>}
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  {isExpanded ? <ChevronUp size={16} className="text-luxury-gray-3" /> : <ChevronDown size={16} className="text-luxury-gray-3" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 space-y-4">
                  {!agent.payload_payee_id && (
                    <div className="inner-card bg-yellow-50 border border-yellow-200">
                      <p className="text-xs font-medium text-yellow-700">No Payload customer ID. Agent must be set up before invoicing.</p>
                    </div>
                  )}

                  {agent.payload_payee_id && (
                    <div>
                      <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Create Invoice</p>
                      <div className="flex gap-2 flex-wrap">
                        {!agent.onboarding_fee_paid && (
                          <button
                            onClick={() => openCheckout(agent.id, 'onboarding')}
                            disabled={paying === `${agent.id}-onboarding`}
                            className="btn btn-secondary text-xs disabled:opacity-50"
                          >
                            {paying === `${agent.id}-onboarding` ? 'Opening...' : 'Onboarding ($399 + Prorated)'}
                          </button>
                        )}
                        {!agent.division && (
                          <button
                            onClick={() => openCheckout(agent.id, 'monthly')}
                            disabled={paying === `${agent.id}-monthly`}
                            className="btn btn-secondary text-xs disabled:opacity-50"
                          >
                            {paying === `${agent.id}-monthly` ? 'Opening...' : 'Monthly ($50)'}
                          </button>
                        )}
                        <button
                          onClick={() => setShowCustomForm(showCustomForm === agent.id ? null : agent.id)}
                          className="btn btn-secondary text-xs"
                        >
                          Custom Invoice
                        </button>
                      </div>

                      {showCustomForm === agent.id && (
                        <div className="mt-3 inner-card space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-luxury-gray-3 mb-1">Amount ($)</label>
                              <input
                                type="number"
                                value={customAmount}
                                onChange={e => setCustomAmount(e.target.value)}
                                className="input-luxury text-xs"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                              <input
                                type="text"
                                value={customDesc}
                                onChange={e => setCustomDesc(e.target.value)}
                                className="input-luxury text-xs"
                                placeholder="Invoice description"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => openCheckout(agent.id, 'custom')}
                            disabled={!customAmount || !customDesc || paying === `${agent.id}-custom`}
                            className="btn btn-primary text-xs disabled:opacity-50"
                          >
                            {paying === `${agent.id}-custom` ? 'Opening...' : 'Create & Open Checkout'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Payment History</p>
                    {loadingReceipts === agent.id ? (
                      <p className="text-xs text-luxury-gray-3">Loading...</p>
                    ) : agentReceipts.length === 0 ? (
                      <p className="text-xs text-luxury-gray-3">No payments found</p>
                    ) : (
                      <div className="space-y-1.5">
                        {agentReceipts.map(r => (
                          <div key={r.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-luxury-light">
                            <div>
                              <p className="text-xs font-medium text-luxury-gray-1">{r.description}</p>
                              <p className="text-xs text-luxury-gray-3">{formatDate(r.paid_at)}</p>
                            </div>
                            <p className="text-xs font-semibold text-luxury-gray-1">
                              ${typeof r.amount === 'number' ? r.amount.toFixed(2) : r.amount}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}