import { NextRequest, NextResponse } from 'next/server'

// POST - Preview email template with sample data
export async function POST(request: NextRequest) {
  try {
    const { html_content, variables } = await request.json()

    if (!html_content) {
      return NextResponse.json(
        { error: 'HTML content is required' },
        { status: 400 }
      )
    }

    // Sample data for preview
    const sampleData: Record<string, string> = {
      first_name: 'John',
      last_name: 'Doe',
      campaign_name: '2026 Plan Selection',
      campaign_link: 'https://example.com/campaign/2026?token=sample-token',
      deadline: 'December 31, 2025',
      logo_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/logo-white.png`,
    }

    // Replace variables in HTML
    let previewHtml = html_content
    // Always include logo_url in variables for replacement
    const variablesToReplace = variables && Array.isArray(variables) 
      ? (variables.includes('logo_url') ? variables : [...variables, 'logo_url'])
      : null
    
    if (variablesToReplace) {
      variablesToReplace.forEach((varName: string) => {
        const placeholder = `{{${varName}}}`
        const value = sampleData[varName] || `[${varName}]`
        previewHtml = previewHtml.split(placeholder).join(value)
      })
    } else {
      // Fallback: replace common variables
      Object.keys(sampleData).forEach((key) => {
        const placeholder = `{{${key}}}`
        previewHtml = previewHtml.split(placeholder).join(sampleData[key])
      })
    }

    return NextResponse.json({ preview_html: previewHtml })
  } catch (error) {
    console.error('Preview email template error:', error)
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    )
  }
}

