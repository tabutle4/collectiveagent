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
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">EMAIL TEMPLATES</h1>
        <Link href="/admin/email-templates/new" className="btn btn-primary">
          New Template
        </Link>
      </div>

      {/* Listing Coordination Emails */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Listing Coordination Emails
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Welcome Email */}
          <div className="inner-card">
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">Welcome Email</h3>
            <p className="text-xs text-luxury-gray-3 mb-3">
              Sent when listing coordination is activated
            </p>
            <div className="text-xs text-luxury-gray-3 space-y-1 mb-3">
              <p>
                <span className="font-medium text-luxury-gray-2">Subject:</span> Welcome to Weekly
                Listing Coordination - [Property]
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">To:</span> Seller Email
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">CC:</span> Agent Email
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">From:</span> Leah Parpan
              </p>
            </div>
            <button
              onClick={() => setPreviewEmail('welcome')}
              className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <Eye size={13} /> Preview
            </button>
          </div>

          {/* Weekly Report Email */}
          <div className="inner-card">
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">Weekly Report Email</h3>
            <p className="text-xs text-luxury-gray-3 mb-3">
              Sent every Monday at 6:00 PM with activity reports
            </p>
            <div className="text-xs text-luxury-gray-3 space-y-1 mb-3">
              <p>
                <span className="font-medium text-luxury-gray-2">Subject:</span> Weekly Report -
                [Property] | [Date]
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">To:</span> Seller Email
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">CC:</span> Agent Email
              </p>
              <p>
                <span className="font-medium text-luxury-gray-2">From:</span> Leah Parpan
              </p>
            </div>
            <button
              onClick={() => setPreviewEmail('weekly')}
              className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <Eye size={13} /> Preview
            </button>
          </div>
        </div>
      </div>

      {/* Campaign Email Templates */}
      <div className="container-card">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Campaign Email Templates
        </h2>

        {templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No email templates found</p>
            <Link href="/admin/email-templates/new" className="btn btn-primary">
              New Template
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(template => (
              <div key={template.id} className="inner-card">
                <Link href={`/admin/email-templates/${template.id}`} className="block mb-3">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold text-luxury-gray-1">{template.name}</h3>
                    {template.is_default && (
                      <span className="text-xs px-2 py-0.5 bg-luxury-accent text-white rounded flex-shrink-0 ml-2">
                        Default
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-xs text-luxury-gray-3 mb-2 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-luxury-gray-3">
                    <span className="capitalize">{template.category}</span>
                    <span className={template.is_active ? 'text-green-700' : 'text-red-600'}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {template.variables && template.variables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.variables.slice(0, 3).map((varName: string, index: number) => (
                        <span
                          key={`${template.id}-var-${index}`}
                          className="text-xs px-1.5 py-0.5 bg-luxury-gray-5/40 rounded text-luxury-gray-3"
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
                  )}
                </Link>

                <div className="flex gap-2 pt-3 border-t border-luxury-gray-5/30">
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(
                          `/api/email-templates/${template.id}/duplicate`,
                          { method: 'POST' }
                        )
                        const data = await response.json()
                        if (!response.ok) throw new Error(data.error || 'Failed to duplicate')
                        alert('Template duplicated successfully')
                        fetchTemplates()
                      } catch (error: any) {
                        alert(error.message || 'Failed to duplicate template')
                      }
                    }}
                    className="flex-1 btn btn-secondary text-xs"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={async () => {
                      if (template.is_default) {
                        alert('Cannot delete default template.')
                        return
                      }
                      if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
                      try {
                        const response = await fetch(`/api/email-templates/${template.id}`, {
                          method: 'DELETE',
                        })
                        const data = await response.json()
                        if (!response.ok) throw new Error(data.error || 'Failed to delete')
                        alert('Template deleted successfully')
                        fetchTemplates()
                      } catch (error: any) {
                        alert(error.message || 'Failed to delete template')
                      }
                    }}
                    disabled={template.is_default}
                    className={`flex-1 btn text-xs ${template.is_default ? 'btn-secondary opacity-40 cursor-not-allowed' : 'bg-white border border-red-600 text-red-600 hover:bg-red-50'}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5/50">
              <h3 className="text-sm font-semibold text-luxury-gray-1">
                {previewEmail === 'welcome'
                  ? 'Welcome Email Preview'
                  : 'Weekly Report Email Preview'}
              </h3>
              <button
                onClick={() => setPreviewEmail(null)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
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

  const agent = { name: 'Jane Agent', email: 'jane@example.com', phone: '(281) 555-1234' }
  const dateSentStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
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
      className="w-full h-full min-h-[600px] border border-luxury-gray-5/50 rounded"
      title="Email Preview"
    />
  )
}
