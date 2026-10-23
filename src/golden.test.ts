// Golden tests: the expected routes come from a hand trace of the real files, made before the router existed.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, route, formatRoute, type Data, type Result } from './router.ts';

const data: Data = loadData();
const summarize = (result: Result): string =>
  result.destination === 'PARTNER' ? `${result.orderNumber} PARTNER` : `${result.orderNumber} ${result.destination} z${result.zone}`;

test('golden: Part A routes match the hand trace', () => {
  assert.deepEqual(route(data).map(summarize), [
    '#2031 WH-NJ z1',
    '#2032 WH-GA z1',
    '#2033 WH-NJ z3',
    '#2034 WH-GA z5',
    '#2035 WH-GA z4',
    '#2036 WH-NV z2',
    '#2037 PARTNER',
    '#2038 WH-NV z4',
    '#2039 WH-NJ z1',
    '#2040 WH-GA z5',
    '#2041 WH-GA z7',
    '#2042 PARTNER',
    '#2043 WH-NV z3',
    '#2044 WH-GA z6',
    '#2045 WH-GA z3',
    '#2046 PARTNER',
    '#2047 WH-GA z4',
    '#2048 WH-NJ z5',
    '#2049 WH-GA z4',
    '#2050 WH-NJ z5',
    '#2051 WH-NV z2',
    '#2052 WH-NV z5',
    '#2053 WH-NJ z2',
    '#2054 WH-GA z4',
    '#2055 WH-GA z8',
    '#2056 WH-GA z5',
  ]);
});

test('golden: Question 1 orders with WH-NV off', () => {
  const asked: string[] = ['#2033', '#2037', '#2040', '#2041', '#2045', '#2050', '#2051', '#2056'];
  const got: string[] = route(data, { off: ['WH-NV'] })
    .filter((result: Result): boolean => asked.includes(result.orderNumber))
    .map(summarize);
  assert.deepEqual(got, [
    '#2033 WH-NJ z3',
    '#2037 PARTNER',
    '#2040 WH-GA z5',
    '#2041 WH-GA z7',
    '#2045 WH-GA z3',
    '#2050 WH-NJ z5',
    '#2051 WH-GA z7',
    '#2056 PARTNER',
  ]);
});

const routesFile = (name: string): string =>
  readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .trimEnd();
const printed = (off?: string[]): string => route(data, { off }).map(formatRoute).join('\n');

test('golden: routes.txt and routes-nv-off.txt match a fresh run', () => {
  assert.equal(printed(), routesFile('routes.txt'));
  assert.equal(printed(['WH-NV']), routesFile('routes-nv-off.txt'));
});

test('golden: Question 2 with WH-NV and WH-GA off', () => {
  const partner: Result[] = route(data, { off: ['WH-NV', 'WH-GA'] }).filter((result: Result): boolean => result.destination === 'PARTNER');
  assert.deepEqual(
    partner.map((result: Result): string => result.orderNumber),
    ['#2036', '#2037', '#2039', '#2042', '#2043', '#2045', '#2046', '#2049', '#2052', '#2054', '#2056'],
  );
  for (const result of partner.filter((entry: Result): boolean => !['#2037', '#2042', '#2046'].includes(entry.orderNumber)))
    assert.equal(result.reason, 'no warehouse can take it');
});
