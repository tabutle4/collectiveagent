'use client'

import { use } from 'react'
import ProfileScreen from '@/components/profile/ProfileScreen'

export default function AdminUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ProfileScreen userId={id} isAdmin={true} />
}
