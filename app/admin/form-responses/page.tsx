# Form Responses Page Rebuild Plan
## To be done AFTER Transaction & Payouts Module is complete

---

## Current State
- `app/admin/form-responses/page.tsx` is a 2000+ line monolith
- It mixes three unrelated things: prospective agents, listing form responses (pre-listing/just-listed), and form management
- Listing form responses write to the `transactions` table, which will be owned by the Transaction module
- The prospective agent form belongs in the Onboarding module
- The side modal pattern needs to be replaced

## What Moves Where

### Prospective Agent Form + Responses → Onboarding Module
- Prospective agent form submissions currently create `users` records with `prospect_status`
- This moves entirely to the Onboarding module
- Prospects tab, prospect detail modal, prospect editing, prospect CSV export all move there

### Pre-Listing + Just Listed Responses → Transaction Module
- These currently write to the `transactions` table
- The Transaction module will own the full transaction lifecycle
- Pre-listing and just-listed become transaction types/statuses within that module
- Create response, edit response, coordination integration all handled by transaction workflows

### Forms Management → This Page (Form Responses)
- This page becomes the dedicated Forms page
- Only actual forms live here, not transactions, not prospects

## New Form Responses Page Design

### Layout
- Two container cards side by side (like dashboard)
- `lg:grid-cols-12` - left col-span-5, right col-span-7
- Full width, no max-width constraints
- Stacked on mobile

### Left Container: "FORMS"
- Header with "Create New Form" button
- Inner card for each form from the `forms` table
- Each card shows: name, description, type, active/inactive status
- Shareable link with copy button
- Edit button (goes to form-builder page)
- Activate/deactivate toggle
- Delete button

### Right Container: "RESPONSES"
- Header with export button
- Needs a NEW `form_submissions` table (not `transactions`)
- Inner card for each submission
- Shows: form name, submitter name, date, key fields from the submission
- Click to expand/view full response
- Search and filter by form type

### New Database Table Needed
```sql
CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  form_id uuid NOT NULL REFERENCES forms(id),
  user_id uuid REFERENCES users(id),
  submitted_by_name text,
  submitted_by_email text,
  form_data jsonb NOT NULL DEFAULT '{}',
  status text DEFAULT 'new',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);
```

### No Side Modal
- Will use a different modal pattern (TBD - Tara will pick one she likes from other pages)
- Or detail view could expand inline within the inner card

### Agent Forms Page (app/agent/forms/page.tsx)
- Already built with two tabs: Available Forms + My Submissions
- Will need to be updated to read from `form_submissions` instead of `transactions`
- Otherwise the structure is correct

## Dependencies
1. Transaction & Payouts module must be built first
2. Onboarding module must be built (moves prospects out)
3. `form_submissions` table must be created
4. Form submission API endpoints need to write to `form_submissions` instead of `transactions`
5. Agent forms page updated to read from `form_submissions`

## Order of Operations
1. Build Transaction module (transactions own pre-listing/just-listed)
2. Build Onboarding module (owns prospective agents)
3. Create `form_submissions` table
4. Update form submission API to write to new table
5. Rebuild this page with two-container layout
6. Update agent forms page to read from new table
7. Delete old form-responses page code