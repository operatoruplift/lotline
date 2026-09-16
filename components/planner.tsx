'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { isAddress } from '@solana/kit';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Clipboard, Clock3, ExternalLink, FlaskConical, Info, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, Wallet, WifiOff, X } from 'lucide-react';
import type { Asset, Basket, CatalogResponse, HoldingsResponse, Mode, ProjectionResponse, QuotesResponse } from '@/lib/domain/types';
import { formatUsdc, parsePercent, validatePlan } from '@/lib/domain/math';
import { buildPlanCsv, buildPlanText } from '@/lib/domain/export';
import { createPlanIdentity, isCurrentResponse } from '@/lib/domain/identity';
import { loadBasket, saveBasket } from '@/lib/domain/storage';
import { logoPathForSymbol } from '@/lib/domain/assets';
import { PLAN_HASH_PREFIX } from '@/lib/domain/share';
import { jupiterReviewUrl, jupiterSwapUrl } from '@/lib/domain/jupiter';
import { DEFAULT_BASKET, EXAMPLE_ASSETS, exampleUnits, getExampleHoldings, getExampleQuotes } from '@/lib/demo/example';
import { SiteFooter, SiteHeader } from './site-shell';
import { BrandMark } from './brand-mark';
import { AssetPicker } from './asset-picker';
import { MAX_PLAN_ASSETS } from '@/lib/domain/limits';
import { requestHoldings, requestQuotes, requestUnits } from '@/lib/client/planner-requests';
import { CloudPlans } from './cloud-plans';
import { PlanTransfer } from './plan-transfer';
import { AssetDetails } from './asset-details';
import { utcTime, VerificationReceipt } from './verification-receipt';
import { ExecutionReview } from './execution-review';
import { ContributionSchedule } from './contribution-schedule';

type Notice = { text: string; error?: boolean };
const EMPTY_BASKET: Basket = { version: 1, budget: '1000', items: [] };
const copyBasket = (basket: Basket): Basket => ({ ...basket, items: basket.items.map((item) => ({ ...item })) });
const assetClass = (symbol: string) => ({ AAPLx: 'apple', MSFTx: 'microsoft', NVDAx: 'nvidia', TSLAx: 'tesla', SPYx: 'spy', QQQx: 'qqq' })[symbol] ?? 'apple';

function displayAmount(value: string, minimumDecimals = 2): string {
  const [whole, decimal = ''] = value.split('.');
  const fraction = decimal.replace(/0+$/, '').padEnd(minimumDecimals, '0');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

function displayUnits(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  return displayAmount(value, 0);
}

function AssetAvatar({ asset, small }: { asset?: Asset; small?: boolean }) {
  const logo = asset?.logoUrl ?? logoPathForSymbol(asset?.symbol ?? '');
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  return <span className={`asset-avatar ${assetClass(asset?.symbol ?? '')}${small ? ' small' : ''}`} aria-hidden="true">{logo && failedLogo !== logo ? <Image className="asset-logo" src={logo} alt="" width={small ? 31 : 36} height={small ? 31 : 36} unoptimized onError={() => setFailedLogo(logo)} /> : asset?.symbol[0] ?? '?'}</span>;
}

function exampleView(basket: Basket) {
  const holdings = getExampleHoldings(basket.items.map((item) => item.mint));
  const plan = validatePlan(basket);
  const verified = basket.items.every((item) => EXAMPLE_ASSETS.some((asset) => asset.mint === item.mint));
  const quotes = plan.valid && verified ? getExampleQuotes(plan.allocations.filter((item) => BigInt(item.usdcRaw) > 0n)) : null;
  const projections = quotes?.quotes.flatMap((quote) => {
    const holding = holdings.holdings.find((item) => item.mint === quote.mint);
    return holding?.raw !== null && holding?.raw !== undefined && quote.outRaw !== null ? [{ mint: quote.mint, units: exampleUnits(quote.mint, BigInt(holding.raw) + BigInt(quote.outRaw)) }] : [];
  }) ?? [];
  return { holdings, quotes, projections };
}

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new Error('The service returned an unreadable response. Please try again.');
  return await response.json() as T;
}

