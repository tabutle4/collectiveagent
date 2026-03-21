'use client'

import { useState } from 'react'
import ContactDrawer from './ContactDrawer'

export default function AuthFooter() {
  const [contactOpen, setContactOpen] = useState(false)

  return (
    <>
      <div className="px-6 pb-6 pt-2 flex items-center gap-4">
        <a
          href="https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <span className="sm:hidden">Training</span>
          <span className="hidden sm:inline">Training Center</span>
        </a>
        <span className="text-luxury-gray-5 text-xs">·</span>
        <a
          href="https://coachingbrokeragetools.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <span className="sm:hidden">Privacy</span>
          <span className="hidden sm:inline">Privacy Policy</span>
        </a>
        <span className="text-luxury-gray-5 text-xs">·</span>
        <a
          href="https://coachingbrokeragetools.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <span className="sm:hidden">Tools</span>
          <span className="hidden sm:inline">Tools Home</span>
        </a>
        <span className="text-luxury-gray-5 text-xs">·</span>
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
