import { formatUsdc, validatePlan } from './math';
import { jupiterReviewUrl, jupiterSwapUrl } from './jupiter';
import type { Asset, Basket, Mode, Quote } from './types';
import type { PlannerUniverse } from './planner-universe';

export type PlanExportInput = { mode: Mode; basket: Basket; assets: Asset[]; quotes: Quote[]; universe?: PlannerUniverse };
const REVIEW_NOTICE = 'Review on Jupiter before trading.';

function rows(input: PlanExportInput, now: number): string[][] {
  const exportedAt = new Date(now).toISOString();
  const validated = validatePlan(input.basket);
  if (!validated.valid) throw new Error(validated.message);
  return validated.allocations.map(allocation => {
    const asset = input.assets.find(candidate => candidate.mint === allocation.mint);
    if (!asset) throw new Error('Plan contains an asset absent from the verified catalog.');
    const quote = input.quotes.find(candidate => candidate.mint === allocation.mint && candidate.usdcRaw === allocation.usdcRaw);
    const fetched = quote ? Date.parse(quote.fetchedAt) : NaN;
    const expires = quote ? Date.parse(quote.expiresAt) : NaN;
    const validTimes = Number.isFinite(fetched) && Number.isFinite(expires) && fetched <= now && expires > fetched;
    const effectiveExpiry = validTimes ? Math.min(expires, fetched + 30_000) : null;
    const status = !quote ? 'Not requested'
      : quote.state !== 'success' ? 'Unavailable'
        : !validTimes ? 'Unavailable — invalid quote timestamps'
          : quote.units === null ? 'Unavailable — units could not be verified'
            : effectiveExpiry !== null && now >= effectiveExpiry ? 'Stale — refresh required' : 'Fresh at export';
    return [
      input.mode === 'example' ? 'Example (synthetic estimates)' : input.universe === 'prestocks' ? 'Live · PreStocks (planning only)' : 'Live',
      asset.symbol,
      asset.mint,
      `${Math.floor(allocation.weightBps / 100)}.${String(allocation.weightBps % 100).padStart(2, '0')}%`,
      formatUsdc(allocation.usdcRaw),
      quote?.state === 'success' && validTimes ? quote.units ?? 'Unavailable' : 'Unavailable',
      quote?.fetchedAt ?? 'Unavailable',
      input.universe === 'prestocks' ? `PreStocks planning only. Trading-halt status is not published. Review product terms${asset.productUrl ? ` at ${asset.productUrl}` : ''}. ${REVIEW_NOTICE}` : REVIEW_NOTICE,
      quote?.source ?? 'Unavailable',
      effectiveExpiry === null ? 'Unavailable' : new Date(effectiveExpiry).toISOString(),
      status,
      exportedAt,
      jupiterReviewUrl(allocation.mint, allocation.usdcRaw) ?? 'Unavailable',
    ];
  });
}

/** Quotes every cell and neutralizes spreadsheet formulas in all text columns. */
export function escapeCsvCell(value: string): string {
  // Spreadsheet applications can ignore initial whitespace/control characters.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildPlanCsv(input: PlanExportInput, now = Date.now()): string {
  const header = ['Mode', 'Asset', 'Verified Solana mint', 'Contribution percentage', 'USDC allocation', 'Estimated units', 'Quote retrieved at (UTC)', 'Review notice', 'Quote source', 'Quote fresh until (UTC)', 'Estimate status at export', 'Exported at (UTC)', 'Review on Jupiter'];
  return [header, ...rows(input, now)].map(row => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildPlanText(input: PlanExportInput, now = Date.now()): string {
  const mode = input.mode === 'example' ? 'Example mode — synthetic estimates, not live quotes' : 'Live mode — estimated quotes';
  const lines = rows(input, now).map(row => `${row[1]} · ${row[3]} · ${row[4]} USDC\nMint: ${row[2]}\nEstimated units: ${row[5]}\nQuote retrieved: ${row[6]}\nQuote source: ${row[8]}\nFresh until: ${row[9]}\nEstimate status at export: ${row[10]}${input.universe === 'prestocks' ? `\nProduct review: ${row[7]}` : ''}\nReview on Jupiter: ${row[12]}`);
  return `Lotline ${input.universe === 'prestocks' ? 'PreStocks ' : ''}contribution plan\n${mode}\nBudget: ${formatUsdc(BigInt(validatePlan(input.basket).allocations.reduce((total, item) => total + BigInt(item.usdcRaw), 0n)))} USDC\nExported at: ${new Date(now).toISOString()}\n\n${lines.join('\n\n')}\n\nEstimate status reflects export time only. Quotes expire within 30 seconds of retrieval, or sooner when the provider specifies. Exporting does not refresh estimates. Each review link prefills the verified mint and exact USDC amount; it never signs or submits a trade.\n${REVIEW_NOTICE}\nReview current amounts and fees on Jupiter.\n${jupiterSwapUrl()}`;
}
