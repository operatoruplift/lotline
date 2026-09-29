import type { Metadata } from 'next';
import { connection } from 'next/server';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import { headerSections, walletSignInEnabled } from '@/lib/server/features';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };
export default async function SignUp() {
  // The wallet flag is read per request, like the other operator flags.
  await connection();
  return <><SiteHeader {...headerSections()} /><main id="main"><AuthForm mode="sign-up" walletSignIn={walletSignInEnabled()} /></main><SiteFooter /></>;
}
