'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, UserCog, PanelLeft, Calendar, Mail,
  FileText, Briefcase, FileCheck, Receipt, UsersRound, BarChart3,
  DollarSign, Settings, Menu, X, ChevronRight
} from 'lucide-react'
import ContactDrawer from './ContactDrawer'

interface NavItem {
  href: string
  label: string
  icon: any
  disabled?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

interface AppSidebarProps {
  children: React.ReactNode
}

const adminNavSections: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/transactions', label: 'Transactions', icon: Receipt },
      { href: '/admin/reports', label: 'Reports', icon: BarChart3, disabled: true },
    ],
  },
  {
    title: 'COMPANY',
    items: [
      { href: '/admin/users', label: 'Users', icon: UserCog },
      { href: '/admin/team-agreements', label: 'Teams', icon: UsersRound },
      { href: '/admin/revenue-share', label: 'Revenue Share', icon: DollarSign, disabled: true },
    ],
  },
  {
    title: 'ACTIVITY',
    items: [
      { href: '/admin/campaigns', label: 'Campaigns', icon: Calendar },
      { href: '/admin/form-responses', label: 'Form Responses', icon: FileCheck },
      { href: '/admin/coordination', label: 'Listing Coordination', icon: Briefcase },
    ],
  },
  {
    title: 'LIBRARY',
    items: [
      { href: '/admin/email-templates', label: 'Email Templates', icon: Mail },
      { href: '/admin/agent-roster', label: 'Agent Roster', icon: FileText },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { href: '/admin/settings', label: 'Company Settings', icon: Settings, disabled: true },
    ],
  },
]

const agentNavSections: NavSection[] = [
  {
    title: 'MENU',
    items: [
      { href: '/agent/forms', label: 'Forms', icon: FileText },
      { href: '/agent/form-responses', label: 'Transactions', icon: Briefcase },
    ],
  },
]

