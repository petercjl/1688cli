import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CliError } from './errors.mjs';

const isText = value => typeof value === 'string' && value.trim().length > 0;

export async function collectResearch(manifestPath) {
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', '无法读取查询清单 JSON', { path: manifestPath }); }
  if (!Array.isArray(manifest.searches) || !manifest.searches.length) throw new CliError('INVALID_INPUT', 'searches 须为非空数组');
  const base = dirname(manifestPath);
  const ids = new Set();
  const products = new Map();
  const searchLog = [];
  let returnedRows = 0;
  for (const [index, search] of manifest.searches.entries()) {
    if (!search || !isText(search.search_id) || ids.has(search.search_id) || !['text', 'image', 'link'].includes(search.method) || !isText(search.input) || !isText(search.reason) || !isText(search.raw_path)) {
      throw new CliError('INVALID_INPUT', `searches[${index}] 缺少有效的唯一 ID、方式、输入、理由或原始路径`);
    }
    if (search.method === 'image' && !isText(search.reference_id)) throw new CliError('INVALID_INPUT', `searches[${index}] 以图搜索须有 reference_id`);
    ids.add(search.search_id);
    const rawPath = resolve(base, search.raw_path);
    let raw;
    try { raw = JSON.parse(await readFile(rawPath, 'utf8')); }
    catch { throw new CliError('INPUT_READ_FAILED', '无法读取原始查询 JSON', { path: rawPath }); }
    if (raw.ok !== true || raw.kind !== 'products' || !Array.isArray(raw.products)) throw new CliError('INVALID_INPUT', `searches[${index}] 不是成功的商品查询结果`, { path: rawPath });
    if (isText(raw.query) && raw.query !== search.input) throw new CliError('INVALID_INPUT', `searches[${index}] 的输入与原始查询不一致`, { path: rawPath });
    const roundIds = new Set();
    returnedRows += raw.products.length;
    for (const [rowIndex, row] of raw.products.entries()) {
      const offerId = String(row.offer_id ?? '').trim();
      if (!offerId) throw new CliError('INVALID_INPUT', `searches[${index}] 商品第 ${rowIndex + 1} 行缺少 offer_id`);
      roundIds.add(offerId);
      const observation = {
        search_id: search.search_id,
        sku_id: String(row.sku_id || ''), sku_title: String(row.sku_title || ''),
        price: row.price ?? null, moq: row.moq ?? null,
        supplier_member_id: String(row.supplier_member_id || '')
      };
      if (!products.has(offerId)) products.set(offerId, {
        offer_id: offerId, title: row.title || '', url: row.url || '', image_url: row.image_url || '',
        price: row.price ?? null, sku_title: row.sku_title || '', moq: row.moq ?? null,
        supplier_name: row.supplier_name || '', supplier_member_id: row.supplier_member_id || '',
        source_search_ids: [], observations: [], relevance: 'unreviewed', category_ids: [], assessment: ''
      });
      const item = products.get(offerId);
      if (!item.source_search_ids.includes(search.search_id)) item.source_search_ids.push(search.search_id);
      if (!item.observations.some(previous => JSON.stringify(previous) === JSON.stringify(observation))) item.observations.push(observation);
      for (const key of ['title', 'url', 'image_url', 'supplier_name', 'supplier_member_id']) if (!item[key] && row[key]) item[key] = row[key];
    }
    searchLog.push({
      search_id: search.search_id, method: search.method, input: search.input,
      ...(isText(search.reference_id) ? { reference_id: search.reference_id } : {}),
      reason: search.reason, status: 'success', result_count: raw.products.length,
      offer_ids: [...roundIds], raw_path: search.raw_path
    });
  }
  return {
    schema: '1688-search-inventory', schema_version: '1.0.0',
    search_log: searchLog, products: [...products.values()],
    coverage: { returned_rows: returnedRows, unique_offers: products.size, backend_exhaustive: false,
      limitations: ['当前 CLI 未提供已验证的分页及平台总量，不能证明单词或图片检索已搜全。'] }
  };
}
