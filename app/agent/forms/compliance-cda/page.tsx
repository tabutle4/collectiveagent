'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, AlertCircle, CheckCircle2, Info, ExternalLink } from 'lucide-react'
import { LEAD_SOURCES, LOAN_TYPES, FLYER_DIVISIONS } from '@/lib/transactions/constants'

const TEAM_OR_OFFICE_OPTIONS = [
  'Houston Office', 'Dallas Office', 'Clutch City Realty Group',
  'Elevé Relocation Group', 'The AG Luxe Team', 'The Signature Group',
  'The Luxe Collective Team', 'Nexa Real Estate Group', 'Elevated Realty Group',
]

const REPRESENTATION_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'nc_buyer', label: 'New Construction Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'referred_out', label: 'I referred this client to an external agent.' },
]

const TENANT_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'tenant_non_apt_v2', label: 'Tenant Lease (not apartment)' },
  { value: 'tenant_simplyhome_v2', label: 'Builder Home Rental' },
]

const REFERRED_CLIENT_TYPES = [
  { value: 'tenant', label: 'Tenant' }, { value: 'landlord', label: 'Landlord' },
  { value: 'buyer', label: 'Buyer' }, { value: 'nc_buyer', label: 'New Construction Buyer' },
  { value: 'seller', label: 'Seller' },
]

const FEE_TYPES = [
  { value: 'commission', label: 'Commission' },
  { value: 'brokerage_processing_fee', label: 'Brokerage Processing Fee' },
  { value: 'coaching_fee', label: 'Coaching Fee' },
  { value: 'other', label: 'Other' },
]

const RETAINER_TYPES = [
  { value: 'residential_rental', label: 'Residential Rental', min: 250, max: 500 },
  { value: 'residential_buyer', label: 'Residential Buyer', min: 750, max: 1000 },
  { value: 'commercial_rental', label: 'Commercial Rental', min: 750, max: 1000 },
]

const RETAINER_DOCS: Record<string, string[]> = {
  residential_rental: ['Information About Brokerage Services (IABS)', 'Buyer/Tenant Representation Agreement (TXR 1501)'],
  residential_buyer: ['Information About Brokerage Services (IABS)', 'Buyer/Tenant Representation Agreement (TXR 1501)', 'Wire Fraud Notice', 'General Information and Notice to Buyers and Sellers'],
  commercial_rental: ['Information About Brokerage Services (IABS)', 'Buyer/Tenant Representation Agreement (TXR 1501)', 'Broker Notice to Tenant'],
}

interface Comp { id: string; amount: string; fee_type: string; fee_type_other: string; paid_by: string; paid_by_other: string }
const emptyComp = (): Comp => ({ id: crypto.randomUUID(), amount: '', fee_type: '', fee_type_other: '', paid_by: '', paid_by_other: '' })

type Mode = 'compliance' | 'subsequent' | 'retainer'

