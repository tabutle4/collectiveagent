'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'

interface ProfilePageProps {
  userId?: string
  isAdmin?: boolean
}

export default function ProfilePage({ userId, isAdmin = false }: ProfilePageProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [planDetails, setPlanDetails] = useState<any>(null)
  const [personalForm, setPersonalForm] = useState({
    preferred_first_name: '', preferred_last_name: '', personal_email: '', personal_phone: '',
    instagram_handle: '', tiktok_handle: '', threads_handle: '', youtube_url: '', linkedin_url: '', facebook_url: '',
    shipping_address_line1: '', shipping_address_line2: '', shipping_city: '', shipping_state: '', shipping_zip: '',
    birth_month: '', date_of_birth: '', shirt_type: '', shirt_size: '',
  })
  const [reForm, setReForm] = useState({
    office: '', team_name: '', team_lead: '', division: '', commission_plan: '',
    license_number: '', mls_id: '', nrds_id: '', association: '', status: '',
    waive_processing_fees: false, special_commission_notes: '',
  })
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)

  useEffect(() => { loadUser() }, [userId])

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
      setReForm({
        office: user.office || '', team_name: user.team_name || '', team_lead: user.team_lead || '',
        division: user.division || '', commission_plan: user.commission_plan || user.commission_plan_other || '',
        license_number: user.license_number || '', mls_id: user.mls_id || '', nrds_id: user.nrds_id || '',
        association: user.association || '', status: user.status || (user.is_active ? 'active' : 'inactive'),
        waive_processing_fees: user.waive_processing_fees || false,
        special_commission_notes: user.special_commission_notes || '',
      })
      loadPlanDetails(user.commission_plan)
    }
  }, [user])

  const loadPlanDetails = async (planName: string | null) => {
    if (!planName) return
    const { data } = await supabase
      .from('commission_plans')
      .select('*')
      .eq('name', planName)
      .eq('is_active', true)
      .single()
    setPlanDetails(data)
  }

  const formatDateForDisplay = (value: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
  }

  const loadUser = async () => {
    try {
      let targetId = userId
      if (!targetId) {
        const userStr = localStorage.getItem('user')
        if (!userStr) { router.push('/auth/login'); return }
        const userData = JSON.parse(userStr)
        targetId = userData.id
      }
      const { data, error } = await supabase.from('users').select('*').eq('id', targetId).single()
      if (error) throw error
      if (!data) throw new Error('User not found')
      setUser(data)
      setHeadshotUrl(data.headshot_url || null)
    } catch (error) { console.error('Error loading profile:', error) }
    finally { setLoading(false) }
  }

  const handlePersonalChange = (field: keyof typeof personalForm, value: string) => {
    setPersonalForm(prev => ({ ...prev, [field]: value }))
    setSaveError(null); setSaveSuccess(null)
  }

  const handleReChange = (field: keyof typeof reForm, value: any) => {
    setReForm(prev => ({ ...prev, [field]: value }))
    setSaveError(null); setSaveSuccess(null)
  }

  const handleSave = async () => {
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
      if (isAdmin) {
        updates.office = reForm.office.trim() || null
        updates.team_name = reForm.team_name.trim() || null
        updates.team_lead = reForm.team_lead.trim() || null
        updates.division = reForm.division.trim() || null
        updates.commission_plan = reForm.commission_plan.trim() || null
        updates.license_number = reForm.license_number.trim() || null
        updates.mls_id = reForm.mls_id.trim() || null
        updates.nrds_id = reForm.nrds_id.trim() || null
        updates.association = reForm.association.trim() || null
        updates.status = reForm.status.trim() || null
        updates.waive_processing_fees = reForm.waive_processing_fees
        updates.special_commission_notes = reForm.special_commission_notes.trim() || null
      }
      const { error } = await supabase.from('users').update(updates).eq('id', user.id)
      if (error) { setSaveError('Failed to save changes.') }
      else { setSaveSuccess('Profile updated.'); await loadUser() }
    } catch (e) { setSaveError('Failed to save changes.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading profile...</div>
  if (!user) return (
    <div className="text-center py-12">
      <p className="text-sm text-red-600">Failed to load profile.</p>
      <button onClick={() => router.back()} className="btn btn-secondary mt-4">Go Back</button>
    </div>
  )

  const roles = user.role ? [user.role] : []
  const displayName = `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`
  const isNewAgentPlan = user.commission_plan?.toLowerCase().includes('new')
  const hasCap = planDetails?.has_cap || false
  const capAmount = planDetails?.cap_amount || 0
  const capProgress = user.cap_progress || 0
  const qualifyingCount = user.qualifying_transaction_count || 0
  const isPostCap = hasCap && capAmount > 0 && capProgress >= capAmount

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {isAdmin && (
            <button onClick={() => router.push('/admin/users')} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors mb-2 block">
              ← Back to Agents
            </button>
          )}
          <h1 className="page-title">{isAdmin ? displayName.toUpperCase() : 'MY PROFILE'}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {(saveError || saveSuccess) && (
        <div className={`mb-5 text-xs px-4 py-2.5 rounded ${saveError ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
          {saveError || saveSuccess}
        </div>
      )}

      {/* Commission Status Bar */}
      {(isNewAgentPlan || hasCap) && (
        <div className="container-card mb-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Plan name */}
            <div className="flex-shrink-0">
              <p className="text-xs text-luxury-gray-3">Commission Plan</p>
              <p className="text-sm font-bold text-luxury-gray-1">{user.commission_plan || 'N/A'}</p>
            </div>

            <div className="flex-1">
              {/* Cap progress */}
              {hasCap && capAmount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-luxury-gray-3">Cap Progress</p>
                    <p className="text-xs font-medium text-luxury-gray-2">
                      {formatCurrency(capProgress)} of {formatCurrency(capAmount)}
                      {isPostCap && <span className="ml-2 text-green-600 font-semibold">Post-Cap</span>}
                    </p>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min((capProgress / capAmount) * 100, 100)}%`,
                        backgroundColor: isPostCap ? '#22C55E' : undefined,
                      }}
                    />
                  </div>
                  {isPostCap && (
                    <p className="text-xs text-green-600 mt-1">
                      Splits at {planDetails?.post_cap_agent_split || 97}/{planDetails?.post_cap_firm_split || 3} until cap resets
                    </p>
                  )}
                </div>
              )}

              {/* New Agent plan deal count */}
              {isNewAgentPlan && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-luxury-gray-3">Qualifying Transactions</p>
                    <p className="text-xs font-medium text-luxury-gray-2">{qualifyingCount} of 5 to upgrade</p>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${Math.min((qualifyingCount / 5) * 100, 100)}%` }} />
                  </div>
                  <p className="text-xs text-luxury-gray-3 mt-1">
                    {5 - qualifyingCount > 0
                      ? `${5 - qualifyingCount} more qualifying deal${5 - qualifyingCount === 1 ? '' : 's'} to upgrade from New Agent plan`
                      : 'Eligible for plan upgrade!'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Processing fee waiver badge */}
            {user.waive_processing_fees && (
              <div className="flex-shrink-0 text-center">
                <span className="inline-block px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded">
                  Processing Fees Waived
                </span>
              </div>
            )}
          </div>

          {/* Special commission notes - visible to both agent and admin */}
          {user.special_commission_notes && (
            <div className="mt-3 pt-3 border-t border-luxury-gray-5/30">
              <p className="text-xs text-luxury-gray-3">Commission Notes</p>
              <p className="text-sm text-luxury-gray-2">{user.special_commission_notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column */}
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
                onUploadComplete={(url) => { setHeadshotUrl(url); loadUser() }}
                onRemove={() => { setHeadshotUrl(null); loadUser() }}
                size="large"
              />
            </div>
            <p className="text-xs text-luxury-gray-3 text-center">JPG, JPEG, PNG (max 5MB)</p>

            <div className="mt-6 pt-5 border-t border-luxury-gray-5/50">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Real Estate Info</h2>
              {isAdmin ? (
                <div className="space-y-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Office</label><input className="input-luxury" value={reForm.office} onChange={(e) => handleReChange('office', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Team</label><input className="input-luxury" value={reForm.team_name} onChange={(e) => handleReChange('team_name', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Team Lead</label><input className="input-luxury" value={reForm.team_lead} onChange={(e) => handleReChange('team_lead', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Division(s)</label><input className="input-luxury" value={reForm.division} onChange={(e) => handleReChange('division', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Commission Plan</label><input className="input-luxury" value={reForm.commission_plan} onChange={(e) => handleReChange('commission_plan', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">License #</label><input className="input-luxury" value={reForm.license_number} onChange={(e) => handleReChange('license_number', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">MLS ID</label><input className="input-luxury" value={reForm.mls_id} onChange={(e) => handleReChange('mls_id', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">NRDS ID</label><input className="input-luxury" value={reForm.nrds_id} onChange={(e) => handleReChange('nrds_id', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Association</label><input className="input-luxury" value={reForm.association} onChange={(e) => handleReChange('association', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Status</label>
                    <select className="select-luxury" value={reForm.status} onChange={(e) => handleReChange('status', e.target.value)}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Admin-only: Processing fee waiver and special notes */}
                  <div className="pt-3 border-t border-luxury-gray-5/30">
                    <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Commission Overrides</h3>
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={reForm.waive_processing_fees} onChange={(e) => handleReChange('waive_processing_fees', e.target.checked)} className="w-4 h-4" />
                      <span className="text-xs text-luxury-gray-2">Waive Processing Fees</span>
                    </label>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1">Special Commission Notes</label>
                      <textarea className="textarea-luxury" rows={3} value={reForm.special_commission_notes} onChange={(e) => handleReChange('special_commission_notes', e.target.value)} placeholder="Any special arrangements, negotiated rates, etc." />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-luxury-gray-3">Join Date</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{formatDateForDisplay(user.join_date || null) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Role</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{roles.join(', ') || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-luxury-gray-3">Login Email</p>
                    <p className="text-sm font-medium text-luxury-gray-1">{user.email || 'N/A'}</p>
                  </div>
                </div>
              ) : (
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
                  <p className="text-xs text-luxury-gray-3 mt-4">Managed by the office. Contact admin if incorrect.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-8">
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Personal Information</h2>

            <div className="space-y-5">
              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Name</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Preferred First Name</label><input className="input-luxury" value={personalForm.preferred_first_name} onChange={(e) => handlePersonalChange('preferred_first_name', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Preferred Last Name</label><input className="input-luxury" value={personalForm.preferred_last_name} onChange={(e) => handlePersonalChange('preferred_last_name', e.target.value)} /></div>
                </div>
              </div>

              <div className="inner-card">
                <h3 className="text-xs font-semibold text-luxury-gray-2 mb-3">Contact</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Login Email</label><input className="input-luxury opacity-60" value={user.email || ''} readOnly disabled /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Personal Email</label><input className="input-luxury" value={personalForm.personal_email} onChange={(e) => handlePersonalChange('personal_email', e.target.value)} /></div>
                  <div><label className="block text-xs text-luxury-gray-3 mb-1">Personal Phone</label><input className="input-luxury" value={personalForm.personal_phone} onChange={(e) => handlePersonalChange('personal_phone', e.target.value)} /></div>
                </div>
              </div>

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
          </div>
        </div>
      </div>
    </div>
  )
}