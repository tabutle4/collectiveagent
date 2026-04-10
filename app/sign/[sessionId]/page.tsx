'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import CornerLines from '@/components/shared/CornerLines'
import { useAuth } from '@/lib/context/AuthContext'

export default function BrokerSignPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const router = useRouter()
  const { user, loading: authLoading, hasPermission } = useAuth()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [icaExpanded, setIcaExpanded] = useState(false)
  const [commExpanded, setCommExpanded] = useState(false)

  const isAuthorized = hasPermission('can_manage_prospects')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push(`/auth/login?redirect=${encodeURIComponent(`/sign/${sessionId}`)}`)
      return
    }
    if (!isAuthorized) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/admin/broker-review?userId=${sessionId}`)
        if (!res.ok) throw new Error('Failed to load agent data')
        const json = await res.json()
        setData(json)
      } catch (e: any) {
        setError(e.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authLoading, user, isAuthorized, sessionId, router])

  const handleSign = async () => {
    setSigning(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sign-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: sessionId, signBoth: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDone(true)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setSigning(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />
        {children}
      </div>
    </div>
  )

  if (authLoading || loading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-luxury-gray-3">Loading...</p>
        </div>
      </PageShell>
    )
  }

  if (!isAuthorized) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="container-card max-w-md text-center py-12">
            <p className="text-sm text-red-600">You don't have permission to access this page.</p>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="container-card max-w-md text-center py-12">
            <p className="text-sm text-red-600">{error || 'Agent not found.'}</p>
          </div>
        </div>
      </PageShell>
    )
  }

  const { agent, session, documents } = data

  return (
    <PageShell>
      <div className="flex-1 max-w-2xl mx-auto w-full px-6" style={{ paddingTop: '120px', paddingBottom: '60px' }}>

        {done ? (
          <div className="container-card text-center py-12 space-y-4">
            <CheckCircle2 size={40} className="text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold text-luxury-gray-1">Both Documents Signed</h2>
            <p className="text-sm text-luxury-gray-3">
              Your signature has been embedded in both agreements and saved to OneDrive.
              {' '}{agent.preferredName} is now active in the system.
            </p>
            <button
              onClick={() => router.push(`/admin/users/${sessionId}`)}
              className="btn btn-primary text-sm px-6"
            >
              View Agent Profile
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center mb-2">
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-1">Co-Signature Required</h1>
              <p className="text-sm text-luxury-gray-3">Review the agreements below and confirm your co-signature.</p>
            </div>

            {/* ── Agent Summary ── */}
            <div className="container-card space-y-4">
              <div>
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Agent</p>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-luxury-gray-1">{agent.preferredName}</p>
                  <a
                    href={`/admin/prospects/${sessionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                    title="View prospect profile"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
                <p className="text-xs text-luxury-gray-3">{agent.email}</p>
              </div>

              <div className="pt-3 border-t border-luxury-gray-5/50">
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Commission Plan</p>
                <p className="text-sm font-medium text-luxury-accent">{agent.commissionPlan || 'Not set'}</p>
              </div>

              <div className="pt-3 border-t border-luxury-gray-5/50">
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Completed Steps</p>
                <div className="space-y-2">
                  {[
                    { label: 'Onboarding Fee Paid', done: agent.onboardingFeePaid, date: agent.onboardingFeePaidDate },
                    { label: 'ICA Signed by Agent', done: !!agent.icaSignedAt, date: agent.icaSignedAt },
                    { label: 'Commission Plan Signed by Agent', done: !!agent.commissionPlanSignedAt, date: agent.commissionPlanSignedAt },
                  ].map(({ label, done: stepDone, date }) => (
                    <div key={label} className="flex items-center gap-2">
                      {stepDone
                        ? <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                        : <div className="w-[15px] h-[15px] rounded-full border border-luxury-gray-3 flex-shrink-0" />}
                      <span className="text-sm text-luxury-gray-2">
                        {label}
                        {date && <span className="text-xs text-luxury-gray-3 ml-1">({formatDate(date)})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent signature - shown if saved, skipped gracefully if not */}
              {session?.agentSignatureUrl && (
                <div className="pt-3 border-t border-luxury-gray-5/50">
                  <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Agent Signature</p>
                  <img
                    src={session.agentSignatureUrl}
                    alt={agent.preferredName}
                    className="h-12 object-contain"
                  />
                  <p className="text-xs text-luxury-gray-3 mt-1">{agent.preferredName}</p>
                </div>
              )}

              {/* OneDrive folder link */}
              {agent.onedriveUrl && (
                <div className="pt-3 border-t border-luxury-gray-5/50 flex items-center justify-between">
                  <p className="text-xs text-luxury-gray-3">Agent Documents folder</p>
                  <a
                    href={agent.onedriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                  >
                    Open in OneDrive <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>

            {/* ── ICA Preview ── */}
            <div className="container-card">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setIcaExpanded(v => !v)}
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-luxury-gray-1">Independent Contractor Agreement</p>
                  <p className="text-xs text-luxury-gray-3 mt-0.5">Tap to review before signing</p>
                </div>
                {icaExpanded
                  ? <ChevronUp size={16} className="text-luxury-gray-3 flex-shrink-0" />
                  : <ChevronDown size={16} className="text-luxury-gray-3 flex-shrink-0" />}
              </button>
              {icaExpanded && documents?.ica && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 max-h-80 overflow-y-auto text-xs text-luxury-gray-2 leading-relaxed space-y-3">
                  <p className="text-sm font-semibold text-luxury-gray-1 text-center">{documents.ica.title}</p>
                  {documents.ica.sections?.map((section: any, i: number) => (
                    <div key={i}>
                      {section.heading && <p className="font-semibold text-luxury-gray-1 mt-3">{section.heading}</p>}
                      {section.body && <p className="whitespace-pre-wrap">{section.body}</p>}
                    </div>
                  ))}
                  {session?.agentSignatureUrl && (
                    <div className="pt-3 border-t border-luxury-gray-5/30 mt-3">
                      <p className="text-xs text-luxury-gray-3 mb-1">Agent Signature</p>
                      <img src={session.agentSignatureUrl} alt={agent.preferredName} className="h-10 object-contain" />
                      <p className="text-xs text-luxury-gray-3 mt-1">{agent.preferredName}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Commission Plan Preview ── */}
            <div className="container-card">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setCommExpanded(v => !v)}
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-luxury-gray-1">Commission Plan Agreement</p>
                  <p className="text-xs text-luxury-gray-3 mt-0.5">
                    {agent.commissionPlan} - tap to review before signing
                  </p>
                </div>
                {commExpanded
                  ? <ChevronUp size={16} className="text-luxury-gray-3 flex-shrink-0" />
                  : <ChevronDown size={16} className="text-luxury-gray-3 flex-shrink-0" />}
              </button>
              {commExpanded && documents?.commission_plan && (
                <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 max-h-80 overflow-y-auto text-xs text-luxury-gray-2 leading-relaxed space-y-3">
                  <p className="text-sm font-semibold text-luxury-gray-1 text-center">{documents.commission_plan.title}</p>
                  {documents.commission_plan.sections?.map((section: any, i: number) => (
                    <div key={i}>
                      {section.heading && <p className="font-semibold text-luxury-gray-1 mt-3">{section.heading}</p>}
                      {section.body && <p className="whitespace-pre-wrap">{section.body}</p>}
                    </div>
                  ))}
                  {session?.agentSignatureUrl && (
                    <div className="pt-3 border-t border-luxury-gray-5/30 mt-3">
                      <p className="text-xs text-luxury-gray-3 mb-1">Agent Signature</p>
                      <img src={session.agentSignatureUrl} alt={agent.preferredName} className="h-10 object-contain" />
                      <p className="text-xs text-luxury-gray-3 mt-1">{agent.preferredName}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Broker Signature ── */}
            <div className="container-card">
              <p className="text-xs text-luxury-gray-3 mb-3">Your Signature</p>
              <img
                src="/courtney-signature.png"
                alt="Courtney Okanlomo"
                className="h-14 object-contain"
              />
              <p className="text-xs text-luxury-gray-3 mt-2">Courtney Okanlomo, Broker</p>
            </div>

            <p className="text-xs text-luxury-gray-3 text-center px-4">
              By clicking Confirm &amp; Sign, your signature will be embedded in both agreements
              for {agent.preferredName} and both documents will be saved to OneDrive.
            </p>

            {error && <p className="text-xs text-red-600 text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/admin/prospects/${sessionId}`)}
                className="btn btn-secondary flex-1 py-3.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSign}
                disabled={signing}
                className="btn btn-primary flex-1 py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
              >
                {signing ? 'Signing...' : 'Confirm & Sign Both →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}