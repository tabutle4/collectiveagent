/**
 * Card Component
 * 
 * Usage:
 * <Card>Content here</Card>
 * <Card variant="bordered">Bordered card</Card>
 * <Card variant="elevated">Elevated card</Card>
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated'
  children: React.ReactNode
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    const variants = {
      default: 'bg-white shadow-sm border border-gray-300 rounded',
      bordered: 'bg-white border-2 border-gray-300 rounded',
      elevated: 'bg-white shadow-md border border-luxury-gray-5 rounded',
    }
    
    return (
      <div
        ref={ref}
        className={cn(variants[variant], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export default Card

