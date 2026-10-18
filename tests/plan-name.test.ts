import { describe, expect, it } from 'vitest';
import { isValidPlanName, PLAN_NAME_MAX_LENGTH, planNameSchema } from '../lib/domain/plan-name';

describe('plan names', () => {
  it('accept ordinary names in any script, trimmed, up to sixty characters', () => {
    for (const name of ['Big tech core', 'Núcleo tech 2026', 'Dad’s plan (v2)', '月次 積立', 'AAPL & MSFT 50/50', 'a'.repeat(PLAN_NAME_MAX_LENGTH)]) {
      expect(isValidPlanName(name), name).toBe(true);
    }
    expect(planNameSchema.parse('  Steady core  ')).toBe('Steady core');
    expect(PLAN_NAME_MAX_LENGTH).toBe(60);
  });

  it('refuse links and URL-like text, as display names do', () => {
    for (const name of ['see https://spam.test', 'HTTP plan', 'www.spam', 'buy.xyz', 'lotline.dev plan', 'ftp://files', 'Get rich .com']) {
      expect(isValidPlanName(name), name).toBe(false);
    }
    // A dot that is not a top-level domain is fine.
    expect(isValidPlanName('Plan no. 2')).toBe(true);
  });

  it('refuse control, invisible, formatting and bidi characters', () => {
    for (const name of ['a\u202Eb', 'zero\u200Bwidth', 'soft\u00ADhyphen', 'tab\there', `line${String.fromCharCode(0x2028)}break`, 'joined\u2060word', 'tag\u{E0041}x', 'b\uFEFFom', 'del\u007F', 'c1\u0085']) {
      expect(isValidPlanName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it('refuse empty and overlong names', () => {
    for (const name of ['', '   ', 'a'.repeat(PLAN_NAME_MAX_LENGTH + 1)]) expect(isValidPlanName(name), JSON.stringify(name)).toBe(false);
  });
});
