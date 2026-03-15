'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminUserProfileModal from '@/components/admin/AdminUserProfileModal'
import { Search, ChevronDown, ExternalLink } from 'lucide-react'

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name, roles, is_active, created_at, headshot_url')
        .order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
    } catch (error) { console.error('Error fetching users:', error) }
    finally { setLoading(false) }
  }

  const allRoles = useMemo(() => {
    const rolesSet = new Set<string>()
    users.forEach(user => { if (user.role) rolesSet.add(user.role) })
    return Array.from(rolesSet).sort()
  }, [users])

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...users]
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(user => {
        const fullName = `${user.preferred_first_name} ${user.preferred_last_name}`.toLowerCase()
        const legalName = `${user.first_name} ${user.last_name}`.toLowerCase()
        const email = user.email?.toLowerCase() || ''
        return fullName.includes(query) || legalName.includes(query) || email.includes(query)
      })
    }
    if (roleFilter !== 'all') filtered = filtered.filter(user => user.role === roleFilter)
    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active'
      filtered = filtered.filter(user => user.is_active === isActive)
    }
    filtered.sort((a, b) => {
      let aValue: any, bValue: any
      switch (sortBy) {
        case 'name':
          aValue = `${a.preferred_first_name} ${a.preferred_last_name}`.toLowerCase()
          bValue = `${b.preferred_first_name} ${b.preferred_last_name}`.toLowerCase()
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        default:
          aValue = a[sortBy]; bValue = b[sortBy]
      }
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return filtered
  }, [users, searchQuery, roleFilter, statusFilter, sortBy, sortOrder])

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length }
    allRoles.forEach(role => { counts[role] = users.filter(user => user.role === role).length })
    return counts
  }, [users, allRoles])

  const statusCounts = useMemo(() => ({
    all: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
  }), [users])

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('asc') }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">
          AGENTS ({filteredAndSortedUsers.length}{filteredAndSortedUsers.length !== users.length ? ` of ${users.length}` : ''})
        </h1>
        <div className="flex gap-2">
          <a href="/roster" target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex items-center gap-1.5">
            <ExternalLink size={14} /> Roster
          </a>
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            + Create User
          </button>
        </div>
      </div>

      <div className="container-card">
        <div className="flex flex-col md:flex-row gap-4 mb-5">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3" size={18} />
            <input type="text" placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-luxury pl-10" />
          </div>
          <div className="flex gap-3">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="select-luxury">
              <option value="all">All Roles ({roleCounts.all})</option>
              {allRoles.map((role) => (
                <option key={role} value={role}>{role} ({roleCounts[role] || 0})</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-luxury">
              {Object.entries(statusCounts).map(([status, count]) => (
                <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)} ({count})</option>
              ))}
            </select>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-12"><p className="text-sm text-luxury-gray-3">No users yet</p></div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="text-center py-12"><p className="text-sm text-luxury-gray-3">No users match your search criteria</p></div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider cursor-pointer hover:text-luxury-gray-1 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Name {sortBy === 'name' && <ChevronDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />}</div>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider cursor-pointer hover:text-luxury-gray-1 transition-colors" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-1">Created {sortBy === 'created_at' && <ChevronDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />}</div>
                    </th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedUsers.map((user) => (
                    <tr key={user.id} className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors cursor-pointer" onClick={() => router.push(`/admin/users/${user.id}`)}>
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-luxury-gray-1">{user.preferred_first_name} {user.preferred_last_name}</p>
                        <p className="text-xs text-luxury-gray-3">{user.first_name} {user.last_name}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{user.email}</td>
                      <td className="py-3 px-4">{user.role && <span className="text-xs text-luxury-gray-2">{user.role}</span>}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium ${user.is_active ? 'text-green-700' : 'text-luxury-gray-3'}`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4"><span className="text-xs text-luxury-accent">View</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {filteredAndSortedUsers.map((user) => (
                <div key={user.id} className="inner-card cursor-pointer" onClick={() => router.push(`/admin/users/${user.id}`)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-luxury-gray-1">{user.preferred_first_name} {user.preferred_last_name}</p>
                      <p className="text-xs text-luxury-gray-3">{user.first_name} {user.last_name}</p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ml-2 ${user.is_active ? 'text-green-700' : 'text-luxury-gray-3'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-luxury-gray-3">
                    <p>{user.email}</p>
                    {user.role && <p>{user.role}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {createModalOpen && (
        <AdminUserProfileModal
          onClose={() => setCreateModalOpen(false)}
          onSaved={(newUser) => { setUsers([newUser, ...users]); setCreateModalOpen(false) }}
        />
      )}
    </div>
  )
}