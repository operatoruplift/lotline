/**
 * Shared facts for the privacy and terms pages. The other Operator Uplift apps
 * use the same operator name, date format and contact rule.
 */
export const OPERATOR = 'Operator Uplift';
export const LEGAL_UPDATED = { iso: '2026-10-07', label: '7 October 2026' } as const;
export const SUPPORT_ISSUES_URL = 'https://github.com/operatoruplift/lotline/issues';

export type SupportContact = { kind: 'email' | 'issues'; label: string; href: string };

// One plain address: no display name, query, whitespace or header tricks.
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** The support email when NEXT_PUBLIC_SUPPORT_EMAIL is set, otherwise the repository's GitHub Issues page. */
export function supportContact(value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_EMAIL): SupportContact {
  const email = value?.trim();
  if (email && email.length <= 254 && EMAIL.test(email)) return { kind: 'email', label: email, href: `mailto:${email}` };
  return { kind: 'issues', label: 'GitHub Issues', href: SUPPORT_ISSUES_URL };
}
