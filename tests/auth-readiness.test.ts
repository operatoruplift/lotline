import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authEmailEnabled } from '@/lib/supabase/config';
import { AuthForm, authErrorMessage } from '@/components/auth-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
});
afterEach(() => vi.unstubAllEnvs());

describe('account email readiness', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true', 'true '])('defaults to unavailable for %s', value => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', value);
    expect(authEmailEnabled()).toBe(false);
  });

  it('requires an explicit exact true value', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'true');
    expect(authEmailEnabled()).toBe(true);
  });

  it.each(['sign-up', 'reset-password'] as const)('offers a real guest route instead of an unavailable %s form', mode => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'false');
    const html = renderToStaticMarkup(createElement(AuthForm, { mode }));
    expect(html).toContain('Signup and recovery emails aren’t available yet.');
    expect(html).toContain('Existing users can still sign in.');
    expect(html).toContain('href="/app?mode=example"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('id="auth-email"');
    expect(html).not.toContain('We’ll send you a secure link');
  });

  it.each(['sign-up', 'reset-password'] as const)('restores the real %s form when email is ready', mode => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'true');
    const html = renderToStaticMarkup(createElement(AuthForm, { mode }));
    expect(html).toContain('<form');
    expect(html).toContain('id="auth-email"');
    expect(html).not.toContain('Signup and recovery emails aren’t available yet.');
  });

  it('keeps existing-account sign-in available without promising new account email', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'false');
    const html = renderToStaticMarkup(createElement(AuthForm, { mode: 'sign-in' }));
    expect(html).toContain('<form');
    expect(html).toContain('id="auth-password"');
    expect(html).toContain('method="post"');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('Create an account');
  });

  it('still validates the recovery session before a password update while email is unavailable', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_ENABLED', 'false');
    const html = renderToStaticMarkup(createElement(AuthForm, { mode: 'update-password' }));
    expect(html).toContain('Checking your reset link');
    expect(html).not.toContain('Signup and recovery emails aren’t available yet.');
  });
});

describe('account error priority', () => {
  it.each(['over_email_send_rate_limit', 'email_address_not_authorized'])('explains email delivery for %s even with HTTP 429', code => {
    expect(authErrorMessage(code, 429)).toContain('Email delivery is currently limited.');
    expect(authErrorMessage(code, 429)).not.toContain('Too many requests.');
  });

  it('retains the general rate limit response for other request limits', () => {
    expect(authErrorMessage('over_request_rate_limit', 429)).toContain('Too many requests.');
    expect(authErrorMessage(undefined, 429)).toContain('Too many requests.');
  });

  it('keeps confirmation and credential errors actionable', () => {
    expect(authErrorMessage('email_not_confirmed')).toContain('Confirm your email');
    expect(authErrorMessage('invalid_credentials')).toContain('email or password didn’t match');
  });
});
