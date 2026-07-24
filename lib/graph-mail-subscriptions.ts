/**
 * Graph Mail Subscription Management for the Agent Email Dashboard.
 *
 * Owns:
 *   - Creating, renewing, and deleting Graph mail subscriptions per admin mailbox
 *     (inbox + sent items).
 *   - Creating the "Work in Dashboard" folder in each admin's mailbox.
 *   - Creating/updating the mail rule that moves matching agent email into
 *     that folder.
 *   - The reconciliation entry point used by both the cron and the admin
 *     "run now" button.
 *
 * REQUIREMENTS (Azure app registration must have, tenant-wide, admin consent):
 *   - Mail.ReadWrite         (application) , required to create mail folders
 *                             and inbox rules via Graph
 *   - MailboxSettings.ReadWrite (application) , required to create inbox rules
 *
 * ENV VARS:
 *   - AGENT_EMAIL_WEBHOOK_URL , the public HTTPS URL Graph POSTs to on new mail.
 *     Must be set to something like https://agent.collectiverealtyco.com/api/agent-email/webhook
 *     for production. Graph validates it on subscription creation.
 *   - AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET , a shared secret we send to Graph
 *     as clientState. The webhook receiver validates every incoming payload's
 *     clientState against this to reject spoofed requests.
 */

import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getGraphToken } from '@/lib/microsoft-graph'
import { getActiveAdmins, getActiveAgents, AdminUserRow } from '@/lib/agent-email'

// Graph mail subscription maximum expiration: ~4230 minutes (3 days).
// We renew ~24h before expiry.
const SUBSCRIPTION_MINUTES = 4230
const RENEW_BUFFER_MS = 24 * 60 * 60 * 1000

const WORK_FOLDER_NAME = 'Work in Dashboard'
const WORK_FOLDER_DISPLAY = 'Work in Dashboard'
const RULE_DISPLAY_NAME = 'Agent email → Work in Dashboard'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// ─── Reconciliation reporting ──────────────────────────────────────────────

export interface ReconcileReport {
  ranAt: string
  adminsScanned: number
  subscriptionsCreated: number
  subscriptionsRenewed: number
  subscriptionsDeleted: number
  foldersCreated: number
  rulesCreated: number
  rulesUpdated: number
  errors: Array<{ userId: string; upn: string; step: string; message: string }>
}

function emptyReport(): ReconcileReport {
  return {
    ranAt: new Date().toISOString(),
    adminsScanned: 0,
    subscriptionsCreated: 0,
    subscriptionsRenewed: 0,
    subscriptionsDeleted: 0,
    foldersCreated: 0,
    rulesCreated: 0,
    rulesUpdated: 0,
    errors: [],
  }
}

// ─── Graph helpers ─────────────────────────────────────────────────────────

async function graphFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: any; text: string }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  let body: any = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  return { ok: res.ok, status: res.status, body, text }
}

// ─── Subscriptions ─────────────────────────────────────────────────────────

async function createGraphSubscription(
  token: string,
  upn: string,
  folderKind: 'inbox' | 'sentitems'
): Promise<{ subscriptionId: string; clientState: string; expiration: string }> {
  const resource =
    folderKind === 'inbox'
      ? `/users/${upn}/mailFolders('inbox')/messages`
      : `/users/${upn}/mailFolders('sentitems')/messages`

  const webhookUrl = process.env.AGENT_EMAIL_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('AGENT_EMAIL_WEBHOOK_URL is not set')
  }
  const secret = process.env.AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET
  if (!secret) {
    throw new Error('AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET is not set')
  }

  // clientState combines the shared secret with a random nonce so we
  // can differentiate subscriptions if we ever need to.
  const nonce = randomBytes(8).toString('hex')
  const clientState = `${secret}:${nonce}`

  const expiration = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60 * 1000).toISOString()

  const resp = await graphFetch(token, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl: webhookUrl,
      resource,
      expirationDateTime: expiration,
      clientState,
      latestSupportedTlsVersion: 'v1_2',
    }),
  })

  if (!resp.ok) {
    throw new Error(
      `createGraphSubscription ${folderKind} failed for ${upn}: ${resp.status} ${resp.text.slice(0, 500)}`
    )
  }

  return {
    subscriptionId: resp.body.id as string,
    clientState,
    expiration: resp.body.expirationDateTime as string,
  }
}

async function renewGraphSubscription(
  token: string,
  subscriptionId: string
): Promise<{ expiration: string }> {
  const expiration = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60 * 1000).toISOString()
  const resp = await graphFetch(token, `/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ expirationDateTime: expiration }),
  })
  if (!resp.ok) {
    throw new Error(
      `renewGraphSubscription failed for ${subscriptionId}: ${resp.status} ${resp.text.slice(0, 300)}`
    )
  }
  return { expiration: (resp.body?.expirationDateTime as string) || expiration }
}

async function deleteGraphSubscription(
  token: string,
  subscriptionId: string
): Promise<void> {
  const resp = await graphFetch(token, `/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  })
  // 404 is fine , Graph already gone.
  if (!resp.ok && resp.status !== 404) {
    throw new Error(
      `deleteGraphSubscription failed for ${subscriptionId}: ${resp.status} ${resp.text.slice(0, 300)}`
    )
  }
}

