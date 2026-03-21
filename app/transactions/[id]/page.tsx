'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAppRole, AppRole } from '@/lib/transactions/role'

export default function TransactionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<AppRole>('agent')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          router.push('/auth/login')
          return
        }
        const data = await res.json()
        setUser(data.user)
        setRole(getAppRole(data.user))
      } catch {
        router.push('/auth/login')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  // TODO: render TransactionDetail component with id, user, and role props
  return (
    <div>
      <p className="text-sm text-luxury-gray-3">
        Transaction {id} — role: {role}
      </p>
    </div>
  )
}
