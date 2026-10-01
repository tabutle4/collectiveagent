'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'
import {
  FLAG_HELP,
  FLAG_LABELS,
  FLAG_ORDER,
  money,
  type FlagKey,
} from '@/lib/reporting/quarterlyReconciliation'
import { DEFAULT_QUARTER_INDEX, quarterOptions, type QuarterOption } from '@/lib/reporting/quarters'

interface ReconFlag {
  key: FlagKey
  detail: string
}

interface Note {
  note: string
  author_name: string | null
  created_at: string
}

interface Row {
  transaction_id: string
  property_address: string
  unit: string | null
  is_lease: boolean
  production_date: string | null
  agents: { id: string; name: string; roles: string[] }[]
  volume: number
  units: number
  agentNet: number
  teamId: string | null
  teamName: string | null
  legacyImport: boolean
  flags: ReconFlag[]
  notes: Note[]
}

interface NearMiss {
  transaction_id: string
  property_address: string
  unit: string | null
  is_lease: boolean
  production_date: string | null
  reason: string
}

interface Payload {
  quarter: { year: number; quarter: number; startDate: string; endDate: string }
  rows: Row[]
  counts: Record<FlagKey, number>
  totals: { deals: number; flagged: number; volume: number; units: number }
  nearMisses: NearMiss[]
  teams: { id: string; name: string }[]
}

/** The year and quarter a shared link is asking for, if it names a real one. */
function quarterFromUrl(): { year: number; quarter: number } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const year = parseInt(params.get('year') || '')
  const quarter = parseInt(params.get('quarter') || '')
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null
  return { year, quarter }
}

