'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Upload, Download, ArrowLeft, AlertCircle, CheckCircle2, Loader2, Pencil, Save } from 'lucide-react'
import { FLYER_FONT_CSS } from '@/lib/flyer-fonts'
import { useAuth } from '@/lib/context/AuthContext'

// ── Font loading gate ─────────────────────────────────────────────────────────
// The flyer fonts are injected as base64 @font-face rules in a <style> tag. An
// injected @font-face is not guaranteed to register as a pending load, so
// document.fonts.ready can resolve before the glyphs are actually available,
// which makes the first word ("Just") paint in a fallback serif. Registering the
// faces explicitly via the FontFace API and awaiting them guarantees the real
// font is present before the flyer renders or exports.
let flyerFontsPromise: Promise<void> | null = null
function ensureFlyerFontsLoaded(): Promise<void> {
  if (flyerFontsPromise) return flyerFontsPromise
  flyerFontsPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    const faceRe = /@font-face\s*\{[^}]*?font-family:\s*"([^"]+)"[^}]*?src:\s*url\("([^"]+)"\)[^}]*?\}/g
    let match: RegExpExecArray | null
    const loads: Promise<unknown>[] = []
    while ((match = faceRe.exec(FLYER_FONT_CSS)) !== null) {
      const family = match[1]
      const src = match[2]
      try {
        const face = new FontFace(family, `url(${src})`)
        loads.push(
          face.load().then(loaded => {
            ;(document.fonts as unknown as FontFaceSet).add(loaded)
          })
        )
      } catch {}
    }
    try {
      await Promise.all(loads)
    } catch {}
  })()
  return flyerFontsPromise
}

// ── Flyer type label helpers ──────────────────────────────────────────────────
const FLYER_LABELS: Record<string, { just: string; type: string }> = {
  just_listed:  { just: 'Just',  type: 'Listed' },
  just_sold:    { just: 'Just',  type: 'Sold' },
  just_leased:  { just: 'Just',  type: 'Leased' },
  under_contract: { just: 'Under', type: 'Contract' },
  retainer:     { just: 'Just',  type: 'Listed' }, // fallback for retainer entries
}

function formatNumber(n: number | null | undefined): string {
  if (!n) return ''
  return n.toLocaleString('en-US')
}

function parseCityFromAddress(address: string): string {
  // "123 Main St, Houston, TX 77001" -> "Houston, TX 77001" (state kept for expandState)
  const parts = address.split(',').map(p => p.trim())
  if (parts.length >= 3) {
    // street, city, state+zip -> keep city and the state segment
    return `${parts[1]}, ${parts[2]}`
  }
  if (parts.length >= 2) {
    return parts[1]
  }
  return ''
}

const STATE_MAP: Record<string, string> = {
  TX: 'Texas', GA: 'Georgia', FL: 'Florida', CA: 'California', NY: 'New York',
}

function expandState(city: string): string {
  // "Houston, TX" -> "Houston, Texas"
  return city.replace(/,\s*([A-Z]{2})(\s+\d+)?$/, (_, st) => `, ${STATE_MAP[st] || st}`)
}

// ── Flyer HTML builder ────────────────────────────────────────────────────────
interface FlyerData {
  flyerType: string
  photoUrl: string | null
  city: string
  bedrooms: number | null
  bathrooms: number | null
  garage: number | null
  sqft: number | null
  agentName: string
  agentEmail: string
  divisionLine: string
  logoB64: string
}

