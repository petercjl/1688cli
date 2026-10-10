import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliError } from './errors.mjs';
import { validateResearchResult } from './research-validator.mjs';

async function readJson(path, label) {
  try { return JSON.parse(await readFile(resolve(path), 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', `无法读取${label} JSON`, { path: resolve(path) }); }
}

export async function buildResearch(inventoryPath, contextPath) {
  const inventory = await readJson(inventoryPath, '商品库');
  const context = await readJson(contextPath, '判断');
  if (inventory.schema !== '1688-search-inventory' || inventory.schema_version !== '1.0.0' || !Array.isArray(inventory.products) || !Array.isArray(inventory.search_log)) {
    throw new CliError('INVALID_INPUT', '输入须为 research collect 生成的完整商品库');
  }
  const assessments = context.assessments || {};
  if (assessments === null || Array.isArray(assessments) || typeof assessments !== 'object') throw new CliError('INVALID_INPUT', 'assessments 须为商品 ID 到判断结果的对象');
  const ids = new Set(inventory.products.map(product => product.offer_id));
  for (const id of Object.keys(assessments)) if (!ids.has(id)) throw new CliError('INVALID_INPUT', `判断引用了商品库外的 ID: ${id}`);
  const products = inventory.products.map(product => ({ ...product, ...(assessments[product.offer_id] || {}) }));
  const result = {
    schema: '1688-sourcing-result', schema_version: context.schema_version || '2.0.0',
    mode: context.mode, status: context.status, request: context.request,
    search_log: [...inventory.search_log, ...(context.additional_searches || [])],
    products, coverage: { ...inventory.coverage, ...(context.coverage || {}) },
    mode_data: context.mode_data, human_handoff: context.human_handoff,
    stop_reason: context.stop_reason
  };
  validateResearchResult(result);
  return result;
}
