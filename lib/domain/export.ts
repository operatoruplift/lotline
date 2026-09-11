import { formatUsdc, validatePlan } from './math';
import type { Asset, Basket, Mode, Quote } from './types';

export type PlanExportInput = { mode: Mode; basket: Basket; assets: Asset[]; quotes: Quote[] };
const REVIEW_NOTICE = 'Review on Jupiter before trading.';

function rows(input: PlanExportInput): string[][] {
  const validated = validatePlan(input.basket);
  if (!validated.valid) throw new Error(validated.message);
  return validated.allocations.map(allocation => {
    const asset = input.assets.find(candidate => candidate.mint === allocation.mint);
    if (!asset) throw new Error('Plan contains an asset absent from the verified catalog.');
    const quote = input.quotes.find(candidate => candidate.mint === allocation.mint && candidate.usdcRaw === allocation.usdcRaw && candidate.state === 'success');
    return [
      input.mode === 'example' ? 'Example (synthetic estimates)' : 'Live',
      asset.symbol,
      asset.mint,
      `${Math.floor(allocation.weightBps / 100)}.${String(allocation.weightBps % 100).padStart(2, '0')}%`,
      formatUsdc(allocation.usdcRaw),
      quote?.units ?? 'Unavailable',
      quote?.fetchedAt ?? 'Unavailable',
      REVIEW_NOTICE,
    ];
  });
}

/** Quotes every cell and neutralizes spreadsheet formulas in all text columns. */
export function escapeCsvCell(value: string): string {
  // Spreadsheet applications can ignore initial whitespace/control characters.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildPlanCsv(input: PlanExportInput): string {
  const header = ['Mode', 'Asset', 'Verified Solana mint', 'Contribution percentage', 'USDC allocation', 'Estimated units', 'Quote retrieved at (UTC)', 'Review notice'];
  return [header, ...rows(input)].map(row => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

export function buildPlanText(input: PlanExportInput): string {
  const mode = input.mode === 'example' ? 'Example mode — synthetic estimates, not live quotes' : 'Live mode — estimated quotes';
  const lines = rows(input).map(row => `${row[1]} · ${row[3]} · ${row[4]} USDC\nMint: ${row[2]}\nEstimated units: ${row[5]}\nQuote retrieved: ${row[6]}`);
  return `Lotline contribution plan\n${mode}\nBudget: ${formatUsdc(BigInt(validatePlan(input.basket).allocations.reduce((total, item) => total + BigInt(item.usdcRaw), 0n)))} USDC\n\n${lines.join('\n\n')}\n\n${REVIEW_NOTICE}\nReview current amounts and fees on Jupiter.\nhttps://jup.ag/`;
}
