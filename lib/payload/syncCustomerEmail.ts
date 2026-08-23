const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * Keep an agent's Payload customer account pointed at their current email.
 *
 * Agents onboard with a personal email, so their Payload customer (created
 * at the $399 payment) carries that address. When systems access assigns
 * their office email, the billing customer should carry the current one, and
 * this is what updates it.
 *
 * What this does NOT do is prevent Payload creating a second customer.
 * Payload's bank activation flow creates a new customer as a matter of
 * course and lets the person type any email they like on it: Tara connected
 * her own bank and watched Payload create a separate customer carrying the
 * same email she had entered. So matching the email is not a de-duplication
 * mechanism, and an earlier version of this comment claiming it stopped
 * Payload creating duplicate customers was wrong. The sync is worth keeping -
 * a billing customer with a stale email is its own problem - but the
 * separate payout customer is the reason users.payload_payout_customer_id
 * exists, and that pointer, not this sync, is what keeps a bank connection
 * attached to the right customer.
 *
 * Called when the office email is assigned (activation) and defensively
 * before every bank activation request.
 *
 * Fire-and-forget: a Payload hiccup must never fail activation or a bank
 * request. Failures log and the sync retries naturally on the next call.
 */
export async function syncPayloadCustomerEmail(
  payloadPayeeId: string | null | undefined,
  email: string | null | undefined
): Promise<void> {
  if (!payloadPayeeId || !email) return
  if (!process.env.PAYLOAD_SECRET_KEY) return
  try {
    const res = await fetch(`https://api.payload.com/customers/${payloadPayeeId}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ email }),
    })
    if (!res.ok) {
      console.error(
        'syncPayloadCustomerEmail failed for customer',
        payloadPayeeId,
        res.status,
        await res.text().catch(() => '')
      )
    }
  } catch (err) {
    console.error('syncPayloadCustomerEmail threw for customer', payloadPayeeId, err)
  }
}