// ─── Folder + rule ─────────────────────────────────────────────────────────

async function ensureWorkFolder(
  token: string,
  upn: string
): Promise<{ folderId: string; created: boolean }> {
  // Look under the Inbox for a child folder with our display name.
  const list = await graphFetch(
    token,
    `/users/${upn}/mailFolders('inbox')/childFolders?$select=id,displayName&$top=100`
  )
  if (!list.ok) {
    throw new Error(
      `ensureWorkFolder list failed for ${upn}: ${list.status} ${list.text.slice(0, 300)}`
    )
  }
  const existing = (list.body?.value || []).find(
    (f: any) => f.displayName === WORK_FOLDER_NAME
  )
  if (existing) return { folderId: existing.id as string, created: false }

  const created = await graphFetch(
    token,
    `/users/${upn}/mailFolders('inbox')/childFolders`,
    {
      method: 'POST',
      body: JSON.stringify({ displayName: WORK_FOLDER_DISPLAY }),
    }
  )
  if (!created.ok) {
    throw new Error(
      `ensureWorkFolder create failed for ${upn}: ${created.status} ${created.text.slice(0, 300)}`
    )
  }
  return { folderId: created.body.id as string, created: true }
}

/**
 * Deterministic hash of the sorted-lowercase list of agent addresses. Used
 * to detect when the roster changed and the rule needs updating.
 */
function hashAddresses(addresses: string[]): string {
  const sorted = [...new Set(addresses.map(a => a.toLowerCase()))].sort()
  return createHash('sha256').update(sorted.join(',')).digest('hex')
}

