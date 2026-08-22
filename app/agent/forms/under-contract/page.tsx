'use client'

import { useState, useEffect } from 'react'
import AddressInput, { AddressFields } from '@/components/shared/AddressInput'
import { buildDisplayAddress } from '@/lib/transactions/utils'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import AgentSelect, { AgentOption } from '@/components/forms/AgentSelect'

// Lead sources match the New Contract MS Form exactly.
const LEAD_SOURCES = [
  'Brokerage Referral', 'Client Referral', 'Other Referral', 'kvCORE Lead',
  'MLS Lead', 'IG Lead', 'Repeat Client', 'Print Advertising',
  'Family/Friend', 'Social Media/Other',
]

// Sales only. This form requires title company and mortgage lender details,
// which lease deals do not have. Leases are submitted through the Compliance
// form, which handles tenant and landlord representation.
const REPRESENTING = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'new_construction_buyer', label: 'New Construction Buyer' },
  { value: 'seller', label: 'Seller' },
]

const FLYER_CHOICES = [
  { value: 'houston', label: 'Houston' },
  { value: 'dallas', label: 'Dallas' },
  { value: 'team', label: 'Team Name' },
  { value: 'division', label: 'Division Name' },
]

export default function UnderContractForm() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [onBehalfAgent, setOnBehalfAgent] = useState<AgentOption | null>(null)
  const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
  const isAdmin = ADMIN_ROLES.includes(String(user?.role || '').toLowerCase())
  const [submitting, setSubmitting] = useState(false)
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([])
  const [confirmedNewDeal, setConfirmedNewDeal] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [submitResult, setSubmitResult] = useState<any>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    agent_name: '', agent_email: '', agent_phone: '',
    street_address: '', unit: '', city: '', state: 'TX', zip: '', sales_price: '', commission_rate: '', closing_date: '', mls_link: '',
    flyer_choice: '', team_name: '', division_name: '',
    representing: '', client_name: '', client_phone: '', client_email: '', lead_source: '',
    other_agent_name: '', other_agent_phone: '', other_agent_email: '',
    title_company: '', title_contact_name: '', title_phone: '', title_email: '',
    lender_company: '', lender_contact_name: '', lender_phone: '', lender_email: '',
    bedrooms: '', bathrooms: '', garage: '', sqft: '',
    add_transaction_coordination: '' as '' | 'yes' | 'no',
    documents_uploaded_ack: false,
  })

  // Address completeness, including whether the unit question was answered.
  const [addressComplete, setAddressComplete] = useState(false)

  const setField = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    async function fetchUser() {
      const res = await fetch('/api/auth/me')
      if (!res.ok) { router.push('/auth/login'); return }
      const data = await res.json()
      setUser(data.user)
      const u = data.user
      if (u) {
        setForm(prev => ({
          ...prev,
          agent_name: `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim(),
          agent_email: u.email || '',
        }))
      }
    }
    fetchUser()
  }, [router])

  const showTeam = form.flyer_choice === 'team'
  const showDivision = form.flyer_choice === 'division'

  const handleSubmit = async () => {
    setError('')

    // Client-side required checks
    const req: Array<[string, any]> = [
      ['Agent name', form.agent_name], ['Agent email', form.agent_email], ['Agent phone', form.agent_phone],
      ['Street address', form.street_address], ['City', form.city], ['State', form.state], ['Zip', form.zip], ['Sales price', form.sales_price],
      ['Commission rate', form.commission_rate], ['Closing date', form.closing_date], ['MLS link', form.mls_link],
      ['Flyer choice', form.flyer_choice], ['Representation', form.representing],
      ['Client name', form.client_name], ['Client phone', form.client_phone], ['Client email', form.client_email],
      ['Lead source', form.lead_source], ['Other agent name', form.other_agent_name],
      ['Other agent phone', form.other_agent_phone], ['Other agent email', form.other_agent_email],
      ['Title company', form.title_company], ['Title contact name', form.title_contact_name],
      ['Title company phone', form.title_phone], ['Title company email', form.title_email],
      ['Lender company', form.lender_company], ['Lender contact name', form.lender_contact_name],
      ['Lender phone', form.lender_phone], ['Lender email', form.lender_email],
    ]
    for (const [label, val] of req) {
      if (!val || String(val).trim() === '') { setError(`${label} is required.`); return }
    }
    if (!addressComplete) {
      setError('Complete the property address, including whether the property has a unit.')
      return
    }

    if (showTeam && !form.team_name.trim()) { setError('Team name is required.'); return }
    if (showDivision && !form.division_name.trim()) { setError('Division name is required.'); return }
    if (!form.add_transaction_coordination) { setError('Please answer the transaction coordination question.'); return }
    if (!form.documents_uploaded_ack) { setError('Please confirm you have uploaded the contract documents.'); return }

    // Passed validation: show the review step instead of submitting immediately.
    setShowReview(true)
  }

  const handleConfirmSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        on_behalf_of_agent_id: isAdmin && onBehalfAgent ? onBehalfAgent.id : null,
        add_transaction_coordination: form.add_transaction_coordination === 'yes',
        confirm_new_deal: confirmedNewDeal,
      }
      const res = await fetch('/api/agent/forms/under-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      // The server found a deal that already exists for this property. Show it
      // and let the agent decide, rather than quietly making a second one.
      if (res.ok && data.duplicate_check) { setDuplicateMatches(data.matches || []); return }
      if (!res.ok || !data.success) { setError(data.error || 'Submission failed. Please try again.'); return }
      setSubmitResult(data)
      setSubmitted(true)
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  if (submitted && submitResult) {
    return (
      <div>
        <h1 className="page-title mb-6">NEW CONTRACT</h1>
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

  const inputCls = 'input-luxury w-full text-sm'
  const labelCls = 'block text-xs text-luxury-gray-3 mb-1'
  const req = <span className="text-red-500">*</span>

  return (
    <div>
      <h1 className="page-title mb-2">NEW CONTRACT</h1>
      <p className="text-xs text-luxury-gray-3 mb-6 max-w-2xl">
        Submit this form when you have executed a new contract. The transaction will be created in Collective Agent and your Under Contract flyer will be prepared.
      </p>

      <div className="container-card space-y-8">

        {isAdmin && (
          <section className="border border-luxury-accent/30 rounded p-4">
            <p className="text-sm font-medium text-luxury-gray-1 mb-1">Submitting on behalf of an agent</p>
            <p className="text-xs text-luxury-gray-3 mb-3">
              As office staff, choose the agent this contract is for. The transaction will be created under the selected agent. Leave blank to submit as yourself.
            </p>
            <AgentSelect
              value={onBehalfAgent?.id || ''}
              onSelect={(a) => {
                setOnBehalfAgent(a)
                if (a) setForm(prev => ({ ...prev, agent_name: a.name }))
              }}
              label="Agent"
              placeholder="Search for an agent..."
            />
          </section>
        )}

        {/* Agent */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Agent</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Agent Name {req}</label>
              <input className={inputCls} value={form.agent_name} onChange={e => setField('agent_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Agent Email {req}</label>
              <input type="email" className={inputCls} value={form.agent_email} onChange={e => setField('agent_email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Agent Phone {req}</label>
              <input type="tel" className={inputCls} value={form.agent_phone} onChange={e => setField('agent_phone', e.target.value)} placeholder="(555) 555-5555" />
            </div>
          </div>
        </section>

        {/* Transaction */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Transaction</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <AddressInput
                required
                value={{
                  street_address: form.street_address,
                  unit: form.unit,
                  city: form.city,
                  state: form.state,
                  zip: form.zip,
                }}
                onValidityChange={setAddressComplete}
                onChange={(a: AddressFields) => setForm((f: any) => ({ ...f, ...a }))}
              />
            </div>
            <div>
              <label className={labelCls}>Sales Price {req}</label>
              <input type="number" className={inputCls} value={form.sales_price} onChange={e => setField('sales_price', e.target.value)} placeholder="0.00" min="0" step="0.01" />
            </div>
            <div>
              <label className={labelCls}>Commission Rate {req}</label>
              <input className={inputCls} value={form.commission_rate} onChange={e => setField('commission_rate', e.target.value)} placeholder="e.g. 3% or 3000" />
            </div>
            <div>
              <label className={labelCls}>Closing Date {req}</label>
              <input type="date" className={inputCls} value={form.closing_date} onChange={e => setField('closing_date', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>MLS Link {req}</label>
              <input className={inputCls} value={form.mls_link} onChange={e => setField('mls_link', e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </section>

        {/* Flyer */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Under Contract Flyer</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Which would you like to appear on your under contract flyer? {req}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {FLYER_CHOICES.map(c => (
                  <label key={c.value} className={`flex items-center gap-2 border rounded px-3 py-2 cursor-pointer text-sm ${form.flyer_choice === c.value ? 'border-luxury-accent bg-luxury-accent/5' : 'border-luxury-gray-5'}`}>
                    <input type="radio" name="flyer_choice" checked={form.flyer_choice === c.value} onChange={() => setField('flyer_choice', c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            {showTeam && (
              <div>
                <label className={labelCls}>Please type the team name below. Check spelling because we will copy and paste. {req}</label>
                <input className={inputCls} value={form.team_name} onChange={e => setField('team_name', e.target.value)} />
              </div>
            )}
            {showDivision && (
              <div>
                <label className={labelCls}>Please type the division name below. Check spelling because we will copy and paste. {req}</label>
                <input className={inputCls} value={form.division_name} onChange={e => setField('division_name', e.target.value)} />
              </div>
            )}

            {/* Optional stats for the flyer */}
            <div>
              <p className="text-xs text-luxury-gray-3 mb-2">Property stats (optional, shown on the flyer)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Bedrooms</label>
                  <input type="number" className={inputCls} value={form.bedrooms} onChange={e => setField('bedrooms', e.target.value)} min="0" />
                </div>
                <div>
                  <label className={labelCls}>Bathrooms</label>
                  <input type="number" className={inputCls} value={form.bathrooms} onChange={e => setField('bathrooms', e.target.value)} min="0" step="0.5" />
                </div>
                <div>
                  <label className={labelCls}>Car Garage</label>
                  <input type="number" className={inputCls} value={form.garage} onChange={e => setField('garage', e.target.value)} min="0" />
                </div>
                <div>
                  <label className={labelCls}>Sq. Ft.</label>
                  <input type="number" className={inputCls} value={form.sqft} onChange={e => setField('sqft', e.target.value)} min="0" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Representation + Client */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Representation &amp; Client</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Who do you represent? {req}</label>
              <select className={inputCls} value={form.representing} onChange={e => setField('representing', e.target.value)}>
                <option value="">Select...</option>
                {REPRESENTING.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Client Name {req}</label>
              <input className={inputCls} value={form.client_name} onChange={e => setField('client_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Client Phone {req}</label>
              <input type="tel" className={inputCls} value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Client Email {req}</label>
              <input type="email" className={inputCls} value={form.client_email} onChange={e => setField('client_email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>What is the source of this lead? {req}</label>
              <select className={inputCls} value={form.lead_source} onChange={e => setField('lead_source', e.target.value)}>
                <option value="">Select...</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Other Agent */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Other Agent</h2>
          <p className="text-xs text-luxury-gray-3 mb-3">
            If you represent the buyer, this is the listing agent. If you represent the seller, this is the buyer&apos;s agent. If new construction, this is most likely the builder.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Other Agent Name {req}</label>
              <input className={inputCls} value={form.other_agent_name} onChange={e => setField('other_agent_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Other Agent Phone {req}</label>
              <input type="tel" className={inputCls} value={form.other_agent_phone} onChange={e => setField('other_agent_phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Other Agent Email {req}</label>
              <input type="email" className={inputCls} value={form.other_agent_email} onChange={e => setField('other_agent_email', e.target.value)} />
            </div>
          </div>
        </section>

        {/* Title */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Title Company</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Title Company {req}</label>
              <input className={inputCls} value={form.title_company} onChange={e => setField('title_company', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title Company Contact Name {req}</label>
              <input className={inputCls} value={form.title_contact_name} onChange={e => setField('title_contact_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title Company Phone {req}</label>
              <input type="tel" className={inputCls} value={form.title_phone} onChange={e => setField('title_phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title Company Email {req}</label>
              <input type="email" className={inputCls} value={form.title_email} onChange={e => setField('title_email', e.target.value)} />
            </div>
          </div>
        </section>

        {/* Lender */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Mortgage Lender</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Mortgage Lender Company Name {req}</label>
              <input className={inputCls} value={form.lender_company} onChange={e => setField('lender_company', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Lender Contact Name {req}</label>
              <input className={inputCls} value={form.lender_contact_name} onChange={e => setField('lender_contact_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Lender Phone {req}</label>
              <input type="tel" className={inputCls} value={form.lender_phone} onChange={e => setField('lender_phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Mortgage Lender Contact Email {req}</label>
              <input type="email" className={inputCls} value={form.lender_email} onChange={e => setField('lender_email', e.target.value)} />
            </div>
          </div>
        </section>

        {/* Transaction Coordination */}
        <section>
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Transaction Coordination</h2>
          <div className="flex items-start gap-2 p-3 mb-4 bg-luxury-accent/5 border border-luxury-accent/20 rounded text-xs text-luxury-gray-2">
            <Info size={14} className="text-luxury-accent flex-shrink-0 mt-0.5" />
            <span>
              The Transaction Coordinator Fee is $250 unless you are on the New Agent Commission Plan. There is no additional fee for transaction coordination on the New Agent Plan (TC is included). For all other commission plans, the $250 TC fee is paid at closing, added as a fee on your CDA.
            </span>
          </div>
          <label className={labelCls}>
            Would you like to add transaction coordination for this transaction? {req}
          </label>
          <div className="flex gap-3 mt-1">
            {(['yes', 'no'] as const).map(v => (
              <label key={v} className={`flex items-center gap-2 border rounded px-4 py-2 cursor-pointer text-sm ${form.add_transaction_coordination === v ? 'border-luxury-accent bg-luxury-accent/5' : 'border-luxury-gray-5'}`}>
                <input type="radio" name="add_tc" checked={form.add_transaction_coordination === v} onChange={() => setField('add_transaction_coordination', v)} />
                {v === 'yes' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
        </section>

        {/* Documents ack */}
        <section>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" checked={form.documents_uploaded_ack} onChange={e => setField('documents_uploaded_ack', e.target.checked)} />
            <span className="text-xs text-luxury-gray-2">Before submitting this form, please upload the contract documents.</span>
          </label>
        </section>

        {duplicateMatches.length > 0 && (
          <section>
            <div className="inner-card border-luxury-accent/40 bg-luxury-accent/5 space-y-4">
              <p className="text-sm font-semibold text-luxury-gray-1">This property already has a deal in Collective Agent.</p>
              <p className="text-xs text-luxury-gray-3">Submitting again would create a second transaction for the same property. If one of these is your deal, the office will file this contract against it.</p>
              <div className="space-y-2">
                {duplicateMatches.map((m: any) => (
                  <div key={m.id} className="inner-card">
                    <p className="text-sm font-medium text-luxury-gray-1">{m.property_address || m.client_name}</p>
                    <p className="text-xs text-luxury-gray-3">
                      {m.confidence === 'similar' ? 'Similar address' : 'Same address'} - {m.status} - created {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
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

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle size={14} className="flex-shrink-0" />{error}
          </div>
        )}

        {showReview ? (
          <div className="container-card border border-luxury-accent/40">
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">Review before submitting</h3>
            <p className="text-xs text-luxury-gray-3 mb-4">
              Submitting will create a transaction. Please confirm these details are correct.
            </p>
            <div className="space-y-2 text-xs text-luxury-gray-2 mb-5">
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Property</span><span className="text-right font-medium text-luxury-gray-1">{buildDisplayAddress(form)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Client</span><span className="text-right">{form.client_name}</span></div>
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Agent</span><span className="text-right">{form.agent_name}</span></div>
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Representation</span><span className="text-right">{form.representing}</span></div>
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Sales price</span><span className="text-right">{form.sales_price}</span></div>
              <div className="flex justify-between gap-4"><span className="text-luxury-gray-3">Closing date</span><span className="text-right">{form.closing_date}</span></div>
            </div>
            <div className="flex justify-between gap-3">
              <button
                onClick={() => setShowReview(false)}
                disabled={submitting}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                Back to edit
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Confirm and Submit'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary text-sm disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit New Contract'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