export default function AppSidebar({ children }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = pathname?.startsWith('/admin')
  const navSections = isAdmin ? adminNavSections : agentNavSections

  useEffect(() => {
    setMounted(true)

    if (typeof window !== 'undefined') {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setSidebarOpen(false)

      const handleResize = () => {
        const mobile = window.innerWidth < 768
        setIsMobile(mobile)
        if (mobile) setSidebarOpen(false)
      }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (user) return

    const userStr = localStorage.getItem('user')
    if (!userStr) {
      const currentPath = window.location.pathname + window.location.search
      router.push(`/auth/login?redirect=${encodeURIComponent(currentPath)}`)
      return
    }

    try {
      const userData = JSON.parse(userStr)
      const role = userData.role || ''

      if (isAdmin && role !== 'Admin') {
        router.push('/auth/login')
        return
      }
      if (!isAdmin && role !== 'Agent' && role !== 'Admin') {
        router.push('/auth/login')
        return
      }

      setUser(userData)
    } catch (error) {
      router.push('/auth/login')
    }
  }, [router, user, isAdmin])

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  if (!user || !mounted) return null

  const sidebarWidth = sidebarOpen ? 240 : 0
  const desktopSidebarWidth = sidebarOpen ? 240 : 64

  return (
    <div className="min-h-screen bg-luxury-light">
      {/* Mobile overlay */}
      {sidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 bg-luxury-light z-50 flex flex-col
          transition-all duration-300 ease-out overflow-hidden
          ${isMobile
            ? (sidebarOpen ? 'w-[240px] translate-x-0' : 'w-[240px] -translate-x-full')
            : (sidebarOpen ? 'w-[240px]' : 'w-16')
          }
        `}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between px-5 py-5 flex-shrink-0">
          {sidebarOpen ? (
            <Link href={isAdmin ? '/admin/dashboard' : '/profile'} className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Collective Realty Co."
                className="w-10 h-10 object-contain"
              />
              <span className="text-sm font-semibold text-luxury-gray-1 tracking-wide">
                COLLECTIVE AGENT
              </span>
            </Link>
          ) : (
            <Link href={isAdmin ? '/admin/dashboard' : '/profile'} className="mx-auto">
              <img
                src="/logo.png"
                alt="Collective Realty Co."
                className="w-8 h-8 object-contain"
              />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {navSections.map((section, sectionIndex) => (
            <div key={section.title} className={sectionIndex > 0 ? 'mt-5' : ''}>
              {sidebarOpen && (
                <p className="px-3 mb-2 text-[10px] font-semibold text-luxury-gray-3 tracking-widest uppercase">
                  {section.title}
                </p>
              )}

              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = !item.disabled && (
                  pathname === item.href || pathname?.startsWith(item.href + '/')
                )

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className={`
                        flex items-center gap-3 px-3 py-2 mb-0.5 rounded-md opacity-40 cursor-not-allowed
                        ${!sidebarOpen ? 'justify-center' : ''}
                      `}
                      title={!sidebarOpen ? item.label : undefined}
                    >
                      <Icon size={18} className="text-luxury-gray-3 flex-shrink-0" strokeWidth={1.5} />
                      {sidebarOpen && (
                        <span className="text-sm text-luxury-gray-3">{item.label}</span>
                      )}
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2 mb-0.5 rounded-md transition-colors
                      ${!sidebarOpen ? 'justify-center' : ''}
                      ${isActive
                        ? 'bg-white shadow-sm text-luxury-gray-1'
                        : 'text-luxury-gray-2 hover:bg-white/60 hover:text-luxury-gray-1'
                      }
                    `}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <Icon
                      size={18}
                      className={`flex-shrink-0 ${isActive ? 'text-luxury-gray-1' : 'text-luxury-gray-3'}`}
                      strokeWidth={1.5}
                    />
                    {sidebarOpen && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User area at bottom */}
        <div className="flex-shrink-0 border-t border-luxury-gray-5/50 p-3 relative">
          {sidebarOpen ? (
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-white/60 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-luxury-gray-1 truncate">
                  {user.preferred_first_name} {user.preferred_last_name}
                </p>
                <p className="text-[11px] text-luxury-gray-3 truncate">{user.email}</p>
              </div>
              <ChevronRight size={14} className="text-luxury-gray-3 flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-medium mx-auto hover:opacity-80 transition-opacity"
            >
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </button>
          )}

          {/* User popup menu */}
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-full left-3 mb-2 w-52 bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 py-1.5 z-50">
                {!isAdmin && (
                  <Link
                    href="/agent/profile"
                    className="block px-4 py-2 text-sm text-luxury-gray-2 hover:bg-luxury-light transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Profile
                  </Link>
                )}
                <a
                  href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-sm text-luxury-gray-2 hover:bg-luxury-light transition-colors"
                >
                  Training Center
                </a>
                <a
                  href="https://coachingbrokeragetools.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-sm text-luxury-gray-2 hover:bg-luxury-light transition-colors"
                >
                  Tools Home
                </a>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    setContactOpen(true)
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-luxury-gray-2 hover:bg-luxury-light transition-colors"
                >
                  Contact
                </button>
                <div className="border-t border-luxury-gray-5/50 my-1" />
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-luxury-light transition-colors"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div
        className="transition-all duration-300 ease-out min-h-screen"
        style={{
          marginLeft: isMobile ? 0 : (sidebarOpen ? '240px' : '64px'),
        }}
      >
        {/* Top bar - mobile hamburger + collapse toggle desktop */}
        <div className="sticky top-0 z-30 bg-luxury-light/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile ? (
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-luxury-gray-2 hover:text-luxury-gray-1 transition-colors"
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
            ) : (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
              >
                <PanelLeft size={18} strokeWidth={1.5} />
              </button>
            )}
            {isMobile && (
              <span className="text-sm font-semibold text-luxury-gray-1 tracking-wide">
                COLLECTIVE AGENT
              </span>
            )}
          </div>

          <p className="text-sm text-luxury-gray-3">
            Welcome back, <span className="text-luxury-gray-1 font-medium">{user.preferred_first_name}</span>
          </p>
        </div>

        {/* Page content */}
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>

      {/* Contact Drawer */}
      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}