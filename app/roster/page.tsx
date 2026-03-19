'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'

export default function PublicRosterPage() {
  const [htmlContent, setHtmlContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [scriptsExecuted, setScriptsExecuted] = useState(false)

  useEffect(() => {
    fetch('/agent-roster.html')
      .then((res) => res.text())
      .then((html) => {
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
        scripts.forEach((script) => {
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
          <div style="padding: 24px; padding-top: 100px; background: transparent;">
            ${bodyContent}
          </div>
        `

        setHtmlContent(combinedHtml)
        ;(window as any).__rosterScripts = scriptContent
        setLoading(false)
      })
      .catch((error) => {
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
      const searchInput = (document.getElementById('searchInput') as HTMLInputElement)?.value.toLowerCase() || ''
      const officeFilterValue = ((document.getElementById('officeFilter') as HTMLSelectElement)?.value || 'all').trim()
      const teamFilterValue = ((document.getElementById('teamFilter') as HTMLSelectElement)?.value || 'all').trim()
      const divisionFilterValue = ((document.getElementById('divisionFilter') as HTMLSelectElement)?.value || 'all').trim()
      const officeFilter = officeFilterValue === 'all' ? 'all' : officeFilterValue.toLowerCase()
      const teamFilter = teamFilterValue === 'all' ? 'all' : teamFilterValue.toLowerCase()
      const divisionFilter = divisionFilterValue === 'all' ? 'all' : divisionFilterValue.toLowerCase()

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
          const agentDivisions = division.split('|').map((d: string) => d.trim().toLowerCase()).filter((d: string) => d.length > 0 && d !== '-')
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
      if (agentCount) agentCount.textContent = visibleCount + ' agent' + (visibleCount !== 1 ? 's' : '')

      const noResults = document.getElementById('noResults')
      if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none'
    }

    return () => { delete (window as any).filterTable }
  }, [htmlContent])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}>

      {/* Corner lines SVG background */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="0" x2="500" y2="500" stroke="#C5A278" strokeWidth="0.8" strokeOpacity="0.18"/>
        <line x1="0" y1="60" x2="500" y2="560" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.13"/>
        <line x1="0" y1="120" x2="400" y2="520" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.09"/>
        <line x1="60" y1="0" x2="560" y2="500" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.13"/>
        <line x1="120" y1="0" x2="520" y2="400" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.09"/>
        <line x1="100%" y1="100%" x2="calc(100% - 500px)" y2="calc(100% - 500px)" stroke="#C5A278" strokeWidth="0.8" strokeOpacity="0.15"/>
        <line x1="100%" y1="calc(100% - 60px)" x2="calc(100% - 500px)" y2="calc(100% - 560px)" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.1"/>
        <line x1="calc(100% - 60px)" y1="100%" x2="calc(100% - 560px)" y2="calc(100% - 500px)" stroke="#C5A278" strokeWidth="0.6" strokeOpacity="0.1"/>
      </svg>

      {/* Top accent bar */}
      <div style={{ height: '3px', backgroundColor: '#C5A278', width: '100%', position: 'relative', zIndex: 10 }} />

      {/* Header - sticky so it stays on top while scrolling */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F9F9F9' }}>
        <LuxuryHeader showTrainingCenter={false} />
      </div>

      {/* Roster Content - no extra padding needed since header is sticky not fixed */}
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