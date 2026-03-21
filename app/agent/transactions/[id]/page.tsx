'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Save, FileText, Upload, Check, X, Plus, Trash2, ArrowLeft } from 'lucide-react'
import { ProcessingFeeType } from '@/lib/transactions/types'
import { getVisibleSlides, LOAN_TYPES, LEAD_SOURCES, FLYER_DIVISIONS, LegacySlideConfig as SlideConfig } from '@/lib/transactions/constants'
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
  loan_type: string
  lead_source: string
  notes: string
  flyer_division: string
  has_referral: boolean
  referral_type: string
  referral_amount: string
  referral_fee_type: string
  has_btsa: boolean
  btsa_amount: string
  expedite_requested: boolean
  tenant_transaction_type: string
  title_officer_name: string
  title_company: string
  title_company_email: string
  has_ecommission: boolean
  ecommission_amount: string
}

export default function AgentTransactionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const txnId = params?.id as string

  const [user, setUser] = useState<any>(null)
  const [transaction, setTransaction] = useState<any>(null)
  const [processingFeeTypes, setProcessingFeeTypes] = useState<ProcessingFeeType[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [internalAgents, setInternalAgents] = useState<any[]>([])
  const [requiredDocs, setRequiredDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSlide, setActiveSlide] = useState(0)
  const [form, setForm] = useState<TransactionForm | null>(null)
  const [teamNames, setTeamNames] = useState<string[]>([])
  const [contactSuggestions, setContactSuggestions] = useState<any[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)

  useEffect(() => {
    loadData()
  }, [txnId])

  const loadData = async () => {
    try {
      const [meRes, txnRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/transactions/${txnId}`),
      ])

      if (!meRes.ok) { router.push('/auth/login'); return }
      const meData = await meRes.json()
      setUser(meData.user)

      if (!txnRes.ok) { router.push('/transactions'); return }
      const txnData = await txnRes.json()

      setTransaction(txnData.transaction)
      setProcessingFeeTypes(txnData.processingFeeTypes || [])
      setAgents(txnData.agents || [])
      setContacts(txnData.contacts || [])
      setInternalAgents(txnData.internalAgents || [])
      setRequiredDocs(txnData.requiredDocs || [])

      // Extract team names from agents
      const names = [...new Set(
        (txnData.agents || [])
          .map((a: any) => a.team_name)
          .filter(Boolean)
      )] as string[]
      setTeamNames(names)

      // Initialize form from transaction
      const t = txnData.transaction
      if (t) {
        const matchedType = (txnData.processingFeeTypes || []).find((pt: any) => pt.name === t.transaction_type)
        setForm({
          transaction_type: t.transaction_type_id || '',
          transaction_type_name: t.transaction_type || '',
          is_lease: matchedType?.is_lease || false,
          processing_fee: matchedType?.fee || 0,
          processing_fee_type_id: matchedType?.id || '',
          street_address: t.street_address || '',
          unit_suite: t.unit_suite || '',
          city: t.city || '',
          state_code: t.state_code || 'TX',
          zip_code: t.zip_code || '',
          county: t.county || '',
          mls_link: t.mls_link || '',
          mls_number: t.mls_number || '',
          mls_type: t.mls_type || '',
          clients: txnData.contacts?.filter((c: any) => c.contact_type === 'client').map((c: any) => ({
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
          })) || [{ name: '', email: '', phone: '' }],
          sales_price: t.sales_price || '',
          monthly_rent: t.monthly_rent || '',
          gross_commission: t.gross_commission || '',
          gross_commission_type: t.gross_commission_type || 'percent',
          listing_side_commission: t.listing_side_commission || '',
          listing_side_commission_type: t.listing_side_commission_type || 'percent',
          buying_side_commission: t.buying_side_commission || '',
          buying_side_commission_type: t.buying_side_commission_type || 'percent',
          additional_client_commission: t.additional_client_commission || '',
          bonus_amount: t.bonus_amount || '',
          rebate_amount: t.rebate_amount || '',
          listing_date: t.listing_date || '',
          listing_expiration_date: t.listing_expiration_date || '',
          buyer_agreement_date: t.buyer_agreement_date || '',
          buyer_agreement_expiration_date: t.buyer_agreement_expiration_date || '',
          acceptance_date: t.acceptance_date || '',
          closing_date: t.closing_date || '',
          move_in_date: t.move_in_date || '',
          lease_term: t.lease_term || '',
          loan_type: t.loan_type || '',
          lead_source: t.lead_source || '',
          notes: t.notes || '',
          flyer_division: t.flyer_division || '',
          has_referral: t.has_referral || false,
          referral_type: t.referral_type || '',
          referral_amount: t.referral_amount || '',
          referral_fee_type: t.referral_fee_type || 'percent',
          has_btsa: t.has_btsa || false,
          btsa_amount: t.btsa_amount || '',
          expedite_requested: t.expedite_requested || false,
          tenant_transaction_type: t.tenant_transaction_type || '',
          title_officer_name: t.title_officer_name || '',
          title_company: t.title_company || '',
          title_company_email: t.title_company_email || '',
          has_ecommission: t.has_ecommission || false,
          ecommission_amount: t.ecommission_amount || '',
        })
      }
    } catch (error) {
      console.error('Error loading transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setContactSuggestions([]); return }
    setSearchingContacts(true)
    try {
      const res = await fetch(`/api/transactions/contacts/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setContactSuggestions(data.contacts || [])
      }
    } catch (e) {
      console.error('Error searching contacts:', e)
    } finally {
      setSearchingContacts(false)
    }
  }, [])

  const handleSave = async () => {
    if (!form || !transaction) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {
        transaction_type: form.transaction_type_name,
        street_address: form.street_address,
        unit_suite: form.unit_suite,
        city: form.city,
        state_code: form.state_code,
        zip_code: form.zip_code,
        county: form.county,
        mls_link: form.mls_link,
        mls_number: form.mls_number,
        mls_type: form.mls_type,
        sales_price: form.sales_price || null,
        monthly_rent: form.monthly_rent || null,
        gross_commission: form.gross_commission || null,
        gross_commission_type: form.gross_commission_type,
        listing_side_commission: form.listing_side_commission || null,
        listing_side_commission_type: form.listing_side_commission_type,
        buying_side_commission: form.buying_side_commission || null,
        buying_side_commission_type: form.buying_side_commission_type,
        additional_client_commission: form.additional_client_commission || null,
        bonus_amount: form.bonus_amount || null,
        rebate_amount: form.rebate_amount || null,
        listing_date: form.listing_date || null,
        listing_expiration_date: form.listing_expiration_date || null,
        buyer_agreement_date: form.buyer_agreement_date || null,
        buyer_agreement_expiration_date: form.buyer_agreement_expiration_date || null,
        acceptance_date: form.acceptance_date || null,
        closing_date: form.closing_date || null,
        move_in_date: form.move_in_date || null,
        lease_term: form.lease_term || null,
        loan_type: form.loan_type || null,
        lead_source: form.lead_source || null,
        notes: form.notes || null,
        flyer_division: form.flyer_division || null,
        has_referral: form.has_referral,
        referral_type: form.referral_type || null,
        referral_amount: form.referral_amount || null,
        referral_fee_type: form.referral_fee_type,
        has_btsa: form.has_btsa,
        btsa_amount: form.btsa_amount || null,
        expedite_requested: form.expedite_requested,
        tenant_transaction_type: form.tenant_transaction_type || null,
        title_officer_name: form.title_officer_name || null,
        title_company: form.title_company || null,
        title_company_email: form.title_company_email || null,
        has_ecommission: form.has_ecommission,
        ecommission_amount: form.ecommission_amount || null,
      }

      const contactsPayload = form.clients
        .filter(c => c.name)
        .map(c => ({
          transaction_id: txnId,
          name: c.name,
          email: c.email || null,
          phone: c.phone || null,
          contact_type: 'client',
        }))

      const res = await fetch(`/api/transactions/${txnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: payload, contacts: contactsPayload }),
      })

      if (!res.ok) throw new Error('Failed to save')
      await loadData()
    } catch (error) {
      console.error('Error saving transaction:', error)
    } finally {
      setSaving(false)
    }
  }

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

  const addClient = () => {
    setForm(prev => prev ? { ...prev, clients: [...prev.clients, { name: '', email: '', phone: '' }] } : prev)
  }

  const removeClient = (index: number) => {
    setForm(prev => {
      if (!prev || prev.clients.length <= 1) return prev
      const clients = prev.clients.filter((_, i) => i !== index)
      return { ...prev, clients }
    })
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  if (!transaction || !form) return <div className="text-center py-12 text-sm text-luxury-gray-3">Transaction not found.</div>

  const visibleSlides = getVisibleSlides(form as any, processingFeeTypes)
  const currentSlide: SlideConfig | undefined = visibleSlides[activeSlide]
  const propertyAddress = buildPropertyAddress(form as any)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/transactions')} className="flex items-center gap-2 text-sm text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
          <ArrowLeft size={16} /> Back to Transactions
        </button>
        <div className="flex items-center gap-3">
          <StatusBadge status={transaction.status as TransactionStatus} />
          <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: form slides */}
        <div className="flex-1 min-w-0">
          <div className="container-card mb-4">
            <h1 className="text-sm font-semibold text-luxury-gray-1 mb-1">
              {propertyAddress || 'New Transaction'}
            </h1>
            <p className="text-xs text-luxury-gray-3">{form.transaction_type_name}</p>
          </div>

          {/* Slide navigation */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {visibleSlides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => setActiveSlide(i)}
                className={`text-xs px-3 py-1.5 rounded border flex-shrink-0 transition-colors ${activeSlide === i ? 'btn-primary' : 'btn-secondary'}`}
              >
                {slide.title}
              </button>
            ))}
          </div>

          {/* Active slide content */}
          {currentSlide && (
            <div className="container-card">
              <h2 className="text-sm font-semibold text-luxury-gray-1 mb-4">{currentSlide.title}</h2>

              {currentSlide.id === 'type' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Transaction Type</label>
                    <select
                      className="select-luxury"
                      value={form.transaction_type}
                      onChange={e => {
                        const selected = processingFeeTypes.find(pt => pt.id === e.target.value)
                        if (selected) {
                          updateForm('transaction_type', selected.id)
                          updateForm('transaction_type_name', selected.name)
                          updateForm('is_lease', selected.is_lease)
                          updateForm('processing_fee', selected.fee || 0)
                          updateForm('processing_fee_type_id', selected.id)
                        }
                      }}
                    >
                      <option value="">Select type...</option>
                      {processingFeeTypes.filter(pt => pt.is_active).map(pt => (
                        <option key={pt.id} value={pt.id}>{pt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Lead Source</label>
                    <select className="select-luxury" value={form.lead_source} onChange={e => updateForm('lead_source', e.target.value)}>
                      <option value="">Select...</option>
                      {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="has_referral" checked={form.has_referral} onChange={e => updateForm('has_referral', e.target.checked)} className="accent-luxury-accent" />
                    <label htmlFor="has_referral" className="text-sm text-luxury-gray-2">This transaction has a referral</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="expedite" checked={form.expedite_requested} onChange={e => updateForm('expedite_requested', e.target.checked)} className="accent-luxury-accent" />
                    <label htmlFor="expedite" className="text-sm text-luxury-gray-2">Request expedited processing (+$95)</label>
                  </div>
                </div>
              )}

              {currentSlide.id === 'property' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Street Address</label>
                      <input className="input-luxury" value={form.street_address} onChange={e => updateForm('street_address', formatAddress(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Unit / Suite</label>
                      <input className="input-luxury" value={form.unit_suite} onChange={e => updateForm('unit_suite', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">City</label>
                      <input className="input-luxury" value={form.city} onChange={e => updateForm('city', toTitleCase(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">State</label>
                      <input className="input-luxury" value={form.state_code} onChange={e => updateForm('state_code', formatState(e.target.value))} maxLength={2} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">ZIP</label>
                      <input className="input-luxury" value={form.zip_code} onChange={e => updateForm('zip_code', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">County</label>
                      <input className="input-luxury" value={form.county} onChange={e => updateForm('county', toTitleCase(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">MLS Number</label>
                      <input className="input-luxury" value={form.mls_number} onChange={e => updateForm('mls_number', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">MLS Link</label>
                      <input className="input-luxury" value={form.mls_link} onChange={e => updateForm('mls_link', e.target.value)} placeholder="https://" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-luxury-gray-3">Clients</label>
                      <button onClick={addClient} className="text-xs text-luxury-accent hover:underline flex items-center gap-1">
                        <Plus size={12} /> Add Client
                      </button>
                    </div>
                    <div className="space-y-3">
                      {form.clients.map((client, i) => (
                        <div key={i} className="inner-card">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-luxury-gray-2">Client {i + 1}</p>
                            {form.clients.length > 1 && (
                              <button onClick={() => removeClient(i)} className="text-luxury-gray-3 hover:text-red-500">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs text-luxury-gray-3 mb-1">Name</label>
                              <input className="input-luxury text-sm" value={client.name} onChange={e => updateClient(i, 'name', toTitleCase(e.target.value))} />
                            </div>
                            <div>
                              <label className="block text-xs text-luxury-gray-3 mb-1">Email</label>
                              <input className="input-luxury text-sm" type="email" value={client.email} onChange={e => updateClient(i, 'email', e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs text-luxury-gray-3 mb-1">Phone</label>
                              <input className="input-luxury text-sm" value={client.phone} onChange={e => updateClient(i, 'phone', formatPhone(e.target.value))} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Notes</label>
                    <textarea className="textarea-luxury" rows={3} value={form.notes} onChange={e => updateForm('notes', e.target.value)} />
                  </div>
                </div>
              )}

              {currentSlide.id === 'commission' && (
                <div className="space-y-4">
                  {form.is_lease ? (
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Monthly Rent ($)</label>
                      <input className="input-luxury" type="number" value={form.monthly_rent} onChange={e => updateForm('monthly_rent', e.target.value)} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Sales Price ($)</label>
                      <input className="input-luxury" type="number" value={form.sales_price} onChange={e => updateForm('sales_price', e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Gross Commission</label>
                    <div className="flex gap-2">
                      <input className="input-luxury flex-1" type="number" value={form.gross_commission} onChange={e => updateForm('gross_commission', e.target.value)} />
                      <select className="select-luxury w-24" value={form.gross_commission_type} onChange={e => updateForm('gross_commission_type', e.target.value)}>
                        <option value="percent">%</option>
                        <option value="flat">$</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Bonus Amount ($)</label>
                    <input className="input-luxury" type="number" value={form.bonus_amount} onChange={e => updateForm('bonus_amount', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Rebate Amount ($)</label>
                    <input className="input-luxury" type="number" value={form.rebate_amount} onChange={e => updateForm('rebate_amount', e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="has_btsa" checked={form.has_btsa} onChange={e => updateForm('has_btsa', e.target.checked)} className="accent-luxury-accent" />
                    <label htmlFor="has_btsa" className="text-sm text-luxury-gray-2">Has BTSA</label>
                  </div>
                  {form.has_btsa && (
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">BTSA Amount ($)</label>
                      <input className="input-luxury" type="number" value={form.btsa_amount} onChange={e => updateForm('btsa_amount', e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              {currentSlide.id === 'dates' && (
                <div className="space-y-4">
                  {form.is_lease ? (
                    <>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Move-In Date</label>
                        <input type="date" className="input-luxury" value={form.move_in_date} onChange={e => updateForm('move_in_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Lease Term (months)</label>
                        <input className="input-luxury" type="number" value={form.lease_term} onChange={e => updateForm('lease_term', e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Listing Date</label>
                        <input type="date" className="input-luxury" value={form.listing_date} onChange={e => updateForm('listing_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Listing Expiration</label>
                        <input type="date" className="input-luxury" value={form.listing_expiration_date} onChange={e => updateForm('listing_expiration_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Buyer Agreement Date</label>
                        <input type="date" className="input-luxury" value={form.buyer_agreement_date} onChange={e => updateForm('buyer_agreement_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Buyer Agreement Expiration</label>
                        <input type="date" className="input-luxury" value={form.buyer_agreement_expiration_date} onChange={e => updateForm('buyer_agreement_expiration_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Acceptance Date</label>
                        <input type="date" className="input-luxury" value={form.acceptance_date} onChange={e => updateForm('acceptance_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Closing Date</label>
                        <input type="date" className="input-luxury" value={form.closing_date} onChange={e => updateForm('closing_date', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Loan Type</label>
                        <select className="select-luxury" value={form.loan_type} onChange={e => updateForm('loan_type', e.target.value)}>
                          <option value="">Select...</option>
                          {LOAN_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Title Officer Name</label>
                        <input className="input-luxury" value={form.title_officer_name} onChange={e => updateForm('title_officer_name', toTitleCase(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Title Company</label>
                        <input className="input-luxury" value={form.title_company} onChange={e => updateForm('title_company', toTitleCase(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Title Company Email</label>
                        <input type="email" className="input-luxury" value={form.title_company_email} onChange={e => updateForm('title_company_email', e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {currentSlide.id === 'details' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Flyer Division</label>
                    <select className="select-luxury" value={form.flyer_division} onChange={e => updateForm('flyer_division', e.target.value)}>
                      <option value="">Select...</option>
                      {FLYER_DIVISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: summary panel */}
        <div className="w-64 flex-shrink-0 hidden lg:block">
          <SummaryPanel
            form={form as any}
            transaction={transaction}
            agent={user}
            processingFeeTypes={processingFeeTypes}
          />
        </div>
      </div>
    </div>
  )
}