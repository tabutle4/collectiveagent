'use client'

const PAYMENT_METHOD_OPTIONS = [
  { value: 'check', label: 'Check' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'payload', label: 'Payload' },
  { value: 'ecommission', label: 'eCommission' },
] as const

const COMPLIANCE_STATUS_OPTIONS = [
  { value: 'not_submitted', label: 'Not Requested' },
  { value: 'in_review', label: 'In Review' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'complete', label: 'Complete' },
] as const

export interface CheckFieldsValue {
  check_amount?: number | string | null
  check_from?: string | null
  check_number?: string | null
  check_date?: string | null
  received_date?: string | null
  deposited_date?: string | null
  cleared_date?: string | null
  compliance_complete_date?: string | null
  brokerage_amount?: number | string | null
  hold_amount?: number | string | null
  payment_method?: string | null
  status?: string | null
  compliance_status?: string | null
  crc_transferred?: boolean | null
  notes?: string | null
}

interface Props {
  value: CheckFieldsValue
  onChange: (field: keyof CheckFieldsValue, value: any) => void
}

export default function CheckFieldsForm({ value, onChange }: Props) {
  const status = value.status || 'received'

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="field-label">Check Amount</label>
          <input
            type="number"
            step="0.01"
            className="input-luxury text-xs"
            value={value.check_amount ?? ''}
            onChange={e => onChange('check_amount', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Check From</label>
          <input
            type="text"
            className="input-luxury text-xs"
            value={value.check_from || ''}
            onChange={e => onChange('check_from', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Check #</label>
          <input
            type="text"
            className="input-luxury text-xs"
            value={value.check_number || ''}
            onChange={e => onChange('check_number', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Check Date</label>
          <input
            type="date"
            className="input-luxury text-xs"
            value={value.check_date || ''}
            onChange={e => onChange('check_date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Received</label>
          <input
            type="date"
            className="input-luxury text-xs"
            value={value.received_date || ''}
            onChange={e => onChange('received_date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Deposited</label>
          <input
            type="date"
            className="input-luxury text-xs"
            value={value.deposited_date || ''}
            onChange={e => onChange('deposited_date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Cleared</label>
          <input
            type="date"
            className="input-luxury text-xs"
            value={value.cleared_date || ''}
            onChange={e => onChange('cleared_date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Compliance Complete</label>
          {/* Read only: the compliance page owns this date. It is written when
              a deal's compliance is marked complete there, and cleared when it
              is reopened, so the pay-by deadline always matches the sign-off. */}
          <p className="text-xs text-luxury-gray-1 py-2">
            {value.compliance_complete_date
              ? new Date(value.compliance_complete_date + 'T12:00:00').toLocaleDateString('en-US')
              : '-'}
          </p>
          <p className="text-[11px] text-luxury-gray-3">Set on the compliance page</p>
        </div>
        <div>
          <label className="field-label">Brokerage Amount</label>
          <input
            type="number"
            step="0.01"
            className="input-luxury text-xs"
            value={value.brokerage_amount ?? ''}
            onChange={e => onChange('brokerage_amount', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">On Hold Amount</label>
          <input
            type="number"
            step="0.01"
            className="input-luxury text-xs"
            value={value.hold_amount ?? ''}
            onChange={e => onChange('hold_amount', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="field-label">Payment Type</label>
          <select
            className="select-luxury text-xs"
            value={value.payment_method || 'check'}
            onChange={e => onChange('payment_method', e.target.value)}
          >
            {PAYMENT_METHOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Funds Status</label>
          <div className="input-luxury text-xs flex items-center" title="Set automatically from the dates above">
            <span className={`font-medium capitalize ${
              status === 'cleared' ? 'text-green-600' :
              status === 'deposited' ? 'text-blue-600' : 'text-amber-600'
            }`}>
              {status}
            </span>
          </div>
        </div>
        <div>
          <label className="field-label">Compliance Status</label>
          {/* Read only: the compliance page owns this status. */}
          <p className="text-xs text-luxury-gray-1 py-2">
            {COMPLIANCE_STATUS_OPTIONS.find(o => o.value === (value.compliance_status || 'not_submitted'))?.label
              || value.compliance_status
              || 'Not submitted'}
          </p>
          <p className="text-[11px] text-luxury-gray-3">Set on the compliance page</p>
        </div>
      </div>

      <div className="flex items-center justify-between inner-card mb-3">
        <div>
          <p className="text-xs font-semibold text-luxury-gray-1">Payment Processed</p>
          <p className="text-xs text-luxury-gray-3">
            Moves to Recently Paid until marked paid
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange('crc_transferred', !value.crc_transferred)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${value.crc_transferred ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value.crc_transferred ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      <div>
        <label className="field-label">Notes</label>
        <textarea
          className="input-luxury text-xs"
          rows={2}
          value={value.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
        />
      </div>
    </>
  )
}
