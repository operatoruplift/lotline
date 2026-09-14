import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpRight, Check, FileText } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Brand kit',
  description: 'Download Lotline logos, profile images, wallpapers, social graphics, ads, and headers.',
  alternates: { canonical: '/brand-kit' },
  openGraph: {
    title: 'Lotline brand kit',
    description: 'A complete set of Lotline assets for profiles, social posts, ads, and headers.',
    images: [{ url: '/brand-kit/og-image.png', width: 1200, height: 630, alt: 'Lotline brand kit' }],
  },
};

type Asset = {
  file: string;
  label: string;
  description: string;
  dimensions: string;
  preview: string;
  previewWidth: number;
  previewHeight: number;
  tone?: 'dark' | 'light';
};

const assets: Record<string, Asset[]> = {
  'Logos and marks': [
    { file: 'lotline-mark.svg', label: 'Mark · forest', description: 'Primary branching mark on transparent canvas.', dimensions: 'SVG · 32 × 32', preview: '/brand-kit/lotline-mark.svg', previewWidth: 160, previewHeight: 160 },
    { file: 'lotline-mark-light.svg', label: 'Mark · paper', description: 'Reverse mark for forest or dark backgrounds.', dimensions: 'SVG · 32 × 32', preview: '/brand-kit/lotline-mark-light.svg', previewWidth: 160, previewHeight: 160, tone: 'dark' },
    { file: 'lotline-mark-monochrome.svg', label: 'Mark · monochrome', description: 'Single ink mark for print and one color use.', dimensions: 'SVG · 32 × 32', preview: '/brand-kit/lotline-mark-monochrome.svg', previewWidth: 160, previewHeight: 160 },
    { file: 'lotline-wordmark.svg', label: 'Wordmark · forest', description: 'Horizontal Lotline lockup with clear space.', dimensions: 'SVG · 520 × 128', preview: '/brand-kit/lotline-wordmark.svg', previewWidth: 520, previewHeight: 128 },
    { file: 'lotline-wordmark-light.svg', label: 'Wordmark · paper', description: 'Reverse lockup for dark surfaces.', dimensions: 'SVG · 520 × 128', preview: '/brand-kit/lotline-wordmark-light.svg', previewWidth: 520, previewHeight: 128, tone: 'dark' },
  ],
  'Profiles and app icons': [
    { file: 'profile-light.svg', label: 'Profile · paper SVG', description: 'Scalable avatar artwork for product surfaces and print.', dimensions: 'SVG · 1024 × 1024', preview: '/brand-kit/profile-light.svg', previewWidth: 1024, previewHeight: 1024 },
    { file: 'profile-dark.svg', label: 'Profile · forest SVG', description: 'Scalable reverse avatar for dark surfaces and print.', dimensions: 'SVG · 1024 × 1024', preview: '/brand-kit/profile-dark.svg', previewWidth: 1024, previewHeight: 1024, tone: 'dark' },
    { file: 'profile-light.png', label: 'Profile · paper', description: 'Avatar artwork for social profiles and directories.', dimensions: 'PNG · 1024 × 1024', preview: '/brand-kit/profile-light.png', previewWidth: 1024, previewHeight: 1024 },
    { file: 'profile-dark.png', label: 'Profile · forest', description: 'Reverse avatar for dark profile surfaces.', dimensions: 'PNG · 1024 × 1024', preview: '/brand-kit/profile-dark.png', previewWidth: 1024, previewHeight: 1024, tone: 'dark' },
  ],
  'Social and ads': [
    { file: 'social-square.png', label: 'Social post', description: 'Square post for feeds and profile grids.', dimensions: 'PNG · 1080 × 1080', preview: '/brand-kit/social-square.png', previewWidth: 1080, previewHeight: 1080 },
    { file: 'social-story.png', label: 'Story', description: 'Vertical story artwork for mobile channels.', dimensions: 'PNG · 1080 × 1920', preview: '/brand-kit/social-story.png', previewWidth: 1080, previewHeight: 1920, tone: 'dark' },
    { file: 'ad-landscape.png', label: 'Ad · landscape', description: 'Link ad composition with a clear product message.', dimensions: 'PNG · 1200 × 628', preview: '/brand-kit/ad-landscape.png', previewWidth: 1200, previewHeight: 628 },
    { file: 'og-image.png', label: 'Link preview', description: 'Open Graph image for shared Lotline links.', dimensions: 'PNG · 1200 × 630', preview: '/brand-kit/og-image.png', previewWidth: 1200, previewHeight: 630 },
  ],
  'Headers and wallpapers': [
    { file: 'header-x.png', label: 'X header', description: 'Profile header with a generous safe center.', dimensions: 'PNG · 1500 × 500', preview: '/brand-kit/header-x.png', previewWidth: 1500, previewHeight: 500, tone: 'dark' },
    { file: 'header-linkedin.png', label: 'LinkedIn cover', description: 'Cover artwork sized for LinkedIn profiles and pages.', dimensions: 'PNG · 1584 × 396', preview: '/brand-kit/header-linkedin.png', previewWidth: 1584, previewHeight: 396 },
    { file: 'wallpaper-phone.png', label: 'Phone wallpaper', description: 'Tall lock screen background with quiet icon space.', dimensions: 'PNG · 1290 × 2796', preview: '/brand-kit/wallpaper-phone.png', previewWidth: 1290, previewHeight: 2796 },
    { file: 'wallpaper-desktop.png', label: 'Desktop wallpaper', description: 'Wide desktop background for demos and presentations.', dimensions: 'PNG · 2880 × 1800', preview: '/brand-kit/wallpaper-desktop.png', previewWidth: 2880, previewHeight: 1800, tone: 'dark' },
    { file: 'background-paper.svg', label: 'Background · paper', description: 'Flexible 16:9 paper canvas for your own layouts.', dimensions: 'SVG · 1920 × 1080', preview: '/brand-kit/background-paper.svg', previewWidth: 1920, previewHeight: 1080 },
    { file: 'background-forest.svg', label: 'Background · forest', description: 'Flexible 16:9 forest canvas for overlays and decks.', dimensions: 'SVG · 1920 × 1080', preview: '/brand-kit/background-forest.svg', previewWidth: 1920, previewHeight: 1080, tone: 'dark' },
  ],
};

