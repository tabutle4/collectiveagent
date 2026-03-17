'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Clock, Search, ChevronDown, ChevronUp, Send, Receipt } from 'lucide-react'

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
  const [agentData, setAgentData] = useState<Record<string, { invoices: any[], receipts: any[] }>>({})
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [showCustomForm, setShowCustomForm] = useState<string | null>(null)
  const payloadScriptLoaded = useRef(false)

  // Load Payload.js for in-person custom invoice checkout only
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

  const loadAgentData = async (agentId: string) => {
    if (agentData[agentId]) return
    setLoadingAgent(agentId)
    try {
      const [invoiceRes, receiptRes] = await Promise.all([
        fetch(`/api/payload/open-invoices?user_id=${agentId}`),
        fetch(`/api/payload/receipts?user_id=${agentId}`),
      ])
      const invoices = await invoiceRes.json()
      const receipts = await receiptRes.json()
      setAgentData(prev => ({
        ...prev,
        [agentId]: {
          invoices: invoices.invoices || [],
          receipts: receipts.receipts || [],
        },
      }))
    } catch {
      setAgentData(prev => ({ ...prev, [agentId]: { invoices: [], receipts: [] } }))
    } finally {
      setLoadingAgent(null)
    }
  }

  const refreshAgentData = async (agentId: string) => {
    const updated = { ...agentData }
    delete updated[agentId]
    setAgentData(updated)
    await loadAgentData(agentId)
  }

  const toggleAgent = (agentId: string, hasPayloadId: boolean) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null)
    } else {
      setExpandedAgent(agentId)
      if (hasPayloadId) loadAgentData(agentId)
    }
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

  const formatCurrency = (amount: number) =>
    typeof amount === 'number' ? `$${amount.toFixed(2)}` : `$${amount}`

  // Send an existing open invoice to the agent via Payload email
  const sendInvoice = async (agentId: string, invoiceId: string) => {
    setSending(`invoice-${invoiceId}`)
    try {
      const res = await fetch('/api/payload/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, user_id: agentId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to send')
      alert('Invoice sent successfully.')
    } catch (err: any) {
      alert(err.message || 'Failed to send invoice')
    } finally {
      setSending(null)
    }
  }

  // Send a receipt for a paid invoice
  const sendReceipt = async (agentId: string, invoiceId: string) => {
    setSending(`receipt-${invoiceId}`)
    try {
      const res = await fetch('/api/payload/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, user_id: agentId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to send')
      alert('Receipt sent successfully.')
    } catch (err: any) {
      alert(err.message || 'Failed to send receipt')
    } finally {
      setSending(null)
    }
  }

  // Create a custom invoice and send it to the agent
  const createAndSendCustomInvoice = async (agentId: string) => {
    if (!customAmount || !customDesc) return
    setCreatingInvoice(agentId)
    try {
      // Create invoice
      const invoiceRes = await fetch('/api/payload/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: agentId,
          type: 'custom',
          amount: parseFloat(customAmount),
          description: customDesc,
        }),
      })
      const invoiceData = await invoiceRes.json()
      if (!invoiceData.invoice_id) throw new Error(invoiceData.error || 'Failed to create invoice')

      // Send it
      await fetch('/api/payload/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceData.invoice_id, user_id: agentId }),
      })

      setShowCustomForm(null)
      setCustomAmount('')
      setCustomDesc('')
      await refreshAgentData(agentId)
    } catch (err: any) {
      alert(err.message || 'Failed to create invoice')
    } finally {
      setCreatingInvoice(null)
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

      {/* Stats */}
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

      {/* Search */}
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

      {/* Agent List */}
      <div className="space-y-3">
        {filtered.map(agent => {
          const name = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
          const monthlyStatus = getMonthlyStatus(agent)
          const isExpanded = expandedAgent === agent.id
          const data = agentData[agent.id]

          return (
            <div key={agent.id} className="container-card">
              {/* Agent row */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleAgent(agent.id, !!agent.payload_payee_id)}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">{name}</p>
                    <p className="text-xs text-luxury-gray-3">{agent.email}</p>
                  </div>
                  <div className="flex gap-4 flex-shrink-0">
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

              {/* Expanded */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 space-y-5">

                  {!agent.payload_payee_id && (
                    <div className="inner-card bg-yellow-50 border border-yellow-200">
                      <p className="text-xs font-medium text-yellow-700">No Payload customer ID. Agent must complete onboarding before invoicing.</p>
                    </div>
                  )}

                  {agent.payload_payee_id && loadingAgent === agent.id && (
                    <p className="text-xs text-luxury-gray-3">Loading...</p>
                  )}

                  {agent.payload_payee_id && data && (
                    <>
                      {/* Open Invoices */}
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Outstanding Invoices</p>
                        {data.invoices.length === 0 ? (
                          <p className="text-xs text-luxury-gray-3">No outstanding invoices.</p>
                        ) : (
                          <div className="space-y-2">
                            {data.invoices.map((inv: any) => (
                              <div key={inv.id} className="inner-card">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-xs font-semibold text-luxury-gray-1">{inv.description}</p>
                                    {inv.due_date && (
                                      <p className="text-xs text-luxury-gray-3 mt-0.5">Due {formatDate(inv.due_date)}</p>
                                    )}
                                    {inv.items?.length > 1 && (
                                      <div className="mt-1 space-y-0.5">
                                        {inv.items.filter((i: any) => i.entry_type === 'charge').map((i: any, idx: number) => (
                                          <p key={idx} className="text-xs text-luxury-gray-3">{i.type}: {formatCurrency(i.amount)}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 ml-4">
                                    <p className="text-sm font-semibold text-luxury-gray-1">{formatCurrency(inv.amount_due ?? inv.amount)}</p>
                                    <button
                                      onClick={() => sendInvoice(agent.id, inv.id)}
                                      disabled={sending === `invoice-${inv.id}`}
                                      className="btn btn-secondary text-xs flex items-center gap-1 disabled:opacity-50"
                                      title="Send invoice to agent"
                                    >
                                      <Send size={11} />
                                      {sending === `invoice-${inv.id}` ? 'Sending...' : 'Send'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Custom Invoice */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-luxury-gray-2">Custom Invoice</p>
                          <button
                            onClick={() => setShowCustomForm(showCustomForm === agent.id ? null : agent.id)}
                            className="text-xs text-luxury-accent hover:underline"
                          >
                            {showCustomForm === agent.id ? 'Cancel' : '+ New'}
                          </button>
                        </div>

                        {showCustomForm === agent.id && (
                          <div className="inner-card space-y-2">
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
                                  placeholder="e.g. HAR dues reimbursement"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => createAndSendCustomInvoice(agent.id)}
                              disabled={!customAmount || !customDesc || creatingInvoice === agent.id}
                              className="btn btn-primary text-xs w-full disabled:opacity-50"
                            >
                              {creatingInvoice === agent.id ? 'Creating & Sending...' : 'Create & Send to Agent'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Payment History */}
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Payment History</p>
                        {data.receipts.length === 0 ? (
                          <p className="text-xs text-luxury-gray-3">No payments found.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {data.receipts.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-luxury-light">
                                <div>
                                  <p className="text-xs font-medium text-luxury-gray-1">{r.description}</p>
                                  <p className="text-xs text-luxury-gray-3">{formatDate(r.paid_at)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-luxury-gray-1">{formatCurrency(r.amount)}</p>
                                  <button
                                    onClick={() => sendReceipt(agent.id, r.id)}
                                    disabled={sending === `receipt-${r.id}`}
                                    className="text-luxury-gray-3 hover:text-luxury-accent disabled:opacity-50"
                                    title="Resend receipt to agent"
                                  >
                                    <Receipt size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}