# Headshot Setup Guide

## Step 1: Run the SQL Migration

Run the SQL migration to add the `headshot_url` column to the users table:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase-headshot-schema.sql`
4. Run the query

## Step 2: Create Supabase Storage Bucket

1. Go to your Supabase dashboard
2. Navigate to **Storage**
3. Click **Create Bucket**
4. Name: `headshots`
5. Public: **Yes** (so images can be accessed via URL)
6. File size limit: 5MB (or your preference)
7. Allowed MIME types: `image/jpeg, image/jpg, image/png`
8. Click **Create**

## Step 3: Set Storage Policies (Optional but Recommended)

In the Supabase SQL Editor, run:

```sql
-- Allow authenticated users to upload their own headshots
CREATE POLICY "Users can upload their own headshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'headshots' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own headshots
CREATE POLICY "Users can update their own headshots"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'headshots' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own headshots
CREATE POLICY "Users can delete their own headshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'headshots' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to headshots
CREATE POLICY "Public can view headshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'headshots');
```

**Note:** The upload API uses the service role key, so it bypasses these policies. The policies above are for direct client-side uploads if you want to add that feature later.

## Step 4: Match Existing Headshots

Run the matching script to link existing headshots in `/public/headshots/` to users:

```bash
# Make sure you're in the project directory
cd /Users/collectiverealtyco./Desktop/collective-agent

# Run the script using tsx (or ts-node)
npx tsx scripts/match-headshots.ts
```

The script will:
- Read all files from `/public/headshots/`
- Extract names from filenames (e.g., "Headshot-Tara-Butler.jpg" → "Tara Butler")
- Match to users by preferred name first, then legal name
- Update the `headshot_url` field in the database
- Log matches, unmatched files, and users without headshots

## Step 5: Regenerate Roster

After matching headshots, regenerate the roster:

1. Go to `/admin/agent-roster` in your app
2. The roster will automatically regenerate, or
3. Call the API: `POST /api/roster/regenerate`

## Features

### For Agents
- View and upload headshots at `/profile`
- Upload/replace/remove their own headshot
- Preview before upload

### For Admins
- View and manage headshots in the admin user profile modal
- Upload/replace/remove any user's headshot
- See headshots in the roster (desktop and mobile)

### Display
- **Desktop Roster**: Circular headshots in the table
- **Mobile Roster**: Circular headshots shown when agent card is expanded
- **Admin Modal**: Large circular headshot with upload controls
- **Agent Profile**: Large circular headshot with upload controls

## File Format Support
- `.jpg`
- `.jpeg`
- `.png`
- Max file size: 5MB

## Troubleshooting

### Headshots not showing
1. Check that the `headshot_url` column exists in the users table
2. Verify the Supabase Storage bucket `headshots` exists and is public
3. Check browser console for image loading errors
4. Ensure the `headshot_url` in the database is a valid URL

### Upload fails
1. Check that the Storage bucket exists
2. Verify file size is under 5MB
3. Check file format is .jpg, .jpeg, or .png
4. Check browser console for error messages

### Matching script fails
1. Ensure you have the correct Supabase credentials in `.env.local`
2. Check that the `/public/headshots/` directory exists
3. Verify filenames follow the pattern: `Headshot-FirstName-LastName.ext`
4. Check the script output for specific matching issues

