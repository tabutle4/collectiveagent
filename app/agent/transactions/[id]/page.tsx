'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Save, FileText, Upload, Check, X, Plus, Trash2, ArrowLeft } from 'lucide-react'
import { ProcessingFeeType } from '@/lib/transactions/types'
import { getVisibleSlides, TENANT_TYPES, LOAN_TYPES, LEAD_SOURCES, FLYER_DIVISIONS, SlideConfig } from '@/lib/transactions/constants'
import SummaryPanel from '@/components/transactions/SummaryPanel'
import StatusBadge from '@/components/transactions/StatusBadge'
import { TransactionStatus } from '@/lib/transactions/types'
import { toTitleCase, formatAddress, formatState, formatPhone, formatMoney, buildPropertyAddress } from '@/lib/transactions/utils'

interface Client {
  name: string
  email: string
  phone: string
}

interface TransactionForm {
  transaction_type: string
  transaction_type_name: string
  is_lease: boolean
  processing_fee: number
  processing_fee_type_id: string
  street_address: string
  unit_suite: string
  city: string
  state_code: string
  zip_code: string
  county: string
  mls_link: string
  mls_number: string
  mls_type: string
  clients: Client[]
  sales_price: string
  monthly_rent: string
  gross_commission: string
  gross_commission_type: string
  listing_side_commission: string
  listing_side_commission_type: string
  buying_side_commission: string
  buying_side_commission_type: string
  additional_client_commission: string
  bonus_amount: string
  rebate_amount: string
  listing_date: string
  listing_expiration_date: string
  buyer_agreement_date: string
  buyer_agreement_expiration_date: string
  acceptance_date: string
  closing_date: string
  move_in_date: string
  lease_term: string
  is_intermediary: boolean
  intermediary_agent_id: string
  intermediary_agent_type: string
  tenant_transaction_type: string
  loan_type: string
  lead_source: string
  flyer_division: string
  expedite_requested: boolean
  notes: string
  office_location: string
  brokerage_referral: boolean
  brokerage_referral_fee: string
  brokerage_referral_fee_type: string
  internal_referral: boolean
  internal_referral_fee: string
  internal_referral_fee_type: string
  external_referral: boolean
  external_referral_fee: string
  external_referral_fee_type: string
  has_btsa: boolean
  btsa_amount: string
  has_ecommission: boolean
  ecommission_amount: string
  title_officer_name: string
  title_company: string
  title_company_email: string
}

const emptyClient: Client = { name: '', email: '', phone: '' }

function parseAddress(full: string): { street: string; unit: string; city: string; state: string; zip: string } {
  if (!full) return { street: '', unit: '', city: '', state: 'TX', zip: '' }
  // Try to parse "Street, Unit, City, State ZIP" or "Street, City, State, ZIP"
  const parts = full.split(',').map(s => s.trim())
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1]
    const secondLast = parts[parts.length - 2]
    // Check if last part is ZIP
    const zipMatch = lastPart.match(/^(\d{5})(-\d{4})?$/)
    // Check if second-to-last is state
    const stateMatch = secondLast.match(/^([A-Z]{2})$/)
    if (zipMatch && stateMatch) {
      return { street: parts[0], unit: '', city: parts.length > 3 ? parts[parts.length - 3] : '', state: secondLast, zip: lastPart }
    }
    // "Street, City, TX 77001"
    const stateZip = lastPart.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/)
    if (stateZip) {
      return { street: parts[0], unit: '', city: parts.length > 2 ? parts[parts.length - 2] : '', state: stateZip[1], zip: stateZip[2] }
    }
    // "Street, City, State, ZIP" with separate state and zip
    if (parts.length >= 4) {
      return { street: parts[0], unit: '', city: parts[1], state: parts[2], zip: parts[3] }
    }
    return { street: parts[0], unit: '', city: parts[1], state: '', zip: parts[2] || '' }
  }
  return { street: full, unit: '', city: '', state: 'TX', zip: '' }
}

