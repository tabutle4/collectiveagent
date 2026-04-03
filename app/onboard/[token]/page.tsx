'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

type JoinFormData = {
  first_name: string; last_name: string; preferred_first_name: string; preferred_last_name: string
  email: string; personal_phone: string; business_phone: string
  shipping_address_line1: string; shipping_address_line2: string
  shipping_city: string; shipping_state: string; shipping_zip: string
  date_of_birth: string; license_number: string; mls_id: string; nrds_id: string
  association: string; association_status_on_join: string
  commission_plan: string; custom_split: string; custom_plan_type: string
  instagram_handle: string; tiktok_handle: string; threads_handle: string
  linkedin_url: string; facebook_url: string; youtube_url: string
  referring_agent: string; joining_team: string
}

declare global {
  interface Window {
    Payload: any
  }
}

// ── Signature Step Component ──────────────────────────────────────────────────
function SignatureStep({
  token,
  documentType,
  title,
  description,
  onComplete,
  onBack,
}: {
  token: string
  documentType: 'ica' | 'commission_plan'
  title: string
  description: string
  onComplete: () => void
  onBack: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [docContent, setDocContent] = useState<any>(null)
  const [docLoading, setDocLoading] = useState(true)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    fetch(`/api/onboarding/document-preview?token=${token}&type=${documentType}`)
      .then(r => r.json())
      .then(data => { if (data.content) setDocContent(data.content) })
      .catch(() => {})
      .finally(() => setDocLoading(false))
  }, [token, documentType])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    setIsDrawing(true)
    lastPos.current = getPos(e, canvas)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
    setHasSignature(true)
  }

  const stopDraw = () => {
    setIsDrawing(false)
    lastPos.current = null
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!hasSignature) return
    const canvas = canvasRef.current
    if (!canvas) return
    setSubmitting(true)
    setError('')
    try {
      const signatureDataUrl = canvas.toDataURL('image/png')
      const res = await fetch('/api/onboarding/sign-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, documentType, signatureDataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      onComplete()
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">{title}</h1>
        <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">{description}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Document content */}
      <div className="container-card max-h-96 overflow-y-auto text-sm text-luxury-gray-2 leading-relaxed space-y-4">
        {docLoading ? (
          <p className="text-xs text-luxury-gray-3 text-center py-8">Loading agreement...</p>
        ) : docContent ? (
          <>
            <p className="text-base font-semibold text-luxury-gray-1 text-center">
              {docContent.title}
            </p>
            {docContent.sections?.map((section: any, i: number) => (
              <div key={i}>
                {section.heading && (
                  <p className="font-semibold text-luxury-gray-1 mt-4">{section.heading}</p>
                )}
                {section.body && (
                  <p className="whitespace-pre-wrap text-xs">{section.body}</p>
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="text-xs text-luxury-gray-3 text-center py-8">
            Agreement content unavailable. Please contact the office before signing.
          </p>
        )}
      </div>

      <div className="container-card">
        <p className="text-xs text-luxury-gray-3 mb-3">
          By signing below, you confirm you have read, understood, and agree to be bound by this agreement.
        </p>
        <div className="relative border border-luxury-gray-5 rounded bg-white">
          <canvas
            ref={canvasRef}
            width={560}
            height={160}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          {!hasSignature && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-luxury-gray-3 pointer-events-none">
              Sign here
            </p>
          )}
        </div>
        <div className="flex justify-end mt-2">
          <button onClick={clearSignature} className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1">
            <RotateCcw size={12} /> Clear
          </button>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!hasSignature || submitting}
        className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
      >
        {submitting ? 'Saving...' : 'Sign & Continue →'}
      </button>
    </div>
  )
}

// ── Policy Manual Step Component ───────────────────────────────────────────────
// Policy manual PDF URL — swap in the OneDrive sharing link once uploaded
const POLICY_MANUAL_PDF_URL = '/BrokerPolicyManual.pdf'

function PolicyManualStep({ token, onComplete, onBack }: { token: string; onComplete: () => void; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [docContent, setDocContent] = useState<any>(null)
  const [docLoading, setDocLoading] = useState(true)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    fetch(`/api/onboarding/document-preview?token=${token}&type=policy_manual`)
      .then(r => r.json())
      .then(data => { if (data.content) setDocContent(data.content) })
      .catch(() => {})
      .finally(() => setDocLoading(false))
  }, [token])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    e.preventDefault(); setIsDrawing(true); lastPos.current = getPos(e, canvas)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current; if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
    lastPos.current = pos; setHasSignature(true)
  }

  const stopDraw = () => { setIsDrawing(false); lastPos.current = null }

  const clearSignature = () => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!hasSignature) return
    const canvas = canvasRef.current; if (!canvas) return
    setSubmitting(true); setError('')
    try {
      const signatureDataUrl = canvas.toDataURL('image/png')
      const res = await fetch('/api/onboarding/sign-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, documentType: 'policy_manual', signatureDataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      onComplete()
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
          &larr; Back
        </button>
      </div>

      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">Policy Manual</h1>
        <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
          Please read the Brokerage Policies and Procedures, then sign the acknowledgment below.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">{error}</div>
      )}

      <div className="container-card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-luxury-gray-1">2026 Brokerage Policies and Procedures</p>
          <p className="text-xs text-luxury-gray-3 mt-0.5">Texas REALTORS Model Policy Manual</p>
        </div>
        <a
          href={POLICY_MANUAL_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary text-xs px-4 py-2 flex-shrink-0"
        >
          Read Manual
        </a>
      </div>

      {/* TAR-2303 Acknowledgment */}
      <div className="container-card max-h-72 overflow-y-auto text-sm text-luxury-gray-2 leading-relaxed space-y-4">
        {docLoading ? (
          <p className="text-xs text-luxury-gray-3 text-center py-8">Loading acknowledgment...</p>
        ) : docContent ? (
          <>
            <p className="text-base font-semibold text-luxury-gray-1 text-center whitespace-pre-line">
              {docContent.title}
            </p>
            {docContent.sections?.map((section: any, i: number) => (
              <div key={i}>
                {section.body && <p className="whitespace-pre-wrap text-xs">{section.body}</p>}
              </div>
            ))}
          </>
        ) : (
          <p className="text-xs text-luxury-gray-3 text-center py-8">Acknowledgment unavailable. Contact the office before signing.</p>
        )}
      </div>

      {/* Signature */}
      <div className="container-card">
        <p className="text-xs text-luxury-gray-3 mb-3">
          By signing below, you confirm you have read and agree to the Brokerage Policies and Procedures.
        </p>
        <div className="relative border border-luxury-gray-5 rounded bg-white">
          <canvas
            ref={canvasRef}
            width={560}
            height={160}
            className="w-full touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
          {!hasSignature && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-luxury-gray-3 pointer-events-none">Sign here</p>
          )}
        </div>
        <div className="flex justify-end mt-2">
          <button onClick={clearSignature} className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1">
            <RotateCcw size={12} /> Clear
          </button>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!hasSignature || submitting}
        className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
      >
        {submitting ? 'Saving...' : 'Sign & Continue →'}
      </button>
    </div>
  )
}

