'use client'

import { useState, useEffect } from 'react'
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
  /**
   * Fires whenever the address becomes complete or incomplete, so the form can
   * block submit. Incomplete includes not having answered the unit question.
   */
  onValidityChange?: (isComplete: boolean) => void
}

/**
 * Structured property address input. Replaces the single free text address box
 * so a malformed address can never be saved.
 *
 * The state field accepts anything the agent types ("texas", "Texas", "tx") and
 * normalizes to "TX" when they leave the field.
 *
 * The unit question is deliberately a yes/no rather than an optional box. A
 * blank unit box is ambiguous: it could mean "no unit" or "I skipped it".
 * Forcing an answer removes the ambiguity. The yes/no itself is not stored
 * anywhere; only the unit value is.
 *
 * Pasting is blocked on every field. A pasted address carries whatever
 * formatting it had at the source, which is what makes the same property show
 * up two ways and breaks address matching later. Typing it out forces the
 * agent to read what they are entering.
 */
export default function AddressInput({
  value,
  onChange,
  required = false,
  disabled = false,
  onValidityChange,
}: Props) {
  // null means the agent has not answered yet. Seeded to true when a unit is
  // already present, so editing an existing address does not re-ask.
  const [hasUnit, setHasUnit] = useState<boolean | null>(value.unit ? true : null)

  // Shown for a few seconds after a blocked paste so the field does not just
  // silently ignore the agent.
  const [pasteBlocked, setPasteBlocked] = useState(false)
  useEffect(() => {
    if (!pasteBlocked) return
    const t = setTimeout(() => setPasteBlocked(false), 4000)
    return () => clearTimeout(t)
  }, [pasteBlocked])

  // Paste and drag-drop are both blocked. Drop is the same bypass by another
  // route, so blocking only paste would leave the hole open.
  const noPaste = {
    onPaste: (e: React.ClipboardEvent) => { e.preventDefault(); setPasteBlocked(true) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setPasteBlocked(true) },
  }

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

  const answerUnit = (answer: boolean) => {
    setHasUnit(answer)
    // Saying no clears anything typed, so a stray value cannot be saved on a
    // property that has no unit.
    if (!answer && value.unit) onChange({ ...value, unit: '' })
  }

  const stateLooksWrong = value.state.trim().length > 0 && !normalizeState(value.state)

  const isComplete =
    !!value.street_address.trim() &&
    !!value.city.trim() &&
    !!normalizeState(value.state) &&
    !!value.zip.trim() &&
    hasUnit !== null &&
    (hasUnit === false || !!value.unit.trim())

  useEffect(() => {
    onValidityChange?.(isComplete)
  }, [isComplete, onValidityChange])

  return (
    <div className="space-y-3">
      {pasteBlocked && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5">
          Please type the address instead of pasting it. Pasted addresses keep the
          formatting they came with, which stops the same property from matching
          across the app.
        </div>
      )}
      <div>
        <label className="block text-sm mb-2 text-luxury-gray-1">
          Street Address {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={value.street_address}
          onChange={e => set('street_address', e.target.value)}
          {...noPaste}
          className="input-luxury"
          placeholder="1303 Gardenia Drive"
          required={required}
          disabled={disabled}
        />
      </div>

      <div>
        <label className="block text-sm mb-2 text-luxury-gray-1">
          Does this property have a unit or apartment number?{' '}
          {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => answerUnit(true)}
            disabled={disabled}
            className={`px-4 py-2 text-xs rounded border transition-colors ${
              hasUnit === true
                ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-4'
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => answerUnit(false)}
            disabled={disabled}
            className={`px-4 py-2 text-xs rounded border transition-colors ${
              hasUnit === false
                ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-4'
            }`}
          >
            No
          </button>
        </div>
        {hasUnit === null && (
          <p className="text-xs text-luxury-gray-3 mt-1">
            Answer this so we know the address is complete.
          </p>
        )}
      </div>

      {hasUnit === true && (
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            Unit or Apt {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={value.unit}
            onChange={e => set('unit', e.target.value)}
            {...noPaste}
            className="input-luxury"
            placeholder="B110"
            required={required}
            disabled={disabled}
            autoFocus
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            City {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={value.city}
            onChange={e => set('city', e.target.value)}
            {...noPaste}
            className="input-luxury"
            placeholder="Houston"
            required={required}
            disabled={disabled}
          />
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
            {...noPaste}
            className="input-luxury"
            placeholder="77018"
            required={required}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm mb-2 text-luxury-gray-1">
          State {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={value.state}
          onChange={e => set('state', e.target.value)}
          {...noPaste}
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
    </div>
  )
}
