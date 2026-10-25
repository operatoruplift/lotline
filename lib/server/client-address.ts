import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * The connection that every per-address limit and salted hash is keyed by.
 *
 * Only the platform-normalized `x-real-ip` is read. A client-supplied forwarded
 * chain is never trusted, and when the header is absent every such caller shares
 * one bucket. An IPv6 subscriber usually holds a whole /64 and can move through
 * it at will, so IPv6 collapses to that prefix; an IPv4 address is one bucket.
 */
export const UNKNOWN_ADDRESS = 'edge-unknown';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const IPV6_CHARACTERS = /^[0-9a-f:]+$/i;
const IPV6_GROUPS = 8;
const PREFIX_GROUPS = 4;

function isIpv4(value: string): boolean {
  const match = IPV4.exec(value);
  return match !== null && match.slice(1).every(part => Number(part) <= 255);
}

/** The /64 prefix of an IPv6 address as `xxxx:xxxx:xxxx:xxxx::/64`, or null when the text is not one. */
function ipv6Prefix(value: string): string | null {
  if (!IPV6_CHARACTERS.test(value)) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const compressed = halves.length === 2;
  if (compressed ? head.length + tail.length >= IPV6_GROUPS : head.length !== IPV6_GROUPS) return null;
  if ([...head, ...tail].some(group => group.length === 0 || group.length > 4)) return null;
  const groups = [...head, ...Array<string>(IPV6_GROUPS - head.length - tail.length).fill('0'), ...tail];
  return `${groups.slice(0, PREFIX_GROUPS).map(group => group.toLowerCase().padStart(4, '0')).join(':')}::/64`;
}

/** The bucket one address falls in: IPv4 whole, IPv6 as its /64, anything else unknown. */
export function addressBucket(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (!value) return UNKNOWN_ADDRESS;
  if (isIpv4(value)) return value;
  const mapped = IPV4_MAPPED_IPV6.exec(value);
  if (mapped) return isIpv4(mapped[1]) ? mapped[1] : UNKNOWN_ADDRESS;
  return ipv6Prefix(value) ?? UNKNOWN_ADDRESS;
}

/** The bucket this request's connection falls in. */
export function clientAddress(request: Request): string {
  return addressBucket(request.headers.get('x-real-ip'));
}

/**
 * The HMAC key for hashed addresses: a dedicated LOTLINE_IP_HASH_SALT, or the
 * Supabase secret key until one is set. Null when neither is configured, so no
 * caller ever hashes with an empty key.
 */
export function addressHashKey(): string | null {
  const salt = process.env.LOTLINE_IP_HASH_SALT?.trim();
  if (salt) return salt;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return secret?.startsWith('sb_secret_') ? secret : null;
}

/** HMAC-SHA-256 of a bucket label such as `plan-report:ip:<address>`, as hex. Null without a key. */
export function hashedLabel(label: string): string | null {
  const key = addressHashKey();
  return key ? createHmac('sha256', key).update(label).digest('hex') : null;
}
