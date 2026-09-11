'use client';
import Link from 'next/link';
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main id="main" className="route-state"><div role="alert"><p className="eyebrow">SOMETHING DID NOT LOAD</p><h1>Let’s try that again.</h1><p>Lotline could not open this page. Your saved local plan has not been cleared.</p><div className="route-state-actions"><button className="button primary" onClick={retry}>Try again</button><Link href="/" className="button secondary">Go home</Link></div></div></main>;
}
