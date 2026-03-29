import { sanitizeSocialForRoster } from '@/lib/socialLinks'
import { formatRole } from '@/lib/nameFormatter'

type AgentRecord = {
  id: string
  preferred_first_name: string | null
  preferred_last_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  personal_phone: string | null
  business_phone: string | null
  birth_month: string | null
  date_of_birth: string | null
  office: string | null
  team_name: string | null
  division: string | null
  role: string | null
  job_title: string | null
  additional_roles: string[] | null
  is_team_lead: boolean
  instagram_handle: string | null
  tiktok_handle: string | null
  threads_handle: string | null
  youtube_url: string | null
  linkedin_url: string | null
  facebook_url: string | null
  headshot_url: string | null
  headshot_crop: {
    offsetX: number
    offsetY: number
    scale: number
  } | null
}

const escapeHtml = (str: string | null | undefined) =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeAttr = (str: string | null | undefined) =>
  (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const formatName = (agent: AgentRecord) => {
  const preferredFirst = agent.preferred_first_name || agent.first_name || ''
  const preferredLast = agent.preferred_last_name || agent.last_name || ''
  return `${preferredFirst} ${preferredLast}`.trim()
}

const cleanPhone = (phone?: string | null) => (phone || '').replace(/\D/g, '')

const formatPhone = (phone?: string | null) => {
  const digits = cleanPhone(phone)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone || ''
}

const getBirthdayLabel = (agent: AgentRecord) => {
  if (agent.birth_month) return agent.birth_month
  if (agent.date_of_birth) {
    try {
      const date = new Date(agent.date_of_birth)
      return date.toLocaleString('en-US', { month: 'long' })
    } catch {
      return ''
    }
  }
  return ''
}

const getUniqueSorted = (values: (string | null)[]) => {
  const unique = Array.from(
    new Set(values.filter((val): val is string => !!val?.trim()).map(val => val!.trim()))
  )
  return unique.sort((a, b) => a.localeCompare(b))
}

// Extract individual divisions from combined divisions (split by |)
const extractDivisions = (division: string | null): string[] => {
  if (!division || !division.trim()) return []
  return division
    .split('|')
    .map(d => d.trim())
    .filter(d => d.length > 0)
}

const getSocialLinks = (agent: AgentRecord) => ({
  instagram: sanitizeSocialForRoster(agent.instagram_handle, 'instagram'),
  tiktok: sanitizeSocialForRoster(agent.tiktok_handle, 'tiktok'),
  threads: sanitizeSocialForRoster(agent.threads_handle, 'threads'),
  youtube: sanitizeSocialForRoster(agent.youtube_url, 'youtube'),
  linkedin: sanitizeSocialForRoster(agent.linkedin_url, 'linkedin'),
  facebook: sanitizeSocialForRoster(agent.facebook_url, 'facebook'),
})

const buildSocialIcons = (agent: AgentRecord) => {
  const links = getSocialLinks(agent)
  const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="currentColor">${path}</svg>`
  const icons: Record<string, string> = {
    instagram:
      '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm6.406-1.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>',
    tiktok:
      '<path d="M12.05 2h3.12c.21 1.58 1.09 2.92 2.55 3.79 1 .57 2.08.82 3.23.84v3.31c-1.17.11-2.29-.09-3.36-.57-.46-.2-.9-.44-1.32-.71l-.02 6.72c0 3.09-2.24 5.91-5.28 6.55-3.68.78-7.21-1.65-7.83-5.26-.69-4 2.08-7.47 5.99-7.89v3.4c-.68.11-1.29.38-1.82.81-.8.63-1.26 1.45-1.22 2.47.05 1.05.59 1.83 1.51 2.29 1.34.66 3.05.09 3.68-1.22.18-.38.27-.8.27-1.22.01-3.9.01-7.79.01-11.69z"/>',
    threads:
      '<path d="M12 2C6.49 2 2 6.48 2 12s4.49 10 10 10 10-4.48 10-10S17.51 2 12 2zm4.84 13.52c-.56 1.51-2.08 2.41-4.03 2.41-2.23 0-4.12-1.11-4.74-2.78l2.03-.62c.33.92 1.38 1.52 2.71 1.52.78 0 1.72-.2 1.99-.94.26-.7-.07-1.33-2.07-1.8-2.32-.52-3.66-1.62-3.66-3.42 0-1.54 1.15-2.93 3.14-3.35V6h1.9v1.42c1.41.27 2.53 1.1 3.02 2.16l-1.88.86c-.32-.66-.99-1.08-1.82-1.08-.91 0-1.59.46-1.59 1.07 0 .64.65 1.03 2.38 1.44 3.13.72 4.08 2.08 4.08 3.55-.01.32-.05.65-.16.96z"/>',
    youtube:
      '<path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9-2.8-.2-7-.2-7-.2h-.1s-4.2 0-7 .2c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.6c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.9.8 2.4.9 1.7.1 6.9.2 6.9.2s4.2 0 7-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.6c0-1.6-.2-3.2-.2-3.2zM10 14.6V9.4l5.2 2.6L10 14.6z"/>',
    linkedin:
      '<path d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V24h-4V8zm7.5 0h3.8v2.16h.05c.53-1.01 1.81-2.08 3.73-2.08 3.99 0 4.73 2.63 4.73 6.05V24h-4v-7.56c0-1.8-.03-4.11-2.51-4.11-2.51 0-2.89 1.96-2.89 3.98V24h-4V8z"/>',
    facebook:
      '<path d="M22.675 0h-21.35C.597 0 0 .597 0 1.326v21.348C0 23.403.597 24 1.326 24H12.82v-9.294H9.692V11.01h3.128V8.414c0-3.1 1.894-4.788 4.659-4.788 1.325 0 2.464.099 2.794.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.696h-3.12V24h6.116C23.403 24 24 23.403 24 22.674V1.326C24 .597 23.403 0 22.675 0z"/>',
  }

  return Object.entries(links)
    .filter(([, url]) => !!url && url.trim().length > 0)
    .map(([key, url]) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1)
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="social-icon" title="${escapeAttr(
        label
      )}">${icon(icons[key])}</a>`
    })
    .join('')
}

