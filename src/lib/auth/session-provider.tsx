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
  loading: boolean;
  signIn: (input: { playerId: string | null; playerName: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Holds which player is using this phone.
 *
 * There are no PINs and no permission levels — this exists purely so the app
 * knows whose card to open and whose name to put on a change.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session')
      .then((r) => r.json())
      .then((data: { session: Session | null }) => {
        if (cancelled) return;
        setSession(data.session);
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
    async (input: { playerId: string | null; playerName: string }) => {
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
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
