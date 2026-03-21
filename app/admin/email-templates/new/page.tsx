'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EmailTemplateBuilder from '@/components/admin/EmailTemplateBuilder'

export default function NewEmailTemplatePage() {
  const router = useRouter()

  const handleSave = async (templateData: any) => {
    try {
      const response = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save template')
      }

      router.push(`/admin/email-templates/${data.template.id}`)
    } catch (error: any) {
      console.error('Error saving template:', error)
      alert(error?.message || 'Failed to save template')
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/email-templates"
          className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block"
        >
          ← Back to Templates
        </Link>
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-5 md:mb-8">
          Create New Email Template
        </h2>
      </div>

      <EmailTemplateBuilder onSave={handleSave} />
    </div>
  )
}
