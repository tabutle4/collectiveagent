'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Search, Plus, Upload, Loader2, ArrowLeft, AlertTriangle, Check, Mail, Copy } from 'lucide-react'
import CheckFieldsForm, { type CheckFieldsValue } from './CheckFieldsForm'
import CheckNotifyModal from './CheckNotifyModal'
import NewTransactionModal from './NewTransactionModal'

interface TxnRow {
  id: string
  property_address: string | null
  client_name: string | null
  status: string | null
  transaction_type: string | null
  submitted_by: string | null
}

interface AgentRow {
  id: string
  first_name?: string
  last_name?: string
  preferred_first_name?: string
  preferred_last_name?: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Step = 'transaction' | 'upload' | 'confirm' | 'notify'

function agentName(a: AgentRow | undefined): string {
  if (!a) return ''
  const fn = a.preferred_first_name || a.first_name || ''
  const ln = a.preferred_last_name || a.last_name || ''
  return `${fn} ${ln}`.trim()
}

function fmtType(t: string | null): string {
  if (!t) return ''
  return t.replace(/_v2$/, '').replace(/_/g, ' ')
}

export default function AddCheckModal({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('transaction')

  const [allTxns, setAllTxns] = useState<TxnRow[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loadingTxns, setLoadingTxns] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTxn, setSelectedTxn] = useState<TxnRow | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmedNoProspect, setConfirmedNoProspect] = useState(false)

  const [checkId, setCheckId] = useState<string | null>(null)
  const [checkImageUrl, setCheckImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [emailMode, setEmailMode] = useState(false)
  const [emailAddress, setEmailAddress] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [copied, setCopied] = useState(false)

  const [fields, setFields] = useState<CheckFieldsValue>({
    payment_method: 'check',
    status: 'received',
    received_date: new Date().toISOString().split('T')[0],
    crc_transferred: false,
  })
  const [savingCheck, setSavingCheck] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [txnAgents, setTxnAgents] = useState<any[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingTxns(true)
      try {
        const res = await fetch('/api/transactions')
        if (!res.ok) throw new Error('Failed to load transactions')
        const data = await res.json()
        if (cancelled) return
        setAllTxns(data.transactions || [])
        setAgents(data.agents || [])
      } catch {
        if (!cancelled) setAllTxns([])
      } finally {
        if (!cancelled) setLoadingTxns(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as TxnRow[]
    return allTxns
      .filter(t => {
        const addr = (t.property_address || '').toLowerCase()
        const client = (t.client_name || '').toLowerCase()
        const agent = agentName(agents.find(a => a.id === t.submitted_by)).toLowerCase()
        return addr.includes(q) || client.includes(q) || agent.includes(q)
      })
      .slice(0, 8)
  }, [search, allTxns, agents])

  const prospectMatches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as TxnRow[]
    return allTxns
      .filter(t => (t.status || '') === 'prospect')
      .filter(t => {
        const addr = (t.property_address || '').toLowerCase()
        const client = (t.client_name || '').toLowerCase()
        return addr.includes(q) || client.includes(q)
      })
      .slice(0, 8)
  }, [search, allTxns])

  const noAddressMatch = search.trim().length > 0 && results.length === 0

