import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { jupiterExecutionHeaders, requireJupiterExecutionHeaders } from '../lib/server/execution/provider-access';

beforeEach(() => {
  vi.stubEnv('JUPITER_API_KEY', '');
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', '');
});
afterEach(() => vi.unstubAllEnvs());

it.each(['', 'false', 'TRUE', '1', ' true '])('keeps execution provider access closed for opt-in value %j', value => {
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', value);
  expect(jupiterExecutionHeaders()).toBeNull();
  expect(() => requireJupiterExecutionHeaders()).toThrow('explicit keyless execution access');
});

it('omits the API-key header only after explicit keyless opt-in', () => {
  vi.stubEnv('JUPITER_API_KEY', '  ');
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', 'true');
  expect(requireJupiterExecutionHeaders()).toEqual({});
});

it('prefers the trimmed server key even when keyless access is allowed', () => {
  vi.stubEnv('JUPITER_API_KEY', ' fixture-server-key ');
  vi.stubEnv('LOTLINE_EXECUTION_KEYLESS_JUPITER', 'true');
  expect(requireJupiterExecutionHeaders()).toEqual({ 'x-api-key': 'fixture-server-key' });
});
