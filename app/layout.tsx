import type { Metadata, Viewport } from 'next';
import { PwaSupport } from '@/components/pwa';
import { MotionProvider } from '@/components/motion-provider';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://lotline.dev'),
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
    images: [{ url: '/brand-kit/og-image.png?v=sculpture-2', width: 1200, height: 630, alt: 'Lotline — Your next contribution, clearly.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lotline — Your next contribution, clearly.',
    description: 'Plan your next xStocks contribution with exact USDC splits and read-only estimates.',
    images: ['/brand-kit/og-image.png?v=sculpture-2'],
  },
  appleWebApp: { capable: true, title: 'Lotline', statusBarStyle: 'default' },
  applicationName: 'Lotline',
};

export const viewport: Viewport = { themeColor: '#174D3C', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body><MotionProvider><a className="skip-link" href="#main">Skip to content</a>{children}<PwaSupport /></MotionProvider></body></html>;
}
