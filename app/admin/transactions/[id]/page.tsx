'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  ArrowLeft, 
  Edit2, 
  ExternalLink, 
  Users, 
  DollarSign, 
  FileText, 
  Plus,
  X,
  Check,
  ChevronDown,
  Calculator,
  AlertCircle
} from 'lucide-react'

// ============ INTERFACES ============

interface Transaction {
  id: string
  created_at: string
  updated_at: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  representation_type: string | null
  mls_type: string | null
  mls_number: string | null
  mls_link: string | null
  listing_date: string | null
  acceptance_date: string | null
  closing_date: string | null
  closed_date: string | null
  sales_price: number | null
  sales_volume: number | null
  lease_term: number | null
  gross_commission: number | null
  gross_commission_type: 'percent' | 'amount'
  listing_side_commission: number | null
  listing_side_commission_type: 'percent' | 'amount'
  buying_side_commission: number | null
  buying_side_commission_type: 'percent' | 'amount'
  office_gross: number | null
  office_net: number | null
  lead_source: string | null
  status: string
  compliance_status: string
  cda_status: string
  funding_status: string
  team_agreement_id: string | null
  notes: any
}

interface TransactionAgent {
  id: string
  transaction_id: string
  agent_id: string
  agent_role: string
  commission_plan: string | null
  commission_plan_id: string | null
  processing_fee_type_id: string | null
  agent_basis: number | null
  agent_basis_type: 'percent' | 'amount'
  pre_split_deductions: number | null
  pre_split_deductions_type: 'percent' | 'amount'
  pre_split_deductions_description: string | null
  split_percentage: number | null
  split_percentage_type: 'percent' | 'amount'
  agent_gross: number | null
  processing_fee: number | null
  processing_fee_type: 'percent' | 'amount'
  coaching_fee: number | null
  coaching_fee_type: 'percent' | 'amount'
  other_fees: number | null
  other_fees_type: 'percent' | 'amount'
  other_fees_description: string | null
  rebate_amount: number | null
  rebate_amount_type: 'percent' | 'amount'
  btsa_amount: number | null
  btsa_amount_type: 'percent' | 'amount'
  agent_net: number | null
  team_lead_commission: number | null
  payment_status: string
  payment_date: string | null
  sales_volume: number | null
  units: number | null
  agent_name?: string
  agent_email?: string
}

interface TransactionContact {
  id: string
  transaction_id: string
  contact_type: string
  contact_type_other: string | null
  name: string | null
  phone: string[] | null
  email: string[] | null
  company: string | null
  notes: string | null
}

interface ExternalBrokerage {
  id: string
  created_at: string
  updated_at: string
  transaction_id: string
  brokerage_role: string | null
  brokerage_role_other: string | null
  brokerage_name: string | null
  brokerage_dba: string | null
  brokerage_ein: string | null
  brokerage_address: string | null
  brokerage_city: string | null
  brokerage_state: string | null
  brokerage_zip: string | null
  broker_name: string | null
  broker_phone: string | null
  broker_email: string | null
  agent_name: string | null
  agent_phone: string | null
  agent_email: string | null
  commission_amount: number | null
  amount_1099_reportable: number | null
  payment_status: string
  payment_date: string | null
  payment_method: string | null
  payment_reference: string | null
  w9_on_file: boolean
  w9_date_received: string | null
  federal_id_type: string | null
  federal_id_number: string | null
  notes: string | null
}

interface CommissionPlan {
  id: string
  name: string
  code: string | null
  agent_split_percentage: number
  firm_split_percentage: number
  has_cap: boolean
  cap_amount: number | null
  post_cap_agent_split: number | null
  processing_fee_amount: number | null
}

interface ProcessingFeeType {
  id: string
  name: string
  code: string
  processing_fee: number
  is_active: boolean
  display_order: number | null
}

interface TeamMember {
  id: string
  team_agreement_id: string
  agent_id: string
  is_team_lead: boolean
  active_sales_plan: string | null
  active_lease_plan: string | null
  splits: any
  joined_date: string | null
  left_date: string | null
}

interface TeamAgreement {
  id: string
  team_name: string
  team_lead_id: string
  status: string
}

interface TransactionFlyer {
  id: string
  created_at: string
  updated_at: string
  transaction_id: string
  flyer_type: 'just_listed' | 'under_contract' | 'just_sold'
  status: 'requested' | 'in_progress' | 'sent'
  requested_by: string | null
  sent_date: string | null
  notes: string | null
  requested_by_name?: string
}

// ============ CONSTANTS ============

const LEAD_SOURCE_OPTIONS = [
  { value: 'brokerage_referral', label: 'Brokerage Referral' },
  { value: 'team_lead_referral', label: 'Team Lead Referral' },
  { value: 'internal_agent_referral', label: 'Internal Agent Referral' },
  { value: 'external_agent_referral', label: 'External Agent Referral' },
  { value: 'repeat_client', label: 'Repeat Client' },
  { value: 'friend_family', label: 'Friend/Family' },
  { value: 'personal_referral', label: 'Personal Referral' },
  { value: 'ig_lead', label: 'IG Lead' },
  { value: 'kvcore_lead', label: 'kvCORE Lead' },
  { value: 'har_lead', label: 'HAR Lead' },
  { value: 'ntreis_lead', label: 'NTREIS Lead' },
  { value: 'other_social_media_lead', label: 'Other Social Media Lead' },
  { value: 'other_listing_service_lead', label: 'Other Listing Service Lead' },
  { value: 'facebook_lead', label: 'Facebook Lead' },
  { value: 'client_referral', label: 'Client Referral' },
  { value: 'other', label: 'Other' },
]

const REPRESENTATION_TYPE_OPTIONS_SALE = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'buyer_and_seller', label: 'Buyer and Seller' },
]

const REPRESENTATION_TYPE_OPTIONS_LEASE = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'tenant_and_landlord', label: 'Tenant and Landlord' },
]

const ALL_REPRESENTATION_OPTIONS = [
  ...REPRESENTATION_TYPE_OPTIONS_SALE,
  ...REPRESENTATION_TYPE_OPTIONS_LEASE,
]

const AGENT_ROLE_OPTIONS = [
  { value: 'listing_agent', label: 'Listing Agent' },
  { value: 'co_listing_agent', label: 'Co-Listing Agent' },
  { value: 'buyers_agent', label: "Buyer's Agent" },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'referral_agent', label: 'Referral Agent' },
  { value: 'revenue_share', label: 'Revenue Share Agent' },
]

// Roles that should NOT show processing fee question when adding
const ROLES_WITHOUT_PROCESSING_FEE = ['team_lead', 'referral_agent', 'revenue_share']

// External brokerage types
const EXTERNAL_BROKERAGE_TYPES = [
  { value: 'coop_broker', label: 'Co-op Broker' },
  { value: 'referral_broker', label: 'Referral Broker' },
  { value: 'other', label: 'Other' },
]

const FLYER_TYPE_OPTIONS = [
  { value: 'just_listed', label: 'Just Listed' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'just_sold', label: 'Just Sold/Leased' },
]

const FLYER_STATUS_OPTIONS = [
  { value: 'requested', label: 'Requested' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'sent', label: 'Sent' },
]

// ============ FORMAT HELPERS ============

const formatPhone = (phone: string | null): string => {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '--'
  return new Date(dateString).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  })
}

const toTitleCase = (str: string | null): string => {
  if (!str) return ''
  return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
}

const formatAddress = (address: string): { street: string, cityStateZip: string, full: string } => {
  const parts = address.split(',').map(p => p.trim())
  const street = toTitleCase(parts[0] || '')
  const cityStateZip = parts.slice(1).map(p => {
    return p.split(' ').map(word => {
      if (word.length === 2 && word === word.toUpperCase()) return word
      if (/^\d+$/.test(word)) return word
      return toTitleCase(word)
    }).join(' ')
  }).join(', ')
  return { street, cityStateZip, full: `${street}, ${cityStateZip}` }
}

const formatRole = (role: string): string => {
  if (!role) return ''
  return role.replace(/_/g, ' ').split(' ').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ')
}

const formatStatus = (status: string): string => {
  if (!status) return 'Unknown'
  return status.replace(/_/g, ' ').split(' ').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ')
}

// Map lead source to team split type
const getLeadSourceType = (leadSource: string | null): 'own' | 'firm' | 'team_lead' => {
  if (!leadSource) return 'own'
  if (leadSource === 'team_lead_referral') return 'team_lead'
  if (leadSource === 'brokerage_referral') return 'firm'
  return 'own'
}

// Map commission plan name to splits key
const getPlanKey = (planName: string | null): string => {
  if (!planName) return 'no_cap'
  const lower = planName.toLowerCase()
  if (lower.includes('new agent') || lower.includes('70/30 new') || lower.includes('70_30_new')) return 'new_agent'
  if (lower.includes('cap') && !lower.includes('no cap')) return 'cap'
  if (lower.includes('no cap') || lower.includes('85/15')) return 'no_cap'
  return 'standard'
}

// ============ EDITABLE FIELD WITH TOGGLE ($/%) ============

