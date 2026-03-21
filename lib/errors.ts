import { NextResponse } from 'next/server'

/**
 * Standardized API error responses
 *
 * Usage in API routes:
 *   return apiError.unauthorized()
 *   return apiError.notFound('User')
 *   return apiError.badRequest('Email is required')
 *   return apiError.server(error)
 */

export const apiError = {
  // 400 - Bad Request
  badRequest: (message: string = 'Bad request') => {
    return NextResponse.json({ error: message }, { status: 400 })
  },

  // 401 - Unauthorized (not logged in)
  unauthorized: (message: string = 'Not authenticated') => {
    return NextResponse.json({ error: message }, { status: 401 })
  },

  // 403 - Forbidden (logged in but not allowed)
  forbidden: (message: string = 'Permission denied') => {
    return NextResponse.json({ error: message }, { status: 403 })
  },

  // 404 - Not Found
  notFound: (resource: string = 'Resource') => {
    return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
  },

  // 409 - Conflict (duplicate, etc)
  conflict: (message: string = 'Conflict') => {
    return NextResponse.json({ error: message }, { status: 409 })
  },

  // 422 - Unprocessable Entity (validation failed)
  validation: (message: string = 'Validation failed') => {
    return NextResponse.json({ error: message }, { status: 422 })
  },

  // 500 - Server Error
  server: (error: unknown, context?: string) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[API Error]${context ? ` ${context}:` : ''}`, error)
    return NextResponse.json(
      {
        error: 'Server error',
        message: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 }
    )
  },

  // Supabase error helper
  supabase: (
    error: { message: string; code?: string } | null,
    fallback: string = 'Database error'
  ) => {
    if (!error) return null
    console.error('[Supabase Error]', error)
    return NextResponse.json({ error: error.message || fallback }, { status: 400 })
  },
}

/**
 * Success response helper
 */
export const apiSuccess = {
  ok: (data: Record<string, unknown> = {}) => {
    return NextResponse.json(data)
  },

  created: (data: Record<string, unknown> = {}) => {
    return NextResponse.json(data, { status: 201 })
  },

  noContent: () => {
    return new NextResponse(null, { status: 204 })
  },
}

/**
 * Type guard for checking if session exists
 */
export function requireSession(session: unknown): session is { user: { id: string } } {
  return !!session && typeof session === 'object' && 'user' in session
}
