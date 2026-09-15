/**
 * The one place an agent invoice is created in Payload.
 *
 * Every agent invoice has to declare whether automatic collection may touch it.
 * The monthly brokerage fee is the only one an agent may put on autopay; the
 * onboarding fee and anything the office types by hand must be looked at before
 * it is paid. Payload does not document a default for `autopay_allowed`
 * (https://docs.payload.com/apis/object-reference/invoices/), so leaving it
 * unsaid means leaving it unknown.
 *
 * It lives here rather than being repeated at each call site because "set this
 * flag in three places and remember to set it in the fourth" is a rule that
 * gets broken. The first version of this change set it in two of three places
 * and the missing one was the join invoice.
 *
 * ## Why this writes the flag and then reads it back
 *
 * Payload's create endpoint is form-urlencoded, where every value is a string,
 * and Payload publishes no example anywhere of a boolean being set that way.
 * If it treats the non-empty string "false" as true, an invoice we meant to
 * exempt becomes automatically chargeable, which is real money out of an
 * agent's card without them approving it.
 *
 * So the invoice is read back and the flag is checked. `autopay_allowed`
 * appears in the documented example Invoice response body, so a plain GET
 * returns it. The result is reported to the caller as `autopayConfirmed`.
 *
 * That costs one extra GET per invoice created. The monthly cron creates about
 * 55 invoices once a month, which is nothing against Payload's limits, and it
 * means the first invoice after deploy answers the question from real data
 * instead of from someone remembering to check.
 *
 * ## Why it reports rather than repairs
 *
 * An earlier version of this file corrected a wrong flag with
 * `PUT /invoices/{id}` carrying only `autopay_allowed`. That is not safe.
 * Payload's API design page, under "Changes to a Nested Object Tree" ->
 * "Deleting an Existing Nested Object", says: "Remove the nested object from
 * the parent's object tree in an update operation and the object will be
 * deleted." Line items are nested objects on an invoice, so a PUT that omits
 * them is that sentence. https://docs.payload.com/apis/api-design/
 *
 * `app/api/cron/apply-late-fees/route.ts` reached the same conclusion
 * independently and appends via `POST /line_items/` for exactly this reason.
 *
 * Worse, the repair would have fired precisely when the flag was wrong, which
 * is the onboarding and custom invoices asking for false. A custom invoice
 * carries no top-level description, so its line item is its only label and its
 * only amount: emptying it leaves the agent owing money against an invoice that
 * reads as nothing at zero dollars.
 *
 * Reporting is the correct behaviour. A flag that did not land means autopay
 * does not collect that invoice, and someone pays it by hand, which is exactly
 * what happens today. There is no safe documented repair for a scalar field on
 * an invoice, so this does not invent one.
 */

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export type AgentInvoiceResult = {
  ok: boolean
  /** Payload's invoice object, present when ok. */
  invoice?: any
  /** Payload's error payload, present when the create failed. */
  error?: any
  /**
   * True when the invoice was read back and autopay_allowed matched what was
   * asked for. False means the create succeeded but the flag could not be
   * confirmed, which callers should log: the invoice exists and is payable,
   * but its automatic-collection state is not what was intended.
   */
  autopayConfirmed: boolean
}

