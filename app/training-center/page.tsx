'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import {
  BookOpen,
  Video,
  FileText,
  ExternalLink,
  ChevronRight,
  Folder,
  Clock,
  User,
  Play,
  AlertCircle,
} from 'lucide-react'

const SHAREPOINT_BASE = 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter'

const NAV_SECTIONS = [
  { label: 'About Training Center', href: `${SHAREPOINT_BASE}/SitePages/About%20the%20Training%20Center.aspx` },
  {
    label: 'Compliance & Commission Overview',
    href: `${SHAREPOINT_BASE}/SitePages/Compliance-and-Commission-Disbursement-Guide.aspx`,
    children: [
      { label: 'Commission Plans & Fees', href: `${SHAREPOINT_BASE}/SitePages/Commission-Plans.aspx` },
      { label: 'Compliance Overview', href: `${SHAREPOINT_BASE}/SitePages/Compliance-and-Commission-Disbursement-Guide.aspx` },
    ],
  },
  { label: 'Policies & Procedures', href: `${SHAREPOINT_BASE}/SitePages/Brokerage%20Policies%20and%20Procedures.aspx` },
  { label: 'Agent Onboarding Jumpstart', href: `${SHAREPOINT_BASE}/SitePages/Agent%20Onboarding.aspx` },
  { label: 'Quick Links', href: `${SHAREPOINT_BASE}/SitePages/Quick-Links.aspx` },
  { label: 'How-To Guides', href: `${SHAREPOINT_BASE}/SitePages/How-To-Guides(1).aspx` },
  { label: 'Forms', href: `${SHAREPOINT_BASE}/SitePages/Forms.aspx` },
  { label: 'Agent Resources', href: `${SHAREPOINT_BASE}/SitePages/Agent-Resources.aspx` },
  { label: 'Sample Documents', href: `${SHAREPOINT_BASE}/SitePages/Sample-Documents.aspx` },
  { label: 'Agent Readiness Checklist', href: 'https://collectiverealtyco-my.sharepoint.com/:u:/p/tarab/IQBKkyjR2GzzSq6MhLk6-Fw_Afo2GvqYIK46kxAtfhN_mHQ?e=hNn8we' },
  { label: 'Help', href: `${SHAREPOINT_BASE}/SitePages/Help.aspx` },
]

interface Recording {
  id: string
  name: string
  webUrl: string
  lastModified: string
  lastModifiedBy: string
  thumbnail: string | null
  folder: string
}

interface Resource {
  id: string
  name: string
  webUrl: string
  lastModified: string
  lastModifiedBy: string
  category: string
}

