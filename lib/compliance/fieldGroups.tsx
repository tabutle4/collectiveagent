// Shared compliance form field definitions and formatters.
// fmtMoney, yesNo, cap, hasValue, and FIELD_GROUPS are copied verbatim from
// app/admin/compliance/page.tsx so the transaction Documents tab renders the
// compliance request exactly like the compliance tracker. fmtDate here is the
// timezone-safe variant: date-only strings get a noon time so a UTC parse does
// not shift them to the previous day.

export const fmtDate = (d: string | null) =>
  d ? new Date((d.length === 10 ? d + 'T12:00:00' : d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

export const fmtMoney = (v: any) => {
  const n = parseFloat(v)
  if (isNaN(n)) return String(v)
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export const yesNo = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : String(v))

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Every question on the compliance form, smart-grouped for the expandable
// detail. A field renders only when it has a value; a group renders only when
// at least one of its fields does. Nothing with data is ever hidden.
export const FIELD_GROUPS: { title: string; fields: { key: string; label: string; fmt?: (v: any, d: Record<string, any>) => string }[] }[] = [
  {
    title: 'Deal',
    fields: [
      { key: 'team_or_office', label: 'Team / office' },
      { key: 'representing', label: 'Representing', fmt: v => cap(String(v)) },
      { key: 'unit', label: 'Unit' },
      { key: 'in_matrix', label: 'In MLS Matrix', fmt: yesNo },
      { key: 'mls_link', label: 'MLS link' },
      { key: 'acceptance_date', label: 'Acceptance date', fmt: v => fmtDate(String(v)) || String(v) },
      { key: 'closing_or_movein_date', label: 'Closing / move-in', fmt: v => fmtDate(String(v)) || String(v) },
    ],
  },
  {
    title: 'Client',
    fields: [
      { key: 'client_name', label: 'Client name' },
      { key: 'client_email', label: 'Client email' },
      { key: 'client_phone', label: 'Client phone' },
      { key: 'lead_source', label: 'Lead source' },
    ],
  },
  {
    title: 'Lease details',
    fields: [
      { key: 'tenant_transaction_type', label: 'Lease type' },
      { key: 'lease_term_months', label: 'Lease term (months)' },
      { key: 'referred_client_type', label: 'Referred client type' },
    ],
  },
  {
    title: 'Financials',
    fields: [
      { key: 'commission_basis_price', label: 'Commission basis price', fmt: fmtMoney },
      { key: 'total_sales_rent_price', label: 'Total sales / rent price', fmt: fmtMoney },
      { key: 'commission_rate', label: 'Commission rate', fmt: (v, d) => (d.commission_rate_type === 'flat' ? fmtMoney(v) : `${v}%`) },
      { key: 'bonus_btsa_amount', label: 'BTSA', fmt: fmtMoney },
      { key: 'rebate_amount', label: 'Rebate', fmt: fmtMoney },
      { key: 'expedite_acknowledged', label: 'Expedite', fmt: yesNo },
    ],
  },
  {
    title: 'Referrals',
    fields: [
      { key: 'internal_referral', label: 'Internal referral', fmt: yesNo },
      { key: 'internal_referral_fee', label: 'Internal fee' },
      { key: 'external_referral', label: 'External referral', fmt: yesNo },
      { key: 'external_referral_fee', label: 'External fee' },
      { key: 'brokerage_referral', label: 'Brokerage referral', fmt: yesNo },
      { key: 'brokerage_referral_fee', label: 'Brokerage fee' },
    ],
  },
  {
    title: 'Title & loan',
    fields: [
      { key: 'title_officer_name', label: 'Title officer' },
      { key: 'title_company', label: 'Title company' },
      { key: 'title_company_email', label: 'Title email' },
      { key: 'title_phone', label: 'Title phone' },
      { key: 'loan_type', label: 'Loan type' },
    ],
  },
  {
    title: 'Flyer & notes',
    fields: [
      { key: 'flyer_display_type', label: 'Flyer display', fmt: v => cap(String(v)) },
      { key: 'flyer_display_line', label: 'Division / team line' },
      { key: 'bedrooms', label: 'Bedrooms' },
      { key: 'bathrooms', label: 'Bathrooms' },
      { key: 'garage', label: 'Garage' },
      { key: 'sqft', label: 'Sqft' },
      { key: 'additional_notes', label: 'Additional notes' },
    ],
  },
]

export const hasValue = (v: any) => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'boolean') return v === true
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  return true
}
