import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  route,
  formatRoute,
  type Bundle,
  type Data,
  type InventoryItem,
  type Line,
  type OrderEvent,
  type Result,
  type RouteOptions,
  type Warehouse,
} from './router.ts';

type StockPair = [available: number, dailyVelocity: number];

const makeWarehouse = (code: string, stockBySku: Record<string, StockPair>, enabled: boolean = true): Warehouse => ({
  code,
  enabled,
  inventory: Object.fromEntries(
    Object.entries(stockBySku).map(([sku, [available, dailyVelocity]]: [string, StockPair]): [string, InventoryItem] => [
      sku,
      { available, dailyVelocity },
    ]),
  ),
});
const created = (orderNumber: string, at: string, zip: unknown, lines: [string, number][], country: string = 'US'): OrderEvent => ({
  type: 'order_created',
  orderNumber,
  at,
  shipTo: { country, zip },
  lines: lines.map(([sku, quantity]: [string, number]): Line => ({ sku, quantity })),
});
const timeAt = (minutes: number): string => new Date(Date.UTC(2026, 9, 20, 13, minutes)).toISOString();
const makeData = (orders: OrderEvent[], warehouses: Warehouse[], zones: Record<string, unknown>, bundles: Bundle[] = []): Data => ({
  orders,
  warehouses,
  zones,
  catalog: { bundles },
});
const NW_A_STOCK: Record<string, StockPair> = { 'NW-A': [100, 10] };

test('R1: international goes to partner', () => {
  const result: Result = route(
    makeData([created('#1', timeAt(0), '07030', [['NW-A', 1]], 'CA')], [makeWarehouse('WH-NJ', NW_A_STOCK)], { 'WH-NJ': { '070': 1 } }),
  )[0];
  assert.equal(result.destination, 'PARTNER');
  assert.equal(result.reason, 'international (CA)');
});

const DEFAULT_ZONES: Record<string, Record<string, number>> = {
  'WH-NJ': { '070': 1, '021': 3 },
  'WH-GA': { '070': 5, '021': 6 },
  'WH-NV': { '070': 8, '021': 8 },
};
const routeOne = (
  order: OrderEvent,
  warehouses: Warehouse[],
  zones: Record<string, unknown> = DEFAULT_ZONES,
  bundles: Bundle[] = [],
  options?: RouteOptions,
): Result => route(makeData([order], warehouses, zones, bundles), options)[0];
const njWarehouse = (): Warehouse => makeWarehouse('WH-NJ', NW_A_STOCK);

test('R2: zip problems go to partner', () => {
  assert.equal(routeOne(created('#1', timeAt(0), '', [['NW-A', 1]]), [njWarehouse()]).reason, 'no ZIP');
  assert.equal(routeOne(created('#1', timeAt(0), undefined, [['NW-A', 1]]), [njWarehouse()]).reason, 'no ZIP');
  const result: Result = routeOne(created('#1', timeAt(0), '96815', [['NW-A', 1]]), [njWarehouse()], { _note: 'x', ...DEFAULT_ZONES });
  assert.equal(result.destination, 'PARTNER');
  assert.equal(result.reason, 'ZIP prefix 968 not in zones');
});

test('R3: disabled, short of one SKU, and off are skipped', () => {
  const order: OrderEvent = created('#1', timeAt(0), '07030', [
    ['NW-A', 1],
    ['NW-B', 1],
  ]);
  const fullyStocked = (code: string): Warehouse => makeWarehouse(code, { 'NW-A': [5, 1], 'NW-B': [5, 1] });
  assert.equal(
    routeOne(order, [makeWarehouse('WH-NJ', { 'NW-A': [5, 1], 'NW-B': [5, 1] }, false), fullyStocked('WH-GA')]).destination,
    'WH-GA',
  );
  assert.equal(routeOne(order, [makeWarehouse('WH-NJ', { 'NW-A': [5, 1], 'NW-B': [0, 1] }), fullyStocked('WH-GA')]).destination, 'WH-GA');
  assert.equal(routeOne(order, [fullyStocked('WH-NJ'), fullyStocked('WH-GA')], DEFAULT_ZONES, [], { off: ['WH-NJ'] }).destination, 'WH-GA');
});

test('R4: lowest zone wins', () => {
  const result: Result = routeOne(created('#1', timeAt(0), '07030', [['NW-A', 1]]), [
    makeWarehouse('WH-NV', NW_A_STOCK),
    makeWarehouse('WH-GA', NW_A_STOCK),
    njWarehouse(),
  ]);
  assert.equal(result.destination, 'WH-NJ');
  assert.equal(result.zone, 1);
  assert.equal(result.reason, 'zone 1');
});

test('R5: zone tie goes to the highest cover', () => {
  const zones: Record<string, Record<string, number>> = { 'WH-NJ': { '070': 2 }, 'WH-GA': { '070': 2 } };
  const order: OrderEvent = created('#1', timeAt(0), '07030', [
    ['NW-A', 1],
    ['NW-B', 1],
  ]);
  // NJ: min(100/1, 10/10)=1. GA: min(50/1, 50/5)=10. The smaller cover decides.
  const result: Result = routeOne(
    order,
    [makeWarehouse('WH-NJ', { 'NW-A': [100, 1], 'NW-B': [10, 10] }), makeWarehouse('WH-GA', { 'NW-A': [50, 1], 'NW-B': [50, 5] })],
    zones,
  );
  assert.equal(result.destination, 'WH-GA');
  assert.equal(result.reason, 'zone 2, tie-break cover');
});

