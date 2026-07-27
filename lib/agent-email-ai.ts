/**
 * Agent Email Dashboard, Phase 3: AI triage + reply drafting.
 *
 * Two generation paths, both cached in agent_email_ai_suggestions:
 *
 *   generateThreadSuggestions(threadId)
 *     One-sentence summary, suggested tag, suggested assignee (with
 *     reason + confidence). Used by the Triage screen. Cached until a
 *     new inbound invalidates it.
 *
 *   generateReplyDraft(threadId, forUserId)
 *     A reply draft in the assignee's voice, using their recent sent
 *     messages as style examples. Used by My Work. Cached per (thread,
 *     user) until invalidated or 24h old.
 *
 * Model: claude-haiku-4-5 via the same direct-fetch pattern the app
 * already uses (lib/doc-extract.ts). ANTHROPIC_API_KEY from env.
 */

import { supabaseAdmin } from './supabase'
import { getActiveAdmins, preferredDisplayName } from './agent-email'
import { fetchAgentContext, contextToEmailLines } from './agent-email-context'
import { getGraphToken } from './microsoft-graph'

const MODEL = 'claude-haiku-4-5'
const KNOWN_TAGS = ['billing', 'license', 'transaction', 'systems', 'general']

export interface ThreadSuggestions {
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

// ─── Cache read ────────────────────────────────────────────────────────────

export async function getCachedSuggestions(
  threadIds: string[]
): Promise<Map<string, ThreadSuggestions>> {
  const out = new Map<string, ThreadSuggestions>()
  if (threadIds.length === 0) return out

  const { data: rows } = await supabaseAdmin
    .from('agent_email_ai_suggestions')
    .select(
      'thread_id, summary, suggested_tag, tag_confidence, suggested_assignee_user_id, assignee_confidence, assignee_reason, generated_at, invalidated_at'
    )
    .in('thread_id', threadIds)

  if (!rows) return out

  const assigneeIds = Array.from(
    new Set(rows.map(r => r.suggested_assignee_user_id).filter(Boolean))
  ) as string[]
  const nameById = new Map<string, string>()
  if (assigneeIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name')
      .in('id', assigneeIds)
    for (const u of users || []) {
      nameById.set(u.id as string, preferredDisplayName(u as any))
    }
  }

  for (const r of rows) {
    out.set(r.thread_id as string, {
      threadId: r.thread_id as string,
      summary: (r.summary as string) || null,
      suggestedTag: (r.suggested_tag as string) || null,
      tagConfidence: (r.tag_confidence as any) || null,
      suggestedAssigneeUserId: (r.suggested_assignee_user_id as string) || null,
      suggestedAssigneeName: r.suggested_assignee_user_id
        ? nameById.get(r.suggested_assignee_user_id as string) || null
        : null,
      assigneeConfidence: (r.assignee_confidence as any) || null,
      assigneeReason: (r.assignee_reason as string) || null,
      generatedAt: r.generated_at as string,
      stale: Boolean(r.invalidated_at),
    })
  }
  return out
}

// ─── Anthropic call helper ────────────────────────────────────────────────

async function callClaude(system: string, userText: string, maxTokens: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('agent-email-ai: ANTHROPIC_API_KEY missing')
    return null
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`agent-email-ai: Anthropic ${res.status} ${text.slice(0, 200)}`)
      return null
    }
    const json = await res.json()
    const content = (json?.content || [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('')
    return content || null
  } catch (err) {
    console.error('agent-email-ai: fetch failed', err)
    return null
  }
}

function parseJsonLoose(text: string): any | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

// ─── Thread context loader (shared by both generators) ────────────────────

