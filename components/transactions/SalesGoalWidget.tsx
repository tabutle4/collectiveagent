'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, Pencil, Trophy, TrendingUp, DollarSign, Hash, Settings } from 'lucide-react'

type GoalMetric = 'volume' | 'units' | 'agent_net'

const METRICS: {
  key: GoalMetric
  label: string
  shortLabel: string
  icon: any
  goalField: string
}[] = [
  {
    key: 'volume',
    label: 'Sales Volume',
    shortLabel: 'Volume',
    icon: TrendingUp,
    goalField: 'sales_volume_goal',
  },
  { key: 'units', label: 'Units Closed', shortLabel: 'Units', icon: Hash, goalField: 'units_goal' },
  {
    key: 'agent_net',
    label: 'Agent Net',
    shortLabel: 'Net',
    icon: DollarSign,
    goalField: 'agent_net_goal',
  },
]

interface SalesGoalWidgetProps {
  userId: string
  volume: number
  units: number
  agentNet: number
  goals: { volume: number; units: number; agent_net: number }
  activeGoals: GoalMetric[]
  closedCount: number
  pendingCount: number
  capProgress?: number
  capAmount?: number
  hasCap?: boolean
  qualifyingCount?: number
  qualifyingTarget?: number
  commissionPlan?: string
  onUpdate?: () => void
}