export const buildTableRows = (agents: AgentRecord[]) =>
  agents
    .map((agent, index) => {
      const fullName = formatName(agent)
      const officeDisplay = agent.office || 'N/A'
      const role = agent.role || 'Agent'
      const roleLabel = formatRole(role)
      
      // Build additional roles from: additional_roles array + Team Lead flag + job_title
      const roleParts: string[] = []
      
      // Add additional_roles from users table
      if (agent.additional_roles && agent.additional_roles.length > 0) {
        roleParts.push(...agent.additional_roles)
      }
      
      // Add Team Lead if applicable
      if (agent.is_team_lead) {
        roleParts.push('Team Lead')
      }
      
      // Add job_title last
      if (agent.job_title && agent.job_title.trim()) {
        roleParts.push(agent.job_title.trim())
      }
      
      const additionalRoles = roleParts.length > 0 ? roleParts.join(' • ') : '-'
      const team = agent.team_name || '-'
      const phoneDigits = cleanPhone(agent.business_phone || agent.personal_phone)
      const formattedPhone = formatPhone(agent.business_phone || agent.personal_phone)
      const birthday = getBirthdayLabel(agent) || '-'
      const division = agent.division || '-'
      const social = getSocialLinks(agent)
      const headshotUrl = agent.headshot_url || ''
      const headshotCrop = agent.headshot_crop
      // Get initials for placeholder
      const firstName = agent.preferred_first_name || agent.first_name || ''
      const lastName = agent.preferred_last_name || agent.last_name || ''
      const firstInitial = firstName.charAt(0)?.toUpperCase() || ''
      const lastInitial = lastName.charAt(0)?.toUpperCase() || ''
      const initials = `${firstInitial}${lastInitial}` || '?'

      // Build CSS transform for crop if available
      let cropStyle = ''
      if (headshotCrop && headshotUrl) {
        const offsetX = headshotCrop.offsetX || 0
        const offsetY = headshotCrop.offsetY || 0
        const scale = headshotCrop.scale || 1
        cropStyle = ` style="transform: translate(${offsetX}px, ${offsetY}px) scale(${scale}); transform-origin: center center;"`
      }

      const headshotImg = headshotUrl
        ? `<div class="agent-headshot-wrapper"><img src="${escapeAttr(headshotUrl)}" alt="${escapeAttr(fullName)}" class="agent-headshot-img"${cropStyle} onerror="this.onerror=null; this.style.display='none'; const placeholder = this.parentElement.nextElementSibling; if(placeholder) placeholder.style.display='flex';"></div>`
        : ''
      const placeholderDiv = `<div class="agent-headshot-placeholder" style="background-color: #FFFFFF; color: #000000; display: ${headshotUrl ? 'none' : 'flex'}; align-items: center; justify-content: center; font-weight: 600; font-size: 18px;">${escapeHtml(initials)}</div>`
      const headshotDisplay = headshotUrl ? headshotImg + placeholderDiv : placeholderDiv
      return [
        '                        <tr',
        `                            data-index="${index}"`,
        `                            data-name="${escapeAttr(fullName.toLowerCase())}"`,
        `                            data-email="${escapeAttr((agent.email || '').toLowerCase())}"`,
        `                            data-office="${escapeAttr((agent.office || '').trim().toLowerCase())}"`,
        `                            data-team="${escapeAttr((agent.team_name || '').trim().toLowerCase())}"`,
        `                            data-division="${escapeAttr((division || '').trim().toLowerCase())}"`,
        `                            data-phone="${escapeAttr(phoneDigits)}"`,
        `                            data-birthday="${escapeAttr(birthday.toLowerCase())}"`,
        `                            data-job-title="${escapeAttr(agent.job_title || '')}"`,
        `                            data-headshot="${escapeAttr(headshotUrl)}"`,
        `                            data-ig="${escapeAttr((social.instagram || '').toLowerCase())}"`,
        `                            data-tiktok="${escapeAttr((social.tiktok || '').toLowerCase())}"`,
        `                            data-threads="${escapeAttr((social.threads || '').toLowerCase())}"`,
        `                            data-youtube="${escapeAttr((social.youtube || '').toLowerCase())}"`,
        `                            data-linkedin="${escapeAttr((social.linkedin || '').toLowerCase())}"`,
        `                            data-facebook="${escapeAttr((social.facebook || '').toLowerCase())}"`,
        `                            data-headshot-crop="${escapeAttr(headshotCrop ? JSON.stringify(headshotCrop) : '')}"`,
        '                        >',
        `                            <td class="index-col row-number">${index + 1}</td>`,
        `                            <td class="headshot-col">${headshotDisplay}</td>`,
        `                            <td class="font-medium">${escapeHtml(fullName)}</td>`,
        `                            <td class="text-sm">${escapeHtml(agent.email || '')}</td>`,
        `                            <td>${escapeHtml(officeDisplay)}</td>`,
        `                            <td>${escapeHtml(roleLabel)}</td>`,
        `                            <td class="text-sm">${escapeHtml(additionalRoles)}</td>`,
        `                            <td>${escapeHtml(team)}</td>`,
        `                            <td class="text-sm">${escapeHtml(formattedPhone)}</td>`,
        `                            <td class="text-sm">${escapeHtml(birthday)}</td>`,
        '                            <td>',
        '                                <div class="social-icons">',
        `                                    ${buildSocialIcons(agent) || '-'}`,
        '                                </div>',
        '                            </td>',
        `                            <td>${escapeHtml(division)}</td>`,
        '                        </tr>',
      ].join('\n')
    })
    .join('\n')

