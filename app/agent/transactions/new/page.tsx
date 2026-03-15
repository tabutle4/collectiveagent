'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Save, FileText, Upload, Check, X, Plus, Trash2, Search, Users } from 'lucide-react'
import { ProcessingFeeType } from '@/lib/transactions/types'
import { getVisibleSlides, TENANT_TYPES, LOAN_TYPES, LEAD_SOURCES, FLYER_DIVISIONS, SlideConfig } from '@/lib/transactions/constants'
import SummaryPanel from '@/components/transactions/SummaryPanel'
import { toTitleCase, formatAddress, formatState, formatPhone, formatMoney, parseMoney, buildPropertyAddress } from '@/lib/transactions/utils'

// ===== INTERFACES =====

interface Client {
  name: string
  email: string
  phone: string
}

interface TransactionForm {
  // Type
  transaction_type: string
  transaction_type_name: string
  is_lease: boolean
  processing_fee: number
  processing_fee_type_id: string
  // Property (structured)
  street_address: string
  unit_suite: string
  city: string
  state_code: string
  zip_code: string
  county: string
  mls_link: string
  mls_number: string
  mls_type: string
  // Clients (primary + additional)
  clients: Client[]
  // Financials
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
  // Dates
  listing_date: string
  listing_expiration_date: string
  buyer_agreement_date: string
  buyer_agreement_expiration_date: string
  acceptance_date: string
  closing_date: string
  move_in_date: string
  lease_term: string
  // Details
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
  // Referrals
  brokerage_referral: boolean
  internal_referral: boolean
  internal_referral_fee: string
  internal_referral_fee_type: string
  external_referral: boolean
  external_referral_fee: string
  external_referral_fee_type: string
  // BTSA / eCommission
  has_btsa: boolean
  btsa_amount: string
  has_ecommission: boolean
  ecommission_amount: string
  // Title
  title_officer_name: string
  title_company: string
  title_company_email: string
}

const emptyClient: Client = { name: '', email: '', phone: '' }

const emptyForm: TransactionForm = {
  transaction_type: '', transaction_type_name: '', is_lease: false, processing_fee: 0, processing_fee_type_id: '',
  street_address: '', unit_suite: '', city: '', state_code: 'TX', zip_code: '', county: '', mls_link: '', mls_number: '', mls_type: '',
  clients: [{ ...emptyClient }],
  sales_price: '', monthly_rent: '',
  gross_commission: '', gross_commission_type: 'percent',
  listing_side_commission: '', listing_side_commission_type: 'percent',
  buying_side_commission: '', buying_side_commission_type: 'percent',
  additional_client_commission: '', bonus_amount: '', rebate_amount: '',
  listing_date: '', listing_expiration_date: '', buyer_agreement_date: '', buyer_agreement_expiration_date: '',
  acceptance_date: '', closing_date: '', move_in_date: '', lease_term: '',
  is_intermediary: false, intermediary_agent_id: '', intermediary_agent_type: '',
  tenant_transaction_type: '', loan_type: '',
  lead_source: '', flyer_division: '', expedite_requested: false, notes: '', office_location: '',
  brokerage_referral: false,
  internal_referral: false, internal_referral_fee: '', internal_referral_fee_type: 'percent',
  external_referral: false, external_referral_fee: '', external_referral_fee_type: 'percent',
  has_btsa: false, btsa_amount: '', has_ecommission: false, ecommission_amount: '',
  title_officer_name: '', title_company: '', title_company_email: '',
}

// ===== MAIN COMPONENT =====

