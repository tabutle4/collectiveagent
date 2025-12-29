'use client'

import { useState } from 'react'
import { formatNameToTitleCase } from '@/lib/nameFormatter'
import React from 'react'

// Helper to render markdown-like text (bold, links)
function renderMarkdownText(text: string) {
  if (!text) return ''
  
  // Split by markdown patterns
  const parts: (string | React.ReactElement)[] = []
  let lastIndex = 0
  let key = 0
  
  // Handle **bold**
  const boldRegex = /\*\*(.*?)\*\*/g
  let match
  
  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    // Add bold text
    parts.push(<strong key={key++}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  
  // Handle links [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const processedParts: (string | React.ReactElement)[] = []
  
  parts.forEach((part) => {
    if (typeof part === 'string') {
      let partLastIndex = 0
      let partMatch
      while ((partMatch = linkRegex.exec(part)) !== null) {
        if (partMatch.index > partLastIndex) {
          processedParts.push(part.substring(partLastIndex, partMatch.index))
        }
        processedParts.push(
          <a
            key={key++}
            href={partMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-luxury-gold hover:underline"
          >
            {partMatch[1]}
          </a>
        )
        partLastIndex = partMatch.index + partMatch[0].length
      }
      if (partLastIndex < part.length) {
        processedParts.push(part.substring(partLastIndex))
      }
    } else {
      processedParts.push(part)
    }
  })
  
  return processedParts.length > 0 ? processedParts : text
}

// Info Step Component
export function InfoStep({
  step,
  currentStep,
  totalSteps,
  userData,
  onNext,
  onBack,
  buttonText,
}: {
  step: any
  currentStep: number
  totalSteps: number
  userData: any
  onNext: () => void
  onBack: () => void
  buttonText?: string
}) {
  const content = step.content || {}
  const greeting = content.greeting?.replace('{first_name}', userData.preferred_first_name || userData.first_name || '') || ''
  
  return (
    <div className="card-section">
      {/* Progress Bar */}
      {currentStep <= totalSteps && (
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
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 h-full ${
                    idx + 1 <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                  }`}
                  style={{
                    borderRight: idx + 1 < totalSteps ? '1px solid rgba(0,0,0,0.1)' : 'none'
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
        {step.title}
      </h2>
      
      <div className="space-y-6 text-base">
        {greeting && (
          <div>
            <p className="text-luxury-gray-1 mb-3">{greeting}</p>
          </div>
        )}
        
        {content.sections?.map((section: any, sectionIdx: number) => (
          <div key={sectionIdx}>
            <h3 className="font-medium mb-3">{section.heading}</h3>
            {section.heading === 'Make Your Deals Count!' ? (
              <div className="bg-luxury-light p-4 rounded">
                <ul className="list-disc list-inside space-y-1 text-sm text-luxury-gray-1 ml-4">
                  {section.items?.map((item: string, itemIdx: number) => (
                    <li key={itemIdx}>{renderMarkdownText(item)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="list-disc list-inside space-y-2 text-luxury-gray-1">
                {section.items?.map((item: string, itemIdx: number) => (
                  <li key={itemIdx}>{renderMarkdownText(item)}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center gap-4">
        {currentStep > 1 && (
          <button 
            onClick={onBack}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
          >
            ← Back
          </button>
        )}
        <button 
          onClick={onNext}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90"
        >
          {buttonText || content.buttonText || 'Next →'}
        </button>
      </div>
    </div>
  )
}

// Profile Step Component
export function ProfileStep({
  step,
  currentStep,
  totalSteps,
  profileData,
  setProfileData,
  onNext,
  onBack,
  loading,
}: {
  step: any
  currentStep: number
  totalSteps: number
  profileData: any
  setProfileData: (data: any) => void
  onNext: () => void
  onBack: () => void
  loading: boolean
}) {
  const content = step.content || {}
  const fields = content.fields || []
  
  const fieldLabels: Record<string, string> = {
    first_name: 'First Name',
    last_name: 'Last Name',
    preferred_first_name: 'Preferred First Name',
    preferred_last_name: 'Preferred Last Name',
    personal_email: 'Personal Email',
    office_email: 'Office Email',
    personal_phone: 'Personal Phone',
    business_phone: 'Business Phone',
    date_of_birth: 'Date of Birth',
    birth_month: 'Birth Month',
    shirt_type: 'Shirt Type',
    shirt_size: 'Shirt Size',
    shipping_address_line1: 'Shipping Address Line 1',
    shipping_address_line2: 'Shipping Address Line 2',
    shipping_city: 'Shipping City',
    shipping_state: 'Shipping State',
    shipping_zip: 'Shipping ZIP',
    instagram_handle: 'Instagram Handle',
    tiktok_handle: 'TikTok Handle',
    threads_handle: 'Threads Handle',
    youtube_url: 'YouTube URL',
    linkedin_url: 'LinkedIn URL',
    facebook_url: 'Facebook URL',
    commission_plan: 'Commission Plan',
    commission_plan_other: 'Commission Plan Other',
  }
  
  const requiredFields = ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'personal_email', 'personal_phone', 'business_phone', 'date_of_birth', 'shirt_type', 'shirt_size', 'shipping_address_line1', 'shipping_city', 'shipping_state', 'shipping_zip']
  
  const renderField = (fieldKey: string) => {
    const isRequired = requiredFields.includes(fieldKey)
    
    if (fieldKey === 'commission_plan') {
      return (
        <div key={fieldKey}>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <select
            value={profileData[fieldKey] || ''}
            onChange={(e) => setProfileData({...profileData, [fieldKey]: e.target.value})}
            className="select-luxury"
            required={isRequired}
          >
            <option value="">Select a plan</option>
            <option value="no_cap_plan">No Cap Plan 85/15</option>
            <option value="cap_plan">Cap Plan 70/30 $18,000 Cap</option>
            <option value="no_change">No Change</option>
            <option value="new_agent_plan">I have not completed (5) sales within the last 12 months and must remain on the New Agent Plan.</option>
            <option value="other">Other</option>
          </select>
        </div>
      )
    }
    
    if (fieldKey === 'shirt_type') {
      return (
        <div key={fieldKey}>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <select
            value={profileData[fieldKey] || ''}
            onChange={(e) => setProfileData({...profileData, [fieldKey]: e.target.value})}
            className="select-luxury"
            required={isRequired}
          >
            <option value="">Select type</option>
            <option value="Men's">Men's</option>
            <option value="Women's">Women's</option>
          </select>
        </div>
      )
    }
    
    if (fieldKey === 'date_of_birth') {
      return (
        <div key={fieldKey}>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type="date"
            value={profileData[fieldKey] || ''}
            onChange={(e) => setProfileData({...profileData, [fieldKey]: e.target.value})}
            className="input-luxury"
            required={isRequired}
          />
        </div>
      )
    }
    
    if (fieldKey.includes('url') || fieldKey === 'personal_email' || fieldKey === 'office_email') {
      return (
        <div key={fieldKey}>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type={fieldKey.includes('email') ? 'email' : 'url'}
            value={profileData[fieldKey] || ''}
            onChange={(e) => setProfileData({...profileData, [fieldKey]: e.target.value})}
            className="input-luxury"
            required={isRequired}
          />
        </div>
      )
    }
    
    if (fieldKey.includes('phone')) {
      return (
        <div key={fieldKey}>
          <label className="block text-sm mb-2 text-luxury-gray-1">
            {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type="tel"
            value={profileData[fieldKey] || ''}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
              setProfileData({...profileData, [fieldKey]: digitsOnly})
            }}
            className="input-luxury"
            required={isRequired}
          />
        </div>
      )
    }
    
    // Default text input
    return (
      <div key={fieldKey}>
        <label className="block text-sm mb-2 text-luxury-gray-1">
          {fieldLabels[fieldKey]} {isRequired && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={profileData[fieldKey] || ''}
          onChange={(e) => {
            const value = e.target.value
            setProfileData({...profileData, [fieldKey]: value})
          }}
          onBlur={(e) => {
            if (fieldKey.includes('name')) {
              setProfileData({...profileData, [fieldKey]: formatNameToTitleCase(e.target.value)})
            }
          }}
          className="input-luxury"
          required={isRequired}
        />
      </div>
    )
  }
  
  // Group fields into sections
  const personalFields = fields.filter((f: string) => 
    ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name', 'personal_email', 'office_email', 'personal_phone', 'business_phone', 'date_of_birth', 'birth_month'].includes(f)
  )
  const shippingFields = fields.filter((f: string) => 
    f.startsWith('shipping_')
  )
  const shirtFields = fields.filter((f: string) => 
    ['shirt_type', 'shirt_size'].includes(f)
  )
  const socialFields = fields.filter((f: string) => 
    ['instagram_handle', 'tiktok_handle', 'threads_handle', 'youtube_url', 'linkedin_url', 'facebook_url'].includes(f)
  )
  const commissionFields = fields.filter((f: string) => 
    ['commission_plan', 'commission_plan_other'].includes(f)
  )
  const otherFields = fields.filter((f: string) => 
    !personalFields.includes(f) && !shippingFields.includes(f) && !shirtFields.includes(f) && !socialFields.includes(f) && !commissionFields.includes(f)
  )
  
  return (
    <div className="space-y-6">
      <div className="card-section">
        {/* Progress Bar */}
        {currentStep <= totalSteps && (
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
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-full ${
                      idx + 1 <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                    }`}
                    style={{
                      borderRight: idx + 1 < totalSteps ? '1px solid rgba(0,0,0,0.1)' : 'none'
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
          {step.title}
        </h2>

        {personalFields.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
              Personal Information
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {personalFields.map(renderField)}
            </div>
          </div>
        )}

        {shirtFields.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
              Shirt Information
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {shirtFields.map(renderField)}
            </div>
          </div>
        )}

        {shippingFields.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
              Shipping Address
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {shippingFields.map(renderField)}
            </div>
          </div>
        )}

        {socialFields.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
              Social Media
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {socialFields.map(renderField)}
            </div>
          </div>
        )}

        {commissionFields.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4 pb-2 border-b border-luxury-gray-5">
              Commission Plan
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {commissionFields.map(renderField)}
            </div>
          </div>
        )}

        {otherFields.length > 0 && (
          <div className="mb-8">
            <div className="grid md:grid-cols-2 gap-4">
              {otherFields.map(renderField)}
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={onBack}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            disabled={loading}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// RSVP Step Component
export function RsvpStep({
  step,
  currentStep,
  totalSteps,
  rsvpData,
  setRsvpData,
  onNext,
  onBack,
  loading,
  showFlyerModal,
  setShowFlyerModal,
}: {
  step: any
  currentStep: number
  totalSteps: number
  rsvpData: any
  setRsvpData: (data: any) => void
  onNext: () => void
  onBack: () => void
  loading: boolean
  showFlyerModal: boolean
  setShowFlyerModal: (show: boolean) => void
}) {
  const content = step.content || {}
  
  return (
    <div className="card-section">
      {/* Progress Bar */}
      {currentStep <= totalSteps && (
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
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 h-full ${
                    idx + 1 <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                  }`}
                  style={{
                    borderRight: idx + 1 < totalSteps ? '1px solid rgba(0,0,0,0.1)' : 'none'
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
        {content.eventTitle || step.title}
      </h2>

      {content.eventSubtitle && (
        <p className="text-lg italic text-luxury-gray-2 mb-6">
          {content.eventSubtitle}
        </p>
      )}

      {content.eventDescription && (
        <p className="text-base mb-6">
          {content.eventDescription}
        </p>
      )}

      <div className="bg-luxury-light p-6 rounded mb-6">
        <div className="space-y-3 text-sm">
          {content.hostedBy && (
            <p><strong className="text-luxury-gold">Hosted by:</strong> {content.hostedBy}</p>
          )}
          {content.when && (
            <p><strong className="text-luxury-gold">When:</strong> {content.when}</p>
          )}
          {content.where && (
            <p><strong className="text-luxury-gold">Where:</strong> {content.where}</p>
          )}
          {content.rsvpBy && (
            <p><strong className="text-luxury-gold">RSVP by:</strong> {content.rsvpBy}</p>
          )}
          {content.dressCode && (
            <p><strong className="text-luxury-gold">Dress Code:</strong> {content.dressCode}</p>
          )}
        </div>
        {content.eventFlyerUrl && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowFlyerModal(true)}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
            >
              View Event Flyer
            </button>
          </div>
        )}
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
              checked={rsvpData.attending === true || rsvpData.attending_luncheon === true}
              onChange={() => setRsvpData({...rsvpData, attending: true, attending_luncheon: true})}
              className="w-4 h-4"
            />
            <span className="text-base">Yes, I'll be there!</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name="attending"
              checked={rsvpData.attending === false || rsvpData.attending_luncheon === false}
              onChange={() => setRsvpData({...rsvpData, attending: false, attending_luncheon: false})}
              className="w-4 h-4"
            />
            <span className="text-base">No, I can't make it</span>
          </label>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm mb-2 text-luxury-gray-1">
          {content.commentsPrompt || 'Comments (Optional)'}
        </label>
        <textarea
          value={rsvpData.comments || rsvpData.luncheon_comments || ''}
          onChange={(e) => setRsvpData({...rsvpData, comments: e.target.value, luncheon_comments: e.target.value})}
          className="textarea-luxury"
          rows={3}
          placeholder={content.commentsPrompt || 'Any dietary restrictions or special requests?'}
        />
      </div>

      {content.closingText && (
        <p className="text-lg font-medium text-luxury-gold mb-6">
          {content.closingText}
        </p>
      )}

      <div className="text-center flex justify-center gap-4">
        <button
          onClick={onBack}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={loading || (rsvpData.attending === null && rsvpData.attending_luncheon === null)}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Next →'}
        </button>
      </div>
    </div>
  )
}

// Survey Step Component
export function SurveyStep({
  step,
  currentStep,
  totalSteps,
  surveyData,
  setSurveyData,
  onNext,
  onBack,
  loading,
}: {
  step: any
  currentStep: number
  totalSteps: number
  surveyData: any
  setSurveyData: (data: any) => void
  onNext: () => void
  onBack: () => void
  loading: boolean
}) {
  const content = step.content || {}
  const questions = content.questions || []
  
  const updateAnswer = (questionId: string, value: any) => {
    setSurveyData({
      ...surveyData,
      [questionId]: value
    })
  }
  
  const renderQuestion = (question: any) => {
    const answer = surveyData[question.id]
    
    switch (question.type) {
      case 'slider':
        return (
          <div key={question.id} className="mb-8">
            <label className="block text-base font-medium mb-3">
              {question.label} {question.required && <span className="text-red-500">*</span>}
            </label>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-luxury-gray-2">{question.minLabel || 'Min'}</span>
              <input
                type="range"
                min={question.min || 1}
                max={question.max || 10}
                value={answer || question.min || 1}
                onChange={(e) => updateAnswer(question.id, parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-luxury-gray-2">{question.maxLabel || 'Max'}</span>
              <span className="text-xl font-medium text-luxury-gold ml-4 min-w-[3rem] text-center">
                {answer || question.min || 1}
              </span>
            </div>
          </div>
        )
      
      case 'textarea':
        return (
          <div key={question.id} className="mb-8">
            <label className="block text-base font-medium mb-3">
              {question.label} {question.required && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={answer || ''}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              className="textarea-luxury"
              rows={4}
              required={question.required}
            />
          </div>
        )
      
      case 'radio':
        return (
          <div key={question.id} className="mb-8">
            <label className="block text-base font-medium mb-3">
              {question.label} {question.required && <span className="text-red-500">*</span>}
            </label>
            <div className="space-y-2">
              {question.options?.map((option: string, idx: number) => (
                <label key={idx} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name={question.id}
                    value={option.toLowerCase().replace(/\s+/g, '_')}
                    checked={answer === option.toLowerCase().replace(/\s+/g, '_')}
                    onChange={(e) => updateAnswer(question.id, e.target.value)}
                    className="w-4 h-4"
                    required={question.required}
                  />
                  <span className="text-base">{option}</span>
                </label>
              ))}
            </div>
          </div>
        )
      
      case 'checkbox':
        return (
          <div key={question.id} className="mb-8">
            <label className="block text-base font-medium mb-3">
              {question.label} {question.required && <span className="text-red-500">*</span>}
            </label>
            <div className="space-y-2">
              {question.options?.map((option: string, idx: number) => {
                const optionValue = option.toLowerCase().replace(/\s+/g, '_')
                const checked = Array.isArray(answer) ? answer.includes(optionValue) : false
                return (
                  <label key={idx} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const currentAnswers = Array.isArray(answer) ? answer : []
                        if (e.target.checked) {
                          updateAnswer(question.id, [...currentAnswers, optionValue])
                        } else {
                          updateAnswer(question.id, currentAnswers.filter((a: string) => a !== optionValue))
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-base">{option}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      
      default:
        return null
    }
  }
  
  return (
    <div className="card-section">
      {/* Progress Bar */}
      {currentStep <= totalSteps && (
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
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 h-full ${
                    idx + 1 <= currentStep ? 'bg-luxury-gold' : 'bg-luxury-gray-5'
                  }`}
                  style={{
                    borderRight: idx + 1 < totalSteps ? '1px solid rgba(0,0,0,0.1)' : 'none'
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
        {step.title}
      </h2>

      <div className="space-y-8">
        {questions.map(renderQuestion)}
      </div>

      <div className="text-center flex justify-center gap-4 mt-8">
        <button
          onClick={onBack}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={loading}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

