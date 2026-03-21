'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  preferred_first_name: string
  preferred_last_name: string
  role: string
  roles?: string[]
  office?: string
  commission_plan?: string
  full_nav_access?: boolean
  status?: string
  is_active?: boolean
  headshot_url?: string
  headshot_crop?: any
  qualifying_transaction_count?: number
  cap_progress?: number
  join_date?: string
  division?: string
  monthly_fee_paid_through?: string
}

interface AuthContextType {
  user: User | null
  permissions: string[]
  loading: boolean
  error: string | null
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAuth = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/auth/me')

      if (!response.ok) {
        // Not authenticated - this is expected on public pages
        setUser(null)
        setPermissions([])
        return
      }

      const data = await response.json()
      setUser(data.user)
      setPermissions(data.permissions || [])
    } catch (err) {
      setError('Failed to fetch auth')
      setUser(null)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuth()
  }, [])

  const hasPermission = (code: string): boolean => {
    return permissions.includes(code)
  }

  const hasAnyPermission = (codes: string[]): boolean => {
    return codes.some(code => permissions.includes(code))
  }

  const hasAllPermissions = (codes: string[]): boolean => {
    return codes.every(code => permissions.includes(code))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        loading,
        error,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        refetch: fetchAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
