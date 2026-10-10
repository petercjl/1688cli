import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeVisualBatches } from '../src/visual-materialize.mjs';

test('materializes one title-free batch while preserving offer ids', async () => {
  const dir = await mkdtemp(join(tmpdir(), '1688cli-materialize-'));
  try {
    const manifestPath = join(dir, 'visual.json');
    const outputDir = join(dir, 'assets');
    await writeFile(manifestPath, JSON.stringify({ schema: '1688-visual-batch-manifest', schema_version: '1.0.0', batch_size: 10, batches: [{ batch_id: 'visual-0001', items: [{ offer_id: '123', image_url: 'https://img.example.com/a.jpg' }] }] }));
    const fakeFetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    const result = await materializeVisualBatches(manifestPath, outputDir, fakeFetch);
    assert.equal(result.coverage.ready, 1);
    assert.equal(result.batches[0].items[0].offer_id, '123');
    assert.equal((await readFile(result.batches[0].items[0].local_path)).length, 3);
    assert.ok(JSON.parse(await readFile(join(outputDir, 'materialized.json'), 'utf8')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
