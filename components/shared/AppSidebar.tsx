'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  UserCog,
  CalendarDays,
  Megaphone,
  Search,
  Wallet,
  Briefcase,
  Receipt,
  UsersRound,
  DollarSign,
  Settings,
  Menu,
  X,
  ChevronRight,
  Users,
  UserPlus,
  FileText,
  FolderOpen,
  CircleDollarSign,
  BookUser,
  ClipboardList,
  BarChart3,
  BookOpen,
  Building2,
} from 'lucide-react'
import ContactDrawer from './ContactDrawer'
import GlobalSearch from './GlobalSearch'
import CornerLines from './CornerLines'
import { useAuth } from '@/lib/context/AuthContext'

interface NavItem {
  href: string
  label: string
  icon: any
  disabled?: boolean
  external?: boolean
}

interface AppSidebarProps {
  children: React.ReactNode
  logoUrl?: string
}

const adminNav: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/users', label: 'Agents', icon: UserCog },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/prospects', label: 'Prospects', icon: UserPlus },
  { href: '/admin/contacts', label: 'Contacts', icon: BookUser, disabled: true },
  { href: '/admin/documents', label: 'Documents', icon: FolderOpen, disabled: true },
  { href: '/admin/onboarding', label: 'Onboarding', icon: ClipboardList },
  { href: '/admin/billing', label: 'Billing', icon: Wallet },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/admin/form-responses', label: 'Forms', icon: FileText },
  { href: '/admin/coordination', label: 'Listings', icon: Briefcase },
  { href: '/admin/pm', label: 'Property Mgmt', icon: Building2 },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/revenue-share', label: 'Revenue Share', icon: DollarSign, disabled: true },
  { href: '/training-center', label: 'Training Center', icon: BookOpen },
  {
    href: 'https://agent.collectiverealtyco.com/roster',
    label: 'Roster',
    icon: FileText,
    external: true,
  },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

const tcNav: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/users', label: 'Agents', icon: UserCog },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/prospects', label: 'Prospects', icon: UserPlus },
  { href: '/admin/contacts', label: 'Contacts', icon: BookUser },
  { href: '/admin/documents', label: 'Documents', icon: FolderOpen },
  { href: '/admin/billing', label: 'Billing', icon: Wallet },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/form-responses', label: 'Forms', icon: FileText },
  { href: '/admin/coordination', label: 'Listings', icon: Briefcase },
  { href: '/admin/pm', label: 'Property Mgmt', icon: Building2 }, 
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, disabled: true },
  { href: '/admin/revenue-share', label: 'Revenue Share', icon: DollarSign, disabled: true },
  { href: '/training-center', label: 'Training Center', icon: BookOpen },
  {
    href: 'https://agent.collectiverealtyco.com/roster',
    label: 'Roster',
    icon: FileText,
    external: true,
  },
]

const supportNav: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/billing', label: 'Billing', icon: CircleDollarSign },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/users', label: 'Agents', icon: UserCog },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/prospects', label: 'Prospects', icon: UserPlus },
  { href: '/admin/contacts', label: 'Contacts', icon: BookUser },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/form-responses', label: 'Forms', icon: FileText },
  { href: '/admin/pm', label: 'Property Mgmt', icon: Building2 }, 
  { href: '/admin/revenue-share', label: 'Revenue Share', icon: DollarSign, disabled: true },
  { href: '/training-center', label: 'Training Center', icon: BookOpen },
  {
    href: 'https://agent.collectiverealtyco.com/roster',
    label: 'Roster',
    icon: FileText,
    external: true,
  },
]

const agentNav: NavItem[] = [
  { href: '/agent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/agent/checklist', label: 'Checklist', icon: ClipboardList },
  { href: '/agent/fees', label: 'Fees', icon: CircleDollarSign },
  { href: '/agent/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/agent/forms', label: 'Forms', icon: FileText },
  { href: '/agent/contacts', label: 'Contacts', icon: Users },
  { href: '/agent/documents', label: 'Documents', icon: FolderOpen },
  {
    href: 'https://agent.collectiverealtyco.com/roster',
    label: 'Roster',
    icon: FileText,
    external: true,
  },
  { href: '/agent/reports', label: 'Reports', icon: BarChart3, disabled: true },
  { href: '/training-center', label: 'Training Center', icon: BookOpen },
  { href: '/agent/settings', label: 'Settings', icon: Settings, disabled: true },
]

