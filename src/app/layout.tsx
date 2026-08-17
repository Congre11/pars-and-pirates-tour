import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TourProvider } from '@/lib/data/provider';
import { SessionProvider } from '@/lib/auth/session-provider';
import { Gate } from '@/components/Gate';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: 'Pars & Pirates Tour',
  description:
    'Live scoring, leaderboards and the full itinerary for the Pars & Pirates Golf Tour.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Pars & Pirates',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  // Private tour app — keep it out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#050c09',
  width: 'device-width',
  initialScale: 1,
  // Stops iOS zooming when a score input is focused mid-round.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <TourProvider>
            <Gate>{children}</Gate>
          </TourProvider>
        </SessionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
