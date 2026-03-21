import { useState, useEffect } from 'react'

interface UsePermissionsResult {
  user: any | null
  permissions: string[]
  loading: boolean
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
}

export function usePermissions(): UsePermissionsResult {
  const [user, setUser] = useState<any>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setPermissions(data.permissions || [])
        }
      } catch (error) {
        console.error('Failed to fetch permissions:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPermissions()
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

  return {
    user,
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  }
}
