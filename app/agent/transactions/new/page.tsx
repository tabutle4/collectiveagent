'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Save, FileText, Upload, Check, X } from 'lucide-react'
import { ProcessingFeeType } from '@/lib/transactions/types'
import { getVisibleSlides, REPRESENTATION_TYPES, TENANT_TYPES, LOAN_TYPES, LEAD_SOURCES, FLYER_DIVISIONS, SlideConfig } from '@/lib/transactions/constants'
import SummaryPanel from '@/components/transactions/SummaryPanel'

interface TransactionForm {
  processing_fee_type_id: string
  transaction_type_name: string
  is_lease: boolean
  property_address: string
  property_unit: string
  mls_link: string
  client_name: string
  client_email: string
  client_phone: string
  sales_price: string
  monthly_rent: string
  commission_rate: string
  commission_amount: string
  additional_client_commission: string
  bonus_amount: string
  rebate_amount: string
  closing_date: string
  move_in_date: string
  lease_term: string
  representation_type: string
  tenant_transaction_type: string
  loan_type: string
  lead_source: string
  flyer_division: string
  expedite_requested: boolean
  notes: string
  internal_referral: boolean
  internal_referral_fee: string
  external_referral: boolean
  external_referral_fee: string
  has_btsa: boolean
  btsa_amount: string
  has_ecommission: boolean
  ecommission_amount: string
  title_officer_name: string
  title_company: string
  title_company_email: string
}

const emptyForm: TransactionForm = {
  processing_fee_type_id: '', transaction_type_name: '', is_lease: false,
  property_address: '', property_unit: '', mls_link: '',
  client_name: '', client_email: '', client_phone: '',
  sales_price: '', monthly_rent: '', commission_rate: '', commission_amount: '',
  additional_client_commission: '', bonus_amount: '', rebate_amount: '',
  closing_date: '', move_in_date: '', lease_term: '',
  representation_type: '', tenant_transaction_type: '', loan_type: '',
  lead_source: '', flyer_division: '', expedite_requested: false, notes: '',
  internal_referral: false, internal_referral_fee: '', external_referral: false, external_referral_fee: '',
  has_btsa: false, btsa_amount: '', has_ecommission: false, ecommission_amount: '',
  title_officer_name: '', title_company: '', title_company_email: '',
}

