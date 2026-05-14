-- =====================================================================
-- PHASE 1 MIGRATION: Email Signature Tracking + Help Center Foundation
-- =====================================================================
-- This migration adds:
-- 1. users.new_signature_completed_at column (tracks who has saved a
--    signature using the new in-app generator) + backfill from existing
--    email_signatures table so current users aren't shown the upgrade
--    modal/badge.
-- 2. help_articles table for the future Help Center (Phase 2 will build
--    the UI). Seeded now so Phase 2 can ship article content immediately.
--
-- Run order: each section is independent and idempotent (uses IF NOT
-- EXISTS guards). Safe to re-run.
-- =====================================================================


-- =====================================================================
-- SECTION 1: Email Signature Completion Tracking
-- =====================================================================

-- 1a. Add the column (NULL = has not saved yet, timestamp = first save time)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS new_signature_completed_at TIMESTAMPTZ NULL;

-- 1b. Backfill from existing email_signatures table
-- This is critical: anyone who has already saved a signature should NOT
-- see the upgrade modal/badge when this ships. We use the earliest
-- updated_at across any of their saved layouts as the completion time.
UPDATE users 
SET new_signature_completed_at = es.first_save
FROM (
  SELECT user_id, MIN(updated_at) as first_save
  FROM email_signatures
  GROUP BY user_id
) es
WHERE users.id = es.user_id
  AND users.new_signature_completed_at IS NULL;


-- =====================================================================
-- SECTION 2: Help Articles (foundation for Phase 2 Help Center)
-- =====================================================================

-- 2a. Create the table
CREATE TABLE IF NOT EXISTS help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  article_type TEXT NOT NULL DEFAULT 'help' CHECK (article_type IN ('help', 'policy')),
  category TEXT,
  excerpt TEXT,
  body TEXT NOT NULL,
  cover_image_url TEXT,
  published BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2b. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_help_articles_slug ON help_articles(slug);
CREATE INDEX IF NOT EXISTS idx_help_articles_published ON help_articles(published);
CREATE INDEX IF NOT EXISTS idx_help_articles_type_category ON help_articles(article_type, category);

-- 2c. Auto-update timestamp on edit
CREATE OR REPLACE FUNCTION update_help_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS help_articles_updated_at ON help_articles;
CREATE TRIGGER help_articles_updated_at
BEFORE UPDATE ON help_articles
FOR EACH ROW
EXECUTE FUNCTION update_help_articles_updated_at();


-- =====================================================================
-- SECTION 3: Seed the email signature help article
-- =====================================================================
-- Uses Postgres dollar-quoting ($article$...$article$) so HTML content
-- with apostrophes does not need to be escaped. ON CONFLICT DO NOTHING
-- makes this idempotent: re-running the migration is safe.

INSERT INTO help_articles (
  slug,
  title,
  article_type,
  category,
  excerpt,
  body,
  published,
  order_index
) VALUES (
  'email-signature-setup',
  'Updating Your Email Signature',
  'help',
  'Tools',
  'Step-by-step instructions for generating your email signature in Collective Agent and adding it to Outlook on web, Mac, and Windows.',
  $article$
<p>We have moved the email signature generator into Collective Agent. The old generator at <code>emailsignature.coachingbrokeragetools.com</code> will be retired soon, so all agents need to update their signature using the new tool before <strong>Friday, June 19, 2026</strong>.</p>

<h2>Why this matters</h2>
<p>After June 19, photos in your old email signature will stop loading. Clients, leads, and other agents who receive your emails will see a broken image placeholder where your headshot should be. Updating your signature takes about two minutes and keeps you looking professional.</p>

<h2>Generate your new signature</h2>
<ol>
  <li>Log in to Collective Agent and go to the <strong>Email Signature</strong> page in the menu.</li>
  <li>Upload your headshot if prompted, or use the one already on file. Adjust the crop if needed.</li>
  <li>Confirm your contact info (name, title, phone, email, social links).</li>
  <li>Click <strong>Copy Signature</strong>.</li>
  <li>When asked if you want to save, click <strong>Save signature</strong> so you do not have to fill in the form next time.</li>
</ol>

<h2>Add it to Outlook on the Web</h2>
<p>If you check your email through outlook.office.com:</p>
<ol>
  <li>Click the <strong>gear icon</strong> in the top right.</li>
  <li>Choose <strong>Mail</strong>, then <strong>Compose and reply</strong>.</li>
  <li>Under <strong>Email signature</strong>, delete your old signature and paste the new one.</li>
  <li>Check the boxes to automatically include it on new messages and replies.</li>
  <li>Click <strong>Save</strong>.</li>
</ol>

<h2>Add it to Outlook Desktop (Mac)</h2>
<ol>
  <li>Open Outlook.</li>
  <li>Go to <strong>Outlook</strong> menu, then <strong>Settings</strong>, then <strong>Signatures</strong>.</li>
  <li>Select your existing signature and delete the contents, or create a new one.</li>
  <li>Paste the new signature.</li>
  <li>Set it as the default for new messages and replies.</li>
  <li>Close the settings window.</li>
</ol>

<h2>Add it to Outlook Desktop (Windows)</h2>
<ol>
  <li>Open Outlook.</li>
  <li>Go to <strong>File</strong>, then <strong>Options</strong>, then <strong>Mail</strong>, then <strong>Signatures</strong>.</li>
  <li>Select your existing signature and clear it, or create a new one.</li>
  <li>Paste the new signature.</li>
  <li>Set it as the default for new messages and replies.</li>
  <li>Click <strong>OK</strong>.</li>
</ol>

<h2>About mobile</h2>
<p>The Outlook mobile app does not support styled HTML signatures with images. If you want your mobile replies to include your photo, the simplest approach is to send replies from your desktop or web Outlook when possible. Otherwise, mobile replies will use a plain text signature.</p>

<h2>Need help?</h2>
<p>If your headshot does not appear in the new tool, or any step above is not working, reach out to Tara directly or email <a href="mailto:tcandcompliance@collectiverealtyco.com">tcandcompliance@collectiverealtyco.com</a> and we will get you set up.</p>
  $article$,
  true,
  0
)
ON CONFLICT (slug) DO NOTHING;


-- =====================================================================
-- VERIFICATION QUERIES (run these after migration to confirm success)
-- =====================================================================
-- Uncomment and run individually in Supabase SQL Editor to verify:
--
-- -- How many users were backfilled (should match active signature users)
-- SELECT 
--   COUNT(*) FILTER (WHERE new_signature_completed_at IS NOT NULL) as already_done,
--   COUNT(*) FILTER (WHERE new_signature_completed_at IS NULL) as not_yet
-- FROM users
-- WHERE is_active = true;
--
-- -- Sample backfilled users
-- SELECT email, new_signature_completed_at 
-- FROM users 
-- WHERE new_signature_completed_at IS NOT NULL 
-- ORDER BY new_signature_completed_at DESC 
-- LIMIT 10;
--
-- -- Confirm help_articles table exists
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'help_articles' ORDER BY ordinal_position;
