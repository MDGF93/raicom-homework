import { loadData, route, formatRoute } from './router.ts';
import { parseOff } from './args.ts';

for (const result of route(loadData(), { off: parseOff(process.argv.slice(2)) })) console.log(formatRoute(result));
