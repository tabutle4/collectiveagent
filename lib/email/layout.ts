// Shared email layout for all system emails
// Colors are centralized here so all emails update when branding changes
// When company_settings is wired up, these will pull from the database

export const EMAIL_COLORS = {
  accent: '#C5A278',        // luxury-accent (tan/gold)
  headerBg: '#1A1A1A',      // luxury-black
  bodyText: '#555555',       // luxury-gray-2
  headingText: '#1A1A1A',   // luxury-gray-1
  lightText: '#888888',      // luxury-gray-3
  lightBg: '#F9F9F9',       // luxury-light
  border: '#E5E5E5',        // luxury-gray-5
  white: '#FFFFFF',
  buttonText: '#FFFFFF',
}

export function getEmailLayout(content: string, options?: {
  title?: string
  subtitle?: string
  preheader?: string
}): string {
  const { title, subtitle, preheader } = options || {}

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${preheader ? `<span style="display:none;font-size:1px;color:${EMAIL_COLORS.white};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
  <style>
    body {
      font-family: 'Montserrat', 'Trebuchet MS', Arial, sans-serif;
      line-height: 1.6;
      color: ${EMAIL_COLORS.bodyText};
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: ${EMAIL_COLORS.lightBg};
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
    }
    .email-header {
      background-color: ${EMAIL_COLORS.headerBg};
      color: ${EMAIL_COLORS.white};
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .email-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: ${EMAIL_COLORS.white};
    }
    .email-header p {
      margin: 8px 0 0 0;
      font-size: 13px;
      color: ${EMAIL_COLORS.lightText};
    }
    .email-content {
      background-color: ${EMAIL_COLORS.white};
      padding: 30px 24px;
      border: 1px solid ${EMAIL_COLORS.border};
      border-top: none;
    }
    .email-content p {
      font-size: 14px;
      margin: 12px 0;
      color: ${EMAIL_COLORS.bodyText};
    }
    .email-content h3 {
      font-size: 13px;
      font-weight: 600;
      color: ${EMAIL_COLORS.accent};
      margin: 0 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .email-greeting {
      font-size: 15px;
      color: ${EMAIL_COLORS.headingText};
      margin-bottom: 16px;
    }
    .email-section {
      background-color: ${EMAIL_COLORS.lightBg};
      padding: 20px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .email-section p {
      margin: 6px 0;
      font-size: 13px;
    }
    .email-btn {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${EMAIL_COLORS.accent};
      color: ${EMAIL_COLORS.buttonText} !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .email-btn-dark {
      display: inline-block;
      padding: 12px 28px;
      background-color: ${EMAIL_COLORS.headerBg};
      color: ${EMAIL_COLORS.buttonText} !important;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .email-divider {
      border: none;
      border-top: 1px solid ${EMAIL_COLORS.border};
      margin: 24px 0;
    }
    .email-footer {
      padding: 20px 24px;
      border: 1px solid ${EMAIL_COLORS.border};
      border-top: none;
      border-radius: 0 0 8px 8px;
      background-color: ${EMAIL_COLORS.white};
    }
    .email-footer p {
      margin: 0;
      font-size: 11px;
      color: ${EMAIL_COLORS.lightText};
      text-align: center;
    }
    .email-footer a {
      color: ${EMAIL_COLORS.accent};
      text-decoration: none;
    }
    .email-signature {
      margin-top: 24px;
      font-size: 13px;
      color: ${EMAIL_COLORS.bodyText};
    }
    .email-signature strong {
      color: ${EMAIL_COLORS.headingText};
    }
    ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    li {
      margin: 6px 0;
      font-size: 13px;
      color: ${EMAIL_COLORS.bodyText};
    }
    a {
      color: ${EMAIL_COLORS.accent};
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    ${title ? `<div class="email-header">
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>` : ''}
    
    <div class="email-content">
      ${content}
    </div>
    
    <div class="email-footer">
      <p>Collective Realty Co. | 13201 Northwest Fwy, Ste 450, Houston, TX</p>
      <p style="margin-top: 4px;"><a href="https://collectiverealtyco.com">collectiverealtyco.com</a></p>
    </div>
  </div>
</body>
</html>`
}

// Helper to wrap content in a section box
export function emailSection(title: string, content: string): string {
  return `<div class="email-section"><h3>${title}</h3>${content}</div>`
}

// Helper for a centered button
export function emailButton(text: string, url: string, dark?: boolean): string {
  const cls = dark ? 'email-btn-dark' : 'email-btn'
  return `<p style="text-align:center;margin:20px 0;"><a href="${url}" class="${cls}">${text}</a></p>`
}

// Helper for a signature block
export function emailSignature(name: string, title: string, email?: string, phone?: string): string {
  let sig = `<div class="email-signature">Best regards,<br><strong>${name}</strong><br>${title}<br>Collective Realty Co.`
  if (email) sig += `<br>${email}`
  if (phone) sig += `<br>${phone}`
  sig += `</div>`
  return sig
}