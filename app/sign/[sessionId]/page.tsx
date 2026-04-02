'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import CornerLines from '@/components/shared/CornerLines'
import { useAuth } from '@/lib/context/AuthContext'

const DOC_LABELS: Record<string, string> = {
  ica: 'Independent Contractor Agreement',
  commission_plan: 'Commission Plan Agreement',
}

export default function BrokerSignPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const documentType = searchParams.get('doc') || ''

  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState<any>(null)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAuthorized = user?.role === 'broker' || user?.role === 'operations'

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push('/auth/login'); return }
    if (!isAuthorized) { setLoading(false); return }

    const load = async () => {
      try {
        const res = await fetch(`/api/users/profile?id=${sessionId}`)
        if (!res.ok) throw new Error('Agent not found')
        const data = await res.json()
        setAgent(data.user)
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
        body: JSON.stringify({ userId: sessionId, documentType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDone(true)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setSigning(false)
    }
  }

  const docLabel = DOC_LABELS[documentType] || documentType
  const agentName = agent ? `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}` : ''

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />

        <div className="flex-1 flex items-center justify-center px-6" style={{ paddingTop: '120px', paddingBottom: '60px' }}>
          <div className="w-full max-w-lg">

            {(authLoading || loading) && (
              <div className="container-card text-center py-12">
                <p className="text-sm text-luxury-gray-3">Loading...</p>
              </div>
            )}

            {!authLoading && !loading && !isAuthorized && (
              <div className="container-card text-center py-12">
                <p className="text-sm text-red-600">You don't have permission to access this page.</p>
              </div>
            )}

            {!authLoading && !loading && isAuthorized && !agent && (
              <div className="container-card text-center py-12">
                <p className="text-sm text-red-600">{error || 'Agent not found.'}</p>
              </div>
            )}

            {!authLoading && !loading && isAuthorized && agent && !done && (
              <div className="container-card">
                <h1 className="text-lg font-semibold text-luxury-gray-1 mb-1">Co-Signature Required</h1>
                <p className="text-sm text-luxury-gray-3 mb-6">{docLabel}</p>

                <div className="inner-card mb-4">
                  <p className="text-xs text-luxury-gray-3 mb-1">Agent</p>
                  <p className="text-sm font-medium text-luxury-gray-1">{agentName}</p>
                  <p className="text-xs text-luxury-gray-3 mt-0.5">{agent.email}</p>
                </div>

                <div className="inner-card mb-6">
                  <p className="text-xs text-luxury-gray-3 mb-3">Your Signature</p>
                  <img
                    src="/courtney-signature.png"
                    alt="Courtney Okanlomo"
                    className="h-14 object-contain"
                  />
                  <p className="text-xs text-luxury-gray-3 mt-2">Courtney Okanlomo, Broker</p>
                </div>

                <p className="text-xs text-luxury-gray-3 mb-6">
                  By clicking confirm, your signature will be embedded in the {docLabel} for {agentName} and the document will be updated in OneDrive.
                </p>

                {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => router.push(`/admin/users/${sessionId}`)}
                    className="btn btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSign}
                    disabled={signing}
                    className="btn btn-primary text-sm"
                  >
                    {signing ? 'Signing...' : 'Confirm & Sign'}
                  </button>
                </div>
              </div>
            )}

            {done && (
              <div className="container-card text-center py-12">
                <CheckCircle2 size={40} className="text-green-600 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-luxury-gray-1 mb-2">Signed Successfully</h2>
                <p className="text-sm text-luxury-gray-3 mb-6">
                  The {docLabel} has been updated with your signature and saved to OneDrive.
                </p>
                <button
                  onClick={() => router.push(`/admin/users/${sessionId}`)}
                  className="btn btn-primary text-sm"
                >
                  View Agent Profile
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}