import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
export const metadata: Metadata = { title: 'Update password', robots: { index: false, follow: false } };
export default function UpdatePassword() { return <><SiteHeader /><main id="main"><AuthForm mode="update-password" /></main><SiteFooter /></>; }
