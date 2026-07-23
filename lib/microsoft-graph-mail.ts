import { getGraphToken } from './microsoft-graph'

/**
 * Microsoft Graph Mail.Send helper.
 *
 * Uses /users/{upn}/sendMail because /me/sendMail is not available with
 * client-credentials (application) auth. The Azure app must have Mail.Send
 * granted as an Application permission, tenant-wide, with admin consent.
 *
 * Graph returns 202 Accepted with an empty body on success. It does NOT
 * return a message id from this endpoint; if an Outlook message id is
 * needed later, the only way to get it is by listing recent Sent Items.
 * For test sends we accept a null messageId and rely on the sent_at
 * timestamp + status='sent' columns in tc_test_sends for audit.
 */

export class GraphMailError extends Error {
  readonly statusCode: number
  readonly code: string | null
  readonly userMessage: string
  readonly detail: unknown

  constructor(
    statusCode: number,
    code: string | null,
    userMessage: string,
    detail: unknown = null
  ) {
    super(userMessage)
    this.name = 'GraphMailError'
    this.statusCode = statusCode
    this.code = code
    this.userMessage = userMessage
    this.detail = detail
  }
}

export interface SendMailInput {
  /** UPN of the sending mailbox (e.g., "leah@collectiverealtyco.com"). */
  fromUpn: string
  /** Single recipient address or array of addresses. */
  to: string | string[]
  /** Subject line. Plain text, no merge tokens at this layer. */
  subject: string
  /** Fully rendered HTML body. */
  html: string
  /** Optional CC address(es). */
  cc?: string | string[]
  /** Optional BCC address(es). */
  bcc?: string | string[]
  /** Optional reply-to address. */
  replyTo?: string
  /** Whether Graph should save a copy in the sender's Sent Items. Default true. */
  saveToSentItems?: boolean
  /** Optional file attachments (e.g., a CDA PDF + wiring instructions). */
  attachments?: MailAttachment[]
}

export interface MailAttachment {
  /** File name shown in the email, e.g., "123 Main St._2026-07-23_CDA.pdf". */
  filename: string
  /** MIME type, e.g., "application/pdf". */
  contentType: string
  /** Raw file bytes. Base64-encoded internally before sending to Graph. */
  content: Uint8Array | Buffer
}

export interface SendMailResult {
  /** Graph's sendMail endpoint does not return a message id. Always null. */
  messageId: string | null
}

function toRecipientList(val: string | string[] | undefined): { emailAddress: { address: string } }[] {
  if (!val) return []
  const arr = Array.isArray(val) ? val : [val]
  return arr.filter(Boolean).map(a => ({ emailAddress: { address: a } }))
}

export async function sendMailAs(input: SendMailInput): Promise<SendMailResult> {
  const {
    fromUpn,
    to,
    subject,
    html,
    cc,
    bcc,
    replyTo,
    saveToSentItems = true,
    attachments,
  } = input

  const token = await getGraphToken()

  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: 'HTML',
      content: html,
    },
    toRecipients: toRecipientList(to),
  }

  const ccList = toRecipientList(cc)
  if (ccList.length > 0) message.ccRecipients = ccList

  const bccList = toRecipientList(bcc)
  if (bccList.length > 0) message.bccRecipients = bccList

  if (replyTo) {
    message.replyTo = [{ emailAddress: { address: replyTo } }]
  }

  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType,
      contentBytes: Buffer.from(a.content).toString('base64'),
    }))
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromUpn)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems }),
    }
  )

  if (res.status === 202) {
    return { messageId: null }
  }

  let detail: unknown = null
  let graphCode: string | null = null
  let graphMessage: string | null = null
  try {
    const parsed: unknown = await res.json()
    detail = parsed
    const errObj = (parsed as { error?: { code?: string; message?: string } })?.error
    if (errObj) {
      graphCode = errObj.code ?? null
      graphMessage = errObj.message ?? null
    }
  } catch {
    try {
      detail = await res.text()
    } catch {
      detail = null
    }
  }

  const userMessage = translateGraphMailError(res.status, graphCode, graphMessage)
  throw new GraphMailError(res.status, graphCode, userMessage, detail)
}

function translateGraphMailError(
  status: number,
  code: string | null,
  message: string | null
): string {
  if (status === 401) {
    return 'Microsoft Graph token was rejected. Check that the Azure app credentials are correct and consent is granted.'
  }
  if (status === 403) {
    const suffix = code ? ` (${code})` : ''
    return `The sender mailbox is not licensed for Exchange Online, or Mail.Send is not consented for this mailbox.${suffix}`
  }
  if (status === 404) {
    return 'Sender mailbox not found. Confirm the From address is a real user in the tenant.'
  }
  if (status === 400) {
    return `Microsoft Graph rejected the message${message ? `: ${message}` : ''}.`
  }
  if (status === 429) {
    return 'Microsoft Graph rate limit hit. Wait a minute and try again.'
  }
  if (message) return message
  return `Microsoft Graph returned HTTP ${status} when sending the message.`
}
