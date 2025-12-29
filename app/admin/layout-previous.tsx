'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, UserCog, Menu, X } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
    <div className="min-h-screen bg-gray-50">
      {/* BLACK HEADER at top */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-gray-800 z-50 flex items-center justify-between px-6">
        {/* Left: Logo + Title */}
        <Link href="/admin/dashboard" className="flex items-center space-x-3">
          <Image 
            src="/logo-white.png" 
            alt="Collective Realty Co." 
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <span className="text-white text-sm font-light tracking-[0.3em]" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '300' }}>
            COLLECTIVE AGENT
          </span>
        </Link>

        {/* Right: Welcome + Logout */}
        <div className="flex items-center space-x-6">
          <span className="text-sm text-gray-300">
            Welcome back, <span className="font-medium" style={{ color: '#C9A961' }}>{user.preferred_first_name}</span>
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* WHITE SIDEBAR on left */}
      <aside className={`
        fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white border-r border-gray-200
        transition-all duration-300 ease-in-out z-40 flex flex-col
        ${sidebarOpen ? 'w-64' : 'w-0 md:w-20'}
        overflow-hidden
      `}>
        {/* Toggle Button */}
        <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
          {sidebarOpen && (
            <span className="text-xs text-gray-500 uppercase tracking-wide">Menu</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600 hover:text-black transition-colors ml-auto"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Navigation - No scroll */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center px-4 py-3 transition-colors
                  ${isActive ? 'bg-gray-100' : 'hover:bg-gray-50'}
                `}
              >
                <Icon 
                  size={18} 
                  className={`flex-shrink-0 ${isActive ? 'text-luxury-gold' : 'text-gray-600'}`}
                  strokeWidth={1.5}
                />
                {sidebarOpen && (
                  <span className={`ml-3 text-sm ${isActive ? 'text-black font-medium' : 'text-gray-600'}`}>
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom - Fixed position */}
        <div className="border-t border-gray-200 p-4 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: '#C9A961' }}>
                {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.preferred_first_name} {user.preferred_last_name}
                </p>
                <p className="text-xs text-gray-500">Admin</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium mx-auto" style={{ backgroundColor: '#C9A961' }}>
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`
        pt-16 transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'ml-0 md:ml-64' : 'ml-0 md:ml-20'}
      `}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
