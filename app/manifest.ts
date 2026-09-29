import type { MetadataRoute } from 'next';
import { marketsEnabled } from '@/lib/server/features';

export default function manifest(): MetadataRoute.Manifest {
  // Read at build time, like the landing page: with the markets flag on, the installed app opens on Portfolio.
  const markets = marketsEnabled();
  return {
    id: '/',
    name: 'Lotline — Your next contribution, clearly.',
    short_name: 'Lotline',
    description: 'Plan your next xStocks contribution with exact USDC splits, read-only estimates, and an offline Example.',
    start_url: markets ? '/portfolio' : '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#F5F4EE',
    theme_color: '#174D3C',
    lang: 'en',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png?v=branch-1', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png?v=branch-1', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png?v=branch-1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      ...(markets ? [{ name: 'Markets', url: '/markets', description: 'Browse every verified asset with a dated market snapshot.' }] : []),
      { name: 'Make a plan', url: '/app', description: 'Plan with current read-only estimates.' },
      { name: 'Try the Example', url: '/offline', description: 'Explore a synthetic contribution plan, even offline.' },
    ],
  };
}
