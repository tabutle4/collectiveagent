'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'
import { useAuth } from '@/lib/context/AuthContext'

type ProfilePageProps = {
  userId?: string
  isAdmin?: boolean
}

const officeOptions = [
  { value: '', label: 'Select office...' },
  { value: 'Houston', label: 'Houston' },
  { value: 'DFW', label: 'DFW' },
]

const associationOptions = [
  { value: '', label: 'Select association...' },
  { value: 'HAR', label: 'HAR' },
  { value: 'MetroTex', label: 'MetroTex' },
  { value: 'CCAR', label: 'CCAR' },
  { value: 'TAR', label: 'TAR' },
]

const commissionPlanOptions = [
  { value: '', label: 'Select plan...' },
  { value: 'new_agent', label: 'New Agent 70/30' },
  { value: 'no_cap', label: 'No Cap 85/15' },
  { value: 'cap', label: 'Cap 70/30' },
]

export default function ProfilePage({
  userId: adminUserId,
  isAdmin = false,
}: ProfilePageProps = {}) {
  const router = useRouter()
  const { user: authUser, hasPermission } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)
  
  // Saving states for each section
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingRealEstate, setSavingRealEstate] = useState(false)
  const [savingLicense, setSavingLicense] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  
  // Success/error states
  const [personalSuccess, setPersonalSuccess] = useState<string | null>(null)
  const [personalError, setPersonalError] = useState<string | null>(null)
  const [realEstateSuccess, setRealEstateSuccess] = useState<string | null>(null)
  const [realEstateError, setRealEstateError] = useState<string | null>(null)
  const [licenseSuccess, setLicenseSuccess] = useState<string | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null)

  // Form states
  const [personalForm, setPersonalForm] = useState({
    preferred_first_name: '',
    preferred_last_name: '',
    personal_email: '',
    personal_phone: '',
    instagram_handle: '',
    tiktok_handle: '',
    threads_handle: '',
    youtube_url: '',
    linkedin_url: '',
    facebook_url: '',
    shipping_address_line1: '',
    shipping_address_line2: '',
    shipping_city: '',
    shipping_state: '',
    shipping_zip: '',
    birth_month: '',
    date_of_birth: '',
    shirt_type: '',
    shirt_size: '',
  })

  const [realEstateForm, setRealEstateForm] = useState({
    office: '',
    status: '',
    is_active: true,
    team_name: '',
    division: '',
    join_date: '',
    commission_plan: '',
    commission_plan_other: '',
    role: '',
  })

  const [licenseForm, setLicenseForm] = useState({
    license_number: '',
    license_expiration: '',
    mls_id: '',
    nrds_id: '',
    association: '',
    association_status_on_join: '',
  })

  const [billingForm, setBillingForm] = useState({
    monthly_fee_waived: false,
    waive_processing_fees: false,
  })

  // Permission checks using DB permissions
  const canManageBilling = hasPermission('can_manage_billing') || hasPermission('can_manage_agent_billing')
  const canManageAgents = hasPermission('can_manage_agents')
  
  // Define who can edit what
  // Personal info: everyone can edit their own EXCEPT phone/email (admin only)
  // Real estate, license, billing: admin only
  const canEditPersonalBasic = true // Name, social, address, shirt - everyone can edit their own
  const canEditPersonalContact = canManageAgents && isAdmin // Phone/email - admin only
  const canEditRealEstate = canManageAgents && isAdmin
  const canEditLicense = canManageAgents && isAdmin
  const canEditBilling = canManageBilling && isAdmin

  // Check if this user is a licensed agent - determines which sections to show
  const isLicensedAgent = user?.is_licensed_agent === true

  // Format date for input field (YYYY-MM-DD)
  const formatDateForInput = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().split('T')[0]
  }

  // Format date for display
  const formatDateForDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  useEffect(() => {
    loadProfile()
  }, [adminUserId, isAdmin])

  const loadProfile = async () => {
    try {
      let userIdToLoad = adminUserId

      // If no adminUserId provided, load the current user's profile
      if (!userIdToLoad) {
        const meRes = await fetch('/api/auth/me')
        if (!meRes.ok) {
          router.push('/auth/login')
          return
        }
        const meData = await meRes.json()
        userIdToLoad = meData.user?.id
      }

      if (!userIdToLoad) {
        router.push('/auth/login')
        return
      }

      const res = await fetch(`/api/users/profile?id=${userIdToLoad}`)
      if (!res.ok) throw new Error('Failed to load profile')
      const data = await res.json()
      const freshUserData = data.user

      if (!freshUserData) throw new Error('User not found')

      setUser(freshUserData)
      setHeadshotUrl(freshUserData.headshot_url || null)
      
      // Populate personal form
      setPersonalForm({
        preferred_first_name: freshUserData.preferred_first_name || '',
        preferred_last_name: freshUserData.preferred_last_name || '',
        personal_email: freshUserData.personal_email || '',
        personal_phone: freshUserData.personal_phone || '',
        instagram_handle: freshUserData.instagram_handle || '',
        tiktok_handle: freshUserData.tiktok_handle || '',
        threads_handle: freshUserData.threads_handle || '',
        youtube_url: freshUserData.youtube_url || '',
        linkedin_url: freshUserData.linkedin_url || '',
        facebook_url: freshUserData.facebook_url || '',
        shipping_address_line1: freshUserData.shipping_address_line1 || '',
        shipping_address_line2: freshUserData.shipping_address_line2 || '',
        shipping_city: freshUserData.shipping_city || '',
        shipping_state: freshUserData.shipping_state || '',
        shipping_zip: freshUserData.shipping_zip || '',
        birth_month: freshUserData.birth_month || '',
        date_of_birth: freshUserData.date_of_birth || '',
        shirt_type: freshUserData.shirt_type || '',
        shirt_size: freshUserData.shirt_size || '',
      })

      // Populate real estate form
      setRealEstateForm({
        office: freshUserData.office || '',
        status: freshUserData.status || '',
        is_active: freshUserData.is_active ?? true,
        team_name: freshUserData.team_name || '',
        division: freshUserData.division || '',
        join_date: formatDateForInput(freshUserData.join_date),
        commission_plan: freshUserData.commission_plan || '',
        commission_plan_other: freshUserData.commission_plan_other || '',
        role: freshUserData.role || '',
      })

      // Populate license form
      setLicenseForm({
        license_number: freshUserData.license_number || '',
        license_expiration: formatDateForInput(freshUserData.license_expiration),
        mls_id: freshUserData.mls_id || '',
        nrds_id: freshUserData.nrds_id || '',
        association: freshUserData.association || '',
        association_status_on_join: freshUserData.association_status_on_join || '',
      })

      // Populate billing form
      setBillingForm({
        monthly_fee_waived: freshUserData.monthly_fee_waived || false,
        waive_processing_fees: freshUserData.waive_processing_fees || false,
      })

      setLoading(false)
    } catch (error: any) {
      console.error('Error loading profile:', error)
      setLoading(false)
    }
  }

  const handlePersonalChange = (field: keyof typeof personalForm, value: string) => {
    setPersonalForm(prev => ({ ...prev, [field]: value }))
    setPersonalError(null)
    setPersonalSuccess(null)
  }

  const handleRealEstateChange = (field: keyof typeof realEstateForm, value: any) => {
    setRealEstateForm(prev => ({ ...prev, [field]: value }))
    setRealEstateError(null)
    setRealEstateSuccess(null)
  }

  const handleLicenseChange = (field: keyof typeof licenseForm, value: string) => {
    setLicenseForm(prev => ({ ...prev, [field]: value }))
    setLicenseError(null)
    setLicenseSuccess(null)
  }

  const handleSavePersonal = async () => {
    if (!user) return
    setSavingPersonal(true)
    setPersonalError(null)
    setPersonalSuccess(null)

    try {
      // Build payload - exclude phone/email if user doesn't have permission
      const payload: Record<string, any> = {
        preferred_first_name: personalForm.preferred_first_name,
        preferred_last_name: personalForm.preferred_last_name,
        instagram_handle: personalForm.instagram_handle,
        tiktok_handle: personalForm.tiktok_handle,
        threads_handle: personalForm.threads_handle,
        youtube_url: personalForm.youtube_url,
        linkedin_url: personalForm.linkedin_url,
        facebook_url: personalForm.facebook_url,
        shipping_address_line1: personalForm.shipping_address_line1,
        shipping_address_line2: personalForm.shipping_address_line2,
        shipping_city: personalForm.shipping_city,
        shipping_state: personalForm.shipping_state,
        shipping_zip: personalForm.shipping_zip,
        birth_month: personalForm.birth_month,
        date_of_birth: personalForm.date_of_birth,
        shirt_type: personalForm.shirt_type,
        shirt_size: personalForm.shirt_size,
      }

      // Only include phone/email if admin
      if (canEditPersonalContact) {
        payload.personal_email = personalForm.personal_email
        payload.personal_phone = personalForm.personal_phone
      }

      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: payload }),
      })

      if (!res.ok) {
        const data = await res.json()
        setPersonalError(data.error || 'Failed to save changes.')
      } else {
        setPersonalSuccess('Personal information updated.')
        await loadProfile()
      }
    } catch (error) {
      setPersonalError('Failed to save changes. Please try again.')
    } finally {
      setSavingPersonal(false)
    }
  }

  const handleSaveRealEstate = async () => {
    if (!user) return
    setSavingRealEstate(true)
    setRealEstateError(null)
    setRealEstateSuccess(null)

    try {
      const payload = { ...realEstateForm }
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: payload }),
      })

      if (!res.ok) {
        const data = await res.json()
        setRealEstateError(data.error || 'Failed to save changes.')
      } else {
        setRealEstateSuccess('Real estate information updated.')
        await loadProfile()
      }
    } catch (error) {
      setRealEstateError('Failed to save changes. Please try again.')
    } finally {
      setSavingRealEstate(false)
    }
  }

  const handleSaveLicense = async () => {
    if (!user) return
    setSavingLicense(true)
    setLicenseError(null)
    setLicenseSuccess(null)

    try {
      const payload = { ...licenseForm }
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: payload }),
      })

      if (!res.ok) {
        const data = await res.json()
        setLicenseError(data.error || 'Failed to save changes.')
      } else {
        setLicenseSuccess('License information updated.')
        await loadProfile()
      }
    } catch (error) {
      setLicenseError('Failed to save changes. Please try again.')
    } finally {
      setSavingLicense(false)
    }
  }

  const handleSaveBilling = async () => {
    if (!user) return
    setSavingBilling(true)
    setBillingSuccess(null)

    try {
      const payload = { ...billingForm }
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: payload }),
      })

      if (res.ok) {
        setBillingSuccess('Billing settings updated.')
        await loadProfile()
      } else {
        setBillingSuccess('Failed to save billing settings.')
      }
    } catch (error) {
      setBillingSuccess('Failed to save billing settings.')
    } finally {
      setSavingBilling(false)
    }
  }

  // HeadshotUpload handlers - must match component props
  const handleHeadshotUploadComplete = (url: string) => {
    setHeadshotUrl(url)
    if (user) {
      setUser({ ...user, headshot_url: url })
    }
  }

  const handleHeadshotRemove = () => {
    setHeadshotUrl(null)
    if (user) {
      setUser({ ...user, headshot_url: null })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-luxury-gray-2">User not found</p>
      </div>
    )
  }

  const displayName = user.preferred_first_name && user.preferred_last_name
    ? `${user.preferred_first_name} ${user.preferred_last_name}`
    : user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.email

  return (
    <div className="min-h-screen bg-luxury-light p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="container-card mb-5">
          <div className="flex items-center gap-6">
            <HeadshotUpload
              userId={user.id}
              currentHeadshotUrl={headshotUrl}
              onUploadComplete={handleHeadshotUploadComplete}
              onRemove={handleHeadshotRemove}
              size="large"
              firstName={user.preferred_first_name || user.first_name || ''}
              lastName={user.preferred_last_name || user.last_name || ''}
              initialCrop={user.headshot_crop || null}
            />
            <div>
              <h1 className="text-xl font-semibold text-luxury-gray-1">{displayName}</h1>
              <p className="text-sm text-luxury-gray-2">{user.email}</p>
              {user.role && (
                <p className="text-xs text-luxury-gray-3 mt-1 capitalize">{user.role}</p>
              )}
              {!isLicensedAgent && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                  Staff
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Personal Information - Shown for ALL users */}
        <div className="container-card mb-5">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Personal Information
          </h2>
          {canEditPersonalBasic ? (
            <>
              <div className="inner-card mb-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Preferred First Name</label>
                    <input
                      className="input-luxury"
                      value={personalForm.preferred_first_name}
                      onChange={e => handlePersonalChange('preferred_first_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Preferred Last Name</label>
                    <input
                      className="input-luxury"
                      value={personalForm.preferred_last_name}
                      onChange={e => handlePersonalChange('preferred_last_name', e.target.value)}
                    />
                  </div>
                  {/* Personal Email - Admin only can edit */}
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">
                      Personal Email
                      {!canEditPersonalContact && <span className="text-luxury-gray-4 ml-1">(view only)</span>}
                    </label>
                    {canEditPersonalContact ? (
                      <input
                        className="input-luxury"
                        value={personalForm.personal_email}
                        onChange={e => handlePersonalChange('personal_email', e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-luxury-gray-1 py-2">{user.personal_email || 'N/A'}</p>
                    )}
                  </div>
                  {/* Personal Phone - Admin only can edit */}
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">
                      Personal Phone
                      {!canEditPersonalContact && <span className="text-luxury-gray-4 ml-1">(view only)</span>}
                    </label>
                    {canEditPersonalContact ? (
                      <input
                        className="input-luxury"
                        value={personalForm.personal_phone}
                        onChange={e => handlePersonalChange('personal_phone', e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-luxury-gray-1 py-2">{user.personal_phone || 'N/A'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="inner-card mb-4">
                <h3 className="text-xs font-medium text-luxury-gray-2 mb-3">Social Media</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Instagram Handle</label>
                    <input
                      className="input-luxury"
                      placeholder="@username"
                      value={personalForm.instagram_handle}
                      onChange={e => handlePersonalChange('instagram_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">TikTok Handle</label>
                    <input
                      className="input-luxury"
                      placeholder="@username"
                      value={personalForm.tiktok_handle}
                      onChange={e => handlePersonalChange('tiktok_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Threads Handle</label>
                    <input
                      className="input-luxury"
                      placeholder="@username"
                      value={personalForm.threads_handle}
                      onChange={e => handlePersonalChange('threads_handle', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">YouTube URL</label>
                    <input
                      className="input-luxury"
                      placeholder="https://youtube.com/..."
                      value={personalForm.youtube_url}
                      onChange={e => handlePersonalChange('youtube_url', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">LinkedIn URL</label>
                    <input
                      className="input-luxury"
                      placeholder="https://linkedin.com/in/..."
                      value={personalForm.linkedin_url}
                      onChange={e => handlePersonalChange('linkedin_url', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Facebook URL</label>
                    <input
                      className="input-luxury"
                      placeholder="https://facebook.com/..."
                      value={personalForm.facebook_url}
                      onChange={e => handlePersonalChange('facebook_url', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="inner-card mb-4">
                <h3 className="text-xs font-medium text-luxury-gray-2 mb-3">Shipping Address</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Address Line 1</label>
                    <input
                      className="input-luxury"
                      value={personalForm.shipping_address_line1}
                      onChange={e => handlePersonalChange('shipping_address_line1', e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Address Line 2</label>
                    <input
                      className="input-luxury"
                      value={personalForm.shipping_address_line2}
                      onChange={e => handlePersonalChange('shipping_address_line2', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">City</label>
                    <input
                      className="input-luxury"
                      value={personalForm.shipping_city}
                      onChange={e => handlePersonalChange('shipping_city', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">State</label>
                    <input
                      className="input-luxury"
                      value={personalForm.shipping_state}
                      onChange={e => handlePersonalChange('shipping_state', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">ZIP</label>
                    <input
                      className="input-luxury"
                      value={personalForm.shipping_zip}
                      onChange={e => handlePersonalChange('shipping_zip', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="inner-card mb-4">
                <h3 className="text-xs font-medium text-luxury-gray-2 mb-3">Other Details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Date of Birth</label>
                    <input
                      type="date"
                      className="input-luxury"
                      value={personalForm.date_of_birth}
                      onChange={e => handlePersonalChange('date_of_birth', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Birth Month</label>
                    <input
                      className="input-luxury"
                      placeholder="e.g. January"
                      value={personalForm.birth_month}
                      onChange={e => handlePersonalChange('birth_month', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Type</label>
                    <select
                      className="select-luxury"
                      value={personalForm.shirt_type}
                      onChange={e => handlePersonalChange('shirt_type', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="mens">Men&apos;s</option>
                      <option value="womens">Women&apos;s</option>
                      <option value="unisex">Unisex</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Size</label>
                    <select
                      className="select-luxury"
                      value={personalForm.shirt_size}
                      onChange={e => handlePersonalChange('shirt_size', e.target.value)}
                    >
                      <option value="">Select...</option>
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="2XL">2XL</option>
                      <option value="3XL">3XL</option>
                    </select>
                  </div>
                </div>
              </div>

              {personalError && <p className="text-xs text-red-600 mt-4">{personalError}</p>}
              {personalSuccess && <p className="text-xs text-green-700 mt-4">{personalSuccess}</p>}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSavePersonal}
                  disabled={savingPersonal}
                  className="btn btn-primary text-sm"
                >
                  {savingPersonal ? 'Saving...' : 'Save Personal Info'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-luxury-gray-2">Contact support to update personal information.</p>
          )}
        </div>

        {/* ========== LICENSED AGENT SECTIONS ONLY ========== */}
        {isLicensedAgent && (
          <>
            {/* Real Estate Information */}
            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Real Estate Information
              </h2>
              {canEditRealEstate ? (
                <div className="inner-card">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Office</label>
                      <select
                        className="select-luxury"
                        value={realEstateForm.office}
                        onChange={e => handleRealEstateChange('office', e.target.value)}
                      >
                        {officeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Status</label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="is_active"
                            checked={realEstateForm.is_active === true}
                            onChange={() => handleRealEstateChange('is_active', true)}
                          />
                          <span className="text-sm">Active</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="is_active"
                            checked={realEstateForm.is_active === false}
                            onChange={() => handleRealEstateChange('is_active', false)}
                          />
                          <span className="text-sm">Inactive</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Team</label>
                      <input
                        className="input-luxury"
                        value={realEstateForm.team_name}
                        onChange={e => handleRealEstateChange('team_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Division(s)</label>
                      <input
                        className="input-luxury"
                        value={realEstateForm.division}
                        onChange={e => handleRealEstateChange('division', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Join Date</label>
                      <input
                        type="date"
                        className="input-luxury"
                        value={realEstateForm.join_date}
                        onChange={e => handleRealEstateChange('join_date', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Commission Plan</label>
                      <select
                        className="select-luxury"
                        value={realEstateForm.commission_plan}
                        onChange={e => handleRealEstateChange('commission_plan', e.target.value)}
                      >
                        {commissionPlanOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Role</label>
                      <select
                        className="select-luxury"
                        value={realEstateForm.role}
                        onChange={e => handleRealEstateChange('role', e.target.value)}
                      >
                        <option value="">Select role...</option>
                        <option value="agent">Agent</option>
                        <option value="tc">TC</option>
                        <option value="operations">Operations</option>
                        <option value="broker">Broker</option>
                        <option value="support">Support</option>
                      </select>
                    </div>
                  </div>

                  {realEstateError && <p className="text-xs text-red-600 mt-4">{realEstateError}</p>}
                  {realEstateSuccess && <p className="text-xs text-green-700 mt-4">{realEstateSuccess}</p>}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleSaveRealEstate}
                      disabled={savingRealEstate}
                      className="btn btn-primary text-sm"
                    >
                      {savingRealEstate ? 'Saving...' : 'Save Real Estate Info'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Office</p>
                      <p className="text-sm font-medium text-luxury-gray-1">{user.office || 'N/A'}</p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Status</p>
                      <p className="text-sm font-medium text-luxury-gray-1 capitalize">
                        {user.status || (user.is_active ? 'Active' : 'Inactive')}
                      </p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Team</p>
                      <p className="text-sm font-medium text-luxury-gray-1">{user.team_name || 'N/A'}</p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Team Lead</p>
                      <p className="text-sm font-medium text-luxury-gray-1">{user.team_lead || 'N/A'}</p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Division(s)</p>
                      <p className="text-sm font-medium text-luxury-gray-1">{user.division || 'N/A'}</p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Join Date</p>
                      <p className="text-sm font-medium text-luxury-gray-1">
                        {formatDateForDisplay(user.join_date) || 'N/A'}
                      </p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Commission Plan</p>
                      <p className="text-sm font-medium text-luxury-gray-1">
                        {user.commission_plan || user.commission_plan_other || 'N/A'}
                      </p>
                    </div>
                    <div className="inner-card">
                      <p className="text-xs text-luxury-gray-3 mb-1">Role</p>
                      <p className="text-sm font-medium text-luxury-gray-1 capitalize">
                        {user.role || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-luxury-gray-3 mt-4">
                    Real estate information is managed by the office. Contact an administrator if something
                    looks incorrect.
                  </p>
                </>
              )}
            </div>

            {/* License Information */}
            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                License & Association
              </h2>
              {canEditLicense ? (
                <div className="inner-card">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">License Number</label>
                      <input
                        className="input-luxury"
                        value={licenseForm.license_number}
                        onChange={e => handleLicenseChange('license_number', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">License Expiration</label>
                      <input
                        type="date"
                        className="input-luxury"
                        value={licenseForm.license_expiration}
                        onChange={e => handleLicenseChange('license_expiration', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">MLS ID</label>
                      <input
                        className="input-luxury"
                        value={licenseForm.mls_id}
                        onChange={e => handleLicenseChange('mls_id', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">NRDS ID</label>
                      <input
                        className="input-luxury"
                        value={licenseForm.nrds_id}
                        onChange={e => handleLicenseChange('nrds_id', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Association</label>
                      <select
                        className="select-luxury"
                        value={licenseForm.association}
                        onChange={e => handleLicenseChange('association', e.target.value)}
                      >
                        {associationOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-luxury-gray-3 mb-1 block">Association Status (on join)</label>
                      <input
                        className="input-luxury"
                        value={licenseForm.association_status_on_join}
                        onChange={e => handleLicenseChange('association_status_on_join', e.target.value)}
                      />
                    </div>
                  </div>

                  {licenseError && <p className="text-xs text-red-600 mt-4">{licenseError}</p>}
                  {licenseSuccess && <p className="text-xs text-green-700 mt-4">{licenseSuccess}</p>}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleSaveLicense}
                      disabled={savingLicense}
                      className="btn btn-primary text-sm"
                    >
                      {savingLicense ? 'Saving...' : 'Save License Info'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">License Number</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{user.license_number || 'N/A'}</p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">License Expiration</p>
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {formatDateForDisplay(user.license_expiration) || 'N/A'}
                    </p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">MLS ID</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{user.mls_id || 'N/A'}</p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">NRDS ID</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{user.nrds_id || 'N/A'}</p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Association</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{user.association || 'N/A'}</p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Association Status (on join)</p>
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {user.association_status_on_join || 'N/A'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Performance Stats - Only show if agent has data */}
            {(user.total_sales_volume || user.total_units_closed || user.cap_progress > 0) && (
              <div className="container-card mb-5">
                <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                  Performance
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Total Sales Volume</p>
                    <p className="text-lg font-semibold text-luxury-accent">
                      {user.total_sales_volume
                        ? `$${Number(user.total_sales_volume).toLocaleString()}`
                        : '$0'}
                    </p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Units Closed</p>
                    <p className="text-lg font-semibold text-luxury-accent">
                      {user.total_units_closed || 0}
                    </p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Cap Progress</p>
                    <p className="text-lg font-semibold text-luxury-accent">
                      {user.cap_progress ? `$${Number(user.cap_progress).toLocaleString()}` : '$0'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Billing */}
            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Billing
              </h2>

              {canEditBilling ? (
                <div className="inner-card">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">Monthly Fee Waived</p>
                        <p className="text-xs text-luxury-gray-3">
                          Agent will not be invoiced for the $50 monthly fee
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={billingForm.monthly_fee_waived}
                          onChange={e =>
                            setBillingForm(prev => ({
                              ...prev,
                              monthly_fee_waived: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-luxury-gold"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">Waive Processing Fees</p>
                        <p className="text-xs text-luxury-gray-3">
                          Transaction processing fees will be waived for this agent
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={billingForm.waive_processing_fees}
                          onChange={e =>
                            setBillingForm(prev => ({
                              ...prev,
                              waive_processing_fees: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-luxury-gold"></div>
                      </label>
                    </div>
                  </div>

                  {billingSuccess && (
                    <p className="text-xs text-green-700 mt-4">{billingSuccess}</p>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleSaveBilling}
                      disabled={savingBilling}
                      className="btn btn-primary text-sm"
                    >
                      {savingBilling ? 'Saving...' : 'Save Billing Settings'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Monthly Fee Waived</p>
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {user.monthly_fee_waived ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Waive Processing Fees</p>
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {user.waive_processing_fees ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Non-licensed user message */}
        {!isLicensedAgent && (
          <div className="container-card mb-5">
            <div className="text-center py-4">
              <p className="text-sm text-luxury-gray-2">
                Staff accounts only have access to personal profile settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}