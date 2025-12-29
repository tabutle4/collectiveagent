# Backward Compatibility - Campaign Builder

## ✅ Your Active Campaigns Are Safe

**No, this will NOT affect your active campaigns.** Here's why:

### 1. Database Migration is Safe
- The SQL migration (`supabase-campaign-steps.sql`) adds a new column `steps_config` with a default value of `[]` (empty array)
- This means existing campaigns will have `steps_config = []`
- No existing data is modified or deleted

### 2. CampaignForm Has Backward Compatibility
- The `CampaignForm` component checks if `steps_config` exists and has content
- If `steps_config` is empty or doesn't exist, it uses the **legacy hardcoded 4-step flow**
- Your existing campaigns will continue to work exactly as they do now

### 3. How It Works

**For Existing Campaigns (Legacy Flow):**
- `steps_config` is empty `[]`
- CampaignForm detects this and uses the hardcoded 4-step flow:
  1. Step 1: Commission Plan Selection (info page)
  2. Step 2: Update Profile
  3. Step 3: RSVP
  4. Step 4: Survey
- Everything works exactly as before

**For New Campaigns (Dynamic Flow):**
- When you create/edit a campaign in the builder, `steps_config` gets populated
- CampaignForm detects this and uses the dynamic steps from `steps_config`
- You can have any number of steps, any order, any types

### 4. Migration Steps

1. **Run the SQL migration** (one time):
   ```sql
   -- This is safe - it only adds a new column
   ALTER TABLE campaigns 
   ADD COLUMN IF NOT EXISTS steps_config JSONB DEFAULT '[]'::JSONB;
   ```

2. **Existing campaigns continue working** - no changes needed

3. **New campaigns** can use the builder to design custom flows

### 5. What Happens When You Edit an Existing Campaign?

- If you open an existing campaign in the builder, it will:
  - Load the existing campaign data
  - Show the default 4-step structure (since `steps_config` is empty)
  - Allow you to edit and customize it
  - When you save, it will populate `steps_config` with your custom steps
  - **After saving, that campaign will use the new dynamic flow**

### 6. Recommendation

- **Don't edit active campaigns** until they're complete
- **Test with a new campaign first** to get familiar with the builder
- **Once an active campaign is done**, you can edit it in the builder for future use

## Summary

✅ **Existing campaigns**: Continue working with hardcoded 4-step flow  
✅ **Database migration**: Safe, no data loss  
✅ **New campaigns**: Can use the builder for custom flows  
✅ **No breaking changes**: Backward compatible

