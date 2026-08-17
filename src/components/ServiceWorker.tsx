'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the app installable and keeps the
 * shell available when the signal drops.
 *
 * Score data is NOT cached here — that is handled by the durable write queue
 * in `offline-queue.ts`, which is a safer place for it. The worker only caches
 * the app shell so opening the app in a dead spot still gives you a scorecard
 * rather than a browser error page.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // A worker on localhost during development just gets in the way.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Registration failures are not worth bothering anyone about; the app
        // works fine without it, it just is not installable.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
