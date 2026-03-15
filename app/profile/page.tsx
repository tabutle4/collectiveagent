'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [personalForm, setPersonalForm] = useState({
    preferred_first_name: '', preferred_last_name: '', personal_email: '', personal_phone: '',
    instagram_handle: '', tiktok_handle: '', threads_handle: '', youtube_url: '', linkedin_url: '', facebook_url: '',
    shipping_address_line1: '', shipping_address_line2: '', shipping_city: '', shipping_state: '', shipping_zip: '',
    birth_month: '', date_of_birth: '', shirt_type: '', shirt_size: '',
  })
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)

  useEffect(() => { checkAuthAndLoadUser() }, [])

  useEffect(() => {
    if (user) {
      setPersonalForm({
        preferred_first_name: user.preferred_first_name || '', preferred_last_name: user.preferred_last_name || '',
        personal_email: user.personal_email || '', personal_phone: user.personal_phone || '',
        instagram_handle: user.instagram_handle || '', tiktok_handle: user.tiktok_handle || '',
        threads_handle: user.threads_handle || '', youtube_url: user.youtube_url || '',
        linkedin_url: user.linkedin_url || '', facebook_url: user.facebook_url || '',
        shipping_address_line1: user.shipping_address_line1 || '', shipping_address_line2: user.shipping_address_line2 || '',
        shipping_city: user.shipping_city || '', shipping_state: user.shipping_state || '', shipping_zip: user.shipping_zip || '',
        birth_month: user.birth_month || '', date_of_birth: user.date_of_birth || '',
        shirt_type: user.shirt_type || '', shirt_size: user.shirt_size || '',
      })
    }
  }, [user])

  const formatDateForDisplay = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const checkAuthAndLoadUser = async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) { router.push('/auth/login'); return }
      const userData = JSON.parse(userStr)
      const { data, error } = await supabase.from('users').select('*').eq('id', userData.id).single()
      if (error) throw error
      if (!data) throw new Error('User not found')
      setUser(data)
      setHeadshotUrl(data.headshot_url || null)
    } catch (error) { console.error('Error loading profile:', error) }
    finally { setLoading(false) }
  }

  const handlePersonalChange = (field: keyof typeof personalForm, value: string) => {
    setPersonalForm(prev => ({ ...prev, [field]: value }))
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleSavePersonal = async () => {
    if (!user) return
    setSaving(true); setSaveError(null); setSaveSuccess(null)
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
      const { error } = await supabase.from('users').update(updates).eq('id', user.id)
      if (error) { setSaveError('Failed to save changes.') }
      else { setSaveSuccess('Personal information updated.'); await checkAuthAndLoadUser() }
    } catch (e) { setSaveError('Failed to save changes.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading your profile...</div>
  if (!user) return (
    <div className="text-center py-12">
      <p className="text-sm text-red-600">Failed to load profile.</p>
      <button onClick={() => router.push('/auth/login')} className="btn btn-primary mt-4">Go to Login</button>
    </div>
  )

  const roles = user.role ? [user.role] : []

  return (
    <div>
      <h1 className="page-title mb-6">MY PROFILE</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column - Photo + Real Estate Info */}
        <div className="lg:col-span-4">
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Profile Photo</h2>
            <div className="flex justify-center mb-4">
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
            </div>
            <p className="text-xs text-luxury-gray-3 text-center">JPG, JPEG, PNG (max 5MB)</p>

            <div className="mt-6 pt-5 border-t border-luxury-gray-5/50">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Real Estate Info</h2>
              <div className="space-y-3">
                {[
                  { label: 'Office', value: user.office },
                  { label: 'Team', value: user.team_name },
                  { label: 'Team Lead', value: user.team_lead },
                  { label: 'Division(s)', value: user.division },
                  { label: 'Commission Plan', value: user.commission_plan || user.commission_plan_other },
                  { label: 'License #', value: user.license_number },
                  { label: 'MLS ID', value: user.mls_id },
                  { label: 'NRDS ID', value: user.nrds_id },
                  { label: 'Association', value: user.association },
                  { label: 'Join Date', value: formatDateForDisplay(user.join_date || null) },
                  { label: 'Role', value: roles.join(', ') },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-luxury-gray-3">{item.label}</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{item.value || 'N/A'}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-luxury-gray-3 mt-4">Managed by the office. Contact admin if incorrect.</p>
            </div>
          </div>
        </div>

        {/* Right column - Editable Personal Info */}
        <div className="lg:col-span-8">
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Personal Information</h2>

            <div className="space-y-5">
              {/* Name */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Name</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Preferred First Name</label><input className="input-luxury" value={personalForm.preferred_first_name} onChange={(e) => handlePersonalChange('preferred_first_name', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Preferred Last Name</label><input className="input-luxury" value={personalForm.preferred_last_name} onChange={(e) => handlePersonalChange('preferred_last_name', e.target.value)} /></div>
                </div>
              </div>

              {/* Contact */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Contact</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Login Email</label><input className="input-luxury opacity-60" value={user.email || ''} readOnly disabled /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Personal Email</label><input className="input-luxury" value={personalForm.personal_email} onChange={(e) => handlePersonalChange('personal_email', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Personal Phone</label><input className="input-luxury" value={personalForm.personal_phone} onChange={(e) => handlePersonalChange('personal_phone', e.target.value)} /></div>
                </div>
              </div>

              {/* Social Media */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Social Media</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Instagram</label><input className="input-luxury" value={personalForm.instagram_handle} onChange={(e) => handlePersonalChange('instagram_handle', e.target.value)} placeholder="@username" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">TikTok</label><input className="input-luxury" value={personalForm.tiktok_handle} onChange={(e) => handlePersonalChange('tiktok_handle', e.target.value)} placeholder="@username" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Threads</label><input className="input-luxury" value={personalForm.threads_handle} onChange={(e) => handlePersonalChange('threads_handle', e.target.value)} placeholder="@username" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">YouTube</label><input className="input-luxury" value={personalForm.youtube_url} onChange={(e) => handlePersonalChange('youtube_url', e.target.value)} placeholder="https://" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">LinkedIn</label><input className="input-luxury" value={personalForm.linkedin_url} onChange={(e) => handlePersonalChange('linkedin_url', e.target.value)} placeholder="https://" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Facebook</label><input className="input-luxury" value={personalForm.facebook_url} onChange={(e) => handlePersonalChange('facebook_url', e.target.value)} placeholder="https://" /></div>
                </div>
              </div>

              {/* Mailing Address */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Mailing Address</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="block text-xs text-luxury-gray-3 mb-1">Address Line 1</label><input className="input-luxury" value={personalForm.shipping_address_line1} onChange={(e) => handlePersonalChange('shipping_address_line1', e.target.value)} /></div>
                  <div className="col-span-2"><label className="block text-xs text-luxury-gray-3 mb-1">Address Line 2</label><input className="input-luxury" value={personalForm.shipping_address_line2} onChange={(e) => handlePersonalChange('shipping_address_line2', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">City</label><input className="input-luxury" value={personalForm.shipping_city} onChange={(e) => handlePersonalChange('shipping_city', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">State</label><input className="input-luxury" value={personalForm.shipping_state} onChange={(e) => handlePersonalChange('shipping_state', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">ZIP</label><input className="input-luxury" value={personalForm.shipping_zip} onChange={(e) => handlePersonalChange('shipping_zip', e.target.value)} /></div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Personal Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Birth Month</label><input className="input-luxury" value={personalForm.birth_month} onChange={(e) => handlePersonalChange('birth_month', e.target.value)} placeholder="January" /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Date of Birth</label><input type="date" className="input-luxury" value={personalForm.date_of_birth ? personalForm.date_of_birth.substring(0, 10) : ''} onChange={(e) => handlePersonalChange('date_of_birth', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Shirt Type</label><input className="input-luxury" value={personalForm.shirt_type} onChange={(e) => handlePersonalChange('shirt_type', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Shirt Size</label><input className="input-luxury" value={personalForm.shirt_size} onChange={(e) => handlePersonalChange('shirt_size', e.target.value)} /></div>
                </div>
              </div>
            </div>

            {saveError && <p className="text-xs text-red-600 mt-3">{saveError}</p>}
            {saveSuccess && <p className="text-xs text-green-700 mt-3">{saveSuccess}</p>}

            <div className="mt-5 flex justify-end">
              <button onClick={handleSavePersonal} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Personal Info'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}