import { describe, expect, it } from 'vitest';
import { jupiterReviewUrl, jupiterSwapUrl, USDC_MINT } from '../lib/domain/jupiter';

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

describe('Jupiter review links', () => {
  it('sells USDC and buys the requested mint using the query form', () => {
    const url = new URL(jupiterReviewUrl(AAPLX)!);
    expect(url.origin + url.pathname).toBe('https://jup.ag/swap');
    expect(url.searchParams.get('sell')).toBe(USDC_MINT);
    expect(url.searchParams.get('buy')).toBe(AAPLX);
  });

  it('never emits the legacy path form, which substitutes SOL for the output mint', () => {
    expect(jupiterReviewUrl(AAPLX)).not.toMatch(/\/swap\/[^?]/);
  });

  it('prefills the exact allocation, preserving micro-USDC precision', () => {
    expect(new URL(jupiterReviewUrl(AAPLX, '500000001')!).searchParams.get('inAmount')).toBe('500.000001');
    expect(new URL(jupiterReviewUrl(AAPLX, '1')!).searchParams.get('inAmount')).toBe('0.000001');
  });

  it('trims trailing zeros without losing value', () => {
    expect(new URL(jupiterReviewUrl(AAPLX, '500000000')!).searchParams.get('inAmount')).toBe('500');
    expect(new URL(jupiterReviewUrl(AAPLX, '100000')!).searchParams.get('inAmount')).toBe('0.1');
  });

  it('omits a zero amount rather than prefilling a meaningless order', () => {
    expect(new URL(jupiterReviewUrl(AAPLX, '0')!).searchParams.has('inAmount')).toBe(false);
  });

  it('returns null rather than a wrong link for an unusable mint', () => {
    expect(jupiterReviewUrl(USDC_MINT)).toBeNull();
    expect(jupiterReviewUrl('')).toBeNull();
    expect(jupiterReviewUrl('not-base58-0OIl')).toBeNull();
    expect(jupiterReviewUrl(`${AAPLX}extra-characters-past-the-limit`)).toBeNull();
    expect(jupiterReviewUrl(AAPLX, '12.5')).toBeNull();
    expect(jupiterReviewUrl(AAPLX, '-1')).toBeNull();
  });

  it('exposes a generic swap surface for when no asset is in context', () => {
    expect(jupiterSwapUrl()).toBe('https://jup.ag/swap');
  });
});
