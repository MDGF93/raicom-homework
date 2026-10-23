import { parseArgs } from 'node:util';

export function parseOff(argv: string[]): string[] | undefined {
  const { values }: { values: { off?: string[] } } = parseArgs({
    args: argv,
    options: { off: { type: 'string', multiple: true } },
    strict: true,
    allowPositionals: false,
  });
  return values.off?.flatMap((value: string): string[] => value.split(','));
}
