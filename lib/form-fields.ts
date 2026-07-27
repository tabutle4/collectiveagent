// Shared display helpers for raw form submission data (agent_form_submissions.data).
//
// One source of truth so a field is labelled and formatted the same way in the
// Form Submissions page (expandable rows) and in the notification emails that go
// out when a form is submitted. Every form writes a different set of keys into
// the same jsonb column, so nothing here assumes a fixed shape - it renders
// whatever keys the submission actually has.

const ACRONYMS = new Set(['MLS', 'LLC', 'ID', 'URL', 'HAR', 'IABS', 'NTREIS', 'TC', 'BTSA', 'CDA'])

// Metadata, IDs, tokens and system flags. These are not answers anyone typed, so
// they are hidden from both the expandable rows and the emails.
export const INTERNAL_FIELD_KEYS = [
  'id',
  'created_at',
  'updated_at',
  'form_id',
  'form_token',
  'form_type',
  'formType',
  'listing_id',
  'transaction_id',
  'user_id',
  'agent_id',
  'referring_agent_id',
  'last_submission_id',
  'submission_mode',
  'submission_type',
  'backfilled',
  'book5_load',
  'locked_transaction',
  'metadata',
  'raw_data',
  'source',
  'version',
]

// Fields people look for first, in the order they expect them. Anything not
// listed here still shows - it just sorts alphabetically underneath.
const PRIORITY_KEYS = [
  'agent_name',
  'agent_email',
  'agent_phone',
  'property_address',
  'street_address',
  'unit',
  'city',
  'state',
  'zip',
  'transaction_type',
  'representing',
  'client_name',
  'client_names',
  'client_email',
  'client_phone',
  'sales_price',
  'total_sales_rent_price',
  'commission_rate',
  'commission_basis_price',
  'closing_date',
  'closing_or_movein_date',
  'acceptance_date',
  'lead_source',
  'mls_link',
]

export function formatFieldLabel(key: string): string {
  const withSpaces = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')

  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map(word => {
      const upperWord = word.toUpperCase()
      if (ACRONYMS.has(upperWord)) return upperWord
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

// Plain-text rendering of one answer. Used directly in emails and as the base
// for the on-screen value.
export function formatFieldValue(value: any): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    const allPrimitive = value.every(v => v === null || typeof v !== 'object')
    if (allPrimitive) return value.map(v => formatFieldValue(v)).join(', ')
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export interface FormAnswerField {
  key: string
  label: string
  value: any
  text: string
}

// Every answer on a submission, internal keys stripped, priority fields first.
export function getFormAnswerFields(data: Record<string, any> | null | undefined): FormAnswerField[] {
  if (!data || typeof data !== 'object') return []

  const keys = Object.keys(data).filter(k => !INTERNAL_FIELD_KEYS.includes(k))

  keys.sort((a, b) => {
    const ai = PRIORITY_KEYS.indexOf(a)
    const bi = PRIORITY_KEYS.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  return keys.map(key => ({
    key,
    label: formatFieldLabel(key),
    value: data[key],
    text: formatFieldValue(data[key]),
  }))
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// The full answer table appended to submission notification emails. Returns an
// empty string when there is nothing to show, so callers can interpolate it
// unconditionally. Values are escaped because they are agent-typed input.
export function buildFormAnswersHtml(
  data: Record<string, any> | null | undefined,
  heading: string = 'All Form Answers'
): string {
  const fields = getFormAnswerFields(data)
  if (fields.length === 0) return ''

  const rows = fields
    .map(
      f => `<tr>
             <td style="padding:6px 12px 6px 0;font-size:12px;color:#888888;vertical-align:top;width:40%;">${escapeHtml(f.label)}</td>
             <td style="padding:6px 0;font-size:13px;color:#1a1a1a;vertical-align:top;">${escapeHtml(f.text)}</td>
           </tr>`
    )
    .join('')

  return `<div style="border-top:1px solid #eeeeee;margin:24px 0 0;padding:20px 0 0;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#1a1a1a;">${escapeHtml(heading)}</p>
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>`
}
