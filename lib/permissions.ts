/**
 * Database-driven permissions system for Collective Agent app
 *
 * Permissions are stored in the database:
 * - roles: defines role names (agent, tc, operations, broker)
 * - permissions: defines permission codes (can_create_transactions, etc.)
 * - role_permissions: maps roles to permissions (defaults per role)
 * - user_permission_overrides: per-user grants/revokes
 *
 * Usage:
 *   const permissions = await getUserPermissions(userId)
 *   if (permissions.has('can_create_transactions')) { ... }
 */

import { createClient } from '@/lib/supabase/server'

// Permission codes as defined in the database
export type PermissionCode =
  // Transactions
  | 'can_create_transactions'
  | 'can_edit_transactions'
  | 'can_delete_transactions'
  | 'can_cancel_transactions'
  | 'can_view_all_transactions'
  | 'can_close_transactions'
  | 'can_reopen_transactions'
  // Compliance
  | 'can_submit_for_compliance'
  | 'can_review_compliance'
  | 'can_approve_compliance'
  | 'can_complete_checklist_items'
  // Commissions & CDA
  | 'can_edit_commission_details'
  | 'can_generate_cda'
  | 'can_finalize_commissions'
  | 'can_approve_cda'
  // Checks & Payouts
  | 'can_view_checks'
  | 'can_manage_checks'
  | 'can_process_payouts'
  // 1099
  | 'can_view_1099_data'
  | 'can_generate_1099_reports'
  // Agents
  | 'can_view_all_agents'
  | 'can_manage_agents'
  | 'can_reset_passwords'
  // Billing (existing in DB)
  | 'can_view_billing'
  | 'can_create_invoices'
  | 'can_manage_billing'
  | 'can_manage_agent_billing'
  | 'can_view_agent_debts'
  | 'can_manage_agent_debts'
  // Settings & Config
  | 'can_manage_company_settings'
  | 'can_manage_transaction_types'
  | 'can_manage_commission_plans'
  | 'can_manage_checklists'
  | 'can_manage_required_documents'
  | 'can_manage_field_definitions'
  | 'can_manage_workflow_steps'
  | 'can_manage_payee_types'
  | 'can_manage_roles'
  | 'can_manage_service_config'
  // Activity & Reports
  | 'can_view_activity_log'
  | 'can_view_own_reports'
  | 'can_view_all_reports'
  | 'can_view_dashboard_financials'
  // Contacts (existing in DB)
  | 'can_view_all_contacts'
  | 'can_manage_contacts'
  | 'can_manage_contact_submissions'
  // Email & Campaigns (existing in DB)
  | 'can_view_campaigns'
  | 'can_manage_campaigns'
  | 'can_send_campaign_emails'
  | 'can_manage_email_templates'
  // Coordination & Listings (existing in DB)
  | 'can_view_listings'
  | 'can_manage_listings'
  | 'can_manage_coordination'
  // Documents (existing in DB)
  | 'can_view_documents'
  | 'can_manage_documents'
  // Forms (existing in DB)
  | 'can_view_forms'
  | 'can_manage_forms'
  // Onboarding (existing in DB)
  | 'can_view_onboarding'
  | 'can_manage_onboarding'
  // Teams (existing in DB)
  | 'can_view_teams'
  | 'can_manage_teams'
  | 'can_manage_team_agreements'
  // Prospects (existing in DB)
  | 'can_view_prospects'
  | 'can_manage_prospects'
  // Revenue Share (existing in DB)
  | 'can_view_revenue_share'
  // Roster
  | 'can_regenerate_roster'
  // Calendar (existing in DB)
  | 'can_view_calendar'
  | 'can_manage_calendar'
  // Training Center
  | 'can_view_training_center'
  // Property Management
  | 'can_view_pm'
  | 'can_manage_pm'
  | 'can_manage_pm_landlords'
  | 'can_manage_pm_tenants'
  | 'can_manage_pm_properties'
  | 'can_manage_pm_leases'
  | 'can_manage_pm_invoices'
  | 'can_process_pm_disbursements'

// Role names as defined in the database
export type RoleName = 'agent' | 'tc' | 'operations' | 'broker' | 'support'

/**
 * Get all permissions for a user by their ID
 * Reads from database: user.role -> roles table -> role_permissions -> applies overrides
 */
