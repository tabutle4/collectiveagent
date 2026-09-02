import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import type { CdaModel } from './cdaData'
import { titleContactEmail } from './cdaData'

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

// Make a string safe for the standard PDF fonts.
//
// pdf-lib encodes StandardFonts as WinAnsi, and BOTH drawText and
// widthOfTextAtSize throw on a code point WinAnsi cannot represent. Measured
// against pdf-lib directly rather than assumed: the rejected set inside Latin-1
// is 0x00-0x1F and 0x7F-0x9F, 65 code points in total.
//
// The old version stripped only `[^\x00-\xFF]`, which is everything ABOVE
// Latin-1. Every control character sat below that line and passed straight
// through. It never mattered while every string reaching here was one this file
// built, and it started mattering the moment a CDA note became a box a person
// types into: a tab (0x09) pasted from Excel, Word or Outlook reached
// widthOfTextAtSize and threw, buildCdaPdf threw with it, and send-to-title
// returned a 500 so the CDA never left. The web CDA and the approval screen
// render a tab happily, so it looked correct right up to the point of sending.
//
// Tabs become spaces rather than vanishing, because a tab is whitespace and
// someone typing one meant a gap. Newlines are stripped here too: this function
// is for a single drawn line, and the one caller with multi-line text splits on
// newlines BEFORE calling this, so nothing depends on them surviving.
//
// The final strip used to be `[^\x00-\xFF]` - everything above Latin-1 - which
// was far too wide. WinAnsi is CP1252, not Latin-1, and it carries 27 extra code
// points at bytes 0x80-0x9F. Every one of those was being dropped. Measured
// against pdf-lib 1.17.1 directly: it accepts all 27, so a bullet, a euro sign,
// a trademark and an oe ligature all render. Dropping them meant a bullet list
// pasted out of Word showed its bullets on the web CDA and the approval screen
// and then lost them on the PDF title receives - the same shape of surprise the
// tab bug had, without the crash. They are kept now, and the handful of
// characters WinAnsi genuinely cannot carry are mapped to something readable
// rather than deleted.
function enc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/—/g, '--')
    .replace(/…/g, '...')
    .replace(/\t/g, ' ')
    // Characters WinAnsi cannot carry but people paste constantly. Mapped to a
    // readable ASCII stand-in, because silently deleting them changes meaning:
    // "Fee EUR500" is wrong but legible, "Fee 500" reads as dollars.
    .replace(/[\u2010\u2011\u2012]/g, '-')
    .replace(/\u2015/g, '--')
    .replace(/\u2032/g, "'")
    .replace(/\u2033/g, '"')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2044/g, '/')
    .replace(/\u2116/g, 'No.')
    .replace(/\u2120/g, '(SM)')
    // A non-breaking space renders, but wrap() splits on a plain space, so an
    // nbsp-joined phrase would never break and could run off the page.
    .replace(/\u00A0/g, ' ')
    // Unicode line and paragraph separators: this function draws one line.
    .replace(/[\u2028\u2029]/g, ' ')
    // Zero-width and BOM: invisible, and they widen the measured string.
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Every remaining control character, C0 and C1, newlines included.
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Anything still outside WinAnsi. Printable Latin-1, plus the 27 CP1252
    // code points at bytes 0x80-0x9F that pdf-lib accepts. This class overlaps
    // the control strip above on purpose: that one documents the tab crash, this
    // one is the encoder's actual boundary.
    .replace(
      /[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g,
      ''
    )
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
  for (const a of model.agentRoster || []) {
    row(a.role, a.license_number ? `${a.name}  ·  License ${a.license_number}` : a.name)
  }
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
  for (const p of model.agentPayees || []) {
    payeeRow(`${model.listingSide > 0 ? 'Listing' : 'Buying'} agent commission`, p.name, money(p.amount))
  }
  for (const p of model.externalPayees || []) {
    payeeRow('External payout', p.name, money(p.amount))
  }
  for (const rb of model.rebatePayees || []) {
    if (rb.amount <= 0) continue
    const rebatePayee = rb.side === 'buyer'
      ? (model.buyerContact?.name || '--')
      : rb.side === 'seller'
        ? (model.sellerContact?.name || '--')
        : (model.buyerContact?.name || model.sellerContact?.name || '--')
    payeeRow(rb.label, rebatePayee, money(rb.amount))
  }
  gap(6)

  // ── Notes ───────────────────────────────────────────────────────────────────
  // Placed between the payees and the title block, matching the web CDA exactly,
  // so the copy title receives reads the same as the one the office reviews.
  // The PDF had no notes block at all before this: the model carried the field
  // and the web CDA rendered it, but the emailed document silently dropped it,
  // which would have meant a note the office could see and title could not.
  //
  // Wrapped by hand and paginated through ensureSpace, because a long note is
  // the one field on this document with no length ceiling.
  if (model.notes) {
    ensureSpace(28)
    sectionTitle('Notes')
    // Split the RAW note first, then encode each line. enc() strips newlines,
    // so encoding before the split would collapse a multi-line note into one
    // paragraph. Encoding before WRAPPING still matters and still happens
    // below: wrap() measures with widthOfTextAtSize, which throws on anything
    // WinAnsi cannot encode, so measuring and drawing have to see the same
    // characters.
    for (const rawLine of String(model.notes).split(/\r?\n/)) {
      // Encode once, then decide. The blank test used to run on the RAW line, so
      // a line holding only characters enc() strips passed the test, came back
      // empty, wrapped to nothing, and disappeared instead of leaving the blank
      // line the typist put there.
      const encoded = enc(rawLine)
      // A blank line in the typed note stays a blank line on the page.
      if (!encoded.trim()) { ensureSpace(12); y -= 12; continue }
      for (const line of wrap(encoded, font, 10, CONTENT_W)) {
        ensureSpace(14)
        text(line, MARGIN, 10, font, INK)
        y -= 14
      }
    }
    gap(6)
  }

  // ── Title Company ───────────────────────────────────────────────────────────
  // Same block the web CDA renders, so the copy title receives matches the one
  // the office reviews. Company and Contact come from the shared resolver, so
  // a business name can never land on the Contact line.
  // Gated on what actually renders, not on the title_company row, so a deal
  // carrying only a title_officer contact still gets a block.
  if (model.titleParty.companyName || model.titleParty.repName) {
    sectionTitle('Title Company')
    row('Company', model.titleParty.companyName || '--')
    if (model.titleParty.repName) row('Contact', model.titleParty.repName)
    const titleEmail = titleContactEmail(model.titleContact)
    if (titleEmail) row('Email', titleEmail)
    gap(6)
  }

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

/**
 * Word-wrap a string to fit a max width at a given font size.
 *
 * Splits on spaces, and falls back to breaking mid-token when a single token is
 * wider than the line. Without that fallback a long unbroken string - a wire
 * reference, a URL, a pasted account number - is never broken, draws straight
 * past the right margin and is silently cut off. It does not throw; the text is
 * simply not on the page. That was tolerable while every caller passed strings
 * this file built, and stopped being tolerable once a person could type one
 * onto a document going to a title company.
 */
function wrap(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = []
  let cur = ''

  // Break one over-long token at the last character that still fits.
  const pushBroken = (token: string) => {
    let chunk = ''
    for (const ch of token) {
      if (chunk && f.widthOfTextAtSize(chunk + ch, size) > maxW) {
        lines.push(chunk)
        chunk = ch
      } else {
        chunk += ch
      }
    }
    cur = chunk
  }

  for (const w of s.split(' ')) {
    const test = cur ? `${cur} ${w}` : w
    if (f.widthOfTextAtSize(test, size) <= maxW) {
      cur = test
      continue
    }
    if (cur) {
      lines.push(cur)
      cur = ''
    }
    // The token alone still does not fit, so break it up.
    if (f.widthOfTextAtSize(w, size) > maxW) pushBroken(w)
    else cur = w
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
