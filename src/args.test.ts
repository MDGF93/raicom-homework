import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOff } from './args.ts';

test('parseOff: accepted forms', () => {
  assert.deepEqual(parseOff(['--off', 'WH-NV']), ['WH-NV']);
  assert.deepEqual(parseOff(['--off=WH-NV']), ['WH-NV']);
  assert.deepEqual(parseOff(['--off', 'WH-NV', '--off', 'WH-GA']), ['WH-NV', 'WH-GA']);
  assert.deepEqual(parseOff(['--off', 'WH-NV,WH-GA']), ['WH-NV', 'WH-GA']);
  assert.equal(parseOff([]), undefined);
});

test('parseOff: bad input throws', () => {
  assert.throws(() => parseOff(['--of', 'WH-NV']));
  assert.throws(() => parseOff(['--off']));
});
