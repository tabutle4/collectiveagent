import { createClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Browser-safe Supabase client (anon key only). Used by client components.
// Kept separate from lib/supabase.ts so the service-role admin client in that
// module is never evaluated in the browser bundle (which would throw
// "Missing env.SUPABASE_SERVICE_ROLE_KEY" and crash the page).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
