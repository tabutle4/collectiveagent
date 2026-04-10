import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'

const MARGIN = 60
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FONT_SIZE_BODY = 10
const FONT_SIZE_HEADING = 11
const FONT_SIZE_TITLE = 14
const LINE_HEIGHT_BODY = 15
const LINE_HEIGHT_HEADING = 18
const PARAGRAPH_GAP = 10

interface PageContext {
  page: PDFPage
  y: number
}

export interface AuditTrailEntry {
  signerType: 'agent' | 'broker'
  signerName: string
  signedAt: string
  ipAddress?: string
  userAgent?: string
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }

    const words = paragraph.split(' ')
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const width = font.widthOfTextAtSize(testLine, fontSize)

      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) lines.push(currentLine)
  }

  return lines
}

function addPageIfNeeded(
  doc: PDFDocument,
  ctx: PageContext,
  neededHeight: number,
  font: PDFFont,
  fontSize: number
): void {
  if (ctx.y - neededHeight < MARGIN) {
    const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    ctx.page = newPage
    ctx.y = PAGE_HEIGHT - MARGIN
  }
}

function drawText(
  ctx: PageContext,
  doc: PDFDocument,
  text: string,
  font: PDFFont,
  fontSize: number,
  lineHeight: number,
  bold: boolean = false
): void {
  const lines = wrapText(text, font, fontSize, CONTENT_WIDTH)

  for (const line of lines) {
    addPageIfNeeded(doc, ctx, lineHeight, font, fontSize)

    if (line !== '') {
      ctx.page.drawText(line, {
        x: MARGIN,
        y: ctx.y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    }
    ctx.y -= lineHeight
  }
}

function drawSignatureLine(
  ctx: PageContext,
  doc: PDFDocument,
  label: string,
  value: string,
  regularFont: PDFFont,
  boldFont: PDFFont,
  signatureImageBytes?: Uint8Array
): void {
  addPageIfNeeded(doc, ctx, 60, regularFont, FONT_SIZE_BODY)

  // Label
  ctx.page.drawText(label, {
    x: MARGIN,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: boldFont,
    color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_BODY + 4

  // Signature image or line
  if (signatureImageBytes) {
    try {
      // Embed signature image
    } catch {
      // fallback to line
    }
  }

  // Signature line
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + 250, y: ctx.y },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  })
  ctx.y -= 4

  // Value below line
  ctx.page.drawText(value, {
    x: MARGIN,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: regularFont,
    color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_BODY + 4
}

function formatDateTimeCT(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' CT'
}

function drawAuditTrailPage(
  pdfDoc: PDFDocument,
  ctx: PageContext,
  title: string,
  agentName: string,
  auditTrail: AuditTrailEntry[],
  regularFont: PDFFont,
  boldFont: PDFFont
): void {
  // Start a new page for audit trail
  const auditPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.page = auditPage
  ctx.y = PAGE_HEIGHT - MARGIN

  // Title
  ctx.page.drawText('DOCUMENT SIGNING AUDIT TRAIL', {
    x: MARGIN + (CONTENT_WIDTH - boldFont.widthOfTextAtSize('DOCUMENT SIGNING AUDIT TRAIL', FONT_SIZE_TITLE)) / 2,
    y: ctx.y,
    size: FONT_SIZE_TITLE,
    font: boldFont,
    color: rgb(0, 0, 0),
  })
  ctx.y -= FONT_SIZE_TITLE + 20

  // Document info
  ctx.page.drawText(`Document: ${title}`, {
    x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: boldFont, color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_BODY + 4

  ctx.page.drawText(`Agent: ${agentName}`, {
    x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: regularFont, color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_BODY + 4

  ctx.page.drawText(`Generated: ${formatDateTimeCT(new Date().toISOString())}`, {
    x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: regularFont, color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_BODY + 20

  // Divider line
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  ctx.y -= 20

  // Signing events
  ctx.page.drawText('SIGNING EVENTS', {
    x: MARGIN, y: ctx.y, size: FONT_SIZE_HEADING, font: boldFont, color: rgb(0, 0, 0),
  })
  ctx.y -= LINE_HEIGHT_HEADING + 10

  for (const entry of auditTrail) {
    addPageIfNeeded(pdfDoc, ctx, 80, regularFont, FONT_SIZE_BODY)

    // Signer type badge
    const signerLabel = entry.signerType === 'broker' ? 'BROKER' : 'AGENT'
    ctx.page.drawText(signerLabel, {
      x: MARGIN, y: ctx.y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4),
    })
    ctx.y -= LINE_HEIGHT_BODY

    // Signer name
    ctx.page.drawText(entry.signerName, {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: boldFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY

    // Date/time
    ctx.page.drawText(`Signed: ${formatDateTimeCT(entry.signedAt)}`, {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: regularFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY

    // IP Address
    if (entry.ipAddress) {
      ctx.page.drawText(`IP Address: ${entry.ipAddress}`, {
        x: MARGIN, y: ctx.y, size: 9, font: regularFont, color: rgb(0.5, 0.5, 0.5),
      })
      ctx.y -= LINE_HEIGHT_BODY
    }

    // User Agent (truncated)
    if (entry.userAgent) {
      const truncatedUA = entry.userAgent.length > 80 
        ? entry.userAgent.substring(0, 80) + '...' 
        : entry.userAgent
      ctx.page.drawText(`Browser: ${truncatedUA}`, {
        x: MARGIN, y: ctx.y, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5),
      })
      ctx.y -= LINE_HEIGHT_BODY
    }

    ctx.y -= 10 // Gap between entries
  }

  // Footer disclaimer
  ctx.y -= 20
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  })
  ctx.y -= 15

  const disclaimer = 'This audit trail provides a record of all signing events for this document. All times are displayed in Central Time (CT).'
  const disclaimerLines = wrapText(disclaimer, regularFont, 8, CONTENT_WIDTH)
  for (const line of disclaimerLines) {
    ctx.page.drawText(line, {
      x: MARGIN, y: ctx.y, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5),
    })
    ctx.y -= 12
  }
}

export interface DocumentSection {
  heading: string | null
  body: string
}

export interface GeneratePDFOptions {
  title: string
  sections: DocumentSection[]
  agentName: string
  agentSignatureDataUrl?: string // base64 data URL from signature pad
  effectiveDate: string
  brokerSignatureImageBytes?: Uint8Array // PNG bytes for Courtney's signature image
  showAgencySignature?: boolean // default true; set false for TAR-2303 style
  auditTrail?: AuditTrailEntry[] // signing events to include on final page
}

export async function generateAgreementPDF(options: GeneratePDFOptions): Promise<Uint8Array> {
  const { title, sections, agentName, agentSignatureDataUrl, effectiveDate, brokerSignatureImageBytes, showAgencySignature = true, auditTrail } = options

  const pdfDoc = await PDFDocument.create()

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const firstPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const ctx: PageContext = { page: firstPage, y: PAGE_HEIGHT - MARGIN }

  // Title
  const titleLines = wrapText(title, boldFont, FONT_SIZE_TITLE, CONTENT_WIDTH)
  for (const line of titleLines) {
    ctx.page.drawText(line, {
      x: MARGIN + (CONTENT_WIDTH - boldFont.widthOfTextAtSize(line, FONT_SIZE_TITLE)) / 2,
      y: ctx.y,
      size: FONT_SIZE_TITLE,
      font: boldFont,
      color: rgb(0, 0, 0),
    })
    ctx.y -= FONT_SIZE_TITLE + 6
  }
  ctx.y -= PARAGRAPH_GAP

  // Sections
  for (const section of sections) {
    if (section.heading) {
      ctx.y -= PARAGRAPH_GAP
      addPageIfNeeded(pdfDoc, ctx, LINE_HEIGHT_HEADING + PARAGRAPH_GAP, boldFont, FONT_SIZE_HEADING)
      ctx.page.drawText(section.heading, {
        x: MARGIN,
        y: ctx.y,
        size: FONT_SIZE_HEADING,
        font: boldFont,
        color: rgb(0, 0, 0),
      })
      ctx.y -= LINE_HEIGHT_HEADING
    }

    if (section.body) {
      ctx.y -= 4
      drawText(ctx, pdfDoc, section.body, regularFont, FONT_SIZE_BODY, LINE_HEIGHT_BODY)
    }
  }

  // Signature block
  ctx.y -= PARAGRAPH_GAP * 2
  addPageIfNeeded(pdfDoc, ctx, 120, regularFont, FONT_SIZE_BODY)

  // Agency signature (ICA / commission plan only)
  if (showAgencySignature) {
    ctx.page.drawText('AGENCY', {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: boldFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY + 4

    ctx.page.drawText("Agency Representative's Signature:", {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: boldFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY + 4

    if (brokerSignatureImageBytes) {
      try {
        const brokerSigImage = await pdfDoc.embedPng(brokerSignatureImageBytes)
        const MAX_BROKER_HEIGHT = 48
        const brokerScale = Math.min(0.25, MAX_BROKER_HEIGHT / brokerSigImage.height)
        const brokerSigDims = brokerSigImage.scale(brokerScale)
        ctx.page.drawImage(brokerSigImage, {
          x: MARGIN,
          y: ctx.y - brokerSigDims.height,
          width: brokerSigDims.width,
          height: brokerSigDims.height,
        })
        ctx.y -= brokerSigDims.height + 4
      } catch {
        ctx.page.drawLine({
          start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + 250, y: ctx.y },
          thickness: 0.5, color: rgb(0, 0, 0),
        })
        ctx.y -= 8
      }
    } else {
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + 250, y: ctx.y },
        thickness: 0.5, color: rgb(0, 0, 0),
      })
      ctx.y -= 8
    }

    ctx.page.drawText(`Print Name: Courtney Okanlomo`, {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: regularFont, color: rgb(0, 0, 0),
    })
    ctx.page.drawText(`Date: ${effectiveDate}`, {
      x: MARGIN + 300, y: ctx.y, size: FONT_SIZE_BODY, font: regularFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY + PARAGRAPH_GAP * 2

    ctx.page.drawText('SALESPERSON', {
      x: MARGIN, y: ctx.y, size: FONT_SIZE_BODY, font: boldFont, color: rgb(0, 0, 0),
    })
    ctx.y -= LINE_HEIGHT_BODY + 4
  }

  // Embed agent signature image if provided
  if (agentSignatureDataUrl) {
    try {
      const base64Data = agentSignatureDataUrl.replace(/^data:image\/png;base64,/, '')
      const signatureBytes = Buffer.from(base64Data, 'base64')
      const signatureImage = await pdfDoc.embedPng(signatureBytes)
      const MAX_AGENT_HEIGHT = 44
      const agentScale = Math.min(0.3, MAX_AGENT_HEIGHT / signatureImage.height)
      const imgDims = signatureImage.scale(agentScale)

      addPageIfNeeded(pdfDoc, ctx, imgDims.height + 20, regularFont, FONT_SIZE_BODY)

      ctx.page.drawText("Salesperson's Signature:", {
        x: MARGIN,
        y: ctx.y,
        size: FONT_SIZE_BODY,
        font: boldFont,
        color: rgb(0, 0, 0),
      })
      ctx.y -= LINE_HEIGHT_BODY + 4

      ctx.page.drawImage(signatureImage, {
        x: MARGIN,
        y: ctx.y - imgDims.height,
        width: imgDims.width,
        height: imgDims.height,
      })
      ctx.y -= imgDims.height + 8
    } catch {
      // fallback to line
      drawSignatureLine(
        ctx,
        pdfDoc,
        "Salesperson's Signature:",
        '',
        regularFont,
        boldFont
      )
    }
  } else {
    drawSignatureLine(
      ctx,
      pdfDoc,
      "Salesperson's Signature:",
      '',
      regularFont,
      boldFont
    )
  }

  ctx.page.drawText(`Print Name: ${agentName}`, {
    x: MARGIN,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: regularFont,
    color: rgb(0, 0, 0),
  })
  ctx.page.drawText(`Date: ${effectiveDate}`, {
    x: MARGIN + 300,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: regularFont,
    color: rgb(0, 0, 0),
  })

  // Add audit trail page if provided (broker co-sign generates final version)
  if (auditTrail && auditTrail.length > 0) {
    drawAuditTrailPage(pdfDoc, ctx, title, agentName, auditTrail, regularFont, boldFont)
  }

  return pdfDoc.save()
}