async function loadThreadForAi(threadId: string): Promise<{
  thread: any
  messages: Array<{ direction: string; from: string; when: string | null; text: string }>
  agentName: string
  agentContextLines: string[]
} | null> {
  const { data: thread } = await supabaseAdmin
    .from('email_threads')
    .select('id, subject, status, agent_user_id, assigned_to_user_id')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return null

  const { data: msgs } = await supabaseAdmin
    .from('email_thread_messages')
    .select('direction, from_name, from_address, body_text, body_html, received_at, sent_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(12)

  const messages = (msgs || []).map(m => ({
    direction: m.direction as string,
    from: (m.from_name as string) || (m.from_address as string) || '',
    when: (m.received_at as string) || (m.sent_at as string) || null,
    text: truncate(
      (m.body_text as string) || stripHtml((m.body_html as string) || ''),
      1200
    ),
  }))

  const ctx = await fetchAgentContext(thread.agent_user_id)
  return {
    thread,
    messages,
    agentName: ctx?.name || 'Unknown agent',
    agentContextLines: ctx ? contextToEmailLines(ctx) : [],
  }
}

// ─── Triage suggestions ───────────────────────────────────────────────────

export async function generateThreadSuggestions(threadId: string): Promise<ThreadSuggestions | null> {
  const loaded = await loadThreadForAi(threadId)
  if (!loaded) return null
  const { messages, agentName, agentContextLines } = loaded

  const admins = await getActiveAdmins()
  const adminLines = admins.map(
    a => `- id: ${a.id} | name: ${preferredDisplayName(a)} | role: ${a.role || 'unknown'} | email: ${a.email}`
  )

  // Pull existing tags so the model prefers vocabulary already in use.
  const { data: tagRows } = await supabaseAdmin
    .from('email_thread_tags')
    .select('tag')
    .limit(500)
  const tagsInUse = Array.from(new Set([...KNOWN_TAGS, ...(tagRows || []).map(r => r.tag as string)]))

  const system = `You triage inbound emails from real estate agents to the operations team of Collective Realty Co., a Texas brokerage. Respond ONLY with JSON, no prose, no markdown fences.

Team roles for routing:
- broker: final decisions, policy, legal, anything sensitive
- operations: billing, payouts, systems, M365, general ops
- tc: transaction coordination, compliance, deal paperwork
- support: everything simple or administrative

Routing rules:
- Suggest the assignee whose role best matches the request
- Confidence "high" only when the topic clearly maps to one person
- Confidence "low" when it could plausibly go two or more ways
- Never invent people; only use the ids provided`

  const userText = `AGENT: ${agentName}
AGENT CONTEXT:
${agentContextLines.join('\n') || '(none)'}

TEAM (pick assignee from these ids):
${adminLines.join('\n')}

TAGS IN USE (prefer one of these; invent only if nothing fits):
${tagsInUse.join(', ')}

CONVERSATION (oldest first):
${messages.map(m => `[${m.direction}] ${m.from}: ${m.text}`).join('\n---\n')}

Return JSON exactly:
{
  "summary": "<one sentence, max 20 words, what the agent needs>",
  "tag": "<one tag>",
  "tag_confidence": "high|medium|low",
  "assignee_id": "<id from the team list>",
  "assignee_confidence": "high|medium|low",
  "assignee_reason": "<one short sentence why>"
}`

  const raw = await callClaude(system, userText, 400)
  if (!raw) return null
  const parsed = parseJsonLoose(raw)
  if (!parsed) return null

  const validAssignee = admins.find(a => a.id === parsed.assignee_id)
  const confidence = (v: any): 'high' | 'medium' | 'low' | null =>
    v === 'high' || v === 'medium' || v === 'low' ? v : null
  const tag =
    typeof parsed.tag === 'string' && /^[a-z0-9_-]{1,32}$/.test(parsed.tag.toLowerCase())
      ? parsed.tag.toLowerCase()
      : null

  const now = new Date().toISOString()
  const row = {
    thread_id: threadId,
    summary: typeof parsed.summary === 'string' ? truncate(parsed.summary, 300) : null,
    suggested_tag: tag,
    tag_confidence: tag ? confidence(parsed.tag_confidence) : null,
    suggested_assignee_user_id: validAssignee ? validAssignee.id : null,
    assignee_confidence: validAssignee ? confidence(parsed.assignee_confidence) : null,
    assignee_reason:
      validAssignee && typeof parsed.assignee_reason === 'string'
        ? truncate(parsed.assignee_reason, 300)
        : null,
    generated_at: now,
    invalidated_at: null,
    model: MODEL,
  }

  const { error } = await supabaseAdmin
    .from('agent_email_ai_suggestions')
    .upsert(row, { onConflict: 'thread_id' })
  if (error) {
    console.error('agent-email-ai: cache upsert failed', error)
  }

  return {
    threadId,
    summary: row.summary,
    suggestedTag: row.suggested_tag,
    tagConfidence: row.tag_confidence,
    suggestedAssigneeUserId: row.suggested_assignee_user_id,
    suggestedAssigneeName: validAssignee ? preferredDisplayName(validAssignee) : null,
    assigneeConfidence: row.assignee_confidence,
    assigneeReason: row.assignee_reason,
    generatedAt: now,
    stale: false,
  }
}

// ─── Reply draft ──────────────────────────────────────────────────────────

export async function generateReplyDraft(
  threadId: string,
  forUserId: string
): Promise<{ draft: string; generatedAt: string } | null> {
  // Cache check: valid if for same user, not invalidated, < 24h old
  const { data: cached } = await supabaseAdmin
    .from('agent_email_ai_suggestions')
    .select('reply_draft, reply_draft_for_user_id, reply_draft_generated_at, invalidated_at')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (
    cached?.reply_draft &&
    cached.reply_draft_for_user_id === forUserId &&
    !cached.invalidated_at &&
    cached.reply_draft_generated_at &&
    Date.now() - new Date(cached.reply_draft_generated_at as string).getTime() < 24 * 60 * 60 * 1000
  ) {
    return {
      draft: cached.reply_draft as string,
      generatedAt: cached.reply_draft_generated_at as string,
    }
  }

  const loaded = await loadThreadForAi(threadId)
  if (!loaded) return null
  const { messages, agentName, agentContextLines } = loaded

  const voiceSamples = await getVoiceSamples(forUserId)

  const { data: me } = await supabaseAdmin
    .from('users')
    .select('first_name, last_name, preferred_first_name, preferred_last_name, email')
    .eq('id', forUserId)
    .maybeSingle()
  const myName = me ? preferredDisplayName(me as any) : 'the admin'

  const system = `You draft email replies for ${myName}, an operations team member at Collective Realty Co., a Texas real estate brokerage, replying to the brokerage's own agents. Rules:
- Write ONLY the reply body as plain text. No subject, no signature, no greeting-name placeholders like [Name].
- Match the voice of the style examples: their length, formality, and phrasing habits.
- Answer what the agent asked using the context provided. If the answer needs information you don't have, write the reply around what IS known and leave a clearly marked [CHECK: ...] placeholder for the one fact to verify.
- Never invent policy, dollar amounts, or dates.
- Keep it tight. Agents are busy.`

  const userText = `AGENT: ${agentName}
AGENT CONTEXT:
${agentContextLines.join('\n') || '(none)'}

${voiceSamples.length > 0 ? `STYLE EXAMPLES (${myName}'s recent replies, match this voice):
${voiceSamples.map((s, i) => `Example ${i + 1}:\n${s}`).join('\n---\n')}` : 'STYLE: professional, warm, concise.'}

CONVERSATION (oldest first):
${messages.map(m => `[${m.direction}] ${m.from}: ${m.text}`).join('\n---\n')}

Write the reply body now.`

  const raw = await callClaude(system, userText, 700)
  if (!raw) return null
  const draft = raw.trim()
  const now = new Date().toISOString()

  await supabaseAdmin.from('agent_email_ai_suggestions').upsert(
    {
      thread_id: threadId,
      reply_draft: draft,
      reply_draft_for_user_id: forUserId,
      reply_draft_generated_at: now,
      model: MODEL,
    },
    { onConflict: 'thread_id' }
  )

  return { draft, generatedAt: now }
}

// Voice samples: outbound messages this user sent on agent threads (up to
// 20). If fewer than 5, augment from their Graph Sent Items so the model
// has enough to imitate even before dashboard history builds up.
async function getVoiceSamples(userId: string): Promise<string[]> {
  const samples: string[] = []

  const { data: rows } = await supabaseAdmin
    .from('email_thread_messages')
    .select('body_text, body_html')
    .eq('sent_by_user_id', userId)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(20)

  for (const r of rows || []) {
    const text = (r.body_text as string) || stripHtml((r.body_html as string) || '')
    const trimmed = stripQuotedTail(text)
    if (trimmed.length >= 30) samples.push(truncate(trimmed, 800))
    if (samples.length >= 20) break
  }

  if (samples.length < 5) {
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle()
      if (user?.email) {
        const token = await getGraphToken()
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user.email as string)}/mailFolders/sentitems/messages?$select=body,bodyPreview&$top=10&$orderby=sentDateTime%20desc`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const json = await res.json()
          for (const m of json?.value || []) {
            const text =
              m?.body?.contentType === 'text'
                ? String(m.body.content || '')
                : stripHtml(String(m?.body?.content || '')) || String(m?.bodyPreview || '')
            const trimmed = stripQuotedTail(text)
            if (trimmed.length >= 30) samples.push(truncate(trimmed, 800))
            if (samples.length >= 10) break
          }
        }
      }
    } catch (err) {
      console.error('agent-email-ai: Graph voice sample fetch failed (non-fatal)', err)
    }
  }

  return samples.slice(0, 20)
}

// ─── Cache invalidation (called by webhook on new inbound) ────────────────

export async function invalidateAiSuggestions(threadId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('agent_email_ai_suggestions')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('thread_id', threadId)
  } catch (err) {
    console.error('agent-email-ai: invalidate failed (non-fatal)', err)
  }
}

// ─── Text utils ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Drop quoted history ("On ... wrote:") so voice samples are just the
// person's own words.
function stripQuotedTail(text: string): string {
  if (!text) return ''
  const idx = text.search(/On .{5,80} wrote:/)
  return (idx > 0 ? text.slice(0, idx) : text).trim()
}

function truncate(s: string, n: number): string {
  if (!s) return s
  return s.length > n ? s.slice(0, n) + '...' : s
}
