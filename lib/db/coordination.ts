import { createClient } from '@/lib/supabase/server'
import { ListingCoordination, CoordinationWeeklyReport } from '@/types/listing-coordination'
import { generateMagicLink } from '@/lib/magic-links'

export async function createCoordination(data: {
  listing_id: string
  agent_id: string
  seller_name: string
  seller_email: string
  service_fee: number
  start_date: string
  payment_method?: 'client_direct' | 'agent_pays' | 'broker_listing'
  payment_due_date?: string | null
}): Promise<ListingCoordination | null> {
  const supabase = createClient()
  
  const magicLink = await generateMagicLink(data.listing_id, data.seller_email)
  
  // Auto-mark broker listings as paid
  const isBrokerListing = data.payment_method === 'broker_listing'
  const servicePaid = isBrokerListing ? true : false
  const paymentDate = isBrokerListing ? new Date().toISOString().split('T')[0] : null
  
  const { data: coordination, error } = await supabase
    .from('listing_coordination')
    .insert({
      listing_id: data.listing_id,
      agent_id: data.agent_id,
      seller_name: data.seller_name,
      seller_email: data.seller_email,
      service_fee: data.service_fee,
      start_date: data.start_date,
      is_active: true,
      seller_magic_link: magicLink,
      email_schedule_day: 'monday',
      email_schedule_time: '18:00:00',
      payment_method: data.payment_method || null,
      payment_due_date: data.payment_due_date || null,
      service_paid: servicePaid,
      payment_date: paymentDate,
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating coordination:', error)
    return null
  }
  
  return coordination
}

export async function getCoordinationByListingId(listingId: string): Promise<ListingCoordination | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listing_coordination')
    .select('*')
    .eq('listing_id', listingId)
    .single()
  
  if (error) {
    console.error('Error fetching coordination:', error)
    return null
  }
  
  return data
}

export async function getCoordinationById(id: string): Promise<ListingCoordination | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listing_coordination')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Error fetching coordination:', error)
    return null
  }
  
  return data
}

export async function getAllActiveCoordinations(): Promise<ListingCoordination[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('listing_coordination')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching active coordinations:', error)
    return []
  }
  
  return data || []
}

export async function updateCoordination(id: string, updates: Partial<ListingCoordination>): Promise<boolean> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('listing_coordination')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  
  if (error) {
    console.error('Error updating coordination:', error)
    return false
  }
  
  return true
}

export async function deactivateCoordination(id: string): Promise<boolean> {
  return updateCoordination(id, { 
    is_active: false,
    end_date: new Date().toISOString().split('T')[0]
  })
}

export async function reactivateCoordination(id: string): Promise<boolean> {
  return updateCoordination(id, { 
    is_active: true,
    end_date: null
  })
}

export async function createWeeklyReport(data: {
  coordination_id: string
  week_start_date: string
  week_end_date: string
  report_file_url?: string
  report_file_name?: string
  showings_count?: number
  mls_views?: number
  feedback?: string
}): Promise<CoordinationWeeklyReport | null> {
  const supabase = createClient()
  
  const { data: report, error } = await supabase
    .from('coordination_weekly_reports')
    .insert(data)
    .select()
    .single()
  
  if (error) {
    console.error('Error creating weekly report:', error)
    return null
  }
  
  return report
}

export async function getCoordinationReports(coordinationId: string): Promise<CoordinationWeeklyReport[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('coordination_weekly_reports')
    .select('*')
    .eq('coordination_id', coordinationId)
    .order('week_start_date', { ascending: false })
  
  if (error) {
    console.error('Error fetching coordination reports:', error)
    return []
  }
  
  return data || []
}

export async function markReportAsSent(reportId: string, emailId: string, sentTo: any): Promise<boolean> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('coordination_weekly_reports')
    .update({
      email_sent: true,
      email_sent_at: new Date().toISOString(),
      email_id: emailId,
      email_status: 'sent',
      sent_to: sentTo
    })
    .eq('id', reportId)
  
  if (error) {
    console.error('Error marking report as sent:', error)
    return false
  }
  
  return true
}

