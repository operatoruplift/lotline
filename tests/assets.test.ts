import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { officialLogoUrlForSymbol, XSTOCK_LOGO_PATHS } from '../lib/domain/assets';

describe('bundled xStocks identity assets', () => {
  it('includes a valid issuer logo for every curated symbol', () => {
    for (const [symbol, logoPath] of Object.entries(XSTOCK_LOGO_PATHS)) {
      const file = resolve(process.cwd(), 'public', logoPath.slice(1));
      expect(existsSync(file), `${symbol} logo is missing`).toBe(true);
      const bytes = readFileSync(file);
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.readUInt32BE(16)).toBe(400);
      expect(bytes.readUInt32BE(20)).toBe(400);
      expect(officialLogoUrlForSymbol(symbol)).toBe(`https://xstocks-metadata.backed.fi/logos/tokens/${symbol}.png`);
    }
  });
});
