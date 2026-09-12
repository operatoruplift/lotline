import mark from '@/lib/brand/mark.json';

export function BrandMark({ className }: { className?: string }) {
  return <svg className={className} width="32" height="32" viewBox={mark.viewBox} fill="none" aria-hidden="true">
    <path d={mark.path} stroke="currentColor" strokeWidth={mark.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
