'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TeamAgreementFormPage from '../[id]/page'

export default function NewTeamAgreementPage() {
  return <TeamAgreementFormPage params={{ id: 'new' }} />
}

