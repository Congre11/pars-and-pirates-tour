'use client';

import { useTour } from '@/lib/data/provider';
import { PageHeader } from '@/components/ui';

/**
 * Wraps every tour-settings screen.
 *
 * There is no lock here any more — the app has no PINs and no permission
 * levels. What separates these screens from the ones used on the course is
 * where they live: everything under /admin is reached deliberately from
 * More → Tour settings, and none of it is needed to play, score, group the
 * 4-balls or set the matchups.
 */
export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { mode } = useTour();

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title={title} subtitle={subtitle} back="/admin" />
      {mode === 'demo' && (
        <p className="rounded-xl border border-brass-500/35 bg-brass-500/10 px-3 py-2 text-xs text-brass-300">
          Demo mode — changes are saved to this device only.
        </p>
      )}
      {children}
    </div>
  );
}
