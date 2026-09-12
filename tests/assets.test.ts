import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isAddress } from '@solana/kit';
import { identityForSymbol, officialLogoUrlForSymbol, XSTOCK_LOGO_PATHS, XSTOCK_REGISTRY } from '../lib/domain/assets';
import evidence from '../docs/xstocks-catalog-verification.json';

describe('bundled xStocks identity assets', () => {
  it('pins a unique, address-valid identity for the complete verified issuer snapshot', () => {
    expect(XSTOCK_REGISTRY.length).toBe(evidence.supportedCount);
    expect(XSTOCK_REGISTRY.length).toBeGreaterThan(800);
    expect(new Set(XSTOCK_REGISTRY.map(asset => asset.symbol)).size).toBe(XSTOCK_REGISTRY.length);
    expect(new Set(XSTOCK_REGISTRY.map(asset => asset.mint)).size).toBe(XSTOCK_REGISTRY.length);
    for (const asset of XSTOCK_REGISTRY) {
      expect(isAddress(asset.mint)).toBe(true);
      expect(asset.underlyingSymbol).not.toBe('');
      expect(asset.underlyingIsin).not.toBe('');
    }
    expect(identityForSymbol('__proto__')).toBeUndefined();
    expect(officialLogoUrlForSymbol('unverified')).toBeUndefined();
  });
  it('includes a valid issuer logo for every curated symbol', () => {
    for (const [symbol, logoPath] of Object.entries(XSTOCK_LOGO_PATHS)) {
      const file = resolve(process.cwd(), 'public', logoPath.slice(1));
      expect(existsSync(file), `${symbol} logo is missing`).toBe(true);
      const bytes = readFileSync(file);
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.readUInt32BE(16)).toBe(400);
      expect(bytes.readUInt32BE(20)).toBe(400);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(evidence.logos[symbol as keyof typeof evidence.logos].sha256);
      expect(officialLogoUrlForSymbol(symbol)).toBe(`https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`);
    }
  });
});
