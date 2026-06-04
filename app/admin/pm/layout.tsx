'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Building2, Key, FileText, Banknote, Wrench, UserCircle2, BarChart2 } from 'lucide-react'

// Primary workflow navigation, ordered by typical onboarding sequence:
// landlord first, then their property, then tenant, then the lease that ties them together.
const workflowItems = [
  { href: '/admin/pm/landlords', label: 'Landlords', icon: Users },
  { href: '/admin/pm/properties', label: 'Properties', icon: Building2 },
  { href: '/admin/pm/tenants', label: 'Tenants', icon: UserCircle2 },
  { href: '/admin/pm/leases', label: 'Leases', icon: Key },
]

// Operational tools, used after initial setup is complete.
const operationsItems = [
  { href: '/admin/pm/invoices', label: 'Invoices', icon: FileText },
  { href: '/admin/pm/disbursements', label: 'Disbursements', icon: Banknote },
  { href: '/admin/pm/statements', label: 'Statements', icon: BarChart2 },
  { href: '/admin/pm/repairs', label: 'Repairs', icon: Wrench },
]

export default function PMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <div>
      {/* Workflow Navigation */}
      <div className="flex flex-wrap gap-2 mb-2">
        {workflowItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`btn ${isActive(item.href) ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 text-sm`}
          >
            <item.icon size={14} />
            {item.label}
          </Link>
        ))}
      </div>

      {/* Operations Navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mr-1">
          Operations
        </span>
        {operationsItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`btn ${isActive(item.href) ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 text-xs`}
          >
            <item.icon size={12} />
            {item.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  )
}
