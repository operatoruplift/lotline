import { describe, expect, it } from 'vitest';
import {
  DBC_COPY,
  DBC_FRESHNESS_MS,
  DBC_MAX_POOLS,
  DBC_PROGRAM_ID,
  DBC_SOURCE_LABEL,
  abbreviateAddress,
  dbcCliffFeeBps,
  dbcFeeBps,
  dbcItemSchema,
  dbcPoolSchema,
  dbcProgressBps,
  dbcResponseSchema,
  dbcSourceLabel,
  dbcSwapEstimateSchema,
  isDbcReadFresh,
} from '../lib/domain/dbc';

const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
const POOL = '21abDcSMr4Kk5wE9Rurfbu8rZJUPgeqxfNuQArpcvbmU';
const CONFIG = 'J3kjUJswhr3RdAYyzkq4oo9Twb3bTAQysETMSG7tPUkT';
const BADGE = '8VeVZe3Zxfpax2qQUp7i68FCLspLYErm2FJChc5NDuVn';
const LAUNCH = 'G135gqW9woGkjozfE5ysrsYMMr2duveZbBd9y8by3J9Z';

const estimate = () => ({
  amountInRaw: '1000000', netAmountInRaw: '980000', outRaw: '66370000000000', minimumOutRaw: '66038000000000',
  feeRaw: '20000', feeBps: 200, feeMint: AAPLX, feeSide: 'input' as const,
  currentPoint: '450505622', pointKind: 'slot' as const,
});
const pool = (over: Partial<ReturnType<typeof poolBase>> = {}) => ({ ...poolBase(), ...over });
const poolBase = () => ({
  pool: POOL, config: CONFIG, configKind: 'pool-config' as const,
  baseMint: LAUNCH, baseDecimals: 6,
  quoteReserveRaw: '48000000', baseReserveRaw: '0', migrationQuoteThresholdRaw: '10000000000',
  progressBps: 48, sqrtPrice: '79228162514264337593543950336', activationPoint: '450000000', migrated: false,
  cliffFeeBps: 200, estimate: estimate(), message: undefined as string | undefined,
});
const item = (over: Record<string, unknown> = {}) => ({
  mint: AAPLX, state: 'success' as const, quoteToken: true, badgeAccount: BADGE,
  configCount: 136, configsProbed: 10, pools: [pool()],
  source: dbcSourceLabel(POOL), slot: 450505622,
  fetchedAt: '2026-09-26T10:00:00.000Z', expiresAt: '2026-09-26T10:00:30.000Z',
  ...over,
});

describe('DBC curve arithmetic', () => {
  it('reports curve progress as integer basis points of the migration threshold', () => {
    expect(dbcProgressBps('5000000000', '10000000000')).toBe(5000);
    expect(dbcProgressBps('0', '10000000000')).toBe(0);
    // Reserves beyond the threshold clamp rather than exceeding a full curve.
    expect(dbcProgressBps('20000000000', '10000000000')).toBe(10_000);
  });

  it('rounds progress down so a curve is never reported further along than it is', () => {
    expect(dbcProgressBps('9999', '10000000000')).toBe(0);
    expect(dbcProgressBps('1999999999', '10000000000')).toBe(1999);
  });

  it('refuses progress inputs that are not raw integers or a positive threshold', () => {
    expect(() => dbcProgressBps('1.5', '10000000000')).toThrow();
    expect(() => dbcProgressBps('-1', '10000000000')).toThrow();
    expect(() => dbcProgressBps('1', '0')).toThrow();
  });

  it('measures the charged fee against the gross amount of the side it was taken from', () => {
    expect(dbcFeeBps('20000', '1000000')).toBe(200);
    expect(dbcFeeBps('0', '1000000')).toBe(0);
    expect(() => dbcFeeBps('1', '0')).toThrow();
  });

  it('converts a configured cliff fee numerator against the curve fee denominator', () => {
    expect(dbcCliffFeeBps('20000000')).toBe(200);
    expect(dbcCliffFeeBps('900000000')).toBe(9000);
    expect(dbcCliffFeeBps('0')).toBe(0);
  });

  it('keeps amounts exact beyond the safe-integer range', () => {
    // 2^53 and 2^53+1 are the same number in a float, so float arithmetic
    // reports a full curve here. Exact integer division reports 9999, which is
    // the difference between "migrating" and "one unit short".
    expect(dbcProgressBps('9007199254740992', '9007199254740993')).toBe(9999);
    expect(dbcFeeBps('9007199254740992', '9007199254740993')).toBe(9999);
  });
});

describe('DBC read labelling', () => {
  it('names the program when no pool is involved and the pool when one is', () => {
    expect(dbcSourceLabel()).toContain(DBC_SOURCE_LABEL);
    expect(dbcSourceLabel()).toContain(abbreviateAddress(DBC_PROGRAM_ID));
    expect(dbcSourceLabel(POOL)).toContain(abbreviateAddress(POOL));
  });

  it('abbreviates only addresses long enough to need it', () => {
    expect(abbreviateAddress(POOL)).toBe('21ab…cvbmU'.replace('cvbmU', POOL.slice(-4)));
    expect(abbreviateAddress('short')).toBe('short');
  });

  it('treats a read as current only inside its own window', () => {
    const read = { fetchedAt: '2026-09-26T10:00:00.000Z', expiresAt: '2026-09-26T10:00:30.000Z' };
    const at = (iso: string) => isDbcReadFresh(read, Date.parse(iso));
    expect(at('2026-09-26T10:00:00.000Z')).toBe(true);
    expect(at('2026-09-26T10:00:29.999Z')).toBe(true);
    // Expiry is exclusive, so a read is never counted as current on its last instant.
    expect(at('2026-09-26T10:00:30.000Z')).toBe(false);
    expect(at('2026-09-26T09:59:59.999Z')).toBe(false);
  });
});

