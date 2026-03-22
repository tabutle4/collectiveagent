'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import CampaignEmailModal from '@/components/campaigns/CampaignEmailModal'
import AgentCampaignResponseModal from '@/components/campaigns/AgentCampaignResponseModal'

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [rsvps, setRsvps] = useState<any[]>([])
  const [surveys, setSurveys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eventStaffEmail, setEventStaffEmail] = useState('')
  const [sendingRsvp, setSendingRsvp] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)
  const [responseModalOpen, setResponseModalOpen] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<any>(null)
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [newDeadline, setNewDeadline] = useState('')
  const [savingDeadline, setSavingDeadline] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchCampaignData()
    }
  }, [params.id])

  const fetchCampaignData = async () => {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to load campaign')

      setCampaign(data.campaign)
      setStats(data.stats)
      setAgents(data.agents || [])
      setRsvps(data.rsvps || [])
      setSurveys(data.surveys || [])
      setEventStaffEmail(data.campaign.event_staff_email || '')

      if (data.campaign.deadline) {
        const deadlineDate = new Date(data.campaign.deadline)
        const localDateTime = new Date(
          deadlineDate.getTime() - deadlineDate.getTimezoneOffset() * 60000
        )
        setNewDeadline(localDateTime.toISOString().slice(0, 16))
      }

      setLoading(false)
    } catch (error) {
      console.error('Error fetching campaign data:', error)
      setLoading(false)
    }
  }

  const saveEventStaffEmail = async () => {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_staff_email: eventStaffEmail }),
      })

      if (!res.ok) throw new Error('Failed to save')
      alert('Event staff email saved!')
    } catch (error) {
      console.error('Error saving email:', error)
      alert('Failed to save email')
    }
  }

  const saveDeadline = async () => {
    if (!newDeadline) {
      alert('Please enter a deadline')
      return
    }

    setSavingDeadline(true)
    try {
      const deadlineValue =
        newDeadline.includes(':') && newDeadline.split(':').length === 2
          ? `${newDeadline}:00`
          : newDeadline

      const testDate = new Date(deadlineValue)
      if (isNaN(testDate.getTime())) {
        throw new Error('Invalid date format')
      }

      const res = await fetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline: deadlineValue }),
      })

      if (!res.ok) throw new Error('Failed to update deadline')

      setCampaign({ ...campaign, deadline: deadlineValue })
      setEditingDeadline(false)
      alert('Deadline updated successfully!')
    } catch (error: any) {
      console.error('Error updating deadline:', error)
      alert('Failed to update deadline: ' + (error.message || 'Unknown error'))
    } finally {
      setSavingDeadline(false)
    }
  }

  const sendRsvpList = async () => {
    if (!eventStaffEmail) {
      alert('Please enter an event staff email first')
      return
    }

    setSendingRsvp(true)
    try {
      const response = await fetch('/api/campaign/send-rsvp-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: params.id,
          event_staff_email: eventStaffEmail,
        }),
      })

      if (!response.ok) throw new Error('Failed to send RSVP list')
      alert('RSVP list sent successfully!')
    } catch (error) {
      console.error('Error sending RSVP list:', error)
      alert('Failed to send RSVP list')
    }
    setSendingRsvp(false)
  }

  const generateTokens = async () => {
    if (!confirm('Generate tokens for all active agents without tokens?')) return

    try {
      const response = await fetch('/api/campaign/generate-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: params.id }),
      })

      if (!response.ok) throw new Error('Failed to generate tokens')
      alert('Tokens generated! Refresh to see updated list.')
      fetchCampaignData()
    } catch (error) {
      console.error('Error generating tokens:', error)
      alert('Failed to generate tokens')
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-2 mb-6">Campaign not found</p>
        <Link
          href="/admin/campaigns"
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary inline-block"
        >
          Back to Campaigns
        </Link>
      </div>
    )
  }

  const attending = rsvps.filter(r => r.attending_luncheon === true)
  const notAttending = rsvps.filter(r => r.attending_luncheon === false)

  return (
    <div className="min-h-screen overflow-y-auto pb-20">
      <div className="mb-8">
        <Link
          href="/admin/campaigns"
          className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block"
        >
          ← Back to Campaigns
        </Link>

        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-semibold tracking-wide">{campaign.name}</h2>
          <Link
            href={`/admin/campaigns/builder?id=${params.id}`}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary"
          >
            Edit Campaign Design
          </Link>
        </div>

        {/* Deadline Editor */}
        <div className="mb-4">
          {!editingDeadline ? (
            <div className="flex items-center gap-3">
              <p className="text-luxury-gray-2">
                Deadline:{' '}
                {new Date(campaign.deadline).toLocaleString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </p>
              <button
                onClick={() => setEditingDeadline(true)}
                className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-secondary"
              >
                Edit Deadline
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="datetime-local"
                value={newDeadline}
                onChange={e => setNewDeadline(e.target.value)}
                className="input-luxury"
              />
              <button
                onClick={saveDeadline}
                disabled={savingDeadline}
                className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingDeadline ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingDeadline(false)
                  if (campaign.deadline) {
                    const deadlineDate = new Date(campaign.deadline)
                    const localDateTime = new Date(
                      deadlineDate.getTime() - deadlineDate.getTimezoneOffset() * 60000
                    )
                    setNewDeadline(localDateTime.toISOString().slice(0, 16))
                  }
                }}
                disabled={savingDeadline}
                className="px-3 py-1.5 text-xs rounded transition-colors text-center btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4 flex-wrap">
          <button
            onClick={() => {
              window.open(`/api/campaigns/${params.id}/export-pdf`, '_blank')
            }}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-accent text-white hover:opacity-90"
          >
            📄 Export PDF Report
          </button>

          <button
            onClick={async () => {
              if (!confirm('Duplicate this campaign for next year?')) return

              try {
                const response = await fetch('/api/campaign/duplicate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ campaign_id: params.id }),
                })

                const data = await response.json()
                if (!response.ok) throw new Error(data.error)

                alert(data.message)
                window.location.href = `/admin/campaigns/${data.campaign.id}`
              } catch (error: any) {
                alert(error.message || 'Failed to duplicate campaign')
              }
            }}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary"
          >
            📋 Duplicate for Next Year
          </button>

          <button
            onClick={async () => {
              if (
                !confirm(
                  'Are you sure you want to delete this campaign? This action cannot be undone.'
                )
              )
                return

              setDeleting(true)
              try {
                const response = await fetch(`/api/campaigns/${params.id}`, {
                  method: 'DELETE',
                })

                const data = await response.json()
                if (!response.ok) throw new Error(data.error || 'Failed to delete campaign')

                alert('Campaign deleted successfully')
                router.push('/admin/campaigns')
              } catch (error: any) {
                alert(error.message || 'Failed to delete campaign')
              } finally {
                setDeleting(false)
              }
            }}
            disabled={deleting}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : '🗑️ Delete Campaign'}
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid md:grid-cols-5 gap-4 mb-8">
          <div className="container-card text-center">
            <p className="text-xs text-luxury-gray-2 mb-1">Total Recipients</p>
            <p className="text-3xl font-light text-luxury-accent">{stats.total_recipients || 0}</p>
          </div>
          <div className="container-card text-center">
            <p className="text-xs text-luxury-gray-2 mb-1">Fully Completed</p>
            <p className="text-3xl font-light text-luxury-accent">{stats.fully_complete || 0}</p>
          </div>
          <div className="container-card text-center">
            <p className="text-xs text-luxury-gray-2 mb-1">In Progress</p>
            <p className="text-3xl font-light text-luxury-accent">
              {(stats.total_recipients || 0) - (stats.fully_complete || 0)}
            </p>
          </div>
          <div className="container-card text-center">
            <p className="text-xs text-luxury-gray-2 mb-1">Attending Luncheon</p>
            <p className="text-3xl font-light text-luxury-accent">{attending.length}</p>
          </div>
          <div className="container-card text-center">
            <p className="text-xs text-luxury-gray-2 mb-1">Not Attending</p>
            <p className="text-3xl font-light text-luxury-accent">{notAttending.length}</p>
          </div>
        </div>
      )}

      {/* Event Staff Email & RSVP Sender */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">Send RSVP List to Event Staff</h3>
        <div className="flex gap-4">
          <input
            type="email"
            value={eventStaffEmail}
            onChange={e => setEventStaffEmail(e.target.value)}
            placeholder="event@venue.com"
            className="input-luxury flex-1"
          />
          <button
            onClick={saveEventStaffEmail}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary"
          >
            Save Email
          </button>
          <button
            onClick={sendRsvpList}
            disabled={sendingRsvp || !eventStaffEmail}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingRsvp ? 'Sending...' : 'Send RSVP List'}
          </button>
        </div>
        <p className="text-xs text-luxury-gray-2 mt-2">
          This will email the complete RSVP list with headcount and dietary restrictions
        </p>
      </div>

      {/* Send Campaign Emails */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">Send Campaign Emails</h3>
        <div className="space-y-4">
          <p className="text-sm text-luxury-gray-2">
            Preview, edit, and send personalized campaign emails to agents
          </p>
          <button
            onClick={() => setEmailModalOpen(true)}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary"
          >
            Preview & Send Emails
          </button>
          {campaign.sent_at && (
            <p className="text-xs text-luxury-gray-2">
              Last sent: {new Date(campaign.sent_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Email Modal */}
      {emailModalOpen && (
        <CampaignEmailModal
          campaign={campaign}
          onClose={() => setEmailModalOpen(false)}
          onSend={async (
            templateId,
            recipientFilter,
            customHtml,
            customSubject,
            individualAgentId
          ) => {
            try {
              const response = await fetch('/api/campaign/send-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  campaign_id: params.id,
                  recipient_filter: recipientFilter,
                  template_id: templateId || null,
                  custom_html: customHtml || null,
                  custom_subject: customSubject || null,
                  individual_agent_id: individualAgentId || null,
                }),
              })

              const data = await response.json()
              if (!response.ok) throw new Error(data.error || 'Failed to send emails')

              alert(data.message)
              fetchCampaignData()
            } catch (error: any) {
              alert(error.message || 'Failed to send emails')
              throw error
            }
          }}
        />
      )}

      {/* Token Generator */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">Campaign Tokens</h3>
        <button
          onClick={generateTokens}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary"
        >
          Generate Tokens for All Active Agents
        </button>
        <p className="text-xs text-luxury-gray-2 mt-2">
          This will create unique campaign links for agents who don't have tokens yet
        </p>
      </div>

      {/* Migrate Profile Updates */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">Migrate Profile Updates</h3>
        <p className="text-sm text-luxury-gray-2 mb-4">
          If profile updates from this campaign failed to sync to user profiles, use this to push
          them from campaign_responses to the users table.
        </p>
        <button
          onClick={async () => {
            if (
              !confirm(
                `This will migrate all profile updates from this campaign's responses to the users table. Continue?`
              )
            ) {
              return
            }

            setMigrating(true)
            setMigrationResult(null)

            try {
              const response = await fetch('/api/campaign/migrate-profile-updates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaign_id: params.id }),
              })

              const data = await response.json()

              if (!response.ok) {
                throw new Error(data.error || 'Migration failed')
              }

              setMigrationResult(data)
              alert(
                `Migration complete!\n\nUpdated: ${data.results.updated}\nSkipped: ${data.results.skipped}\nErrors: ${data.results.errors.length}`
              )
              fetchCampaignData()
            } catch (error: any) {
              console.error('Migration error:', error)
              alert(`Migration failed: ${error.message}`)
              setMigrationResult({ error: error.message })
            } finally {
              setMigrating(false)
            }
          }}
          disabled={migrating}
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-gray-2 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {migrating ? 'Migrating...' : 'Migrate Profile Updates for This Campaign'}
        </button>

        {migrationResult && (
          <div
            className={`mt-4 p-4 rounded ${migrationResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
          >
            <h4 className="text-sm font-medium mb-2">
              {migrationResult.error ? 'Migration Error' : 'Migration Results'}
            </h4>
            {migrationResult.error ? (
              <p className="text-sm text-red-600">{migrationResult.error}</p>
            ) : (
              <div className="text-sm text-luxury-gray-2">
                <p><strong>Total:</strong> {migrationResult.results.total}</p>
                <p><strong>Updated:</strong> {migrationResult.results.updated}</p>
                <p><strong>Skipped:</strong> {migrationResult.results.skipped}</p>
                {migrationResult.results.errors.length > 0 && (
                  <div className="mt-2">
                    <p><strong>Errors:</strong></p>
                    <ul className="list-disc list-inside text-xs">
                      {migrationResult.results.errors.map((err: any, idx: number) => (
                        <li key={idx}>{err.user_id}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent Progress List */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">
          Agent Progress ({agents.length} agents)
        </h3>

        {agents.length === 0 ? (
          <p className="text-luxury-gray-2 text-center py-8">No active agents found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-luxury-gray-5">
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Agent</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Progress</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Commission Plan</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Luncheon RSVP</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => {
                  const recipient = agent.campaign_recipients?.[0]
                  const response = agent.campaign_responses?.[0]
                  const progress = recipient?.current_step || 0
                  const isComplete = recipient?.fully_completed_at
                  const hasStarted = !!recipient

                  return (
                    <tr key={agent.id} className="border-b border-luxury-gray-5 hover:bg-luxury-light">
                      <td className="py-4 px-4">
                        <p className="font-medium">
                          {agent.preferred_first_name} {agent.preferred_last_name}
                        </p>
                        <p className="text-sm text-luxury-gray-2">{agent.email}</p>
                      </td>
                      <td className="py-4 px-4">
                        {hasStarted ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-luxury-gray-5 rounded">
                              <div
                                className={`h-full rounded ${isComplete ? 'bg-green-500' : 'bg-luxury-accent'}`}
                                style={{ width: `${isComplete ? '100%' : `${(progress / 4) * 100}%`}` }}
                              />
                            </div>
                            <span className="text-sm">
                              {isComplete ? '✓ Complete' : `Step ${progress}/4`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-luxury-gray-3">Not Started</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-sm">
                        {response?.commission_plan_2026 ||
                          (agent.commission_plan
                            ? agent.commission_plan
                                .split('_')
                                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ')
                            : '-')}
                      </td>
                      <td className="py-4 px-4">
                        {response?.attending_luncheon === true && (
                          <span className="text-sm text-green-600">✓ Attending</span>
                        )}
                        {response?.attending_luncheon === false && (
                          <span className="text-sm text-luxury-gray-3">Not Attending</span>
                        )}
                        {response?.attending_luncheon === null && (
                          <span className="text-sm text-luxury-gray-3">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-2">
                          {agent.campaign_token ? (
                            <button
                              onClick={() => {
                                const link = `${window.location.origin}/campaign/${campaign.slug}?token=${agent.campaign_token}`
                                navigator.clipboard.writeText(link)
                                alert('Link copied to clipboard!')
                              }}
                              className="text-sm text-luxury-black hover:underline"
                            >
                              Copy Link
                            </button>
                          ) : (
                            <span className="text-sm text-luxury-gray-3">No token</span>
                          )}
                          <button
                            onClick={() => {
                              setSelectedAgent(agent)
                              setResponseModalOpen(true)
                            }}
                            className="text-sm px-3 py-1 rounded transition-colors text-center btn-primary"
                          >
                            View Responses
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RSVP Details */}
      <div className="container-card mb-8">
        <h3 className="text-lg font-medium mb-4 tracking-wide">
          Luncheon RSVPs ({attending.length} attending)
        </h3>

        {attending.length === 0 ? (
          <p className="text-luxury-gray-2 text-center py-8">No RSVPs yet</p>
        ) : (
          <div className="space-y-4">
            {attending.map(rsvp => (
              <div key={rsvp.id} className="border-l-4 border-luxury-gold pl-4 py-2">
                <p className="font-medium">
                  {rsvp.users.preferred_first_name} {rsvp.users.preferred_last_name}
                </p>
                {rsvp.luncheon_comments && (
                  <p className="text-sm text-luxury-gray-2 mt-1">"{rsvp.luncheon_comments}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feedback Survey Summary */}
      <div className="container-card">
        <h3 className="text-lg font-medium mb-4 tracking-wide">
          Feedback Survey Summary ({surveys.length} responses)
        </h3>

        {surveys.length === 0 ? (
          <p className="text-luxury-gray-2 text-center py-8">No survey responses yet</p>
        ) : (
          <div className="space-y-6">
            {/* Average Support Rating */}
            {surveys.some(s => s.support_rating) && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-luxury-gray-2">Average Support Rating</h4>
                <div className="flex items-center gap-3">
                  <div className="w-48 h-3 bg-luxury-gray-5 rounded">
                    <div
                      className="h-full bg-luxury-accent rounded"
                      style={{
                        width: `${(surveys.reduce((sum, s) => sum + (s.support_rating || 0), 0) / surveys.length / 10) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-lg font-medium">
                    {(surveys.reduce((sum, s) => sum + (s.support_rating || 0), 0) / surveys.length).toFixed(1)}/10
                  </span>
                </div>
              </div>
            )}

            {/* Work Preference Breakdown */}
            {surveys.some(s => s.work_preference) && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-luxury-gray-2">Work Preference</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="border-l-4 border-luxury-gold pl-3 py-2">
                    <p className="text-sm font-medium">Team</p>
                    <p className="text-2xl font-light text-luxury-accent">
                      {surveys.filter(s => s.work_preference === 'team').length}
                    </p>
                  </div>
                  <div className="border-l-4 border-luxury-gold pl-3 py-2">
                    <p className="text-sm font-medium">Independent</p>
                    <p className="text-2xl font-light text-luxury-accent">
                      {surveys.filter(s => s.work_preference === 'independent').length}
                    </p>
                  </div>
                  <div className="border-l-4 border-luxury-gold pl-3 py-2">
                    <p className="text-sm font-medium">Not Sure</p>
                    <p className="text-2xl font-light text-luxury-accent">
                      {surveys.filter(s => s.work_preference === 'not_sure').length}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Support Improvements */}
            {surveys.some(s => s.support_improvements) && (
              <div>
                <h4 className="text-sm font-medium mb-3 text-luxury-gray-2">Support Improvement Suggestions</h4>
                <div className="space-y-3">
                  {surveys
                    .filter(s => s.support_improvements)
                    .map(survey => (
                      <div key={survey.id} className="border-l-4 border-luxury-gold pl-4 py-2">
                        <p className="font-medium text-sm">
                          {survey.users.preferred_first_name} {survey.users.preferred_last_name}
                        </p>
                        <p className="text-sm text-luxury-gray-2 mt-1">"{survey.support_improvements}"</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent Response Modal */}
      {responseModalOpen && selectedAgent && (
        <AgentCampaignResponseModal
          agent={selectedAgent}
          campaignResponse={selectedAgent.campaign_responses?.[0]}
          onClose={() => {
            setResponseModalOpen(false)
            setSelectedAgent(null)
          }}
        />
      )}
    </div>
  )
}