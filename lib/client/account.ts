import { z } from 'zod';
import { shortAddress } from '@/lib/supabase/wallet-identity';

/** The account `/api/auth/session` reports for a signed-in member. */
export const accountUserSchema = z.object({ id: z.string().min(1), email: z.string().optional(), wallet: z.string().optional() });
export type AccountUser = z.infer<typeof accountUserSchema>;

/** How an account reads on screen: its email, its wallet, or neither. */
export function accountLabel(user?: Partial<AccountUser> | null): string {
  return user?.email || (user?.wallet ? `wallet ${shortAddress(user.wallet)}` : 'your account');
}

/** What a member reads once their account is gone. */
export const ACCOUNT_DELETED_MESSAGE = 'Your account and its saved data were deleted. You are signed out. Your draft on this device is unchanged.';
