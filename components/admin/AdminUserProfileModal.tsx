import { useMemo, useState, useEffect, useRef } from 'react'

import { normalizeSocialUrl } from '@/lib/socialLinks'
import { normalizeRoles } from '@/lib/nameFormatter'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'

type Props = {
  user?: any // Optional for creating new users
  onClose: () => void
  onSaved: (updatedUser: any) => void
}

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const statusOptions = [
  { value: '', label: 'Select status...' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'prospect', label: 'Prospect' },
]

const officeOptions = [
  { value: '', label: 'Select office...' },
  { value: 'Houston', label: 'Houston' },
  { value: 'DFW', label: 'Dallas/DFW' },
]

const associationOptions = [
  { value: '', label: 'Select association...' },
  { value: 'HAR', label: 'HAR' },
  { value: 'Metrotex/NTREIS', label: 'Metrotex/NTREIS' },
  { value: 'Both', label: 'Both' },
]

const shirtTypeOptions = [
  { value: '', label: 'Select type...' },
  { value: "Women's", label: "Women's" },
  { value: "Men's", label: "Men's" },
]

const shirtSizeOptions = [
  { value: '', label: 'Select size...' },
  { value: 'XS', label: 'XS' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: '2X', label: '2X' },
  { value: 'XXL', label: 'XXL' },
  { value: '3X', label: '3X' },
]

const commissionPlans = [
  { value: '', label: 'Select plan...' },
  { value: '70_30_new', label: 'New Agent Plan' },
  { value: '85_15_no_cap', label: 'No Cap Plan 85/15' },
  { value: '70_30_cap', label: 'Cap Plan 70/30 $18,000 Cap' },
  { value: '85_15_lease', label: 'Apartment and Lease' },
]

const toDateInput = (value?: string | null) => {
  if (!value) return ''
  try {
    return new Date(value).toISOString().split('T')[0]
  } catch {
    return ''
  }
}

const toNullableString = (value: any) => {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return value
}

// Format phone to 10 digits only
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '')
  return digits.slice(0, 10)
}

// Parse revenue_share string into array of names
const parseRevenueShare = (value: string | null | undefined): string[] => {
  if (!value) return []
  // Handle comma-separated values
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// Convert array of names to comma-separated string
const stringifyRevenueShare = (names: string[]): string => {
  return names.join(', ')
}

// Autocomplete Multi-Select Component
function UserAutocomplete({
  selectedUsers,
  onSelect,
  onRemove,
  allUsers,
  disabled,
}: {
  selectedUsers: string[]
  onSelect: (name: string) => void
  onRemove: (name: string) => void
  allUsers: { id: string; name: string }[]
  disabled?: boolean
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredUsers = allUsers.filter(
    user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedUsers.includes(user.name)
  )

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected users as tags */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedUsers.map(name => (
          <span
            key={name}
            className="inline-flex items-center gap-1 px-2 py-1 bg-luxury-light rounded text-sm"
          >
            {name}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(name)}
                className="text-luxury-gray-2 hover:text-luxury-black"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Search input */}
      {!disabled && (
        <input
          type="text"
          className="input-luxury"
          placeholder="Type to search users..."
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
        />
      )}

      {/* Dropdown */}
      {isOpen && searchTerm && filteredUsers.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredUsers.map(user => (
            <button
              key={user.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-luxury-light"
              onClick={() => {
                onSelect(user.name)
                setSearchTerm('')
                setIsOpen(false)
              }}
            >
              {user.name}
            </button>
          ))}
        </div>
      )}

      {isOpen && searchTerm && filteredUsers.length === 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg p-3 text-sm text-luxury-gray-3">
          No users found
        </div>
      )}
    </div>
  )
}

