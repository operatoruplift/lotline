import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <><SiteHeader /><main id="main"><AuthForm mode="sign-in" confirmationError={params.error === 'confirmation'} /></main><SiteFooter /></>;
}