export default function CreateTransactionPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [transactionTypes, setTransactionTypes] = useState<ProcessingFeeType[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [requiredDocs, setRequiredDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<TransactionForm>(emptyForm)
  const [showMobileRight, setShowMobileRight] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [transactionEmail, setTransactionEmail] = useState<string | null>(null)
  const [savedSections, setSavedSections] = useState<string[]>([])
  const [contactSuggestions, setContactSuggestions] = useState<any[]>([])
  const [showContactSuggestions, setShowContactSuggestions] = useState<string | null>(null)
  const [agentSearch, setAgentSearch] = useState('')

  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ===== DATA LOADING =====

  useEffect(() => {
    const load = async () => {
      try {
        const userStr = localStorage.getItem('user')
        if (!userStr) { router.push('/auth/login'); return }
        const userData = JSON.parse(userStr)
        setUser(userData)
        // Set office from user profile
        setForm(prev => ({ ...prev, office_location: userData.office || '' }))

        const [typesRes, agentsRes, teamsRes] = await Promise.all([
          supabase.from('processing_fee_types').select('*').eq('is_active', true).order('display_order', { ascending: true }),
          supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, team_name, commission_plan, is_active').eq('is_active', true).order('preferred_first_name', { ascending: true }),
          supabase.from('users').select('team_name').not('team_name', 'is', null).not('team_name', 'eq', ''),
        ])
        setTransactionTypes(typesRes.data || [])
        setAgents(agentsRes.data || [])
        // Get distinct team names
        const uniqueTeams = [...new Set((teamsRes.data || []).map((u: any) => u.team_name).filter(Boolean))] as string[]
        setTeams(uniqueTeams.sort())
      } catch (error) { console.error('Error loading data:', error) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  // Load required docs when type changes
  useEffect(() => {
    if (form.processing_fee_type_id) {
      supabase
        .from('required_documents')
        .select('*')
        .eq('processing_fee_type_id', form.processing_fee_type_id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .then(({ data }) => setRequiredDocs(data || []))
    }
  }, [form.processing_fee_type_id])

  // Auto-check referral boxes when referral lead source selected
  useEffect(() => {
    if (form.lead_source === 'brokerage_referral') {
      setForm(prev => ({ ...prev, brokerage_referral: true }))
    } else if (form.lead_source === 'internal_agent_referral') {
      setForm(prev => ({ ...prev, internal_referral: true }))
    } else if (form.lead_source === 'external_agent_referral') {
      setForm(prev => ({ ...prev, external_referral: true }))
    }
  }, [form.lead_source])

  // Contact search
  const searchContacts = useCallback(async (query: string, fieldKey: string) => {
    if (query.length < 2) { setContactSuggestions([]); setShowContactSuggestions(null); return }
    const { data } = await supabase
      .from('transaction_contacts')
      .select('name, email, phone, company, contact_type')
      .ilike('name', `%${query}%`)
      .limit(5)
    if (data && data.length > 0) {
      setContactSuggestions(data)
      setShowContactSuggestions(fieldKey)
    } else {
      setContactSuggestions([])
      setShowContactSuggestions(null)
    }
  }, [])

  // ===== FORM HELPERS =====

  const visibleSlides = useMemo(() => getVisibleSlides(form.is_lease), [form.is_lease])
  const selectedType = transactionTypes.find(t => t.id === form.transaction_type)

  const updateForm = (field: keyof TransactionForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const updateClient = (index: number, field: keyof Client, value: string) => {
    setForm(prev => {
      const clients = [...prev.clients]
      clients[index] = { ...clients[index], [field]: value }
      return { ...prev, clients }
    })
  }

  const addClient = () => {
    setForm(prev => ({ ...prev, clients: [...prev.clients, { ...emptyClient }] }))
  }

  const removeClient = (index: number) => {
    if (form.clients.length <= 1) return
    setForm(prev => ({ ...prev, clients: prev.clients.filter((_, i) => i !== index) }))
  }

  const selectTransactionType = (type: ProcessingFeeType) => {
    setForm(prev => ({
      ...prev,
      transaction_type: type.id,
      transaction_type_name: type.name,
      is_lease: type.is_lease,
      processing_fee: type.processing_fee,
      processing_fee_type_id: type.id,
    }))
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
      case 'documents': return false
      case 'review': return false
      default: return false
    }
  }

  // ===== SAVE =====

  const buildPayload = () => {
    const address = buildPropertyAddress(form.street_address, form.unit_suite, form.city, form.state_code, form.zip_code)
    const primaryClient = form.clients[0]
    return {
      submitted_by: user.id,
      property_address: address || 'Untitled Transaction',
      transaction_type: form.transaction_type_name || null,
      status: 'prospect',
      compliance_status: 'not_requested',
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
      notes: form.notes ? JSON.stringify([{ text: form.notes, date: new Date().toISOString(), by: user.id }]) : null,
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
  }

  const saveTransaction = async () => {
    if (!user || !form.transaction_type) return
    setSaving(true)
    try {
      const payload = buildPayload()
      let txnId = transactionId

      if (txnId) {
        const { error } = await supabase.from('transactions').update(payload).eq('id', txnId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('transactions').insert([payload]).select().single()
        if (error) throw error
        txnId = data.id
        setTransactionId(data.id)
        setTransactionEmail(data.transaction_email)

        // Insert primary agent into transaction_internal_agents
        await supabase.from('transaction_internal_agents').insert([{
          transaction_id: data.id,
          agent_id: user.id,
          agent_role: form.transaction_type_name.toLowerCase().includes('buyer') ? 'buyer_agent'
            : form.transaction_type_name.toLowerCase().includes('seller') ? 'listing_agent'
            : form.transaction_type_name.toLowerCase().includes('landlord') ? 'listing_agent'
            : form.transaction_type_name.toLowerCase().includes('tenant') ? 'buyer_agent'
            : 'primary',
          commission_plan: user.commission_plan || null,
          processing_fee: form.processing_fee || 0,
          processing_fee_type_id: form.processing_fee_type_id || null,
        }])

        // If intermediary, insert second agent
        if (form.is_intermediary && form.intermediary_agent_id) {
          const intAgent = agents.find(a => a.id === form.intermediary_agent_id)
          await supabase.from('transaction_internal_agents').insert([{
            transaction_id: data.id,
            agent_id: form.intermediary_agent_id,
            agent_role: form.intermediary_agent_type || 'intermediary_agent',
            commission_plan: intAgent?.commission_plan || null,
            processing_fee_type_id: form.intermediary_agent_type ? transactionTypes.find(t => t.name === form.intermediary_agent_type)?.id : null,
          }])
        }
      }

      // Upsert contacts (all clients + title contact)
      if (txnId) {
        // Save all clients to transaction_contacts
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
        // Save title contact
        if (form.title_company) {
          await supabase.from('transaction_contacts').upsert({
            transaction_id: txnId,
            contact_type: 'title',
            name: toTitleCase(form.title_officer_name || form.title_company),
            company: toTitleCase(form.title_company),
            email: form.title_company_email ? JSON.stringify([form.title_company_email.toLowerCase()]) : null,
          }, { onConflict: 'transaction_id,contact_type,name' }).select()
        }
      }

      setSavedSections(visibleSlides.map(s => s.id))
    } catch (error: any) {
      console.error('Error saving:', error)
      alert(`Failed to save: ${error.message}`)
    } finally { setSaving(false) }
  }

  const handleSaveSection = async (sectionId: string) => {
    await saveTransaction()
    if (!savedSections.includes(sectionId)) {
      setSavedSections(prev => [...prev, sectionId])
    }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  // ===== RENDER =====

  const filteredAgents = agentSearch
    ? agents.filter(a => {
        const name = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
        return name.includes(agentSearch.toLowerCase()) && a.id !== user?.id
      })
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push('/agent/transactions')} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors mb-1 block">← Back to Transactions</button>
          <h1 className="page-title">NEW TRANSACTION</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={saveTransaction} disabled={saving || !form.transaction_type} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : transactionId ? 'Save All' : 'Save Draft'}
          </button>
          <button onClick={() => setShowMobileRight(!showMobileRight)} className="btn btn-secondary lg:hidden flex items-center gap-1.5">
            <FileText size={14} /> Progress
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT: Slides */}
        <div className={`${showMobileRight ? 'hidden lg:block' : ''} lg:col-span-8 space-y-5`}>

          {/* TYPE */}
          <div ref={el => { slideRefs.current['type'] = el }} className="container-card">
            <h2 className="section-title">Select Transaction Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {transactionTypes.map((type) => (
                <button key={type.id} onClick={() => selectTransactionType(type)} className={form.transaction_type === type.id ? 'type-card-selected' : 'type-card'}>
                  <p className="text-sm font-semibold text-luxury-gray-1">{type.name}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-luxury-gray-3">Fee: {type.processing_fee > 0 ? formatMoney(type.processing_fee) : 'None'}</span>
                    {type.is_lease && <span className="text-xs text-blue-600">Lease</span>}
                  </div>
                </button>
              ))}
            </div>
            <SaveBtn id="type" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('type')} onSave={handleSaveSection} />
          </div>

          {/* PROPERTY */}
          <div ref={el => { slideRefs.current['property'] = el }} className="container-card">
            <h2 className="section-title">Property Details</h2>
            <div className="space-y-4">
              <div>
                <label className="field-label">Street Address</label>
                <input className="input-luxury" value={form.street_address}
                  onChange={(e) => updateForm('street_address', e.target.value)}
                  onBlur={(e) => updateForm('street_address', formatAddress(e.target.value))}
                  placeholder="123 Main Street" />
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div><label className="field-label">Unit / Suite</label><input className="input-luxury" value={form.unit_suite} onChange={(e) => updateForm('unit_suite', e.target.value)} placeholder="Apt 4B" /></div>
                <div><label className="field-label">City</label><input className="input-luxury" value={form.city} onChange={(e) => updateForm('city', e.target.value)} onBlur={(e) => updateForm('city', toTitleCase(e.target.value))} placeholder="Houston" /></div>
                <div><label className="field-label">State</label><input className="input-luxury" value={form.state_code} onChange={(e) => updateForm('state_code', e.target.value)} onBlur={(e) => updateForm('state_code', formatState(e.target.value))} placeholder="TX" maxLength={2} /></div>
                <div><label className="field-label">ZIP</label><input className="input-luxury" value={form.zip_code} onChange={(e) => updateForm('zip_code', e.target.value)} placeholder="77001" maxLength={10} /></div>
                <div><label className="field-label">County</label><input className="input-luxury" value={form.county} onChange={(e) => updateForm('county', e.target.value)} onBlur={(e) => updateForm('county', toTitleCase(e.target.value))} placeholder="Harris" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">MLS Number</label><input className="input-luxury" value={form.mls_number} onChange={(e) => updateForm('mls_number', e.target.value)} /></div>
                <div><label className="field-label">MLS Type</label>
                  <select className="select-luxury" value={form.mls_type} onChange={(e) => updateForm('mls_type', e.target.value)}>
                    <option value="">Select...</option>
                    <option value="HAR">HAR</option>
                    <option value="NTREIS">NTREIS</option>
                    <option value="MetroTex">MetroTex</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div><label className="field-label">MLS Link</label><input className="input-luxury" value={form.mls_link} onChange={(e) => updateForm('mls_link', e.target.value)} placeholder="https://..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Lead Source</label>
                  <select className="select-luxury" value={form.lead_source} onChange={(e) => updateForm('lead_source', e.target.value)}>
                    <option value="">Select...</option>
                    {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="field-label">Office</label>
                  <select className="select-luxury" value={form.office_location} onChange={(e) => updateForm('office_location', e.target.value)}>
                    <option value="">Select...</option>
                    <option value="Houston">Houston</option>
                    <option value="DFW">DFW</option>
                  </select>
                </div>
              </div>
              <div><label className="field-label">Notes</label><textarea className="textarea-luxury" rows={3} value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} /></div>
            </div>
            <SaveBtn id="property" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('property')} onSave={handleSaveSection} />
          </div>

          {/* CLIENTS */}
          <div ref={el => { slideRefs.current['client'] = el }} className="container-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title mb-0">Clients</h2>
              <button onClick={addClient} className="btn btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Add Client</button>
            </div>
            <div className="space-y-4">
              {form.clients.map((client, idx) => (
                <div key={idx} className={form.clients.length > 1 ? 'inner-card' : ''}>
                  {form.clients.length > 1 && (
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-luxury-gray-2">{idx === 0 ? 'Primary Client' : `Client ${idx + 1}`}</p>
                      {idx > 0 && <button onClick={() => removeClient(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="relative">
                      <label className="field-label">Name</label>
                      <input className="input-luxury" value={client.name}
                        onChange={(e) => { updateClient(idx, 'name', e.target.value); searchContacts(e.target.value, `client-${idx}`) }}
                        onBlur={(e) => { updateClient(idx, 'name', toTitleCase(e.target.value)); setTimeout(() => setShowContactSuggestions(null), 200) }}
                        placeholder="John Doe" />
                      {showContactSuggestions === `client-${idx}` && contactSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-40 overflow-y-auto">
                          {contactSuggestions.map((c, i) => (
                            <button key={i} onClick={() => {
                              const email = c.email ? (typeof c.email === 'string' ? c.email : JSON.parse(c.email)?.[0] || '') : ''
                              const phone = c.phone ? (typeof c.phone === 'string' ? c.phone : JSON.parse(c.phone)?.[0] || '') : ''
                              updateClient(idx, 'name', c.name || '')
                              updateClient(idx, 'email', email)
                              updateClient(idx, 'phone', phone)
                              setShowContactSuggestions(null)
                            }} className="w-full text-left px-3 py-2 hover:bg-luxury-light text-xs border-b border-luxury-gray-5/30 last:border-0">
                              <p className="font-medium text-luxury-gray-1">{c.name}</p>
                              {email && <p className="text-luxury-gray-3">{typeof c.email === 'string' ? c.email : ''}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="field-label">Email</label><input className="input-luxury" type="email" value={client.email} onChange={(e) => updateClient(idx, 'email', e.target.value)} placeholder="john@example.com" /></div>
                      <div><label className="field-label">Phone</label><input className="input-luxury" value={client.phone}
                        onChange={(e) => updateClient(idx, 'phone', formatPhone(e.target.value))}
                        placeholder="(555) 123-4567" /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <SaveBtn id="client" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('client')} onSave={handleSaveSection} />
          </div>

          {/* FINANCIALS */}
          <div ref={el => { slideRefs.current['financials'] = el }} className="container-card">
            <h2 className="section-title">Financial Details</h2>
            <div className="space-y-4">
              {form.is_lease ? (
                <div><label className="field-label">Monthly Rent</label><input className="input-luxury" type="number" step="0.01" value={form.monthly_rent} onChange={(e) => updateForm('monthly_rent', e.target.value)} placeholder="0.00" /></div>
              ) : (
                <div><label className="field-label">Sales Price</label><input className="input-luxury" type="number" step="0.01" value={form.sales_price} onChange={(e) => updateForm('sales_price', e.target.value)} placeholder="0.00" /></div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CommInput label="Gross Commission" value={form.gross_commission} type={form.gross_commission_type} onValue={(v) => updateForm('gross_commission', v)} onType={(t) => updateForm('gross_commission_type', t)} />
                <CommInput label="Listing Side" value={form.listing_side_commission} type={form.listing_side_commission_type} onValue={(v) => updateForm('listing_side_commission', v)} onType={(t) => updateForm('listing_side_commission_type', t)} />
                <CommInput label="Buying Side" value={form.buying_side_commission} type={form.buying_side_commission_type} onValue={(v) => updateForm('buying_side_commission', v)} onType={(t) => updateForm('buying_side_commission_type', t)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Additional Client Commission ($)</label><input className="input-luxury" type="number" step="0.01" value={form.additional_client_commission} onChange={(e) => updateForm('additional_client_commission', e.target.value)} placeholder="0.00" /></div>
                <div><label className="field-label">Bonus ($)</label><input className="input-luxury" type="number" step="0.01" value={form.bonus_amount} onChange={(e) => updateForm('bonus_amount', e.target.value)} placeholder="0.00" /></div>
                <div><label className="field-label">Rebate ($)</label><input className="input-luxury" type="number" step="0.01" value={form.rebate_amount} onChange={(e) => updateForm('rebate_amount', e.target.value)} placeholder="0.00" /></div>
              </div>
            </div>
            <SaveBtn id="financials" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('financials')} onSave={handleSaveSection} />
          </div>

          {/* DATES */}
          <div ref={el => { slideRefs.current['dates'] = el }} className="container-card">
            <h2 className="section-title">Key Dates</h2>
            <div className="space-y-4">
              {form.is_lease ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Move-in Date</label><input className="input-luxury" type="date" value={form.move_in_date} onChange={(e) => updateForm('move_in_date', e.target.value)} /></div>
                  <div><label className="field-label">Lease Term (months)</label><input className="input-luxury" type="number" value={form.lease_term} onChange={(e) => updateForm('lease_term', e.target.value)} placeholder="12" /></div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Listing Date</label><input className="input-luxury" type="date" value={form.listing_date} onChange={(e) => updateForm('listing_date', e.target.value)} /></div>
                    <div><label className="field-label">Listing Expiration</label><input className="input-luxury" type="date" value={form.listing_expiration_date} onChange={(e) => updateForm('listing_expiration_date', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Buyer Agreement Date</label><input className="input-luxury" type="date" value={form.buyer_agreement_date} onChange={(e) => updateForm('buyer_agreement_date', e.target.value)} /></div>
                    <div><label className="field-label">Buyer Agreement Expiration</label><input className="input-luxury" type="date" value={form.buyer_agreement_expiration_date} onChange={(e) => updateForm('buyer_agreement_expiration_date', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label">Acceptance Date</label><input className="input-luxury" type="date" value={form.acceptance_date} onChange={(e) => updateForm('acceptance_date', e.target.value)} /></div>
                    <div><label className="field-label">Closing Date</label><input className="input-luxury" type="date" value={form.closing_date} onChange={(e) => updateForm('closing_date', e.target.value)} /></div>
                  </div>
                </>
              )}
            </div>
            <SaveBtn id="dates" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('dates')} onSave={handleSaveSection} />
          </div>

          {/* DETAILS */}
          <div ref={el => { slideRefs.current['details'] = el }} className="container-card">
            <h2 className="section-title">Additional Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {form.is_lease && (
                  <div><label className="field-label">Tenant Type</label>
                    <select className="select-luxury" value={form.tenant_transaction_type} onChange={(e) => updateForm('tenant_transaction_type', e.target.value)}>
                      <option value="">Select...</option>
                      {TENANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                {!form.is_lease && (
                  <div><label className="field-label">Loan Type</label>
                    <select className="select-luxury" value={form.loan_type} onChange={(e) => updateForm('loan_type', e.target.value)}>
                      <option value="">Select...</option>
                      {LOAN_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="field-label">Flyer Division or Team</label>
                  <select className="select-luxury" value={form.flyer_division} onChange={(e) => updateForm('flyer_division', e.target.value)}>
                    <option value="">Select...</option>
                    <optgroup label="Divisions">
                      {FLYER_DIVISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </optgroup>
                    {teams.length > 0 && (
                      <optgroup label="Teams">
                        {teams.map(t => <option key={t} value={`team:${t}`}>{t}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Intermediary */}
              <div className="inner-card">
                <label className="checkbox-label mb-3"><input type="checkbox" checked={form.is_intermediary} onChange={(e) => updateForm('is_intermediary', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">Intermediary Transaction</span></label>
                {form.is_intermediary && (
                  <div className="space-y-3 mt-3">
                    <div><label className="field-label">Search for Agent</label>
                      <input className="input-luxury" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} placeholder="Type agent name..." />
                      {agentSearch && filteredAgents.length > 0 && (
                        <div className="mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-40 overflow-y-auto">
                          {filteredAgents.slice(0, 8).map(a => (
                            <button key={a.id} onClick={() => { updateForm('intermediary_agent_id', a.id); setAgentSearch(`${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`) }}
                              className={`w-full text-left px-3 py-2 hover:bg-luxury-light text-xs border-b border-luxury-gray-5/30 last:border-0 ${form.intermediary_agent_id === a.id ? 'bg-luxury-accent/10' : ''}`}>
                              <p className="font-medium text-luxury-gray-1">{a.preferred_first_name || a.first_name} {a.preferred_last_name || a.last_name}</p>
                              <p className="text-luxury-gray-3">{a.email} {a.office ? `· ${a.office}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {form.intermediary_agent_id && (
                      <div><label className="field-label">Other Agent's Transaction Type</label>
                        <select className="select-luxury" value={form.intermediary_agent_type} onChange={(e) => updateForm('intermediary_agent_type', e.target.value)}>
                          <option value="">Select their transaction type...</option>
                          {transactionTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Referrals */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Referrals</h3>
                <div className="space-y-3">
                  <label className="checkbox-label"><input type="checkbox" checked={form.brokerage_referral} onChange={(e) => updateForm('brokerage_referral', e.target.checked)} className="w-4 h-4" />Brokerage Referral</label>
                  <label className="checkbox-label"><input type="checkbox" checked={form.internal_referral} onChange={(e) => updateForm('internal_referral', e.target.checked)} className="w-4 h-4" />Internal Agent Referral</label>
                  {form.internal_referral && (
                    <div className="flex gap-2">
                      <input className="input-luxury flex-1" type="number" step="0.01" value={form.internal_referral_fee} onChange={(e) => updateForm('internal_referral_fee', e.target.value)} placeholder="0.00" />
                      <select className="select-luxury w-20" value={form.internal_referral_fee_type} onChange={(e) => updateForm('internal_referral_fee_type', e.target.value)}>
                        <option value="percent">%</option><option value="flat">$</option>
                      </select>
                    </div>
                  )}
                  <label className="checkbox-label"><input type="checkbox" checked={form.external_referral} onChange={(e) => updateForm('external_referral', e.target.checked)} className="w-4 h-4" />External Agent Referral</label>
                  {form.external_referral && (
                    <div className="flex gap-2">
                      <input className="input-luxury flex-1" type="number" step="0.01" value={form.external_referral_fee} onChange={(e) => updateForm('external_referral_fee', e.target.value)} placeholder="0.00" />
                      <select className="select-luxury w-20" value={form.external_referral_fee_type} onChange={(e) => updateForm('external_referral_fee_type', e.target.value)}>
                        <option value="percent">%</option><option value="flat">$</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* BTSA / eCommission / Expedite */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.has_btsa} onChange={(e) => updateForm('has_btsa', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">BTSA</span></label>
                  {form.has_btsa && <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.btsa_amount} onChange={(e) => updateForm('btsa_amount', e.target.value)} /></div>}
                </div>
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.has_ecommission} onChange={(e) => updateForm('has_ecommission', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">eCommission</span></label>
                  {form.has_ecommission && <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.ecommission_amount} onChange={(e) => updateForm('ecommission_amount', e.target.value)} /></div>}
                </div>
                <div className="inner-card">
                  <label className="checkbox-label"><input type="checkbox" checked={form.expedite_requested} onChange={(e) => updateForm('expedite_requested', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">Expedite ($95)</span></label>
                </div>
              </div>
            </div>
            <SaveBtn id="details" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('details')} onSave={handleSaveSection} />
          </div>

          {/* TITLE INFO (sales only) */}
          {!form.is_lease && (
            <div ref={el => { slideRefs.current['title_info'] = el }} className="container-card">
              <h2 className="section-title">Title Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <label className="field-label">Title Company</label>
                  <input className="input-luxury" value={form.title_company}
                    onChange={(e) => { updateForm('title_company', e.target.value); searchContacts(e.target.value, 'title') }}
                    onBlur={(e) => { updateForm('title_company', toTitleCase(e.target.value)); setTimeout(() => setShowContactSuggestions(null), 200) }}
                    placeholder="ABC Title Company" />
                  {showContactSuggestions === 'title' && contactSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-40 overflow-y-auto">
                      {contactSuggestions.map((c, i) => (
                        <button key={i} onClick={() => {
                          updateForm('title_company', c.company || c.name || '')
                          updateForm('title_officer_name', c.name || '')
                          const email = c.email ? (typeof c.email === 'string' ? c.email : JSON.parse(c.email)?.[0] || '') : ''
                          updateForm('title_company_email', email)
                          setShowContactSuggestions(null)
                        }} className="w-full text-left px-3 py-2 hover:bg-luxury-light text-xs border-b border-luxury-gray-5/30 last:border-0">
                          <p className="font-medium text-luxury-gray-1">{c.company || c.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div><label className="field-label">Title Officer</label><input className="input-luxury" value={form.title_officer_name}
                  onChange={(e) => updateForm('title_officer_name', e.target.value)}
                  onBlur={(e) => updateForm('title_officer_name', toTitleCase(e.target.value))}
                  placeholder="Jane Smith" /></div>
                <div><label className="field-label">Title Company Email</label><input className="input-luxury" type="email" value={form.title_company_email} onChange={(e) => updateForm('title_company_email', e.target.value)} placeholder="closing@abctitle.com" /></div>
              </div>
              <SaveBtn id="title_info" saving={saving} disabled={!form.transaction_type} saved={savedSections.includes('title_info')} onSave={handleSaveSection} />
            </div>
          )}

          {/* DOCUMENTS */}
          <div ref={el => { slideRefs.current['documents'] = el }} className="container-card">
            <div className="flex items-center justify-between mb-1">
              <h2 className="section-title mb-0">Documents</h2>
              {transactionEmail && <span className="text-xs text-luxury-gray-3">Email docs to: <span className="font-medium text-luxury-gray-1 bg-luxury-light px-2 py-0.5 rounded select-all">{transactionEmail}</span></span>}
            </div>
            <p className="text-xs text-luxury-gray-3 mb-4">Upload documents and assign them to the required types. Unassigned docs will be categorized by compliance.</p>
            {requiredDocs.length > 0 && (
              <div className="inner-card mb-4">
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
            {!transactionId ? (
              <div className="alert-info">Save your transaction first to enable document uploads.</div>
            ) : (
              <div className="upload-zone py-10">
                <Upload size={24} className="mx-auto text-luxury-gray-3 mb-2" />
                <p className="text-xs text-luxury-gray-3 mb-1">Drag and drop files here or click to browse</p>
                <p className="text-xs text-luxury-gray-3">After uploading, assign each document to its type</p>
              </div>
            )}
          </div>

          {/* REVIEW */}
          <div ref={el => { slideRefs.current['review'] = el }} className="container-card">
            <h2 className="section-title">Review & Save</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {form.transaction_type_name && (
                  <div className="inner-card">
                    <p className="summary-label">Transaction Type</p>
                    <p className="summary-value">{form.transaction_type_name}</p>
                    {form.processing_fee > 0 && <p className="text-xs text-luxury-gray-3 mt-1">Processing fee: {formatMoney(form.processing_fee)}</p>}
                  </div>
                )}
                {form.street_address && (
                  <div className="inner-card">
                    <p className="summary-label">Property</p>
                    <p className="summary-value">{buildPropertyAddress(form.street_address, form.unit_suite, form.city, form.state_code, form.zip_code)}</p>
                  </div>
                )}
                {form.clients[0]?.name && (
                  <div className="inner-card">
                    <p className="summary-label">Client{form.clients.length > 1 ? 's' : ''}</p>
                    {form.clients.filter(c => c.name).map((c, i) => (
                      <p key={i} className="summary-value">{c.name}{c.phone ? ` · ${c.phone}` : ''}</p>
                    ))}
                  </div>
                )}
                {(form.sales_price || form.monthly_rent) && (
                  <div className="inner-card">
                    <p className="summary-label">Financials</p>
                    {form.sales_price && <p className="summary-value">Sales Price: {formatMoney(form.sales_price)}</p>}
                    {form.monthly_rent && <p className="summary-value">Monthly Rent: {formatMoney(form.monthly_rent)}</p>}
                    {form.gross_commission && <p className="text-xs text-luxury-gray-3">Commission: {form.gross_commission}{form.gross_commission_type === 'percent' ? '%' : ' (flat)'}</p>}
                  </div>
                )}
              </div>
              {transactionId ? (
                <div className="alert-success">Transaction saved. Continue editing or request compliance review when ready.</div>
              ) : (
                <div className="alert-info">Save as draft. Request compliance review after filling required fields.</div>
              )}
              <div className="flex justify-end">
                <button onClick={saveTransaction} disabled={saving || !form.transaction_type} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  <Save size={14} /> {saving ? 'Saving...' : transactionId ? 'Save Changes' : 'Save Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Progress + Summary */}
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
                <p className="text-xs text-luxury-gray-3 mt-1">{visibleSlides.filter(s => isSlideComplete(s)).length} of {visibleSlides.length} complete</p>
              </div>
            </div>

            {/* Agent Info */}
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

            {/* Summary */}
            <SummaryPanel
              typeName={selectedType?.name || null}
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

// ===== SMALL COMPONENTS =====

function SaveBtn({ id, saving, disabled, saved, onSave }: { id: string; saving: boolean; disabled: boolean; saved: boolean; onSave: (id: string) => void }) {
  return (
    <div className="flex justify-end mt-4 pt-3 border-t border-luxury-gray-5/30">
      {saved ? (
        <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Saved</span>
      ) : (
        <button onClick={() => onSave(id)} disabled={saving || disabled} className="btn btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50">
          <Save size={12} /> {saving ? 'Saving...' : 'Save Section'}
        </button>
      )}
    </div>
  )
}

function CommInput({ label, value, type, onValue, onType }: { label: string; value: string; type: string; onValue: (v: string) => void; onType: (t: string) => void }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex gap-2">
        <input className="input-luxury flex-1" type="number" step="0.01" value={value} onChange={(e) => onValue(e.target.value)} placeholder="0.00" />
        <select className="select-luxury w-20" value={type} onChange={(e) => onType(e.target.value)}>
          <option value="percent">%</option>
          <option value="amount">$</option>
        </select>
      </div>
    </div>
  )
}