'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth/session-provider';
import { useTour } from '@/lib/data/provider';
import { PageHeader } from '@/components/ui';

/**
 * The locked-out screen, shared by the admin hub and every admin page.
 *
 * Admin access has only ever depended on typing the `ADMIN_PIN` at sign-in —
 * it is not, and never was, tied to being a captain. The old wording ("Captains
 * only") implied otherwise and left the organiser thinking they had been shut
 * out by their own app, so this names the organiser and says plainly what to
 * type.
 */
export function AdminLocked({ title }: { title: string }) {
  const { snapshot } = useTour();
  const organisers = snapshot.players.filter((p) => p.isOrganiser).map((p) => p.name);

  return (
    <div className="space-y-4">
      <PageHeader title={title} back="/more" />
      <div className="card px-4 py-6 text-center">
        <p className="text-2xl">🔒</p>
        <p className="mt-2 font-semibold">Organiser access</p>
        <p className="mt-1 text-sm text-chalk-400">
          Sign out and sign back in using the <strong>admin PIN</strong> rather than the tour PIN.
        </p>
        <p className="mt-2 text-xs leading-snug text-chalk-500">
          {organisers.length > 0
            ? `${organisers.join(' and ')} runs the tour and holds this PIN. `
            : ''}
          Anyone with the admin PIN gets in — you do not need to be a captain.
        </p>
        <Link href="/more" className="btn-ghost mt-4 w-full">
          Back
        </Link>
      </div>
    </div>
  );
}

/**
 * Wraps every admin screen.
 *
 * Two jobs: keep people without the admin PIN out, and be honest about what
 * saving does — in demo mode edits stay on this device.
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
    return <AdminLocked title={title} />;
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
