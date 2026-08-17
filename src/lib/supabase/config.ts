/**
 * Supabase configuration.
 *
 * The app is designed to run with OR without these values. When they are
 * missing it falls back to demo mode instead of crashing, so a fresh clone
 * always starts.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when real, multi-device live scoring is available. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
