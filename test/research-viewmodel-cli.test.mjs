import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';

test('research viewmodel writes a new file, summarizes stdout, and refuses overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), '1688cli-viewmodel-test-'));
  try {
    const input = join(directory, 'sourcing-result.json');
    const output = join(directory, 'report-viewmodel.json');
    const data = JSON.parse(await readFile(new URL('./fixtures/research-explore.json', import.meta.url), 'utf8'));
    data.products[0].image_url = 'https://cbu01.alicdn.com/example.jpg';
    await writeFile(input, JSON.stringify(data));
    const logs = [];
    const errors = [];
    const io = { log: value => logs.push(value), error: value => errors.push(value) };
    assert.equal(await main(['research', 'viewmodel', input, '--output', output], io), 0);
    assert.deepEqual(JSON.parse(logs[0]), { ok: true, path: output, contract: 'compact-workbench@1.0', views: 3 });
    assert.equal(JSON.parse(await readFile(output, 'utf8')).meta.external_images, 'allow_https');
    assert.equal(await main(['research', 'viewmodel', input, '--output', output], io), 1);
    assert.equal(JSON.parse(errors[0]).error.code, 'OUTPUT_EXISTS');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
