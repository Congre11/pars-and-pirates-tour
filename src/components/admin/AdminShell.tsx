'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth/session-provider';
import { useTour } from '@/lib/data/provider';
import { PageHeader } from '@/components/ui';

/**
 * Wraps every admin screen.
 *
 * Two jobs: keep non-captains out when an admin PIN is configured, and be
 * honest about what saving does — in demo mode edits stay on this device.
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
  const { session, pinRequired } = useSession();
  const { mode } = useTour();

  if (pinRequired && !session?.isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} back="/more" />
        <div className="card px-4 py-6 text-center">
          <p className="text-2xl">🔒</p>
          <p className="mt-2 font-semibold">Captains only</p>
          <p className="mt-1 text-sm text-chalk-400">
            Sign out and sign back in with the captains’ admin PIN to edit the tour.
          </p>
          <Link href="/more" className="btn-ghost mt-4 w-full">
            Back
          </Link>
        </div>
      </div>
    );
  }

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
