'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Click-to-edit primitive with dashed gold underline on the displayed value.
 * Click → becomes an input/select. Blur or Enter → saves. ESC → cancels.
 * Locked state removes the dashed underline and hover effect.
 *
 * Used for: commission basis, commission plan, lead source on agent cards.
 */
export default function InlineField({
  value,
  displayValue,
  onSave,
  type = 'text',
  options,
  placeholder,
  locked = false,
  invalid = false,
  width = 'auto',
  prefix,
  suffix,
}: {
  value: string | number | null
  displayValue?: string
  onSave: (newValue: string) => Promise<void> | void
  type?: 'text' | 'number' | 'currency' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  locked?: boolean
  invalid?: boolean
  width?: string
  prefix?: string
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value == null ? '' : String(value))
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        if (type === 'select') {
          selectRef.current?.focus()
        } else {
          inputRef.current?.focus()
          inputRef.current?.select()
        }
      }, 10)
    }
  }, [editing, type])

  const commit = async () => {
    if (saving) return
    if (draft === String(value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch {
      // keep editing; caller shows toast/error
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(value == null ? '' : String(value))
    setEditing(false)
  }

  const shown = displayValue ?? (value == null || value === '' ? (placeholder || '--') : String(value))

  if (locked) {
    return (
      <span className="text-luxury-gray-1">
        {prefix}{shown}{suffix}
      </span>
    )
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-luxury-gray-1 hover:text-luxury-black cursor-pointer"
        style={{
          borderBottom: `1px dashed ${invalid ? '#b91c1c' : '#C5A278'}`,
          paddingBottom: '1px',
          background: 'transparent',
          border: 'none',
          borderBottomWidth: '1px',
          borderBottomStyle: 'dashed',
          borderBottomColor: invalid ? '#b91c1c' : '#C5A278',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          padding: 0,
        }}
      >
        {prefix}{shown}{suffix}
      </button>
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={selectRef}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        className="select-luxury text-xs"
        style={{ width: width || '200px', padding: '4px 8px' }}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type === 'currency' || type === 'number' ? 'text' : type}
      inputMode={type === 'currency' || type === 'number' ? 'decimal' : undefined}
      value={draft}
      disabled={saving}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') cancel()
      }}
      className="input-luxury text-xs text-right"
      style={{ width: width || '120px', padding: '4px 8px' }}
    />
  )
}
