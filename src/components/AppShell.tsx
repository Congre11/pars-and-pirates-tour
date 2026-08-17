'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';

/**
 * The mobile chrome: a compact top bar carrying the live team score at all
 * times, and a thumb-reachable bottom tab bar. Both are fixed, because on a
 * golf course you want the score and the "Score" button available from any
 * screen without scrolling.
 */

interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const TABS: Tab[] = [
  {
    href: '/',
    label: 'Home',
    icon: <Icon path="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
    match: (p) => p === '/',
  },
  {
    href: '/leaderboard',
    label: 'Live',
    icon: <Icon path="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
    match: (p) => p.startsWith('/leaderboard') || p.startsWith('/match') || p.startsWith('/round'),
  },
  {
    href: '/itinerary',
    label: 'Schedule',
    icon: <Icon path="M8 3v3m8-3v3M3.5 9h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z" />,
    match: (p) => p.startsWith('/itinerary') || p.startsWith('/course'),
  },
  {
    href: '/teams',
    label: 'Teams',
    icon: <Icon path="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19m13.5-9.5a3 3 0 1 0 0-.01M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35" />,
    match: (p) => p.startsWith('/teams') || p.startsWith('/formats') || p.startsWith('/stats'),
  },
  {
    href: '/more',
    label: 'More',
    icon: <Icon path="M5 12h.01M12 12h.01M19 12h.01" />,
    match: (p) => p.startsWith('/more') || p.startsWith('/admin') || p.startsWith('/fines'),
  },
];

function ConnectionPill() {
  const { mode, isOnline, pendingWrites } = useTour();

  if (mode === 'demo') {
    return (
      <Link
        href="/more/setup"
        className="chip bg-brass-500/20 text-brass-300 ring-1 ring-brass-500/30"
        title="Running on this device only. Connect Supabase for live multi-phone scoring."
      >
        DEMO
      </Link>
    );
  }

  if (!isOnline) {
    return (
      <span className="chip bg-pirate-500/25 text-pirate-300 ring-1 ring-pirate-400/30">
        OFFLINE{pendingWrites > 0 ? ` · ${pendingWrites}` : ''}
      </span>
    );
  }

  if (pendingWrites > 0) {
    return (
      <span className="chip bg-brass-500/20 text-brass-300 ring-1 ring-brass-500/30">
        SAVING {pendingWrites}
      </span>
    );
  }

  return (
    <span className="chip bg-fairway-500/20 text-fairway-300 ring-1 ring-fairway-400/30">
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-fairway-300" />
      LIVE
    </span>
  );
}

/** The always-visible score line: PARS 4½ — 3½ PIRATES. */
function ScoreStrip() {
  const { snapshot, standings } = useTour();
  const [home, away] = snapshot.teams;
  if (!home || !away) return null;

  const homePoints = standings.byTeam[home.id]?.points ?? 0;
  const awayPoints = standings.byTeam[away.id]?.points ?? 0;

  const format = (value: number) =>
    Number.isInteger(value) ? String(value) : `${Math.floor(value)}½`;

  return (
    <Link href="/leaderboard" className="flex items-center gap-2.5 tap">
      <span
        className="rounded-md px-1.5 py-0.5 text-[0.6rem] font-black tracking-wider"
        style={{ backgroundColor: home.colour, color: '#fff' }}
      >
        {home.shortName}
      </span>
      <span className="tabular display text-lg font-bold leading-none">
        {format(homePoints)}
        <span className="mx-1 text-chalk-500">–</span>
        {format(awayPoints)}
      </span>
      <span
        className="rounded-md px-1.5 py-0.5 text-[0.6rem] font-black tracking-wider"
        style={{ backgroundColor: away.colour, color: '#fff' }}
      >
        {away.shortName}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, error, lastError, dismissError } = useTour();
  const { session } = useSession();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/85 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <ScoreStrip />
          <div className="flex items-center gap-2">
            <ConnectionPill />
          </div>
        </div>
      </header>

      {lastError && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-brass-500/40 bg-brass-500/12 px-3 py-2.5 text-sm text-brass-300">
          <span className="flex-1">{lastError}</span>
          <button onClick={dismissError} className="tap font-bold" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pt-4">
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState message={error} />}
        {status === 'ready' && children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-ink-950/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`tap flex flex-col items-center gap-1 py-2.5 text-[0.62rem] font-semibold tracking-wide transition-colors ${
                  active ? 'text-fairway-300' : 'text-chalk-500'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.icon}
                {tab.label.toUpperCase()}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 pt-6">
      <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
      <p className="pt-2 text-center text-sm text-chalk-500">Loading the tour…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="card mt-6 space-y-3 p-5">
      <h2 className="display text-xl font-bold text-pirate-300">Could not load the tour</h2>
      <p className="text-sm text-chalk-200">{message}</p>
      <p className="text-sm text-chalk-400">
        If you have just set up Supabase, check that you ran both{' '}
        <code className="rounded bg-black/40 px-1">supabase/migrations/0001_init.sql</code> and{' '}
        <code className="rounded bg-black/40 px-1">supabase/seed.sql</code> in the SQL editor.
      </p>
      <Link href="/more/setup" className="btn-ghost w-full">
        Open the setup checklist
      </Link>
    </div>
  );
}
