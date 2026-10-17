import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressBucket, addressHashKey, clientAddress, hashedLabel, UNKNOWN_ADDRESS } from '../lib/server/client-address';

afterEach(() => vi.unstubAllEnvs());

describe('address buckets', () => {
  it('keeps an IPv4 address whole', () => {
    expect(addressBucket('203.0.113.9')).toBe('203.0.113.9');
    expect(addressBucket(' 203.0.113.9 ')).toBe('203.0.113.9');
    expect(addressBucket('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(addressBucket('203.0.113.9').startsWith('203.0.113')).toBe(true);
    expect(addressBucket('203.0.113.10')).not.toBe(addressBucket('203.0.113.9'));
  });

  it('collapses an IPv6 address to its /64 prefix, so one subscriber is one bucket', () => {
    const prefix = '2001:0db8:85a3:08d3::/64';
    expect(addressBucket('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe(prefix);
    expect(addressBucket('2001:DB8:85A3:8D3:FFFF:FFFF:FFFF:FFFF')).toBe(prefix);
    expect(addressBucket('2001:db8:85a3:8d3::1')).toBe(prefix);
    expect(addressBucket('[2001:db8:85a3:8d3::1]')).toBe(prefix);
    expect(addressBucket('2001:db8:85a3:8d4::1')).toBe('2001:0db8:85a3:08d4::/64');
    expect(addressBucket('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(addressBucket('::1')).toBe('0000:0000:0000:0000::/64');
    expect(addressBucket('fe80::1%en0')).toBe('fe80:0000:0000:0000::/64');
  });

  it('puts an absent or malformed address in the shared unknown bucket', () => {
    for (const value of [null, undefined, '', '   ', 'not-an-address', '203.0.113.999', '203.0.113', '2001:db8:::1', '2001:db8::85a3::1', '2001:db8:85a3:8d3:1319:8a2e:370:7348:1', '1:2:3:4:5:6:7', '::ffff:203.0.113.999', '2001:db8:12345::1', 'x-forwarded-for: 1.2.3.4']) {
      expect(addressBucket(value), String(value)).toBe(UNKNOWN_ADDRESS);
    }
    expect(clientAddress(new Request('https://lotline.dev'))).toBe(UNKNOWN_ADDRESS);
    expect(clientAddress(new Request('https://lotline.dev', { headers: { 'x-forwarded-for': '203.0.113.9' } }))).toBe(UNKNOWN_ADDRESS);
    expect(clientAddress(new Request('https://lotline.dev', { headers: { 'x-real-ip': '2001:db8:85a3:8d3::9' } }))).toBe('2001:0db8:85a3:08d3::/64');
  });
});

describe('address hashing', () => {
  it('uses the dedicated salt when it is set, and the Supabase secret only until then', () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_unit_test');
    vi.stubEnv('LOTLINE_IP_HASH_SALT', '');
    expect(addressHashKey()).toBe('sb_secret_unit_test');
    expect(hashedLabel('plan-report:ip:203.0.113.9')).toBe(createHmac('sha256', 'sb_secret_unit_test').update('plan-report:ip:203.0.113.9').digest('hex'));
    vi.stubEnv('LOTLINE_IP_HASH_SALT', ' a-long-random-salt-for-ip-hashing ');
    expect(addressHashKey()).toBe('a-long-random-salt-for-ip-hashing');
    expect(hashedLabel('plan-report:ip:203.0.113.9')).toBe(createHmac('sha256', 'a-long-random-salt-for-ip-hashing').update('plan-report:ip:203.0.113.9').digest('hex'));
  });

  it('never hashes with an empty or unexpected key', () => {
    vi.stubEnv('LOTLINE_IP_HASH_SALT', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    expect(addressHashKey()).toBeNull();
    expect(hashedLabel('anything')).toBeNull();
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_publishable_not_a_secret');
    expect(hashedLabel('anything')).toBeNull();
  });
});