function EditableFieldWithToggle({ 
  label, 
  value, 
  valueType,
  onSave, 
  placeholder = '--',
  disabled = false,
  highlight = false,
  baseAmount
}: { 
  label: string
  value: number | null
  valueType: 'percent' | 'amount'
  onSave: (value: string, type: 'percent' | 'amount') => void
  placeholder?: string
  disabled?: boolean
  highlight?: boolean
  baseAmount?: number | null // Used to show calculated value when in percent mode
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.toString() || '')
  const [editType, setEditType] = useState<'percent' | 'amount'>(valueType || 'amount')

  const handleSave = () => {
    onSave(editValue, editType)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value?.toString() || '')
    setEditType(valueType || 'amount')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  const toggleType = () => {
    setEditType(editType === 'percent' ? 'amount' : 'percent')
  }

  const displayValue = () => {
    if (value === null || value === undefined || value === 0) return placeholder
    if (valueType === 'percent') {
      const calculated = baseAmount ? (baseAmount * value / 100) : null
      return `${value}%${calculated ? ` (${formatCurrency(calculated)})` : ''}`
    }
    return formatCurrency(value)
  }

  if (disabled) {
    return (
      <div>
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        <p className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{displayValue()}</p>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="overflow-hidden">
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleType}
            className={`px-2 py-1 text-xs font-medium rounded-l border flex-shrink-0 ${
              editType === 'amount' 
                ? 'bg-gray-900 text-white border-gray-900' 
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            $
          </button>
          <button
            type="button"
            onClick={toggleType}
            className={`px-2 py-1 text-xs font-medium rounded-r border-t border-b border-r flex-shrink-0 ${
              editType === 'percent' 
                ? 'bg-gray-900 text-white border-gray-900' 
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            %
          </button>
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-black ml-1 min-w-0"
            step={editType === 'percent' ? '0.1' : '0.01'}
            autoFocus
          />
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleSave(); }} 
            className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
          >
            <Check size={16} className="text-gray-700" />
          </button>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCancel(); }} 
            className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        {editType === 'percent' && baseAmount && editValue && (
          <p className="text-xs text-gray-400 mt-1">
            = {formatCurrency(baseAmount * parseFloat(editValue) / 100)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div 
      className="group cursor-pointer"
      onClick={() => {
        setEditValue(value?.toString() || '')
        setEditType(valueType || 'amount')
        setIsEditing(true)
      }}
    >
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2">
        <p className={`text-sm ${highlight ? 'font-semibold text-gray-900' : ''}`}>{displayValue()}</p>
        <Edit2 size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

// ============ EDITABLE FIELD COMPONENT ============

function EditableField({ 
  label, 
  value, 
  onSave, 
  type = 'text',
  options = [],
  placeholder = '--',
  suffix,
  disabled = false,
  highlight = false
}: { 
  label: string
  value: string | number | null
  onSave: (value: string) => void
  type?: 'text' | 'date' | 'number' | 'select' | 'currency' | 'phone' | 'percent'
  options?: { value: string, label: string }[]
  placeholder?: string
  suffix?: string
  disabled?: boolean
  highlight?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.toString() || '')

  const handleSave = () => {
    onSave(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value?.toString() || '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  const displayValue = () => {
    if (value === null || value === undefined || value === '') return placeholder
    if (type === 'currency') return formatCurrency(Number(value))
    if (type === 'percent') return `${value}%`
    if (type === 'phone') return formatPhone(value?.toString())
    if (type === 'date' && value) return formatDate(value.toString())
    if (type === 'select' && options.length) {
      const option = options.find(o => o.value === value)
      return option?.label || formatStatus(value.toString())
    }
    let display = value.toString()
    if (suffix) display += ` ${suffix}`
    return display
  }

  if (disabled) {
    return (
      <div>
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        <p className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{displayValue()}</p>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div>
        {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
        <div className="flex items-center gap-2">
          {type === 'select' ? (
            <select
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value)
                onSave(e.target.value)
                setIsEditing(false)
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setIsEditing(false)}
              className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-black"
              autoFocus
            >
              <option value="">Select...</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={type === 'currency' || type === 'number' || type === 'percent' ? 'number' : type === 'phone' ? 'tel' : type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-black"
              step={type === 'currency' ? '0.01' : type === 'percent' ? '0.1' : undefined}
              autoFocus
            />
          )}
          <button onClick={handleSave} className="p-1 hover:bg-gray-200 rounded">
            <Check size={16} className="text-gray-700" />
          </button>
          <button onClick={handleCancel} className="p-1 hover:bg-gray-200 rounded">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="group cursor-pointer"
      onClick={() => {
        setEditValue(value?.toString() || '')
        setIsEditing(true)
      }}
    >
      {label && <p className="text-xs text-gray-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2">
        <p className={`text-sm ${highlight ? 'font-semibold text-gray-900' : ''}`}>{displayValue()}</p>
        <Edit2 size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

// ============ MULTI-VALUE FIELD (Phone/Email Arrays) ============

function MultiValueField({
  label,
  values,
  onSave,
  type = 'text',
  placeholder = 'Add...'
}: {
  label: string
  values: string[] | null
  onSave: (values: string[]) => void
  type?: 'phone' | 'email' | 'text'
  placeholder?: string
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const currentValues = values || []

  const handleAdd = () => {
    if (newValue.trim()) {
      const formatted = type === 'phone' ? newValue.replace(/\D/g, '') : newValue.trim()
      onSave([...currentValues, formatted])
      setNewValue('')
      setIsAdding(false)
    }
  }

  const handleEdit = (index: number) => {
    onSave(currentValues.map((v, i) => i === index ? editValue : v))
    setEditingIndex(null)
    setEditValue('')
  }

  const handleRemove = (index: number) => {
    onSave(currentValues.filter((_, i) => i !== index))
  }

  const displayFormat = (val: string) => {
    if (type === 'phone') return formatPhone(val)
    return val
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="space-y-1">
        {currentValues.map((val, index) => (
          <div key={index} className="flex items-center gap-2 group">
            {editingIndex === index ? (
              <>
                <input
                  type={type === 'phone' ? 'tel' : type === 'email' ? 'email' : 'text'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEdit(index)
                    if (e.key === 'Escape') { setEditingIndex(null); setEditValue('') }
                  }}
                  className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-black"
                  autoFocus
                />
                <button onClick={() => handleEdit(index)} className="p-1 hover:bg-gray-200 rounded">
                  <Check size={14} className="text-gray-700" />
                </button>
                <button onClick={() => { setEditingIndex(null); setEditValue('') }} className="p-1 hover:bg-gray-200 rounded">
                  <X size={14} className="text-gray-400" />
                </button>
              </>
            ) : (
              <>
                <span 
                  className="text-sm cursor-pointer hover:text-black"
                  onClick={() => { setEditingIndex(index); setEditValue(val) }}
                >
                  {displayFormat(val)}
                </span>
                <button 
                  onClick={() => handleRemove(index)}
                  className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} className="text-gray-400" />
                </button>
              </>
            )}
          </div>
        ))}
        
        {isAdding ? (
          <div className="flex items-center gap-2">
            <input
              type={type === 'phone' ? 'tel' : type === 'email' ? 'email' : 'text'}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setIsAdding(false); setNewValue('') }
              }}
              placeholder={type === 'phone' ? '000-000-0000' : type === 'email' ? 'email@example.com' : placeholder}
              className="text-sm border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-black"
              autoFocus
            />
            <button onClick={handleAdd} className="p-1 hover:bg-gray-200 rounded">
              <Check size={14} className="text-gray-700" />
            </button>
            <button onClick={() => { setIsAdding(false); setNewValue('') }} className="p-1 hover:bg-gray-200 rounded">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setIsAdding(true)}
            className="text-xs text-gray-500 hover:text-black"
          >
            + Add {type === 'phone' ? 'phone' : type === 'email' ? 'email' : 'another'}
          </button>
        )}
      </div>
    </div>
  )
}

// ============ STATUS BADGE COMPONENT ============

function StatusBadge({ 
  status, 
  onSave,
  options
}: { 
  status: string
  onSave: (value: string) => void
  options: { value: string, label: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  const getColor = () => {
    const s = status?.toLowerCase().replace(/_/g, '')
    if (['active', 'approved', 'paid', 'cleared', 'senttotitle'].includes(s)) return 'bg-green-100 text-green-800'
    if (['pending', 'submitted', 'pendingcompliance', 'pendingbrokerapproval', 'pendingagentresponse', 'funded'].includes(s)) return 'bg-yellow-100 text-yellow-800'
    if (['needsrevision', 'partial'].includes(s)) return 'bg-orange-100 text-orange-800'
    if (['cancelled', 'withdrawn', 'terminated', 'expired'].includes(s)) return 'bg-red-100 text-red-800'
    if (['closed', 'sold'].includes(s)) return 'bg-blue-100 text-blue-800'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${getColor()} hover:opacity-80 transition-opacity`}
      >
        {formatStatus(status)}
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 min-w-[160px] py-1 max-h-60 overflow-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  onSave(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  opt.value === status ? 'bg-gray-50 font-medium' : ''
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============ MAIN PAGE COMPONENT ============

export default function TransactionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const transactionId = params?.id as string

  // Get initial tab from URL or default to 'overview'
  const tabFromUrl = searchParams.get('tab') as 'overview' | 'commissions' | 'flyers' | 'contacts' | 'documents' | null
  const validTabs = ['overview', 'commissions', 'flyers', 'contacts', 'documents']
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'overview'

  const [user, setUser] = useState<any>(null)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [agents, setAgents] = useState<TransactionAgent[]>([])
  const [contacts, setContacts] = useState<TransactionContact[]>([])
  const [externalBrokerages, setExternalBrokerages] = useState<ExternalBrokerage[]>([])
  const [commissionPlans, setCommissionPlans] = useState<CommissionPlan[]>([])
  const [processingFeeTypes, setProcessingFeeTypes] = useState<ProcessingFeeType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<'overview' | 'commissions' | 'flyers' | 'contacts' | 'documents'>(initialTab)
  const [selectedAgent, setSelectedAgent] = useState<TransactionAgent | null>(null)
  const [selectedExternalBrokerage, setSelectedExternalBrokerage] = useState<ExternalBrokerage | null>(null)
  const [teamInfo, setTeamInfo] = useState<{ agreement: TeamAgreement | null, members: TeamMember[] }>({ agreement: null, members: [] })
  const [flyers, setFlyers] = useState<TransactionFlyer[]>([])
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [showAddExternalModal, setShowAddExternalModal] = useState(false)
  const [availableAgents, setAvailableAgents] = useState<any[]>([])
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [selectedNewAgent, setSelectedNewAgent] = useState<any | null>(null)
  const [selectedNewRole, setSelectedNewRole] = useState<string>('')
  const [selectedProcessingFeeType, setSelectedProcessingFeeType] = useState<string>('')
  const [addingAgent, setAddingAgent] = useState(false)
  const [addingExternalBrokerage, setAddingExternalBrokerage] = useState(false)
  const [existingBrokerages, setExistingBrokerages] = useState<ExternalBrokerage[]>([])
  const [brokerageSearchQuery, setBrokerageSearchQuery] = useState('')
  const [selectedExistingBrokerage, setSelectedExistingBrokerage] = useState<ExternalBrokerage | null>(null)
  const [newBrokerageForm, setNewBrokerageForm] = useState<Partial<ExternalBrokerage>>({})
  const [mounted, setMounted] = useState(false)

  // Set mounted on client
  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle tab change - update URL and state
  const handleTabChange = (tab: 'overview' | 'commissions' | 'flyers' | 'contacts' | 'documents') => {
    setActiveSection(tab)
    // Update URL without full page reload
    const newUrl = tab === 'overview' 
      ? `/admin/transactions/${transactionId}`
      : `/admin/transactions/${transactionId}?tab=${tab}`
    window.history.replaceState({}, '', newUrl)
  }

  // Options for dropdowns
  const statusOptions = [
    { value: 'pre-listing', label: 'Pre-Listing' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'sold', label: 'Sold' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'withdrawn', label: 'Withdrawn' },
    { value: 'expired', label: 'Expired' },
  ]

  const complianceOptions = [
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'needs_revision', label: 'Needs Revision' },
    { value: 'approved', label: 'Approved' },
  ]

  const cdaOptions = [
    { value: 'no_cda', label: 'No CDA' },
    { value: 'pending_compliance', label: 'Pending Compliance' },
    { value: 'pending_broker_approval', label: 'Pending Broker Approval' },
    { value: 'pending_agent_response', label: 'Pending Agent Response' },
    { value: 'sent_to_title', label: 'Sent to Title' },
  ]

  const fundingOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'funded', label: 'Funded' },
    { value: 'cleared', label: 'Cleared' },
  ]

  const transactionTypeOptions = [
    { value: 'sale', label: 'Sale' },
    { value: 'lease', label: 'Lease' },
  ]

  const paymentStatusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'partial', label: 'Partial' },
    { value: 'offset', label: 'Offset' },
  ]

  // Calculate agent values
  const calculateAgentValues = useCallback((agent: TransactionAgent, teamMember?: TeamMember, leadSource?: string, transactionType?: string, sideGross?: number) => {
    // If agent is on a team and we have team splits, use those
    if (teamMember && teamMember.splits && sideGross) {
      const txnType = transactionType === 'lease' ? 'lease' : 'sales'
      const planKey = txnType === 'lease' 
        ? (teamMember.active_lease_plan || 'standard')
        : (teamMember.active_sales_plan || 'no_cap')
      const leadType = getLeadSourceType(leadSource || null)
      
      try {
        const splits = teamMember.splits[txnType]?.[planKey]?.[leadType]
        if (splits) {
          const agentPct = splits.agent || 0
          const teamLeadPct = splits.team_lead || 0
          const firmPct = splits.firm || 0
          
          const agentGross = sideGross * (agentPct / 100)
          const teamLeadAmount = sideGross * (teamLeadPct / 100)
          
          const processingFee = agent.processing_fee || 0
          const coachingFee = agent.coaching_fee || 0
          const otherFees = agent.other_fees || 0
          const rebate = agent.rebate_amount || 0
          const btsa = agent.btsa_amount || 0
          
          const postSplitDeductions = processingFee + coachingFee + otherFees + rebate
          const agentNet = agentGross - postSplitDeductions + btsa
          
          return {
            agentGross,
            agentNet,
            teamLeadAmount,
            firmAmount: sideGross * (firmPct / 100),
            splitPercentage: agentPct
          }
        }
      } catch (e) {
        console.error('Error calculating team splits:', e)
      }
    }
    
    // Standard calculation (non-team)
    // Use sideGross if provided, otherwise fall back to agent.agent_basis
    const basis = sideGross !== undefined ? sideGross : (agent.agent_basis || 0)
    const preSplit = agent.pre_split_deductions || 0
    const splitPct = agent.split_percentage || 0
    
    const adjustedBasis = basis - preSplit
    const agentGross = adjustedBasis * (splitPct / 100)
    
    const processingFee = agent.processing_fee || 0
    const coachingFee = agent.coaching_fee || 0
    const otherFees = agent.other_fees || 0
    const rebate = agent.rebate_amount || 0
    const btsa = agent.btsa_amount || 0
    
    const postSplitDeductions = processingFee + coachingFee + otherFees + rebate
    const agentNet = agentGross - postSplitDeductions + btsa
    
    return {
      agentGross,
      agentNet,
      teamLeadAmount: 0,
      firmAmount: adjustedBasis * ((100 - splitPct) / 100),
      splitPercentage: splitPct
    }
  }, [])

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      if (userData.role !== 'Admin') {
        router.push('/auth/login')
        return
      }
      setUser(userData)
      if (transactionId) {
        loadData()
      }
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router, transactionId])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load commission plans
      const { data: plansData } = await supabase
        .from('commission_plans')
        .select('*')
        .eq('is_active', true)
        .order('name')
      
      if (plansData) setCommissionPlans(plansData)

      // Load processing fee types
      const { data: feeTypesData } = await supabase
        .from('processing_fee_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      
      if (feeTypesData) setProcessingFeeTypes(feeTypesData)

      // Load transaction
      const { data: txnData, error: txnError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single()

      if (txnError) throw txnError
      setTransaction(txnData)

      // Load team info if transaction has team_agreement_id
      if (txnData.team_agreement_id) {
        const { data: agreementData } = await supabase
          .from('team_agreements')
          .select('*')
          .eq('id', txnData.team_agreement_id)
          .single()
        
        const { data: membersData } = await supabase
          .from('team_members')
          .select('*')
          .eq('team_agreement_id', txnData.team_agreement_id)
        
        setTeamInfo({
          agreement: agreementData || null,
          members: membersData || []
        })
      }

      // Load agents
      const { data: agentsData, error: agentsError } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('transaction_id', transactionId)

      if (!agentsError && agentsData) {
        const agentIds = agentsData.map(a => a.agent_id).filter(Boolean)
        let usersData: any[] = []
        
        if (agentIds.length > 0) {
          const { data } = await supabase
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email')
            .in('id', agentIds)
          usersData = data || []
        }

        const agentsWithNames = agentsData.map(agent => {
          const user = usersData.find(u => u.id === agent.agent_id)
          return {
            ...agent,
            agent_name: user 
              ? (user.preferred_first_name && user.preferred_last_name
                  ? `${user.preferred_first_name} ${user.preferred_last_name}`
                  : `${user.first_name} ${user.last_name}`)
              : 'Unknown Agent',
            agent_email: user?.email || ''
          }
        })
        setAgents(agentsWithNames)
        if (agentsWithNames.length > 0) {
          setSelectedAgent(agentsWithNames[0])
        }
      }

      // Load contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('transaction_contacts')
        .select('*')
        .eq('transaction_id', transactionId)

      if (!contactsError && contactsData) {
        const parsedContacts = contactsData.map(c => ({
          ...c,
          phone: Array.isArray(c.phone) ? c.phone : (c.phone ? [c.phone] : null),
          email: Array.isArray(c.email) ? c.email : (c.email ? [c.email] : null),
        }))
        setContacts(parsedContacts)
      }

      // Load external brokerages
      const { data: externalData, error: externalError } = await supabase
        .from('transaction_external_brokerages')
        .select('*')
        .eq('transaction_id', transactionId)

      if (!externalError && externalData) {
        setExternalBrokerages(externalData)
      }

      // Load flyers
      const { data: flyersData, error: flyersError } = await supabase
        .from('transaction_flyers')
        .select('*')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })

      if (!flyersError && flyersData) {
        // Get requester names
        const requesterIds = flyersData.map(f => f.requested_by).filter(Boolean)
        let requestersData: any[] = []
        
        if (requesterIds.length > 0) {
          const { data } = await supabase
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
            .in('id', requesterIds)
          requestersData = data || []
        }

        const flyersWithNames = flyersData.map(flyer => {
          const requester = requestersData.find(u => u.id === flyer.requested_by)
          return {
            ...flyer,
            requested_by_name: requester 
              ? (requester.preferred_first_name && requester.preferred_last_name
                  ? `${requester.preferred_first_name} ${requester.preferred_last_name}`
                  : `${requester.first_name} ${requester.last_name}`)
              : null
          }
        })
        setFlyers(flyersWithNames)
      }

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateTransaction = async (field: string, value: string) => {
    if (!transaction) return
    setSaving(true)
    try {
      const numericFields = ['sales_price', 'sales_volume', 'lease_term', 'gross_commission', 'listing_side_commission', 'buying_side_commission']
      const updateValue = numericFields.includes(field) 
        ? (value ? parseFloat(value) : null) 
        : (value || null)
      
      const { error } = await supabase
        .from('transactions')
        .update({ [field]: updateValue, updated_at: new Date().toISOString() })
        .eq('id', transaction.id)

      if (error) {
        console.error('Error updating transaction:', error)
        throw error
      }
      const updatedTransaction = { ...transaction, [field]: updateValue } as Transaction
      setTransaction(updatedTransaction)
      
      // Recalculate agents if commission-related fields changed
      const commissionFields = ['lead_source', 'gross_commission', 'listing_side_commission', 'buying_side_commission', 'sales_volume']
      if (commissionFields.includes(field)) {
        await recalculateAllAgents(updatedTransaction)
      }
    } catch (error) {
      console.error('Error updating transaction:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateTransactionMultiple = async (updates: Record<string, any>) => {
    if (!transaction) return
    setSaving(true)
    try {
      const numericFields = ['sales_price', 'sales_volume', 'lease_term', 'gross_commission', 'listing_side_commission', 'buying_side_commission']
      
      const processedUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
      for (const [field, value] of Object.entries(updates)) {
        if (numericFields.includes(field)) {
          // Handle both string and number values
          processedUpdates[field] = value !== null && value !== undefined && value !== '' 
            ? (typeof value === 'number' ? value : parseFloat(value)) 
            : null
        } else {
          processedUpdates[field] = value || null
        }
      }
      
      const { error } = await supabase
        .from('transactions')
        .update(processedUpdates)
        .eq('id', transaction.id)

      if (error) {
        console.error('Error updating transaction:', error)
        throw error
      }
      const updatedTransaction = { ...transaction, ...processedUpdates } as Transaction
      setTransaction(updatedTransaction)
      
      // Recalculate agents if commission-related fields changed
      const commissionFields = ['lead_source', 'gross_commission', 'listing_side_commission', 'buying_side_commission', 'sales_volume']
      const shouldRecalculate = commissionFields.some(field => field in updates)
      if (shouldRecalculate) {
        await recalculateAllAgents(updatedTransaction)
      }
    } catch (error) {
      console.error('Error updating transaction:', error)
    } finally {
      setSaving(false)
    }
  }

  const recalculateAllAgents = async (txn: Transaction, agentsList?: TransactionAgent[]) => {
    // Recalculate ALL agents based on transaction data
    // Use provided agents list or fall back to state
    const updatedAgents = [...(agentsList || agents)]
    
    // Fetch team membership for all agents directly from database
    const agentIds = updatedAgents.map(a => a.agent_id).filter(Boolean)
    let teamMemberships: any[] = []
    
    if (agentIds.length > 0) {
      const { data: teamData } = await supabase
        .from('team_members')
        .select('*, team_agreements!inner(id, team_name, status)')
        .in('agent_id', agentIds)
        .eq('team_agreements.status', 'active')
      
      teamMemberships = teamData || []
    }
    
    // First pass: Calculate primary agents (listing, co-listing, buyers)
    for (let i = 0; i < updatedAgents.length; i++) {
      const agent = updatedAgents[i]
      
      if (['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(agent.agent_role)) {
        // Find team membership for this agent
        const teamMember = teamMemberships.find(m => m.agent_id === agent.agent_id)
        const sideGross = ['listing_agent', 'co_listing_agent'].includes(agent.agent_role)
          ? txn.listing_side_commission
          : txn.buying_side_commission
        
        // Get the commission plan to determine split
        const plan = commissionPlans.find(p => p.id === agent.commission_plan_id)
        const planSplit = plan?.agent_split_percentage || agent.split_percentage || 0
        
        // Calculate values
        const agentBasis = sideGross || 0
        const preSplitDeductions = agent.pre_split_deductions || 0
        const adjustedBasis = agentBasis - preSplitDeductions
        
        // Check if agent is on a team with special splits
        let splitPercentage = planSplit
        let teamLeadAmount = 0
        let firmAmount = 0
        
        if (teamMember && teamMember.splits) {
          const txnType = txn.transaction_type === 'lease' ? 'lease' : 'sales'
          
          // Determine plan key from agent's commission plan or team member's active plan
          let planKey = 'no_cap' // default
          const agentPlanCode = agent.commission_plan?.toLowerCase() || ''
          
          // Map commission plan codes to splits keys
          if (agentPlanCode.includes('new') || agentPlanCode === '70_30_new') {
            planKey = 'new_agent'
          } else if (agentPlanCode.includes('cap') && !agentPlanCode.includes('no')) {
            planKey = 'cap'
          } else if (agentPlanCode.includes('no_cap') || agentPlanCode.includes('85_15')) {
            planKey = 'no_cap'
          } else if (txnType === 'lease') {
            planKey = teamMember.active_lease_plan || 'standard'
          } else {
            planKey = teamMember.active_sales_plan || 'no_cap'
          }
          
          const leadType = getLeadSourceType(txn.lead_source || null)
          
          try {
            const splits = teamMember.splits[txnType]?.[planKey]?.[leadType]
            if (splits) {
              splitPercentage = splits.agent || planSplit
              teamLeadAmount = agentBasis * ((splits.team_lead || 0) / 100)
              firmAmount = agentBasis * ((splits.firm || 0) / 100)
            }
          } catch (e) {
            console.error('Error getting team splits:', e)
          }
        }
        
        const agentGross = adjustedBasis * (splitPercentage / 100)
        
        // Post-split deductions (these reduce agent net but stay with firm)
        const processingFee = agent.processing_fee || 0
        const coachingFee = agent.coaching_fee || 0
        const otherFees = agent.other_fees || 0
        const rebate = agent.rebate_amount || 0
        const btsa = agent.btsa_amount || 0
        
        const postSplitDeductions = processingFee + coachingFee + otherFees + rebate
        const agentNet = agentGross - postSplitDeductions + btsa
        
        const updateData = {
          agent_basis: agentBasis,
          agent_basis_type: 'amount' as const,
          split_percentage: splitPercentage,
          agent_gross: agentGross,
          agent_net: agentNet,
          team_lead_commission: teamLeadAmount,
          sales_volume: txn.sales_volume || 0,
          updated_at: new Date().toISOString()
        }
        
        await supabase
          .from('transaction_internal_agents')
          .update(updateData)
          .eq('id', agent.id)
        
        updatedAgents[i] = { ...agent, ...updateData }
      }
    }
    
    // Second pass: Calculate team leads - their income comes from agents on their team
    for (let i = 0; i < updatedAgents.length; i++) {
      const agent = updatedAgents[i]
      
      if (agent.agent_role === 'team_lead') {
        // Sum up team_lead_commission from all primary agents
        const teamLeadIncome = updatedAgents
          .filter(a => ['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(a.agent_role))
          .reduce((sum, a) => sum + (a.team_lead_commission || 0), 0)
        
        const updateData = {
          agent_basis: teamLeadIncome,
          agent_gross: teamLeadIncome,
          agent_net: teamLeadIncome, // Team leads don't have deductions typically
          updated_at: new Date().toISOString()
        }
        
        await supabase
          .from('transaction_internal_agents')
          .update(updateData)
          .eq('id', agent.id)
        
        updatedAgents[i] = { ...agent, ...updateData }
      }
    }
    
    // Third pass: Calculate referral/revenue share/other brokerage agents
    for (let i = 0; i < updatedAgents.length; i++) {
      const agent = updatedAgents[i]
      
      if (['referral_agent', 'revenue_share', 'other_brokerage'].includes(agent.agent_role)) {
        // These typically have manually set amounts or percentage of something
        // For now, just ensure agent_net matches what's set
        const agentNet = agent.agent_net || agent.agent_gross || agent.agent_basis || 0
        
        const updateData = {
          agent_net: agentNet,
          updated_at: new Date().toISOString()
        }
        
        await supabase
          .from('transaction_internal_agents')
          .update(updateData)
          .eq('id', agent.id)
        
        updatedAgents[i] = { ...agent, ...updateData }
      }
    }
    
    // Calculate office amounts
    // Office Gross = total commission coming in (listing + buying side)
    const officeGross = (txn.listing_side_commission || 0) + (txn.buying_side_commission || 0)
    
    // Office Net = Office Gross - everything we pay out (all agent_net values + external brokerage commissions)
    const totalAgentNet = updatedAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
    const totalExternalCommissions = externalBrokerages.reduce((sum, b) => sum + (b.commission_amount || 0), 0)
    const officeNet = officeGross - totalAgentNet - totalExternalCommissions
    
    await supabase
      .from('transactions')
      .update({
        office_gross: officeGross,
        office_net: officeNet,
        updated_at: new Date().toISOString()
      })
      .eq('id', txn.id)
    
    // Update local state
    setTransaction({ ...txn, office_gross: officeGross, office_net: officeNet })
    setAgents(updatedAgents)
    
    if (selectedAgent) {
      const updated = updatedAgents.find(a => a.id === selectedAgent.id)
      if (updated) setSelectedAgent(updated)
    }
  }

  const updateAgent = async (agentId: string, field: string, value: string) => {
    setSaving(true)
    try {
      const numericFields = ['agent_basis', 'pre_split_deductions', 'split_percentage', 'agent_gross', 'processing_fee', 'coaching_fee', 'other_fees', 'rebate_amount', 'btsa_amount', 'agent_net', 'sales_volume', 'units']
      const updateValue = numericFields.includes(field) ? (value ? parseFloat(value) : null) : (value || null)
      
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ [field]: updateValue, updated_at: new Date().toISOString() })
        .eq('id', agentId)

      if (error) {
        console.error('Supabase error updating agent:', error.message, error.details, error.hint)
        throw error
      }
      
      const updatedAgents = agents.map(a => a.id === agentId ? { ...a, [field]: updateValue } : a)
      setAgents(updatedAgents)
      
      const updatedAgent = updatedAgents.find(a => a.id === agentId)
      if (updatedAgent) {
        setSelectedAgent(updatedAgent)
      }
      
      // Trigger full recalculation for numeric fields
      if (numericFields.includes(field) && transaction) {
        await recalculateAllAgents(transaction)
      }
    } catch (error: any) {
      console.error('Error updating agent:', error?.message || error)
    } finally {
      setSaving(false)
    }
  }

  const updateAgentWithCalculation = async (agentId: string, field: string, value: string) => {
    // First update the field
    await updateAgent(agentId, field, value)
    
    // Then recalculate and save calculated fields
    const agent = agents.find(a => a.id === agentId)
    if (!agent || !transaction) return
    
    const updatedAgent = { ...agent, [field]: value ? parseFloat(value) : null }
    const teamMember = teamInfo.members.find(m => m.agent_id === agent.agent_id)
    const sideGross = ['listing_agent', 'co_listing_agent'].includes(agent.agent_role)
      ? transaction.listing_side_commission
      : transaction.buying_side_commission
    
    const calculated = calculateAgentValues(
      updatedAgent,
      teamMember,
      transaction.lead_source || undefined,
      transaction.transaction_type,
      sideGross || undefined
    )
    
    // Save calculated values
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ 
          agent_gross: calculated.agentGross,
          agent_net: calculated.agentNet,
          updated_at: new Date().toISOString()
        })
        .eq('id', agentId)

      if (error) throw error
      
      const finalAgent = { 
        ...updatedAgent, 
        agent_gross: calculated.agentGross, 
        agent_net: calculated.agentNet 
      }
      
      setAgents(agents.map(a => a.id === agentId ? finalAgent : a))
      setSelectedAgent(finalAgent)
    } catch (error) {
      console.error('Error saving calculated values:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateAgentWithType = async (agentId: string, field: string, value: string, type: 'percent' | 'amount') => {
    setSaving(true)
    try {
      const numericValue = value ? parseFloat(value) : null
      const typeField = `${field}_type`
      
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ 
          [field]: numericValue, 
          [typeField]: type,
          updated_at: new Date().toISOString() 
        })
        .eq('id', agentId)

      if (error) throw error
      
      const updatedAgents = agents.map(a => 
        a.id === agentId ? { ...a, [field]: numericValue, [typeField]: type } : a
      )
      setAgents(updatedAgents)
      
      const updatedAgent = updatedAgents.find(a => a.id === agentId)
      if (updatedAgent) {
        setSelectedAgent(updatedAgent)
      }
      
      // Trigger full recalculation
      if (transaction) {
        await recalculateAllAgents(transaction)
      }
    } catch (error: any) {
      console.error('Error updating agent with type:', error?.message || error)
    } finally {
      setSaving(false)
    }
  }

  const recalculateAgentCommission = async (agent: TransactionAgent, sideGross: number | null) => {
    if (!sideGross) return
    
    // Calculate actual values based on types
    const getActualValue = (value: number | null, type: 'percent' | 'amount', base: number) => {
      if (!value) return 0
      return type === 'percent' ? base * (value / 100) : value
    }
    
    const agentBasis = getActualValue(agent.agent_basis, agent.agent_basis_type || 'amount', sideGross)
    const preSplitDeductions = getActualValue(agent.pre_split_deductions, agent.pre_split_deductions_type || 'amount', agentBasis)
    
    const adjustedBasis = agentBasis - preSplitDeductions
    
    const splitPct = agent.split_percentage_type === 'amount' 
      ? (agent.split_percentage || 0) 
      : (agent.split_percentage || 0)
    const agentGross = agent.split_percentage_type === 'amount'
      ? (agent.split_percentage || 0)
      : adjustedBasis * (splitPct / 100)
    
    const processingFee = getActualValue(agent.processing_fee, agent.processing_fee_type || 'amount', agentGross)
    const coachingFee = getActualValue(agent.coaching_fee, agent.coaching_fee_type || 'amount', agentGross)
    const otherFees = getActualValue(agent.other_fees, agent.other_fees_type || 'amount', agentGross)
    const rebate = getActualValue(agent.rebate_amount, agent.rebate_amount_type || 'amount', agentGross)
    const btsa = getActualValue(agent.btsa_amount, agent.btsa_amount_type || 'amount', agentGross)
    
    const postSplitDeductions = processingFee + coachingFee + otherFees + rebate
    const agentNet = agentGross - postSplitDeductions + btsa
    
    try {
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ 
          agent_gross: agentGross,
          agent_net: agentNet,
          updated_at: new Date().toISOString()
        })
        .eq('id', agent.id)

      if (error) throw error
      
      const finalAgent = { ...agent, agent_gross: agentGross, agent_net: agentNet }
      setAgents(agents.map(a => a.id === agent.id ? finalAgent : a))
      setSelectedAgent(finalAgent)
    } catch (error) {
      console.error('Error recalculating commission:', error)
    }
  }

  const applyCommissionPlan = async (agentId: string, planId: string) => {
    const plan = commissionPlans.find(p => p.id === planId)
    if (!plan) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ 
          commission_plan_id: planId,
          commission_plan: plan.name,
          split_percentage: plan.agent_split_percentage,
          processing_fee: plan.processing_fee_amount || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', agentId)

      if (error) throw error
      
      const updatedAgent = {
        ...selectedAgent!,
        commission_plan_id: planId,
        commission_plan: plan.name,
        split_percentage: plan.agent_split_percentage,
        processing_fee: plan.processing_fee_amount || 0
      }
      
      // Recalculate with new values
      const calculated = calculateAgentValues(updatedAgent)
      
      const { error: calcError } = await supabase
        .from('transaction_internal_agents')
        .update({ 
          agent_gross: calculated.agentGross,
          agent_net: calculated.agentNet
        })
        .eq('id', agentId)

      if (calcError) throw calcError
      
      const finalAgent = {
        ...updatedAgent,
        agent_gross: calculated.agentGross,
        agent_net: calculated.agentNet
      }
      
      setAgents(agents.map(a => a.id === agentId ? finalAgent : a))
      setSelectedAgent(finalAgent)
    } catch (error) {
      console.error('Error applying commission plan:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateContact = async (contactId: string, field: string, value: any) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_contacts')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', contactId)

      if (error) throw error
      setContacts(contacts.map(c => c.id === contactId ? { ...c, [field]: value } : c))
    } catch (error) {
      console.error('Error updating contact:', error)
    } finally {
      setSaving(false)
    }
  }

  const removeAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to remove this agent from the transaction?')) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', agentId)

      if (error) throw error
      
      const updatedAgents = agents.filter(a => a.id !== agentId)
      setAgents(updatedAgents)
      
      // If we removed the selected agent, select another one or clear selection
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(updatedAgents.length > 0 ? updatedAgents[0] : null)
      }
      
      // Recalculate everything with the updated agents list
      if (transaction) {
        await recalculateAllAgents(transaction, updatedAgents)
      }
    } catch (error) {
      console.error('Error removing agent:', error)
    } finally {
      setSaving(false)
    }
  }

  const loadAvailableAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, commission_plan, team_lead, referring_agent_id')
        .eq('is_active', true)
        .or('role.eq.Agent,roles.cs.{Agent}')
        .order('preferred_last_name', { ascending: true })

      if (error) throw error
      setAvailableAgents(data || [])
    } catch (error) {
      console.error('Error loading available agents:', error)
    }
  }

  const openAddAgentModal = async () => {
    await loadAvailableAgents()
    setShowAddAgentModal(true)
    setSelectedNewAgent(null)
    setSelectedNewRole('')
    setAgentSearchQuery('')
  }

  const addAgentToTransaction = async () => {
    if (!selectedNewAgent || !selectedNewRole || !transaction) return
    
    setAddingAgent(true)
    try {
      // Check if agent is already on transaction
      const existingAgent = agents.find(a => a.agent_id === selectedNewAgent.id && a.agent_role === selectedNewRole)
      if (existingAgent) {
        alert('This agent is already on the transaction with this role.')
        return
      }

      // Get default commission plan if agent has one
      let commissionPlanId = null
      let commissionPlanName = null
      let splitPercentage = null
      let planCode = selectedNewAgent.commission_plan || ''

      if (selectedNewAgent.commission_plan) {
        const plan = commissionPlans.find(p => p.code === selectedNewAgent.commission_plan)
        if (plan) {
          commissionPlanId = plan.id
          commissionPlanName = plan.name
          splitPercentage = plan.agent_split_percentage
          planCode = plan.code || ''
        }
      }

      // Determine fees based on commission plan and selected processing fee type
      let processingFee = 0
      let coachingFee = 0
      let processingFeeTypeId: string | null = null
      
      // Roles that don't have processing fees
      const roleHasNoFee = ROLES_WITHOUT_PROCESSING_FEE.includes(selectedNewRole)
      
      if (!roleHasNoFee) {
        const planCodeLower = planCode.toLowerCase()
        
        // Self-Investment plan has fixed $250 processing fee regardless of type
        if (planCodeLower === '95_5_self' || planCodeLower.includes('self')) {
          processingFee = 250
          processingFeeTypeId = null // No type needed for fixed fee
        } 
        // Apartment/Lease plans have $0 processing fee
        else if (planCodeLower === '85_15_lease' || planCodeLower.includes('lease')) {
          processingFee = 0
          // Auto-select apartment_lease type if available
          const leaseType = processingFeeTypes.find(t => t.code === 'apartment_lease')
          processingFeeTypeId = leaseType?.id || null
        }
        // Brokerage Lead Lease has $0 processing fee  
        else if (planCodeLower === '75_25_lead_lease') {
          processingFee = 0
          const leaseType = processingFeeTypes.find(t => t.code === 'apartment_lease')
          processingFeeTypeId = leaseType?.id || null
        }
        // All other plans: Use selected processing fee type
        else if (selectedProcessingFeeType) {
          const feeType = processingFeeTypes.find(t => t.id === selectedProcessingFeeType)
          if (feeType) {
            processingFee = feeType.processing_fee
            processingFeeTypeId = feeType.id
          }
        }
        
        // New Agent Plan: $500 coaching fee (in addition to processing fee)
        const planCodeLower2 = planCode.toLowerCase()
        if (planCodeLower2 === '70_30_new' || planCodeLower2.includes('new_agent') || planCodeLower2.includes('new agent')) {
          coachingFee = 500
        }
      }

      // Determine if this role gets sales volume/units
      const getsVolumeAndUnits = ['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(selectedNewRole)

      const newAgentRecord = {
        transaction_id: transaction.id,
        agent_id: selectedNewAgent.id,
        agent_role: selectedNewRole,
        commission_plan_id: commissionPlanId,
        commission_plan: commissionPlanName,
        processing_fee_type_id: processingFeeTypeId,
        split_percentage: splitPercentage,
        split_percentage_type: 'percent',
        processing_fee: processingFee,
        processing_fee_type: 'amount',
        agent_basis: 0,
        agent_basis_type: 'amount',
        pre_split_deductions: 0,
        pre_split_deductions_type: 'amount',
        coaching_fee: coachingFee,
        coaching_fee_type: 'amount',
        other_fees: 0,
        other_fees_type: 'amount',
        rebate_amount: 0,
        rebate_amount_type: 'amount',
        btsa_amount: 0,
        btsa_amount_type: 'amount',
        agent_gross: 0,
        agent_net: 0,
        sales_volume: getsVolumeAndUnits ? transaction.sales_volume : 0,
        units: getsVolumeAndUnits ? 1 : 0,
        payment_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('transaction_internal_agents')
        .insert(newAgentRecord)
        .select()
        .single()

      if (error) throw error

      // Add agent name to the record and ensure type fields are set
      const agentWithName: TransactionAgent = {
        ...data,
        agent_basis_type: data.agent_basis_type || 'amount',
        pre_split_deductions_type: data.pre_split_deductions_type || 'amount',
        split_percentage_type: data.split_percentage_type || 'percent',
        processing_fee_type: data.processing_fee_type || 'amount',
        coaching_fee_type: data.coaching_fee_type || 'amount',
        other_fees_type: data.other_fees_type || 'amount',
        rebate_amount_type: data.rebate_amount_type || 'amount',
        btsa_amount_type: data.btsa_amount_type || 'amount',
        agent_name: selectedNewAgent.preferred_first_name && selectedNewAgent.preferred_last_name
          ? `${selectedNewAgent.preferred_first_name} ${selectedNewAgent.preferred_last_name}`
          : `${selectedNewAgent.first_name} ${selectedNewAgent.last_name}`,
        agent_email: selectedNewAgent.email
      }

      const newAgents = [...agents, agentWithName]

      // Auto-add team lead if agent is on a team and this is a primary role
      const isPrimaryRole = ['listing_agent', 'buyers_agent'].includes(selectedNewRole)
      if (isPrimaryRole && selectedNewAgent.team_lead) {
        // team_lead might be stored as email, UUID, or name - try to find the user
        let teamLeadQuery = supabase
          .from('users')
          .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, commission_plan')
        
        // Check if it looks like an email
        if (selectedNewAgent.team_lead.includes('@')) {
          teamLeadQuery = teamLeadQuery.eq('email', selectedNewAgent.team_lead)
        } 
        // Check if it looks like a UUID
        else if (selectedNewAgent.team_lead.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          teamLeadQuery = teamLeadQuery.eq('id', selectedNewAgent.team_lead)
        }
        // Otherwise assume it's a name - skip for now (too ambiguous)
        else {
          console.log('Team lead format not recognized:', selectedNewAgent.team_lead)
        }

        const { data: teamLeadData } = await teamLeadQuery.single()
        
        if (teamLeadData) {
          // Check if team lead is already on the transaction
          const teamLeadAlreadyAdded = agents.some(a => a.agent_id === teamLeadData.id)
          if (!teamLeadAlreadyAdded && teamLeadData.id !== selectedNewAgent.id) {
            // Get team lead's commission plan
            let teamLeadPlanId = null
            let teamLeadPlanName = null
            if (teamLeadData.commission_plan) {
              const tlPlan = commissionPlans.find(p => p.code === teamLeadData.commission_plan)
              if (tlPlan) {
                teamLeadPlanId = tlPlan.id
                teamLeadPlanName = tlPlan.name
              }
            }

            const teamLeadRecord = {
              transaction_id: transaction.id,
              agent_id: teamLeadData.id,
              agent_role: 'team_lead',
              commission_plan_id: teamLeadPlanId,
              commission_plan: teamLeadPlanName,
              split_percentage_type: 'percent',
              processing_fee_type: 'amount',
              agent_basis_type: 'amount',
              pre_split_deductions_type: 'amount',
              coaching_fee_type: 'amount',
              other_fees_type: 'amount',
              rebate_amount_type: 'amount',
              btsa_amount_type: 'amount',
              agent_gross: 0,
              agent_net: 0,
              sales_volume: 0,
              units: 0,
              payment_status: 'pending',
            }

            const { data: teamLeadInsert, error: teamLeadError } = await supabase
              .from('transaction_internal_agents')
              .insert(teamLeadRecord)
              .select()
              .single()

            if (!teamLeadError && teamLeadInsert) {
              const teamLeadWithName: TransactionAgent = {
                ...teamLeadInsert,
                agent_basis_type: teamLeadInsert.agent_basis_type || 'amount',
                pre_split_deductions_type: teamLeadInsert.pre_split_deductions_type || 'amount',
                split_percentage_type: teamLeadInsert.split_percentage_type || 'percent',
                processing_fee_type: teamLeadInsert.processing_fee_type || 'amount',
                coaching_fee_type: teamLeadInsert.coaching_fee_type || 'amount',
                other_fees_type: teamLeadInsert.other_fees_type || 'amount',
                rebate_amount_type: teamLeadInsert.rebate_amount_type || 'amount',
                btsa_amount_type: teamLeadInsert.btsa_amount_type || 'amount',
                agent_name: teamLeadData.preferred_first_name && teamLeadData.preferred_last_name
                  ? `${teamLeadData.preferred_first_name} ${teamLeadData.preferred_last_name}`
                  : `${teamLeadData.first_name} ${teamLeadData.last_name}`,
                agent_email: teamLeadData.email
              }
              newAgents.push(teamLeadWithName)
            }
          }
        }
      }

      // Auto-add revenue share agent if agent has a referring_agent_id and this is a primary role
      if (isPrimaryRole && selectedNewAgent.referring_agent_id) {
        // Check if revenue share agent is already on the transaction
        const revShareAlreadyAdded = agents.some(a => a.agent_id === selectedNewAgent.referring_agent_id)
        if (!revShareAlreadyAdded && selectedNewAgent.referring_agent_id !== selectedNewAgent.id) {
          // Fetch referring agent info
          const { data: referringAgentData } = await supabase
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, commission_plan')
            .eq('id', selectedNewAgent.referring_agent_id)
            .single()
          
          if (referringAgentData) {
            const revShareRecord = {
              transaction_id: transaction.id,
              agent_id: referringAgentData.id,
              agent_role: 'revenue_share',
              split_percentage_type: 'percent',
              processing_fee_type: 'amount',
              agent_basis_type: 'amount',
              pre_split_deductions_type: 'amount',
              coaching_fee_type: 'amount',
              other_fees_type: 'amount',
              rebate_amount_type: 'amount',
              btsa_amount_type: 'amount',
              agent_gross: 0,
              agent_net: 0,
              sales_volume: 0,
              units: 0,
              payment_status: 'pending',
            }

            const { data: revShareInsert, error: revShareError } = await supabase
              .from('transaction_internal_agents')
              .insert(revShareRecord)
              .select()
              .single()

            if (!revShareError && revShareInsert) {
              const revShareWithName: TransactionAgent = {
                ...revShareInsert,
                agent_basis_type: revShareInsert.agent_basis_type || 'amount',
                pre_split_deductions_type: revShareInsert.pre_split_deductions_type || 'amount',
                split_percentage_type: revShareInsert.split_percentage_type || 'percent',
                processing_fee_type: revShareInsert.processing_fee_type || 'amount',
                coaching_fee_type: revShareInsert.coaching_fee_type || 'amount',
                other_fees_type: revShareInsert.other_fees_type || 'amount',
                rebate_amount_type: revShareInsert.rebate_amount_type || 'amount',
                btsa_amount_type: revShareInsert.btsa_amount_type || 'amount',
                agent_name: referringAgentData.preferred_first_name && referringAgentData.preferred_last_name
                  ? `${referringAgentData.preferred_first_name} ${referringAgentData.preferred_last_name}`
                  : `${referringAgentData.first_name} ${referringAgentData.last_name}`,
                agent_email: referringAgentData.email
              }
              newAgents.push(revShareWithName)
            }
          }
        }
      }

      setAgents(newAgents)
      setSelectedAgent(agentWithName)
      setShowAddAgentModal(false)
      setSelectedNewAgent(null)
      setSelectedNewRole('')
      setSelectedProcessingFeeType('')
      setAgentSearchQuery('')
      
      // Recalculate with the new agents list
      if (transaction) {
        await recalculateAllAgents(transaction, newAgents)
      }

    } catch (error) {
      console.error('Error adding agent:', error)
      alert('Failed to add agent. Please try again.')
    } finally {
      setAddingAgent(false)
    }
  }

  // External Brokerage Functions
  const handleAddExternalBrokerage = async (brokerageData: Partial<ExternalBrokerage>) => {
    if (!transaction) return
    
    setAddingExternalBrokerage(true)
    try {
      const newBrokerage = {
        transaction_id: transaction.id,
        brokerage_role: brokerageData.brokerage_role || 'coop_broker',
        brokerage_role_other: brokerageData.brokerage_role_other || null,
        brokerage_name: brokerageData.brokerage_name || null,
        brokerage_dba: brokerageData.brokerage_dba || null,
        brokerage_ein: brokerageData.brokerage_ein || null,
        brokerage_address: brokerageData.brokerage_address || null,
        brokerage_city: brokerageData.brokerage_city || null,
        brokerage_state: brokerageData.brokerage_state || null,
        brokerage_zip: brokerageData.brokerage_zip || null,
        broker_name: brokerageData.broker_name || null,
        broker_phone: brokerageData.broker_phone || null,
        broker_email: brokerageData.broker_email || null,
        agent_name: brokerageData.agent_name || null,
        agent_phone: brokerageData.agent_phone || null,
        agent_email: brokerageData.agent_email || null,
        commission_amount: brokerageData.commission_amount || 0,
        amount_1099_reportable: brokerageData.amount_1099_reportable || brokerageData.commission_amount || 0,
        payment_status: 'pending',
        w9_on_file: false,
      }

      const { data, error } = await supabase
        .from('transaction_external_brokerages')
        .insert(newBrokerage)
        .select()
        .single()

      if (error) throw error

      setExternalBrokerages([...externalBrokerages, data])
      setShowAddExternalModal(false)
      setSelectedExternalBrokerage(data)
    } catch (error) {
      console.error('Error adding external brokerage:', error)
      alert('Failed to add external brokerage. Please try again.')
    } finally {
      setAddingExternalBrokerage(false)
    }
  }

  const openAddExternalBrokerageModal = async () => {
    // Load distinct brokerages from all transactions for search
    const { data, error } = await supabase
      .from('transaction_external_brokerages')
      .select('*')
      .order('brokerage_name', { ascending: true })
    
    if (!error && data) {
      // Get unique brokerages by name (most recent record for each)
      const uniqueBrokerages = data.reduce((acc: ExternalBrokerage[], curr) => {
        const existing = acc.find(b => b.brokerage_name?.toLowerCase() === curr.brokerage_name?.toLowerCase())
        if (!existing && curr.brokerage_name) {
          acc.push(curr)
        }
        return acc
      }, [])
      setExistingBrokerages(uniqueBrokerages)
    }
    
    // Reset form state
    setSelectedExistingBrokerage(null)
    setBrokerageSearchQuery('')
    setNewBrokerageForm({})
    setShowAddExternalModal(true)
  }

  const updateExternalBrokerage = async (brokerageId: string, field: string, value: any) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_external_brokerages')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', brokerageId)

      if (error) throw error

      setExternalBrokerages(prev => prev.map(b => 
        b.id === brokerageId ? { ...b, [field]: value } : b
      ))
      
      if (selectedExternalBrokerage?.id === brokerageId) {
        setSelectedExternalBrokerage(prev => prev ? { ...prev, [field]: value } : null)
      }
    } catch (error) {
      console.error('Error updating external brokerage:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteExternalBrokerage = async (brokerageId: string) => {
    if (!confirm('Are you sure you want to remove this external brokerage?')) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_external_brokerages')
        .delete()
        .eq('id', brokerageId)

      if (error) throw error

      setExternalBrokerages(prev => prev.filter(b => b.id !== brokerageId))
      if (selectedExternalBrokerage?.id === brokerageId) {
        setSelectedExternalBrokerage(null)
      }
    } catch (error) {
      console.error('Error deleting external brokerage:', error)
    } finally {
      setSaving(false)
    }
  }

  const filteredAvailableAgents = availableAgents.filter(agent => {
    if (!agentSearchQuery) return true
    const name = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`.toLowerCase()
    const email = (agent.email || '').toLowerCase()
    const query = agentSearchQuery.toLowerCase()
    return name.includes(query) || email.includes(query)
  })

  // Flyer functions
  const updateFlyerStatus = async (flyerId: string, status: string) => {
    setSaving(true)
    try {
      const updateData: any = { 
        status, 
        updated_at: new Date().toISOString() 
      }
      
      if (status === 'sent') {
        updateData.sent_date = new Date().toISOString()
      }
      
      const { error } = await supabase
        .from('transaction_flyers')
        .update(updateData)
        .eq('id', flyerId)

      if (error) throw error
      
      setFlyers(flyers.map(f => 
        f.id === flyerId ? { ...f, status: status as 'requested' | 'in_progress' | 'sent', sent_date: status === 'sent' ? new Date().toISOString() : f.sent_date } : f
      ))
    } catch (error) {
      console.error('Error updating flyer:', error)
    } finally {
      setSaving(false)
    }
  }

  const requestFlyer = async (flyerType: string) => {
    if (!transaction || !user) return
    
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('transaction_flyers')
        .insert({
          transaction_id: transaction.id,
          flyer_type: flyerType,
          status: 'requested',
          requested_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      
      setFlyers([{
        ...data,
        requested_by_name: `${user.preferred_first_name} ${user.preferred_last_name}`
      }, ...flyers])
    } catch (error) {
      console.error('Error requesting flyer:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteFlyer = async (flyerId: string) => {
    if (!confirm('Are you sure you want to delete this flyer request?')) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transaction_flyers')
        .delete()
        .eq('id', flyerId)

      if (error) throw error
      setFlyers(flyers.filter(f => f.id !== flyerId))
    } catch (error) {
      console.error('Error deleting flyer:', error)
    } finally {
      setSaving(false)
    }
  }

  // Close transaction function
  const closeTransaction = async () => {
    if (!transaction) return
    
    // Check if all agents are paid
    const unpaidAgents = agents.filter(a => a.payment_status !== 'paid')
    if (unpaidAgents.length > 0) {
      const unpaidNames = unpaidAgents.map(a => a.agent_name).join(', ')
      alert(`Cannot close transaction. The following agents have not been paid:\n\n${unpaidNames}`)
      return
    }
    
    if (!confirm('All agents have been paid. Close this transaction?')) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ 
          status: 'closed', 
          closed_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString() 
        })
        .eq('id', transaction.id)

      if (error) throw error
      
      setTransaction({ 
        ...transaction, 
        status: 'closed', 
        closed_date: new Date().toISOString().split('T')[0] 
      })
    } catch (error) {
      console.error('Error closing transaction:', error)
      alert('Failed to close transaction. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Calculate totals
  const listingSideAgents = agents.filter(a => ['listing_agent', 'co_listing_agent'].includes(a.agent_role))
  const buyingSideAgents = agents.filter(a => ['buyers_agent'].includes(a.agent_role))
  const otherAgents = agents.filter(a => !['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(a.agent_role))
  
  const listingSideTotal = listingSideAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const buyingSideTotal = buyingSideAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const otherAgentsTotal = otherAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const totalGross = agents.reduce((sum, a) => sum + (a.agent_basis || 0), 0)
  
  // Calculate office net per side
  // Side office net = side gross - all payouts from that side
  // Note: team_lead_commission on primary agents is captured in team lead's agent_net, don't double count
  
  // Listing side: listing agents' net
  const listingSideAgentNet = listingSideAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const listingSideOfficeNet = (transaction?.listing_side_commission || 0) - listingSideAgentNet
  
  // Buying side: buying agents' net + other agents (team leads, referrals) net
  const buyingSideAgentNet = buyingSideAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const buyingSideOtherNet = otherAgents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
  const buyingSideOfficeNet = (transaction?.buying_side_commission || 0) - buyingSideAgentNet - buyingSideOtherNet

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Transaction not found</p>
      </div>
    )
  }

  const address = formatAddress(transaction.property_address)
  const planOptions = commissionPlans.map(p => ({ value: p.id, label: p.name }))

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Sidebar */}
      <div className="w-72 flex-shrink-0 min-h-screen" style={{ backgroundColor: '#E6E7EB' }}>
        <div className="p-6">
          <button
            onClick={() => router.push('/admin/transactions')}
            className="flex items-center gap-2 text-gray-600 hover:text-black mb-6 text-sm"
          >
            <ArrowLeft size={16} />
            <span>Back to Transactions</span>
          </button>

          {/* Property Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h2 className="font-medium text-gray-900 leading-tight mb-1">
              {address.street}
            </h2>
            <p className="text-gray-500 text-sm mb-3">
              {address.cityStateZip}
            </p>
            <StatusBadge 
              status={transaction.status} 
              onSave={(value) => updateTransaction('status', value)}
              options={statusOptions}
            />
            {teamInfo.agreement && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Team Deal</p>
                <p className="text-sm font-medium">{teamInfo.agreement.team_name}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            <button
              onClick={() => handleTabChange('overview')}
              className={`w-full text-left px-3 py-2 rounded text-sm ${
                activeSection === 'overview' 
                  ? 'bg-white text-black font-medium' 
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => handleTabChange('commissions')}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                activeSection === 'commissions' 
                  ? 'bg-white text-black font-medium' 
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <DollarSign size={16} />
              Commissions
            </button>
            <button
              onClick={() => handleTabChange('flyers')}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                activeSection === 'flyers' 
                  ? 'bg-white text-black font-medium' 
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <FileText size={16} />
              Flyers ({flyers.length})
            </button>
            <button
              onClick={() => handleTabChange('contacts')}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                activeSection === 'contacts' 
                  ? 'bg-white text-black font-medium' 
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <Users size={16} />
              Contacts ({contacts.length})
            </button>
            <button
              onClick={() => handleTabChange('documents')}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                activeSection === 'documents' 
                  ? 'bg-white text-black font-medium' 
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <FileText size={16} />
              Documents
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {saving && (
          <div className="fixed top-4 right-4 bg-luxury-gray-1 text-white px-4 py-2 rounded text-sm z-50">
            Saving...
          </div>
        )}

        {activeSection === 'overview' && (
          <div className="p-8 max-w-5xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-2xl font-medium text-gray-900 mb-1">
                  {address.full}
                </h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge 
                    status={transaction.status} 
                    onSave={(value) => updateTransaction('status', value)}
                    options={statusOptions}
                  />
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-500">{toTitleCase(transaction.transaction_type)}</span>
                  {transaction.representation_type && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-500">
                        {ALL_REPRESENTATION_OPTIONS.find(o => o.value === transaction.representation_type)?.label || toTitleCase(transaction.representation_type)}
                      </span>
                    </>
                  )}
                  {teamInfo.agreement && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{teamInfo.agreement.team_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Pricing</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <EditableField
                  label={transaction.transaction_type === 'lease' ? 'Monthly Rent' : 'Sales Price'}
                  value={transaction.sales_price}
                  onSave={(value) => {
                    const newSalesPrice = parseFloat(value) || 0
                    const oldSalesPrice = transaction.sales_price || 0
                    const currentVolume = transaction.sales_volume || 0
                    const leaseTerm = transaction.lease_term || 1
                    
                    // Calculate what the old auto-calculated volume would have been
                    const oldCalculatedVolume = transaction.transaction_type === 'lease' 
                      ? oldSalesPrice * leaseTerm 
                      : oldSalesPrice
                    
                    // Calculate new volume
                    const newCalculatedVolume = transaction.transaction_type === 'lease'
                      ? newSalesPrice * leaseTerm
                      : newSalesPrice
                    
                    // Only auto-update volume if it's empty or matches the old calculated value
                    const shouldAutoUpdate = currentVolume === 0 || currentVolume === oldCalculatedVolume
                    
                    if (shouldAutoUpdate) {
                      updateTransactionMultiple({
                        sales_price: newSalesPrice,
                        sales_volume: newCalculatedVolume
                      })
                    } else {
                      updateTransaction('sales_price', value)
                    }
                  }}
                  type="currency"
                />
                {transaction.transaction_type === 'lease' && (
                  <EditableField
                    label="Lease Term"
                    value={transaction.lease_term}
                    onSave={(value) => {
                      const newLeaseTerm = parseFloat(value) || 1
                      const salesPrice = transaction.sales_price || 0
                      const currentVolume = transaction.sales_volume || 0
                      const oldLeaseTerm = transaction.lease_term || 1
                      
                      // Calculate what the old auto-calculated volume would have been
                      const oldCalculatedVolume = salesPrice * oldLeaseTerm
                      
                      // Calculate new volume
                      const newCalculatedVolume = salesPrice * newLeaseTerm
                      
                      // Only auto-update volume if it's empty or matches the old calculated value
                      const shouldAutoUpdate = currentVolume === 0 || currentVolume === oldCalculatedVolume
                      
                      if (shouldAutoUpdate) {
                        updateTransactionMultiple({
                          lease_term: newLeaseTerm,
                          sales_volume: newCalculatedVolume
                        })
                      } else {
                        updateTransaction('lease_term', value)
                      }
                    }}
                    type="number"
                    suffix="months"
                  />
                )}
                <EditableField
                  label="Sales Volume"
                  value={transaction.sales_volume}
                  onSave={(value) => updateTransaction('sales_volume', value)}
                  type="currency"
                />
                <EditableFieldWithToggle
                  label="Gross Commission"
                  value={transaction.gross_commission}
                  valueType={transaction.gross_commission_type || 'amount'}
                  onSave={(value, type) => {
                    const numValue = parseFloat(value) || 0
                    // Always store as dollar amount for calculations
                    const dollarAmount = type === 'percent' && transaction.sales_price 
                      ? (transaction.sales_price * numValue / 100) 
                      : numValue
                    updateTransactionMultiple({
                      gross_commission: dollarAmount,
                      gross_commission_type: 'amount' // Always store as amount
                    })
                  }}
                  baseAmount={transaction.sales_price}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4 pt-4 border-t border-gray-100">
                <EditableFieldWithToggle
                  label="Listing Side Commission"
                  value={transaction.listing_side_commission}
                  valueType={transaction.listing_side_commission_type || 'amount'}
                  onSave={(value, type) => {
                    const numValue = parseFloat(value) || 0
                    const dollarAmount = type === 'percent' && transaction.gross_commission 
                      ? (transaction.gross_commission * numValue / 100) 
                      : numValue
                    updateTransactionMultiple({
                      listing_side_commission: dollarAmount,
                      listing_side_commission_type: 'amount'
                    })
                  }}
                  baseAmount={transaction.gross_commission}
                />
                <EditableFieldWithToggle
                  label="Buying Side Commission"
                  value={transaction.buying_side_commission}
                  valueType={transaction.buying_side_commission_type || 'amount'}
                  onSave={(value, type) => {
                    const numValue = parseFloat(value) || 0
                    const dollarAmount = type === 'percent' && transaction.gross_commission 
                      ? (transaction.gross_commission * numValue / 100) 
                      : numValue
                    updateTransactionMultiple({
                      buying_side_commission: dollarAmount,
                      buying_side_commission_type: 'amount'
                    })
                  }}
                  baseAmount={transaction.gross_commission}
                />
              </div>
            </div>

            {/* Transaction Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Transaction Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <EditableField
                  label="Transaction Type"
                  value={transaction.transaction_type}
                  onSave={(value) => updateTransaction('transaction_type', value)}
                  type="select"
                  options={transactionTypeOptions}
                />
                <EditableField
                  label="Representation"
                  value={transaction.representation_type}
                  onSave={(value) => updateTransaction('representation_type', value)}
                  type="select"
                  options={transaction.transaction_type === 'lease' 
                    ? REPRESENTATION_TYPE_OPTIONS_LEASE 
                    : REPRESENTATION_TYPE_OPTIONS_SALE}
                />
                <EditableField
                  label="Lead Source"
                  value={transaction.lead_source}
                  onSave={(value) => updateTransaction('lead_source', value)}
                  type="select"
                  options={LEAD_SOURCE_OPTIONS}
                />
                <EditableField
                  label="MLS Type"
                  value={transaction.mls_type}
                  onSave={(value) => updateTransaction('mls_type', value)}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4 pt-4 border-t border-gray-100">
                <EditableField
                  label="MLS Number"
                  value={transaction.mls_number}
                  onSave={(value) => updateTransaction('mls_number', value)}
                />
                <div className="col-span-3">
                  <EditableField
                    label="MLS Link"
                    value={transaction.mls_link}
                    onSave={(value) => updateTransaction('mls_link', value)}
                    placeholder="+ Add MLS link"
                  />
                  {transaction.mls_link && (
                    <a 
                      href={transaction.mls_link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                    >
                      View Listing <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Key Dates</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <EditableField
                  label="Listing Date"
                  value={transaction.listing_date}
                  onSave={(value) => updateTransaction('listing_date', value)}
                  type="date"
                />
                <EditableField
                  label="Acceptance Date"
                  value={transaction.acceptance_date}
                  onSave={(value) => updateTransaction('acceptance_date', value)}
                  type="date"
                />
                <EditableField
                  label={transaction.transaction_type === 'lease' ? 'Move-In Date' : 'Closing Date'}
                  value={transaction.closing_date}
                  onSave={(value) => updateTransaction('closing_date', value)}
                  type="date"
                />
                <EditableField
                  label="Closed Date"
                  value={transaction.closed_date}
                  onSave={(value) => updateTransaction('closed_date', value)}
                  type="date"
                />
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-2">Compliance Status</p>
                <StatusBadge 
                  status={transaction.compliance_status} 
                  onSave={(value) => updateTransaction('compliance_status', value)}
                  options={complianceOptions}
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-2">CDA Status</p>
                <StatusBadge 
                  status={transaction.cda_status} 
                  onSave={(value) => updateTransaction('cda_status', value)}
                  options={cdaOptions}
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-2">Funding Status</p>
                <StatusBadge 
                  status={transaction.funding_status} 
                  onSave={(value) => updateTransaction('funding_status', value)}
                  options={fundingOptions}
                />
              </div>
            </div>

            {/* Agents Quick View */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-900">Agents on Transaction</h3>
                <button 
                  onClick={() => handleTabChange('commissions')}
                  className="text-sm text-gray-500 hover:text-black"
                >
                  View Commissions →
                </button>
              </div>
              {agents.length === 0 ? (
                <p className="text-gray-500 text-sm">No agents assigned</p>
              ) : (
                <div className="space-y-3">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                          {agent.agent_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{agent.agent_name}</p>
                          <p className="text-xs text-gray-500">{formatRole(agent.agent_role)}</p>
                        </div>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(agent.agent_net)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close Transaction */}
            {transaction.status !== 'closed' && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Close Transaction</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {agents.filter(a => a.payment_status !== 'paid').length > 0
                        ? `${agents.filter(a => a.payment_status !== 'paid').length} agent(s) not yet paid`
                        : 'All agents have been paid'
                      }
                    </p>
                  </div>
                  <button
                    onClick={closeTransaction}
                    disabled={agents.filter(a => a.payment_status !== 'paid').length > 0}
                    className={`px-4 py-2 text-sm rounded ${
                      agents.filter(a => a.payment_status !== 'paid').length > 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    Close Transaction
                  </button>
                </div>
              </div>
            )}

            {transaction.status === 'closed' && (
              <div className="bg-green-50 rounded-lg border border-green-200 p-6">
                <div className="flex items-center gap-3">
                  <Check size={20} className="text-green-600" />
                  <div>
                    <h3 className="text-sm font-medium text-green-900">Transaction Closed</h3>
                    <p className="text-xs text-green-700 mt-1">
                      Closed on {formatDate(transaction.closed_date)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'commissions' && (
          <div className="p-8">
            {/* Commission Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-medium text-gray-900 mb-1">Commissions</h1>
                <p className="text-sm text-gray-500">
                  Total Gross: <span className="font-medium text-gray-900">{formatCurrency(totalGross)}</span>
                  {transaction.sales_price && (
                    <span className="ml-2">• {transaction.transaction_type === 'lease' ? 'Monthly Rent' : 'Sales Price'}: {formatCurrency(transaction.sales_price)}</span>
                  )}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Office Gross: <span className="font-medium text-gray-900">{formatCurrency(transaction.office_gross)}</span>
                  <span className="ml-3">• Office Net: <span className="font-medium text-green-600">{formatCurrency(transaction.office_net)}</span></span>
                  {externalBrokerages.length > 0 && (
                    <span className="ml-3">• External: <span className="font-medium text-orange-600">{formatCurrency(externalBrokerages.reduce((sum, b) => sum + (b.commission_amount || 0), 0))}</span></span>
                  )}
                </p>
              </div>
              <button 
                onClick={openAddAgentModal}
                className="btn btn-primary text-sm flex items-center gap-2"
              >
                <Plus size={16} />
                Add Agent
              </button>
            </div>

            {/* Team Info Banner */}
            {teamInfo.agreement && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Team Deal: {teamInfo.agreement.team_name}</p>
                  <p className="text-sm text-blue-700">
                    Splits are calculated based on team agreement. Lead source: {LEAD_SOURCE_OPTIONS.find(o => o.value === transaction.lead_source)?.label || 'Not set'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-6">
              {/* Commission Breakdown */}
              <div className="flex-1 space-y-4">
                {/* Listing Side */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">Listing Side</h3>
                      <p className="text-xs text-gray-500">
                        Side Gross: {formatCurrency(transaction.listing_side_commission)}
                        <span className="ml-2">• Office Net: <span className="text-green-600 font-medium">{formatCurrency(listingSideOfficeNet)}</span></span>
                      </p>
                    </div>
                    <p className="text-lg font-medium">{formatCurrency(listingSideTotal)}</p>
                  </div>
                  {listingSideAgents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No listing side agents
                    </div>
                  ) : (
                    <div>
                      {listingSideAgents.map(agent => (
                        <div 
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent)
                            setSelectedExternalBrokerage(null)
                          }}
                          className={`p-4 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 flex items-center justify-between group ${
                            selectedAgent?.id === agent.id ? 'bg-gray-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm text-gray-600">
                              {agent.agent_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <span className="text-sm font-medium">{agent.agent_name}</span>
                              <p className="text-xs text-gray-500">{formatRole(agent.agent_role)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatCurrency(agent.agent_net)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                removeAgent(agent.id)
                              }}
                              className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove agent"
                            >
                              <X size={14} className="text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 border-t border-gray-100">
                    <button 
                      onClick={openAddAgentModal}
                      className="text-sm text-gray-500 hover:text-black"
                    >
                      + Add agent
                    </button>
                  </div>
                </div>

                {/* Buying Side */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">Buying Side</h3>
                      <p className="text-xs text-gray-500">
                        Side Gross: {formatCurrency(transaction.buying_side_commission)}
                        <span className="ml-2">• Office Net: <span className="text-green-600 font-medium">{formatCurrency(buyingSideOfficeNet)}</span></span>
                      </p>
                    </div>
                    <p className="text-lg font-medium">{formatCurrency(buyingSideTotal)}</p>
                  </div>
                  {buyingSideAgents.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No buying side agents
                    </div>
                  ) : (
                    <div>
                      {buyingSideAgents.map(agent => (
                        <div 
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent)
                            setSelectedExternalBrokerage(null)
                          }}
                          className={`p-4 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 flex items-center justify-between group ${
                            selectedAgent?.id === agent.id ? 'bg-gray-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm text-gray-600">
                              {agent.agent_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <span className="text-sm font-medium">{agent.agent_name}</span>
                              <p className="text-xs text-gray-500">{formatRole(agent.agent_role)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatCurrency(agent.agent_net)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                removeAgent(agent.id)
                              }}
                              className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove agent"
                            >
                              <X size={14} className="text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 border-t border-gray-100">
                    <button 
                      onClick={openAddAgentModal}
                      className="text-sm text-gray-500 hover:text-black"
                    >
                      + Add agent
                    </button>
                  </div>
                </div>

                {/* Other (Team Lead, Rev Share, Referrals) */}
                {otherAgents.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="font-medium text-gray-900">Other (Team Lead, Revenue Share, Referrals)</h3>
                    </div>
                    {otherAgents.map(agent => (
                      <div 
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgent(agent)
                          setSelectedExternalBrokerage(null)
                        }}
                        className={`p-4 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 flex items-center justify-between group ${
                          selectedAgent?.id === agent.id ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm text-gray-600">
                            {agent.agent_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{agent.agent_name}</span>
                            <p className="text-xs text-gray-500">{formatRole(agent.agent_role)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatCurrency(agent.agent_net)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeAgent(agent.id)
                            }}
                            className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove agent"
                          >
                            <X size={14} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* External Brokerages Section */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">External Brokerages</h3>
                    <button 
                      onClick={openAddExternalBrokerageModal}
                      className="text-sm text-gray-600 hover:text-black flex items-center gap-1"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {externalBrokerages.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No external brokerages added
                    </div>
                  ) : (
                    externalBrokerages.map(brokerage => (
                      <div 
                        key={brokerage.id}
                        onClick={() => {
                          setSelectedExternalBrokerage(brokerage)
                          setSelectedAgent(null)
                        }}
                        className={`p-4 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 flex items-center justify-between group ${
                          selectedExternalBrokerage?.id === brokerage.id ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-sm text-orange-600">
                            {brokerage.brokerage_name?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{brokerage.brokerage_name || 'Unnamed Brokerage'}</span>
                            <p className="text-xs text-gray-500">
                              {EXTERNAL_BROKERAGE_TYPES.find(t => t.value === brokerage.brokerage_role)?.label || 'External'}
                              {brokerage.agent_name && ` • ${brokerage.agent_name}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatCurrency(brokerage.commission_amount)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteExternalBrokerage(brokerage.id)
                            }}
                            className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove brokerage"
                          >
                            <X size={14} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Agent Detail Panel */}
              <div className="w-96 flex-shrink-0">
                {selectedExternalBrokerage ? (
                  <div className="bg-white rounded-lg border border-gray-200 sticky top-8">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-medium text-gray-900">{selectedExternalBrokerage.brokerage_name || 'Unnamed Brokerage'}</h3>
                      <p className="text-sm text-gray-500">
                        {EXTERNAL_BROKERAGE_TYPES.find(t => t.value === selectedExternalBrokerage.brokerage_role)?.label || 'External Brokerage'}
                      </p>
                    </div>
                    
                    <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                      {/* Brokerage Role */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Brokerage Role</label>
                        <select
                          value={selectedExternalBrokerage.brokerage_role || ''}
                          onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_role', e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                        >
                          {EXTERNAL_BROKERAGE_TYPES.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Brokerage Details */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">Brokerage Details</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Brokerage Name</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.brokerage_name || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_name', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">DBA Name</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.brokerage_dba || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_dba', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Address</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.brokerage_address || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_address', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">City</label>
                              <input
                                type="text"
                                value={selectedExternalBrokerage.brokerage_city || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_city', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">State</label>
                              <input
                                type="text"
                                value={selectedExternalBrokerage.brokerage_state || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_state', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Zip</label>
                              <input
                                type="text"
                                value={selectedExternalBrokerage.brokerage_zip || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_zip', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Broker Contact */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">Broker Contact</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Broker Name</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.broker_name || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'broker_name', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Broker Phone</label>
                              <input
                                type="text"
                                value={selectedExternalBrokerage.broker_phone || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'broker_phone', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Broker Email</label>
                              <input
                                type="email"
                                value={selectedExternalBrokerage.broker_email || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'broker_email', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Their Agent */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">Their Agent</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Agent Name</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.agent_name || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'agent_name', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Agent Phone</label>
                              <input
                                type="text"
                                value={selectedExternalBrokerage.agent_phone || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'agent_phone', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Agent Email</label>
                              <input
                                type="email"
                                value={selectedExternalBrokerage.agent_email || ''}
                                onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'agent_email', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Financials */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">Financials</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Commission Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={selectedExternalBrokerage.commission_amount || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                updateExternalBrokerage(selectedExternalBrokerage.id, 'commission_amount', val)
                                // Also update 1099 amount if it matches
                                if (selectedExternalBrokerage.amount_1099_reportable === selectedExternalBrokerage.commission_amount) {
                                  updateExternalBrokerage(selectedExternalBrokerage.id, 'amount_1099_reportable', val)
                                }
                                // Trigger recalculation for office net
                                if (transaction) {
                                  const updatedBrokerages = externalBrokerages.map(b => 
                                    b.id === selectedExternalBrokerage.id ? { ...b, commission_amount: val } : b
                                  )
                                  const totalExternal = updatedBrokerages.reduce((sum, b) => sum + (b.commission_amount || 0), 0)
                                  const totalAgentNet = agents.reduce((sum, a) => sum + (a.agent_net || 0), 0)
                                  const officeGross = (transaction.listing_side_commission || 0) + (transaction.buying_side_commission || 0)
                                  const officeNet = officeGross - totalAgentNet - totalExternal
                                  supabase.from('transactions').update({ office_net: officeNet, updated_at: new Date().toISOString() }).eq('id', transaction.id)
                                  setTransaction({ ...transaction, office_net: officeNet })
                                }
                              }}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">1099 Reportable Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={selectedExternalBrokerage.amount_1099_reportable || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'amount_1099_reportable', parseFloat(e.target.value) || 0)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Payment Status */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">Payment</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Payment Status</label>
                            <select
                              value={selectedExternalBrokerage.payment_status || 'pending'}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'payment_status', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="partial">Partial</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Payment Date</label>
                            <input
                              type="date"
                              value={selectedExternalBrokerage.payment_date || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'payment_date', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
                            <select
                              value={selectedExternalBrokerage.payment_method || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'payment_method', e.target.value)}
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            >
                              <option value="">Select...</option>
                              <option value="expense_account">Expense Account</option>
                              <option value="external">External</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Payment Reference</label>
                            <input
                              type="text"
                              value={selectedExternalBrokerage.payment_reference || ''}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'payment_reference', e.target.value)}
                              placeholder="Transaction ID, check #, etc."
                              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                            />
                          </div>
                        </div>
                      </div>

                      {/* W9 Info */}
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-xs font-medium text-gray-700 mb-3">W9 Information</h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="w9OnFile"
                              checked={selectedExternalBrokerage.w9_on_file || false}
                              onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'w9_on_file', e.target.checked)}
                              className="rounded border-gray-300"
                            />
                            <label htmlFor="w9OnFile" className="text-sm text-gray-700">W9 on File</label>
                          </div>
                          {selectedExternalBrokerage.w9_on_file && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Date Received</label>
                                <input
                                  type="date"
                                  value={selectedExternalBrokerage.w9_date_received || ''}
                                  onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'w9_date_received', e.target.value)}
                                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Federal ID Type</label>
                                <select
                                  value={selectedExternalBrokerage.federal_id_type || ''}
                                  onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'federal_id_type', e.target.value)}
                                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                                >
                                  <option value="">Select...</option>
                                  <option value="ein">EIN</option>
                                  <option value="ssn">SSN</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">EIN</label>
                                <input
                                  type="text"
                                  value={selectedExternalBrokerage.brokerage_ein || ''}
                                  onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'brokerage_ein', e.target.value)}
                                  placeholder="XX-XXXXXXX"
                                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="border-t border-gray-100 pt-4">
                        <label className="block text-xs text-gray-500 mb-1">Notes</label>
                        <textarea
                          value={selectedExternalBrokerage.notes || ''}
                          onChange={(e) => updateExternalBrokerage(selectedExternalBrokerage.id, 'notes', e.target.value)}
                          rows={3}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                    </div>
                  </div>
                ) : selectedAgent ? (
                  <div className="bg-white rounded-lg border border-gray-200 sticky top-8">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-medium text-gray-900">{selectedAgent.agent_name}</h3>
                      <p className="text-sm text-gray-500">{formatRole(selectedAgent.agent_role)}</p>
                    </div>
                    
                    {/* Commission Plan Selector - only for main agents */}
                    {['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(selectedAgent.agent_role) && !teamInfo.agreement && (
                      <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <p className="text-xs text-gray-500 mb-2">Commission Plan</p>
                        <select
                          value={selectedAgent.commission_plan_id || ''}
                          onChange={(e) => applyCommissionPlan(selectedAgent.id, e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-black"
                        >
                          <option value="">Select plan...</option>
                          {planOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {selectedAgent.commission_plan && (
                          <p className="text-xs text-gray-500 mt-1">
                            Current: {selectedAgent.commission_plan}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Team splits info */}
                    {teamInfo.agreement && ['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(selectedAgent.agent_role) && (
                      <div className="p-4 border-b border-gray-200 bg-blue-50">
                        <p className="text-xs text-blue-600 mb-1">Team Split Applied</p>
                        <p className="text-sm text-blue-900">
                          Based on {teamInfo.agreement.team_name} agreement
                        </p>
                      </div>
                    )}

                    <div className="p-4 space-y-4">
                      {/* Side Gross Reference */}
                      {transaction && (
                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          Side Gross: {formatCurrency(
                            ['listing_agent', 'co_listing_agent'].includes(selectedAgent.agent_role)
                              ? transaction.listing_side_commission
                              : transaction.buying_side_commission
                          )}
                        </div>
                      )}

                      {/* Input Fields */}
                      <div className="space-y-3">
                        <EditableFieldWithToggle
                          label="Agent Basis"
                          value={selectedAgent.agent_basis}
                          valueType={selectedAgent.agent_basis_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'agent_basis', value, type)}
                          baseAmount={
                            ['listing_agent', 'co_listing_agent'].includes(selectedAgent.agent_role)
                              ? transaction?.listing_side_commission
                              : transaction?.buying_side_commission
                          }
                        />
                        
                        <EditableFieldWithToggle
                          label="Pre-Split Deductions"
                          value={selectedAgent.pre_split_deductions}
                          valueType={selectedAgent.pre_split_deductions_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'pre_split_deductions', value, type)}
                          baseAmount={selectedAgent.agent_basis}
                        />
                        
                        <EditableFieldWithToggle
                          label="Split"
                          value={selectedAgent.split_percentage}
                          valueType={selectedAgent.split_percentage_type || 'percent'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'split_percentage', value, type)}
                          baseAmount={
                            (selectedAgent.agent_basis || 0) - (selectedAgent.pre_split_deductions || 0)
                          }
                          disabled={!!teamInfo.agreement}
                        />
                      </div>

                      {/* Calculated: Agent Gross */}
                      <div className="border-t border-gray-200 pt-3">
                        <EditableField
                          label="Agent Gross"
                          value={selectedAgent.agent_gross}
                          onSave={(value) => updateAgent(selectedAgent.id, 'agent_gross', value)}
                          type="currency"
                          highlight
                        />
                      </div>

                      {/* Post-Split Deductions */}
                      <div className="border-t border-gray-200 pt-3 space-y-3">
                        <p className="text-xs text-gray-500 font-medium">Post-Split Deductions</p>
                        
                        <EditableFieldWithToggle
                          label="Processing Fee"
                          value={selectedAgent.processing_fee}
                          valueType={selectedAgent.processing_fee_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'processing_fee', value, type)}
                          baseAmount={selectedAgent.agent_gross}
                        />
                        
                        <EditableFieldWithToggle
                          label="Coaching Fee"
                          value={selectedAgent.coaching_fee}
                          valueType={selectedAgent.coaching_fee_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'coaching_fee', value, type)}
                          baseAmount={selectedAgent.agent_gross}
                        />
                        
                        <EditableFieldWithToggle
                          label="Other Fees"
                          value={selectedAgent.other_fees}
                          valueType={selectedAgent.other_fees_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'other_fees', value, type)}
                          baseAmount={selectedAgent.agent_gross}
                        />
                        
                        <EditableFieldWithToggle
                          label="Rebate"
                          value={selectedAgent.rebate_amount}
                          valueType={selectedAgent.rebate_amount_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'rebate_amount', value, type)}
                          baseAmount={selectedAgent.agent_gross}
                        />
                      </div>

                      {/* Extra Income */}
                      <div className="border-t border-gray-200 pt-3">
                        <p className="text-xs text-gray-500 font-medium mb-3">Extra Income</p>
                        <EditableFieldWithToggle
                          label="BTSA"
                          value={selectedAgent.btsa_amount}
                          valueType={selectedAgent.btsa_amount_type || 'amount'}
                          onSave={(value, type) => updateAgentWithType(selectedAgent.id, 'btsa_amount', value, type)}
                          baseAmount={selectedAgent.agent_gross}
                        />
                      </div>

                      {/* Agent Net */}
                      <div className="border-t border-gray-200 pt-3 bg-gray-50 -mx-4 px-4 pb-4 -mb-4 rounded-b-lg">
                        <EditableField
                          label="Agent Net"
                          value={selectedAgent.agent_net}
                          onSave={(value) => updateAgent(selectedAgent.id, 'agent_net', value)}
                          type="currency"
                          highlight
                        />
                        {/* Team Lead Commission - show if non-zero */}
                        {selectedAgent.team_lead_commission != null && selectedAgent.team_lead_commission > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Team Lead Commission</p>
                            <p className="text-sm font-medium text-gray-900">{formatCurrency(selectedAgent.team_lead_commission)}</p>
                          </div>
                        )}
                      </div>

                      {/* Sales Volume & Units - only for main agents */}
                      {['listing_agent', 'co_listing_agent', 'buyers_agent'].includes(selectedAgent.agent_role) && (
                        <div className="border-t border-gray-200 pt-3 mt-4 space-y-3">
                          <p className="text-xs text-gray-500 font-medium">Volume & Units</p>
                          <div className="grid grid-cols-2 gap-4">
                            <EditableField
                              label="Sales Volume"
                              value={selectedAgent.sales_volume}
                              onSave={(value) => updateAgent(selectedAgent.id, 'sales_volume', value)}
                              type="currency"
                            />
                            <EditableField
                              label="Units"
                              value={selectedAgent.units || null}
                              onSave={(value) => updateAgent(selectedAgent.id, 'units', value)}
                              type="number"
                            />
                          </div>
                        </div>
                      )}

                      {/* Payment Status */}
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-xs text-gray-500">Payment Status</span>
                        <StatusBadge 
                          status={selectedAgent.payment_status} 
                          onSave={(value) => updateAgent(selectedAgent.id, 'payment_status', value)}
                          options={paymentStatusOptions}
                        />
                      </div>

                      {/* Remove Agent Button */}
                      <div className="pt-4 mt-4 border-t border-gray-200">
                        <button
                          onClick={() => removeAgent(selectedAgent.id)}
                          className="w-full px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Remove Agent
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center text-gray-500 text-sm">
                    Select an agent to view details
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'contacts' && (
          <div className="p-8 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-medium text-gray-900">Contacts</h1>
                <p className="text-sm text-gray-500">Manage contacts on this transaction</p>
              </div>
              <button className="btn btn-primary text-sm flex items-center gap-2">
                <Plus size={16} />
                Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Users size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 mb-4">No contacts added to this transaction</p>
                <button className="btn btn-primary text-sm">
                  Add First Contact
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {contacts.map((contact) => (
                  <div key={contact.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">
                        {formatStatus(contact.contact_type)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                      <EditableField
                        label="Name"
                        value={contact.name}
                        onSave={(value) => updateContact(contact.id, 'name', value)}
                        placeholder="Add name"
                      />
                      <MultiValueField
                        label="Email"
                        values={contact.email}
                        onSave={(values) => updateContact(contact.id, 'email', values.length > 0 ? values : null)}
                        type="email"
                      />
                      <MultiValueField
                        label="Phone"
                        values={contact.phone}
                        onSave={(values) => updateContact(contact.id, 'phone', values.length > 0 ? values : null)}
                        type="phone"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'flyers' && (
          <div className="p-8 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-medium text-gray-900">Flyers</h1>
                <p className="text-sm text-gray-500">Track flyer requests for this transaction</p>
              </div>
              <div className="flex gap-2">
                {FLYER_TYPE_OPTIONS.map(opt => {
                  const existing = flyers.find(f => f.flyer_type === opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => !existing && requestFlyer(opt.value)}
                      disabled={!!existing}
                      className={`px-3 py-2 text-sm rounded flex items-center gap-2 ${
                        existing 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      <Plus size={14} />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {flyers.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <FileText size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 mb-4">No flyers requested for this transaction</p>
                <p className="text-sm text-gray-400">Click a button above to request a flyer</p>
              </div>
            ) : (
              <div className="space-y-4">
                {flyers.map(flyer => (
                  <div key={flyer.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {FLYER_TYPE_OPTIONS.find(o => o.value === flyer.flyer_type)?.label || flyer.flyer_type}
                        </span>
                        <StatusBadge
                          status={flyer.status}
                          onSave={(value) => updateFlyerStatus(flyer.id, value)}
                          options={FLYER_STATUS_OPTIONS}
                        />
                      </div>
                      <button
                        onClick={() => deleteFlyer(flyer.id)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Requested</p>
                        <p>{formatDate(flyer.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Requested By</p>
                        <p>{flyer.requested_by_name || '--'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sent Date</p>
                        <p>{flyer.sent_date ? formatDate(flyer.sent_date) : '--'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'documents' && (
          <div className="p-8 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-medium text-gray-900">Documents</h1>
                <p className="text-sm text-gray-500">Manage transaction documents</p>
              </div>
              <button className="btn btn-primary text-sm flex items-center gap-2">
                <Plus size={16} />
                Upload Document
              </button>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <FileText size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Document management coming soon</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Agent Modal */}
      {showAddAgentModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-medium">Add Agent to Transaction</h2>
              <button 
                onClick={() => setShowAddAgentModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-auto">
              {/* Agent Search */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Agent
                </label>
                <input
                  type="text"
                  value={agentSearchQuery}
                  onChange={(e) => setAgentSearchQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              {/* Agent List */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Agent
                </label>
                <div className="border border-gray-300 rounded max-h-48 overflow-auto">
                  {filteredAvailableAgents.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      No agents found
                    </div>
                  ) : (
                    filteredAvailableAgents.map(agent => {
                      const name = agent.preferred_first_name && agent.preferred_last_name
                        ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
                        : `${agent.first_name} ${agent.last_name}`
                      const isSelected = selectedNewAgent?.id === agent.id
                      const isAlreadyOnTransaction = agents.some(a => a.agent_id === agent.id)
                      
                      return (
                        <div
                          key={agent.id}
                          onClick={() => !isAlreadyOnTransaction && setSelectedNewAgent(agent)}
                          className={`p-3 border-b border-gray-100 last:border-0 cursor-pointer flex items-center justify-between ${
                            isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'
                          } ${isAlreadyOnTransaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm text-gray-600">
                              {name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{name}</p>
                              <p className="text-xs text-gray-500">{agent.email}</p>
                            </div>
                          </div>
                          {isAlreadyOnTransaction && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              Already added
                            </span>
                          )}
                          {isSelected && !isAlreadyOnTransaction && (
                            <Check size={16} className="text-green-600" />
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Role Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent Role
                </label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <option value="">Select role...</option>
                  {AGENT_ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Processing Fee Type Selection */}
              {selectedNewAgent && selectedNewRole && (() => {
                const planCode = selectedNewAgent.commission_plan?.toLowerCase() || ''
                // Don't show for plans with fixed fees (self-investment, lease plans)
                const hasFixedFee = planCode.includes('self') || planCode.includes('lease') || planCode === '95_5_self' || planCode === '85_15_lease' || planCode === '75_25_lead_lease'
                // Don't show for roles that don't have processing fees
                const roleHasNoFee = ROLES_WITHOUT_PROCESSING_FEE.includes(selectedNewRole)
                
                if (hasFixedFee || roleHasNoFee) return null
                
                return (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Processing Fee Type
                    </label>
                    <select
                      value={selectedProcessingFeeType}
                      onChange={(e) => setSelectedProcessingFeeType(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                    >
                      <option value="">Select fee type...</option>
                      {processingFeeTypes.map(feeType => (
                        <option key={feeType.id} value={feeType.id}>
                          {feeType.name} - {formatCurrency(feeType.processing_fee)}
                        </option>
                      ))}
                    </select>
                    {selectedProcessingFeeType && (
                      <p className="text-xs text-gray-500 mt-1">
                        Processing fee: {formatCurrency(processingFeeTypes.find(t => t.id === selectedProcessingFeeType)?.processing_fee || 0)}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Selected Agent Preview */}
              {selectedNewAgent && selectedNewRole && (
                <div className="bg-gray-50 rounded p-3 mb-4">
                  <p className="text-sm text-gray-600">
                    Adding <span className="font-medium">
                      {selectedNewAgent.preferred_first_name || selectedNewAgent.first_name} {selectedNewAgent.preferred_last_name || selectedNewAgent.last_name}
                    </span> as <span className="font-medium">{formatRole(selectedNewRole)}</span>
                  </p>
                  {selectedNewAgent.commission_plan && (
                    <p className="text-xs text-gray-500 mt-1">
                      Default commission plan: {selectedNewAgent.commission_plan}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAddAgentModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addAgentToTransaction}
                disabled={!selectedNewAgent || !selectedNewRole || addingAgent || (() => {
                  // Check if processing fee type is required
                  const planCode = selectedNewAgent?.commission_plan?.toLowerCase() || ''
                  const hasFixedFee = planCode.includes('self') || planCode.includes('lease') || planCode === '95_5_self' || planCode === '85_15_lease' || planCode === '75_25_lead_lease'
                  const roleHasNoFee = ROLES_WITHOUT_PROCESSING_FEE.includes(selectedNewRole)
                  // If not a fixed fee plan and role requires fee, require processing fee type selection
                  return !hasFixedFee && !roleHasNoFee && !selectedProcessingFeeType
                })()}
                className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingAgent ? 'Adding...' : 'Add Agent'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add External Brokerage Modal */}
      {showAddExternalModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-medium">Add External Brokerage</h3>
              <button onClick={() => setShowAddExternalModal(false)}>
                <X size={20} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Search Existing Brokerages */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Existing Brokerages</label>
                <input
                  type="text"
                  value={brokerageSearchQuery}
                  onChange={(e) => setBrokerageSearchQuery(e.target.value)}
                  placeholder="Type to search by brokerage name..."
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                />
                {brokerageSearchQuery && existingBrokerages.filter(b => 
                  b.brokerage_name?.toLowerCase().includes(brokerageSearchQuery.toLowerCase())
                ).length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded max-h-40 overflow-y-auto">
                    {existingBrokerages
                      .filter(b => b.brokerage_name?.toLowerCase().includes(brokerageSearchQuery.toLowerCase()))
                      .map(b => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setSelectedExistingBrokerage(b)
                            setBrokerageSearchQuery('')
                          }}
                          className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                        >
                          <p className="text-sm font-medium">{b.brokerage_name}</p>
                          <p className="text-xs text-gray-500">
                            {b.brokerage_city && b.brokerage_state && `${b.brokerage_city}, ${b.brokerage_state}`}
                            {b.brokerage_ein && ` • EIN: ${b.brokerage_ein}`}
                            {b.w9_on_file && ' • W9 ✓'}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Selected Existing Brokerage */}
              {selectedExistingBrokerage && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-800">{selectedExistingBrokerage.brokerage_name}</p>
                      <p className="text-xs text-green-600">
                        {selectedExistingBrokerage.brokerage_city && selectedExistingBrokerage.brokerage_state && 
                          `${selectedExistingBrokerage.brokerage_city}, ${selectedExistingBrokerage.brokerage_state}`}
                        {selectedExistingBrokerage.brokerage_ein && ` • EIN: ${selectedExistingBrokerage.brokerage_ein}`}
                        {selectedExistingBrokerage.w9_on_file && ' • W9 on file'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedExistingBrokerage(null)}
                      className="text-green-600 hover:text-green-800"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Divider */}
              {!selectedExistingBrokerage && (
                <div className="flex items-center gap-3 text-gray-400">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs">or add new brokerage</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
              )}

              {/* Brokerage Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brokerage Role *</label>
                <select
                  value={selectedExistingBrokerage?.brokerage_role || newBrokerageForm.brokerage_role || 'coop_broker'}
                  onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_role: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                >
                  {EXTERNAL_BROKERAGE_TYPES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Brokerage Details - only show if not using existing */}
              {!selectedExistingBrokerage && (
                <>
                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Brokerage Details</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Brokerage Name *</label>
                        <input
                          type="text"
                          value={newBrokerageForm.brokerage_name || ''}
                          onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_name: e.target.value })}
                          placeholder="e.g., Keller Williams Realty"
                          className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">DBA Name</label>
                        <input
                          type="text"
                          value={newBrokerageForm.brokerage_dba || ''}
                          onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_dba: e.target.value })}
                          className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">EIN</label>
                        <input
                          type="text"
                          value={newBrokerageForm.brokerage_ein || ''}
                          onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_ein: e.target.value })}
                          placeholder="XX-XXXXXXX"
                          className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Address</label>
                        <input
                          type="text"
                          value={newBrokerageForm.brokerage_address || ''}
                          onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_address: e.target.value })}
                          className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">City</label>
                          <input
                            type="text"
                            value={newBrokerageForm.brokerage_city || ''}
                            onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_city: e.target.value })}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">State</label>
                          <input
                            type="text"
                            value={newBrokerageForm.brokerage_state || ''}
                            onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_state: e.target.value })}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Zip</label>
                          <input
                            type="text"
                            value={newBrokerageForm.brokerage_zip || ''}
                            onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, brokerage_zip: e.target.value })}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Broker Contact</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Broker Name</label>
                        <input
                          type="text"
                          value={newBrokerageForm.broker_name || ''}
                          onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, broker_name: e.target.value })}
                          className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Broker Phone</label>
                          <input
                            type="text"
                            value={newBrokerageForm.broker_phone || ''}
                            onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, broker_phone: e.target.value })}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Broker Email</label>
                          <input
                            type="email"
                            value={newBrokerageForm.broker_email || ''}
                            onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, broker_email: e.target.value })}
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">W9 Information</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="newW9OnFile"
                        checked={newBrokerageForm.w9_on_file || false}
                        onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, w9_on_file: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor="newW9OnFile" className="text-sm text-gray-700">W9 on File</label>
                    </div>
                  </div>
                </>
              )}

              {/* Transaction-specific fields (always shown) */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Transaction Details</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Their Agent on This Deal</label>
                    <input
                      type="text"
                      value={newBrokerageForm.agent_name || ''}
                      onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, agent_name: e.target.value })}
                      placeholder="Agent name"
                      className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Agent Phone</label>
                      <input
                        type="text"
                        value={newBrokerageForm.agent_phone || ''}
                        onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, agent_phone: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Agent Email</label>
                      <input
                        type="email"
                        value={newBrokerageForm.agent_email || ''}
                        onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, agent_email: e.target.value })}
                        className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Commission Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newBrokerageForm.commission_amount || ''}
                      onChange={(e) => setNewBrokerageForm({ ...newBrokerageForm, commission_amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={() => setShowAddExternalModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedExistingBrokerage) {
                    // Use existing brokerage data + new transaction-specific data
                    handleAddExternalBrokerage({
                      ...selectedExistingBrokerage,
                      brokerage_role: newBrokerageForm.brokerage_role || selectedExistingBrokerage.brokerage_role,
                      agent_name: newBrokerageForm.agent_name,
                      agent_phone: newBrokerageForm.agent_phone,
                      agent_email: newBrokerageForm.agent_email,
                      commission_amount: newBrokerageForm.commission_amount || 0,
                      amount_1099_reportable: newBrokerageForm.commission_amount || 0,
                    })
                  } else {
                    // Use new brokerage form data
                    handleAddExternalBrokerage({
                      ...newBrokerageForm,
                      amount_1099_reportable: newBrokerageForm.commission_amount || 0,
                    })
                  }
                }}
                disabled={addingExternalBrokerage || (!selectedExistingBrokerage && !newBrokerageForm.brokerage_name)}
                className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingExternalBrokerage ? 'Adding...' : 'Add Brokerage'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}