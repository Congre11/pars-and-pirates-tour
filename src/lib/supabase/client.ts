'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client using the public anon key.
 *
 * Read-only by design: Row Level Security grants the anon key SELECT and
 * nothing else. Writes go through this app's server API routes. This client
 * exists to (a) load the tour and (b) hold the realtime subscription that
 * makes every phone update live.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (cached) return cached;
  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: {
        // Plenty for eight players tapping in scores; keeps the socket calm.
        eventsPerSecond: 20,
      },
    },
  });
  return cached;
}
