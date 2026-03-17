'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import PageContainer from '@/components/shared/PageContainer'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)

  useEffect(() => {
    checkAuthAndLoadUser()
  }, [])

  const formatDateForDisplay = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const checkAuthAndLoadUser = async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        router.push('/auth/login')
        return
      }

      const userData = JSON.parse(userStr)

      // Fetch fresh user data
      const { data: freshUserData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single()

      if (userError) {
        console.error('Error fetching user data:', userError)
        throw new Error('Failed to load profile')
      }

      if (!freshUserData) {
        throw new Error('User not found')
      }

      setUser(freshUserData)
      setHeadshotUrl(freshUserData.headshot_url || null)
      setLoading(false)
    } catch (error: any) {
      console.error('Error loading profile:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading your profile...</p>
        </div>
      </PageContainer>
    )
  }

  if (!user) {
    return (
      <PageContainer>
        <div className="card-section text-center py-12">
          <p className="text-red-600">Failed to load profile. Please try again.</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="mt-4 px-4 py-2 text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90"
          >
            Go to Login
          </button>
        </div>
      </PageContainer>
    )
  }

  const preferredName = `${user.preferred_first_name} ${user.preferred_last_name}`
  // Check role (simple string, not array)
  const roles = user.role ? [user.role] : []
  const isAdmin = user.role === 'Admin'
  const isAgent = user.role === 'Agent'

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const [personalForm, setPersonalForm] = useState({
    preferred_first_name: user.preferred_first_name || '',
    preferred_last_name: user.preferred_last_name || '',
    personal_email: user.personal_email || '',
    personal_phone: user.personal_phone || '',
    instagram_handle: user.instagram_handle || '',
    tiktok_handle: user.tiktok_handle || '',
    threads_handle: user.threads_handle || '',
    youtube_url: user.youtube_url || '',
    linkedin_url: user.linkedin_url || '',
    facebook_url: user.facebook_url || '',
    shipping_address_line1: user.shipping_address_line1 || '',
    shipping_address_line2: user.shipping_address_line2 || '',
    shipping_city: user.shipping_city || '',
    shipping_state: user.shipping_state || '',
    shipping_zip: user.shipping_zip || '',
    birth_month: user.birth_month || '',
    date_of_birth: user.date_of_birth || '',
    shirt_type: user.shirt_type || '',
    shirt_size: user.shirt_size || '',
  })

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

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)

      if (error) {
        console.error('Error updating profile:', error)
        setSaveError('Failed to save changes. Please try again.')
      } else {
        setSaveSuccess('Personal information updated.')
        // Refresh user data
        await checkAuthAndLoadUser()
      }
    } catch (e) {
      console.error('Error updating profile:', e)
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer>
        <div className="mb-8">
          <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-4 md:mb-6" style={{ fontWeight: '600' }}>
            My Profile
          </h2>
        </div>

        <div className="card-section">
          <h3 className="text-base font-medium text-luxury-gray-1 mb-4">Profile Photo</h3>
          <HeadshotUpload
            currentHeadshotUrl={headshotUrl}
            userId={user.id}
            firstName={user.preferred_first_name || user.first_name || ''}
            lastName={user.preferred_last_name || user.last_name || ''}
            initialCrop={user.headshot_crop || null}
            onUploadComplete={(url) => {
              setHeadshotUrl(url)
              // Refresh user data
              checkAuthAndLoadUser()
            }}
            onRemove={() => {
              setHeadshotUrl(null)
              // Refresh user data
              checkAuthAndLoadUser()
            }}
            size="large"
          />
          <p className="text-xs text-luxury-gray-3 mt-4">
            Upload a professional headshot. Accepted formats: .jpg, .jpeg, .png (max 5MB)
          </p>
        </div>

        <div className="card-section mt-6">
          <h3 className="text-base font-medium text-luxury-gray-1 mb-4">Personal Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-luxury-gray-2">Preferred First Name</label>
              <input
                className="input-luxury"
                value={personalForm.preferred_first_name}
                onChange={(e) => handlePersonalChange('preferred_first_name', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Preferred Last Name</label>
              <input
                className="input-luxury"
                value={personalForm.preferred_last_name}
                onChange={(e) => handlePersonalChange('preferred_last_name', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Primary Login Email</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.email || ''}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Personal Email</label>
              <input
                className="input-luxury"
                value={personalForm.personal_email}
                onChange={(e) => handlePersonalChange('personal_email', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Personal Phone</label>
              <input
                className="input-luxury"
                value={personalForm.personal_phone}
                onChange={(e) => handlePersonalChange('personal_phone', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Instagram</label>
              <input
                className="input-luxury"
                value={personalForm.instagram_handle}
                onChange={(e) => handlePersonalChange('instagram_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">TikTok</label>
              <input
                className="input-luxury"
                value={personalForm.tiktok_handle}
                onChange={(e) => handlePersonalChange('tiktok_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Threads</label>
              <input
                className="input-luxury"
                value={personalForm.threads_handle}
                onChange={(e) => handlePersonalChange('threads_handle', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">YouTube URL</label>
              <input
                className="input-luxury"
                value={personalForm.youtube_url}
                onChange={(e) => handlePersonalChange('youtube_url', e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">LinkedIn URL</label>
              <input
                className="input-luxury"
                value={personalForm.linkedin_url}
                onChange={(e) => handlePersonalChange('linkedin_url', e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Facebook URL</label>
              <input
                className="input-luxury"
                value={personalForm.facebook_url}
                onChange={(e) => handlePersonalChange('facebook_url', e.target.value)}
                placeholder="https://"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <div>
              <label className="text-sm text-luxury-gray-2">Mailing Address Line 1</label>
              <input
                className="input-luxury"
                value={personalForm.shipping_address_line1}
                onChange={(e) => handlePersonalChange('shipping_address_line1', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Mailing Address Line 2</label>
              <input
                className="input-luxury"
                value={personalForm.shipping_address_line2}
                onChange={(e) => handlePersonalChange('shipping_address_line2', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">City</label>
              <input
                className="input-luxury"
                value={personalForm.shipping_city}
                onChange={(e) => handlePersonalChange('shipping_city', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">State</label>
              <input
                className="input-luxury"
                value={personalForm.shipping_state}
                onChange={(e) => handlePersonalChange('shipping_state', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">ZIP</label>
              <input
                className="input-luxury"
                value={personalForm.shipping_zip}
                onChange={(e) => handlePersonalChange('shipping_zip', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Birth Month</label>
              <input
                className="input-luxury"
                value={personalForm.birth_month}
                onChange={(e) => handlePersonalChange('birth_month', e.target.value)}
                placeholder="January"
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Date of Birth</label>
              <input
                type="date"
                className="input-luxury"
                value={personalForm.date_of_birth ? personalForm.date_of_birth.substring(0, 10) : ''}
                onChange={(e) => handlePersonalChange('date_of_birth', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Shirt Type</label>
              <input
                className="input-luxury"
                value={personalForm.shirt_type}
                onChange={(e) => handlePersonalChange('shirt_type', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Shirt Size</label>
              <input
                className="input-luxury"
                value={personalForm.shirt_size}
                onChange={(e) => handlePersonalChange('shirt_size', e.target.value)}
              />
            </div>
          </div>

          {saveError && (
            <p className="text-xs text-red-600 mt-3">{saveError}</p>
          )}
          {saveSuccess && (
            <p className="text-xs text-green-700 mt-3">{saveSuccess}</p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSavePersonal}
              disabled={saving}
              className="px-4 py-2 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Personal Info'}
            </button>
          </div>
        </div>

        <div className="card-section mt-6">
          <h3 className="text-base font-medium text-luxury-gray-1 mb-4">Real Estate Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-luxury-gray-2">Office</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.office || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Team</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.team_name || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Team Lead</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.team_lead || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Division(s)</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.division || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Status</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.status || (user.is_active ? 'active' : 'inactive')}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">MLS ID</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.mls_id || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">License Number</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.license_number || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">NRDS ID</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.nrds_id || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Association</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.association || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Commission Plan</label>
              <input
                className="input-luxury bg-gray-50"
                value={user.commission_plan || user.commission_plan_other || 'N/A'}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Join Date</label>
              <input
                className="input-luxury bg-gray-50"
                value={formatDateForDisplay(user.join_date || null)}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Roles</label>
              <input
                className="input-luxury bg-gray-50"
                value={roles.join(', ') || 'N/A'}
                readOnly
                disabled
              />
            </div>
          </div>
          <p className="text-xs text-luxury-gray-3 mt-4">
            Real estate information is managed by the office. Contact an administrator if something looks incorrect.
          </p>
          {isAdmin && isAgent && (
            <p className="text-xs text-luxury-gray-3 mt-2">
              You are both an admin and an agent. Use the admin dashboard to manage agent settings.
            </p>
          )}
          </div> 
      </PageContainer>
  )
}