interface VideoFolder {
  id: string
  name: string
  webUrl: string
  childCount: number
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatVideoName(name: string) {
  return name.replace(/\.(mp4|mov|avi|webm)$/i, '').replace(/[_-]/g, ' ')
}

function formatFileName(name: string) {
  return name.replace(/\.(pdf|docx|xlsx|pptx|doc|xls)$/i, '').replace(/[_-]/g, ' ')
}

function getFileIcon(name: string) {
  if (name?.endsWith('.pdf')) return '📄'
  if (name?.endsWith('.docx') || name?.endsWith('.doc')) return '📝'
  if (name?.endsWith('.xlsx') || name?.endsWith('.xls')) return '📊'
  if (name?.endsWith('.pptx') || name?.endsWith('.ppt')) return '📋'
  return '📁'
}

export default function TrainingCenterPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [videoFolders, setVideoFolders] = useState<VideoFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedNav, setExpandedNav] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/training-center')
        if (!res.ok) throw new Error('Failed to load training center data')
        const data = await res.json()
        setRecordings(data.recentRecordings || [])
        setResources(data.recentResources || [])
        setVideoFolders(data.videoLibraryFolders || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-luxury-light">
      <LuxuryHeader />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 pt-16">
        {/* Header Banner */}
        <div className="card-dark rounded-xl mb-6 p-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <BookOpen size={24} className="text-luxury-accent" />
              <h1 className="page-title text-white">Training Center</h1>
            </div>
            <p className="text-xs text-white/60">
              Coaching recordings, resources, guides, and everything you need to grow your business.
            </p>
          </div>
          <a
            href={SHAREPOINT_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary flex items-center gap-2"
          >
            Open Full Training Center
            <ExternalLink size={12} />
          </a>
        </div>

        {error && (
          <div className="alert-warning flex items-center gap-2 mb-4">
            <AlertCircle size={14} />
            Could not load live data from SharePoint.{' '}
            <a href={SHAREPOINT_BASE} target="_blank" className="underline">
              Open Training Center directly →
            </a>
          </div>
        )}

        <div className="flex gap-6">
          {/* Left Nav */}
          <div className="w-56 flex-shrink-0">
            <div className="card-luxury rounded-xl overflow-hidden sticky top-6">
              <div className="px-4 py-3 border-b border-luxury-gray-5">
                <p className="section-title mb-0">Site Navigation</p>
              </div>
              <nav className="py-2">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.label}>
                    {section.children ? (
                      <>
                        <button
                          onClick={() =>
                            setExpandedNav(expandedNav === section.label ? null : section.label)
                          }
                          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition-colors hover:bg-luxury-light text-luxury-gray-2"
                        >
                          <span>{section.label}</span>
                          <ChevronRight
                            size={12}
                            className="text-luxury-gray-3 transition-transform"
                            style={{ transform: expandedNav === section.label ? 'rotate(90deg)' : 'none' }}
                          />
                        </button>
                        {expandedNav === section.label && (
                          <div className="pl-3 pb-1">
                            {section.children.map((child) => (
                              <a
                                key={child.label}
                                href={child.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 hover:bg-luxury-light transition-colors"
                              >
                                <ChevronRight size={10} className="text-luxury-accent" />
                                {child.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <a
                        href={section.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-4 py-2.5 text-xs text-luxury-gray-2 hover:text-luxury-gray-1 hover:bg-luxury-light transition-colors group"
                      >
                        <span>{section.label}</span>
                        <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 text-luxury-accent transition-opacity" />
                      </a>
                    )}
                  </div>
                ))}
              </nav>
              <div className="px-4 py-3 border-t border-luxury-gray-5">
                <a
                  href="https://collectiverealtyco.setmore.com/services/1fe35e59-6d4f-4392-8227-c831b31cefd0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                >
                  Coaching Calendar
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Recent Recordings */}
            <div className="container-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Video size={16} className="text-luxury-accent" />
                  <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
                    Coaching & Training Recordings
                  </h2>
                </div>
                <a
                  href={SHAREPOINT_BASE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="header-subtitle flex items-center gap-1"
                >
                  See all <ExternalLink size={11} />
                </a>
              </div>

              {loading ? (
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="inner-card animate-pulse h-48" />
                  ))}
                </div>
              ) : recordings.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {recordings.map((rec) => (
                    <a
                      key={rec.id}
                      href={rec.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-luxury rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
                    >
                      <div className="relative bg-luxury-dark-3" style={{ paddingTop: '56.25%' }}>
                        {rec.thumbnail ? (
                          <img
                            src={rec.thumbnail}
                            alt={rec.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Play size={28} className="text-luxury-accent" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity" />
                        <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded bg-luxury-accent text-white font-medium">
                          {rec.folder}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-1 line-clamp-2">
                          {formatVideoName(rec.name)}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-luxury-gray-3">
                          <User size={10} />
                          <span>{rec.lastModifiedBy}</span>
                          <span className="mx-1">·</span>
                          <Clock size={10} />
                          <span>{formatDate(rec.lastModified)}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="inner-card text-center py-8 text-xs text-luxury-gray-3">
                  No recordings found.{' '}
                  <a href={SHAREPOINT_BASE} target="_blank" className="text-luxury-accent hover:underline">
                    Browse SharePoint directly →
                  </a>
                </div>
              )}
            </div>

            {/* Resources + Video Library */}
            <div className="grid grid-cols-2 gap-6">

              {/* Recently Uploaded Resources */}
              <div className="container-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-luxury-accent" />
                    <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
                      Recently Uploaded Resources
                    </h2>
                  </div>
                  <a
                    href={SHAREPOINT_BASE}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="header-subtitle flex items-center gap-1"
                  >
                    See all <ExternalLink size={11} />
                  </a>
                </div>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="inner-card animate-pulse h-12" />
                    ))}
                  </div>
                ) : resources.length > 0 ? (
                  <div className="divide-y divide-luxury-gray-5/30">
                    {resources.map((res) => (
                      <a
                        key={res.id}
                        href={res.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 py-3 px-2 hover:bg-luxury-light rounded transition-colors group"
                      >
                        <span className="text-base flex-shrink-0">{getFileIcon(res.name)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-0.5 line-clamp-2">
                            {formatFileName(res.name)}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            {res.category} · {formatDate(res.lastModified)}
                          </p>
                        </div>
                        <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 text-luxury-accent flex-shrink-0 mt-0.5 transition-opacity" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="inner-card text-center py-6 text-xs text-luxury-gray-3">
                    No resources found.
                  </div>
                )}
              </div>

              {/* Video Library */}
              <div className="container-card">
                <div className="flex items-center gap-2 mb-4">
                  <Folder size={16} className="text-luxury-accent" />
                  <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
                    Video Library
                  </h2>
                </div>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="inner-card animate-pulse h-10" />
                    ))}
                  </div>
                ) : videoFolders.length > 0 ? (
                  <div className="divide-y divide-luxury-gray-5/30">
                    {videoFolders.map((folder) => (
                      <a
                        key={folder.id}
                        href={folder.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between py-3 px-2 hover:bg-luxury-light rounded transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Folder size={14} className="text-luxury-accent" />
                          <span className="text-xs font-medium text-luxury-gray-1">{folder.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {folder.childCount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-luxury-light text-luxury-gray-3 border border-luxury-gray-5">
                              {folder.childCount}
                            </span>
                          )}
                          <ExternalLink size={11} className="opacity-0 group-hover:opacity-100 text-luxury-accent transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="inner-card text-center py-6 text-xs text-luxury-gray-3">
                    No folders found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <AuthFooter />
    </div>
  )
}