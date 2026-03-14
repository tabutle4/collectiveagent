'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, ExternalLink, Copy, Check } from 'lucide-react'
import { getFormLinkUrl } from '@/lib/magic-links'

interface Form {
  id: string
  name: string
  description: string
  whenToUse: string
  formType: string
  shareableLink?: string
  shareableToken?: string
}

export default function AgentFormsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      setUser(userData)
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router])
  
  useEffect(() => {
    // Load forms from database
    fetch('/api/forms/list?active_only=true')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.forms) {
          // Map database forms to Form interface
          const mappedForms = data.forms.map((form: any) => ({
            id: form.id,
            name: form.name,
            description: form.description || '',
            whenToUse: form.description || 'Use this form as needed.',
            formType: form.form_type,
            shareableLink: form.shareable_link_url,
            shareableToken: form.shareable_token,
          }))
          
          // Add default forms if they don't exist in database
          const defaultForms: Form[] = [
            {
              id: 'pre-listing',
              name: 'Pre-Listing Form',
              description: 'Submit this form when you have executed a new listing agreement. Use this for properties that are not yet active on the MLS.',
              whenToUse: 'Submit when you have a signed listing agreement but the property is not yet listed on the MLS.',
              formType: 'pre-listing',
            },
            {
              id: 'just-listed',
              name: 'Just Listed Form',
              description: 'Submit this form when you have a new active listing that is already on the MLS.',
              whenToUse: 'Submit when your listing is already active on the MLS and you want to request services.',
              formType: 'just-listed',
            },
          ]
          
          // Merge: use database forms if they exist, otherwise use defaults
          const allForms = [...mappedForms]
          defaultForms.forEach(defaultForm => {
            if (!mappedForms.find((f: Form) => f.formType === defaultForm.formType)) {
              allForms.push(defaultForm)
            }
          })
          
          setForms(allForms)
        } else {
          // Fallback to default forms if API fails
          setForms([
            {
              id: 'pre-listing',
              name: 'Pre-Listing Form',
              description: 'Submit this form when you have executed a new listing agreement. Use this for properties that are not yet active on the MLS.',
              whenToUse: 'Submit when you have a signed listing agreement but the property is not yet listed on the MLS.',
              formType: 'pre-listing',
            },
            {
              id: 'just-listed',
              name: 'Just Listed Form',
              description: 'Submit this form when you have a new active listing that is already on the MLS.',
              whenToUse: 'Submit when your listing is already active on the MLS and you want to request services.',
              formType: 'just-listed',
            },
          ])
        }
      })
      .catch(err => {
        console.error('Error fetching forms:', err)
        // Fallback to default forms
        setForms([
          {
            id: 'pre-listing',
            name: 'Pre-Listing Form',
            description: 'Submit this form when you have executed a new listing agreement. Use this for properties that are not yet active on the MLS.',
            whenToUse: 'Submit when you have a signed listing agreement but the property is not yet listed on the MLS.',
            formType: 'pre-listing',
          },
          {
            id: 'just-listed',
            name: 'Just Listed Form',
            description: 'Submit this form when you have a new active listing that is already on the MLS.',
            whenToUse: 'Submit when your listing is already active on the MLS and you want to request services.',
            formType: 'just-listed',
          },
        ])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const handleCopyLink = (link: string, formId: string) => {
    navigator.clipboard.writeText(link)
    setCopiedLink(formId)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  if (!user) {
    return null
  }
  
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading forms...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
          Forms
        </h1>
        <p className="text-sm text-luxury-gray-2">
          Shareable form links. These links can be shared with anyone and don't require login. Links do not expire.
        </p>
      </div>

      <div className="space-y-4">
        {forms.map((form) => (
          <div key={form.id} className="card-section">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-luxury-gray-2" />
                  <h2 className="text-lg font-medium text-luxury-gray-1">
                    {form.name}
                  </h2>
                </div>
                <p className="text-sm text-luxury-gray-2 mb-3">
                  {form.description}
                </p>
                <div className="bg-luxury-light p-3 rounded mb-3">
                  <p className="text-xs font-medium text-luxury-gray-1 mb-1">When to Use:</p>
                  <p className="text-xs text-luxury-gray-2">{form.whenToUse}</p>
                </div>
                {form.shareableLink && (
                  <div className="bg-white p-3 rounded border border-luxury-gray-5 mb-3">
                    <p className="text-xs font-medium text-luxury-gray-1 mb-2">Shareable Link:</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={form.shareableLink}
                        readOnly
                        className="flex-1 text-xs px-2 py-1 border border-luxury-gray-5 rounded bg-luxury-light"
                      />
                      <button
                        onClick={() => handleCopyLink(form.shareableLink!, form.id)}
                        className="p-1.5 text-luxury-black hover:text-luxury-gray-1 transition-colors"
                        title="Copy link"
                      >
                        {copiedLink === form.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="ml-4 flex flex-col gap-2">
                {form.formType === 'pre-listing' || form.formType === 'just-listed' ? (
                  <Link
                    href={form.formType === 'pre-listing' ? '/agent/forms/pre-listing' : '/agent/forms/just-listed'}
                    className="px-4 py-2 text-sm rounded transition-colors btn-black flex items-center gap-2"
                  >
                    Open Form
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                ) : form.shareableLink ? (
                  <a
                    href={form.shareableLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm rounded transition-colors btn-black flex items-center gap-2"
                  >
                    Open Form
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card-section">
        <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Need Help?</h3>
        <p className="text-sm text-luxury-gray-2 mb-4">
          If you're unsure which form to use or have questions about the forms, please contact the office.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="mailto:office@collectiverealtyco.com"
            className="px-4 py-2 text-sm rounded transition-colors btn-white"
          >
            Email Office
          </a>
          <a
            href="tel:281-638-9407"
            className="px-4 py-2 text-sm rounded transition-colors btn-white"
          >
            Call Office
          </a>
        </div>
      </div>
    </div>
  )
}

