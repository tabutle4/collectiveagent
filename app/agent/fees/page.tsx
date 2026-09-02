'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, ExternalLink, CreditCard, Loader2, Landmark } from 'lucide-react'
import { realChargeItems } from '@/lib/payload/commissionOffsetItems'

declare global {
  interface Window {
    Payload: any
  }
}

export default function AgentFeesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // The bank on file, read live from Payload via /api/agent/bank-account.
  // Until now this page showed a single Connected boolean and no way to change
  // the account, so an agent whose bank changed had no self-service path.
  const [bank, setBank] = useState<any>(null)
  const [replaceBankOpen, setReplaceBankOpen] = useState(false)
  const [openInvoices, setOpenInvoices] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [debts, setDebts] = useState<any[]>([])
  const [credits, setCredits] = useState<any[]>([])
  const [paying, setPaying] = useState<string | null>(null)
  const [monthlyFee, setMonthlyFee] = useState(50)
  const [connectingBank, setConnectingBank] = useState(false)
  const payloadScriptLoaded = useRef(false)

  useEffect(() => {
    fetch('/api/settings/standard')
      .then(r => r.json())
      .then(data => {
        if (data.settings?.monthly_fee) setMonthlyFee(data.settings.monthly_fee)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (payloadScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://payload.com/Payload.js'
    script.async = true
    document.head.appendChild(script)
    payloadScriptLoaded.current = true
  }, [])

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          router.push('/auth/login')
          return
        }
        const data = await res.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    fetchUser()
    loadBank()
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.id) return
    loadData()
  }, [user?.id])

  const loadData = async () => {
    // Fetch fresh user profile data
    const profileRes = await fetch('/api/users/profile')
    if (profileRes.ok) {
      const profileData = await profileRes.json()
      if (profileData.user) {
        setUser((prev: any) => ({ ...prev, ...profileData.user }))
      }
    }

    // Fetch invoices, receipts, and billing records via API
    const [invoiceRes, receiptRes, billingRes] = await Promise.all([
      fetch(`/api/payload/open-invoices?user_id=${user.id}`),
      fetch(`/api/payload/receipts?user_id=${user.id}`),
      fetch(`/api/billing?agent_id=${user.id}&status=outstanding`),
    ])

    const invoiceData = await invoiceRes.json()
    const receiptData = await receiptRes.json()
    const billingData = await billingRes.json()

    setOpenInvoices(invoiceData.invoices || [])
    setReceipts(receiptData.receipts || [])

    const records = billingData.records || []
    setDebts(records.filter((r: any) => r.record_type !== 'credit'))
    setCredits(records.filter((r: any) => r.record_type === 'credit'))
    setLoading(false)
  }

  // Today as a plain YYYY-MM-DD string so date-only comparisons avoid any
  // timezone shift (matching the rest of this page's date handling).
  const todayStr = new Date().toLocaleDateString('en-CA') // en-CA renders as YYYY-MM-DD

  // An invoice is overdue only once its due date has passed. A missing or
  // unparseable due date is treated as overdue so nothing is silently ignored.
  const isInvoiceOverdue = (inv: any) => {
    const due = inv?.due_date
    if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(due)) return true
    return due.slice(0, 10) < todayStr
  }

  const getMonthlyStatus = () => {
    if (user?.monthly_fee_waived) return 'waived'
    if (!user?.monthly_fee_paid_through) return 'unpaid'
    // Overdue means a monthly invoice exists that is past its due date and still
    // unpaid. A next-month invoice that is not yet due is upcoming, not overdue,
    // so it no longer flips the agent to overdue the way the old end-of-month
    // comparison did.
    const hasOverdueInvoice = openInvoices.some((inv: any) => isInvoiceOverdue(inv))
    return hasOverdueInvoice ? 'overdue' : 'current'
  }

  // Unpaid invoices that are not yet due, surfaced as "due soon" rather than
  // counting against the agent.
  const upcomingInvoices = openInvoices.filter((inv: any) => !isInvoiceOverdue(inv))

  const monthlyStatus = getMonthlyStatus()

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    // Add noon time to date-only strings to prevent timezone shift
    const d = dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr
    return new Date(d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatCurrency = (amount: any) => {
    const num = parseFloat(amount)
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`
  }

  const totalDebts = debts.reduce((sum, d) => sum + (d.amount_remaining ?? d.amount_owed), 0)
  const totalCredits = credits.reduce((sum, c) => sum + (c.amount_remaining ?? c.amount_owed), 0)
  const netBalance = totalDebts - totalCredits

  const openCheckout = async (invoice: any) => {
    setPaying(invoice.id)
    try {
      const tokenRes = await fetch('/api/payload/checkout-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
  invoice_id: invoice.id,
  amount: invoice.amount_due ?? invoice.amount,
  description: invoice.description,
}),
      })
      const tokenData = await tokenRes.json()
      if (!tokenData.client_token)
        throw new Error(tokenData.error || 'Failed to create checkout session')

      window.Payload(tokenData.client_token)
      const checkout = new window.Payload.Checkout({
        invoice_id: invoice.id,
        style: {
          default: {
            primaryColor: '#C5A278',
            backgroundColor: '#ffffff',
            color: '#1A1A1A',
            input: { borderColor: '#e5e5e5', boxShadow: 'none' },
            header: { backgroundColor: '#1A1A1A', color: '#ffffff' },
            button: { boxShadow: 'none' },
          },
        },
      })

      checkout.on('success', async (evt: any) => {
        await fetch('/api/payload/confirm-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: evt.transaction_id }),
        })
        await loadData()
        setPaying(null)
      })

      checkout.on('closed', () => setPaying(null))
    } catch (err: any) {
      alert(err.message || 'Something went wrong. Please contact the office.')
      setPaying(null)
    }
  }

  const loadBank = async () => {
    try {
      const res = await fetch('/api/agent/bank-account')
      if (!res.ok) return
      setBank(await res.json())
    } catch {
      // Non-fatal: the card falls back to the connection status we hold.
    }
  }

  // replace=true is what lets a connected agent swap the account. The server
  // refuses without it, so a stray click cannot fire a second activation email.
  const connectBank = async (replace = false) => {
    setReplaceBankOpen(false)
    setConnectingBank(true)
    try {
      const res = await fetch('/api/agent/connect-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replace ? { replace: true } : {}),
      })
      const result = await res.json()
      if (res.ok && result.success) {
        alert('Bank activation email sent to your email address. Follow the link to connect your bank account.')
        await loadBank()
      } else if (result.fallback) {
        alert('Please contact office@collectiverealtyco.com to connect your bank account.')
      } else {
        alert(result.error || 'Failed to send bank activation. Please contact office@collectiverealtyco.com.')
      }
    } catch {
      alert('Failed to send bank activation. Please contact office@collectiverealtyco.com.')
    } finally {
      setConnectingBank(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <h1 className="page-title mb-6">FEES & BILLING</h1>

      {/* Onboarding Fee */}
      <div className="container-card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">
              Onboarding Fee
            </p>
            {user?.onboarding_fee_paid_date && (
              <p className="text-xs text-luxury-gray-3 mt-1">
                Paid {formatDate(user.onboarding_fee_paid_date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {user?.onboarding_fee_paid ? (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Paid</span>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-red-500" />
                <span className="text-xs font-medium text-red-500">Unpaid</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bank Account. Shows WHICH account is on file, not just that one is:
          bank name, account type and the last four. The full account number
          and the routing number are never sent to the browser. */}
      <div className="container-card mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">
              Commission Disbursements
            </p>
            {user?.bank_connected ? (
              <>
                <p className="text-sm font-semibold text-luxury-gray-1 flex items-center gap-1.5">
                  <Landmark size={14} className="text-luxury-gray-3 flex-shrink-0" />
                  {bank?.detailsAvailable
                    ? bank.bank_name || 'Bank account'
                    : 'Bank account connected'}
                  {bank?.detailsAvailable && bank.account_last4 && (
                    <span className="text-luxury-gray-2 font-normal">
                      {bank.account_type ? `${bank.account_type} ` : ''}
                      &bull;&bull;&bull;&bull; {bank.account_last4}
                    </span>
                  )}
                </p>
                {bank?.detailsAvailable && bank.account_holder && (
                  <p className="text-xs text-luxury-gray-3 mt-0.5">{bank.account_holder}</p>
                )}
                {bank?.missingAtPayload && (
                  <p className="text-xs text-red-700 mt-1">
                    We cannot find this account at our payment provider any more. Please reconnect
                    it.
                  </p>
                )}
                {bank?.detailsAvailable &&
                  String(bank.status || '').toLowerCase() === 'declining' && (
                    <p className="text-xs text-amber-800 mt-1">
                      Your bank is declining transfers to this account. Reconnecting usually fixes
                      it.
                    </p>
                  )}
                <p className="text-xs text-luxury-gray-3 mt-1">
                  Commission payouts are sent here by ACH.
                </p>
              </>
            ) : (
              <p className="text-xs text-luxury-gray-3 mt-1">
                Connect your bank account to receive commission payouts via ACH
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {user?.bank_connected ? (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Connected</span>
                <button
                  onClick={() => setReplaceBankOpen(true)}
                  disabled={connectingBank}
                  className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {connectingBank ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                  {connectingBank ? 'Sending...' : 'Change bank account'}
                </button>
              </>
            ) : (
              <button
                onClick={() => connectBank(false)}
                disabled={connectingBank}
                className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
              >
                {connectingBank ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                {connectingBank ? 'Sending...' : 'Connect Bank'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replacing a bank disconnects the current one and emails a fresh
          activation link, so it is confirmed first. */}
      {replaceBankOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Change your bank account?</h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-luxury-gray-2">
                We will email you a link to connect a new account. The account on file now is
                removed straight away, so any payout sent before you finish will be held.
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => connectBank(true)}
                className="btn btn-primary text-xs flex-1"
              >
                Send me the link
              </button>
              <button
                onClick={() => setReplaceBankOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Fee */}
      <div className="container-card mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-1">
              Monthly Fee
            </p>
            {monthlyStatus === 'waived' ? (
              <p className="text-sm font-semibold text-luxury-gray-1">Waived</p>
            ) : (
              <p className="text-sm font-semibold text-luxury-gray-1">${monthlyFee} / month</p>
            )}
            {user?.monthly_fee_paid_through && monthlyStatus !== 'waived' && (
              <p className="text-xs text-luxury-gray-3 mt-1">
                Paid through {formatDate(user.monthly_fee_paid_through)}
                {monthlyStatus === 'current' && upcomingInvoices.length > 0 && (
                  <span>
                    {' '}&middot; {formatCurrency(
                      upcomingInvoices.reduce(
                        (sum: number, inv: any) =>
                          sum + Number(inv.amount_due ?? inv.amount ?? 0),
                        0
                      )
                    )} due soon
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {monthlyStatus === 'waived' && (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Waived</span>
              </>
            )}
            {monthlyStatus === 'current' && (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Current</span>
              </>
            )}
            {monthlyStatus === 'overdue' && (
              <>
                <AlertCircle size={18} className="text-red-500" />
                <span className="text-xs font-medium text-red-500">Overdue</span>
              </>
            )}
            {monthlyStatus === 'unpaid' && (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <span className="text-xs font-medium text-green-600">Current</span>
              </>
            )}
          </div>
        </div>

        {monthlyStatus !== 'waived' && (
          <div className="inner-card">
            <p className="text-xs font-medium text-luxury-gray-2 mb-1">Prefer Zelle?</p>
            <p className="text-xs text-luxury-gray-3">
              Send to{' '}
              <span className="font-medium text-luxury-gray-2">info@collectiverealtyco.com</span> -
              include your name in the memo.
            </p>
          </div>
        )}
      </div>

      {/* Outstanding Balances */}
      {debts.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
            Outstanding Balances
          </h2>
          <div className="space-y-2">
            {debts.map(debt => (
              <div key={debt.id} className="inner-card border border-orange-100 bg-orange-50/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-luxury-gray-1">{debt.description}</p>
                    <p className="text-xs text-luxury-gray-3 mt-0.5">
                      {formatDate(debt.date_incurred)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-orange-600 ml-4">
                    {formatCurrency(debt.amount_remaining ?? debt.amount_owed)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brokerage Credits */}
      {credits.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
            Brokerage Credits
          </h2>
          <div className="space-y-2">
            {credits.map(credit => (
              <div key={credit.id} className="inner-card border border-green-100 bg-green-50/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-luxury-gray-1">{credit.description}</p>
                    <p className="text-xs text-luxury-gray-3 mt-0.5">
                      {formatDate(credit.date_incurred)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-green-600 ml-4">
                    -{formatCurrency(credit.amount_remaining ?? credit.amount_owed)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net Balance */}
      {(debts.length > 0 || credits.length > 0) && (
        <div className="container-card mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              Net Balance
            </p>
            <p
              className={`text-sm font-bold ${netBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}
            >
              {netBalance > 0
                ? formatCurrency(netBalance)
                : `-${formatCurrency(Math.abs(netBalance))}`}
            </p>
          </div>
          {netBalance < 0 && (
            <p className="text-xs text-luxury-gray-3 mt-1">
              You have a credit on file. It will be applied to your next invoice.
            </p>
          )}
        </div>
      )}

      {/* Open Invoices */}
      {openInvoices.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
            Outstanding Invoices
          </h2>
          <div className="space-y-3">
            {openInvoices.map(inv => (
              <div key={inv.id} className="inner-card">
                <div className="flex items-start justify-between mb-2">
                  {/* min-w-0 lets the description wrap instead of being
                      squeezed by the amount, which is flex-shrink-0. */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-luxury-gray-1 break-words whitespace-pre-wrap">
                      {inv.description}
                    </p>
                    {inv.due_date && (
                      <p className="text-xs text-luxury-gray-3 mt-0.5">
                        Due {formatDate(inv.due_date)}
                      </p>
                    )}
                    {realChargeItems(inv).length > 1 && (
                      <div className="mt-1.5 space-y-0.5">
                        {realChargeItems(inv).map((item: any, i: number) => (
                          <p key={item.id || i} className="text-xs text-luxury-gray-3 break-words">
                            {item.description || item.type}: {formatCurrency(item.amount)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-luxury-gray-1 ml-4 flex-shrink-0">
                    {formatCurrency(inv.amount_due ?? inv.amount)}
                  </p>
                </div>
                <button
                  onClick={() => openCheckout(inv)}
                  disabled={paying === inv.id}
                  className="btn btn-primary text-xs w-full disabled:opacity-50"
                >
                  {paying === inv.id
                    ? 'Opening Checkout...'
                    : `Pay ${formatCurrency(inv.amount_due ?? inv.amount)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment History */}
      {receipts.length > 0 && (
        <div className="container-card mb-4">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
            Payment History
          </h2>
          <div className="space-y-2">
            {receipts.map(r => (
              <div key={r.id} className="inner-card flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-luxury-gray-1">{r.description}</p>
                  <p className="text-xs text-luxury-gray-3">{formatDate(r.paid_at)}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <p className="text-sm font-semibold text-luxury-gray-1">
                    {formatCurrency(r.amount)}
                  </p>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-luxury-gray-3 hover:text-luxury-accent"
                      title="View receipt"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inner-card">
        <p className="text-xs text-luxury-gray-3">
          Questions about your billing? Email{' '}
          <a
            href="mailto:office@collectiverealtyco.com"
            className="text-luxury-accent hover:underline"
          >
            office@collectiverealtyco.com
          </a>
        </p>
      </div>
    </div>
  )
}
