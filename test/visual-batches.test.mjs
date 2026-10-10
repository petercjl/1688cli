import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVisualBatches } from '../src/visual-batches.mjs';

test('creates title-free visual work units of at most ten images', async () => {
  const dir = await mkdtemp(join(tmpdir(), '1688cli-visual-'));
  try {
    const products = Array.from({ length: 23 }, (_, index) => ({
      offer_id: String(index + 1), title: `不应进入视觉输入的标题 ${index + 1}`,
      image_url: index === 22 ? '' : `https://img.example.com/${index + 1}.jpg`
    }));
    const path = join(dir, 'inventory.json');
    await writeFile(path, JSON.stringify({ schema: '1688-search-inventory', schema_version: '1.0.0', products }));
    const result = await buildVisualBatches(path);
    assert.equal(result.batch_size, 10);
    assert.deepEqual(result.batches.map(batch => batch.items.length), [10, 10, 2]);
    assert.equal(result.unusable.length, 1);
    assert.equal(result.coverage.products, 23);
    assert.ok(result.batches.every(batch => batch.items.every(item => !Object.hasOwn(item, 'title'))));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