export default function EditTransactionPage() {
  const router = useRouter()
  const params = useParams()
  const txnId = params.id as string

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
  const [transaction, setTransaction] = useState<any>(null)
  const [transactionTypes, setTransactionTypes] = useState<ProcessingFeeType[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [requiredDocs, setRequiredDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<TransactionForm | null>(null)
  const [showMobileRight, setShowMobileRight] = useState(false)
  const [contactSuggestions, setContactSuggestions] = useState<any[]>([])
  const [showContactSuggestions, setShowContactSuggestions] = useState<string | null>(null)
  const [agentSearch, setAgentSearch] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => { loadAll() }, [txnId])

  const loadAll = async () => {
    try {
      setUser(user)

      const [txnRes, typesRes, agentsRes, teamsRes, contactsRes, intAgentsRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('id', txnId).single(),
        supabase.from('processing_fee_types').select('*').eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, team_name, commission_plan, is_active').eq('is_active', true).order('preferred_first_name', { ascending: true }),
        supabase.from('users').select('team_name').not('team_name', 'is', null).not('team_name', 'eq', ''),
        supabase.from('transaction_contacts').select('*').eq('transaction_id', txnId),
        supabase.from('transaction_internal_agents').select('*').eq('transaction_id', txnId),
      ])

      if (txnRes.error || !txnRes.data) { router.push('/transactions'); return }
      const txn = txnRes.data
      setTransaction(txn)
      setTransactionTypes(typesRes.data || [])
      setAgents(agentsRes.data || [])
      const uniqueTeams = Array.from(new Set((teamsRes.data || []).map((u: any) => u.team_name).filter(Boolean))) as string[]
      setTeams(uniqueTeams.sort())

      // Find the matching transaction type
      const matchedType = (typesRes.data || []).find((t: any) => t.name === txn.transaction_type)

      // Parse address
      const addr = parseAddress(txn.property_address || '')

      // Parse contacts
      const clientContacts = (contactsRes.data || []).filter((c: any) => c.contact_type === 'client')
      const titleContact = (contactsRes.data || []).find((c: any) => c.contact_type === 'title')
      const clients: Client[] = clientContacts.length > 0
        ? clientContacts.map((c: any) => ({
            name: c.name || '',
            email: c.email ? (typeof c.email === 'string' ? c.email : JSON.parse(c.email)?.[0] || '') : '',
            phone: c.phone ? (typeof c.phone === 'string' ? c.phone : JSON.parse(c.phone)?.[0] || '') : '',
          }))
        : [{ name: txn.client_name || '', email: txn.client_email || '', phone: txn.client_phone || '' }]
      if (clients.length === 0 || !clients[0].name) clients.push({ ...emptyClient })

      // Check for intermediary (second agent)
      const myAgentRow = (intAgentsRes.data || []).find((a: any) => a.agent_id === user?.id)
      const otherAgentRow = (intAgentsRes.data || []).find((a: any) => a.agent_id !== user?.id)
      const isIntermediary = txn.representing === 'intermediary' || txn.representation_type === 'intermediary'

      // Parse notes (jsonb)
      let notesText = ''
      if (txn.notes) {
        try {
          const notesArr = typeof txn.notes === 'string' ? JSON.parse(txn.notes) : txn.notes
          if (Array.isArray(notesArr) && notesArr.length > 0) notesText = notesArr[0].text || ''
        } catch { notesText = typeof txn.notes === 'string' ? txn.notes : '' }
      }

      setForm({
        transaction_type: matchedType?.id || '',
        transaction_type_name: txn.transaction_type || '',
        is_lease: matchedType?.is_lease || false,
        processing_fee: matchedType?.processing_fee || 0,
        processing_fee_type_id: matchedType?.id || '',
        street_address: addr.street,
        unit_suite: addr.unit,
        city: addr.city,
        state_code: addr.state || 'TX',
        zip_code: addr.zip,
        county: txn.county || '',
        mls_link: txn.mls_link || '',
        mls_number: txn.mls_number || '',
        mls_type: txn.mls_type || '',
        clients,
        sales_price: txn.sales_price?.toString() || '',
        monthly_rent: txn.monthly_rent?.toString() || '',
        gross_commission: txn.gross_commission?.toString() || '',
        gross_commission_type: txn.gross_commission_type || 'percent',
        listing_side_commission: txn.listing_side_commission?.toString() || '',
        listing_side_commission_type: txn.listing_side_commission_type || 'percent',
        buying_side_commission: txn.buying_side_commission?.toString() || '',
        buying_side_commission_type: txn.buying_side_commission_type || 'percent',
        additional_client_commission: txn.additional_client_commission?.toString() || '',
        bonus_amount: txn.bonus_amount?.toString() || '',
        rebate_amount: txn.rebate_amount?.toString() || '',
        listing_date: txn.listing_date || '',
        listing_expiration_date: txn.listing_expiration_date || '',
        buyer_agreement_date: txn.buyer_agreement_date || '',
        buyer_agreement_expiration_date: txn.buyer_agreement_expiration_date || '',
        acceptance_date: txn.acceptance_date || '',
        closing_date: txn.closing_date || '',
        move_in_date: txn.move_in_date || '',
        lease_term: txn.lease_term?.toString() || '',
        is_intermediary: isIntermediary,
        intermediary_agent_id: otherAgentRow?.agent_id || '',
        intermediary_agent_type: otherAgentRow?.agent_role || '',
        tenant_transaction_type: txn.tenant_transaction_type || '',
        loan_type: txn.loan_type || '',
        lead_source: txn.lead_source || '',
        flyer_division: txn.flyer_division || '',
        expedite_requested: txn.expedite_requested || false,
        notes: notesText,
        office_location: txn.office_location || '',
        brokerage_referral: txn.brokerage_referral || false,
        brokerage_referral_fee: txn.brokerage_referral_fee?.toString() || '',
        brokerage_referral_fee_type: 'percent',
        internal_referral: txn.internal_referral || false,
        internal_referral_fee: txn.internal_referral_fee?.toString() || '',
        internal_referral_fee_type: 'percent',
        external_referral: txn.external_referral || false,
        external_referral_fee: txn.external_referral_fee?.toString() || '',
        external_referral_fee_type: 'percent',
        has_btsa: txn.has_btsa || false,
        btsa_amount: txn.btsa_amount?.toString() || '',
        has_ecommission: txn.has_ecommission || false,
        ecommission_amount: txn.ecommission_amount?.toString() || '',
        title_officer_name: titleContact?.name || txn.title_officer_name || '',
        title_company: titleContact?.company || txn.title_company || '',
        title_company_email: titleContact?.email ? (typeof titleContact.email === 'string' ? titleContact.email : JSON.parse(titleContact.email)?.[0] || '') : txn.title_company_email || '',
      })

      // Set agent search if intermediary
      if (otherAgentRow) {
        const otherAgent = (agentsRes.data || []).find((a: any) => a.id === otherAgentRow.agent_id)
        if (otherAgent) setAgentSearch(`${otherAgent.preferred_first_name || otherAgent.first_name} ${otherAgent.preferred_last_name || otherAgent.last_name}`)
      }

      // Load required docs
      if (matchedType) {
        const { data: docs } = await supabase.from('required_documents').select('*').eq('processing_fee_type_id', matchedType.id).eq('is_active', true).order('display_order', { ascending: true })
        setRequiredDocs(docs || [])
      }
    } catch (error) { console.error('Error loading transaction:', error) }
    finally { setLoading(false) }
  }

  const searchContacts = useCallback(async (query: string, fieldKey: string) => {
    if (query.length < 2) { setContactSuggestions([]); setShowContactSuggestions(null); return }
    const { data } = await supabase.from('transaction_contacts').select('name, email, phone, company, contact_type').ilike('name', `%${query}%`).limit(5)
    if (data && data.length > 0) { setContactSuggestions(data); setShowContactSuggestions(fieldKey) }
    else { setContactSuggestions([]); setShowContactSuggestions(null) }
  }, [])

  if (loading || !form) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading transaction...</div>
  if (!transaction) return <div className="text-center py-12"><p className="text-sm text-red-600">Transaction not found</p></div>

  const visibleSlides = getVisibleSlides(form.is_lease)
  const selectedType = transactionTypes.find(t => t.id === form.transaction_type)
  const isLocked = ['closed', 'cancelled'].includes(transaction.status)
  const isSubmitted = ['submitted', 'in_review'].includes(transaction.status)

  const updateForm = (field: keyof TransactionForm, value: any) => {
    setForm(prev => prev ? { ...prev, [field]: value } : prev)
  }

  const updateClient = (index: number, field: keyof Client, value: string) => {
    setForm(prev => {
      if (!prev) return prev
      const clients = [...prev.clients]
      clients[index] = { ...clients[index], [field]: value }
      return { ...prev, clients }
    })
  }

  const addClient = () => setForm(prev => prev ? { ...prev, clients: [...prev.clients, { ...emptyClient }] } : prev)
  const removeClient = (index: number) => {
    if (form.clients.length <= 1) return
    setForm(prev => prev ? { ...prev, clients: prev.clients.filter((_, i) => i !== index) } : prev)
  }

  const scrollToSlide = (slideId: string) => {
    slideRefs.current[slideId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isSlideComplete = (slide: SlideConfig): boolean => {
    switch (slide.id) {
      case 'type': return !!form.transaction_type
      case 'property': return !!form.street_address && !!form.city
      case 'client': return !!form.clients[0]?.name
      case 'financials': return !!(form.sales_price || form.monthly_rent)
      case 'dates': return !!(form.closing_date || form.move_in_date)
      case 'details': return !!form.lead_source
      case 'title_info': return !!form.title_company
      default: return false
    }
  }

  const handleSave = async () => {
    if (!user || isLocked) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const address = buildPropertyAddress(form.street_address, form.unit_suite, form.city, form.state_code, form.zip_code)
      const primaryClient = form.clients[0]

      const payload: any = {
        property_address: address || transaction.property_address,
        transaction_type: form.transaction_type_name || null,
        representing: form.is_intermediary ? 'intermediary' : null,
        representation_type: form.is_intermediary ? 'intermediary' : null,
        mls_link: form.mls_link || null,
        mls_number: form.mls_number || null,
        mls_type: form.mls_type || null,
        county: form.county || null,
        office_location: form.office_location || null,
        client_name: primaryClient?.name ? toTitleCase(primaryClient.name) : null,
        client_email: primaryClient?.email?.toLowerCase() || null,
        client_phone: primaryClient?.phone || null,
        lead_source: form.lead_source || null,
        sales_price: form.sales_price ? parseFloat(form.sales_price) : null,
        monthly_rent: form.monthly_rent ? parseFloat(form.monthly_rent) : null,
        gross_commission: form.gross_commission ? parseFloat(form.gross_commission) : null,
        gross_commission_type: form.gross_commission_type || 'amount',
        listing_side_commission: form.listing_side_commission ? parseFloat(form.listing_side_commission) : null,
        listing_side_commission_type: form.listing_side_commission_type || 'amount',
        buying_side_commission: form.buying_side_commission ? parseFloat(form.buying_side_commission) : null,
        buying_side_commission_type: form.buying_side_commission_type || 'amount',
        additional_client_commission: form.additional_client_commission ? parseFloat(form.additional_client_commission) : 0,
        bonus_amount: form.bonus_amount ? parseFloat(form.bonus_amount) : 0,
        rebate_amount: form.rebate_amount ? parseFloat(form.rebate_amount) : 0,
        listing_date: form.listing_date || null,
        listing_expiration_date: form.listing_expiration_date || null,
        buyer_agreement_date: form.buyer_agreement_date || null,
        buyer_agreement_expiration_date: form.buyer_agreement_expiration_date || null,
        acceptance_date: form.acceptance_date || null,
        closing_date: form.closing_date || null,
        move_in_date: form.move_in_date || null,
        lease_term: form.lease_term ? parseInt(form.lease_term) : null,
        tenant_transaction_type: form.tenant_transaction_type || null,
        flyer_division: form.flyer_division || null,
        expedite_requested: form.expedite_requested,
        expedite_fee: form.expedite_requested ? 95 : 0,
        brokerage_referral: form.brokerage_referral,
        brokerage_referral_fee: form.brokerage_referral_fee ? parseFloat(form.brokerage_referral_fee) : 0,
        internal_referral: form.internal_referral,
        internal_referral_fee: form.internal_referral_fee ? parseFloat(form.internal_referral_fee) : 0,
        external_referral: form.external_referral,
        external_referral_fee: form.external_referral_fee ? parseFloat(form.external_referral_fee) : 0,
        has_btsa: form.has_btsa,
        btsa_amount: form.btsa_amount ? parseFloat(form.btsa_amount) : 0,
        has_ecommission: form.has_ecommission,
        ecommission_amount: form.ecommission_amount ? parseFloat(form.ecommission_amount) : 0,
        has_referral: form.brokerage_referral || form.internal_referral || form.external_referral,
        title_officer_name: form.title_officer_name ? toTitleCase(form.title_officer_name) : null,
        title_company: form.title_company ? toTitleCase(form.title_company) : null,
        title_company_email: form.title_company_email?.toLowerCase() || null,
      }

      // Handle notes (preserve existing, append if changed)
      if (form.notes) {
        let existingNotes: any[] = []
        try { existingNotes = typeof transaction.notes === 'string' ? JSON.parse(transaction.notes) : (transaction.notes || []) } catch { existingNotes = [] }
        if (!Array.isArray(existingNotes)) existingNotes = []
        const lastNote = existingNotes[existingNotes.length - 1]
        if (!lastNote || lastNote.text !== form.notes) {
          existingNotes.push({ text: form.notes, date: new Date().toISOString(), by: user?.id })
        }
        payload.notes = JSON.stringify(existingNotes)
      }

      const { error } = await supabase.from('transactions').update(payload).eq('id', txnId)
      if (error) throw error

      // Upsert contacts
      for (const client of form.clients) {
        if (client.name) {
          await supabase.from('transaction_contacts').upsert({
            transaction_id: txnId,
            contact_type: 'client',
            name: toTitleCase(client.name),
            email: client.email ? JSON.stringify([client.email.toLowerCase()]) : null,
            phone: client.phone ? JSON.stringify([client.phone]) : null,
          }, { onConflict: 'transaction_id,contact_type,name' }).select()
        }
      }
      if (form.title_company) {
        await supabase.from('transaction_contacts').upsert({
          transaction_id: txnId,
          contact_type: 'title',
          name: toTitleCase(form.title_officer_name || form.title_company),
          company: toTitleCase(form.title_company),
          email: form.title_company_email ? JSON.stringify([form.title_company_email.toLowerCase()]) : null,
        }, { onConflict: 'transaction_id,contact_type,name' }).select()
      }

      setSaveMessage('Transaction saved.')
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error: any) {
      console.error('Error saving:', error)
      alert(`Failed to save: ${error.message}`)
    } finally { setSaving(false) }
  }

  const filteredAgents = agentSearch
    ? agents.filter(a => {
        const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
        return name.includes(agentSearch.toLowerCase()) && a.id !== user?.id
      })
    : []

  // CommInput helper
  const CommInput = ({ label, value, type, onValue, onType }: { label: string; value: string; type: string; onValue: (v: string) => void; onType: (t: string) => void }) => (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex gap-2">
        <input className="input-luxury flex-1" type="number" step="0.01" value={value} onChange={(e) => onValue(e.target.value)} placeholder="0.00" disabled={isLocked} />
        <select className="select-luxury w-20" value={type} onChange={(e) => onType(e.target.value)} disabled={isLocked}>
          <option value="percent">%</option><option value="amount">$</option>
        </select>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push('/transactions')} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors mb-1 block">← Back to Transactions</button>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{form.street_address ? buildPropertyAddress(form.street_address, form.unit_suite, form.city, form.state_code, form.zip_code) : 'EDIT TRANSACTION'}</h1>
            <StatusBadge status={transaction.status as TransactionStatus} />
          </div>
        </div>
        <div className="flex gap-2">
          {!isLocked && (
            <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button onClick={() => setShowMobileRight(!showMobileRight)} className="btn btn-secondary lg:hidden flex items-center gap-1.5">
            <FileText size={14} /> Progress
          </button>
        </div>
      </div>

      {saveMessage && <div className="alert-success mb-4">{saveMessage}</div>}
      {isLocked && <div className="alert-warning mb-4">This transaction is {transaction.status} and cannot be edited.</div>}
      {isSubmitted && <div className="alert-info mb-4">This transaction has been submitted for compliance. Some fields may be restricted.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className={`${showMobileRight ? 'hidden lg:block' : ''} lg:col-span-8 space-y-5`}>

          {/* TYPE (read-only after creation) */}
          <div ref={el => { slideRefs.current['type'] = el }} className="container-card">
            <h2 className="section-title">Transaction Type</h2>
            <div className="inner-card">
              <p className="text-sm font-semibold text-luxury-gray-1">{form.transaction_type_name || 'Not set'}</p>
              {form.processing_fee > 0 && <p className="text-xs text-luxury-gray-3 mt-1">Processing fee: {formatMoney(form.processing_fee)}</p>}
              {form.is_lease && <p className="text-xs text-blue-600 mt-1">Lease Transaction</p>}
            </div>
          </div>

          {/* PROPERTY */}
          <div ref={el => { slideRefs.current['property'] = el }} className="container-card">
            <h2 className="section-title">Property Details</h2>
            <div className="space-y-4">
              <div>
                <label className="field-label">Street Address</label>
                <input className="input-luxury" value={form.street_address} onChange={(e) => updateForm('street_address', e.target.value)} onBlur={(e) => updateForm('street_address', formatAddress(e.target.value))} disabled={isLocked} />
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div><label className="field-label">Unit</label><input className="input-luxury" value={form.unit_suite} onChange={(e) => updateForm('unit_suite', e.target.value)} disabled={isLocked} /></div>
                <div><label className="field-label">City</label><input className="input-luxury" value={form.city} onChange={(e) => updateForm('city', e.target.value)} onBlur={(e) => updateForm('city', toTitleCase(e.target.value))} disabled={isLocked} /></div>
                <div><label className="field-label">State</label><input className="input-luxury" value={form.state_code} onChange={(e) => updateForm('state_code', e.target.value)} onBlur={(e) => updateForm('state_code', formatState(e.target.value))} disabled={isLocked} maxLength={2} /></div>
                <div><label className="field-label">ZIP</label><input className="input-luxury" value={form.zip_code} onChange={(e) => updateForm('zip_code', e.target.value)} disabled={isLocked} /></div>
                <div><label className="field-label">County</label><input className="input-luxury" value={form.county} onChange={(e) => updateForm('county', e.target.value)} onBlur={(e) => updateForm('county', toTitleCase(e.target.value))} disabled={isLocked} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">MLS Number</label><input className="input-luxury" value={form.mls_number} onChange={(e) => updateForm('mls_number', e.target.value)} disabled={isLocked} /></div>
                <div><label className="field-label">MLS Type</label><select className="select-luxury" value={form.mls_type} onChange={(e) => updateForm('mls_type', e.target.value)} disabled={isLocked}><option value="">Select...</option><option value="HAR">HAR</option><option value="NTREIS">NTREIS</option><option value="MetroTex">MetroTex</option><option value="Other">Other</option></select></div>
                <div><label className="field-label">MLS Link</label><input className="input-luxury" value={form.mls_link} onChange={(e) => updateForm('mls_link', e.target.value)} disabled={isLocked} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Lead Source</label><select className="select-luxury" value={form.lead_source} onChange={(e) => updateForm('lead_source', e.target.value)} disabled={isLocked}><option value="">Select...</option>{LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                <div><label className="field-label">Office</label><select className="select-luxury" value={form.office_location} onChange={(e) => updateForm('office_location', e.target.value)} disabled={isLocked}><option value="">Select...</option><option value="Houston">Houston</option><option value="DFW">DFW</option></select></div>
              </div>
              <div><label className="field-label">Notes</label><textarea className="textarea-luxury" rows={3} value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} disabled={isLocked} /></div>
            </div>
          </div>

          {/* CLIENTS */}
          <div ref={el => { slideRefs.current['client'] = el }} className="container-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title mb-0">Clients</h2>
              {!isLocked && <button onClick={addClient} className="btn btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Add Client</button>}
            </div>
            <div className="space-y-4">
              {form.clients.map((client, idx) => (
                <div key={idx} className={form.clients.length > 1 ? 'inner-card' : ''}>
                  {form.clients.length > 1 && (
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-luxury-gray-2">{idx === 0 ? 'Primary Client' : `Client ${idx + 1}`}</p>
                      {idx > 0 && !isLocked && <button onClick={() => removeClient(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div><label className="field-label">Name</label><input className="input-luxury" value={client.name} onChange={(e) => updateClient(idx, 'name', e.target.value)} onBlur={(e) => updateClient(idx, 'name', toTitleCase(e.target.value))} disabled={isLocked} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="field-label">Email</label><input className="input-luxury" type="email" value={client.email} onChange={(e) => updateClient(idx, 'email', e.target.value)} disabled={isLocked} /></div>
                      <div><label className="field-label">Phone</label><input className="input-luxury" value={client.phone} onChange={(e) => updateClient(idx, 'phone', formatPhone(e.target.value))} disabled={isLocked} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FINANCIALS */}
          <div ref={el => { slideRefs.current['financials'] = el }} className="container-card">
            <h2 className="section-title">Financial Details</h2>
            <div className="space-y-4">
              {form.is_lease ? (
                <div><label className="field-label">Monthly Rent</label><input className="input-luxury" type="number" step="0.01" value={form.monthly_rent} onChange={(e) => updateForm('monthly_rent', e.target.value)} disabled={isLocked} /></div>
              ) : (
                <div><label className="field-label">Sales Price</label><input className="input-luxury" type="number" step="0.01" value={form.sales_price} onChange={(e) => updateForm('sales_price', e.target.value)} disabled={isLocked} /></div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CommInput label="Gross Commission" value={form.gross_commission} type={form.gross_commission_type} onValue={(v) => updateForm('gross_commission', v)} onType={(t) => updateForm('gross_commission_type', t)} />
                <CommInput label="Listing Side" value={form.listing_side_commission} type={form.listing_side_commission_type} onValue={(v) => updateForm('listing_side_commission', v)} onType={(t) => updateForm('listing_side_commission_type', t)} />
                <CommInput label="Buying Side" value={form.buying_side_commission} type={form.buying_side_commission_type} onValue={(v) => updateForm('buying_side_commission', v)} onType={(t) => updateForm('buying_side_commission_type', t)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Additional Client Commission ($)</label><input className="input-luxury" type="number" step="0.01" value={form.additional_client_commission} onChange={(e) => updateForm('additional_client_commission', e.target.value)} disabled={isLocked} /></div>
                <div><label className="field-label">Bonus ($)</label><input className="input-luxury" type="number" step="0.01" value={form.bonus_amount} onChange={(e) => updateForm('bonus_amount', e.target.value)} disabled={isLocked} /></div>
                <div><label className="field-label">Rebate ($)</label><input className="input-luxury" type="number" step="0.01" value={form.rebate_amount} onChange={(e) => updateForm('rebate_amount', e.target.value)} disabled={isLocked} /></div>
              </div>
            </div>
          </div>

          {/* DATES */}
          <div ref={el => { slideRefs.current['dates'] = el }} className="container-card">
            <h2 className="section-title">Key Dates</h2>
            <div className="space-y-4">
              {form.is_lease ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Move-in Date</label><input className="input-luxury" type="date" value={form.move_in_date} onChange={(e) => updateForm('move_in_date', e.target.value)} disabled={isLocked} /></div>
                  <div><label className="field-label">Lease Term (months)</label><input className="input-luxury" type="number" value={form.lease_term} onChange={(e) => updateForm('lease_term', e.target.value)} disabled={isLocked} /></div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Listing Date</label><input className="input-luxury" type="date" value={form.listing_date} onChange={(e) => updateForm('listing_date', e.target.value)} disabled={isLocked} /></div>
                    <div><label className="field-label">Listing Expiration</label><input className="input-luxury" type="date" value={form.listing_expiration_date} onChange={(e) => updateForm('listing_expiration_date', e.target.value)} disabled={isLocked} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Buyer Agreement Date</label><input className="input-luxury" type="date" value={form.buyer_agreement_date} onChange={(e) => updateForm('buyer_agreement_date', e.target.value)} disabled={isLocked} /></div>
                    <div><label className="field-label">Buyer Agreement Expiration</label><input className="input-luxury" type="date" value={form.buyer_agreement_expiration_date} onChange={(e) => updateForm('buyer_agreement_expiration_date', e.target.value)} disabled={isLocked} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Acceptance Date</label><input className="input-luxury" type="date" value={form.acceptance_date} onChange={(e) => updateForm('acceptance_date', e.target.value)} disabled={isLocked} /></div>
                    <div><label className="field-label">Closing Date</label><input className="input-luxury" type="date" value={form.closing_date} onChange={(e) => updateForm('closing_date', e.target.value)} disabled={isLocked} /></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* DETAILS */}
          <div ref={el => { slideRefs.current['details'] = el }} className="container-card">
            <h2 className="section-title">Additional Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {form.is_lease && (
                  <div><label className="field-label">Tenant Type</label><select className="select-luxury" value={form.tenant_transaction_type} onChange={(e) => updateForm('tenant_transaction_type', e.target.value)} disabled={isLocked}><option value="">Select...</option>{TENANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                )}
                {!form.is_lease && (
                  <div><label className="field-label">Loan Type</label><select className="select-luxury" value={form.loan_type} onChange={(e) => updateForm('loan_type', e.target.value)} disabled={isLocked}><option value="">Select...</option>{LOAN_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                )}
                <div><label className="field-label">Flyer Division or Team</label><select className="select-luxury" value={form.flyer_division} onChange={(e) => updateForm('flyer_division', e.target.value)} disabled={isLocked}><option value="">Select...</option><optgroup label="Divisions">{FLYER_DIVISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</optgroup>{teams.length > 0 && <optgroup label="Teams">{teams.map(t => <option key={t} value={`team:${t}`}>{t}</option>)}</optgroup>}</select></div>
              </div>

              {/* Referrals */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Referrals</h3>
                <div className="space-y-3">
                  <label className="checkbox-label"><input type="checkbox" checked={form.brokerage_referral} onChange={(e) => updateForm('brokerage_referral', e.target.checked)} className="w-4 h-4" disabled={isLocked} />Brokerage Referral</label>
                  {form.brokerage_referral && <div className="flex gap-2"><input className="input-luxury flex-1" type="number" step="0.01" value={form.brokerage_referral_fee} onChange={(e) => updateForm('brokerage_referral_fee', e.target.value)} disabled={isLocked} /><select className="select-luxury w-20" value={form.brokerage_referral_fee_type} onChange={(e) => updateForm('brokerage_referral_fee_type', e.target.value)} disabled={isLocked}><option value="percent">%</option><option value="flat">$</option></select></div>}
                  <label className="checkbox-label"><input type="checkbox" checked={form.internal_referral} onChange={(e) => updateForm('internal_referral', e.target.checked)} className="w-4 h-4" disabled={isLocked} />Internal Agent Referral</label>
                  {form.internal_referral && <div className="flex gap-2"><input className="input-luxury flex-1" type="number" step="0.01" value={form.internal_referral_fee} onChange={(e) => updateForm('internal_referral_fee', e.target.value)} disabled={isLocked} /><select className="select-luxury w-20" value={form.internal_referral_fee_type} onChange={(e) => updateForm('internal_referral_fee_type', e.target.value)} disabled={isLocked}><option value="percent">%</option><option value="flat">$</option></select></div>}
                  <label className="checkbox-label"><input type="checkbox" checked={form.external_referral} onChange={(e) => updateForm('external_referral', e.target.checked)} className="w-4 h-4" disabled={isLocked} />External Agent Referral</label>
                  {form.external_referral && <div className="flex gap-2"><input className="input-luxury flex-1" type="number" step="0.01" value={form.external_referral_fee} onChange={(e) => updateForm('external_referral_fee', e.target.value)} disabled={isLocked} /><select className="select-luxury w-20" value={form.external_referral_fee_type} onChange={(e) => updateForm('external_referral_fee_type', e.target.value)} disabled={isLocked}><option value="percent">%</option><option value="flat">$</option></select></div>}
                </div>
              </div>

              {/* BTSA / eCommission / Expedite */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.has_btsa} onChange={(e) => updateForm('has_btsa', e.target.checked)} className="w-4 h-4" disabled={isLocked} /><span className="font-semibold">BTSA</span></label>
                  {form.has_btsa && <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.btsa_amount} onChange={(e) => updateForm('btsa_amount', e.target.value)} disabled={isLocked} /></div>}
                </div>
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.has_ecommission} onChange={(e) => updateForm('has_ecommission', e.target.checked)} className="w-4 h-4" disabled={isLocked} /><span className="font-semibold">eCommission</span></label>
                  {form.has_ecommission && <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.ecommission_amount} onChange={(e) => updateForm('ecommission_amount', e.target.value)} disabled={isLocked} /></div>}
                </div>
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.expedite_requested} onChange={(e) => updateForm('expedite_requested', e.target.checked)} className="w-4 h-4" disabled={isLocked} /><span className="font-semibold">Expedite ($95)</span></label>
                </div>
              </div>
            </div>
          </div>

          {/* TITLE INFO (sales only) */}
          {!form.is_lease && (
            <div ref={el => { slideRefs.current['title_info'] = el }} className="container-card">
              <h2 className="section-title">Title Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="field-label">Title Company</label><input className="input-luxury" value={form.title_company} onChange={(e) => updateForm('title_company', e.target.value)} onBlur={(e) => updateForm('title_company', toTitleCase(e.target.value))} disabled={isLocked} /></div>
                <div><label className="field-label">Title Officer</label><input className="input-luxury" value={form.title_officer_name} onChange={(e) => updateForm('title_officer_name', e.target.value)} onBlur={(e) => updateForm('title_officer_name', toTitleCase(e.target.value))} disabled={isLocked} /></div>
                <div><label className="field-label">Title Company Email</label><input className="input-luxury" type="email" value={form.title_company_email} onChange={(e) => updateForm('title_company_email', e.target.value)} disabled={isLocked} /></div>
              </div>
            </div>
          )}

          {/* DOCUMENTS */}
          <div ref={el => { slideRefs.current['documents'] = el }} className="container-card">
            <div className="flex items-center justify-between mb-1">
              <h2 className="section-title mb-0">Documents</h2>
              {transaction.transaction_email && <span className="text-xs text-luxury-gray-3">Email docs to: <span className="font-medium text-luxury-gray-1 bg-luxury-light px-2 py-0.5 rounded select-all">{transaction.transaction_email}</span></span>}
            </div>
            {requiredDocs.length > 0 && (
              <div className="inner-card mb-4 mt-4">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Required Documents for {form.transaction_type_name}</h3>
                <div className="space-y-1.5">
                  {requiredDocs.map(doc => (
                    <div key={doc.id} className="checklist-item">
                      <div className="checklist-check" />
                      <span>{doc.name}</span>
                      {doc.is_required && <span className="text-red-500 ml-1">*</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!isLocked && (
              <div className="upload-zone py-10">
                <Upload size={24} className="mx-auto text-luxury-gray-3 mb-2" />
                <p className="text-xs text-luxury-gray-3 mb-1">Drag and drop files here or click to browse</p>
              </div>
            )}
          </div>

          {/* SAVE */}
          {!isLocked && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
                <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className={`${showMobileRight ? 'block' : 'hidden'} lg:block lg:col-span-4`}>
          <div className="lg:sticky lg:top-4 space-y-5">
            <div className="container-card p-3">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="section-title mb-0">Progress</h2>
                {showMobileRight && <button onClick={() => setShowMobileRight(false)} className="lg:hidden text-luxury-gray-3"><X size={16} /></button>}
              </div>
              <div className="space-y-0.5">
                {visibleSlides.map((slide) => {
                  const done = isSlideComplete(slide)
                  return (
                    <button key={slide.id} onClick={() => { scrollToSlide(slide.id); setShowMobileRight(false) }} className="slide-nav-item flex items-center gap-2 w-full">
                      <div className={done ? 'checklist-check-done' : 'checklist-check'}>{done && <Check size={8} />}</div>
                      <span className={done ? 'text-luxury-gray-1' : ''}>{slide.title}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 px-1">
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${(visibleSlides.filter(s => isSlideComplete(s)).length / visibleSlides.length) * 100}%` }} />
                </div>
              </div>
            </div>

            {user && (
              <div className="container-card">
                <h2 className="section-title">Agent</h2>
                <div className="space-y-2">
                  <div className="summary-row"><p className="summary-label">Name</p><p className="summary-value">{user.preferred_first_name || user.first_name} {user.preferred_last_name || user.last_name}</p></div>
                  <div className="summary-row"><p className="summary-label">Commission Plan</p><p className="summary-value">{user.commission_plan || 'N/A'}</p></div>
                  {user.team_name && <div className="summary-row"><p className="summary-label">Team</p><p className="summary-value">{user.team_name}</p></div>}
                  <div className="summary-row"><p className="summary-label">Office</p><p className="summary-value">{user.office || 'N/A'}</p></div>
                </div>
              </div>
            )}

            <SummaryPanel
              typeName={selectedType?.name || form.transaction_type_name || null}
              typeId={form.transaction_type}
              isLease={form.is_lease}
              propertyAddress={form.street_address ? buildPropertyAddress(form.street_address, form.unit_suite, form.city, form.state_code, form.zip_code) : ''}
              clientName={form.clients[0]?.name || ''}
              salesPrice={form.sales_price}
              monthlyRent={form.monthly_rent}
              commissionRate={form.gross_commission}
              closingDate={form.closing_date}
              moveInDate={form.move_in_date}
              expediteRequested={form.expedite_requested}
              processingFee={form.processing_fee}
              onClose={() => setShowMobileRight(false)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
