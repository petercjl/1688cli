import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectResearch } from '../src/research-collect.mjs';

test('collects every returned offer once and preserves every search and SKU observation', async () => {
  const dir = await mkdtemp(join(tmpdir(), '1688cli-collect-'));
  try {
    const item = (offer_id, sku_id, price) => ({ offer_id, title: `商品 ${offer_id}`, url: `https://detail.1688.com/offer/${offer_id}.html`, image_url: 'https://img.example.com/1.jpg', price, moq: 1, sku_id, sku_title: sku_id, supplier_name: '甲厂', supplier_member_id: 'member-1' });
    await writeFile(join(dir, 'q1.json'), JSON.stringify({ ok: true, kind: 'products', query: '平底锅', products: [item('a', 's1', 12), item('b', 's2', 20)] }));
    await writeFile(join(dir, 'q2.json'), JSON.stringify({ ok: true, kind: 'products', query: '早餐锅', products: [item('a', 's3', 15), item('c', 's4', 30)] }));
    const manifest = { searches: [
      { search_id: 'q1', method: 'text', input: '平底锅', reason: '大类', raw_path: 'q1.json' },
      { search_id: 'q2', method: 'text', input: '早餐锅', reason: '场景', raw_path: 'q2.json' }
    ] };
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const result = await collectResearch(join(dir, 'manifest.json'));
    assert.deepEqual(result.products.map(row => row.offer_id), ['a', 'b', 'c']);
    assert.deepEqual(result.products[0].source_search_ids, ['q1', 'q2']);
    assert.deepEqual(result.products[0].observations.map(row => row.sku_id), ['s1', 's3']);
    assert.deepEqual(result.search_log.map(row => row.offer_ids), [['a', 'b'], ['a', 'c']]);
    assert.equal(result.coverage.returned_rows, 4);
    assert.equal(result.coverage.unique_offers, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
