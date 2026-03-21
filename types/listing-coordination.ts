export interface Listing {
  id: string
  created_at: string
  updated_at: string
  agent_id: string | null
  agent_name: string
  client_names: string
  client_phone: string | null
  client_email: string | null
  property_address: string
  transaction_type: 'sale' | 'lease'
  mls_type: 'HAR' | 'NTREIS' | null
  mls_link: string | null
  mls_login_info: string | null
  estimated_launch_date: string | null
  actual_launch_date: string | null
  lead_source: string | null
  status: 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled'
  pre_listing_form_completed: boolean
  just_listed_form_completed: boolean
  pre_listing_token: string | null
  just_listed_token: string | null
  dotloop_file_created: boolean
  photography_requested: boolean
  photography_scheduled_date: string | null
  listing_input_requested: boolean
  listing_input_paid: boolean
  listing_input_fee: number
  listing_website_url: string | null
  closed_date: string | null
  notes: any[]
}

export interface ListingCoordination {
  id: string
  created_at: string
  updated_at: string
  listing_id: string
  agent_id: string | null
  service_fee: number
  service_paid: boolean
  payment_date: string | null
  is_active: boolean
  start_date: string
  end_date: string | null
  seller_name: string
  seller_email: string
  onedrive_folder_url: string | null
  onedrive_folder_id: string | null
  email_schedule_day: string
  email_schedule_time: string
  last_email_sent_at: string | null
  next_email_scheduled_for: string | null
  welcome_email_sent: boolean
  welcome_email_sent_at: string | null
  total_emails_sent: number
  seller_magic_link: string | null
  payment_method: 'client_direct' | 'agent_pays' | 'broker_listing' | null
  payment_due_date: string | null
  notes: any[]
}

export interface CoordinationWeeklyReport {
  id: string
  created_at: string
  coordination_id: string
  week_start_date: string
  week_end_date: string
  report_file_url: string | null
  report_file_name: string | null
  report_file_url_2: string | null
  report_file_name_2: string | null
  email_sent: boolean
  email_sent_at: string | null
  email_id: string | null
  email_scheduled_for: string | null
  email_status: string | null
  sent_to: {
    seller: string
    agent: string
    office: string
  } | null
  showings_count: number | null
  mls_views: number | null
  feedback: string | null
}

export interface ServiceConfiguration {
  id: string
  service_type: string
  service_name: string
  service_description: string | null
  price: number
  payment_terms: string | null
  inclusions: string[]
  is_active: boolean
  settings: any
  created_at: string
  updated_at: string
}

export interface ListingFormData {
  agent_name: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  mls_type?: 'HAR' | 'NTREIS'
  client_names: string
  client_phone: string
  client_email: string
  lead_source: string
  mls_link?: string
  mls_login_info?: string
  estimated_launch_date?: string
  dotloop_file_created: boolean
  listing_input_requested: boolean
  coordination_requested: boolean
  coordination_payment_method?: 'client_direct' | 'agent_pays'
  photography_requested: boolean
}
