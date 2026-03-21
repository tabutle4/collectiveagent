import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing env.RESEND_API_KEY')
}

const normalizeUuidInput = (value: string | null | undefined) => {
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

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, recipient_filter, template_id, custom_html, custom_subject, individual_agent_id } = await request.json()

    // Normalize UUID inputs - convert undefined/null/empty strings to null
    const normalizedCampaignId = normalizeUuidInput(campaign_id)
    const normalizedTemplateId = normalizeUuidInput(template_id)
    const normalizedIndividualAgentId = normalizeUuidInput(individual_agent_id)

    // Fetch campaign (only needed for agent-related filters, not prospects)
    let campaign = null
    if (recipient_filter !== 'prospect') {
      if (!normalizedCampaignId) {
        return NextResponse.json(
          { error: 'campaign_id is required' },
          { status: 400 }
        )
      }

      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', normalizedCampaignId)
        .single()

      if (campaignError || !campaignData) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      }
      campaign = campaignData
    }

    let agents: any[] = []

    // Handle prospects separately
    if (recipient_filter === 'prospect') {
      const { data: prospects, error: prospectsError } = await supabase
        .from('prospects')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email')
        .order('preferred_first_name', { ascending: true })
        .order('preferred_last_name', { ascending: true })

      if (prospectsError) throw prospectsError

      // Convert prospects to agent-like format for email sending
      agents = (prospects || []).map((p: any) => ({
        ...p,
        campaign_token: null, // Prospects don't have campaign tokens
        campaign_recipients: null,
      }))
    } else {
      // Handle agent filters - filter by is_licensed_agent instead of roles array
      let query = supabase
        .from('users')
        .select(`
          id,
          first_name,
          last_name,
          preferred_first_name,
          preferred_last_name,
          email,
          campaign_token,
          is_active,
          campaign_recipients!left(fully_completed_at, campaign_id)
        `)
        .eq('is_licensed_agent', true)

      // Apply filter-specific conditions
      if (recipient_filter === 'individual') {
        if (!normalizedIndividualAgentId) {
          return NextResponse.json(
            { error: 'individual_agent_id is required for individual filter' },
            { status: 400 }
          )
        }
        query = query.eq('id', normalizedIndividualAgentId)
      } else if (recipient_filter === 'active') {
        query = query.eq('is_active', true)
        if (normalizedCampaignId) {
          query = query.not('campaign_token', 'is', null)
        }
      } else if (recipient_filter === 'inactive') {
        query = query.eq('is_active', false)
        if (normalizedCampaignId) {
          query = query.not('campaign_token', 'is', null)
        }
      } else if (recipient_filter === 'campaign_incomplete') {
        if (!normalizedCampaignId) {
          return NextResponse.json(
            { error: 'campaign_id is required for campaign_incomplete filter' },
            { status: 400 }
          )
        }
        // Get all active agents with tokens first
        query = query
          .eq('is_active', true)
          .not('campaign_token', 'is', null)
      } else if (recipient_filter === 'all') {
        // All agents with tokens (if campaign exists)
        if (normalizedCampaignId) {
          query = query.not('campaign_token', 'is', null)
        }
      }

      const { data: agentsData, error: agentsError } = await query

      if (agentsError) {
        console.error('Error fetching agents:', agentsError)
        throw agentsError
      }
      
      agents = agentsData || []
      
      // For campaign_incomplete, filter results to only include those without completed status for this campaign
      if (recipient_filter === 'campaign_incomplete' && normalizedCampaignId) {
        // Fetch campaign_recipients for this campaign to check completion status
        const { data: recipientsData, error: recipientsError } = await supabase
          .from('campaign_recipients')
          .select('user_id, fully_completed_at')
          .eq('campaign_id', normalizedCampaignId)
        
        if (recipientsError) {
          console.error('Error fetching campaign recipients:', recipientsError)
          throw recipientsError
        }
        
        // Create a set of user IDs who have completed this campaign
        const completedUserIds = new Set(
          (recipientsData || [])
            .filter((r: any) => r.fully_completed_at)
            .map((r: any) => r.user_id)
        )
        
        // Filter agents to only those who haven't completed
        agents = agents.filter((agent: any) => !completedUserIds.has(agent.id))
      }
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ 
        success: true, 
        sent: 0,
        message: 'No recipients to send to'
      })
    }

    // Get email template (priority: template_id param > campaign.email_template_id > default)
    let emailTemplate = null
    // Use normalized template_id if available
    if (normalizedTemplateId) {
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', normalizedTemplateId)
        .eq('is_active', true)
         
        .single()
      if (templateError) {
        console.error('Error fetching template by ID:', templateError)
      }
      if (template) {
        emailTemplate = template
        console.log('Using template from template_id param:', template.name)
      }
    } else if (campaign?.email_template_id) {
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', campaign.email_template_id)
        .eq('is_active', true)
         
        .single()
      if (templateError) {
        console.error('Error fetching template from campaign:', templateError)
      }
      if (template) {
        emailTemplate = template
        console.log('Using template from campaign:', template.name)
      }
    }
    
    // If no template assigned, try to get default campaign template
    if (!emailTemplate) {
      const { data: defaultTemplate, error: defaultError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('category', 'campaign')
        .eq('is_default', true)
        .eq('is_active', true)
         
        .single()
      if (defaultError) {
        console.error('Error fetching default template:', defaultError)
      }
      if (defaultTemplate) {
        emailTemplate = defaultTemplate
        console.log('Using default template:', defaultTemplate.name)
      } else {
        console.warn('No email template found - will use fallback HTML')
      }
    }

    // Override template HTML/subject if custom edits provided
    if (emailTemplate && (custom_html || custom_subject)) {
      emailTemplate = {
        ...emailTemplate,
        html_content: custom_html || emailTemplate.html_content,
        subject_line: custom_subject || emailTemplate.subject_line,
      }
    }

    // Send emails to each agent with rate limiting (2 per second to avoid Resend limits)
    const results: Array<{ success: boolean; email: string; error?: any }> = []
    
    console.log(`📧 Starting to send ${agents.length} emails (rate limited to ~1.67/sec)...`)
    
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      // Prospects don't have campaign tokens, so only create link if token exists
      const campaignLink = agent.campaign_token && campaign 
        ? `${baseUrl}/campaign/${campaign.slug}?token=${agent.campaign_token}`
        : campaign 
          ? `${baseUrl}/campaign/${campaign.slug}`
          : ''
      const logoUrl = `${baseUrl}${emailTemplate?.logo_url || '/logo-white.png'}`
      
      // Prepare variable replacement data
      const variables: Record<string, string> = {
        first_name: agent.preferred_first_name || agent.first_name,
        last_name: agent.preferred_last_name || agent.last_name,
        campaign_name: campaign?.name || 'Campaign',
        campaign_link: campaignLink,
        deadline: campaign?.deadline 
          ? new Date(campaign.deadline).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })
          : '',
        logo_url: logoUrl,
      }

      let emailHtml = ''
      let emailSubject = ''

      // Use template if available
      if (emailTemplate) {
        emailHtml = emailTemplate.html_content
        emailSubject = emailTemplate.subject_line
        
        // Ensure logo_url is always included in variables for replacement
        if (!variables.logo_url) {
          variables.logo_url = logoUrl
        }
        
        // Replace all variables in template
        Object.keys(variables).forEach((key) => {
          const placeholder = `{{${key}}}`
          emailHtml = emailHtml.split(placeholder).join(variables[key])
          emailSubject = emailSubject.split(placeholder).join(variables[key])
        })
      } else {
        // Fallback to old system
        let emailBody = campaign?.email_body || `
Hi ${agent.preferred_first_name},

${campaign ? `Please complete the ${campaign.name} by clicking the link below:` : 'Thank you for your interest in Collective Realty Co.'}

${campaignLink ? campaignLink + '\n' : ''}${variables.deadline ? `Deadline: ${variables.deadline}` : ''}

Thank you,
Collective Realty Co.
        `

        emailBody = emailBody
          .replace(/{first_name}/g, variables.first_name)
          .replace(/{last_name}/g, variables.last_name)
          .replace(/{campaign_link}/g, campaignLink)
          .replace(/{deadline}/g, variables.deadline)

        emailSubject = campaign?.email_subject || (campaign ? `Action Required: ${campaign.name}` : 'Welcome to Collective Realty Co.')

        emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2d2d2d; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; background: #fff; }
    .button { 
      display: inline-block; 
      padding: 12px 30px; 
      background: #2d2d2d; 
      color: white; 
      text-decoration: none; 
      border-radius: 4px; 
      margin: 20px 0; 
    }
    .footer { 
      margin-top: 30px; 
      padding-top: 20px; 
      border-top: 1px solid #ddd; 
      font-size: 12px; 
      color: #666; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Collective Realty Co.</h1>
    </div>
    
    <div class="content">
      ${emailBody.replace(/\n/g, '<br>')}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${campaignLink}" class="button">Complete Campaign</a>
      </div>
      
      <div class="footer">
        <p>This is an automated message from Collective Realty Co.</p>
        <p>Questions? Contact us at office@collectiverealtyco.com</p>
      </div>
    </div>
  </div>
</body>
</html>
        `
      }

      try {
        await resend.emails.send({
          from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
          to: agent.email,
          cc: 'office@collectiverealtyco.com',
          subject: emailSubject,
          html: emailHtml,
        })

        results.push({ success: true, email: agent.email })
        console.log(`✓ Sent to ${agent.email} (${i + 1}/${agents.length})`)
      } catch (error) {
        console.error(`✗ Failed to send to ${agent.email}:`, error)
        results.push({ success: false, email: agent.email, error })
      }

      // Wait 600ms between emails (= 1.67 emails/second, safely under 2/second limit)
      // This prevents Resend rate limit errors
      if (i < agents.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    }

    const successCount = results.filter(r => r.success).length

    // Update campaign sent_at timestamp (only if campaign exists)
    if (normalizedCampaignId && campaign) {
      await supabase
        .from('campaigns')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', normalizedCampaignId)
    }

    console.log(`✅ Campaign complete: ${successCount}/${agents.length} emails sent successfully`)

    return NextResponse.json({
      success: true,
      sent: successCount,
      total: agents.length,
      message: `Sent ${successCount} of ${agents.length} emails successfully`
    })
  } catch (error) {
    console.error('Send campaign emails error:', error)
    return NextResponse.json(
      { error: 'Failed to send campaign emails' },
      { status: 500 }
    )
  }
}
