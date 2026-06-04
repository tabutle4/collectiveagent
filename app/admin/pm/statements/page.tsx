'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BarChart2, ExternalLink, CheckCircle, Clock, Search } from 'lucide-react'

interface Statement {
  id: string
  period_type: 'monthly' | 'annual'
  period_month: number | null
  period_year: number
  statement_date: string
  total_rent_collected: number
  total_management_fees: number
  total_net_disbursed: number
  total_net_pending: number | null
  held_in_trust_at_statement_date: number
  sent_at: string | null
  sent_to_email: string | null
  created_at: string
  landlords?: { id: string; first_name: string; last_name: string; email: string }
  managed_properties?: { id: string; property_address: string; unit: string | null; city: string }
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function periodLabel(s: Statement) {
  if (s.period_type === 'annual') return `${s.period_year}`
  return s.period_month ? `${MONTHS[s.period_month - 1]} ${s.period_year}` : `${s.period_year}`
}

export default function StatementsListPage() {
  const [statements, setStatements] = useState<Statement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pm/statements')
      if (res.ok) {
        const data = await res.json()
        setStatements(data.statements || [])
      }
    } catch (err) {
      console.error('Failed to load statements:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = statements.filter(s => {
    if (!search) return true
    const term = search.toLowerCase()
    const landlord = `${s.landlords?.first_name} ${s.landlords?.last_name}`.toLowerCase()
    const property = `${s.managed_properties?.property_address} ${s.managed_properties?.city}`.toLowerCase()
    const period = periodLabel(s).toLowerCase()
    return landlord.includes(term) || property.includes(term) || period.includes(term)
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title flex items-center gap-2">
          <BarChart2 size={24} />
          Statements
        </h1>
        <Link href="/admin/pm/disbursements" className="btn btn-secondary text-sm">
          Create Statement
        </Link>
      </div>

      <div className="container-card mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by landlord, property, or period..."
            className="input-luxury w-full pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="container-card text-center py-12 text-luxury-gray-3 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="container-card text-center py-12">
          <BarChart2 size={32} className="text-luxury-gray-4 mx-auto mb-3" />
          <p className="text-luxury-gray-3 text-sm">
            {search ? 'No statements match your search.' : 'No statements yet. Generate one from the Disbursements page.'}
          </p>
        </div>
      ) : (
        <div className="container-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-luxury-gray-5 bg-luxury-light">
                <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Period</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Landlord</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Property</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Rent</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Net Disbursed</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Pending</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const hasPending = Number(s.total_net_pending ?? 0) > 0
                return (
                  <tr key={s.id} className="border-b border-luxury-gray-5 hover:bg-luxury-light transition-colors">
                    <td className="py-3 px-4 font-medium text-luxury-gray-1">{periodLabel(s)}</td>
                    <td className="py-3 px-4 text-luxury-gray-1">
                      {s.landlords ? `${s.landlords.first_name} ${s.landlords.last_name}` : '--'}
                    </td>
                    <td className="py-3 px-4 text-luxury-gray-2">
                      {s.managed_properties
                        ? `${s.managed_properties.property_address}${s.managed_properties.unit ? ` ${s.managed_properties.unit}` : ''}`
                        : '--'}
                      {s.managed_properties?.city && (
                        <div className="text-xs text-luxury-gray-3">{s.managed_properties.city}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-luxury-gray-1">{fmt$(Number(s.total_rent_collected))}</td>
                    <td className="py-3 px-4 text-right font-medium text-luxury-accent">{fmt$(Number(s.total_net_disbursed))}</td>
                    <td className="py-3 px-4 text-right">
                      {hasPending ? (
                        <span className="text-amber-700">{fmt$(Number(s.total_net_pending))}</span>
                      ) : (
                        <span className="text-luxury-gray-4">--</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {s.sent_at ? (
                        <span className="text-green-700 inline-flex items-center gap-1 text-xs">
                          <CheckCircle size={12} /> Sent
                        </span>
                      ) : (
                        <span className="text-amber-700 inline-flex items-center gap-1 text-xs">
                          <Clock size={12} /> Draft
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/pm/statements/${s.id}`}
                        className="btn btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                      >
                        <ExternalLink size={11} /> View
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
