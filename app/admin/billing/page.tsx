'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, ChevronDown, ChevronUp, Send, Receipt } from 'lucide-react'

declare global {
  interface Window { Payload: any }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function AdminBillingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [agentData, setAgentData] = useState<Record<string, { invoices: any[], receipts: any[], records: any[] }>>({})
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [creatingInvoice, setCreatingInvoice] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [showCustomForm, setShowCustomForm] = useState<string | null>(null)
  const [showCreditForm, setShowCreditForm] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [savingCredit, setSavingCredit] = useState<string | null>(null)
  const [showMonthlyForm, setShowMonthlyForm] = useState<string | null>(null)
  const [invoiceMonth, setInvoiceMonth] = useState(MONTHS[new Date().getMonth()])
  const [invoiceYear, setInvoiceYear] = useState(new Date().getFullYear())
  const [openCustomInvoices, setOpenCustomInvoices] = useState(0)
  const [openDebtAgentIds, setOpenDebtAgentIds] = useState<string[]>([])
  const [editingRecord, setEditingRecord] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editAmount, setEditAmount] = useState('')
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
    const [{ data }, { data: debtData, count: openDebtsCount }] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, division, monthly_fee_waived, onboarding_fee_paid, onboarding_fee_paid_date, monthly_fee_paid_through, payload_payee_id, status')
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('agent_debts')
        .select('agent_id', { count: 'exact' })
        .eq('status', 'outstanding')
        .eq('debt_type', 'custom_invoice'),
    ])
    setAgents(data || [])
    setOpenCustomInvoices(openDebtsCount || 0)
    setOpenDebtAgentIds((debtData || []).map((d: any) => d.agent_id))
    setLoading(false)
  }

  const fetchAgentRecords = async (agentId: string) => {
    const [invoiceRes, receiptRes, { data: records }] = await Promise.all([
      fetch(`/api/payload/open-invoices?user_id=${agentId}`),
      fetch(`/api/payload/receipts?user_id=${agentId}`),
      supabase
        .from('agent_debts')
        .select('id, record_type, debt_type, description, amount_owed, amount_remaining, date_incurred, status, notes')
        .eq('agent_id', agentId)
        .eq('status', 'outstanding')
        .order('date_incurred', { ascending: false }),
    ])
    const invoices = await invoiceRes.json()
    const receipts = await receiptRes.json()
    return {
      invoices: invoices.invoices || [],
      receipts: receipts.receipts || [],
      records: records || [],
    }
  }

  const loadAgentData = async (agentId: string) => {
    if (agentData[agentId]) return
    setLoadingAgent(agentId)
    try {
      const result = await fetchAgentRecords(agentId)
      setAgentData(prev => ({ ...prev, [agentId]: result }))
    } catch {
      setAgentData(prev => ({ ...prev, [agentId]: { invoices: [], receipts: [], records: [] } }))
    } finally {
      setLoadingAgent(null)
    }
  }

  const refreshAgentData = async (agentId: string) => {
    setAgentData(prev => {
      const updated = { ...prev }
      delete updated[agentId]
      return updated
    })
    setLoadingAgent(agentId)
    try {
      const result = await fetchAgentRecords(agentId)
      setAgentData(prev => ({ ...prev, [agentId]: result }))
    } catch {
      setAgentData(prev => ({ ...prev, [agentId]: { invoices: [], receipts: [], records: [] } }))
    } finally {
      setLoadingAgent(null)
    }
    const { data: debtData, count } = await supabase
      .from('agent_debts')
      .select('agent_id', { count: 'exact' })
      .eq('status', 'outstanding')
      .eq('debt_type', 'custom_invoice')
    setOpenCustomInvoices(count || 0)
    setOpenDebtAgentIds((debtData || []).map((d: any) => d.agent_id))
  }

  const toggleAgent = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null)
    } else {
      setExpandedAgent(agentId)
      loadAgentData(agentId)
    }
  }

  const getMonthlyStatus = (agent: any) => {
    if (agent.monthly_fee_waived) return 'waived'
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

  const voidInvoice = async (agentId: string, invoiceId: string) => {
    if (!confirm('Void this invoice? The agent will no longer be able to pay it.')) return
    setSending(`void-${invoiceId}`)
    try {
      const res = await fetch('/api/payload/void-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, user_id: agentId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to void invoice')
      await refreshAgentData(agentId)
    } catch (err: any) {
      alert(err.message || 'Failed to void invoice')
    } finally {
      setSending(null)
    }
  }

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

  const sendDebtInvoice = async (agentId: string, record: any) => {
    setSending(`debt-${record.id}`)
    try {
      const invoiceRes = await fetch('/api/payload/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: agentId,
          type: 'custom',
          amount: record.amount_remaining ?? record.amount_owed,
          description: record.description || 'Outstanding balance',
        }),
      })
      const invoiceData = await invoiceRes.json()
      if (!invoiceData.invoice_id) throw new Error(invoiceData.error || 'Failed to create invoice')
      await supabase
        .from('agent_debts')
        .update({ notes: `${record.notes || ''} | Payload invoice: ${invoiceData.invoice_id}`.trim() })
        .eq('id', record.id)
      await fetch('/api/payload/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceData.invoice_id, user_id: agentId }),
      })
      await refreshAgentData(agentId)
    } catch (err: any) {
      alert(err.message || 'Failed to send debt invoice')
    } finally {
      setSending(null)
    }
  }

  const deleteRecord = async (agentId: string, recordId: string) => {
    if (!confirm('Delete this record? This cannot be undone.')) return
    await supabase.from('agent_debts').delete().eq('id', recordId)
    await refreshAgentData(agentId)
  }

  const updateRecord = async (agentId: string, recordId: string, description: string, amount: number) => {
    await supabase
      .from('agent_debts')
      .update({ description, amount_owed: amount })
      .eq('id', recordId)
    setEditingRecord(null)
    await refreshAgentData(agentId)
  }

  const addCredit = async (agentId: string) => {
    if (!creditAmount || !creditDesc) return
    setSavingCredit(agentId)
    try {
      const { error } = await supabase.from('agent_debts').insert({
        agent_id: agentId,
        record_type: 'credit',
        debt_type: 'brokerage_credit',
        description: creditDesc,
        amount_owed: parseFloat(creditAmount),
        amount_remaining: parseFloat(creditAmount),
        date_incurred: new Date().toISOString().split('T')[0],
        status: 'outstanding',
      })
      if (error) throw new Error(error.message)
      setShowCreditForm(null)
      setCreditAmount('')
      setCreditDesc('')
      await refreshAgentData(agentId)
    } catch (err: any) {
      alert(err.message || 'Failed to add credit')
    } finally {
      setSavingCredit(null)
    }
  }

  const sendMonthlyInvoice = async (agentId: string) => {
    setCreatingInvoice(agentId)
    try {
      const invoiceRes = await fetch('/api/payload/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: agentId,
          type: 'monthly',
          month: invoiceMonth,
          year: invoiceYear,
        }),
      })
      const invoiceData = await invoiceRes.json()
      if (!invoiceData.invoice_id) throw new Error(invoiceData.error || 'Failed to create invoice')
      await fetch('/api/payload/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceData.invoice_id, user_id: agentId }),
      })
      setShowMonthlyForm(null)
      await refreshAgentData(agentId)
    } catch (err: any) {
      alert(err.message || 'Failed to send monthly invoice')
    } finally {
      setCreatingInvoice(null)
    }
  }

  const createAndSendCustomInvoice = async (agentId: string) => {
    if (!customAmount || !customDesc) return
    setCreatingInvoice(agentId)
    try {
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

  const stats = {
    total: agents.length,
    openCustomInvoices,
    monthlyOverdue: agents.filter(a => getMonthlyStatus(a) === 'overdue').length,
    monthlyUnpaid: agents.filter(a => getMonthlyStatus(a) === 'unpaid').length,
  }

  const filtered = agents.filter(a => {
    const matchesSearch = (() => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
      return name.includes(q) || a.email.toLowerCase().includes(q)
    })()
    const matchesFilter = (() => {
      if (!statusFilter) return true
      if (statusFilter === 'openCustomInvoices') return openDebtAgentIds.includes(a.id)
      if (statusFilter === 'monthlyOverdue') return getMonthlyStatus(a) === 'overdue'
      if (statusFilter === 'monthlyUnpaid') return getMonthlyStatus(a) === 'unpaid'
      return true
    })()
    return matchesSearch && matchesFilter
  })

  const toggleFilter = (filter: string) => {
    setStatusFilter(prev => prev === filter ? null : filter)
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">BILLING</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div
          className={`container-card text-center cursor-pointer transition-all hover:shadow-md ${statusFilter === null ? 'ring-2 ring-luxury-accent' : ''}`}
          onClick={() => setStatusFilter(null)}
        >
          <p className="text-xs text-luxury-gray-3 mb-1">Total Agents</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
          {statusFilter === null && <p className="text-xs text-luxury-accent mt-1">All agents</p>}
        </div>
        <div
          className={`container-card text-center cursor-pointer transition-all hover:shadow-md ${statusFilter === 'openCustomInvoices' ? 'ring-2 ring-orange-400' : ''}`}
          onClick={() => toggleFilter('openCustomInvoices')}
        >
          <p className="text-xs text-luxury-gray-3 mb-1">Open Custom Invoices</p>
          <p className="text-2xl font-semibold text-orange-500">{stats.openCustomInvoices}</p>
          {statusFilter === 'openCustomInvoices' && <p className="text-xs text-orange-400 mt-1">Filtering ✕</p>}
        </div>
        <div
          className={`container-card text-center cursor-pointer transition-all hover:shadow-md ${statusFilter === 'monthlyOverdue' ? 'ring-2 ring-red-400' : ''}`}
          onClick={() => toggleFilter('monthlyOverdue')}
        >
          <p className="text-xs text-luxury-gray-3 mb-1">Monthly Overdue</p>
          <p className="text-2xl font-semibold text-red-500">{stats.monthlyOverdue}</p>
          {statusFilter === 'monthlyOverdue' && <p className="text-xs text-red-400 mt-1">Filtering ✕</p>}
        </div>
        <div
          className={`container-card text-center cursor-pointer transition-all hover:shadow-md ${statusFilter === 'monthlyUnpaid' ? 'ring-2 ring-luxury-accent' : ''}`}
          onClick={() => toggleFilter('monthlyUnpaid')}
        >
          <p className="text-xs text-luxury-gray-3 mb-1">Monthly No Invoice Yet</p>
          <p className="text-2xl font-semibold text-luxury-accent">{stats.monthlyUnpaid}</p>
          {statusFilter === 'monthlyUnpaid' && <p className="text-xs text-luxury-accent mt-1">Filtering ✕</p>}
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
          const data = agentData[agent.id]
          const debts = data?.records.filter((r: any) => r.record_type !== 'credit') || []
          const credits = data?.records.filter((r: any) => r.record_type === 'credit') || []
          const totalDebts = debts.reduce((sum: number, d: any) => sum + (d.amount_remaining ?? d.amount_owed), 0)
          const totalCredits = credits.reduce((sum: number, c: any) => sum + (c.amount_remaining ?? c.amount_owed), 0)
          const netBalance = totalDebts - totalCredits

          return (
            <div key={agent.id} className="container-card">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleAgent(agent.id)}
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
                      {monthlyStatus === 'unpaid' && <span className="text-xs text-green-600 font-medium">Current</span>}
                      {monthlyStatus === 'waived' && <span className="text-xs text-luxury-gray-3 font-medium">Waived</span>}
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  {isExpanded ? <ChevronUp size={16} className="text-luxury-gray-3" /> : <ChevronDown size={16} className="text-luxury-gray-3" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 space-y-5">

                  {loadingAgent === agent.id && (
                    <p className="text-xs text-luxury-gray-3">Loading...</p>
                  )}

                  {loadingAgent !== agent.id && data && (
                    <>
                      {/* Outstanding Balances */}
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Outstanding Balances</p>
                        {debts.length === 0 ? (
                          <p className="text-xs text-luxury-gray-3">No outstanding balances.</p>
                        ) : (
                          <div className="space-y-2">
                            {debts.map((record: any) => {
                              const isInvoiced = record.notes && record.notes.includes('Payload invoice:')
                              const isEditing = editingRecord === record.id
                              return (
                                <div key={record.id} className="inner-card border border-orange-100 bg-orange-50/30">
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-xs text-luxury-gray-3 mb-1">Amount ($)</label>
                                          <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="input-luxury text-xs" />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                                          <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} className="input-luxury text-xs" />
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={() => updateRecord(agent.id, record.id, editDesc, parseFloat(editAmount))} className="btn btn-primary text-xs">Save</button>
                                        <button onClick={() => setEditingRecord(null)} className="btn btn-secondary text-xs">Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <p className="text-xs font-semibold text-luxury-gray-1">{record.description}</p>
                                        <p className="text-xs text-luxury-gray-3 mt-0.5">{formatDate(record.date_incurred)}</p>
                                        {record.debt_type === 'brokermint_balance' && <p className="text-xs text-luxury-gray-3">Migrated from Brokermint</p>}
                                        {isInvoiced && <p className="text-xs text-green-600 mt-0.5">Invoice sent</p>}
                                      </div>
                                      <div className="flex items-center gap-2 ml-4">
                                        <p className="text-sm font-semibold text-orange-600">{formatCurrency(record.amount_remaining ?? record.amount_owed)}</p>
                                        <>
                                          <button onClick={() => { setEditingRecord(record.id); setEditDesc(record.description || ''); setEditAmount(String(record.amount_owed)) }} className="text-xs text-luxury-gray-3 hover:text-luxury-accent">Edit</button>
                                          <button onClick={() => deleteRecord(agent.id, record.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                                        </>
                                        {agent.payload_payee_id && !isInvoiced && (
                                          <button
                                            onClick={() => sendDebtInvoice(agent.id, record)}
                                            disabled={sending === `debt-${record.id}`}
                                            className="btn btn-secondary text-xs flex items-center gap-1 disabled:opacity-50"
                                          >
                                            <Send size={11} />
                                            {sending === `debt-${record.id}` ? 'Sending...' : 'Invoice'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Brokerage Credits */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-luxury-gray-2">Brokerage Credits</p>
                          <button
                            onClick={() => setShowCreditForm(showCreditForm === agent.id ? null : agent.id)}
                            className="text-xs text-luxury-accent hover:underline"
                          >
                            {showCreditForm === agent.id ? 'Cancel' : '+ Add Credit'}
                          </button>
                        </div>
                        {showCreditForm === agent.id && (
                          <div className="inner-card space-y-2 mb-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-luxury-gray-3 mb-1">Amount ($)</label>
                                <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} className="input-luxury text-xs" placeholder="0.00" />
                              </div>
                              <div>
                                <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                                <input type="text" value={creditDesc} onChange={e => setCreditDesc(e.target.value)} className="input-luxury text-xs" placeholder="e.g. Monthly fee credit" />
                              </div>
                            </div>
                            <button
                              onClick={() => addCredit(agent.id)}
                              disabled={!creditAmount || !creditDesc || savingCredit === agent.id}
                              className="btn btn-primary text-xs w-full disabled:opacity-50"
                            >
                              {savingCredit === agent.id ? 'Saving...' : 'Add Credit'}
                            </button>
                          </div>
                        )}
                        {credits.length === 0 ? (
                          <p className="text-xs text-luxury-gray-3">No credits on file.</p>
                        ) : (
                          <div className="space-y-2">
                            {credits.map((credit: any) => (
                              <div key={credit.id} className="inner-card border border-green-100 bg-green-50/30">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-xs font-semibold text-luxury-gray-1">{credit.description}</p>
                                    <p className="text-xs text-luxury-gray-3 mt-0.5">{formatDate(credit.date_incurred)}</p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4">
                                    <p className="text-sm font-semibold text-green-600">-{formatCurrency(credit.amount_remaining ?? credit.amount_owed)}</p>
                                    <button onClick={() => deleteRecord(agent.id, credit.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Net Balance */}
                      {(debts.length > 0 || credits.length > 0) && (
                        <div className="inner-card flex items-center justify-between">
                          <p className="text-xs font-semibold text-luxury-gray-2">Net Balance</p>
                          <p className={`text-sm font-bold ${netBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {netBalance > 0 ? formatCurrency(netBalance) : `-${formatCurrency(Math.abs(netBalance))}`}
                          </p>
                        </div>
                      )}

                      {!agent.payload_payee_id && (
                        <div className="inner-card bg-yellow-50 border border-yellow-200">
                          <p className="text-xs font-medium text-yellow-700">No Payload customer ID. Agent must complete onboarding before invoicing.</p>
                        </div>
                      )}

                      {agent.payload_payee_id && (
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
                                        {inv.due_date && <p className="text-xs text-luxury-gray-3 mt-0.5">Due {formatDate(inv.due_date)}</p>}
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
                                        >
                                          <Send size={11} />
                                          {sending === `invoice-${inv.id}` ? 'Sending...' : 'Send'}
                                        </button>
                                        <button
                                          onClick={() => voidInvoice(agent.id, inv.id)}
                                          disabled={sending === `void-${inv.id}`}
                                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                                        >
                                          {sending === `void-${inv.id}` ? 'Voiding...' : 'Void'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Monthly Invoice */}
                          {monthlyStatus === 'overdue' && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-luxury-gray-2">Monthly Fee Invoice</p>
                                <button
                                  onClick={() => setShowMonthlyForm(showMonthlyForm === agent.id ? null : agent.id)}
                                  className="text-xs text-luxury-accent hover:underline"
                                >
                                  {showMonthlyForm === agent.id ? 'Cancel' : '+ Send Monthly Invoice'}
                                </button>
                              </div>
                              {showMonthlyForm === agent.id && (
                                <div className="inner-card space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs text-luxury-gray-3 mb-1">Month</label>
                                      <select value={invoiceMonth} onChange={e => setInvoiceMonth(e.target.value)} className="select-luxury text-xs">
                                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-luxury-gray-3 mb-1">Year</label>
                                      <select value={invoiceYear} onChange={e => setInvoiceYear(parseInt(e.target.value))} className="select-luxury text-xs">
                                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <p className="text-xs text-luxury-gray-3">
                                    Will send: <span className="font-medium text-luxury-gray-1">{invoiceMonth} {invoiceYear} Monthly Brokerage Fee — $50</span>
                                  </p>
                                  <button
                                    onClick={() => sendMonthlyInvoice(agent.id)}
                                    disabled={creatingInvoice === agent.id}
                                    className="btn btn-primary text-xs w-full disabled:opacity-50"
                                  >
                                    {creatingInvoice === agent.id ? 'Sending...' : 'Create & Send Monthly Invoice'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

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
                                    <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} className="input-luxury text-xs" placeholder="0.00" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-luxury-gray-3 mb-1">Description</label>
                                    <input type="text" value={customDesc} onChange={e => setCustomDesc(e.target.value)} className="input-luxury text-xs" placeholder="e.g. HAR dues reimbursement" />
                                  </div>
                                </div>
                                <button
                                  onClick={() => createAndSendCustomInvoice(agent.id)}
                                  disabled={!customAmount || !customDesc || creatingInvoice === agent.id}
                                  className="btn btn-primary text-xs w-full disabled:opacity-50"
                                >
                                  {creatingInvoice === agent.id ? 'Sending...' : 'Send Invoice'}
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
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="container-card text-center py-12">
            <p className="text-sm text-luxury-gray-3">No agents found</p>
          </div>
        )}
      </div>
    </div>
  )
}