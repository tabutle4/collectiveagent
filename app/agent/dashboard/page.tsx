'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentDashboard() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/agent/profile')
  }, [router])
  return null
}
