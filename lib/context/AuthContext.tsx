'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

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
  join_date?: string
  division?: string
  monthly_fee_paid_through?: string
}

interface LoginCredentials {
  email: string
  password: string
}

interface LoginResult {
  success: boolean
  error?: string
  redirectTo?: string
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
  login: (credentials: LoginCredentials) => Promise<LoginResult>
  logout: () => Promise<void>
  clearAuth: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAuth = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/auth/me')
      if (!response.ok) {
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
  }, [])

  useEffect(() => {
    fetchAuth()
  }, [fetchAuth])

  const clearAuth = useCallback(() => {
    setUser(null)
    setPermissions([])
    setError(null)
  }, [])

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginResult> => {
      try {
        // Clear any existing auth state first
        setUser(null)
        setPermissions([])
        setError(null)

        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        })

        const data = await response.json()

        if (!response.ok) {
          return { success: false, error: data.error || 'Login failed' }
        }

        // Fetch fresh user data after successful login
        await fetchAuth()

        return { success: true, redirectTo: data.redirectTo }
      } catch (err) {
        return { success: false, error: 'An error occurred during login' }
      }
    },
    [fetchAuth]
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      setPermissions([])
      setError(null)
    }
  }, [])

  const hasPermission = useCallback(
    (code: string): boolean => {
      return permissions.includes(code)
    },
    [permissions]
  )

  const hasAnyPermission = useCallback(
    (codes: string[]): boolean => {
      return codes.some(code => permissions.includes(code))
    },
    [permissions]
  )

  const hasAllPermissions = useCallback(
    (codes: string[]): boolean => {
      return codes.every(code => permissions.includes(code))
    },
    [permissions]
  )

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
        login,
        logout,
        clearAuth,
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