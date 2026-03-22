'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  X,
  UserCog,
  Receipt,
  BookUser,
  Loader2,
  ArrowRight,
} from 'lucide-react'

interface UserResult {
  id: string
  name: string
  email: string
  role: string
  office: string
  status: string
  type: 'user'
}

interface TransactionResult {
  id: string
  address: string
  city: string | null
  client: string
  status: string
  agent: string | null
  type: 'transaction'
}

interface ContactResult {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  contactType: string
  transactionId: string
  transactionAddress: string | null
  type: 'contact'
}

type SearchResult = UserResult | TransactionResult | ContactResult

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
  isStaff: boolean
}

export default function GlobalSearch({ open, onClose, isStaff }: GlobalSearchProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<UserResult[]>([])
  const [transactions, setTransactions] = useState<TransactionResult[]>([])
  const [contacts, setContacts] = useState<ContactResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const abortControllerRef = useRef<AbortController | null>(null)

  // All results flattened for keyboard navigation
  const allResults: SearchResult[] = [...users, ...transactions, ...contacts]

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery('')
      setUsers([])
      setTransactions([])
      setContacts([])
      setSelectedIndex(0)
    }
  }, [open])

  // Keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setUsers([])
      setTransactions([])
      setContacts([])
      return
    }

    const timer = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()

      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()
        setUsers(data.users || [])
        setTransactions(data.transactions || [])
        setContacts(data.contacts || [])
        setSelectedIndex(0)
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Search error:', err)
        }
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, allResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && allResults[selectedIndex]) {
        e.preventDefault()
        handleResultClick(allResults[selectedIndex])
      }
    },
    [allResults, selectedIndex]
  )

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'user') {
      router.push(`/admin/users/${result.id}`)
    } else if (result.type === 'transaction') {
      router.push(`/transactions/${result.id}`)
    } else if (result.type === 'contact') {
      // Navigate to the transaction this contact belongs to
      router.push(`/transactions/${result.transactionId}`)
    }
    onClose()
  }

  const getTransactionStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      prospect: 'bg-gray-100 text-gray-600',
      active_listing: 'bg-blue-100 text-blue-600',
      pending: 'bg-yellow-100 text-yellow-700',
      submitted: 'bg-purple-100 text-purple-600',
      in_review: 'bg-purple-100 text-purple-600',
      compliant: 'bg-green-100 text-green-600',
      closed: 'bg-green-100 text-green-700',
    }
    return colors[status] || 'bg-gray-100 text-gray-600'
  }

  const getUserStatusColor = (status: string) => {
    if (status === 'active') return 'bg-green-100 text-green-700'
    if (status === 'inactive') return 'bg-red-100 text-red-600'
    if (status === 'prospect') return 'bg-blue-100 text-blue-600'
    return 'bg-gray-100 text-gray-600'
  }

  const formatContactType = (type: string) => {
    return type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Contact'
  }

  if (!open) return null

  let resultIndex = 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[60]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-[61]">
        <div className="bg-white rounded-xl shadow-2xl border border-luxury-gray-5/50 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-luxury-gray-5/50">
            <Search size={18} className="text-luxury-gray-3 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search agents, transactions, contacts..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm text-luxury-gray-1 placeholder:text-luxury-gray-3 outline-none bg-transparent"
            />
            {loading && <Loader2 size={16} className="text-luxury-gray-3 animate-spin" />}
            <button
              onClick={onClose}
              className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {query.length < 2 ? (
              <div className="px-4 py-8 text-center text-xs text-luxury-gray-3">
                Type at least 2 characters to search
              </div>
            ) : loading ? (
              <div className="px-4 py-8 text-center text-xs text-luxury-gray-3">
                Searching...
              </div>
            ) : allResults.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-luxury-gray-3">
                No results found for "{query}"
              </div>
            ) : (
              <div className="py-2">
                {/* Users */}
                {users.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider">
                      Agents
                    </div>
                    {users.map(user => {
                      const idx = resultIndex++
                      return (
                        <button
                          key={user.id}
                          onClick={() => handleResultClick(user)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            selectedIndex === idx
                              ? 'bg-luxury-accent/10'
                              : 'hover:bg-luxury-gray-5/30'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-luxury-accent/20 flex items-center justify-center flex-shrink-0">
                            <UserCog size={14} className="text-luxury-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-luxury-gray-1 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-luxury-gray-3 truncate">
                              {user.email} {user.office && `· ${user.office}`}
                            </p>
                          </div>
                          {user.status && user.status !== 'active' && (
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getUserStatusColor(
                                user.status
                              )}`}
                            >
                              {user.status}
                            </span>
                          )}
                          <ArrowRight size={14} className="text-luxury-gray-3 flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Transactions */}
                {transactions.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mt-2">
                      Transactions
                    </div>
                    {transactions.map(txn => {
                      const idx = resultIndex++
                      return (
                        <button
                          key={txn.id}
                          onClick={() => handleResultClick(txn)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            selectedIndex === idx
                              ? 'bg-luxury-accent/10'
                              : 'hover:bg-luxury-gray-5/30'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-luxury-accent/20 flex items-center justify-center flex-shrink-0">
                            <Receipt size={14} className="text-luxury-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-luxury-gray-1 truncate">
                              {txn.address}
                            </p>
                            <p className="text-xs text-luxury-gray-3 truncate">
                              {txn.client || 'No client'} {txn.agent && `· ${txn.agent}`}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getTransactionStatusColor(
                              txn.status
                            )}`}
                          >
                            {txn.status?.replace(/_/g, ' ')}
                          </span>
                          <ArrowRight size={14} className="text-luxury-gray-3 flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Contacts */}
                {contacts.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-luxury-gray-3 uppercase tracking-wider mt-2">
                      Transaction Contacts
                    </div>
                    {contacts.map(contact => {
                      const idx = resultIndex++
                      return (
                        <button
                          key={contact.id}
                          onClick={() => handleResultClick(contact)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            selectedIndex === idx
                              ? 'bg-luxury-accent/10'
                              : 'hover:bg-luxury-gray-5/30'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-luxury-accent/20 flex items-center justify-center flex-shrink-0">
                            <BookUser size={14} className="text-luxury-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-luxury-gray-1 truncate">
                              {contact.name}
                            </p>
                            <p className="text-xs text-luxury-gray-3 truncate">
                              {contact.company || contact.email || contact.phone || 'No details'}
                              {contact.transactionAddress && ` · ${contact.transactionAddress}`}
                            </p>
                          </div>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-luxury-gray-5/50 text-luxury-gray-2 flex-shrink-0">
                            {formatContactType(contact.contactType)}
                          </span>
                          <ArrowRight size={14} className="text-luxury-gray-3 flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-luxury-gray-5/50 flex items-center justify-between text-[10px] text-luxury-gray-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-luxury-gray-5/50 font-mono">↑↓</kbd> to
              navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-luxury-gray-5/50 font-mono">Enter</kbd> to
              select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-luxury-gray-5/50 font-mono">Esc</kbd> to
              close
            </span>
          </div>
        </div>
      </div>
    </>
  )
}