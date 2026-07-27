'use client'

/**
 * Agent Email Dashboard, shared UI pieces used by all three screens
 * (Triage, My Work, Oversight) and the templates manager.
 */

import { X } from 'lucide-react'

export type StatusKey = 'new' | 'in_progress' | 'waiting_on_agent' | 'waiting_on_admin' | 'closed'
export type ScreenKey = 'triage' | 'my_work' | 'oversight'

export interface Admin {
  id: string
  email: string
  name: string
  role: string | null
}

export interface ThreadListItem {
  id: string
  subject: string | null
  status: StatusKey
  last_message_at: string | null
  last_message_direction: 'inbound' | 'outbound' | null
  updated_at: string | null
  created_at: string | null
  agent: { id: string; email: string; name: string; role: string | null } | null
  assignee: { id: string; name: string; email: string } | null
  waiting_on: { id: string; name: string; email: string } | null
  snippet: string
}

export interface AiSuggestion {
  threadId: string
  summary: string | null
  suggestedTag: string | null
  tagConfidence: 'high' | 'medium' | 'low' | null
  suggestedAssigneeUserId: string | null
  suggestedAssigneeName: string | null
  assigneeConfidence: 'high' | 'medium' | 'low' | null
  assigneeReason: string | null
  generatedAt: string
  stale: boolean
}

export interface Template {
  id: string
  name: string
  subject_line: string
  html_content: string
  description?: string | null
  created_at?: string
}

export const STATUS_META: Record<
  StatusKey,
  { label: string; pillClass: string; dotClass: string; help: string }
> = {
  new: {
    label: 'New',
    pillClass: 'bg-blue-50 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
    help: 'Not yet worked. Nobody has picked it up.',
  },
  in_progress: {
    label: 'In progress',
    pillClass: 'bg-teal-50 text-teal-800 border-teal-200',
    dotClass: 'bg-teal-500',
    help: 'Being worked on by the assignee.',
  },
  waiting_on_agent: {
    label: 'Waiting on agent',
    pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
    help: 'We replied, waiting for the agent to respond.',
  },
  waiting_on_admin: {
    label: 'Waiting on admin',
    pillClass: 'bg-purple-50 text-purple-800 border-purple-200',
    dotClass: 'bg-purple-500',
    help: 'Escalated. Waiting on the picked admin to weigh in.',
  },
  closed: {
    label: 'Closed',
    pillClass: 'bg-luxury-gray-5 text-luxury-gray-2 border-luxury-gray-4',
    dotClass: 'bg-luxury-gray-3',
    help: 'Resolved. Will auto-reopen if the agent replies again.',
  },
}

// ─── Aging ────────────────────────────────────────────────────────────────

export type AgingLevel = 'fresh' | 'aging' | 'stale'

export function agingLevel(iso: string | null): AgingLevel {
  if (!iso) return 'fresh'
  const hours = (Date.now() - new Date(iso).getTime()) / 3600_000
  if (hours > 48) return 'stale'
  if (hours > 24) return 'aging'
  return 'fresh'
}

export function AgingDot({ iso }: { iso: string | null }) {
  const level = agingLevel(iso)
  if (level === 'fresh') return null
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
        level === 'stale' ? 'bg-red-500' : 'bg-amber-400'
      }`}
      title={level === 'stale' ? 'No activity for over 48 hours' : 'No activity for over 24 hours'}
    />
  )
}

export function ConfidenceDot({ level }: { level: 'high' | 'medium' | 'low' | null }) {
  if (!level) return null
  const cls =
    level === 'high' ? 'bg-teal-500' : level === 'medium' ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${cls}`}
      title={`AI confidence: ${level}`}
    />
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────

export function Modal({
  onClose,
  title,
  children,
  wide,
  accent,
}: {
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
  accent?: 'gold'
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black bg-opacity-30 flex items-start justify-center overflow-y-auto p-4">
      <div
        className={`bg-white rounded-xl border border-luxury-gray-4 shadow-xl mt-16 w-full ${
          wide ? 'max-w-[720px]' : 'max-w-[540px]'
        }`}
      >
        <div
          className={`px-5 py-4 flex items-center justify-between border-b border-luxury-gray-4 ${
            accent === 'gold' ? 'border-t-4 border-t-[#C5A278] rounded-t-xl' : ''
          }`}
        >
          <h2 className="text-[16px] font-medium text-luxury-gray-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-gray-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────

export function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatFull(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n.toFixed(0)}`
}

export function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export function htmlToPlain(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