export default function AppSidebar({ children, logoUrl }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const userRole = user ? (user.role || '').toLowerCase() : ''
  const isAdmin = ['admin', 'broker', 'operations'].includes(userRole)
  const isTC = userRole === 'tc'
  const isSupport = userRole === 'support'
  const isStaff = isAdmin || isTC || isSupport

  const restrictedAgentNav: NavItem[] = [
    { href: '/agent/profile', label: 'Profile', icon: UserCog },
    { href: '/agent/checklist', label: 'Checklist', icon: ClipboardList },
    { href: '/agent/fees', label: 'Fees', icon: CircleDollarSign },
    { href: '/agent/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/training-center', label: 'Training Center', icon: BookOpen },
    {
      href: 'https://agent.collectiverealtyco.com/roster',
      label: 'Roster',
      icon: FileText,
      external: true,
    },
  ]

  const getNavItems = () => {
    if (isAdmin) return adminNav
    if (isTC) return tcNav
    if (isSupport) return supportNav
    if (user?.full_nav_access) return agentNav
    return restrictedAgentNav
  }

  const navItems = getNavItems()
  const logo = logoUrl || '/logo.png'

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const checkMobile = () => setIsMobile(window.innerWidth < 768)
      checkMobile()
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  // Global keyboard shortcut for search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    // Redirect to login if not authenticated and done loading
    if (!loading && !user) {
      const currentPath = window.location.pathname + window.location.search
      router.push(`/auth/login?redirect=${encodeURIComponent(currentPath)}`)
    }
  }, [loading, user, router])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/auth/login')
  }

  if (loading || !user || !mounted) return null

  const sidebarContent = (
    <>
      <div className="flex items-center justify-center px-4 py-4 flex-shrink-0">
        <Link href={isStaff ? '/admin/dashboard' : '/agent/profile'}>
          <img src={logo} alt="Logo" className="sidebar-logo" />
        </Link>
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive =
            !item.disabled &&
            !item.external &&
            (pathname === item.href || pathname?.startsWith(item.href + '/'))

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md opacity-30 cursor-not-allowed"
              >
                <Icon size={18} className="text-luxury-gray-3 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-[13px] text-luxury-gray-2">{item.label}</span>
              </div>
            )
          }

          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-luxury-gray-2 hover:bg-luxury-gray-5/40 hover:text-luxury-gray-1"
              >
                <Icon size={18} className="flex-shrink-0 text-luxury-gray-3" strokeWidth={1.5} />
                <span className="text-[13px] font-medium">{item.label}</span>
              </a>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md transition-colors
                ${
                  isActive
                    ? 'bg-luxury-gray-5/60 text-luxury-gray-1'
                    : 'text-luxury-gray-2 hover:bg-luxury-gray-5/40 hover:text-luxury-gray-1'
                }
              `}
            >
              <Icon
                size={18}
                className={`flex-shrink-0 ${isActive ? 'text-luxury-gray-1' : 'text-luxury-gray-3'}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-2 flex-shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md text-luxury-gray-3 hover:bg-luxury-gray-5/40 hover:text-luxury-gray-1 transition-colors w-full"
        >
          <div className="flex items-center gap-3">
            <Search size={18} className="flex-shrink-0" strokeWidth={1.5} />
            <span className="text-[13px] font-medium">Search</span>
          </div>
          <kbd className="hidden md:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-luxury-gray-5/50 text-luxury-gray-3 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex-shrink-0 border-t border-luxury-gray-5/50 relative">
        <div className="p-3">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md hover:bg-luxury-gray-5/40 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user.preferred_first_name?.[0]}
              {user.preferred_last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold text-luxury-gray-1 truncate">
                {user.preferred_first_name} {user.preferred_last_name}
              </p>
            </div>
            <ChevronRight size={14} className="text-luxury-gray-3 flex-shrink-0" />
          </button>
        </div>

        <div className="px-5 pb-3 flex justify-end">
          <span className="text-[9px] font-semibold text-luxury-gray-3 tracking-[0.2em] uppercase">
            Collective Agent
          </span>
        </div>

        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-3 mb-2 w-52 bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 py-1.5 z-50">
              {!isStaff && (
                <Link
                  href="/agent/profile"
                  className="block px-4 py-2 text-[13px] text-luxury-gray-2 hover:bg-luxury-gray-5/30 transition-colors"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Profile
                </Link>
              )}
              <a
                href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-[13px] text-luxury-gray-2 hover:bg-luxury-gray-5/30 transition-colors"
              >
                Training Center
              </a>
              <a
                href="https://coachingbrokeragetools.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-[13px] text-luxury-gray-2 hover:bg-luxury-gray-5/30 transition-colors"
              >
                Tools Home
              </a>
              <button
                onClick={() => {
                  setUserMenuOpen(false)
                  setContactOpen(true)
                }}
                className="block w-full text-left px-4 py-2 text-[13px] text-luxury-gray-2 hover:bg-luxury-gray-5/30 transition-colors"
              >
                Contact
              </button>
              <div className="border-t border-luxury-gray-5/50 my-1" />
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-[13px] text-red-500 hover:bg-luxury-gray-5/30 transition-colors"
              >
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )

  // Hide corner lines on reports pages (they have their own styling)
  const showCornerLines = !pathname.startsWith('/admin/reports')

  return (
    <div className="min-h-screen bg-luxury-page-bg" style={{ position: 'relative' }}>
      {showCornerLines && (
        <div className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.85 }}>
          <CornerLines thickness="normal" />
        </div>
      )}
      {mobileMenuOpen && isMobile && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {!isMobile && (
        <aside className="fixed top-0 left-0 bottom-0 w-[220px] bg-luxury-light border-r border-luxury-gray-5/50 z-50 flex flex-col">
          {sidebarContent}
        </aside>
      )}

      {isMobile && (
        <aside
          className={`
            fixed top-0 left-0 bottom-0 w-[260px] bg-luxury-light border-r border-luxury-gray-5/50 z-50 flex flex-col
            transition-transform duration-300 ease-out
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          {sidebarContent}
        </aside>
      )}

      <div
        className="min-h-screen"
        style={{ marginLeft: isMobile ? 0 : '220px', position: 'relative', zIndex: 1 }}
      >
        <div className="sticky top-0 z-30 bg-luxury-page-bg/80 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center justify-between">
          <div>
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
              >
                <Menu size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <p className="text-[13px] text-luxury-gray-2">
            Welcome back,{' '}
            <span className="text-luxury-gray-1 font-semibold">{user.preferred_first_name}</span>
          </p>
        </div>

        <div className="px-4 md:px-6 pt-6 pb-6">{children}</div>
      </div>

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} isStaff={isStaff} />
    </div>
  )
}