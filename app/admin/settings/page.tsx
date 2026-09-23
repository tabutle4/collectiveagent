'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/context/AuthContext'
import RecurringBillsSettings from '@/components/admin/RecurringBillsSettings'
import { 
  Building2, 
  DollarSign, 
  Users, 
  Settings2, 
  Save, 
  Loader2, 
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ShieldCheck,
  Mic,
  Receipt,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import {
  DISCOUNT_AUDIENCE_LABELS,
  ReferralDiscount,
  FEE_TYPE_LABELS,
  FeeType,
  describeDiscountAmount,
  describeDiscountSchedule,
  isDiscountActiveOn,
} from '@/lib/referralDiscounts'

const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type Tab = 'brokerage' | 'offices' | 'standard' | 'referral' | 'coaching' | 'plans' | 'fees' | 'rules' | 'bills'

interface CompanySettings {
  // Brokerage
  agency_name: string
  agency_email: string
  brokerage_address_line1: string
  brokerage_address_line2: string
  brokerage_city: string
  brokerage_state: string
  brokerage_zip: string
  brokerage_main_email: string
  executive_email: string
  license_report_email?: string
  website?: string
  // Shared accounts
  canva_username?: string
  canva_password?: string
  canva_url?: string
  // Offices — Houston / DFW / Referral Collective (used by email signature)
  houston_address_line1?: string
  houston_address_line2?: string
  houston_city?: string
  houston_state?: string
  houston_zip?: string
  houston_phone?: string
  houston_fax?: string
  dfw_address_line1?: string
  dfw_address_line2?: string
  dfw_city?: string
  dfw_state?: string
  dfw_zip?: string
  dfw_phone?: string
  dfw_fax?: string
  rc_brand_name?: string
  rc_address_line1?: string
  rc_address_line2?: string
  rc_city?: string
  rc_state?: string
  rc_zip?: string
  rc_phone?: string
  rc_fax?: string
  rc_logo_url?: string
  rc_website?: string
  // Standard Agent
  standard_onboarding_fee: number
  standard_monthly_fee: number
  standard_late_fee: number
  payload_retainer_fee: number
  board_requirement_days: number
  termination_notice_days: number
  cda_due_soon_days?: number
  commission_payment_days: number
  // Referral Agent
  referral_annual_fee: number
  referral_split_apartment: number
  referral_split_internal: number
  referral_split_external: number
  referral_brokerage_name: string
  referral_brokerage_email: string
  referral_termination_notice_days: number
  referral_payment_terms_days: number
  referral_refund_period_days: number
  referral_conversion_free_until: string | null
  referral_conversion_discount: number
  // Apartment locating
  apartment_invoice_fee: number
  // Coaching
  coaching_zoom_link?: string
  coaching_client_zoom_link?: string
  coaching_brokerage_name?: string
  coaching_brokerage_email?: string
  coaching_brokerage_address?: string
  coaching_brokerage_website?: string
}

interface CommissionPlan {
  id: string
  code: string
  name: string
  description: string
  agent_split_percentage: number
  firm_split_percentage: number
  has_cap: boolean
  cap_amount: number | null
  post_cap_agent_split: number | null
  post_cap_firm_split: number | null
  processing_fee_amount: number | null
  coaching_fee_amount: number | null
  is_active: boolean
  notes: string | null
}

interface CommissionRule {
  id: string
  rule_key: string
  rule_name: string
  description: string
  agent_split: number | null
  brokerage_split: number | null
  minimum_percent: number | null
  minimum_description: string | null
  is_active: boolean
}

const TABS: { id: Tab; label: string; icon: any; permission?: string }[] = [
  { id: 'brokerage', label: 'Brokerage', icon: Building2 },
  { id: 'offices', label: 'Office Locations', icon: Building2 },
  { id: 'standard', label: 'Standard Agent', icon: Users },
  { id: 'referral', label: 'Referral Agent', icon: Users },
  { id: 'coaching', label: 'Coaching', icon: Mic },
  { id: 'plans', label: 'Commission Plans', icon: DollarSign },
  { id: 'fees', label: 'Processing Fees', icon: DollarSign },
  { id: 'rules', label: 'Commission Rules', icon: Settings2 },
  { id: 'bills', label: 'Recurring Bills', icon: Receipt, permission: 'can_view_ledger' },
]

export default function SettingsPage() {
  const { hasPermission } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTabState] = useState<Tab>(
    (searchParams.get('tab') as Tab) || 'brokerage'
  )
  const setActiveTab = (newTab: Tab) => {
    setActiveTabState(newTab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [plans, setPlans] = useState<CommissionPlan[]>([])
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [processingFees, setProcessingFees] = useState<any[]>([])
  const [editingFee, setEditingFee] = useState<any | null>(null)
  const [savingFee, setSavingFee] = useState(false)

  const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)

  const [discounts, setDiscounts] = useState<ReferralDiscount[]>([])
  const [editingDiscount, setEditingDiscount] = useState<ReferralDiscount | null>(null)
  const [savingDiscount, setSavingDiscount] = useState(false)

  // Commission wiring instructions (firm-wide PDF, attached to title CDA emails)
  const [wiringStatus, setWiringStatus] = useState<{ filename: string | null; updated_at: string | null }>({ filename: null, updated_at: null })
  const [wiringBusy, setWiringBusy] = useState(false)

  useEffect(() => {
    fetchSettings()
    fetchProcessingFees()
    fetchWiringStatus()
    fetchDiscounts()
  }, [])

  async function fetchWiringStatus() {
    try {
      const res = await fetch('/api/admin/settings/wiring-instructions')
      const data = await res.json()
      if (res.ok) setWiringStatus({ filename: data.filename || null, updated_at: data.updated_at || null })
    } catch {
      // Silent — page renders without it.
    }
  }

  async function uploadWiring(file: File) {
    setWiringBusy(true)
    setError('')
    setSuccess('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/settings/wiring-instructions', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setWiringStatus({ filename: data.filename, updated_at: data.updated_at })
      setSuccess('Wiring instructions uploaded.')
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setWiringBusy(false)
    }
  }

  async function deleteWiring() {
    if (!confirm('Remove the stored commission wiring instructions?')) return
    setWiringBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/settings/wiring-instructions', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Remove failed')
      setWiringStatus({ filename: null, updated_at: null })
      setSuccess('Wiring instructions removed.')
    } catch (err: any) {
      setError(err.message || 'Remove failed')
    } finally {
      setWiringBusy(false)
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.settings)
        setPlans(data.plans || [])
        setRules(data.rules || [])
      } else {
        setError(data.error || 'Failed to load settings')
      }
    } catch (err) {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function fetchProcessingFees() {
    try {
      const res = await fetch('/api/admin/processing-fees')
      const data = await res.json()
      if (res.ok) setProcessingFees(data.processing_fees || [])
    } catch {
      // Silent — page can render without
    }
  }

  async function saveProcessingFee(updated: any) {
    setSavingFee(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/processing-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updated.id,
          updates: {
            name: updated.name,
            code: updated.code,
            processing_fee: updated.processing_fee,
            is_lease: updated.is_lease,
            is_active: updated.is_active,
            display_order: updated.display_order,
            counts_toward_cap: updated.counts_toward_cap,
            counts_toward_upgrade: updated.counts_toward_upgrade,
            fee_type: updated.fee_type,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setProcessingFees(prev => prev.map(f => f.id === updated.id ? data.processing_fee : f))
      setEditingFee(null)
      setSuccess('Saved')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSavingFee(false)
    }
  }

  async function toggleProcessingFeeActive(fee: any) {
    await saveProcessingFee({ ...fee, is_active: !fee.is_active })
  }

  async function fetchDiscounts() {
    try {
      const res = await fetch('/api/admin/settings/discounts')
      const data = await res.json()
      if (res.ok) setDiscounts(data.discounts || [])
    } catch {
      // Silent, the rest of the tab still renders
    }
  }

  function blankDiscount(): ReferralDiscount {
    return {
      id: '',
      name: '',
      description: null,
      fee_type: 'rc_annual',
      first_invoice_only: false,
      audience: 'all',
      discount_type: 'amount',
      amount: 0,
      schedule_type: 'once',
      starts_on: null,
      ends_on: null,
      start_month: null,
      start_day: null,
      end_month: null,
      end_day: null,
      repeat_until: null,
      is_active: true,
    }
  }

  async function saveDiscount(discount: ReferralDiscount) {
    setSavingDiscount(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/admin/settings/discounts', {
        method: discount.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save discount')
      await fetchDiscounts()
      setEditingDiscount(null)
      setSuccess('Discount saved')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save discount')
    } finally {
      setSavingDiscount(false)
    }
  }

  async function toggleDiscountActive(discount: ReferralDiscount) {
    await saveDiscount({ ...discount, is_active: !discount.is_active })
  }

  async function deleteDiscount(discountId: string) {
    if (!confirm('Delete this discount? Switching it off instead keeps it here for next time.')) return

    try {
      const res = await fetch(`/api/admin/settings/discounts?id=${discountId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete discount')
      await fetchDiscounts()
      setSuccess('Discount deleted')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to delete discount')
    }
  }

  async function saveSettings() {
    if (!settings) return
    setSaving(true)
    setError('')
    setSuccess('')
    
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Settings saved successfully')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to save settings')
      }
    } catch (err) {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function savePlan(plan: CommissionPlan) {
    setSaving(true)
    setError('')
    
    try {
      const res = await fetch('/api/admin/settings/plans', {
        method: plan.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchSettings()
        setEditingPlan(null)
        setSuccess('Plan saved successfully')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to save plan')
      }
    } catch (err) {
      setError('Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  async function deletePlan(planId: string) {
    if (!confirm('Are you sure you want to delete this plan?')) return
    
    try {
      const res = await fetch(`/api/admin/settings/plans?id=${planId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        await fetchSettings()
        setSuccess('Plan deleted')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to delete plan')
      }
    } catch (err) {
      setError('Failed to delete plan')
    }
  }

  async function saveRule(rule: CommissionRule) {
    setSaving(true)
    setError('')
    
    try {
      const res = await fetch('/api/admin/settings/rules', {
        method: rule.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchSettings()
        setEditingRule(null)
        setSuccess('Rule saved successfully')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Failed to save rule')
      }
    } catch (err) {
      setError('Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  function updateSetting<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-cream flex items-center justify-center">
        <Loader2 className="animate-spin text-luxury-gray-3" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-cream p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">Settings</h1>
          <p className="text-sm text-luxury-gray-3">Manage brokerage settings, fees, and commission structures</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="alert-success mb-4 flex items-center gap-2">
            <Check size={16} />
            {success}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="container-card p-2">
              {TABS.filter((tab) => !tab.permission || hasPermission(tab.permission)).map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-luxury-gold/10 text-luxury-gold'
                        : 'text-luxury-gray-2 hover:bg-luxury-gray-6'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && <ChevronRight size={16} className="ml-auto" />}
                  </button>
                )
              })}
              {hasPermission('can_manage_roles') && (
                <Link
                  href="/admin/permissions"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-colors text-luxury-gray-2 hover:bg-luxury-gray-6"
                >
                  <ShieldCheck size={18} />
                  <span>Permissions</span>
                  <ChevronRight size={16} className="ml-auto" />
                </Link>
              )}
              {hasPermission('can_manage_required_documents') && (
                <Link
                  href="/admin/settings/required-documents"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-colors text-luxury-gray-2 hover:bg-luxury-gray-6"
                >
                  <Settings2 size={18} />
                  <span>Required Documents</span>
                  <ChevronRight size={16} className="ml-auto" />
                </Link>
              )}
              {hasPermission('can_manage_checklists') && (
                <Link
                  href="/admin/settings/checklists"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-colors text-luxury-gray-2 hover:bg-luxury-gray-6"
                >
                  <Settings2 size={18} />
                  <span>Checklists</span>
                  <ChevronRight size={16} className="ml-auto" />
                </Link>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {/* Brokerage Settings */}
            {activeTab === 'brokerage' && settings && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Brokerage Information</h2>
                  <button onClick={saveSettings} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Changes
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Agency Name (CRC)</label>
                    <input
                      type="text"
                      value={settings.agency_name}
                      onChange={(e) => updateSetting('agency_name', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="field-label">Agency Email</label>
                    <input
                      type="email"
                      value={settings.agency_email}
                      onChange={(e) => updateSetting('agency_email', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="field-label">Address Line 1</label>
                    <input
                      type="text"
                      value={settings.brokerage_address_line1}
                      onChange={(e) => updateSetting('brokerage_address_line1', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="field-label">Address Line 2</label>
                    <input
                      type="text"
                      value={settings.brokerage_address_line2 || ''}
                      onChange={(e) => updateSetting('brokerage_address_line2', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="field-label">City</label>
                    <input
                      type="text"
                      value={settings.brokerage_city}
                      onChange={(e) => updateSetting('brokerage_city', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="field-label">State</label>
                    <input
                      type="text"
                      value={settings.brokerage_state}
                      onChange={(e) => updateSetting('brokerage_state', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="field-label">ZIP Code</label>
                    <input
                      type="text"
                      value={settings.brokerage_zip}
                      onChange={(e) => updateSetting('brokerage_zip', e.target.value)}
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="field-label">Main Email</label>
                    <input
                      type="email"
                      value={settings.brokerage_main_email}
                      onChange={(e) => updateSetting('brokerage_main_email', e.target.value)}
                      className="input-luxury"
                    />
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      Agent-facing inbox (e.g. office@).
                    </p>
                  </div>
                  <div>
                    <label className="field-label">Executive Email</label>
                    <input
                      type="email"
                      value={settings.executive_email || ''}
                      onChange={(e) => updateSetting('executive_email', e.target.value)}
                      className="input-luxury"
                    />
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      CC'd on commission statements and CDAs. Owner and ops only.
                    </p>
                  </div>
                  <div>
                    <label className="field-label">License Report Email</label>
                    <input
                      type="text"
                      value={settings.license_report_email || ''}
                      onChange={(e) => updateSetting('license_report_email', e.target.value)}
                      className="input-luxury"
                    />
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      Weekly TREC license check. Separate more than one address with a comma.
                    </p>
                  </div>
                </div>
                {/* Shared Canva Pro Account */}
                <div className="mt-8 pt-6 border-t border-luxury-gray-5/30">
                  <h3 className="section-title mb-4">Shared Canva Pro Account</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Canva Username</label>
                      <input type="text" value={settings.canva_username || ''} onChange={(e) => updateSetting('canva_username', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Canva Password</label>
                      <input type="text" value={settings.canva_password || ''} onChange={(e) => updateSetting('canva_password', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Canva Account Link</label>
                      <input type="text" value={settings.canva_url || ''} onChange={(e) => updateSetting('canva_url', e.target.value)} className="input-luxury" />
                      <p className="text-xs text-luxury-gray-3 mt-1">Emailed to new agents about 24 hours after their first login. Changing the password here emails the new login to agents@collectiverealtyco.com. Click Save Changes above to apply.</p>
                    </div>
                  </div>
                </div>
                {/* Commission Wiring Instructions */}
                <div className="mt-8 pt-6 border-t border-luxury-gray-5/30">
                  <h3 className="section-title mb-2">Commission Wiring Instructions</h3>
                  <p className="text-xs text-luxury-gray-3 mb-4">
                    Firm-wide PDF attached to every CDA sent to a title company. Stored privately, not in a public link.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className={`btn btn-secondary text-sm cursor-pointer ${wiringBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                      {wiringStatus.filename ? 'Replace PDF' : 'Upload PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={wiringBusy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadWiring(f); e.currentTarget.value = '' }}
                      />
                    </label>
                    {wiringStatus.filename ? (
                      <>
                        <span className="text-sm text-luxury-gray-1">{wiringStatus.filename}</span>
                        <button onClick={deleteWiring} disabled={wiringBusy} className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50">
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-luxury-gray-3">No file uploaded</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Office Locations — Houston / DFW / Referral Collective */}
            {activeTab === 'offices' && settings && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Office Locations</h2>
                  <button onClick={saveSettings} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Changes
                  </button>
                </div>

                <p className="text-sm text-luxury-gray-3 mb-6">
                  These locations populate the Office dropdown in the agent email signature builder.
                </p>

                {/* CRC Houston */}
                <div className="mb-8">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">CRC Houston Office</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 1</label>
                      <input type="text" value={settings.houston_address_line1 || ''} onChange={(e) => updateSetting('houston_address_line1', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 2</label>
                      <input type="text" value={settings.houston_address_line2 || ''} onChange={(e) => updateSetting('houston_address_line2', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">City</label>
                      <input type="text" value={settings.houston_city || ''} onChange={(e) => updateSetting('houston_city', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">State</label>
                      <input type="text" value={settings.houston_state || ''} onChange={(e) => updateSetting('houston_state', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">ZIP</label>
                      <input type="text" value={settings.houston_zip || ''} onChange={(e) => updateSetting('houston_zip', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input type="text" value={settings.houston_phone || ''} onChange={(e) => updateSetting('houston_phone', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Fax</label>
                      <input type="text" value={settings.houston_fax || ''} onChange={(e) => updateSetting('houston_fax', e.target.value)} className="input-luxury" />
                    </div>
                  </div>
                </div>

                {/* CRC DFW */}
                <div className="mb-8">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">CRC DFW Office (Irving)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 1</label>
                      <input type="text" value={settings.dfw_address_line1 || ''} onChange={(e) => updateSetting('dfw_address_line1', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 2</label>
                      <input type="text" value={settings.dfw_address_line2 || ''} onChange={(e) => updateSetting('dfw_address_line2', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">City</label>
                      <input type="text" value={settings.dfw_city || ''} onChange={(e) => updateSetting('dfw_city', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">State</label>
                      <input type="text" value={settings.dfw_state || ''} onChange={(e) => updateSetting('dfw_state', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">ZIP</label>
                      <input type="text" value={settings.dfw_zip || ''} onChange={(e) => updateSetting('dfw_zip', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input type="text" value={settings.dfw_phone || ''} onChange={(e) => updateSetting('dfw_phone', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Fax</label>
                      <input type="text" value={settings.dfw_fax || ''} onChange={(e) => updateSetting('dfw_fax', e.target.value)} className="input-luxury" />
                    </div>
                  </div>
                </div>

                {/* Referral Collective */}
                <div>
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Referral Collective</h3>
                  <p className="text-xs text-luxury-gray-3 mb-4">
                    Auto-selected for agents with mls_choice = "Referral Collective (No MLS)". Swaps brand, logo, and website on the signature.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="field-label">Brand Name (shown above contact info)</label>
                      <input type="text" value={settings.rc_brand_name || ''} onChange={(e) => updateSetting('rc_brand_name', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Logo URL</label>
                      <input type="text" value={settings.rc_logo_url || ''} onChange={(e) => updateSetting('rc_logo_url', e.target.value)} className="input-luxury" />
                      <p className="text-xs text-luxury-gray-3 mt-1">Public URL of the logo image (paste a Supabase Storage public-assets URL).</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Website</label>
                      <input type="text" value={settings.rc_website || ''} onChange={(e) => updateSetting('rc_website', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 1</label>
                      <input type="text" value={settings.rc_address_line1 || ''} onChange={(e) => updateSetting('rc_address_line1', e.target.value)} className="input-luxury" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label">Address Line 2</label>
                      <input type="text" value={settings.rc_address_line2 || ''} onChange={(e) => updateSetting('rc_address_line2', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">City</label>
                      <input type="text" value={settings.rc_city || ''} onChange={(e) => updateSetting('rc_city', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">State</label>
                      <input type="text" value={settings.rc_state || ''} onChange={(e) => updateSetting('rc_state', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">ZIP</label>
                      <input type="text" value={settings.rc_zip || ''} onChange={(e) => updateSetting('rc_zip', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input type="text" value={settings.rc_phone || ''} onChange={(e) => updateSetting('rc_phone', e.target.value)} className="input-luxury" />
                    </div>
                    <div>
                      <label className="field-label">Fax (optional)</label>
                      <input type="text" value={settings.rc_fax || ''} onChange={(e) => updateSetting('rc_fax', e.target.value)} className="input-luxury" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Standard Agent Settings */}
            {activeTab === 'standard' && settings && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Standard Agent Settings</h2>
                  <button onClick={saveSettings} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Changes
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Fees</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="field-label">Onboarding Fee</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            value={settings.standard_onboarding_fee}
                            onChange={(e) => updateSetting('standard_onboarding_fee', Number(e.target.value))}
                            className="input-luxury pl-7"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">Monthly Fee</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            value={settings.standard_monthly_fee}
                            onChange={(e) => updateSetting('standard_monthly_fee', Number(e.target.value))}
                            className="input-luxury pl-7"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">Late Fee</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            value={settings.standard_late_fee}
                            onChange={(e) => updateSetting('standard_late_fee', Number(e.target.value))}
                            className="input-luxury pl-7"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">Office Retainer Fee</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            value={settings.payload_retainer_fee}
                            onChange={(e) => updateSetting('payload_retainer_fee', Number(e.target.value))}
                            className="input-luxury pl-7"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Terms</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="field-label">Board Requirement (days)</label>
                        <input
                          type="number"
                          value={settings.board_requirement_days}
                          onChange={(e) => updateSetting('board_requirement_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                        <p className="text-xs text-luxury-gray-3 mt-1">Days to join local board</p>
                      </div>
                      <div>
                        <label className="field-label">CDA Due Soon (days)</label>
                        <input
                          type="number"
                          value={settings.cda_due_soon_days ?? 7}
                          onChange={(e) => updateSetting('cda_due_soon_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                        <p className="text-xs text-luxury-gray-3 mt-1">Flag a deal on Needs CDA this many days before closing</p>
                      </div>
                      <div>
                        <label className="field-label">Termination Notice (days)</label>
                        <input
                          type="number"
                          value={settings.termination_notice_days}
                          onChange={(e) => updateSetting('termination_notice_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                      </div>
                      <div>
                        <label className="field-label">Commission Payment (days)</label>
                        <input
                          type="number"
                          value={settings.commission_payment_days}
                          onChange={(e) => updateSetting('commission_payment_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                        <p className="text-xs text-luxury-gray-3 mt-1">Max days to pay commission</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Referral Agent Settings */}
            {activeTab === 'referral' && settings && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Referral Collective (LFRO) Settings</h2>
                  <button onClick={saveSettings} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Changes
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Branding</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="field-label">Brokerage Name</label>
                        <input
                          type="text"
                          value={settings.referral_brokerage_name}
                          onChange={(e) => updateSetting('referral_brokerage_name', e.target.value)}
                          className="input-luxury"
                        />
                      </div>
                      <div>
                        <label className="field-label">Referral Email</label>
                        <input
                          type="email"
                          value={settings.referral_brokerage_email}
                          onChange={(e) => updateSetting('referral_brokerage_email', e.target.value)}
                          className="input-luxury"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Annual Fee</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="field-label">Annual Membership Fee</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            value={settings.referral_annual_fee}
                            onChange={(e) => updateSetting('referral_annual_fee', Number(e.target.value))}
                            className="input-luxury pl-7"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Commission Splits</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="field-label">Apartment Referrals (Agent %)</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settings.referral_split_apartment}
                            onChange={(e) => updateSetting('referral_split_apartment', Number(e.target.value))}
                            className="input-luxury pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">%</span>
                        </div>
                        <p className="text-xs text-luxury-gray-3 mt-1">Brokerage gets {100 - settings.referral_split_apartment}%</p>
                      </div>
                      <div>
                        <label className="field-label">Internal Referrals (Agent %)</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settings.referral_split_internal}
                            onChange={(e) => updateSetting('referral_split_internal', Number(e.target.value))}
                            className="input-luxury pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">%</span>
                        </div>
                        <p className="text-xs text-luxury-gray-3 mt-1">To CRC agents</p>
                      </div>
                      <div>
                        <label className="field-label">External Referrals (Agent %)</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settings.referral_split_external}
                            onChange={(e) => updateSetting('referral_split_external', Number(e.target.value))}
                            className="input-luxury pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">%</span>
                        </div>
                        <p className="text-xs text-luxury-gray-3 mt-1">Out-of-state or other TX brokerages</p>
                      </div>
                    </div>
                  </div>

                  <div className="inner-card">
                    <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Terms</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="field-label">Termination Notice (days)</label>
                        <input
                          type="number"
                          value={settings.referral_termination_notice_days}
                          onChange={(e) => updateSetting('referral_termination_notice_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                      </div>
                      <div>
                        <label className="field-label">Payment Terms (days)</label>
                        <input
                          type="number"
                          value={settings.referral_payment_terms_days}
                          onChange={(e) => updateSetting('referral_payment_terms_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                      </div>
                      <div>
                        <label className="field-label">Refund Period (days)</label>
                        <input
                          type="number"
                          value={settings.referral_refund_period_days}
                          onChange={(e) => updateSetting('referral_refund_period_days', Number(e.target.value))}
                          className="input-luxury"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Referral Discounts */}
                  <div className="inner-card">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-luxury-gray-1">Fee Discounts</h3>
                      <button
                        onClick={() => setEditingDiscount(blankDiscount())}
                        className="btn btn-primary text-sm flex items-center gap-2"
                      >
                        <Plus size={14} />
                        Add Discount
                      </button>
                    </div>
                    <p className="text-xs text-luxury-gray-3 mb-4">
                      Discounts come off whichever fee you pick: the ${settings.referral_annual_fee} Referral
                      Collective membership, the ${settings.standard_onboarding_fee} onboarding fee or the
                      ${settings.standard_monthly_fee} monthly fee. Only one is ever applied to a fee. When more
                      than one is running, the largest wins. An agent on an agreed rate of their own is not
                      discounted further. Switch a discount off to park it without losing the setup.
                    </p>

                    {discounts.length === 0 ? (
                      <p className="text-xs text-luxury-gray-3">No discounts yet. Everyone pays the standard fees.</p>
                    ) : (
                      <div className="space-y-3">
                        {discounts.map((discount) => {
                          const runningNow = isDiscountActiveOn(discount)
                          return (
                            <div key={discount.id} className={`inner-card ${!discount.is_active ? 'opacity-50' : ''}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-semibold text-luxury-gray-1">{discount.name}</h4>
                                    <span className="text-xs text-luxury-gray-2 bg-luxury-gray-6 px-2 py-0.5 rounded">
                                      {FEE_TYPE_LABELS[(discount.fee_type || 'rc_annual') as FeeType]}
                                    </span>
                                    {(discount.fee_type || 'rc_annual') === 'rc_annual' && (
                                      <span className="text-xs text-luxury-gray-3 bg-luxury-gray-6 px-2 py-0.5 rounded">
                                        {DISCOUNT_AUDIENCE_LABELS[discount.audience]}
                                      </span>
                                    )}
                                    {discount.first_invoice_only && (
                                      <span className="text-xs text-luxury-gray-3 bg-luxury-gray-6 px-2 py-0.5 rounded">
                                        First invoice only
                                      </span>
                                    )}
                                    <span className="text-xs text-luxury-gold bg-luxury-gold/10 px-2 py-0.5 rounded">
                                      {describeDiscountAmount(discount)}
                                    </span>
                                    {runningNow && (
                                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">Running now</span>
                                    )}
                                    {!discount.is_active && (
                                      <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Off</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-luxury-gray-3 mt-1">{describeDiscountSchedule(discount)}</p>
                                  {discount.description && (
                                    <p className="text-xs text-luxury-gray-2 mt-1">{discount.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleDiscountActive(discount)}
                                    disabled={savingDiscount}
                                    title={discount.is_active ? 'Switch off' : 'Switch on'}
                                    className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                                  >
                                    {discount.is_active
                                      ? <ToggleRight size={16} className="text-green-500" />
                                      : <ToggleLeft size={16} />}
                                  </button>
                                  <button
                                    onClick={() => setEditingDiscount(discount)}
                                    className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteDiscount(discount.id)}
                                    className="p-1.5 text-luxury-gray-3 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Discount Edit Modal */}
                  {editingDiscount && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                        <h3 className="text-lg font-semibold text-luxury-gray-1 mb-4">
                          {editingDiscount.id ? 'Edit Discount' : 'Add Discount'}
                        </h3>

                        <div className="space-y-4">
                          <div>
                            <label className="field-label">Name</label>
                            <input
                              type="text"
                              value={editingDiscount.name}
                              onChange={(e) => setEditingDiscount({ ...editingDiscount, name: e.target.value })}
                              className="input-luxury"
                              placeholder="e.g. Spring Join Promo"
                            />
                            <p className="text-xs text-luxury-gray-3 mt-1">
                              Agents see this name on the pricing page and at checkout.
                            </p>
                          </div>

                          <div>
                            <label className="field-label">Internal Note (optional)</label>
                            <textarea
                              value={editingDiscount.description || ''}
                              onChange={(e) => setEditingDiscount({ ...editingDiscount, description: e.target.value })}
                              className="input-luxury"
                              rows={2}
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label className="field-label">Which Fee</label>
                              <select
                                value={editingDiscount.fee_type || 'rc_annual'}
                                onChange={(e) => {
                                  const feeType = e.target.value as FeeType
                                  setEditingDiscount({
                                    ...editingDiscount,
                                    fee_type: feeType,
                                    // Converting and outside agents are Referral
                                    // Collective ideas. A discount on a CRC fee
                                    // applies to whoever is being billed.
                                    audience: feeType === 'rc_annual' ? editingDiscount.audience : 'all',
                                    first_invoice_only:
                                      feeType === 'crc_monthly' ? editingDiscount.first_invoice_only : false,
                                  })
                                }}
                                className="input-luxury"
                              >
                                <option value="rc_annual">RC annual membership</option>
                                <option value="crc_onboarding">CRC onboarding fee</option>
                                <option value="crc_monthly">CRC monthly fee</option>
                              </select>
                            </div>
                            {(editingDiscount.fee_type || 'rc_annual') === 'rc_annual' && (
                            <div>
                              <label className="field-label">Applies To</label>
                              <select
                                value={editingDiscount.audience}
                                onChange={(e) => setEditingDiscount({ ...editingDiscount, audience: e.target.value as ReferralDiscount['audience'] })}
                                className="input-luxury"
                              >
                                <option value="all">Everyone joining RC</option>
                                <option value="crc_conversion">CRC agents converting</option>
                                <option value="outside_only">Outside agents only</option>
                              </select>
                            </div>
                            )}
                            <div>
                              <label className="field-label">Discount Type</label>
                              <select
                                value={editingDiscount.discount_type}
                                onChange={(e) => setEditingDiscount({ ...editingDiscount, discount_type: e.target.value as ReferralDiscount['discount_type'] })}
                                className="input-luxury"
                              >
                                <option value="amount">Dollars off</option>
                                <option value="percent">Percent off</option>
                              </select>
                            </div>
                            <div>
                              <label className="field-label">
                                {editingDiscount.discount_type === 'percent' ? 'Percent Off (%)' : 'Amount Off ($)'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={editingDiscount.discount_type === 'percent' ? 100 : undefined}
                                step={editingDiscount.discount_type === 'percent' ? 1 : 0.01}
                                value={editingDiscount.amount}
                                onChange={(e) => setEditingDiscount({ ...editingDiscount, amount: Number(e.target.value) || 0 })}
                                className="input-luxury"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="field-label">Schedule</label>
                            <select
                              value={editingDiscount.schedule_type}
                              onChange={(e) => setEditingDiscount({ ...editingDiscount, schedule_type: e.target.value as ReferralDiscount['schedule_type'] })}
                              className="input-luxury"
                            >
                              <option value="once">One time, between two dates</option>
                              <option value="monthly">Every month, between two days</option>
                              <option value="yearly">Every year, between two dates</option>
                            </select>
                          </div>

                          {editingDiscount.schedule_type === 'once' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="field-label">Starts On (optional)</label>
                                <input
                                  type="date"
                                  value={editingDiscount.starts_on || ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, starts_on: e.target.value || null })}
                                  className="input-luxury"
                                />
                                <p className="text-xs text-luxury-gray-3 mt-1">Blank means it starts right away.</p>
                              </div>
                              <div>
                                <label className="field-label">Ends On (optional)</label>
                                <input
                                  type="date"
                                  value={editingDiscount.ends_on || ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, ends_on: e.target.value || null })}
                                  className="input-luxury"
                                />
                                <p className="text-xs text-luxury-gray-3 mt-1">Blank means it runs until you switch it off.</p>
                              </div>
                            </div>
                          )}

                          {editingDiscount.schedule_type === 'monthly' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="field-label">From Day of Month</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="31"
                                  value={editingDiscount.start_day ?? ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, start_day: e.target.value ? Number(e.target.value) : null })}
                                  className="input-luxury"
                                />
                              </div>
                              <div>
                                <label className="field-label">To Day of Month</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="31"
                                  value={editingDiscount.end_day ?? ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, end_day: e.target.value ? Number(e.target.value) : null })}
                                  className="input-luxury"
                                />
                                <p className="text-xs text-luxury-gray-3 mt-1">
                                  Same day in both boxes runs it for that one day. A later day in the first box wraps
                                  into the next month.
                                </p>
                              </div>
                            </div>
                          )}

                          {editingDiscount.schedule_type === 'yearly' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="field-label">From</label>
                                <div className="flex gap-2">
                                  <select
                                    value={editingDiscount.start_month ?? ''}
                                    onChange={(e) => setEditingDiscount({ ...editingDiscount, start_month: e.target.value ? Number(e.target.value) : null })}
                                    className="input-luxury"
                                  >
                                    <option value="">Month</option>
                                    {MONTH_OPTIONS.map((month, index) => (
                                      <option key={month} value={index + 1}>{month}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    placeholder="Day"
                                    value={editingDiscount.start_day ?? ''}
                                    onChange={(e) => setEditingDiscount({ ...editingDiscount, start_day: e.target.value ? Number(e.target.value) : null })}
                                    className="input-luxury"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="field-label">To</label>
                                <div className="flex gap-2">
                                  <select
                                    value={editingDiscount.end_month ?? ''}
                                    onChange={(e) => setEditingDiscount({ ...editingDiscount, end_month: e.target.value ? Number(e.target.value) : null })}
                                    className="input-luxury"
                                  >
                                    <option value="">Month</option>
                                    {MONTH_OPTIONS.map((month, index) => (
                                      <option key={month} value={index + 1}>{month}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    placeholder="Day"
                                    value={editingDiscount.end_day ?? ''}
                                    onChange={(e) => setEditingDiscount({ ...editingDiscount, end_day: e.target.value ? Number(e.target.value) : null })}
                                    className="input-luxury"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {editingDiscount.schedule_type !== 'once' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="field-label">First Runs From (optional)</label>
                                <input
                                  type="date"
                                  value={editingDiscount.starts_on || ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, starts_on: e.target.value || null })}
                                  className="input-luxury"
                                />
                                <p className="text-xs text-luxury-gray-3 mt-1">Blank means it starts repeating right away.</p>
                              </div>
                              <div>
                                <label className="field-label">Stop Repeating After (optional)</label>
                                <input
                                  type="date"
                                  value={editingDiscount.repeat_until || ''}
                                  onChange={(e) => setEditingDiscount({ ...editingDiscount, repeat_until: e.target.value || null })}
                                  className="input-luxury"
                                />
                                <p className="text-xs text-luxury-gray-3 mt-1">Blank means it repeats until you switch it off.</p>
                              </div>
                            </div>
                          )}

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingDiscount.is_active}
                              onChange={(e) => setEditingDiscount({ ...editingDiscount, is_active: e.target.checked })}
                              className="rounded"
                            />
                            <span className="text-sm text-luxury-gray-2">Switched on</span>
                          </label>

                          {(editingDiscount.fee_type || 'rc_annual') === 'crc_monthly' && (
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={!!editingDiscount.first_invoice_only}
                                onChange={(e) =>
                                  setEditingDiscount({ ...editingDiscount, first_invoice_only: e.target.checked })
                                }
                                className="rounded mt-0.5"
                              />
                              <span className="text-sm text-luxury-gray-2">
                                One invoice per agent
                                <span className="block text-xs text-luxury-gray-3">
                                  Each agent gets this once, then pays full price even while it is still running.
                                  Leave it off to discount every month the promo is on.
                                </span>
                              </span>
                            </label>
                          )}

                          <p className="text-xs text-luxury-gray-3">
                            {(() => {
                              if (!isDiscountActiveOn(editingDiscount)) {
                                return 'Not running today with these settings.'
                              }
                              const feeType = (editingDiscount.fee_type || 'rc_annual') as FeeType
                              const baseFee =
                                feeType === 'crc_onboarding'
                                  ? settings.standard_onboarding_fee
                                  : feeType === 'crc_monthly'
                                    ? settings.standard_monthly_fee
                                    : settings.referral_annual_fee
                              const off =
                                editingDiscount.discount_type === 'percent'
                                  ? (baseFee * editingDiscount.amount) / 100
                                  : editingDiscount.amount
                              const after = Math.max(0, baseFee - off).toFixed(2)
                              return `Running today. ${FEE_TYPE_LABELS[feeType]} would be $${after} instead of $${baseFee}.`
                            })()}
                          </p>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-luxury-gray-5">
                          <button onClick={() => setEditingDiscount(null)} className="btn btn-secondary">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveDiscount(editingDiscount)}
                            disabled={savingDiscount}
                            className="btn btn-primary flex items-center gap-2"
                          >
                            {savingDiscount ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save Discount
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* Coaching */}
            {activeTab === 'coaching' && settings && (
              <div className="space-y-6">
                <div className="container-card p-5">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Zoom Links</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Agent Coaching Link</label>
                      <input
                        type="text"
                        value={settings?.coaching_zoom_link || ''}
                        onChange={e => setSettings({ ...settings!, coaching_zoom_link: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="https://visit.collectiverealtyco.com/training"
                      />
                    </div>
                    <div>
                      <label className="field-label">Coaching Client Link</label>
                      <input
                        type="text"
                        value={settings?.coaching_client_zoom_link || ''}
                        onChange={e => setSettings({ ...settings!, coaching_client_zoom_link: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="https://convert.coachingbrokerage.com/zoom"
                      />
                    </div>
                  </div>
                </div>

                <div className="container-card p-5">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">The Coaching Brokerage</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Brand Name</label>
                      <input
                        type="text"
                        value={settings?.coaching_brokerage_name || ''}
                        onChange={e => setSettings({ ...settings!, coaching_brokerage_name: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="The Coaching Brokerage"
                      />
                    </div>
                    <div>
                      <label className="field-label">Email</label>
                      <input
                        type="email"
                        value={settings?.coaching_brokerage_email || ''}
                        onChange={e => setSettings({ ...settings!, coaching_brokerage_email: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="info@coachingbrokerage.com"
                      />
                    </div>
                    <div>
                      <label className="field-label">Address</label>
                      <input
                        type="text"
                        value={settings?.coaching_brokerage_address || ''}
                        onChange={e => setSettings({ ...settings!, coaching_brokerage_address: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="2300 Valley View Ln, Ste 518, Irving, TX 75062"
                      />
                    </div>
                    <div>
                      <label className="field-label">Website</label>
                      <input
                        type="text"
                        value={settings?.coaching_brokerage_website || ''}
                        onChange={e => setSettings({ ...settings!, coaching_brokerage_website: e.target.value })}
                        className="input-luxury w-full"
                        placeholder="https://coachingbrokerage.com"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Commission Plans */}
            {activeTab === 'plans' && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Commission Plans</h2>
                  <button
                    onClick={() => setEditingPlan({
                      id: '',
                      code: '',
                      name: '',
                      description: '',
                      agent_split_percentage: 85,
                      firm_split_percentage: 15,
                      has_cap: false,
                      cap_amount: null,
                      post_cap_agent_split: null,
                      post_cap_firm_split: null,
                      processing_fee_amount: null,
                      coaching_fee_amount: null,
                      is_active: true,
                      notes: null,
                    })}
                    className="btn btn-primary text-sm flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Add Plan
                  </button>
                </div>

                <div className="space-y-3">
                  {plans.map((plan) => (
                    <div key={plan.id} className={`inner-card ${!plan.is_active ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-luxury-gray-1">{plan.name}</h3>
                            <span className="text-xs text-luxury-gray-3 bg-luxury-gray-6 px-2 py-0.5 rounded">
                              {plan.agent_split_percentage}/{plan.firm_split_percentage}
                            </span>
                            {plan.has_cap && (
                              <span className="text-xs text-luxury-gold bg-luxury-gold/10 px-2 py-0.5 rounded">
                                ${plan.cap_amount?.toLocaleString()} cap
                              </span>
                            )}
                            {!plan.is_active && (
                              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Inactive</span>
                            )}
                          </div>
                          <p className="text-xs text-luxury-gray-3 mt-1">{plan.description}</p>
                          {plan.processing_fee_amount && (
                            <p className="text-xs text-luxury-gray-2 mt-1">
                              Processing Fee: ${plan.processing_fee_amount}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingPlan(plan)}
                            className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => deletePlan(plan.id)}
                            className="p-1.5 text-luxury-gray-3 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Plan Edit Modal */}
                {editingPlan && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                      <h3 className="text-lg font-semibold text-luxury-gray-1 mb-4">
                        {editingPlan.id ? 'Edit Plan' : 'Add Plan'}
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Plan Code</label>
                            <input
                              type="text"
                              value={editingPlan.code}
                              onChange={(e) => setEditingPlan({ ...editingPlan, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                              className="input-luxury"
                              placeholder="e.g. new_agent"
                              disabled={!!editingPlan.id}
                            />
                          </div>
                          <div>
                            <label className="field-label">Plan Name</label>
                            <input
                              type="text"
                              value={editingPlan.name}
                              onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                              className="input-luxury"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="field-label">Description</label>
                          <textarea
                            value={editingPlan.description || ''}
                            onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                            className="input-luxury"
                            rows={2}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Agent Split (%)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editingPlan.agent_split_percentage}
                              onChange={(e) => setEditingPlan({ 
                                ...editingPlan, 
                                agent_split_percentage: Number(e.target.value),
                                firm_split_percentage: 100 - Number(e.target.value)
                              })}
                              className="input-luxury"
                            />
                          </div>
                          <div>
                            <label className="field-label">Firm Split (%)</label>
                            <input
                              type="number"
                              value={editingPlan.firm_split_percentage}
                              className="input-luxury bg-luxury-gray-6"
                              disabled
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="has_cap"
                            checked={editingPlan.has_cap}
                            onChange={(e) => setEditingPlan({ ...editingPlan, has_cap: e.target.checked })}
                            className="rounded"
                          />
                          <label htmlFor="has_cap" className="text-sm text-luxury-gray-2">Has Commission Cap</label>
                        </div>

                        {editingPlan.has_cap && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-6">
                            <div>
                              <label className="field-label">Cap Amount</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                                <input
                                  type="number"
                                  value={editingPlan.cap_amount || ''}
                                  onChange={(e) => setEditingPlan({ ...editingPlan, cap_amount: Number(e.target.value) })}
                                  className="input-luxury pl-7"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="field-label">Post-Cap Agent %</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={editingPlan.post_cap_agent_split || ''}
                                onChange={(e) => setEditingPlan({ 
                                  ...editingPlan, 
                                  post_cap_agent_split: Number(e.target.value),
                                  post_cap_firm_split: 100 - Number(e.target.value)
                                })}
                                className="input-luxury"
                              />
                            </div>
                            <div>
                              <label className="field-label">Post-Cap Firm %</label>
                              <input
                                type="number"
                                value={editingPlan.post_cap_firm_split || ''}
                                className="input-luxury bg-luxury-gray-6"
                                disabled
                              />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Processing Fee</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                              <input
                                type="number"
                                value={editingPlan.processing_fee_amount || ''}
                                onChange={(e) => setEditingPlan({ ...editingPlan, processing_fee_amount: Number(e.target.value) || null })}
                                className="input-luxury pl-7"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="field-label">Coaching Fee</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                              <input
                                type="number"
                                value={editingPlan.coaching_fee_amount || ''}
                                onChange={(e) => setEditingPlan({ ...editingPlan, coaching_fee_amount: Number(e.target.value) || null })}
                                className="input-luxury pl-7"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="field-label">Notes</label>
                          <textarea
                            value={editingPlan.notes || ''}
                            onChange={(e) => setEditingPlan({ ...editingPlan, notes: e.target.value })}
                            className="input-luxury"
                            rows={2}
                            placeholder="Additional notes about this plan"
                          />
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingPlan.is_active}
                              onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                              className="rounded"
                            />
                            <span className="text-sm text-luxury-gray-2">Active</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-luxury-gray-5">
                        <button onClick={() => setEditingPlan(null)} className="btn btn-secondary">
                          Cancel
                        </button>
                        <button onClick={() => savePlan(editingPlan)} disabled={saving} className="btn btn-primary flex items-center gap-2">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          Save Plan
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Processing Fees */}
            {activeTab === 'fees' && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Processing Fees</h2>
                  <p className="text-xs text-luxury-gray-3">Edit-only. Toggle on/off to deactivate.</p>
                </div>

                <div className="space-y-3">
                  {processingFees.map((fee) => (
                    <div key={fee.id} className={`inner-card ${!fee.is_active ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-luxury-gray-1">{fee.name}</h3>
                            <span className="text-xs text-luxury-gray-3 bg-luxury-gray-5/40 px-2 py-0.5 rounded font-mono">
                              {fee.code}
                            </span>
                            {fee.is_lease && (
                              <span className="text-xs text-luxury-gray-2 bg-luxury-gray-5/40 px-2 py-0.5 rounded">Lease</span>
                            )}
                            {!fee.is_active && (
                              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">Inactive</span>
                            )}
                          </div>
                          <p className="text-xs text-luxury-gray-2 mt-1">
                            ${fee.processing_fee} · {fee.fee_type || 'flat'}
                            {fee.display_order != null && ` · order ${fee.display_order}`}
                            {fee.counts_toward_cap && ' · counts toward cap'}
                            {fee.counts_toward_upgrade && ' · counts toward upgrade'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleProcessingFeeActive(fee)}
                            disabled={savingFee}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              fee.is_active
                                ? 'border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-gray-5/40'
                                : 'border-green-300 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {fee.is_active ? 'Turn off' : 'Turn on'}
                          </button>
                          <button
                            onClick={() => setEditingFee({ ...fee })}
                            className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {processingFees.length === 0 && (
                    <p className="text-xs text-luxury-gray-3 text-center py-6">No processing fees configured.</p>
                  )}
                </div>

                {/* Edit modal */}
                {editingFee && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
                      <h3 className="section-title mb-4">Edit Processing Fee</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="field-label">Name</label>
                          <input
                            type="text"
                            value={editingFee.name || ''}
                            onChange={(e) => setEditingFee({ ...editingFee, name: e.target.value })}
                            className="input-luxury w-full text-xs"
                          />
                        </div>
                        <div>
                          <label className="field-label">Code</label>
                          <input
                            type="text"
                            value={editingFee.code || ''}
                            onChange={(e) => setEditingFee({ ...editingFee, code: e.target.value })}
                            className="input-luxury w-full text-xs font-mono"
                          />
                          <p className="text-[10px] text-luxury-gray-3 mt-0.5">Used to match transaction_type. Change with caution.</p>
                        </div>
                        <div>
                          <label className="field-label">Processing Fee ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingFee.processing_fee ?? ''}
                            onChange={(e) => setEditingFee({ ...editingFee, processing_fee: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            className="input-luxury w-full text-xs"
                          />
                        </div>
                        <div>
                          <label className="field-label">Fee Type</label>
                          <select
                            value={editingFee.fee_type || 'flat'}
                            onChange={(e) => setEditingFee({ ...editingFee, fee_type: e.target.value })}
                            className="select-luxury w-full text-xs"
                          >
                            <option value="flat">Flat</option>
                            <option value="percentage">Percentage</option>
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Display Order</label>
                          <input
                            type="number"
                            value={editingFee.display_order ?? ''}
                            onChange={(e) => setEditingFee({ ...editingFee, display_order: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            className="input-luxury w-full text-xs"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                          <input
                            type="checkbox"
                            checked={!!editingFee.is_lease}
                            onChange={(e) => setEditingFee({ ...editingFee, is_lease: e.target.checked })}
                          />
                          Is lease transaction
                        </label>
                        <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                          <input
                            type="checkbox"
                            checked={!!editingFee.counts_toward_cap}
                            onChange={(e) => setEditingFee({ ...editingFee, counts_toward_cap: e.target.checked })}
                          />
                          Counts toward cap
                        </label>
                        <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                          <input
                            type="checkbox"
                            checked={!!editingFee.counts_toward_upgrade}
                            onChange={(e) => setEditingFee({ ...editingFee, counts_toward_upgrade: e.target.checked })}
                          />
                          Counts toward upgrade
                        </label>
                        <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
                          <input
                            type="checkbox"
                            checked={!!editingFee.is_active}
                            onChange={(e) => setEditingFee({ ...editingFee, is_active: e.target.checked })}
                          />
                          Active
                        </label>
                      </div>
                      <div className="flex justify-end gap-2 mt-5">
                        <button
                          onClick={() => setEditingFee(null)}
                          disabled={savingFee}
                          className="btn btn-secondary text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveProcessingFee(editingFee)}
                          disabled={savingFee}
                          className="btn btn-primary text-xs"
                        >
                          {savingFee ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Commission Rules */}
            {activeTab === 'rules' && (
              <div className="container-card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="section-title">Commission Rules</h2>
                  <button
                    onClick={() => setEditingRule({
                      id: '',
                      rule_key: '',
                      rule_name: '',
                      description: '',
                      agent_split: null,
                      brokerage_split: null,
                      minimum_percent: null,
                      minimum_description: null,
                      is_active: true,
                    })}
                    className="btn btn-primary text-sm flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Add Rule
                  </button>
                </div>

                <div className="space-y-3">
                  {rules.map((rule) => (
                    <div key={rule.id} className={`inner-card ${!rule.is_active ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-luxury-gray-1">{rule.rule_name}</h3>
                            {rule.agent_split && (
                              <span className="text-xs text-luxury-gray-3 bg-luxury-gray-6 px-2 py-0.5 rounded">
                                {rule.agent_split}/{rule.brokerage_split}
                              </span>
                            )}
                            {rule.minimum_percent && (
                              <span className="text-xs text-luxury-gold bg-luxury-gold/10 px-2 py-0.5 rounded">
                                Min: {rule.minimum_percent}%
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-luxury-gray-3 mt-1">{rule.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingRule(rule)}
                            className="p-1.5 text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rule Edit Modal */}
                {editingRule && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                      <h3 className="text-lg font-semibold text-luxury-gray-1 mb-4">
                        {editingRule.id ? 'Edit Rule' : 'Add Rule'}
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Rule Key</label>
                            <input
                              type="text"
                              value={editingRule.rule_key}
                              onChange={(e) => setEditingRule({ ...editingRule, rule_key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                              className="input-luxury"
                              disabled={!!editingRule.id}
                            />
                          </div>
                          <div>
                            <label className="field-label">Rule Name</label>
                            <input
                              type="text"
                              value={editingRule.rule_name}
                              onChange={(e) => setEditingRule({ ...editingRule, rule_name: e.target.value })}
                              className="input-luxury"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="field-label">Description</label>
                          <textarea
                            value={editingRule.description}
                            onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                            className="input-luxury"
                            rows={2}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Agent Split (optional)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editingRule.agent_split || ''}
                              onChange={(e) => setEditingRule({ 
                                ...editingRule, 
                                agent_split: e.target.value ? Number(e.target.value) : null,
                                brokerage_split: e.target.value ? 100 - Number(e.target.value) : null
                              })}
                              className="input-luxury"
                            />
                          </div>
                          <div>
                            <label className="field-label">Minimum % (optional)</label>
                            <input
                              type="number"
                              value={editingRule.minimum_percent || ''}
                              onChange={(e) => setEditingRule({ ...editingRule, minimum_percent: e.target.value ? Number(e.target.value) : null })}
                              className="input-luxury"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="field-label">Minimum Description</label>
                          <input
                            type="text"
                            value={editingRule.minimum_description || ''}
                            onChange={(e) => setEditingRule({ ...editingRule, minimum_description: e.target.value })}
                            className="input-luxury"
                            placeholder="e.g. 3% of sales price"
                          />
                        </div>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingRule.is_active}
                            onChange={(e) => setEditingRule({ ...editingRule, is_active: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-sm text-luxury-gray-2">Active</span>
                        </label>
                      </div>

                      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-luxury-gray-5">
                        <button onClick={() => setEditingRule(null)} className="btn btn-secondary">
                          Cancel
                        </button>
                        <button onClick={() => saveRule(editingRule)} disabled={saving} className="btn btn-primary flex items-center gap-2">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          Save Rule
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'bills' && (
              <RecurringBillsSettings canManage={hasPermission('can_manage_recurring_bills')} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}




