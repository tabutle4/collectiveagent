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
  '/referral-collective-information',
  '/api/prospects',
  '/api/forms',
  '/api/payload/webhook',
  '/api/payload/commission-retainer-webhook',
  '/api/payload/confirm-transaction',
  '/api/pm/payload/landlord-activation-webhook',
  '/api/settings',
  '/roster',
  '/agent-roster.html',
  '/seller',
  '/campaign', 
  '/api/seller',
  '/api/campaign',
  '/api/training-center',
  '/api/cron',
  '/api/onboarding',
  '/api/pm',
  '/pm',
  '/manifest.json',
  '/_next',
  '/favicon.ico',
  '/logo.png',
  '/logo-white.png',
  '/onboard',
  '/api/headshot-square',
  '/api/zoom/recording-complete',
  '/api/transactions/email-inbound',
  '/api/pm/email-webhook',
  '/api/checks/email-inbound',
  '/api/agent-email/webhook',
  '/coaching-schedule',
  '/api/public',
]

// Paths accessible to all authenticated users regardless of role
const SHARED_PATHS = ['/transactions', '/training-center', '/profile', '/admin/checks']

// Paths referral agents can access
const REFERRAL_ALLOWED_PATHS = ['/agent/profile', '/agent/calendar', '/agent/email-signature', '/agent/referrals', '/training-center', '/roster']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path))
}

function isSharedPath(pathname: string): boolean {
  return SHARED_PATHS.some(path => pathname.startsWith(path))
}

function isReferralAllowedPath(pathname: string): boolean {
  return REFERRAL_ALLOWED_PATHS.some(path => pathname.startsWith(path))
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Get session cookie
  const sessionToken = request.cookies.get('ca_session')?.value

  if (!sessionToken) {
    console.log('middleware: no ca_session cookie', { pathname, search })
    const loginUrl = new URL('/auth/login', request.url)
    // Pass full path + search so deep links (e.g. ?tab=checks) survive login
    const fullPath = search ? `${pathname}${search}` : pathname
    loginUrl.searchParams.set('redirect', fullPath)
    return NextResponse.redirect(loginUrl)
  }

  // Verify the token
  const session = await verifySessionToken(sessionToken)

  if (!session) {
    console.log('middleware: invalid ca_session token', { pathname, search, tokenPrefix: sessionToken.slice(0, 12) })
    const loginUrl = new URL('/auth/login', request.url)
    const fullPath = search ? `${pathname}${search}` : pathname
    loginUrl.searchParams.set('redirect', fullPath)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('ca_session')
    return response
  }

  // Check if session is expired
  if (session.exp * 1000 < Date.now()) {
    console.log('middleware: expired ca_session token', {
      pathname,
      search,
      exp: session.exp,
      now: Date.now(),
      userId: session.user?.id,
    })
    const loginUrl = new URL('/auth/login', request.url)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('ca_session')
    return response
  }

  const userRole = session.user.role?.toLowerCase() || ''
  const isAdminRole = ADMIN_ROLES.includes(userRole as RoleName)

  // Shared paths - accessible to all authenticated users, no role redirect
  if (isSharedPath(pathname)) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', session.user.id)
    requestHeaders.set('x-user-email', session.user.email)
    requestHeaders.set('x-user-role', session.user.role)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Referral access is not an auth check. It is a post-login route policy.
  // Keep auth focused on session validity and allow referral users to proceed.

  // Role-based access control for legacy paths
  if (pathname.startsWith('/admin') && !isAdminRole) {
    return NextResponse.redirect(new URL('/agent/profile', request.url))
  }

  // Admins are normally redirected out of the agent area, but they still need to
  // be able to open the shared agent forms and view agent flyer pages.
  const adminAllowedAgentPaths = ['/agent/forms', '/agent/flyer', '/agent/referrals']
  const isAdminAllowedAgentPath = adminAllowedAgentPaths.some(p => pathname.startsWith(p))
  if (pathname.startsWith('/agent') && isAdminRole && !isAdminAllowedAgentPath) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // Redirect agents from restricted pages to profile
  const restrictedAgentPages = ['/agent/dashboard', '/agent/transactions']
  if (!isAdminRole && restrictedAgentPages.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/agent/profile', request.url))
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|logo-white.png|BrokerPolicyManual.pdf|courtney-signature.png|public/).*)'],
}
