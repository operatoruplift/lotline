import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn(),validate:vi.fn(),reserve:vi.fn(),labels:vi.fn()}));
vi.mock('@/lib/server/common',async importOriginal=>({...await importOriginal<object>(),fetchJson:mocks.fetch}));
vi.mock('@/lib/server/execution/semantic-validation',()=>({validateExecutableOrder:mocks.validate}));
vi.mock('@/lib/server/execution/route-policy',()=>({unsupportedDexLabels:mocks.labels}));
vi.mock('@/lib/server/provider-limits',()=>({reserveProviderSlot:mocks.reserve}));
import { createExecutionOrder } from '../lib/server/execution/orders';
import { executionFixture } from './execution-fixtures';
beforeEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();mocks.labels.mockResolvedValue('Whirlpool');});
it('requires a server key before contacting any execution provider',async()=>{
 vi.stubEnv('JUPITER_API_KEY','');const f=await executionFixture();
 await expect(createExecutionOrder(f.intent,f.asset,f.intent.reviewedLimits)).rejects.toThrow(/API key/);
 expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.validate).not.toHaveBeenCalled();
});
it('passes the provider envelope through semantic validation and propagates a rejection',async()=>{
 // This cryptographic fixture is deliberately NOT a semantic swap; the validator must decide.
 vi.stubEnv('JUPITER_API_KEY','test-only-key');const f=await executionFixture();
 mocks.fetch.mockResolvedValue({...f.order,platformFee:{feeBps:0,feeMint:f.intent.inputMint}});
 mocks.validate.mockRejectedValue(new Error('unsupported encoded swap'));
 await expect(createExecutionOrder(f.intent,f.asset,f.intent.reviewedLimits)).rejects.toThrow('unsupported encoded swap');
 expect(mocks.validate).toHaveBeenCalledTimes(1);
 expect(mocks.validate.mock.calls[0][0]).toMatchObject({transaction:f.unsignedBase64,platformFee:{feeBps:0}});
 const [url,options]=mocks.fetch.mock.calls[0];const parsed=new URL(url);
 expect(parsed.pathname).toBe('/swap/v2/order');expect(parsed.searchParams.get('taker')).toBe(f.intent.wallet);
 expect(parsed.searchParams.get('excludeDexes')).toBe('Whirlpool');expect(parsed.searchParams.has('jitoTipLamports')).toBe(false);
 expect(options.headers).toEqual({'x-api-key':'test-only-key'});
});
