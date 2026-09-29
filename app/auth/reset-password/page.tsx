import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
import { headerSections } from '@/lib/server/features';
export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false } };
export default function ResetPassword() { return <><SiteHeader {...headerSections()} /><main id="main"><AuthForm mode="reset-password" /></main><SiteFooter /></>; }
