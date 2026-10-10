import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliError } from './errors.mjs';

const BATCH_SIZE = 10;
const httpsUrl = value => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);

export async function buildVisualBatches(inputPath) {
  let data;
  try { data = JSON.parse(await readFile(resolve(inputPath), 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', '无法读取商品库 JSON 文件', { path: resolve(inputPath) }); }
  if (!Array.isArray(data.products)) throw new CliError('INVALID_INPUT', '输入须包含 products 数组');

  const seen = new Set();
  const usable = [];
  const unusable = [];
  for (const [index, product] of data.products.entries()) {
    const offerId = String(product?.offer_id || '').trim();
    if (!offerId) throw new CliError('INVALID_INPUT', `products[${index}] 缺少商品 ID`);
    if (seen.has(offerId)) throw new CliError('INVALID_INPUT', `商品 ID 重复: ${offerId}`);
    seen.add(offerId);
    if (httpsUrl(product.image_url)) usable.push({ offer_id: offerId, image_url: product.image_url });
    else unusable.push({ offer_id: offerId, image_url: typeof product.image_url === 'string' ? product.image_url : '', reason: 'missing_https_primary_image' });
  }

  const batches = [];
  for (let index = 0; index < usable.length; index += BATCH_SIZE) {
    batches.push({
      batch_id: `visual-${String(batches.length + 1).padStart(4, '0')}`,
      items: usable.slice(index, index + BATCH_SIZE)
    });
  }
  return {
    schema: '1688-visual-batch-manifest',
    schema_version: '1.0.0',
    batch_size: BATCH_SIZE,
    source: { schema: data.schema || '', schema_version: data.schema_version || '', product_count: data.products.length },
    batches,
    unusable,
    coverage: { products: data.products.length, queued_for_visual_analysis: usable.length, unusable_images: unusable.length, total_batches: batches.length }
  };
}

export { BATCH_SIZE };
