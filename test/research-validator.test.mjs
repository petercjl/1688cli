import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResearchResult } from '../src/research-validator.mjs';

const base = () => ({
  schema: '1688-sourcing-result', schema_version: '1.0.0', mode: 'explore', status: 'complete',
  request: { original_text: '平底锅', reference_images: [], hard_constraints: [], preferences: [] },
  search_log: [{ search_id: 'q1', method: 'text', input: '平底锅', reason: '大类首搜', status: 'success', result_count: 1, raw_path: 'round1.json' }],
  products: [{ offer_id: '123', title: '锅', url: 'https://detail.1688.com/offer/123.html', image_url: '', price: 12, sku_title: '20cm', moq: 1, supplier_name: '甲厂', source_search_ids: ['q1'], assessment: '待比较' }],
  mode_data: { clusters: [{ cluster_id: 'breakfast', name: '早餐锅', distinguishing_cues: ['早餐场景'], representative_offer_ids: ['123'], search_terms_seen: ['平底锅'], next_search_options: ['早餐 平底锅'] }], priority_cluster_ids: ['breakfast'] },
  human_handoff: { questions: ['20cm 的 100 件阶梯价是多少？'], unverified: ['实际材质'] },
  stop_reason: '已找到可供选择的方向'
});

test('accepts an exploratory result with traceable offers', () => {
  assert.deepEqual(validateResearchResult(base()), { ok: true, mode: 'explore', status: 'complete', searches: 1, products: 1 });
});

test('accepts multi-image precise result with distinct reference matches', () => {
  const result = base();
  result.mode = 'precise';
  result.request.reference_images = [{ reference_id: 'r1', source: 'image-1.jpg' }, { reference_id: 'r2', source: 'image-2.jpg' }];
  result.search_log.push(
    { search_id: 'q2', method: 'image', input: 'image-1.jpg', reference_id: 'r1', reason: '按用户参考图搜索', status: 'success', result_count: 1, raw_path: 'round2.json' },
    { search_id: 'q3', method: 'image', input: 'image-2.jpg', reference_id: 'r2', reason: '按用户参考图搜索', status: 'success', result_count: 0, raw_path: 'round3.json' }
  );
  result.mode_data = {
    references: [{ reference_id: 'r1', source: 'image-1.jpg', relation_to_other_images: '未确认' }, { reference_id: 'r2', source: 'image-2.jpg', relation_to_other_images: '未确认' }],
    matches: [{ reference_id: 'r1', offer_id: '123', match_level: 'similar_alternative', visible_evidence: ['圆形锅身'], differences: [], unknowns: ['材质'] }]
  };
  assert.equal(validateResearchResult(result).mode, 'precise');
});

test('rejects a completed precise result without image search for every input image', () => {
  const result = base();
  result.mode = 'precise';
  result.request.reference_images = [{ reference_id: 'r1', source: 'image-1.jpg' }];
  result.mode_data = { references: [{ reference_id: 'r1', source: 'image-1.jpg', relation_to_other_images: '' }], matches: [] };
  assert.throws(() => validateResearchResult(result), error => error.code === 'OUTPUT_CONTRACT_FAILED' && error.details.issues.some(issue => issue.message.includes('缺少成功的以图搜图记录')));
});

test('rejects image input routed as explore and orphan offer provenance', () => {
  const result = base();
  result.request.reference_images = [{ reference_id: 'r1', source: 'image-1.jpg' }];
  result.products[0].source_search_ids = ['missing'];
  assert.throws(() => validateResearchResult(result), error => error.code === 'OUTPUT_CONTRACT_FAILED' && error.details.issues.some(issue => issue.path === 'request.reference_images') && error.details.issues.some(issue => issue.path === 'products[0].source_search_ids'));
});

test('v2 requires the complete returned inventory and allows one offer in multiple categories', () => {
  const result = base();
  result.schema_version = '2.0.0';
  result.search_log[0].result_count = 2;
  result.search_log[0].offer_ids = ['123', '456'];
  result.coverage = { returned_rows: 2, unique_offers: 2, backend_exhaustive: false, limitations: ['未验证翻页'] };
  result.mode_data.clusters.push({ cluster_id: 'multi', name: '多用锅', distinguishing_cues: [], representative_offer_ids: ['123'], search_terms_seen: ['平底锅'], next_search_options: [] });
  result.products[0].relevance = 'relevant';
  result.products[0].category_ids = ['breakfast', 'multi'];
  result.products[0].observations = [{ search_id: 'q1', sku_id: 'sku-1', sku_title: '20cm', price: 12, moq: 1 }];
  assert.throws(() => validateResearchResult(result), error => error.details.issues.some(issue => issue.message.includes('456')));
  result.products.push({ ...result.products[0], offer_id: '456', url: 'https://detail.1688.com/offer/456.html', category_ids: ['multi'], observations: [{ search_id: 'q1', sku_id: 'sku-2', sku_title: '24cm', price: 20, moq: 1 }] });
  assert.equal(validateResearchResult(result).products, 2);
  result.products[1].offer_id = '123';
  assert.throws(() => validateResearchResult(result), error => error.details.issues.some(issue => issue.message.includes('重复')));
});

test('v2.1 requires ten-image visual batches before one-primary-class clustering', () => {
  const result = base();
  result.schema_version = '2.1.0';
  result.search_log[0].offer_ids = ['123'];
  result.coverage = { returned_rows: 1, unique_offers: 1, backend_exhaustive: false, limitations: ['未验证翻页'] };
  result.products[0].relevance = 'relevant';
  result.products[0].category_ids = ['breakfast'];
  result.products[0].observations = [{ search_id: 'q1', sku_id: 'sku-1', sku_title: '20cm', price: 12, moq: 1 }];
  result.products[0].primary_style_class_id = 'breakfast';
  result.products[0].visual_profile = { basis: 'primary_image', status: 'classified', subject: '圆形四孔煎锅', visual_tags: ['圆形', '四孔分格', '单长柄'], visual_evidence: ['锅体可见四个圆形独立凹槽'], confidence: 'high' };
  result.products[0].title_conflict = 'not_checked';
  result.products[0].title_note = '';
  result.mode_data.visual_batch_size = 10;
  result.mode_data.visual_analysis_complete = true;
  result.mode_data.clustering_basis = 'visual_tags_after_image_analysis';
  result.mode_data.visual_batches = [{ batch_id: 'visual-0001', offer_ids: ['123'] }];
  result.mode_data.clusters[0].visual_signature = ['四孔分格', '圆形锅体'];
  result.mode_data.clusters[0].member_offer_ids = ['123'];
  assert.equal(validateResearchResult(result).products, 1);
  result.mode_data.visual_batches[0].offer_ids = Array.from({ length: 11 }, (_, index) => String(index));
  assert.throws(() => validateResearchResult(result), error => error.details.issues.some(issue => issue.message.includes('1-10')));
});