async function ensureMailRule(
  token: string,
  upn: string,
  folderId: string,
  agentAddresses: string[],
  existingRuleId: string | null
): Promise<{ ruleId: string; created: boolean; updated: boolean }> {
  // Rule body: move messages whose sender is any of the active agent addresses.
  const senderContainsList = agentAddresses.map(a => a.toLowerCase())

  const conditions: Record<string, unknown> = {
    senderContains: senderContainsList,
  }
  const actions: Record<string, unknown> = {
    moveToFolder: folderId,
    stopProcessingRules: false,
  }

  if (existingRuleId) {
    // Update in place.
    const resp = await graphFetch(
      token,
      `/users/${upn}/mailFolders('inbox')/messageRules/${existingRuleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: RULE_DISPLAY_NAME,
          isEnabled: true,
          conditions,
          actions,
        }),
      }
    )
    if (!resp.ok) {
      // Graph occasionally returns 404 if the rule was removed manually , fall through to create.
      if (resp.status !== 404) {
        throw new Error(
          `ensureMailRule update failed for ${upn}: ${resp.status} ${resp.text.slice(0, 300)}`
        )
      }
    } else {
      return { ruleId: existingRuleId, created: false, updated: true }
    }
  }

  // Create new rule.
  const created = await graphFetch(
    token,
    `/users/${upn}/mailFolders('inbox')/messageRules`,
    {
      method: 'POST',
      body: JSON.stringify({
        displayName: RULE_DISPLAY_NAME,
        sequence: 1,
        isEnabled: true,
        conditions,
        actions,
      }),
    }
  )
  if (!created.ok) {
    throw new Error(
      `ensureMailRule create failed for ${upn}: ${created.status} ${created.text.slice(0, 300)}`
    )
  }
  return { ruleId: created.body.id as string, created: true, updated: false }
}

// ─── DB persistence helpers ────────────────────────────────────────────────

async function upsertSubscriptionRow(row: {
  userId: string
  mailboxUpn: string
  folderKind: 'inbox' | 'sentitems'
  subscriptionId: string
  clientState: string
  expirationAt: string
  wasRenewed: boolean
}): Promise<void> {
  const patch: Record<string, unknown> = {
    user_id: row.userId,
    mailbox_upn: row.mailboxUpn,
    folder_kind: row.folderKind,
    subscription_id: row.subscriptionId,
    client_state: row.clientState,
    expiration_at: row.expirationAt,
  }
  if (row.wasRenewed) patch.renewed_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('graph_mail_subscriptions')
    .upsert(patch, { onConflict: 'user_id,folder_kind' })
  if (error) throw error
}

async function deleteSubscriptionRow(userId: string, folderKind: 'inbox' | 'sentitems'): Promise<void> {
  const { error } = await supabaseAdmin
    .from('graph_mail_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('folder_kind', folderKind)
  if (error) throw error
}

async function upsertMailRuleRow(row: {
  userId: string
  mailboxUpn: string
  folderId: string
  ruleId: string
  addressesHash: string
}): Promise<void> {
  const { error } = await supabaseAdmin.from('graph_mail_rules').upsert(
    {
      user_id: row.userId,
      mailbox_upn: row.mailboxUpn,
      folder_id: row.folderId,
      rule_id: row.ruleId,
      agent_addresses_hash: row.addressesHash,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw error
}

// ─── Main reconciliation ───────────────────────────────────────────────────

/**
 * Reconcile Graph subscriptions and mail rules to the current admin roster.
 *
 * For every active admin:
 *   - Ensure "Work in Dashboard" folder exists in their mailbox.
 *   - Ensure inbox subscription exists and is not near expiry (renew if within 24h).
 *   - Ensure sentitems subscription exists and is not near expiry.
 *   - Ensure a mail rule exists that moves active-agent email to the folder.
 *     Update the rule if the agent roster hash changed.
 *
 * For every subscription row whose user is no longer an active admin:
 *   - Delete the subscription in Graph, delete the DB row.
 *   (We leave the folder and rule alone , the user's mailbox still has them
 *   and removing them requires the user to still be an admin; if they're not,
 *   they can clean it up manually.)
 *
 * Failures on individual admins are collected in `report.errors` and do NOT
 * halt the run.
 */
export async function reconcileSubscriptions(): Promise<ReconcileReport> {
  const report = emptyReport()

  // 1. Fetch admins and active agents.
  const admins = await getActiveAdmins()
  report.adminsScanned = admins.length
  const agents = await getActiveAgents()
  const agentAddresses = agents
    .map(a => (a.email || '').toLowerCase())
    .filter(Boolean)
  const agentAddressesHash = hashAddresses(agentAddresses)

  // 2. Fetch existing subscription and rule rows (so we can process
  //    orphans afterwards).
  const { data: subRows } = await supabaseAdmin
    .from('graph_mail_subscriptions')
    .select('id, user_id, folder_kind, subscription_id, expiration_at')

  const { data: ruleRows } = await supabaseAdmin
    .from('graph_mail_rules')
    .select('user_id, folder_id, rule_id, agent_addresses_hash')

  const existingSubsByUser = new Map<
    string,
    Map<'inbox' | 'sentitems', { subscription_id: string; expiration_at: string }>
  >()
  for (const s of subRows || []) {
    const inner = existingSubsByUser.get(s.user_id) || new Map()
    inner.set(s.folder_kind as 'inbox' | 'sentitems', {
      subscription_id: s.subscription_id,
      expiration_at: s.expiration_at,
    })
    existingSubsByUser.set(s.user_id, inner)
  }

  const existingRulesByUser = new Map<
    string,
    { folder_id: string | null; rule_id: string | null; agent_addresses_hash: string | null }
  >()
  for (const r of ruleRows || []) {
    existingRulesByUser.set(r.user_id, {
      folder_id: r.folder_id,
      rule_id: r.rule_id,
      agent_addresses_hash: r.agent_addresses_hash,
    })
  }

  // 3. Get Graph token once (app-only).
  let token: string
  try {
    token = await getGraphToken()
  } catch (err: any) {
    report.errors.push({
      userId: 'system',
      upn: 'system',
      step: 'getGraphToken',
      message: err?.message || String(err),
    })
    return report
  }

  const activeAdminIds = new Set(admins.map(a => a.id))

  // 4. Per-admin work.
  for (const admin of admins) {
    const upn = admin.email
    try {
      await processAdmin(
        token,
        admin,
        agentAddresses,
        agentAddressesHash,
        existingSubsByUser.get(admin.id) || new Map(),
        existingRulesByUser.get(admin.id) || null,
        report
      )
    } catch (err: any) {
      report.errors.push({
        userId: admin.id,
        upn,
        step: 'processAdmin',
        message: err?.message || String(err),
      })
    }
  }

  // 5. Orphan subscriptions: users who were admins but no longer are.
  for (const [userId, kinds] of existingSubsByUser.entries()) {
    if (activeAdminIds.has(userId)) continue
    for (const [kind, s] of kinds.entries()) {
      try {
        await deleteGraphSubscription(token, s.subscription_id)
        await deleteSubscriptionRow(userId, kind)
        report.subscriptionsDeleted += 1
      } catch (err: any) {
        report.errors.push({
          userId,
          upn: '(former admin)',
          step: `deleteSubscription:${kind}`,
          message: err?.message || String(err),
        })
      }
    }
  }

  return report
}

async function processAdmin(
  token: string,
  admin: AdminUserRow,
  agentAddresses: string[],
  agentAddressesHash: string,
  existingSubs: Map<'inbox' | 'sentitems', { subscription_id: string; expiration_at: string }>,
  existingRule: { folder_id: string | null; rule_id: string | null; agent_addresses_hash: string | null } | null,
  report: ReconcileReport
): Promise<void> {
  const upn = admin.email

  // A. Ensure Work in Dashboard folder.
  let folderId = existingRule?.folder_id || null
  if (!folderId) {
    const f = await ensureWorkFolder(token, upn)
    folderId = f.folderId
    if (f.created) report.foldersCreated += 1
  }

  // B. Ensure inbox subscription.
  await ensureSubscription(token, admin, 'inbox', existingSubs.get('inbox'), report)

  // C. Ensure sentitems subscription.
  await ensureSubscription(token, admin, 'sentitems', existingSubs.get('sentitems'), report)

  // D. Ensure mail rule (if roster changed or no rule yet).
  const needsRuleWork =
    !existingRule?.rule_id || existingRule.agent_addresses_hash !== agentAddressesHash
  if (needsRuleWork && agentAddresses.length > 0) {
    const r = await ensureMailRule(
      token,
      upn,
      folderId,
      agentAddresses,
      existingRule?.rule_id || null
    )
    if (r.created) report.rulesCreated += 1
    if (r.updated) report.rulesUpdated += 1
    await upsertMailRuleRow({
      userId: admin.id,
      mailboxUpn: upn,
      folderId,
      ruleId: r.ruleId,
      addressesHash: agentAddressesHash,
    })
  } else if (existingRule && !existingRule.folder_id) {
    // Row existed but folder id wasn't saved , persist it now.
    await upsertMailRuleRow({
      userId: admin.id,
      mailboxUpn: upn,
      folderId,
      ruleId: existingRule.rule_id || '',
      addressesHash: agentAddressesHash,
    })
  }
}

async function ensureSubscription(
  token: string,
  admin: AdminUserRow,
  folderKind: 'inbox' | 'sentitems',
  existing: { subscription_id: string; expiration_at: string } | undefined,
  report: ReconcileReport
): Promise<void> {
  const upn = admin.email
  if (existing) {
    const expiresAtMs = new Date(existing.expiration_at).getTime()
    if (expiresAtMs - Date.now() > RENEW_BUFFER_MS) {
      // Still fresh , nothing to do.
      return
    }
    // Renew.
    const renewed = await renewGraphSubscription(token, existing.subscription_id)
    await upsertSubscriptionRow({
      userId: admin.id,
      mailboxUpn: upn,
      folderKind,
      subscriptionId: existing.subscription_id,
      // client_state stays the same on renewal , we look it up.
      clientState: await getStoredClientState(admin.id, folderKind),
      expirationAt: renewed.expiration,
      wasRenewed: true,
    })
    report.subscriptionsRenewed += 1
    return
  }

  // Create.
  const created = await createGraphSubscription(token, upn, folderKind)
  await upsertSubscriptionRow({
    userId: admin.id,
    mailboxUpn: upn,
    folderKind,
    subscriptionId: created.subscriptionId,
    clientState: created.clientState,
    expirationAt: created.expiration,
    wasRenewed: false,
  })
  report.subscriptionsCreated += 1
}

async function getStoredClientState(
  userId: string,
  folderKind: 'inbox' | 'sentitems'
): Promise<string> {
  const { data } = await supabaseAdmin
    .from('graph_mail_subscriptions')
    .select('client_state')
    .eq('user_id', userId)
    .eq('folder_kind', folderKind)
    .maybeSingle()
  return (data?.client_state as string) || ''
}

// ─── Webhook clientState validation ────────────────────────────────────────

/**
 * Verify an incoming webhook's clientState against the expected format.
 * Returns true if it starts with our shared secret (before the colon nonce).
 */
export function isValidClientState(clientState: string | null | undefined): boolean {
  if (!clientState) return false
  const secret = process.env.AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET
  if (!secret) return false
  return clientState.startsWith(`${secret}:`)
}

/**
 * Look up which subscription row matches an incoming clientState (used to
 * recover subscription context on webhook receipt).
 */
export async function findSubscriptionByClientState(
  clientState: string
): Promise<{
  userId: string
  mailboxUpn: string
  folderKind: 'inbox' | 'sentitems'
  subscriptionId: string
} | null> {
  const { data, error } = await supabaseAdmin
    .from('graph_mail_subscriptions')
    .select('user_id, mailbox_upn, folder_kind, subscription_id')
    .eq('client_state', clientState)
    .maybeSingle()
  if (error) {
    console.error('findSubscriptionByClientState error:', error)
    return null
  }
  if (!data) return null
  return {
    userId: data.user_id as string,
    mailboxUpn: data.mailbox_upn as string,
    folderKind: data.folder_kind as 'inbox' | 'sentitems',
    subscriptionId: data.subscription_id as string,
  }
}
