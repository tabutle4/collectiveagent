'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { Download, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function PublicRosterPage() {
  const [htmlContent, setHtmlContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [scriptsExecuted, setScriptsExecuted] = useState(false)

  useEffect(() => {
    fetch('/agent-roster.html')
      .then(res => res.text())
      .then(html => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        let styles = doc.querySelector('style')?.innerHTML || ''
        styles = styles.replace(
          /body\s*\{[^}]*\}/g,
          `body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: transparent;
            min-height: auto;
            padding: 0;
          }`
        )

        const scripts = doc.querySelectorAll('script')
        let scriptContent = ''
        scripts.forEach(script => {
          scriptContent += script.innerHTML + '\n'
        })

        let bodyContent = doc.querySelector('body')?.innerHTML || ''

        // Remove "Generated:" text from header
        const bodyParser = new DOMParser()
        const bodyDoc = bodyParser.parseFromString(`<div>${bodyContent}</div>`, 'text/html')
        const header = bodyDoc.querySelector('.header')
        if (header) {
          const generatedDiv = Array.from(header.children).find((child: any) =>
            (child.textContent || '').toLowerCase().includes('generated')
          )
          if (generatedDiv) generatedDiv.remove()
        }
        bodyContent = bodyDoc.body.innerHTML || ''

        const combinedHtml = `
          <style>${styles}</style>
          <div style="padding-top: 20px; background: transparent;">
            ${bodyContent}
          </div>
        `

        setHtmlContent(combinedHtml)
        ;(window as any).__rosterScripts = scriptContent
        setLoading(false)
      })
      .catch(error => {
        console.error('Error loading agent roster:', error)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!htmlContent || scriptsExecuted) return
    const scriptContent = (window as any).__rosterScripts
    if (scriptContent) {
      setTimeout(() => {
        try {
          const script = document.createElement('script')
          script.textContent = scriptContent
          document.body.appendChild(script)
          script.remove()
          setScriptsExecuted(true)
        } catch (error) {
          console.error('Error executing roster scripts:', error)
        }
      }, 200)
    }
  }, [htmlContent, scriptsExecuted])

  useEffect(() => {
    if (!htmlContent) return
    ;(window as any).filterTable = function () {
      if (!document.getElementById('agentTable')) return
      const searchInput =
        (document.getElementById('searchInput') as HTMLInputElement)?.value.toLowerCase() || ''
      const officeFilterValue = (
        (document.getElementById('officeFilter') as HTMLSelectElement)?.value || 'all'
      ).trim()
      const teamFilterValue = (
        (document.getElementById('teamFilter') as HTMLSelectElement)?.value || 'all'
      ).trim()
      const divisionFilterValue = (
        (document.getElementById('divisionFilter') as HTMLSelectElement)?.value || 'all'
      ).trim()
      const officeFilter = officeFilterValue === 'all' ? 'all' : officeFilterValue.toLowerCase()
      const teamFilter = teamFilterValue === 'all' ? 'all' : teamFilterValue.toLowerCase()
      const divisionFilter =
        divisionFilterValue === 'all' ? 'all' : divisionFilterValue.toLowerCase()

      const table = document.getElementById('agentTable')
      if (!table) return
      const rows = table.getElementsByTagName('tbody')[0]?.getElementsByTagName('tr') || []
      let visibleCount = 0

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const name = (row.getAttribute('data-name') || '').trim()
        const email = (row.getAttribute('data-email') || '').trim()
        const office = (row.getAttribute('data-office') || '').trim().toLowerCase()
        const team = (row.getAttribute('data-team') || '').trim().toLowerCase()
        const division = (row.getAttribute('data-division') || '').trim().toLowerCase()
        const phone = row.getAttribute('data-phone') || ''
        const birthday = row.getAttribute('data-birthday') || ''
        const ig = row.getAttribute('data-ig') || ''
        const tiktok = row.getAttribute('data-tiktok') || ''
        const threads = row.getAttribute('data-threads') || ''
        const youtube = row.getAttribute('data-youtube') || ''
        const linkedin = row.getAttribute('data-linkedin') || ''
        const facebook = row.getAttribute('data-facebook') || ''

        const matchesSearch =
          !searchInput ||
          name.includes(searchInput) ||
          email.includes(searchInput) ||
          phone.includes(searchInput) ||
          birthday.includes(searchInput) ||
          ig.includes(searchInput) ||
          tiktok.includes(searchInput) ||
          threads.includes(searchInput) ||
          youtube.includes(searchInput) ||
          linkedin.includes(searchInput) ||
          facebook.includes(searchInput)

        const matchesOffice = officeFilter === 'all' || office === officeFilter
        const matchesTeam = teamFilter === 'all' || team === teamFilter

        let matchesDivision = false
        if (divisionFilter === 'all') {
          matchesDivision = true
        } else if (division && division !== '-' && division.trim().length > 0) {
          const agentDivisions = division
            .split('|')
            .map((d: string) => d.trim().toLowerCase())
            .filter((d: string) => d.length > 0 && d !== '-')
          matchesDivision = agentDivisions.includes(divisionFilter)
        }

        if (matchesSearch && matchesOffice && matchesTeam && matchesDivision) {
          row.style.display = ''
          visibleCount++
          const rowNumber = row.querySelector('.row-number')
          if (rowNumber) rowNumber.textContent = String(visibleCount)
        } else {
          row.style.display = 'none'
        }
      }

      const agentCount = document.getElementById('agent-count')
      if (agentCount)
        agentCount.textContent = visibleCount + ' agent' + (visibleCount !== 1 ? 's' : '')

      const noResults = document.getElementById('noResults')
      if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none'
    }

    return () => {
      delete (window as any).filterTable
    }
  }, [htmlContent])

  // Get visible agents from the DOM table
  const getVisibleAgents = () => {
    const table = document.getElementById('agentTable')
    if (!table) return []
    
    const rows = table.getElementsByTagName('tbody')[0]?.getElementsByTagName('tr') || []
    const agents: any[] = []
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLTableRowElement
      if (row.style.display === 'none') continue
      
      const name = row.getAttribute('data-name') || ''
      const email = row.getAttribute('data-email') || ''
      const office = row.getAttribute('data-office') || ''
      const team = row.getAttribute('data-team') || ''
      const division = row.getAttribute('data-division') || ''
      const phone = row.getAttribute('data-phone') || ''
      const birthday = row.getAttribute('data-birthday') || ''
      const ig = row.getAttribute('data-ig') || ''
      const tiktok = row.getAttribute('data-tiktok') || ''
      const threads = row.getAttribute('data-threads') || ''
      const linkedin = row.getAttribute('data-linkedin') || ''
      const facebook = row.getAttribute('data-facebook') || ''
      const youtube = row.getAttribute('data-youtube') || ''
      
      // Get headshot URL from img if present
      const img = row.querySelector('img')
      const headshotUrl = img?.src || ''
      
      // Build social links string
      const socialLinks: string[] = []
      if (ig) socialLinks.push(`IG: ${ig}`)
      if (tiktok) socialLinks.push(`TT: ${tiktok}`)
      if (threads) socialLinks.push(`Threads: ${threads}`)
      if (linkedin) socialLinks.push('LinkedIn')
      if (facebook) socialLinks.push('Facebook')
      if (youtube) socialLinks.push('YouTube')
      
      agents.push({
        name,
        email,
        office,
        team,
        division,
        phone,
        birthday,
        socialLinks: socialLinks.join(', '),
        headshotUrl,
      })
    }
    
    return agents
  }

  const exportExcel = () => {
    const agents = getVisibleAgents()
    if (agents.length === 0) {
      alert('No agents to export')
      return
    }
    
    const data = agents.map((agent, index) => ({
      '#': index + 1,
      'Name': agent.name,
      'Email': agent.email,
      'Office': agent.office,
      'Team': agent.team,
      'Phone': agent.phone,
      'Birthday': agent.birthday,
      'Social Links': agent.socialLinks,
      'Division': agent.division,
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    
    ws['!cols'] = [
      { wch: 5 },  // #
      { wch: 25 }, // Name
      { wch: 30 }, // Email
      { wch: 12 }, // Office
      { wch: 20 }, // Team
      { wch: 15 }, // Phone
      { wch: 12 }, // Birthday
      { wch: 30 }, // Social
      { wch: 25 }, // Division
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Agents')
    XLSX.writeFile(wb, `agent_roster_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportPDF = () => {
    const agents = getVisibleAgents()
    if (agents.length === 0) {
      alert('No agents to export')
      return
    }
    
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    
    const tableRows = agents
      .map((agent) => {
        const headshotCell = agent.headshotUrl
          ? `<img src="${agent.headshotUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;object-position:center top;" />`
          : `<div style="width:24px;height:24px;border-radius:50%;background:#C5A278;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:600;">${(agent.name || '??').split(' ').map((n: string) => n[0] || '').join('').slice(0,2)}</div>`
        return `<tr>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;width:30px;">${headshotCell}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;"><strong>${agent.name}</strong></td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.email}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.office}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.team}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.phone}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.birthday}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.socialLinks}</td>
        <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:10px;">${agent.division}</td>
      </tr>`
      })
      .join('')
      
    printWindow.document
      .write(`<!DOCTYPE html><html><head><title>Agent Roster - Collective Realty Co.</title>
      <style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
      body{font-family:'Montserrat',sans-serif;padding:30px;color:#1A1A1A;font-size:10px;}
      h1{font-size:16px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;font-weight:600;}
      .subtitle{font-size:10px;color:#555;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}
      th{text-align:left;padding:6px 5px;border-bottom:2px solid #1A1A1A;font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#555;font-weight:600;}
      @media print{body{padding:15px;} @page{size:landscape;margin:0.4in;}}</style></head>
      <body><h1>Collective Realty Co. Agent Roster</h1>
      <p class="subtitle">${agents.length} agents | ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th></th><th>Name</th><th>Email</th><th>Office</th><th>Team</th><th>Phone</th><th>Birthday</th><th>Social</th><th>Division</th></tr></thead>
      <tbody>${tableRows}</tbody></table></body></html>`)
    printWindow.document.close()
    printWindow.onload = () => printWindow.print()
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}
    >
      {/* Corner lines background */}
      <CornerLines thickness="normal" />

      {/* Top accent bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: '#C5A278',
          width: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      />

      {/* Header - LuxuryHeader is position:fixed with z-50 */}
      <LuxuryHeader showTrainingCenter={false} />

      {/* Spacer for fixed header - LuxuryHeader is ~80px tall */}
      <div style={{ height: '80px' }} />

      {/* Export buttons - z-index 60 to be above fixed header (z-50) */}
      {!loading && (
        <div 
          style={{ 
            position: 'relative',
            zIndex: 60,
            backgroundColor: '#F9F9F9',
            borderBottom: '1px solid #E5E5E5',
            padding: '10px 24px',
          }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button 
              onClick={exportExcel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#fff',
                border: '1px solid #D4D4D4',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#1A1A1A',
                cursor: 'pointer',
              }}
            >
              <FileSpreadsheet size={14} /> Excel
            </button>
            <button 
              onClick={exportPDF}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#fff',
                border: '1px solid #D4D4D4',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#1A1A1A',
                cursor: 'pointer',
              }}
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>
      )}

      {/* Roster Content */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-gray-500 text-sm">Loading agent roster...</p>
          </div>
        ) : (
          <div
            className="agent-roster-container"
            style={{ margin: '0', padding: '0', width: '100%', overflowX: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <AuthFooter />
      </div>
    </div>
  )
}