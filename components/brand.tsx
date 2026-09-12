import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="Lotline home">
    <BrandMark /><span>Lotline<span className="brand-period">.</span></span>
  </Link>;
}
