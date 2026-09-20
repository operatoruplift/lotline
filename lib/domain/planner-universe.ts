export type PlannerUniverse = 'xstocks' | 'prestocks';
export type PlannerApiPrefix = '/api' | '/api/prestocks';

/** Presentation and read endpoints only; server identity policies stay separate. */
export const PLANNER_UNIVERSES = {
  xstocks: { path: '/app', apiPrefix: '/api', storageKey: 'lotline:basket:v1', assetNoun: 'xStock', label: 'xStocks', supportsExample: true },
  prestocks: { path: '/pre-ipo', apiPrefix: '/api/prestocks', storageKey: 'lotline:prestocks:basket:v1', assetNoun: 'PreStock', label: 'PreStocks', supportsExample: false },
} as const satisfies Record<PlannerUniverse, { path: string; apiPrefix: PlannerApiPrefix; storageKey: string; assetNoun: string; label: string; supportsExample: boolean }>;