export default function QuarterlyReconciliationPage() {
  const { hasPermission } = useAuth()
  const canNote = hasPermission('can_manage_quarterly_reconciliation')

  // The quarter lives in the URL so a link to this page carries the quarter the
  // sender was looking at. A link to a quarter older than the eight on offer
  // gets that quarter added rather than being snapped to today, which would
  // show the recipient different deals from the ones the sender was discussing.
  //
  // The URL is read in an effect, not in the initial state, because this
  // component is server rendered first and window does not exist there. Reading
  // it during the first render makes the server and the browser disagree about
  // which quarter is selected, and React keeps the server's answer - so a
  // shared link to Q1 could quietly open on Q3 and the two people would discuss
  // different deals. Every other deep link in this app reads the URL in an
  // effect for the same reason. urlRead gates the first fetch so we do not load
  // the default quarter and then immediately load the asked-for one.
  const [quarters, setQuarters] = useState<QuarterOption[]>(() => quarterOptions())
  const [selected, setSelected] = useState(DEFAULT_QUARTER_INDEX)
  const [urlRead, setUrlRead] = useState(false)

  useEffect(() => {
    const asked = quarterFromUrl()
    if (asked) {
      setQuarters(prev => {
        const i = prev.findIndex(q => q.year === asked.year && q.quarter === asked.quarter)
        if (i >= 0) {
          setSelected(i)
          return prev
        }
        setSelected(0)
        return [{ year: asked.year, quarter: asked.quarter, label: `Q${asked.quarter} ${asked.year}` }, ...prev]
      })
    }
    setUrlRead(true)
  }, [])
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flagFilter, setFlagFilter] = useState<FlagKey | 'all' | 'clean'>('all')
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set())
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set())
  const [nearCollapsed, setNearCollapsed] = useState(true)
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  const load = useCallback(async () => {
    const q = quarters[selected]
    if (!q || !urlRead) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/reports/quarterly-reconciliation?year=${q.year}&quarter=${q.quarter}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not load the report')
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [quarters, selected, urlRead])

  // Flags are recomputed server side on every load, so opening the page after
  // fixing a deal is all it takes for that deal to drop off.
  useEffect(() => {
    load()
  }, [load])

  // Keep the address bar on the quarter being viewed, so it is always
  // copyable. replaceState rather than push: stepping through quarters should
  // not fill the back button with them.
  useEffect(() => {
    const q = quarters[selected]
    if (!q || !urlRead) return
    window.history.replaceState(null, '', `?year=${q.year}&quarter=${q.quarter}`)
  }, [quarters, selected, urlRead])

  const agents = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of data?.rows || []) {
      for (const a of row.agents) map.set(a.id, a.name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data])

  const toggleIn = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    value: string
  ) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  const visible = useMemo(() => {
    let list = data?.rows || []
    if (flagFilter === 'clean') list = list.filter(r => r.flags.length === 0)
    else if (flagFilter !== 'all') list = list.filter(r => r.flags.some(f => f.key === flagFilter))
    if (agentFilter.size > 0) {
      list = list.filter(r => r.agents.some(a => agentFilter.has(a.id)))
    }
    if (teamFilter.size > 0) {
      list = list.filter(r => !!r.teamId && teamFilter.has(r.teamId))
    }
    return list
  }, [data, flagFilter, agentFilter, teamFilter])

  const saveNote = async (transactionId: string) => {
    const text = noteText.trim()
    if (!text) return
    setNoteBusy(true)
    try {
      const res = await fetch('/api/admin/reports/quarterly-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, note: text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save the note')
      }
      setNoteText('')
      setNoteOpen(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setNoteBusy(false)
    }
  }

  const cleanCount = (data?.totals.deals || 0) - (data?.totals.flagged || 0)

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/reports" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="page-title">QUARTERLY RECONCILIATION</h1>
            <p className="text-luxury-gray-3 mt-2">
              Every deal on the quarterly report, and what is wrong with it
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={e => setSelected(parseInt(e.target.value))}
            className="select-luxury text-xs py-1.5"
          >
            {quarters.map((q, i) => (
              <option key={`${q.year}-${q.quarter}`} value={i}>
                {q.label}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="container-card mb-6 border-l-4 border-l-red-500">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="container-card">
          <p className="text-xs text-luxury-gray-3 text-center py-6">Loading the quarter...</p>
        </div>
      ) : !data ? null : (
        <>
          <div className="container-card mb-5">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
              <span className="text-luxury-gray-3">
                Deals on the report:{' '}
                <span className="font-semibold text-luxury-gray-1">{data.totals.deals}</span>
              </span>
              <span className="text-luxury-gray-3">
                Flagged:{' '}
                <span className="font-semibold text-luxury-gray-1">{data.totals.flagged}</span>
              </span>
              <span className="text-luxury-gray-3">
                Volume:{' '}
                <span className="font-semibold text-luxury-gray-1">{money(data.totals.volume)}</span>
              </span>
              <span className="text-luxury-gray-3">
                Units:{' '}
                <span className="font-semibold text-luxury-gray-1">{data.totals.units}</span>
              </span>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <button
              onClick={() => setFlagFilter('all')}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                flagFilter === 'all'
                  ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                  : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-3'
              }`}
            >
              All ({data.totals.deals})
            </button>
            {FLAG_ORDER.map(key => (
              <button
                key={key}
                onClick={() => setFlagFilter(key)}
                title={FLAG_HELP[key]}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  flagFilter === key
                    ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                    : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-3'
                }`}
              >
                {FLAG_LABELS[key]} ({data.counts[key] || 0})
              </button>
            ))}
            <button
              onClick={() => setFlagFilter('clean')}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                flagFilter === 'clean'
                  ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                  : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-3'
              }`}
            >
              Nothing wrong ({cleanCount})
            </button>
            <select
              value=""
              onChange={e => { if (e.target.value) toggleIn(agentFilter, setAgentFilter, e.target.value) }}
              className="select-luxury text-xs py-1.5"
            >
              <option value="">All Agents</option>
              {agents.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {(data.teams || []).length > 0 && (
              <select
                value=""
                onChange={e => { if (e.target.value) toggleIn(teamFilter, setTeamFilter, e.target.value) }}
                className="select-luxury text-xs py-1.5"
              >
                <option value="">All Teams</option>
                {(data.teams || []).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {(agentFilter.size > 0 || teamFilter.size > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {[...agentFilter].map(id => (
                <button
                  key={id}
                  onClick={() => toggleIn(agentFilter, setAgentFilter, id)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-luxury-gray-1 text-white border-luxury-gray-1"
                  title={`Remove ${agents.find(a => a[0] === id)?.[1] || id}`}
                  aria-label={`Remove ${agents.find(a => a[0] === id)?.[1] || id}`}
                >
                  {agents.find(a => a[0] === id)?.[1] || id}
                  <X size={10} />
                </button>
              ))}
              {[...teamFilter].map(id => (
                <button
                  key={id}
                  onClick={() => toggleIn(teamFilter, setTeamFilter, id)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-luxury-gray-1 text-white border-luxury-gray-1"
                  title={`Remove ${(data.teams || []).find(t => t.id === id)?.name || id}`}
                  aria-label={`Remove ${(data.teams || []).find(t => t.id === id)?.name || id}`}
                >
                  {(data.teams || []).find(t => t.id === id)?.name || id}
                  <X size={10} />
                </button>
              ))}
            </div>
          )}

          {flagFilter !== 'all' && flagFilter !== 'clean' && (
            <p className="text-xs text-luxury-gray-3 mb-4">{FLAG_HELP[flagFilter]}</p>
          )}

          <div className="container-card mb-5">
            {visible.length === 0 ? (
              <p className="text-xs text-luxury-gray-3 text-center py-6">
                No deals match this filter.
              </p>
            ) : (
              <div className="divide-y divide-luxury-gray-5">
                {visible.map(row => (
                  <div key={row.transaction_id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {row.flags.length === 0 ? (
                            <CheckCircle2 size={13} className="text-green-600 flex-shrink-0" />
                          ) : (
                            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-luxury-gray-1">
                            {row.property_address}
                            {row.unit ? `, Unit ${row.unit}` : ''}
                          </span>
                        </div>
                        <span className="block text-xs text-luxury-gray-3 mt-1">
                          {[
                            row.is_lease ? 'Lease' : 'Sale',
                            row.production_date,
                            row.teamName,
                            row.agents
                              .map(a => `${a.name} (${a.roles.join(', ').replace(/_/g, ' ')})`)
                              .join(', '),
                            `${money(row.volume)} volume`,
                            `${row.units} unit${row.units === 1 ? '' : 's'}`,
                            `${money(row.agentNet)} agent net (retainers counted separately)`,
                            row.legacyImport ? 'imported, money checks skipped' : null,
                          ]
                            .filter(Boolean)
                            .join(' - ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {canNote && (
                          <button
                            onClick={() => {
                              setNoteOpen(noteOpen === row.transaction_id ? null : row.transaction_id)
                              setNoteText('')
                            }}
                            className="inline-flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1"
                          >
                            <MessageSquare size={11} /> Note
                          </button>
                        )}
                        <a
                          href={`/admin/transactions/${row.transaction_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline whitespace-nowrap"
                        >
                          Work Deal <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>

                    {row.flags.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {row.flags.map((f, i) => (
                          <li key={`${f.key}-${i}`} className="text-xs text-luxury-gray-2">
                            <span className="font-semibold text-luxury-gray-1">
                              {FLAG_LABELS[f.key]}:
                            </span>{' '}
                            {f.detail}
                          </li>
                        ))}
                      </ul>
                    )}

                    {row.notes.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {row.notes.map((n, i) => (
                          <li key={i} className="text-xs text-luxury-gray-3">
                            <MessageSquare size={10} className="inline-block mr-1" />
                            {n.note}
                            {n.author_name ? ` - ${n.author_name}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}

                    {noteOpen === row.transaction_id && (
                      <div className="mt-3 flex items-center gap-2 max-w-xl">
                        <input
                          type="text"
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="What did you find on this deal?"
                          className="input-luxury text-xs py-1.5 w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => saveNote(row.transaction_id)}
                          disabled={noteBusy || !noteText.trim()}
                          className="btn btn-primary text-xs whitespace-nowrap disabled:opacity-50"
                        >
                          {noteBusy ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="container-card">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => setNearCollapsed(v => !v)}
            >
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
                  Did not make the report
                </p>
                <span className="text-xs text-luxury-gray-3">({data.nearMisses.length})</span>
              </div>
              {nearCollapsed ? (
                <ChevronDown size={14} className="text-luxury-gray-3" />
              ) : (
                <ChevronUp size={14} className="text-luxury-gray-3" />
              )}
            </button>

            {!nearCollapsed && (
              <div className="mt-4">
                <p className="text-xs text-luxury-gray-3 mb-3">
                  Deals with a date inside this quarter that the report does not count. A deal
                  wrongly excluded is the one error checking the rows above can never find.
                </p>
                {data.nearMisses.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">
                    Every deal in this quarter counts.
                  </p>
                ) : (
                  <div className="divide-y divide-luxury-gray-5">
                    {data.nearMisses.map(m => (
                      <div
                        key={m.transaction_id}
                        className="py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="block text-xs text-luxury-gray-1 truncate">
                            {m.property_address}
                            {m.unit ? `, Unit ${m.unit}` : ''}
                          </span>
                          <span className="block text-xs text-luxury-gray-3">
                            {[m.is_lease ? 'Lease' : 'Sale', m.production_date, m.reason]
                              .filter(Boolean)
                              .join(' - ')}
                          </span>
                        </div>
                        <a
                          href={`/admin/transactions/${m.transaction_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline whitespace-nowrap flex-shrink-0"
                        >
                          Work Deal <ExternalLink size={11} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
