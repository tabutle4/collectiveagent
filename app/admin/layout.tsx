'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import AppSidebar from '@/components/shared/AppSidebar'
import { useAuth } from '@/lib/context/AuthContext'
import { ShieldX } from 'lucide-react'

// Route access control: map route prefixes to required permission codes
// If a route is not listed, all authenticated admin/staff users can access it
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/admin/pm': 'can_view_pm',
  '/admin/checks': 'can_view_checks',
  '/admin/onboarding': 'can_view_onboarding',
  '/admin/billing': 'can_view_billing',
  '/admin/campaigns': 'can_view_campaigns',
  '/admin/email-templates': 'can_manage_email_templates',
  '/admin/coordination': 'can_view_listings',
  '/admin/documents': 'can_view_documents',
  '/admin/users': 'can_view_all_agents',
  '/admin/team-agreements': 'can_view_teams',
  '/admin/prospects': 'can_view_prospects',
  '/admin/contacts': 'can_view_all_contacts',
  '/admin/calendar': 'can_view_calendar',
  '/admin/form-responses': 'can_view_forms',
  '/admin/form-builder': 'can_manage_forms',
  '/admin/reports/payouts': 'can_manage_checks',
  '/admin/reports/all-payouts': 'can_manage_checks',
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-luxury-light flex items-center justify-center p-6">
      <div className="container-card max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Access Denied</h1>
        <p className="text-luxury-gray-3 mb-6">
          You don't have permission to access this page.
        </p>
        <Link href="/admin/dashboard" className="btn btn-primary">
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, hasPermission } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [loading, user, router])

  if (loading) return null

  // Check route access using permissions
  // Find matching route prefix (check longest matches first for specificity)
  const sortedRoutes = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length)
  const matchedRoute = sortedRoutes.find(prefix => pathname.startsWith(prefix))
  
  if (matchedRoute) {
    const requiredPermission = ROUTE_PERMISSIONS[matchedRoute]
    if (!hasPermission(requiredPermission)) {
      return <AppSidebar><AccessDenied /></AppSidebar>
    }
  }

  return <AppSidebar>{children}</AppSidebar>
}