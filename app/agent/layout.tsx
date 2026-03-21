'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'
import { useAuth } from '@/lib/context/AuthContext'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
      return
    }

    if (!loading && user && pathname !== '/agent/fees') {
      // Fee is waived for division agents
      if (!user.division) {
        // Only redirect if they've paid before but are now overdue
        if (user.monthly_fee_paid_through) {
          const paidThrough = new Date(user.monthly_fee_paid_through)
          if (paidThrough < new Date()) {
            router.push('/agent/fees?unpaid=true')
            return
          }
        }
      }
    }
  }, [loading, user, router, pathname])

  if (loading) return null

  return <AppSidebar>{children}</AppSidebar>
}
