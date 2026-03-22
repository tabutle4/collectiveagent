'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
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
  Search,
  Loader2,
  Menu,
  X,
  FileCode,
  Calendar,
  Bookmark,
  BookmarkCheck,
  Image,
  Users,
  FilePlus,
} from 'lucide-react'

const SHAREPOINT_BASE = 'https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter'

// Quick Links - shown at top of nav and in mobile bar
const QUICK_LINKS = [
  {
    label: 'CRC Logos',
    shortLabel: 'Logos',
    href: 'https://www.dropbox.com/scl/fo/a3r2ykrf1hbhgpwuz2l1u/h?rlkey=etadvog8oxd0nfpojmhnyqkgj&st=4ft5fgb5&dl=0',
    icon: Image,
  },
  {
    label: 'W-9 Form',
    shortLabel: 'W-9',
    href: `${SHAREPOINT_BASE}/Agent%20Resources/Forms/AllItems.aspx?id=%2Fsites%2Fagenttrainingcenter%2FAgent%20Resources%2FForms%2FW%2D9%20%28Collective%20Realty%20Co%29%2Epdf`,
    icon: FilePlus,
  },
  {
    label: 'Agent Roster',
    shortLabel: 'Roster',
    href: '/roster',
    icon: Users,
    internal: true,
  },
]