function buildFlyerHTML(d: FlyerData): string {
  const label = FLYER_LABELS[d.flyerType] || FLYER_LABELS.just_listed
  const isUnderContract = d.flyerType === 'under_contract'

  const stats: Array<{ num: string; label: string }> = []
  if (d.bedrooms) stats.push({ num: String(d.bedrooms), label: 'Bedrooms' })
  if (d.bathrooms) stats.push({ num: String(d.bathrooms), label: 'Bathrooms' })
  if (d.garage) stats.push({ num: String(d.garage), label: 'Car Garage' })
  if (d.sqft) stats.push({ num: formatNumber(d.sqft), label: 'Sq. Ft.' })

  const statsHtml = stats.length > 0
    ? `<div class="stats-box">${stats.map(s =>
        `<div class="stat-item"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`
      ).join('')}</div>`
    : ''

  const photoHtml = d.photoUrl
    ? `<img class="photo" src="${d.photoUrl}" crossorigin="anonymous" />`
    : `<div class="photo-placeholder">PROPERTY PHOTO</div>`

  const headlineHtml = isUnderContract
    ? `<div class="headline">
         <div class="just-box"><span class="just-text">Under</span></div>
         <span class="type-text">Contract</span>
       </div>`
    : `<div class="headline">
         <div class="just-box"><span class="just-text">${label.just}</span></div>
         <span class="type-text">${label.type}</span>
       </div>`

  return `
    <style>
      ${FLYER_FONT_CSS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .flyer { width: 1080px; height: 1350px; background: #fff; overflow: hidden; position: relative; font-size: 0; }
      .top-zone { height: 260px; padding: 52px 52px 0 52px; position: relative; }
      .logo { position: absolute; top: 34px; right: 52px; height: 180px; width: auto; display: block; }
      .headline { display: flex; align-items: center; gap: 14px; padding-top: 8px; }
      .just-box { background: #000; padding: 10px 20px 12px 20px; display: inline-block; }
      .just-text { font-family: "TheSeasons", serif; font-style: normal; font-size: 82px; color: #fff; line-height: 1; display: block; }
      .type-text { font-family: "TheSeasons", serif; font-style: normal; font-size: 82px; color: #000; line-height: 1; }
      .city { font-family: "Aileron", sans-serif; font-weight: 400; font-size: 26px; color: #000; letter-spacing: 0.2em; text-transform: uppercase; line-height: 1; margin-top: 12px; }
      .photo-zone { height: 910px; position: relative; overflow: hidden; }
      .photo { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
      .photo-placeholder { width: 100%; height: 100%; background: #d8d5cd; display: flex; align-items: center; justify-content: center; color: #b0ada6; font-family: "Aileron", sans-serif; font-size: 20px; letter-spacing: 0.18em; text-transform: uppercase; }
      .stats-box { position: absolute; bottom: 36px; left: 130px; right: 130px; min-height: 150px; padding: 16px 20px; background: #fff; border: 2px solid #111; display: flex; align-items: stretch; }
      .stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; position: relative; padding: 4px 0; }
      .stat-item:not(:last-child)::after { content: ''; position: absolute; right: 0; top: 14%; height: 72%; width: 2px; background: #111; }
      .stat-num { font-family: "TheSeasons", serif; font-style: normal; font-size: 48px; color: #000; line-height: 1; }
      .stat-label { font-family: "Aileron", sans-serif; font-weight: 400; font-size: 18px; color: #222; letter-spacing: 0.14em; text-transform: uppercase; line-height: 1; }
      .bottom-zone { height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 0 52px; }
      .agent-name { font-family: "TheSeasons", serif; font-style: normal; font-size: 52px; color: #000; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.05; text-align: center; }
      .agent-email { font-family: "Aileron", sans-serif; font-weight: 400; font-size: 23px; color: #000; letter-spacing: 0.07em; text-decoration: underline; text-underline-offset: 4px; text-align: center; line-height: 1; }
      .division { font-family: "Aileron", sans-serif; font-weight: 400; font-size: 18px; color: #555; letter-spacing: 0.16em; text-transform: uppercase; text-align: center; line-height: 1; margin-top: 2px; }
    </style>
    <div class="flyer" id="flyer">
      <div class="top-zone">
        ${d.logoB64 ? `<img class="logo" src="data:image/png;base64,${d.logoB64}" />` : ''}
        ${headlineHtml}
        ${d.city ? `<div class="city">${d.city}</div>` : ''}
      </div>
      <div class="photo-zone">
        ${photoHtml}
        ${statsHtml}
      </div>
      <div class="bottom-zone">
        <div class="agent-name">${d.agentName}</div>
        <div class="agent-email">${d.agentEmail}</div>
        ${d.divisionLine ? `<div class="division">${d.divisionLine}</div>` : ''}
      </div>
    </div>`
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FlyerPage() {
  const router = useRouter()
  const params = useParams()
  const transactionId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flyer, setFlyer] = useState<any>(null)
  const [transaction, setTransaction] = useState<any>(null)
  const [agent, setAgent] = useState<any>(null)
  const [logoB64, setLogoB64] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const flyerContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Admin-only edit panel
  const { hasPermission } = useAuth()
  const isAdmin = hasPermission('can_view_all_transactions')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [editFields, setEditFields] = useState({
    flyer_type: '', city: '', flyer_division: '',
    bedrooms: '', bathrooms: '', garage: '', sqft: '',
  })

  // Load logo as base64 for embedding in canvas.
  // Uses a flyer-specific portrait logo so the shared /logo.png used elsewhere
  // (header, sidebar, PM portals, PDFs) is not affected.
  useEffect(() => {
    fetch('/logo-flyer.png')
      .then(r => r.arrayBuffer())
      .then(buf => {
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        setLogoB64(btoa(binary))
      })
      .catch(() => {})
  }, [])

  // Preload the embedded flyer fonts so the on-screen preview renders in
  // TheSeasons rather than a fallback serif on first paint.
  useEffect(() => {
    ensureFlyerFontsLoaded().catch(() => {})
  }, [])

  // Load flyer data
  useEffect(() => {
    if (!transactionId) return
    fetch(`/api/agent/flyer/${transactionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setFlyer(data.flyer)
        setTransaction(data.transaction)
        setAgent(data.agent)
        setPhotoUrl(data.flyer?.photo_url || null)
        if (data.flyer) {
          setEditFields({
            flyer_type: data.flyer.flyer_type || '',
            city: data.flyer.city || '',
            flyer_division: data.flyer.flyer_division || '',
            bedrooms: data.flyer.bedrooms != null ? String(data.flyer.bedrooms) : '',
            bathrooms: data.flyer.bathrooms != null ? String(data.flyer.bathrooms) : '',
            garage: data.flyer.garage != null ? String(data.flyer.garage) : '',
            sqft: data.flyer.sqft != null ? String(data.flyer.sqft) : '',
          })
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [transactionId])

  // Derived flyer data
  const flyerType = flyer?.flyer_type || 'just_sold'
  const cityRaw = flyer?.city || parseCityFromAddress(transaction?.property_address || '')
  const city = expandState(cityRaw)
  const divisionLine = flyer?.flyer_division || agent?.office || ''
  const agentName = agent?.name || ''
  const agentEmail = agent?.email || ''

  const flyerData: FlyerData = useMemo(() => ({
    flyerType,
    photoUrl,
    city,
    bedrooms: flyer?.bedrooms ?? null,
    bathrooms: flyer?.bathrooms ?? null,
    garage: flyer?.garage ?? null,
    sqft: flyer?.sqft ?? null,
    agentName,
    agentEmail,
    divisionLine,
    logoB64,
  }), [flyerType, photoUrl, city, flyer?.bedrooms, flyer?.bathrooms, flyer?.garage, flyer?.sqft, agentName, agentEmail, divisionLine, logoB64])

  // Inject flyer HTML into container whenever data changes
  useEffect(() => {
    if (!flyerContainerRef.current || !agent) return
    flyerContainerRef.current.innerHTML = buildFlyerHTML(flyerData)
  }, [flyerData, agent])

  // Scale flyer to viewport
  const scaleWrapRef = useRef<HTMLDivElement>(null)
  const scaleFlyer = useCallback(() => {
    if (!scaleWrapRef.current) return
    // Measure the actual available width of the wrapper's parent (the card column),
    // not the window, so the preview never overflows its container.
    const parent = scaleWrapRef.current.parentElement
    const available = parent ? parent.clientWidth : Math.min(window.innerWidth - 32, 600)
    const maxW = Math.min(available, 600)
    const scale = maxW / 1080
    scaleWrapRef.current.style.transform = `scale(${scale})`
    scaleWrapRef.current.style.transformOrigin = 'top left'
    scaleWrapRef.current.style.marginBottom = `${1350 * scale - 1350}px`
  }, [])

  useEffect(() => {
    scaleFlyer()
    window.addEventListener('resize', scaleFlyer)
    return () => window.removeEventListener('resize', scaleFlyer)
  }, [scaleFlyer])

  // Photo upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (flyer?.id) fd.append('flyer_id', flyer.id)
      const res = await fetch(`/api/agent/flyer/${transactionId}`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed')
      setPhotoUrl(data.photo_url)
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Download via html2canvas
  const handleDownload = async () => {
    const flyerEl = flyerContainerRef.current?.querySelector('#flyer') as HTMLElement | null
    if (!flyerEl) return
    setDownloading(true)

    try {
      // Dynamically load html2canvas-pro (a maintained fork of html2canvas).
      // The original html2canvas 1.4.1 has an unfixed bug that vertically
      // misaligns text when it sits inside an element with a background color,
      // which distorted the white "Just" inside the black headline box on
      // export (but not in the browser preview). html2canvas-pro includes the
      // text-baseline fix. Its API and global name are identical to the
      // original, so the call below is unchanged.
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@2.2.3/dist/html2canvas-pro.min.js'
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load html2canvas-pro'))
        document.head.appendChild(script)
      })

      const scaleWrap = scaleWrapRef.current!
      const prevTransform = scaleWrap.style.transform
      const prevOrigin = scaleWrap.style.transformOrigin
      const prevMarginBottom = scaleWrap.style.marginBottom
      // html2canvas 1.4.1 miscomputes child element positions when an ancestor
      // has ANY CSS transform, including scale(1). Removing the transform
      // entirely (not setting scale(1)) renders the flyer at full size with no
      // transformed ancestor, which is what html2canvas needs to place the
      // headline text correctly inside its box on export.
      scaleWrap.style.transform = 'none'
      scaleWrap.style.transformOrigin = 'top left'
      scaleWrap.style.marginBottom = '0px'

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if ('fonts' in document) {
        try {
          await ensureFlyerFontsLoaded()
        } catch {}
        await document.fonts.ready
      }

      const canvas = await (window as any).html2canvas(flyerEl, {
        width: 1080,
        height: 1350,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      scaleWrap.style.transform = prevTransform
      scaleWrap.style.transformOrigin = prevOrigin
      scaleWrap.style.marginBottom = prevMarginBottom

      const link = document.createElement('a')
      const label = FLYER_LABELS[flyerType] || FLYER_LABELS.just_sold
      link.download = `${label.just.toLowerCase()}-${label.type.toLowerCase()}-flyer.png`
      link.href = canvas.toDataURL('image/png')
      link.click()

      // Record download
      await fetch(`/api/agent/flyer/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flyer_id: flyer?.id || null }),
      })
    } catch (err: any) {
      setError('Download failed: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  const saveEdits = async () => {
    setSaving(true)
    setError('')
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/agent/flyer/${transactionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flyer_id: flyer?.id || null, ...editFields }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Save failed')
        return
      }
      // Update local flyer so the preview reflects the edits immediately
      setFlyer((prev: any) => ({
        ...prev,
        flyer_type: editFields.flyer_type,
        city: editFields.city.trim() || null,
        flyer_division: editFields.flyer_division.trim() || null,
        bedrooms: editFields.bedrooms === '' ? null : Number(editFields.bedrooms),
        bathrooms: editFields.bathrooms === '' ? null : Number(editFields.bathrooms),
        garage: editFields.garage === '' ? null : Number(editFields.garage),
        sqft: editFields.sqft === '' ? null : Number(editFields.sqft),
      }))
      setSaveSuccess(true)
      setEditing(false)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: any) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-luxury-gray-3" />
      </div>
    )
  }

  if (error && !flyer && !transaction) {
    return (
      <div>
        <h1 className="page-title mb-6">FLYER</h1>
        <div className="container-card">
          <div className="flex items-center gap-2 p-4 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
          <button onClick={() => router.back()} className="btn btn-secondary text-xs mt-4">
            <ArrowLeft size={13} /> Back
          </button>
        </div>
      </div>
    )
  }

  const labelInfo = FLYER_LABELS[flyerType] || FLYER_LABELS.just_sold
  const flyerTitle = flyerType === 'under_contract'
    ? 'Under Contract'
    : `${labelInfo.just} ${labelInfo.type}`

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">{flyerTitle.toUpperCase()} FLYER</h1>
      </div>

      {transaction && (
        <p className="text-xs text-luxury-gray-3 mb-4">{transaction.property_address}</p>
      )}

      <div className="container-card space-y-6">

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">

          {/* Photo upload */}
          <div className="flex-1">
            <p className="text-xs text-luxury-gray-3 mb-2">
              {photoUrl ? 'Replace property photo' : 'Upload property photo to complete your flyer'}
            </p>
            <label className={`btn ${photoUrl ? 'btn-secondary' : 'btn-primary'} text-xs flex items-center gap-1.5 cursor-pointer w-fit`}>
              {uploading ? (
                <><Loader2 size={13} className="animate-spin" /> Uploading...</>
              ) : uploadSuccess ? (
                <><CheckCircle2 size={13} className="text-green-600" /> Uploaded!</>
              ) : (
                <><Upload size={13} /> {photoUrl ? 'Replace Photo' : 'Upload Photo'}</>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </div>

          {/* Download */}
          <div className="flex-shrink-0">
            <p className="text-xs text-luxury-gray-3 mb-2">
              {photoUrl ? 'Ready to download' : 'Add a photo for best results'}
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {downloading ? (
                <><Loader2 size={13} className="animate-spin" /> Generating...</>
              ) : (
                <><Download size={13} /> Download Flyer (1080x1350)</>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle size={14} className="flex-shrink-0" />{error}
          </div>
        )}

        {!photoUrl && (
          <div className="flex items-center gap-2 p-3 bg-luxury-accent/5 border border-luxury-accent/20 rounded text-xs text-luxury-gray-2">
            <AlertCircle size={13} className="text-luxury-accent flex-shrink-0" />
            You can download without a photo, but the flyer will show a placeholder. Upload a photo for a complete flyer.
          </div>
        )}

        {/* Admin-only edit panel */}
        {isAdmin && (
          <div className="border border-luxury-gray-5 rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-luxury-gray-2 flex items-center gap-1.5">
                <Pencil size={13} className="text-luxury-accent" /> Admin: Edit Flyer Fields
              </p>
              {!editing && (
                <button onClick={() => setEditing(true)} className="btn btn-secondary text-xs">
                  Edit
                </button>
              )}
              {saveSuccess && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={13} /> Saved
                </span>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Flyer Type</label>
                    <select
                      className="select-luxury"
                      value={editFields.flyer_type}
                      onChange={e => setEditFields(f => ({ ...f, flyer_type: e.target.value }))}
                    >
                      <option value="just_listed">Just Listed</option>
                      <option value="just_sold">Just Sold</option>
                      <option value="just_leased">Just Leased</option>
                      <option value="under_contract">Under Contract</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">City</label>
                    <input
                      className="input-luxury"
                      value={editFields.city}
                      onChange={e => setEditFields(f => ({ ...f, city: e.target.value }))}
                      placeholder="Iowa Colony, TX"
                    />
                  </div>
                  <div>
                    <label className="field-label">Division</label>
                    <input
                      className="input-luxury"
                      value={editFields.flyer_division}
                      onChange={e => setEditFields(f => ({ ...f, flyer_division: e.target.value }))}
                      placeholder="Houston"
                    />
                  </div>
                  <div>
                    <label className="field-label">Bedrooms</label>
                    <input
                      className="input-luxury"
                      type="number"
                      min="0"
                      value={editFields.bedrooms}
                      onChange={e => setEditFields(f => ({ ...f, bedrooms: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Bathrooms</label>
                    <input
                      className="input-luxury"
                      type="number"
                      min="0"
                      step="0.5"
                      value={editFields.bathrooms}
                      onChange={e => setEditFields(f => ({ ...f, bathrooms: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Car Garage</label>
                    <input
                      className="input-luxury"
                      type="number"
                      min="0"
                      value={editFields.garage}
                      onChange={e => setEditFields(f => ({ ...f, garage: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Sq. Ft.</label>
                    <input
                      className="input-luxury"
                      type="number"
                      min="0"
                      value={editFields.sqft}
                      onChange={e => setEditFields(f => ({ ...f, sqft: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdits}
                    disabled={saving}
                    className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {saving ? (
                      <><Loader2 size={13} className="animate-spin" /> Saving...</>
                    ) : (
                      <><Save size={13} /> Save Changes</>
                    )}
                  </button>
                  <button onClick={() => setEditing(false)} className="btn btn-secondary text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-luxury-gray-3">
                Edit the flyer type, city, division, and property stats. Changes update the preview and the saved flyer.
              </p>
            )}
          </div>
        )}

        {/* Flyer preview */}
        <div className="overflow-hidden" style={{ minHeight: 200 }}>
          <div ref={scaleWrapRef} style={{ width: 1080 }}>
            <div ref={flyerContainerRef} style={{ width: 1080, height: 1350 }} />
          </div>
        </div>

        <p className="text-xs text-luxury-gray-3">
          Tip: For the best quality flyer, upload a high-resolution landscape photo of the property. Minimum 1080px wide.
        </p>
      </div>
    </div>
  )
}
