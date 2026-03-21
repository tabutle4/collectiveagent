'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import EmailTemplateBuilder from '@/components/admin/EmailTemplateBuilder'

export default function EditEmailTemplatePage() {
  const params = useParams()
  const router = useRouter()
  const [template, setTemplate] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchTemplate()
    }
  }, [params.id])

  const fetchTemplate = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) throw error
      setTemplate(data)
    } catch (error) {
      console.error('Error fetching template:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (templateData: any) => {
    try {
      console.log('Updating template:', params.id, templateData)

      const response = await fetch(`/api/email-templates/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData),
      })

      const data = await response.json()

      console.log('Update response:', { status: response.status, ok: response.ok, data })

      if (!response.ok) {
        const errorMessage = data.error || data.message || 'Failed to update template'
        console.error('Update failed:', errorMessage)
        throw new Error(errorMessage)
      }

      if (!data.template) {
        throw new Error('No template data returned from server')
      }

      // Update template state with fresh data from server
      setTemplate(data.template)
      console.log('Template updated successfully:', data.template)

      // Refresh from server to ensure we have latest
      await fetchTemplate()

      // Show success message
      alert('Template updated successfully!')
    } catch (error: any) {
      console.error('Error updating template:', error)
      const errorMessage =
        error?.message || 'Failed to update template. Please check the console for details.'
      alert(errorMessage)
      throw error // Re-throw so EmailTemplateBuilder can catch it
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  if (!template) {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-2 mb-6">Template not found</p>
        <Link
          href="/admin/email-templates"
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary inline-block"
        >
          Back to Templates
        </Link>
      </div>
    )
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
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-4 md:mb-6">
          Edit: {template.name}
        </h2>
      </div>

      <EmailTemplateBuilder template={template} onSave={handleSave} />
    </div>
  )
}
