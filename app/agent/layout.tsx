import AppSidebar from '@/components/shared/AppSidebar'

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppSidebar>{children}</AppSidebar>
}