const buildOptions = (values: string[]) =>
  values
    .map(
      value =>
        `                        <option value="${escapeAttr(value.toLowerCase())}">${escapeHtml(value)}</option>`
    )
    .join('\n')

export const buildRosterHtml = ({
  agentCount,
  officeOptions,
  teamOptions,
  divisionOptions,
  tableRows,
}: {
  agentCount: number
  officeOptions: string
  teamOptions: string
  divisionOptions: string
  tableRows: string
}) => {
  const parts: string[] = []
  parts.push(
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '    <meta charset="UTF-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '    <title>CRC Agent Roster</title>',
    '    <link rel="preconnect" href="https://fonts.googleapis.com">',
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '    <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">',
    '    <style>'
  )
  parts.push(
    '        * {',
    '            margin: 0;',
    '            padding: 0;',
    '            box-sizing: border-box;',
    '        }'
  )
  parts.push(
    '        body {',
    "            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;",
    '            background: #f9f9f9;',
    '            min-height: 100vh;',
    '            padding: 24px;',
    '        }'
  )
  parts.push(
    '        .container {',
    '            max-width: 1400px;',
    '            margin: 0 auto;',
    '        }'
  )
  // .header CSS removed
  // .logo CSS removed
  parts.push(
    '        .page-title {',
    '            text-align: center;',
    '            margin-bottom: 24px;',
    '        }'
  )
  parts.push(
    '        .page-title h1 {',
    '            font-size: 18px;',
    '            font-weight: 600;',
    '            color: #1a1a1a;',
    '            letter-spacing: 0.1em;',
    '            text-transform: uppercase;',
    '            margin-bottom: 4px;',
    '        }'
  )
  parts.push(
    '        .page-title p {',
    '            font-size: 13px;',
    '            color: #888888;',
    '        }'
  )
  parts.push(
    '        .card {',
    '            background-color: white;',
    '            border-radius: 8px;',
    '            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);',
    '            border: 1px solid #e5e7eb;',
    '            overflow: hidden;',
    '            margin-bottom: 20px;',
    '            padding: 20px;',
    '        }'
  )
  parts.push('        .filter-card {', '            padding: 20px;', '        }')
  parts.push(
    '        .filter-title {',
    '            font-size: 18px;',
    '            font-weight: 600;',
    '            color: #111827;',
    '            margin-bottom: 16px;',
    '            display: flex;',
    '            align-items: center;',
    '            gap: 8px;',
    '        }'
  )
  parts.push(
    '        .search-container {',
    '            margin-bottom: 16px;',
    '            position: relative;',
    '        }'
  )
  parts.push(
    '        .search-icon {',
    '            position: absolute;',
    '            left: 12px;',
    '            top: 50%;',
    '            transform: translateY(-50%);',
    '            color: #9ca3af;',
    '        }'
  )
  parts.push(
    '        .search-input {',
    '            width: 100%;',
    '            padding: 10px 10px 10px 40px;',
    '            border: 1px solid #d1d5db;',
    '            border-radius: 8px;',
    '            font-size: 14px;',
    '            outline: none;',
    '            transition: border-color 0.2s;',
    '        }'
  )
  parts.push('        .search-input:focus {', '            border-color: #3b82f6;', '        }')
  parts.push(
    '        .filters-grid {',
    '            display: grid;',
    '            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));',
    '            gap: 16px;',
    '        }'
  )
  parts.push(
    '        .filter-group {',
    '            display: flex;',
    '            flex-direction: column;',
    '            gap: 8px;',
    '        }'
  )
  parts.push(
    '        .filter-label {',
    '            font-size: 12px;',
    '            font-weight: 600;',
    '            color: #374151;',
    '            text-transform: uppercase;',
    '            letter-spacing: 0.05em;',
    '        }'
  )
  parts.push(
    '        .filter-select {',
    '            padding: 8px 12px;',
    '            border: 1px solid #d1d5db;',
    '            border-radius: 8px;',
    '            font-size: 14px;',
    '            background-color: white;',
    '            cursor: pointer;',
    '            outline: none;',
    '            transition: border-color 0.2s;',
    '        }'
  )
  parts.push('        .filter-select:focus {', '            border-color: #3b82f6;', '        }')
  parts.push('        .table-container {', '            overflow-x: auto;', '        }')
  parts.push(
    '        table {',
    '            width: 100%;',
    '            border-collapse: collapse;',
    '        }'
  )
  parts.push(
    '        th {',
    '            background-color: #f9fafb;',
    '            padding: 12px 8px;',
    '            text-align: left;',
    '            font-weight: 600;',
    '            font-size: 12px;',
    '            color: #374151;',
    '            border-bottom: 1px solid #e5e7eb;',
    '            text-transform: uppercase;',
    '            letter-spacing: 0.05em;',
    '        }'
  )
  parts.push(
    '        td {',
    '            padding: 16px 8px;',
    '            font-size: 14px;',
    '            color: #111827;',
    '            border-bottom: 1px solid #e5e7eb;',
    '        }'
  )
  parts.push('        tr:last-child td {', '            border-bottom: none;', '        }')
  parts.push('        tr:hover {', '            background-color: #f9fafb;', '        }')
  parts.push(
    '        .index-col {',
    '            text-align: center;',
    '            font-weight: 600;',
    '            color: #6b7280;',
    '            width: 60px;',
    '        }'
  )
  parts.push(
    '        .headshot-col {',
    '            width: 60px;',
    '            padding: 8px;',
    '            text-align: center;',
    '        }'
  )
  parts.push(
    '        .agent-headshot-wrapper {',
    '            width: 48px;',
    '            height: 48px;',
    '            border-radius: 50%;',
    '            border: 2px solid #e5e7eb;',
    '            display: inline-block;',
    '            overflow: hidden;',
    '            position: relative;',
    '        }',
    '        .agent-headshot-img {',
    '            width: 100%;',
    '            height: 100%;',
    '            object-fit: cover;',
    '        }'
  )
  parts.push(
    '        .agent-headshot-placeholder {',
    '            width: 48px;',
    '            height: 48px;',
    '            border-radius: 50%;',
    '            background-color: #f3f4f6;',
    '            border: 2px solid #e5e7eb;',
    '            display: inline-block;',
    '        }'
  )
  parts.push('        .font-medium {', '            font-weight: 500;', '        }')
  parts.push('        .text-sm {', '            font-size: 13px;', '        }')
  parts.push(
    '        .social-icons {',
    '            display: flex;',
    '            gap: 8px;',
    '            align-items: center;',
    '        }'
  )
  parts.push(
    '        .social-icon {',
    '            color: #000;',
    '            transition: opacity 0.2s;',
    '        }'
  )
  parts.push('        .social-icon:hover {', '            opacity: 0.7;', '        }')
  parts.push(
    '        .social-icon svg {',
    '            width: 16px;',
    '            height: 16px;',
    '        }'
  )
  parts.push(
    '        a {',
    '            color: inherit;',
    '            text-decoration: none;',
    '        }'
  )
  parts.push(
    '        .footer {',
    '            background-color: #000;',
    '            border-top: 1px solid #1f2937;',
    '            padding: 16px;',
    '            margin-top: 24px;',
    '            text-align: center;',
    '        }'
  )
  parts.push(
    '        .footer p {',
    '            color: white;',
    '            font-size: 14px;',
    '        }'
  )
  parts.push(
    '        .no-results {',
    '            text-align: center;',
    '            padding: 40px;',
    '            color: #6b7280;',
    '            font-size: 14px;',
    '        }'
  )
  parts.push(
    '        .active-filters {',
    '            display: flex;',
    '            flex-wrap: wrap;',
    '            gap: 8px;',
    '            margin-top: 12px;',
    '            align-items: center;',
    '        }'
  )
  parts.push(
    '        .active-filters-label {',
    '            font-size: 12px;',
    '            font-weight: 600;',
    '            color: #6b7280;',
    '            margin-right: 4px;',
    '        }'
  )
  parts.push(
    '        .filter-chip {',
    '            display: inline-flex;',
    '            align-items: center;',
    '            gap: 6px;',
    '            padding: 6px 12px;',
    '            background-color: #eff6ff;',
    '            border: 1px solid #3b82f6;',
    '            border-radius: 16px;',
    '            font-size: 13px;',
    '            color: #1e40af;',
    '        }'
  )
  parts.push('        .filter-chip-label {', '            font-weight: 500;', '        }')
  parts.push('        .filter-chip-value {', '            font-weight: 600;', '        }')
  parts.push(
    '        .filter-chip-remove {',
    '            cursor: pointer;',
    '            color: #3b82f6;',
    '            font-weight: bold;',
    '            font-size: 16px;',
    '            line-height: 1;',
    '            padding: 0 2px;',
    '            transition: color 0.2s;',
    '        }'
  )
  parts.push('        .filter-chip-remove:hover {', '            color: #1e40af;', '        }')
  parts.push(
    '        .clear-all-filters {',
    '            padding: 6px 12px;',
    '            background-color: #f3f4f6;',
    '            border: 1px solid #d1d5db;',
    '            border-radius: 6px;',
    '            font-size: 12px;',
    '            color: #374151;',
    '            cursor: pointer;',
    '            transition: all 0.2s;',
    '            font-weight: 500;',
    '        }'
  )
  parts.push(
    '        .clear-all-filters:hover {',
    '            background-color: #e5e7eb;',
    '            border-color: #9ca3af;',
    '        }'
  )
  parts.push(
    '        .filters-info {',
    '            font-size: 12px;',
    '            color: #6b7280;',
    '            margin-top: 8px;',
    '            font-style: italic;',
    '        }'
  )
  parts.push(
    '        .mobile-cards {',
    '            display: none;',
    '            background: transparent;',
    '        }'
  )
  parts.push(
    '        .mobile-card {',
    '            background: white;',
    '            border-radius: 12px;',
    '            padding: 12px 16px;',
    '            margin-bottom: 16px;',
    '            box-shadow: 0 1px 3px rgba(0,0,0,0.1);',
    '        }'
  )
  parts.push(
    '        .mobile-card-header {',
    '            display: flex;',
    '            justify-content: space-between;',
    '            align-items: flex-start;',
    '            cursor: pointer;',
    '            width: 100%;',
    '        }'
  )
  parts.push(
    '        .mobile-card-header-left {',
    '            flex: 1;',
    '            min-width: 0;',
    '        }'
  )
  parts.push(
    '        .mobile-card-name {',
    '            font-size: 16px;',
    '            font-weight: 600;',
    '            color: #111827;',
    '            margin-bottom: 4px;',
    '            line-height: 1.3;',
    '        }'
  )
  parts.push(
    '        .mobile-card-title {',
    '            font-size: 14px;',
    '            color: #6b7280;',
    '            line-height: 1.3;',
    '            min-height: 18px;',
    '        }'
  )
  parts.push(
    '        .mobile-card-chevron {',
    '            width: 8px;',
    '            height: 8px;',
    '            border-right: 1.5px solid #9ca3af;',
    '            border-bottom: 1.5px solid #9ca3af;',
    '            transform: rotate(45deg);',
    '            transition: transform 0.2s;',
    '            flex-shrink: 0;',
    '            margin-top: 4px;',
    '        }'
  )
  parts.push(
    '        .mobile-card-chevron.expanded {',
    '            transform: rotate(225deg);',
    '        }'
  )
  parts.push(
    '        .mobile-card-details {',
    '            display: none;',
    '            margin-top: 16px;',
    '            padding-top: 16px;',
    '            border-top: 1px solid #e5e7eb;',
    '        }'
  )
  parts.push('        .mobile-card-details.expanded {', '            display: block;', '        }')
  parts.push(
    '        .mobile-card-detail-row {',
    '            display: flex;',
    '            margin-bottom: 12px;',
    '            font-size: 14px;',
    '        }'
  )
  parts.push(
    '        .mobile-card-detail-label {',
    '            font-weight: 600;',
    '            color: #374151;',
    '            min-width: 80px;',
    '            margin-right: 8px;',
    '        }'
  )
  parts.push(
    '        .mobile-card-detail-value {',
    '            color: #111827;',
    '            flex: 1;',
    '        }'
  )
  parts.push(
    '        .mobile-card-detail-value a {',
    '            color: #111827;',
    '            text-decoration: none;',
    '        }'
  )
  parts.push(
    '        .mobile-card-headshot-container {',
    '            text-align: center;',
    '            margin-bottom: 16px;',
    '            padding-bottom: 16px;',
    '            border-bottom: 1px solid #e5e7eb;',
    '        }'
  )
  parts.push(
    '        .mobile-card-headshot {',
    '            width: 80px;',
    '            height: 80px;',
    '            border-radius: 50%;',
    '            object-fit: cover;',
    '            border: 2px solid #e5e7eb;',
    '            display: inline-block;',
    '        }'
  )
  parts.push(
    '        .mobile-card-headshot-placeholder {',
    '            width: 80px;',
    '            height: 80px;',
    '            border-radius: 50%;',
    '            background-color: #f3f4f6;',
    '            border: 2px solid #e5e7eb;',
    '            display: inline-block;',
    '            margin: 0 auto;',
    '        }'
  )
  parts.push(
    '        @media (max-width: 768px) {',
    '            body {',
    '                padding: 16px;',
    '            }',
    '            .header {',
    '                padding: 12px 16px;',
    '                margin-bottom: 16px;',
    '            }',
    '            .logo {',
    '                height: 48px;',
    '            }',
    '            .page-title h1 {',
    '                font-size: 18px;',
    '            }',
    '            .filter-card {',
    '                padding: 16px;',
    '            }',
    '            .table-container {',
    '                display: none;',
    '            }',
    '            .mobile-cards {',
    '                display: block;',
    '                background: transparent;',
    '            }',
    '            .card:has(.mobile-cards) {',
    '                background-color: transparent !important;',
    '                box-shadow: none !important;',
    '            }',
    '            @supports not selector(:has(*)) {',
    '                .card:not(.filter-card) {',
    '                    background-color: transparent !important;',
    '                    box-shadow: none !important;',
    '                }',
    '            }',
    '        }'
  )
  parts.push(
    '        @media print {',
    '            body {',
    '                background: white;',
    '                padding: 0;',
    '            }',
    '            .header, .footer, .filter-card {',
    '                background-color: #000 !important;',
    '                -webkit-print-color-adjust: exact;',
    '                print-color-adjust: exact;',
    '            }',
    '            .filter-card {',
    '                display: none;',
    '            }',
    '        }'
  )
  parts.push('    </style>', '</head>', '<body>')
  // Header removed - handled by LuxuryHeader component
  parts.push('    <div class="container">')
  parts.push(
    '        <div class="page-title">',
    '            <h1>Agent Roster</h1>',
    `            <p id="agent-count">${agentCount} active agents</p>`,
    '        </div>'
  )
  parts.push(
    '        <div class="card filter-card">',
    '            <div class="filter-title">',
    '                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
    '                    <circle cx="11" cy="11" r="8"></circle>',
    '                    <path d="m21 21-4.35-4.35"></path>',
    '                </svg>',
    '                Search & Filter',
    '            </div>'
  )
  parts.push(
    '            <div class="search-container">',
    '                <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
    '                    <circle cx="11" cy="11" r="8"></circle>',
    '                    <path d="m21 21-4.35-4.35"></path>',
    '                </svg>',
    '                <input',
    '                    type="text"',
    '                    id="searchInput"',
    '                    class="search-input"',
    '                    placeholder="Search by name, email, phone, social media, or birthday month..."',
    '                    onkeyup="filterTable()"',
    '                >',
    '            </div>'
  )
  parts.push('            <div class="filters-grid">')
  parts.push(
    '                <div class="filter-group">',
    '                    <label class="filter-label" for="officeFilter">Office</label>',
    '                    <select id="officeFilter" class="filter-select" onchange="filterTable()">',
    '                        <option value="all">All Offices</option>'
  )
  parts.push(officeOptions || '')
  parts.push('                    </select>', '                </div>')
  parts.push(
    '                <div class="filter-group">',
    '                    <label class="filter-label" for="teamFilter">Team</label>',
    '                    <select id="teamFilter" class="filter-select" onchange="filterTable()">',
    '                        <option value="all">All Teams</option>'
  )
  parts.push(teamOptions || '')
  parts.push('                    </select>', '                </div>')
  parts.push(
    '                <div class="filter-group">',
    '                    <label class="filter-label" for="divisionFilter">Division</label>',
    '                    <select id="divisionFilter" class="filter-select" onchange="filterTable()">',
    '                        <option value="all">All Divisions</option>'
  )
  parts.push(divisionOptions || '')
  parts.push('                    </select>', '                </div>')
  parts.push('            </div>')
  parts.push(
    '            <div id="activeFilters" class="active-filters" style="display: none;"></div>'
  )
  parts.push(
    '            <div id="filtersInfo" class="filters-info" style="display: none;">Filters are combined (AND logic) - showing agents that match all selected filters</div>'
  )
  parts.push('        </div>')
  parts.push(
    '        <div class="card">',
    '            <div class="table-container">',
    '                <table id="agentTable">',
    '                    <thead>',
    '                        <tr>',
    '                            <th class="index-col">#</th>',
    '                            <th class="headshot-col">Photo</th>',
    '                            <th>Agent Name</th>',
    '                            <th>Email</th>',
    '                            <th>Office</th>',
    '                            <th>Role</th>',
    '                            <th>Additional Roles</th>',
    '                            <th>Team</th>',
    '                            <th>Phone</th>',
    '                            <th>Birthday</th>',
    '                            <th>Social Media</th>',
    '                            <th>Division</th>',
    '                        </tr>',
    '                    </thead>',
    '                    <tbody>'
  )
  parts.push(tableRows || '')
  parts.push(
    '                    </tbody>',
    '                </table>',
    '                <div id="noResults" class="no-results" style="display: none;">',
    '                    <p>No agents match your search criteria</p>',
    '                </div>',
    '            </div>',
    '            <div id="mobileCards" class="mobile-cards"></div>',
    '        </div>',
    '    </div>'
  )
  parts.push(
    '    <div class="footer">',
    `        <p>© ${new Date().getFullYear()} Collective Realty Co. All rights reserved.</p>`,
    '    </div>'
  )
  // Build script content with escaped backticks to avoid parsing issues
  const scriptContent = [
    '    <script>',
    '        function formatPhone(phone) {',
    '            if (!phone || phone.length !== 10) return phone;',
    "            return '(' + phone.slice(0, 3) + ') ' + phone.slice(3, 6) + '-' + phone.slice(6);",
    '        }',
    '',
    '        function capitalizeFirst(str) {',
    "            if (!str) return '';",
    '            return str.charAt(0).toUpperCase() + str.slice(1);',
    '        }',
    '',
    '        function createMobileCards() {',
    '            try {',
    "                const table = document.getElementById('agentTable');",
    '                if (!table) {',
    "                    console.error('agentTable not found');",
    '                    return;',
    '                }',
    "                const tbody = table.getElementsByTagName('tbody')[0];",
    '                if (!tbody) {',
    "                    console.error('tbody not found');",
    '                    return;',
    '                }',
    "                const rows = tbody.getElementsByTagName('tr');",
    "                const mobileCardsContainer = document.getElementById('mobileCards');",
    '                if (!mobileCardsContainer) {',
    "                    console.error('mobileCards container not found');",
    '                    return;',
    '                }',
    "                mobileCardsContainer.innerHTML = '';",
    '                for (let i = 0; i < rows.length; i++) {',
    '                    const row = rows[i];',
    "                    const name = row.getAttribute('data-name') || '';",
    "                    const email = row.getAttribute('data-email') || '';",
    "                    const office = (row.getAttribute('data-office') || '').trim().toLowerCase();",
    "                    const team = (row.getAttribute('data-team') || '').trim().toLowerCase();",
    "                    const division = (row.getAttribute('data-division') || '').trim().toLowerCase();",
    "                    const phone = row.getAttribute('data-phone') || '';",
    "                    const birthday = row.getAttribute('data-birthday') || '';",
    "                    const headshot = row.getAttribute('data-headshot') || '';",
    "                    const headshotCropStr = row.getAttribute('data-headshot-crop') || '';",
    '                    let headshotCrop = null;',
    '                    if (headshotCropStr) {',
    '                        try {',
    '                            headshotCrop = JSON.parse(headshotCropStr);',
    '                        } catch (e) {',
    '                            headshotCrop = null;',
    '                        }',
    '                    }',
    "                    const role = row.cells[5]?.textContent?.trim() || '';",
    "                    const additionalRoles = row.cells[6]?.textContent?.trim() || '-';",
    '                    const socialMediaCell = row.cells[10];',
    "                    const socialMediaHTML = socialMediaCell ? socialMediaCell.innerHTML : '';",
    "                    const card = document.createElement('div');",
    "                    card.className = 'mobile-card';",
    "                    const isRowHidden = row.style.display === 'none';",
    "                    card.style.display = isRowHidden ? 'none' : 'block';",
    "                    card.setAttribute('data-row-index', i.toString());",
    "                    const displayName = capitalizeFirst(name.split(' ').map(word => capitalizeFirst(word)).join(' '));",
    "                    const jobTitle = row.getAttribute('data-job-title') || '';",
    "                    let displayTitle = '';",
    '                    if (jobTitle) {',
    '                        displayTitle = jobTitle;',
    '                    } else if (office && role) {',
    "                        displayTitle = office + ' • ' + role;",
    '                    } else if (office) {',
    '                        displayTitle = office;',
    '                    } else if (role) {',
    '                        displayTitle = role;',
    '                    }',
    "                    const firstName = row.cells[2]?.textContent?.trim().split(' ')[0] || '';",
    "                    const lastName = row.cells[2]?.textContent?.trim().split(' ').slice(1).join(' ') || '';",
    "                    const firstInitial = firstName.charAt(0)?.toUpperCase() || '';",
    "                    const lastInitial = lastName.charAt(0)?.toUpperCase() || '';",
    "                    const initials = (firstInitial + lastInitial) || '?';",
    "                    let cropStyle = '';",
    '                    if (headshotCrop && headshot) {',
    '                        const offsetX = headshotCrop.offsetX || 0;',
    '                        const offsetY = headshotCrop.offsetY || 0;',
    '                        const scale = headshotCrop.scale || 1;',
    "                        cropStyle = ' style=\"transform: translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + '); transform-origin: center center;\"';",
    '                    }',
    "                    const headshotHTML = headshot ? '<img src=\"' + headshot + '\" alt=\"' + displayName + '\" class=\"mobile-card-headshot\"' + cropStyle + ' onerror=\"this.onerror=null; this.style.display=\\'none\\'; const placeholder = this.nextElementSibling; if(placeholder) placeholder.style.display=\\'flex\\';\">' : '';",
    "                    const placeholderHTML = '<div class=\"mobile-card-headshot-placeholder\" style=\"background-color: #FFFFFF; color: #000000; display: ' + (headshot ? 'none' : 'flex') + '; align-items: center; justify-content: center; font-weight: 600; font-size: 32px;\">' + initials + '</div>';",
    '                    const headshotDisplay = headshotHTML + placeholderHTML;',
    "                    const cardHTML = '<div class=\"mobile-card-header\" onclick=\"toggleCard(' + i + ')\"><div class=\"mobile-card-header-left\"><div class=\"mobile-card-name\">' + (displayName || 'Unknown Agent') + '</div><div class=\"mobile-card-title\">' + (displayTitle || '') + '</div></div><div class=\"mobile-card-chevron\" id=\"chevron-' + i + '\"></div></div><div class=\"mobile-card-details\" id=\"details-' + i + '\"><div class=\"mobile-card-headshot-container\">' + headshotDisplay + '</div>' + (email ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">EMAIL:</div><div class=\"mobile-card-detail-value\"><a href=\"mailto:' + email + '\">' + email + '</a></div></div>' : '') + (phone ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">PHONE:</div><div class=\"mobile-card-detail-value\"><a href=\"tel:' + phone + '\">' + formatPhone(phone) + '</a></div></div>' : '') + (team ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">TEAM:</div><div class=\"mobile-card-detail-value\">' + team + '</div></div>' : '') + (birthday ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">BIRTHDAY:</div><div class=\"mobile-card-detail-value\">' + capitalizeFirst(birthday) + '</div></div>' : '') + (socialMediaHTML ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">SOCIAL MEDIA:</div><div class=\"mobile-card-detail-value\">' + socialMediaHTML + '</div></div>' : '') + (division && division !== '-' ? '<div class=\"mobile-card-detail-row\"><div class=\"mobile-card-detail-label\">DIVISION:</div><div class=\"mobile-card-detail-value\">' + division + '</div></div>' : '') + '</div>';",
    '                    card.innerHTML = cardHTML;',
    '                    mobileCardsContainer.appendChild(card);',
    '                }',
    '            } catch (error) {',
    "                console.error('Error creating mobile cards:', error);",
    '            }',
    '        }',
    '',
    '        function toggleCard(index) {',
    "            const details = document.getElementById('details-' + index);",
    "            const chevron = document.getElementById('chevron-' + index);",
    "            if (details.classList.contains('expanded')) {",
    "                details.classList.remove('expanded');",
    "                chevron.classList.remove('expanded');",
    '            } else {',
    "                details.classList.add('expanded');",
    "                chevron.classList.add('expanded');",
    '            }',
    '        }',
    '',
    '        function filterTable() {',
    "            const searchInput = document.getElementById('searchInput').value.toLowerCase();",
    "            const officeFilterValue = document.getElementById('officeFilter').value.trim();",
    "            const teamFilterValue = document.getElementById('teamFilter').value.trim();",
    "            const divisionFilterValue = document.getElementById('divisionFilter').value.trim();",
    "            const officeFilter = officeFilterValue === 'all' ? 'all' : officeFilterValue.toLowerCase();",
    "            const teamFilter = teamFilterValue === 'all' ? 'all' : teamFilterValue.toLowerCase();",
    "            const divisionFilter = divisionFilterValue === 'all' ? 'all' : divisionFilterValue.toLowerCase();",
    "            const table = document.getElementById('agentTable');",
    "            const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');",
    '            let visibleCount = 0;',
    '            for (let i = 0; i < rows.length; i++) {',
    '                const row = rows[i];',
    "                const name = row.getAttribute('data-name');",
    "                const email = row.getAttribute('data-email');",
    "                const office = (row.getAttribute('data-office') || '').trim().toLowerCase();",
    "                const team = (row.getAttribute('data-team') || '').trim().toLowerCase();",
    "                const division = (row.getAttribute('data-division') || '').trim().toLowerCase();",
    "                const phone = row.getAttribute('data-phone');",
    "                const birthday = row.getAttribute('data-birthday');",
    "                const ig = row.getAttribute('data-ig');",
    "                const tiktok = row.getAttribute('data-tiktok');",
    "                const threads = row.getAttribute('data-threads');",
    "                const youtube = row.getAttribute('data-youtube');",
    "                const linkedin = row.getAttribute('data-linkedin');",
    "                const facebook = row.getAttribute('data-facebook');",
    '                const matchesSearch = !searchInput ||',
    '                    name.includes(searchInput) ||',
    '                    email.includes(searchInput) ||',
    '                    phone.includes(searchInput) ||',
    '                    birthday.includes(searchInput) ||',
    '                    ig.includes(searchInput) ||',
    '                    tiktok.includes(searchInput) ||',
    '                    threads.includes(searchInput) ||',
    '                    youtube.includes(searchInput) ||',
    '                    linkedin.includes(searchInput) ||',
    '                    facebook.includes(searchInput);',
    "                const matchesOffice = officeFilter === 'all' || office === officeFilter;",
    "                const matchesTeam = teamFilter === 'all' || team === teamFilter;",
    '                // Handle multiple divisions (split by |)',
    '                let matchesDivision = false;',
    "                if (divisionFilter === 'all') {",
    '                    matchesDivision = true;',
    "                } else if (division && division !== '-' && division.trim().length > 0) {",
    '                    // Split by |, trim each part, lowercase, and filter out empty strings and dashes',
    "                    const agentDivisions = division.split('|').map(d => d.trim().toLowerCase()).filter(d => d.length > 0 && d !== '-');",
    '                    matchesDivision = agentDivisions.includes(divisionFilter);',
    '                }',
    '                if (matchesSearch && matchesOffice && matchesTeam && matchesDivision) {',
    "                    row.style.display = '';",
    '                    visibleCount++;',
    "                    const rowNumber = row.querySelector('.row-number');",
    '                    if (rowNumber) {',
    '                        rowNumber.textContent = visibleCount;',
    '                    }',
    "                    const mobileCard = document.querySelector('.mobile-card[data-row-index=\"' + i + '\"]');",
    '                    if (mobileCard) {',
    "                        mobileCard.style.display = 'block';",
    '                    }',
    '                } else {',
    "                    row.style.display = 'none';",
    "                    const mobileCard = document.querySelector('.mobile-card[data-row-index=\"' + i + '\"]');",
    '                    if (mobileCard) {',
    "                        mobileCard.style.display = 'none';",
    '                    }',
    '                }',
    '            }',
    "            document.getElementById('agent-count').textContent = visibleCount + ' agent' + (visibleCount !== 1 ? 's' : '');",
    "            document.getElementById('noResults').style.display = visibleCount === 0 ? 'block' : 'none';",
    '            updateActiveFilters();',
    '            if (window.innerWidth <= 768) {',
    '                createMobileCards();',
    '            }',
    '        }',
    '',
    '        function updateActiveFilters() {',
    "            const activeFiltersContainer = document.getElementById('activeFilters');",
    "            const filtersInfo = document.getElementById('filtersInfo');",
    '            if (!activeFiltersContainer) return;',
    '',
    "            const searchInput = document.getElementById('searchInput').value.trim();",
    "            const officeFilter = document.getElementById('officeFilter');",
    "            const teamFilter = document.getElementById('teamFilter');",
    "            const divisionFilter = document.getElementById('divisionFilter');",
    '',
    '            const activeFilters = [];',
    '',
    '            if (searchInput) {',
    "                activeFilters.push({ type: 'search', label: 'Search', value: searchInput });",
    '            }',
    "            if (officeFilter && officeFilter.value !== 'all') {",
    '                const selectedOption = officeFilter.options[officeFilter.selectedIndex];',
    "                activeFilters.push({ type: 'office', label: 'Office', value: selectedOption.text });",
    '            }',
    "            if (teamFilter && teamFilter.value !== 'all') {",
    '                const selectedOption = teamFilter.options[teamFilter.selectedIndex];',
    "                activeFilters.push({ type: 'team', label: 'Team', value: selectedOption.text });",
    '            }',
    "            if (divisionFilter && divisionFilter.value !== 'all') {",
    '                const selectedOption = divisionFilter.options[divisionFilter.selectedIndex];',
    "                activeFilters.push({ type: 'division', label: 'Division', value: selectedOption.text });",
    '            }',
    '',
    "            activeFiltersContainer.innerHTML = '';",
    '',
    '            if (activeFilters.length > 0) {',
    "                activeFiltersContainer.style.display = 'flex';",
    "                if (filtersInfo) filtersInfo.style.display = 'block';",
    '',
    '                activeFilters.forEach(filter => {',
    "                    const chip = document.createElement('div');",
    "                    chip.className = 'filter-chip';",
    '                    chip.innerHTML = \'<span class="filter-chip-label">\' + filter.label + \':</span><span class="filter-chip-value">\' + filter.value + \'</span><span class="filter-chip-remove" onclick="removeFilter(\\\'\' + filter.type + \'\\\')" title="Remove filter">×</span>\';',
    '                    activeFiltersContainer.appendChild(chip);',
    '                });',
    '',
    "                const clearAllBtn = document.createElement('button');",
    "                clearAllBtn.className = 'clear-all-filters';",
    "                clearAllBtn.textContent = 'Clear All';",
    '                clearAllBtn.onclick = clearAllFilters;',
    '                activeFiltersContainer.appendChild(clearAllBtn);',
    '            } else {',
    "                activeFiltersContainer.style.display = 'none';",
    "                if (filtersInfo) filtersInfo.style.display = 'none';",
    '            }',
    '        }',
    '',
    '        function removeFilter(filterType) {',
    "            if (filterType === 'search') {",
    "                document.getElementById('searchInput').value = '';",
    "            } else if (filterType === 'office') {",
    "                document.getElementById('officeFilter').value = 'all';",
    "            } else if (filterType === 'team') {",
    "                document.getElementById('teamFilter').value = 'all';",
    "            } else if (filterType === 'division') {",
    "                document.getElementById('divisionFilter').value = 'all';",
    '            }',
    '            filterTable();',
    '        }',
    '',
    '        function clearAllFilters() {',
    "            document.getElementById('searchInput').value = '';",
    "            document.getElementById('officeFilter').value = 'all';",
    "            document.getElementById('teamFilter').value = 'all';",
    "            document.getElementById('divisionFilter').value = 'all';",
    '            filterTable();',
    '        }',
    '',
    '        window.toggleCard = toggleCard;',
    '        window.removeFilter = removeFilter;',
    '        window.clearAllFilters = clearAllFilters;',
    '',
    '        function initMobileView() {',
    '            setTimeout(function() {',
    '                if (window.innerWidth <= 768) {',
    '                    createMobileCards();',
    '                }',
    '            }, 100);',
    '        }',
    '',
    "        if (document.readyState === 'loading') {",
    "            document.addEventListener('DOMContentLoaded', initMobileView);",
    '        } else {',
    '            initMobileView();',
    '        }',
    '',
    "        window.addEventListener('load', function() {",
    '            if (window.innerWidth <= 768) {',
    '                createMobileCards();',
    '            }',
    '        });',
    '',
    "        window.addEventListener('resize', function() {",
    '            if (window.innerWidth <= 768) {',
    '                createMobileCards();',
    '            } else {',
    "                const mobileCardsContainer = document.getElementById('mobileCards');",
    '                if (mobileCardsContainer) {',
    "                    mobileCardsContainer.innerHTML = '';",
    '                }',
    '            }',
    '        });',
    '    </script>',
    '</body>',
    '</html>',
  ].join('\n')

  parts.push(scriptContent)
  return parts.join('\n')
}