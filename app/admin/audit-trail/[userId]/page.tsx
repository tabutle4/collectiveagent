'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Eye, PenLine, CheckCircle2, FileText, Download, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface AuditLog {
  id: string
  document_type: string
  event_type: 'viewed' | 'signed' | 'completed'
  ip_address: string
  user_agent: string
  created_at: string
}

interface AuditData {
  user: {
    name: string
    email: string
    isReferralAgent: boolean
  }
  auditLogs: AuditLog[]
}

const EVENT_ICONS = {
  viewed: Eye,
  signed: PenLine,
  completed: CheckCircle2,
}

const EVENT_LABELS = {
  viewed: 'Viewed',
  signed: 'Signed',
  completed: 'Completed',
}

const DOCUMENT_LABELS: Record<string, string> = {
  ica: 'Independent Contractor Agreement',
  referral_ica: 'Referral Agent ICA',
  commission_plan: 'Commission Plan Agreement',
  policy_manual: 'Policy Manual Acknowledgment',
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
}

function truncateUserAgent(ua: string): string {
  if (!ua || ua === 'unknown') return 'Unknown'
  // Extract browser name and version
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)
  if (match) return match[0]
  return ua.substring(0, 50) + (ua.length > 50 ? '...' : '')
}

export default function AuditTrailPage() {
  const params = useParams()
  const userId = params.userId as string
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<AuditData | null>(null)

  useEffect(() => {
    async function fetchAuditTrail() {
      try {
        const res = await fetch(`/api/onboarding/audit?userId=${userId}`)
        const json = await res.json()
        
        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch audit trail')
        }
        
        setData(json)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    fetchAuditTrail()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-cream flex items-center justify-center">
        <Loader2 className="animate-spin text-luxury-gray-3" size={32} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-luxury-cream p-8">
        <div className="max-w-4xl mx-auto">
          <div className="container-card text-center py-12">
            <p className="text-red-600">{error || 'Failed to load audit trail'}</p>
            <Link href="/admin/onboarding" className="btn btn-secondary mt-4 inline-block">
              Back to Onboarding
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Group logs by document type
  const logsByDocument = data.auditLogs.reduce((acc, log) => {
    const key = log.document_type
    if (!acc[key]) acc[key] = []
    acc[key].push(log)
    return acc
  }, {} as Record<string, AuditLog[]>)

  // Calculate completion status
  const signedDocs = new Set(
    data.auditLogs
      .filter(l => l.event_type === 'signed')
      .map(l => l.document_type)
  )
  
  const allDocsComplete = data.user.isReferralAgent
    ? signedDocs.has('ica') && signedDocs.has('policy_manual')
    : signedDocs.has('ica') && signedDocs.has('commission_plan') && signedDocs.has('policy_manual')

  return (
    <div className="min-h-screen bg-luxury-cream p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href="/admin/onboarding" 
            className="text-sm text-luxury-gray-3 hover:text-luxury-gray-1 inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft size={14} />
            Back to Onboarding
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="page-title mb-1">Audit Trail</h1>
              <p className="text-sm text-luxury-gray-3">Document signing history</p>
            </div>
            <button 
              onClick={() => window.print()}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Download size={14} />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Agent Info Card */}
        <div className="container-card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-1">Agent Name</p>
              <p className="text-sm font-medium text-luxury-gray-1">{data.user.name}</p>
            </div>
            <div>
              <p className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-1">Email</p>
              <p className="text-sm text-luxury-gray-2">{data.user.email}</p>
            </div>
            <div>
              <p className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-1">Agent Type</p>
              <p className="text-sm text-luxury-gray-2">
                {data.user.isReferralAgent ? 'Referral Agent (Referral Collective)' : 'Full Service Agent (CRC)'}
              </p>
            </div>
            <div>
              <p className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-flex items-center gap-1.5 text-sm ${allDocsComplete ? 'text-green-600' : 'text-amber-600'}`}>
                {allDocsComplete ? (
                  <>
                    <CheckCircle2 size={14} />
                    All Documents Signed
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    In Progress
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Audit Trail */}
        <div className="container-card">
          <h2 className="section-title mb-6">Document History</h2>
          
          {data.auditLogs.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 text-center py-8">
              No document activity recorded yet.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(logsByDocument).map(([docType, logs]) => (
                <div key={docType} className="inner-card">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={16} className="text-luxury-gray-3" />
                    <h3 className="text-sm font-medium text-luxury-gray-1">
                      {DOCUMENT_LABELS[docType] || docType}
                    </h3>
                    {signedDocs.has(docType) && (
                      <span className="ml-auto text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        Signed
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-3">
                    {logs.map((log) => {
                      const Icon = EVENT_ICONS[log.event_type]
                      return (
                        <div 
                          key={log.id}
                          className="flex items-start gap-3 text-sm border-l-2 border-luxury-gray-5 pl-3 py-1"
                        >
                          <Icon size={16} className="text-luxury-gray-3 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-luxury-gray-1">
                              <span className="font-medium">{EVENT_LABELS[log.event_type]}</span>
                              {' by '}
                              <span className="text-luxury-gray-2">({data.user.email})</span>
                            </p>
                            <p className="text-xs text-luxury-gray-3 mt-0.5">
                              IP: {log.ip_address}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-luxury-gray-1">{formatDate(log.created_at)}</p>
                            <p className="text-xs text-luxury-gray-3">{formatTime(log.created_at)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Print Footer */}
        <div className="hidden print:block mt-8 text-center text-xs text-luxury-gray-3">
          <p>Generated by Collective Agent on {new Date().toLocaleString()}</p>
          <p>This document is a record of electronic signatures and document access.</p>
        </div>
      </div>
    </div>
  )
}
