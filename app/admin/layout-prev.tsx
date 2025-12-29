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

  if (!user) {
    return null
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/prospects', label: 'Prospects', icon: Users },
    { href: '/admin/users', label: 'Admin Users', icon: UserCog },
  ]

  return (
    <div className="min-h-screen bg-white flex">
      {/* Gray Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-screen bg-luxury-light flex flex-col
        transition-all duration-300 ease-in-out z-50
        ${menuOpen ? 'w-64' : 'w-0'}
      `}>
        {/* Menu Header with Logo + Brand */}
        <div className="h-16 bg-luxury-light border-b border-luxury-gray-5 flex items-center justify-between px-4 flex-shrink-0">
          <Link href="/admin/dashboard" className="flex items-center space-x-2 min-w-0">
            <Image 
              src="/logo.png" 
              alt="Collective Realty Co." 
              width={32}
              height={32}
              className="h-8 w-8 flex-shrink-0"
            />
            <span className="text-luxury-black text-xs font-light tracking-[0.25em]" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '300' }}>
              COLLECTIVE AGENT
            </span>
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            className="text-luxury-gray-2 hover:text-luxury-black transition-colors flex-shrink-0"
          >
            <PanelLeft size={20} />
          </button>
        </div>

        {/* Welcome Message */}
        <div className="px-4 py-3 bg-luxury-light border-b border-luxury-gray-5 flex-shrink-0">
          <p className="text-sm text-luxury-black">
            Welcome back, <span style={{ color: '#C9A961' }}>{user.preferred_first_name}</span>
          </p>
        </div>

        {/* Navigation - No scroll */}
        <nav className="flex-1 py-4 px-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center px-4 py-3 mb-1 rounded transition-colors
                  ${isActive ? 'bg-luxury-gray-5' : 'hover:bg-luxury-gray-5'}
                `}
              >
                <Icon 
                  size={18} 
                  className="flex-shrink-0 text-luxury-black"
                  strokeWidth={1.5}
                />
                <span className="ml-3 text-sm text-luxury-gray-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom - Fixed position */}
        <div className="border-t border-luxury-gray-5 p-4 flex-shrink-0 bg-luxury-light">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: '#C9A961' }}>
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-luxury-gray-1 truncate">
                {user.preferred_first_name} {user.preferred_last_name}
              </p>
              <button
                onClick={handleLogout}
                className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Menu Toggle Button - Shows when menu is closed */}
      {!menuOpen && (
        <button
          onClick={() => setMenuOpen(true)}
          className="fixed top-4 left-4 z-50 bg-luxury-light border border-luxury-gray-5 rounded p-2 shadow-lg hover:bg-luxury-gray-5 transition-colors"
        >
          <PanelLeft size={20} className="text-luxury-black" />
        </button>
      )}

      {/* Main Content */}
      <main className={`
        flex-1 transition-all duration-300 ease-in-out
        ${menuOpen ? 'ml-64' : 'ml-0'}
      `}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
