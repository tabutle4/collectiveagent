'use client'

import { useState, useEffect } from 'react'
import { formatNameToTitleCase } from '@/lib/nameFormatter'
import { useRouter } from 'next/navigation'
import { InfoStep, ProfileStep, RsvpStep, SurveyStep } from './CampaignStepComponents'

interface CampaignFormProps {
  campaignId: string
  userId: string
  userData: any
  token: string
  campaign?: any
}

export default function CampaignForm({ campaignId, userId, userData, token, campaign }: CampaignFormProps) {
  const router = useRouter()
  
  // Check if campaign uses new steps_config or legacy hardcoded steps
  const stepsConfig = campaign?.steps_config
  const useLegacyFlow = !stepsConfig || !Array.isArray(stepsConfig) || stepsConfig.length === 0
  
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [savedResponses, setSavedResponses] = useState<any>(null)
  const [loadingResponses, setLoadingResponses] = useState(true)
  const [showFlyerModal, setShowFlyerModal] = useState(false)
  
  // Total steps - use steps_config length if available, otherwise default to 4 for legacy
  const totalSteps = useLegacyFlow ? 4 : stepsConfig.length

  // Step 2: Profile Data
  const [profileData, setProfileData] = useState({
    first_name: userData.first_name || '',
    last_name: userData.last_name || '',
    preferred_first_name: userData.preferred_first_name || '',
    preferred_last_name: userData.preferred_last_name || '',
    personal_email: userData.personal_email || '',
    personal_phone: userData.personal_phone || '',
    business_phone: userData.business_phone || '',
    date_of_birth: userData.date_of_birth || '',
    birth_month: userData.birth_month || '',
    shirt_type: userData.shirt_type || '',
    shirt_size: userData.shirt_size || '',
    shipping_address_line1: userData.shipping_address_line1 || '',
    shipping_address_line2: userData.shipping_address_line2 || '',
    shipping_city: userData.shipping_city || '',
    shipping_state: userData.shipping_state || '',
    shipping_zip: userData.shipping_zip || '',
    instagram_handle: userData.instagram_handle || '',
    tiktok_handle: userData.tiktok_handle || '',
    threads_handle: userData.threads_handle || '',
    youtube_url: userData.youtube_url || '',
    linkedin_url: userData.linkedin_url || '',
    facebook_url: userData.facebook_url || '',
    commission_plan: userData.commission_plan || '',
    commission_plan_other: userData.commission_plan_other || '',
  })

  // Step 3: RSVP Data (legacy) - also used for dynamic RSVP steps
  const [rsvpData, setRsvpData] = useState({
    attending: null as boolean | null, // For dynamic
    attending_luncheon: null as boolean | null, // For legacy
    comments: '', // For dynamic
    luncheon_comments: '', // For legacy
  })

  // Step 4: Survey Data (legacy) - also used for dynamic survey steps
  const [surveyData, setSurveyData] = useState<any>({
    support_rating: 10,
    support_improvements: '',
    work_preference: '',
  })

  // Fetch saved responses on mount
  useEffect(() => {
    fetchSavedResponses()
  }, [campaignId, token])

  // Auto-calculate birth month from date of birth
  useEffect(() => {
    if (profileData.date_of_birth) {
      const date = new Date(profileData.date_of_birth)
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December']
      setProfileData(prev => ({
        ...prev,
        birth_month: months[date.getMonth()]
      }))
    }
  }, [profileData.date_of_birth])

  const fetchSavedResponses = async () => {
    try {
      const response = await fetch(`/api/campaign/get-responses?token=${token}&campaign_id=${campaignId}`)
      const data = await response.json()

      if (response.ok && data.isComplete && data.response) {
        setIsComplete(true)
        setSavedResponses(data.response)
        
        // Populate form data from saved responses
        if (data.response.profile_updates) {
          setProfileData(prev => ({ ...prev, ...data.response.profile_updates }))
        }
        if (data.response.commission_plan_2026) {
          setProfileData(prev => ({ 
            ...prev, 
            commission_plan: data.response.commission_plan_2026,
            commission_plan_other: data.response.commission_plan_2026_other || ''
          }))
        }
        if (data.response.attending_luncheon !== null) {
          setRsvpData({
            attending: data.response.attending_luncheon,
            attending_luncheon: data.response.attending_luncheon,
            comments: data.response.luncheon_comments || '',
            luncheon_comments: data.response.luncheon_comments || ''
          })
        }
        if (data.response.support_rating) {
          setSurveyData({
            support_rating: data.response.support_rating,
            support_improvements: data.response.support_improvements || '',
            work_preference: data.response.work_preference || ''
          })
        }
      }
    } catch (err) {
      console.error('Error fetching responses:', err)
    } finally {
      setLoadingResponses(false)
    }
  }

  const updateStepProgress = async (step: number) => {
    try {
      await fetch('/api/campaign/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          user_id: userId,
          token: token,
          step,
        }),
      })
    } catch (err) {
      console.error('Error updating progress:', err)
    }
  }

  // Dynamic step handler
  const handleDynamicStepNext = async (stepIndex: number) => {
    setError('')
    const step = stepsConfig[stepIndex]
    if (!step) return

    setLoading(true)
    try {
      await updateStepProgress(step.stepNumber)

      if (step.type === 'profile') {
        // Validate required profile fields
        const requiredFields = ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'personal_email', 'personal_phone', 'business_phone', 'date_of_birth', 'shirt_type', 'shirt_size', 'shipping_address_line1', 'shipping_city', 'shipping_state', 'shipping_zip']
        const fieldsToCheck = step.content?.fields || []
        const missingFields = requiredFields.filter(f => fieldsToCheck.includes(f) && !(profileData as any)[f])
        
        if (missingFields.length > 0) {
          setError('Please fill in all required fields')
          setLoading(false)
          return
        }

        // Format names
        const formattedProfileData = {
          ...profileData,
          first_name: formatNameToTitleCase(profileData.first_name),
          last_name: formatNameToTitleCase(profileData.last_name),
          preferred_first_name: formatNameToTitleCase(profileData.preferred_first_name),
          preferred_last_name: formatNameToTitleCase(profileData.preferred_last_name),
        }
        setProfileData(formattedProfileData)

        const response = await fetch('/api/campaign/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            token: token,
            profile_data: formattedProfileData,
          }),
        })

        if (!response.ok) throw new Error('Failed to update profile')
      } else if (step.type === 'rsvp') {
        if (rsvpData.attending === null && rsvpData.attending_luncheon === null) {
          setError('Please select Yes or No for attendance')
          setLoading(false)
          return
        }

        const response = await fetch('/api/campaign/update-rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            token: token,
            rsvp_data: {
              attending_luncheon: rsvpData.attending !== null ? rsvpData.attending : rsvpData.attending_luncheon,
              luncheon_comments: rsvpData.comments || rsvpData.luncheon_comments,
            },
          }),
        })

        if (!response.ok) throw new Error('Failed to save RSVP')
      } else if (step.type === 'survey') {
        // Validate required survey questions
        const questions = step.content?.questions || []
        const requiredQuestions = questions.filter((q: any) => q.required)
        const missingAnswers = requiredQuestions.filter((q: any) => {
          const answer = surveyData[q.id]
          return answer === undefined || answer === null || answer === ''
        })

        if (missingAnswers.length > 0) {
          setError('Please answer all required questions')
          setLoading(false)
          return
        }

        // Convert survey data to legacy format for API compatibility
        const legacySurveyData: any = {}
        questions.forEach((q: any) => {
          const answer = surveyData[q.id]
          if (answer !== undefined && answer !== null) {
            // Map to legacy field names if needed
            if (q.id === 'q1' || (q.type === 'slider' && q.label?.includes('supported'))) {
              legacySurveyData.support_rating = answer
            } else if (q.id === 'q2' || (q.type === 'textarea' && q.label?.includes('support'))) {
              legacySurveyData.support_improvements = answer
            } else if (q.id === 'q3' || (q.type === 'radio' && q.label?.includes('working best'))) {
              legacySurveyData.work_preference = answer
            } else {
              legacySurveyData[q.id] = answer
            }
          }
        })

        const response = await fetch('/api/campaign/submit-survey', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            token: token,
            survey_data: legacySurveyData,
          }),
        })

        if (!response.ok) throw new Error('Failed to submit survey')
      }

      // Move to next step
      if (stepIndex < stepsConfig.length - 1) {
        setCurrentStep(currentStep + 1)
      } else {
        // Last step - mark as complete
        await updateStepProgress(step.stepNumber)
        setIsComplete(true)
        setCurrentStep(totalSteps + 1) // Thank you page
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleNext = async () => {
    setError('')
    
    // Use dynamic handler if using steps_config
    if (!useLegacyFlow && stepsConfig.length > 0) {
      const currentStepIndex = currentStep - 1
      await handleDynamicStepNext(currentStepIndex)
      return
    }
    
    // Legacy flow
    if (currentStep === 1) {
      await updateStepProgress(1)
      setCurrentStep(2)
    } else if (currentStep === 2) {
      // Validate required fields (excluding social media)
      if (!profileData.first_name || !profileData.last_name || 
          !profileData.preferred_first_name || !profileData.preferred_last_name ||
          !profileData.personal_email || !profileData.personal_phone || 
          !profileData.business_phone || !profileData.date_of_birth ||
          !profileData.shirt_type || !profileData.shirt_size ||
          !profileData.shipping_address_line1 || !profileData.shipping_city ||
          !profileData.shipping_state || !profileData.shipping_zip ||
          !profileData.commission_plan) {
        setError('Please fill in all required fields')
        return
      }
      
      // Validate commission plan "other" requires specification
      if (profileData.commission_plan === 'other' && !profileData.commission_plan_other) {
        setError('Please specify your commission plan')
        return
      }
      
      // Format names before submission
      const formattedProfileData = {
        ...profileData,
        first_name: formatNameToTitleCase(profileData.first_name),
        last_name: formatNameToTitleCase(profileData.last_name),
        preferred_first_name: formatNameToTitleCase(profileData.preferred_first_name),
        preferred_last_name: formatNameToTitleCase(profileData.preferred_last_name),
      }
      setProfileData(formattedProfileData)
      
      setLoading(true)
      try {
        const response = await fetch('/api/campaign/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            token: token,
            profile_data: formattedProfileData,
          }),
        })

        if (!response.ok) throw new Error('Failed to update profile')
        
        await updateStepProgress(2)
        setCurrentStep(3)
      } catch (err) {
        setError('Failed to save profile. Please try again.')
      }
      setLoading(false)
    } else if (currentStep === 3) {
      if (rsvpData.attending_luncheon === null) {
        setError('Please select Yes or No for the luncheon RSVP')
        return
      }
      
      setLoading(true)
      try {
        const response = await fetch('/api/campaign/update-rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            token: token,
            rsvp_data: rsvpData,
          }),
        })

        if (!response.ok) throw new Error('Failed to save RSVP')
        
        await updateStepProgress(3)
        setCurrentStep(4)
      } catch (err) {
        setError('Failed to save RSVP. Please try again.')
      }
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!surveyData.work_preference) {
      setError('Please answer all survey questions')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/campaign/submit-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          user_id: userId,
          token: token,
          survey_data: surveyData,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit survey')
      
      await updateStepProgress(4)
      setCurrentStep(5) // Thank you page
    } catch (err) {
      setError('Failed to submit survey. Please try again.')
    }
    setLoading(false)
  }

  // Get deadline from campaign or default to hardcoded date for backwards compatibility
  const getDeadlineDate = () => {
    if (campaign?.deadline) {
      const date = new Date(campaign.deadline)
      // Validate date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid deadline date, using default')
        return new Date('2025-11-28T23:59:59')
      }
      return date
    }
    return new Date('2025-11-28T23:59:59')
  }
  
  const deadlineDate = getDeadlineDate()
  const isAfterDeadline = new Date() > deadlineDate

  const getCommissionPlanDisplay = (plan: string, other?: string) => {
    if (plan === 'no_cap_plan') return 'No Cap Plan 85/15'
    if (plan === 'cap_plan') return 'Cap Plan 70/30 $18,000 Cap'
    if (plan === 'no_change') return 'No Change'
    if (plan === 'new_agent_plan') return 'I have not completed (5) sales within the last 12 months and must remain on the New Agent Plan.'
    if (plan === 'other') return `Other: ${other || 'Not specified'}`
    return 'Not selected'
  }

  const getWorkPreferenceDisplay = (pref: string) => {
    if (pref === 'team') return 'On a team'
    if (pref === 'independent') return 'Independently'
    if (pref === 'not_sure') return 'Not sure yet'
    return pref
  }

  if (loadingResponses) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
      </div>
    )
  }

    return (
    <div className="max-w-4xl mx-auto">

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {/* Dynamic Steps Rendering */}
      {!useLegacyFlow && stepsConfig.length > 0 && currentStep <= totalSteps && (
        (() => {
          const currentStepIndex = currentStep - 1
          const step = stepsConfig[currentStepIndex]
          if (!step) return null

          switch (step.type) {
            case 'info':
              return (
                <InfoStep
                  key={step.stepNumber}
                  step={step}
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  userData={userData}
                  onNext={() => {
                    updateStepProgress(step.stepNumber)
                    if (currentStep < totalSteps) {
                      setCurrentStep(currentStep + 1)
                    }
                  }}
                  onBack={() => setCurrentStep(currentStep - 1)}
                  buttonText={step.content?.buttonText}
                />
              )
            case 'profile':
              return (
                <ProfileStep
                  key={step.stepNumber}
                  step={step}
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  profileData={profileData}
                  setProfileData={setProfileData}
                  onNext={() => handleDynamicStepNext(currentStepIndex)}
                  onBack={() => setCurrentStep(currentStep - 1)}
                  loading={loading}
                />
              )
            case 'rsvp':
              return (
                <RsvpStep
                  key={step.stepNumber}
                  step={step}
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  rsvpData={rsvpData}
                  setRsvpData={setRsvpData}
                  onNext={() => handleDynamicStepNext(currentStepIndex)}
                  onBack={() => setCurrentStep(currentStep - 1)}
                  loading={loading}
                  showFlyerModal={showFlyerModal}
                  setShowFlyerModal={setShowFlyerModal}
                />
              )
            case 'survey':
              return (
                <SurveyStep
                  key={step.stepNumber}
                  step={step}
                  currentStep={currentStep}
                  totalSteps={totalSteps}
                  surveyData={surveyData}
                  setSurveyData={setSurveyData}
                  onNext={() => handleDynamicStepNext(currentStepIndex)}
                  onBack={() => setCurrentStep(currentStep - 1)}
                  loading={loading}
                />
              )
            default:
              return null
          }
        })()
      )}

      {/* Legacy Steps Rendering */}
      {useLegacyFlow && (
        <>
      {/* Step 1: Information */}
      {currentStep === 1 && (
        <div className="card-section">
          {/* Progress Bar - Thin Gold Band */}
          {currentStep < 5 && (
            <div style={{ 
              marginTop: '-24px',
              marginLeft: '-24px',
              marginRight: '-24px',
              marginBottom: '16px'
            }}>
              <div style={{ 
                height: '4px',
                backgroundColor: '#f5f5f4',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px'
              }}>
                <div className="h-full flex">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 h-full ${
                        step <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                      }`}
                      style={{
                        borderRight: step < 4 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-luxury-gray-2 text-center mt-2">
                Step {currentStep} of {totalSteps}
              </p>
            </div>
          )}
          <h2 className="text-2xl font-light mb-6 tracking-luxury">
            2026 Commission Plan Selection
          </h2>
          
          <div className="space-y-6 text-base">
            <div>
              <h3 className="font-medium mb-3">2025 Production Period</h3>
              {userData.preferred_first_name && (
                <p className="text-luxury-gray-1 mb-3">
                  Hi, {userData.preferred_first_name}
                </p>
              )}
              <p className="text-luxury-gray-1 mb-2">
                Your 2025 numbers will reflect closings from <strong>November 23, 2024 through November 22, 2025</strong>.
              </p>
            </div>

            <div>
              <h3 className="font-medium mb-3">Important Information</h3>
              <ul className="list-disc list-inside space-y-2 text-luxury-gray-1">
                <li>There will be <strong>NO fee, split, or cap increases for 2026!</strong></li>
                <li>Your Independent Contractor Agreement remains in effect for an indefinite term. It continues unless you terminate following the <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Firm-Exit-Process.aspx" target="_blank" className="text-luxury-gold hover:underline">firm exit process</a>.</li>
                <li>You may change your commission plan annually when eligible.</li>
                <li>If you select a new commission plan, you will receive a new agreement to sign reflecting your updated plan.</li>
              </ul>
            </div>

            <div className="bg-luxury-light p-4 rounded">
              <h3 className="font-medium mb-3">Make Your Deals Count!</h3>
              <p className="text-sm text-luxury-gray-1 mb-3">
                If you've already been paid for your deal by November 22nd, it's counted because it's closed out in Brokermint.
              </p>
              <p className="text-sm font-medium mb-2">For unpaid leases/apartments, ensure by November 28th:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-luxury-gray-1 ml-4">
                <li>Transaction is created in Brokermint</li>
                <li>Transaction is in <strong>Pending</strong> status</li>
                <li>Closing date is entered (between November 23, 2024 and November 22, 2025)</li>
                <li>Sales price is calculated as: Rent × Months in Lease Term<br/>
                    <span className="text-xs italic">💡 Example: $1,000 rent × 12 months = $12,000 sales price</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <button 
              onClick={() => setCurrentStep(currentStep - 1)} 
              disabled={currentStep === 1}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
              style={{ display: currentStep === 1 ? 'none' : 'block' }}
            >
              ← Back
            </button>
            <button onClick={handleNext} className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black">
              Next: Update My Profile →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Profile Update */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="card-section">
            {/* Progress Bar - Thin Gold Band */}
            {currentStep < 5 && (
              <div style={{ 
                marginTop: '-24px',
                marginLeft: '-24px',
                marginRight: '-24px',
                marginBottom: '16px'
              }}>
                <div style={{ 
                  height: '4px',
                  backgroundColor: '#f5f5f4',
                  borderTopLeftRadius: '8px',
                  borderTopRightRadius: '8px'
                }}>
                  <div className="h-full flex">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`flex-1 h-full ${
                          step <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                        }`}
                        style={{
                          borderRight: step < 4 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                        }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-luxury-gray-2 text-center mt-2">
                  Step {currentStep} of {totalSteps}
                </p>
              </div>
            )}
            <h2 className="text-2xl font-light mb-6 tracking-luxury">
              Update Your Profile
            </h2>

            {/* Section 1: Personal Information */}
            <div className="mb-8">
              <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
                Personal Information
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({...profileData, first_name: e.target.value})}
                    onBlur={(e) => setProfileData({...profileData, first_name: formatNameToTitleCase(e.target.value)})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({...profileData, last_name: e.target.value})}
                    onBlur={(e) => setProfileData({...profileData, last_name: formatNameToTitleCase(e.target.value)})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Preferred First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileData.preferred_first_name}
                    onChange={(e) => setProfileData({...profileData, preferred_first_name: e.target.value})}
                    onBlur={(e) => setProfileData({...profileData, preferred_first_name: formatNameToTitleCase(e.target.value)})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Preferred Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={profileData.preferred_last_name}
                    onChange={(e) => setProfileData({...profileData, preferred_last_name: e.target.value})}
                    onBlur={(e) => setProfileData({...profileData, preferred_last_name: formatNameToTitleCase(e.target.value)})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Personal Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={profileData.personal_email}
                    onChange={(e) => setProfileData({...profileData, personal_email: e.target.value})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Personal Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={profileData.personal_phone}
                    onChange={(e) => setProfileData({...profileData, personal_phone: e.target.value})}
                    className="input-luxury"
                    placeholder="10 digits only"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Business Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={profileData.business_phone}
                    onChange={(e) => setProfileData({...profileData, business_phone: e.target.value})}
                    className="input-luxury"
                    placeholder="10 digits only"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={profileData.date_of_birth}
                    onChange={(e) => setProfileData({...profileData, date_of_birth: e.target.value})}
                    className="input-luxury"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Birth Month (Auto-filled)
                  </label>
                  <input
                    type="text"
                    value={profileData.birth_month}
                    className="input-luxury bg-luxury-light"
                    disabled
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Shirt Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={profileData.shirt_type}
                    onChange={(e) => setProfileData({...profileData, shirt_type: e.target.value})}
                    className="select-luxury"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="Women's">Women's</option>
                    <option value="Men's">Men's</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Shirt Size <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={profileData.shirt_size}
                    onChange={(e) => setProfileData({...profileData, shirt_size: e.target.value})}
                    className="select-luxury"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="2X">2X</option>
                    <option value="3X">3X</option>
                    <option value="4X">4X</option>
                  </select>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="mt-6">
                <h4 className="text-base font-medium mb-3">Shipping Address</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Address Line 1 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.shipping_address_line1}
                      onChange={(e) => setProfileData({...profileData, shipping_address_line1: e.target.value})}
                      className="input-luxury"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      value={profileData.shipping_address_line2}
                      onChange={(e) => setProfileData({...profileData, shipping_address_line2: e.target.value})}
                      className="input-luxury"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.shipping_city}
                      onChange={(e) => setProfileData({...profileData, shipping_city: e.target.value})}
                      className="input-luxury"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.shipping_state}
                      onChange={(e) => setProfileData({...profileData, shipping_state: e.target.value})}
                      className="input-luxury"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      ZIP Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.shipping_zip}
                      onChange={(e) => setProfileData({...profileData, shipping_zip: e.target.value})}
                      className="input-luxury"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Social Media */}
              <div className="mt-6">
                <h4 className="text-base font-medium mb-3">Social Media</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Instagram Handle
                    </label>
                    <input
                      type="text"
                      value={profileData.instagram_handle}
                      onChange={(e) => setProfileData({...profileData, instagram_handle: e.target.value})}
                      className="input-luxury"
                      placeholder="@username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      TikTok Handle
                    </label>
                    <input
                      type="text"
                      value={profileData.tiktok_handle}
                      onChange={(e) => setProfileData({...profileData, tiktok_handle: e.target.value})}
                      className="input-luxury"
                      placeholder="@username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Threads Handle
                    </label>
                    <input
                      type="text"
                      value={profileData.threads_handle}
                      onChange={(e) => setProfileData({...profileData, threads_handle: e.target.value})}
                      className="input-luxury"
                      placeholder="@username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      YouTube Handle/URL
                    </label>
                    <input
                      type="text"
                      value={profileData.youtube_url}
                      onChange={(e) => setProfileData({...profileData, youtube_url: e.target.value})}
                      className="input-luxury"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      LinkedIn URL
                    </label>
                    <input
                      type="url"
                      value={profileData.linkedin_url}
                      onChange={(e) => setProfileData({...profileData, linkedin_url: e.target.value})}
                      className="input-luxury"
                    />
                  </div>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Facebook URL
                    </label>
                    <input
                      type="url"
                      value={profileData.facebook_url}
                      onChange={(e) => setProfileData({...profileData, facebook_url: e.target.value})}
                      className="input-luxury"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Plan Selection WITH DEADLINE CHECK */}
            <div className="mb-8 pt-6 border-t border-luxury-gray-5">
              <h3 className="text-lg font-medium mb-4">
                Select Your 2026 Commission Plan <span className="text-red-500">*</span>
              </h3>
              
              {isAfterDeadline ? (
                // AFTER DEADLINE - Read-only
                <div className="bg-luxury-light p-6 rounded border-l-4 border-luxury-gold">
                  <p className="text-sm text-luxury-gray-2 mb-3">
                    <strong>Commission Plan Deadline Has Passed ({deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})</strong>
                  </p>
                  <p className="text-base font-medium text-luxury-black mb-2">
                    Your 2026 Commission Plan:
                  </p>
                  <p className="text-lg text-luxury-gray-1">
                    {profileData.commission_plan === 'no_cap_plan' ? 'No Cap Plan 85/15' :
                     profileData.commission_plan === 'cap_plan' ? 'Cap Plan 70/30 $18,000 Cap' :
                     profileData.commission_plan === 'no_change' ? 'No Change' :
                     profileData.commission_plan === 'new_agent_plan' ? 'I have not completed (5) sales within the last 12 months and must remain on the New Agent Plan.' :
                     profileData.commission_plan === 'other' ? `Other: ${profileData.commission_plan_other || 'Not specified'}` :
                     'Not yet selected'}
                  </p>
                  <p className="text-sm text-luxury-gray-2 mt-4">
                    Need to change your plan? Contact the office at{' '}
                    <a href="mailto:office@collectiverealtyco.com" className="text-luxury-gold hover:underline">
                      office@collectiverealtyco.com
                    </a>
                  </p>
                </div>
              ) : (
                // BEFORE DEADLINE - Editable
                <>
                  <div className="mb-4">
                    <select
                      value={profileData.commission_plan}
                      onChange={(e) => setProfileData({...profileData, commission_plan: e.target.value})}
                      className="select-luxury"
                      required
                    >
                      <option value="">Select plan...</option>
                      <option value="85_15_no_cap">No Cap Plan 85/15</option>
                      <option value="70_30_cap">Cap Plan 70/30 $18,000 Cap</option>
                      <option value="70_30_new">New Agent Plan (must remain until 5 sales completed)</option>
                      <option value="no_change">No Change</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {profileData.commission_plan === 'other' && (
                    <div className="mb-4">
                      <label className="block text-sm mb-2 text-luxury-gray-1">
                        Please specify
                      </label>
                      <input
                        type="text"
                        value={profileData.commission_plan_other}
                        onChange={(e) => setProfileData({...profileData, commission_plan_other: e.target.value})}
                        className="input-luxury"
                      />
                    </div>
                  )}

                  <div className="text-sm text-luxury-gray-2">
                    Need to review the plans? <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Commission-Plans.aspx" target="_blank" className="text-luxury-gold hover:underline">View Plans & Fees →</a>
                  </div>
                  
                  <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                    <p className="text-sm text-yellow-800">
                      <strong>Deadline:</strong> Commission plan selections must be submitted by {deadlineDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {deadlineDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Section 2: Read-Only Brokerage Info */}
            <div className="pt-6 border-t border-luxury-gray-5">
              <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
                Brokerage Information (Read-Only)
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-luxury-gray-2">Status</p>
                  <p className="font-medium">{userData.status || 'Active'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Join Date</p>
                  <p className="font-medium">{userData.join_date ? new Date(userData.join_date).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Office Communication Email</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{userData.office_email || userData.email}</p>
                    <a href="https://myaccount.microsoft.com/" target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:underline text-xs">Manage ↗</a>
                  </div>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Office</p>
                  <p className="font-medium">{userData.office || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">License Number</p>
                  <p className="font-medium">{userData.license_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">License Expiration</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{userData.license_expiration ? new Date(userData.license_expiration).toLocaleDateString() : 'N/A'}</p>
                    <a href="https://www.trec.texas.gov/apps/license-holder-search/index.php?lic_name=&lic_hp=&industry=Real+Estate" target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:underline text-xs">Lookup ↗</a>
                  </div>
                </div>
                <div>
                  <p className="text-luxury-gray-2">NRDS ID</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{userData.nrds_id || 'N/A'}</p>
                    <a href="https://login.connect.realtor/#!/forgotmember" target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:underline text-xs">Forgot? ↗</a>
                  </div>
                </div>
                <div>
                  <p className="text-luxury-gray-2">MLS ID</p>
                  <p className="font-medium">{userData.mls_id || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Association</p>
                  <p className="font-medium">{userData.association || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Current Commission Plan</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{userData.commission_plan || 'N/A'}</p>
                    <a href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Commission-Plans.aspx" target="_blank" rel="noopener noreferrer" className="text-luxury-gold hover:underline text-xs">View Plans ↗</a>
                  </div>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Team Name</p>
                  <p className="font-medium">{userData.team_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-luxury-gray-2">Revenue Share</p>
                  <p className="font-medium">{userData.referred_by_agent || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center flex justify-center gap-4">
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
            >
              ← Back
            </button>
            <button
              onClick={handleNext}
              disabled={loading}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black"
            >
              {loading ? 'Saving...' : 'Next: Luncheon RSVP →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Luncheon RSVP */}
      {currentStep === 3 && (
        <div className="card-section">
          {/* Progress Bar - Thin Gold Band */}
          {currentStep < 5 && (
            <div style={{ 
              marginTop: '-24px',
              marginLeft: '-24px',
              marginRight: '-24px',
              marginBottom: '16px'
            }}>
              <div style={{ 
                height: '4px',
                backgroundColor: '#f5f5f4',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px'
              }}>
                <div className="h-full flex">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 h-full ${
                        step <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                      }`}
                      style={{
                        borderRight: step < 4 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-luxury-gray-2 text-center mt-2">
                Step {currentStep} of {totalSteps}
              </p>
            </div>
          )}
          <h2 className="text-2xl font-light mb-6 tracking-luxury">
            Annual Award Ceremony Luncheon
          </h2>

          <p className="text-lg italic text-luxury-gray-2 mb-6">
            We Made It!
          </p>

          <p className="text-base mb-6">
            Join us to celebrate our entire firm's success this year.
          </p>

          <div className="bg-luxury-light p-6 rounded mb-6">
            <div className="space-y-3 text-sm">
              <p><strong className="text-luxury-gold">Hosted by:</strong> CJE Media</p>
              <p><strong className="text-luxury-gold">When:</strong> Tuesday, December 16 at 12:00 PM</p>
              <p><strong className="text-luxury-gold">Where:</strong> Rhay's Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077</p>
              <p><strong className="text-luxury-gold">RSVP by:</strong> December 9, 2025</p>
              <p><strong className="text-luxury-gold">Dress Code:</strong> Black Tie</p>
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowFlyerModal(true)}
                className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
              >
                View Event Flyer
              </button>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-base font-medium mb-3">
              Will you be attending? <span className="text-red-500">*</span>
            </p>
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="attending"
                  checked={rsvpData.attending_luncheon === true}
                  onChange={() => setRsvpData({...rsvpData, attending_luncheon: true})}
                  className="w-4 h-4"
                />
                <span className="text-base">Yes, I'll be there!</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="attending"
                  checked={rsvpData.attending_luncheon === false}
                  onChange={() => setRsvpData({...rsvpData, attending_luncheon: false})}
                  className="w-4 h-4"
                />
                <span className="text-base">No, I can't make it</span>
              </label>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm mb-2 text-luxury-gray-1">
              Comments (Optional)
            </label>
            <textarea
              value={rsvpData.luncheon_comments}
              onChange={(e) => setRsvpData({...rsvpData, luncheon_comments: e.target.value})}
              className="textarea-luxury"
              rows={3}
              placeholder="Any dietary restrictions or special requests?"
            />
          </div>

          <p className="text-lg font-medium text-luxury-gold mb-6">
            Let's Celebrate!
          </p>

          <div className="text-center flex justify-center gap-4">
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
            >
              ← Back
            </button>
            <button
              onClick={handleNext}
              disabled={loading}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black"
            >
              {loading ? 'Saving...' : 'Next: Feedback Survey →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Feedback Survey */}
      {currentStep === 4 && (
        <div className="card-section">
          {/* Progress Bar - Thin Gold Band */}
          {currentStep < 5 && (
            <div style={{ 
              marginTop: '-24px',
              marginLeft: '-24px',
              marginRight: '-24px',
              marginBottom: '16px'
            }}>
              <div style={{ 
                height: '4px',
                backgroundColor: '#f5f5f4',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px'
              }}>
                <div className="h-full flex">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 h-full ${
                        step <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                      }`}
                      style={{
                        borderRight: step < 4 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-luxury-gray-2 text-center mt-2">
                Step {currentStep} of {totalSteps}
              </p>
            </div>
          )}
          <h2 className="text-2xl font-light mb-6 tracking-luxury">
            Quick Feedback Survey
          </h2>

          <div className="space-y-8">
            {/* Question 1: Support Rating */}
            <div>
              <label className="block text-base font-medium mb-3">
                On a scale of 1-10, how supported do you feel by Collective Realty Co.? <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-luxury-gray-2">Not supported</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={surveyData.support_rating}
                  onChange={(e) => setSurveyData({...surveyData, support_rating: parseInt(e.target.value)})}
                  className="flex-1"
                />
                <span className="text-sm text-luxury-gray-2">Very supported</span>
                <span className="text-xl font-medium text-luxury-gold ml-4 min-w-[3rem] text-center">
                  {surveyData.support_rating}
                </span>
              </div>
            </div>

            {/* Question 2: Improvements */}
            <div>
              <label className="block text-base font-medium mb-3">
                What are two specific ways we could better support you in 2026? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={surveyData.support_improvements}
                onChange={(e) => setSurveyData({...surveyData, support_improvements: e.target.value})}
                className="textarea-luxury"
                rows={4}
                placeholder="Please share two ways..."
              />
            </div>

            {/* Question 3: Work Preference */}
            <div>
              <label className="block text-base font-medium mb-3">
                In 2026, do you see yourself working best: <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="work_preference"
                    value="team"
                    checked={surveyData.work_preference === 'team'}
                    onChange={(e) => setSurveyData({...surveyData, work_preference: e.target.value})}
                    className="w-4 h-4"
                  />
                  <span className="text-base">On a team</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="work_preference"
                    value="independent"
                    checked={surveyData.work_preference === 'independent'}
                    onChange={(e) => setSurveyData({...surveyData, work_preference: e.target.value})}
                    className="w-4 h-4"
                  />
                  <span className="text-base">Independently</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="work_preference"
                    value="not_sure"
                    checked={surveyData.work_preference === 'not_sure'}
                    onChange={(e) => setSurveyData({...surveyData, work_preference: e.target.value})}
                    className="w-4 h-4"
                  />
                  <span className="text-base">Not sure yet</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center flex justify-center gap-4">
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black md:px-12"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* Thank You Page (both legacy and dynamic) */}
      {(currentStep > totalSteps || (useLegacyFlow && currentStep === 5)) && (
        <div className="card-section text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-light mb-6 tracking-luxury">
              Thank You!
            </h2>
            
            <p className="text-lg text-luxury-gray-1 mb-4">
              We've received your 2026 commission plan selection and luncheon RSVP.
            </p>
            
            <p className="text-base text-luxury-gray-2 mb-8">
              If you selected a new commission plan, you'll receive your updated agreement via email in the coming days. We're grateful for your continued partnership and look forward to an amazing 2026 together!
            </p>

            <p className="text-sm text-luxury-gray-2 mb-8">
              You can close this window now.
            </p>

            <button
              onClick={() => {
                setIsComplete(false)
                setCurrentStep(1)
              }}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black"
            >
              Edit Responses
            </button>
          </div>
        </div>
      )}

      {/* Event Flyer Modal */}
      {showFlyerModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowFlyerModal(false)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[90vh] bg-white rounded-lg overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowFlyerModal(false)}
              className="absolute top-4 right-4 z-10 text-luxury-gray-2 hover:text-luxury-black text-2xl font-light leading-none w-8 h-8 flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
            <img 
              src="/2025Luncheon.png" 
              alt="2025 Luncheon Event Flyer"
              className="w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  )
}