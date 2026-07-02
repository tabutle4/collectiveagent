'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { LOAN_TYPES } from '@/lib/transactions/constants'

const REPRESENTATION_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'nc_buyer', label: 'New Construction Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'referred_out', label: 'I referred this client to an external agent.' },
]

const TENANT_TRANSACTION_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'tenant_non_apt_v2', label: 'Tenant Lease (not apartment)' },
  { value: 'tenant_simplyhome_v2', label: 'Builder Home Rental' },
]

const REFERRED_CLIENT_TYPES = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'nc_buyer', label: 'New Construction Buyer' },
  { value: 'seller', label: 'Seller' },
]

function formatLabel(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function SubsequentComplianceForm() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [changedFields, setChangedFields] = useState<string[]>([])

  // Transaction search
  const [addressSearch, setAddressSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [transaction, setTransaction] = useState<any>(null)
  const [lastSubmission, setLastSubmission] = useState<any>(null)
  const [searchDone, setSearchDone] = useState(false)

  // Form state
  const [form, setForm] = useState({
    representing: '',
    tenant_transaction_type: '',
    lease_term_months: '',
    referred_client_type: '',
    closing_or_movein_date: '',
    commission_basis_price: '',
    commission_rate: '',
    commission_rate_type: 'percent' as 'percent' | 'flat',
    total_sales_rent_price: '',
    bonus_btsa_amount: '0',
    rebate_amount: '0',
    internal_referral: false,
    internal_referral_fee: '',
    external_referral: false,
    external_referral_fee: '',
    loan_type: '',
    expedite_acknowledged: false,
    notes: '',
  })

  useEffect(() => {
    const fetchUser = async () => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) { router.push('/auth/login'); return }
      const data = await res.json()
      setUser(data.user)
    }
    fetchUser()
  }, [router])

  const isLease = form.representing === 'tenant' || form.representing === 'landlord'

  const setField = (key: keyof typeof form, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ── Search for transaction ────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!addressSearch.trim()) return
    setSearching(true)
    setSearchDone(false)
    try {
      const res = await fetch(`/api/agent/forms/subsequent-compliance?address=${encodeURIComponent(addressSearch)}`)
      const data = await res.json()

      if (data.transaction) {
        setTransaction(data.transaction)
        setLastSubmission(data.last_submission)

        // Pre-fill from last submission data or transaction directly
        const src = data.last_submission?.data || {}
        const txn = data.transaction

        setForm({
          representing: src.representing || txn.representing || '',
          tenant_transaction_type: src.tenant_transaction_type || txn.tenant_transaction_type || '',
          lease_term_months: src.lease_term_months ? String(src.lease_term_months) : txn.lease_term ? String(txn.lease_term) : '',
          referred_client_type: src.referred_client_type || '',
          closing_or_movein_date: src.closing_or_movein_date || txn.closing_date || txn.move_in_date || '',
          commission_basis_price: src.commission_basis_price ? String(src.commission_basis_price) : txn.gross_commission ? String(txn.gross_commission) : '',
          commission_rate: src.commission_rate || '',
          commission_rate_type: src.commission_rate_type || 'percent',
          total_sales_rent_price: src.total_sales_rent_price ? String(src.total_sales_rent_price) : txn.sales_price ? String(txn.sales_price) : txn.monthly_rent ? String(txn.monthly_rent) : '',
          bonus_btsa_amount: src.bonus_btsa_amount !== undefined ? String(src.bonus_btsa_amount) : txn.btsa_amount ? String(txn.btsa_amount) : '0',
          rebate_amount: src.rebate_amount !== undefined ? String(src.rebate_amount) : txn.rebate_amount ? String(txn.rebate_amount) : '0',
          internal_referral: src.internal_referral ?? txn.internal_referral ?? false,
          internal_referral_fee: src.internal_referral_fee ? String(src.internal_referral_fee) : txn.internal_referral_fee ? String(txn.internal_referral_fee) : '',
          external_referral: src.external_referral ?? txn.external_referral ?? false,
          external_referral_fee: src.external_referral_fee ? String(src.external_referral_fee) : txn.external_referral_fee ? String(txn.external_referral_fee) : '',
          loan_type: src.loan_type || txn.loan_type || '',
          expedite_acknowledged: false,
          notes: '',
        })
      } else {
        setTransaction(null)
        setLastSubmission(null)
      }
      setSearchDone(true)
    } catch {
      setSearchDone(true)
    } finally {
      setSearching(false)
    }
  }, [addressSearch])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('')
    if (!transaction) { setError('Please find your transaction first.'); return }
    if (!form.expedite_acknowledged) { setError('You must acknowledge the expedite policy.'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/agent/forms/subsequent-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transaction.id,
          last_submission_id: lastSubmission?.id || null,
          ...form,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Submission failed. Please try again.')
        return
      }
      setChangedFields(data.changed_fields || [])
      setSubmitted(true)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  if (submitted) {
    return (
      <div>
        <h1 className="page-title mb-6">SUBSEQUENT COMPLIANCE REQUEST</h1>
        <div className="container-card">
          <div className="flex flex-col items-center py-12 text-center gap-4">
            <CheckCircle2 size={40} className="text-green-600" />
            <p className="text-sm font-semibold text-luxury-gray-1">Resubmission received</p>
            <p className="text-xs text-luxury-gray-3 max-w-sm">
              The office has been notified and will review your updated compliance documents.
            </p>
            {changedFields.length > 0 && (
              <div className="text-left bg-luxury-gray-5/30 rounded p-3 text-xs text-luxury-gray-3 max-w-sm w-full">
                <p className="font-semibold text-luxury-gray-2 mb-1">Fields updated:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {changedFields.map(f => <li key={f}>{formatLabel(f)}</li>)}
                </ul>
              </div>
            )}
            <button onClick={() => router.push('/agent/forms')} className="btn btn-secondary text-xs">
              Back to Forms
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title mb-2">SUBSEQUENT COMPLIANCE REQUEST</h1>
      <p className="text-xs text-luxury-gray-3 mb-6">
        Use this form when requesting a recheck after uploading missing compliance documents.
      </p>

      {/* Stop notice */}
      <div className="inner-card border-red-200 bg-red-50 mb-4">
        <div className="flex gap-2 items-start">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-medium">
            STOP - Do not complete this form until all required compliance documents have been signed and uploaded to BoldTrail Back Office.
          </p>
        </div>
      </div>

      {/* First time? */}
      <div className="inner-card border-luxury-accent/30 bg-luxury-accent/5 mb-6">
        <div className="flex gap-2 items-start">
          <Info size={14} className="text-luxury-accent flex-shrink-0 mt-0.5" />
          <p className="text-xs text-luxury-gray-2">
            First time submitting compliance for this transaction?{' '}
            <a href="/agent/forms/compliance-cda" className="text-luxury-accent underline">
              Use the Compliance &amp; CDA Request form instead.
            </a>
          </p>
        </div>
      </div>

      <div className="container-card space-y-8">

        {/* ── Find transaction ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Find Your Transaction
          </h2>
          <div className="flex gap-2">
            <input
              className="input-luxury flex-1 text-sm"
              placeholder="Property address..."
              value={addressSearch}
              onChange={e => setAddressSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !addressSearch.trim()}
              className="btn btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <Search size={13} />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
          {searchDone && (
            <div className={`mt-3 p-3 rounded text-xs ${transaction ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {transaction
                ? `Found: ${transaction.property_address} - Status: ${transaction.status}. Fields have been pre-filled from your last submission. Please review and update anything that has changed.`
                : 'No transaction found matching that address. Please check the address and try again, or submit a new compliance request.'}
            </div>
          )}
        </section>

        {transaction && (
          <>
            {/* ── Instructions ─────────────────────────────────────────────── */}
            <div className="inner-card bg-luxury-gray-5/20">
              <p className="text-xs text-luxury-gray-2">
                All fields below have been pre-filled from your previous submission. Review and update anything that has changed. The system will automatically detect and flag changes for the reviewer.
              </p>
            </div>

            {/* ── Section 1: Transaction ────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Transaction
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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
                        {TENANT_TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

            {/* ── Section 2: Commission ─────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Commission
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Commission Basis Price <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.commission_basis_price} onChange={e => setField('commission_basis_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                </div>

                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Commission Rate <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select className="input-luxury text-sm w-24 flex-shrink-0" value={form.commission_rate_type} onChange={e => setField('commission_rate_type', e.target.value as 'percent' | 'flat')}>
                      <option value="percent">%</option>
                      <option value="flat">$</option>
                    </select>
                    <input type="number" className="input-luxury flex-1 text-sm" value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder={form.commission_rate_type === 'percent' ? '3.00' : '0.00'} min="0" step="0.01" />
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

                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Buyer / Seller Rebate Deducted from Commission <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.rebate_amount} onChange={e => setField('rebate_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  <p className="text-xs text-luxury-gray-3 mt-1">Enter 0 if none</p>
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

            {/* ── Section 3: Referrals ──────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Referrals
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="inner-card">
                  <label className="block text-xs text-luxury-gray-3 mb-2">Internal Referral?</label>
                  <div className="flex gap-4 mb-3">
                    {(['Yes', 'No'] as const).map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" checked={form.internal_referral === (v === 'Yes')} onChange={() => setField('internal_referral', v === 'Yes')} className="w-3.5 h-3.5" />
                        {v}
                      </label>
                    ))}
                  </div>
                  {form.internal_referral && (
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Fee</label>
                      <input type="text" className="input-luxury w-full text-sm" value={form.internal_referral_fee} onChange={e => setField('internal_referral_fee', e.target.value)} placeholder="% or $" />
                    </div>
                  )}
                </div>

                <div className="inner-card">
                  <label className="block text-xs text-luxury-gray-3 mb-2">External Referral?</label>
                  <div className="flex gap-4 mb-3">
                    {(['Yes', 'No'] as const).map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" checked={form.external_referral === (v === 'Yes')} onChange={() => setField('external_referral', v === 'Yes')} className="w-3.5 h-3.5" />
                        {v}
                      </label>
                    ))}
                  </div>
                  {form.external_referral && (
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Fee</label>
                      <input type="text" className="input-luxury w-full text-sm" value={form.external_referral_fee} onChange={e => setField('external_referral_fee', e.target.value)} placeholder="% or $" />
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Expedite ─────────────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Expedite Policy
              </h2>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" checked={form.expedite_acknowledged} onChange={e => setField('expedite_acknowledged', e.target.checked)} />
                <span className="text-xs text-luxury-gray-2">
                  I understand that if my file is not marked compliant or compliance is not submitted by 11am at least two business days prior to closing, a $95 Brokerage Expedite Fee Applies.
                </span>
              </label>
              <p className="text-xs text-luxury-gray-3 mt-2">Note: If you are submitting within 48 business hours of closing, the $95 expedite fee applies.</p>
            </section>

            {/* ── Notes ────────────────────────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Notes (optional)
              </h2>
              <textarea
                className="textarea-luxury w-full text-sm"
                rows={3}
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Any additional notes for the reviewer..."
              />
            </section>

            {/* ── Error and submit ───────────────────────────────────────────── */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded text-xs text-red-700">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-luxury-gray-5/50">
              <button onClick={() => router.push('/agent/forms')} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary text-xs disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Recheck Request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
