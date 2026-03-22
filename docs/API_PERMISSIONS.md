# API Permissions Reference

## How Permissions Work

1. **User's role** is stored in `users.role` column (agent, tc, operations, broker, support)
2. **Role permissions** are defined in `role_permissions` table (maps roles → permissions)
3. **User overrides** in `user_permission_overrides` can grant or revoke individual permissions
4. The `getUserPermissions()` function in `lib/permissions.ts` combines these to get effective permissions

## Permission Codes

### Transactions
| Code | Description |
|------|-------------|
| `can_create_transactions` | Create new transactions |
| `can_edit_transactions` | Edit transaction details |
| `can_delete_transactions` | Delete transactions |
| `can_cancel_transactions` | Cancel transactions |
| `can_view_all_transactions` | View all transactions (not just own) |
| `can_close_transactions` | Mark transactions as closed |
| `can_reopen_transactions` | Reopen closed transactions |

### Compliance
| Code | Description |
|------|-------------|
| `can_submit_for_compliance` | Submit transactions for compliance review |
| `can_review_compliance` | Review compliance submissions |
| `can_approve_compliance` | Approve/reject compliance submissions |
| `can_complete_checklist_items` | Mark checklist items as complete |

### Commissions & CDA
| Code | Description |
|------|-------------|
| `can_edit_commission_details` | Edit commission calculations |
| `can_generate_cda` | Generate Commission Disbursement Authorizations |
| `can_finalize_commissions` | Lock/finalize commission calculations |
| `can_approve_cda` | Approve CDAs (broker only) |

### Checks & Payouts
| Code | Description |
|------|-------------|
| `can_view_checks` | View received checks |
| `can_manage_checks` | Add/edit/delete checks |
| `can_process_payouts` | Process agent payouts via ACH |

### 1099
| Code | Description |
|------|-------------|
| `can_view_1099_data` | View 1099 reportable amounts |
| `can_generate_1099_reports` | Generate 1099 reports |

### Agents
| Code | Description |
|------|-------------|
| `can_view_all_agents` | View all agent profiles |
| `can_manage_agents` | Create/edit/deactivate agents |
| `can_reset_passwords` | Reset agent passwords |

### Billing
| Code | Description |
|------|-------------|
| `can_manage_agent_billing` | Manage agent billing settings |
| `can_view_agent_debts` | View agent debts and credits |
| `can_manage_agent_debts` | Add/edit agent debts and credits |

### Settings & Config
| Code | Description |
|------|-------------|
| `can_manage_company_settings` | Edit company settings |
| `can_manage_transaction_types` | Manage processing fee types |
| `can_manage_commission_plans` | Manage commission plan configurations |
| `can_manage_checklists` | Manage checklist templates and items |
| `can_manage_required_documents` | Manage required document lists |
| `can_manage_field_definitions` | Manage custom field definitions |
| `can_manage_workflow_steps` | Manage workflow step configurations |
| `can_manage_payee_types` | Manage payee type options |
| `can_manage_roles` | Manage roles and permissions |
| `can_manage_service_config` | Manage service configurations |

### Activity & Reports
| Code | Description |
|------|-------------|
| `can_view_activity_log` | View system activity log |
| `can_view_own_reports` | View own performance reports |
| `can_view_all_reports` | View all agent reports |

### Contacts
| Code | Description |
|------|-------------|
| `can_manage_contact_submissions` | Manage contact form submissions |
| `can_view_all_contacts` | View all transaction contacts |

### Email & Campaigns
| Code | Description |
|------|-------------|
| `can_manage_email_templates` | Create/edit email templates |
| `can_manage_campaigns` | Create/edit campaigns |
| `can_send_campaign_emails` | Send campaign emails |

### Coordination & Listings
| Code | Description |
|------|-------------|
| `can_manage_coordination` | Manage listing coordination |
| `can_manage_listings` | Manage listings |

### Forms
| Code | Description |
|------|-------------|
| `can_manage_forms` | Create/edit/delete forms |

### Onboarding
| Code | Description |
|------|-------------|
| `can_manage_onboarding` | Manage agent onboarding |

### Teams
| Code | Description |
|------|-------------|
| `can_manage_team_agreements` | Create/edit team agreements |

### Roster
| Code | Description |
|------|-------------|
| `can_regenerate_roster` | Regenerate public agent roster |

### Calendar
| Code | Description |
|------|-------------|
| `can_manage_calendar` | Add/edit/delete calendar events |

### Training Center
| Code | Description |
|------|-------------|
| `can_view_training_center` | Access training center |

---

## Default Role Permissions

### Agent
- `can_create_transactions`
- `can_edit_transactions`
- `can_submit_for_compliance`
- `can_view_own_reports`
- `can_view_training_center`

