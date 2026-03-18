'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

        // Only redirect if not already on fees page
        if (pathname !== '/agent/fees') {
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
      } catch {
        router.push('/auth/login')
      }
    }
    fetchUser()
  }, [router, pathname])

  return <AppSidebar>{children}</AppSidebar>
}