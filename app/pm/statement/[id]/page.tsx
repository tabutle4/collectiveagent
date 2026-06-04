import { redirect } from 'next/navigation'

// /pm/statement/[id]?token=...
// Redirects directly to the statement HTML so the browser title is correct
// for Save as PDF (no iframe wrapper).
export default async function PublicStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams

  if (!token) {
    redirect('/pm/login')
  }

  redirect(`/api/pm/statements/${id}?token=${token}`)
}
