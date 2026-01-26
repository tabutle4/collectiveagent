import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFormToken, getFormLinkUrl } from '@/lib/magic-links'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    const { listing_id, form_type } = body
    
    if (!listing_id || !form_type) {
      return NextResponse.json(
        { error: 'listing_id and form_type are required' },
        { status: 400 }
      )
    }
    
    if (form_type !== 'pre-listing' && form_type !== 'just-listed') {
      return NextResponse.json(
        { error: 'form_type must be "pre-listing" or "just-listed"' },
        { status: 400 }
      )
    }
    
    // Note: This endpoint can be called from authenticated pages
    // Authentication is handled by the calling page (agent/admin dashboards)
    
    // Verify transaction exists
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', listing_id)
      .single()
    
    if (transactionError || !transaction) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }
    
    // Generate token
    const token = await generateFormToken(form_type)
    
    // Update transaction with token
    const tokenField = form_type === 'pre-listing' ? 'pre_listing_token' : 'just_listed_token'
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ [tokenField]: token })
      .eq('id', listing_id)
    
    if (updateError) {
      console.error('Error updating transaction with token:', updateError)
      return NextResponse.json(
        { error: 'Failed to save token' },
        { status: 500 }
      )
    }
    
    const linkUrl = getFormLinkUrl(token, form_type)
    
    return NextResponse.json({
      success: true,
      token,
      link_url: linkUrl,
    })
    
  } catch (error: any) {
    console.error('Error generating form token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}