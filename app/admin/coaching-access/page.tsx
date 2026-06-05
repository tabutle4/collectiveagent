'use client'

import { useEffect, useState } from 'react'
import { Send, Users, UserCheck, UserX, Lock } from 'lucide-react'

interface Agent {
  id: string
  name: string
  email: string
  office: string | null
  overdue_count: number
  eligible: boolean
}

interface CoachingClient {
  id: string
  name: string
  email: string
  fee_paid: boolean
}

export default function CoachingAccessPage() {
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<Agent[]>([])
  const [coachingClients, setCoachingClients] = useState<CoachingClient[]>([])
  const [passcode, setPasscode] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [zoomLink, setZoomLink] = useState('')
  const [clientZoomLink, setClientZoomLink] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coaching-access')
      const d = await res.json()
      setAgents(d.agents || [])
      setCoachingClients(d.coachingClients || [])
      setZoomLink(d.zoomLink || '')
      setClientZoomLink(d.clientZoomLink || '')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function sendEmails() {
    if (!passcode.trim()) { setError('Enter a passcode first.'); return }
    setSending(true)
    setError('')
    setSent(false)
    try {
      const res = await fetch('/api/admin/coaching-access/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Send failed')
      setSent(true)
      setPasscode('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const eligibleAgents = agents.filter(a => a.eligible)
  const ineligibleAgents = agents.filter(a => !a.eligible)
  const eligibleClients = coachingClients.filter(c => c.fee_paid)
  const ineligibleClients = coachingClients.filter(c => !c.fee_paid)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="page-title mb-1">Coaching Access</h1>
        <p className="text-luxury-gray-3 text-sm">Enter the monthly Zoom passcode and send it to all eligible recipients.</p>
      </div>

      {/* Passcode send */}
      <div className="container-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-luxury-accent" />
          <p className="text-luxury-gray-2 font-medium text-sm">Send Monthly Passcode</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            placeholder="Enter this month's Zoom passcode"
            className="input-luxury flex-1"
          />
          <button
            onClick={sendEmails}
            disabled={sending || !passcode.trim()}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50 sm:w-auto w-full justify-center"
          >
            <Send size={14} />
            {sending ? 'Sending...' : `Send to ${eligibleAgents.length + eligibleClients.length} recipients`}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        {sent && <p className="text-green-400 text-xs mt-2">Emails sent successfully.</p>}
        {(zoomLink || clientZoomLink) && (
          <div className="mt-3 pt-3 border-t border-luxury-dark-3 flex flex-wrap gap-4">
            {zoomLink && (
              <p className="text-luxury-gray-3 text-xs">Agent link: <span className="text-luxury-gray-2">{zoomLink}</span></p>
            )}
            {clientZoomLink && (
              <p className="text-luxury-gray-3 text-xs">Client link: <span className="text-luxury-gray-2">{clientZoomLink}</span></p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-luxury-gray-3 text-sm">Loading...</p>
      ) : (
        <>
          {/* Agents section */}
          <div className="container-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-luxury-accent" />
              <p className="text-luxury-gray-2 font-medium text-sm">Brokerage Agents</p>
            </div>
            <p className="text-luxury-gray-3 text-xs mb-4">
              Active licensed agents. Ineligible agents have unpaid fees from prior months.
            </p>

            {/* Eligible agents */}
            <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-2">
              Eligible ({eligibleAgents.length})
            </p>
            {eligibleAgents.length > 0 ? (
              <div className="space-y-1 mb-5">
                {eligibleAgents.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-luxury-dark-3 last:border-0">
                    <div className="flex items-center gap-2">
                      <UserCheck size={14} className="text-green-500 shrink-0" />
                      <span className="text-luxury-black text-sm">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-luxury-gray-3 text-xs">{a.email}</span>
                      {a.office && <span className="text-luxury-gray-3 text-xs">{a.office === 'HAR' ? 'HOU' : 'DFW'}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-luxury-gray-3 text-sm mb-5">No eligible agents.</p>
            )}

            {/* Ineligible agents */}
            {ineligibleAgents.length > 0 && (
              <>
                <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-2">
                  Ineligible ({ineligibleAgents.length})
                </p>
                <div className="space-y-1">
                  {ineligibleAgents.map(a => (
                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-luxury-dark-3 last:border-0 opacity-40">
                      <div className="flex items-center gap-2">
                        <UserX size={14} className="text-red-400 shrink-0" />
                        <span className="text-luxury-gray-3 text-sm">{a.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-luxury-gray-3 text-xs">{a.email}</span>
                        <span className="text-red-400 text-xs">{a.overdue_count} overdue</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Coaching clients section */}
          <div className="container-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-luxury-accent" />
              <p className="text-luxury-gray-2 font-medium text-sm">Coaching Clients</p>
            </div>
            <p className="text-luxury-gray-3 text-xs mb-4">
              External coaching clients. Only those with a paid monthly fee receive the passcode.
            </p>

            {coachingClients.length === 0 ? (
              <p className="text-luxury-gray-3 text-sm">No coaching clients yet. Add clients by assigning the coaching client role in agent management.</p>
            ) : (
              <>
                {/* Eligible clients */}
                <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-2">
                  Eligible ({eligibleClients.length})
                </p>
                {eligibleClients.length > 0 ? (
                  <div className="space-y-1 mb-5">
                    {eligibleClients.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-luxury-dark-3 last:border-0">
                        <div className="flex items-center gap-2">
                          <UserCheck size={14} className="text-green-500 shrink-0" />
                          <span className="text-luxury-black text-sm">{c.name}</span>
                        </div>
                        <span className="text-luxury-gray-3 text-xs">{c.email}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-luxury-gray-3 text-sm mb-5">No eligible clients this month.</p>
                )}

                {/* Ineligible clients */}
                {ineligibleClients.length > 0 && (
                  <>
                    <p className="text-luxury-gray-3 text-xs uppercase tracking-wide mb-2">
                      Ineligible ({ineligibleClients.length})
                    </p>
                    <div className="space-y-1">
                      {ineligibleClients.map(c => (
                        <div key={c.id} className="flex items-center justify-between py-2 border-b border-luxury-dark-3 last:border-0 opacity-40">
                          <div className="flex items-center gap-2">
                            <UserX size={14} className="text-red-400 shrink-0" />
                            <span className="text-luxury-gray-3 text-sm">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-luxury-gray-3 text-xs">{c.email}</span>
                            <span className="text-red-400 text-xs">fee unpaid</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
