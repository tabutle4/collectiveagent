/**
 * Agent Email Dashboard , shared types, constants, and helpers.
 *
 * PHASE 1 scope: read-side. This module owns:
 *   - Status / view / role constants
 *   - Admin discovery (who gets a subscription, who appears in pickers)
 *   - Active agent lookup (who counts as an "active agent" sender)
 *   - Reading A filter (sender is active agent + at least one admin on To/CC)
 *   - Thread find-or-create logic used by the webhook processor
 *
 * PHASE 2 will add reply, assign/escalate, notes/tags, templates, viewers.
 */

import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { RoleName } from '@/lib/constants'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Statuses match the CHECK constraint on email_threads.status. */
export type ThreadStatus =
  | 'new'
  | 'in_progress'
  | 'waiting_on_agent'
  | 'waiting_on_admin'
  | 'closed'

export const THREAD_STATUSES: ThreadStatus[] = [
  'new',
  'in_progress',
  'waiting_on_agent',
  'waiting_on_admin',
  'closed',
]

/** Two views available to every dashboard user. */
export type ThreadView = 'my' | 'all'

/**
 * Roles that receive a mailbox subscription, appear in the assign/escalate
 * picker, and can log in to the dashboard. Kept in sync with ADMIN_ROLES
 * in lib/constants.ts by design , this constant exists to make the intent
 * "admin for the email dashboard" explicit rather than reusing ADMIN_ROLES
 * directly (which is also used for generic role gating and could drift).
 */
export const AGENT_EMAIL_ADMIN_ROLES: RoleName[] = [
  'broker',
  'operations',
  'tc',
  'support',
]

/**
 * Agent roles whose email counts as an "active agent" sender. Referral
 * agents are included per the plan discussion.
 */
export const AGENT_ROLES: string[] = ['agent', 'referral']

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  preferred_first_name: string | null
  preferred_last_name: string | null
  role: string
  is_active: boolean
  status: string
}

export interface AgentUserRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  preferred_first_name: string | null
  preferred_last_name: string | null
  role: string
  is_active: boolean
  status: string
}

export interface FindOrCreateThreadInput {
  agentUserId: string
  graphConversationId: string | null
  firstInternetMessageId: string | null
  subject: string | null
  receivedAt: string
}

export interface FindOrCreateThreadResult {
  threadId: string
  status: ThreadStatus
  wasCreated: boolean
  wasReopened: boolean
}

// ─── Admin discovery ────────────────────────────────────────────────────────

/**
 * Fetch every user who counts as an admin for the email dashboard.
 * "Admin" = role in AGENT_EMAIL_ADMIN_ROLES AND account is active.
 *
 * Uses fetchAllRows to bypass the 1000-row default limit even though the
 * admin count is small , this stays correct if the roster grows.
 */
export async function getActiveAdmins(): Promise<AdminUserRow[]> {
  const rows = await fetchAllRows<AdminUserRow>(
    'users',
    'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, is_active, status',
    {
      filters: [
        { type: 'in', column: 'role', value: AGENT_EMAIL_ADMIN_ROLES },
        { type: 'eq', column: 'is_active', value: true },
        { type: 'eq', column: 'status', value: 'active' },
      ],
      orderBy: { column: 'email', ascending: true },
    }
  )
  // Belt-and-braces: guarantee only valid emails.
  return rows.filter(r => typeof r.email === 'string' && r.email.includes('@'))
}

/**
 * Build the set of active-admin email addresses (lower-cased) for O(1) lookup.
 */
export async function getActiveAdminEmailSet(): Promise<Set<string>> {
  const admins = await getActiveAdmins()
  const set = new Set<string>()
  for (const a of admins) set.add(a.email.toLowerCase())
  return set
}

// ─── Agent discovery ────────────────────────────────────────────────────────

/**
 * Fetch every user who counts as an "agent" sender for the dashboard.
 * Roles: agent or referral. Status: active. is_active: true.
 *
 * We do NOT filter by license expiration , Tara's explicit call. An
 * agent with an expired license still needs their emails managed
 * (that's often what the follow-up is about).
 *
 * Uses fetchAllRows because agent count can exceed the 1000 limit.
 */
export async function getActiveAgents(): Promise<AgentUserRow[]> {
  const rows = await fetchAllRows<AgentUserRow>(
    'users',
    'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, is_active, status',
    {
      filters: [
        { type: 'in', column: 'role', value: AGENT_ROLES },
        { type: 'eq', column: 'is_active', value: true },
        { type: 'eq', column: 'status', value: 'active' },
      ],
      orderBy: { column: 'email', ascending: true },
    }
  )
  return rows.filter(r => typeof r.email === 'string' && r.email.includes('@'))
}

