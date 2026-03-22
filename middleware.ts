import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/session'
import { ADMIN_ROLES, PATHS, RoleName } from '@/lib/constants'

const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-reset-token',
  '/api/auth/login',
  '/api/auth/microsoft',
  '/api/auth/microsoft/callback',
  '/api/auth/logout',
  '/prospective-agent-form',
  '/api/forms',
  '/forms',
  '/roster',
  '/agent-roster.html',
  '/seller',
  '/campaign', 
  '/api/seller',
  '/api/campaign',
  '/api/training-center',
  '/manifest.json',
  '/_next',
  '/favicon.ico',
  '/logo.png',
  '/logo-white.png',
]

// Paths accessible to all authenticated users regardless of role
const SHARED_PATHS = ['/transactions', '/training-center', '/profile']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
}

function isSharedPath(pathname: string): boolean {
  return SHARED_PATHS.some(path => pathname.startsWith(path))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Get session cookie
  const sessionToken = request.cookies.get('ca_session')?.value

  if (!sessionToken) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify the token
  const session = await verifySessionToken(sessionToken)

  if (!session) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('ca_session')
    return response
  }

  // Check if session is expired
  if (session.exp * 1000 < Date.now()) {
    const loginUrl = new URL('/auth/login', request.url)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('ca_session')
    return response
  }

  const userRole = session.user.role?.toLowerCase() || ''
  const isAdminRole = ADMIN_ROLES.includes(userRole as RoleName)

  // Shared paths — accessible to all authenticated users, no role redirect
  if (isSharedPath(pathname)) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', session.user.id)
    requestHeaders.set('x-user-email', session.user.email)
    requestHeaders.set('x-user-role', session.user.role)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Role-based access control for legacy paths
  if (pathname.startsWith('/admin') && !isAdminRole) {
    return NextResponse.redirect(new URL('/agent/dashboard', request.url))
  }

  if (pathname.startsWith('/agent') && isAdminRole) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // Add user info to headers for server components
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', session.user.id)
  requestHeaders.set('x-user-email', session.user.email)
  requestHeaders.set('x-user-role', session.user.role)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|public/).*)'],
}
