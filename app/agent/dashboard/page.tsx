'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Plus, FileText, Clock, CheckCircle } from 'lucide-react'
import SalesGoalWidget from '@/components/transactions/SalesGoalWidget'
import StatusBadge from '@/components/transactions/StatusBadge'
import { TransactionStatus } from '@/lib/transactions/types'

export default function AgentDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalVolume: 0,
    totalUnits: 0,
    totalAgentNet: 0,
    goals: { volume: 0, units: 0, agent_net: 0 },
    activeGoals: ['volume'] as ('volume' | 'units' | 'agent_net')[],
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

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) { router.push('/auth/login'); return }
      const userData = JSON.parse(userStr)

      const { data: freshUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single()

      if (!freshUser) { router.push('/auth/login'); return }
      setUser(freshUser)

      // Get commission plan details if they have one
      let capAmount = 0
      let hasCap = false
      if (freshUser.commission_plan) {
        const { data: plan } = await supabase
          .from('commission_plans')
          .select('*')
          .eq('name', freshUser.commission_plan)
          .eq('is_active', true)
          .single()
        if (plan) {
          hasCap = plan.has_cap || false
          capAmount = plan.cap_amount || 0
        }
      }

      // Get transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, property_address, status, transaction_type, sales_price, monthly_rent, lease_term, client_name, updated_at, closing_date, closed_date')
        .eq('submitted_by', freshUser.id)
        .order('updated_at', { ascending: false })

      // Get agent financial data from transaction_internal_agents
      const { data: agentRows } = await supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_net, sales_volume, units')
        .eq('agent_id', freshUser.id)

      const txns = transactions || []
      const agentData = agentRows || []
      const currentYear = new Date().getFullYear()

      let totalVolume = 0
      let totalUnits = 0
      let totalAgentNet = 0
      let closedCount = 0
      let pendingCount = 0
      let activeCount = 0
      let complianceCount = 0

      txns.forEach(t => {
        const closedYear = t.closed_date ? new Date(t.closed_date).getFullYear() : null

        if (t.status === 'closed' && closedYear === currentYear) {
          closedCount++
          totalUnits++
          if (t.sales_price) {
            totalVolume += parseFloat(t.sales_price)
          } else if (t.monthly_rent && t.lease_term) {
            totalVolume += parseFloat(t.monthly_rent) * parseInt(t.lease_term)
          } else if (t.monthly_rent) {
            totalVolume += parseFloat(t.monthly_rent) * 12
          }
          const agentRow = agentData.find(a => a.transaction_id === t.id)
          if (agentRow?.agent_net) totalAgentNet += parseFloat(agentRow.agent_net)
        } else if (['pending', 'submitted', 'in_review', 'compliant', 'cda_in_progress', 'payout_in_progress', 'broker_review', 'cda_sent', 'payout_processed'].includes(t.status)) {
          pendingCount++
        } else if (['prospect', 'active_listing'].includes(t.status)) {
          activeCount++
        }

        if (['submitted', 'in_review', 'revision_requested'].includes(t.status)) {
          complianceCount++
        }
      })

      // Parse active_goals - default to ['volume'] if not set
      let activeGoals: ('volume' | 'units' | 'agent_net')[] = ['volume']
      if (freshUser.active_goals && Array.isArray(freshUser.active_goals)) {
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
        capProgress: freshUser.cap_progress || 0,
        capAmount,
        hasCap,
        qualifyingCount: freshUser.qualifying_transaction_count || 0,
        commissionPlan: freshUser.commission_plan || '',
      })

      setRecentTransactions(txns.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally { setLoading(false) }
  }

  const formatDate = (d: string | null) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  if (!user) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">DASHBOARD</h1>
        <button onClick={() => router.push('/agent/transactions/new')} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={14} /> New Transaction
        </button>
      </div>

      {/* Sales Goal Widget */}
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><FileText size={16} className="text-blue-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.activeCount}</p>
          <p className="text-xs text-luxury-gray-3">Active</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center"><Clock size={16} className="text-yellow-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.pendingCount}</p>
          <p className="text-xs text-luxury-gray-3">Pending</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center"><FileText size={16} className="text-purple-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.complianceCount}</p>
          <p className="text-xs text-luxury-gray-3">In Compliance</p>
        </div>
        <div className="container-card text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle size={16} className="text-green-600" /></div>
          </div>
          <p className="text-xl font-bold text-luxury-gray-1">{stats.closedCount}</p>
          <p className="text-xs text-luxury-gray-3">Closed This Year</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="container-card mt-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Recent Transactions</h2>
          <button onClick={() => router.push('/agent/transactions')} className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">View All</button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-luxury-gray-3 mb-4">No transactions yet</p>
            <button onClick={() => router.push('/agent/transactions/new')} className="btn btn-primary">Create Your First Transaction</button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Property</th>
                    <th className="th-luxury">Type</th>
                    <th className="th-luxury">Client</th>
                    <th className="th-luxury">Status</th>
                    <th className="th-luxury">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => (
                    <tr key={t.id} className="tr-luxury-clickable" onClick={() => router.push(`/agent/transactions/${t.id}`)}>
                      <td className="py-3 px-4 text-sm font-semibold text-luxury-gray-1">{t.property_address || 'No address'}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.transaction_type || ''}</td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-2">{t.client_name || ''}</td>
                      <td className="py-3 px-4"><StatusBadge status={t.status as TransactionStatus} /></td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">{formatDate(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {recentTransactions.map((t) => (
                <div key={t.id} className="inner-card cursor-pointer" onClick={() => router.push(`/agent/transactions/${t.id}`)}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1 flex-1">{t.property_address || 'No address'}</p>
                    <span className="flex-shrink-0 ml-2"><StatusBadge status={t.status as TransactionStatus} /></span>
                  </div>
                  <p className="text-xs text-luxury-gray-3">{t.transaction_type}{t.client_name ? ` · ${t.client_name}` : ''}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}