  const handleUpload = useCallback(async (rawFile: File) => {
    if (!selectedTxn) return
    setUploading(true)
    setUploadError(null)
    try {
      let cid = checkId
      if (!cid) {
        const res = await fetch(`/api/admin/transactions/${selectedTxn.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_check',
            check: {
              transaction_id: selectedTxn.id,
              check_amount: 0,
              payment_method: 'check',
              status: 'received',
              received_date: new Date().toISOString().split('T')[0],
              crc_transferred: false,
              agents_paid: false,
            },
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create check')
        cid = data.check.id
        setCheckId(cid)
      }

      const fd = new FormData()
      fd.append('file', rawFile)
      if (cid) fd.append('check_id', cid)
      fd.append('transaction_id', selectedTxn.id)
      const upRes = await fetch('/api/checks/upload-image', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed')
      setCheckImageUrl(upData.url)
      setFields(prev => ({ ...prev, check_image_url: upData.url } as CheckFieldsValue))

      const exFd = new FormData()
      exFd.append('file', rawFile)
      try {
        const exRes = await fetch('/api/admin/transactions/ai-check-extract', { method: 'POST', body: exFd })
        const exData = await exRes.json()
        if (exRes.ok && exData.extracted) {
          const e = exData.extracted
          setFields(prev => ({
            ...prev,
            check_amount: e.check_amount ?? prev.check_amount,
            check_from: e.check_from || prev.check_from,
            check_number: e.check_number || prev.check_number,
            check_date: e.check_date || prev.check_date,
            payment_method: e.payment_method || prev.payment_method,
            cleared_date: e.cleared_date || prev.cleared_date,
            notes: e.notes || prev.notes,
          }))
        }
      } catch { /* extraction best-effort */ }

      setStep('confirm')
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [selectedTxn, checkId])

  const ensureCheck = useCallback(async (): Promise<string | null> => {
    if (!selectedTxn) return null
    if (checkId) return checkId
    const res = await fetch(`/api/admin/transactions/${selectedTxn.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_check',
        check: {
          transaction_id: selectedTxn.id,
          check_amount: 0,
          payment_method: 'check',
          status: 'received',
          received_date: new Date().toISOString().split('T')[0],
          crc_transferred: false,
          agents_paid: false,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create check')
    setCheckId(data.check.id)
    return data.check.id
  }, [selectedTxn, checkId])

  const startEmailMode = useCallback(async () => {
    if (!selectedTxn) return
    setUploadError(null)
    try {
      const cid = await ensureCheck()
      if (!cid) throw new Error('Could not start email upload')
      setEmailAddress(`txncheck+${cid}@coachingbrokeragetools.com`)
      setEmailMode(true)
      setPollTimedOut(false)
      setPolling(true)
    } catch (err: any) {
      setUploadError(err.message || 'Could not start email upload')
    }
  }, [selectedTxn, ensureCheck])

  useEffect(() => {
    if (!polling || !checkId || !selectedTxn) return
    let cancelled = false
    const started = Date.now()
    const POLL_MS = 4000
    const TIMEOUT_MS = 5 * 60 * 1000

    const tick = async () => {
      if (cancelled) return
      if (Date.now() - started > TIMEOUT_MS) {
        setPolling(false)
        setPollTimedOut(true)
        return
      }
      try {
        const res = await fetch(`/api/admin/transactions/${selectedTxn.id}`)
        const data = await res.json()
        const found = (data.checks || []).find((c: any) => c.id === checkId)
        if (found && found.check_image_url) {
          setCheckImageUrl(found.check_image_url)
          setFields(prev => ({
            ...prev,
            check_amount: found.check_amount ?? prev.check_amount,
            check_from: found.check_from || prev.check_from,
            check_number: found.check_number || prev.check_number,
            check_date: found.check_date || prev.check_date,
            payment_method: found.payment_method || prev.payment_method,
            received_date: found.received_date || prev.received_date,
            deposited_date: found.deposited_date || prev.deposited_date,
            cleared_date: found.cleared_date || prev.cleared_date,
            status: found.status || prev.status,
            notes: found.notes || prev.notes,
            check_image_url: found.check_image_url,
          } as CheckFieldsValue))
          setPolling(false)
          setStep('confirm')
        }
      } catch { /* keep polling */ }
    }

    const interval = setInterval(tick, POLL_MS)
    tick()
    return () => { cancelled = true; clearInterval(interval) }
  }, [polling, checkId, selectedTxn])

  const saveCheck = useCallback(async (): Promise<boolean> => {
    if (!selectedTxn) return false
    setSavingCheck(true)
    setSaveError(null)
    try {
      const cid = await ensureCheck()
      if (!cid) throw new Error('No check to save')
      const { compliance_status, ...checkUpdates } = fields
      const res = await fetch(`/api/admin/transactions/${selectedTxn.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_check', check_id: cid, updates: checkUpdates }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save check')
      }
      if (compliance_status) {
        await fetch(`/api/admin/transactions/${selectedTxn.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_transaction', updates: { compliance_status } }),
        })
      }
      return true
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save check')
      return false
    } finally {
      setSavingCheck(false)
    }
  }, [selectedTxn, fields, ensureCheck])

  const goToNotify = useCallback(async () => {
    const ok = await saveCheck()
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/transactions/${selectedTxn!.id}`)
      const data = await res.json()
      setTxnAgents(data.agents || [])
    } catch { setTxnAgents([]) }
    setStep('notify')
  }, [saveCheck, selectedTxn])

  const onFieldChange = (field: keyof CheckFieldsValue, value: any) => {
    setFields(prev => ({ ...prev, [field]: value }))
  }

  if (showCreate) {
    return (
      <NewTransactionModal
        onClose={() => setShowCreate(false)}
        canAssignAgent={true}
        agents={agents}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
          <h2 className="text-sm font-semibold text-luxury-gray-1">Add Check</h2>
          <button onClick={onClose} aria-label="Close" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 text-xs">
          <span className={step === 'transaction' ? 'font-semibold text-luxury-accent' : 'text-luxury-gray-3'}>1 Transaction</span>
          <span className="text-luxury-gray-4">›</span>
          <span className={step === 'upload' ? 'font-semibold text-luxury-accent' : 'text-luxury-gray-3'}>2 Upload</span>
          <span className="text-luxury-gray-4">›</span>
          <span className={step === 'confirm' ? 'font-semibold text-luxury-accent' : 'text-luxury-gray-3'}>3 Confirm</span>
          <span className="text-luxury-gray-4">›</span>
          <span className={step === 'notify' ? 'font-semibold text-luxury-accent' : 'text-luxury-gray-3'}>4 Notify</span>
        </div>

        <div className="px-5 pb-5">
          {step === 'transaction' && (
            <div>
              <label className="field-label">Search transaction by address, client, or agent</label>
              <div className="relative mt-1 mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
                <input
                  type="text"
                  className="input-luxury text-sm pl-9"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setConfirmedNoProspect(false) }}
                  placeholder="Start typing..."
                />
              </div>

              {loadingTxns && (
                <div className="flex items-center gap-2 text-xs text-luxury-gray-3 py-4">
                  <Loader2 size={14} className="animate-spin" /> Loading transactions...
                </div>
              )}

              {!loadingTxns && results.length > 0 && (
                <div className="border border-luxury-gray-5 rounded-lg overflow-hidden">
                  {results.map(t => {
                    const isSel = selectedTxn?.id === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTxn(t)}
                        className={`w-full text-left px-4 py-2.5 border-b border-luxury-gray-5 last:border-b-0 flex items-center justify-between ${isSel ? 'bg-luxury-accent/10' : 'hover:bg-luxury-gray-5/40'}`}
                      >
                        <div>
                          <div className="text-sm font-medium text-luxury-gray-1">
                            {t.property_address || t.client_name || 'No address'}
                          </div>
                          <div className="text-xs text-luxury-gray-3 capitalize">
                            {fmtType(t.transaction_type)} · {agentName(agents.find(a => a.id === t.submitted_by))} · {t.status}
                          </div>
                        </div>
                        {isSel && <Check size={16} className="text-luxury-accent" />}
                      </button>
                    )
                  })}
                </div>
              )}

              {!loadingTxns && noAddressMatch && (
                <div className="mt-2">
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5 mb-3">
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>
                      No address match. First confirm none of these prospect deals are this client. Prospect deals show the client name instead of an address.
                    </span>
                  </div>
                  {prospectMatches.length > 0 && (
                    <div className="border border-luxury-gray-5 rounded-lg overflow-hidden mb-3">
                      <div className="px-3 py-2 bg-luxury-gray-5/40 text-xs text-luxury-gray-3">
                        Prospect deals - pick if this is the same client
                      </div>
                      {prospectMatches.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTxn(t)}
                          className="w-full text-left px-3 py-2.5 border-t border-luxury-gray-5 text-sm hover:bg-luxury-gray-5/40"
                        >
                          {t.client_name || t.property_address}
                          <span className="text-xs text-luxury-gray-3"> · prospect</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!confirmedNoProspect ? (
                    <button
                      type="button"
                      onClick={() => setConfirmedNoProspect(true)}
                      className="btn btn-secondary text-xs"
                    >
                      <Check size={14} /> None of these - continue to create
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="btn btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Create new transaction
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                <button type="button" onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
                <button
                  type="button"
                  disabled={!selectedTxn}
                  onClick={() => setStep('upload')}
                  className="btn btn-primary text-sm disabled:opacity-50"
                >
                  Next: upload
                </button>
              </div>
            </div>
          )}

          {step === 'upload' && selectedTxn && (
            <div>
              <div className="text-xs text-luxury-gray-3 bg-luxury-gray-5/40 rounded-lg px-3 py-2 mb-3">
                {selectedTxn.property_address || selectedTxn.client_name}
              </div>

              {!emailMode ? (
                <>
                  <label
                    className="block border border-dashed border-luxury-gray-4 rounded-lg px-5 py-8 text-center cursor-pointer hover:bg-luxury-gray-5/30"
                  >
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                    />
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-luxury-gray-2">
                        <Loader2 size={18} className="animate-spin" /> Uploading and reading check...
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="mx-auto text-luxury-gray-3" />
                        <div className="text-sm text-luxury-gray-2 mt-2">Drop check photo or PDF here, or click to browse</div>
                        <div className="text-xs text-luxury-gray-3 mt-1">Images or PDF, up to 10MB. AI pre-fills the next step.</div>
                      </>
                    )}
                  </label>
                  {uploadError && <div className="text-xs text-red-600 mt-2">{uploadError}</div>}

                  <div className="flex items-center gap-2 my-3 text-xs text-luxury-gray-3">
                    <div className="flex-1 border-t border-luxury-gray-5" />
                    <span>or</span>
                    <div className="flex-1 border-t border-luxury-gray-5" />
                  </div>

                  <button
                    type="button"
                    onClick={startEmailMode}
                    className="w-full btn btn-secondary text-sm flex items-center justify-center gap-1.5"
                  >
                    <Mail size={14} /> Email the check instead
                  </button>
                </>
              ) : (
                <div className="border border-luxury-gray-5 rounded-lg p-4">
                  <div className="text-sm text-luxury-gray-1 font-medium mb-1">Email the check to this address</div>
                  <div className="text-xs text-luxury-gray-3 mb-3">We will watch for it and fill in the details automatically.</div>
                  <div className="flex items-center gap-2 bg-luxury-gray-5/40 rounded-lg px-3 py-2 mb-3">
                    <span className="text-xs text-luxury-gray-1 break-all flex-1">{emailAddress}</span>
                    <button
                      type="button"
                      onClick={() => { if (emailAddress) { navigator.clipboard.writeText(emailAddress); setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
                      className="text-xs text-luxury-accent flex items-center gap-1 flex-shrink-0"
                    >
                      <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {polling && (
                    <div className="flex items-center gap-2 text-xs text-luxury-gray-2">
                      <Loader2 size={14} className="animate-spin" /> Waiting for the emailed check to arrive...
                    </div>
                  )}
                  {pollTimedOut && (
                    <div className="text-xs text-luxury-gray-3">
                      Still waiting. The email may take a moment, or you can upload the file directly.
                      <button
                        type="button"
                        onClick={() => { setEmailMode(false); setPollTimedOut(false) }}
                        className="text-luxury-accent ml-1"
                      >
                        Switch to file upload
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-5">
                <button type="button" onClick={() => setStep('transaction')} className="btn btn-secondary text-sm flex items-center gap-1">
                  <ArrowLeft size={14} /> Back
                </button>
                <button type="button" onClick={() => setStep('confirm')} className="btn btn-secondary text-sm">
                  Skip upload
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && selectedTxn && (
            <div>
              <CheckFieldsForm value={fields} onChange={onFieldChange} />
              {saveError && <div className="text-xs text-red-600 mt-2">{saveError}</div>}
              <div className="flex items-center justify-between mt-5">
                <button type="button" onClick={() => setStep('upload')} className="btn btn-secondary text-sm flex items-center gap-1">
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  type="button"
                  disabled={savingCheck}
                  onClick={goToNotify}
                  className="btn btn-primary text-sm disabled:opacity-50"
                >
                  {savingCheck ? 'Saving...' : 'Next: notify'}
                </button>
              </div>
            </div>
          )}

          {step === 'notify' && selectedTxn && checkId && (
            <CheckNotifyModal
              checkId={checkId}
              address={selectedTxn.property_address || selectedTxn.client_name || ''}
              clearedDate={fields.cleared_date || null}
              checkImageUrl={checkImageUrl}
              agents={txnAgents}
              onClose={() => { onSaved(); onClose() }}
              onSent={() => { onSaved(); onClose() }}
            />
          )}

          {step === 'notify' && selectedTxn && !checkId && (
            <div>
              <div className="text-sm text-luxury-gray-2">Check saved.</div>
              <div className="flex items-center justify-end mt-5">
                <button type="button" onClick={() => { onSaved(); onClose() }} className="btn btn-primary text-sm">Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
