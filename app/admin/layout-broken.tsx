'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, UserCog, PanelLeft } from 'lucide-react'

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

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    const userData = JSON.parse(userStr)
    
    if (!userData.roles || !userData.roles.includes('admin')) {
      router.push('/auth/login')
      return
    }

    setUser(userData)
  }, [router])

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

  if (!user) {
    return null
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/prospects', label: 'Prospects', icon: Users },
    { href: '/admin/users', label: 'Admin Users', icon: UserCog },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* BLACK HEADER - Fixed at top */}
      <header className="fixed top-0 left-0 right-0 bg-black border-b border-gray-800 z-50 flex items-center justify-between px-4" style={{ height: '80px' }}>
        {/* Left: Menu button (mobile only when closed) + Logo + Title */}
        <div className="flex items-center space-x-4">
          {!menuOpen && (
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden text-gray-400 hover:text-white transition-colors"
            >
              <PanelLeft size={20} />
            </button>
          )}
          <Link href="/admin/dashboard" className="flex items-center space-x-4">
            <Image 
              src="/logo-white.png" 
              alt="Collective Realty Co." 
              width={56}
              height={56}
              className="object-contain"
              style={{ width: '56px', height: '56px' }}
            />
            <span className="hidden md:inline text-white text-base font-light tracking-[0.25em]" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '300' }}>
              COLLECTIVE AGENT
            </span>
          </Link>
        </div>

        {/* Right: Training Center link */}
        <a 
          href="https://office.collectiverealtyco.com" 
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-300 hover:text-white transition-colors"
        >
          Training Center
        </a>
      </header>

      {/* GRAY SIDEBAR */}
      <aside className={`
        fixed left-0 bg-luxury-light flex flex-col
        transition-all duration-300 ease-in-out z-40 overflow-hidden
        ${menuOpen ? 'w-56' : 'w-0 md:w-16'}
      `}
      style={{ top: '80px', height: 'calc(100vh - 80px)' }}>
        {/* Welcome Message + Menu Button - Hide on mobile when closed */}
        <div className={`h-12 bg-luxury-light border-b border-luxury-gray-5 flex items-center justify-between px-3 flex-shrink-0 ${!menuOpen ? 'hidden md:flex' : 'flex'}`}>
          {menuOpen && (
            <p className="text-xs text-luxury-black">
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

        {/* Navigation - Hide on mobile when closed */}
        <nav className={`flex-1 py-3 px-2 ${!menuOpen ? 'hidden md:block' : 'block'}`}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center px-3 py-2 mb-1 rounded transition-colors
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
                  <span className="ml-2 text-sm text-luxury-gray-1">{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className={`border-t border-luxury-gray-5 p-3 pb-24 md:pb-3 flex-shrink-0 bg-luxury-light relative ${!menuOpen ? 'hidden md:block' : 'block'}`}>
          {menuOpen ? (
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2 w-full hover:bg-gray-200 rounded p-1 transition-colors"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0" style={{ backgroundColor: '#C9A961' }}>
                {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">
                  {user.preferred_first_name} {user.preferred_last_name}
                </p>
              </div>
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium mx-auto" style={{ backgroundColor: '#C9A961' }}>
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </div>
          )}

          {/* User Menu Popup */}
          {userMenuOpen && menuOpen && (
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
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Tools Home
                </a>
                <a
                  href="https://coachingbrokeragetools.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Privacy Policy
                </a>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    setContactFormOpen(true)
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Contact
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
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
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`
        transition-all duration-300 ease-in-out
        ${menuOpen ? 'ml-0 md:ml-56' : 'ml-0 md:ml-16'}
      `}
      style={{ paddingTop: '80px' }}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
