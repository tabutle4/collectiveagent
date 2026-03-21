'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppSidebar from '@/components/shared/AppSidebar'
import { useAuth } from '@/lib/context/AuthContext'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [loading, user, router])

  if (loading) return null

  return <AppSidebar>{children}</AppSidebar>
}