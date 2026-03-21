'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'
import { useAuth } from '@/lib/context/AuthContext'

type ProfilePageProps = {
  userId?: string
  isAdmin?: boolean
}

export default function ProfilePage({ userId: adminUserId, isAdmin = false }: ProfilePageProps = {}) {
  const router = useRouter()
  const { user: authUser, hasPermission } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null)
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
  const [billingForm, setBillingForm] = useState({
    monthly_fee_waived: false,
    waive_processing_fees: false,
  })

  const canManageBilling = hasPermission('can_manage_billing') || hasPermission('can_manage_agent_billing')

  useEffect(() => {
    checkAuthAndLoadUser()
  }, [adminUserId, isAdmin])

  const formatDateForDisplay = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const checkAuthAndLoadUser = async () => {
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
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleSavePersonal = async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      const updates: Record<string, any> = {
        preferred_first_name: personalForm.preferred_first_name.trim() || user.preferred_first_name,
        preferred_last_name: personalForm.preferred_last_name.trim() || user.preferred_last_name,
        personal_email: personalForm.personal_email.trim() || null,
        personal_phone: personalForm.personal_phone.trim() || null,
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

      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates }),
      })

      if (!res.ok) {
        setSaveError('Failed to save changes. Please try again.')
      } else {
        setSaveSuccess('Personal information updated.')
        await checkAuthAndLoadUser()
      }
    } catch (e) {
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
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
      await checkAuthAndLoadUser()
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
        <button onClick={() => router.push('/auth/login')} className="mt-4 btn btn-secondary text-sm">Go to Login</button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title mb-6">
        {isAdmin ? `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}` : 'MY PROFILE'}
      </h1>

      {/* Profile Photo */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Profile Photo</h2>
        <div className="inner-card">
          <HeadshotUpload
            currentHeadshotUrl={headshotUrl}
            userId={user.id}
            firstName={user.preferred_first_name || user.first_name || ''}
            lastName={user.preferred_last_name || user.last_name || ''}
            initialCrop={user.headshot_crop || null}
            onUploadComplete={(url) => { setHeadshotUrl(url); checkAuthAndLoadUser() }}
            onRemove={() => { setHeadshotUrl(null); checkAuthAndLoadUser() }}
            size="large"
          />
          <p className="text-xs text-luxury-gray-3 mt-4">Upload a professional headshot. Accepted formats: .jpg, .jpeg, .png (max 5MB)</p>
        </div>
      </div>

      {/* Personal Information */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Personal Information</h2>
        <div className="inner-card">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Preferred First Name</label>
              <input className="input-luxury" value={personalForm.preferred_first_name} onChange={(e) => handlePersonalChange('preferred_first_name', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Preferred Last Name</label>
              <input className="input-luxury" value={personalForm.preferred_last_name} onChange={(e) => handlePersonalChange('preferred_last_name', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Primary Login Email</label>
              <input className="input-luxury bg-luxury-gray-5/30" value={user.email || ''} readOnly disabled />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Personal Email</label>
              <input className="input-luxury" value={personalForm.personal_email} onChange={(e) => handlePersonalChange('personal_email', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Personal Phone</label>
              <input className="input-luxury" value={personalForm.personal_phone} onChange={(e) => handlePersonalChange('personal_phone', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Date of Birth</label>
              <input type="date" className="input-luxury" value={personalForm.date_of_birth ? personalForm.date_of_birth.substring(0, 10) : ''} onChange={(e) => handlePersonalChange('date_of_birth', e.target.value)} />
            </div>
          </div>

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Social Media</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Instagram</label>
              <input className="input-luxury" value={personalForm.instagram_handle} onChange={(e) => handlePersonalChange('instagram_handle', e.target.value)} placeholder="@username" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">TikTok</label>
              <input className="input-luxury" value={personalForm.tiktok_handle} onChange={(e) => handlePersonalChange('tiktok_handle', e.target.value)} placeholder="@username" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Threads</label>
              <input className="input-luxury" value={personalForm.threads_handle} onChange={(e) => handlePersonalChange('threads_handle', e.target.value)} placeholder="@username" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">YouTube URL</label>
              <input className="input-luxury" value={personalForm.youtube_url} onChange={(e) => handlePersonalChange('youtube_url', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">LinkedIn URL</label>
              <input className="input-luxury" value={personalForm.linkedin_url} onChange={(e) => handlePersonalChange('linkedin_url', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Facebook URL</label>
              <input className="input-luxury" value={personalForm.facebook_url} onChange={(e) => handlePersonalChange('facebook_url', e.target.value)} placeholder="https://" />
            </div>
          </div>

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Mailing Address</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs text-luxury-gray-3 mb-1 block">Address Line 1</label>
              <input className="input-luxury" value={personalForm.shipping_address_line1} onChange={(e) => handlePersonalChange('shipping_address_line1', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-luxury-gray-3 mb-1 block">Address Line 2</label>
              <input className="input-luxury" value={personalForm.shipping_address_line2} onChange={(e) => handlePersonalChange('shipping_address_line2', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">City</label>
              <input className="input-luxury" value={personalForm.shipping_city} onChange={(e) => handlePersonalChange('shipping_city', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">State</label>
              <input className="input-luxury" value={personalForm.shipping_state} onChange={(e) => handlePersonalChange('shipping_state', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">ZIP</label>
              <input className="input-luxury" value={personalForm.shipping_zip} onChange={(e) => handlePersonalChange('shipping_zip', e.target.value)} />
            </div>
          </div>

          <h3 className="text-sm font-medium text-luxury-gray-1 mt-6 mb-3">Swag Preferences</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Type</label>
              <input className="input-luxury" value={personalForm.shirt_type} onChange={(e) => handlePersonalChange('shirt_type', e.target.value)} placeholder="Men's / Women's" />
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Shirt Size</label>
              <input className="input-luxury" value={personalForm.shirt_size} onChange={(e) => handlePersonalChange('shirt_size', e.target.value)} placeholder="S, M, L, XL, etc." />
            </div>
          </div>

          {saveError && <p className="text-xs text-red-600 mt-4">{saveError}</p>}
          {saveSuccess && <p className="text-xs text-green-700 mt-4">{saveSuccess}</p>}

          <div className="mt-6 flex justify-end">
            <button onClick={handleSavePersonal} disabled={saving} className="btn btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Personal Info'}
            </button>
          </div>
        </div>
      </div>

      {/* Real Estate Information */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Real Estate Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Office</p>
            <p className="text-sm font-medium text-luxury-gray-1">{user.office || 'N/A'}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Status</p>
            <p className="text-sm font-medium text-luxury-gray-1 capitalize">{user.status || (user.is_active ? 'Active' : 'Inactive')}</p>
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
            <p className="text-sm font-medium text-luxury-gray-1">{formatDateForDisplay(user.join_date) || 'N/A'}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Commission Plan</p>
            <p className="text-sm font-medium text-luxury-gray-1">{user.commission_plan || user.commission_plan_other || 'N/A'}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">Role</p>
            <p className="text-sm font-medium text-luxury-gray-1 capitalize">{user.role || 'N/A'}</p>
          </div>
        </div>
        <p className="text-xs text-luxury-gray-3 mt-4">Real estate information is managed by the office. Contact an administrator if something looks incorrect.</p>
      </div>

      {/* License Information */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">License & Association</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">License Number</p>
            <p className="text-sm font-medium text-luxury-gray-1">{user.license_number || 'N/A'}</p>
          </div>
          <div className="inner-card">
            <p className="text-xs text-luxury-gray-3 mb-1">License Expiration</p>
            <p className="text-sm font-medium text-luxury-gray-1">{formatDateForDisplay(user.license_expiration) || 'N/A'}</p>
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
            <p className="text-sm font-medium text-luxury-gray-1">{user.association_status_on_join || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Performance Stats - Only show if agent has data */}
      {(user.total_sales_volume || user.total_units_closed || user.cap_progress > 0) && (
        <div className="container-card mb-5">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Total Sales Volume</p>
              <p className="text-lg font-semibold text-luxury-accent">
                {user.total_sales_volume ? `$${Number(user.total_sales_volume).toLocaleString()}` : '$0'}
              </p>
            </div>
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Units Closed</p>
              <p className="text-lg font-semibold text-luxury-accent">{user.total_units_closed || 0}</p>
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
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Billing</h2>

        {canManageBilling && isAdmin ? (
          <div className="inner-card">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-luxury-gray-1">Monthly Fee Waived</p>
                  <p className="text-xs text-luxury-gray-3">Agent will not be invoiced for the $50 monthly fee</p>
                </div>
                <button
                  onClick={() => setBillingForm(prev => ({ ...prev, monthly_fee_waived: !prev.monthly_fee_waived }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingForm.monthly_fee_waived ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.monthly_fee_waived ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-luxury-gray-1">Processing Fees Waived</p>
                  <p className="text-xs text-luxury-gray-3">Transaction processing fees will not be deducted from commissions</p>
                </div>
                <button
                  onClick={() => setBillingForm(prev => ({ ...prev, waive_processing_fees: !prev.waive_processing_fees }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingForm.waive_processing_fees ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.waive_processing_fees ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            {billingSuccess && (
              <p className={`text-xs mt-4 ${billingSuccess.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}>{billingSuccess}</p>
            )}
            <div className="mt-6 flex justify-end">
              <button onClick={handleSaveBilling} disabled={savingBilling} className="btn btn-primary text-sm">
                {savingBilling ? 'Saving...' : 'Save Billing Settings'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Monthly Fee</p>
              <p className="text-sm font-medium text-luxury-gray-1">{user.monthly_fee_waived ? 'Waived' : '$50/month'}</p>
            </div>
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Processing Fees</p>
              <p className="text-sm font-medium text-luxury-gray-1">{user.waive_processing_fees ? 'Waived' : 'Standard'}</p>
            </div>
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Monthly Fee Paid Through</p>
              <p className="text-sm font-medium text-luxury-gray-1">{formatDateForDisplay(user.monthly_fee_paid_through) || 'N/A'}</p>
            </div>
            <div className="inner-card">
              <p className="text-xs text-luxury-gray-3 mb-1">Onboarding Fee</p>
              <p className="text-sm font-medium text-luxury-gray-1">{user.onboarding_fee_paid ? `Paid ${formatDateForDisplay(user.onboarding_fee_paid_date)}` : 'Not Paid'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bank Connection */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Payment Information</h2>
        <div className="inner-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-luxury-gray-1">Bank Account</p>
              <p className="text-xs text-luxury-gray-3">
                {user.bank_connected 
                  ? `Connected ${user.bank_connected_at ? formatDateForDisplay(user.bank_connected_at) : ''}` 
                  : 'Not connected - required for commission payouts'}
              </p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded ${user.bank_connected ? 'text-green-700 bg-green-100' : 'text-luxury-accent bg-luxury-accent/10'}`}>
              {user.bank_connected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}