import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { generateFormToken, getFormLinkUrl } from '@/lib/magic-links'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_forms')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { form_type } = body

    if (!form_type) {
      return NextResponse.json({ error: 'form_type is required' }, { status: 400 })
    }

    // Generate token for generic form (not tied to a listing)
    const token = await generateFormToken(form_type)
    const linkUrl = getFormLinkUrl(token, form_type)

    return NextResponse.json({
      success: true,
      token,
      link_url: linkUrl,
    })
  } catch (error: any) {
    console.error('Error generating generic form token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}
