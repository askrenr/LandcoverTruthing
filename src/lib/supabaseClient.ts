import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { StoredPoint } from '../types'
import { toRow } from './mapping'
import { getSessionToken } from './storage'

/**
 * Direct browser access to Supabase. The anon key is public by design; row-level
 * security is the enforcement layer. The x-session-token header is what the RLS
 * policies compare against each row's session_token column.
 */

const TABLE = 'landcover_points'

/**
 * Read statically. Vite replaces `import.meta.env.VITE_*` at build time, and
 * dynamic indexing like `import.meta.env[name]` is not reliably substituted in
 * a production bundle — it would work in dev and return undefined once deployed.
 */
function env(): { url: string; key: string } {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    key: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  }
}

export function isBackendConfigured(): boolean {
  const { url, key } = env()
  return Boolean(url && key)
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!isBackendConfigured()) {
    throw new Error(
      'The submission server is not configured. Contact the project owner.',
    )
  }
  if (!client) {
    const { url, key } = env()
    client = createClient(url, key, {
      auth: { persistSession: false },
      global: { headers: { 'x-session-token': getSessionToken() } },
    })
  }
  return client
}

export async function savePointRemote(point: StoredPoint): Promise<void> {
  // Upsert on the client-generated id: retrying a request that timed out but
  // actually succeeded overwrites the row instead of duplicating it.
  const { error } = await getClient()
    .from(TABLE)
    .upsert(toRow(point), { onConflict: 'id' })

  if (error) {
    throw new Error(`Your point could not be saved: ${error.message}`)
  }
}

export async function deletePointRemote(id: string): Promise<void> {
  const { error } = await getClient().from(TABLE).delete().eq('id', id)

  if (error) {
    throw new Error(`That point could not be deleted: ${error.message}`)
  }
}
