'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'

export default function PublicRosterPage() {
  const [htmlContent, setHtmlContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [scriptsExecuted, setScriptsExecuted] = useState(false)

  useEffect(() => {
    // Load the HTML file (same as admin version)
    fetch('/agent-roster.html')
      .then((res) => res.text())
      .then((html) => {
        // Extract body content and styles from the HTML
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        // Get styles from head
        let styles = doc.querySelector('style')?.innerHTML || ''
        
        // Adjust body styles
        styles = styles.replace(
          /body\s*\{[^}]*\}/g,
          `body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: transparent;
            min-height: auto;
            padding: 0;
        }`
        )
        
        // Get scripts from body
        const scripts = doc.querySelectorAll('script')
        let scriptContent = ''
        scripts.forEach((script) => {
          scriptContent += script.innerHTML + '\n'
        })
        
        // Get body content (keep header for public page)
        let bodyContent = doc.querySelector('body')?.innerHTML || ''
        
        // Remove "Generated: November 19, 2025" text from header
        const bodyParser = new DOMParser()
        const bodyDoc = bodyParser.parseFromString(`<div>${bodyContent}</div>`, 'text/html')
        const header = bodyDoc.querySelector('.header')
        if (header) {
          // Remove the div with "Generated:" text
          const generatedDiv = Array.from(header.children).find((child: any) => {
            const text = child.textContent || ''
            return text.toLowerCase().includes('generated')
          })
          if (generatedDiv) {
            generatedDiv.remove()
          }
        }
        bodyContent = bodyDoc.body.innerHTML || ''
        
        // Combine styles and body content with wrapper
        const combinedHtml = `
          <style>${styles}</style>
          <div style="padding: 24px; background: linear-gradient(to bottom right, #f9fafb, #f3f4f6, #f9fafb); min-height: 100vh;">
            ${bodyContent}
          </div>
        `
        
        setHtmlContent(combinedHtml)
        
        // Store script content for execution after render
        ;(window as any).__rosterScripts = scriptContent
        
        setLoading(false)
      })
      .catch((error) => {
        console.error('Error loading agent roster:', error)
        setLoading(false)
      })
  }, [])

  // Execute scripts after HTML content is rendered
  useEffect(() => {
    if (!htmlContent || scriptsExecuted) return
    
    const scriptContent = (window as any).__rosterScripts
    if (scriptContent) {
      // Wait for DOM to be ready
      setTimeout(() => {
        try {
          // Create and execute script element
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

  // Inject the filterTable function into the window when HTML content loads
  useEffect(() => {
    if (!htmlContent) return
    
    // Define the filterTable function on window - make it available globally
    ;(window as any).filterTable = function() {
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
        
        // Check search term
        const matchesSearch = !searchInput || 
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
        
        // Check filters
        const matchesOffice = officeFilter === 'all' || office === officeFilter
        const matchesTeam = teamFilter === 'all' || team === teamFilter
        // Handle multiple divisions (split by |)
        let matchesDivision = false
        if (divisionFilter === 'all') {
          matchesDivision = true
        } else if (division && division !== '-' && division.trim().length > 0) {
          // Split by |, trim each part, lowercase, and filter out empty strings
          const agentDivisions = division.split('|').map(d => d.trim().toLowerCase()).filter(d => d.length > 0 && d !== '-')
          matchesDivision = agentDivisions.includes(divisionFilter)
        }
        
        if (matchesSearch && matchesOffice && matchesTeam && matchesDivision) {
          row.style.display = ''
          visibleCount++
          // Update row number
          const rowNumber = row.querySelector('.row-number')
          if (rowNumber) {
            rowNumber.textContent = String(visibleCount)
          }
        } else {
          row.style.display = 'none'
        }
      }
      
      // Update agent count
      const agentCount = document.getElementById('agent-count')
      if (agentCount) {
        agentCount.textContent = visibleCount + ' agent' + (visibleCount !== 1 ? 's' : '')
      }
      
      // Show/hide no results message
      const noResults = document.getElementById('noResults')
      if (noResults) {
        noResults.style.display = visibleCount === 0 ? 'block' : 'none'
      }
    }

    // Cleanup function
    return () => {
      delete (window as any).filterTable
    }
  }, [htmlContent])

  if (loading) {
    return (
      <>
        <LuxuryHeader />
        <div className="min-h-screen bg-luxury-light pt-24 px-4 flex items-center justify-center">
          <p className="text-luxury-gray-3">Loading agent roster...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <LuxuryHeader />
      <div className="pt-20">
        <div 
          className="agent-roster-container"
          style={{ 
            margin: '0',
            padding: '0',
            width: '100%',
            overflowX: 'hidden'
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </>
  )
}