export default function ComplianceCdaForm() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [agentTeam, setAgentTeam] = useState<{ team_name: string } | null>(null)
  const [mode, setMode] = useState<Mode>('compliance')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([])
  const [confirmedNewDeal, setConfirmedNewDeal] = useState(false)

  // Transaction search
  const [addressSearch, setAddressSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [foundTransaction, setFoundTransaction] = useState<any>(null)
  const [lastSubmission, setLastSubmission] = useState<any>(null)
  const [searchDone, setSearchDone] = useState(false)

  // Compliance form state
  const [form, setForm] = useState({
    team_or_office: '', unit: '', in_matrix: '' as '' | 'yes' | 'no',
    mls_link: '', client_name: '', client_email: '', lead_source: '',
    closing_or_movein_date: '', representing: '', tenant_transaction_type: '',
    lease_term_months: '', referred_client_type: '', commission_basis_price: '',
    commission_rate: '', commission_rate_type: 'percent' as 'percent' | 'flat',
    total_sales_rent_price: '', bonus_btsa_amount: '0', rebate_amount: '0',
    internal_referral: false, internal_referral_fee: '',
    external_referral: false, external_referral_fee: '',
    brokerage_referral: false, brokerage_referral_fee: '',
    title_officer_name: '', title_company: '', title_company_email: '',
    loan_type: '', expedite_acknowledged: false,
    bedrooms: '', bathrooms: '', garage: '', sqft: '',
    flyer_display_type: 'office' as 'office' | 'team' | 'division',
    flyer_division: '', additional_notes: '',
  })
  const [comps, setComps] = useState<Comp[]>([])

  // Retainer form state
  const [retainer, setRetainer] = useState({
    client_name: '', retainer_transaction_type: '', retainer_amount: '', docs_confirmed: false,
  })

  // Subsequent notes
  const [subsequentNotes, setSubsequentNotes] = useState('')
  const [expediteAcknowledgedSub, setExpediteAcknowledgedSub] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) { router.push('/auth/login'); return }
      const data = await res.json()
      setUser(data.user)
      if (data.user?.division?.length) setField('flyer_display_type', 'division')
    }
    fetchUser()
  }, [router])

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/users/profile?id=${user.id}`).then(r => r.json()).then(d => {
      if (d.teamName) {
        setAgentTeam({ team_name: d.teamName })
        setField('flyer_display_type', 'team')
      }
    }).catch(() => {})
  }, [user?.id])

  const isLease = form.representing === 'tenant' || form.representing === 'landlord'
  const setField = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))
  const setRField = (k: keyof typeof retainer, v: any) => setRetainer(prev => ({ ...prev, [k]: v }))

  const paidByOptions = () => {
    const other = [{ value: 'other', label: 'Other' }]
    const r = form.representing
    if (r === 'buyer' || r === 'nc_buyer') return [{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' }, ...other]
    if (r === 'seller') return [{ value: 'seller', label: 'Seller' }, { value: 'buyer', label: 'Buyer' }, ...other]
    if (r === 'tenant') return [{ value: 'tenant', label: 'Tenant' }, { value: 'landlord', label: 'Landlord' }, ...other]
    if (r === 'landlord') return [{ value: 'landlord', label: 'Landlord' }, { value: 'tenant', label: 'Tenant' }, ...other]
    return [{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' }, { value: 'tenant', label: 'Tenant' }, { value: 'landlord', label: 'Landlord' }, ...other]
  }

  const handleSearch = useCallback(async () => {
    if (!addressSearch.trim()) return
    setSearching(true); setSearchDone(false)
    try {
      const url = `/api/agent/forms/compliance-cda?address=${encodeURIComponent(addressSearch)}&mode=${mode}`
      const res = await fetch(url)
      const data = await res.json()
      setFoundTransaction(data.transaction || null)
      setLastSubmission(data.last_submission || null)
      setSearchDone(true)
      // Pre-fill subsequent form from last submission
      if (mode === 'subsequent' && data.transaction && data.last_submission?.data) {
        const src = data.last_submission.data
        const txn = data.transaction
        setForm(prev => ({
          ...prev,
          representing: src.representing || txn.representing || '',
          tenant_transaction_type: src.tenant_transaction_type || txn.tenant_transaction_type || '',
          lease_term_months: src.lease_term_months ? String(src.lease_term_months) : txn.lease_term ? String(txn.lease_term) : '',
          referred_client_type: src.referred_client_type || '',
          closing_or_movein_date: src.closing_or_movein_date || txn.closing_date || txn.move_in_date || '',
          commission_basis_price: src.commission_basis_price ? String(src.commission_basis_price) : txn.gross_commission ? String(txn.gross_commission) : '',
          commission_rate: src.commission_rate || '',
          commission_rate_type: src.commission_rate_type || 'percent',
          total_sales_rent_price: src.total_sales_rent_price ? String(src.total_sales_rent_price) : txn.sales_price ? String(txn.sales_price) : txn.monthly_rent ? String(txn.monthly_rent) : '',
          bonus_btsa_amount: src.bonus_btsa_amount !== undefined ? String(src.bonus_btsa_amount) : '0',
          rebate_amount: src.rebate_amount !== undefined ? String(src.rebate_amount) : '0',
          internal_referral: src.internal_referral ?? false,
          internal_referral_fee: src.internal_referral_fee ? String(src.internal_referral_fee) : '',
          external_referral: src.external_referral ?? false,
          external_referral_fee: src.external_referral_fee ? String(src.external_referral_fee) : '',
          brokerage_referral: src.brokerage_referral ?? false,
          brokerage_referral_fee: src.brokerage_referral_fee ? String(src.brokerage_referral_fee) : '',
          loan_type: src.loan_type || txn.loan_type || '',
        }))
      }
    } catch { setSearchDone(true) } finally { setSearching(false) }
  }, [addressSearch, mode])

  const handleSubmit = async () => {
    setError('')
    let payload: any = { submission_mode: mode }

    if (mode === 'retainer') {
      if (!retainer.client_name.trim()) { setError('Client name is required.'); return }
      if (!retainer.retainer_transaction_type) { setError('Transaction type is required.'); return }
      if (!retainer.retainer_amount || parseFloat(retainer.retainer_amount) <= 0) { setError('Retainer amount is required.'); return }
      if (!retainer.docs_confirmed) { setError('You must confirm all required documents are signed and uploaded to BoldTrail.'); return }
      payload = { ...payload, ...retainer, retainer_amount: parseFloat(retainer.retainer_amount), confirm_new_deal: confirmedNewDeal }
    } else if (mode === 'subsequent') {
      if (!searchDone || !foundTransaction) { setError('Please find your transaction first.'); return }
      if (!expediteAcknowledgedSub) { setError('You must acknowledge the expedite policy.'); return }
      payload = { ...payload, ...form, transaction_id: foundTransaction.id, last_submission_id: lastSubmission?.id || null, notes: subsequentNotes }
    } else {
      if (!form.expedite_acknowledged) { setError('You must acknowledge the expedite policy.'); return }
      if (!form.client_name) { setError('Client name is required.'); return }
      if (!form.closing_or_movein_date) { setError('Closing or move-in date is required.'); return }
      if (!form.representing) { setError('Representation is required.'); return }
      if (!form.commission_basis_price) { setError('Commission basis price is required.'); return }
      if (!form.commission_rate) { setError('Commission rate is required.'); return }
      if (!form.flyer_display_type) { setError('Please select what to show on your flyer.'); return }
      if (form.flyer_display_type === 'division' && !form.flyer_division) { setError('Please select a division for your flyer.'); return }
      payload = {
        ...payload, ...form,
        property_address: foundTransaction?.property_address || addressSearch,
        transaction_id: foundTransaction?.id || null,
        additional_compensation: comps.map(c => ({ amount: parseFloat(c.amount) || 0, fee_type: c.fee_type, fee_type_other: c.fee_type_other || null, paid_by: c.paid_by, paid_by_other: c.paid_by_other || null })),
        flyer_team_name: agentTeam?.team_name || null,
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/agent/forms/compliance-cda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (res.ok && data.duplicate_check) { setDuplicateMatches(data.matches || []); return }
      if (!res.ok || !data.success) { setError(data.error || 'Submission failed. Please try again.'); return }
      setSubmitResult(data)
      setSubmitted(true)
    } catch { setError('An unexpected error occurred. Please try again.') } finally { setSubmitting(false) }
  }

  if (!user) return null

  if (submitted && submitResult) {
    return (
      <div>
        <h1 className="page-title mb-6">COMPLIANCE &amp; CDA</h1>
        <div className="container-card">
          <div className="flex flex-col items-center py-12 text-center gap-4">
            <CheckCircle2 size={40} className="text-green-600" />
            <p className="text-sm font-semibold text-luxury-gray-1">Submitted successfully</p>
            <p className="text-xs text-luxury-gray-3 max-w-sm">{submitResult.message}</p>
            {submitResult.flyer_url && (
              <a href={submitResult.flyer_url} className="btn btn-primary text-xs mt-2">
                Upload Photo &amp; Get Your Flyer
              </a>
            )}
            <button onClick={() => router.push('/agent/forms')} className="btn btn-secondary text-xs">
              Back to Forms
            </button>
          </div>
        </div>
      </div>
    )
  }

  const selectedRetainerType = RETAINER_TYPES.find(t => t.value === retainer.retainer_transaction_type)
  const requiredDocs = retainer.retainer_transaction_type ? RETAINER_DOCS[retainer.retainer_transaction_type] || [] : []

  return (
    <div>
      <h1 className="page-title mb-2">COMPLIANCE &amp; CDA</h1>
      <p className="text-xs text-luxury-gray-3 mb-6">Select the type of submission below.</p>

      {/* Stop notice */}
      <div className="inner-card border-red-200 bg-red-50 mb-6">
        <div className="flex gap-2 items-start">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-medium">
            STOP - Do not complete this form until all required compliance documents have been signed and uploaded to BoldTrail Back Office.
          </p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="container-card mb-6">
        <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">What are you submitting?</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            { value: 'compliance' as Mode, label: 'Compliance & CDA Request', desc: 'First-time submission for a transaction' },
            { value: 'subsequent' as Mode, label: 'Subsequent Compliance', desc: 'Resubmit after uploading missing documents' },
            { value: 'retainer' as Mode, label: 'Retainer Submission', desc: 'Submit retainer for a buyer or tenant rep' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setMode(opt.value); setSearchDone(false); setFoundTransaction(null); setLastSubmission(null); setAddressSearch(''); setError(''); setDuplicateMatches([]); setConfirmedNewDeal(false) }}
              className={`text-left p-4 rounded border transition-colors ${mode === opt.value ? 'border-luxury-accent bg-luxury-accent/5' : 'border-luxury-gray-5/50 hover:border-luxury-gray-3'}`}
            >
              <p className={`text-sm font-semibold mb-1 ${mode === opt.value ? 'text-luxury-accent' : 'text-luxury-gray-1'}`}>{opt.label}</p>
              <p className="text-xs text-luxury-gray-3">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="container-card space-y-8">

        {/* ────────────────────────────────────────────────────────────────────
            RETAINER MODE
        ──────────────────────────────────────────────────────────────────── */}
        {mode === 'retainer' && duplicateMatches.length > 0 && (
          <section>
            <div className="inner-card border-luxury-accent/40 bg-luxury-accent/5 space-y-4">
              <p className="text-sm font-semibold text-luxury-gray-1">We found an existing retainer for a client with a similar name.</p>
              <p className="text-xs text-luxury-gray-3">Is this the same deal, or a new one?</p>
              <div className="space-y-2">
                {duplicateMatches.map((m: any) => (
                  <div key={m.id} className="inner-card flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">{m.client_name}</p>
                      <p className="text-xs text-luxury-gray-3">Created {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <a href={`/transactions/${m.id}`} className="btn btn-secondary text-xs flex-shrink-0">View Deal</a>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2 border-t border-luxury-gray-5/50">
                <button
                  onClick={() => { setConfirmedNewDeal(true); setDuplicateMatches([]) }}
                  className="btn btn-secondary text-xs"
                >
                  Not the same - create new
                </button>
              </div>
            </div>
          </section>
        )}
        {mode === 'retainer' && duplicateMatches.length === 0 && (
          <>
            <div className="flex items-start gap-2 p-3 bg-luxury-gray-5/20 rounded text-xs text-luxury-gray-2">
              <Info size={13} className="flex-shrink-0 mt-0.5 text-luxury-accent" />
              <span>
                Read the{' '}
                <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Buyer-Tenant-Representation-Retainer-Fee-Policy.aspx" target="_blank" rel="noopener noreferrer" className="text-luxury-accent underline inline-flex items-center gap-0.5">
                  Retainer Fee Policy <ExternalLink size={10} />
                </a>{' '}
                before submitting. The client pays through the office link. You may not collect retainer payments directly. The office processes your payout within 48-72 hours of payment clearing and documents approved. A $45 processing fee is deducted.
              </span>
            </div>

            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Client & Transaction</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Client Name <span className="text-red-500">*</span></label>
                  <input className="input-luxury w-full text-sm" value={retainer.client_name} onChange={e => setRField('client_name', e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Transaction Type <span className="text-red-500">*</span></label>
                  <select className="input-luxury w-full text-sm" value={retainer.retainer_transaction_type} onChange={e => setRField('retainer_transaction_type', e.target.value)}>
                    <option value="">Select...</option>
                    {RETAINER_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label} (${t.min}-${t.max})</option>
                    ))}
                  </select>
                  {selectedRetainerType && (
                    <p className="text-xs text-luxury-gray-3 mt-1">Allowed range: ${selectedRetainerType.min} - ${selectedRetainerType.max}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Retainer Amount <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={retainer.retainer_amount} onChange={e => setRField('retainer_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  {retainer.retainer_amount && selectedRetainerType && (
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      Agent net after $45 processing fee: ${Math.max(0, parseFloat(retainer.retainer_amount || '0') - 45).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {retainer.retainer_transaction_type && requiredDocs.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Required Documents</h2>
                <p className="text-xs text-luxury-gray-3 mb-3">All of the following must be signed by the client and uploaded to BoldTrail before submitting:</p>
                <ul className="space-y-1 mb-4">
                  {requiredDocs.map(doc => (
                    <li key={doc} className="flex items-center gap-2 text-xs text-luxury-gray-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-luxury-accent flex-shrink-0" />
                      {doc}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" checked={retainer.docs_confirmed} onChange={e => setRField('docs_confirmed', e.target.checked)} />
                  <span className="text-xs text-luxury-gray-2">I confirm that all required documents have been signed by the client and uploaded to BoldTrail Back Office.</span>
                </label>
              </section>
            )}
          </>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            SUBSEQUENT MODE - transaction search + abbreviated fields
        ──────────────────────────────────────────────────────────────────── */}
        {mode === 'subsequent' && (
          <>
            <div className="flex items-start gap-2 p-3 bg-luxury-gray-5/20 rounded text-xs text-luxury-gray-2">
              <Info size={13} className="flex-shrink-0 mt-0.5 text-luxury-accent" />
              <span>Fields are pre-filled from your last submission. Review and update anything that has changed. The system automatically detects and flags changes for the reviewer.</span>
            </div>

            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Find Your Transaction</h2>
              <div className="flex gap-2">
                <input className="input-luxury flex-1 text-sm" placeholder="Property address..." value={addressSearch} onChange={e => setAddressSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={searching || !addressSearch.trim()} className="btn btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
                  <Search size={13} />{searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchDone && (
                <div className={`mt-3 p-3 rounded text-xs ${foundTransaction ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {foundTransaction ? `Found: ${foundTransaction.property_address} - Status: ${foundTransaction.status}` : 'No transaction found. Please check the address and try again.'}
                </div>
              )}
            </section>

            {foundTransaction && (
              <>
                <section>
                  <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Transaction</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Closing or Move-In Date</label>
                      <input type="date" className="input-luxury w-full text-sm" value={form.closing_or_movein_date} onChange={e => setField('closing_or_movein_date', e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-luxury-gray-3 mb-1">Who did you represent?</label>
                      <div className="flex flex-wrap gap-3 mt-2">
                        {REPRESENTATION_OPTIONS.map(o => (
                          <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="radio" name="sub_representing" value={o.value} checked={form.representing === o.value} onChange={() => setField('representing', o.value)} className="w-3.5 h-3.5" />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    {(form.representing === 'tenant' || form.representing === 'landlord') && (
                      <>
                        <div>
                          <label className="block text-xs text-luxury-gray-3 mb-1">Tenant Transaction Type</label>
                          <select className="input-luxury w-full text-sm" value={form.tenant_transaction_type} onChange={e => setField('tenant_transaction_type', e.target.value)}>
                            <option value="">Select...</option>
                            {TENANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-luxury-gray-3 mb-1">Lease Term (months)</label>
                          <input type="number" className="input-luxury w-full text-sm" value={form.lease_term_months} onChange={e => setField('lease_term_months', e.target.value)} placeholder="12" min="1" />
                        </div>
                      </>
                    )}
                    {form.representing === 'referred_out' && (
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1">What type of client did you refer?</label>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {REFERRED_CLIENT_TYPES.map(o => (
                            <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="radio" name="sub_referred" value={o.value} checked={form.referred_client_type === o.value} onChange={() => setField('referred_client_type', o.value)} className="w-3.5 h-3.5" />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Commission</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Commission Basis Price</label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.commission_basis_price} onChange={e => setField('commission_basis_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Commission Rate</label>
                      <div className="flex gap-2">
                        <select className="input-luxury text-sm w-20 flex-shrink-0" value={form.commission_rate_type} onChange={e => setField('commission_rate_type', e.target.value)}>
                          <option value="percent">%</option>
                          <option value="flat">$</option>
                        </select>
                        <input type="number" className="input-luxury flex-1 text-sm" value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Total {isLease ? 'Rent' : 'Sales'} Price</label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.total_sales_rent_price} onChange={e => setField('total_sales_rent_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Bonus / BTSA Amount</label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.bonus_btsa_amount} onChange={e => setField('bonus_btsa_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Buyer / Seller Rebate</label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.rebate_amount} onChange={e => setField('rebate_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Loan Type</label>
                      <select className="input-luxury w-full text-sm" value={form.loan_type} onChange={e => setField('loan_type', e.target.value)}>
                        <option value="">Select...</option>
                        {LOAN_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Referrals</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {([
                      { key: 'internal_referral' as const, feeKey: 'internal_referral_fee' as const, label: 'Internal Referral?' },
                      { key: 'external_referral' as const, feeKey: 'external_referral_fee' as const, label: 'External Referral?' },
                      { key: 'brokerage_referral' as const, feeKey: 'brokerage_referral_fee' as const, label: 'Brokerage Referral?' },
                    ]).map(({ key, feeKey, label }) => (
                      <div key={key} className="inner-card">
                        <label className="block text-xs text-luxury-gray-3 mb-2">{label}</label>
                        <div className="flex gap-4 mb-3">
                          {['Yes', 'No'].map(v => (
                            <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="radio" checked={(form as any)[key] === (v === 'Yes')} onChange={() => setField(key, v === 'Yes')} className="w-3.5 h-3.5" />
                              {v}
                            </label>
                          ))}
                        </div>
                        {(form as any)[key] && (
                          <input type="text" className="input-luxury w-full text-sm" value={(form as any)[feeKey]} onChange={e => setField(feeKey as any, e.target.value)} placeholder="% or $" />
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Expedite Policy</h2>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" checked={expediteAcknowledgedSub} onChange={e => setExpediteAcknowledgedSub(e.target.checked)} />
                    <span className="text-xs text-luxury-gray-2">I understand that if my file is not marked compliant or compliance is not submitted by 11am at least two business days prior to closing, a $95 Brokerage Expedite Fee Applies.</span>
                  </label>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Notes (optional)</h2>
                  <textarea className="textarea-luxury w-full text-sm" rows={3} value={subsequentNotes} onChange={e => setSubsequentNotes(e.target.value)} placeholder="Any additional notes for the reviewer..." />
                </section>
              </>
            )}
          </>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            COMPLIANCE MODE - full form
        ──────────────────────────────────────────────────────────────────── */}
        {mode === 'compliance' && (
          <>
            {/* Transaction search */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Find Your Transaction</h2>
              <p className="text-xs text-luxury-gray-3 mb-3">Search to link to an existing transaction, or leave blank to create a new one on submit.</p>
              <div className="flex gap-2">
                <input className="input-luxury flex-1 text-sm" placeholder="Property address (optional)..." value={addressSearch} onChange={e => setAddressSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={searching || !addressSearch.trim()} className="btn btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
                  <Search size={13} />{searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              {searchDone && (
                <div className={`mt-3 p-3 rounded text-xs ${foundTransaction ? 'bg-green-50 text-green-700' : 'bg-luxury-gray-5/30 text-luxury-gray-3'}`}>
                  {foundTransaction ? `Found: ${foundTransaction.property_address} - Status: ${foundTransaction.status}` : 'No existing transaction found. A new one will be created on submit.'}
                </div>
              )}
            </section>

            {/* Section 1 - Transaction */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Transaction</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Team or Office <span className="text-red-500">*</span></label>
                  <select className="input-luxury w-full text-sm" value={form.team_or_office} onChange={e => setField('team_or_office', e.target.value)}>
                    <option value="">Select...</option>
                    {TEAM_OR_OFFICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Unit</label>
                  <input className="input-luxury w-full text-sm" value={form.unit} onChange={e => setField('unit', e.target.value)} placeholder="Unit / Apt #" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Can the property be found in Matrix? <span className="text-red-500">*</span></label>
                  <div className="flex gap-4 mt-2">
                    {(['yes', 'no'] as const).map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name="in_matrix" value={v} checked={form.in_matrix === v} onChange={() => setField('in_matrix', v)} className="w-3.5 h-3.5" />
                        {v === 'yes' ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">MLS Link</label>
                  <input className="input-luxury w-full text-sm" value={form.mls_link} onChange={e => setField('mls_link', e.target.value)} placeholder="https://" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Client Name <span className="text-red-500">*</span></label>
                  <input className="input-luxury w-full text-sm" value={form.client_name} onChange={e => setField('client_name', e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Client Email</label>
                  <input type="email" className="input-luxury w-full text-sm" value={form.client_email} onChange={e => setField('client_email', e.target.value)} placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Lead Source <span className="text-red-500">*</span></label>
                  <select className="input-luxury w-full text-sm" value={form.lead_source} onChange={e => setField('lead_source', e.target.value)}>
                    <option value="">Select...</option>
                    {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Closing or Move-In Date <span className="text-red-500">*</span></label>
                  <input type="date" className="input-luxury w-full text-sm" value={form.closing_or_movein_date} onChange={e => setField('closing_or_movein_date', e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-luxury-gray-3 mb-1">Who did you represent? <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {REPRESENTATION_OPTIONS.map(o => (
                      <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name="representing" value={o.value} checked={form.representing === o.value} onChange={() => setField('representing', o.value)} className="w-3.5 h-3.5" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                {(form.representing === 'tenant' || form.representing === 'landlord') && (
                  <>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Tenant Transaction Type <span className="text-red-500">*</span></label>
                      <select className="input-luxury w-full text-sm" value={form.tenant_transaction_type} onChange={e => setField('tenant_transaction_type', e.target.value)}>
                        <option value="">Select...</option>
                        {TENANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Lease Term (months) <span className="text-red-500">*</span></label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.lease_term_months} onChange={e => setField('lease_term_months', e.target.value)} placeholder="12" min="1" />
                    </div>
                  </>
                )}
                {form.representing === 'referred_out' && (
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1">What type of client did you refer? <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {REFERRED_CLIENT_TYPES.map(o => (
                        <label key={o.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" name="referred_client_type" value={o.value} checked={form.referred_client_type === o.value} onChange={() => setField('referred_client_type', o.value)} className="w-3.5 h-3.5" />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Section 2 - Commission */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Commission</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Commission Basis Price <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.commission_basis_price} onChange={e => setField('commission_basis_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Commission Rate <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select className="input-luxury text-sm w-20 flex-shrink-0" value={form.commission_rate_type} onChange={e => setField('commission_rate_type', e.target.value)}>
                      <option value="percent">%</option>
                      <option value="flat">$</option>
                    </select>
                    <input type="number" className="input-luxury flex-1 text-sm" value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Total {isLease ? 'Rent' : 'Sales'} Price <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.total_sales_rent_price} onChange={e => setField('total_sales_rent_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Bonus / BTSA Amount <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.bonus_btsa_amount} onChange={e => setField('bonus_btsa_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  <p className="text-xs text-luxury-gray-3 mt-1">Enter 0 if none</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-luxury-gray-3 mb-2">Additional Commission from Any Other Source</label>
                  <p className="text-xs text-luxury-gray-3 mb-3">Include any additional compensation received. This includes commission, brokerage processing fees, coaching fees, etc.</p>
                  {comps.map(c => (
                    <div key={c.id} className="inner-card mb-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-luxury-gray-3 mb-1">Amount</label>
                          <input type="number" className="input-luxury w-full text-sm" value={c.amount} onChange={e => setComps(prev => prev.map(x => x.id === c.id ? { ...x, amount: e.target.value } : x))} placeholder="0.00" min="0" step="0.01" />
                        </div>
                        <div>
                          <label className="block text-xs text-luxury-gray-3 mb-1">Fee Type</label>
                          <select className="input-luxury w-full text-sm" value={c.fee_type} onChange={e => setComps(prev => prev.map(x => x.id === c.id ? { ...x, fee_type: e.target.value } : x))}>
                            <option value="">Select...</option>
                            {FEE_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          {c.fee_type === 'other' && <input className="input-luxury w-full text-sm mt-2" value={c.fee_type_other} onChange={e => setComps(prev => prev.map(x => x.id === c.id ? { ...x, fee_type_other: e.target.value } : x))} placeholder="Describe fee type" />}
                        </div>
                        <div>
                          <label className="block text-xs text-luxury-gray-3 mb-1">Paid By</label>
                          <select className="input-luxury w-full text-sm" value={c.paid_by} onChange={e => setComps(prev => prev.map(x => x.id === c.id ? { ...x, paid_by: e.target.value } : x))}>
                            <option value="">Select...</option>
                            {paidByOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {c.paid_by === 'other' && <input className="input-luxury w-full text-sm mt-2" value={c.paid_by_other} onChange={e => setComps(prev => prev.map(x => x.id === c.id ? { ...x, paid_by_other: e.target.value } : x))} placeholder="Describe who paid" />}
                        </div>
                      </div>
                      <button onClick={() => setComps(prev => prev.filter(x => x.id !== c.id))} className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setComps(prev => [...prev, emptyComp()])} className="btn btn-secondary flex items-center gap-1.5 text-xs">
                    <Plus size={13} /> Add Additional Compensation
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Buyer / Seller Rebate Deducted from Commission <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.rebate_amount} onChange={e => setField('rebate_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  <p className="text-xs text-luxury-gray-3 mt-1">Enter 0 if none</p>
                </div>
              </div>
            </section>

            {/* Section 3 - Referrals */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Referrals</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  { key: 'internal_referral' as const, feeKey: 'internal_referral_fee' as const, label: 'Internal Referral?' },
                  { key: 'external_referral' as const, feeKey: 'external_referral_fee' as const, label: 'External Referral?' },
                  { key: 'brokerage_referral' as const, feeKey: 'brokerage_referral_fee' as const, label: 'Brokerage Referral?' },
                ]).map(({ key, feeKey, label }) => (
                  <div key={key} className="inner-card">
                    <label className="block text-xs text-luxury-gray-3 mb-2">{label}</label>
                    <div className="flex gap-4 mb-3">
                      {['Yes', 'No'].map(v => (
                        <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" checked={(form as any)[key] === (v === 'Yes')} onChange={() => setField(key, v === 'Yes')} className="w-3.5 h-3.5" />
                          {v}
                        </label>
                      ))}
                    </div>
                    {(form as any)[key] && (
                      <input type="text" className="input-luxury w-full text-sm" value={(form as any)[feeKey]} onChange={e => setField(feeKey as any, e.target.value)} placeholder="% or $" />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4 - Title */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Title {isLease ? '(optional for leases)' : ''}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Officer Name {!isLease && <span className="text-red-500">*</span>}</label>
                  <input className="input-luxury w-full text-sm" value={form.title_officer_name} onChange={e => setField('title_officer_name', e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Company {!isLease && <span className="text-red-500">*</span>}</label>
                  <input className="input-luxury w-full text-sm" value={form.title_company} onChange={e => setField('title_company', e.target.value)} placeholder="Company name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Company Email (used to send CDA) {!isLease && <span className="text-red-500">*</span>}</label>
                  <input type="email" className="input-luxury w-full text-sm" value={form.title_company_email} onChange={e => setField('title_company_email', e.target.value)} placeholder="email@titleco.com" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Loan Type <span className="text-red-500">*</span></label>
                  <select className="input-luxury w-full text-sm" value={form.loan_type} onChange={e => setField('loan_type', e.target.value)}>
                    <option value="">Select...</option>
                    {LOAN_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Section 5 - Expedite */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Expedite Policy</h2>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" checked={form.expedite_acknowledged} onChange={e => setField('expedite_acknowledged', e.target.checked)} />
                <span className="text-xs text-luxury-gray-2">I understand that if my file is not marked compliant or compliance is not submitted by 11am at least two business days prior to closing, a $95 Brokerage Expedite Fee Applies.</span>
              </label>
            </section>

            {/* Section 6 - Flyer */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Flyer</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Bedrooms</label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.bedrooms} onChange={e => setField('bedrooms', e.target.value)} placeholder="e.g. 3" min="0" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Bathrooms</label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.bathrooms} onChange={e => setField('bathrooms', e.target.value)} placeholder="e.g. 2.5" min="0" step="0.5" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Garage Spaces</label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.garage} onChange={e => setField('garage', e.target.value)} placeholder="e.g. 2" min="0" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Square Footage</label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.sqft} onChange={e => setField('sqft', e.target.value)} placeholder="e.g. 2521" min="0" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-luxury-gray-3 mb-2">What do you want on your flyer? <span className="text-red-500">*</span></label>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="flyer_display_type" value="office" checked={form.flyer_display_type === 'office'} onChange={() => setField('flyer_display_type', 'office')} className="w-3.5 h-3.5" />
                      <span className="text-sm text-luxury-gray-1">My Office</span>
                      <span className="text-xs text-luxury-gray-3">- shows "{user?.office || 'your office'}" on the flyer</span>
                    </label>
                    <label className={`flex items-center gap-2 ${agentTeam ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input type="radio" name="flyer_display_type" value="team" checked={form.flyer_display_type === 'team'} onChange={() => agentTeam && setField('flyer_display_type', 'team')} disabled={!agentTeam} className="w-3.5 h-3.5" />
                      <span className="text-sm text-luxury-gray-1">My Team</span>
                      {agentTeam
                        ? <span className="text-xs text-luxury-gray-3">- shows "{agentTeam.team_name}" on the flyer</span>
                        : <span className="text-xs text-luxury-gray-3">- not on a team</span>}
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="flyer_display_type" value="division" checked={form.flyer_display_type === 'division'} onChange={() => setField('flyer_display_type', 'division')} className="w-3.5 h-3.5 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-sm text-luxury-gray-1">A Division</span>
                        {form.flyer_display_type === 'division' && (
                          <select className="input-luxury w-full text-sm mt-2" value={form.flyer_division} onChange={e => setField('flyer_division', e.target.value)}>
                            <option value="">Select division...</option>
                            {FLYER_DIVISIONS.filter(d => !['team', 'houston', 'dallas'].includes(d.value)).map(d => (
                              <option key={d.value} value={d.label}>{d.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 7 - Notes */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Notes</h2>
              <textarea className="textarea-luxury w-full text-sm" rows={3} value={form.additional_notes} onChange={e => setField('additional_notes', e.target.value)} placeholder="Additional notes (optional)" />
            </section>
          </>
        )}

        {/* Error + submit */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle size={14} className="flex-shrink-0" />{error}
          </div>
        )}

        {(mode === 'retainer' || mode === 'compliance' || (mode === 'subsequent' && foundTransaction)) && (
          <div className="flex items-center justify-between pt-2 border-t border-luxury-gray-5/50">
            <button onClick={() => router.push('/agent/forms')} className="btn btn-secondary text-xs">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary text-xs disabled:opacity-50">
              {submitting ? 'Submitting...' : mode === 'retainer' ? 'Submit Retainer' : mode === 'subsequent' ? 'Submit Recheck Request' : 'Submit Compliance Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
