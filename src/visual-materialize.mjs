import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { CliError } from './errors.mjs';

const extensionFor = contentType => ({
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif'
}[String(contentType || '').split(';')[0].trim().toLowerCase()] || '.img');

export async function materializeVisualBatches(manifestPath, outputDir, fetchImpl = fetch) {
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', '无法读取视觉批次 JSON 文件', { path: resolve(manifestPath) }); }
  if (manifest.schema !== '1688-visual-batch-manifest' || manifest.batch_size !== 10 || !Array.isArray(manifest.batches)) {
    throw new CliError('INVALID_INPUT', '输入须为固定 10 图批次的视觉清单');
  }
  const root = resolve(outputDir);
  try { await mkdir(root); }
  catch (error) {
    if (error.code === 'EEXIST') throw new CliError('OUTPUT_EXISTS', '输出目录已存在，拒绝覆盖', { path: root });
    throw error;
  }

  const batches = [];
  for (const batch of manifest.batches) {
    const batchDir = join(root, batch.batch_id);
    await mkdir(batchDir);
    const items = await Promise.all(batch.items.map(async item => {
      try {
        const response = await fetchImpl(item.image_url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`unexpected content-type: ${contentType || 'unknown'}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error('empty image');
        const localPath = join(batchDir, `${item.offer_id}${extensionFor(contentType)}`);
        await writeFile(localPath, bytes, { mode: 0o600, flag: 'wx' });
        return { ...item, status: 'ready', local_path: localPath, content_type: contentType.split(';')[0], bytes: bytes.length };
      } catch (error) {
        return { ...item, status: 'failed', local_path: '', error: error.message };
      }
    }));
    batches.push({ batch_id: batch.batch_id, items });
  }
  const ready = batches.flatMap(batch => batch.items).filter(item => item.status === 'ready').length;
  const failed = batches.flatMap(batch => batch.items).filter(item => item.status === 'failed').length;
  const result = {
    schema: '1688-visual-materialization', schema_version: '1.0.0', batch_size: 10,
    source_manifest: resolve(manifestPath), root, batches,
    coverage: { requested: ready + failed, ready, failed }
  };
  await writeFile(join(root, 'materialized.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return result;
}
