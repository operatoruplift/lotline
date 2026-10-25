import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppTabBar } from '@/components/app-tab-bar';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import { LEGAL_UPDATED, OPERATOR, supportContact } from '@/lib/legal';
import { headerSections } from '@/lib/server/features';

export type LegalSection = { id: string; title: string; body: ReactNode };

/** The privacy and terms pages: public, the same on every surface, with the phone tab bar when it is on. */
export function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: ReactNode; sections: LegalSection[] }) {
  const header = headerSections();
  return <><SiteHeader {...header} /><main id="main" className="legal-page page-width">
    <article aria-labelledby="legal-title">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: <time dateTime={LEGAL_UPDATED.iso}>{LEGAL_UPDATED.label}</time> · {OPERATOR}</p>
        <div className="legal-intro">{intro}</div>
      </header>
      <nav className="legal-contents" aria-label="On this page"><ol>{sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav>
      {sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}><h2 id={`${section.id}-title`}>{section.title}</h2>{section.body}</section>)}
    </article>
    <Link href="/app" className="button primary">Back to your plan</Link>
  </main><SiteFooter />{header.markets && <AppTabBar gallery={header.community} />}</>;
}

/** Where to reach the operator: the configured support email, or the repository's GitHub Issues page. */
export function ContactLine() {
  const contact = supportContact();
  return contact.kind === 'email'
    ? <p>Email <a href={contact.href}>{contact.label}</a>. We answer questions about these pages, your data and your account.</p>
    : <p>Open an issue on <a href={contact.href} target="_blank" rel="noopener noreferrer">{contact.label}<span className="sr-only"> (opens in a new tab)</span></a>. Issues are public, so never post your email, wallet address or anything else personal there. Describe what you need without personal details and we will reply there.</p>;
}
