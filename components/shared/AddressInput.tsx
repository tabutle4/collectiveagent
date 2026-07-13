'use client'

import { normalizeState } from '@/lib/transactions/utils'

export interface AddressFields {
  street_address: string
  unit: string
  city: string
  state: string
  zip: string
}

interface Props {
  value: AddressFields
  onChange: (next: AddressFields) => void
  required?: boolean
  disabled?: boolean
}

/**
 * Structured property address input. Replaces the single free text address box
 * so a malformed address can never be saved. The state field accepts anything
 * the agent types ("texas", "Texas", "tx") and normalizes to "TX" when they
 * leave the field.
 */
export default function AddressInput({ value, onChange, required = false, disabled = false }: Props) {
  const set = (key: keyof AddressFields, v: string) => {
    onChange({ ...value, [key]: v })
  }

  // Auto-correct the state when the agent leaves the field. Typing is free.
  const handleStateBlur = () => {
    const fixed = normalizeState(value.state)
    if (fixed && fixed !== value.state) {
      onChange({ ...value, state: fixed })
    }
  }

  const stateLooksWrong = value.state.trim().length > 0 && !normalizeState(value.state)

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm mb-2 text-luxury-gray-1">
          Street Address {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={value.street_address}
          onChange={e => set('street_address', e.target.value)}
          className="input-luxury"
          placeholder="1303 Gardenia Drive"
          required={required}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">Unit or Apt</label>
          <input
            type="text"
            value={value.unit}
            onChange={e => set('unit', e.target.value)}
            className="input-luxury"
            placeholder="B110"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            City {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={value.city}
            onChange={e => set('city', e.target.value)}
            className="input-luxury"
            placeholder="Houston"
            required={required}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            State {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={value.state}
            onChange={e => set('state', e.target.value)}
            onBlur={handleStateBlur}
            className="input-luxury"
            placeholder="TX"
            required={required}
            disabled={disabled}
          />
          {stateLooksWrong ? (
            <p className="text-xs text-red-600 mt-1">
              Not a state we recognize. Try Texas or TX.
            </p>
          ) : (
            <p className="text-xs text-luxury-gray-3 mt-1">
              Type the name or the abbreviation.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            Zip {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={value.zip}
            onChange={e => set('zip', e.target.value)}
            className="input-luxury"
            placeholder="77018"
            required={required}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
