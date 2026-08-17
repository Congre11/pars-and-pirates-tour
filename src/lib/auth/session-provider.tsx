'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@/lib/types';

interface SessionContextValue {
  session: Session | null;
  pinRequired: boolean;
  loading: boolean;
  signIn: (input: { pin: string; playerId: string | null; playerName: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Holds the private-tour sign-in.
 *
 * The session itself lives in a signed httpOnly cookie set by /api/session;
 * this just mirrors it into React so screens can show the right name and
 * reveal admin controls.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session')
      .then((r) => r.json())
      .then((data: { session: Session | null; pinRequired: boolean }) => {
        if (cancelled) return;
        setSession(data.session);
        setPinRequired(data.pinRequired);
      })
      .catch(() => {
        // Offline on first load — treat as signed out and let the gate decide.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (input: { pin: string; playerId: string | null; playerName: string }) => {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Could not sign in' }));
        throw new Error(body.error ?? 'Could not sign in');
      }
      const body = await response.json();
      setSession(body.session as Session);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' });
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, pinRequired, loading, signIn, signOut }),
    [session, pinRequired, loading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