const postInvoice = (params: URLSearchParams) =>
  fetch('https://api.payload.com/invoices/', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

/**
 * Creates an agent invoice with `autopay_allowed` set, then reads it back and
 * reports whether the flag landed.
 *
 * `params` is the caller's existing form body. Any autopay_allowed already on
 * it is replaced, so the decision is made here and nowhere else.
 *
 * ## The flag never blocks the invoice
 *
 * `autopay_allowed` is documented as an optional writable attribute on the
 * Invoice object, but this app has never sent it and there is no live key here
 * to prove Payload accepts it. If it turns out to be rejected, the cost of
 * finding out must not be that nobody can be billed: the monthly cron would
 * fail for every agent, and a new agent could not pay their join invoice, which
 * is the one screen standing between them and joining the brokerage.
 *
 * So a 4xx on the first attempt is retried once without the flag. A 4xx means
 * Payload rejected the request and created nothing, so the retry cannot
 * duplicate an invoice. A 5xx or a network failure is NOT retried, because
 * those can leave an invoice created, and a second attempt would bill someone
 * twice.
 *
 * The retry succeeds with `autopayConfirmed: false`, which every caller already
 * reports: the cron lists them in `autopay_unconfirmed`, the other two log the
 * invoice id. So the invoice exists and is payable, and the office is told the
 * autopay setting needs doing by hand in the Payload dashboard.
 */
export async function createAgentInvoice(
  params: URLSearchParams,
  opts: { autopayAllowed: boolean }
): Promise<AgentInvoiceResult> {
  const want = opts.autopayAllowed

  params.set('autopay_allowed', want ? 'true' : 'false')

  let res = await postInvoice(params)
  let invoice = await res.json().catch(() => null)

  // Payload rejected the request outright, so nothing was created and the
  // flag is the only thing this patch added to it. Create the invoice without
  // it rather than leave the caller unable to bill anyone.
  if (!res.ok && res.status >= 400 && res.status < 500) {
    console.error(
      'Payload rejected the invoice with autopay_allowed set (status',
      res.status,
      '). Retrying without it. The invoice autopay setting must be applied by hand.',
      invoice
    )
    params.delete('autopay_allowed')
    res = await postInvoice(params)
    invoice = await res.json().catch(() => null)

    if (res.ok && invoice?.id) {
      console.error(
        'Invoice',
        invoice.id,
        'was created WITHOUT an autopay setting. Set autopay',
        want ? 'on' : 'off',
        'for it in the Payload dashboard.'
      )
      return { ok: true, invoice, autopayConfirmed: false }
    }
  }

  if (!res.ok) {
    return { ok: false, error: invoice, autopayConfirmed: false }
  }

  // A success status with no readable invoice id is not a success the callers
  // can use: every one of them reads `.id` next. Reported as a failure with a
  // provider-shaped message rather than left to throw a TypeError two lines
  // later. The invoice may still exist at Payload, so the message says so.
  if (!invoice?.id) {
    console.error('Payload returned a success status with no invoice id:', invoice)
    return {
      ok: false,
      error: {
        message:
          'The payment provider accepted the invoice but did not return it. Check Payload before creating it again.',
      },
      autopayConfirmed: false,
    }
  }

  const confirmed = await confirmAutopayFlag(invoice.id, want)

  return { ok: true, invoice, autopayConfirmed: confirmed }
}

/**
 * Reads the invoice back and reports whether autopay_allowed is what was asked
 * for. Read only: it never writes to the invoice. See the note above on why a
 * correction is not attempted.
 *
 * Never throws. A network failure here must not fail an invoice Payload already
 * created, or the caller would report an error for an invoice that exists and
 * then create a second one on retry.
 */
async function confirmAutopayFlag(invoiceId: string, want: boolean): Promise<boolean> {
  try {
    const r = await fetch(`https://api.payload.com/invoices/${invoiceId}`, {
      headers: { Authorization: authHeader() },
    })
    if (!r.ok) {
      console.error('Could not read back invoice', invoiceId, 'status', r.status)
      return false
    }

    const inv = await r.json().catch(() => null)
    const got = typeof inv?.autopay_allowed === 'boolean' ? inv.autopay_allowed : null

    if (got === want) return true

    console.error(
      'Payload autopay_allowed is not what was requested on invoice',
      invoiceId,
      'wanted',
      want,
      'read back',
      got,
      want === false
        ? 'This invoice may be collectable by autopay. Switch it off in the Payload dashboard.'
        : 'Autopay will not collect this invoice. It must be paid by hand.'
    )
    return false
  } catch (err) {
    console.error('Payload autopay_allowed verification failed for invoice', invoiceId, err)
    return false
  }
}
