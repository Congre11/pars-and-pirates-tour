'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** Page title block used at the top of every secondary screen. */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: string;
}) {
  const router = useRouter();
  return (
    <div className="mb-4">
      {back !== undefined && (
        <button
          onClick={() => (back ? router.push(back) : router.back())}
          className="tap mb-2 inline-flex items-center gap-1 text-sm font-semibold text-chalk-400"
        >
          <span aria-hidden>‹</span> Back
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display truncate text-2xl font-bold leading-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-chalk-400">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between first:mt-0">
      <h2 className="label">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, detail, cta }: { title: string; detail?: string; cta?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-5 py-8 text-center">
      <p className="font-semibold text-chalk-200">{title}</p>
      {detail && <p className="text-sm text-chalk-500">{detail}</p>}
      {cta}
    </div>
  );
}

/** Amber warning used for unverified course data and missing handicaps. */
export function Warning({ children, href }: { children: ReactNode; href?: string }) {
  const body = (
    <div className="flex items-start gap-2.5 rounded-xl border border-brass-500/35 bg-brass-500/10 px-3 py-2.5 text-sm text-brass-300">
      <span aria-hidden className="mt-0.5 shrink-0">⚠</span>
      <span className="flex-1">{children}</span>
      {href && <span aria-hidden className="text-brass-400">›</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block tap">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A team-coloured pill. */
export function TeamChip({
  name,
  colour,
  size = 'sm',
}: {
  name: string;
  colour: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`chip font-black tracking-wider text-white ${
        size === 'md' ? 'text-[0.72rem]' : 'text-[0.62rem]'
      }`}
      style={{ backgroundColor: colour }}
    >
      {name}
    </span>
  );
}

/** Circular player avatar; falls back to initials when there is no photo. */
export function Avatar({
  name,
  initials,
  colour,
  photoUrl,
  size = 36,
}: {
  name: string;
  initials: string;
  colour: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      // Remote avatars are user-supplied URLs, so a plain img avoids needing a
      // next.config image allow-list for every host anyone might paste in.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2"
        style={{ width: size, height: size, boxShadow: `0 0 0 2px ${colour}` }}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colour,
        fontSize: size * 0.38,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Big tappable row used for navigation lists. */
export function LinkRow({
  href,
  title,
  detail,
  icon,
  trailing,
}: {
  href: string;
  title: string;
  detail?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Link href={href} className="card tap flex items-center gap-3 px-4 py-3.5">
      {icon && <span className="text-xl">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {detail && <span className="block text-sm text-chalk-400">{detail}</span>}
      </span>
      {trailing ?? <span className="text-chalk-500" aria-hidden>›</span>}
    </Link>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-3 py-3 text-center">
      <div className="tabular display text-2xl font-bold leading-none">{value}</div>
      <div className="label mt-1.5">{label}</div>
      {hint && <div className="mt-0.5 text-[0.65rem] text-chalk-500">{hint}</div>}
    </div>
  );
}
