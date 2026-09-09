import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import {
  COMMISSION_OFFSET_TYPE,
  COMMISSION_OFFSET_DESCRIPTION,
  COMMISSION_OFFSET_REVERSAL_TYPE,
  isStagedCommissionOffset,
  isCommissionOffsetReversal,
} from '@/lib/payload/commissionOffsetItems'

export const dynamic = 'force-dynamic'

const PAYLOAD_API = 'https://api.payload.com'

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * Look at what Payload actually says about one invoice, and optionally try one
 * line item delete and report exactly what came back.
 *
 * This exists because every claim made about the commission-offset delete has
 * been inference. Nobody working on this code has been able to see Payload's
 * side of the call, so a silent no-op and a working delete have looked
 * identical from here for a week. This route makes Payload's own answer
 * readable from the browser.
 *
 * GET  ?invoice_id=inv_x   Read only. Dumps the invoice and every line item
 *                          verbatim, plus WHY each line does or does not match
 *                          the predicates the offset removal uses.
 * POST { invoice_id, line_item_id }
 *                          Attempts DELETE /line_items/{line_item_id} and
 *                          reports the raw HTTP status and response body, with
 *                          the invoice's balance and line count before and
 *                          after. Nothing is deleted unless a line_item_id is
 *                          passed explicitly.
 *
 * String fields are reported with their exact length alongside the value,
 * because a trailing space or a different dash is invisible on screen and is
 * exactly the kind of thing that makes an equality match fail.
 */

interface StringProbe {
  value: string | null
  length: number | null
}

function probe(v: unknown): StringProbe {
  if (v === null || v === undefined) return { value: null, length: null }
  const s = String(v)
  return { value: s, length: s.length }
}

async function fetchInvoice(invoiceId: string) {
  const res = await fetch(
    `${PAYLOAD_API}/invoices/${invoiceId}?fields[]=*&fields[]=items`,
    { headers: { Authorization: authHeader() } }
  )
  const body = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(body)
  } catch {
    // Left null on purpose. A non-JSON body is itself the finding.
  }
  return { ok: res.ok, status: res.status, body, invoice: parsed }
}

function describeItems(invoice: any) {
  return (invoice?.items || []).map((i: any) => {
    const typeProbe = probe(i?.type)
    const descProbe = probe(i?.description)
    const typeMatches = typeProbe.value === COMMISSION_OFFSET_TYPE
    const descMatches = descProbe.value === COMMISSION_OFFSET_DESCRIPTION
    return {
      id: i?.id ?? null,
      type: typeProbe,
      description: descProbe,
      amount: i?.amount ?? null,
      entry_type: i?.entry_type ?? null,
      // The whole point of the route: not "is this an offset" but "why not".
      match: {
        counts_as_staged_offset: isStagedCommissionOffset(i),
        counts_as_offset_reversal: isCommissionOffsetReversal(i),
        type_matches_expected: typeMatches,
        description_matches_expected: descMatches,
        why: isStagedCommissionOffset(i)
          ? 'Matches. The offset removal would delete this line.'
          : isCommissionOffsetReversal(i)
            ? 'Matches as an old reversal charge. The offset removal would delete this line.'
            : !typeMatches
              ? `Type is not "${COMMISSION_OFFSET_TYPE}", so this line is left alone.`
              : `Type matches but description is not exactly "${COMMISSION_OFFSET_DESCRIPTION}", so this line is left alone. This is the two-field guard that stops a manually recorded Commission Offset settlement being deleted.`,
      },
    }
  })
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const invoiceId = request.nextUrl.searchParams.get('invoice_id')
    if (!invoiceId) {
      return NextResponse.json(
        { error: 'invoice_id is required, e.g. ?invoice_id=inv_3fPo33apHAV4jPYMR53dE' },
        { status: 400 }
      )
    }

    const fetched = await fetchInvoice(invoiceId)
    if (!fetched.ok) {
      return NextResponse.json({
        invoice_id: invoiceId,
        payload_http_status: fetched.status,
        payload_response_body: fetched.body,
        note: 'Payload refused the invoice lookup. The body above is its exact reply.',
      })
    }

    const inv = fetched.invoice
    const items = describeItems(inv)

    return NextResponse.json({
      invoice_id: invoiceId,
      payload_http_status: fetched.status,
      invoice: {
        status: probe(inv?.status),
        amount_due: inv?.amount_due ?? null,
        total_due: inv?.total_due ?? null,
        total_paid: inv?.total_paid ?? null,
        description: probe(inv?.description),
        due_date: inv?.due_date ?? null,
        paid_timestamp: inv?.paid_timestamp ?? null,
      },
      expected_strings: {
        offset_type: probe(COMMISSION_OFFSET_TYPE),
        offset_description: probe(COMMISSION_OFFSET_DESCRIPTION),
        reversal_type: probe(COMMISSION_OFFSET_REVERSAL_TYPE),
      },
      line_item_count: items.length,
      lines_the_removal_would_delete: items.filter(
        (i: any) => i.match.counts_as_staged_offset || i.match.counts_as_offset_reversal
      ).length,
      items,
      how_to_test_a_delete:
        'POST to this same URL with JSON { "invoice_id": "...", "line_item_id": "..." } to attempt one delete and see Payload\'s raw reply.',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { invoice_id, line_item_id } = await request.json()
    if (!invoice_id || !line_item_id) {
      return NextResponse.json(
        { error: 'invoice_id and line_item_id are both required. Nothing is deleted without an explicit line_item_id.' },
        { status: 400 }
      )
    }

    const before = await fetchInvoice(invoice_id)
    const beforeSummary = {
      amount_due: before.invoice?.amount_due ?? null,
      status: before.invoice?.status ?? null,
      line_item_count: (before.invoice?.items || []).length,
    }

    // The call under test. Reported verbatim, pass or fail.
    const url = `${PAYLOAD_API}/line_items/${line_item_id}`
    let deleteStatus: number | null = null
    let deleteBody = ''
    let threw: string | null = null
    try {
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: authHeader() } })
      deleteStatus = res.status
      deleteBody = await res.text()
    } catch (err) {
      threw = String(err)
    }

    const after = await fetchInvoice(invoice_id)
    const afterSummary = {
      amount_due: after.invoice?.amount_due ?? null,
      status: after.invoice?.status ?? null,
      line_item_count: (after.invoice?.items || []).length,
    }

    const lineGone =
      !(after.invoice?.items || []).some((i: any) => String(i?.id) === String(line_item_id))

    return NextResponse.json({
      attempted: { method: 'DELETE', url },
      payload_http_status: deleteStatus,
      payload_response_body: deleteBody,
      request_threw: threw,
      before: beforeSummary,
      after: afterSummary,
      line_item_is_gone: lineGone,
      // The status code alone is not the answer. A 2xx that leaves the line in
      // place is the exact failure that has been invisible until now.
      verdict: threw
        ? 'The request never completed. See request_threw.'
        : lineGone
          ? 'The line item was removed. DELETE on a line item works.'
          : `The line item is STILL on the invoice after an HTTP ${deleteStatus}. DELETE does not remove a line item, whatever the status code says.`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
