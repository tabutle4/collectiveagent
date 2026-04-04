'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import HeadshotUpload from '@/components/headshots/HeadshotUpload'
import { useAuth } from '@/lib/context/AuthContext'

function normalizeCommissionPlan(plan: string): string {
  if (!plan) return ''
  const p = plan.toLowerCase()
  if (p.includes('new_agent') || p.includes('new agent') || p.includes('70/30') || p === 'new_agent') return 'new_agent'
  if (p.includes('no_cap') || p.includes('no cap') || p.includes('85/15') || p === 'no_cap') return 'no_cap'
  if (p.includes('cap') && !p.includes('no')) return 'cap'
  return plan
}

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
  const [reverting, setReverting] = useState(false)
  const [revertResult, setRevertResult] = useState<'success' | 'error' | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [teamData, setTeamData] = useState<any>(null)
  const [splitModalMember, setSplitModalMember] = useState<any>(null)
  const [allAgents, setAllAgents] = useState<any[]>([])
  const [referrerSearch, setReferrerSearch] = useState('')
  const [referrerDropdownOpen, setReferrerDropdownOpen] = useState(false)

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
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    office_email: '',
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
    job_title: '',
  })

  const [realEstateForm, setRealEstateForm] = useState({
    office: '',
    status: '',
    is_active: true,
    division: '',
    join_date: '',
    commission_plan: '',
    role: '',
    full_nav_access: false,
    is_licensed_agent: true,
    special_commission_notes: '',
    referring_agent: '',
    referring_agent_id: '',
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
    waive_buyer_processing_fees: false,
    waive_seller_processing_fees: false,
    admin_notes: '',
    accepted_trec: false,
    w9_completed: false,
    independent_contractor_agreement_signed: false,
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
    // Load agent list for referring agent picker (admin only)
    if (isAdmin) {
      fetch('/api/users/list')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.users) {
            const active = d.users
              .filter((u: any) => u.is_active && u.role?.toLowerCase() === 'agent')
              .sort((a: any, b: any) =>
                `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`
                  .localeCompare(`${b.preferred_first_name || b.first_name} ${b.preferred_last_name || b.last_name}`)
              )
            setAllAgents(active)
          }
        })
    }
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

      // Load documents if admin
      if (isAdmin && freshUserData.id) {
        const docsRes = await fetch(`/api/users/documents?user_id=${freshUserData.id}`)
        if (docsRes.ok) {
          const docsData = await docsRes.json()
          setDocuments(docsData.documents || [])
        }
      }

      // Load team/split data — for agents always, for admins only when viewing a team lead
      if (!isAdmin) {
        const teamRes = await fetch('/api/agent/team')
        if (teamRes.ok) {
          const td = await teamRes.json()
          setTeamData(td)
        }
      } else if (freshUserData.is_team_lead && freshUserData.id) {
        // Admin viewing a team lead — fetch that lead's team data
        const teamRes = await fetch(`/api/agent/team?user_id=${freshUserData.id}`)
        if (teamRes.ok) {
          const td = await teamRes.json()
          setTeamData(td)
        }
      }

      setPersonalForm({
        first_name: freshUserData.first_name || '',
        last_name: freshUserData.last_name || '',
        preferred_first_name: freshUserData.preferred_first_name || '',
        preferred_last_name: freshUserData.preferred_last_name || '',
        office_email: freshUserData.office_email || '',
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
        job_title: freshUserData.job_title || '',
      })

      setRealEstateForm({
        office: freshUserData.office || '',
        status: freshUserData.status || '',
        is_active: freshUserData.is_active ?? true,
        division: Array.isArray(freshUserData.division)
          ? freshUserData.division.filter(Boolean).join(' | ')
          : freshUserData.division || '',
        join_date: formatDateForInput(freshUserData.join_date),
        commission_plan: normalizeCommissionPlan(freshUserData.commission_plan || ''),
        role: freshUserData.role || '',
        full_nav_access: freshUserData.full_nav_access ?? false,
        is_licensed_agent: freshUserData.is_licensed_agent ?? true,
        special_commission_notes: freshUserData.special_commission_notes || '',
        referring_agent: freshUserData.referring_agent || '',
        referring_agent_id: freshUserData.referring_agent_id || '',
      })

      setReferrerSearch(freshUserData.referring_agent || '')

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
        waive_buyer_processing_fees: freshUserData.waive_buyer_processing_fees || false,
        waive_seller_processing_fees: freshUserData.waive_seller_processing_fees || false,
        admin_notes: freshUserData.admin_notes || '',
        accepted_trec: freshUserData.accepted_trec || false,
        w9_completed: freshUserData.w9_completed || false,
        independent_contractor_agreement_signed: freshUserData.independent_contractor_agreement_signed || false,
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
        updates.first_name = personalForm.first_name.trim() || user.first_name
        updates.last_name = personalForm.last_name.trim() || user.last_name
        updates.office_email = personalForm.office_email.trim() || null
        updates.job_title = personalForm.job_title.trim() || null
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
      // Convert empty strings to null for date/nullable fields so Postgres doesn't choke
      const sanitized = { ...realEstateForm }
      if (sanitized.join_date === '') sanitized.join_date = null as any
      if (sanitized.referring_agent_id === '') sanitized.referring_agent_id = null as any
      if (sanitized.referring_agent === '') sanitized.referring_agent = null as any
      if (sanitized.status === '') sanitized.status = null as any
      // Convert division string back to array for text[] column
      sanitized.division = sanitized.division
        ? (sanitized.division as string).split('|').map((d: string) => d.trim()).filter(Boolean) as any
        : null as any

      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, updates: sanitized }),
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
            waive_buyer_processing_fees: billingForm.waive_buyer_processing_fees,
            waive_seller_processing_fees: billingForm.waive_seller_processing_fees,
            admin_notes: billingForm.admin_notes,
            accepted_trec: billingForm.accepted_trec,
            w9_completed: billingForm.w9_completed,
            independent_contractor_agreement_signed: billingForm.independent_contractor_agreement_signed,
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

  const handleCreateFolder = async () => {
    if (!user) return
    setCreatingFolder(true)
    try {
      const res = await fetch('/api/users/onedrive-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadProfile()
    } catch (e: any) {
      setUploadError(e.message || 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('user_id', user.id)
      fd.append('file', file)
      fd.append('document_type', 'Agent Document')
      const res = await fetch('/api/users/upload-document', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Refresh documents list
      const docsRes = await fetch(`/api/users/documents?user_id=${user.id}`)
      if (docsRes.ok) {
        const docsData = await docsRes.json()
        setDocuments(docsData.documents || [])
      }
    } catch (e: any) {
      setUploadError(e.message || 'Failed to upload file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  const PLAN_TYPE_LABELS: Record<string, string> = {
    sales_70_30: 'Sales (70/30 New Agent or Cap Plan)',
    sales_85_15: 'Sales (85/15 No Cap Plan)',
    leases: 'Leases',
  }
  const LEAD_SOURCE_LABELS: Record<string, string> = {
    team_lead: 'Lead from Team Lead',
    own: "Agent's Own Lead",
    firm: 'Lead from Firm',
  }

  const renderSplitModal = (member: any, title: string) => {
    const splits = member?.splits || []
    const grouped = splits.reduce((acc: any, s: any) => {
      if (!acc[s.plan_type]) acc[s.plan_type] = []
      acc[s.plan_type].push(s)
      return acc
    }, {})
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
            <div>
              <h2 className="text-base font-semibold text-luxury-gray-1">{title}</h2>
              {member?.agreement_document_url && (
                <a href={member.agreement_document_url} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent hover:underline">View Agreement PDF</a>
              )}
            </div>
            <button onClick={() => setSplitModalMember(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1 text-xl leading-none">&times;</button>
          </div>
          <div className="overflow-y-auto px-6 py-4 space-y-5">
            {Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-luxury-gray-3">No splits configured.</p>
            ) : Object.entries(grouped).map(([planType, planSplits]: any) => (
              <div key={planType}>
                <p className="text-xs font-semibold text-luxury-gray-2 mb-2">{PLAN_TYPE_LABELS[planType] || planType}</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-luxury-gray-3">
                      <th className="pb-2 font-medium">Lead Source</th>
                      <th className="pb-2 font-medium text-center">Agent</th>
                      <th className="pb-2 font-medium text-center">Team Lead</th>
                      <th className="pb-2 font-medium text-center">Firm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planSplits.map((s: any) => (
                      <tr key={s.id} className="border-t border-luxury-gray-5/30">
                        <td className="py-2 text-luxury-gray-2">{LEAD_SOURCE_LABELS[s.lead_source] || s.lead_source}</td>
                        <td className="py-2 text-center font-medium">{s.agent_pct}%</td>
                        <td className="py-2 text-center font-medium">{s.team_lead_pct}%</td>
                        <td className="py-2 text-center font-medium">{s.firm_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {splitModalMember && renderSplitModal(splitModalMember.member, splitModalMember.title)}
      <h1 className="page-title mb-6">
        {isAdmin
          ? `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`
          : 'MY PROFILE'}
      </h1>

      {/* Admin — Revert to Prospect */}
      {isAdmin && user?.status !== 'prospect' && (
        <div className="container-card mb-5 border border-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-luxury-gray-1">Revert to Prospect</p>
              <p className="text-xs text-luxury-gray-3 mt-0.5">
                Resets onboarding, clears signed documents, and returns this user to the prospect flow.
              </p>
            </div>
            <button
              onClick={async () => {
                if (reverting || !user?.id) return
                setReverting(true)
                setRevertResult(null)
                try {
                  const res = await fetch('/api/admin/revert-to-prospect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id }),
                  })
                  if (!res.ok) throw new Error()
                  setRevertResult('success')
                  loadProfile()
                } catch {
                  setRevertResult('error')
                } finally {
                  setReverting(false)
                }
              }}
              disabled={reverting}
              className="text-xs px-4 py-2 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0 ml-4"
            >
              {reverting ? 'Reverting...' : 'Revert to Prospect'}
            </button>
          </div>
          {revertResult === 'success' && (
            <p className="text-xs text-green-700 mt-3">Done. User has been reverted to prospect.</p>
          )}
          {revertResult === 'error' && (
            <p className="text-xs text-red-600 mt-3">Something went wrong. Please try again.</p>
          )}
        </div>
      )}

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
            {canEditPersonalContact && (
              <>
                <div>
                  <label className="text-xs text-luxury-gray-3 mb-1 block">Legal First Name</label>
                  <input
                    className="input-luxury"
                    value={personalForm.first_name}
                    onChange={e => handlePersonalChange('first_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-luxury-gray-3 mb-1 block">Legal Last Name</label>
                  <input
                    className="input-luxury"
                    value={personalForm.last_name}
                    onChange={e => handlePersonalChange('last_name', e.target.value)}
                  />
                </div>
              </>
            )}
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
            {canEditPersonalContact && (
              <div>
                <label className="text-xs text-luxury-gray-3 mb-1 block">Office Email</label>
                <input
                  className="input-luxury"
                  value={personalForm.office_email}
                  onChange={e => handlePersonalChange('office_email', e.target.value)}
                />
              </div>
            )}
            {canEditPersonalContact && (
              <div>
                <label className="text-xs text-luxury-gray-3 mb-1 block">Job Title</label>
                <input
                  className="input-luxury"
                  value={personalForm.job_title}
                  onChange={e => handlePersonalChange('job_title', e.target.value)}
                  placeholder="e.g. Realtor, Team Lead"
                />
              </div>
            )}
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
              <label className="text-xs text-luxury-gray-3 mb-1 block">
                Date of Birth
                {!canEditPersonalContact && <span className="text-luxury-gray-4 ml-1">(view only)</span>}
              </label>
              {canEditPersonalContact ? (
                <input
                  type="date"
                  className="input-luxury"
                  value={personalForm.date_of_birth ? personalForm.date_of_birth.substring(0, 10) : ''}
                  onChange={e => handlePersonalChange('date_of_birth', e.target.value)}
                />
              ) : (
                <input
                  type="date"
                  className="input-luxury bg-luxury-gray-5/30"
                  value={user.date_of_birth ? user.date_of_birth.substring(0, 10) : ''}
                  readOnly
                  disabled
                />
              )}
            </div>
            <div>
              <label className="text-xs text-luxury-gray-3 mb-1 block">Birth Month</label>
              <input
                className="input-luxury"
                value={personalForm.birth_month}
                onChange={e => handlePersonalChange('birth_month', e.target.value)}
                placeholder="e.g. January"
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

                <div className="space-y-3 pt-4 border-t border-luxury-gray-5/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">Licensed Agent</p>
                      <p className="text-xs text-luxury-gray-3">Agent holds an active TREC license</p>
                    </div>
                    <button
                      onClick={() => handleRealEstateChange('is_licensed_agent', !realEstateForm.is_licensed_agent)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${realEstateForm.is_licensed_agent ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${realEstateForm.is_licensed_agent ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">Full Nav Access</p>
                      <p className="text-xs text-luxury-gray-3">Agent can see all navigation items</p>
                    </div>
                    <button
                      onClick={() => handleRealEstateChange('full_nav_access', !realEstateForm.full_nav_access)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${realEstateForm.full_nav_access ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${realEstateForm.full_nav_access ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-luxury-gray-5/30">
                  <label className="text-sm font-medium text-luxury-gray-1 block mb-2">Special Commission Notes</label>
                  <textarea
                    value={realEstateForm.special_commission_notes}
                    onChange={e => handleRealEstateChange('special_commission_notes', e.target.value)}
                    placeholder="Any custom commission arrangements..."
                    rows={2}
                    className="input-luxury resize-none"
                  />
                </div>

                {realEstateError && <p className="text-xs text-red-600 mt-4">{realEstateError}</p>}
                {realEstateSuccess && <p className="text-xs text-green-700 mt-4">{realEstateSuccess}</p>}

                <div className="pt-4 border-t border-luxury-gray-5/30 space-y-3">
                    <div>
                      <label className="text-sm font-medium text-luxury-gray-1 block mb-2">Referred By</label>
                      <div className="relative">
                        <input
                          type="text"
                          className="input-luxury"
                          value={referrerSearch}
                          onChange={e => {
                            setReferrerSearch(e.target.value)
                            setReferrerDropdownOpen(true)
                            if (!e.target.value) {
                              handleRealEstateChange('referring_agent', '')
                              handleRealEstateChange('referring_agent_id', '')
                            }
                          }}
                          onFocus={() => setReferrerDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setReferrerDropdownOpen(false), 150)}
                          placeholder="Search agents..."
                        />
                        {referrerDropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-48 overflow-y-auto">
                            {allAgents
                              .filter(u => {
                                const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
                                return name.includes(referrerSearch.toLowerCase())
                              })
                              .map(u => {
                                const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`
                                return (
                                  <div
                                    key={u.id}
                                    onMouseDown={() => {
                                      setReferrerSearch(name)
                                      handleRealEstateChange('referring_agent', name)
                                      handleRealEstateChange('referring_agent_id', u.id)
                                      setReferrerDropdownOpen(false)
                                    }}
                                    className="px-3 py-2 text-sm text-luxury-gray-1 hover:bg-luxury-light cursor-pointer"
                                  >
                                    {name}
                                  </div>
                                )
                              })}
                            {allAgents.filter(u => {
                              const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
                              return name.includes(referrerSearch.toLowerCase())
                            }).length === 0 && (
                              <p className="px-3 py-2 text-xs text-luxury-gray-3">No agents found</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {user.referred_agents && user.referred_agents.length > 0 && (
                      <div>
                        <p className="text-xs text-luxury-gray-3 mb-2">Referred to Firm ({user.referred_agents.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {user.referred_agents.map((a: any) => (
                            <span key={a.id} className="text-xs bg-luxury-gray-5/40 text-luxury-gray-1 px-2 py-1 rounded">
                              {a.preferred_first_name || a.first_name} {a.preferred_last_name || a.last_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

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
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-luxury-gray-1">
                        {user.team_name ? (
                          <>
                            {user.team_name}
                            {user.is_team_lead && <span className="ml-2 text-xs text-luxury-accent">(Team Lead)</span>}
                          </>
                        ) : 'N/A'}
                      </p>
                      {user.team_name && teamData?.membership && !user.is_team_lead && (
                        <button
                          onClick={() => setSplitModalMember({ member: teamData.membership, title: 'My Commission Splits' })}
                          className="text-xs text-luxury-accent hover:underline"
                        >
                          View Splits
                        </button>
                      )}
                    </div>
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
                      {(() => {
                        const plan = normalizeCommissionPlan(user.commission_plan || '')
                        const labels: Record<string, string> = { new_agent: 'New Agent 70/30', no_cap: 'No Cap 85/15', cap: 'Cap 70/30' }
                        return labels[plan] || user.commission_plan || user.commission_plan_other || 'N/A'
                      })()}
                    </p>
                  </div>
                  <div className="inner-card">
                    <p className="text-xs text-luxury-gray-3 mb-1">Role</p>
                    <p className="text-sm font-medium text-luxury-gray-1 capitalize">
                      {user.role || 'N/A'}
                    </p>
                  </div>
                </div>
                {(user.referring_agent || (user.referred_agents && user.referred_agents.length > 0)) && (
                  <div className="mt-4 pt-4 border-t border-luxury-gray-5/30 space-y-3">
                    {user.referring_agent && (
                      <div>
                        <p className="text-xs text-luxury-gray-3 mb-1">Referred By</p>
                        <p className="text-sm font-medium text-luxury-gray-1">{user.referring_agent}</p>
                      </div>
                    )}
                    {user.referred_agents && user.referred_agents.length > 0 && (
                      <div>
                        <p className="text-xs text-luxury-gray-3 mb-2">Referred to Firm ({user.referred_agents.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {user.referred_agents.map((a: any) => (
                            <span key={a.id} className="text-xs bg-luxury-gray-5/40 text-luxury-gray-1 px-2 py-1 rounded">
                              {a.preferred_first_name || a.first_name} {a.preferred_last_name || a.last_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-luxury-gray-3 mt-4">
                  Real estate information is managed by the office. Contact an administrator if something
                  looks incorrect.
                </p>
              </>
            )}
          </div>

          {/* Team Members - Only show for team leads */}
          {user.is_team_lead && user.team_members && user.team_members.length > 0 && (
            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                My Team
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {user.team_members.map((member: any) => {
                  const teamMemberData = teamData?.all_members?.find((m: any) => m.agent_id === member.id)
                  return (
                    <button
                      key={member.id}
                      className="inner-card flex items-center gap-3 text-left w-full hover:bg-luxury-gray-5/50 transition-colors cursor-pointer"
                      onClick={() => teamMemberData && teamMemberData.splits?.length > 0 && setSplitModalMember({
                        member: teamMemberData,
                        title: `${member.preferred_first_name || member.first_name} ${member.preferred_last_name || member.last_name} — Splits`,
                      })}
                    >
                      {member.headshot_url ? (
                        <img src={member.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black text-sm font-semibold border border-luxury-gray-5">
                          {(member.preferred_first_name || member.first_name || '?')[0]}
                          {(member.preferred_last_name || member.last_name || '')[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-luxury-gray-1">
                          {member.preferred_first_name || member.first_name}{' '}
                          {member.preferred_last_name || member.last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">{member.email}</p>
                      </div>
                      {teamMemberData && teamMemberData.splits?.length > 0 && <span className="text-xs text-luxury-accent flex-shrink-0">Splits →</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${billingForm.monthly_fee_waived ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.monthly_fee_waived ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">Buyer Processing Fees Waived</p>
                      <p className="text-xs text-luxury-gray-3">
                        Buyer-side processing fees will not be deducted
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setBillingForm(prev => ({
                          ...prev,
                          waive_buyer_processing_fees: !prev.waive_buyer_processing_fees,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${billingForm.waive_buyer_processing_fees ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.waive_buyer_processing_fees ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">Seller Processing Fees Waived</p>
                      <p className="text-xs text-luxury-gray-3">
                        Seller-side processing fees will not be deducted
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setBillingForm(prev => ({
                          ...prev,
                          waive_seller_processing_fees: !prev.waive_seller_processing_fees,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${billingForm.waive_seller_processing_fees ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingForm.waive_seller_processing_fees ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="pt-4 border-t border-luxury-gray-5/30">
                    <label className="text-sm font-medium text-luxury-gray-1 block mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={billingForm.admin_notes}
                      onChange={(e) =>
                        setBillingForm(prev => ({ ...prev, admin_notes: e.target.value }))
                      }
                      placeholder="Internal notes about this agent (only visible to admins)..."
                      rows={3}
                      className="input-luxury resize-none"
                    />
                  </div>

                <div className="space-y-3 pt-4 border-t border-luxury-gray-5/30">
                  <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Onboarding Status</p>
                  {[
                    { key: 'accepted_trec', label: 'TREC Accepted', desc: 'Agent has accepted TREC sponsorship' },
                    { key: 'w9_completed', label: 'W-9 Completed', desc: 'W-9 form has been received' },
                    { key: 'independent_contractor_agreement_signed', label: 'ICA Signed', desc: 'Independent Contractor Agreement signed' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">{label}</p>
                        <p className="text-xs text-luxury-gray-3">{desc}</p>
                      </div>
                      <button
                        onClick={() => setBillingForm(prev => ({ ...prev, [key]: !(prev as any)[key] }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${(billingForm as any)[key] ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(billingForm as any)[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>

                {user.payload_payee_id && (
                  <div className="pt-4 border-t border-luxury-gray-5/30">
                    <p className="text-xs text-luxury-gray-3 mb-1">Payload Customer ID</p>
                    <p className="text-sm font-mono text-luxury-gray-1">{user.payload_payee_id}</p>
                  </div>
                )}
                
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
                  <p className="text-xs text-luxury-gray-3 mb-1">Buyer Processing Fees</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {user.waive_buyer_processing_fees ? 'Waived' : 'Standard'}
                  </p>
                </div>
                <div className="inner-card">
                  <p className="text-xs text-luxury-gray-3 mb-1">Seller Processing Fees</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {user.waive_seller_processing_fees ? 'Waived' : 'Standard'}
                  </p>
                </div>
                {user.admin_notes && (
                  <div className="inner-card md:col-span-2">
                    <p className="text-xs text-luxury-gray-3 mb-1">Admin Notes</p>
                    <p className="text-sm text-luxury-gray-1 whitespace-pre-wrap">
                      {user.admin_notes}
                    </p>
                  </div>
                )}
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

      {/* ── MY DOCUMENTS (Agent view) ── */}
      {!isAdmin && user?.onedrive_folder_url && (
        <div className="container-card mb-5">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">My Documents</h2>
          <p className="text-sm text-luxury-gray-2 mb-3">Your signed agreements and onboarding documents are stored in your OneDrive folder.</p>
          <a
            href={user.onedrive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary text-xs px-3 py-2 inline-flex items-center gap-1.5"
          >
            Open My Documents Folder
          </a>
          {user.policy_ack_document_url && (
            <div className="mt-3 pt-3 border-t border-luxury-gray-5/30">
              <a
                href={user.policy_ack_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-luxury-accent hover:underline"
              >
                View Policy Manual Acknowledgment
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── DOCUMENTS (Admin only) ── */}
      {isAdmin && user && (
        <div className="container-card mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Agent Documents</h2>
            <div className="flex items-center gap-2">
              {user.onedrive_folder_url ? (
                <a
                  href={user.onedrive_folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  Open Folder
                </a>
              ) : (
                <button
                  onClick={handleCreateFolder}
                  disabled={creatingFolder}
                  className="btn btn-secondary text-xs px-3 py-1.5"
                >
                  {creatingFolder ? 'Creating...' : 'Create OneDrive Folder'}
                </button>
              )}
              {user.onedrive_folder_url && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    {uploading ? 'Uploading...' : '+ Upload File'}
                  </button>
                </>
              )}
            </div>
          </div>

          {uploadError && (
            <p className="text-xs text-red-600 mb-3">{uploadError}</p>
          )}

          {user.policy_ack_document_url && (
            <div className="mb-3 pb-3 border-b border-luxury-gray-5/30">
              <a
                href={user.policy_ack_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-luxury-accent hover:underline"
              >
                View Policy Manual Acknowledgment
              </a>
            </div>
          )}
          {!user.onedrive_folder_url ? (
            <p className="text-xs text-luxury-gray-3">No OneDrive folder yet. Create one to start uploading documents.</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-luxury-gray-3">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="inner-card flex items-center justify-between">
                  <div>
                    <p className="text-sm text-luxury-gray-1">{doc.custom_document_name || doc.document_type}</p>
                    <p className="text-xs text-luxury-gray-3">{doc.document_type} &middot; {doc.upload_date}</p>
                  </div>
                  {doc.onedrive_file_url && (
                    <a
                      href={doc.onedrive_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-luxury-accent hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}