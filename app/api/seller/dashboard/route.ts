import { NextRequest, NextResponse } from 'next/server'
import { validateMagicLink } from '@/lib/magic-links'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')
    
    if (!token) {
      return NextResponse.json(
        { error: 'Access token is required' },
        { status: 400 }
      )
    }
    
    const validation = validateMagicLink(token)
    if (!validation) {
      return NextResponse.json(
        { error: 'Invalid access link' },
        { status: 401 }
      )
    }
    
    const supabase = createClient()
    
    const { data: coordination, error: coordError } = await supabase
      .from('listing_coordination')
      .select('*')
      .eq('seller_magic_link', token)
      .single()
    
    if (coordError || !coordination) {
      return NextResponse.json(
        { error: 'Coordination not found or access link expired' },
        { status: 404 }
      )
    }
    
    if (!coordination.is_active) {
      return NextResponse.json(
        { error: 'This listing coordination service is no longer active' },
        { status: 403 }
      )
    }
    
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', coordination.listing_id)
      .single()
    
    if (listingError || !listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }
    
    const { data: reports } = await supabase
      .from('coordination_weekly_reports')
      .select('*')
      .eq('coordination_id', coordination.id)
      .order('week_start_date', { ascending: false })
      .limit(4)
    
    // Use agent_name from listing (synced with form responses) as the primary source
    // Try to find the agent by name to get contact info
    let agentInfo = null
    if (listing.agent_name) {
      // Try to find agent by name to get contact info
      const agentNameParts = listing.agent_name.trim().split(/\s+/)
      if (agentNameParts.length >= 2) {
        const firstName = agentNameParts[0].trim()
        const lastName = agentNameParts.slice(1).join(' ').trim()
        
        // Try preferred name first (case-insensitive, any status, must have agent role)
        const { data: agentsByPreferred } = await supabase
          .from('users')
          .select('id, preferred_first_name, preferred_last_name, first_name, last_name, email, business_phone, personal_phone, role')
          .ilike('preferred_first_name', firstName)
          .ilike('preferred_last_name', lastName)
          .or('roles.cs.{agent},roles.cs.{Agent}')
          .limit(1)
        
        let agentData = null
        if (agentsByPreferred && agentsByPreferred.length > 0) {
          agentData = agentsByPreferred[0]
        } else {
          // Try legal name (case-insensitive, any status, must have agent role)
          const { data: agentsByLegal } = await supabase
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, business_phone, personal_phone, role')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .or('roles.cs.{agent},roles.cs.{Agent}')
            .limit(1)
          
          if (agentsByLegal && agentsByLegal.length > 0) {
            agentData = agentsByLegal[0]
          }
        }
        
        // Use listing.agent_name (synced with form responses) as the name
        // Use found agent's contact info if available
        // For Courtney (broker only), use personal phone; for others, use business phone
        const isCourtneyBroker = (agentData?.email?.toLowerCase().includes('courtney') || 
                                 firstName.toLowerCase() === 'courtney' ||
                                 agentData?.preferred_first_name?.toLowerCase() === 'courtney' ||
                                 agentData?.first_name?.toLowerCase() === 'courtney') &&
                                agentData?.role === 'Broker'
        
        const phone = isCourtneyBroker 
          ? (agentData?.personal_phone || agentData?.business_phone || '')
          : (agentData?.business_phone || agentData?.personal_phone || '')
        
        agentInfo = {
          name: listing.agent_name, // Always use the name from listing (synced with form responses)
          email: agentData?.email || '',
          phone: phone,
        }
      } else {
        // If name can't be parsed, just use the listing agent_name
        agentInfo = {
          name: listing.agent_name,
          email: '',
          phone: '',
        }
      }
    } else if (coordination.agent_id) {
      // Fallback: if no agent_name in listing, try to get from agent_id
      const { data: agentData } = await supabase
        .from('users')
        .select('first_name, last_name, preferred_first_name, preferred_last_name, email, business_phone, personal_phone, role')
        .eq('id', coordination.agent_id)
        .single()
      
      if (agentData) {
        // For Courtney (broker only), use personal phone; for others, use business phone
        const isCourtneyBroker = (agentData.email?.toLowerCase().includes('courtney') ||
                                 agentData.preferred_first_name?.toLowerCase() === 'courtney' ||
                                 agentData.first_name?.toLowerCase() === 'courtney') &&
                                agentData.role === 'Broker'
        
        const phone = isCourtneyBroker
          ? (agentData.personal_phone || agentData.business_phone || '')
          : (agentData.business_phone || agentData.personal_phone || '')
        
        agentInfo = {
          name: agentData.preferred_first_name && agentData.preferred_last_name
            ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
            : `${agentData.first_name} ${agentData.last_name}`,
          email: agentData.email,
          phone: phone,
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      coordination,
      listing,
      reports: reports || [],
      agent: agentInfo,
    })
    
  } catch (error: any) {
    console.error('Error loading seller dashboard:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}