export default function AdminUserProfileModal({ user, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<'basic' | 'real_estate' | 'prospect_form'>('basic')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([])
  const [resettingPassword, setResettingPassword] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const [freshUser, setFreshUser] = useState<any>(user)

  useEffect(() => {
    // Get current logged-in user
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const userData = JSON.parse(userStr)
        setCurrentUser(userData)
      } catch (e) {
        console.error('Error parsing user data:', e)
      }
    }

    // Fetch all users for revenue share dropdown
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users/list')
        const data = await res.json()

        if (res.ok && data.users) {
          setAllUsers(
            data.users.map((u: any) => ({
              id: u.id,
              name: `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`,
            }))
          )
        }
      } catch (error) {
        console.error('Error fetching users:', error)
      }
    }
    fetchUsers()
  }, [])

  // Fetch fresh user data when modal opens (for existing users)
  useEffect(() => {
    if (user && user.id) {
      const fetchFreshUser = async () => {
        try {
          const res = await fetch(`/api/users/profile?id=${user.id}`)
          const data = await res.json()

          if (!res.ok) {
            console.error('Error fetching fresh user data:', data.error)
            // Fallback to user prop if fetch fails
            setFreshUser(user)
          } else if (data.user) {
            console.log('Fetched fresh user data:', data.user.is_active)
            setFreshUser(data.user)
          }
        } catch (err) {
          console.error('Error in fetchFreshUser:', err)
          setFreshUser(user)
        }
      }
      fetchFreshUser()
    } else {
      setFreshUser(null)
    }
  }, [user?.id])

  // Check if current user is admin (case-insensitive)
  const isAdmin =
    currentUser?.roles?.some((r: string) => r.toLowerCase() === 'admin') ||
    currentUser?.role?.toLowerCase() === 'admin' ||
    false

  const isNewUser = !user

  const initialForm = useMemo(
    () => ({
      ...(freshUser || {}),
      birth_month: freshUser?.birth_month || '',
      date_of_birth: toDateInput(freshUser?.date_of_birth),
      license_expiration: toDateInput(freshUser?.license_expiration),
      join_date: toDateInput(freshUser?.join_date),
      shipping_state: freshUser?.shipping_state || '',
      shipping_city: freshUser?.shipping_city || '',
      shipping_zip: freshUser?.shipping_zip || '',
      shipping_address_line1: freshUser?.shipping_address_line1 || '',
      shipping_address_line2: freshUser?.shipping_address_line2 || '',
      instagram_handle: freshUser?.instagram_handle || '',
      tiktok_handle: freshUser?.tiktok_handle || '',
      threads_handle: freshUser?.threads_handle || '',
      youtube_url: freshUser?.youtube_url || '',
      linkedin_url: freshUser?.linkedin_url || '',
      facebook_url: freshUser?.facebook_url || '',
      commission_plan: freshUser?.commission_plan || '',
      commission_plan_other: freshUser?.commission_plan_other || '',
      preferred_first_name: freshUser?.preferred_first_name || '',
      preferred_last_name: freshUser?.preferred_last_name || '',
      first_name: freshUser?.first_name || '',
      last_name: freshUser?.last_name || '',
      email: freshUser?.email || '',
      personal_email: freshUser?.personal_email || '',
      office_email: freshUser?.office_email || '',
      personal_phone: freshUser?.personal_phone ? formatPhone(freshUser.personal_phone) : '',
      business_phone: freshUser?.business_phone ? formatPhone(freshUser.business_phone) : '',
      office: freshUser?.office || '',
      team_name: freshUser?.team_name || '',
      team_lead: freshUser?.team_lead || '',
      division: freshUser?.division || '',
      status: freshUser?.status || '',
      license_number: freshUser?.license_number || '',
      nrds_id: freshUser?.nrds_id || '',
      mls_id: freshUser?.mls_id || '',
      association: freshUser?.association || '',
      revenue_share: parseRevenueShare(freshUser?.revenue_share),
      referring_agent: freshUser?.referring_agent || '',
      job_title: freshUser?.job_title || '',
      onedrive_folder_url: freshUser?.onedrive_folder_url || '',
      shirt_type: freshUser?.shirt_type || '',
      shirt_size: freshUser?.shirt_size || '',
      is_active: freshUser?.is_active ?? true,
      roles: freshUser?.roles || [],
      password: '', // For new users
    }),
    [freshUser]
  )

  const [formData, setFormData] = useState(initialForm)

  // Update formData when freshUser changes
  useEffect(() => {
    setFormData(initialForm)
  }, [initialForm])
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(user?.headshot_url || null)

  // Update headshot URL when user changes
  useEffect(() => {
    setHeadshotUrl(freshUser?.headshot_url || user?.headshot_url || null)
  }, [freshUser?.headshot_url, user?.headshot_url])

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev: any) => {
      const updated = { ...prev, [field]: value }

      // Sync status dropdown with is_active checkbox
      if (field === 'status') {
        if (value === 'active') {
          updated.is_active = true
        } else if (value === 'inactive') {
          updated.is_active = false
        }
        // For 'onboarding' or empty, keep current is_active value
      }

      // Sync is_active checkbox with status dropdown
      if (field === 'is_active') {
        if (value === true) {
          updated.status = 'active'
        } else if (value === false) {
          updated.status = 'inactive'
        }
      }

      return updated
    })
  }

  const handleResetPassword = async () => {
    if (!user || !user.id) return

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setResettingPassword(true)
    setError(null)

    try {
      const response = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      setShowPasswordReset(false)
      setNewPassword('')
      alert('Password reset successfully!')
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password')
    } finally {
      setResettingPassword(false)
    }
  }

  // Removed handleNameBlur - names are preserved exactly as typed by the user

  const handlePhoneChange = (field: string, value: string) => {
    const formatted = formatPhone(value)
    setFormData((prev: any) => ({ ...prev, [field]: formatted }))
  }

  const handleRevenueShareSelect = (name: string) => {
    setFormData((prev: any) => ({
      ...prev,
      revenue_share: [...prev.revenue_share, name],
    }))
  }

  const handleRevenueShareRemove = (name: string) => {
    setFormData((prev: any) => ({
      ...prev,
      revenue_share: prev.revenue_share.filter((n: string) => n !== name),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Names are preserved exactly as typed by the user (no auto-formatting)
      const formattedData = {
        ...formData,
      }

      // Validation for required fields
      if (
        !formattedData.email ||
        !formattedData.first_name ||
        !formattedData.last_name ||
        !formattedData.preferred_first_name ||
        !formattedData.preferred_last_name
      ) {
        setError('Email and all name fields are required')
        setSaving(false)
        return
      }

      // For new users, password is required
      if (isNewUser && !formattedData.password) {
        setError('Password is required for new users')
        setSaving(false)
        return
      }

      if (isNewUser && formattedData.password && formattedData.password.length < 8) {
        setError('Password must be at least 8 characters')
        setSaving(false)
        return
      }

      if (isNewUser) {
        // Create new user
        const response = await fetch('/api/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formattedData.email,
            password: formattedData.password,
            first_name: formattedData.first_name,
            last_name: formattedData.last_name,
            preferred_first_name: formattedData.preferred_first_name,
            preferred_last_name: formattedData.preferred_last_name,
            roles: normalizeRoles(formattedData.roles || []),
            is_active: formattedData.is_active,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create user')
        }

        // Now update with additional fields if provided
        const updatePayload: Record<string, any> = {
          personal_email: toNullableString(formData.personal_email),
          office_email: toNullableString(formData.office_email),
          personal_phone: toNullableString(formData.personal_phone),
          business_phone: toNullableString(formData.business_phone),
          birth_month: toNullableString(formData.birth_month),
          date_of_birth: toNullableString(formData.date_of_birth),
          shipping_address_line1: toNullableString(formData.shipping_address_line1),
          shipping_address_line2: toNullableString(formData.shipping_address_line2),
          shipping_city: toNullableString(formData.shipping_city),
          shipping_state: toNullableString(formData.shipping_state),
          shipping_zip: toNullableString(formData.shipping_zip),
          instagram_handle: normalizeSocialUrl(formData.instagram_handle, 'instagram'),
          tiktok_handle: normalizeSocialUrl(formData.tiktok_handle, 'tiktok'),
          threads_handle: normalizeSocialUrl(formData.threads_handle, 'threads'),
          youtube_url: normalizeSocialUrl(formData.youtube_url, 'youtube'),
          linkedin_url: normalizeSocialUrl(formData.linkedin_url, 'linkedin'),
          facebook_url: normalizeSocialUrl(formData.facebook_url, 'facebook'),
          office: toNullableString(formData.office),
          team_name: toNullableString(formData.team_name),
          team_lead: toNullableString(formData.team_lead),
          division: toNullableString(formData.division),
          status: toNullableString(formData.status),
          join_date: toNullableString(formData.join_date),
          license_number: toNullableString(formData.license_number),
          license_expiration: toNullableString(formData.license_expiration),
          nrds_id: toNullableString(formData.nrds_id),
          mls_id: toNullableString(formData.mls_id),
          association: toNullableString(formData.association),
          commission_plan: toNullableString(formData.commission_plan),
          commission_plan_other: toNullableString(formData.commission_plan_other),
          revenue_share: stringifyRevenueShare(formData.revenue_share),
          referring_agent: toNullableString(formData.referring_agent),
          job_title: toNullableString(formData.job_title),
          shirt_type: toNullableString(formData.shirt_type),
          shirt_size: toNullableString(formData.shirt_size),
        }

        // Only update if there are additional fields
        const hasAdditionalFields = Object.values(updatePayload).some(v => v !== null && v !== '')
        if (hasAdditionalFields) {
          const updateRes = await fetch('/api/users/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.user.id, ...updatePayload }),
          })

          if (!updateRes.ok) {
            const updateErr = await updateRes.json()
            throw new Error(updateErr.error || 'Failed to update user')
          }
        }

        await fetch('/api/roster/regenerate', { method: 'POST' })
        // Regenerate roster in background (don't wait for it)
        fetch('/api/roster/regenerate', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              console.error('Roster regeneration error:', data.error)
            } else {
              console.log('Roster regenerated successfully:', data.agentCount, 'agents')
            }
          })
          .catch(err => console.error('Roster regeneration failed:', err))

        onSaved(data.user)
        onClose()
      } else {
        // Update existing user
        const payload: Record<string, any> = {
          preferred_first_name: toNullableString(formattedData.preferred_first_name),
          preferred_last_name: toNullableString(formattedData.preferred_last_name),
          first_name: toNullableString(formattedData.first_name),
          last_name: toNullableString(formattedData.last_name),
          email: toNullableString(formData.email),
          personal_email: toNullableString(formData.personal_email),
          office_email: toNullableString(formData.office_email),
          personal_phone: toNullableString(formData.personal_phone),
          business_phone: toNullableString(formData.business_phone),
          birth_month: toNullableString(formData.birth_month),
          date_of_birth: toNullableString(formData.date_of_birth),
          shipping_address_line1: toNullableString(formData.shipping_address_line1),
          shipping_address_line2: toNullableString(formData.shipping_address_line2),
          shipping_city: toNullableString(formData.shipping_city),
          shipping_state: toNullableString(formData.shipping_state),
          shipping_zip: toNullableString(formData.shipping_zip),
          instagram_handle: normalizeSocialUrl(formData.instagram_handle, 'instagram'),
          tiktok_handle: normalizeSocialUrl(formData.tiktok_handle, 'tiktok'),
          threads_handle: normalizeSocialUrl(formData.threads_handle, 'threads'),
          youtube_url: normalizeSocialUrl(formData.youtube_url, 'youtube'),
          linkedin_url: normalizeSocialUrl(formData.linkedin_url, 'linkedin'),
          facebook_url: normalizeSocialUrl(formData.facebook_url, 'facebook'),
          is_active: !!formData.is_active,
          office: toNullableString(formData.office),
          team_name: toNullableString(formData.team_name),
          team_lead: toNullableString(formData.team_lead),
          division: toNullableString(formData.division),
          status: toNullableString(formData.status),
          join_date: toNullableString(formData.join_date),
          license_number: toNullableString(formData.license_number),
          license_expiration: toNullableString(formData.license_expiration),
          nrds_id: toNullableString(formData.nrds_id),
          mls_id: toNullableString(formData.mls_id),
          association: toNullableString(formData.association),
          commission_plan: toNullableString(formData.commission_plan),
          commission_plan_other: toNullableString(formData.commission_plan_other),
          revenue_share: stringifyRevenueShare(formData.revenue_share),
          referring_agent: toNullableString(formData.referring_agent),
          job_title: toNullableString(formData.job_title),
          shirt_type: toNullableString(formData.shirt_type),
          shirt_size: toNullableString(formData.shirt_size),
          roles: normalizeRoles(formData.roles || []),
        }

        console.log('Updating user with payload:', {
          id: freshUser?.id || user.id,
          is_active: payload.is_active,
          formData_is_active: formData.is_active,
          payload_keys: Object.keys(payload),
        })

        const updateRes = await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: freshUser?.id || user.id, ...payload }),
        })

        if (!updateRes.ok) {
          const error = await updateRes.json()
          console.error('Error updating user:', error)
          throw new Error(error.error || 'Failed to update user')
        }

        const updateResult = await updateRes.json()
        console.log(
          'User updated successfully. Database now has is_active:',
          updateResult?.user?.is_active
        )

        // Fetch the updated user from database to ensure we have the latest data
        const fetchRes = await fetch(`/api/users/profile?id=${freshUser?.id || user.id}`)
        const fetchData = await fetchRes.json()

        if (!fetchRes.ok) {
          console.error('Error fetching updated user:', fetchData.error)
          // Fallback to merged data if fetch fails
          onSaved({ ...user, ...payload })
        } else {
          // Use fresh data from database
          onSaved(fetchData.user)
        }

        // Regenerate roster in background (don't wait for it)
        fetch('/api/roster/regenerate', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              console.error('Roster regeneration error:', data.error)
            } else {
              console.log('Roster regenerated successfully:', data.agentCount, 'agents')
            }
          })
          .catch(err => console.error('Roster regeneration failed:', err))

        onClose()
      }
    } catch (err: any) {
      console.error('Error saving user:', err)
      setError(err?.message || `Failed to ${isNewUser ? 'create' : 'update'} user`)
    } finally {
      setSaving(false)
    }
  }

  const roles = user?.roles || []

  // Check if there's any prospective agent form data
  const hasProspectData =
    (freshUser || user)?.phone ||
    (freshUser || user)?.location ||
    (freshUser || user)?.mls_choice ||
    (freshUser || user)?.association_status_on_join ||
    (freshUser || user)?.previous_brokerage ||
    (freshUser || user)?.expectations ||
    (freshUser || user)?.accountability ||
    (freshUser || user)?.lead_generation ||
    (freshUser || user)?.additional_info ||
    (freshUser || user)?.how_heard ||
    (freshUser || user)?.how_heard_other ||
    (freshUser || user)?.joining_team

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white w-full max-w-4xl rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
          <div>
            <h3 className="text-2xl font-light tracking-luxury">
              {isNewUser
                ? 'Create New User'
                : `Edit Profile · ${freshUser?.preferred_first_name || user?.preferred_first_name} ${freshUser?.preferred_last_name || user?.preferred_last_name}`}
            </h3>
            <p className="text-sm text-luxury-gray-3">
              {isNewUser
                ? 'Fill in the required fields to create a new user.'
                : 'Changes sync automatically with the public roster.'}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-luxury-gray-2 hover:text-luxury-black">
            ×
          </button>
        </div>

        <div className="px-6 pt-4 border-b border-luxury-gray-5">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-4 py-2 rounded ${
                activeTab === 'basic'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-2'
              }`}
            >
              Basic
            </button>
            <button
              onClick={() => setActiveTab('real_estate')}
              className={`px-4 py-2 rounded ${
                activeTab === 'real_estate'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-2'
              }`}
            >
              Real Estate
            </button>
            {user && hasProspectData && (
              <button
                onClick={() => setActiveTab('prospect_form')}
                className={`px-4 py-2 rounded ${
                  activeTab === 'prospect_form'
                    ? 'bg-luxury-black text-white'
                    : 'bg-luxury-light text-luxury-gray-2'
                }`}
              >
                Prospective Agent Form
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Headshot Upload Section */}
              <div className="border-b border-luxury-gray-5 pb-6">
                <label className="text-sm font-medium text-luxury-gray-2 mb-3 block">
                  Profile Photo
                </label>
                {(freshUser || user) && (
                  <HeadshotUpload
                    currentHeadshotUrl={headshotUrl}
                    userId={(freshUser || user).id}
                    firstName={
                      (freshUser || user).preferred_first_name ||
                      (freshUser || user).first_name ||
                      ''
                    }
                    lastName={
                      (freshUser || user).preferred_last_name || (freshUser || user).last_name || ''
                    }
                    initialCrop={(freshUser || user).headshot_crop || null}
                    onUploadComplete={url => {
                      setHeadshotUrl(url)
                    }}
                    onRemove={() => {
                      setHeadshotUrl(null)
                    }}
                    size="large"
                  />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-luxury-gray-2">Preferred First Name</label>
                  <input
                    className="input-luxury"
                    value={formData.preferred_first_name}
                    onChange={e => handleInputChange('preferred_first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Preferred Last Name</label>
                  <input
                    className="input-luxury"
                    value={formData.preferred_last_name}
                    onChange={e => handleInputChange('preferred_last_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Legal First Name</label>
                  <input
                    className="input-luxury"
                    value={formData.first_name}
                    onChange={e => handleInputChange('first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Legal Last Name</label>
                  <input
                    className="input-luxury"
                    value={formData.last_name}
                    onChange={e => handleInputChange('last_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">
                    Primary Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    className="input-luxury"
                    value={formData.email}
                    onChange={e => handleInputChange('email', e.target.value)}
                    required
                  />
                </div>
                {isNewUser && (
                  <div>
                    <label className="text-sm text-luxury-gray-2">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      className="input-luxury"
                      value={formData.password || ''}
                      onChange={e => handleInputChange('password', e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                    />
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      Password must be at least 8 characters
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-sm text-luxury-gray-2">Personal Email</label>
                  <input
                    type="email"
                    className="input-luxury"
                    value={formData.personal_email}
                    onChange={e => handleInputChange('personal_email', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Office Email</label>
                  <input
                    type="email"
                    className="input-luxury"
                    value={formData.office_email}
                    onChange={e => handleInputChange('office_email', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Personal Phone (10 digits)</label>
                  <input
                    className="input-luxury"
                    value={formData.personal_phone}
                    onChange={e => handlePhoneChange('personal_phone', e.target.value)}
                    placeholder="1234567890"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Business Phone (10 digits)</label>
                  <input
                    className="input-luxury"
                    value={formData.business_phone}
                    onChange={e => handlePhoneChange('business_phone', e.target.value)}
                    placeholder="1234567890"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Birth Month</label>
                  <select
                    className="select-luxury"
                    value={formData.birth_month}
                    onChange={e => handleInputChange('birth_month', e.target.value)}
                  >
                    <option value="">Select month</option>
                    {months.map(month => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Date of Birth</label>
                  <input
                    type="date"
                    className="input-luxury"
                    value={formData.date_of_birth}
                    onChange={e => handleInputChange('date_of_birth', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => handleInputChange('is_active', e.target.checked)}
                  />
                  <span className="text-sm">Active Agent</span>
                </div>
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-2">Shirt Preference</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">Shirt Type</label>
                    <select
                      className="select-luxury"
                      value={formData.shirt_type}
                      onChange={e => handleInputChange('shirt_type', e.target.value)}
                    >
                      {shirtTypeOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Shirt Size</label>
                    <select
                      className="select-luxury"
                      value={formData.shirt_size}
                      onChange={e => handleInputChange('shirt_size', e.target.value)}
                    >
                      {shirtSizeOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-2">Shipping Address</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">Address Line 1</label>
                    <input
                      className="input-luxury"
                      value={formData.shipping_address_line1}
                      onChange={e => handleInputChange('shipping_address_line1', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Address Line 2</label>
                    <input
                      className="input-luxury"
                      value={formData.shipping_address_line2}
                      onChange={e => handleInputChange('shipping_address_line2', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">City</label>
                    <input
                      className="input-luxury"
                      value={formData.shipping_city}
                      onChange={e => handleInputChange('shipping_city', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">State</label>
                    <input
                      className="input-luxury"
                      value={formData.shipping_state}
                      onChange={e => handleInputChange('shipping_state', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">ZIP</label>
                    <input
                      className="input-luxury"
                      value={formData.shipping_zip}
                      onChange={e => handleInputChange('shipping_zip', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-2">Social Media URLs</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">Instagram</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://instagram.com/username"
                      value={formData.instagram_handle}
                      onChange={e => handleInputChange('instagram_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">TikTok</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://www.tiktok.com/@username"
                      value={formData.tiktok_handle}
                      onChange={e => handleInputChange('tiktok_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Threads</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://www.threads.net/@username"
                      value={formData.threads_handle}
                      onChange={e => handleInputChange('threads_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">YouTube</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://youtube.com/..."
                      value={formData.youtube_url}
                      onChange={e => handleInputChange('youtube_url', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">LinkedIn</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://linkedin.com/in/..."
                      value={formData.linkedin_url}
                      onChange={e => handleInputChange('linkedin_url', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Facebook</label>
                    <input
                      type="url"
                      className="input-luxury"
                      placeholder="https://facebook.com/..."
                      value={formData.facebook_url}
                      onChange={e => handleInputChange('facebook_url', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'real_estate' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-luxury-gray-2">Status</label>
                  <select
                    className="select-luxury"
                    value={formData.status}
                    onChange={e => handleInputChange('status', e.target.value)}
                  >
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Join Date</label>
                  <input
                    type="date"
                    className="input-luxury"
                    value={formData.join_date}
                    onChange={e => handleInputChange('join_date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Office</label>
                  <select
                    className="select-luxury"
                    value={formData.office}
                    onChange={e => handleInputChange('office', e.target.value)}
                  >
                    {officeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Team Name</label>
                  <input
                    className="input-luxury"
                    value={formData.team_name}
                    onChange={e => handleInputChange('team_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Team Lead</label>
                  <input
                    className="input-luxury"
                    value={formData.team_lead}
                    onChange={e => handleInputChange('team_lead', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Division</label>
                  <input
                    className="input-luxury"
                    value={formData.division}
                    onChange={e => handleInputChange('division', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">License Number</label>
                  <input
                    className="input-luxury"
                    value={formData.license_number}
                    onChange={e => handleInputChange('license_number', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">License Expiration</label>
                  <input
                    type="date"
                    className="input-luxury"
                    value={formData.license_expiration}
                    onChange={e => handleInputChange('license_expiration', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">NRDS ID</label>
                  <input
                    className="input-luxury"
                    value={formData.nrds_id}
                    onChange={e => handleInputChange('nrds_id', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">MLS ID</label>
                  <input
                    className="input-luxury"
                    value={formData.mls_id}
                    onChange={e => handleInputChange('mls_id', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Association</label>
                  <select
                    className="select-luxury"
                    value={formData.association}
                    onChange={e => handleInputChange('association', e.target.value)}
                  >
                    {associationOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Commission Plan</label>
                  <select
                    className="select-luxury"
                    value={formData.commission_plan}
                    onChange={e => handleInputChange('commission_plan', e.target.value)}
                  >
                    {commissionPlans.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Job Title</label>
                  <input
                    className="input-luxury"
                    value={formData.job_title}
                    onChange={e => handleInputChange('job_title', e.target.value)}
                    placeholder="e.g., Senior Agent, Team Lead, etc."
                  />
                </div>
                <div>
                  <label className="text-sm text-luxury-gray-2">Referring Agent</label>
                  <input
                    className="input-luxury"
                    value={formData.referring_agent}
                    onChange={e => handleInputChange('referring_agent', e.target.value)}
                    placeholder="Name of agent who referred them"
                  />
                </div>
                {/* Personal Documents Folder */}
                <div className="md:col-span-2">
                  <label className="text-sm text-luxury-gray-2 mb-1 block">
                    Personal Documents Folder
                  </label>
                  <input
                    type="url"
                    value={formData.onedrive_folder_url || ''}
                    onChange={e => handleInputChange('onedrive_folder_url', e.target.value)}
                    placeholder="https://collectiverealtyco-my.sharepoint.com/..."
                    className="input-luxury"
                  />
                </div>
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-2">Revenue Share</h4>
                <p className="text-xs text-luxury-gray-3 mb-2">
                  Select users who receive revenue share from this agent
                </p>
                <UserAutocomplete
                  selectedUsers={formData.revenue_share}
                  onSelect={handleRevenueShareSelect}
                  onRemove={handleRevenueShareRemove}
                  allUsers={allUsers}
                />
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-3">Roles</h4>
                <div className="space-y-2">
                  {['admin', 'agent', 'tc'].map(role => (
                    <label key={role} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          formData.roles?.some((r: string) => r.toLowerCase() === role) || false
                        }
                        onChange={e => {
                          const currentRoles = formData.roles || []
                          if (e.target.checked) {
                            // Add role if not already present (case-insensitive check)
                            if (!currentRoles.some((r: string) => r.toLowerCase() === role)) {
                              setFormData({ ...formData, roles: [...currentRoles, role] })
                            }
                          } else {
                            // Remove role (case-insensitive)
                            setFormData({
                              ...formData,
                              roles: currentRoles.filter((r: string) => r.toLowerCase() !== role),
                            })
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm capitalize">{role}</span>
                    </label>
                  ))}
                  {/* Display any additional roles that aren't in the standard list */}
                  {formData.roles?.filter(
                    (r: string) => !['admin', 'agent', 'tc'].includes(r.toLowerCase())
                  ).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-luxury-gray-5">
                      <p className="text-xs text-luxury-gray-2 mb-2">Additional Roles:</p>
                      <div className="flex flex-wrap gap-2">
                        {formData.roles
                          .filter(
                            (r: string) => !['admin', 'agent', 'tc'].includes(r.toLowerCase())
                          )
                          .map((role: string) => (
                            <span
                              key={role}
                              className="px-2 py-1 rounded bg-luxury-gray-5 text-luxury-gray-1 text-xs"
                            >
                              {role}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'prospect_form' && (
            <div className="space-y-6">
              <p className="text-sm text-luxury-gray-3 italic">
                This information was submitted when the agent filled out the prospective agent form.
                These fields are read-only.
              </p>

              {/* Contact Information from Form */}
              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-3">Contact Information</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">Phone</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.phone || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Location</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.location || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Instagram Handle</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.instagram_handle || ''}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* MLS Information from Form */}
              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-3">MLS Information</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">MLS Choice</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.mls_choice || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Association Status on Join</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.association_status_on_join || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Previous Brokerage</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.previous_brokerage || ''}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* Expectations from Form */}
              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-3">Expectations</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-luxury-gray-2">
                      What expectations do you have for Collective Realty Co.?
                    </label>
                    <textarea
                      className="input-luxury bg-gray-50 min-h-[100px] w-full"
                      value={user.expectations || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">
                      Do you want to be held accountable?
                    </label>
                    <textarea
                      className="input-luxury bg-gray-50 min-h-[100px] w-full"
                      value={user.accountability || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">
                      How do you plan to produce business leads?
                    </label>
                    <textarea
                      className="input-luxury bg-gray-50 min-h-[100px] w-full"
                      value={user.lead_generation || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">
                      Is there anything you would like to add?
                    </label>
                    <textarea
                      className="input-luxury bg-gray-50 min-h-[100px] w-full"
                      value={user.additional_info || ''}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>

              {/* Referral & Team Information from Form */}
              <div className="border-t border-luxury-gray-5 pt-4">
                <h4 className="text-sm font-medium text-luxury-gray-2 mb-3">
                  Referral & Team Information
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-luxury-gray-2">How did you hear about us?</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.how_heard || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  {user.how_heard_other && (
                    <div>
                      <label className="text-sm text-luxury-gray-2">How Heard (Other)</label>
                      <input
                        className="input-luxury bg-gray-50"
                        value={user.how_heard_other || ''}
                        readOnly
                        disabled
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-luxury-gray-2">Referring Agent</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.referring_agent || ''}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-sm text-luxury-gray-2">Joining Team</label>
                    <input
                      className="input-luxury bg-gray-50"
                      value={user.joining_team || ''}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-luxury-gray-5 bg-luxury-light px-6 py-4 space-y-3">
          {/* Password Reset Section (for existing users only) */}
          {!isNewUser && isAdmin && (
            <div className="pb-3 border-b border-luxury-gray-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-luxury-gray-2">Reset Password</label>
                <button
                  onClick={() => {
                    setShowPasswordReset(!showPasswordReset)
                    setNewPassword('')
                    setError(null)
                  }}
                  className="text-xs text-luxury-gray-2 hover:text-luxury-black underline"
                >
                  {showPasswordReset ? 'Cancel' : 'Reset Password'}
                </button>
              </div>
              {showPasswordReset && (
                <div className="space-y-2">
                  <input
                    type="password"
                    className="input-luxury"
                    placeholder="Enter new password (min 8 characters)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    disabled={resettingPassword}
                  />
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword || !newPassword || newPassword.length < 8}
                    className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resettingPassword ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? isNewUser
                  ? 'Creating...'
                  : 'Saving...'
                : isNewUser
                  ? 'Create User'
                  : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}