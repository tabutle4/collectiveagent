'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
      } catch {
        router.push('/auth/login')
      }
    }
    fetchUser()
  }, [router])

  return <AppSidebar>{children}</AppSidebar>
}