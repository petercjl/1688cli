import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileVisualTags } from '../src/visual-tag-compile.mjs';

test('compiles complete image tags before visual-structure clustering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visual-tags-'));
  const tags = join(root, 'tags');
  await mkdir(tags);
  const manifest = join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ batch_size: 10, batches: [{ batch_id: 'visual-0001', items: [
    { offer_id: 'a', image_url: 'https://example.com/a.jpg' },
    { offer_id: 'b', image_url: 'https://example.com/b.jpg' }
  ] }] }));
  await writeFile(join(tags, 'visual-0001.json'), JSON.stringify({ batch_id: 'visual-0001', items: [
    { offer_id: 'a', status: 'tagged', subject: '煎蛋锅', primary_style: '方形四孔煎蛋锅', visual_tags: ['四圆孔'], visual_evidence: '四个凹槽', confidence: 0.99 },
    { offer_id: 'b', status: 'tagged', subject: '煎锅', primary_style: '浅口圆形煎锅', visual_tags: ['浅口'], visual_evidence: '浅圆锅身', confidence: 0.95 }
  ] }));
  const result = await compileVisualTags(manifest, tags);
  assert.deepEqual(result.coverage, { requested: 2, tagged: 2, image_unavailable: 0, unique_offer_ids: 2 });
  assert.equal(result.items.find(item => item.offer_id === 'a').cluster_id, 'multi_cavity_pan');
  assert.equal(result.items.find(item => item.offer_id === 'b').cluster_id, 'shallow_frying_pan');
});
