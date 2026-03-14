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
      // Always fetch fresh user data from database before opening modal
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error
      
      // Update the user in the list with fresh data (including is_active)
      setUsers(prevUsers => prevUsers.map(u => u.id === data.id ? { ...u, is_active: data.is_active } : u))
      
      setSelectedUser(data)
      setModalOpen(true)
    } catch (error) {
      console.error('Error fetching user details:', error)
      alert('Failed to load user details')
    }
  }

  const handleUserSaved = async (updatedUser: any) => {
    // Refresh the entire users list from database to ensure we have the latest data
    await fetchUsers()
    setModalOpen(false)
    setSelectedUser(null)
  }

  // Get unique roles from all users
  const allRoles = useMemo(() => {
    const rolesSet = new Set<string>()
    users.forEach(user => {
      if (user.role) {
        rolesSet.add(user.role)
      }
    })
    return Array.from(rolesSet).sort()
  }, [users])

  // Filter and sort users
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...users]

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(user => {
        const fullName = `${user.preferred_first_name} ${user.preferred_last_name}`.toLowerCase()
        const legalName = `${user.first_name} ${user.last_name}`.toLowerCase()
        const email = user.email?.toLowerCase() || ''
        return fullName.includes(query) || legalName.includes(query) || email.includes(query)
      })
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => 
        user.role === roleFilter
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active'
      filtered = filtered.filter(user => user.is_active === isActive)
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any
      let bValue: any

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

  // Counts for filters
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length }
    allRoles.forEach(role => {
      counts[role] = users.filter(user => 
        user.role === role
      ).length
    })
    return counts
  }, [users, allRoles])

  const statusCounts = useMemo(() => {
    return {
      all: users.length,
      active: users.filter(u => u.is_active).length,
      inactive: users.filter(u => !u.is_active).length,
    }
  }, [users])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 md:mb-8">
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury" style={{ fontWeight: '600' }}>
          Users ({filteredAndSortedUsers.length}{filteredAndSortedUsers.length !== users.length ? ` of ${users.length}` : ''})
        </h2>
        <button
          onClick={() => {
            setSelectedUser(null)
            setModalOpen(true)
          }}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black"
        >
          + Create User
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-4 md:mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3" size={18} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-luxury-gray-5 rounded focus:outline-none focus:ring-1 focus:ring-luxury-black focus:border-luxury-black"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 md:mb-6 -mx-6 px-6 md:mx-0 md:px-0">
        {/* Role Filters */}
        <div className="mb-3">
          <div className="text-xs text-luxury-gray-2 mb-2 font-medium">Filter by Role:</div>
          <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors flex items-center justify-center gap-1 font-medium ${
                roleFilter === 'all'
                  ? 'bg-luxury-black text-white'
                  : 'btn-white'
              }`}
            >
              <span>All</span>
              <span className="text-[11px] md:text-xs font-normal opacity-80">({roleCounts.all})</span>
            </button>
            {allRoles.map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors flex items-center justify-center gap-1 font-medium capitalize ${
                  roleFilter === role
                    ? 'bg-luxury-black text-white'
                    : 'btn-white'
                }`}
              >
                <span>{role}</span>
                <span className="text-[11px] md:text-xs font-normal opacity-80">({roleCounts[role] || 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Status Filters */}
        <div>
          <div className="text-xs text-luxury-gray-2 mb-2 font-medium">Filter by Status:</div>
          <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2">
            {Object.entries(statusCounts).map(([status, count]) => {
              const label = status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)
              const isActive = statusFilter === status
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors flex items-center justify-center gap-1 font-medium ${
                    isActive
                      ? 'bg-luxury-black text-white'
                      : 'btn-white'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[11px] md:text-xs font-normal opacity-80">({count})</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="mb-4 md:mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-luxury-gray-2 font-medium">Sort by:</span>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'name', label: 'Name' },
            { value: 'created_at', label: 'Created Date' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleSort(option.value)}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${
                sortBy === option.value
                  ? 'bg-luxury-black text-white'
                  : 'btn-white'
              }`}
            >
              <span>{option.label}</span>
              {sortBy === option.value && (
                <ChevronDown 
                  size={14} 
                  className={sortOrder === 'desc' ? 'rotate-180' : ''} 
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="card-section mb-6">
        <p className="text-base text-luxury-gray-2">
          <strong>Note:</strong> office@collectiverealtyco.com is hardcoded to receive all admin notifications.
        </p>
        <p className="text-base text-luxury-gray-2 mt-2">
          All users listed below with admin role also receive prospect notifications.
        </p>
      </div>

      {users.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">No users yet</p>
        </div>
      ) : filteredAndSortedUsers.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">No users match your search criteria</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white shadow-md rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-luxury-light">
                  <tr>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury cursor-pointer hover:bg-luxury-gray-5 transition-colors"
                        onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-2">
                        Name
                        {sortBy === 'name' && (
                          <ChevronDown 
                            size={14} 
                            className={sortOrder === 'desc' ? 'rotate-180' : ''} 
                          />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury">
                      Roles
                    </th>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury cursor-pointer hover:bg-luxury-gray-5 transition-colors"
                        onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-2">
                        Created
                        {sortBy === 'created_at' && (
                          <ChevronDown 
                            size={14} 
                            className={sortOrder === 'desc' ? 'rotate-180' : ''} 
                          />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-base font-medium text-luxury-gray-1 tracking-luxury">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-luxury-gray-5">
                  {filteredAndSortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-luxury-light transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-luxury-gray-1">
                          {user.preferred_first_name} {user.preferred_last_name}
                        </div>
                        <div className="text-xs text-luxury-gray-3">
                          Legal: {user.first_name} {user.last_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-luxury-gray-2">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.role && (
                            <span
                              className="inline-block px-2 py-1 text-xs tracking-wide rounded bg-luxury-dark-3 text-white"
                            >
                              {user.role}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`
                          inline-block px-3 py-1 text-xs tracking-wide rounded
                          ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                        `}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-luxury-gray-2 text-base">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {filteredAndSortedUsers.map((user) => (
              <div
                key={user.id}
                className="bg-white border border-luxury-gray-5 rounded shadow-sm p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-luxury-gray-1">
                      {user.preferred_first_name} {user.preferred_last_name}
                    </div>
                    <div className="text-xs text-luxury-gray-3">
                      {user.first_name} {user.last_name}
                    </div>
                  </div>
                  <span className={`
                    inline-block px-2 py-1 text-xs tracking-wide rounded
                    ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                  `}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="text-base text-luxury-gray-2 space-y-1">
                  <div>{user.email}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {user.role && (
                      <span
                        className="inline-block px-2 py-1 text-xs uppercase tracking-wide rounded bg-luxury-dark-3 text-white"
                      >
                        {user.role}
                      </span>
                    )}
                  </div>
                  <div className="text-base mt-2">
                    Created: {new Date(user.created_at).toLocaleDateString()}
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center btn-white w-full"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <AdminUserProfileModal
          user={selectedUser || undefined}
          onClose={() => {
            setModalOpen(false)
            setSelectedUser(null)
          }}
          onSaved={(updatedUser) => {
            if (selectedUser) {
              // Update existing user
              handleUserSaved(updatedUser)
            } else {
              // Add new user to list
              setUsers([updatedUser, ...users])
              setModalOpen(false)
              setSelectedUser(null)
            }
          }}
        />
      )}

      <div className="card-section mt-8">
        <h3 className="text-lg font-medium mb-4 tracking-luxury">
          Adding New Admin Users
        </h3>
        <p className="text-base text-luxury-gray-2">
          Additional admin user management features will be added in future updates. For now, you can add users directly through the Supabase dashboard or contact support.
        </p>
      </div>
    </div>
  )
}
