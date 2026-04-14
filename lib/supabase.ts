import { createClient, SupabaseClient } from '@supabase/supabase-js'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Server-side client with service role (for admin operations)
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase

// ─── Batched Fetching ─────────────────────────────────────────────────────────
// Supabase has a 1000 row default limit. This helper fetches all rows in batches.

export interface FetchAllRowsOptions {
  orderBy?: { column: string; ascending?: boolean; nullsFirst?: boolean }
  filters?: Array<{
    type: 'eq' | 'neq' | 'is' | 'not' | 'in' | 'gte' | 'lte'
    column: string
    value: any
  }>
}

/**
 * Fetch all rows from a table in batches to bypass 1000 row limit.
 * Uses supabaseAdmin by default but accepts any Supabase client.
 */
export async function fetchAllRows<T = any>(
  table: string,
  selectFields: string,
  options?: FetchAllRowsOptions,
  client: SupabaseClient = supabaseAdmin
): Promise<T[]> {
  const BATCH_SIZE = 1000
  let allData: T[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = client.from(table).select(selectFields).range(offset, offset + BATCH_SIZE - 1)

    // Apply filters
    if (options?.filters) {
      for (const f of options.filters) {
        switch (f.type) {
          case 'eq':
            query = query.eq(f.column, f.value)
            break
          case 'neq':
            query = query.neq(f.column, f.value)
            break
          case 'is':
            query = query.is(f.column, f.value)
            break
          case 'not':
            query = query.not(f.column, 'is', f.value)
            break
          case 'in':
            query = query.in(f.column, f.value)
            break
          case 'gte':
            query = query.gte(f.column, f.value)
            break
          case 'lte':
            query = query.lte(f.column, f.value)
            break
        }
      }
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? false,
        nullsFirst: options.orderBy.nullsFirst ?? false,
      })
    }

    const { data, error } = await query

    if (error) throw error

    if (data && data.length > 0) {
      allData = allData.concat(data as T[])
      offset += BATCH_SIZE
      hasMore = data.length === BATCH_SIZE
    } else {
      hasMore = false
    }
  }

  return allData
}
