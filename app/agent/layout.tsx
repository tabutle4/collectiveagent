'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'
import { useAuth } from '@/lib/context/AuthContext'
import { isMonthlyFeeOverdue } from '@/lib/date-utils'

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
      // monthly_fee_waived is not on the AuthContext User type yet; it is
      // returned by /api/auth/me. Cast just that field rather than widening
      // the shared type in this patch.
      if (
        isMonthlyFeeOverdue(user.monthly_fee_paid_through, {
          waived: (user as { monthly_fee_waived?: boolean }).monthly_fee_waived,
          division: user.division,
        })
      ) {
        router.push('/agent/fees?unpaid=true')
        return
      }
    }
  }, [loading, user, router, pathname])

  if (loading) return null

  return <AppSidebar>{children}</AppSidebar>
}
