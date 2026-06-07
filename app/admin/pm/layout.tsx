'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Building2, Key, FileText, Banknote, Wrench, UserCircle2, BarChart2 } from 'lucide-react'

const workflowItems = [
  { href: '/admin/pm/landlords', label: 'Landlords', icon: Users },
  { href: '/admin/pm/properties', label: 'Properties', icon: Building2 },
  { href: '/admin/pm/tenants', label: 'Tenants', icon: UserCircle2 },
  { href: '/admin/pm/leases', label: 'Leases', icon: Key },
]

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
      <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6 mb-1">
        <div className="flex gap-2 min-w-max pb-1">
          {workflowItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`btn ${isActive(item.href) ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 text-sm flex-shrink-0`}
            >
              <item.icon size={14} />
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Operations Navigation */}
      <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6 mb-5">
        <div className="flex items-center gap-2 min-w-max pb-1">
          <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest flex-shrink-0">
            Operations
          </span>
          {operationsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`btn ${isActive(item.href) ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2 text-xs flex-shrink-0`}
            >
              <item.icon size={12} />
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {children}
    </div>
  )
}
