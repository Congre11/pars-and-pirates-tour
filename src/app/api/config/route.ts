import { NextResponse } from 'next/server';
import { hasStrongSessionSecret, isPinRequired } from '@/lib/auth/session';
import { isServerSupabaseConfigured } from '@/lib/supabase/admin';
import { hnaStatus } from '@/lib/hna/adapter';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A plain-English setup report.
 *
 * Admin → Setup renders this, so a non-technical organiser can see exactly what
 * is connected and what is still missing without reading any code or logs.
 */
export async function GET() {
  const clientConfigured = isSupabaseConfigured;
  const serverConfigured = isServerSupabaseConfigured();

  const checks = [
    {
      key: 'supabase_read',
      label: 'Database connection (reading)',
      ok: clientConfigured,
      detail: clientConfigured
        ? 'Connected. The app is reading live tour data from Supabase.'
        : 'Not set. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to switch off demo mode.',
    },
    {
      key: 'supabase_write',
      label: 'Database connection (saving scores)',
      ok: serverConfigured,
      detail: serverConfigured
        ? 'Connected. Scores entered on any phone are saved for everyone.'
        : 'Not set. Add SUPABASE_SERVICE_ROLE_KEY so scores can be saved.',
    },
    {
      key: 'realtime',
      label: 'Live sync between phones',
      ok: clientConfigured && serverConfigured,
      detail:
        clientConfigured && serverConfigured
          ? 'On. Every open phone updates within a second or two of a score being tapped in.'
          : 'Off. In demo mode scores stay on this device only.',
    },
    {
      key: 'pin',
      label: 'Tour PIN',
      ok: Boolean(process.env.TOUR_PIN),
      detail: process.env.TOUR_PIN
        ? 'Set. Everyone types this once to get in.'
        : 'Not set. Anyone with the link can open the app.',
    },
    {
      key: 'admin_pin',
      label: 'Admin PIN (captains only)',
      ok: Boolean(process.env.ADMIN_PIN),
      detail: process.env.ADMIN_PIN
        ? 'Set. Only people with this PIN can edit handicaps, pairings and correct scores.'
        : 'Not set. Admin screens are open to anyone who is signed in.',
    },
    {
      key: 'session_secret',
      label: 'Login security key',
      ok: hasStrongSessionSecret(),
      detail: hasStrongSessionSecret()
        ? 'Set. Sign-ins are signed properly.'
        : 'Not set. Add SESSION_SECRET (a long random string) before the tour.',
    },
    {
      key: 'scorecard_reader',
      label: 'Scorecard photo reading',
      ok: Boolean(process.env.ANTHROPIC_API_KEY),
      detail: process.env.ANTHROPIC_API_KEY
        ? 'On. Photograph a course scorecard and the app reads it into editable fields for you to check.'
        : 'Not set. Add ANTHROPIC_API_KEY to read scorecard photos automatically. Without it you type the course data in by hand, which works exactly the same.',
      optional: true,
    },
    {
      key: 'hna',
      label: 'HNA handicap sync',
      ok: hnaStatus().configured,
      detail: hnaStatus().message,
      optional: true,
    },
  ];

  return NextResponse.json({
    mode: clientConfigured ? 'supabase' : 'demo',
    pinRequired: isPinRequired(),
    checks,
  });
}
