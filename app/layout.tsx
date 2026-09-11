import type { Metadata, Viewport } from 'next';
import { PwaSupport } from '@/components/pwa';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Lotline — Your next contribution, clearly.', template: '%s · Lotline' },
  description: 'A clear plan for your next xStocks contribution. Choose your split, get read-only estimates, and take your plan with you.',
  icons: { icon: '/brand/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Lotline', statusBarStyle: 'default' },
  applicationName: 'Lotline',
};

export const viewport: Viewport = { themeColor: '#174D3C', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}<PwaSupport /></body></html>;
}
