'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ListingCoordination, Listing, CoordinationWeeklyReport } from '@/types/listing-coordination'
import LuxuryHeader from '@/components/shared/LuxuryHeader'

export default function SellerDashboard() {
  const params = useParams()
  const token = params.token as string
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coordination, setCoordination] = useState<ListingCoordination | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [reports, setReports] = useState<CoordinationWeeklyReport[]>([])
  const [agentInfo, setAgentInfo] = useState<any>(null)
  
  useEffect(() => {
    loadDashboard()
  }, [token])
  
  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/seller/dashboard?token=${token}`)
      const data = await response.json()
      
      if (data.success) {
        setCoordination(data.coordination)
        setListing(data.listing)
        setReports(data.reports)
        setAgentInfo(data.agent)
      } else {
        setError(data.error || 'Invalid or expired access link')
      }
    } catch (err: any) {
      console.error('Error loading dashboard:', err)
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }
  
  const formatDateRange = (startDate: string, endDate: string) => {
    return `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  
  const formatPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return ''
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '')
    
    // If it's 10 digits, format as (XXX) XXX-XXXX
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    
    // If it's 11 digits and starts with 1, format as (XXX) XXX-XXXX
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    
    // If it doesn't match expected format, return as-is
    return phone
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light pt-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="container-card text-center py-12">
            <p className="text-luxury-gray-2">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (error || !coordination || !listing) {
    return (
      <div className="min-h-screen bg-luxury-light pt-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="container-card text-center py-12">
            <h2 className="text-xl font-medium mb-4 text-luxury-gray-1">Access Denied</h2>
            <p className="text-luxury-gray-2 mb-6">
              {error || 'This access link is invalid or has expired.'}
            </p>
            <p className="text-sm text-luxury-gray-2">
              Please contact your listing agent for a new access link.
            </p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="page-title mb-1">Your Listing Dashboard</h1>
          <p className="text-sm text-luxury-gray-3">{listing.property_address}</p>
        </div>
        
        <div className="container-card mb-5">
          <h2 className="text-xl font-light mb-4">
            Welcome, {coordination.seller_name}!
          </h2>
          <p className="text-sm text-luxury-gray-1">
            This is your personal dashboard for tracking the marketing and activity of your listing at {listing.property_address}.
            You'll receive weekly email updates every Monday evening with the latest reports.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="container-card">
            <h3 className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-3">Your Listing Agent</h3>
            {agentInfo ? (
              <>
                <p className="text-base font-medium mb-1">{agentInfo.name}</p>
                <p className="text-sm text-luxury-gray-2 mb-1">
                  <a href={`mailto:${agentInfo.email}`} className="hover:text-luxury-black">
                    {agentInfo.email}
                  </a>
                </p>
                {agentInfo.phone && (
                  <p className="text-sm text-luxury-gray-2">
                    <a href={`tel:${agentInfo.phone.replace(/\D/g, '')}`} className="hover:text-luxury-black">
                      {formatPhoneNumber(agentInfo.phone)}
                    </a>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-luxury-gray-2">Contact information not available</p>
            )}
          </div>
          
          <div className="container-card">
            <h3 className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-3">Listing & Transaction Coordinator</h3>
            <p className="text-base font-medium mb-1">Leah Parpan</p>
            <p className="text-sm text-luxury-gray-2 mb-1">
              <a href="mailto:transactions@collectiverealtyco.com" className="hover:text-luxury-black">
                transactions@collectiverealtyco.com
              </a>
            </p>
            <p className="text-sm text-luxury-gray-2">
              <a href="tel:2816389416" className="hover:text-luxury-black">
                (281) 638-9416
              </a>
            </p>
          </div>
        </div>
        
        {listing.listing_website_url && (
          <div className="container-card mb-5">
            <h3 className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-3">View Your Listing Online</h3>
            <a
              href={listing.listing_website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Visit Listing Website →
            </a>
          </div>
        )}
        
        <div className="container-card mb-5">
          <h3 className="text-xs text-luxury-gray-3 uppercase tracking-wider mb-3">Listing Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-luxury-gray-2 mb-1">Transaction Type</p>
              <p className="text-base font-medium capitalize">{listing.transaction_type === 'lease' ? 'Lease' : 'Sale'}</p>
            </div>
            <div>
              <p className="text-xs text-luxury-gray-2 mb-1">Current Status</p>
              <p className="text-base font-medium capitalize">{listing.status}</p>
            </div>
            {listing.actual_launch_date && (
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Listed On</p>
                <p className="text-sm">{formatDate(listing.actual_launch_date)}</p>
              </div>
            )}
            {coordination.next_email_scheduled_for && (
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Next Email Scheduled</p>
                <p className="text-sm text-blue-600">
                  {new Date(coordination.next_email_scheduled_for).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-luxury-gray-2 mb-1">Coordination Started</p>
              <p className="text-sm">{formatDate(coordination.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-luxury-gray-2 mb-1">Reports Received</p>
              <p className="text-base font-medium">{reports.length}</p>
            </div>
          </div>
        </div>
        
        <div className="container-card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-lg font-medium">Weekly Activity Reports</h3>
            {coordination.onedrive_folder_url && (
              <a
                href={coordination.onedrive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary mt-2 md:mt-0"
              >
                View Past Reports →
              </a>
            )}
          </div>
          
          {reports.length > 0 && (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="inner-card">
                  <div className="flex-1">
                    <h4 className="text-base font-medium mb-1">
                      Week of {formatDateRange(report.week_start_date, report.week_end_date)}
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {report.showings_count !== null && (
                        <div>
                          <p className="text-xs text-luxury-gray-2">Showings</p>
                          <p className="text-sm font-medium">{report.showings_count}</p>
                        </div>
                      )}
                      {report.mls_views !== null && (
                        <div>
                          <p className="text-xs text-luxury-gray-2">MLS Views</p>
                          <p className="text-sm font-medium">{report.mls_views}</p>
                        </div>
                      )}
                      {report.email_sent_at && (
                        <div>
                          <p className="text-xs text-luxury-gray-2">Sent On</p>
                          <p className="text-sm">{formatDate(report.email_sent_at)}</p>
                        </div>
                      )}
                      {!report.email_sent_at && report.email_scheduled_for && (
                        <div>
                          <p className="text-xs text-luxury-gray-2">Scheduled For</p>
                          <p className="text-sm text-blue-600">
                            {new Date(report.email_scheduled_for).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {report.feedback && (
                      <div className="mt-3">
                        <p className="text-xs text-luxury-gray-2 mb-1">Agent Feedback</p>
                        <p className="text-sm text-luxury-gray-1">{report.feedback}</p>
                      </div>
                    )}
                    
                    {(report.report_file_url || report.report_file_url_2) && (
                      <div className="mt-4 flex flex-col space-y-2">
                        {report.report_file_url && (
                          <a
                            href={report.report_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                          >
                            Download Showing Report
                          </a>
                        )}
                        {report.report_file_url_2 && listing.mls_type !== 'NTREIS' && (
                          <a
                            href={report.report_file_url_2}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                          >
                            Download Traffic Report
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-luxury-gray-2">
            This dashboard link is active as long as your listing coordination service is active.
          </p>
          <p className="text-xs text-luxury-gray-2 mt-2">
            Questions? Contact your listing agent or Leah Parpan at{' '}
            <a href="mailto:transactions@collectiverealtyco.com" className="text-luxury-gold hover:underline">
              transactions@collectiverealtyco.com
            </a>
            {' '}or{' '}
            <a href="tel:2816389416" className="text-luxury-gold hover:underline">
              (281) 638-9416
            </a>
          </p>
        </div>
    </div>
    </>
  )
}

