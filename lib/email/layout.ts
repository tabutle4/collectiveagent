// Shared email layout for all system emails
// Colors are centralized here so all emails update when branding changes
// When company_settings is wired up, these will pull from the database

export const EMAIL_COLORS = {
  accent: '#C5A278', // luxury-accent (tan/gold)
  headerBg: '#FFFFFF', // white header
  bodyText: '#555555', // luxury-gray-2
  headingText: '#1A1A1A', // luxury-gray-1
  lightText: '#888888', // luxury-gray-3
  lightBg: '#F9F9F9', // luxury-light
  border: '#E5E5E5', // luxury-gray-5
  white: '#FFFFFF',
  buttonText: '#FFFFFF',
}

export function getEmailLayout(
  content: string,
  options?: {
    title?: string
    subtitle?: string
    preheader?: string
  }
): string {
  const { title, subtitle, preheader } = options || {}

  // Using inline styles for maximum email client compatibility
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: ${EMAIL_COLORS.bodyText}; margin: 0; padding: 0; background-color: ${EMAIL_COLORS.lightBg};">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    ${
      title
        ? `<!-- Header with white background and accent border -->
    <div style="background-color: ${EMAIL_COLORS.headerBg}; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid ${EMAIL_COLORS.border}; border-bottom: 3px solid ${EMAIL_COLORS.accent};">
      <h1 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${EMAIL_COLORS.headingText};">${title}</h1>
      ${subtitle ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: ${EMAIL_COLORS.lightText};">${subtitle}</p>` : ''}
    </div>`
        : ''
    }
    
    <!-- Content -->
    <div style="background-color: ${EMAIL_COLORS.white}; padding: 30px 24px; border: 1px solid ${EMAIL_COLORS.border}; ${title ? 'border-top: none;' : 'border-radius: 8px 8px 0 0;'}">
      ${content}
    </div>
    
    <!-- Footer -->
    <div style="padding: 20px 24px; border: 1px solid ${EMAIL_COLORS.border}; border-top: none; border-radius: 0 0 8px 8px; background-color: ${EMAIL_COLORS.white}; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: ${EMAIL_COLORS.lightText};">Collective Realty Co. | 13201 Northwest Fwy, Ste 450, Houston, TX</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; color: ${EMAIL_COLORS.lightText};"><a href="https://collectiverealtyco.com" style="color: ${EMAIL_COLORS.accent}; text-decoration: none;">collectiverealtyco.com</a></p>
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
export function emailSignature(
  name: string,
  title: string,
  email?: string,
  phone?: string
): string {
  let sig = `<div class="email-signature">Best regards,<br><strong>${name}</strong><br>${title}<br>Collective Realty Co.`
  if (email) sig += `<br>${email}`
  if (phone) sig += `<br>${phone}`
  sig += `</div>`
  return sig
}