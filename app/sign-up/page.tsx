import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { SiteFooter, SiteHeader } from '@/components/site-shell';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };
export default function SignUp() { return <><SiteHeader /><main id="main"><AuthForm mode="sign-up" /></main><SiteFooter /></>; }
