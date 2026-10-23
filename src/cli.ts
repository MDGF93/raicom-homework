import { loadData, route, formatRoute, type Data, type Warehouse } from './router.ts';

const data: Data = loadData();
const offFlagIndex: number = process.argv.indexOf('--off');
const off: string[] | undefined = offFlagIndex > 0 ? (process.argv[offFlagIndex + 1] ?? '').split(',') : undefined;
const knownCodes: string[] = data.warehouses.map((warehouse: Warehouse): string => warehouse.code);
if (off?.some((code: string): boolean => !knownCodes.includes(code)))
  throw new Error(`--off takes warehouse codes from: ${knownCodes.join(',')}`);
for (const result of route(data, { off })) console.log(formatRoute(result));