describe('DBC response contract', () => {
  it('accepts a complete read of a real AAPLx-quoted pool', () => {
    expect(dbcItemSchema.safeParse(item()).success).toBe(true);
  });

  it('requires the fee to reconcile with the amount the curve actually applied', () => {
    // netAmountIn + fee must equal amountIn when the fee is taken on input.
    expect(dbcSwapEstimateSchema.safeParse({ ...estimate(), feeRaw: '19999' }).success).toBe(false);
    expect(dbcSwapEstimateSchema.safeParse({ ...estimate(), netAmountInRaw: '1000001' }).success).toBe(false);
  });

  it('refuses a minimum output above the estimate it protects', () => {
    expect(dbcSwapEstimateSchema.safeParse({ ...estimate(), minimumOutRaw: '66370000000001' }).success).toBe(false);
  });

  it('refuses a stated progress that disagrees with the reserves', () => {
    expect(dbcPoolSchema.safeParse(pool({ progressBps: 4999 })).success).toBe(false);
  });

  it('refuses an estimate on a curve that has already migrated', () => {
    expect(dbcPoolSchema.safeParse(pool({ migrated: true })).success).toBe(false);
    expect(dbcPoolSchema.safeParse(pool({ migrated: true, estimate: undefined })).success).toBe(true);
  });

  it('refuses configs or pools on a mint the program holds no badge for', () => {
    expect(dbcItemSchema.safeParse(item({ quoteToken: false })).success).toBe(false);
    expect(dbcItemSchema.safeParse(item({
      quoteToken: false, state: 'unavailable', configCount: 0, configsProbed: 0, pools: [], reasonCode: 'no-route',
    })).success).toBe(true);
  });

  it('refuses reporting more configs read than exist', () => {
    expect(dbcItemSchema.safeParse(item({ configCount: 4, configsProbed: 10 })).success).toBe(false);
  });

  it('refuses duplicate pools and more pools than one request returns', () => {
    expect(dbcItemSchema.safeParse(item({ pools: [pool(), pool()] })).success).toBe(false);
    const many = Array.from({ length: DBC_MAX_POOLS + 1 }, (_, index) => pool({ pool: `${POOL.slice(0, -1)}${index}` }));
    expect(dbcItemSchema.safeParse(item({ pools: many })).success).toBe(false);
  });

  it('requires every read to name its source and its own freshness window', () => {
    expect(dbcItemSchema.safeParse(item({ source: 'somewhere else' })).success).toBe(false);
    expect(dbcItemSchema.safeParse(item({ expiresAt: '2026-09-26T10:01:00.000Z' })).success).toBe(false);
    const window = Date.parse(item().expiresAt) - Date.parse(item().fetchedAt);
    expect(window).toBe(DBC_FRESHNESS_MS);
  });

  it('pins the program the response reports and refuses a repeated mint', () => {
    const response = {
      source: 'meteora-dbc' as const, program: DBC_PROGRAM_ID, state: 'success' as const,
      items: [item()], fetchedAt: item().fetchedAt, expiresAt: item().expiresAt,
    };
    expect(dbcResponseSchema.safeParse(response).success).toBe(true);
    expect(dbcResponseSchema.safeParse({ ...response, program: POOL }).success).toBe(false);
    expect(dbcResponseSchema.safeParse({ ...response, items: [item(), item()] }).success).toBe(false);
  });
});

describe('DBC copy', () => {
  it('states the quote-token role without implying the asset is for sale on the curve', () => {
    const role = DBC_COPY.role('AAPLx');
    expect(role).toContain('quote token');
    expect(role).toContain('Jupiter');
    expect(role).not.toMatch(/buy|sell|purchase/i);
  });

  it('never describes the integration as unfinished', () => {
    const all = Object.values(DBC_COPY).map(value => (typeof value === 'function' ? value('AAPLx') : value)).join(' ');
    expect(all).not.toMatch(/not yet|coming soon|unavailable|disabled|pending|unsupported|broken/i);
  });

  it('keeps the read-only guarantee explicit', () => {
    expect(DBC_COPY.readOnly).toMatch(/never creates pools, signs, or routes purchases/);
  });
});

describe('DBC fee schedule', () => {
  it('distinguishes the fee a curve opened with from the fee it charges now', () => {
    // Meteora's fee scheduler decays from cliffFeeNumerator, so a pool can
    // advertise a 50% launch fee while charging 1.25% at the current point.
    // Reporting the launch fee as "the" fee would overstate the cost 40x.
    const launch = dbcCliffFeeBps('5000000000'.slice(0, 9));
    expect(launch).toBe(5000);
    expect(dbcFeeBps('12570', '1000000')).toBe(125);
    expect(launch).not.toBe(dbcFeeBps('12570', '1000000'));
  });
});
