import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, main } from '../src/cli.mjs';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/products.json', import.meta.url));

test('rejects unknown options', () => {
  assert.throws(() => parseArgs(['products', 'search', '锅', '--nope']), /未知选项/);
});

test('capabilities registry is exposed as JSON', async () => {
  const messages = [];
  const code = await main(['capabilities', '--json'], { log: x => messages.push(x), error: x => messages.push(x) });
  assert.equal(code, 0);
  const result = JSON.parse(messages[0]);
  assert.equal(result.capabilities.length, 5);
  assert.equal(result.capabilities[0].access, 'read');




});

test('missing search input produces structured error', async () => {
  const errors = [];
  const code = await main(['products', 'search'], { log() {}, error: x => errors.push(JSON.parse(x)) });
  assert.equal(code, 1);
  assert.equal(errors[0].error.code, 'MISSING_INPUT');
});

test('screen applies price and MOQ limits to saved result', async () => {
  const messages = [];
  const code = await main(['screen', fixture, '--max-price', '20', '--max-moq', '10'], { log: x => messages.push(x), error: x => messages.push(x) });
  assert.equal(code, 0);
  const result = JSON.parse(messages[0]);
  assert.equal(result.input_count, 3);
  assert.deepEqual(result.products.map(row => row.offer_id), ['1']);
});
