// Redirect to the main builder page with ID
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function CampaignBuilderWithIdPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  useEffect(() => {
    // The main builder page handles both new and existing campaigns
    router.replace(`/admin/campaigns/builder?id=${id}`)
  }, [id, router])

  return <div>Redirecting...</div>
}

