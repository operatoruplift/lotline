import Link from 'next/link';

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="Lotline home">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="6" y="16" width="4" height="9" rx="1.2" fill="currentColor" />
      <rect x="14" y="11" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="22" y="6" width="4" height="19" rx="1.2" fill="currentColor" />
      <path d="M4.5 27.5H27.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg><span>Lotline<span className="brand-period">.</span></span>
  </Link>;
}
