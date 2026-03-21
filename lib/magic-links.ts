import crypto from 'crypto'

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

// Form token generation (supports any form type)
export async function generateFormToken(formType: string): Promise<string> {
  const randomBytes = crypto.randomBytes(32)
  const combined = `${formType}:${randomBytes.toString('hex')}`
  const token = Buffer.from(combined).toString('base64url')
  return token
}

export function validateFormToken(token: string): { formType: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const [formType] = decoded.split(':')
    if (!formType) {
      return null
    }
    return { formType }
  } catch (error) {
    console.error('Error validating form token:', error)
    return null
  }
}

export function getFormLinkUrl(token: string, formType: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://agent.collectiverealtyco.com'
  return `${baseUrl}/forms/${formType}/${token}`
}

// Note: Shareable links do NOT expire by default
// They remain valid until manually regenerated or the form is deleted
// This allows forms to be shared long-term without expiration issues
