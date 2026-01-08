/**
 * Select Component
 * 
 * Usage:
 * <Select label="Country" options={['USA', 'Canada', 'Mexico']} placeholder="Select a country" />
 * <Select label="Status" options={statusOptions} error="Please select a status" required />
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: string[] | SelectOption[]
  placeholder?: string
  error?: string
  required?: boolean
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, error, required, className, id, ...props }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`
    
    const normalizeOptions = (): SelectOption[] => {
      return options.map(opt => {
        if (typeof opt === 'string') {
          return { value: opt, label: opt }
        }
        return opt
      })
    }
    
    const normalizedOptions = normalizeOptions()
    
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm mb-2 text-luxury-gray-1"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full px-3 py-2 text-sm border rounded transition-colors duration-200 bg-white',
            'focus:outline-none focus:ring-1',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-luxury-gray-5 focus:border-luxury-black focus:ring-luxury-black',
            props.disabled && 'bg-luxury-light cursor-not-allowed opacity-60',
            className
          )}
          required={required}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {normalizedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select

