import { SignJWT, jwtVerify } from 'jose'

const SESSION_DURATION = 8 * 60 * 60 // 8 hours in seconds

export interface SessionUser {
  id: string
  email: string
  role: string
  first_name: string
  last_name: string
  preferred_first_name: string | null
  preferred_last_name: string | null
}

export interface Session {
  user: SessionUser
  sessionId: string
  iat: number
  exp: number
}

export async function createSessionToken(user: SessionUser, sessionId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET!)
  return new SignJWT({ user, sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secret)
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET!)
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as Session
  } catch {
    return null
  }
}

export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    name: 'ca_session',
    options: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: SESSION_DURATION,
      path: '/',
    }
  }
}