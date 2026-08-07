import { supabaseAdmin } from '@/lib/supabase'

const PAYLOAD_SECRET_KEY = process.env.PAYLOAD_SECRET_KEY || ''

const authHeader = () =>
  'Basic ' + Buffer.from(PAYLOAD_SECRET_KEY + ':').toString('base64')

/**
 * Deletes a Payload payment link.
 *
 * Lifted from the tenant payment webhook, which defined it privately and was
 * the only caller. It is needed in a second place now, and two copies of a
 * function that deletes a payment instrument is how they drift, so the webhook
 * imports this one rather than keeping its own.
 */
export async function deletePayloadPaymentLink(paymentLinkId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.payload.com/payment_links/${paymentLinkId}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader() },
    })
    if (res.ok) {
      console.log('Deleted Payload payment link:', paymentLinkId)
      return true
    }
    console.log('Failed to delete payment link:', paymentLinkId, res.status)
    return false
  } catch (err) {
    console.error('Error deleting payment link:', paymentLinkId, err)
    return false
  }
}

/** Deletes a Payload invoice. Same provenance as the function above. */
export async function deletePayloadInvoice(invoiceId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.payload.com/invoices/${invoiceId}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader() },
    })
    if (res.ok) {
      console.log('Deleted Payload invoice:', invoiceId)
      return true
    }
    console.log('Failed to delete invoice:', invoiceId, res.status)
    return false
  } catch (err) {
    console.error('Error deleting invoice:', invoiceId, err)
    return false
  }
}

/**
 * Voids the Payload payment link on a tenant invoice whose amount has changed.
 *
 * A Payload payment link is minted once, for a fixed amount, and nothing in
 * this app amends one -- every call to Payload is a create. So once a late fee
 * moves the invoice total, the outstanding link still collects the old figure,
 * and the payment webhook closes the invoice at whatever actually arrived
 * regardless of what is owed. The tenant pays in good faith, the invoice reads
 * paid, and the difference is silently written off.
 *
 * Voiding the link and clearing the stored ids is what makes the next link mint
 * at the current total, whether that comes from an admin re-sending the invoice
 * or from the tenant opening the portal, which mints on demand. Best-effort on
 * purpose: the ledger figure is already correct, so a Payload outage must not
 * roll back the fee. What it must not do is leave a live link pointing at a
 * stale amount, which is why the columns are only cleared when Payload confirms
 * the link is gone.
 *
 * Returns true when the invoice no longer has a usable link.
 */
export async function voidStalePaymentLink(invoice: {
  id: string
  payload_payment_link_id?: string | null
  payload_payment_link_url?: string | null
  payload_invoice_id?: string | null
}): Promise<boolean> {
  if (!invoice.payload_payment_link_url && !invoice.payload_payment_link_id) {
    return true
  }

  let linkGone = true
  if (invoice.payload_payment_link_id) {
    linkGone = await deletePayloadPaymentLink(invoice.payload_payment_link_id)
  }
  // The bill behind the link is deleted too, so a stale unpaid invoice does not
  // linger in Payload against the tenant's customer record. Its outcome does not
  // gate the clear: the link is what the tenant can actually pay through.
  if (linkGone && invoice.payload_invoice_id) {
    await deletePayloadInvoice(invoice.payload_invoice_id)
  }

  if (!linkGone) {
    console.error(
      'Could not void the stale Payload link on invoice',
      invoice.id,
      '- the stored link is left in place so the amount mismatch stays visible'
    )
    return false
  }

  const { error } = await supabaseAdmin
    .from('tenant_invoices')
    .update({
      payload_payment_link_id: null,
      payload_payment_link_url: null,
      payload_invoice_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
  if (error) {
    console.error('Failed to clear the voided link on invoice', invoice.id, error)
    return false
  }
  return true
}
