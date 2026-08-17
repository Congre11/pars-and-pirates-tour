'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTour } from '@/lib/data/provider';
import { useSession } from '@/lib/auth/session-provider';
import { LinkRow, PageHeader, SectionTitle } from '@/components/ui';

/** Everything that does not deserve its own tab. */
export default function MorePage() {
  const { snapshot, mode, scorerName } = useTour();
  const { session, signOut } = useSession();
  const router = useRouter();
  const [showQr, setShowQr] = useState(false);

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-3 pb-6">
      <PageHeader
        title="More"
        subtitle={session?.playerName ? `Signed in as ${session.playerName}` : 'Signed in'}
      />

      <SectionTitle>The tour</SectionTitle>
      <div className="space-y-2">
        <LinkRow href="/formats" title="Formats & rules" detail="How each day is scored" icon="📖" />
        <LinkRow href="/teams" title="Teams & handicaps" detail="Rosters, indexes, points" icon="👥" />
        <LinkRow href="/itinerary" title="Itinerary" detail="All eight days" icon="🗓️" />
        <LinkRow href="/fines" title="Fines" detail="The running tab" icon="💸" />
      </div>

      <SectionTitle>Captains</SectionTitle>
      <div className="space-y-2">
        <LinkRow
          href="/admin"
          title="Admin"
          detail={
            session?.isAdmin
              ? 'Players, pairings, courses, scores and rules'
              : 'Needs the captains’ PIN'
          }
          icon="🔧"
        />
        <LinkRow href="/more/setup" title="Setup checklist" detail="What is connected" icon="✅" />
      </div>

      <SectionTitle>This device</SectionTitle>
      <div className="card divide-y divide-white/6">
        <div className="flex items-center justify-between px-3.5 py-3 text-sm">
          <span className="text-chalk-400">Scores entered as</span>
          <span className="font-semibold">{scorerName}</span>
        </div>
        <div className="flex items-center justify-between px-3.5 py-3 text-sm">
          <span className="text-chalk-400">Mode</span>
          <span className="font-semibold">
            {mode === 'demo' ? 'Demo (this device only)' : 'Live (shared database)'}
          </span>
        </div>
        <button
          onClick={() => setShowQr((v) => !v)}
          className="tap flex w-full items-center justify-between px-3.5 py-3 text-sm"
        >
          <span className="text-chalk-400">Share the app</span>
          <span className="font-semibold text-fairway-300">
            {showQr ? 'Hide' : 'Show link'}
          </span>
        </button>
        {showQr && (
          <div className="px-3.5 py-3 text-center">
            <p className="break-all rounded-lg bg-black/40 px-3 py-2 text-xs text-chalk-300">
              {shareUrl}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => navigator.clipboard?.writeText(shareUrl)}
                className="btn-ghost flex-1 text-xs"
              >
                Copy link
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  onClick={() =>
                    navigator.share?.({ title: 'Pars & Pirates Tour', url: shareUrl })
                  }
                  className="btn-ghost flex-1 text-xs"
                >
                  Share…
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-chalk-500">
              Everyone opens this link, types the tour PIN and taps “Add to Home Screen”.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={async () => {
          await signOut();
          router.push('/');
        }}
        className="btn-ghost mt-2 w-full"
      >
        Sign out of this device
      </button>

      <p className="pt-2 text-center text-xs text-chalk-500">
        {snapshot.tour.name} · {snapshot.tour.year} · {snapshot.tour.location}
      </p>
    </div>
  );
}