export function Planner({ initialMode, cloudEnabled = true }: { initialMode: Mode; cloudEnabled?: boolean }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [basket, setBasket] = useState<Basket>(() => copyBasket(initialMode === 'example' ? DEFAULT_BASKET : EMPTY_BASKET));
  const [saved, setSaved] = useState<'pending' | 'saved' | 'unavailable'>('pending');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(initialMode === 'live');
  const [catalogReload, setCatalogReload] = useState(0);
  const [wallet, setWallet] = useState('');
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [quotes, setQuotes] = useState<QuotesResponse | null>(null);
  const [projections, setProjections] = useState<ProjectionResponse['items']>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteProgress, setQuoteProgress] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [replacingMint, setReplacingMint] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(0);
  const revision = useRef(0);
  const activeQuote = useRef('');
  const quoteAbort = useRef<AbortController | null>(null);
  const holdingsAbort = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const walletRef = useRef<HTMLInputElement | null>(null);
  const assets = useMemo(() => mode === 'example' ? EXAMPLE_ASSETS : catalog?.assets ?? [], [catalog, mode]);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.mint, asset])), [assets]);
  const plan = useMemo(() => validatePlan(basket), [basket]);
  const unknownSelected = basket.items.some((item) => !assetMap.has(item.mint));
  const canEstimate = plan.valid && !unknownSelected && !holdingsLoading && (mode === 'example' || online);
  const weightsBps = basket.items.map(item => { try { return parsePercent(item.percent); } catch { return null; } });
  const validPercentages = weightsBps.every(weight => weight !== null);
  const totalBps = weightsBps.reduce<number>((sum, weight) => sum + (weight ?? 0), 0);
  const splitComplete = validPercentages && totalBps === 10000;
  const remainingPercent = displayAmount((Math.abs(10000 - totalBps) / 100).toFixed(2), 0);
  const splitHint = !validPercentages ? 'Use 0–100%, up to 2 decimals' : splitComplete ? 'Total equals 100%' : totalBps < 10000 ? `${remainingPercent}% left to assign` : `${remainingPercent}% over`;
  const quotesByMint = new Map(quotes?.quotes.map((quote) => [quote.mint, quote]));
  const holdingsByMint = new Map(holdings?.holdings.map((holding) => [holding.mint, holding]));
  const projectionByMint = new Map(projections.map((projection) => [projection.mint, projection]));
  const allocationByMint = new Map(plan.allocations.map((item) => [item.mint, item]));
  // The panel's primary action reviews the first leg; per-asset links cover the rest.
  const firstReviewUrl = plan.valid && plan.allocations.length > 0 ? jupiterReviewUrl(plan.allocations[0].mint, plan.allocations[0].usdcRaw) : null;
  const successfulQuotes = quotes?.quotes.filter((quote) => quote.state === 'success') ?? [];
  const stale = successfulQuotes.some((quote) => now >= Math.min(Date.parse(quote.expiresAt), Date.parse(quote.fetchedAt) + 30_000));
  const oldestQuote = successfulQuotes.length ? Math.min(...successfulQuotes.map((quote) => Date.parse(quote.fetchedAt))) : null;
  const ageSeconds = oldestQuote === null ? 0 : Math.max(0, Math.floor((now - oldestQuote) / 1000));
  const walletValid = wallet.trim() !== '' && isAddress(wallet.trim());
  const confirmedUsdc = holdings?.usdc.state === 'success' && holdings.usdc.raw !== null ? BigInt(holdings.usdc.raw) : null;
  const allocatedTotal = plan.valid ? plan.allocations.reduce((sum, item) => sum + BigInt(item.usdcRaw), 0n) : null;
  const insufficientUsdc = confirmedUsdc !== null && allocatedTotal !== null && confirmedUsdc < allocatedTotal;
  const allZeroHoldings = holdings?.state === 'success' && holdings.holdings.length > 0 && holdings.holdings.every((holding) => holding.state === 'success' && holding.raw === '0');

  const persistBasket = useCallback((next: Basket) => {
    // The bounded draft is small enough to save during the edit.
    // A deferred write can be lost if the user reloads or navigates away.
    try { setSaved(saveBasket(window.localStorage, next) ? 'saved' : 'unavailable'); }
    catch { setSaved('unavailable'); }
  }, []);

  const invalidate = useCallback((clearHoldings = false) => {
    revision.current += 1;
    activeQuote.current = '';
    quoteAbort.current?.abort();
    setQuotes(null);
    setProjections([]);
    setQuoteLoading(false);
    setNotice(null);
    if (clearHoldings) {
      holdingsAbort.current?.abort();
      setHoldings(null);
      setHoldingsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Browser-only bootstrap runs after hydration. One state batch restores the
    // draft and creates the explicitly requested Example view from that draft.
    queueMicrotask(() => {
      if (cancelled) return;
      let initialBasket = copyBasket(initialMode === 'example' ? DEFAULT_BASKET : EMPTY_BASKET);
      try { initialBasket = loadBasket(window.localStorage) ?? initialBasket; }
      catch { /* A browser can block local storage. The planner still works. */ }
      const reviewingSharedPlan = window.location.hash.startsWith(PLAN_HASH_PREFIX);
      // Seed an empty practice visit, but never replace a nonempty saved split
      // just because its mint is absent from this bundled Example snapshot.
      if (!reviewingSharedPlan && initialMode === 'example' && initialBasket.items.length === 0) initialBasket = copyBasket(DEFAULT_BASKET);
      setBasket(initialBasket);
      persistBasket(initialBasket);
      if (initialMode === 'example') {
        const example = exampleView(initialBasket);
        setHoldings(example.holdings);
        setQuotes(example.quotes);
        setProjections(example.projections);
      }
    });
    return () => { cancelled = true; };
  }, [initialMode, persistBasket]);

  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setNow(Date.now()); };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') setNow(Date.now()); }, 1000);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); document.removeEventListener('visibilitychange', update); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (mode === 'example') return;
    const controller = new AbortController();
    fetch('/api/assets', { signal: controller.signal })
      .then((response) => readResponse<CatalogResponse>(response))
      .then((data) => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(() => { if (!controller.signal.aborted) setCatalog({ state: 'unavailable', assets: [], unavailable: [], message: 'The verified asset catalog could not be loaded. Check your connection and try again.' }); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [mode, catalogReload]);

  useEffect(() => () => { quoteAbort.current?.abort(); holdingsAbort.current?.abort(); }, []);

  function updateBasket(next: Basket, selectionChanged = false) {
    invalidate(selectionChanged);
    if (selectionChanged) { setReplacingMint(null); setShowPicker(false); }
    setBasket(next);
    persistBasket(next);
    if (selectionChanged && mode === 'example') setHoldings(getExampleHoldings(next.items.map((item) => item.mint)));
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    invalidate(true);
    setWallet('');
    setMode(next);
    setShowPicker(false);
    setReplacingMint(null);
    setCatalogLoading(next === 'live');
    if (next === 'example') {
      const nextBasket = basket.items.length === 0 ? copyBasket(DEFAULT_BASKET) : basket;
      const example = exampleView(nextBasket);
      setBasket(nextBasket);
      persistBasket(nextBasket);
      setHoldings(example.holdings);
      setQuotes(example.quotes);
      setProjections(example.projections);
      setNow(Date.now());
    }
    window.history.replaceState(null, '', next === 'example' ? '/app?mode=example' : '/app');
  }

  function applySharedPlan(next: Basket, nextMode: Mode) {
    invalidate(true);
    setWallet('');
    setShowPicker(false);
    setReplacingMint(null);
    if (nextMode !== mode) setCatalogLoading(nextMode === 'live');
    setMode(nextMode);
    setBasket(next);
    persistBasket(next);
    if (nextMode === 'example') setHoldings(getExampleHoldings(next.items.map(item => item.mint)));
    window.history.replaceState(null, '', nextMode === 'example' ? '/app?mode=example' : '/app');
    setNotice({ text: 'Shared plan loaded. Review your split and request fresh estimates.' });
  }

  function splitEvenly() {
    const count = basket.items.length;
    if (count < 2) return;
    const floor = Math.floor(10_000 / count);
    const remainder = 10_000 % count;
    updateBasket({ ...basket, items: basket.items.map((item, index) => {
      const bps = floor + (index < remainder ? 1 : 0);
      return { ...item, percent: `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, '0')}` };
    }) });
  }

  function focusWallet() {
    walletRef.current?.focus();
    walletRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  async function loadHoldings() {
    if (mode !== 'live' || !walletValid || !basket.items.length || unknownSelected) return;
    invalidate(true);
    const controller = new AbortController();
    holdingsAbort.current = controller;
    setHoldingsLoading(true);
    try {
      const data = await requestHoldings(wallet.trim(), basket.items.map(item => item.mint), controller.signal);
      if (controller.signal.aborted) return;
      setHoldings(data);
      setNotice({ text: data.state === 'success' ? 'Current wallet balances loaded. Get estimates to see your projected units.' : data.message ?? 'Some balances are unavailable. You can still plan your contribution.', error: data.state !== 'success' && data.state !== 'partial' });
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice({ text: error instanceof Error ? error.message : 'Balances could not be loaded. Please try again.', error: true });
    } finally { if (!controller.signal.aborted) setHoldingsLoading(false); }
  }

  async function getEstimates() {
    if (!canEstimate) return;
    if (window.matchMedia('(max-width: 800px)').matches) resultsRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    quoteAbort.current?.abort();
    const controller = new AbortController();
    quoteAbort.current = controller;
    const identity = createPlanIdentity(mode, basket, revision.current);
    activeQuote.current = identity;
    setQuoteLoading(true);
    setQuoteProgress(0);
    setQuotes(null);
    setProjections([]);
    setNotice(null);
    const items = plan.allocations.filter((item) => BigInt(item.usdcRaw) > 0n).map(({ mint, usdcRaw }) => ({ mint, usdcRaw }));
    const current = () => !controller.signal.aborted && isCurrentResponse(activeQuote.current, identity);
    try {
      const data = mode === 'example' ? getExampleQuotes(items) : await requestQuotes(items, controller.signal, (partial, done) => {
        if (!current()) return;
        setQuotes(partial);
        setQuoteProgress(done);
        setNow(Date.now());
      });
      if (!current()) return;
      setQuotes(data);
      setNow(Date.now());
      const rawProjections = data.quotes.flatMap((quote) => {
        const holding = holdingsByMint.get(quote.mint);
        return quote.state === 'success' && quote.outRaw !== null && holding?.state === 'success' && holding.raw !== null ? [{ mint: quote.mint, raw: (BigInt(holding.raw) + BigInt(quote.outRaw)).toString() }] : [];
      });
      if (rawProjections.length) {
        if (mode === 'example') setProjections(rawProjections.map(({ mint, raw }) => ({ mint, units: exampleUnits(mint, raw) })));
        else {
          try {
            const projected = await requestUnits(rawProjections, controller.signal);
            if (!current()) return;
            setProjections(projected.items);
          } catch {
            if (!current()) return;
            setProjections(rawProjections.map(({ mint }) => ({ mint, units: null, message: 'Resulting units could not be verified. Try refreshing your estimates.' })));
          }
        }
      }
      if (current()) setNotice({ text: data.state === 'success' ? (mode === 'example' ? 'Example estimates updated. These are synthetic values.' : 'Estimates loaded. Review current amounts and fees on Jupiter.') : data.message ?? 'Some estimates are unavailable. Check the asset details and try refreshing.', error: data.state !== 'success' && data.state !== 'partial' });
    } catch (error) {
      if (current()) setNotice({ text: error instanceof Error ? error.message : 'Estimates could not be loaded. Please try again.', error: true });
    } finally { if (current()) setQuoteLoading(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setNotice({ text: `${label} copied.` }); }
    catch { setNotice({ text: 'Clipboard access is unavailable in this browser. Download the CSV to keep your plan.', error: true }); }
  }

  function downloadCsv() {
    try {
      const text = buildPlanCsv({ mode, basket, assets, quotes: quotes?.quotes ?? [] });
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `lotline-${mode}-plan-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ text: 'CSV download started. Your plan includes exact amounts and estimate timestamps.' });
    } catch { setNotice({ text: 'The CSV could not be created. Check your plan and try again.', error: true }); }
  }

  const validationMessage = !plan.valid ? plan.message : unknownSelected ? (mode === 'example' ? 'A selected asset is outside the bundled Example catalog. Change or remove it, or switch to Live for current verification.' : 'A selected asset is not currently verified. Remove it or retry the asset catalog.') : null;
  const selectedAssets = basket.items.map((item) => assetMap.get(item.mint)).filter((asset): asset is Asset => !!asset);

  return <><SiteHeader active="app" dataMode={mode} /><main id="main" className="planner-page page-width">
    <div className="planner-heading"><div><p className="eyebrow">A LITTLE CLARITY. A CLEAR NEXT STEP.</p><h1>Your next contribution.</h1><p>Choose your split. See the estimates. Keep the decision yours.</p></div><div className="mode-switch" role="group" aria-label="Data mode"><button type="button" onClick={() => switchMode('live')} aria-pressed={mode === 'live'} className={mode === 'live' ? 'selected' : ''}><span className="mode-dot" />Live</button><button type="button" onClick={() => switchMode('example')} aria-pressed={mode === 'example'} className={mode === 'example' ? 'selected' : ''}><FlaskConical size={14} />Example</button></div></div>
    {mode === 'example' && <div className="example-banner"><FlaskConical size={19} /><div><strong>A practice plan. All the clarity.</strong><p>Explore {EXAMPLE_ASSETS.length} assets from the bundled identity snapshot. Balances, rates, and scaled units are synthetic. No real wallet is shown; use Live for current verification and quotes.</p></div><button type="button" className="text-button" onClick={() => switchMode('live')}>Switch to Live <ArrowRight size={15} /></button></div>}
    {!online && <div className="inline-notice warning" role="status"><WifiOff size={17} /><span>You’re offline. {mode === 'example' ? 'Example mode still works. Your local plan remains available.' : 'Live balances and estimates need a connection. Your local plan remains available.'}</span></div>}
    <div className="workspace">
      <div className="plan-column"><section className="panel plan-panel" aria-labelledby="plan-heading">
        <div className="panel-kicker">01 <span /> BUILD YOUR SPLIT</div><div className="panel-title"><h2 id="plan-heading">Your plan</h2><span className="save-state">{saved === 'saved' ? <Check size={12} /> : saved === 'pending' ? <Clock3 size={12} /> : <Info size={12} />}{saved === 'saved' ? 'Draft saved here' : saved === 'pending' ? 'Saving draft…' : 'Local saving unavailable'}</span></div>
        <label className="field-label" htmlFor="budget">USDC budget</label><div className="budget-input-wrap"><span className="usdc-icon" aria-hidden="true">$</span><input id="budget" name="budget" aria-describedby="budget-help" autoComplete="off" inputMode="decimal" value={basket.budget} onChange={(event) => updateBasket({ ...basket, budget: event.target.value })} /><span>USDC</span></div><p id="budget-help" className="field-hint">The amount you want to contribute next. Your budget and split save on this device as you edit; estimates are temporary.</p>
        <div className="split-label"><span className="field-label">Contribution split</span><span>{basket.items.length} / {MAX_PLAN_ASSETS} assets</span></div>
        <div className="basket-list">
          {basket.items.map((item, index) => { const asset = assetMap.get(item.mint); return <div className="basket-row" key={item.mint}><AssetAvatar asset={asset} /><div className="basket-asset"><button type="button" className="asset-change" aria-label={`Change ${asset?.symbol ?? 'unverified asset'}`} onClick={() => { setReplacingMint(item.mint); setShowPicker(true); }} disabled={catalogLoading || !assets.length}>{asset?.symbol ?? 'Unverified asset'}<ChevronDown size={11} /></button><span>{asset?.name ?? `${item.mint.slice(0, 5)}…${item.mint.slice(-4)}`}</span></div><div className="percent-field"><label htmlFor={`weight-${index}`} className="sr-only">{asset?.symbol ?? `Asset ${index + 1}`} percentage</label><input id={`weight-${index}`} inputMode="decimal" autoComplete="off" value={item.percent} onChange={(event) => updateBasket({ ...basket, items: basket.items.map((entry, i) => i === index ? { ...entry, percent: event.target.value } : entry) })} /><span>%</span></div><button type="button" className="icon-button remove-button" aria-label={`Remove ${asset?.symbol ?? 'unverified asset'}`} onClick={() => updateBasket({ ...basket, items: basket.items.filter((_, i) => i !== index) }, true)}><Trash2 size={15} /></button></div>; })}
        </div>
        {(basket.items.length < MAX_PLAN_ASSETS || replacingMint !== null) && <div className="asset-picker-area">{showPicker ? <AssetPicker example={mode === 'example'} assets={assets.filter(asset => !basket.items.some(item => item.mint === asset.mint))} onSelect={mint => updateBasket({ ...basket, items: replacingMint ? basket.items.map(item => item.mint === replacingMint ? { ...item, mint } : item) : [...basket.items, { mint, percent: basket.items.length === 0 ? '100' : '0' }] }, true)} onClose={() => { setShowPicker(false); setReplacingMint(null); }} /> : <button type="button" className="add-asset-button" onClick={() => setShowPicker(true)} disabled={catalogLoading || !assets.length || (!replacingMint && basket.items.length >= assets.length)}><Plus size={16} />{catalogLoading ? 'Loading verified assets…' : 'Add an asset'}</button>}</div>}
        {mode === 'live' && !catalogLoading && catalog && catalog.state !== 'success' && <div className="catalog-notice"><Info size={15} /><div><p>{catalog.message ?? 'Some issuer-verified assets are temporarily unavailable.'}</p>{catalog.unavailable.length > 0 && <p>{catalog.unavailable.map((item) => item.symbol).join(', ')} unavailable.</p>}<button type="button" onClick={() => { setCatalogLoading(true); setCatalogReload((count) => count + 1); }}>Retry catalog <RefreshCw size={12} /></button>{catalog.assets.length === 0 && <button type="button" onClick={() => switchMode('example')}>Try Example mode <ArrowRight size={12} /></button>}</div></div>}
        {basket.items.length > 0 && <><div className="allocation-bar plan-bar" aria-hidden="true">{basket.items.map((item, index) => { let bps = 0; try { bps = parsePercent(item.percent); } catch { /* Invalid percentages have no bar width. */ } return <span key={item.mint} style={{ width: `${Math.min(100, bps / 100)}%`, background: ['var(--forest)', 'var(--sage)', 'var(--mint)', '#437365', '#82946B'][index % 5] }} />; })}</div><div className={`weight-total ${splitComplete ? 'valid' : 'invalid'}`}><span>{splitComplete ? <Check size={13} /> : <Info size={13} />}{validPercentages ? `${displayAmount((totalBps / 100).toFixed(2), 0)}% allocated` : 'Check percentage fields'}</span><span>{splitHint}</span></div></>}
        <div className="split-tools">{basket.items.length > 1 && <button type="button" onClick={splitEvenly}>Split evenly</button>}{mode === 'example' && <button type="button" onClick={() => { const next = copyBasket(DEFAULT_BASKET); applySharedPlan(next, 'example'); const view = exampleView(next); setQuotes(view.quotes); setProjections(view.projections); setNow(Date.now()); setNotice({ text: 'Example reset to the illustrative 50 / 30 / 20 split.' }); }}>Reset example</button>}</div><p className="split-explainer">These percentages apply to your new contribution.</p>
        {validationMessage && !catalogLoading && <p className="validation-message" id="plan-validation"><Info size={14} /><span>{validationMessage}</span></p>}
        <button type="button" className="button primary estimate-button" onClick={getEstimates} disabled={!canEstimate || quoteLoading} aria-describedby={validationMessage ? 'plan-validation' : undefined}>{quoteLoading ? <><LoaderCircle size={17} className="spinning" />Getting estimates…{quoteProgress > 0 ? ` ${quoteProgress} / ${plan.allocations.filter(item => BigInt(item.usdcRaw) > 0n).length}` : ''}</> : quotes ? <><RefreshCw size={16} />Refresh estimates</> : <>Get estimates <ArrowRight size={17} /></>}</button>
        <div className="plan-privacy"><ShieldCheck size={13} />{holdingsLoading ? 'Waiting for current balances to finish loading.' : 'Quote only. No transaction or signature.'}</div>
      </section>
      <section className="panel wallet-panel" aria-labelledby="wallet-heading"><div className="wallet-title"><Wallet size={18} /><h2 id="wallet-heading">{mode === 'example' ? 'Illustrative balances' : 'Add your wallet'}</h2><span className="optional-label">{mode === 'example' ? 'EXAMPLE' : 'OPTIONAL'}</span></div>{mode === 'example' ? <><p className="wallet-description">Synthetic holdings add context to this practice plan. Includes a non-unit token multiplier.</p><div className="wallet-balance"><span>Example USDC balance</span><strong>{holdings?.usdc.units ? displayAmount(holdings.usdc.units) : '—'} <small>USDC</small></strong></div><div className="readonly-note"><FlaskConical size={12} /> These balances do not belong to a real wallet.</div></> : <><p className="wallet-description">See your current and estimated resulting units with a public Solana address.</p><label htmlFor="wallet-address" className="field-label">Wallet address</label><input ref={walletRef} id="wallet-address" className={`wallet-input${wallet && !walletValid ? ' input-invalid' : ''}`} type="text" placeholder="Paste a Solana public address" autoComplete="off" spellCheck={false} value={wallet} aria-invalid={wallet !== '' && !walletValid} aria-describedby={wallet && !walletValid ? 'wallet-error' : 'wallet-privacy'} onChange={(event) => { invalidate(true); setWallet(event.target.value); }} />{wallet && !walletValid && <p id="wallet-error" className="field-error">Enter a valid Solana public wallet address.</p>}<button type="button" className="button secondary load-balances" onClick={loadHoldings} disabled={!walletValid || !basket.items.length || unknownSelected || holdingsLoading || !online}>{holdingsLoading ? <><LoaderCircle size={15} className="spinning" />Loading balances…</> : <>{holdings ? <RefreshCw size={14} /> : <Wallet size={14} />}{holdings ? 'Reload balances' : 'Load balances'}</>}</button>{holdings && <div className="wallet-balance"><span>Current USDC balance</span><strong>{holdings.usdc.state === 'success' && holdings.usdc.units !== null ? <>{displayAmount(holdings.usdc.units)} <small>USDC</small></> : 'Unavailable'}</strong></div>}<p id="wallet-privacy" className="readonly-note"><ShieldCheck size={12} /> Read only. Address never saved.</p></>}{mode === 'live' && holdings && <p className="balance-snapshot"><Clock3 size={12} /><span>Balance snapshot<br /><time dateTime={holdings.fetchedAt}>{utcTime(holdings.fetchedAt)}</time><br />{Math.max(0, Math.floor((now - Date.parse(holdings.fetchedAt)) / 60_000)) >= 1 ? 'At least a minute old. Reload balances for a fresh view.' : 'Reload balances to check again.'}</span></p>}{holdings && holdings.state !== 'success' && <p className="field-error">{holdings.message ?? 'Some balances could not be verified. Unavailable balances are not zero.'}</p>}{allZeroHoldings && <p className="field-hint">No selected token holdings found. Confirmed balances are zero.</p>}{insufficientUsdc && <div className="balance-info"><Info size={14} /><span>Your budget exceeds this {mode === 'example' ? 'example ' : ''}USDC balance. You can still plan a future contribution.</span></div>}</section>
      </div>
      <div className="results-column"><section ref={resultsRef} id="contribution-results" className="panel results-panel" aria-labelledby="results-heading" aria-busy={quoteLoading}>
        <div className="results-top"><div><div className="panel-kicker">02 <span /> REVIEW YOUR CONTRIBUTION</div><h2 id="results-heading">A clear view of what comes next.</h2></div><span className="results-mode">{mode === 'example' ? <FlaskConical size={13} /> : <span className="tiny-dot" />}{mode === 'example' ? 'Example estimates' : quoteLoading ? 'Requesting quotes' : quotes ? successfulQuotes.length ? stale ? 'Quotes need refresh' : 'Live quotes received' : 'Quotes unavailable' : 'Ready for Live quotes'}</span></div>
        <div className="contribution-summary"><div><span className="summary-label">YOUR NEW CONTRIBUTION</span><p>{allocatedTotal !== null ? displayAmount(formatUsdc(allocatedTotal)) : '—'}<span>USDC</span></p></div><div className="summary-count"><span>{basket.items.length.toString().padStart(2, '0')}</span><span>{basket.items.length === 1 ? 'chosen asset' : 'chosen assets'}<br />Your own split.</span></div></div>
        {basket.items.length > 0 && <div className="results-context"><p>Your balance + estimated addition = estimated resulting holdings.</p>{mode === 'live' && !holdings && <button type="button" onClick={focusWallet}>Add wallet context <ArrowRight size={12} /></button>}{mode === 'live' && holdings && <p>Using your <time dateTime={holdings.fetchedAt}>{utcTime(holdings.fetchedAt)}</time> balance snapshot.</p>}</div>}{basket.items.length > 0 ? <div className="results-table-wrap"><table className="results-table"><caption className="sr-only">Current holdings, exact USDC allocations, estimated additional units, and estimated resulting holdings</caption><thead><tr><th scope="col">Asset</th><th scope="col">Current units</th><th scope="col">USDC split</th><th scope="col">Estimated +units</th><th scope="col">Estimated after</th></tr></thead><tbody>{basket.items.map((item) => {
          const asset = assetMap.get(item.mint);
          const holding = holdingsByMint.get(item.mint);
          const quote = quotesByMint.get(item.mint);
          const projected = projectionByMint.get(item.mint);
          const allocation = allocationByMint.get(item.mint);
          const zero = allocation?.usdcRaw === '0';
          const holdingText = holdingsLoading ? 'Loading…' : holding?.state === 'success' && holding.units !== null ? displayUnits(holding.units) : holding ? 'Unavailable' : mode === 'example' ? 'Unavailable' : 'Not loaded';
          const outputText = quoteLoading && !quote ? 'Loading…' : zero ? '0' : quote?.state === 'success' ? quote.units !== null ? `+${displayUnits(quote.units)}` : 'Units unavailable' : quote ? 'Unavailable' : '—';
          const afterText = zero && holding?.state === 'success' && holding.units !== null ? displayUnits(holding.units) : quote?.state === 'success' && holding?.state === 'success' && holding.raw !== null ? projected?.units !== undefined && projected.units !== null ? displayUnits(projected.units) : quoteLoading ? 'Loading…' : 'Units unavailable' : !holdings ? 'Add a wallet' : '—';
          return <tr key={item.mint}><th scope="row"><div className="result-asset"><AssetAvatar asset={asset} small /><div><strong>{asset?.symbol ?? 'Unverified'}</strong><span>{item.percent}% of contribution</span></div></div></th><td data-label="Current units" className={holding?.state === 'success' ? '' : 'muted-cell'}>{holdingText}</td><td data-label="USDC split" className="allocation-cell">{allocation ? displayAmount(formatUsdc(allocation.usdcRaw), 6) : '—'}</td><td data-label="Estimated +units" className={quote?.units !== null && quote?.state === 'success' ? 'estimate-cell' : 'muted-cell'}>{outputText}</td><td data-label="Estimated after" className={projected?.units ? 'after-cell' : 'muted-cell'}>{afterText}</td></tr>;
        })}</tbody></table></div> : <div className="results-empty"><BrandMark className="empty-mark" /><h3>Every good plan starts with a choice.</h3><p>Add your first xStock, choose a percentage, and set your contribution amount.</p><span><span className="empty-dot" /> Your split will appear right here.</span></div>}
        {basket.items.length > 0 && !quotes && !quoteLoading && <div className="estimate-prompt"><CircleHelp size={16} /><p>{plan.valid ? 'Your split is ready. Get estimates to see approximately how many units your contribution could add.' : 'Complete your contribution split to see exact allocations and request estimates.'}</p></div>}
        {quotes && <div className={`quote-freshness${stale ? ' is-stale' : ''}`} role="status"><Clock3 size={14} /><span>{successfulQuotes.length > 0 ? stale ? `Estimates are stale · retrieved ${ageSeconds}s ago` : `${mode === 'example' ? 'Synthetic estimates' : 'Estimated'} · ${ageSeconds < 2 ? 'just now' : `${ageSeconds}s ago`} · stale after 30s` : 'No estimates available. Review the asset notes below.'}</span>{stale && <button type="button" onClick={getEstimates} disabled={!canEstimate || quoteLoading}>Refresh <RefreshCw size={12} /></button>}</div>}
        {basket.items.some((item) => quotesByMint.get(item.mint)?.message || holdingsByMint.get(item.mint)?.message || projectionByMint.get(item.mint)?.message || assetMap.get(item.mint)?.halted) && <div className="asset-notices">{basket.items.map((item) => { const messages = [...new Set([assetMap.get(item.mint)?.halted && quotesByMint.get(item.mint)?.state !== 'success' ? 'Issuer previously reported a halt. Availability is rechecked when requesting estimates.' : undefined, quotesByMint.get(item.mint)?.message, holdingsByMint.get(item.mint)?.message, projectionByMint.get(item.mint)?.message].filter(Boolean))]; return messages.length > 0 ? <p key={item.mint}><Info size={14} /><span><strong>{assetMap.get(item.mint)?.symbol ?? 'Asset'}:</strong> {messages.join(' ')}</span></p> : null; })}</div>}
        {successfulQuotes.length > 0 && <details className="quote-details"><summary>Quote details and fees <ChevronDown size={12} /></summary><div>{successfulQuotes.map((quote) => <p key={quote.mint}><strong>{assetMap.get(quote.mint)?.symbol ?? 'Asset'}</strong><span>{quote.source ?? 'Jupiter quote'}{quote.feeBps !== undefined ? ` · Quoted fee rate ${(quote.feeBps / 100).toFixed(2)}%` : ' · Fee details not supplied'}{quote.feeMint ? ` · Fee mint ${quote.feeMint.slice(0, 4)}…${quote.feeMint.slice(-4)}` : ''}</span><time dateTime={quote.fetchedAt}>{quote.fetchedAt.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}</time></p>)}<p className="quote-fee-note">Future network costs may not be included. Review current amounts and fees on Jupiter.</p></div></details>}
        <VerificationReceipt basket={basket} assets={assets} mode={mode} quotes={quotes?.quotes ?? []} /><AssetDetails assets={selectedAssets} mode={mode} /><div className="results-disclaimer"><ShieldCheck size={14} /><p>{mode === 'example' ? 'Synthetic figures for exploring the tool. Live mode requests real, quote-only estimates.' : 'Estimates can change. Review current amounts and fees on Jupiter.'}<span> Resulting units include current holdings only when their raw balance is verified.</span></p></div>
      </section>
      <section className="panel handoff-panel" aria-labelledby="handoff-heading"><div className="handoff-top"><div><div className="panel-kicker">03 <span /> TAKE YOUR PLAN WITH YOU</div><h2 id="handoff-heading">Ready when you are.</h2></div><div className="export-actions"><button type="button" className="button secondary" disabled={!plan.valid || unknownSelected || quoteLoading} onClick={() => copy(buildPlanText({ mode, basket, assets, quotes: quotes?.quotes ?? [] }), 'Plan')}><Clipboard size={14} />Copy plan</button><button type="button" className="button secondary" disabled={!plan.valid || unknownSelected || quoteLoading} onClick={downloadCsv}><ArrowDownToLine size={14} />Download CSV</button></div></div><PlanTransfer basket={basket} mode={mode} assets={assets} disabled={!plan.valid || unknownSelected || quoteLoading} onLoad={applySharedPlan} /><p className="handoff-description">Open any asset on Jupiter with its verified mint and exact USDC allocation already filled in, or copy them to enter by hand. Lotline never signs or submits the trade.</p>
        {selectedAssets.length > 0 && <div className="handoff-assets">{basket.items.map((item) => { const asset = assetMap.get(item.mint); const allocation = allocationByMint.get(item.mint); const reviewUrl = asset ? jupiterReviewUrl(asset.mint, allocation?.usdcRaw) : null; return asset ? <div className="handoff-row" key={item.mint}><div><AssetAvatar asset={asset} small /><strong>{asset.symbol}</strong><span className="mint-abbr" title={asset.mint}>{asset.mint.slice(0, 4)}…{asset.mint.slice(-4)}</span></div><div><button type="button" aria-label={`Copy ${asset.symbol} mint`} onClick={() => copy(asset.mint, `${asset.symbol} mint`)}>Copy mint <Clipboard size={12} /></button><button type="button" aria-label={`Copy ${asset.symbol} USDC amount`} disabled={!allocation} onClick={() => allocation && copy(formatUsdc(allocation.usdcRaw), `${asset.symbol} USDC amount`)}>Copy USDC amount <Clipboard size={12} /></button>{reviewUrl && <a className="handoff-review" href={reviewUrl} target="_blank" rel="noopener noreferrer" aria-label={allocation ? `Review ${asset.symbol} on Jupiter with ${formatUsdc(allocation.usdcRaw)} USDC prefilled` : `Review ${asset.symbol} on Jupiter`}>Review on Jupiter <ExternalLink size={12} /></a>}</div></div> : null; })}</div>}
        <ExecutionReview mode={mode} basket={basket} assets={selectedAssets} quotes={quotes?.quotes ?? []} />
        <ContributionSchedule basket={basket} mode={mode} />
        <div className="jupiter-handoff"><div><span className="jupiter-symbol" aria-hidden="true">↗</span><div><strong>Review on Jupiter</strong><span>You decide what happens next.</span></div></div><a href={firstReviewUrl ?? jupiterSwapUrl()} target="_blank" rel="noopener noreferrer" className="button primary">{firstReviewUrl ? 'Review first asset' : 'Open Jupiter'} <ExternalLink size={14} /></a></div><p className="handoff-footnote">{firstReviewUrl ? 'Opens Jupiter in a new tab with the mint and exact USDC amount prefilled. Review the amount, route and fees there before trading.' : 'Opens Jupiter’s swap page in a new tab.'} Lotline never signs, submits, or records a purchase.</p>
      </section>
      </div>
    </div>
    {cloudEnabled && <CloudPlans basket={basket} onLoad={next => updateBasket(next, true)} />}
    <div className="planner-footnote"><ShieldCheck size={14} /><span>Your contribution percentages are your choice. Lotline provides calculations and estimates, not investment advice.</span><a href="/how-it-works">How it works <ArrowUpRight size={13} /></a></div>
    <div className={`toast${notice ? ' visible' : ''}${notice?.error ? ' toast-error' : ''}`} role="status" aria-live="polite" aria-atomic="true">{notice && <>{notice.error ? <Info size={17} /> : <Check size={17} />}<span>{notice.text}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></>}</div>
  </main><SiteFooter /></>;
}
