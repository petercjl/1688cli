import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildResearch } from '../src/research-build.mjs';

test('build retains every inventory offer while accepting cross-category judgments', async () => {
  const dir = await mkdtemp(join(tmpdir(), '1688cli-build-'));
  try {
    const products = ['a', 'b'].map(offer_id => ({ offer_id, title: offer_id, url: `https://detail.1688.com/offer/${offer_id}.html`, image_url: 'https://img.example.com/a.jpg', price: 12, sku_title: '20cm', moq: 1, supplier_name: '甲厂', source_search_ids: ['q1'], observations: [{ search_id: 'q1', sku_id: 's1', sku_title: '20cm', price: 12, moq: 1 }], relevance: 'unreviewed', category_ids: [], assessment: '' }));
    const inventory = { schema: '1688-search-inventory', schema_version: '1.0.0', search_log: [{ search_id: 'q1', method: 'text', input: '锅', reason: '宽搜', status: 'success', result_count: 2, offer_ids: ['a', 'b'], raw_path: 'q1.json' }], products, coverage: { returned_rows: 2, unique_offers: 2, backend_exhaustive: false, limitations: ['未翻页'] } };
    const context = { mode: 'explore', status: 'partial', request: { original_text: '锅', reference_images: [], hard_constraints: [], preferences: [] }, mode_data: { clusters: [{ cluster_id: 'pan', name: '锅', distinguishing_cues: [], representative_offer_ids: ['a'], search_terms_seen: ['锅'], next_search_options: [] }, { cluster_id: 'breakfast', name: '早餐', distinguishing_cues: [], representative_offer_ids: ['a'], search_terms_seen: [], next_search_options: [] }], priority_cluster_ids: [] }, human_handoff: { questions: [], unverified: [] }, stop_reason: '技术回放，尚未逐条判断', assessments: { a: { relevance: 'relevant', category_ids: ['pan', 'breakfast'], assessment: '标题和主图相符' } } };
    await writeFile(join(dir, 'inventory.json'), JSON.stringify(inventory));
    await writeFile(join(dir, 'context.json'), JSON.stringify(context));
    const result = await buildResearch(join(dir, 'inventory.json'), join(dir, 'context.json'));
    assert.deepEqual(result.products.map(row => row.offer_id), ['a', 'b']);
    assert.deepEqual(result.products[0].category_ids, ['pan', 'breakfast']);
    assert.equal(result.products[1].relevance, 'unreviewed');
    context.status = 'complete';
    await writeFile(join(dir, 'context.json'), JSON.stringify(context));
    await assert.rejects(() => buildResearch(join(dir, 'inventory.json'), join(dir, 'context.json')), error => error.code === 'OUTPUT_CONTRACT_FAILED');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('build preserves an explicitly requested visual result schema', async () => {
  const dir = await mkdtemp(join(tmpdir(), '1688cli-build-visual-'));
  try {
    const inventory = { schema: '1688-search-inventory', schema_version: '1.0.0', search_log: [{ search_id: 'q1', method: 'text', input: '锅', reason: '宽搜', status: 'success', result_count: 1, offer_ids: ['a'], raw_path: 'q1.json' }], products: [{ offer_id: 'a', title: '锅', url: 'https://detail.1688.com/offer/a.html', image_url: 'https://img.example.com/a.jpg', price: 12, sku_title: '20cm', moq: 1, supplier_name: '甲厂', source_search_ids: ['q1'], observations: [{ search_id: 'q1', sku_id: 's1', sku_title: '20cm', price: 12, moq: 1 }], relevance: 'unreviewed', category_ids: [], assessment: '' }], coverage: { returned_rows: 1, unique_offers: 1, backend_exhaustive: false, limitations: ['未翻页'] } };
    const context = { schema_version: '2.1.0', mode: 'explore', status: 'complete', request: { original_text: '锅', reference_images: [], hard_constraints: [], preferences: [] }, mode_data: { visual_batch_size: 10, visual_analysis_complete: true, clustering_basis: 'visual_tags_after_image_analysis', visual_batches: [{ batch_id: 'visual-0001', offer_ids: ['a'] }], clusters: [{ cluster_id: 'round', name: '圆形浅煎锅', distinguishing_cues: ['圆形浅锅身'], visual_signature: ['圆形', '浅锅身', '单长柄'], representative_offer_ids: ['a'], member_offer_ids: ['a'], search_terms_seen: [], next_search_options: [] }], priority_cluster_ids: [] }, human_handoff: { questions: [], unverified: [] }, stop_reason: '完成逐图视觉打标和聚类', assessments: { a: { relevance: 'relevant', category_ids: ['round'], assessment: '主图显示圆形浅锅身和单长柄。', primary_style_class_id: 'round', visual_profile: { basis: 'primary_image', status: 'classified', subject: '圆形浅煎锅', visual_tags: ['圆形', '浅锅身', '单长柄'], visual_evidence: ['主图可见圆形浅锅身和单长柄'], confidence: 'high' }, title_conflict: 'not_checked', title_note: '' } } };
    await writeFile(join(dir, 'inventory.json'), JSON.stringify(inventory));
    await writeFile(join(dir, 'context.json'), JSON.stringify(context));
    const result = await buildResearch(join(dir, 'inventory.json'), join(dir, 'context.json'));
    assert.equal(result.schema_version, '2.1.0');
    assert.equal(result.products[0].primary_style_class_id, 'round');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