const STEPS = [
  { id: 1, label: 'Your Info' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'ICA' },
  { id: 4, label: 'Commission Plan' },
  { id: 5, label: 'Policy Manual' },
  { id: 6, label: 'W-9' },
  { id: 7, label: 'TREC' },
]

export default function OnboardingPage() {
  const params = useParams()
  const token = params.token as string

  const [prospect, setProspect] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [paymentPaid, setPaymentPaid] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({})
  const payloadScriptLoaded = useRef(false)

  const [joinForm, setJoinForm] = useState<JoinFormData>({
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    email: '',
    personal_phone: '',
    business_phone: '',
    shipping_address_line1: '',
    shipping_address_line2: '',
    shipping_city: '',
    shipping_state: 'TX',
    shipping_zip: '',
    date_of_birth: '',
    license_number: '',
    mls_id: '',
    nrds_id: '',
    association: '',
    association_status_on_join: '',
    commission_plan: '',
    custom_split: '',
    custom_plan_type: '',
    instagram_handle: '',
    tiktok_handle: '',
    threads_handle: '',
    linkedin_url: '',
    facebook_url: '',
    youtube_url: '',
    referring_agent: '',
    joining_team: '',
  })

  // Load Payload.js for step 2
  useEffect(() => {
    if (payloadScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://payload.com/Payload.js'
    script.async = true
    document.head.appendChild(script)
    payloadScriptLoaded.current = true
  }, [])

  useEffect(() => {
    if (!token) return
    verifyToken()
  }, [token])

  const verifyToken = async () => {
    try {
      const res = await fetch(`/api/onboarding/verify?token=${token}`)
      if (!res.ok) {
        setInvalid(true)
        setLoading(false)
        return
      }
      const data = await res.json()
      const p = data.prospect
      setProspect(p)
      setJoinForm((prev: JoinFormData) => ({
        ...prev,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        preferred_first_name: p.preferred_first_name || '',
        preferred_last_name: p.preferred_last_name || '',
        email: p.email || '',
        personal_phone: p.phone || p.personal_phone || '',
        business_phone: p.business_phone || '',
        date_of_birth: p.date_of_birth || '',
        shipping_address_line1: p.shipping_address_line1 || '',
        shipping_address_line2: p.shipping_address_line2 || '',
        shipping_city: p.shipping_city || '',
        shipping_state: p.shipping_state || 'TX',
        shipping_zip: p.shipping_zip || '',
        license_number: p.license_number || '',
        mls_id: p.mls_id || '',
        nrds_id: p.nrds_id || '',
        association: p.association || '',
        association_status_on_join: p.association_status_on_join || '',
        commission_plan: p.commission_plan || '',
        instagram_handle: p.instagram_handle || '',
        tiktok_handle: p.tiktok_handle || '',
        threads_handle: p.threads_handle || '',
        linkedin_url: p.linkedin_url || '',
        facebook_url: p.facebook_url || '',
        youtube_url: p.youtube_url || '',
        referring_agent: p.referring_agent || '',
        joining_team: p.joining_team || '',
      }))
      if (data.session?.current_step) setCurrentStep(data.session.current_step)
      if (data.session?.step_2_completed_at) setPaymentPaid(true)
      const s = data.session || {}
      setCompletedSteps({
        2: !!s.step_2_completed_at,
        3: !!s.step_3_completed_at,
        4: !!s.step_4_completed_at,
        5: !!s.step_5_completed_at,
        6: !!s.step_6_completed_at,
        7: !!s.step_7_completed_at,
      })
    } catch {
      setInvalid(true)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    if (['personal_phone', 'business_phone'].includes(name)) {
      setJoinForm((prev: JoinFormData) => ({ ...prev, [name]: value.replace(/\D/g, '').slice(0, 10) }))
      return
    }
    setJoinForm((prev: JoinFormData) => ({ ...prev, [name]: value }))
  }

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name'].includes(name)) {
      setJoinForm((prev: JoinFormData) => ({ ...prev, [name]: formatNameToTitleCase(value) }))
    }
  }

  const handleSubmitJoinForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Format custom plan into commission_plan string
      const submittedForm = { ...joinForm }
      if (joinForm.commission_plan === 'Custom Plan' && joinForm.custom_split && joinForm.custom_plan_type) {
        const agentSplit = parseInt(joinForm.custom_split)
        const brokSplit = 100 - agentSplit
        submittedForm.commission_plan = `Custom - ${agentSplit}/${brokSplit} ${joinForm.custom_plan_type}`
      }

      const res = await fetch('/api/onboarding/submit-join-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...submittedForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      setCurrentStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePayment = async () => {
    setPaying(true)
    try {
      // Create Payload customer (if needed), invoice, and checkout token in one call
      const res = await fetch('/api/onboarding/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok || !data.client_token)
        throw new Error(data.error || 'Failed to create checkout session')

      // Open embedded checkout
      window.Payload(data.client_token)
      const checkout = new window.Payload.Checkout({
        style: {
          default: {
            primaryColor: '#C5A278',
            backgroundColor: '#ffffff',
            color: '#1A1A1A',
            input: { borderColor: '#e5e5e5', boxShadow: 'none' },
            header: { backgroundColor: '#1A1A1A', color: '#ffffff' },
            button: { boxShadow: 'none' },
          },
        },
      })

      checkout.on('success', async (evt: any) => {
        await fetch('/api/payload/confirm-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: evt.transaction_id }),
        })
        // Advance to step 3
        await fetch('/api/onboarding/acknowledge-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, step: 2 }),
        })
        setCurrentStep(3)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setPaying(false)
      })

      checkout.on('closed', () => setPaying(false))
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please contact the office.')
      setPaying(false)
    }
  }

  // Loading
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#F9F9F9' }}
      >
        <p className="text-sm text-luxury-gray-3">Loading your onboarding...</p>
      </div>
    )
  }

  // Invalid token
  if (invalid) {
    return (
      <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
        <CornerLines thickness="thick" className="z-0" />
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />
        <div
          className="flex-1 flex items-center justify-center px-6"
          style={{ paddingTop: '140px' }}
        >
          <div className="container-card max-w-md text-center p-10">
            <h1 className="text-xl font-semibold text-luxury-gray-1 mb-3">Link Not Found</h1>
            <p className="text-sm text-luxury-gray-3">
              This onboarding link is invalid or has expired. Please contact the office at{' '}
              <a
                href="mailto:office@collectiverealtyco.com"
                className="text-luxury-accent hover:underline"
              >
                office@collectiverealtyco.com
              </a>
              .
            </p>
          </div>
        </div>
        <AuthFooter />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
      {/* Top accent */}
      <div style={{ height: '3px', backgroundColor: '#C5A278' }} />

      <LuxuryHeader showTrainingCenter={false} />

      {/* Progress bar */}
      <div
        className="fixed left-0 right-0 z-40 bg-white border-b border-luxury-gray-5 shadow-sm"
        style={{ top: '83px' }}
      >
        <div className="max-w-2xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-widest">
              {STEPS[currentStep - 1]?.label}
            </p>
            <p className="text-xs text-luxury-gray-3">
              Step {currentStep} of {STEPS.length}
            </p>
          </div>
          <div className="w-full h-1 bg-luxury-gray-5 rounded-full overflow-hidden">
            <div
              className="h-1 bg-luxury-accent rounded-full transition-all duration-500"
              style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        className="flex-1 max-w-2xl mx-auto w-full px-6"
        style={{ paddingTop: '150px', paddingBottom: '60px' }}
      >
        {/* ── STEP 1: Join Form ── */}
        {currentStep === 1 && (
          <form onSubmit={handleSubmitJoinForm} className="space-y-5">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">
                Welcome, {prospect?.preferred_first_name}.
              </h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                Let's get you set up. Please confirm your information and complete the fields below.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Personal */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                Personal Information
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Legal First Name *
                  </label>
                  <input
                    name="first_name"
                    value={joinForm.first_name}
                    onChange={handleChange}
                    onBlur={handleNameBlur}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Legal Last Name *
                  </label>
                  <input
                    name="last_name"
                    value={joinForm.last_name}
                    onChange={handleChange}
                    onBlur={handleNameBlur}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Preferred First Name *
                  </label>
                  <input
                    name="preferred_first_name"
                    value={joinForm.preferred_first_name}
                    onChange={handleChange}
                    onBlur={handleNameBlur}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Preferred Last Name *
                  </label>
                  <input
                    name="preferred_last_name"
                    value={joinForm.preferred_last_name}
                    onChange={handleChange}
                    onBlur={handleNameBlur}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Personal Phone *
                  </label>
                  <input
                    name="personal_phone"
                    value={joinForm.personal_phone}
                    onChange={handleChange}
                    required
                    maxLength={10}
                    placeholder="10 digits"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Business Phone</label>
                  <input
                    name="business_phone"
                    value={joinForm.business_phone}
                    onChange={handleChange}
                    maxLength={10}
                    placeholder="10 digits"
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Date of Birth *</label>
                  <input
                    name="date_of_birth"
                    type="date"
                    value={joinForm.date_of_birth}
                    onChange={handleChange}
                    required
                    className="input-luxury"
                  />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                Shipping Address
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Address Line 1 *
                  </label>
                  <input
                    name="shipping_address_line1"
                    value={joinForm.shipping_address_line1}
                    onChange={handleChange}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Address Line 2</label>
                  <input
                    name="shipping_address_line2"
                    value={joinForm.shipping_address_line2}
                    onChange={handleChange}
                    placeholder="Apt, Suite, Unit"
                    className="input-luxury"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">City *</label>
                    <input
                      name="shipping_city"
                      value={joinForm.shipping_city}
                      onChange={handleChange}
                      required
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">State *</label>
                    <input
                      name="shipping_state"
                      value={joinForm.shipping_state}
                      onChange={handleChange}
                      required
                      className="input-luxury"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">ZIP *</label>
                    <input
                      name="shipping_zip"
                      value={joinForm.shipping_zip}
                      onChange={handleChange}
                      required
                      maxLength={5}
                      className="input-luxury"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* License & MLS */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                License & MLS
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Texas Real Estate License Number *
                  </label>
                  <input
                    name="license_number"
                    value={joinForm.license_number}
                    onChange={handleChange}
                    required
                    className="input-luxury"
                    placeholder="e.g. 0123456"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">MLS ID *</label>
                  <input
                    name="mls_id"
                    value={joinForm.mls_id}
                    onChange={handleChange}
                    required
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    NRDS ID
                    {joinForm.association_status_on_join === 'previous_member' && (
                      <a
                        href="https://login.connect.realtor/#!/forgotmember"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-luxury-accent hover:underline"
                      >
                        Look up NRDS ID
                      </a>
                    )}
                  </label>
                  {joinForm.association_status_on_join === 'previous_member' ? (
                    <input
                      name="nrds_id"
                      value={joinForm.nrds_id}
                      onChange={handleChange}
                      className="input-luxury"
                    />
                  ) : (
                    <p className="text-xs text-luxury-gray-3 py-2">Not applicable for new agents</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Association *</label>
                  <select
                    name="association"
                    value={joinForm.association}
                    onChange={handleChange}
                    required
                    className="select-luxury"
                  >
                    <option value="">Select</option>
                    <option value="HAR">HAR</option>
                    <option value="MetroTex | NTREIS">MetroTex | NTREIS</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-luxury-gray-3 mb-2">
                    Association Status *
                  </label>
                  <div className="space-y-2">
                    {[
                      { value: 'new_agent', label: 'I am a brand new licensed agent' },
                      {
                        value: 'previous_member',
                        label: 'I was previously a member with another brokerage',
                      },
                    ].map(opt => (
                      <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="association_status_on_join"
                          value={opt.value}
                          checked={joinForm.association_status_on_join === opt.value}
                          onChange={handleChange}
                          required
                          className="mt-0.5"
                        />
                        <span className="text-sm text-luxury-gray-1">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Plan */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                Commission Plan *
              </h2>
              <div className="space-y-2.5">
                {['New Agent Plan', 'No Cap Plan', 'Cap Plan', 'Custom Plan'].map(plan => (
                  <label
                    key={plan}
                    className="flex items-center gap-2.5 cursor-pointer inner-card hover:border-luxury-black transition-colors"
                  >
                    <input
                      type="radio"
                      name="commission_plan"
                      value={plan}
                      checked={joinForm.commission_plan === plan}
                      onChange={handleChange}
                      required
                    />
                    <span className="text-sm text-luxury-gray-1 font-medium">{plan}</span>
                  </label>
                ))}
              </div>

              {joinForm.commission_plan === 'Custom Plan' && (
                <div className="mt-4 space-y-3 pt-4 border-t border-luxury-gray-5">
                  <p className="text-xs text-luxury-gray-3">
                    Enter the split and plan type offered to you by the broker.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        Your Split % (Agent) *
                      </label>
                      <input
                        name="custom_split"
                        type="number"
                        min="1"
                        max="99"
                        value={joinForm.custom_split}
                        onChange={handleChange}
                        placeholder="e.g. 80"
                        required={joinForm.commission_plan === 'Custom Plan'}
                        className="input-luxury"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        Plan Type *
                      </label>
                      <select
                        name="custom_plan_type"
                        value={joinForm.custom_plan_type}
                        onChange={handleChange}
                        required={joinForm.commission_plan === 'Custom Plan'}
                        className="select-luxury"
                      >
                        <option value="">Select type</option>
                        <option value="No Cap">No Cap</option>
                        <option value="Cap">Cap ($18,000)</option>
                        <option value="New Agent Base">New Agent Base</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-luxury-gray-3 mt-3">
                Select the plan offered to you. Questions? Contact{' '}
                <a
                  href="mailto:office@collectiverealtyco.com"
                  className="text-luxury-accent hover:underline"
                >
                  office@collectiverealtyco.com
                </a>
                .
              </p>
            </div>

            {/* Social Media */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                Social Media
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'instagram_handle', label: 'Instagram', placeholder: '@handle' },
                  { name: 'tiktok_handle', label: 'TikTok', placeholder: '@handle' },
                  { name: 'threads_handle', label: 'Threads', placeholder: '@handle' },
                  { name: 'linkedin_url', label: 'LinkedIn', placeholder: 'linkedin.com/in/...' },
                  { name: 'facebook_url', label: 'Facebook', placeholder: 'facebook.com/...' },
                  { name: 'youtube_url', label: 'YouTube', placeholder: 'youtube.com/...' },
                ].map(field => (
                  <div key={field.name}>
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">{field.label}</label>
                    <input
                      name={field.name}
                      value={(joinForm as any)[field.name]}
                      onChange={handleChange}
                      placeholder={field.placeholder}
                      className="input-luxury"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Referral */}
            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                Referral & Team
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">Referring Agent</label>
                  <input
                    name="referring_agent"
                    value={joinForm.referring_agent}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="block text-xs text-luxury-gray-3 mb-1.5">
                    Joining Team (name or team lead)
                  </label>
                  <input
                    name="joining_team"
                    value={joinForm.joining_team}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Continue to Payment →'}
            </button>
          </form>
        )}

        {/* ── STEP 2: Payment ── */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setCurrentStep(1)} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
                ← Back
              </button>
            </div>

            {paymentPaid ? (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">Payment Complete</h1>
                  <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                    Your onboarding payment has been received. Continue to review and sign your agreements.
                  </p>
                </div>
                <div className="container-card flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                  <p className="text-sm text-luxury-gray-2">Onboarding invoice paid.</p>
                </div>
                <button
                  onClick={() => { setCurrentStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase"
                >
                  Continue to Agreements →
                </button>
              </>
            ) : (
              <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">Onboarding Payment</h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                Complete your onboarding fee to unlock your agreements and TREC sponsorship.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-5">
                What's Included
              </h2>
              <div className="space-y-3">
                <div className="inner-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-luxury-gray-1">Onboarding Fee</p>
                    <p className="text-xs text-luxury-gray-3">
                      One-time fee to join Collective Realty Co.
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-luxury-gray-1">$399.00</p>
                </div>
                <div className="inner-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-luxury-gray-1">Prorated Monthly Fee</p>
                    <p className="text-xs text-luxury-gray-3">
                      {(() => {
                        const now = new Date()
                        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                        const p = (n: number) => String(n).padStart(2, '0')
                        const yy = String(now.getFullYear()).slice(2)
                        const start = `${p(now.getMonth() + 1)}/${p(now.getDate())}/${yy}`
                        const end = `${p(now.getMonth() + 1)}/${p(dim)}/${yy}`
                        return `${start} to ${end}`
                      })()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-luxury-gray-1">
                    {(() => {
                      const now = new Date()
                      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
                      const remaining = dim - now.getDate() + 1
                      return `$${(Math.round((50 / dim) * remaining * 100) / 100).toFixed(2)}`
                    })()}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-luxury-gray-5/50">
                <p className="text-xs text-luxury-gray-3">
                  Processing fees are passed to the payer. Monthly fees of $50 are due by the 5th of
                  each month thereafter.
                </p>
              </div>
            </div>

            <div className="container-card">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                Payment Methods
              </h2>
              <div className="space-y-2 text-sm text-luxury-gray-2">
                <p>Credit/debit card or bank account (ACH). Click Pay & Continue below.</p>
                <p>
                  Zelle: send to{' '}
                  <span className="font-medium text-luxury-gray-1">info@collectiverealtyco.com</span>{' '}
                  with your name, then email{' '}
                  <a href="mailto:office@collectiverealtyco.com" className="text-luxury-accent hover:underline">
                    office@collectiverealtyco.com
                  </a>{' '}
                  to confirm.
                </p>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={paying}
              className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
            >
              {paying ? 'Opening Checkout...' : 'Pay & Continue →'}
            </button>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: ICA ── */}
        {currentStep === 3 && (
          completedSteps[3] ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => { setCurrentStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">← Back</button>
              </div>
              <div className="container-card flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                <p className="text-sm text-luxury-gray-2">Independent Contractor Agreement signed.</p>
              </div>
              <button onClick={() => { setCurrentStep(4); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase">Continue →</button>
            </div>
          ) : (
            <SignatureStep
              token={token}
              documentType="ica"
              title="Independent Contractor Agreement"
              description="Please read the agreement below carefully and sign at the bottom to continue."
              onComplete={() => { setCurrentStep(4); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onBack={() => { setCurrentStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            />
          )
        )}

        {/* ── STEP 4: Commission Plan Agreement ── */}
        {currentStep === 4 && (
          completedSteps[4] ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => { setCurrentStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">← Back</button>
              </div>
              <div className="container-card flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                <p className="text-sm text-luxury-gray-2">Commission Plan Agreement signed.</p>
              </div>
              <button onClick={() => { setCurrentStep(5); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase">Continue →</button>
            </div>
          ) : (
            <SignatureStep
              token={token}
              documentType="commission_plan"
              title="Commission Plan Agreement"
              description="Your commission plan agreement is shown below based on the plan you selected. Please review and sign."
              onComplete={() => { setCurrentStep(5); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onBack={() => { setCurrentStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            />
          )
        )}

        {/* ── STEP 5: Policy Manual ── */}
        {currentStep === 5 && (
          completedSteps[5] ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => { setCurrentStep(4); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">← Back</button>
              </div>
              <div className="container-card flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                <p className="text-sm text-luxury-gray-2">Policy Manual acknowledged and signed.</p>
              </div>
              <button onClick={() => { setCurrentStep(6); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase">Continue →</button>
            </div>
          ) : (
            <PolicyManualStep
              token={token}
              onComplete={() => { setCurrentStep(6); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onBack={() => { setCurrentStep(4); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            />
          )
        )}

        {/* ── STEP 6: W-9 ── */}
        {currentStep === 6 && (
          completedSteps[6] ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={() => { setCurrentStep(5); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">← Back</button>
              </div>
              <div className="container-card flex items-center gap-3">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
                <p className="text-sm text-luxury-gray-2">W-9 acknowledged.</p>
              </div>
              <button onClick={() => { setCurrentStep(7); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase">Continue →</button>
            </div>
          ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => { setCurrentStep(5); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
                ← Back
              </button>
            </div>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">W-9 Form</h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                Your W-9 will be sent to your email shortly for completion. Once you receive it, complete and return it to us.
              </p>
            </div>
            <div className="container-card text-center space-y-4">
              <p className="text-sm text-luxury-gray-2">
                We use Track1099 to collect your W-9 securely. You will receive an email with a link to complete your form electronically.
              </p>
              <p className="text-sm text-luxury-gray-3">
                If you have not received it within 24 hours, contact{' '}
                <a href="mailto:office@collectiverealtyco.com" className="text-luxury-accent hover:underline">
                  office@collectiverealtyco.com
                </a>
              </p>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/onboarding/acknowledge-step', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token, step: 6 }),
                })
                setCurrentStep(7)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase"
            >
              I Understand, Continue →
            </button>
          </div>
          )
        )}

        {/* ── STEP 7: TREC ── */}
        {currentStep === 7 && (
          <div className="text-center py-12 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => { setCurrentStep(6); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
                ← Back
              </button>
            </div>
            <CheckCircle2 size={48} className="text-luxury-accent mx-auto" />
            <div>
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-3">You're Almost There</h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                Your onboarding documents have been completed and saved. The final step is TREC sponsorship. We will submit your sponsorship request and notify you by email once it has been accepted.
              </p>
            </div>
            <div className="container-card max-w-md mx-auto text-left space-y-3">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">What happens next</p>
              <div className="space-y-2 text-sm text-luxury-gray-2">
                <p>✓ We submit your TREC sponsorship request</p>
                <p>✓ You'll receive a TREC invitation email to accept</p>
                <p>✓ Once accepted, we'll send your welcome email with next steps</p>
                <p>✓ You'll gain full access to the agent portal</p>
              </div>
            </div>
            <p className="text-xs text-luxury-gray-3">
              Questions? Contact us at{' '}
              <a href="mailto:office@collectiverealtyco.com" className="text-luxury-accent hover:underline">
                office@collectiverealtyco.com
              </a>
            </p>
          </div>
        )}
      </div>

      <AuthFooter />
      </div>
    </div>
  )
}