'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Clock, Search, ChevronDown, ChevronUp } from 'lucide-react'

export default function AdminBillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Record<string, any[]>>({})
  const [loadingReceipts, setLoadingReceipts] = useState<string | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [showCustomForm, setShowCustomForm] = useState<string | null>(null)

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
    const today = new Date()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (paidThrough >= endOfMonth || paidThrough >= today) return 'current'
    return 'overdue'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const loadReceipts = async (agentId: string, payeeId: string) => {
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

  const toggleAgent = (agentId: string, payeeId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null)
    } else {
      setExpandedAgent(agentId)
      if (payeeId) loadReceipts(agentId, payeeId)
    }
  }

  const createInvoice = async (agentId: string, type: 'onboarding' | 'monthly' | 'custom') => {
    setInvoiceLoading(`${agentId}-${type}`)
    try {
      let url = ''
      let body: any = { user_id: agentId }
      if (type === 'onboarding') url = '/api/payload/onboarding-invoice'
      else if (type === 'monthly') url = '/api/payload/monthly-invoice'
      else {
        url = '/api/payload/custom-invoice'
        body = { user_id: agentId, amount: parseFloat(customAmount), description: customDesc }
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.invoice_url) {
        window.open(data.invoice_url, '_blank')
        // Refresh receipts
        delete receipts[agentId]
        loadReceipts(agentId, agents.find(a => a.id === agentId)?.payload_payee_id)
        setShowCustomForm(null)
        setCustomAmount('')
        setCustomDesc('')
      } else {
        alert(data.error || 'Failed to create invoice')
      }
    } catch {
      alert('Something went wrong')
    } finally {
      setInvoiceLoading(null)
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
          <input type="text" placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="input-luxury pl-8" />
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
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleAgent(agent.id, agent.payload_payee_id)}>
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">{name}</p>
                    <p className="text-xs text-luxury-gray-3">{agent.email}</p>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-luxury-gray-3 mb-0.5">Onboarding</p>
                      {agent.onboarding_fee_paid ? (
                        <span className="text-xs text-green-600 font-medium">Paid</span>
                      ) : (
                        <span className="text-xs text-red-500 font-medium">Unpaid</span>
                      )}
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
                  {/* Invoice Actions */}
                  <div>
                    <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Create Invoice</p>
                    <div className="flex gap-2 flex-wrap">
                      {!agent.onboarding_fee_paid && (
                        <button
                          onClick={() => createInvoice(agent.id, 'onboarding')}
                          disabled={invoiceLoading === `${agent.id}-onboarding`}
                          className="btn btn-secondary text-xs disabled:opacity-50"
                        >
                          {invoiceLoading === `${agent.id}-onboarding` ? 'Creating...' : 'Onboarding Fee ($399)'}
                        </button>
                      )}
                      {!agent.division && (
                        <button
                          onClick={() => createInvoice(agent.id, 'monthly')}
                          disabled={invoiceLoading === `${agent.id}-monthly`}
                          className="btn btn-secondary text-xs disabled:opacity-50"
                        >
                          {invoiceLoading === `${agent.id}-monthly` ? 'Creating...' : 'Monthly Fee ($50)'}
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
                          onClick={() => createInvoice(agent.id, 'custom')}
                          disabled={!customAmount || !customDesc || invoiceLoading === `${agent.id}-custom`}
                          className="btn btn-primary text-xs disabled:opacity-50"
                        >
                          {invoiceLoading === `${agent.id}-custom` ? 'Creating...' : 'Create & Open Invoice'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment History */}
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
