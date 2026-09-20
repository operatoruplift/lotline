import type { MetadataRoute } from 'next';

const siteUrl = 'https://lotlineonsolana.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/app`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${siteUrl}/pre-ipo`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${siteUrl}/demo`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${siteUrl}/brand-kit`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/offline`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
