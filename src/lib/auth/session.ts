import 'server-only';

import { cookies } from 'next/headers';
import type { Session } from '@/lib/types';

/**
 * Who is using this phone.
 *
 * There are no PINs and no permission levels. The tour is private because the
 * Vercel link is private; anyone who has it can open the app and use every
 * part of it. All this stores is the player's name, so a score or a change to
 * the 4-balls can say who made it.
 *
 * The cookie is still signed so a name cannot be forged by hand-editing it,
 * which keeps the audit trail honest — but nothing is gated on it.
 */

export const SESSION_COOKIE = 'pnp_session';
const SESSION_TTL_DAYS = 60;

function getSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    // The cookie only carries a display name, so a default keeps the app
    // working without configuration. /api/config still reports whether a real
    // secret is set.
    'pars-and-pirates-unsigned'
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

