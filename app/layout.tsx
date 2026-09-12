import type { Metadata, Viewport } from 'next';
import { PwaSupport } from '@/components/pwa';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://lotlineonsolana.vercel.app'),
  title: { default: 'Lotline — Your next contribution, clearly.', template: '%s · Lotline' },
  description: 'A clear plan for your next xStocks contribution. Choose your split, get read-only estimates, and take your plan with you.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Lotline — Your next contribution, clearly.',
    description: 'Plan your next xStocks contribution with exact USDC splits, read-only estimates, and a clear path to Jupiter.',
    url: '/',
    siteName: 'Lotline',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/icons/icon-512.png?v=branch-1', width: 512, height: 512, alt: 'Lotline mark' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lotline — Your next contribution, clearly.',
    description: 'Plan your next xStocks contribution with exact USDC splits and read-only estimates.',
    images: ['/icons/icon-512.png?v=branch-1'],
  },
  icons: { icon: '/brand/favicon.svg?v=branch-1', apple: '/icons/apple-touch-icon.png?v=branch-1' },
  appleWebApp: { capable: true, title: 'Lotline', statusBarStyle: 'default' },
  applicationName: 'Lotline',
};

export const viewport: Viewport = { themeColor: '#174D3C', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}<PwaSupport /></body></html>;
}
