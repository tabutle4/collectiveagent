'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentNewTransactionRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/transactions/new') }, [router])
  return null
}