'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { LEAD_SOURCES, LEAD_SOURCES_REQUIRING_AGENT } from '@/lib/transactions/constants'
import InlineField from './InlineField'

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

/**
 * LeadSourceField combines:
 *   1. The main lead source dropdown (inline-edit)
 *   2. A secondary "Referred by" agent picker that ONLY appears when
 *      lead_source === 'internal_agent_referral'. Required (blocks save).
 *
 * Save flow:
 *   - When user picks a non-internal lead source, we call onSave immediately
 *     with { lead_source, referred_agent_id: null }.
 *   - When user picks internal_agent_referral, we keep lead_source in local
 *     state until they ALSO pick an agent, then we call onSave with both.
 *   - When the user edits the agent on an already-internal record, onSave
 *     fires immediately with the new agent.
 */
export default function LeadSourceField({
  leadSource,
  referredAgentId,
  locked,
  onSave,
  excludeAgentId,
}: {
  leadSource: string | null | undefined
  referredAgentId: string | null | undefined
  locked?: boolean
  onSave: (v: { lead_source: string; referred_agent_id: string | null }) => Promise<void> | void
  excludeAgentId?: string | null
}) {
  const [pendingLeadSource, setPendingLeadSource] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement | null>(null)

  const effectiveLeadSource = pendingLeadSource ?? leadSource ?? ''
  const needsAgent = LEAD_SOURCES_REQUIRING_AGENT.has(effectiveLeadSource)
  const missingAgent = needsAgent && !referredAgentId && !pendingLeadSource

  useEffect(() => {
    if (showPicker && users.length === 0) {
      fetch('/api/admin/users?active=true', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setUsers(d.users || []))
        .catch(() => {})
    }
  }, [showPicker, users.length])

  useEffect(() => {
    if (!showPicker) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [showPicker])

  const label =
    LEAD_SOURCES.find((s) => s.value === effectiveLeadSource)?.label || 'Select...'

  const handleLeadSourceChange = async (newValue: string) => {
    if (LEAD_SOURCES_REQUIRING_AGENT.has(newValue)) {
      setPendingLeadSource(newValue)
      setShowPicker(true)
    } else {
      setPendingLeadSource(null)
      await onSave({ lead_source: newValue, referred_agent_id: null })
    }
  }

  const handleAgentPick = async (userId: string) => {
    const source = pendingLeadSource ?? effectiveLeadSource
    setPendingLeadSource(null)
    setShowPicker(false)
    setSearch('')
    await onSave({ lead_source: source, referred_agent_id: userId })
  }

  const currentAgent = users.find((u) => u.id === referredAgentId)
  const filteredUsers = users
    .filter((u) => u.id !== excludeAgentId)
    .filter((u) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (fmtName(u) || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
    })
    .slice(0, 20)

  return (
    <div className="text-right">
      <InlineField
        value={effectiveLeadSource || ''}
        displayValue={label}
        type="select"
        options={LEAD_SOURCES}
        onSave={handleLeadSourceChange}
        locked={locked}
        invalid={missingAgent}
        placeholder="Select..."
        width="240px"
      />
      {needsAgent && !locked && (
        <div className="mt-1 relative" style={{ display: 'inline-block' }} ref={pickerRef}>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="text-xs"
            style={{
              borderBottom: `1px dashed ${missingAgent ? '#b91c1c' : '#C5A278'}`,
              paddingBottom: '1px',
              background: 'transparent',
              border: 'none',
              borderBottomWidth: '1px',
              borderBottomStyle: 'dashed',
              borderBottomColor: missingAgent ? '#b91c1c' : '#C5A278',
              fontFamily: 'inherit',
              color: missingAgent ? '#b91c1c' : '#333333',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {currentAgent
              ? `↳ ${fmtName(currentAgent)}`
              : '↳ Required: select agent'}
          </button>

          {showPicker && (
            <div
              className="absolute right-0 mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg z-20"
              style={{ width: '280px', maxHeight: '320px' }}
            >
              <div className="p-2 border-b border-luxury-gray-5">
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-luxury-gray-3"
                  />
                  <input
                    type="text"
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search agents..."
                    className="input-luxury text-xs w-full"
                    style={{ paddingLeft: '26px' }}
                  />
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">
                    No matches
                  </p>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAgentPick(u.id)}
                      className="w-full text-left px-3 py-2 hover:bg-luxury-light border-b border-luxury-gray-5/50 last:border-0"
                    >
                      <p className="text-xs text-luxury-gray-1 font-medium">
                        {fmtName(u)}
                      </p>
                      <p className="text-xs text-luxury-gray-3">
                        {u.email || u.office_email || ''}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {missingAgent && !locked && (
        <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>
          Internal referrals need the referring agent on file.
        </p>
      )}
    </div>
  )
}