### TC (Leah)
- `can_create_transactions`
- `can_edit_transactions`
- `can_view_all_transactions`
- `can_review_compliance`
- `can_approve_compliance`
- `can_view_all_agents`
- `can_view_agent_debts`
- `can_manage_agent_debts`
- `can_view_all_contacts`
- `can_manage_coordination`
- `can_manage_listings`
- `can_view_all_reports`
- `can_view_training_center`
- `can_manage_calendar`

### Support
- `can_view_all_transactions`
- `can_view_all_agents`
- `can_view_agent_debts`
- `can_view_all_contacts`
- `can_view_all_reports`
- `can_view_training_center`
- `can_view_checks`

### Operations (Tara)
- **All permissions except** `can_approve_cda`

### Broker (Courtney)
- **All permissions**

---

## API Routes by Permission

### `can_view_all_transactions`
- GET `/api/admin/transactions/[id]`

### `can_view_checks`
- GET `/api/checks`

### `can_manage_checks`
- POST `/api/checks`
- POST `/api/checks/upload-image`
- POST `/api/checks/notify-agent`

### `can_manage_agent_debts`
- GET/POST `/api/billing`

### `can_manage_agent_billing`
- All `/api/payload/*` routes (10 routes)

### `can_manage_campaigns`
- `/api/campaign/create-editable-duplicate`
- `/api/campaign/duplicate`
- `/api/campaign/generate-tokens`
- `/api/campaign/get-responses`
- `/api/campaign/migrate-profile-updates`
- `/api/campaign/update-progress`
- `/api/campaigns/[id]`
- `/api/campaigns/[id]/export-pdf`

### `can_send_campaign_emails`
- `/api/campaign/send-emails`
- `/api/campaign/send-rsvp-list`

### `can_manage_coordination`
- All `/api/coordination/*` routes (17 routes)

### `can_manage_listings`
- All `/api/listings/*` routes (6 routes)

### `can_manage_forms`
- `/api/forms/create`
- `/api/forms/delete`
- `/api/forms/generate-token`
- `/api/forms/generate-generic-token`
- `/api/forms/update`

### `can_manage_email_templates`
- `/api/email-templates`
- `/api/email-templates/[id]`
- `/api/email-templates/[id]/duplicate`
- `/api/email-templates/preview`

### `can_manage_team_agreements`
- `/api/team-agreements`
- `/api/team-agreements/[id]`

### `can_manage_service_config`
- `/api/service-config/get`
- `/api/service-config/update`

### `can_manage_onboarding`
- `/api/onboarding/advance-step`
- `/api/users/unlock-all-onboarding`

### `can_manage_agents`
- `/api/users/create`
- `/api/users/delete`
- `/api/users/update-divisions`
- `/api/users/update-headshot-crop`
- `/api/users/upload-headshot`

### `can_view_all_agents`
- `/api/users/list`
- `/api/prospects`

### `can_reset_passwords`
- `/api/users/reset-password`

### `can_regenerate_roster`
- `/api/roster/regenerate`

### `can_manage_calendar`
- POST/PATCH/DELETE `/api/calendar/events`

### `can_view_training_center`
- `/api/training-center`

### `can_complete_checklist_items`
- `/api/checklist/send-item-notification`
- `/api/checklist/send-completion-notification`

---

## Managing Permissions

### Add permission to a role
```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'tc' AND p.code = 'can_manage_forms';
```

### Remove permission from a role
```sql
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'tc')
AND permission_id = (SELECT id FROM permissions WHERE code = 'can_manage_forms');
```

### Grant permission to specific user
```sql
INSERT INTO user_permission_overrides (user_id, permission_id, granted)
VALUES (
  'user-uuid-here',
  (SELECT id FROM permissions WHERE code = 'can_process_payouts'),
  true
);
```

### Revoke permission from specific user
```sql
INSERT INTO user_permission_overrides (user_id, permission_id, granted)
VALUES (
  'user-uuid-here',
  (SELECT id FROM permissions WHERE code = 'can_delete_transactions'),
  false
);
```

### View user's effective permissions
```sql
-- Get all permissions for a user (role + overrides)
WITH role_perms AS (
  SELECT p.code
  FROM users u
  JOIN roles r ON r.name = u.role
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE u.id = 'user-uuid-here'
),
user_overrides AS (
  SELECT p.code, upo.granted
  FROM user_permission_overrides upo
  JOIN permissions p ON p.id = upo.permission_id
  WHERE upo.user_id = 'user-uuid-here'
)
SELECT DISTINCT code FROM (
  SELECT code FROM role_perms
  UNION ALL
  SELECT code FROM user_overrides WHERE granted = true
) all_perms
WHERE code NOT IN (SELECT code FROM user_overrides WHERE granted = false)
ORDER BY code;
```
