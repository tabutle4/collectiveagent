-- =====================================================
-- Email Templates Schema
-- Phase A: Email Template System
-- =====================================================

-- Add email_template_id to campaigns table (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaigns' AND column_name = 'email_template_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN email_template_id UUID REFERENCES email_templates(id);
  END IF;
END $$;

-- EMAIL TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Template Metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'campaign', -- 'campaign', 'notification', 'welcome', 'custom'
  
  -- Template Content
  html_content TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  
  -- Template Configuration
  variables TEXT[] DEFAULT ARRAY[]::TEXT[], -- Available variables: ['first_name', 'campaign_link', 'deadline', etc.]
  logo_url TEXT DEFAULT '/logo.png', -- Default logo URL
  
  -- Template Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Created by
  created_by UUID REFERENCES users(id),
  
  -- Preview thumbnail (optional base64)
  preview_image TEXT
);

-- Index for template lookups
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_templates_active ON email_templates(is_active);
CREATE INDEX idx_email_templates_default ON email_templates(is_default) WHERE is_default = true;

-- Trigger to update updated_at
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Anyone can view templates (they're used for sending emails)
CREATE POLICY "Anyone can view email templates" ON email_templates
  FOR SELECT
  USING (true);

-- Only admins can create/update/delete templates
-- (We'll handle admin check in application code for now)
CREATE POLICY "Anyone can create email templates" ON email_templates
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update email templates" ON email_templates
  FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete email templates" ON email_templates
  FOR DELETE
  USING (true);

-- Insert default campaign email template from attached HTML
INSERT INTO email_templates (
  name,
  description,
  category,
  subject_line,
  html_content,
  variables,
  is_default,
  logo_url
) VALUES (
  'Campaign Email Template',
  'Default template for campaign invitation emails',
  'campaign',
  '{{campaign_name}}',
  '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{campaign_name}}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', ''Helvetica Neue'', Arial, sans-serif;
      background-color: #ffffff;
      color: #2d2d2d;
      -webkit-font-smoothing: antialiased;
    }
    
    .email-wrapper {
      max-width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
    }
    
    .header {
      background-color: #ffffff;
      padding: 24px;
      border-bottom: 1px solid #e5e5e5;
    }
    
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      text-align: center;
    }
    
    .logo-img {
      max-width: 200px;
      height: auto;
      display: inline-block;
    }
    
    .main-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    
    .content-card {
      background: #ffffff;
      border: 1px solid #e5e5e5;
      border-radius: 0px;
      padding: 40px;
      margin-bottom: 24px;
    }
    
    h1 {
      font-size: 28px;
      font-weight: 400;
      color: #6b7280;
      margin-bottom: 32px;
      line-height: 1.3;
    }
    
    .greeting {
      font-size: 16px;
      color: #2d2d2d;
      margin-bottom: 8px;
    }
    
    .body-text {
      font-size: 15px;
      line-height: 1.7;
      color: #2d2d2d;
      margin-bottom: 20px;
    }
    
    .body-text strong {
      font-weight: 600;
      color: #000000;
    }
    
    .info-section {
      background-color: #fafaf9;
      padding: 24px;
      margin: 32px 0;
      border-left: 2px solid #C9A961;
    }
    
    .info-title {
      font-size: 13px;
      font-weight: 600;
      color: #2d2d2d;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-item {
      font-size: 14px;
      color: #4a5568;
      margin: 10px 0;
      line-height: 1.6;
    }
    
    .deadline-box {
      background-color: #FEFCE8;
      border-left: 3px solid #C9A961;
      padding: 20px 24px;
      margin: 24px 0;
    }
    
    .deadline-label {
      font-size: 12px;
      font-weight: 700;
      color: #92400e;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .deadline-date {
      font-size: 16px;
      font-weight: 600;
      color: #78350f;
    }
    
    .button-container {
      text-align: center;
      margin: 40px 0;
    }
    
    .cta-button {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 0px;
      letter-spacing: 0.3px;
      transition: background-color 0.2s ease;
    }
    
    .cta-button:hover {
      background-color: #1a1a1a;
    }
    
    .divider {
      height: 1px;
      background-color: #e5e5e5;
      margin: 32px 0;
    }
    
    .footer {
      background-color: #fafaf9;
      padding: 32px 24px;
      text-align: center;
      border-top: 1px solid #e5e5e5;
    }
    
    .footer-text {
      font-size: 13px;
      color: #9ca3af;
      line-height: 1.6;
      margin: 6px 0;
    }
    
    .footer-link {
      color: #2d2d2d;
      text-decoration: none;
      font-weight: 500;
    }
    
    .footer-link:hover {
      text-decoration: underline;
    }
    
    @media only screen and (max-width: 600px) {
      .header {
        padding: 20px 16px;
      }
      
      .logo-img {
        max-width: 160px;
      }
      
      .main-content {
        padding: 24px 16px;
      }
      
      .content-card {
        padding: 24px 20px;
      }
      
      h1 {
        font-size: 22px;
      }
      
      .body-text {
        font-size: 14px;
      }
      
      .cta-button {
        display: block;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <div class="header-content">
        <img src="{{logo_url}}" alt="Collective Agent" class="logo-img">
      </div>
    </div>

    <div class="main-content">
      <div class="content-card">
        <h1>{{campaign_name}}</h1>
        
        <div class="greeting">Hi {{first_name}},</div>
        
        <p class="body-text">
          It''s time for our annual campaign where we gather important updates and confirm your choices for the upcoming year. This brief process helps us ensure we have your most current information and that you''re set up for success.
        </p>
        
        <p class="body-text">
          <strong>What you''ll do:</strong>
        </p>
        
        <p class="body-text">
          This campaign has <strong>4 quick steps</strong> that will take about 5-10 minutes to complete:
        </p>
        
        <div class="info-section">
          <div class="info-item">✓ <strong>Step 1:</strong> Review important information and deadlines</div>
          <div class="info-item">✓ <strong>Step 2:</strong> Update your profile and select your commission plan</div>
          <div class="info-item">✓ <strong>Step 3:</strong> RSVP to our annual celebration luncheon</div>
          <div class="info-item">✓ <strong>Step 4:</strong> Share quick feedback to help us support you better</div>
        </div>
        
        <p class="body-text">
          Your personalized link below will take you directly to the campaign. You can save your progress and return anytime before the deadline.
        </p>

        <div class="button-container">
          <a href="{{campaign_link}}" class="cta-button">Get Started →</a>
        </div>

        <div class="deadline-box">
          <div class="deadline-label">Important Deadline</div>
          <div class="deadline-date">Complete by {{deadline}}</div>
        </div>

        <div class="divider"></div>

        <p class="body-text" style="font-size: 13px; color: #6b7280;">
          <strong>Need help?</strong> Contact us at <a href="mailto:office@collectiverealtyco.com" style="color: #2d2d2d; text-decoration: none; font-weight: 500;">office@collectiverealtyco.com</a> and we''ll be happy to assist you.
        </p>
      </div>
    </div>

    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #2d2d2d;">
        Collective Realty Co.
      </p>
      <p class="footer-text" style="margin-top: 16px;">
        <a href="mailto:office@collectiverealtyco.com" class="footer-link">office@collectiverealtyco.com</a>
      </p>
      <p class="footer-text" style="margin-top: 20px; font-size: 11px;">
        This is an automated message from Collective Realty Co.<br>
        You''re receiving this as an active agent with our brokerage.
      </p>
    </div>
  </div>
</body>
</html>',
  ARRAY['first_name', 'last_name', 'campaign_name', 'campaign_link', 'deadline', 'logo_url'],
  true,
  '{{logo_url}}'
) ON CONFLICT DO NOTHING;

