'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'
import { useAuth } from '@/lib/context/AuthContext'

type ProfilePageProps = {
  userId?: string
  isAdmin?: boolean
}

export default function ProfilePage({
  userId: adminUserId,
  isAdmin = false,
}: ProfilePageProps = {}) {
  const router = useRouter()
  const { hasPermission } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)

  // Saving states
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingRealEstate, setSavingRealEstate] = useState(false)
  const [savingLicense, setSavingLicense] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)

  // Success/error states
  const [personalError, setPersonalError] = useState<string | null>(null)
  const [personalSuccess, setPersonalSuccess] = useState<string | null>(null)
  const [realEstateError, setRealEstateError] = useState<string | null>(null)
  const [realEstateSuccess, setRealEstateSuccess] = useState<string | null>(null)
  const [licenseError, setLicenseError] = useState<string | null>(null)
  const [licenseSuccess, setLicenseSuccess] = useState<string | null>(null)
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null)

  // Form states
  const [personalForm, setPersonalForm] = useState({
    preferred_first_name: '',
    preferred_last_name: '',
    personal_email: '',
    personal_phone: '',
    business_phone: '',
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
    division: '',
    join_date: '',
    commission_plan: '',
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

  // Permission checks from DB
  const canManageAgents = hasPermission('can_manage_agents')
  const canManageBilling = hasPermission('can_manage_billing') || hasPermission('can_manage_agent_billing')

  // Edit permissions - require both DB permission AND isAdmin flag
  const canEditPersonalContact = canManageAgents && isAdmin
  const canEditRealEstate = canManageAgents && isAdmin
  const canEditLicense = canManageAgents && isAdmin
  const canEditBilling = canManageBilling && isAdmin

  // Check if user is a licensed agent
  const isLicensedAgent = user?.is_licensed_agent === true

  const formatDateForInput = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().split('T')[0]
  }

  const formatDateForDisplay = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  useEffect(() => {
    loadProfile()
  }, [adminUserId, isAdmin])

  const loadProfile = async () => {
    try {
      let userIdToLoad = adminUserId || null

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

      setPersonalForm({
        preferred_first_name: freshUserData.preferred_first_name || '',
        preferred_last_name: freshUserData.preferred_last_name || '',
        personal_email: freshUserData.personal_email || '',
        personal_phone: freshUserData.personal_phone || '',
        business_phone: freshUserData.business_phone || freshUserData.phone || '',
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

      setRealEstateForm({
        office: freshUserData.office || '',
        status: freshUserData.status || '',
        is_active: freshUserData.is_active ?? true,
        division: freshUserData.division || '',
        join_date: formatDateForInput(freshUserData.join_date),
        commission_plan: freshUserData.commission_plan || '',
        role: freshUserData.role || '',
      })

      setLicenseForm({
        license_number: freshUserData.license_number || '',
        license_expiration: formatDateForInput(freshUserData.license_expiration),
        mls_id: freshUserData.mls_id || '',
        nrds_id: freshUserData.nrds_id || '',
        association: freshUserData.association || '',
        association_status_on_join: freshUserData.association_status_on_join || '',
      })

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
      const updates: Record<string, any> = {
        preferred_first_name: personalForm.preferred_first_name.trim() || user.preferred_first_name,
        preferred_last_name: personalForm.preferred_last_name.trim() || user.preferred_last_name,
        business_phone: personalForm.business_phone.trim() || null,
        instagram_handle: personalForm.instagram_handle.trim() || null,
        tiktok_handle: personalForm.tiktok_handle.trim() || null,
        threads_handle: personalForm.threads_handle.trim() || null,
        youtube_url: personalForm.youtube_url.trim() || null,
        linkedin_url: personalForm.linkedin_url.trim() || null,
        facebook_url: personalForm.facebook_url.trim() || null,
        shipping_address_line1: personalForm.shipping_address_line1.trim() || null,
        shipping_address_line2: personalForm.shipping_address_line2.trim() || null,
        shipping_city: personalForm.shipping_city.trim() || null,
        shipping_state: personalForm.shipping_state.trim() || null,
        shipping_zip: personalForm.shipping_zip.trim() || null,
        birth_month: personalForm.birth_month.trim() || null,
        date_of_birth: personalForm.date_of_birth || null,
        shirt_type: personalForm.shirt_type.trim() || null,
        shirt_size: personalForm.shirt_size.trim() || null,
      }

      // Only include personal phone/email if admin with permission
      if (canEditPersonalContact) {
        updates.personal_email = personalForm.personal_email.trim() || null
        updates.personal_phone = personalForm.personal_phone.trim() || null
      }

      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates }),
      })

      if (!res.ok) {
        setPersonalError('Failed to save changes. Please try again.')
      } else {
        setPersonalSuccess('Personal information updated.')
        await loadProfile()
      }
    } catch (e) {
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
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: realEstateForm }),
      })

      if (!res.ok) {
        setRealEstateError('Failed to save changes. Please try again.')
      } else {
        setRealEstateSuccess('Real estate information updated.')
        await loadProfile()
      }
    } catch (e) {
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
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: licenseForm }),
      })

      if (!res.ok) {
        setLicenseError('Failed to save changes. Please try again.')
      } else {
        setLicenseSuccess('License information updated.')
        await loadProfile()
      }
    } catch (e) {
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
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          updates: {
            monthly_fee_waived: billingForm.monthly_fee_waived,
            waive_processing_fees: billingForm.waive_processing_fees,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to save')
      setBillingSuccess('Billing settings updated.')
      await loadProfile()
    } catch (e) {
      setBillingSuccess('Failed to save billing settings.')
    } finally {
      setSavingBilling(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading profile...</div>
  }

  if (!user) {
    return (
      <div className="container-card text-center py-12">
        <p className="text-red-600">Failed to load profile. Please try again.</p>
        <button
          onClick={() => router.push('/auth/login')}
          className="mt-4 btn btn-secondary text-sm"
        >
          Go to Login
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title mb-6">
        {isAdmin
          ? `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`
          : 'MY PROFILE'}
      </h1>

      {/* Non-licensed user notice */}
      {!isLicensedAgent && (
        <div className="container-card mb-5">
          <div className="inner-card bg-gray-50">
            <p className="text-sm text-luxury-gray-2 text-center">
              <span className="inline-block px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded mr-2">
                Staff
              </span>
              Staff accounts only have access to personal profile settings.
            </p>
          </div>
        </div>
      )}

      {/* Profile Photo */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Profile Photo
        </h2>
        <div className="inner-card">
          <HeadshotUpload
            currentHeadshotUrl={headshotUrl}
            userId={user.id}
            firstName={user.preferred_first_name || user.first_name || ''}
            lastName={user.preferred_last_name || user.last_name || ''}
            initialCrop={user.headshot_crop || null}
            onUploadComplete={url => {
              setHeadshotUrl(url)
              loadProfile()
            }}
            onRemove={() => {
              setHeadshotUrl(null)
              loadProfile()
            }}
            size="large"
          />
          <p className="text-xs text-luxury-gray-3 mt-4">
            Upload a professional headshot. Accepted formats: .jpg, .jpeg, .png (max 5MB)
          </p>
        </div>
      </div>

      {/* Personal Information */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Personal Information
        </h2>
        <div className="inner-card">
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
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Primary Login Email</label>
              <input
                className="input-luxury bg-luxury-gray-5/30"
                value={user.email || ''}
                readOnly
                disabled
              />
            </div>
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
                <input
                  className="input-luxury bg-luxury-gray-5/30"
                  value={user.personal_email || ''}
                  readOnly
                  disabled
                />
              )}
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Business Phone</label>
              <input
                className="input-luxury"
                value={personalForm.business_phone}
                onChange={e => handlePersonalChange('business_phone', e.target.value)}
              />
            </div>
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
                <input
                  className="input-luxury bg-luxury-gray-5/30"
                  value={user.personal_phone || ''}
                  readOnly
                  disabled
                />
              )}
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Date of Birth</label>
              <input
                type="date"
                className="input-luxury"
                value={personalForm.date_of_birth ? personalForm.date_of_birth.substring(0, 10) : ''}
                onChange={e => handlePersonalChange('date_of_birth', e.target.value)}
              />
            </div>
          </div>

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Social Media</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Instagram</label>
              <input
                className="input-luxury"
                value={personalForm.instagram_handle}
                onChange={e => handlePersonalChange('instagram_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">TikTok</label>
              <input
                className="input-luxury"
                value={personalForm.tiktok_handle}
                onChange={e => handlePersonalChange('tiktok_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Threads</label>
              <input
                className="input-luxury"
                value={personalForm.threads_handle}
                onChange={e => handlePersonalChange('threads_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">YouTube URL</label>
              <input
                className="input-luxury"
                value={personalForm.youtube_url}
                onChange={e => handlePersonalChange('youtube_url', e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">LinkedIn URL</label>
              <input
                className="input-luxury"
                value={personalForm.linkedin_url}
                onChange={e => handlePersonalChange('linkedin_url', e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Facebook URL</label>
              <input
                className="input-luxury"
                value={personalForm.facebook_url}
                onChange={e => handlePersonalChange('facebook_url', e.target.value)}
                placeholder="https://"
              />
            </div>
          </div>

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Mailing Address</h3>
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

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Swag Preferences</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Type</label>
              <input
                className="input-luxury"
                value={personalForm.shirt_type}
                onChange={e => handlePersonalChange('shirt_type', e.target.value)}
                placeholder="Men's / Women's"
              />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Size</label>
              <input
                className="input-luxury"
                value={personalForm.shirt_size}
                onChange={e => handlePersonalChange('shirt_size', e.target.value)}
                placeholder="S, M, L, XL, etc."
              />
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
        </div>
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
                      <option value="">Select office...</option>
                      <option value="Houston">Houston</option>
                      <option value="DFW">DFW</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-luxury-gray-3 mb-1 block">Status</label>
                    <div className="flex items-center gap-4 h-[42px]">
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
                    <p className="text-sm font-medium text-luxury-gray-1 py-2">
                      {user.team_name ? (
                        <>
                          {user.team_name}
                          {user.is_team_lead && <span className="ml-2 text-xs text-luxury-accent">(Team Lead)</span>}
                        </>
                      ) : 'N/A'}
                    </p>
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
                      <option value="">Select plan...</option>
                      <option value="new_agent">New Agent 70/30</option>
                      <option value="no_cap">No Cap 85/15</option>
                      <option value="cap">Cap 70/30</option>
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
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {user.team_name ? (
                        <>
                          {user.team_name}
                          {user.is_team_lead && <span className="ml-2 text-xs text-luxury-accent">(Team Lead)</span>}
                        </>
                      ) : 'N/A'}
                    </p>
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
                      <option value="">Select association...</option>
                      <option value="HAR">HAR</option>
                      <option value="MetroTex">MetroTex</option>
                      <option value="CCAR">CCAR</option>
                      <option value="TAR">TAR</option>
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

          {/* Performance Stats */}
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
                    <button
                      onClick={() =>
                        setBillingForm(prev => ({
                          ...prev,
                          monthly_fee_waived: !prev.monthly_fee_waived,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingForm.monthly_fee_waived ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.monthly_fee_waived ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">Processing Fees Waived</p>
                      <p className="text-xs text-luxury-gray-3">
                        Transaction processing fees will not be deducted from commissions
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setBillingForm(prev => ({
                          ...prev,
                          waive_processing_fees: !prev.waive_processing_fees,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingForm.waive_processing_fees ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.waive_processing_fees ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>
                {billingSuccess && (
                  <p
                    className={`text-xs mt-4 ${billingSuccess.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}
                  >
                    {billingSuccess}
                  </p>
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
                  <p className="text-xs text-luxury-gray-3 mb-1">Monthly Fee</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {user.monthly_fee_waived ? 'Waived' : '$50/month'}
                  </p>
                </div>
                <div className="inner-card">
                  <p className="text-xs text-luxury-gray-3 mb-1">Processing Fees</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {user.waive_processing_fees ? 'Waived' : 'Standard'}
                  </p>
                </div>
                <div className="inner-card">
                  <p className="text-xs text-luxury-gray-3 mb-1">Monthly Fee Paid Through</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {formatDateForDisplay(user.monthly_fee_paid_through) || 'N/A'}
                  </p>
                </div>
                <div className="inner-card">
                  <p className="text-xs text-luxury-gray-3 mb-1">Onboarding Fee</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {user.onboarding_fee_paid
                      ? `Paid ${formatDateForDisplay(user.onboarding_fee_paid_date)}`
                      : 'Not Paid'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}