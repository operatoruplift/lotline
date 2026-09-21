import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowDownToLine, ArrowUpRight, Check, FileText, Smartphone } from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Brand kit',
  description: 'Download Lotline logos, profile images, wallpapers, social graphics, ads, and headers.',
  alternates: { canonical: '/brand-kit' },
  openGraph: {
    title: 'Lotline brand kit',
    description: 'A complete set of Lotline assets for profiles, social posts, ads, and headers.',
    images: [{ url: '/brand-kit/og-image.png?v=sculpture-2', width: 1200, height: 630, alt: 'Lotline brand kit' }],
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

const assetVersion = 'sculpture-2';
const assetUrl = (file: string) => `/brand-kit/${file}?v=${assetVersion}`;

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
    { file: 'header-linkedin.png', label: 'LinkedIn cover', description: 'A wide cover sized for your LinkedIn profile.', dimensions: 'PNG · 1584 × 396', preview: '/brand-kit/header-linkedin.png', previewWidth: 1584, previewHeight: 396 },
    { file: 'wallpaper-phone.png', label: 'Phone wallpaper', description: 'Tall lock screen background with quiet icon space.', dimensions: 'PNG · 1290 × 2796', preview: '/brand-kit/wallpaper-phone.png', previewWidth: 1290, previewHeight: 2796 },
    { file: 'wallpaper-desktop.png', label: 'Desktop wallpaper', description: 'Wide desktop background for demos and presentations.', dimensions: 'PNG · 2880 × 1800', preview: '/brand-kit/wallpaper-desktop.png', previewWidth: 2880, previewHeight: 1800, tone: 'dark' },
    { file: 'background-paper.svg', label: 'Background · paper', description: 'Flexible 16:9 paper canvas for your own layouts.', dimensions: 'SVG · 1920 × 1080', preview: '/brand-kit/background-paper.svg', previewWidth: 1920, previewHeight: 1080 },
    { file: 'background-forest.svg', label: 'Background · forest', description: 'Flexible 16:9 forest canvas for overlays and decks.', dimensions: 'SVG · 1920 × 1080', preview: '/brand-kit/background-forest.svg', previewWidth: 1920, previewHeight: 1080, tone: 'dark' },
  ],
};

const collections = [
  { title: 'Social and ads', id: 'social', number: '01', description: 'A clear first impression, wherever your story is shared.', layout: 'campaigns' },
  { title: 'Headers and wallpapers', id: 'wallpapers', number: '02', description: 'A little more space. A quieter kind of presence.', layout: 'wallpapers' },
  { title: 'Profiles and app icons', id: 'profiles', number: '03', description: 'The same familiar mark, made for your smallest canvas.', layout: 'profiles' },
  { title: 'Logos and marks', id: 'logos', number: '04', description: 'The essentials. Scalable, transparent, and ready to use.', layout: 'logos' },
] as const;

function AssetCard({ asset }: { asset: Asset }) {
  const isPortrait = asset.previewHeight > asset.previewWidth;
  const isHeader = asset.previewWidth / asset.previewHeight >= 3;
  const isLogo = asset.file.startsWith('lotline-');
  const isMark = asset.file.startsWith('lotline-mark');
  const previewClass = [
    styles.preview,
    asset.tone === 'dark' ? styles.previewDark : '',
    isPortrait ? styles.previewPortrait : '',
    isHeader ? styles.previewHeader : '',
    isLogo ? styles.previewLogo : '',
    isMark ? styles.previewMark : '',
  ].filter(Boolean).join(' ');

  return <article className={`${styles.card} ${isHeader ? styles.cardHeader : ''}`}>
    <a className={previewClass} href={assetUrl(asset.file)} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${asset.label} at full size (opens in a new tab)`}>
      <Image src={`${asset.preview}?v=${assetVersion}`} alt="" width={asset.previewWidth} height={asset.previewHeight} sizes={isHeader ? '(max-width: 700px) 90vw, 1216px' : '(max-width: 700px) 90vw, (max-width: 1000px) 45vw, 600px'} />
      <span className={styles.previewHint} aria-hidden="true"><ArrowUpRight size={16} /></span>
    </a>
    <div className={styles.cardBody}>
      <div className={styles.cardTitle}><h3>{asset.label}</h3><span>{asset.dimensions}</span></div>
      <p>{asset.description}</p>
      <div className={styles.cardActions}>
        <a className={styles.openImage} href={assetUrl(asset.file)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${asset.label} at full size (opens in a new tab)`}>Open full size <ArrowUpRight size={14} aria-hidden="true" /></a>
        <a className={styles.download} href={assetUrl(asset.file)} download={asset.file} aria-label={`Download ${asset.label}`}>Download <ArrowDownToLine size={14} aria-hidden="true" /></a>
      </div>
    </div>
  </article>;
}

