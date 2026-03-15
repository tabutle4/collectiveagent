'use client'

import { useEffect, useState } from 'react'

export default function AgentRosterPage() {
  const [htmlContent, setHtmlContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [publicLink, setPublicLink] = useState<string | null>(null)
  const [scriptsExecuted, setScriptsExecuted] = useState(false)

  useEffect(() => {
    fetch(`/agent-roster.html?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch roster: ${res.statusText}`)
        return res.text()
      })
      .then((html) => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        let styles = doc.querySelector('style')?.innerHTML || ''
        styles = styles.replace(
          /body\s*\{[^}]*\}/g,
          `body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: transparent; min-height: auto; padding: 0; }`
        )

        const scripts = doc.querySelectorAll('script')
        let scriptContent = ''
        scripts.forEach((script) => { scriptContent += script.innerHTML + '\n' })

        let bodyContent = doc.querySelector('body')?.innerHTML || ''
        const bodyParser = new DOMParser()
        const wrapper = bodyParser.parseFromString(`<div>${bodyContent}</div>`, 'text/html')
        const wrapperDiv = wrapper.querySelector('div')
        if (wrapperDiv) {
          const header = wrapperDiv.querySelector('.header')
          if (header) header.remove()
          const pageTitleH1 = wrapperDiv.querySelector('.page-title h1')
          if (pageTitleH1) pageTitleH1.remove()
          bodyContent = wrapperDiv.innerHTML || ''
        }

        const combinedHtml = `
          <style>${styles}</style>
          <div style="padding: 0; background: transparent; min-height: auto;">
            ${bodyContent}
          </div>
        `

        setHtmlContent(combinedHtml)
        ;(window as any).__rosterScripts = scriptContent
        setLoading(false)
      })
      .catch((error: any) => {
        console.error('Error loading agent roster:', error)
        setHtmlContent(`<div class="text-center py-12"><p class="text-sm text-luxury-gray-3">${error?.message || 'Failed to load agent roster'}</p></div>`)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!htmlContent || scriptsExecuted) return
    const scriptContent = (window as any).__rosterScripts
    if (scriptContent && scriptContent.trim()) {
      setTimeout(() => {
        try {
          let cleanedScript = scriptContent.replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '').trim()
          if (!cleanedScript) { setScriptsExecuted(true); return }
          const wrappedScript = `(function() { try { ${cleanedScript} } catch (e) { console.warn('Roster script error:', e); } })();`
          const script = document.createElement('script')
          script.type = 'text/javascript'
          script.textContent = wrappedScript
          document.body.appendChild(script)
          setTimeout(() => { try { script.parentNode?.removeChild(script) } catch {} }, 200)
          setScriptsExecuted(true)
        } catch (error) {
          console.error('Error executing roster scripts:', error)
          setScriptsExecuted(true)
        }
      }, 500)
    } else {
      setScriptsExecuted(true)
    }
  }, [htmlContent, scriptsExecuted])

  useEffect(() => {
    if (!htmlContent) return
    ;(window as any).filterTable = function() {
      if (!document.getElementById('agentTable')) return
      const searchInput = (document.getElementById('searchInput') as HTMLInputElement)?.value.toLowerCase() || ''
      const officeFilter = ((document.getElementById('officeFilter') as HTMLSelectElement)?.value || 'all').trim().toLowerCase()
      const teamFilter = ((document.getElementById('teamFilter') as HTMLSelectElement)?.value || 'all').trim().toLowerCase()
      const divisionFilter = ((document.getElementById('divisionFilter') as HTMLSelectElement)?.value || 'all').trim().toLowerCase()
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
        const matchesSearch = !searchInput || name.includes(searchInput) || email.includes(searchInput) || phone.includes(searchInput)
        const matchesOffice = officeFilter === 'all' || office === officeFilter
        const matchesTeam = teamFilter === 'all' || team === teamFilter
        let matchesDivision = divisionFilter === 'all'
        if (!matchesDivision && division && division !== '-') {
          const agentDivisions = division.split('|').map(d => d.trim().toLowerCase()).filter(d => d.length > 0 && d !== '-')
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
    return () => { try { delete (window as any).filterTable } catch {} }
  }, [htmlContent])

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
    setPublicLink(`${baseUrl}/roster`)
  }, [])

  const exportHTML = () => {
    if (!htmlContent) return
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CRC Agent Roster</title>${document.querySelector('.agent-roster-container')?.querySelector('style')?.outerHTML || ''}</head><body>${document.querySelector('.agent-roster-container')?.querySelector('div')?.innerHTML || ''}</body></html>`
    const blob = new Blob([fullHtml], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `agent-roster-${new Date().toISOString().split('T')[0]}.html`
    a.click()
  }

  const exportExcel = () => {
    const table = document.getElementById('agentTable')
    if (!table) return
    let csv = ''
    const rows = table.querySelectorAll('tr')
    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i].querySelectorAll('th, td')
      const rowData: string[] = []
      for (let j = 0; j < cols.length; j++) {
        let cellData = cols[j].textContent || ''
        if (j === 9) { const links = cols[j].querySelectorAll('a'); cellData = Array.from(links).map(a => a.href).join('; ') }
        cellData = cellData.replace(/"/g, '""')
        if (cellData.includes(',') || cellData.includes('\n') || cellData.includes('"')) cellData = `"${cellData}"`
        rowData.push(cellData)
      }
      csv += rowData.join(',') + '\n'
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `agent-roster-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CRC Agent Roster</title>${document.querySelector('.agent-roster-container')?.querySelector('style')?.outerHTML || ''}</head><body>${document.querySelector('.agent-roster-container')?.querySelector('div')?.innerHTML || ''}</body></html>`
    printWindow.document.write(fullHtml)
    printWindow.document.close()
    printWindow.onload = () => printWindow.print()
  }

  const sharePublicLink = () => {
    if (!publicLink) { alert('Public link not available'); return }
    navigator.clipboard.writeText(publicLink)
    alert('Public link copied to clipboard!')
  }

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading agent roster...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">ROSTER</h1>
      </div>

      <div className="container-card mb-5">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={exportHTML} className="btn btn-secondary">Export HTML</button>
            <button onClick={exportExcel} className="btn btn-secondary">Export Excel</button>
            <button onClick={exportPDF} className="btn btn-secondary">Export PDF</button>
            <button onClick={sharePublicLink} className="btn btn-primary">Share Link</button>
          </div>
          {publicLink && (
            <div className="flex-1">
              <input type="text" readOnly value={publicLink} className="input-luxury text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
            </div>
          )}
        </div>
      </div>

      <div
        className="agent-roster-container"
        style={{ margin: 0, padding: 0, width: '100%', overflowX: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  )
}