export async function getUserPermissions(userId: string): Promise<Set<PermissionCode>> {
  const supabase = createClient()
  const permissions = new Set<PermissionCode>()

  try {
    // 1. Get user's role from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.error('Failed to fetch user for permissions:', userError)
      return permissions
    }

    // Normalize role to lowercase
    const roleName = (user.role || 'agent').toLowerCase() as RoleName

    // 2. Get role ID from roles table
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .eq('is_active', true)
      .single()

    if (roleError || !role) {
      console.error('Failed to fetch role:', roleError)
      return permissions
    }

    // 3. Get all permissions for this role
    const { data: rolePerms, error: rolePermsError } = await supabase
      .from('role_permissions')
      .select(
        `
        permission_id,
        permissions!inner(code)
      `
      )
      .eq('role_id', role.id)

    if (rolePermsError) {
      console.error('Failed to fetch role permissions:', rolePermsError)
      return permissions
    }

    // Add role permissions to set
    for (const rp of rolePerms || []) {
      const code = (rp.permissions as any)?.code as PermissionCode
      if (code) permissions.add(code)
    }

    // 4. Apply user-specific overrides
    const { data: overrides, error: overridesError } = await supabase
      .from('user_permission_overrides')
      .select(
        `
        granted,
        permissions!inner(code)
      `
      )
      .eq('user_id', userId)

    if (overridesError) {
      console.error('Failed to fetch user overrides:', overridesError)
      // Continue with role permissions only
    } else {
      for (const override of overrides || []) {
        const code = (override.permissions as any)?.code as PermissionCode
        if (code) {
          if (override.granted) {
            permissions.add(code)
          } else {
            permissions.delete(code)
          }
        }
      }
    }

    return permissions
  } catch (error) {
    console.error('Error getting user permissions:', error)
    return permissions
  }
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(userId: string, permission: PermissionCode): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return permissions.has(permission)
}

/**
 * Check if a user has ALL of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  requiredPermissions: PermissionCode[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return requiredPermissions.every(p => permissions.has(p))
}

/**
 * Check if a user has ANY of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  requiredPermissions: PermissionCode[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  return requiredPermissions.some(p => permissions.has(p))
}

/**
 * Get permissions as an object for JSON responses
 */
export async function getPermissionsObject(
  userId: string
): Promise<Record<PermissionCode, boolean>> {
  const permissions = await getUserPermissions(userId)
  const result: Partial<Record<PermissionCode, boolean>> = {}

  // All possible permissions
  const allPermissions: PermissionCode[] = [
    // Transactions
    'can_create_transactions',
    'can_edit_transactions',
    'can_delete_transactions',
    'can_cancel_transactions',
    'can_view_all_transactions',
    'can_close_transactions',
    'can_reopen_transactions',
    // Compliance
    'can_submit_for_compliance',
    'can_review_compliance',
    'can_approve_compliance',
    'can_complete_checklist_items',
    // Commissions & CDA
    'can_edit_commission_details',
    'can_generate_cda',
    'can_finalize_commissions',
    'can_approve_cda',
    // Checks & Payouts
    'can_view_checks',
    'can_manage_checks',
    'can_process_payouts',
    // 1099
    'can_view_1099_data',
    'can_generate_1099_reports',
    // Agents
    'can_view_all_agents',
    'can_manage_agents',
    'can_reset_passwords',
    // Billing
    'can_manage_agent_billing',
    'can_view_agent_debts',
    'can_manage_agent_debts',
    // Settings & Config
    'can_manage_company_settings',
    'can_manage_transaction_types',
    'can_manage_commission_plans',
    'can_manage_checklists',
    'can_manage_required_documents',
    'can_manage_field_definitions',
    'can_manage_workflow_steps',
    'can_manage_payee_types',
    'can_manage_roles',
    'can_manage_service_config',
    // Activity & Reports
    'can_view_activity_log',
    'can_view_own_reports',
    'can_view_all_reports',
    // Contacts
    'can_manage_contact_submissions',
    'can_view_all_contacts',
    // Email & Campaigns
    'can_manage_email_templates',
    'can_manage_campaigns',
    'can_send_campaign_emails',
    // Coordination & Listings
    'can_manage_coordination',
    'can_manage_listings',
    // Forms
    'can_manage_forms',
    // Onboarding
    'can_manage_onboarding',
    // Teams
    'can_manage_team_agreements',
    // Roster
    'can_regenerate_roster',
    // Calendar
    'can_manage_calendar',
    // Training Center
    'can_view_training_center',
    // Property Management
    'can_view_pm',
    'can_manage_pm',
    'can_manage_pm_landlords',
    'can_manage_pm_tenants',
    'can_manage_pm_properties',
    'can_manage_pm_leases',
    'can_manage_pm_invoices',
    'can_process_pm_disbursements',
  ]

  for (const perm of allPermissions) {
    result[perm] = permissions.has(perm)
  }

  return result as Record<PermissionCode, boolean>
}

/**
 * Get user's role name from database
 */
export async function getUserRole(userId: string): Promise<RoleName> {
  const supabase = createClient()

  const { data: user, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !user) {
    return 'agent'
  }

  const role = (user.role || 'agent').toLowerCase()

  // Validate it's a known role
  if (['agent', 'tc', 'operations', 'broker', 'support'].includes(role)) {
    return role as RoleName
  }

  return 'agent'
}

/**
 * Check if user has elevated access (admin-level: operations or broker)
 */
export async function isElevatedUser(userId: string): Promise<boolean> {
  const role = await getUserRole(userId)
  return role === 'operations' || role === 'broker'
}

/**
 * Check if user can view all transactions (tc, operations, broker)
 */
export async function canUserViewAllTransactions(userId: string): Promise<boolean> {
  const role = await getUserRole(userId)
  return ['tc', 'operations', 'broker'].includes(role)
}