export default function BrandKitPage() {
  return <><SiteHeader /><main id="main" className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className="eyebrow"><span className="eyebrow-rule" /> THE LOTLINE BRAND KIT</p>
        <h1>A complete kit,<br /><em>ready to move.</em></h1>
        <p className={styles.lede}>A familiar mark. A fresh perspective. Wallpapers, profiles, and social artwork with room to breathe — made to make Lotline yours.</p>
        <div className={styles.heroActions}><a className="button primary large" href="/brand-kit/lotline-brand-kit.zip" download="lotline-brand-kit.zip">Download full kit <ArrowDownToLine size={16} aria-hidden="true" /></a><a className="text-button" href="#collections">Explore the collection <ArrowDownToLine size={15} aria-hidden="true" /></a></div>
        <p className={styles.ready}><Check size={15} aria-hidden="true" /> 19 ready-to-use exports · PNG + SVG</p>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.heroTopline}><span>LOTLINE / OBJECTS OF CLARITY</span><span>VOL. 02</span></div>
        <div className={styles.heroTile}>
          <Image src={assetUrl('social-square.png')} alt="Lotline social artwork in the collection’s paper and forest palette" width={1080} height={1080} loading="eager" sizes="(max-width: 700px) 85vw, 540px" />
        </div>
        <div className={styles.heroPhone}>
          <Image src={assetUrl('wallpaper-phone.png')} alt="A preview of the Lotline phone wallpaper" width={1290} height={2796} loading="eager" sizes="(max-width: 700px) 28vw, 165px" />
        </div>
        <p className={styles.visualCaption}><span>Form, light, and a clear next step.</span><span>01 — 19</span></p>
      </div>
    </section>

    <div className={styles.collectionBar} id="collections">
      <p className={styles.collectionLabel}>THE COLLECTION</p>
      <nav aria-label="Brand kit collections">{collections.map(collection => <a key={collection.id} href={`#${collection.id}`}><span>{collection.number}</span>{collection.title}<ArrowUpRight size={13} aria-hidden="true" /></a>)}</nav>
    </div>

    <aside className={styles.phoneNote} aria-label="Saving assets on your phone">
      <Smartphone size={20} strokeWidth={1.5} aria-hidden="true" />
      <div><strong>Made to save. Made to share.</strong><p>On your phone, choose <b>Open full size</b>, then touch and hold the image or use the share menu to save it to Photos. Use Download for a file; the full ZIP saves to Files.</p></div>
    </aside>

    {collections.map(collection => <section className={`${styles.assetSection} ${styles[collection.layout]}`} key={collection.id} id={collection.id} aria-labelledby={`${collection.id}-title`}>
      <div className={styles.sectionHeading}><div><p className={styles.sectionNumber}>COLLECTION / {collection.number}</p><h2 id={`${collection.id}-title`}>{collection.title}</h2></div><p>{collection.description}<span>{assets[collection.title].length} exports</span></p></div>
      <div className={styles.grid}>{assets[collection.title].map(asset => <AssetCard key={asset.file} asset={asset} />)}</div>
    </section>)}

    <section className={styles.palette} aria-labelledby="palette-title"><div><p className="eyebrow"><span className="eyebrow-rule" /> THE PALETTE</p><h2 id="palette-title">Quiet color.<br /><em>Clear signal.</em></h2><p>Warm paper, deep forest, and the softer shades between.</p></div><div className={styles.swatches}><div><i className={styles.swatchForest} /><strong>Forest</strong><span>#174D3C</span></div><div><i className={styles.swatchPaper} /><strong>Paper</strong><span>#F5F4EE</span></div><div><i className={styles.swatchSage} /><strong>Sage</strong><span>#BFD5A9</span></div><div><i className={styles.swatchMoss} /><strong>Moss</strong><span>#6E8D6B</span></div></div></section>
    <section className={styles.guide}><div><p className="eyebrow"><span className="eyebrow-rule" /> KEEP IT CONSISTENT</p><h2>The mark carries the plan.</h2><p>Keep the three open channels, rounded ends, and clear center intact. Use the supplied SVGs whenever possible, and give the mark at least one mark-height of breathing room.</p></div><a className="button secondary" href="/brand-kit/brand-guide.md" target="_blank" rel="noopener noreferrer">Read the brand guide <FileText size={15} aria-hidden="true" /></a></section>
  </main><SiteFooter /></>;
}
