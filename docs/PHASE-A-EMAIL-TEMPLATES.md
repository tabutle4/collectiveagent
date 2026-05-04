# Phase A: Email Template System - Complete ✅

## Overview

I've built a complete email template management system that allows you to create, edit, preview, and use beautiful HTML email templates for your campaigns. The system integrates seamlessly with your existing campaign email sending functionality.

## What's Been Built

### 1. Database Schema (`supabase-email-templates.sql`)

**New Table: `email_templates`**
- Template metadata (name, description, category)
- HTML content storage
- Subject line with variable support
- Variable tracking (which variables are used)
- Logo URL configuration
- Default template flag (one per category)
- Active/inactive status

**Campaigns Table Enhancement**
- Added `email_template_id` column to link campaigns to specific templates

**Default Template**
- Pre-loaded with your corrected HTML email template
- Includes all styling and structure from your attached template
- Ready to use immediately

### 2. API Routes

**`/api/email-templates`** (GET, POST)
- List all templates (with optional category filter)
- Create new templates

**`/api/email-templates/[id]`** (GET, PUT, DELETE)
- Get single template
- Update template
- Delete template

**`/api/email-templates/preview`** (POST)
- Generate preview with sample data
- Replaces variables with sample values

### 3. Admin UI Pages

**`/admin/email-templates`** - Template List
- Grid view of all templates
- Shows name, category, variables, default status
- Click to edit any template
- Create new template button

**`/admin/email-templates/new`** - Create Template
- Full template builder interface
- Create new templates from scratch

**`/admin/email-templates/[id]`** - Edit Template
- Edit existing templates
- Same builder interface as create

### 4. Email Template Builder Component

**Features:**
- **Template Settings Panel**
  - Name, description, category
  - Subject line with variable support
  - Logo URL configuration
  - Default template toggle
  - Active/inactive status

- **Variable Helper**
  - Click-to-insert variables
  - Shows available variables with descriptions:
    - `{{first_name}}` - Agent preferred first name
    - `{{last_name}}` - Agent preferred last name
    - `{{campaign_name}}` - Campaign name
    - `{{campaign_link}}` - Full URL to campaign form
    - `{{deadline}}` - Formatted deadline date
    - `{{logo_url}}` - Logo image URL
  - Auto-detects variables used in HTML
  - Displays all variables found in template

- **Dual-Mode Editor**
  - **HTML Code View**: Direct HTML editing with syntax highlighting
  - **Preview View**: Live preview with sample data
  - Seamless switching between views
  - Preview uses iframe for accurate rendering

### 5. Campaign Email Integration

**Updated `/api/campaign/send-emails/route.ts`**

The email sending system now:
1. Checks if campaign has an assigned template (`email_template_id`)
2. Falls back to default campaign template if no assignment
3. Replaces all variables with real agent data:
   - `{{first_name}}` → Agent's preferred first name
   - `{{campaign_link}}` → Personalized campaign URL
   - `{{deadline}}` → Formatted deadline date
   - etc.
4. Falls back to old system if no templates exist (backwards compatible)

**Variable Replacement:**
- Handles `{{variable_name}}` syntax
- Works in both HTML content and subject line
- Proper URL construction for images and links

### 6. Navigation Integration

- Added "Email Templates" to admin navigation menu
- Located between "Campaigns" and "Admin Users"
- Mail icon for visual identification

## How to Use

### 1. Set Up Database

Run the SQL migration:
```sql
-- Copy contents of supabase-email-templates.sql
-- Run in Supabase SQL Editor
```

This will:
- Create `email_templates` table
- Add `email_template_id` to `campaigns` table
- Insert default campaign template

### 2. Access Email Templates

1. Go to Admin Dashboard
2. Click "Email Templates" in sidebar
3. See list of all templates
4. Click any template to edit
5. Click "Create New Template" to make a new one

### 3. Create/Edit Template

1. **Template Settings**: Fill in name, category, subject line
2. **Variables**: Click variables to insert `{{variable_name}}` into HTML
3. **HTML Editor**: Write or paste your HTML email content
4. **Preview**: Switch to preview tab to see how it looks
5. **Save**: Click save to store the template

### 4. Assign Template to Campaign

Currently, templates are automatically used based on:
- Campaign's `email_template_id` (if set)
- Default template for 'campaign' category
- Old system fallback (if no templates exist)

**To assign a specific template to a campaign**, you'll need to:
- Add UI to campaign edit page (future enhancement)
- Or manually update `campaigns.email_template_id` in database

### 5. Send Campaign Emails

Emails are sent exactly as before:
1. Go to Campaign detail page
2. Click "Send Emails"
3. System automatically uses appropriate template
4. Variables are replaced with real data
5. Emails sent via Resend

## Template Variables

All variables use `{{variable_name}}` syntax:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{first_name}}` | Agent preferred first name | "John" |
| `{{last_name}}` | Agent preferred last name | "Doe" |
| `{{campaign_name}}` | Campaign name | "2026 Plan Selection" |
| `{{campaign_link}}` | Full campaign URL with token | "https://...campaign/2026?token=abc123" |
| `{{deadline}}` | Formatted deadline | "December 31, 2025" |
| `{{logo_url}}` | Logo image URL | "https://...logo.png" |

## File Structure

```
app/
├── admin/
│   └── email-templates/
│       ├── page.tsx              # Template list
│       ├── new/
│       │   └── page.tsx          # Create template
│       └── [id]/
│           └── page.tsx          # Edit template
├── api/
│   └── email-templates/
│       ├── route.ts              # List/create templates
│       ├── [id]/
│       │   └── route.ts          # Get/update/delete template
│       └── preview/
│           └── route.ts          # Preview with sample data
components/
└── EmailTemplateBuilder.tsx      # Main builder component

supabase-email-templates.sql      # Database migration
```

## Next Steps (Phase A Enhancement)

### Drag-and-Drop Builder (Phase A-2)
- Visual block editor
- Drag content blocks (header, text, button, etc.)
- No-code editing
- Generate HTML from blocks

### Template Library
- Pre-built templates for different use cases
- Clone/duplicate templates
- Template categories and tags

### Campaign Integration UI
- Dropdown to select template when creating/editing campaign
- Preview template before sending
- Test email sending

## Current Status

✅ Database schema created
✅ Default template imported
✅ CRUD API routes
✅ Template builder UI
✅ Variable system
✅ Preview functionality
✅ Campaign integration
✅ Navigation integration

🔄 Pending:
- Drag-and-drop visual builder (Phase A-2)
- Campaign template selection UI

## Notes

- Templates are stored as full HTML
- Variables use `{{name}}` syntax (double curly braces)
- Preview uses sample data, not real agent data
- All templates are mobile-responsive (inherited from your template)
- System is backwards compatible (falls back to old email system)

## Testing

1. Create a test template with variables
2. Preview to see sample data
3. Send a test campaign email
4. Verify variables are replaced correctly
5. Check email rendering in different clients

