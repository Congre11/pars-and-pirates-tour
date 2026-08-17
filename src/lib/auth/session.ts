import 'server-only';

import { cookies } from 'next/headers';
import type { Session } from '@/lib/types';

/**
 * Lightweight private-tour access.
 *
 * There is no public sign-up and no password. Everyone types the tour PIN once
 * and picks their name; captains type the admin PIN instead. The result is a
 * signed, httpOnly cookie that the write API routes check before touching the
 * database.
 *
 * The cookie is signed with HMAC-SHA256 so it cannot be edited by hand to
 * award yourself admin.
 */

export const SESSION_COOKIE = 'pnp_session';
const SESSION_TTL_DAYS = 60;

function getSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    // Falls back to the PINs so the app still works if someone forgets to set
    // SESSION_SECRET. Weaker, but never insecure-by-silence: /api/config
    // reports it so Admin can show a warning.
    `${process.env.TOUR_PIN ?? ''}:${process.env.ADMIN_PIN ?? ''}:pars-and-pirates`
  );
}

export function hasStrongSessionSecret(): boolean {
  return Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16);
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(signature));
}

/** Constant-time string comparison, so a signature cannot be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(session: Session): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = await hmac(payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as Session;
    const ageDays = (Date.now() - session.issuedAt) / 86_400_000;
    if (ageDays > SESSION_TTL_DAYS) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  };
}

/**
 * Whether a PIN is required at all.
 *
 * In demo mode (no Supabase) there is nothing on a server to protect — the
 * data lives in your own browser — so the PIN gate is skipped and people just
 * pick their name.
 */
export function isPinRequired(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function checkPin(pin: string): { ok: boolean; isAdmin: boolean } {
  const tourPin = process.env.TOUR_PIN?.trim();
  const adminPin = process.env.ADMIN_PIN?.trim();
  const supplied = pin.trim();

  if (adminPin && safeEqual(supplied, adminPin)) return { ok: true, isAdmin: true };
  if (tourPin && safeEqual(supplied, tourPin)) return { ok: true, isAdmin: false };
  // No PIN configured at all: let people in but never as admin.
  if (!tourPin && !adminPin) return { ok: true, isAdmin: false };
  return { ok: false, isAdmin: false };
}
