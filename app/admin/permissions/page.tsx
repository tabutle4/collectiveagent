'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/context/AuthContext'
import { Loader2, ShieldCheck, Search, Check, X, AlertTriangle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface Role {
  id: string
  name: string
  display_name: string
  description: string | null
  is_active: boolean
}

interface Permission {
  id: string
  code: string
  display_name: string
  category: string
  description: string | null
}

interface RolePermission {
  role_id: string
  permission_id: string
}

interface UserOverride {
  user_id: string
  permission_id: string
  granted: boolean
}

interface LightUser {
  id: string
  email: string
  first_name: string
  last_name: string
  preferred_first_name: string | null
  preferred_last_name: string | null
  role: string
  is_active: boolean
  status: string
}

type OverrideValue = 'inherit' | 'grant' | 'revoke'

const MANAGE_ROLES_CODE = 'can_manage_roles'

// ============================================================================
// Helpers
// ============================================================================

function prettyCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function displayName(u: LightUser): string {
  const first = u.preferred_first_name || u.first_name || ''
  const last = u.preferred_last_name || u.last_name || ''
  return `${first} ${last}`.trim() || u.email
}

// ============================================================================
// Page
// ============================================================================

export default function PermissionsPage() {
  const { hasPermission, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  // role permissions stored as a Set of "roleId:permissionId"
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set())
  // overrides stored as a Map of "userId:permissionId" -> granted boolean
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [users, setUsers] = useState<LightUser[]>([])

  const [tab, setTab] = useState<'roles' | 'users'>('roles')
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [userSearch, setUserSearch] = useState('')

  // --------------------------------------------------------------------------
  // Data load
  // --------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/admin/permissions')
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load permissions')
        }
        const data = await res.json()
        if (cancelled) return

        setRoles(data.roles || [])
        setPermissions(data.permissions || [])

        const rp = new Set<string>()
        for (const r of (data.rolePermissions || []) as RolePermission[]) {
          rp.add(`${r.role_id}:${r.permission_id}`)
        }
        setRolePerms(rp)

        const ov = new Map<string, boolean>()
        for (const o of (data.userOverrides || []) as UserOverride[]) {
          ov.set(`${o.user_id}:${o.permission_id}`, o.granted)
        }
        setOverrides(ov)

        setUsers(data.users || [])

        // Sensible defaults for the selectors
        if (data.roles?.length) {
          const ops = (data.roles as Role[]).find(r => r.name === 'operations')
          setSelectedRoleId(ops ? ops.id : data.roles[0].id)
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // --------------------------------------------------------------------------
  // Derived data
  // --------------------------------------------------------------------------

  // Permissions grouped by category, preserving the sorted order from the API.
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
      if (!map.has(p.category)) map.set(p.category, [])
      map.get(p.category)!.push(p)
    }
    return Array.from(map.entries())
  }, [permissions])

  const roleByName = useMemo(() => {
    const m = new Map<string, Role>()
    for (const r of roles) m.set(r.name.toLowerCase(), r)
    return m
  }, [roles])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => {
      return (
        displayName(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      )
    })
  }, [users, userSearch])

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  // --------------------------------------------------------------------------
  // Lookups
  // --------------------------------------------------------------------------

  function roleHas(roleId: string, permissionId: string): boolean {
    return rolePerms.has(`${roleId}:${permissionId}`)
  }

  function overrideValue(userId: string, permissionId: string): OverrideValue {
    const key = `${userId}:${permissionId}`
    if (!overrides.has(key)) return 'inherit'
    return overrides.get(key) ? 'grant' : 'revoke'
  }

  // What the user actually ends up with after role default plus override.
  function effectiveForUser(user: LightUser, permission: Permission): boolean {
    const role = roleByName.get((user.role || '').toLowerCase())
    const fromRole = role ? roleHas(role.id, permission.id) : false
    const ov = overrideValue(user.id, permission.id)
    if (ov === 'grant') return true
    if (ov === 'revoke') return false
    return fromRole
  }

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  async function toggleRolePermission(role: Role, permission: Permission, nextGranted: boolean) {
    // Caution when removing the ability to manage roles, to avoid lockout.
    if (permission.code === MANAGE_ROLES_CODE && !nextGranted) {
      const ok = window.confirm(
        `Remove "Manage Roles and Permissions" from ${role.display_name}? Anyone with only this role will lose access to this page.`
      )
      if (!ok) return
    }

    const key = `role:${role.id}:${permission.id}`
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/permissions/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: role.id, permissionId: permission.id, granted: nextGranted }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Save failed')
      }
      setRolePerms(prev => {
        const next = new Set(prev)
        const rk = `${role.id}:${permission.id}`
        if (nextGranted) next.add(rk)
        else next.delete(rk)
        return next
      })
    } catch (err: any) {
      window.alert(err.message || 'Save failed')
    } finally {
      setSavingKey(null)
    }
  }

  async function setUserOverride(user: LightUser, permission: Permission, value: OverrideValue) {
    if (
      permission.code === MANAGE_ROLES_CODE &&
      value === 'revoke'
    ) {
      const ok = window.confirm(
        `Revoke "Manage Roles and Permissions" for ${displayName(user)}? They will lose access to this page even if their role allows it.`
      )
      if (!ok) return
    }

    const key = `user:${user.id}:${permission.id}`
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/permissions/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, permissionId: permission.id, value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Save failed')
      }
      setOverrides(prev => {
        const next = new Map(prev)
        const ok2 = `${user.id}:${permission.id}`
        if (value === 'inherit') next.delete(ok2)
        else next.set(ok2, value === 'grant')
        return next
      })
    } catch (err: any) {
      window.alert(err.message || 'Save failed')
    } finally {
      setSavingKey(null)
    }
  }

  // --------------------------------------------------------------------------
  // Guard / loading
  // --------------------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-luxury-gray-3 animate-spin" />
      </div>
    )
  }

  // The admin layout already blocks this route, but guard defensively too.
  if (!hasPermission(MANAGE_ROLES_CODE)) {
    return (
      <div className="container-card max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Access Denied</h1>
        <p className="text-luxury-gray-3">You do not have permission to manage roles.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-card max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Could not load permissions</h1>
        <p className="text-luxury-gray-3">{error}</p>
      </div>
    )
  }

  const selectedRole = roles.find(r => r.id === selectedRoleId) || null

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="w-6 h-6 text-luxury-accent" strokeWidth={1.5} />
        <h1 className="text-2xl font-semibold text-luxury-gray-1">Roles and Permissions</h1>
      </div>
      <p className="text-luxury-gray-3 text-sm mb-6">
        Manage what each role can do, and grant or revoke specific permissions for individual people.
      </p>

      {/* Tabs */}
      <div className="flex border-b border-luxury-gray-5/50 mb-6">
        <button
          type="button"
          className={tab === 'roles' ? 'tab-item-active' : 'tab-item'}
          onClick={() => setTab('roles')}
        >
          By Role
        </button>
        <button
          type="button"
          className={tab === 'users' ? 'tab-item-active' : 'tab-item'}
          onClick={() => setTab('users')}
        >
          By Person
        </button>
      </div>

      {tab === 'roles' && (
        <div>
          {/* Role selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {roles.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  selectedRoleId === r.id
                    ? 'bg-luxury-accent text-white'
                    : 'bg-luxury-light text-luxury-gray-2 hover:text-luxury-gray-1'
                }`}
              >
                {r.display_name}
              </button>
            ))}
          </div>

          {selectedRole && (
            <div className="space-y-6">
              {grouped.map(([category, perms]) => (
                <div key={category} className="container-card">
                  <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
                    {prettyCategory(category)}
                  </h2>
                  <div className="space-y-1">
                    {perms.map(p => {
                      const checked = roleHas(selectedRole.id, p.id)
                      const key = `role:${selectedRole.id}:${p.id}`
                      const isSaving = savingKey === key
                      return (
                        <label
                          key={p.id}
                          className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-luxury-gray-5/30 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isSaving}
                            onChange={e => toggleRolePermission(selectedRole, p, e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-luxury-accent flex-shrink-0"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-sm text-luxury-gray-1">{p.display_name}</span>
                              {p.code === MANAGE_ROLES_CODE && (
                                <span className="badge badge-warning">Controls this page</span>
                              )}
                              {isSaving && (
                                <Loader2 className="w-3.5 h-3.5 text-luxury-gray-3 animate-spin" />
                              )}
                            </span>
                            {p.description && (
                              <span className="block text-xs text-luxury-gray-3">{p.description}</span>
                            )}
                            <span className="block text-[11px] text-luxury-gray-3 font-mono">{p.code}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div>
          {/* User search and selector */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-luxury-gray-3 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search by name, email, or role"
              className="input-luxury pl-9 w-full"
            />
          </div>

          {!selectedUser && (
            <div className="container-card max-h-80 overflow-y-auto p-0">
              {filteredUsers.length === 0 ? (
                <p className="text-luxury-gray-3 text-sm p-4">No people match that search.</p>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className="flex items-center justify-between w-full text-left px-4 py-2.5 hover:bg-luxury-gray-5/30 transition-colors border-b border-luxury-gray-5/40 last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-luxury-gray-1 truncate">{displayName(u)}</span>
                      <span className="block text-xs text-luxury-gray-3 truncate">{u.email}</span>
                    </span>
                    <span className="badge badge-neutral">{u.role}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {selectedUser && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-luxury-gray-1">{displayName(selectedUser)}</h2>
                  <p className="text-xs text-luxury-gray-3">
                    {selectedUser.email} <span className="capitalize">({selectedUser.role})</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserId('')}
                  className="flex items-center gap-1 text-sm text-luxury-gray-3 hover:text-luxury-gray-1"
                >
                  <X className="w-4 h-4" /> Back to list
                </button>
              </div>

              <div className="flex items-start gap-2 mb-5 text-xs text-luxury-gray-3 bg-luxury-light rounded-md p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Inherit follows the role default. Grant adds the permission for this person only.
                  Revoke removes it for this person even if their role allows it.
                </span>
              </div>

              <div className="space-y-6">
                {grouped.map(([category, perms]) => (
                  <div key={category} className="container-card">
                    <h3 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
                      {prettyCategory(category)}
                    </h3>
                    <div className="space-y-2">
                      {perms.map(p => {
                        const value = overrideValue(selectedUser.id, p.id)
                        const effective = effectiveForUser(selectedUser, p)
                        const key = `user:${selectedUser.id}:${p.id}`
                        const isSaving = savingKey === key
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-luxury-gray-5/30"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-luxury-gray-1">{p.display_name}</span>
                                {effective ? (
                                  <span className="badge badge-success inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Has access
                                  </span>
                                ) : (
                                  <span className="badge badge-neutral">No access</span>
                                )}
                                {p.code === MANAGE_ROLES_CODE && (
                                  <span className="badge badge-warning">Controls this page</span>
                                )}
                                {isSaving && (
                                  <Loader2 className="w-3.5 h-3.5 text-luxury-gray-3 animate-spin" />
                                )}
                              </div>
                              <span className="block text-[11px] text-luxury-gray-3 font-mono">{p.code}</span>
                            </div>

                            <div className="flex flex-shrink-0 rounded-md overflow-hidden border border-luxury-gray-5/60">
                              {(['inherit', 'grant', 'revoke'] as OverrideValue[]).map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => setUserOverride(selectedUser, p, opt)}
                                  className={`px-2.5 py-1 text-xs capitalize transition-colors ${
                                    value === opt
                                      ? opt === 'revoke'
                                        ? 'bg-red-500 text-white'
                                        : opt === 'grant'
                                          ? 'bg-luxury-accent text-white'
                                          : 'bg-luxury-gray-5/70 text-luxury-gray-1'
                                      : 'bg-white text-luxury-gray-2 hover:bg-luxury-gray-5/30'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
