const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * Keep an agent's Payload customer account pointed at their current email.
 *
 * Agents onboard with a personal email, so their Payload customer (created
 * at the $399 payment) carries that address. When systems access assigns
 * their office email, the Payload account must follow: bank activation
 * requests send only a name and email to Payload, and Payload auto-creates
 * a brand-new empty customer when the email does not match an existing one.
 * That is how duplicate "ghost" accounts were born, and how one agent's
 * bank connection ended up attached to a ghost that later got deleted.
 *
 * Called when the office email is assigned (activation) and defensively
 * before every bank activation request, so the linked account and the email
 * Payload matches on can never drift apart again.
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
