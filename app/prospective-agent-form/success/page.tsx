'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'

function SuccessContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name') || 'there'
  const email = searchParams.get('email') || ''
  const isReferral = searchParams.get('type') === 'referral'
  const followUpToken = searchParams.get('t') || ''

  const [referralAnnualFee, setReferralAnnualFee] = useState(299)

  // Optional follow-up questions. The prospect record is already complete at
  // this point, so nothing here is required and nothing here can fail the
  // submission.
  const [answers, setAnswers] = useState({
    expectations: '',
    accountability: '',
    lead_generation: '',
    additional_info: '',
  })
  const [savingAnswers, setSavingAnswers] = useState(false)
  const [answersSaved, setAnswersSaved] = useState(false)
  const [answersError, setAnswersError] = useState('')

  const hasAnyAnswer = Object.values(answers).some(value => value.trim())

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAnswers(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleAnswersSubmit = async () => {
    setAnswersError('')
    setSavingAnswers(true)
    try {
      const response = await fetch('/api/prospects/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: followUpToken, ...answers }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAnswersError(data.error || 'We could not save your answers')
        setSavingAnswers(false)
        return
      }
      // The route returns 200 when it declines to write. Never show the
      // confirmation for a write that did not happen.
      if (!data.applied) {
        setAnswersError(
          data.reason === 'closed'
            ? 'Your application has already moved forward, so these answers were not added. Reply to your welcome email and we will add them for you.'
            : 'Please answer at least one question before submitting.'
        )
        setSavingAnswers(false)
        return
      }
      setAnswersSaved(true)
    } catch {
      setAnswersError('We could not save your answers')
    }
    setSavingAnswers(false)
  }

  useEffect(() => {
    if (isReferral) {
      fetch('/api/settings/referral')
        .then(r => r.json())
        .then(data => {
          if (data.settings?.annual_fee) setReferralAnnualFee(data.settings.annual_fee)
        })
        .catch(() => {})
    }
  }, [isReferral])

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />

        <div
          className="flex-1 flex items-center justify-center px-6"
          style={{ paddingTop: '120px', paddingBottom: '60px' }}
        >
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <CheckCircle2 size={48} className="text-luxury-accent mx-auto mb-4" />
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">
                Thank You, {name}!
              </h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                {isReferral
                  ? "We have received your information. You are one step closer to keeping your license active with Referral Collective."
                  : "We have received your information and are excited to connect with you."}
              </p>
            </div>

            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                What Happens Next
              </h2>
              <p className="text-sm text-luxury-gray-2 mb-4">
                Check your email{email && ` (${email})`} for your next steps.
              </p>
              <div className="space-y-3">
                {isReferral ? (
                  <>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">01</span>
                      <p className="text-sm text-luxury-gray-2">Click the link in your email to start onboarding</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">02</span>
                      <p className="text-sm text-luxury-gray-2">Pay your ${referralAnnualFee} annual membership fee</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">03</span>
                      <p className="text-sm text-luxury-gray-2">Sign your Referral Agent Agreement and complete W-9</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">01</span>
                      <p className="text-sm text-luxury-gray-2">Review our commission plans and company offerings</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">02</span>
                      <p className="text-sm text-luxury-gray-2">Start your onboarding using the personalized link in your email</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">03</span>
                      <p className="text-sm text-luxury-gray-2">Or schedule a call with our broker to talk through your goals</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {followUpToken && (
              <div className="container-card mb-5">
                {answersSaved ? (
                  <div className="text-center">
                    <CheckCircle2 size={28} className="text-luxury-accent mx-auto mb-3" />
                    <p className="text-sm text-luxury-gray-2">
                      Thank you. We have added your answers to your file.
                    </p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">
                      Got Two Minutes?
                    </h2>
                    <p className="text-sm text-luxury-gray-2 mb-4">
                      Your submission is complete. These questions are optional, and they help us
                      prepare for our first conversation.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">
                          What expectations do you have for {isReferral ? 'Referral Collective' : 'Collective Realty Co.'}?
                        </label>
                        <textarea
                          name="expectations"
                          value={answers.expectations}
                          onChange={handleAnswerChange}
                          className="textarea-luxury"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">
                          Do you want to be held accountable?
                        </label>
                        <textarea
                          name="accountability"
                          value={answers.accountability}
                          onChange={handleAnswerChange}
                          className="textarea-luxury"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">
                          How do you plan to produce business leads?
                        </label>
                        <textarea
                          name="lead_generation"
                          value={answers.lead_generation}
                          onChange={handleAnswerChange}
                          className="textarea-luxury"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">
                          Is there anything you would like to add?
                        </label>
                        <textarea
                          name="additional_info"
                          value={answers.additional_info}
                          onChange={handleAnswerChange}
                          className="textarea-luxury"
                        />
                      </div>
                    </div>
                    {answersError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mt-4">
                        {answersError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleAnswersSubmit}
                      disabled={savingAnswers || !hasAnyAnswer}
                      className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50 mt-5"
                    >
                      {savingAnswers ? 'Submitting...' : 'Submit Answers'}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="container-card text-center">
              <p className="text-sm text-luxury-gray-3 mb-1">Questions in the meantime?</p>
              <a
                href="mailto:office@collectiverealtyco.com"
                className="text-sm text-luxury-accent hover:underline"
              >
                office@collectiverealtyco.com
              </a>
            </div>
          </div>
        </div>

        <AuthFooter />
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-luxury-gray-3">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}