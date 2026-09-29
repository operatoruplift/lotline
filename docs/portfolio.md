# Portfolio home and the phone tab bar

Added 29 September 2026 behind `LOTLINE_MARKETS_ENABLED`, the same operator flag as Markets. With the flag unset, `/portfolio` answers 404 before any page code runs, the header and landing page are unchanged, and no tab bar renders. The main browser suite asserts exactly that.

## What people get

- **Portfolio (`/portfolio`).** The phone-first home. With a plan saved on this device it shows a card per planner (xStocks and, separately, PreStocks):
  - the USDC budget and whether the split is ready, or how much is assigned and what is missing, in the planner's own words;
  - the split as a bar in the planner's colours, and what it holds by type: Stocks, ETFs, Metals, Bonds, Leveraged ETFs and Pre-IPO;
  - each asset with its weight, the planner's exact USDC share (only when the whole plan validates), and the market snapshot's price and 24-hour move, labelled as a dated snapshot, never a quote;
  - the next review from the device's reminder, in its own time zone, noting when the reminder keeps an older split;
  - **Review and get estimates** (or **Finish your split**), **Add assets** and **Copy plan link**.
- **Start screen.** With no plan, the same page offers **Start your plan**, **Explore markets** and **Try the Example**, five type tiles with their verified counts (each opens Markets filtered to that type), three steps, and, when community plans are on, a link to them.
- **Tab bar (800px and narrower).** Portfolio, Markets, a raised **+**, Community (Pre-IPO when community plans are off) and Account. The planner sits under Portfolio. The **+** sheet now starts with **Open your planner**, and adds **Plan with PreStocks** whenever Community takes the Pre-IPO tab, so nothing becomes unreachable.
- **Header and landing.** With the flag on, the header links Portfolio, Markets and (with community plans) Community on every page, including the landing page, and the landing page's catalog card opens Markets.

## Data and privacy

Everything on the page comes from this browser: the planners' device drafts and the reminder the planner saves. Nothing is sent anywhere except the request for the public market snapshot (`/api/markets`), which carries no plan, wallet or account data. The page never estimates holdings, values, returns or future amounts; the USDC figures are the planner's own exact split of the budget.

## Tests

- `tests/portfolio.test.ts`: the summary's exact USDC split and type mix, unfinished drafts, basis-point and amount formatting, and reading drafts and reminders from storage, including corrupt and blocked storage.
- `tests/e2e-markets/portfolio.spec.ts` (flag on): the start screen with tiles, steps and community link at 390px with an axe check; a saved plan's budget, mix, exact amounts, snapshot prices and next review; an unfinished draft and a PreStocks card; the tab bar and **+** sheet at 320px.
- `tests/e2e/markets-flag.spec.ts` (flag off): `/portfolio` answers 404 and no Portfolio link renders.
