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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-screen bg-black border-r border-gray-800
        transition-all duration-300 ease-in-out z-50 flex flex-col
        ${sidebarOpen ? 'w-64' : 'w-20'}
      `}>
        {/* Logo & Brand */}
        <div className="h-16 border-b border-gray-800 flex items-center justify-between px-3 flex-shrink-0">
          {sidebarOpen ? (
            <Link href="/admin/dashboard" className="flex items-center space-x-2 min-w-0">
              <Image 
                src="/logo-white.png" 
                alt="Collective Realty Co." 
                width={32}
                height={32}
                className="h-8 w-8 flex-shrink-0"
              />
              <span className="text-white text-xs font-light tracking-[0.25em] truncate" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '300' }}>
                COLLECTIVE AGENT
              </span>
            </Link>
          ) : (
            <Link href="/admin/dashboard" className="mx-auto">
              <Image 
                src="/logo-white.png" 
                alt="Collective Realty Co." 
                width={32}
                height={32}
                className="h-8 w-8"
              />
            </Link>
          )}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center px-4 py-3 transition-colors
                  ${isActive ? 'bg-gray-800' : 'hover:bg-gray-900'}
                `}
              >
                <Icon 
                  size={18} 
                  className={`flex-shrink-0 ${isActive ? 'text-luxury-gold' : 'text-gray-400'}`}
                  strokeWidth={1.5}
                />
                {sidebarOpen && (
                  <span className={`ml-3 text-sm ${isActive ? 'text-white' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className="border-t border-gray-800 p-3 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0" style={{ backgroundColor: '#C9A961' }}>
                {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user.preferred_first_name} {user.preferred_last_name}
                </p>
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium mx-auto"
              style={{ backgroundColor: '#C9A961' }}
            >
              {user.preferred_first_name?.[0]}{user.preferred_last_name?.[0]}
            </button>
          )}
        </div>

        {/* Collapsed Menu Button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-16 -right-3 bg-black border border-gray-800 rounded-full p-1 text-gray-400 hover:text-white"
          >
            <Menu size={16} />
          </button>
        )}
      </aside>

      {/* Main Content */}
      <main className={`
        flex-1 transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'ml-64' : 'ml-20'}
      `}>
        {/* Top Bar with Welcome Message */}
        <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h2 className="text-base font-normal text-gray-700">
            Welcome back, <span className="font-medium" style={{ color: '#C9A961' }}>{user.preferred_first_name}</span>
          </h2>
        </div>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
