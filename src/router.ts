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

type PendingOrder = { at: string; shipTo: ShipTo; lines: Line[]; notes: string[] };
type StockBySku = Record<string, number>;
type ZoneByPrefix = Record<string, number>;
type Qualifier = { code: string; zone: number | undefined; left: StockBySku; cover: number };
type RoutableQualifier = Qualifier & { zone: number };

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

export function route(data: Data, options: RouteOptions = {}): Result[] {
  // Pass 1: orders from created events, edits merged in.
  const orders: Map<string, PendingOrder> = new Map();
  for (const event of data.orders) {
    if (event.type === 'order_created')
      orders.set(event.orderNumber, { at: event.at, shipTo: event.shipTo, lines: [...event.lines], notes: [] });
  }
  for (const event of data.orders) {
    if (event.type !== 'order_edited') continue;
    const order: PendingOrder | undefined = orders.get(event.orderNumber);
    if (!order) continue;
    order.lines.push(...event.addedLines);
    order.notes.push(`edit +${Math.round((Date.parse(event.at) - Date.parse(order.at)) / 60000)} min merged`);
  }
  const sorted: [string, PendingOrder][] = [...orders].sort(
    ([, earlier]: [string, PendingOrder], [, later]: [string, PendingOrder]): number => Date.parse(earlier.at) - Date.parse(later.at),
  );

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

  return sorted.map(([orderNumber, order]: [string, PendingOrder]): Result => {
    const notes: string[] = order.notes;
    const partner = (reason: string): Result => ({ orderNumber, destination: 'PARTNER', reason, notes });
    if (order.shipTo.country !== 'US') return partner(`international (${order.shipTo.country})`);

    let rawZip: unknown = order.shipTo.zip;
    if (typeof rawZip === 'number') {
      const text: string = String(rawZip).padStart(5, '0');
      if (text !== String(rawZip)) notes.push(`ZIP ${rawZip} read as ${text}`);
      rawZip = text;
    }
    const zip: string = typeof rawZip === 'string' ? rawZip.trim() : '';
    if (!zip) return partner('no ZIP');
    const prefix: string = zip.slice(0, 3);
    if (!Object.values(zones).some((zoneByPrefix: ZoneByPrefix): boolean => prefix in zoneByPrefix))
      return partner(`ZIP prefix ${prefix} not in zones`);

    const need: Record<string, number> = {};
    const add = (sku: string, quantity: number): number => (need[sku] = (need[sku] ?? 0) + quantity);
    for (const line of order.lines) {
      const sku: string = line.sku.trim().toUpperCase();
      if (sku !== line.sku) notes.push(`SKU ${line.sku} read as ${sku}`);
      const bundle: Bundle | undefined = data.catalog.bundles.find((candidate: Bundle): boolean => candidate.sku === sku);
      if (bundle) {
        notes.push(`bundle ${sku} expanded`);
        for (const component of bundle.components) add(component.sku, component.quantity * line.quantity);
      } else add(sku, line.quantity);
    }

    const skus: string[] = Object.keys(need);
    const qualifiers: RoutableQualifier[] = data.warehouses
      .filter((warehouse: Warehouse): boolean => warehouse.enabled && !options.off?.includes(warehouse.code))
      .map((warehouse: Warehouse): Qualifier => {
        const left: StockBySku = stock.get(warehouse.code)!;
        const cover: number = Math.min(
          ...skus.map((sku: string): number => {
            const velocity: number = warehouse.inventory[sku]?.dailyVelocity ?? 0;
            return velocity > 0 ? (left[sku] ?? 0) / velocity : Infinity;
          }),
        );
        return { code: warehouse.code, zone: zones[warehouse.code]?.[prefix], left, cover };
      })
      .filter(
        (candidate: Qualifier): candidate is RoutableQualifier =>
          candidate.zone !== undefined && skus.every((sku: string): boolean => (candidate.left[sku] ?? 0) >= need[sku]),
      )
      .sort(
        (first: RoutableQualifier, second: RoutableQualifier): number =>
          first.zone - second.zone || second.cover - first.cover || PRIORITY.indexOf(first.code) - PRIORITY.indexOf(second.code),
      );
    if (!qualifiers.length) return partner('no warehouse can take it');

    const best: RoutableQualifier = qualifiers[0];
    const next: RoutableQualifier | undefined = qualifiers[1];
    let reason: string = `zone ${best.zone}`;
    if (next?.zone === best.zone) reason += next.cover !== best.cover ? ', tie-break cover' : ', tie-break priority';
    for (const sku of skus) best.left[sku] = (best.left[sku] ?? 0) - need[sku];
    return { orderNumber, destination: best.code, zone: best.zone, reason, notes };
  });
}

export function formatRoute(result: Result): string {
  return (
    `${result.orderNumber}  ${result.destination.padEnd(7)}  ${result.reason}` +
    (result.notes.length ? `  [${result.notes.join('; ')}]` : '')
  );
}
