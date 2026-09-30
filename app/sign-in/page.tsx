import type { Metadata } from 'next';
import { AppTabBar } from '@/components/app-tab-bar';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import { headerSections, walletSignInEnabled } from '@/lib/server/features';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const header = headerSections();
  return <><SiteHeader {...header} active="account" /><main id="main"><AuthForm mode="sign-in" confirmationError={params.error === 'confirmation'} walletSignIn={walletSignInEnabled()} /></main><SiteFooter />{header.markets && <AppTabBar active="account" gallery={header.community} />}</>;
}
