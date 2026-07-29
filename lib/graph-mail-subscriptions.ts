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
const RULE_DISPLAY_NAME = 'Agent email category tag'
const AGENT_EMAIL_CATEGORY = 'Agent Email'

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

// Ensure the "Agent Email" master category exists in the mailbox, colored
// black. Idempotent: if it already exists we leave it. Non-fatal on failure
// (the rule can still tag; the label just renders uncolored).
async function ensureAgentEmailCategory(token: string, upn: string): Promise<void> {
  try {
    const list = await graphFetch(
      token,
      `/users/${upn}/outlook/masterCategories?$top=100`
    )
    if (list.ok) {
      const exists = (list.body?.value || []).find(
        (c: any) => c.displayName === AGENT_EMAIL_CATEGORY
      )
      if (exists) return
    }
    await graphFetch(token, `/users/${upn}/outlook/masterCategories`, {
      method: 'POST',
      body: JSON.stringify({
        displayName: AGENT_EMAIL_CATEGORY,
        // Outlook preset palette: "preset24" renders black.
        color: 'preset24',
      }),
    })
  } catch (err) {
    console.error(`ensureAgentEmailCategory failed for ${upn} (non-fatal)`, err)
  }
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
  // Rule body: tag messages whose sender is any of the active agent
  // addresses with the "Agent Email" category. The message stays in the
  // Inbox; the category is a colored label so the admin can spot agent
  // mail at a glance while still seeing it in their normal Inbox flow.
  // folderId is retained in the signature for DB compatibility but is no
  // longer used as a move target.
  void folderId
  const senderContainsList = agentAddresses.map(a => a.toLowerCase())

  const conditions: Record<string, unknown> = {
    senderContains: senderContainsList,
  }
  const actions: Record<string, unknown> = {
    assignCategories: [AGENT_EMAIL_CATEGORY],
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

  // A. Ensure the "Agent Email" category exists in the mailbox master list,
  //    colored black (presetColor24 maps to black in Outlook's palette).
  //    Without registering it, the rule can still apply the label but it
  //    renders without a color. folderId is kept as an empty string for the
  //    DB row; the folder is no longer created or used.
  await ensureAgentEmailCategory(token, upn)
  const folderId = existingRule?.folder_id || ''

  // B. Ensure inbox subscription.
  await ensureSubscription(token, admin, 'inbox', existingSubs.get('inbox'), report)

  // C. Ensure sentitems subscription.
  await ensureSubscription(token, admin, 'sentitems', existingSubs.get('sentitems'), report)

  // D. Ensure mail rule (always run when there is a roster, so the update
  //    path migrates any old move-to-folder rule to the new category action
  //    in place via PATCH).
  const needsRuleWork = agentAddresses.length > 0
  if (needsRuleWork) {
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

// ─── One-time migration: undo the folder move, switch to category ──────────

export interface MailboxUndoResult {
  mailboxUpn: string
  oldRulesDeleted: number
  messagesMovedBackToInbox: number
  folderDeleted: boolean
  categoryEnsured: boolean
  errors: string[]
}

export interface UndoFolderMoveReport {
  ranAt: string
  perMailbox: MailboxUndoResult[]
}

// Undo the folder move for a SINGLE mailbox. Kept small enough to finish
// inside the serverless gateway timeout even when the folder holds a lot of
// mail. The all-mailboxes function below loops over this.
//   1. Delete any inbox rule that moves mail to "Work in Dashboard".
//   2. Move every message in "Work in Dashboard" back to the Inbox.
//   3. Delete the now-empty folder.
//   4. Ensure the black "Agent Email" master category exists.
// Safe to re-run: an already-clean mailbox reports zeros.
export async function undoFolderMoveForMailbox(upn: string): Promise<MailboxUndoResult> {
  const token = await getGraphToken()
  const m: MailboxUndoResult = {
    mailboxUpn: upn,
    oldRulesDeleted: 0,
    messagesMovedBackToInbox: 0,
    folderDeleted: false,
    categoryEnsured: false,
    errors: [],
  }
  try {
    // 1. Find and delete move-to-folder rules.
    const rulesResp = await graphFetch(
      token,
      `/users/${upn}/mailFolders('inbox')/messageRules`
    )
    let workFolderId: string | null = null
    if (rulesResp.ok) {
      for (const rule of rulesResp.body?.value || []) {
        const name = String(rule?.displayName || '')
        const movesToFolder = rule?.actions?.moveToFolder
        const isOurs =
          name === 'Agent email \u2192 Work in Dashboard' ||
          name === RULE_DISPLAY_NAME ||
          Boolean(movesToFolder)
        // Only delete rules that actually move (not the new category rule).
        if (isOurs && movesToFolder) {
          const del = await graphFetch(
            token,
            `/users/${upn}/mailFolders('inbox')/messageRules/${rule.id}`,
            { method: 'DELETE' }
          )
          if (del.ok) m.oldRulesDeleted += 1
          if (typeof movesToFolder === 'string') workFolderId = movesToFolder
        }
      }
    }

    // 2. Locate the Work in Dashboard folder (by id from the rule, or by name).
    if (!workFolderId) {
      const childList = await graphFetch(
        token,
        `/users/${upn}/mailFolders('inbox')/childFolders?$select=id,displayName&$top=100`
      )
      if (childList.ok) {
        const found = (childList.body?.value || []).find(
          (f: any) => f.displayName === WORK_FOLDER_NAME
        )
        if (found) workFolderId = found.id as string
      }
    }

    // 3. Move messages back to Inbox, paging until empty.
    if (workFolderId) {
      let guard = 100
      while (guard > 0) {
        guard -= 1
        const msgs = await graphFetch(
          token,
          `/users/${upn}/mailFolders/${workFolderId}/messages?$select=id&$top=50`
        )
        if (!msgs.ok) {
          m.errors.push(`list folder messages: ${msgs.status}`)
          break
        }
        const items = msgs.body?.value || []
        if (items.length === 0) break
        for (const item of items) {
          const mv = await graphFetch(
            token,
            `/users/${upn}/messages/${item.id}/move`,
            { method: 'POST', body: JSON.stringify({ destinationId: 'inbox' }) }
          )
          if (mv.ok) m.messagesMovedBackToInbox += 1
          else m.errors.push(`move ${item.id}: ${mv.status}`)
        }
      }

      // 4. Delete the empty folder.
      const delFolder = await graphFetch(
        token,
        `/users/${upn}/mailFolders/${workFolderId}`,
        { method: 'DELETE' }
      )
      if (delFolder.ok) m.folderDeleted = true
      else m.errors.push(`delete folder: ${delFolder.status}`)
    }

    // 5. Ensure the category exists for the new rule.
    await ensureAgentEmailCategory(token, upn)
    m.categoryEnsured = true

    // Clear the stored folder_id so reconcile does not think a folder exists.
    await supabaseAdmin
      .from('graph_mail_rules')
      .update({ folder_id: '' })
      .eq('mailbox_upn', upn)
  } catch (err: any) {
    m.errors.push(err?.message || String(err))
  }
  return m
}

// Loop over every admin mailbox. Prefer the per-mailbox route mode in
// production; this all-at-once version can exceed the gateway timeout.
// Reconcile then (re)creates the category-tagging rule; this migration does
// not create it, so run reconcile after.
export async function undoFolderMoveAndSwitchToCategory(): Promise<UndoFolderMoveReport> {
  const admins = await getActiveAdmins()
  const report: UndoFolderMoveReport = { ranAt: new Date().toISOString(), perMailbox: [] }
  for (const admin of admins) {
    report.perMailbox.push(await undoFolderMoveForMailbox(admin.email))
  }
  return report
}
