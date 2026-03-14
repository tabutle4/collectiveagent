'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Circle, Lock, Unlock, Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  preferred_first_name: string
  preferred_last_name: string
  first_name: string
  last_name: string
  email: string
  onboarding_unlocked: boolean
  paid_onboarding_fee: boolean
  accepted_trec: boolean
  independent_contractor_agreement_signed: boolean
  w9_completed: boolean
  onboarding_checklist: any
  created_at: string
}

interface ChecklistItem {
  id: string
  section: string
  item_key: string | null
  label: string
  display_order: number
}

export default function OnboardingManagementPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'locked' | 'unlocked' | 'complete'>('all')
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [unlockingAll, setUnlockingAll] = useState(false)

  useEffect(() => {
    // Check if user is admin
    checkAdminAccess()
    loadData()
  }, [])

  const checkAdminAccess = async () => {
    try {
      // Check localStorage for user (same auth method as rest of app)
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        router.push('/auth/login')
        return
      }

      const userData = JSON.parse(userStr)

      // Check role (simple string, not array)
      if (userData?.role !== 'Admin') {
        router.push('/admin/dashboard')
        return
      }
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/auth/login')
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all users with agent role
      // Note: Some users might have null roles, so we need to handle that
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (usersError) {
        console.error('Error fetching users:', usersError)
        throw new Error(`Failed to fetch users: ${usersError.message || 'Unknown error'}`)
      }

      // Filter for users with 'Agent' role (simple string, not array)
      const agents = (usersData || []).filter((user: any) => 
        user.role === 'Agent'
      )
      setUsers(agents as User[])

      // Fetch checklist items for progress calculation
      const { data: itemsData, error: itemsError } = await supabase
        .from('checklist_items')
        .select('id, section, item_key, label, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (itemsError) {
        // Check if it's a "table doesn't exist" error
        const errorCode = itemsError.code || ''
        const errorMessage = itemsError.message || ''
        
        if (errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
          console.warn('Checklist items table does not exist yet. Please run the database migration (supabase-checklist-schema.sql) to create the table.')
        } else {
          console.error('Error fetching checklist items:', itemsError)
        }
        
        // Don't throw - checklist items might not exist yet, just log and continue
        // The page will still work, just without dynamic checklist items
        setChecklistItems([])
      } else {
        setChecklistItems((itemsData || []) as ChecklistItem[])
      }

      setLoading(false)
    } catch (error: any) {
      console.error('Error loading data:', error)
      // Better error handling - Supabase errors have specific structure
      let errorMessage = 'Failed to load onboarding data'
      if (error?.message) {
        errorMessage = error.message
      } else if (error?.error?.message) {
        errorMessage = error.error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error?.code) {
        errorMessage = `Database error (${error.code}): ${error.message || 'Unknown error'}`
      }
      // Log full error for debugging
      console.error('Full error details:', JSON.stringify(error, null, 2))
      
      // If error message is still default, check if error is empty object
      if (errorMessage === 'Failed to load onboarding data' && error && typeof error === 'object') {
        const errorStr = JSON.stringify(error)
        if (errorStr === '{}') {
          errorMessage = 'Failed to load onboarding data. The database query returned an empty error. Please check your database connection and try again.'
        }
      }
      
      setError(errorMessage)
      setLoading(false)
    }
  }

  const calculateProgress = (user: User) => {
    const checklist = user.onboarding_checklist || {}
    let total = checklistItems.length + 1 // +1 for MLS Setup
    let completed = 0

    checklistItems.forEach((item) => {
      const sectionData = checklist[item.section]
      if (item.item_key) {
        if (sectionData && sectionData[item.item_key]) {
          completed++
        }
      } else {
        if (checklist[item.section]) {
          completed++
        }
      }
    })

    // Add MLS Setup to progress calculation
    if (checklist.mls_setup?.completed) {
      completed++
    }

    return total > 0 ? Math.round((completed / total) * 100) : 0
  }

  const getUnlockStatus = (user: User) => {
    const step1Complete = user.paid_onboarding_fee && user.accepted_trec
    const step2Complete = user.independent_contractor_agreement_signed && user.w9_completed
    return {
      step1Complete,
      step2Complete,
      allStepsComplete: step1Complete && step2Complete,
      canUnlock: step1Complete && step2Complete && !user.onboarding_unlocked,
    }
  }

  const handleUnlock = async (userId: string) => {
    if (!confirm('Unlock onboarding checklist for this agent?')) return

    setUnlocking(userId)
    try {
      const { error } = await supabase
        .from('users')
        .update({ onboarding_unlocked: true })
        .eq('id', userId)

      if (error) throw error

      await loadData()
    } catch (error: any) {
      console.error('Error unlocking user:', error)
      alert('Failed to unlock user: ' + (error.message || 'Unknown error'))
    } finally {
      setUnlocking(null)
    }
  }

  const handleLock = async (userId: string) => {
    if (!confirm('Lock onboarding checklist for this agent? This will prevent them from accessing the checklist.')) return

    setUnlocking(userId)
    try {
      const { error } = await supabase
        .from('users')
        .update({ onboarding_unlocked: false })
        .eq('id', userId)

      if (error) throw error

      await loadData()
    } catch (error: any) {
      console.error('Error locking user:', error)
      alert('Failed to lock user: ' + (error.message || 'Unknown error'))
    } finally {
      setUnlocking(null)
    }
  }

  const handleResetChecklist = async (userId: string) => {
    if (!confirm('Reset this agent\'s checklist? This will clear all completed items. This action cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ onboarding_checklist: {} })
        .eq('id', userId)

      if (error) throw error

      await loadData()
      alert('Checklist reset successfully')
    } catch (error: any) {
      console.error('Error resetting checklist:', error)
      alert('Failed to reset checklist: ' + (error.message || 'Unknown error'))
    }
  }

  const handleUnlockAll = async () => {
    if (!confirm('Unlock onboarding for ALL agents? This will unlock the checklist for every agent, regardless of whether they\'ve completed the unlock steps.')) return

    setUnlockingAll(true)
    try {
      const response = await fetch('/api/users/unlock-all-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unlock all agents')
      }

      alert(`Successfully unlocked onboarding for ${data.unlocked} agent(s)`)
      await loadData()
    } catch (error: any) {
      console.error('Error unlocking all users:', error)
      alert('Failed to unlock all users: ' + (error.message || 'Unknown error'))
    } finally {
      setUnlockingAll(false)
    }
  }

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }))
  }

  const filteredUsers = users.filter((user) => {
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const fullName = `${user.preferred_first_name} ${user.preferred_last_name}`.toLowerCase()
      const email = user.email?.toLowerCase() || ''
      if (!fullName.includes(query) && !email.includes(query)) {
        return false
      }
    }

    // Status filter
    if (filterStatus === 'locked') {
      return !user.onboarding_unlocked
    } else if (filterStatus === 'unlocked') {
      return user.onboarding_unlocked && calculateProgress(user) < 100
    } else if (filterStatus === 'complete') {
      return calculateProgress(user) === 100
    }

    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: '104px', paddingBottom: '3rem' }}>
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  const stats = {
    total: users.length,
    locked: users.filter((u) => !u.onboarding_unlocked).length,
    unlocked: users.filter((u) => u.onboarding_unlocked && calculateProgress(u) < 100).length,
    complete: users.filter((u) => calculateProgress(u) === 100).length,
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: '104px', paddingBottom: '3rem' }}>
        <div className="mb-8">
          <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-4 md:mb-6" >
            Onboarding Checklist Management
          </h2>

          {/* Stats Overview */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="card-section text-center">
              <p className="text-xs text-luxury-gray-2 mb-1">Total Agents</p>
              <p className="text-3xl font-light" className="text-luxury-accent">
                {stats.total}
              </p>
            </div>
            <div className="card-section text-center">
              <p className="text-xs text-luxury-gray-2 mb-1">Locked</p>
              <p className="text-3xl font-light" className="text-luxury-accent">
                {stats.locked}
              </p>
            </div>
            <div className="card-section text-center">
              <p className="text-xs text-luxury-gray-2 mb-1">In Progress</p>
              <p className="text-3xl font-light" className="text-luxury-accent">
                {stats.unlocked}
              </p>
            </div>
            <div className="card-section text-center">
              <p className="text-xs text-luxury-gray-2 mb-1">Complete</p>
              <p className="text-3xl font-light" className="text-luxury-accent">
                {stats.complete}
              </p>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="card-section mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-luxury-gray-1 mb-1">Bulk Actions</h3>
                <p className="text-xs text-luxury-gray-2">Unlock onboarding for all agents at once</p>
              </div>
              <button
                onClick={handleUnlockAll}
                disabled={unlockingAll || stats.locked === 0}
                className="px-4 py-2 text-sm rounded transition-colors text-center btn-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                {unlockingAll ? 'Unlocking...' : 'Unlock Everyone'}
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="card-section mb-6">
            <div className="mb-4">
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

            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'all', label: 'All' },
                { value: 'locked', label: 'Locked' },
                { value: 'unlocked', label: 'In Progress' },
                { value: 'complete', label: 'Complete' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setFilterStatus(filter.value as any)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    filterStatus === filter.value
                      ? 'bg-luxury-black text-white'
                      : 'btn-white'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-4">
          {filteredUsers.length === 0 ? (
            <div className="card-section text-center py-12">
              <p className="text-luxury-gray-2">No users found</p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const progress = calculateProgress(user)
              const unlockStatus = getUnlockStatus(user)
              const isExpanded = expandedUsers[user.id]
              const preferredName = `${user.preferred_first_name} ${user.preferred_last_name}`

              return (
                <div key={user.id} className="card-section border-2 border-luxury-gray-5">
                  <div
                    className="flex items-center justify-between cursor-pointer hover:bg-luxury-light transition-colors p-4"
                    onClick={() => toggleUserExpanded(user.id)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {user.onboarding_unlocked ? (
                          <Unlock className="w-6 h-6 text-green-600" />
                        ) : (
                          <Lock className="w-6 h-6 text-luxury-gray-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-luxury-gray-1 truncate">{preferredName}</h3>
                        <p className="text-sm text-luxury-gray-2 truncate">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-medium text-luxury-gray-1">{progress}%</p>
                          <div className="w-24 h-2 bg-luxury-gray-5 rounded-full mt-1">
                            <div
                              className="h-full bg-luxury-gold rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <button className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-luxury-gray-3" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-luxury-gray-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-luxury-gray-5 space-y-4">
                      {/* Unlock Steps Status */}
                      <div>
                        <h4 className="text-sm font-medium text-luxury-gray-1 mb-3">Unlock Steps</h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {unlockStatus.step1Complete ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-luxury-gray-3" />
                            )}
                            <span className="text-sm text-luxury-gray-2">
                              Step 1: Fees & TREC
                              {unlockStatus.step1Complete && ' ✓'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-7">
                            <span className="text-xs text-luxury-gray-3">
                              Payment: {user.paid_onboarding_fee ? '✓' : '✗'} | TREC: {user.accepted_trec ? '✓' : '✗'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {unlockStatus.step2Complete ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-luxury-gray-3" />
                            )}
                            <span className="text-sm text-luxury-gray-2">
                              Step 2: Documents
                              {unlockStatus.step2Complete && ' ✓'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-7">
                            <span className="text-xs text-luxury-gray-3">
                              ICA: {user.independent_contractor_agreement_signed ? '✓' : '✗'} | W-9: {user.w9_completed ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Checklist Progress */}
                      <div>
                        <h4 className="text-sm font-medium text-luxury-gray-1 mb-3">Checklist Progress</h4>
                        <div className="space-y-2">
                          {Object.entries((user.onboarding_checklist || {}) as Record<string, any>).map(([section, data]) => {
                            if (section === 'mls_setup') {
                              return (
                                <div key={section} className="flex items-center gap-2">
                                  {data?.completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-luxury-gray-3" />
                                  )}
                                  <span className="text-sm text-luxury-gray-2">MLS Setup</span>
                                </div>
                              )
                            } else if (typeof data === 'object' && data !== null) {
                              return Object.entries(data).map(([itemKey, completed]: [string, any]) => (
                                <div key={`${section}-${itemKey}`} className="flex items-center gap-2 ml-4">
                                  {completed ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-luxury-gray-3" />
                                  )}
                                  <span className="text-sm text-luxury-gray-2">{itemKey}</span>
                                </div>
                              ))
                            } else {
                              return (
                                <div key={section} className="flex items-center gap-2">
                                  {data ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-luxury-gray-3" />
                                  )}
                                  <span className="text-sm text-luxury-gray-2">{section}</span>
                                </div>
                              )
                            }
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 pt-4 border-t border-luxury-gray-5">
                        {unlockStatus.canUnlock && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnlock(user.id)
                            }}
                            disabled={unlocking === user.id}
                            className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <Unlock className="w-4 h-4" />
                            {unlocking === user.id ? 'Unlocking...' : 'Unlock Checklist'}
                          </button>
                        )}
                        {user.onboarding_unlocked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleLock(user.id)
                            }}
                            disabled={unlocking === user.id}
                            className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <Lock className="w-4 h-4" />
                            {unlocking === user.id ? 'Locking...' : 'Lock Checklist'}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleResetChecklist(user.id)
                          }}
                          className="px-3 py-1.5 text-xs rounded transition-colors text-center bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 flex items-center gap-2"
                        >
                          Reset Checklist
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

