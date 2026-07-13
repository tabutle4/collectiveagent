import crypto from 'crypto'

// Seller dashboard magic links, used by listing coordination so a seller can
// open their dashboard without an account. This is NOT the old agent form
// token system, which was removed once every agent had app access.

export async function generateMagicLink(listingId: string, sellerEmail: string): Promise<string> {
  const randomBytes = crypto.randomBytes(32)
  const combined = `${listingId}:${randomBytes.toString('hex')}`
  const token = Buffer.from(combined).toString('base64url')
  return token
}

export function validateMagicLink(token: string): { listingId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const [listingId] = decoded.split(':')
    if (!listingId) {
      return null
    }
    return { listingId }
  } catch (error) {
    console.error('Error validating magic link:', error)
    return null
  }
}

export function getMagicLinkUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'
  return `${baseUrl}/seller/${token}`
}

// Note: seller magic links do NOT expire by default. They stay valid until the
// coordination ends or the link is regenerated.
