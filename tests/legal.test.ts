import { describe, expect, it } from 'vitest';
import { LEGAL_UPDATED, OPERATOR, supportContact, SUPPORT_ISSUES_URL } from '../lib/legal';
import sitemap from '../app/sitemap';

describe('legal pages', () => {
  it('name the operator and the shared update date', () => {
    expect(OPERATOR).toBe('Operator Uplift');
    expect(LEGAL_UPDATED).toEqual({ iso: '2026-10-07', label: '7 October 2026' });
  });

  it('show the configured support email, or the GitHub Issues page when there is none', () => {
    expect(supportContact('help@lotline.dev')).toEqual({ kind: 'email', label: 'help@lotline.dev', href: 'mailto:help@lotline.dev' });
    expect(supportContact('  help@lotline.dev  ')).toMatchObject({ kind: 'email', label: 'help@lotline.dev' });
    const fallback = { kind: 'issues', label: 'GitHub Issues', href: SUPPORT_ISSUES_URL };
    expect(SUPPORT_ISSUES_URL).toBe('https://github.com/operatoruplift/lotline/issues');
    for (const value of [undefined, '', '   ', 'not-an-email', 'a@b', 'help@lotline.dev?subject=x', 'help@lotline.dev\nBcc: x@y.dev', '<help@lotline.dev>', 'javascript:alert(1)@x.dev', `${'a'.repeat(250)}@x.dev`]) {
      expect(supportContact(value)).toEqual(fallback);
    }
  });

  it('are listed in the sitemap', () => {
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain('https://lotline.dev/privacy');
    expect(urls).toContain('https://lotline.dev/terms');
  });
});
