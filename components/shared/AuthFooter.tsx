'use client'

import { useState } from 'react'
import ContactDrawer from './ContactDrawer'

export default function AuthFooter() {
  const [contactOpen, setContactOpen] = useState(false)

  return (
    <>
      <div className="px-8 pb-6 flex items-center gap-4">
        
          href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          Training Center
        </a>
        <span className="text-luxury-gray-5 text-xs">&middot;</span>
        
          href="https://coachingbrokeragetools.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          Privacy Policy
        </a>
        <span className="text-luxury-gray-5 text-xs">&middot;</span>
        
          href="https://coachingbrokeragetools.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          Tools Home
        </a>
        <span className="text-luxury-gray-5 text-xs">&middot;</span>
        <button
          onClick={() => setContactOpen(true)}
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          Contact
        </button>
      </div>
      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
    </>
  )
}
