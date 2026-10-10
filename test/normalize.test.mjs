import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProducts, normalizeSuppliers, screenRows } from '../src/normalize.mjs';

test('normalizes nested official product output and preserves evidence', () => {
  const payload = { success: true, data: { data: { similar_products: [{ product_id: 123, title: '锅', price: '¥19.50', quantity_begin: 2, sold_count: 50, supplier: '厂商' }] } } };
  const [row] = normalizeProducts(payload, '锅', 'text');
  assert.equal(row.offer_id, '123');
  assert.equal(row.price, 19.5);
  assert.equal(row.moq, 2);
  assert.equal(row.source.query, '锅');
});

test('normalizes supplier output', () => {
  const [row] = normalizeSuppliers({ data: { factories: [{ companyName: '甲厂', supportProofing: true, monthlyOrders: '8' }] } }, '锅厂');
  assert.equal(row.company_name, '甲厂');
  assert.equal(row.supports_proofing, true);
  assert.equal(row.monthly_orders, 8);
});

test('screen treats missing numeric evidence as not meeting a threshold', () => {
  const rows = [{ price: 10, moq: 5, sold_count: 100 }, { price: null, moq: 5, sold_count: 100 }];
  assert.equal(screenRows(rows, { maxPrice: 20 }).length, 1);
});

test('screen combines relevance, category, supplier and price without merging offers', () => {
  const rows = [
    { offer_id: 'a', relevance: 'relevant', category_ids: ['breakfast', 'mini'], supplier_name: '甲厂', supplier_member_id: 'member-a', price: 12, moq: 1 },
    { offer_id: 'b', relevance: 'possible', category_ids: ['breakfast'], supplier_name: '乙厂', supplier_member_id: 'member-b', price: 18, moq: 1 },
    { offer_id: 'c', relevance: 'irrelevant', category_ids: ['mini'], supplier_name: '甲厂', supplier_member_id: 'member-a', price: 10, moq: 1 }
  ];
  const selected = screenRows(rows, { relevance: 'relevant,possible', category: 'breakfast', supplier: '甲厂', maxPrice: 15 });
  assert.deepEqual(selected.map(row => row.offer_id), ['a']);
});
