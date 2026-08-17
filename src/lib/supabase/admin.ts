import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

/**
 * Server-side Supabase client using the service_role key.
 *
 * This key bypasses Row Level Security, so it must never reach a browser. It
 * is only ever imported by API route handlers, which check the tour PIN cookie
 * before doing anything with it. `server-only` makes the build fail loudly if
 * this file is ever pulled into a client component.
 */
export function getServiceSupabase(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceKey) return null;
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isServerSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
