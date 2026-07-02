'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

export interface AgentOption {
  id: string
  name: string
}

interface AgentSelectProps {
  value: string // selected agent id
  onSelect: (agent: AgentOption | null) => void
  label?: string
  placeholder?: string
}

// Search-and-select for choosing which agent a form is being submitted for.
// Intended for admin/office use. Loads licensed agents from /api/agents/list.
export default function AgentSelect({ value, onSelect, label, placeholder }: AgentSelectProps) {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/agents/list')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.agents)) {
          setAgents(d.agents.map((a: any) => ({ id: a.id, name: a.name || a.displayName })))
        }
      })
      .catch(err => console.error('Error loading agents:', err))
  }, [])

  const selected = agents.find(a => a.id === value)

  useEffect(() => {
    if (selected) setSearch(selected.name)
  }, [selected])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = search
    ? agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : agents

  const choose = (a: AgentOption) => {
    onSelect(a)
    setSearch(a.name)
    setOpen(false)
  }

  const clear = () => {
    onSelect(null)
    setSearch('')
  }

  return (
    <div className="relative" ref={ref}>
      {label && <label className="block text-xs text-luxury-gray-3 mb-1">{label}</label>}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onSelect(null) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Search for an agent...'}
          className="input-luxury w-full text-sm pl-9 pr-8"
        />
        {value && (
          <button type="button" onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-luxury-gray-4 hover:text-luxury-black">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-auto">
          {filtered.length > 0 ? (
            filtered.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => choose(a)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-luxury-light"
              >
                {a.name}
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-luxury-gray-2">No agents found</div>
          )}
        </div>
      )}
    </div>
  )
}
