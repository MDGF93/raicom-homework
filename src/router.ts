import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Line = { sku: string; quantity: number };
export type InventoryItem = { available: number; dailyVelocity: number };
type Inventory = Record<string, InventoryItem>;
type ShipTo = { country: string; zip?: unknown };
export type OrderEvent =
  | { type: 'order_created'; orderNumber: string; at: string; shipTo: ShipTo; lines: Line[] }
  | { type: 'order_edited'; orderNumber: string; at: string; addedLines: Line[] };
export type Warehouse = { code: string; enabled: boolean; inventory: Inventory };
export type Bundle = { sku: string; components: Line[] };
export type Data = {
  orders: OrderEvent[];
  warehouses: Warehouse[];
  zones: Record<string, unknown>;
  catalog: { bundles: Bundle[] };
};
export type Result = { orderNumber: string; destination: string; zone?: number; reason: string; notes: string[] };
export type RouteOptions = { off?: string[] };

type PendingOrder = { orderNumber: string; at: number; shipTo: ShipTo; lines: Line[]; notes: string[] };
type StockBySku = Record<string, number>;
type ZoneByPrefix = Record<string, unknown>;
type Candidate = { code: string; zone: number; cover: number };

const PRIORITY: string[] = ['WH-NJ', 'WH-GA', 'WH-NV', 'WH-TX'];
const DATA_DIRECTORY: string = fileURLToPath(new URL('../natura-wellness-backend-test 2/', import.meta.url));

export function loadData(directory: string = DATA_DIRECTORY): Data {
  const read = <T>(fileName: string): T => JSON.parse(readFileSync(join(directory, fileName), 'utf8')) as T;
  return {
    orders: read<OrderEvent[]>('orders.json'),
    warehouses: read<Warehouse[]>('warehouses.json'),
    zones: read<Record<string, unknown>>('zones.json'),
    catalog: read<{ bundles: Bundle[] }>('catalog.json'),
  };
}

const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

