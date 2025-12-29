'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, UserCog, PanelLeft, Calendar, Mail, FileText, CheckSquare, ClipboardList, Briefcase, FileCheck } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [contactFormOpen, setContactFormOpen] = useState(false)
  const [contactMessage, setContactMessage] = useState('')
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isChromeMobile, setIsChromeMobile] = useState(false)
  const [isPWA, setIsPWA] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    setMounted(true)
    
    // Detect mobile and browser type
    if (typeof window !== 'undefined') {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      
      // Detect PWA mode
      const pwaMode = window.matchMedia('(display-mode: standalone)').matches ||
                      (window.navigator as any).standalone ||
                      document.referrer.includes('android-app://')
      setIsPWA(pwaMode)
      
      // Detect Chrome mobile specifically (has bigger browser bars) - but not PWA
      const chrome = mobile && !pwaMode && /Chrome|CriOS/i.test(navigator.userAgent) && !/Safari/i.test(navigator.userAgent)
      setIsChromeMobile(chrome)
    }
    
    // Only check auth if we haven't set user yet
    if (user) return
    
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      
      if (!userData.roles || !userData.roles.includes('admin')) {
        router.push('/auth/login')
        return
      }

      setUser(userData)
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router, user])

  // Prevent body scroll and lock screen when menu open on mobile
  useEffect(() => {
    if (!mounted) return // Don't modify body until after mount to prevent hydration errors
    
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768
      
      if (menuOpen && isMobile) {
        // Prevent scroll when menu is open on mobile
        // Save current scroll position
        const scrollY = window.scrollY
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.width = '100%'
        document.body.style.top = `-${scrollY}px`
        
        // Request wake lock to prevent screen from sleeping
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
          (navigator as any).wakeLock.request('screen').then((lock: WakeLockSentinel) => {
            wakeLockRef.current = lock
          }).catch((err: any) => {
            // Wake lock not supported or failed (e.g., user denied permission)
            console.log('Wake lock not available:', err)
          })
        }
      } else {
        // Allow scroll when menu is closed or on desktop
        // Restore scroll position if it was saved
        const scrollY = document.body.style.top
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1)
        }
        
        // Release wake lock when menu closes
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch((err: any) => {
            console.log('Error releasing wake lock:', err)
          })
          wakeLockRef.current = null
        }
      }
    }
    
    return () => {
      // Cleanup: always restore scroll and release wake lock on unmount
      if (typeof document !== 'undefined') {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((err: any) => {
          console.log('Error releasing wake lock on cleanup:', err)
        })
        wakeLockRef.current = null
      }
    }
  }, [menuOpen, mounted])

  const handleLogout = () => {
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contactMessage,
          userName: `${user.preferred_first_name} ${user.preferred_last_name}`,
          userEmail: user.email,
        }),
      })

      if (response.ok) {
        alert('Thank you for contacting the office. We will respond within 24 business hours. For urgent matters, please call or text the office at 281-638-9407.')
        setContactFormOpen(false)
        setContactMessage('')
      } else {
        alert('Failed to send message. Please try again.')
      }
    } catch (error) {
      console.error('Contact form error:', error)
      alert('Failed to send message. Please try again.')
    }
  }

  if (!user || !mounted) {
    return null
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/prospects', label: 'Prospects', icon: Users },
    { href: '/admin/campaigns', label: 'Campaigns', icon: Calendar },
    { href: '/admin/onboarding', label: 'Onboarding', icon: CheckSquare },
    { href: '/admin/checklist-editor', label: 'Checklist Editor', icon: ClipboardList },
    { href: '/admin/email-templates', label: 'Email Templates', icon: Mail },
    { href: '/admin/agent-roster', label: 'Agent Roster', icon: FileText },
    { href: '/admin/coordination', label: 'Listing Coordination', icon: Briefcase },
    { href: '/admin/form-responses', label: 'Form Responses', icon: FileCheck },
    { href: '/admin/users', label: 'Users', icon: UserCog },
  ]

  // Use default values that match server render, then update after mount
  // This prevents hydration mismatches
  const headerHeight = !mounted ? 80 : (isMobile ? 52 : 80)
  const headerOffset = `${headerHeight}px`
  const contentTopSpacing = !mounted
    ? '24px'
    : isMobile
      ? (menuOpen ? '44px' : '54px')
      : (menuOpen ? '3rem' : '24px')
  const mainPaddingTop = !mounted ? '12px' : (isMobile ? '8px' : '12px')

  return (
    <div className="fixed inset-0 bg-white" style={{ margin: 0, padding: 0 }}>
      {/* BLACK HEADER - Fixed at top */}
      <header className="fixed left-0 right-0 bg-black border-b border-gray-800 z-50 flex items-center justify-between px-3 md:px-4" style={{ height: headerOffset, top: 0, margin: 0, padding: (!mounted || !isMobile) ? '0 1rem' : '0 0.75rem' }} suppressHydrationWarning>
        {/* Left: Logo + Title */}
        <Link href="/admin/dashboard" className="flex items-center space-x-2 md:space-x-4">
          <img 
            src="/logo-white.png" 
            alt="Collective Realty Co." 
            className="md:hidden"
            style={{ width: '60px', height: '60px', objectFit: 'contain' }}
          />
          <img 
            src="/logo-white.png" 
            alt="Collective Realty Co." 
            className="hidden md:block"
            style={{ width: '120px', height: '120px', objectFit: 'contain' }}
          />
          <span className="text-white text-sm md:text-lg tracking-[0.2em] md:tracking-[0.25em]" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '600' }}>
            COLLECTIVE AGENT
          </span>
        </Link>

        {/* Right: Training Center link */}
        <a 
          href="https://office.collectiverealtyco.com" 
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] md:text-sm text-gray-300 hover:text-white transition-colors font-semibold"
          style={{ fontWeight: '600' }}
        >
          Training Center
        </a>
      </header>

      {/* Mobile overlay when menu open - transparent but blocks clicks */}
      {menuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-35"
          style={{ 
            top: '0',
            backgroundColor: 'transparent'
          }}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* GRAY SIDEBAR */}
      <aside 
        className={`
          fixed left-0 bg-luxury-light flex flex-col overflow-hidden
          transition-[width] duration-200 ease-out
          ${menuOpen ? 'w-56 z-40' : 'w-0 z-40 md:w-16'}
        `}
        style={{ 
          top: headerOffset,
          bottom: '0'
        }}
        suppressHydrationWarning
      >
        {/* Welcome Message + Menu Button */}
        <div className="bg-luxury-light border-b border-luxury-gray-5 flex items-center justify-between px-3 flex-shrink-0" style={{ height: '48px', display: !menuOpen ? 'none' : 'flex' }}>
          {menuOpen && (
            <p className="text-base text-luxury-black">
              Welcome back, <span style={{ color: '#C9A961' }}>{user.preferred_first_name}</span>
            </p>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-luxury-gray-2 hover:text-luxury-black transition-colors ml-auto"
          >
            <PanelLeft size={18} />
          </button>
        </div>

        {/* Desktop menu button when closed - separate from welcome div */}
        {!menuOpen && (
          <div className="hidden md:flex bg-luxury-light border-b border-luxury-gray-5 items-center justify-center px-3 flex-shrink-0" style={{ height: '48px' }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
            >
              <PanelLeft size={18} />
            </button>
          </div>
        )}

        {/* Navigation - scrollable area */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Close menu on mobile when nav item clicked
                  if (typeof window !== 'undefined' && window.innerWidth < 768) {
                    setMenuOpen(false)
                  }
                }}
                className={`
                  flex items-center px-3 py-2 mb-1 rounded transition-colors
                  ${!menuOpen ? 'justify-center' : ''}
                  ${isActive ? 'bg-gray-200' : 'hover:bg-gray-200'}
                `}
                title={!menuOpen ? item.label : undefined}
              >
                <Icon 
                  size={16} 
                  className="flex-shrink-0 text-luxury-black"
                  strokeWidth={1.5}
                />
                {menuOpen && (
                  <span className="ml-2 text-base text-luxury-gray-1 font-semibold" style={{ fontWeight: '600' }}>{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom - Fixed with flexbox */}
        {menuOpen && (
          <div className="border-t border-luxury-gray-5 bg-luxury-light p-3 flex-shrink-0 relative" style={{ minHeight: '60px' }}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2 w-full hover:bg-gray-200 rounded p-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0" style={{ backgroundColor: '#C9A961' }}>
                {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-base font-medium text-luxury-gray-1 truncate">
                  {user.preferred_first_name} {user.preferred_last_name}
                </p>
              </div>
            </button>

            {/* User Menu Popup */}
            {userMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute bottom-full left-3 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <a
                    href="https://coachingbrokeragetools.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-base text-gray-700 hover:bg-gray-50"
                  >
                    Tools Home
                  </a>
                  <a
                    href="https://coachingbrokeragetools.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-base text-gray-700 hover:bg-gray-50"
                  >
                    Privacy Policy
                  </a>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      setContactFormOpen(true)
                    }}
                    className="block w-full text-left px-4 py-2 text-base text-gray-700 hover:bg-gray-50"
                  >
                    Contact
                  </button>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-base text-red-600 hover:bg-gray-50"
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Desktop: Avatar when closed - absolute at bottom */}
        {!menuOpen && (
          <div className="hidden md:block absolute bottom-0 left-0 right-0 border-t border-luxury-gray-5 bg-luxury-light p-3">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium mx-auto hover:opacity-80 transition-opacity"
              style={{ backgroundColor: '#C9A961' }}
            >
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </button>
          </div>
        )}
      </aside>

      {/* Contact Form Modal */}
      {contactFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-medium mb-4">Contact Support</h2>
            <form onSubmit={handleContactSubmit}>
              <textarea
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Enter your message..."
                className="w-full border border-gray-300 rounded p-3 mb-4 min-h-[120px]"
                required
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setContactFormOpen(false)
                    setContactMessage('')
                  }}
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main 
        className="transition-[left] duration-200 ease-out overflow-y-auto"
        style={{ 
          paddingTop: mainPaddingTop,
          position: 'fixed',
          top: headerOffset,
          bottom: '0',
          left: menuOpen ? ((!mounted || !isMobile) ? '224px' : '0px') : ((!mounted || !isMobile) ? '64px' : '0px'),
          right: '0',
          WebkitOverflowScrolling: 'touch',
          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        suppressHydrationWarning
      >
        {/* Mobile menu button - shows when closed, on left side */}
        {!menuOpen && (
          <div className="md:hidden fixed bg-luxury-light border-b border-luxury-gray-5 flex items-center px-3" style={{ top: headerOffset, left: '0', right: '0', height: '48px', zIndex: 30 }}>
            <button
              onClick={() => setMenuOpen(true)}
              className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
            >
              <PanelLeft size={18} />
            </button>
          </div>
        )}
        
        <div className="p-6" style={{ 
          paddingTop: contentTopSpacing
        }} suppressHydrationWarning>
          {children}
        </div>
      </main>
    </div>
  )
}
