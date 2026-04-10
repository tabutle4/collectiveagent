'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Clock, CheckCircle } from 'lucide-react'
import SalesGoalWidget from '@/components/transactions/SalesGoalWidget'
import StatusBadge from '@/components/transactions/StatusBadge'
import { TransactionStatus } from '@/lib/transactions/types'
import { useAuth } from '@/lib/context/AuthContext'

export default function AgentDashboard() {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalVolume: 0,
    totalUnits: 0,
    totalAgentNet: 0,
    goals: { volume: 0, units: 0, agent_net: 0 },
    activeGoals: ['volume', 'agent_net'] as ('volume' | 'units' | 'agent_net')[],
    closedCount: 0,
    pendingCount: 0,
    activeCount: 0,
    complianceCount: 0,
    capProgress: 0,
    capAmount: 0,
    hasCap: false,
    qualifyingCount: 0,
    commissionPlan: '',
  })
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  
  // Redirect agents and referrals to profile page
  useEffect(() => {
    if (authUser?.role === 'agent' || authUser?.role === 'referral') {
      router.replace('/agent/profile')
    }
  }, [authUser, router])

  // Show loading while redirecting
  if (authUser?.role === 'agent' || authUser?.role === 'referral') {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-3">Redirecting...</p>
      </div>
    )
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard/agent')
      if (!res.ok) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()

      const { user: freshUser, transactions, agentRows, commissionPlan, capProgress: capProgressFromApi } = data
      if (!freshUser) {
        router.push('/auth/login')
        return
      }
      setUser(freshUser)

      const hasCap = commissionPlan?.has_cap || false
      const capAmount = commissionPlan?.cap_amount || 0
      const txns = transactions || []
      const agentData = agentRows || []
      const currentYear = new Date().getFullYear()

      let totalVolume = 0,
        totalUnits = 0,
        totalAgentNet = 0
      let closedCount = 0,
        pendingCount = 0,
        activeCount = 0,
        complianceCount = 0

      txns.forEach((t: any) => {
        const closingYear = t.closing_date ? new Date(t.closing_date).getFullYear() : null
        if (t.status === 'closed' && closingYear === currentYear) {
          closedCount++
          totalUnits++
          if (t.sales_price) totalVolume += parseFloat(t.sales_price)
          else if (t.monthly_rent && t.lease_term)
            totalVolume += parseFloat(t.monthly_rent) * parseInt(t.lease_term)
          else if (t.monthly_rent) totalVolume += parseFloat(t.monthly_rent) * 12
          const agentRow = agentData.find((a: any) => a.transaction_id === t.id)
          if (agentRow?.agent_net) totalAgentNet += parseFloat(agentRow.agent_net)
        } else if (
          [
            'pending',
            'submitted',
            'in_review',
            'compliant',
            'cda_in_progress',
            'payout_in_progress',
            'broker_review',
            'cda_sent',
            'payout_processed',
          ].includes(t.status)
        ) {
          pendingCount++
        } else if (['prospect', 'active_listing'].includes(t.status)) {
          activeCount++
        }
        if (['submitted', 'in_review', 'revision_requested'].includes(t.status)) complianceCount++
      })

      let activeGoals: ('volume' | 'units' | 'agent_net')[] = ['volume', 'units', 'agent_net']
      if (
        freshUser.active_goals &&
        Array.isArray(freshUser.active_goals) &&
        freshUser.active_goals.length > 0
      ) {
        activeGoals = freshUser.active_goals as ('volume' | 'units' | 'agent_net')[]
      }

      setStats({
        totalVolume,
        totalUnits,
        totalAgentNet,
        goals: {
          volume: freshUser.sales_volume_goal || 0,
          units: freshUser.units_goal || 0,
          agent_net: freshUser.agent_net_goal || 0,
        },
        activeGoals,
        closedCount,
        pendingCount,
        activeCount,
        complianceCount,
        capProgress: capProgressFromApi || 0,
        capAmount,
        hasCap,
        qualifyingCount: freshUser.qualifying_transaction_count || 0,
        commissionPlan: freshUser.commission_plan || '',
      })

      setRecentTransactions(txns.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d: string | null) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  if (!user) return null

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="page-title">DASHBOARD</h1>
        <button
          onClick={() => router.push('/transactions/new')}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <Plus size={14} /> New Transaction
        </button>
      </div>

      <SalesGoalWidget
        userId={user.id}
        volume={stats.totalVolume}
        units={stats.totalUnits}
        agentNet={stats.totalAgentNet}
        goals={stats.goals}
        activeGoals={stats.activeGoals}
        closedCount={stats.closedCount}
        pendingCount={stats.pendingCount}
        capProgress={stats.capProgress}
        capAmount={stats.capAmount}
        hasCap={stats.hasCap}
        qualifyingCount={stats.qualifyingCount}
        commissionPlan={stats.commissionPlan}
        onUpdate={loadDashboard}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-luxury-accent/10 flex items-center justify-center">
              <FileText size={16} className="text-luxury-accent" />
            </div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.activeCount}</p>
          <p className="text-xs text-luxury-gray-3">Active</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-luxury-accent/10 flex items-center justify-center">
              <Clock size={16} className="text-luxury-accent" />
            </div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.pendingCount}</p>
          <p className="text-xs text-luxury-gray-3">Pending</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-luxury-accent/10 flex items-center justify-center">
              <FileText size={16} className="text-luxury-accent" />
            </div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.complianceCount}</p>
          <p className="text-xs text-luxury-gray-3">In Compliance</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-luxury-accent/10 flex items-center justify-center">
              <CheckCircle size={16} className="text-luxury-accent" />
            </div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.closedCount}</p>
          <p className="text-xs text-luxury-gray-3">Closed This Year</p>
        </div>
      </div>

      <div className="container-card mt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Recent Transactions</h2>
          <button
            onClick={() => router.push('/transactions')}
            className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
          >
            View All
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-luxury-gray-3 mb-4">No transactions yet</p>
            <button onClick={() => router.push('/transactions/new')} className="btn btn-primary">
              Create Your First Transaction
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Property</th>
                    <th className="th-luxury">Type</th>
                    <th className="th-luxury">Closing Date</th>
                    <th className="th-luxury">Status</th>
                    <th className="th-luxury">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map(t => (
                    <tr
                      key={t.id}
                      className="tr-luxury-clickable"
                      onClick={() => router.push(`/transactions/${t.id}`)}
                    >
                      <td className="py-3 px-4 text-sm font-semibold text-luxury-gray-1">
                        {t.property_address || 'No address'}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {t.transaction_type || ''}
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">
                        {formatDate(t.closing_date)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={t.status as TransactionStatus} />
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {formatDate(t.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {recentTransactions.map(t => (
                <div
                  key={t.id}
                  className="inner-card cursor-pointer"
                  onClick={() => router.push(`/transactions/${t.id}`)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 flex-1">
                      {t.property_address || 'No address'}
                    </p>
                    <span className="flex-shrink-0 ml-2">
                      <StatusBadge status={t.status as TransactionStatus} />
                    </span>
                  </div>
                  <p className="text-xs text-luxury-gray-3">
                    {t.transaction_type}
                    {t.closing_date ? ` · ${formatDate(t.closing_date)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}