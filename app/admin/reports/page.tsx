'use client'

import { useRouter } from 'next/navigation'
import { BarChart3, Trophy, FileText, Users, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'

const REPORTS = [
  {
    id: 'quarterly',
    icon: BarChart3,
    title: 'Quarterly Sales Meeting',
    description: 'Slide presentation for team meetings',
    href: '/admin/reports/quarterly',
    active: true,
  },
  {
    id: 'payouts',
    icon: Wallet,
    title: 'Payouts Report',
    description: 'Checks, agent payouts, and balance',
    href: '/admin/reports/payouts',
    active: true,
  },
  {
    id: 'agent-production',
    icon: Trophy,
    title: 'Agent Production',
    description: 'Individual agent performance',
    href: '/admin/reports/agent-production',
    active: false,
  },
  {
    id: '1099',
    icon: FileText,
    title: '1099 Reporting',
    description: 'Year-end tax documents',
    href: '/admin/reports/1099',
    active: false,
  },
  {
    id: 'team-performance',
    icon: Users,
    title: 'Team Performance',
    description: 'Team analytics and splits',
    href: '/admin/reports/team-performance',
    active: false,
  },
]

export default function ReportsPage() {
  const router = useRouter()
  const { user } = useAuth()

  // Only operations and broker can access reports
  const canAccess = user?.role === 'operations' || user?.role === 'broker'

  if (!canAccess) {
    return (
      <div className="p-6">
        <div className="container-card max-w-md mx-auto text-center py-12">
          <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Access Denied</h1>
          <p className="text-luxury-gray-3">
            Reports are only available to operations and broker roles.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-8 pb-6 border-b-2 border-chart-gold-5">
        <h1 className="text-3xl font-bold text-luxury-gray-1 tracking-tight">REPORTS</h1>
        <p className="text-luxury-gray-3 mt-2">
          Generate and present brokerage performance data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1 bg-luxury-gray-5/20">
        {REPORTS.map(report => {
          const Icon = report.icon
          return (
            <div
              key={report.id}
              onClick={() => report.active && router.push(report.href)}
              className={`
                bg-white p-8 transition-colors
                ${report.active 
                  ? 'cursor-pointer hover:bg-chart-gold-1/30 border-l-[3px] border-chart-gold-5' 
                  : 'cursor-not-allowed opacity-40 border-l-[3px] border-luxury-gray-5/30'
                }
              `}
            >
              <div 
                className={`
                  w-14 h-14 border-2 flex items-center justify-center mb-6
                  ${report.active ? 'border-chart-gold-5' : 'border-luxury-gray-5/50'}
                `}
              >
                <Icon 
                  className={`w-6 h-6 ${report.active ? 'text-chart-gold-6' : 'text-luxury-gray-4'}`} 
                />
              </div>
              
              <h3 className="font-bold text-sm tracking-widest text-luxury-gray-1 mb-2 uppercase">
                {report.title}
              </h3>
              <p className="text-sm text-luxury-gray-3 font-mono leading-relaxed">
                {report.description}
              </p>
              
              {report.active && (
                <div className="mt-6 text-xs font-bold text-chart-gold-6 tracking-widest flex items-center gap-3">
                  LAUNCH
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}