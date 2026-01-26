'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Eye } from 'lucide-react'
import { getWelcomeEmailHtml, getWeeklyReportEmailHtml } from '@/lib/email/templates'
import { ListingCoordination, Listing } from '@/types/listing-coordination'

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [previewEmail, setPreviewEmail] = useState<'welcome' | 'weekly' | null>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 md:mb-8">
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury" style={{ fontWeight: '600' }}>Email Templates</h2>
        <Link href="/admin/email-templates/new" className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-block">
          New Template
        </Link>
      </div>

      {/* Listing Coordination Email Templates */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">Listing Coordination Emails</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Welcome Email */}
          <div className="card-section hover:shadow-md transition-shadow relative group">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-medium tracking-luxury flex-1">
                Welcome Email
              </h3>
            </div>
            <p className="text-sm text-luxury-gray-2 mb-3 line-clamp-2">
              Sent when listing coordination is activated
            </p>
            <div className="flex items-center gap-4 text-xs text-luxury-gray-3 mb-3">
              <span className="capitalize">Listing Coordination</span>
              <span className="text-green-600">Active</span>
            </div>
            <div className="mt-3 pt-3 border-t border-luxury-gray-5">
              <p className="text-xs text-luxury-gray-3 mb-1">Email Details:</p>
              <div className="text-xs text-luxury-gray-2 space-y-1">
                <p><strong>Subject:</strong> Collective Realty Co. - Welcome to Weekly Listing Coordination - [Property Address]</p>
                <p><strong>To:</strong> Seller Email</p>
                <p><strong>CC:</strong> Agent Email</p>
                <p><strong>BCC:</strong> tcandcompliance@collectiverealtyco.com</p>
                <p><strong>From:</strong> Leah Parpan - Listing & Transaction Coordinator</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-luxury-gray-5">
              <button
                onClick={() => setPreviewEmail('welcome')}
                className="w-full px-3 py-2 text-xs rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center justify-center gap-2"
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>
          </div>

          {/* Weekly Report Email */}
          <div className="card-section hover:shadow-md transition-shadow relative group">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-medium tracking-luxury flex-1">
                Weekly Report Email
              </h3>
            </div>
            <p className="text-sm text-luxury-gray-2 mb-3 line-clamp-2">
              Sent every Monday at 6:00 PM with activity reports
            </p>
            <div className="flex items-center gap-4 text-xs text-luxury-gray-3 mb-3">
              <span className="capitalize">Listing Coordination</span>
              <span className="text-green-600">Active</span>
            </div>
            <div className="mt-3 pt-3 border-t border-luxury-gray-5">
              <p className="text-xs text-luxury-gray-3 mb-1">Email Details:</p>
              <div className="text-xs text-luxury-gray-2 space-y-1">
                <p><strong>Subject:</strong> Collective Realty Co. - Weekly Report - [Property Address] | [Date Sent]</p>
                <p><strong>To:</strong> Seller Email</p>
                <p><strong>CC:</strong> Agent Email</p>
                <p><strong>BCC:</strong> tcandcompliance@collectiverealtyco.com</p>
                <p><strong>From:</strong> Leah Parpan - Listing & Transaction Coordinator</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-luxury-gray-5">
              <button
                onClick={() => setPreviewEmail('weekly')}
                className="w-full px-3 py-2 text-xs rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center justify-center gap-2"
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Email Templates */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Campaign Email Templates</h3>
      </div>

      {templates.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2 mb-6">No email templates found</p>
          <Link href="/admin/email-templates/new" className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-block">
            New Template
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="card-section hover:shadow-md transition-shadow relative group"
            >
              <Link
                href={`/admin/email-templates/${template.id}`}
                className="block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-medium tracking-luxury flex-1">
                    {template.name}
                  </h3>
                  {template.is_default && (
                    <span className="ml-2 px-2 py-1 text-xs bg-luxury-gold text-white rounded">
                      Default
                    </span>
                  )}
                </div>
              {template.description && (
                <p className="text-sm text-luxury-gray-2 mb-3 line-clamp-2">
                  {template.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-luxury-gray-3">
                <span className="capitalize">{template.category}</span>
                {template.is_active === false && (
                  <span className="text-red-500">Inactive</span>
                )}
                {template.is_active === true && (
                  <span className="text-green-600">Active</span>
                )}
              </div>
              {template.variables && template.variables.length > 0 && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5">
                  <p className="text-xs text-luxury-gray-3 mb-1">Variables:</p>
                  <div className="flex flex-wrap gap-1">
                    {template.variables.slice(0, 3).map((varName: string, index: number) => (
                      <span
                        key={`${template.id}-var-${index}`}
                        className="text-xs px-2 py-0.5 bg-luxury-light rounded"
                      >
                        {`{{${varName}}}`}
                      </span>
                    ))}
                    {template.variables.length > 3 && (
                      <span className="text-xs text-luxury-gray-3">
                        +{template.variables.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              </Link>
              
              {/* Action Buttons */}
              <div className="mt-3 pt-3 border-t border-luxury-gray-5 flex gap-2">
                <button
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    try {
                      const response = await fetch(`/api/email-templates/${template.id}/duplicate`, {
                        method: 'POST',
                      })
                      
                      const data = await response.json()
                      if (!response.ok) throw new Error(data.error || 'Failed to duplicate template')
                      
                      alert('Template duplicated successfully')
                      fetchTemplates()
                    } catch (error: any) {
                      alert(error.message || 'Failed to duplicate template')
                    }
                  }}
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                >
                  📋 Duplicate
                </button>
                
                <button
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    if (template.is_default) {
                      alert('Cannot delete default template. Please set another template as default first.')
                      return
                    }
                    
                    if (!confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
                      return
                    }
                    
                    try {
                      const response = await fetch(`/api/email-templates/${template.id}`, {
                        method: 'DELETE',
                      })
                      
                      const data = await response.json()
                      if (!response.ok) throw new Error(data.error || 'Failed to delete template')
                      
                      alert('Template deleted successfully')
                      fetchTemplates()
                    } catch (error: any) {
                      alert(error.message || 'Failed to delete template')
                    }
                  }}
                  disabled={template.is_default}
                  className={`px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center ${
                    template.is_default
                      ? 'text-luxury-gray-3 cursor-not-allowed bg-luxury-light border border-luxury-gray-5'
                      : 'bg-white border border-red-600 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {template.is_default ? 'Cannot Delete (Default)' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-medium">
                {previewEmail === 'welcome' ? 'Welcome Email Preview' : 'Weekly Report Email Preview'}
              </h3>
              <button
                onClick={() => setPreviewEmail(null)}
                className="text-luxury-gray-2 hover:text-luxury-black"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <EmailPreview type={previewEmail} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmailPreview({ type }: { type: 'welcome' | 'weekly' }) {
  // Sample data for preview
  const coord: ListingCoordination = {
    id: 'sample',
    listing_id: 'sample',
    agent_id: 'sample-agent',
    seller_name: 'John Smith',
    seller_email: 'john@example.com',
    seller_magic_link: 'sample-token-123',
    start_date: new Date().toISOString(),
    is_active: true,
    service_fee: 250,
    service_paid: false,
    payment_method: 'agent_pays',
    payment_date: null,
    onedrive_folder_url: 'https://example.com',
    welcome_email_sent: true,
    welcome_email_sent_at: new Date().toISOString(),
    last_email_sent_at: new Date().toISOString(),
    total_emails_sent: 1,
    end_date: null,
    email_schedule_day: 'monday',
    email_schedule_time: '18:00',
    next_email_scheduled_for: null,
    onedrive_folder_id: null,
    payment_due_date: null,
    notes: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const listing: Listing = {
    id: 'sample',
    agent_id: 'sample-agent',
    property_address: '123 Main Street, Houston, TX 77002',
    pre_listing_token: null,
    just_listed_token: null,
    status: 'active',
    transaction_type: 'sale',
    mls_type: 'HAR',
    agent_name: 'Jane Agent',
    client_names: 'John Smith',
    client_phone: null,
    client_email: null,
    mls_link: null,
    mls_login_info: null,
    estimated_launch_date: null,
    actual_launch_date: null,
    lead_source: null,
    pre_listing_form_completed: false,
    just_listed_form_completed: false,
    dotloop_file_created: false,
    photography_requested: false,
    photography_scheduled_date: null,
    listing_input_requested: false,
    listing_input_paid: false,
    listing_input_fee: 0,
    listing_website_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_date: null,
    notes: [],
  }

  const agent = {
    name: 'Jane Agent',
    email: 'jane@example.com',
    phone: '(281) 555-1234',
  }

  const dateSentStr = new Date().toLocaleDateString('en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })

  let html = ''
  if (type === 'welcome') {
    html = getWelcomeEmailHtml(coord, listing, agent.name, agent.email, agent.phone)
  } else {
    html = getWeeklyReportEmailHtml(
      coord,
      listing,
      dateSentStr,
      'https://example.com/report1.pdf',
      'https://example.com/report2.pdf'
    )
  }

  return (
    <iframe
      srcDoc={html}
      className="w-full h-full min-h-[600px] border"
      title="Email Preview"
    />
  )
}

