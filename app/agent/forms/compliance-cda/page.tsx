'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, AlertCircle, CheckCircle2, Info, ExternalLink } from 'lucide-react'
import { LEAD_SOURCES, LOAN_TYPES, FLYER_DIVISIONS } from '@/lib/transactions/constants'
import AgentSelect, { AgentOption } from '@/components/forms/AgentSelect'
import AddressInput, { AddressFields } from '@/components/shared/AddressInput'
import { complianceIsLease, complianceIsDirectLease, complianceShowsTitleAndLoan } from '@/lib/forms/requiredFields'

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

// Small click-to-open explainer used next to commission fields.
function FieldTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-luxury-gray-5 text-luxury-gray-2 text-[10px] font-bold ml-1 align-middle hover:bg-luxury-gray-3 hover:text-white"
        aria-label="What is this?"
      >?</button>
      {open && <p className="text-[11px] text-luxury-gray-2 bg-luxury-light border border-luxury-gray-5 rounded p-2 mt-1">{text}</p>}
    </>
  )
}

// Scrolls back to a field from the Commission Summary "edit" buttons.
function jumpToField(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  ;(el as HTMLInputElement).focus({ preventScroll: true })
}

type Mode = 'compliance' | 'subsequent' | 'retainer'

export default function ComplianceCdaForm() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [onBehalfAgent, setOnBehalfAgent] = useState<AgentOption | null>(null)
  const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
  const isAdmin = ADMIN_ROLES.includes(String(user?.role || '').toLowerCase())
  const [agentTeam, setAgentTeam] = useState<{ team_name: string } | null>(null)
  const [mode, setMode] = useState<Mode>('compliance')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([])
  const [confirmedNewDeal, setConfirmedNewDeal] = useState(false)
  const [commissionConfirmed, setCommissionConfirmed] = useState(false)
  // Compliance mode: attach this submission to a retainer prospect the agent picked
  const [attachTo, setAttachTo] = useState<{ id: string; client_name: string } | null>(null)

  // Transaction search
  const [addressSearch, setAddressSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [foundTransaction, setFoundTransaction] = useState<any>(null)
  const [lastSubmission, setLastSubmission] = useState<any>(null)
  const [searchDone, setSearchDone] = useState(false)
  // Only used when no transaction is linked and we are about to create one.
  // Searching stays a fast free text box; creating requires a real address.
  const [newAddress, setNewAddress] = useState<AddressFields>({
    street_address: '', unit: '', city: '', state: 'TX', zip: '',
  })
  // The address component reports completeness, which includes having answered
  // the unit question. Without this, an agent could submit having skipped it.
  const [newAddressComplete, setNewAddressComplete] = useState(false)

  // Compliance form state
  const [form, setForm] = useState({
    team_or_office: '', unit: '', in_matrix: '' as '' | 'yes' | 'no',
    mls_link: '', client_name: '', client_email: '', client_phone: '', lead_source: '',
    closing_or_movein_date: '', acceptance_date: '', representing: '', tenant_transaction_type: '',
    lease_term_months: '', referred_client_type: '', commission_basis_price: '',
    commission_rate: '', commission_rate_type: 'percent' as 'percent' | 'flat',
    total_sales_rent_price: '', bonus_btsa_amount: '0', rebate_amount: '0',
    bonus_btsa_amount_type: 'flat' as 'percent' | 'flat',
    rebate_amount_type: 'flat' as 'percent' | 'flat',
    internal_referral: false, internal_referral_fee: '',
    internal_referral_fee_type: 'percent' as 'percent' | 'flat',
    external_referral: false, external_referral_fee: '',
    external_referral_fee_type: 'percent' as 'percent' | 'flat',
    external_referral_brokerage_name: '',
    brokerage_referral: false, brokerage_referral_fee: '',
    brokerage_referral_fee_type: 'percent' as 'percent' | 'flat',
    has_ecommission: false, ecommission_amount: '0',
    title_officer_name: '', title_company: '', title_company_email: '', title_phone: '',
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

  // Deep link support: /agent/forms/compliance-cda?mode=subsequent opens the
  // right mode directly. The retired subsequent-compliance page redirects here
  // with this parameter. Read from window.location instead of useSearchParams
  // so the page needs no Suspense boundary.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('mode')
    if (m === 'subsequent' || m === 'retainer' || m === 'compliance') setMode(m)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/users/profile?id=${user.id}`).then(r => r.json()).then(d => {
      if (d.teamName) {
        setAgentTeam({ team_name: d.teamName })
        setField('flyer_display_type', 'team')
      }
    }).catch(() => {})
  }, [user?.id])

  // All three flags come from the same predicates the server validator uses,
  // so what the form shows and what the server requires can never disagree.
  const isLease = complianceIsDirectLease(form)
  const isReferredOut = form.representing === 'referred_out'
  // Title + Loan only apply to sales the agent is closing (not leases, not referred-out)
  const showTitleLoan = complianceShowsTitleAndLoan(form)
  // Flyer type: for referred-out, use the referred client type; otherwise use representation
  const flyerIsLease = complianceIsLease(form)
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
      const behalfParam = isAdmin && onBehalfAgent ? `&on_behalf_of_agent_id=${onBehalfAgent.id}` : ''
      const url = `/api/agent/forms/compliance-cda?address=${encodeURIComponent(addressSearch)}&mode=${mode}${behalfParam}`
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
          acceptance_date: src.acceptance_date || txn.acceptance_date || '',
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
  }, [addressSearch, mode, isAdmin, onBehalfAgent])

  // ── Commission Summary (everything that affects the commission) ──────────
  // Percent bases: BTSA and rebate = % of the SALES PRICE (commission basis
  // price); referral fees = % of the computed gross commission. Mirrors the
  // server-side resolution exactly.
  const [previewInfo, setPreviewInfo] = useState<any>(null)
  const summaryIsLease = complianceIsLease({ representing: form.representing, referred_client_type: form.referred_client_type })
  const summarySide =
    form.representing?.toLowerCase().includes('landlord') ? 'landlord'
    : form.representing?.toLowerCase().includes('seller') ? 'seller'
    : form.representing?.toLowerCase().includes('tenant') ? 'tenant'
    : form.representing?.toLowerCase().includes('buyer') ? 'buyer'
    : ''
  useEffect(() => {
    if (mode === 'retainer') return
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/agent/commission-preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            is_lease: summaryIsLease,
            side: summarySide,
            transaction_type: form.tenant_transaction_type || '',
            agent_id: onBehalfAgent?.id || undefined,
          }),
        })
        if (res.ok) setPreviewInfo(await res.json())
      } catch { /* preview is best-effort; the box still shows the math */ }
    }, 350)
    return () => clearTimeout(t)
  }, [mode, summaryIsLease, summarySide, form.tenant_transaction_type, onBehalfAgent])

  const commissionSummary = (() => {
    const basis = parseFloat(form.commission_basis_price || '') || 0
    const rate = parseFloat(form.commission_rate || '') || 0
    const gross = form.commission_rate_type === 'flat' ? Math.round(rate * 100) / 100 : Math.round(basis * rate) / 100
    const addl = comps.reduce((s: number, c: any) => s + (parseFloat(String(c?.amount ?? 0)) || 0), 0)
    const resolve = (v: string, t: string, base: number) => {
      const n = parseFloat(v || '0') || 0
      return t === 'percent' ? Math.round(base * n) / 100 : n
    }
    const btsa = resolve(form.bonus_btsa_amount, form.bonus_btsa_amount_type, basis)
    const rebate = resolve(form.rebate_amount, form.rebate_amount_type, basis)
    const intFee = form.internal_referral ? resolve(form.internal_referral_fee, form.internal_referral_fee_type, gross) : 0
    const extFee = form.external_referral ? resolve(form.external_referral_fee, form.external_referral_fee_type, gross) : 0
    const brokFee = form.brokerage_referral ? resolve(form.brokerage_referral_fee, form.brokerage_referral_fee_type, gross) : 0
    const grossPlusAddl = Math.round((gross + addl) * 100) / 100
    const pool = Math.round((grossPlusAddl - intFee - extFee - brokFee) * 100) / 100
    const splitPct = Number(previewInfo?.agent_split_pct ?? 85)
    let splitAmt = Math.round(pool * splitPct) / 100
    // Firm Minimum Adjustment: when commission + additional comp is below the
    // Settings minimum, CRC's split is calculated on the minimum basis.
    let minAdj = 0
    let minBasis = 0
    const minPct = Number(previewInfo?.firm_minimum_pct ?? 0)
    if (minPct > 0 && basis > 0 && grossPlusAddl > 0) {
      minBasis = Math.round(basis * minPct) / 100
      if (grossPlusAddl < minBasis) {
        const firmPct = 100 - splitPct
        const firmAtMin = Math.round(minBasis * firmPct) / 100
        const firmActual = Math.round(pool * firmPct) / 100
        minAdj = Math.max(0, Math.round((firmAtMin - firmActual) * 100) / 100)
        splitAmt = Math.round((splitAmt - minAdj) * 100) / 100
      }
    }
    const procFee = Number(previewInfo?.processing_fee ?? 0)
    const coaching = Number(previewInfo?.coaching_fee ?? 0)
    const ec = form.has_ecommission ? (parseFloat(form.ecommission_amount || '0') || 0) : 0
    const estNet = Math.round((splitAmt + btsa - procFee - coaching - rebate) * 100) / 100
    return { basis, rate, gross, addl, btsa, rebate, intFee, extFee, brokFee, grossPlusAddl, pool, splitPct, splitAmt, minAdj, minBasis, minPct, procFee, coaching, ec, estNet }
  })()

  // Any change to a commission input un-confirms the summary.
  useEffect(() => { setCommissionConfirmed(false) }, [
    form.commission_basis_price, form.commission_rate, form.commission_rate_type,
    form.bonus_btsa_amount, form.bonus_btsa_amount_type,
    form.rebate_amount, form.rebate_amount_type,
    form.internal_referral, form.internal_referral_fee, form.internal_referral_fee_type,
    form.external_referral, form.external_referral_fee, form.external_referral_fee_type,
    form.brokerage_referral, form.brokerage_referral_fee, form.brokerage_referral_fee_type,
    form.has_ecommission, form.ecommission_amount,
    comps,
  ])

  const fmt$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const sumRow = (label: string, amount: string, editId?: string) => (
    <div className="flex justify-between items-center">
      <span className="flex items-center gap-2">{label}{editId && (
        <button type="button" onClick={() => jumpToField(editId)} className="text-[9px] uppercase tracking-wider border border-luxury-gray-4 text-luxury-gray-3 rounded px-1.5 hover:bg-luxury-gray-1 hover:text-white">edit</button>
      )}</span><span>{amount}</span>
    </div>
  )
  const renderCommissionConfirm = () => (
    <>
      <div className="inner-card border border-luxury-gray-5">
        <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">eCommission Advance</p>
        <label className="block text-xs text-luxury-gray-3 mb-2">Did you take an eCommission (or other commission advance) on this deal?
          <FieldTip text="If a company advanced you part of this commission before closing, enter the amount you must repay. Submitting adds the repayment invoice to your account automatically, and it is deducted from your payout at closing." />
        </label>
        <div className="flex gap-4 mb-2 text-xs text-luxury-gray-2">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={!form.has_ecommission} onChange={() => setField('has_ecommission' as any, false)} className="w-3.5 h-3.5" /> No</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={form.has_ecommission} onChange={() => setField('has_ecommission' as any, true)} className="w-3.5 h-3.5" /> Yes</label>
        </div>
        {form.has_ecommission && (
          <>
            <input id="fld_ecommission" type="number" className="input-luxury w-full text-sm" value={form.ecommission_amount} onChange={e => setField('ecommission_amount' as any, e.target.value)} placeholder="Advance amount to be repaid" min="0" step="0.01" />
            <p className="text-[11px] text-luxury-gray-3 mt-1">Submitting creates the repayment invoice on your account automatically.</p>
          </>
        )}
      </div>

      <div className="inner-card border border-luxury-gray-5">
        <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Commission Summary</p>
        {previewInfo && (
          <div className="bg-luxury-light rounded p-3 mb-3 text-xs text-luxury-gray-2 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-luxury-gray-3 mb-1">Your plan - from your profile</p>
            {sumRow(`Plan for this ${summaryIsLease ? 'lease' : 'sale'}`, `${previewInfo.plan_name} \u00b7 ${previewInfo.agent_split_pct} / ${previewInfo.firm_split_pct}`)}
            {summarySide && sumRow('Side you represent', summarySide.charAt(0).toUpperCase() + summarySide.slice(1))}
            {sumRow('Processing fee for this side', previewInfo.processing_fee_status === 'waived' ? 'Waived' : previewInfo.processing_fee_status === 'half' ? `${fmt$(previewInfo.processing_fee)} \u00b7 Half Off` : fmt$(previewInfo.processing_fee))}
            {sumRow('Coaching fee', previewInfo.coaching_waived ? 'Waived' : fmt$(previewInfo.coaching_fee))}
            {Number(previewInfo.firm_minimum_pct) > 0 && sumRow('Firm minimum (from Settings)', `${previewInfo.firm_minimum_pct}% of ${summaryIsLease ? 'rent' : 'sales price'}`)}
            {Number(previewInfo.cap_amount) > 0 && sumRow('Cap status', previewInfo.capped ? 'CAPPED' : `${fmt$(previewInfo.ytd_brokerage_split)} of ${fmt$(previewInfo.cap_amount)} YTD`)}
          </div>
        )}
        <div className="text-xs text-luxury-gray-2 space-y-1">
          {sumRow(form.commission_rate_type === 'flat' ? 'Flat commission' : `Commission (${form.commission_rate || '0'}% of ${fmt$(commissionSummary.basis)})`, fmt$(commissionSummary.gross), 'fld_basis')}
          {commissionSummary.addl > 0 && sumRow('+ Additional compensation (splits with the pool)', fmt$(commissionSummary.addl))}
          {commissionSummary.intFee > 0 && sumRow('- Internal referral fee', `-${fmt$(commissionSummary.intFee)}`, 'fld_internal_referral_fee')}
          {commissionSummary.extFee > 0 && sumRow('- External referral fee', `-${fmt$(commissionSummary.extFee)}`, 'fld_external_referral_fee')}
          {commissionSummary.brokFee > 0 && sumRow('- Brokerage referral fee', `-${fmt$(commissionSummary.brokFee)}`, 'fld_brokerage_referral_fee')}
          <div className="flex justify-between font-semibold text-luxury-gray-1 border-t border-luxury-gray-5 pt-1 mt-1">
            <span>Commission pool (splits between you and CRC)</span>
            <span>{fmt$(commissionSummary.pool)}</span>
          </div>
          {sumRow(`Your split (${commissionSummary.splitPct}% of pool)`, fmt$(commissionSummary.splitAmt))}
          {commissionSummary.minAdj > 0 && sumRow(`Firm Minimum Adjustment (CRC's share is calculated on ${fmt$(commissionSummary.minBasis)})`, `-${fmt$(commissionSummary.minAdj)}`, 'fld_rate')}
          {commissionSummary.btsa > 0 && sumRow('+ BTSA / bonus - paid to you in full, no split', fmt$(commissionSummary.btsa), 'fld_btsa')}
          {commissionSummary.procFee > 0 && sumRow('- Processing fee', `-${fmt$(commissionSummary.procFee)}`)}
          {commissionSummary.coaching > 0 && sumRow('- Coaching fee', `-${fmt$(commissionSummary.coaching)}`)}
          {commissionSummary.rebate > 0 && sumRow('- Client rebate (from your share)', `-${fmt$(commissionSummary.rebate)}`, 'fld_rebate')}
          <div className="flex justify-between font-semibold text-luxury-gray-1 border-t border-luxury-gray-5 pt-1 mt-1">
            <span>Estimated net to you</span>
            <span>{fmt$(commissionSummary.estNet)}</span>
          </div>
          {commissionSummary.ec > 0 && (
            <div className="flex justify-between text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
              <span>Deducted from your payout at closing: eCommission repayment</span>
              <span>-{fmt$(commissionSummary.ec)}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-luxury-gray-3 mt-2">Any unpaid fees or invoices on your account may also be applied at closing and reduce this amount.</p>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" checked={commissionConfirmed} onChange={e => setCommissionConfirmed(e.target.checked)} className="w-3.5 h-3.5" />
          <span className="text-xs text-luxury-gray-1 font-medium">I confirm this commission calculation is correct. <span className="font-normal text-luxury-gray-3">Changing any number un-checks this. Use the EDIT buttons to jump to a field and fix it.</span></span>
        </label>
      </div>
    </>
  )

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
      if (!form.acceptance_date) { setError('Acceptance date is required.'); return }
      if (!form.closing_or_movein_date) { setError('Closing or move-in date is required.'); return }
      if (!expediteAcknowledgedSub) { setError('You must acknowledge the expedite policy.'); return }
      payload = { ...payload, ...form, transaction_id: foundTransaction.id, last_submission_id: lastSubmission?.id || null, notes: subsequentNotes }
    } else {
      if (!form.expedite_acknowledged) { setError('You must acknowledge the expedite policy.'); return }
      if (!form.client_name) { setError('Client name is required.'); return }
      if (!form.acceptance_date) { setError('Acceptance date is required.'); return }
      if (!form.closing_or_movein_date) { setError('Closing or move-in date is required.'); return }
      if (!form.representing) { setError('Representation is required.'); return }
      if (!form.commission_basis_price) { setError('Commission basis price is required.'); return }
      if (!form.commission_rate) { setError('Commission rate is required.'); return }
      if (!commissionConfirmed) { setError('Review the Commission Summary box and confirm the calculation before submitting.'); return }
      if (!form.flyer_display_type) { setError('Please select what to show on your flyer.'); return }
      if (form.flyer_display_type === 'division' && !form.flyer_division) { setError('Please select a division for your flyer.'); return }
      if (!foundTransaction && !newAddressComplete) {
        setError('No existing transaction is linked, so a new one will be created. Complete the property address, including whether it has a unit.')
        return
      }

      payload = {
        ...payload, ...form,
        property_address: foundTransaction?.property_address || addressSearch,
        // Attaching to a retainer prospect counts as an existing transaction,
        // but the address parts still go along: the prospect has no real
        // address yet and the server writes this one onto it.
        transaction_id: foundTransaction?.id || attachTo?.id || null,
        confirm_new_deal: confirmedNewDeal,
        ...(foundTransaction ? {} : {
          street_address: newAddress.street_address,
          unit: newAddress.unit,
          city: newAddress.city,
          state: newAddress.state,
          zip: newAddress.zip,
        }),
        additional_compensation: comps.map(c => ({ amount: parseFloat(c.amount) || 0, fee_type: c.fee_type, fee_type_other: c.fee_type_other || null, paid_by: c.paid_by, paid_by_other: c.paid_by_other || null })),
        flyer_team_name: agentTeam?.team_name || null,
      }
    }

    if (isAdmin && onBehalfAgent) {
      payload = { ...payload, on_behalf_of_agent_id: onBehalfAgent.id }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/agent/forms/compliance-cda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, commission_confirmed: commissionConfirmed }) })
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

      {isAdmin && (
        <div className="container-card mb-6 border-luxury-accent/30">
          <p className="text-sm font-medium text-luxury-gray-1 mb-1">Submitting on behalf of an agent</p>
          <p className="text-xs text-luxury-gray-3 mb-3">
            As office staff, choose the agent this submission is for. The transaction will be created under the selected agent. Leave blank to submit as yourself.
          </p>
          <AgentSelect value={onBehalfAgent?.id || ''} onSelect={setOnBehalfAgent} label="Agent" placeholder="Search for an agent..." />
        </div>
      )}

      {/* Stop notice */}
      <div className="inner-card border-red-200 bg-red-50 mb-6">
        <div className="flex gap-2 items-start">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-medium">
            STOP - Do not complete this form until all required compliance documents have been signed and uploaded.
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
              onClick={() => { setMode(opt.value); setSearchDone(false); setFoundTransaction(null); setLastSubmission(null); setAddressSearch(''); setError(''); setDuplicateMatches([]); setConfirmedNewDeal(false); setAttachTo(null) }}
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
                      <label className="block text-xs text-luxury-gray-3 mb-1">Acceptance Date <span className="text-red-500">*</span></label>
                      <input type="date" className="input-luxury w-full text-sm mb-3" value={form.acceptance_date} onChange={e => setField('acceptance_date', e.target.value)} />
                      <label className="block text-xs text-luxury-gray-3 mb-1">Closing or Move-In Date <span className="text-red-500">*</span></label>
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
                      <input type="text" inputMode="decimal" className="input-luxury w-full text-sm" id="fld_basis" value={form.commission_basis_price} onChange={e => setField('commission_basis_price', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Commission Rate</label>
                      <div className="flex gap-2">
                        <select className="input-luxury text-sm w-20 flex-shrink-0" value={form.commission_rate_type} onChange={e => setField('commission_rate_type', e.target.value)}>
                          <option value="percent">%</option>
                          <option value="flat">$</option>
                        </select>
                        <input type="number" className="input-luxury flex-1 text-sm" id="fld_rate" value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Total {isLease ? 'Rent' : 'Sales'} Price</label>
                      <input type="number" className="input-luxury w-full text-sm" value={form.total_sales_rent_price} onChange={e => setField('total_sales_rent_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Bonus / BTSA Amount</label>
                      <div className="flex gap-1.5"><input id="fld_btsa" type="number" className="input-luxury w-full text-sm" value={form.bonus_btsa_amount} onChange={e => setField('bonus_btsa_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={form.bonus_btsa_amount_type} onChange={e => setField('bonus_btsa_amount_type', e.target.value)}><option value="flat">$</option><option value="percent">%</option></select></div><FieldTip text="Bonus To Selling Agent - extra money a builder or seller pays you on top of commission. $ amount or % of the sales price. Paid to you in full; the brokerage split does not apply to it." />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Buyer / Seller Rebate</label>
                      <div className="flex gap-1.5"><input id="fld_rebate" type="number" className="input-luxury w-full text-sm" value={form.rebate_amount} onChange={e => setField('rebate_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={form.rebate_amount_type} onChange={e => setField('rebate_amount_type', e.target.value)}><option value="flat">$</option><option value="percent">%</option></select></div><FieldTip text="Money you are giving back to your client at closing. Usually a dollar amount. If you choose %, it means percent of the SALES PRICE. This comes out of YOUR share." />
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
                          <><div className="flex gap-1.5"><input id={`fld_${feeKey}`} type="number" className="input-luxury w-full text-sm" value={(form as any)[feeKey]} onChange={e => setField(feeKey as any, e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={(form as any)[`${feeKey}_type`]} onChange={e => setField(`${feeKey}_type` as any, e.target.value)}><option value="percent">%</option><option value="flat">$</option></select></div>{key === 'external_referral' && (
  <input type="text" className="input-luxury w-full text-sm mt-2" value={form.external_referral_brokerage_name} onChange={e => setField('external_referral_brokerage_name', e.target.value)} placeholder="Receiving brokerage name" />
)}<p className="text-[10px] text-luxury-gray-3 mt-1">% = percent of the commission</p></>
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
        {mode === 'compliance' && duplicateMatches.length > 0 && (
          <section>
            <div className="inner-card border-luxury-accent/40 bg-luxury-accent/5 space-y-4">
              <p className="text-sm font-semibold text-luxury-gray-1">We found a retainer you submitted for a client with a similar name.</p>
              <p className="text-xs text-luxury-gray-3">Attaching adds this property and deal to that retainer instead of creating a separate transaction.</p>
              <div className="space-y-2">
                {duplicateMatches.map((m: any) => (
                  <div key={m.id} className="inner-card flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">{m.client_name}</p>
                      <p className="text-xs text-luxury-gray-3">Created {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <button
                      onClick={() => { setAttachTo({ id: m.id, client_name: m.client_name }); setDuplicateMatches([]) }}
                      className="btn btn-primary text-xs flex-shrink-0"
                    >
                      This is the same deal - attach
                    </button>
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
        {mode === 'compliance' && attachTo && (
          <div className="flex items-start gap-2 p-3 bg-luxury-accent/5 border border-luxury-accent/40 rounded text-xs text-luxury-gray-2">
            <Info size={13} className="flex-shrink-0 mt-0.5 text-luxury-accent" />
            <span>This submission will be attached to your retainer for <strong className="text-luxury-gray-1">{attachTo.client_name}</strong>. Submit again to finish.</span>
            <button onClick={() => setAttachTo(null)} className="ml-auto text-luxury-gray-3 underline flex-shrink-0">Undo</button>
          </div>
        )}
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
                  {foundTransaction ? `Found: ${foundTransaction.property_address} - Status: ${foundTransaction.status}` : 'No existing transaction found. Enter the full address below and we will create one.'}
                </div>
              )}

              {/* Nothing linked, so this submission will create a transaction.
                  Ask for the address in parts, the same way every other form
                  does, so a new transaction can never be created with a partial
                  address. Shown whenever nothing is linked, including when the
                  agent skips the search. */}
              {!foundTransaction && (
                <div className="mt-4 p-4 border border-luxury-gray-5 rounded space-y-3">
                  <p className="text-xs font-semibold text-luxury-gray-1">Property address for the new transaction</p>
                  <AddressInput
                    required
                    value={newAddress}
                    onChange={(a: AddressFields) => setNewAddress(a)}
                    onValidityChange={setNewAddressComplete}
                  />
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
                  <label className="block text-xs text-luxury-gray-3 mb-1">Client Phone</label>
                  <input type="tel" className="input-luxury w-full text-sm" value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} placeholder="(555) 555-5555" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Lead Source <span className="text-red-500">*</span></label>
                  <select className="input-luxury w-full text-sm" value={form.lead_source} onChange={e => setField('lead_source', e.target.value)}>
                    <option value="">Select...</option>
                    {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Acceptance Date <span className="text-red-500">*</span></label>
                  <input type="date" className="input-luxury w-full text-sm" value={form.acceptance_date} onChange={e => setField('acceptance_date', e.target.value)} />
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
                  <input type="text" inputMode="decimal" className="input-luxury w-full text-sm" id="fld_basis" value={form.commission_basis_price} onChange={e => setField('commission_basis_price', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Commission Rate <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select className="input-luxury text-sm w-20 flex-shrink-0" value={form.commission_rate_type} onChange={e => setField('commission_rate_type', e.target.value)}>
                      <option value="percent">%</option>
                      <option value="flat">$</option>
                    </select>
                    <input type="number" className="input-luxury flex-1 text-sm" id="fld_rate" value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Total {flyerIsLease ? 'Rent' : 'Sales'} Price <span className="text-red-500">*</span></label>
                  <input type="number" className="input-luxury w-full text-sm" value={form.total_sales_rent_price} onChange={e => setField('total_sales_rent_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Bonus / BTSA Amount <span className="text-red-500">*</span></label>
                  <div className="flex gap-1.5"><input id="fld_btsa" type="number" className="input-luxury w-full text-sm" value={form.bonus_btsa_amount} onChange={e => setField('bonus_btsa_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={form.bonus_btsa_amount_type} onChange={e => setField('bonus_btsa_amount_type', e.target.value)}><option value="flat">$</option><option value="percent">%</option></select></div><FieldTip text="Bonus To Selling Agent - extra money a builder or seller pays you on top of commission. $ amount or % of the sales price. Paid to you in full; the brokerage split does not apply to it." />
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
                  <div className="flex gap-1.5"><input id="fld_rebate" type="number" className="input-luxury w-full text-sm" value={form.rebate_amount} onChange={e => setField('rebate_amount', e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={form.rebate_amount_type} onChange={e => setField('rebate_amount_type', e.target.value)}><option value="flat">$</option><option value="percent">%</option></select></div><FieldTip text="Money you are giving back to your client at closing. Usually a dollar amount. If you choose %, it means percent of the SALES PRICE. This comes out of YOUR share." />
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
                      <><div className="flex gap-1.5"><input id={`fld_${feeKey}`} type="number" className="input-luxury w-full text-sm" value={(form as any)[feeKey]} onChange={e => setField(feeKey as any, e.target.value)} placeholder="0.00" min="0" step="0.01" /><select className="input-luxury text-sm w-16 flex-shrink-0" value={(form as any)[`${feeKey}_type`]} onChange={e => setField(`${feeKey}_type` as any, e.target.value)}><option value="percent">%</option><option value="flat">$</option></select></div>{key === 'external_referral' && (
  <input type="text" className="input-luxury w-full text-sm mt-2" value={form.external_referral_brokerage_name} onChange={e => setField('external_referral_brokerage_name', e.target.value)} placeholder="Receiving brokerage name" />
)}<p className="text-[10px] text-luxury-gray-3 mt-1">% = percent of the commission</p></>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 4 - Title (sales only; hidden for leases and referred-out) */}
            {showTitleLoan && (
            <section>
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Title
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Officer Name <span className="text-red-500">*</span></label>
                  <input className="input-luxury w-full text-sm" value={form.title_officer_name} onChange={e => setField('title_officer_name', e.target.value)} placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Company <span className="text-red-500">*</span></label>
                  <input className="input-luxury w-full text-sm" value={form.title_company} onChange={e => setField('title_company', e.target.value)} placeholder="Company name" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Company Email (used to send CDA) <span className="text-red-500">*</span></label>
                  <input type="email" className="input-luxury w-full text-sm" value={form.title_company_email} onChange={e => setField('title_company_email', e.target.value)} placeholder="email@titleco.com" />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1">Title Company Phone</label>
                  <input type="tel" className="input-luxury w-full text-sm" value={form.title_phone} onChange={e => setField('title_phone', e.target.value)} placeholder="(555) 555-5555" />
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
            )}

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

        {(mode === 'compliance' || (mode === 'subsequent' && foundTransaction)) && renderCommissionConfirm()}

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
