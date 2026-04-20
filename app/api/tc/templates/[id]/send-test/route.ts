import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { sendMailAs, GraphMailError } from '@/lib/microsoft-graph-mail'
import { renderMergeFields, wrapTcEmail } from '@/lib/tc/renderSendTime'
import { buildTestContext, isHarrisCountyMissing } from '@/lib/tc/testPlaceholders'
import type {
  TcEmailTemplate,
  TcSettings,
  PreferredVendor,
  HomesteadCounty,
} from '@/types/tc-module'

/**
 * POST /api/tc/templates/[id]/send-test
 *
 * Renders a template with test placeholder values, sends the result via
 * Microsoft Graph Mail.Send, and records the attempt in tc_test_sends.
 *
 * Auth: requires can_manage_coordination (standard TC admin route).
 * Request body: { fromEmail: string, toEmail: string }
 * Response on success: { ok: true, test_send_id, graph_message_id, warnings }
 * Response on failure: { error, test_send_id, graph_status?, graph_code?, warnings }
 *
 * Attachment flags on the template are intentionally ignored at test-send
 * time because there is no transaction context. The response warnings
 * array surfaces this if the template has attachments configured.
 */

type Params = { params: Promise<{ id: string }> | { id: string } }

async function resolveId(params: Params['params']): Promise<string | null> {
  const resolved = params instanceof Promise ? await params : params
  const id = resolved?.id
  if (!id || typeof id !== 'string') return null
  return id
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  const id = await resolveId(params)
  if (!id) {
    return NextResponse.json({ error: 'Template id is required' }, { status: 400 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { fromEmail, toEmail } = (rawBody || {}) as {
    fromEmail?: unknown
    toEmail?: unknown
  }

  if (typeof fromEmail !== 'string' || !EMAIL_REGEX.test(fromEmail.trim())) {
    return NextResponse.json(
      { error: 'fromEmail must be a valid email address' },
      { status: 400 }
    )
  }
  if (typeof toEmail !== 'string' || !EMAIL_REGEX.test(toEmail.trim())) {
    return NextResponse.json(
      { error: 'toEmail must be a valid email address' },
      { status: 400 }
    )
  }

  const from = fromEmail.trim()
  const to = toEmail.trim()

  // --- Load everything we need in parallel --------------------------------
  const [tplRes, settingsRes, vendorsRes, countyRes] = await Promise.all([
    supabase.from('tc_email_templates').select('*').eq('id', id).maybeSingle(),
    supabase.from('tc_settings').select('*').maybeSingle(),
    supabase
      .from('preferred_vendors')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('homestead_counties')
      .select('*')
      .eq('county_name', 'Harris')
      .eq('state', 'TX')
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (tplRes.error) {
    console.error('send-test: template load error', tplRes.error)
    return NextResponse.json(
      { error: 'Failed to load template', details: tplRes.error.message },
      { status: 500 }
    )
  }
  if (!tplRes.data) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }
  const template = tplRes.data as TcEmailTemplate

  if (!template.is_active) {
    return NextResponse.json(
      { error: 'Template is archived. Reactivate it before sending a test.' },
      { status: 400 }
    )
  }
  if (!template.subject || !template.subject.trim()) {
    return NextResponse.json(
      { error: 'Template has no subject line.' },
      { status: 400 }
    )
  }
  const rawTemplateBody = template.html_body || template.plain_body || ''
  if (!rawTemplateBody.trim()) {
    return NextResponse.json(
      { error: 'Template has no body content.' },
      { status: 400 }
    )
  }

  if (settingsRes.error) {
    console.error('send-test: settings load error', settingsRes.error)
    return NextResponse.json(
      { error: 'Failed to load TC settings', details: settingsRes.error.message },
      { status: 500 }
    )
  }
  if (!settingsRes.data) {
    return NextResponse.json(
      {
        error:
          'TC settings have not been configured yet. Open /admin/tc/settings, save the office fields, then try again.',
      },
      { status: 400 }
    )
  }
  const settings = settingsRes.data as TcSettings

  if (vendorsRes.error) {
    console.error('send-test: vendors load error', vendorsRes.error)
    return NextResponse.json(
      { error: 'Failed to load vendors', details: vendorsRes.error.message },
      { status: 500 }
    )
  }
  const vendors = (vendorsRes.data || []) as PreferredVendor[]

  // County error is non-fatal; we warn below.
  if (countyRes.error) {
    console.error('send-test: harris county load error', countyRes.error)
  }
  const harrisCounty = (countyRes.data || null) as HomesteadCounty | null

  // --- Build warnings and context ----------------------------------------
  const warnings: string[] = []
  if (isHarrisCountyMissing(harrisCounty)) {
    warnings.push(
      'Harris County homestead link is not configured. The homestead link token was left blank in this test send.'
    )
  }
  if (template.attach_documents && template.attach_documents.length > 0) {
    warnings.push(
      `Template flags attachments (${template.attach_documents.join(
        ', '
      )}). Test sends do not attach documents. The real send on a live transaction will include them.`
    )
  }

  const ctx = buildTestContext({
    admin: {
      email: auth.user.email,
      first_name: auth.user.first_name,
      last_name: auth.user.last_name,
      preferred_first_name: auth.user.preferred_first_name,
      preferred_last_name: auth.user.preferred_last_name,
    },
    settings,
    vendors,
    harrisCounty,
    fromEmail: from,
  })

  // --- Render subject (text) and body (html, then wrap) ------------------
  const subjectResolved = renderMergeFields(template.subject, ctx, 'text')
  const bodyMerged = renderMergeFields(rawTemplateBody, ctx, 'html')
  const bodyHtml = wrapTcEmail({
    bodyHtml: bodyMerged,
    usesBanner: template.uses_banner,
    usesSignature: template.uses_signature,
    settings,
  })

  // --- Insert pending audit row ------------------------------------------
  const insertRes = await supabase
    .from('tc_test_sends')
    .insert({
      template_id: template.id,
      template_slug: template.slug,
      sent_by_user_id: auth.user.id,
      from_email: from,
      to_email: to,
      subject_resolved: subjectResolved,
      body_resolved: bodyHtml,
      status: 'pending',
    })
    .select()
    .single()

  if (insertRes.error || !insertRes.data) {
    console.error('send-test: insert audit error', insertRes.error)
    return NextResponse.json(
      {
        error: 'Failed to record test send',
        details: insertRes.error?.message,
      },
      { status: 500 }
    )
  }
  const testSendId = insertRes.data.id as string

  // --- Send via Graph ----------------------------------------------------
  try {
    const result = await sendMailAs({
      fromUpn: from,
      to,
      subject: subjectResolved,
      html: bodyHtml,
      replyTo: settings.default_reply_to || undefined,
      saveToSentItems: true,
    })

    const updateRes = await supabase
      .from('tc_test_sends')
      .update({
        status: 'sent',
        graph_message_id: result.messageId,
        sent_at: new Date().toISOString(),
      })
      .eq('id', testSendId)

    if (updateRes.error) {
      // The email sent successfully but we failed to update the audit row.
      // Log but still return success to the user so they know the email
      // went out.
      console.error('send-test: audit row update failed after successful send', updateRes.error)
    }

    return NextResponse.json({
      ok: true,
      test_send_id: testSendId,
      graph_message_id: result.messageId,
      warnings,
    })
  } catch (err) {
    const isGraphErr = err instanceof GraphMailError
    const userMessage = isGraphErr
      ? err.userMessage
      : err instanceof Error
        ? err.message
        : 'Unknown send error'
    const graphStatus = isGraphErr ? err.statusCode : null
    const graphCode = isGraphErr ? err.code : null

    await supabase
      .from('tc_test_sends')
      .update({ status: 'failed', last_error: userMessage })
      .eq('id', testSendId)

    // Mirror the Graph HTTP status for 4xx so the client can surface
    // actionable errors. For 5xx or non-Graph errors, return 502 so we do
    // not falsely report a client-side problem.
    const responseStatus =
      graphStatus && graphStatus >= 400 && graphStatus < 500 ? graphStatus : 502

    return NextResponse.json(
      {
        error: userMessage,
        test_send_id: testSendId,
        graph_status: graphStatus,
        graph_code: graphCode,
        warnings,
      },
      { status: responseStatus }
    )
  }
}
