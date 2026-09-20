import { Check, ChevronDown, ExternalLink, ShieldCheck } from 'lucide-react';
import { formatUsdc, validatePlan } from '@/lib/domain/math';
import type { Asset, Basket, Mode, Quote } from '@/lib/domain/types';
import type { PlannerUniverse } from '@/lib/domain/planner-universe';

export function utcTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : 'Unavailable';
}

export function VerificationReceipt({ basket, assets, mode, quotes, universe = 'xstocks' }: { basket: Basket; assets: Asset[]; mode: Mode; quotes: Quote[]; universe?: PlannerUniverse }) {
  const plan = validatePlan(basket);
  if (!plan.valid) return null;
  const total = plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n);
  return <details className="verification-receipt">
    <summary><ShieldCheck size={15} />Verify this plan <ChevronDown size={13} /></summary>
    <div className="receipt-body">
      <div className="receipt-total"><span>EXACT ALLOCATION</span><strong>{formatUsdc(total)} USDC</strong><small><Check size={12} />100% assigned · 0 micro-USDC left over</small></div>
      <p>Amounts are calculated in whole micro-USDC. Leftover micro-units go to the largest fractional remainders, with basket order breaking ties.</p>
      {mode === 'example' && <p className="receipt-example">Example uses synthetic quotes and balances. The mint references below do not turn those figures into live observations.</p>}
      <div className="receipt-assets">{plan.allocations.map(allocation => {
        const asset = assets.find(item => item.mint === allocation.mint);
        if (!asset) return <p key={allocation.mint}>Asset verification is pending. No quote can be requested for an unverified mint.</p>;
        const quote = quotes.find(item => item.mint === asset.mint && item.usdcRaw === allocation.usdcRaw && item.state === 'success');
        const extraMicro = BigInt(allocation.usdcRaw) - total * BigInt(allocation.weightBps) / 10_000n;
        const expiry = quote ? Math.min(Date.parse(quote.expiresAt), Date.parse(quote.fetchedAt) + 30_000) : null;
        return <article key={asset.mint}>
          <div className="receipt-asset-heading"><strong>{asset.symbol}</strong><span>{formatUsdc(allocation.usdcRaw)} USDC</span></div>
          {extraMicro > 0n && <p className="receipt-remainder">Includes the {extraMicro.toString()} micro-USDC remainder assigned to this asset.</p>}
          <dl>
            <div><dt>Solana mint</dt><dd><a href={`https://explorer.solana.com/address/${asset.mint}`} target="_blank" rel="noopener noreferrer">{asset.mint}<ExternalLink size={11} /><span className="sr-only"> (opens Solana Explorer in a new tab)</span></a></dd></div>
            <div><dt>Issuer source</dt><dd>{universe === 'prestocks' ? asset.issuerSourceUrl ? <a href={asset.issuerSourceUrl} target="_blank" rel="noopener noreferrer">PreStocks asset metadata <ExternalLink size={11} /><span className="sr-only"> (opens in a new tab)</span></a> : 'Source unavailable' : <a href={`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(asset.symbol)}`} target="_blank" rel="noopener noreferrer">xStocks asset metadata <ExternalLink size={11} /><span className="sr-only"> (opens in a new tab)</span></a>}</dd></div>
            {universe === 'prestocks' && <><div><dt>Trading halt status</dt><dd>{asset.halted === null ? 'Not published by PreStocks' : asset.halted ? 'Issuer halt reported' : 'No issuer halt reported'}</dd></div>{asset.productUrl && <div><dt>Product details</dt><dd><a href={asset.productUrl} target="_blank" rel="noopener noreferrer">View on PreStocks <ExternalLink size={11} /><span className="sr-only"> (opens in a new tab)</span></a></dd></div>}</>}
            {asset.underlyingSymbol && <div><dt>Underlying</dt><dd>{asset.underlyingSymbol}{asset.underlyingIsin ? ` · ${asset.underlyingIsin}` : ''}</dd></div>}
            {asset.issuerIsin && <div><dt>{universe === 'xstocks' ? 'xStock ISIN' : 'Issuer ISIN'}</dt><dd>{asset.issuerIsin}</dd></div>}
            {asset.logoSourceUrl && <div><dt>Logo source</dt><dd><a href={asset.logoSourceUrl} target="_blank" rel="noopener noreferrer">Official issuer logo <ExternalLink size={11} /><span className="sr-only"> (opens in a new tab)</span></a></dd></div>}
            {mode === 'live' && <div><dt>Identity checked</dt><dd><time dateTime={asset.verifiedAt}>{utcTime(asset.verifiedAt)}</time></dd></div>}
            <div><dt>Token program</dt><dd className="receipt-mint">{asset.tokenProgram}</dd></div>
            {quote && <><div><dt>{mode === 'example' ? 'Synthetic source' : 'Quote source'}</dt><dd>{quote.source ?? (mode === 'example' ? 'Example fixture' : 'Jupiter')}</dd></div><div><dt>Retrieved</dt><dd><time dateTime={quote.fetchedAt}>{utcTime(quote.fetchedAt)}</time></dd></div>{expiry !== null && Number.isFinite(expiry) && <div><dt>Fresh until</dt><dd><time dateTime={new Date(expiry).toISOString()}>{utcTime(new Date(expiry).toISOString())}</time></dd></div>}</>}
          </dl>
        </article>;
      })}</div>
      <p>{mode === 'live' ? `Displayed ${universe === 'prestocks' ? 'PreStock' : 'xStock'} units use the official Token-2022 mint conversion and chain time. Resulting holdings add raw balances to raw quote output before conversion.` : 'Example balances include a non-unit multiplier to demonstrate scaled token units.'} Review current amounts and fees on Jupiter.</p>
    </div>
  </details>;
}
