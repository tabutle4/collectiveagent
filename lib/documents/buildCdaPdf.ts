import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import type { CdaModel } from './cdaData'

/**
 * Renders a Commission Disbursement Authorization as a PDF from the shared
 * CdaModel (lib/documents/cdaData.ts) — the same computed figures the web CDA
 * displays, so the emailed PDF and the on-screen document can never disagree.
 * Built with pdf-lib (no headless browser) so it runs cleanly on Vercel.
 */

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2

const GOLD = rgb(0xC5 / 255, 0xA2 / 255, 0x78 / 255)
const INK = rgb(0.2, 0.2, 0.2)
const MUTED = rgb(0.45, 0.45, 0.45)
const LINE = rgb(0.85, 0.85, 0.85)

// pdf-lib's standard fonts use WinAnsi (CP1252); a character outside it makes
// drawText throw. Normalize common smart punctuation to ASCII and drop anything
// still outside Latin-1 so an odd character in a name/address never crashes a send.
function enc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/—/g, '--')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '')
}

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '--'
  const ds = d.includes('T') ? d : `${d}T12:00:00`
  const dt = new Date(ds)
  if (isNaN(dt.getTime())) return '--'
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export async function buildCdaPdf(model: CdaModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  const text = (
    s: string,
    x: number,
    size: number,
    f: PDFFont = font,
    color = INK
  ) => {
    page.drawText(enc(s), { x, y, size, font: f, color })
  }

  // Right-aligned text
  const textR = (s: string, xRight: number, size: number, f: PDFFont = font, color = INK) => {
    const w = f.widthOfTextAtSize(enc(s), size)
    page.drawText(enc(s), { x: xRight - w, y, size, font: f, color })
  }

  const hr = (color = LINE, thickness = 0.5) => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness,
      color,
    })
  }

  // A labeled row: left label, right value, on the same baseline.
  const row = (label: string, value: string, opts: { bold?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 10
    ensureSpace(size + 8)
    text(label, MARGIN, size, font, MUTED)
    textR(value, PAGE_W - MARGIN, size, opts.bold ? bold : font, INK)
    y -= size + 6
  }

  const gap = (n = 10) => { y -= n }
  const sectionTitle = (s: string) => {
    ensureSpace(24)
    text(s.toUpperCase(), MARGIN, 9, bold, MUTED)
    y -= 14
    hr()
    y -= 8
  }

  // ── Header ────────────────────────────────────────────────────────────────
  text(model.agencyName, MARGIN, 13, bold, INK)
  y -= 18
  text('COMMISSION DISBURSEMENT AUTHORIZATION', MARGIN, 12, font, INK)
  y -= 10
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.5,
    color: GOLD,
  })
  y -= 18

  // ── Brokerage + Property ───────────────────────────────────────────────────
  const colRightX = MARGIN + CONTENT_W / 2 + 12
  const startY = y
  // Left column: Brokerage
  text('BROKERAGE', MARGIN, 8, bold, MUTED); y -= 12
  text(model.agencyName, MARGIN, 10, bold, INK); y -= 12
  for (const l of model.brokerageLines) { text(l, MARGIN, 9, font, MUTED); y -= 11 }
  if (model.settings?.brokerage_main_email) { text(String(model.settings.brokerage_main_email), MARGIN, 9, font, MUTED); y -= 11 }
  const leftEndY = y

  // Right column: Property (reset y to startY, draw at colRightX)
  y = startY
  const textAtX = (s: string, x: number, size: number, f: PDFFont = font, color = INK) => {
    page.drawText(enc(s), { x, y, size, font: f, color })
  }
  textAtX('PROPERTY', colRightX, 8, bold, MUTED); y -= 12
  textAtX(model.propertyAddr, colRightX, 10, bold, INK); y -= 12
  textAtX(`Closing: ${fmtDate(model.txn.closing_date || model.txn.closed_date)}`, colRightX, 9, font, MUTED); y -= 11
  textAtX(`${model.priceLabel}: ${money(model.priceForDisplay)}`, colRightX, 9, font, MUTED); y -= 11
  textAtX(`Total Gross Commission: ${money(model.totalGrossCommission)}`, colRightX, 9, bold, INK); y -= 11
  if (model.listingSide > 0) {
    textAtX(`Gross Commission: ${money(model.listingSide + model.buyingSide)}${model.salesPricePct ? ' (' + model.salesPricePct + ')' : ''}`, colRightX, 9, font, MUTED); y -= 11
  }
  if (model.btsaTotal > 0) { textAtX(`BTSA: ${money(model.btsaTotal)}`, colRightX, 9, font, MUTED); y -= 11 }
  for (const r of model.extraRows) { textAtX(`Additional Income (${r.label}): ${money(r.amount)}`, colRightX, 9, font, MUTED); y -= 11 }
  const rightEndY = y

  // Continue below the taller of the two columns
  y = Math.min(leftEndY, rightEndY) - 16

  // ── Parties ────────────────────────────────────────────────────────────────
  if (model.buyerContact || model.sellerContact) {
    sectionTitle('Parties')
    if (model.buyerContact) row('Buyer / Tenant', model.buyerContact.name || '--')
    if (model.sellerContact) row('Seller / Landlord', model.sellerContact.name || '--')
    gap(6)
  }

  // ── Agent Information ───────────────────────────────────────────────────────
  sectionTitle('Agent Information')
  row('Agent', model.agentName)
  row('Role', model.role)
  if (model.agent?.license_number) row('License', String(model.agent.license_number))
  gap(6)

  // ── Payees ──────────────────────────────────────────────────────────────────
  sectionTitle('Payees')
  ensureSpace(16)
  text('Description', MARGIN, 8, bold, MUTED)
  textAtX('Payee', MARGIN + CONTENT_W * 0.42, 8, bold, MUTED)
  textR('Amount', PAGE_W - MARGIN, 8, bold, MUTED)
  y -= 12
  hr()
  y -= 10

  const payeeRow = (desc: string, payee: string, amount: string) => {
    ensureSpace(16)
    text(desc, MARGIN, 10, font, INK)
    page.drawText(enc(payee), { x: MARGIN + CONTENT_W * 0.42, y, size: 10, font, color: INK })
    textR(amount, PAGE_W - MARGIN, 10, font, INK)
    y -= 16
  }
  if (model.officeNet > 0) payeeRow(model.officeLineLabel, model.agencyName, money(model.officeNet))
  if (model.agentNetPay > 0) payeeRow(`${model.listingSide > 0 ? 'Listing' : 'Buying'} agent commission`, model.agentName, money(model.agentNetPay))
  for (const p of model.externalPayees || []) {
    payeeRow('External payout', p.name, money(p.amount))
  }
  if (model.rebateAmount > 0 && model.rebateLabel) {
    const rebatePayee = model.rebateLabel.includes('Buyer')
      ? (model.buyerContact?.name || '--')
      : (model.sellerContact?.name || '--')
    payeeRow(model.rebateLabel, rebatePayee, `(${money(model.rebateAmount)})`)
  }
  gap(6)

  // ── Broker Approval (signature) ─────────────────────────────────────────────
  if (model.txn.broker_approved_at) {
    ensureSpace(80)
    sectionTitle('Broker Approval')
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    try {
      const res = await fetch(`${base}/courtney-signature.png`)
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        const png = await pdf.embedPng(bytes)
        const dims = png.scale(44 / png.height)
        ensureSpace(dims.height + 16)
        page.drawImage(png, { x: MARGIN, y: y - dims.height, width: dims.width, height: dims.height })
        y -= dims.height + 4
      }
    } catch {
      // Signature image unavailable — fall through to the text line only.
    }
    text(`Courtney Okanlomo, Broker · Approved ${fmtDate(model.txn.broker_approved_at)}`, MARGIN, 9, font, MUTED)
    y -= 16
  }

  // ── Payment instructions ────────────────────────────────────────────────────
  ensureSpace(30)
  gap(4)
  const payMsg = `Payment instructions: Please see provided commission wiring instructions. Make check payable to ${model.agencyName} if wiring is not available.`
  for (const line of wrap(payMsg, font, 9, CONTENT_W)) {
    ensureSpace(12)
    text(line, MARGIN, 9, font, INK)
    y -= 12
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  gap(10)
  ensureSpace(24)
  hr()
  y -= 12
  const footer = `${model.agencyName} · Commission Disbursement Authorization generated ${model.generatedDate}`
  text(footer, MARGIN, 8, font, MUTED)

  return await pdf.save()
}

/** Word-wrap a string to fit a max width at a given font size. */
function wrap(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const words = s.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (f.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Build the emailed filename, matching Brokermint: "<address>_<YYYY-MM-DD>_CDA.pdf". */
export function cdaPdfFilename(propertyAddr: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const addr = (propertyAddr || 'CDA').replace(/[\\/:*?"<>|]/g, '').trim()
  return `${addr}_${y}-${m}-${d}_CDA.pdf`
}
