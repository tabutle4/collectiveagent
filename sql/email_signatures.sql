-- ============================================================
-- email_signatures table
-- One row per (user_id, layout). Stores form data as JSONB +
-- separate columns for image URLs and styling.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  layout text NOT NULL CHECK (layout IN ('classic', 'stacked', 'noLogo', 'mobile')),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_url text,
  photo_url_square text,
  logo_url text,
  logo_url_square text,
  cta_image_url text,
  cta_link text,
  border_color text DEFAULT '#000000',
  show_border boolean DEFAULT true,
  signature_type text DEFAULT 'with-photo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT email_signatures_pkey PRIMARY KEY (id),
  CONSTRAINT email_signatures_user_layout_unique UNIQUE (user_id, layout)
);

CREATE INDEX IF NOT EXISTS email_signatures_user_id_idx ON public.email_signatures(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_email_signatures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_signatures_updated_at_trigger ON public.email_signatures;
CREATE TRIGGER email_signatures_updated_at_trigger
BEFORE UPDATE ON public.email_signatures
FOR EACH ROW
EXECUTE FUNCTION update_email_signatures_updated_at();
