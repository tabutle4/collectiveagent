'use client'

import { use } from 'react'
import ProfilePage from '@/app/profile/page'

export default function AdminUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ProfilePage userId={id} isAdmin={true} />
}
