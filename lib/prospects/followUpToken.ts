import { SignJWT, jwtVerify } from 'jose'

/**
 * Tokens for the optional follow-up questions a prospect can answer after the
 * prospective agent form is already submitted.
 *
 * These deliberately do NOT reuse users.campaign_token. That value is the
 * onboarding credential (lib/email.ts builds /onboard/{campaign_token} from
 * it) and the campaign routes also accept it to edit name, personal email,
 * phone, date of birth and shipping address. This token travels in a success
 * page URL and in an email link, so it is scoped to one thing only: appending
 * four free-text answers to one prospect record.
 */

const PURPOSE = 'prospect-follow-up'

/**
 * The link also ships in the welcome email, so it has to survive someone
 * coming back to it days later. Long enough to be useful, short enough that a
 * forwarded email stops working eventually.
 */
const TOKEN_LIFETIME = '30d'

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!)
}

export async function createFollowUpToken(prospectId: string): Promise<string> {
  return new SignJWT({ prospectId, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(secret())
}

/**
 * Returns the prospect id, or null for anything invalid: bad signature,
 * expired, or a token minted for some other purpose. Checking `purpose`
 * stops a token from another feature that happens to carry a prospectId
 * claim from being accepted here.
 */
export async function verifyFollowUpToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.purpose !== PURPOSE) return null
    const prospectId = payload.prospectId
    return typeof prospectId === 'string' && prospectId ? prospectId : null
  } catch {
    return null
  }
}