export default function SalesGoalWidget({
  userId,
  volume,
  units,
  agentNet,
  goals,
  activeGoals,
  closedCount,
  pendingCount,
  capProgress,
  capAmount,
  hasCap,
  qualifyingCount,
  qualifyingTarget = 5,
  commissionPlan,
  onUpdate,
}: SalesGoalWidgetProps) {
  const [editingGoal, setEditingGoal] = useState<GoalMetric | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [localActiveGoals, setLocalActiveGoals] = useState<GoalMetric[]>(
    activeGoals.length > 0 ? activeGoals : ['volume', 'agent_net']
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingGoal && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingGoal])

  const toggleGoal = async (metric: GoalMetric) => {
    let updated: GoalMetric[]
    if (localActiveGoals.includes(metric)) {
      if (localActiveGoals.length <= 1) return
      updated = localActiveGoals.filter(g => g !== metric)
    } else {
      updated = [...localActiveGoals, metric]
    }
    setLocalActiveGoals(updated)
    
    await fetch('/api/users/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, active_goals: updated }),
    })
    onUpdate?.()
  }

  const handleSaveGoal = async (metric: GoalMetric) => {
    const parsed = parseFloat(goalInput.replace(/[^0-9.]/g, ''))
    if (isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    const goalField = METRICS.find(m => m.key === metric)?.goalField || 'sales_volume_goal'
    try {
      await fetch('/api/users/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, [goalField]: parsed }),
      })
      setEditingGoal(null)
      onUpdate?.()
    } catch (error) {
      console.error('Error saving goal:', error)
    } finally {
      setSaving(false)
    }
  }

  const getValue = (metric: GoalMetric) =>
    metric === 'volume' ? volume : metric === 'units' ? units : agentNet
  const getGoal = (metric: GoalMetric) => goals[metric] || 0
  const isCurrency = (metric: GoalMetric) => metric !== 'units'

  const formatValue = (amount: number, currency: boolean) => {
    if (!currency) return amount.toLocaleString()
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
    return `$${amount.toLocaleString()}`
  }

  const formatFull = (amount: number, currency: boolean) => {
    if (!currency) return amount.toLocaleString()
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="container-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="section-title mb-0">My Goals</h2>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="inner-card mb-5">
          <p className="text-xs font-semibold text-luxury-gray-2 mb-3">
            Choose which goals to display:
          </p>
          <div className="flex flex-wrap gap-3">
            {METRICS.map(m => (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localActiveGoals.includes(m.key)}
                  onChange={() => toggleGoal(m.key)}
                  className="w-4 h-4"
                />
                <span className="text-xs text-luxury-gray-2">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Goal Rings - always in one row */}
      <div
        className={`grid gap-4 ${localActiveGoals.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' : localActiveGoals.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        {localActiveGoals.map(metric => {
          const metricInfo = METRICS.find(m => m.key === metric)!
          const Icon = metricInfo.icon
          const current = getValue(metric)
          const goal = getGoal(metric)
          const currency = isCurrency(metric)
          const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0
          const remaining = goal > 0 ? Math.max(goal - current, 0) : 0
          const isComplete = percentage >= 100

          return (
            <div key={metric} className="flex flex-col items-center">
              <GoalRing
                percentage={percentage}
                isComplete={isComplete}
                goal={goal}
                count={localActiveGoals.length}
              />

              {/* Label */}
              <div className="flex items-center gap-1 mt-2 mb-0.5">
                <Icon size={12} className="text-luxury-accent" />
                <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest hidden sm:inline">
                  {metricInfo.label}
                </span>
                <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest sm:hidden">
                  {metricInfo.shortLabel}
                </span>
              </div>

              {/* Current value */}
              <p className="text-sm sm:text-lg font-bold text-luxury-gray-1">
                {formatFull(current, currency)}
              </p>

              {/* Editable goal */}
              <div className="mt-1">
                {editingGoal === metric ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-luxury-gray-3">{currency ? '$' : ''}</span>
                    <input
                      ref={inputRef}
                      className="input-luxury w-20 sm:w-28 text-xs"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveGoal(metric)
                        if (e.key === 'Escape') setEditingGoal(null)
                      }}
                      placeholder={currency ? '1,000,000' : '25'}
                    />
                    <button
                      onClick={() => handleSaveGoal(metric)}
                      disabled={saving}
                      className="text-green-600 hover:text-green-700"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setGoalInput(goal > 0 ? goal.toString() : '')
                      setEditingGoal(metric)
                    }}
                    className="flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors group"
                  >
                    <span>
                      Goal:{' '}
                      <span className="font-medium text-luxury-gray-2">
                        {goal > 0 ? formatFull(goal, currency) : 'Set goal'}
                      </span>
                    </span>
                    <Pencil
                      size={10}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                )}
              </div>

              {goal > 0 && !isComplete && (
                <p className="text-xs text-luxury-gray-3 mt-0.5">
                  {formatValue(remaining, currency)} left
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom stats */}
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 mt-5 pt-4 border-t border-luxury-gray-5/30">
        <div className="text-center">
          <p className="text-lg font-bold text-luxury-gray-1">{closedCount}</p>
          <p className="text-xs text-luxury-gray-3">Closed This Year</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-luxury-gray-1">{pendingCount}</p>
          <p className="text-xs text-luxury-gray-3">Pending</p>
        </div>
        {hasCap && capAmount && capAmount > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold text-luxury-gray-1">
              {formatValue(capProgress || 0, true)}
            </p>
            <p className="text-xs text-luxury-gray-3">of {formatValue(capAmount, true)} Cap</p>
          </div>
        )}
        {commissionPlan?.toLowerCase().includes('new') && (
          <div className="text-center">
            <p className="text-lg font-bold text-luxury-gray-1">{qualifyingCount || 0} / {qualifyingTarget}</p>
            <p className="text-xs text-luxury-gray-3">Deals to Upgrade</p>
          </div>
        )}
      </div>
    </div>
  )
}

function GoalRing({
  percentage,
  isComplete,
  goal,
  count,
}: {
  percentage: number
  isComplete: boolean
  goal: number
  count: number
}) {
  const [animatedPercent, setAnimatedPercent] = useState(0)

  useEffect(() => {
    setAnimatedPercent(0)
    const timer = setTimeout(() => setAnimatedPercent(percentage), 100)
    return () => clearTimeout(timer)
  }, [percentage])

  // Responsive ring size: smaller on mobile when showing 3
  const size = count >= 3 ? 100 : count === 2 ? 120 : 160
  const strokeWidth = count >= 3 ? 8 : 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedPercent / 100) * circumference

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#A3A3A3"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? '#22C55E' : 'var(--accent-color, #C5A278)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isComplete ? (
          <>
            <Trophy size={count >= 3 ? 16 : 20} className="text-green-500 mb-0.5" />
            <p className={`font-bold text-green-600 ${count >= 3 ? 'text-xs' : 'text-sm'}`}>
              Done!
            </p>
          </>
        ) : goal > 0 ? (
          <>
            <p className={`font-bold text-luxury-gray-1 ${count >= 3 ? 'text-lg' : 'text-xl'}`}>
              {Math.round(percentage)}%
            </p>
            <p className="text-xs text-luxury-gray-3">of goal</p>
          </>
        ) : (
          <p className="text-xs text-luxury-gray-3">No goal</p>
        )}
      </div>
    </div>
  )
}