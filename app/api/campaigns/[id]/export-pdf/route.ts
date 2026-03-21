import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const normalizeUuidInput = (value: string | null | undefined): string | null => {
  if (
    !value ||
    value === 'undefined' ||
    value === 'null' ||
    value === '' ||
    typeof value !== 'string'
  ) {
    return null
  }
  return value
}

// Helper to wrap text
const wrapText = (text: string, maxWidth: number, font: any, fontSize: number): string[] => {
  // Remove newlines and normalize whitespace
  const cleanText = text.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim()
  
  if (!cleanText) return ['']
  
  const words = cleanText.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (!word) continue
    
    const testLine = currentLine ? `${currentLine} ${word}` : word
    try {
      const width = font.widthOfTextAtSize(testLine, fontSize)
      
      if (width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    } catch (error) {
      // If encoding fails, just add the word and continue
      if (currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = word
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines.length > 0 ? lines : ['']
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle both async and sync params (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    const normalizedId = normalizeUuidInput(resolvedParams?.id)
    
    if (!normalizedId) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      )
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', normalizedId)
      .single()

    if (campaignError) throw campaignError
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Fetch stats
    const { data: statsData } = await supabase.rpc('get_campaign_completion_stats', {
      campaign_uuid: normalizedId
    })
    const stats = statsData && statsData.length > 0 ? statsData[0] : null

    // Fetch agents with progress
    const { data: agentsData } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        preferred_first_name,
        preferred_last_name,
        email,
        campaign_recipients!inner(
          current_step,
          fully_completed_at
        ),
        campaign_responses(
          commission_plan_2026,
          attending_luncheon,
          luncheon_comments,
          support_rating,
          support_improvements,
          work_preference
        )
      `)
      .eq('is_active', true)
      .eq('is_licensed_agent', true)
      .eq('campaign_recipients.campaign_id', normalizedId)

    const agents = agentsData || []

    // Fetch RSVPs
    const { data: rsvpData } = await supabase
      .from('campaign_responses')
      .select(`
        *,
        users!inner(
          preferred_first_name,
          preferred_last_name,
          email
        )
      `)
      .eq('campaign_id', normalizedId)
      .not('attending_luncheon', 'is', null)

    const rsvps = rsvpData || []
    const attending = rsvps.filter((r: any) => r.attending_luncheon === true)
    const notAttending = rsvps.filter((r: any) => r.attending_luncheon === false)

    // Fetch survey responses
    const { data: surveyData } = await supabase
      .from('campaign_responses')
      .select(`
        *,
        users!inner(
          preferred_first_name,
          preferred_last_name
        )
      `)
      .eq('campaign_id', normalizedId)
      .not('support_rating', 'is', null)

    const surveys = surveyData || []

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    const pageWidth = 612
    const pageHeight = 792
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight])
    const margin = 50
    const contentWidth = pageWidth - (margin * 2)
    let y = pageHeight - margin
    
    // Color scheme
    const colors = {
      primary: rgb(0.2, 0.2, 0.2),
      secondary: rgb(0.5, 0.5, 0.5),
      light: rgb(0.7, 0.7, 0.7),
      gold: rgb(0.788, 0.663, 0.380), // #C9A961
      background: rgb(0.98, 0.98, 0.98),
      border: rgb(0.9, 0.9, 0.9),
      success: rgb(0.2, 0.6, 0.2),
    }

    // Helper function to get current page and add new page if needed
    const getCurrentPage = (requiredSpace: number = 50) => {
      if (y < margin + requiredSpace) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight])
        y = pageHeight - margin
      }
      return currentPage
    }

    // Helper function to add text
    const addText = (
      text: string, 
      x: number, 
      yPos: number, 
      size: number = 12, 
      font: any = helveticaFont, 
      color: any = rgb(0, 0, 0)
    ): void => {
      try {
        currentPage.drawText(text, {
          x,
          y: yPos,
          size,
          font,
          color,
        })
      } catch (e) {
        console.error('Error drawing text:', text, e)
      }
    }

    // Helper function to add centered text
    const addCenteredText = (text: string, yPos: number, size: number = 12, font: any = helveticaFont, color: any = rgb(0, 0, 0)) => {
      const textWidth = font.widthOfTextAtSize(text, size)
      addText(text, (pageWidth - textWidth) / 2, yPos, size, font, color)
    }

    // Header with banner - FIXED positioning
    const headerBannerHeight = 80
    currentPage.drawRectangle({
      x: 0,
      y: pageHeight - headerBannerHeight,
      width: pageWidth,
      height: headerBannerHeight,
      color: colors.primary,
    })
    
    // Title - positioned properly in banner
    addCenteredText('CAMPAIGN REPORT', pageHeight - 35, 24, helveticaBoldFont, rgb(1, 1, 1))
    addCenteredText(campaign.name, pageHeight - 60, 14, helveticaFont, rgb(0.9, 0.9, 0.9))
    
    y = pageHeight - headerBannerHeight - 40

    // Stats Overview - Card style with gold accent
    if (stats) {
      getCurrentPage(120)
      const statsBoxHeight = 100
      const statsBoxY = y - statsBoxHeight
      
      // Draw main box
      currentPage.drawRectangle({
        x: margin,
        y: statsBoxY,
        width: contentWidth,
        height: statsBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: colors.background,
      })
      
      // Gold accent bar
      currentPage.drawRectangle({
        x: margin,
        y: statsBoxY + statsBoxHeight - 3,
        width: contentWidth,
        height: 3,
        color: colors.gold,
      })
      
      addText('Overview Statistics', margin + 15, y - 5, 18, helveticaBoldFont, colors.primary)
      y -= 35
      
      // Stats in a clean grid layout - 2 rows, 3 columns
      const statBoxWidth = (contentWidth - 50) / 3
      const statBoxHeight = 55
      const statBoxSpacing = 15
      const statStartY = y - 20
      
      // Row 1: Total Recipients, Fully Completed, In Progress
      let boxX = margin + 15
      let boxY = statStartY - statBoxHeight
      
      // Box 1: Total Recipients
      currentPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: statBoxWidth,
        height: statBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      })
      addText('Total Recipients', boxX + 10, boxY + statBoxHeight - 18, 9, helveticaFont, colors.secondary)
      addText(`${stats.total_recipients || 0}`, boxX + 10, boxY + 18, 22, helveticaBoldFont, colors.primary)
      
      // Box 2: Fully Completed
      boxX += statBoxWidth + statBoxSpacing
      currentPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: statBoxWidth,
        height: statBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      })
      addText('Fully Completed', boxX + 10, boxY + statBoxHeight - 18, 9, helveticaFont, colors.secondary)
      addText(`${stats.fully_complete || 0}`, boxX + 10, boxY + 18, 22, helveticaBoldFont, colors.success)
      
      // Box 3: In Progress
      boxX += statBoxWidth + statBoxSpacing
      currentPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: statBoxWidth,
        height: statBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      })
      addText('In Progress', boxX + 10, boxY + statBoxHeight - 18, 9, helveticaFont, colors.secondary)
      addText(`${(stats.total_recipients || 0) - (stats.fully_complete || 0)}`, boxX + 10, boxY + 18, 22, helveticaBoldFont, colors.primary)
      
      // Row 2: Attending, Not Attending
      boxX = margin + 15
      boxY = statStartY - statBoxHeight - statBoxHeight - statBoxSpacing
      
      // Box 4: Attending
      currentPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: statBoxWidth,
        height: statBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      })
      addText('Attending', boxX + 10, boxY + statBoxHeight - 18, 9, helveticaFont, colors.secondary)
      addText(`${attending.length}`, boxX + 10, boxY + 18, 22, helveticaBoldFont, colors.success)
      
      // Box 5: Not Attending
      boxX += statBoxWidth + statBoxSpacing
      currentPage.drawRectangle({
        x: boxX,
        y: boxY,
        width: statBoxWidth,
        height: statBoxHeight,
        borderColor: colors.border,
        borderWidth: 1.5,
        color: rgb(1, 1, 1),
      })
      addText('Not Attending', boxX + 10, boxY + statBoxHeight - 18, 9, helveticaFont, colors.secondary)
      addText(`${notAttending.length}`, boxX + 10, boxY + 18, 22, helveticaBoldFont, colors.secondary)
      
      y = boxY - 30
    }

    // Section divider
    y -= 20
    currentPage = getCurrentPage()
    currentPage.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 1,
      color: colors.gold,
    })
    y -= 25

    // Agent Progress Table - FIXED column widths
    if (agents.length > 0) {
      getCurrentPage(150)
      
      // Section header with underline
      addText('Agent Progress', margin, y, 18, helveticaBoldFont, colors.primary)
      currentPage.drawLine({
        start: { x: margin, y: y - 8 },
        end: { x: margin + 150, y: y - 8 },
        thickness: 2,
        color: colors.gold,
      })
      y -= 35

      // Table header with gold background
      const headerY = y
      currentPage.drawRectangle({
        x: margin,
        y: headerY - 22,
        width: contentWidth,
        height: 22,
        color: colors.primary,
      })
      
      // FIXED column widths - wider to prevent overflow
      const colName = margin + 8
      const colEmail = margin + 150        // Was 130, now 150
      const colProgress = margin + 310     // Was 280, now 310
      const colPlan = margin + 380         // Was 360, now 380
      const colRSVP = margin + 480         // Same
      
      addText('Agent Name', colName, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
      addText('Email', colEmail, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
      addText('Progress', colProgress, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
      addText('Plan', colPlan, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
      addText('RSVP', colRSVP, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
      
      y -= 30

      agents.forEach((agent: any, index: number) => {
        // Get agent data
        const recipient = agent.campaign_recipients?.[0]
        const response = agent.campaign_responses?.[0]
        const progress = recipient?.current_step || 0
        const isComplete = recipient?.fully_completed_at
        const progressText = isComplete ? 'Complete' : `Step ${progress}/4`
        const commissionPlan = (response?.commission_plan_2026 || '-').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        const rsvpStatus = response?.attending_luncheon === true 
          ? 'Attending' 
          : response?.attending_luncheon === false 
            ? 'Not Attending' 
            : '-'

        // Calculate text wrapping with WIDER column widths
        const nameLines = wrapText(`${agent.preferred_first_name} ${agent.preferred_last_name}`, 135, helveticaFont, 9)
        const emailLines = wrapText(agent.email, 150, helveticaFont, 9)
        const planLines = wrapText(commissionPlan, 95, helveticaFont, 9)
        const maxLines = Math.max(nameLines.length, emailLines.length, planLines.length, 1)
        const rowHeight = Math.max(maxLines * 13 + 12, 26)  // More padding
        
        // Check if we need a new page
        if (y < margin + rowHeight + 50) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight])
          y = pageHeight - margin
          
          // Redraw table header on new page
          const headerY = y
          currentPage.drawRectangle({
            x: margin,
            y: headerY - 22,
            width: contentWidth,
            height: 22,
            color: colors.primary,
          })
          addText('Agent Name', colName, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
          addText('Email', colEmail, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
          addText('Progress', colProgress, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
          addText('Plan', colPlan, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
          addText('RSVP', colRSVP, headerY - 5, 10, helveticaBoldFont, rgb(1, 1, 1))
          y -= 30
        }

        // Alternate row background
        if (index % 2 === 0) {
          currentPage.drawRectangle({
            x: margin,
            y: y - rowHeight + 6,
            width: contentWidth,
            height: rowHeight,
            color: colors.background,
          })
        }
        
        // Row border
        currentPage.drawLine({
          start: { x: margin, y: y - rowHeight + 6 },
          end: { x: pageWidth - margin, y: y - rowHeight + 6 },
          thickness: 0.5,
          color: colors.border,
        })
        
        // Add text with proper padding
        const textY = y - 6
        
        // Agent Name (can wrap)
        nameLines.forEach((line, idx) => {
          addText(line, colName, textY - (idx * 13), 9)
        })
        
        // Email (can wrap)
        emailLines.forEach((line, idx) => {
          addText(line, colEmail, textY - (idx * 13), 9)
        })
        
        // Progress (single line)
        addText(progressText, colProgress, textY, 9)
        
        // Commission Plan (can wrap)
        planLines.forEach((line, idx) => {
          addText(line, colPlan, textY - (idx * 13), 9)
        })
        
        // RSVP (single line)
        addText(rsvpStatus, colRSVP, textY, 9)

        y -= rowHeight
      })

      y -= 20
    }

    // Section divider
    y -= 20
    currentPage = getCurrentPage()
    currentPage.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 1,
      color: colors.gold,
    })
    y -= 25

    // RSVP Details
    if (attending.length > 0) {
      getCurrentPage(100)
      
      addText(`Luncheon RSVPs (${attending.length} attending)`, margin, y, 18, helveticaBoldFont, colors.primary)
      currentPage.drawLine({
        start: { x: margin, y: y - 8 },
        end: { x: margin + 250, y: y - 8 },
        thickness: 2,
        color: colors.gold,
      })
      y -= 40

      attending.forEach((rsvp: any) => {
        getCurrentPage(50)
        
        // RSVP card style
        const commentLines = rsvp.luncheon_comments 
          ? wrapText(rsvp.luncheon_comments, contentWidth - 60, helveticaFont, 10)
          : []
        const cardHeight = 35 + (commentLines.length * 14)
        
        currentPage.drawRectangle({
          x: margin,
          y: y - cardHeight,
          width: contentWidth,
          height: cardHeight,
          borderColor: colors.border,
          borderWidth: 1,
          color: colors.background,
        })
        
        addText(`${rsvp.users.preferred_first_name} ${rsvp.users.preferred_last_name}`, margin + 12, y - 8, 12, helveticaBoldFont, colors.primary)
        y -= 25
        
        if (commentLines.length > 0) {
          commentLines.forEach((line) => {
            addText(`"${line}"`, margin + 20, y, 10, helveticaFont, colors.secondary)
            y -= 14
          })
          y -= 5
        } else {
          y -= 10
        }
        y -= 10
      })
    }

    // Section divider
    y -= 20
    currentPage = getCurrentPage()
    currentPage.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 1,
      color: colors.gold,
    })
    y -= 25

    // Feedback Survey Summary
    if (surveys.length > 0) {
      getCurrentPage(150)
      
      addText(`Feedback Survey Summary (${surveys.length} responses)`, margin, y, 18, helveticaBoldFont, colors.primary)
      currentPage.drawLine({
        start: { x: margin, y: y - 8 },
        end: { x: margin + 350, y: y - 8 },
        thickness: 2,
        color: colors.gold,
      })
      y -= 40

      // Average Support Rating with visual box
      const avgRating = surveys.reduce((sum: number, s: any) => sum + (s.support_rating || 0), 0) / surveys.length
      if (avgRating > 0) {
        currentPage.drawRectangle({
          x: margin,
          y: y - 45,
          width: 200,
          height: 50,
          borderColor: colors.gold,
          borderWidth: 2,
          color: colors.background,
        })
        
        addText('Average Support Rating', margin + 10, y - 8, 11, helveticaBoldFont, colors.primary)
        y -= 28
        addText(`${avgRating.toFixed(1)}/10`, margin + 10, y, 20, helveticaBoldFont, colors.success)
        y -= 45
      }

      // Work Preference Breakdown
      const teamCount = surveys.filter((s: any) => s.work_preference === 'team').length
      const independentCount = surveys.filter((s: any) => s.work_preference === 'independent').length
      const notSureCount = surveys.filter((s: any) => s.work_preference === 'not_sure').length

      if (teamCount > 0 || independentCount > 0 || notSureCount > 0) {
        addText('Work Preference', margin, y, 12, helveticaBoldFont)
        y -= 25
        addText(`Team: ${teamCount}`, margin + 20, y, 11)
        y -= 20
        addText(`Independent: ${independentCount}`, margin + 20, y, 11)
        y -= 20
        addText(`Not Sure: ${notSureCount}`, margin + 20, y, 11)
        y -= 35
      }

      // Support Improvement Suggestions
      const improvements = surveys.filter((s: any) => s.support_improvements)
      if (improvements.length > 0) {
        addText('Support Improvement Suggestions', margin, y, 12, helveticaBoldFont)
        y -= 30

        improvements.forEach((survey: any) => {
          getCurrentPage(60)
          
          // Suggestion card
          const suggestionLines = wrapText(survey.support_improvements, contentWidth - 60, helveticaFont, 10)
          const cardHeight = 28 + (suggestionLines.length * 14)
          
          currentPage.drawRectangle({
            x: margin,
            y: y - cardHeight,
            width: contentWidth,
            height: cardHeight,
            borderColor: colors.border,
            borderWidth: 1,
            color: colors.background,
          })
          
          addText(`${survey.users.preferred_first_name} ${survey.users.preferred_last_name}:`, margin + 12, y - 8, 11, helveticaBoldFont, colors.primary)
          y -= 22
          
          suggestionLines.forEach((line) => {
            addText(`"${line}"`, margin + 20, y, 10, helveticaFont, colors.secondary)
            y -= 14
          })
          y -= 12
        })
      }
    }

    // Footer on all pages
    const pages = pdfDoc.getPages()
    const footerText = `Generated on ${new Date().toLocaleString()}`
    const footerWidth = helveticaFont.widthOfTextAtSize(footerText, 8)
    pages.forEach((page) => {
      page.drawText(footerText, {
        x: (pageWidth - footerWidth) / 2,
        y: 30,
        size: 8,
        font: helveticaFont,
        color: rgb(0.6, 0.6, 0.6),
      })
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Return PDF
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="campaign-report-${campaign.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('PDF export error:', error)
    console.error('Error stack:', error?.stack)
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to generate PDF report',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}