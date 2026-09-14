import { z } from 'zod';
import { validateIntentShape, type ContributionIntent } from '@/lib/domain/execution';
import { addressSchema, isBoundedRaw, MAX_USDC_RAW, USDC_MINT } from '@/lib/server/common';
import { PLAN_MINTS } from '@/lib/supabase/plans';

const raw = z.string().refine(value => isBoundedRaw(value, MAX_USDC_RAW), 'Use a bounded unsigned raw amount.');
const limits = z.object({
  slippageBps: z.number().int().min(0).max(500),
  maximumPriorityFeeLamports: raw,
  maximumTotalSolCostLamports: raw,
  maximumTokenFeeBps: z.number().int().min(0).max(100),
}).strict();
const leg = z.object({
  id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  issuerId: z.string().min(1).max(64),
  mint: addressSchema,
  allocationBps: z.number().int().min(0).max(10_000),
  maximumInputRaw: raw,
}).strict();
export const intentSchema = z.object({
  version: z.literal(1),
  chain: z.literal('solana:mainnet'),
  wallet: addressSchema,
  inputMint: z.literal(USDC_MINT),
  budgetRaw: raw,
  legs: z.array(leg).min(1).max(10),
  policyVersion: z.string().min(1).max(64),
  reviewedLimits: limits,
  scheduleOccurrenceId: z.string().min(1).max(160).optional(),
}).strict().superRefine((value, context) => {
  const error = validateIntentShape(value as ContributionIntent);
  if (error) context.addIssue({ code: z.ZodIssueCode.custom, message: error });
  if (BigInt(value.budgetRaw) > MAX_USDC_RAW) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The contribution exceeds the supported budget.' });
});
export const runRequestSchema = z.object({ intent: intentSchema }).strict();
export const orderRequestSchema = z.object({ intent: intentSchema, mint: addressSchema }).strict();
export const executeRequestSchema = z.object({ requestId: z.string().min(1).max(160), signedTransaction: z.string().min(1).max(1_700_000), messageHash: z.string().regex(/^[a-f0-9]{64}$/), lastValidBlockHeight: raw.optional() }).strict();
export const reconcileRequestSchema = z.object({ attemptId: z.string().uuid() }).strict();

const scheduleAllocations = z.array(z.object({ mint: z.string().refine(value => (PLAN_MINTS as readonly string[]).includes(value)), bps: z.string().regex(/^(0|[1-9]\d{0,4})$/) }).strict()).min(1).max(10).refine(items => new Set(items.map(item => item.mint)).size === items.length).refine(items => items.reduce((sum, item) => sum + Number(item.bps), 0) === 10_000);
export const scheduleSchema = z.object({ name: z.string().trim().min(1).max(60), budgetRaw: raw.refine(value => BigInt(value) > 0n), allocations: scheduleAllocations, cadence: z.enum(['weekly', 'monthly']), timezone: z.string().min(1).max(80), nextDueAt: z.string().datetime({ offset: true }), paused: z.boolean().default(false) }).strict();
export const schedulePatchSchema = scheduleSchema.partial().extend({ id: z.string().uuid() }).strict();
