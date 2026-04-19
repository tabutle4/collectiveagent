'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  List,
  Settings as SettingsIcon,
  ChevronDown,
} from 'lucide-react'

/**
 * TC Module layout.
 *
 * Renders the sub-nav tabs (Dashboard, Calendar, Deals, Admin) above every
 * /admin/tc/* page. Does NOT wrap content in a background div because the
 * parent AppSidebar layout already provides the page background and
 * horizontal padding.
 *
 * Dropdown pattern matches AppSidebar's user menu: full-screen overlay at
 * z-40 captures outside clicks, dropdown panel at z-50 floats above the
 * sidebar's sticky header (which is z-30).
 */
export default function TcLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [adminOpen, setAdminOpen] = useState(false)

  const isActive = (path: string, exact = false) => {
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + '/')
  }

  const isAdminActive =
    pathname.startsWith('/admin/tc/templates') ||
    pathname.startsWith('/admin/tc/process-steps') ||
    pathname.startsWith('/admin/tc/vendors') ||
    pathname.startsWith('/admin/tc/intake-form') ||
    pathname.startsWith('/admin/tc/settings') ||
    pathname.startsWith('/admin/tc/homestead-counties')

  const closeAdmin = () => setAdminOpen(false)

  return (
    <>
      <div className="border-b border-luxury-gray-5 -mx-4 md:-mx-6 mb-6 bg-white">
        <div className="px-4 md:px-6 flex items-center gap-1 text-sm overflow-x-auto">
          <TcTab href="/admin/tc" active={isActive('/admin/tc', true)}>
            <LayoutDashboard size={14} />
            Dashboard
          </TcTab>
          <TcTab href="/admin/tc/calendar" active={isActive('/admin/tc/calendar')}>
            <CalendarIcon size={14} />
            Calendar
          </TcTab>
          <TcTab href="/admin/tc/list" active={isActive('/admin/tc/list')}>
            <List size={14} />
            Deals
          </TcTab>

          <div className="ml-auto relative">
            <button
              type="button"
              onClick={() => setAdminOpen(!adminOpen)}
              className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                isAdminActive
                  ? 'border-luxury-gray-1 text-luxury-gray-1 font-semibold'
                  : 'border-transparent text-luxury-gray-3 hover:text-luxury-gray-1'
              }`}
            >
              <SettingsIcon size={14} />
              Admin
              <ChevronDown size={12} className={adminOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {adminOpen && (
              <>
                {/* Full-screen overlay captures outside clicks */}
                <div className="fixed inset-0 z-40" onClick={closeAdmin} />
                {/* Dropdown panel floats above sidebar sticky header (z-30) */}
                <div className="absolute right-0 top-full mt-1 bg-white border border-luxury-gray-5 rounded-lg shadow-lg py-1 min-w-[200px] z-50">
                  <AdminItem href="/admin/tc/templates" onClick={closeAdmin}>
                    Email Templates
                  </AdminItem>
                  <AdminItem href="/admin/tc/process-steps" onClick={closeAdmin}>
                    Process Steps
                  </AdminItem>
                  <AdminItem href="/admin/tc/vendors" onClick={closeAdmin}>
                    Preferred Vendors
                  </AdminItem>
                  <AdminItem href="/admin/tc/intake-form" onClick={closeAdmin}>
                    Intake Form
                  </AdminItem>
                  <AdminItem href="/admin/tc/settings" onClick={closeAdmin}>
                    Settings
                  </AdminItem>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {children}
    </>
  )
}

function TcTab({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-luxury-gray-1 text-luxury-gray-1 font-semibold'
          : 'border-transparent text-luxury-gray-3 hover:text-luxury-gray-1'
      }`}
    >
      {children}
    </Link>
  )
}

function AdminItem({
  href,
  onClick,
  children,
}: {
  href: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2 text-sm text-luxury-gray-1 hover:bg-luxury-light transition-colors"
    >
      {children}
    </Link>
  )
}
