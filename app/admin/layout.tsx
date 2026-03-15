import AppSidebar from '@/components/shared/AppSidebar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppSidebar>{children}</AppSidebar>
}