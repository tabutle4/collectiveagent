'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, UserCog } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    const userData = JSON.parse(userStr)
    
    // Check if user has admin role
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
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/prospects', label: 'Prospects', icon: Users },
    { href: '/admin/users', label: 'Admin Users', icon: UserCog },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden text-white"
            >
              ☰
            </button>
            <Link href="/admin/dashboard" className="flex items-center space-x-3">
              <Image 
                src="/logo-white.png" 
                alt="Collective Realty Co." 
                width={220}
                height={73}
                className="h-auto w-auto max-h-14 cursor-pointer"
              />
              <span className="hidden sm:block text-white text-xl font-normal tracking-[0.35em] border-l border-white/20 pl-3" style={{ fontFamily: 'Italiana, Georgia, serif' }}>
                COLLECTIVE AGENT
              </span>
            </Link>
          </div>
          
          <div className="flex items-center space-x-6">
            <span className="text-sm text-luxury-gray-4">
              Welcome, {user.preferred_first_name}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-luxury-gray-4 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar Navigation */}
        <nav
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            w-64 bg-luxury-light border-r border-luxury-gray-5
            transform transition-transform duration-200 ease-in-out
            lg:transform-none
            ${menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="p-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center px-4 py-3 rounded transition-colors
                    ${
                      isActive
                        ? 'bg-luxury-black text-white'
                        : 'text-luxury-gray-1 hover:bg-luxury-light'
                    }
                  `}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon 
                    size={18} 
                    className={`mr-3 ${isActive ? 'text-luxury-gold' : ''}`}
                    strokeWidth={1.5}
                  />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Overlay for mobile */}
        {menuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