export default function CreateTransactionPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [transactionTypes, setTransactionTypes] = useState<ProcessingFeeType[]>([])
  const [requiredDocs, setRequiredDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<TransactionForm>(emptyForm)
  const [showMobileRight, setShowMobileRight] = useState(false)

  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) { router.push('/auth/login'); return }
      setUser(JSON.parse(userStr))
      const { data: types } = await supabase
        .from('processing_fee_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      setTransactionTypes(types || [])
    } catch (error) { console.error('Error loading data:', error) }
    finally { setLoading(false) }
  }

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

  const visibleSlides = useMemo(() => getVisibleSlides(form.is_lease), [form.is_lease])
  const selectedType = transactionTypes.find(t => t.id === form.processing_fee_type_id)

  const updateForm = (field: keyof TransactionForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const selectTransactionType = (type: ProcessingFeeType) => {
    setForm(prev => ({
      ...prev,
      processing_fee_type_id: type.id,
      transaction_type_name: type.name,
      is_lease: type.is_lease,
    }))
  }

  const scrollToSlide = (slideId: string) => {
    slideRefs.current[slideId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isSlideComplete = (slide: SlideConfig): boolean => {
    switch (slide.id) {
      case 'type': return !!form.processing_fee_type_id
      case 'property': return !!form.property_address
      case 'client': return !!form.client_name
      case 'financials': return !!(form.sales_price || form.monthly_rent)
      case 'dates': return !!(form.closing_date || form.move_in_date)
      case 'details': return !!form.representation_type
      case 'title_info': return !!form.title_company
      case 'documents': return false
      case 'review': return false
      default: return false
    }
  }

  const handleSaveDraft = async () => {
    if (!user || !form.processing_fee_type_id) return
    setSaving(true)
    try {
      const payload: any = {
        submitted_by: user.id,
        property_address: form.property_address || 'Untitled Transaction',
        status: 'prospect',
        compliance_status: 'not_requested',
        processing_fee_type_id: form.processing_fee_type_id,
        client_name: form.client_name || null,
        client_email: form.client_email || null,
        client_phone: form.client_phone || null,
        mls_link: form.mls_link || null,
        lead_source: form.lead_source || null,
        notes: form.notes || null,
        sales_price: form.sales_price ? parseFloat(form.sales_price) : null,
        monthly_rent: form.monthly_rent ? parseFloat(form.monthly_rent) : null,
        commission_rate: form.commission_rate ? parseFloat(form.commission_rate) : null,
        commission_amount: form.commission_amount ? parseFloat(form.commission_amount) : null,
        additional_client_commission: form.additional_client_commission ? parseFloat(form.additional_client_commission) : 0,
        bonus_amount: form.bonus_amount ? parseFloat(form.bonus_amount) : 0,
        rebate_amount: form.rebate_amount ? parseFloat(form.rebate_amount) : 0,
        closing_date: form.closing_date || null,
        move_in_date: form.move_in_date || null,
        lease_term: form.lease_term || null,
        representation_type: form.representation_type || null,
        tenant_transaction_type: form.tenant_transaction_type || null,
        loan_type: form.loan_type || null,
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
        has_referral: form.internal_referral || form.external_referral,
        title_officer_name: form.title_officer_name || null,
        title_company: form.title_company || null,
        title_company_email: form.title_company_email || null,
      }
      const { data, error } = await supabase.from('transactions').insert([payload]).select().single()
      if (error) throw error
      router.push('/agent/transactions')
    } catch (error: any) {
      console.error('Error saving transaction:', error)
      alert(`Failed to save: ${error.message}`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => router.push('/agent/transactions')} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors mb-1 block">
            ← Back to Transactions
          </button>
          <h1 className="page-title">NEW TRANSACTION</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSaveDraft} disabled={saving || !form.processing_fee_type_id} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => setShowMobileRight(!showMobileRight)} className="btn btn-secondary lg:hidden flex items-center gap-1.5">
            <FileText size={14} /> Progress
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT: All slides stacked vertically */}
        <div className={`${showMobileRight ? 'hidden lg:block' : ''} lg:col-span-8 space-y-5`}>

          {/* Slide: Transaction Type */}
          <div ref={el => { slideRefs.current['type'] = el }} className="container-card">
            <SlideType types={transactionTypes} selected={form.processing_fee_type_id} onSelect={selectTransactionType} />
          </div>

          {/* Slide: Property Details */}
          <div ref={el => { slideRefs.current['property'] = el }} className="container-card">
            <SlideProperty form={form} onChange={updateForm} />
          </div>

          {/* Slide: Client Information */}
          <div ref={el => { slideRefs.current['client'] = el }} className="container-card">
            <SlideClient form={form} onChange={updateForm} />
          </div>

          {/* Slide: Financial Details */}
          <div ref={el => { slideRefs.current['financials'] = el }} className="container-card">
            <SlideFinancials form={form} onChange={updateForm} />
          </div>

          {/* Slide: Key Dates */}
          <div ref={el => { slideRefs.current['dates'] = el }} className="container-card">
            <SlideDates form={form} onChange={updateForm} />
          </div>

          {/* Slide: Additional Details */}
          <div ref={el => { slideRefs.current['details'] = el }} className="container-card">
            <SlideDetails form={form} onChange={updateForm} />
          </div>

          {/* Slide: Title Information (sales only) */}
          {!form.is_lease && (
            <div ref={el => { slideRefs.current['title_info'] = el }} className="container-card">
              <SlideTitleInfo form={form} onChange={updateForm} />
            </div>
          )}

          {/* Slide: Documents */}
          <div ref={el => { slideRefs.current['documents'] = el }} className="container-card">
            <SlideDocuments requiredDocs={requiredDocs} />
          </div>

          {/* Slide: Review & Save */}
          <div ref={el => { slideRefs.current['review'] = el }} className="container-card">
            <SlideReview form={form} selectedType={selectedType} onSave={handleSaveDraft} saving={saving} />
          </div>
        </div>

        {/* RIGHT: Progress steps + Summary (sticky) */}
        <div className={`${showMobileRight ? 'block' : 'hidden'} lg:block lg:col-span-4`}>
          <div className="lg:sticky lg:top-4 space-y-5">
            {/* Step Progress */}
            <div className="container-card p-3">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="section-title mb-0">Progress</h2>
                {showMobileRight && (
                  <button onClick={() => setShowMobileRight(false)} className="lg:hidden text-luxury-gray-3 hover:text-luxury-gray-1">
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {visibleSlides.map((slide) => {
                  const done = isSlideComplete(slide)
                  return (
                    <button
                      key={slide.id}
                      onClick={() => { scrollToSlide(slide.id); setShowMobileRight(false) }}
                      className="slide-nav-item flex items-center gap-2 w-full"
                    >
                      <div className={done ? 'checklist-check-done' : 'checklist-check'}>
                        {done && <Check size={8} />}
                      </div>
                      <span className={done ? 'text-luxury-gray-1' : ''}>{slide.title}</span>
                    </button>
                  )
                })}
              </div>
              {/* Mini progress bar */}
              <div className="mt-3 px-1">
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${(visibleSlides.filter(s => isSlideComplete(s)).length / visibleSlides.length) * 100}%` }} />
                </div>
                <p className="text-xs text-luxury-gray-3 mt-1">{visibleSlides.filter(s => isSlideComplete(s)).length} of {visibleSlides.length} complete</p>
              </div>
            </div>

            {/* Summary Panel */}
            <SummaryPanel
              typeName={selectedType?.name || null}
              typeId={form.processing_fee_type_id}
              isLease={form.is_lease}
              propertyAddress={form.property_address}
              clientName={form.client_name}
              salesPrice={form.sales_price}
              monthlyRent={form.monthly_rent}
              commissionRate={form.commission_rate}
              closingDate={form.closing_date}
              moveInDate={form.move_in_date}
              expediteRequested={form.expedite_requested}
              processingFee={selectedType?.processing_fee || 0}
              onClose={() => setShowMobileRight(false)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== SLIDE COMPONENTS =====

type FormUpdater = (field: keyof TransactionForm, value: any) => void

function SlideType({ types, selected, onSelect }: { types: ProcessingFeeType[]; selected: string; onSelect: (t: ProcessingFeeType) => void }) {
  return (
    <div>
      <h2 className="section-title">Select Transaction Type</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {types.map((type) => (
          <button key={type.id} onClick={() => onSelect(type)} className={selected === type.id ? 'type-card-selected' : 'type-card'}>
            <p className="text-sm font-semibold text-luxury-gray-1">{type.name}</p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs text-luxury-gray-3">Fee: {type.processing_fee > 0 ? `$${type.processing_fee}` : 'None'}</span>
              {type.is_lease && <span className="text-xs text-blue-600">Lease</span>}
              {type.additional_fee_description && <span className="text-xs text-luxury-gray-3">+ {type.additional_fee_description}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function SlideProperty({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Property Details</h2>
      <div className="space-y-4">
        <div><label className="field-label">Property Address</label><input className="input-luxury" value={form.property_address} onChange={(e) => onChange('property_address', e.target.value)} placeholder="123 Main St, Houston, TX 77001" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Unit / Suite</label><input className="input-luxury" value={form.property_unit} onChange={(e) => onChange('property_unit', e.target.value)} placeholder="Apt 4B" /></div>
          <div><label className="field-label">Lead Source</label>
            <select className="select-luxury" value={form.lead_source} onChange={(e) => onChange('lead_source', e.target.value)}>
              <option value="">Select...</option>
              {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div><label className="field-label">MLS Link</label><input className="input-luxury" value={form.mls_link} onChange={(e) => onChange('mls_link', e.target.value)} placeholder="https://..." /></div>
        <div><label className="field-label">Notes</label><textarea className="textarea-luxury" rows={3} value={form.notes} onChange={(e) => onChange('notes', e.target.value)} placeholder="Any additional notes..." /></div>
      </div>
    </div>
  )
}

function SlideClient({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Client Information</h2>
      <div className="space-y-4">
        <div><label className="field-label">Client Name</label><input className="input-luxury" value={form.client_name} onChange={(e) => onChange('client_name', e.target.value)} placeholder="John Doe" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Client Email</label><input className="input-luxury" type="email" value={form.client_email} onChange={(e) => onChange('client_email', e.target.value)} placeholder="john@example.com" /></div>
          <div><label className="field-label">Client Phone</label><input className="input-luxury" value={form.client_phone} onChange={(e) => onChange('client_phone', e.target.value)} placeholder="(555) 123-4567" /></div>
        </div>
      </div>
    </div>
  )
}

function SlideFinancials({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Financial Details</h2>
      <div className="space-y-4">
        {form.is_lease ? (
          <div><label className="field-label">Monthly Rent</label><input className="input-luxury" type="number" step="0.01" value={form.monthly_rent} onChange={(e) => onChange('monthly_rent', e.target.value)} placeholder="0.00" /></div>
        ) : (
          <div><label className="field-label">Sales Price</label><input className="input-luxury" type="number" step="0.01" value={form.sales_price} onChange={(e) => onChange('sales_price', e.target.value)} placeholder="0.00" /></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Commission Rate (%)</label><input className="input-luxury" type="number" step="0.01" value={form.commission_rate} onChange={(e) => onChange('commission_rate', e.target.value)} placeholder="3.00" /></div>
          <div><label className="field-label">Commission Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.commission_amount} onChange={(e) => onChange('commission_amount', e.target.value)} placeholder="0.00" /></div>
        </div>
        <div><label className="field-label">Additional Client Commission ($)</label><input className="input-luxury" type="number" step="0.01" value={form.additional_client_commission} onChange={(e) => onChange('additional_client_commission', e.target.value)} placeholder="0.00" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Bonus ($)</label><input className="input-luxury" type="number" step="0.01" value={form.bonus_amount} onChange={(e) => onChange('bonus_amount', e.target.value)} placeholder="0.00" /></div>
          <div><label className="field-label">Rebate ($)</label><input className="input-luxury" type="number" step="0.01" value={form.rebate_amount} onChange={(e) => onChange('rebate_amount', e.target.value)} placeholder="0.00" /></div>
        </div>
      </div>
    </div>
  )
}

function SlideDates({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Key Dates</h2>
      <div className="space-y-4">
        {form.is_lease ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Move-in Date</label><input className="input-luxury" type="date" value={form.move_in_date} onChange={(e) => onChange('move_in_date', e.target.value)} /></div>
            <div><label className="field-label">Lease Term</label><input className="input-luxury" value={form.lease_term} onChange={(e) => onChange('lease_term', e.target.value)} placeholder="12 months" /></div>
          </div>
        ) : (
          <div><label className="field-label">Closing Date</label><input className="input-luxury" type="date" value={form.closing_date} onChange={(e) => onChange('closing_date', e.target.value)} /></div>
        )}
      </div>
    </div>
  )
}

function SlideDetails({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Additional Details</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="field-label">Representation Type</label>
            <select className="select-luxury" value={form.representation_type} onChange={(e) => onChange('representation_type', e.target.value)}>
              <option value="">Select...</option>
              {REPRESENTATION_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {form.is_lease ? (
            <div><label className="field-label">Tenant Type</label>
              <select className="select-luxury" value={form.tenant_transaction_type} onChange={(e) => onChange('tenant_transaction_type', e.target.value)}>
                <option value="">Select...</option>
                {TENANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          ) : (
            <div><label className="field-label">Loan Type</label>
              <select className="select-luxury" value={form.loan_type} onChange={(e) => onChange('loan_type', e.target.value)}>
                <option value="">Select...</option>
                {LOAN_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          )}
        </div>
        <div><label className="field-label">Flyer Division</label>
          <select className="select-luxury" value={form.flyer_division} onChange={(e) => onChange('flyer_division', e.target.value)}>
            <option value="">Select...</option>
            {FLYER_DIVISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        <div className="inner-card">
          <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Referrals</h3>
          <div className="space-y-3">
            <label className="checkbox-label"><input type="checkbox" checked={form.internal_referral} onChange={(e) => onChange('internal_referral', e.target.checked)} className="w-4 h-4" />Internal Referral</label>
            {form.internal_referral && (
              <div><label className="field-label">Internal Referral Fee ($)</label><input className="input-luxury" type="number" step="0.01" value={form.internal_referral_fee} onChange={(e) => onChange('internal_referral_fee', e.target.value)} /></div>
            )}
            <label className="checkbox-label"><input type="checkbox" checked={form.external_referral} onChange={(e) => onChange('external_referral', e.target.checked)} className="w-4 h-4" />External Referral</label>
            {form.external_referral && (
              <div><label className="field-label">External Referral Fee ($)</label><input className="input-luxury" type="number" step="0.01" value={form.external_referral_fee} onChange={(e) => onChange('external_referral_fee', e.target.value)} /></div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="inner-card">
            <label className="checkbox-label"><input type="checkbox" checked={form.has_btsa} onChange={(e) => onChange('has_btsa', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">BTSA</span></label>
            {form.has_btsa && (
              <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.btsa_amount} onChange={(e) => onChange('btsa_amount', e.target.value)} /></div>
            )}
          </div>
          <div className="inner-card">
            <label className="checkbox-label"><input type="checkbox" checked={form.has_ecommission} onChange={(e) => onChange('has_ecommission', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">eCommission</span></label>
            {form.has_ecommission && (
              <div className="mt-3"><label className="field-label">Amount ($)</label><input className="input-luxury" type="number" step="0.01" value={form.ecommission_amount} onChange={(e) => onChange('ecommission_amount', e.target.value)} /></div>
            )}
          </div>
          <div className="inner-card">
            <label className="checkbox-label"><input type="checkbox" checked={form.expedite_requested} onChange={(e) => onChange('expedite_requested', e.target.checked)} className="w-4 h-4" /><span className="font-semibold">Expedite ($95)</span></label>
          </div>
        </div>
      </div>
    </div>
  )
}

function SlideTitleInfo({ form, onChange }: { form: TransactionForm; onChange: FormUpdater }) {
  return (
    <div>
      <h2 className="section-title">Title Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className="field-label">Title Company</label><input className="input-luxury" value={form.title_company} onChange={(e) => onChange('title_company', e.target.value)} placeholder="ABC Title Company" /></div>
        <div><label className="field-label">Title Officer Name</label><input className="input-luxury" value={form.title_officer_name} onChange={(e) => onChange('title_officer_name', e.target.value)} placeholder="Jane Smith" /></div>
        <div><label className="field-label">Title Company Email</label><input className="input-luxury" type="email" value={form.title_company_email} onChange={(e) => onChange('title_company_email', e.target.value)} placeholder="closing@abctitle.com" /></div>
      </div>
    </div>
  )
}

function SlideDocuments({ requiredDocs }: { requiredDocs: any[] }) {
  return (
    <div>
      <h2 className="section-title">Documents</h2>
      <p className="text-xs text-luxury-gray-3 mb-4">Upload documents now or after saving. You can also email documents to the transaction's unique email address.</p>
      {requiredDocs.length > 0 && (
        <div className="inner-card mb-4">
          <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Required Documents</h3>
          <div className="space-y-1.5">
            {requiredDocs.map(doc => (
              <div key={doc.id} className="checklist-item">
                <div className="checklist-check" />
                <span>{doc.name}</span>
                {doc.is_required && <span className="text-red-500">*</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="upload-zone py-10">
        <Upload size={24} className="mx-auto text-luxury-gray-3 mb-2" />
        <p className="text-xs text-luxury-gray-3 mb-1">Documents can be uploaded after saving the transaction</p>
        <p className="text-xs text-luxury-gray-3">Save your transaction first, then upload from the detail page</p>
      </div>
    </div>
  )
}

function SlideReview({ form, selectedType, onSave, saving }: { form: TransactionForm; selectedType?: ProcessingFeeType; onSave: () => void; saving: boolean }) {
  return (
    <div>
      <h2 className="section-title">Review & Save</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="inner-card">
            <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Transaction Type</h3>
            <p className="text-sm text-luxury-gray-1 font-medium">{selectedType?.name || 'Not selected'}</p>
            {selectedType && selectedType.processing_fee > 0 && <p className="text-xs text-luxury-gray-3 mt-1">Processing fee: ${selectedType.processing_fee}</p>}
          </div>
          {form.property_address && (
            <div className="inner-card">
              <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Property</h3>
              <p className="text-sm text-luxury-gray-1">{form.property_address}{form.property_unit ? `, ${form.property_unit}` : ''}</p>
              {form.mls_link && <a href={form.mls_link} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent mt-1 block">View MLS Listing</a>}
            </div>
          )}
          {form.client_name && (
            <div className="inner-card">
              <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Client</h3>
              <p className="text-sm text-luxury-gray-1">{form.client_name}</p>
              {form.client_email && <p className="text-xs text-luxury-gray-3">{form.client_email}</p>}
              {form.client_phone && <p className="text-xs text-luxury-gray-3">{form.client_phone}</p>}
            </div>
          )}
          {(form.sales_price || form.monthly_rent || form.commission_rate) && (
            <div className="inner-card">
              <h3 className="text-xs font-semibold text-luxury-gray-2 mb-2">Financials</h3>
              {form.sales_price && <p className="text-xs text-luxury-gray-2">Sales Price: ${parseFloat(form.sales_price).toLocaleString()}</p>}
              {form.monthly_rent && <p className="text-xs text-luxury-gray-2">Monthly Rent: ${parseFloat(form.monthly_rent).toLocaleString()}</p>}
              {form.commission_rate && <p className="text-xs text-luxury-gray-2">Commission: {form.commission_rate}%</p>}
            </div>
          )}
        </div>
        <div className="alert-info">This transaction will be saved as a draft. You can request compliance review after filling in all required fields.</div>
        <div className="flex justify-end">
          <button onClick={onSave} disabled={saving || !form.processing_fee_type_id} className="btn btn-primary flex items-center gap-1.5 disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