const NAV_SECTIONS = [
  {
    label: 'About Training Center',
    href: `${SHAREPOINT_BASE}/SitePages/About%20the%20Training%20Center.aspx`,
  },
  {
    label: 'Compliance & Commission Overview',
    href: `${SHAREPOINT_BASE}/SitePages/Compliance-and-Commission-Disbursement-Guide.aspx`,
    children: [
      {
        label: 'Commission Plans & Fees',
        href: `${SHAREPOINT_BASE}/SitePages/Commission-Plans.aspx`,
      },
      {
        label: 'Compliance Overview',
        href: `${SHAREPOINT_BASE}/SitePages/Compliance-and-Commission-Disbursement-Guide.aspx`,
      },
    ],
  },
  {
    label: 'Policies & Procedures',
    href: `${SHAREPOINT_BASE}/SitePages/Brokerage%20Policies%20and%20Procedures.aspx`,
  },
  {
    label: 'Agent Onboarding Jumpstart',
    href: `${SHAREPOINT_BASE}/SitePages/Agent%20Onboarding.aspx`,
  },
  { label: 'Quick Links', href: `${SHAREPOINT_BASE}/SitePages/Quick-Links.aspx` },
  { label: 'How-To Guides', href: `${SHAREPOINT_BASE}/SitePages/How-To-Guides(1).aspx` },
  { label: 'Forms', href: `${SHAREPOINT_BASE}/SitePages/Forms.aspx` },
  { label: 'Agent Resources', href: `${SHAREPOINT_BASE}/SitePages/Agent-Resources.aspx` },
  { label: 'Sample Documents', href: `${SHAREPOINT_BASE}/SitePages/Sample-Documents.aspx` },
  {
    label: 'Agent Readiness Checklist',
    href: 'https://collectiverealtyco-my.sharepoint.com/:u:/p/tarab/IQBKkyjR2GzzSq6MhLk6-Fw_Afo2GvqYIK46kxAtfhN_mHQ?e=hNn8we',
  },
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

interface SearchResult {
  id: string
  name: string
  webUrl: string
  lastModified: string
  lastModifiedBy: string
  type: 'video' | 'document' | 'page'
  folder?: string
  category?: string
  score: number
}

interface CoachingSession {
  id: string
  title: string
  start: string
  end: string
  timeZone: string
  location: string | null
  meetingUrl: string | null
  webLink: string
  isAllDay: boolean
}

interface BookmarkItem {
  id: string
  resource_url: string
  resource_name: string
  resource_type: string
  category: string | null
  created_at: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSessionTime(startStr: string, endStr: string, isAllDay: boolean) {
  if (isAllDay) return 'All Day'

  const start = new Date(startStr)
  const end = new Date(endStr)

  const dayName = start.toLocaleDateString('en-US', { weekday: 'short' })
  const date = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return `${dayName}, ${date} · ${startTime} - ${endTime}`
}

function formatVideoName(name: string) {
  return name.replace(/\.(mp4|mov|avi|webm)$/i, '').replace(/[_-]/g, ' ')
}

function formatFileName(name: string) {
  return name.replace(/\.(pdf|docx|xlsx|pptx|doc|xls|aspx)$/i, '').replace(/[_-]/g, ' ')
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
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedNav, setExpandedNav] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null)

  const currentSearchRef = useRef<string>('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [trainingRes, bookmarksRes] = await Promise.all([
          fetch('/api/training-center'),
          fetch('/api/training-center/bookmarks'),
        ])

        if (!trainingRes.ok) throw new Error('Failed to load training center data')

        const trainingData = await trainingRes.json()
        setRecordings(trainingData.recentRecordings || [])
        setResources(trainingData.recentResources || [])
        setVideoFolders(trainingData.videoLibraryFolders || [])
        setSessions(trainingData.thisWeekSessions || [])

        if (bookmarksRes.ok) {
          const bookmarksData = await bookmarksRes.json()
          setBookmarks(bookmarksData.bookmarks || [])
          setBookmarkedUrls(
            new Set((bookmarksData.bookmarks || []).map((b: BookmarkItem) => b.resource_url))
          )
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Debounced search
  useEffect(() => {
    const trimmedQuery = searchQuery.trim()

    if (!trimmedQuery) {
      currentSearchRef.current = ''
      setSearchResults(null)
      setSearching(false)
      return
    }

    currentSearchRef.current = trimmedQuery

    const timer = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      setSearching(true)

      try {
        const res = await fetch(`/api/training-center?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()

        if (currentSearchRef.current === trimmedQuery) {
          setSearchResults(data.searchResults || [])
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          if (currentSearchRef.current === trimmedQuery) {
            setSearchResults([])
          }
        }
      } finally {
        if (currentSearchRef.current === trimmedQuery) {
          setSearching(false)
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleResultClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.stopPropagation()
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      e.preventDefault()
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }, [])

  // Toggle bookmark
  const toggleBookmark = async (
    e: React.MouseEvent,
    url: string,
    name: string,
    type: string,
    category?: string
  ) => {
    e.preventDefault()
    e.stopPropagation()

    setBookmarkLoading(url)

    try {
      if (bookmarkedUrls.has(url)) {
        const res = await fetch(`/api/training-center/bookmarks?url=${encodeURIComponent(url)}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          setBookmarkedUrls(prev => {
            const next = new Set(prev)
            next.delete(url)
            return next
          })
          setBookmarks(prev => prev.filter(b => b.resource_url !== url))
        }
      } else {
        const res = await fetch('/api/training-center/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource_url: url,
            resource_name: name,
            resource_type: type,
            category,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setBookmarkedUrls(prev => new Set(prev).add(url))
          setBookmarks(prev => [data.bookmark, ...prev])
        }
      }
    } catch (err) {
      console.error('Bookmark toggle failed:', err)
    } finally {
      setBookmarkLoading(null)
    }
  }

  // Bookmark button component
  const BookmarkButton = ({
    url,
    name,
    type,
    category,
    className = '',
  }: {
    url: string
    name: string
    type: string
    category?: string
    className?: string
  }) => {
    const isBookmarked = bookmarkedUrls.has(url)
    const isLoading = bookmarkLoading === url

    return (
      <button
        onClick={e => toggleBookmark(e, url, name, type, category)}
        className={`p-1.5 rounded transition-colors ${
          isBookmarked
            ? 'text-luxury-accent'
            : 'text-luxury-gray-4 hover:text-luxury-accent'
        } ${className}`}
        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isBookmarked ? (
          <BookmarkCheck size={14} />
        ) : (
          <Bookmark size={14} />
        )}
      </button>
    )
  }

  const NavContent = () => (
    <>
      <div className="px-4 py-3 border-b border-luxury-gray-5">
        <p className="section-title mb-0">Site Navigation</p>
      </div>

      {/* Quick Links at top of nav */}
      <div className="py-2 border-b border-luxury-gray-5">
        {QUICK_LINKS.map(link => {
          const Icon = link.icon
          if (link.internal) {
            return (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-luxury-gray-1 hover:bg-luxury-light transition-colors"
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon size={14} className="text-luxury-accent" />
                <span>{link.label}</span>
              </Link>
            )
          }
          return (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 text-xs text-luxury-gray-1 hover:bg-luxury-light transition-colors group"
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={14} className="text-luxury-accent" />
              <span>{link.label}</span>
              <ExternalLink
                size={11}
                className="opacity-0 group-hover:opacity-100 text-luxury-gray-3 ml-auto transition-opacity"
              />
            </a>
          )
        })}
      </div>

      <nav className="py-2">
        {NAV_SECTIONS.map(section => (
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
                    {section.children.map(child => (
                      <a
                        key={child.label}
                        href={child.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 hover:bg-luxury-light transition-colors"
                        onClick={() => setMobileNavOpen(false)}
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
                onClick={() => setMobileNavOpen(false)}
              >
                <span>{section.label}</span>
                <ExternalLink
                  size={11}
                  className="opacity-0 group-hover:opacity-100 text-luxury-accent transition-opacity"
                />
              </a>
            )}
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-luxury-gray-5">
        <a
          href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Calendars.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary w-full flex items-center justify-center gap-2"
          onClick={() => setMobileNavOpen(false)}
        >
          Coaching Calendar
          <ExternalLink size={11} />
        </a>
      </div>
    </>
  )

  const getResultIcon = (result: SearchResult | BookmarkItem) => {
    const type = 'type' in result ? result.type : result.resource_type
    if (type === 'video') {
      return <Play size={14} className="text-luxury-accent flex-shrink-0 mt-0.5" />
    }
    if (type === 'page') {
      return <FileCode size={14} className="text-luxury-accent flex-shrink-0 mt-0.5" />
    }
    return <FileText size={14} className="text-luxury-accent flex-shrink-0 mt-0.5" />
  }

  const getResultTypeLabel = (result: SearchResult) => {
    if (result.type === 'page') return 'Page'
    if (result.type === 'video') return 'Video'
    return 'Document'
  }

  const formatResultName = (result: SearchResult) => {
    if (result.type === 'video') {
      return formatVideoName(result.name)
    }
    return formatFileName(result.name)
  }

  return (
    <div className="min-h-screen flex flex-col bg-luxury-light">
      <LuxuryHeader />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 pt-20 md:pt-24">
        {/* Back link */}
        <div className="mb-4">
          <button
            onClick={() => window.history.back()}
            type="button"
            className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
          >
            <ChevronRight size={12} className="rotate-180" />
            Back to Collective Agent
          </button>
        </div>

        {/* Header Banner */}
        <div className="card-dark rounded-xl mb-6 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <BookOpen size={22} className="text-luxury-accent" />
                <h1 className="page-title text-white">Training Center</h1>
              </div>
              <p className="text-xs text-white/60">
                Coaching recordings, resources, guides, and everything you need to grow your
                business.
              </p>
            </div>
            <a
              href={SHAREPOINT_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary flex items-center gap-2 self-start md:self-auto"
            >
              Open Training Center in SharePoint
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {error && (
          <div className="alert-warning flex items-center gap-2 mb-4">
            <AlertCircle size={14} />
            Could not load live data.{' '}
            <a href={SHAREPOINT_BASE} target="_blank" className="underline">
              Open Training Center
            </a>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3"
          />
          <input
            type="text"
            placeholder="Search recordings, guides, forms, pages, resources..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-luxury pl-8 w-full"
          />
          {searching && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-luxury-gray-3 animate-spin"
            />
          )}
        </div>

        {/* Mobile Quick Links Bar - Always visible */}
        <div className="md:hidden mb-4">
          <div className="container-card p-3">
            <div className="flex justify-around">
              {QUICK_LINKS.map(link => {
                const Icon = link.icon
                if (link.internal) {
                  return (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="w-10 h-10 rounded-lg bg-luxury-accent/10 flex items-center justify-center">
                        <Icon size={18} className="text-luxury-accent" />
                      </div>
                      <span className="text-xs text-luxury-gray-2">{link.shortLabel}</span>
                    </Link>
                  )
                }
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-10 h-10 rounded-lg bg-luxury-accent/10 flex items-center justify-center">
                      <Icon size={18} className="text-luxury-accent" />
                    </div>
                    <span className="text-xs text-luxury-gray-2">{link.shortLabel}</span>
                  </a>
                )
              })}
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-10 h-10 rounded-lg bg-luxury-light border border-luxury-gray-5 flex items-center justify-center">
                  {mobileNavOpen ? (
                    <X size={18} className="text-luxury-gray-2" />
                  ) : (
                    <Menu size={18} className="text-luxury-gray-2" />
                  )}
                </div>
                <span className="text-xs text-luxury-gray-2">More</span>
              </button>
            </div>
          </div>
          {mobileNavOpen && (
            <div className="container-card mt-2 p-0 overflow-hidden">
              <NavContent />
            </div>
          )}
        </div>

        {/* SEARCH RESULTS */}
        {searchQuery.trim() ? (
          <div className="space-y-4">
            {searching ? (
              <div className="container-card text-center py-12 text-xs text-luxury-gray-3">
                Searching...
              </div>
            ) : searchResults !== null ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-luxury-gray-3">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "
                    {searchQuery}"
                  </p>
                  <a
                    href={`${SHAREPOINT_BASE}/_layouts/15/search.aspx/siteall?q=${encodeURIComponent(searchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary flex items-center gap-1"
                  >
                    Open in Training Center Search
                    <ExternalLink size={11} />
                  </a>
                </div>

                {searchResults.length > 0 ? (
                  <div className="container-card">
                    <div className="divide-y divide-luxury-gray-5/30">
                      {searchResults.map(result => (
                        <div
                          key={`${result.type}-${result.id}`}
                          className="flex items-start gap-3 py-3 px-2 hover:bg-luxury-light rounded transition-colors group"
                        >
                          <a
                            href={result.webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => handleResultClick(e, result.webUrl)}
                            className="flex items-start gap-3 flex-1 min-w-0 touch-manipulation"
                          >
                            {getResultIcon(result)}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-0.5">
                                {formatResultName(result)}
                              </p>
                              <p className="text-xs text-luxury-gray-3">
                                {result.category}
                                {' · '}
                                <span>{getResultTypeLabel(result)}</span>
                                {' · '}
                                {formatDate(result.lastModified)}
                              </p>
                            </div>
                          </a>
                          <BookmarkButton
                            url={result.webUrl}
                            name={formatResultName(result)}
                            type={result.type}
                            category={result.category}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="container-card text-center py-12 text-xs text-luxury-gray-3">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : (
          /* DEFAULT VIEW */
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Nav - desktop only */}
            <div className="hidden md:block w-56 flex-shrink-0">
              <div className="container-card sticky top-6 p-0 overflow-hidden">
                <NavContent />
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* This Week's Coaching - Horizontal Scroll */}
              {sessions.length > 0 && (
                <div className="container-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar size={16} className="text-luxury-accent" />
                    <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
                      This Week's Coaching
                    </h2>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {sessions.map(session => (
                      <a
                        key={session.id}
                        href={session.meetingUrl || session.webLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inner-card flex items-center gap-3 p-3 min-w-[280px] flex-shrink-0 hover:bg-luxury-light transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-luxury-accent/10 flex items-center justify-center flex-shrink-0">
                          <Video size={18} className="text-luxury-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-0.5 truncate">
                            {session.title}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            {formatSessionTime(session.start, session.end, session.isAllDay)}
                          </p>
                        </div>
                        {session.meetingUrl && (
                          <span className="text-xs px-2.5 py-1 rounded bg-luxury-accent/15 text-luxury-accent font-medium flex-shrink-0">
                            Join
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* My Bookmarks - Horizontal Scroll */}
              {bookmarks.length > 0 && (
                <div className="container-card">
                  <div className="flex items-center gap-2 mb-4">
                    <BookmarkCheck size={16} className="text-luxury-accent" />
                    <h2 className="text-sm font-semibold text-luxury-gray-1 uppercase tracking-wider">
                      My Bookmarks
                    </h2>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {bookmarks.map(bookmark => (
                      <a
                        key={bookmark.id}
                        href={bookmark.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inner-card flex items-start gap-3 p-3 min-w-[220px] flex-shrink-0 hover:bg-luxury-light transition-colors group"
                      >
                        {getResultIcon(bookmark)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-0.5">
                            {bookmark.resource_name}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            {bookmark.category || bookmark.resource_type}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="inner-card animate-pulse h-48" />
                    ))}
                  </div>
                ) : recordings.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {recordings.map(rec => (
                      <div key={rec.id} className="relative group">
                        <a
                          href={rec.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => handleResultClick(e, rec.webUrl)}
                          className="card-luxury rounded-lg overflow-hidden hover:shadow-md transition-shadow block touch-manipulation"
                        >
                          <div
                            className="relative bg-luxury-dark-3"
                            style={{ paddingTop: '56.25%' }}
                          >
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
                            <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-1">
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
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded">
                          <BookmarkButton
                            url={rec.webUrl}
                            name={formatVideoName(rec.name)}
                            type="video"
                            category={rec.folder}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="inner-card text-center py-8 text-xs text-luxury-gray-3">
                    No recordings found.{' '}
                    <a
                      href={SHAREPOINT_BASE}
                      target="_blank"
                      className="text-luxury-accent hover:underline"
                    >
                      Browse SharePoint
                    </a>
                  </div>
                )}
              </div>

              {/* Resources + Video Library */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      {resources.map(res => (
                        <div
                          key={res.id}
                          className="flex items-start gap-3 py-3 px-2 hover:bg-luxury-light rounded transition-colors group"
                        >
                          <a
                            href={res.webUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => handleResultClick(e, res.webUrl)}
                            className="flex items-start gap-3 flex-1 min-w-0 touch-manipulation"
                          >
                            <FileText
                              size={14}
                              className="text-luxury-accent flex-shrink-0 mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-luxury-gray-1 leading-tight mb-0.5">
                                {formatFileName(res.name)}
                              </p>
                              <p className="text-xs text-luxury-gray-3">
                                {res.category} · {formatDate(res.lastModified)}
                              </p>
                            </div>
                          </a>
                          <BookmarkButton
                            url={res.webUrl}
                            name={formatFileName(res.name)}
                            type="document"
                            category={res.category}
                          />
                        </div>
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
                      {videoFolders.map(folder => (
                        <a
                          key={folder.id}
                          href={folder.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => handleResultClick(e, folder.webUrl)}
                          className="flex items-center justify-between py-3 px-2 hover:bg-luxury-light rounded transition-colors group touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <Folder size={14} className="text-luxury-accent" />
                            <span className="text-xs font-medium text-luxury-gray-1">
                              {folder.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {folder.childCount > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-luxury-light text-luxury-gray-3 border border-luxury-gray-5">
                                {folder.childCount}
                              </span>
                            )}
                            <ExternalLink
                              size={11}
                              className="opacity-0 group-hover:opacity-100 text-luxury-accent transition-opacity"
                            />
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
        )}
      </main>

      <AuthFooter />
    </div>
  )
}