/**
 * Look up the active-agent user record for a given "from" email address.
 * Returns null if the sender is not an active agent.
 *
 * Case-insensitive match on email.
 */
export async function resolveAgentFromEmail(
  emailAddress: string
): Promise<AgentUserRow | null> {
  if (!emailAddress || !emailAddress.includes('@')) return null
  const lower = emailAddress.trim().toLowerCase()

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(
      'id, email, first_name, last_name, preferred_first_name, preferred_last_name, role, is_active, status'
    )
    .ilike('email', lower)
    .in('role', AGENT_ROLES)
    .eq('is_active', true)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('resolveAgentFromEmail error:', error)
    return null
  }
  return (data as AgentUserRow) || null
}

// ─── Reading A filter ───────────────────────────────────────────────────────

/**
 * Reading A: a message is in scope for the dashboard iff
 *   1) the sender is an active agent (agent or referral role, active), AND
 *   2) at least one recipient (To or CC) is an active admin.
 *
 * This is the rule Tara confirmed. Agent-to-agent conversations with no
 * admin on the thread are NOT in scope. This function returns true if
 * the message passes the filter.
 */
export function messagePassesReadingAFilter(input: {
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  agentEmailSetLower: Set<string>
  adminEmailSetLower: Set<string>
}): boolean {
  const from = (input.fromAddress || '').toLowerCase()
  if (!from) return false
  if (!input.agentEmailSetLower.has(from)) return false

  const recipients = [...(input.toAddresses || []), ...(input.ccAddresses || [])]
    .filter(Boolean)
    .map(a => a.toLowerCase())

  for (const r of recipients) {
    if (input.adminEmailSetLower.has(r)) return true
  }
  return false
}

// ─── Thread find-or-create ─────────────────────────────────────────────────

/**
 * Find an existing thread for the given conversationId, or create one.
 *
 * Behavior on inbound-message-lands:
 *   - If thread exists and is CLOSED → auto-reopen: set status='new',
 *     clear assigned_to_user_id, log wasReopened=true.
 *   - If thread exists and status is 'waiting_on_agent' → flip to
 *     'in_progress' (the agent just replied to us).
 *   - If thread does not exist → create with status='new'.
 *
 * Reopen and status flip are done on the row we're returning, so callers
 * receive the post-update state.
 *
 * NOTE: this does NOT write the message row. The caller writes it after
 * this returns (so we get the returned thread_id).
 */
export async function findOrCreateInboundThread(
  input: FindOrCreateThreadInput
): Promise<FindOrCreateThreadResult> {
  const { agentUserId, graphConversationId, firstInternetMessageId, subject, receivedAt } = input

  // 1. Try to find by graph conversation id first (the strongest signal).
  if (graphConversationId) {
    const { data: found, error: foundErr } = await supabaseAdmin
      .from('email_threads')
      .select('id, status, assigned_to_user_id, waiting_on_user_id, agent_user_id')
      .eq('graph_conversation_id', graphConversationId)
      .maybeSingle()

    if (foundErr) {
      console.error('findOrCreateInboundThread lookup error:', foundErr)
      throw foundErr
    }

    if (found) {
      let newStatus: ThreadStatus = found.status as ThreadStatus
      let wasReopened = false

      if (newStatus === 'closed') {
        newStatus = 'new'
        wasReopened = true
      } else if (newStatus === 'waiting_on_agent') {
        newStatus = 'in_progress'
      }

      const updatePatch: Record<string, unknown> = {
        status: newStatus,
        last_message_at: receivedAt,
        last_message_direction: 'inbound',
        updated_at: new Date().toISOString(),
      }
      if (wasReopened) {
        updatePatch.assigned_to_user_id = null
        updatePatch.waiting_on_user_id = null
        updatePatch.closed_at = null
        updatePatch.closed_by_user_id = null
      }

      const { error: updateErr } = await supabaseAdmin
        .from('email_threads')
        .update(updatePatch)
        .eq('id', found.id)

      if (updateErr) {
        console.error('findOrCreateInboundThread update error:', updateErr)
        throw updateErr
      }

      return {
        threadId: found.id as string,
        status: newStatus,
        wasCreated: false,
        wasReopened,
      }
    }
  }

  // 2. Not found → create new.
  const { data: created, error: createErr } = await supabaseAdmin
    .from('email_threads')
    .insert({
      agent_user_id: agentUserId,
      subject: subject || null,
      status: 'new',
      last_message_at: receivedAt,
      last_message_direction: 'inbound',
      graph_conversation_id: graphConversationId,
      first_internet_message_id: firstInternetMessageId,
    })
    .select('id, status')
    .single()

  if (createErr || !created) {
    console.error('findOrCreateInboundThread create error:', createErr)
    throw createErr || new Error('Failed to create thread')
  }

  return {
    threadId: created.id as string,
    status: created.status as ThreadStatus,
    wasCreated: true,
    wasReopened: false,
  }
}

