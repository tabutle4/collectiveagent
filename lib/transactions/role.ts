// ===== Role Detection Utility =====
// Single source of truth for role detection across the transaction module.
// Reads from the user object returned by /api/auth/me

export type AppRole = 'agent' | 'tc' | 'admin' | 'broker'

/**
 * Normalize a user object into one of our four app roles.
 * Priority: broker > admin/operations > tc > agent
 */
export function getAppRole(user: any): AppRole {
  if (!user) return 'agent'

  const role = (user.role || '').toLowerCase()
  const roles: string[] = Array.isArray(user.roles)
    ? user.roles.map((r: string) => r.toLowerCase())
    : []

  // Check singular role first (most reliable)
  if (role === 'broker') return 'broker'
  if (role === 'admin' || role === 'operations') return 'admin'
  if (role === 'tc') return 'tc'

  // Fall back to roles array
  if (roles.includes('broker')) return 'broker'
  if (roles.includes('admin') || roles.includes('operations')) return 'admin'
  if (roles.includes('tc')) return 'tc'

  return 'agent'
}

/**
 * Check if a role has admin-level access (admin or broker)
 */
export function isAdminRole(role: AppRole): boolean {
  return role === 'admin' || role === 'broker'
}

/**
 * Check if a role can see all transactions (not just their own)
 */
export function canViewAllTransactions(role: AppRole): boolean {
  return role === 'admin' || role === 'broker' || role === 'tc'
}

/**
 * Check if a role can assign an agent when creating a transaction
 */
export function canAssignAgent(role: AppRole): boolean {
  return role === 'admin' || role === 'broker' || role === 'tc'
}

/**
 * Check if a role can access Slide 6 (Checks & Payouts / CDA)
 */
export function canAccessPayouts(role: AppRole): boolean {
  return role === 'admin' || role === 'broker'
}

/**
 * Check if a role can finalize commissions
 */
export function canFinalizeCommissions(role: AppRole): boolean {
  return role === 'admin' || role === 'broker'
}

/**
 * Check if a role can skip slides
 */
export function canSkipSlides(role: AppRole): boolean {
  return role === 'admin' || role === 'broker'
}

/**
 * Check if a role can edit a transaction given its current status
 */
export function canEditTransaction(role: AppRole, status: string): boolean {
  if (role === 'admin' || role === 'broker') return true
  if (status === 'closed' || status === 'cancelled') return false
  if (role === 'tc') {
    // TC can edit up through compliant status
    const tcEditableStatuses = [
      'prospect', 'active_listing', 'pending', 'submitted',
      'in_review', 'revision_requested', 'compliant',
    ]
    return tcEditableStatuses.includes(status)
  }
  // Agent can edit early statuses only
  const agentEditableStatuses = ['prospect', 'active_listing', 'pending']
  const agentLimitedStatuses = ['revision_requested']
  return agentEditableStatuses.includes(status) || agentLimitedStatuses.includes(status)
}