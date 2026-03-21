'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'
import { getAppRole } from '@/lib/transactions/role'

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }

        const { user } = await response.json()
        const role = getAppRole(user)

        // Monthly fee redirect — agents only, not TC/admin/broker
        if (role === 'agent' && pathname !== '/agent/fees') {
          if (!user.monthly_fee_waived && !user.division) {
            if (user.monthly_fee_paid_through) {
              const paidThrough = new Date(user.monthly_fee_paid_through)
              if (paidThrough < new Date()) {
                router.push('/agent/fees?unpaid=true')
                return
              }
            }
          }
        }
      } catch {
        router.push('/auth/login')
      }
    }
    fetchUser()
  }, [router, pathname])

  return <AppSidebar>{children}</AppSidebar>
}