/**
 * Handle an out-of-band outbound reply (an admin replied from Outlook
 * or a phone). Finds the thread by conversation id, appends the outbound
 * message row, sets status to waiting_on_agent, and writes a system
 * note so Dale sees the reply happened outside the dashboard.
 *
 * Returns the thread id or null if no matching thread was found (meaning
 * the reply was to a non-tracked recipient , silently ignored).
 */
export async function locateThreadByConversationId(
  graphConversationId: string
): Promise<{ threadId: string } | null> {
  if (!graphConversationId) return null
  const { data, error } = await supabaseAdmin
    .from('email_threads')
    .select('id')
    .eq('graph_conversation_id', graphConversationId)
    .maybeSingle()
  if (error) {
    console.error('locateThreadByConversationId error:', error)
    return null
  }
  return data ? { threadId: data.id as string } : null
}

// ─── Message insert (dedupe by internet_message_id) ────────────────────────

export interface InsertMessageInput {
  threadId: string
  direction: 'inbound' | 'outbound'
  internetMessageId: string
  graphMessageId: string | null
  receivedFromMailboxUpn: string | null
  fromAddress: string
  fromName: string | null
  toAddresses: string[]
  ccAddresses: string[]
  subject: string | null
  bodyHtml: string | null
  bodyText: string | null
  receivedAt: string | null
  sentAt: string | null
  sentViaDashboard: boolean
  sentByUserId: string | null
  hasAttachments: boolean
}

/**
 * Insert a message. Returns { inserted: true } on success, or
 * { inserted: false, reason: 'duplicate' } if the internet_message_id
 * already exists (this is the cross-mailbox dedupe path).
 */
export async function insertThreadMessage(
  input: InsertMessageInput
): Promise<{ inserted: boolean; reason?: 'duplicate' | 'error'; error?: unknown }> {
  const { data, error } = await supabaseAdmin
    .from('email_thread_messages')
    .insert({
      thread_id: input.threadId,
      direction: input.direction,
      internet_message_id: input.internetMessageId,
      graph_message_id: input.graphMessageId,
      received_from_mailbox_upn: input.receivedFromMailboxUpn,
      from_address: input.fromAddress,
      from_name: input.fromName,
      to_addresses: input.toAddresses,
      cc_addresses: input.ccAddresses,
      subject: input.subject,
      body_html: input.bodyHtml,
      body_text: input.bodyText,
      received_at: input.receivedAt,
      sent_at: input.sentAt,
      sent_via_dashboard: input.sentViaDashboard,
      sent_by_user_id: input.sentByUserId,
      has_attachments: input.hasAttachments,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Unique violation on internet_message_id = we've already ingested this message.
    // Postgres error code 23505 = unique_violation.
    const errObj = error as { code?: string; message?: string }
    if (errObj.code === '23505') {
      return { inserted: false, reason: 'duplicate' }
    }
    console.error('insertThreadMessage error:', error)
    return { inserted: false, reason: 'error', error }
  }

  if (!data) return { inserted: false, reason: 'error' }
  return { inserted: true }
}

/**
 * Insert a system note (e.g., "Reply sent from Outlook by Tara").
 * created_by_user_id is null for system notes by convention.
 */
export async function insertSystemNote(
  threadId: string,
  body: string
): Promise<void> {
  const { error } = await supabaseAdmin.from('email_thread_notes').insert({
    thread_id: threadId,
    body,
    is_system: true,
    created_by_user_id: null,
  })
  if (error) {
    console.error('insertSystemNote error:', error)
    // Non-fatal: caller doesn't need to know if we couldn't log a note.
  }
}

// ─── Display helpers ────────────────────────────────────────────────────────

/**
 * Preferred display name: preferred_first_name + preferred_last_name if
 * present, else first_name + last_name, else email.
 */
export function preferredDisplayName(u: {
  first_name: string | null
  last_name: string | null
  preferred_first_name: string | null
  preferred_last_name: string | null
  email: string
}): string {
  const first = u.preferred_first_name || u.first_name || ''
  const last = u.preferred_last_name || u.last_name || ''
  const full = `${first} ${last}`.trim()
  return full || u.email
}
