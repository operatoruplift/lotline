import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false } };
export default function ResetPassword() { return <><SiteHeader /><main id="main"><AuthForm mode="reset-password" /></main><SiteFooter /></>; }
