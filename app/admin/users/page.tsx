'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import AdminUserProfileModal from '@/components/admin/AdminUserProfileModal'
import { Search, ChevronDown } from 'lucide-react'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name, roles, is_active, created_at, headshot_url')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
      setLoading(false)
    } catch (error) {
      console.error('Error fetching users:', error)
      setLoading(false)
    }
  }

  const handleEditUser = async (user: any) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error
      setUsers(prevUsers => prevUsers.map(u => u.id === data.id ? { ...u, is_active: data.is_active } : u))
      setSelectedUser(data)
      setModalOpen(true)
    } catch (error) {
      console.error('Error fetching user details:', error)
      alert('Failed to load user details')
    }
  }

  const handleUserSaved = async (updatedUser: any) => {
    await fetchUsers()
    setModalOpen(false)
    setSelectedUser(null)
  }

  const allRoles = useMemo(() => {
    const rolesSet = new Set<string>()
    users.forEach(user => {
      if (user.role) rolesSet.add(user.role)
    })
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

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter)
    }

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
          aValue = a[sortBy]
          bValue = b[sortBy]
      }
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [users, searchQuery, roleFilter, statusFilter, sortBy, sortOrder])

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length }
    allRoles.forEach(role => {
      counts[role] = users.filter(user => user.role === role).length
    })
    return counts
  }, [users, allRoles])

  const statusCounts = useMemo(() => ({
    all: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
  }), [users])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">
          AGENTS ({filteredAndSortedUsers.length}{filteredAndSortedUsers.length !== users.length ? ` of ${users.length}` : ''})
        </h1>
        <button
          onClick={() => {
            setSelectedUser(null)
            setModalOpen(true)
          }}
          className="btn btn-primary"
        >
          + Create User
        </button>
      </div>

      <div className="container-card">
        {/* Search */}
        <div className="mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3" size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-luxury pl-10"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Role</div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setRoleFilter('all')}
              className={`btn text-sm ${roleFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            >
              All ({roleCounts.all})
            </button>
            {allRoles.map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`btn text-sm capitalize ${roleFilter === role ? 'btn-primary' : 'btn-secondary'}`}
              >
                {role} ({roleCounts[role] || 0})
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Status</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(statusCounts).map(([status, count]) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`btn text-sm capitalize ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
              >
                {status} ({count})
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Sort</div>
          <div className="flex gap-2">
            {[
              { value: 'name', label: 'Name' },
              { value: 'created_at', label: 'Created Date' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleSort(option.value)}
                className={`btn text-sm flex items-center gap-1 ${sortBy === option.value ? 'btn-primary' : 'btn-secondary'}`}
              >
                {option.label}
                {sortBy === option.value && (
                  <ChevronDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="inner-card mb-5">
          <p className="text-xs text-luxury-gray-3">
            <span className="font-semibold text-luxury-gray-2">Note:</span> office@collectiverealtyco.com is hardcoded to receive all admin notifications. All admin users also receive prospect notifications.
          </p>
        </div>

        {/* Content */}
        {users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No users yet</p>
          </div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No users match your search criteria</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider cursor-pointer hover:text-luxury-gray-1 transition-colors"
                        onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">
                        Name
                        {sortBy === 'name' && <ChevronDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Role</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider cursor-pointer hover:text-luxury-gray-1 transition-colors"
                        onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-1">
                        Created
                        {sortBy === 'created_at' && <ChevronDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />}
                      </div>
                    </th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedUsers.map((user) => (
                    <tr key={user.id} className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-luxury-gray-1">{user.preferred_first_name} {user.preferred_last_name}</p>
                        <p className="text-xs text-luxury-gray-3">{user.first_name} {user.last_name}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{user.email}</td>
                      <td className="py-3 px-4">
                        {user.role && (
                          <span className="text-xs px-2 py-1 rounded bg-luxury-gray-5/40 text-luxury-gray-2 font-medium">
                            {user.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2.5 py-1 rounded font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-luxury-gray-5/40 text-luxury-gray-3'}`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button onClick={() => handleEditUser(user)} className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredAndSortedUsers.map((user) => (
                <div key={user.id} className="inner-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-luxury-gray-1">{user.preferred_first_name} {user.preferred_last_name}</p>
                      <p className="text-xs text-luxury-gray-3">{user.first_name} {user.last_name}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded flex-shrink-0 ml-2 font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-luxury-gray-5/40 text-luxury-gray-3'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-luxury-gray-3">Email: </span>
                      <span className="text-luxury-gray-1 break-all">{user.email}</span>
                    </div>
                    {user.role && (
                      <div>
                        <span className="text-luxury-gray-3">Role: </span>
                        <span className="text-luxury-gray-1">{user.role}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-luxury-gray-3">Created: </span>
                      <span className="text-luxury-gray-1">{new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-luxury-gray-5/30">
                    <button onClick={() => handleEditUser(user)} className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors font-medium">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <AdminUserProfileModal
          user={selectedUser || undefined}
          onClose={() => {
            setModalOpen(false)
            setSelectedUser(null)
          }}
          onSaved={(updatedUser) => {
            if (selectedUser) {
              handleUserSaved(updatedUser)
            } else {
              setUsers([updatedUser, ...users])
              setModalOpen(false)
              setSelectedUser(null)
            }
          }}
        />
      )}
    </div>
  )
}