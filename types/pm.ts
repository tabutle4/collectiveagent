// Shared TypeScript interfaces for the PM (Property Management) module.
// Add additional shared interfaces here as they're factored out of pages.

export interface AgreementOption {
  id: string
  commencement_date: string | null
  expiration_date: string | null
  status: string
}
