/**
 * The one list of repair request categories.
 *
 * This list previously lived inline in four places: the tenant portal form and
 * the three admin repair pages. They drifted. The tenant form offered
 * "appliances", "pest_control", "locks_security" and "exterior" while the
 * database check constraint only accepts "appliance", "pest", "landscaping" and
 * six others, so a tenant who picked any of those four got a raw Postgres
 * constraint error and their request was never filed. One list, one set of
 * values, imported everywhere, so the spellings cannot drift apart again.
 *
 * Any change to the values here must also change the repair_requests_category_check
 * constraint in the database and docs/schema-reference.sql.
 */

export interface RepairCategoryOption {
  /** Stored in repair_requests.category. Must exist in repair_requests_category_check. */
  value: string
  /** Short label used in admin tables, filters and detail pages. */
  label: string
  /** Longer, plainer label shown to tenants in the portal. */
  tenantLabel: string
}

export const REPAIR_CATEGORIES: RepairCategoryOption[] = [
  { value: 'plumbing', label: 'Plumbing', tenantLabel: 'Plumbing' },
  { value: 'electrical', label: 'Electrical', tenantLabel: 'Electrical' },
  { value: 'hvac', label: 'HVAC', tenantLabel: 'HVAC / Heating / Cooling' },
  { value: 'appliance', label: 'Appliance', tenantLabel: 'Appliances' },
  { value: 'structural', label: 'Structural', tenantLabel: 'Structural / Walls / Flooring' },
  { value: 'pest', label: 'Pest Control', tenantLabel: 'Pest Control' },
  { value: 'locks_security', label: 'Locks / Security', tenantLabel: 'Locks / Security' },
  { value: 'landscaping', label: 'Landscaping', tenantLabel: 'Exterior / Yard' },
  { value: 'other', label: 'Other', tenantLabel: 'Other' },
]

export const REPAIR_CATEGORY_VALUES: string[] = REPAIR_CATEGORIES.map(c => c.value)

/** True when the value is one the database will accept. */
export function isRepairCategory(value: unknown): boolean {
  return typeof value === 'string' && REPAIR_CATEGORY_VALUES.includes(value)
}

/**
 * Display label for a stored category value. Falls back to the raw value so a
 * row written before this list existed still renders something readable.
 */
export function repairCategoryLabel(value: string | null | undefined): string {
  if (!value) return 'Uncategorized'
  return REPAIR_CATEGORIES.find(c => c.value === value)?.label || value
}

/**
 * Display label for the tenant portal. Tenants pick from the longer, plainer
 * wording ("Exterior / Yard", "Appliances"), so their own repair list has to
 * echo the same wording back. Showing them the short admin label instead means
 * a tenant files "Exterior / Yard" and then reads "Landscaping" on the card a
 * second later, which looks like the wrong thing got filed.
 */
export function repairCategoryTenantLabel(value: string | null | undefined): string {
  if (!value) return 'Uncategorized'
  return REPAIR_CATEGORIES.find(c => c.value === value)?.tenantLabel || value
}
