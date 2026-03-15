'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ListingCoordination, Listing } from '@/types/listing-coordination'

export default function UploadWeeklyReportPage() {
  const router = useRouter()
  const params = useParams()
  const coordinationId = params.id as string
  
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [coordination, setCoordination] = useState<ListingCoordination | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [user, setUser] = useState<any>(null)
  
  const [reportDate, setReportDate] = useState('')
  
  const [file1, setFile1] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)
  const [isDragging1, setIsDragging1] = useState(false)
  const [isDragging2, setIsDragging2] = useState(false)
  
  useEffect(() => {
    // Get user from localStorage
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        setUser(JSON.parse(userStr))
      } catch (error) {
        console.error('Error parsing user data:', error)
      }
    }
    
    loadCoordination()
    setDefaultReportDate()
  }, [coordinationId])
  
  // Helper to format a Date as YYYY-MM-DD for date inputs
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  const setDefaultReportDate = () => {
    const today = new Date()
    setReportDate(formatDateForInput(today))
  }
  
  const handleDragOver = (e: React.DragEvent, fileNumber: 1 | 2) => {
    e.preventDefault()
    e.stopPropagation()
    if (fileNumber === 1) {
      setIsDragging1(true)
    } else {
      setIsDragging2(true)
    }
  }
  
  const handleDragLeave = (e: React.DragEvent, fileNumber: 1 | 2) => {
    e.preventDefault()
    e.stopPropagation()
    if (fileNumber === 1) {
      setIsDragging1(false)
    } else {
      setIsDragging2(false)
    }
  }
  
  const handleDrop = (e: React.DragEvent, fileNumber: 1 | 2) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (fileNumber === 1) {
      setIsDragging1(false)
    } else {
      setIsDragging2(false)
    }
    
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        if (fileNumber === 1) {
          setFile1(file)
        } else {
          setFile2(file)
        }
      } else {
        alert('Please drop a PDF file')
      }
    }
  }
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileNumber: 1 | 2) => {
    const files = e.target.files
    if (files && files.length > 0) {
      if (fileNumber === 1) {
        setFile1(files[0])
      } else {
        setFile2(files[0])
      }
    }
  }
  
  const loadCoordination = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/coordination/get?id=${coordinationId}`)
      const data = await response.json()
      
      if (data.success) {
        setCoordination(data.coordination)
        setListing(data.listing)
      }
    } catch (error) {
      console.error('Error loading coordination:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file1) {
      alert('Please select the showing report file')
      return
    }
    
    if (listing && listing.mls_type !== 'NTREIS' && !file2) {
      alert('Please select the traffic report file')
      return
    }
    
    if (!user) {
      alert('Please log in to upload reports')
      router.push('/auth/login')
      return
    }
    
    // Use startTransition to make the heavy work non-blocking
    startTransition(async () => {
      setUploading(true)
      
      try {
        // Defer FormData creation to avoid blocking the UI
        await new Promise(resolve => setTimeout(resolve, 0))
        
        const data = new FormData()
        data.append('coordination_id', coordinationId)
        data.append('listing_id', listing!.id)
        data.append('user_id', user.id)
        data.append('report_date', reportDate)
        data.append('report_file_1', file1)
        if (file2) {
          data.append('report_file_2', file2)
        }
        
        const response = await fetch('/api/coordination/upload-report', {
          method: 'POST',
          body: data,
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert('Weekly reports uploaded successfully!')
          router.push(`/admin/coordination/${coordinationId}`)
        } else {
          alert(`Error: ${result.error}`)
        }
      } catch (error) {
        console.error('Error uploading reports:', error)
        alert('Failed to upload reports. Please try again.')
      } finally {
        setUploading(false)
      }
    })
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (!coordination || !listing) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2 mb-4">Coordination not found</p>
            <button
              onClick={() => router.push('/admin/coordination')}
              className="px-6 py-2.5 text-sm rounded transition-colors btn-primary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="card-section">
          <div className="mb-6">
            <button
              onClick={() => router.push(`/admin/coordination/${coordinationId}`)}
              className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-4"
            >
              ← Back to Coordination
            </button>
            <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">
              Upload Weekly Reports
            </h1>
            <p className="text-sm text-luxury-gray-2">
              {listing.property_address}
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Report Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="input-luxury"
                required
              />
              <p className="text-xs text-luxury-gray-2 mt-1">
                Date the report was uploaded
              </p>
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Showing Report (PDF) <span className="text-red-500">*</span>
              </label>
              <div
                onDragOver={(e) => handleDragOver(e, 1)}
                onDragLeave={(e) => handleDragLeave(e, 1)}
                onDrop={(e) => handleDrop(e, 1)}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging1
                    ? 'border-luxury-black bg-luxury-light'
                    : 'border-luxury-gray-5 hover:border-luxury-gray-3'
                }`}
              >
                {file1 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {file1.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFile1(null)}
                      className="text-xs text-luxury-gray-2 hover:text-luxury-black underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-luxury-gray-2">
                      Drag and drop a PDF file here, or click to browse
                    </p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileChange(e, 1)}
                      className="hidden"
                      id="file1-input"
                      required
                    />
                    <label
                      htmlFor="file1-input"
                      className="inline-block px-4 py-2 text-sm rounded transition-colors btn-primary cursor-pointer"
                    >
                      Choose File
                    </label>
                  </div>
                )}
              </div>
            </div>
            
            {listing && listing.mls_type !== 'NTREIS' && (
              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Traffic Report (PDF) <span className="text-red-500">*</span>
                </label>
              <div
                onDragOver={(e) => handleDragOver(e, 2)}
                onDragLeave={(e) => handleDragLeave(e, 2)}
                onDrop={(e) => handleDrop(e, 2)}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging2
                    ? 'border-luxury-black bg-luxury-light'
                    : 'border-luxury-gray-5 hover:border-luxury-gray-3'
                }`}
              >
                {file2 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {file2.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFile2(null)}
                      className="text-xs text-luxury-gray-2 hover:text-luxury-black underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-luxury-gray-2">
                      Drag and drop a PDF file here, or click to browse
                    </p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileChange(e, 2)}
                      className="hidden"
                      id="file2-input"
                      required
                    />
                    <label
                      htmlFor="file2-input"
                      className="inline-block px-4 py-2 text-sm rounded transition-colors btn-primary cursor-pointer"
                    >
                      Choose File
                    </label>
                  </div>
                )}
              </div>
            </div>
            )}
            
            
            <div className="bg-luxury-light p-4 rounded">
              <h3 className="text-sm font-medium mb-2">What happens next:</h3>
              <ul className="list-disc list-inside space-y-1 text-xs text-luxury-gray-1">
                <li>Both report files will be uploaded to OneDrive</li>
                <li>Reports will be saved with the report date in the filename</li>
                <li>Record will be created in the database</li>
                <li>On Monday at 6:00 PM, sellers will receive email with links to both reports</li>
              </ul>
            </div>
            
            <div className="flex justify-center gap-4 pt-6">
              <button
                type="button"
                onClick={() => router.push(`/admin/coordination/${coordinationId}`)}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !file1 || (listing && listing.mls_type !== 'NTREIS' && !file2)}
                className={`px-6 py-2.5 text-sm rounded transition-colors ${
                  uploading || !file1 || (listing && listing.mls_type !== 'NTREIS' && !file2)
                    ? 'bg-luxury-gray-3 text-luxury-gray-2 cursor-not-allowed'
                    : 'btn-primary'
                }`}
              >
                {uploading ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Uploading...</span>
                  </span>
                ) : (
                  'Upload Reports'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}


