/**
 * Button Component
 * 
 * Usage:
 * <Button variant="primary" size="md" onClick={handleClick}>Click me</Button>
 * <Button variant="danger" size="sm" disabled>Delete</Button>
 * <Button variant="outline" size="lg" loading>Submit</Button>
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded transition-colors font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
    
    const variants = {
      primary: 'bg-luxury-black text-white hover:opacity-90 focus:ring-luxury-black shadow-sm',
      secondary: 'bg-luxury-gray-5 text-luxury-gray-1 hover:bg-luxury-gray-4 focus:ring-luxury-gray-3',
      outline: 'bg-white border-2 border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black focus:ring-luxury-black',
      ghost: 'bg-transparent text-luxury-gray-1 hover:bg-luxury-light focus:ring-luxury-gray-3',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    }
    
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    }
    
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button

