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
      /**
       * Back off properly when the socket will not connect.
       *
       * The default schedule tops out at one attempt every 10 seconds and then
       * repeats forever. That is the wrong behaviour when the database itself
       * is the thing that is unwell: every open phone keeps reconnecting, and
       * each reconnect re-registers its subscriptions, so the clients add load
       * to a server that is already struggling and stop it recovering.
       *
       * After ten quick attempts (~1 minute of genuine trouble) this drops to
       * one attempt a minute. Recovery is still automatic and nobody has to
       * reload, but a bad hour costs 60 connections per phone rather than 360.
       */
      reconnectAfterMs: (tries: number) => {
        const quick = [1000, 2000, 5000, 10000];
        if (tries <= quick.length) return quick[tries - 1];
        return tries > 10 ? 60_000 : 10_000;
      },
    },
  });
  return cached;
}
