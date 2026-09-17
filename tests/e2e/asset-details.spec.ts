import { expect, test, type Page } from './test';
import { DEFAULT_BASKET, EXAMPLE_ASSETS } from '../../lib/demo/example';
import { BASKET_STORAGE_KEY } from '../../lib/domain/storage';
async function openLive(page: Page) {
  await page.addInitScript(({key,basket}) => localStorage.setItem(key,JSON.stringify(basket)), { key:BASKET_STORAGE_KEY,basket:DEFAULT_BASKET });
  await page.route('**/api/assets',route => route.fulfill({json:{state:'success',assets:EXAMPLE_ASSETS,unavailable:[]}}));
  await page.goto('/app'); await page.getByText('About your selected assets',{exact:true}).click();
}
function fixture(mint: string, name: string) { return { state:'partial',network:'solana',mint,source:'tokens.xyz', details:{ canonicalId:'test-fixture-asset',canonicalName:name,representation:'Fixture xStock',sourceUrl:`https://tokens.xyz/test-fixture-asset?solana=${mint}` },message:'Fixture metadata only; market fields unavailable.' }; }

test('context is explicit and missing configuration never blocks calculations', async ({ page }) => {
  let calls=0;
  await page.route('**/api/asset-details?**', route => {calls++;const mint=new URL(route.request().url()).searchParams.get('mint');return route.fulfill({status:503,json:{state:'configuration-required',network:'solana',mint,source:'tokens.xyz',details:null,message:'Optional asset context is not configured.'}});});
  await openLive(page);expect(calls).toBe(0);
  await page.getByLabel('USDC budget').fill('137.000001');expect(calls).toBe(0);
  await page.getByRole('button',{name:'Load asset context',exact:true}).click();
  await expect(page.getByText('Optional asset context is not configured.')).toBeVisible();
  expect(calls).toBe(1);await expect(page.getByRole('button',{name:'Download CSV',exact:true})).toBeEnabled();
  await expect(page.getByLabel('USDC budget')).toHaveValue('137.000001');
});

test('changing assets clears optional context and rejects an earlier mint response', async ({ page }) => {
  let release:(()=>void)|undefined;let started=false;
  await page.route('**/api/asset-details?**',async route=>{
    const mint=new URL(route.request().url()).searchParams.get('mint')!;
    if(mint===EXAMPLE_ASSETS[0].mint){started=true;await new Promise<void>(resolve=>{release=resolve;});}
    await route.fulfill({json:fixture(mint,mint===EXAMPLE_ASSETS[0].mint?'Old fixture context':'New fixture context')});
  });
  await openLive(page);await page.getByRole('button',{name:'Load asset context',exact:true}).click();await expect.poll(()=>started).toBe(true);
  await page.getByLabel('Asset context',{exact:true}).selectOption(EXAMPLE_ASSETS[1].mint);
  await page.getByRole('button',{name:'Load asset context',exact:true}).click();await expect(page.getByText('New fixture context',{exact:true})).toBeVisible();
  release?.();await expect(page.getByText('Old fixture context',{exact:true})).toHaveCount(0);
  await expect(page.locator('[data-asset-context]')).toHaveAttribute('data-asset-context',EXAMPLE_ASSETS[1].mint);
});

test('Example never presents fixtures as live enrichment or requests a provider', async ({ page })=>{
  let calls=0;await page.route('**/api/asset-details?**',route=>{calls++;return route.abort();});
  await page.goto('/app?mode=example');await page.getByText('About your selected assets',{exact:true}).click();
  await expect(page.getByText('Example uses synthetic balances and estimates. Optional live asset context is available in Live mode.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Load asset context',exact:true})).toHaveCount(0);expect(calls).toBe(0);
});

test('an open context panel removes liquidity as its provider snapshot expires', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/asset-details?**', async route => {
    const mint=new URL(route.request().url()).searchParams.get('mint')!;
    const now=await page.evaluate(()=>Date.now());
    const body=fixture(mint,'Dated fixture');
    await route.fulfill({json:{...body,state:'success',message:undefined,details:{...body.details,liquidityUsd:1234,snapshotFetchedAt:new Date(now-899_000).toISOString()}}});
  });
  await openLive(page);await page.getByRole('button',{name:'Load asset context',exact:true}).click();
  await expect(page.getByText('$1,234.00',{exact:true})).toBeVisible();
  await page.clock.fastForward(1001);
  await expect(page.getByText('$1,234.00',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Older context · not a current market snapshot')).toBeVisible();
});
