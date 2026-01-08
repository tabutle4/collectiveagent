/**
 * Input Component
 * 
 * Usage:
 * <Input type="text" label="Name" placeholder="Enter your name" required />
 * <Input type="email" label="Email" error="Invalid email" />
 * <Input type="phone" label="Phone" disabled />
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  required?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type = 'text', label, error, required, className, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm mb-2 text-luxury-gray-1"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            'w-full px-3 py-2 text-sm border rounded transition-colors duration-200',
            'focus:outline-none focus:ring-1',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-luxury-gray-5 focus:border-luxury-black focus:ring-luxury-black',
            props.disabled && 'bg-luxury-light cursor-not-allowed opacity-60',
            className
          )}
          required={required}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input

