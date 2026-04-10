'use client'

import { useState, useEffect } from 'react'
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
  X
} from 'lucide-react'

type Tab = 'brokerage' | 'standard' | 'referral' | 'plans' | 'rules'

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
  // Standard Agent
  standard_onboarding_fee: number
  standard_monthly_fee: number
  standard_late_fee: number
  board_requirement_days: number
  termination_notice_days: number
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

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'brokerage', label: 'Brokerage', icon: Building2 },
  { id: 'standard', label: 'Standard Agent', icon: Users },
  { id: 'referral', label: 'Referral Agent', icon: Users },
  { id: 'plans', label: 'Commission Plans', icon: DollarSign },
  { id: 'rules', label: 'Commission Rules', icon: Settings2 },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('brokerage')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [plans, setPlans] = useState<CommissionPlan[]>([])
  const [rules, setRules] = useState<CommissionRule[]>([])
  
  const [editingPlan, setEditingPlan] = useState<CommissionPlan | null>(null)
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

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
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded mb-4 flex items-center gap-2">
            <Check size={16} />
            {success}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="container-card p-2">
              {TABS.map((tab) => {
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

                  {/* CRC Agent Conversion Promotion */}
                  <div className="inner-card">
                    <h3 className="text-sm font-semibold text-luxury-gray-1 mb-4">CRC Agent Conversion Promotion</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="field-label">Discount Amount ($)</label>
                        <input
                          type="number"
                          min="0"
                          max="299"
                          value={settings.referral_conversion_discount || 0}
                          onChange={(e) => updateSetting('referral_conversion_discount', parseInt(e.target.value) || 0)}
                          className="input-luxury"
                          placeholder="0"
                        />
                        <p className="text-xs text-luxury-gray-3 mt-1">
                          Amount to discount from $299 fee. Set to 299 for free conversion.
                        </p>
                      </div>
                      <div>
                        <label className="field-label">Promotion Ends</label>
                        <input
                          type="date"
                          value={settings.referral_conversion_free_until ? settings.referral_conversion_free_until.split('T')[0] : ''}
                          onChange={(e) => updateSetting('referral_conversion_free_until', e.target.value ? `${e.target.value}T23:59:59` : null)}
                          className="input-luxury"
                        />
                        <p className="text-xs text-luxury-gray-3 mt-1">
                          Leave blank to disable promotion.
                        </p>
                      </div>
                    </div>
                    {settings.referral_conversion_free_until && new Date(settings.referral_conversion_free_until) > new Date() && settings.referral_conversion_discount > 0 && (
                      <p className="text-xs text-green-600 mt-3 font-medium">
                        ✓ Promotion active: ${settings.referral_conversion_discount} off (pay ${299 - settings.referral_conversion_discount}) until {new Date(settings.referral_conversion_free_until).toLocaleDateString()}
                      </p>
                    )}
                    {settings.referral_conversion_free_until && new Date(settings.referral_conversion_free_until) <= new Date() && (
                      <p className="text-xs text-luxury-gray-3 mt-3">
                        Promotion ended {new Date(settings.referral_conversion_free_until).toLocaleDateString()}
                      </p>
                    )}
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
                        <div className="grid grid-cols-2 gap-4">
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

                        <div className="grid grid-cols-2 gap-4">
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
                          <div className="grid grid-cols-3 gap-4 pl-6">
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

                        <div className="grid grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-2 gap-4">
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

                        <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>
      </div>
    </div>
  )
}
