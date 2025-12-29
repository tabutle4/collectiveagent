# Campaign Builder - What You Still Need to Do

## ✅ What's Already Done

1. ✅ Campaign builder UI created (`/admin/campaigns/builder`)
2. ✅ Database schema migration file created (`supabase-campaign-steps.sql`)
3. ✅ Duplicate function updated to convert hardcoded campaigns
4. ✅ CampaignForm has backward compatibility check
5. ✅ All step editor components created (info, profile, RSVP, survey)

## ⚠️ What You Still Need to Do

### 1. Run the Database Migration (REQUIRED)

**This is critical - the builder won't work without it!**

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase-campaign-steps.sql`
4. Run the SQL

This adds the `steps_config` column to your campaigns table.

**File location:** `supabase-campaign-steps.sql`

```sql
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS steps_config JSONB DEFAULT '[]'::JSONB;
```

### 2. Update CampaignForm to Render Dynamic Steps (REQUIRED)

**Current Status:** CampaignForm checks for `steps_config` but still renders hardcoded steps.

**What needs to happen:**
- CampaignForm needs to render steps dynamically based on `steps_config`
- When `useLegacyFlow = false`, it should render steps from `steps_config` instead of hardcoded `currentStep === 1, 2, 3, 4`

**This is a significant update** - the form needs to:
- Loop through `stepsConfig` array
- Render the appropriate step component based on `step.type`
- Handle step navigation dynamically
- Save responses based on step configuration

**Estimated effort:** This is the biggest remaining task. The CampaignForm component needs to be refactored to support dynamic rendering.

### 3. Test the Builder (After steps 1 & 2)

Once the migration is run and CampaignForm is updated:
1. Go to `/admin/campaigns/builder`
2. Create a new campaign or edit an existing one
3. Add/edit steps
4. Save the campaign
5. Test the campaign from an agent's perspective

### 4. Optional: Create Your First Editable Duplicate

After everything is working:
1. Go to your active campaign
2. Click "Duplicate for Next Year"
3. The duplicate will have all hardcoded content converted to editable format
4. Edit it in the builder to customize for next year

---

## Priority Order

1. **First:** Run the SQL migration (5 minutes)
2. **Second:** Update CampaignForm to render dynamic steps (this is the main work)
3. **Third:** Test everything
4. **Fourth:** Create your first editable duplicate

---

## Current Limitations

- **CampaignForm still uses hardcoded steps** - even if `steps_config` exists, it won't render dynamically yet
- **Builder saves steps_config** - but CampaignForm doesn't use it yet
- **Backward compatibility works** - existing campaigns continue to work with hardcoded flow

---

## Next Steps

Would you like me to:
1. Update CampaignForm to render steps dynamically? (This is the big one)
2. Help you test the builder after migration?
3. Create a test campaign to verify everything works?

Let me know and I'll help you complete the remaining work!

