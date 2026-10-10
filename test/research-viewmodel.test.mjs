import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCommerceViewModel } from '../src/research-viewmodel.mjs';

const fixture = () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/research-explore.json', import.meta.url), 'utf8'));
  data.products[0].image_url = 'https://cbu01.alicdn.com/example.jpg';
  return data;
};

test('maps exploratory clusters to independent HTML views with HTTPS product images', () => {
  const vm = toCommerceViewModel(fixture());
  assert.equal(vm.contract, 'compact-workbench@1.0');
  assert.equal(vm.meta.external_images, 'allow_https');
  assert.deepEqual(vm.views.map(view => view.id), ['overview', 'category_1', 'evidence']);
  const card = vm.views[1].blocks[0].items[0];
  assert.equal(card.image_url, 'https://cbu01.alicdn.com/example.jpg');
  assert.equal(card.url, 'https://detail.1688.com/offer/test-offer-1.html');
  assert.ok(card.facts.some(fact => fact.label === '商家' && fact.value === '示例商家'));
});

test('keeps unclassified products visible without inventing a category', () => {
  const data = fixture();
  data.products.push({ ...data.products[0], offer_id: 'test-offer-2', url: 'https://detail.1688.com/offer/test-offer-2.html', source_search_ids: ['q1'] });
  const vm = toCommerceViewModel(data);
  assert.ok(vm.views.some(view => view.id === 'other_candidates'));
  assert.equal(vm.views.find(view => view.id === 'other_candidates').blocks[0].items.length, 1);
});

test('rejects products without a usable remote image or product link', () => {
  const data = fixture();
  data.products[0].image_url = '';
  data.products[0].url = 'http://example.com/product';
  assert.throws(() => toCommerceViewModel(data), error => error.code === 'OUTPUT_CONTRACT_FAILED' && error.details.issues.some(issue => issue.path === 'products[0].image_url') && error.details.issues.some(issue => issue.path === 'products[0].url'));
});

test('groups precise matches by user reference image', () => {
  const data = fixture();
  data.mode = 'precise';
  data.request.reference_images = [{ reference_id: 'r1', source: 'https://example.com/reference.jpg' }];
  data.search_log.push({ search_id: 'q2', method: 'image', input: 'https://example.com/reference.jpg', reference_id: 'r1', reason: '用户图找款', status: 'success', result_count: 1, raw_path: 'q2.json' });
  data.mode_data = {
    references: [{ reference_id: 'r1', source: 'https://example.com/reference.jpg', relation_to_other_images: '' }],
    matches: [{ reference_id: 'r1', offer_id: 'test-offer-1', match_level: 'similar_alternative', visible_evidence: ['锅身轮廓相近'], differences: ['手柄不同'], unknowns: ['材质'] }]
  };
  const vm = toCommerceViewModel(data);
  assert.deepEqual(vm.views.map(view => view.id), ['overview', 'reference_1', 'evidence']);
  assert.match(vm.views[1].blocks[0].items[0].evidence, /手柄不同/);
});

test('v2 shows complete unique inventory while allowing cross-category cards', () => {
  const data = fixture();
  data.schema_version = '2.0.0';
  data.search_log[0].offer_ids = ['test-offer-1'];
  data.coverage = { returned_rows: 1, unique_offers: 1, backend_exhaustive: false, limitations: ['未验证分页'] };
  data.products[0].relevance = 'relevant';
  data.products[0].category_ids = ['basic', 'second'];
  data.products[0].observations = [{ search_id: 'q1', sku_id: 's1', sku_title: '示例规格', price: 30, moq: 1 }];
  data.mode_data.clusters.push({ cluster_id: 'second', name: '第二类', distinguishing_cues: [], representative_offer_ids: ['test-offer-1'], search_terms_seen: [], next_search_options: [] });
  const vm = toCommerceViewModel(data);
  assert.deepEqual(vm.views.map(view => view.id), ['overview', 'category_1', 'category_2', 'all_candidates', 'comparison', 'evidence']);
  assert.equal(vm.views.find(view => view.id === 'all_candidates').blocks[0].items.length, 1);
  assert.equal(vm.views.find(view => view.id === 'category_2').blocks[0].items.length, 1);
});

test('v2.1 renders one visual class plus per-image tags and evidence', () => {
  const data = fixture();
  data.schema_version = '2.1.0';
  data.search_log[0].offer_ids = ['test-offer-1'];
  data.coverage = { returned_rows: 1, unique_offers: 1, backend_exhaustive: false, limitations: ['未验证分页'] };
  data.products[0].relevance = 'relevant';
  data.products[0].category_ids = ['basic'];
  data.products[0].observations = [{ search_id: 'q1', sku_id: 's1', sku_title: '示例规格', price: 30, moq: 1 }];
  data.products[0].primary_style_class_id = 'basic';
  data.products[0].visual_profile = { basis: 'primary_image', status: 'classified', subject: '圆形浅锅', visual_tags: ['圆形', '浅锅身'], visual_evidence: ['主图可见圆形浅锅身'], confidence: 'high' };
  data.products[0].title_conflict = 'none';
  data.products[0].title_note = '';
  data.mode_data.visual_batch_size = 10;
  data.mode_data.visual_analysis_complete = true;
  data.mode_data.clustering_basis = 'visual_tags_after_image_analysis';
  data.mode_data.visual_batches = [{ batch_id: 'visual-0001', offer_ids: ['test-offer-1'] }];
  data.mode_data.clusters[0].visual_signature = ['圆形', '浅锅身'];
  data.mode_data.clusters[0].member_offer_ids = ['test-offer-1'];
  const vm = toCommerceViewModel(data);
  const card = vm.views.find(view => view.id === 'category_1').blocks[0].items[0];
  assert.ok(card.facts.some(fact => fact.label === '视觉标签' && fact.value.includes('圆形')));
  assert.match(card.evidence, /主图可见圆形浅锅身/);
});