function validateLines(lines: unknown, owner: string): void {
  if (!Array.isArray(lines)) throw new Error(`${owner} has no lines array`);
  for (const line of lines as Line[]) {
    if (typeof line?.sku !== 'string') throw new Error(`${owner} has a line with no SKU`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error(`${owner} has a bad quantity for ${line.sku}`);
  }
}

function validate(data: Data, options: RouteOptions): void {
  for (const event of data.orders) {
    if (typeof event.orderNumber !== 'string') throw new Error('an order event has no orderNumber');
    if (Number.isNaN(Date.parse(event.at))) throw new Error(`${event.orderNumber} has a bad at`);
    const type: string = event.type;
    if (type !== 'order_created' && type !== 'order_edited') throw new Error(`${event.orderNumber} has unknown event type ${type}`);
    if (event.type === 'order_created') {
      if (typeof event.shipTo !== 'object' || event.shipTo === null) throw new Error(`${event.orderNumber} has no shipTo`);
      if (typeof event.shipTo.country !== 'string') throw new Error(`${event.orderNumber} has no shipTo country`);
      validateLines(event.lines, event.orderNumber);
    } else validateLines(event.addedLines, event.orderNumber);
  }
  const codes: string[] = [];
  for (const warehouse of data.warehouses) {
    if (!PRIORITY.includes(warehouse.code)) throw new Error(`warehouse ${warehouse.code} is not in PRIORITY`);
    if (codes.includes(warehouse.code)) throw new Error(`warehouse ${warehouse.code} appears twice`);
    if (typeof warehouse.inventory !== 'object' || warehouse.inventory === null)
      throw new Error(`warehouse ${warehouse.code} has no inventory`);
    for (const [sku, item] of Object.entries(warehouse.inventory)) {
      if (typeof item?.available !== 'number' || typeof item.dailyVelocity !== 'number')
        throw new Error(`warehouse ${warehouse.code} has a bad inventory row for ${sku}`);
    }
    codes.push(warehouse.code);
  }
  for (const code of options.off ?? []) {
    if (!codes.includes(code)) throw new Error(`--off takes warehouse codes from: ${codes.join(',')} (got ${code})`);
  }
  const bundleSkus: string[] = data.catalog.bundles.map((bundle: Bundle): string => bundle.sku);
  for (const bundle of data.catalog.bundles) {
    validateLines(bundle.components, `bundle ${bundle.sku}`);
    for (const component of bundle.components) {
      if (bundleSkus.includes(normalizeSku(component.sku))) throw new Error(`bundle ${bundle.sku} contains bundle ${component.sku}`);
    }
  }
}

// Returns the orders with their edits merged, sorted by created time.
function mergeEvents(events: OrderEvent[]): PendingOrder[] {
  const orders: Map<string, PendingOrder> = new Map();
  const seen: Set<string> = new Set();
  const addNote = (order: PendingOrder, text: string): void => {
    if (!order.notes.includes(text)) order.notes.push(text);
  };
  for (const event of events) {
    if (event.type !== 'order_created') continue;
    const existing: PendingOrder | undefined = orders.get(event.orderNumber);
    if (existing) {
      if (!seen.has(JSON.stringify(event))) throw new Error(`${event.orderNumber} was created twice with different content`);
      addNote(existing, `duplicate ${event.type} skipped`);
      continue;
    }
    seen.add(JSON.stringify(event));
    orders.set(event.orderNumber, {
      orderNumber: event.orderNumber,
      at: Date.parse(event.at),
      shipTo: event.shipTo,
      lines: [...event.lines],
      notes: [],
    });
  }
  for (const event of events) {
    if (event.type !== 'order_edited') continue;
    const order: PendingOrder | undefined = orders.get(event.orderNumber);
    if (!order) throw new Error(`${event.orderNumber} was edited but never created`);
    if (seen.has(JSON.stringify(event))) {
      addNote(order, `duplicate ${event.type} skipped`);
      continue;
    }
    seen.add(JSON.stringify(event));
    order.lines.push(...event.addedLines);
    order.notes.push(`edit +${Math.round((Date.parse(event.at) - order.at) / 60000)} min merged`);
  }
  return [...orders.values()].sort((earlier: PendingOrder, later: PendingOrder): number => earlier.at - later.at);
}

function normalizeZip(raw: unknown): { zip: string; note?: string } {
  const text: string = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (typeof raw !== 'number' && !/^\d{1,4}$/.test(text)) return { zip: text };
  const padded: string = text.padStart(5, '0');
  return padded === text ? { zip: text } : { zip: padded, note: `ZIP ${raw} read as ${padded}` };
}

function expandLines(lines: Line[], bundles: Bundle[]): { need: StockBySku; notes: string[] } {
  const need: StockBySku = {};
  const notes: string[] = [];
  const note = (text: string): void => {
    if (!notes.includes(text)) notes.push(text);
  };
  const add = (sku: string, quantity: number): number => (need[sku] = (need[sku] ?? 0) + quantity);
  for (const line of lines) {
    const sku: string = normalizeSku(line.sku);
    if (sku !== line.sku) note(`SKU ${line.sku} read as ${sku}`);
    const bundle: Bundle | undefined = bundles.find((candidate: Bundle): boolean => candidate.sku === sku);
    if (bundle) {
      note(`bundle ${sku} expanded`);
      for (const component of bundle.components) add(normalizeSku(component.sku), component.quantity * line.quantity);
    } else add(sku, line.quantity);
  }
  return { need, notes };
}

// R4-R6 in order. The first rule that separates two candidates decides the sort and names the reason.
const RULES: [label: string, compare: (first: Candidate, second: Candidate) => number][] = [
  ['zone', (first: Candidate, second: Candidate): number => first.zone - second.zone],
  ['tie-break cover', (first: Candidate, second: Candidate): number => second.cover - first.cover],
  ['tie-break priority', (first: Candidate, second: Candidate): number => PRIORITY.indexOf(first.code) - PRIORITY.indexOf(second.code)],
];

// NaN (two Infinity covers) counts as no decision.
function decide(first: Candidate, second: Candidate): [label: string, result: number] | undefined {
  for (const [label, compare] of RULES) {
    const result: number = compare(first, second);
    if (result) return [label, result];
  }
  return undefined;
}

// Candidates that can take the order, best first. Cover uses the stock before this order reserves.
function rank(
  warehouses: Warehouse[],
  stock: Map<string, StockBySku>,
  zones: Record<string, ZoneByPrefix>,
  need: StockBySku,
  prefix: string,
  off: string[] = [],
): Candidate[] {
  const skus: string[] = Object.keys(need);
  return warehouses
    .filter((warehouse: Warehouse): boolean => warehouse.enabled && !off.includes(warehouse.code))
    .flatMap((warehouse: Warehouse): Candidate[] => {
      const left: StockBySku = stock.get(warehouse.code)!;
      const zone: unknown = zones[warehouse.code]?.[prefix];
      if (typeof zone !== 'number' || !skus.every((sku: string): boolean => (left[sku] ?? 0) >= need[sku])) return [];
      const cover: number = Math.min(
        ...skus.map((sku: string): number => {
          const velocity: number = warehouse.inventory[sku]?.dailyVelocity ?? 0;
          return velocity > 0 ? (left[sku] ?? 0) / velocity : Infinity;
        }),
      );
      return [{ code: warehouse.code, zone, cover }];
    })
    .sort((first: Candidate, second: Candidate): number => decide(first, second)?.[1] ?? 0);
}

function pick(ranked: Candidate[]): { best: Candidate; reason: string } {
  const best: Candidate = ranked[0];
  const next: Candidate | undefined = ranked[1];
  const label: string | undefined = next && decide(best, next)?.[0];
  return { best, reason: label && label !== 'zone' ? `zone ${best.zone}, ${label}` : `zone ${best.zone}` };
}

function reserve(stock: Map<string, StockBySku>, code: string, need: StockBySku): void {
  // Written through the stock map so later orders see less.
  const left: StockBySku = stock.get(code)!;
  for (const sku of Object.keys(need)) left[sku] = (left[sku] ?? 0) - need[sku];
}

export function route(data: Data, options: RouteOptions = {}): Result[] {
  validate(data, options);
  const stock: Map<string, StockBySku> = new Map(
    data.warehouses.map((warehouse: Warehouse): [string, StockBySku] => [
      warehouse.code,
      Object.fromEntries(
        Object.entries(warehouse.inventory).map(([sku, item]: [string, InventoryItem]): [string, number] => [sku, item.available]),
      ),
    ]),
  );
  // Warehouse code -> ZIP prefix -> zone. Keys that are not tables (_note) drop out.
  const zones: Record<string, ZoneByPrefix> = Object.fromEntries(
    Object.entries(data.zones).filter(([, value]: [string, unknown]): boolean => value !== null && typeof value === 'object'),
  ) as Record<string, ZoneByPrefix>;

  return mergeEvents(data.orders).map((order: PendingOrder): Result => {
    const { orderNumber, notes }: PendingOrder = order;
    const partner = (reason: string): Result => ({ orderNumber, destination: 'PARTNER', reason, notes });
    const rawCountry: string = order.shipTo.country;
    const country: string = rawCountry.trim().toUpperCase();
    if (country !== rawCountry) notes.push(`country ${rawCountry} read as ${country}`);
    if (country !== 'US') return partner(`international (${country})`);

    const { zip, note }: { zip: string; note?: string } = normalizeZip(order.shipTo.zip);
    if (note) notes.push(note);
    if (!zip) return partner('no ZIP');
    const prefix: string = zip.slice(0, 3);
    if (!Object.values(zones).some((zoneByPrefix: ZoneByPrefix): boolean => typeof zoneByPrefix[prefix] === 'number'))
      return partner(`ZIP prefix ${prefix} not in zones`);

    const { need, notes: lineNotes }: { need: StockBySku; notes: string[] } = expandLines(order.lines, data.catalog.bundles);
    if (!Object.keys(need).length) throw new Error(`${orderNumber} has no items`);
    notes.push(...lineNotes);
    const ranked: Candidate[] = rank(data.warehouses, stock, zones, need, prefix, options.off);
    if (!ranked.length) return partner('no warehouse can take it');
    const { best, reason }: { best: Candidate; reason: string } = pick(ranked);
    reserve(stock, best.code, need);
    return { orderNumber, destination: best.code, zone: best.zone, reason, notes };
  });
}

export function formatRoute(result: Result): string {
  return (
    `${result.orderNumber}  ${result.destination.padEnd(7)}  ${result.reason}` +
    (result.notes.length ? `  [${result.notes.join('; ')}]` : '')
  );
}