test('R6: equal zone and cover goes by priority', () => {
  const zones: Record<string, Record<string, number>> = { 'WH-NJ': { '070': 2 }, 'WH-GA': { '070': 2 }, 'WH-NV': { '070': 2 } };
  const order: OrderEvent = created('#1', timeAt(0), '07030', [['NW-A', 1]]);
  const result: Result = routeOne(
    order,
    [makeWarehouse('WH-NV', NW_A_STOCK), makeWarehouse('WH-GA', NW_A_STOCK), makeWarehouse('WH-NJ', NW_A_STOCK)],
    zones,
  );
  assert.equal(result.destination, 'WH-NJ');
  assert.equal(result.reason, 'zone 2, tie-break priority');
  assert.equal(routeOne(order, [makeWarehouse('WH-NV', NW_A_STOCK), makeWarehouse('WH-GA', NW_A_STOCK)], zones).destination, 'WH-GA');
});

test('R7: no stock goes to partner', () => {
  const result: Result = routeOne(created('#1', timeAt(0), '07030', [['NW-A', 500]]), [njWarehouse()]);
  assert.equal(result.destination, 'PARTNER');
  assert.equal(result.reason, 'no warehouse can take it');
});

test('Sequence: routed by created time, stock reserved, input untouched', () => {
  const warehouses: Warehouse[] = [makeWarehouse('WH-NJ', { 'NW-A': [1, 1] }), makeWarehouse('WH-GA', { 'NW-A': [5, 1] })];
  const data: Data = makeData(
    [created('#2', timeAt(5), '07030', [['NW-A', 1]]), created('#1', timeAt(1), '07030', [['NW-A', 1]])],
    warehouses,
    DEFAULT_ZONES,
  );
  const snapshot: string = JSON.stringify(data);
  const describeRoute = (result: Result): string => `${result.orderNumber} ${result.destination}`;
  const routed: string[] = route(data).map(describeRoute);
  assert.deepEqual(routed, ['#1 WH-NJ', '#2 WH-GA']);
  assert.equal(JSON.stringify(data), snapshot);
  assert.deepEqual(route(data).map(describeRoute), routed);
});

test('Edits: merged into one result; unknown order ignored', () => {
  const warehouses: Warehouse[] = [
    makeWarehouse('WH-NJ', { 'NW-A': [5, 1], 'NW-B': [0, 1] }),
    makeWarehouse('WH-GA', { 'NW-A': [5, 1], 'NW-B': [5, 1] }),
  ];
  const edit: OrderEvent = { type: 'order_edited', orderNumber: '#1', at: timeAt(3), addedLines: [{ sku: 'NW-B', quantity: 1 }] };
  const ghost: OrderEvent = { type: 'order_edited', orderNumber: '#9', at: timeAt(4), addedLines: [{ sku: 'NW-B', quantity: 1 }] };
  const results: Result[] = route(makeData([created('#1', timeAt(0), '07030', [['NW-A', 1]]), edit, ghost], warehouses, DEFAULT_ZONES));
  assert.equal(results.length, 1);
  assert.equal(results[0].destination, 'WH-GA');
  assert.deepEqual(results[0].notes, ['edit +3 min merged']);
});

test('Messy: numeric zip, ZIP+4, lowercase SKU, bundle sum', () => {
  const numericZipResult: Result = routeOne(created('#1', timeAt(0), 2134, [['NW-A', 1]]), [njWarehouse()]);
  assert.equal(numericZipResult.zone, 3);
  assert.deepEqual(numericZipResult.notes, ['ZIP 2134 read as 02134']);
  assert.equal(routeOne(created('#1', timeAt(0), '07030-1834', [['NW-A', 1]]), [njWarehouse()]).zone, 1);
  const lowercaseSkuResult: Result = routeOne(created('#1', timeAt(0), '07030', [['nw-a', 1]]), [njWarehouse()]);
  assert.equal(lowercaseSkuResult.destination, 'WH-NJ');
  assert.deepEqual(lowercaseSkuResult.notes, ['SKU nw-a read as NW-A']);
  const bundles: Bundle[] = [{ sku: 'NW-BNDL', components: [{ sku: 'NW-A', quantity: 1 }] }];
  const bundleResult: Result = routeOne(
    created('#1', timeAt(0), '07030', [
      ['NW-BNDL', 1],
      ['NW-A', 1],
    ]),
    [makeWarehouse('WH-NJ', { 'NW-A': [1, 1] })],
    DEFAULT_ZONES,
    bundles,
  );
  assert.equal(bundleResult.destination, 'PARTNER');
  assert.deepEqual(bundleResult.notes, ['bundle NW-BNDL expanded']);
  assert.equal(
    routeOne(
      created('#1', timeAt(0), '07030', [
        ['NW-BNDL', 1],
        ['NW-A', 1],
      ]),
      [makeWarehouse('WH-NJ', { 'NW-A': [2, 1] })],
      DEFAULT_ZONES,
      bundles,
    ).destination,
    'WH-NJ',
  );
});

test('Output: formatRoute', () => {
  const format = (orderNumber: string, destination: string, reason: string, notes: string[] = []): string =>
    formatRoute({ orderNumber, destination, reason, notes });
  assert.equal(format('#2034', 'WH-GA', 'zone 5, tie-break cover'), '#2034  WH-GA    zone 5, tie-break cover');
  assert.equal(format('#2033', 'WH-NJ', 'zone 3', ['ZIP 2134 read as 02134']), '#2033  WH-NJ    zone 3  [ZIP 2134 read as 02134]');
  assert.equal(format('#2037', 'PARTNER', 'international (CA)'), '#2037  PARTNER  international (CA)');
});
