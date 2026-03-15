'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, UserCog, Calendar, Search,
  Briefcase, Receipt, UsersRound, DollarSign,
  Settings, Menu, X, ChevronRight,
  Users, UserPlus, FileText, FolderOpen, CircleDollarSign, BookUser,
  BarChart3
} from 'lucide-react'
import ContactDrawer from './ContactDrawer'

interface NavItem {
  href: string
  label: string
  icon: any
  disabled?: boolean
}

interface AppSidebarProps {
  children: React.ReactNode
  logoUrl?: string
}

const adminNav: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/users', label: 'Agents', icon: UserCog },
  { href: '/admin/team-agreements', label: 'Teams', icon: UsersRound },
  { href: '/admin/prospects', label: 'Prospects', icon: UserPlus },
  { href: '/admin/contacts', label: 'Contacts', icon: BookUser },
  { href: '/admin/documents', label: 'Documents', icon: FolderOpen },
  { href: '/admin/checks', label: 'Checks', icon: CircleDollarSign, disabled: true },
  { href: '/admin/campaigns', label: 'Campaigns', icon: Calendar },
  { href: '/admin/coordination', label: 'Listings', icon: Briefcase },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, disabled: true },
  { href: '/admin/revenue-share', label: 'Revenue Share', icon: DollarSign, disabled: true },
  { href: '/admin/settings', label: 'Settings', icon: Settings, disabled: true },
]

const agentNav: NavItem[] = [
  { href: '/agent/dashboard', label: 'Dashboard', icon: LayoutDashboard, disabled: true },
  { href: '/agent/transactions', label: 'Transactions', icon: Receipt, disabled: true },
  { href: '/agent/forms', label: 'Forms', icon: FileText },
  { href: '/agent/contacts', label: 'Contacts', icon: Users },
  { href: '/agent/documents', label: 'Documents', icon: FolderOpen },
  { href: '/agent/roster', label: 'Roster', icon: FileText },
  { href: '/agent/reports', label: 'Reports', icon: BarChart3, disabled: true },
  { href: '/agent/settings', label: 'Settings', icon: Settings, disabled: true },
]

export default function AppSidebar({ children, logoUrl }: AppSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = pathname?.startsWith('/admin')
  const navItems = isAdmin ? adminNav : agentNav
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
      if (isAdmin && role !== 'Admin') { router.push('/auth/login'); return }
      if (!isAdmin && role !== 'Agent' && role !== 'Admin') { router.push('/auth/login'); return }
      setUser(userData)
    } catch (error) {
      router.push('/auth/login')
    }
  }, [router, user, isAdmin])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  if (!user || !mounted) return null

  const sidebarContent = (
    <>
      <div className="flex items-center justify-center px-4 py-4 flex-shrink-0">
        <Link href={isAdmin ? '/admin/dashboard' : '/profile'}>
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
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = !item.disabled && (
            pathname === item.href || pathname?.startsWith(item.href + '/')
          )

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md opacity-30 cursor-not-allowed"
              >
                <Icon size={18} className="text-luxury-gray-3 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-[13px] text-luxury-gray-3">{item.label}</span>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-md transition-colors
                ${isActive
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
              <span className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-2 flex-shrink-0">
        <button className="flex items-center gap-3 px-3 py-2 rounded-md text-luxury-gray-3 hover:bg-luxury-gray-5/40 hover:text-luxury-gray-1 transition-colors w-full">
          <Search size={18} className="flex-shrink-0" strokeWidth={1.5} />
          <span className="text-[13px] font-medium">Search</span>
        </button>
      </div>

      <div className="flex-shrink-0 border-t border-luxury-gray-5/50 relative">
        <div className="p-3">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md hover:bg-luxury-gray-5/40 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-luxury-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
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
          <span className="text-[9px] font-semibold text-luxury-gray-3 tracking-[0.2em] uppercase">Collective Agent</span>
        </div>

        {userMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute bottom-full left-3 mb-2 w-52 bg-white rounded-lg shadow-lg border border-luxury-gray-5/50 py-1.5 z-50">
              {!isAdmin && (
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
                onClick={() => { setUserMenuOpen(false); setContactOpen(true) }}
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

  return (
    <div className="min-h-screen bg-luxury-light">
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

      <div className="min-h-screen" style={{ marginLeft: isMobile ? 0 : '220px' }}>
        <div className="sticky top-0 z-30 bg-luxury-light/80 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center justify-between">
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
          <p className="text-[13px] text-luxury-gray-3">
            Welcome back, <span className="text-luxury-gray-1 font-semibold">{user.preferred_first_name}</span>
          </p>
        </div>

        <div className="px-4 md:px-6 pb-6">
          {children}
        </div>
      </div>

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}