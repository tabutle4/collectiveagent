/**
 * Textarea Component
 * 
 * Usage:
 * <Textarea label="Message" placeholder="Enter your message" rows={4} required />
 * <Textarea label="Description" error="Description is required" />
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  required?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, required, className, id, rows = 4, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm mb-2 text-luxury-gray-1"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(
            'w-full px-3 py-2 text-sm border rounded transition-colors duration-200 resize-y min-h-[80px]',
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

Textarea.displayName = 'Textarea'

export default Textarea

