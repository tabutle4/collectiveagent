'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AdminUserProfileModal from '@/components/admin/AdminUserProfileModal'
import { Search, ChevronDown, ExternalLink, Download } from 'lucide-react'

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users/list')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get display role from the role column (not roles array)
  const getDisplayRole = (user: any): string => {
    const role = (user.role || '').toLowerCase()
    switch (role) {
      case 'broker':
        return 'Broker'
      case 'operations':
        return 'Operations'
      case 'tc':
        return 'TC'
      case 'agent':
        return 'Agent'
      default:
        return role || 'Agent'
    }
  }

  // Get role value for filtering (lowercase)
  const getUserRole = (user: any): string => {
    return (user.role || 'agent').toLowerCase()
  }

  // Additional roles from additional_roles field if present
  const getAdditionalRoles = (user: any): string => {
    if (!user.additional_roles) return ''
    return user.additional_roles
  }

  const getSocialLinks = (user: any): string => {
    const links: string[] = []
    if (user.instagram_handle) links.push(`IG: ${user.instagram_handle}`)
    if (user.tiktok_handle) links.push(`TT: ${user.tiktok_handle}`)
    if (user.threads_handle) links.push(`Threads: ${user.threads_handle}`)
    if (user.linkedin_url) links.push('LinkedIn')
    if (user.facebook_url) links.push('Facebook')
    if (user.youtube_url) links.push('YouTube')
    return links.join(', ')
  }

  const allRoles = useMemo(() => {
    const rolesSet = new Set<string>()
    users.forEach(user => {
      const role = getUserRole(user)
      if (role) rolesSet.add(role)
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
        const office = user.office?.toLowerCase() || ''
        const team = user.team_name?.toLowerCase() || ''
        return (
          fullName.includes(query) ||
          legalName.includes(query) ||
          email.includes(query) ||
          office.includes(query) ||
          team.includes(query)
        )
      })
    }
    if (roleFilter !== 'all') filtered = filtered.filter(user => getUserRole(user) === roleFilter)
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
        case 'email':
          aValue = (a.email || '').toLowerCase()
          bValue = (b.email || '').toLowerCase()
          break
        case 'office':
          aValue = (a.office || '').toLowerCase()
          bValue = (b.office || '').toLowerCase()
          break
        case 'role':
          aValue = getDisplayRole(a).toLowerCase()
          bValue = getDisplayRole(b).toLowerCase()
          break
        case 'team_name':
          aValue = (a.team_name || '').toLowerCase()
          bValue = (b.team_name || '').toLowerCase()
          break
        case 'status':
          aValue = a.is_active ? 'active' : 'inactive'
          bValue = b.is_active ? 'active' : 'inactive'
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        default:
          aValue = (a[sortBy] || '').toString().toLowerCase()
          bValue = (b[sortBy] || '').toString().toLowerCase()
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
      counts[role] = users.filter(user => getUserRole(user) === role).length
    })
    return counts
  }, [users, allRoles])

  const statusCounts = useMemo(
    () => ({
      all: users.length,
      active: users.filter(u => u.is_active).length,
      inactive: users.filter(u => !u.is_active).length,
    }),
    [users]
  )

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-luxury-gray-3">
        {children}
        <ChevronDown
          size={12}
          className={`transition-transform ${sortBy === field ? (sortOrder === 'asc' ? 'rotate-180' : '') : 'opacity-0'}`}
        />
      </div>
    </th>
  )

  const exportCSV = () => {
    const headers = [
      'Preferred Name',
      'Legal Name',
      'Email',
      'Office',
      'Role',
      'Additional Roles',
      'Team',
      'Phone',
      'Birthday Month',
      'Status',
      'Social Links',
      'Division',
    ]
    const rows = filteredAndSortedUsers.map(user => [
      `${user.preferred_first_name || ''} ${user.preferred_last_name || ''}`.trim(),
      `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      user.email || '',
      user.office || '',
      getDisplayRole(user),
      getAdditionalRoles(user) || '',
      user.team_name || '',
      user.personal_phone || '',
      user.birth_month || '',
      user.is_active ? 'Active' : 'Inactive',
      getSocialLinks(user) || '',
      user.division || '',
    ])
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `agents_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const tableRows = filteredAndSortedUsers
      .map((user, idx) => {
        const headshotCell = user.headshot_url
          ? `<img src="${user.headshot_url}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;object-position:center top;" />`
          : `<div style="width:24px;height:24px;border-radius:50%;background:#C5A278;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:600;">${(user.preferred_first_name || user.first_name || '?')[0]}${(user.preferred_last_name || user.last_name || '?')[0]}</div>`
        return `<tr>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;width:30px;">${headshotCell}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;"><strong>${user.preferred_first_name} ${user.preferred_last_name}</strong><br/><span style="color:#888;font-size:8px;">${user.first_name} ${user.last_name}</span></td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.email}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.office || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${getDisplayRole(user)}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${getAdditionalRoles(user) || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.team_name || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.personal_phone || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.birth_month || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${getSocialLinks(user) || ''}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${user.division || ''}</td>
      </tr>`
      })
      .join('')
    const filterDesc =
      [
        roleFilter !== 'all' ? `Role: ${roleFilter}` : '',
        statusFilter !== 'all' ? `Status: ${statusFilter}` : '',
        searchQuery ? `Search: "${searchQuery}"` : '',
      ]
        .filter(Boolean)
        .join(' | ') || 'All agents'
    printWindow.document
      .write(`<!DOCTYPE html><html><head><title>Agents - Collective Realty Co.</title>
      <style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
      body{font-family:'Montserrat',sans-serif;padding:30px;color:#1A1A1A;font-size:10px;}
      h1{font-size:16px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;font-weight:600;}
      .subtitle{font-size:10px;color:#555;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}
      th{text-align:left;padding:6px 5px;border-bottom:2px solid #1A1A1A;font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#555;font-weight:600;}
      @media print{body{padding:15px;} @page{size:landscape;margin:0.4in;}}</style></head>
      <body><h1>Collective Realty Co. Agent Roster</h1>
      <p class="subtitle">${filteredAndSortedUsers.length} agents | ${filterDesc} | ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th></th><th>Agent Name</th><th>Email</th><th>Office</th><th>Role</th><th>Add'l Roles</th><th>Team</th><th>Phone</th><th>Birthday</th><th>Social</th><th>Division</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`)
    printWindow.document.close()
    printWindow.onload = () => printWindow.print()
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">AGENTS ({statusCounts.active} Active)</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href="/roster"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <ExternalLink size={14} /> Roster
          </a>
          <button onClick={exportCSV} className="btn btn-secondary flex items-center gap-1.5">
            <Download size={14} /> CSV
          </button>
          <button onClick={exportPDF} className="btn btn-secondary flex items-center gap-1.5">
            <Download size={14} /> PDF
          </button>
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            + Create User
          </button>
        </div>
      </div>

      <div className="container-card">
        <div className="flex flex-col md:flex-row gap-4 mb-5">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by name, email, office, team..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-luxury pl-10"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="select-luxury"
            >
              <option value="all">All Roles ({roleCounts.all})</option>
              {allRoles.map(role => (
                <option key={role} value={role} className="capitalize">
                  {role.replace('_', ' ')} ({roleCounts[role] || 0})
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="select-luxury"
            >
              {Object.entries(statusCounts).map(([status, count]) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No users yet</p>
          </div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No users match your filters</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <SortHeader field="name">Name</SortHeader>
                    <SortHeader field="email">Email</SortHeader>
                    <SortHeader field="office">Office</SortHeader>
                    <SortHeader field="role">Role</SortHeader>
                    <SortHeader field="team_name">Team</SortHeader>
                    <SortHeader field="status">Status</SortHeader>
                    <SortHeader field="created_at">Created</SortHeader>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedUsers.map(user => (
                    <tr
                      key={user.id}
                      className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {user.headshot_url ? (
                            <img
                              src={user.headshot_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover object-top flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              {(user.preferred_first_name || user.first_name || '?')[0]}
                              {(user.preferred_last_name || user.last_name || '?')[0]}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-luxury-gray-1">
                              {user.preferred_first_name} {user.preferred_last_name}
                            </p>
                            <p className="text-xs text-luxury-gray-3">
                              {user.first_name} {user.last_name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{user.email}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{user.office || ''}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-luxury-gray-2 capitalize">
                          {getDisplayRole(user)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {user.team_name || ''}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium ${user.is_active ? 'text-green-700' : 'text-luxury-gray-3'}`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-luxury-accent">View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {filteredAndSortedUsers.map(user => (
                <div
                  key={user.id}
                  className="inner-card cursor-pointer"
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {user.headshot_url ? (
                      <img
                        src={user.headshot_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover object-top flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {(user.preferred_first_name || user.first_name || '?')[0]}
                        {(user.preferred_last_name || user.last_name || '?')[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {user.preferred_first_name} {user.preferred_last_name}
                        </p>
                        <span
                          className={`text-xs font-medium flex-shrink-0 ml-2 ${user.is_active ? 'text-green-700' : 'text-luxury-gray-3'}`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-xs text-luxury-gray-3 mt-1">
                        <p>{user.email}</p>
                        <p className="capitalize">
                          {getDisplayRole(user)}
                          {user.office ? ` · ${user.office}` : ''}
                          {user.team_name ? ` · ${user.team_name}` : ''}
                        </p>
                      </div>
                    </div>
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
          onSaved={newUser => {
            setUsers([newUser, ...users])
            setCreateModalOpen(false)
          }}
        />
      )}
    </div>
  )
}