function AssetCard({ asset }: { asset: Asset }) {
  return <article className={styles.card}>
    <div className={`${styles.preview} ${asset.tone === 'dark' ? styles.previewDark : ''}`}>
      <Image src={asset.preview} alt="" width={asset.previewWidth} height={asset.previewHeight} sizes="(max-width: 700px) 88vw, 360px" />
    </div>
    <div className={styles.cardBody}>
      <div><h3>{asset.label}</h3><p>{asset.description}</p></div>
      <div className={styles.cardMeta}><span>{asset.dimensions}</span><a className={styles.download} href={`/brand-kit/${asset.file}`} download={asset.file}>Download <ArrowDownToLine size={14} aria-hidden="true" /></a></div>
    </div>
  </article>;
}

export default function BrandKitPage() {
  return <><SiteHeader /><main id="main" className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className="eyebrow"><span className="eyebrow-rule" /> THE LOTLINE BRAND KIT</p>
        <h1>A complete kit,<br /><em>ready to move.</em></h1>
        <p className={styles.lede}>Save the Lotline identity to your phone, your social profiles, and your next presentation. Every export uses the same branching mark, calm palette, and clear voice.</p>
        <div className={styles.heroActions}><a className="button primary large" href="/brand-kit/lotline-brand-kit.zip" download="lotline-brand-kit.zip">Download full kit <ArrowDownToLine size={16} /></a><a className="text-button" href="/brand-kit/brand-guide.md" target="_blank" rel="noopener noreferrer">Open usage guide <ArrowUpRight size={15} /></a></div>
        <p className={styles.ready}><Check size={15} aria-hidden="true" /> Updated September 2026 · 19 ready-to-use exports</p>
        <p className={styles.phoneNote}>On a phone, tap any individual download and use your browser’s share menu to save the image. The full kit ZIP goes to Files.</p>
      </div>
      <div className={styles.heroTile} aria-label="Lotline brand preview">
        <Image src="/brand-kit/social-square.png" alt="Lotline social post preview" width={1080} height={1080} loading="eager" sizes="(max-width: 800px) 84vw, 440px" />
        <span className={styles.tileTag}>LOTLINE / BRAND SYSTEM</span>
      </div>
    </section>
    <section className={styles.palette} aria-labelledby="palette-title"><div><p className="eyebrow"><span className="eyebrow-rule" /> THE PALETTE</p><h2 id="palette-title">Quiet color.<br /><em>Clear signal.</em></h2></div><div className={styles.swatches}><div><i className={styles.swatchForest} /><strong>Forest</strong><span>#174D3C</span></div><div><i className={styles.swatchPaper} /><strong>Paper</strong><span>#F5F4EE</span></div><div><i className={styles.swatchSage} /><strong>Sage</strong><span>#BFD5A9</span></div><div><i className={styles.swatchMoss} /><strong>Moss</strong><span>#6E8D6B</span></div></div></section>
    {Object.entries(assets).map(([heading, items]) => <section className={styles.assetSection} key={heading} aria-labelledby={heading.toLowerCase().replaceAll(' ', '-')}><div className={styles.sectionHeading}><div><p className="eyebrow"><span className="eyebrow-rule" /> DOWNLOADABLE ASSETS</p><h2 id={heading.toLowerCase().replaceAll(' ', '-')}>{heading}</h2></div><p>{items.length} exports · Tap download to save an individual file.</p></div><div className={styles.grid}>{items.map(asset => <AssetCard key={asset.file} asset={asset} />)}</div></section>)}
    <section className={styles.guide}><div><p className="eyebrow"><span className="eyebrow-rule" /> KEEP IT CONSISTENT</p><h2>The mark carries the plan.</h2><p>Keep the three open channels, rounded ends, and clear center intact. Use the supplied SVGs whenever possible, and give the mark at least one mark-height of breathing room.</p></div><Link className="button secondary" href="/brand-kit/brand-guide.md" target="_blank">Read the brand guide <FileText size={15} /></Link></section>
  </main><SiteFooter /></>;
}
