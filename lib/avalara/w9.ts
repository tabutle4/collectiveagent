// Avalara 1099 & W-9 API (A1099 v2) client.
//
// Replaces the retired Track1099 v1 API (www.track1099.com/api/v1/{team}/form_requests),
// which authenticated with a static bearer token and returned "not verified" after
// Avalara migrated to the IRS IRIS platform.
//
// A1099 v2 uses OAuth2 client credentials: POST client_id/client_secret to the identity
// URL, get back an access_token valid for expires_in seconds, then send that as a Bearer
// token on every API request. Verified live 2026-08-23 against production: token exchange,
// avalara-version 2.0, company lookup, $create-and-send-email, and GET by form id all
// confirmed working, including an IRS TIN match returning "Matched".
//
// Docs: https://developer.avalara.com/products/avalara-1099-and-w9/api/

const AVALARA_VERSION = '2.0'

function baseUrl(): string {
  return process.env.AVALARA_1099_BASE_URL || 'https://api.avalara.com/avalara1099'
}

function identityUrl(): string {
  return process.env.AVALARA_IDENTITY_URL || 'https://identity.avalara.com/connect/token'
}

export function avalaraConfigured(): boolean {
  return Boolean(process.env.AVALARA_CLIENT_ID && process.env.AVALARA_CLIENT_SECRET)
}

// Tokens last 3600s. Cache in module scope and refresh 60s before expiry so a warm
// lambda reuses one token instead of minting one per request.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value

  const clientId = process.env.AVALARA_CLIENT_ID
  const clientSecret = process.env.AVALARA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Avalara credentials are not configured')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(identityUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `Avalara token request failed (${res.status}): ${data?.error_description || data?.error || 'no access_token returned'}`
    )
  }

  const ttl = Number(data.expires_in) || 3600
  cachedToken = { value: data.access_token, expiresAt: now + (ttl - 60) * 1000 }
  return cachedToken.value
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'avalara-version': AVALARA_VERSION,
    'Content-Type': 'application/json',
  }
}

// Which Avalara company a form is filed under. These are two separate legal entities
// and filing under the wrong one is a tax problem, so the caller must be explicit.
export function companyIdFor(isReferral: boolean): string | undefined {
  return isReferral
    ? process.env.TRACK1099_RC_COMPANY_ID
    : process.env.TRACK1099_CRC_COMPANY_ID
}

export interface W9SendResult {
  ok: boolean
  formId?: string
  error?: string
}

// Creates a W-9 form and has Avalara email the request directly to the recipient.
// Avalara owns the email and the signing page, so there is no embedded widget, no
// single-use link, and no one-hour expiry to strand someone mid-flow.
export async function createAndSendW9({
  email,
  name,
  companyId,
  referenceId,
}: {
  email: string
  name: string
  companyId: string
  referenceId: string
}): Promise<W9SendResult> {
  try {
    const token = await getAccessToken()

    const res = await fetch(`${baseUrl()}/w9/forms/$create-and-send-email`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        type: 'W9',
        email,
        name,
        companyId,
        referenceId,
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      const detail =
        data?.error?.message || data?.message || data?.title || `HTTP ${res.status}`
      console.error('Avalara createAndSendW9 failed:', detail, data)
      return { ok: false, error: detail }
    }

    const formId = data?.id != null ? String(data.id) : undefined
    if (!formId) {
      console.error('Avalara createAndSendW9 returned no id:', data)
      return { ok: false, error: 'Avalara did not return a form id' }
    }

    return { ok: true, formId }
  } catch (e: any) {
    console.error('Avalara createAndSendW9 threw:', e)
    return { ok: false, error: e?.message || 'Avalara request failed' }
  }
}

export interface W9FormStatus {
  ok: boolean
  signed: boolean
  status?: string
  signedDate?: string | null
  tinMatchStatus?: string | null
  error?: string
}

// Reads a form's current state. entryStatus.status becomes 'signed' and signedDate
// populates once the recipient completes it; tinMatchStatus reports the IRS
// name/TIN match ('Matched', 'Pending', and so on).
export async function getW9FormStatus(formId: string): Promise<W9FormStatus> {
  try {
    const token = await getAccessToken()

    const res = await fetch(`${baseUrl()}/w9/forms/${encodeURIComponent(formId)}`, {
      method: 'GET',
      headers: authHeaders(token),
    })

    if (res.status === 404) {
      return { ok: false, signed: false, error: 'Form not found' }
    }

    const data = await res.json().catch(() => null)

    if (!res.ok || !data) {
      return { ok: false, signed: false, error: `HTTP ${res.status}` }
    }

    const status = data?.entryStatus?.status ?? null
    const signedDate = data?.signedDate ?? null

    return {
      ok: true,
      signed: status === 'signed' || Boolean(signedDate),
      status: status || undefined,
      signedDate,
      tinMatchStatus: data?.tinMatchStatus?.status ?? null,
    }
  } catch (e: any) {
    console.error('Avalara getW9FormStatus threw:', e)
    return { ok: false, signed: false, error: e?.message || 'Avalara request failed' }
  }
}
