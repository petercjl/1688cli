const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[,¥￥]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function normalizeProducts(payload, query, method) {
  const data = payload?.data?.data || payload?.data || {};
  const rows = data.similar_products;
  if (!Array.isArray(rows)) throw new Error('官方找商品 CLI 返回的数据缺少 similar_products 数组');
  return rows.map(row => ({
    offer_id: String(row.product_id || ''),
    title: row.title || '',
    url: row.detail_url || '',
    image_url: row.image_url || '',
    price: number(row.price),
    moq: number(row.quantity_begin),
    unit: row.unit || '',
    sold_count: number(row.sold_count),
    yx_index: number(row.yx_index),
    similarity_score: number(row.similarity_score),
    supplier_name: row.supplier || '',
    supplier_member_id: row.member_id || '',
    sku_id: row.sku_id || '',
    sku_title: row.sku_title || '',
    source: { provider: '1688-official-skill', method, query, collected_at: new Date().toISOString() }
  }));
}

export function normalizeSuppliers(payload, query) {
  const rows = payload?.data?.factories;
  if (!Array.isArray(rows)) throw new Error('官方找供应商 CLI 返回的数据缺少 factories 数组');
  return rows.map(row => ({
    company_name: row.companyName || '',
    url: row.companyUrl || '',
    location: row.location || '',
    cooperation_modes: row.cooperationMode || [],
    services: row.services || [],
    factory_level: row.factoryLevel || '',
    factory_types: row.factoryType || [],
    recommendation_tags: row.recTags || [],
    satisfied_rate: row.satisfiedRate || '',
    monthly_orders: number(row.monthlyOrders),
    supports_proofing: Boolean(row.supportProofing),
    provider_score: number(row.score),
    source: { provider: '1688-official-skill', method: 'supplier-search', query, collected_at: new Date().toISOString() }
  }));
}

export function screenRows(rows, filters) {
  return rows.filter(row => {
    if (filters.maxPrice !== undefined && (row.price === null || row.price > filters.maxPrice)) return false;
    if (filters.maxMoq !== undefined && (row.moq === null || row.moq > filters.maxMoq)) return false;
    if (filters.minSold !== undefined && (row.sold_count === null || row.sold_count < filters.minSold)) return false;
    if (filters.location && !String(row.location || '').includes(filters.location)) return false;
    if (filters.relevance && !filters.relevance.split(',').includes(row.relevance)) return false;
    if (filters.category && (!Array.isArray(row.category_ids) || !row.category_ids.includes(filters.category))) return false;
    if (filters.supplier && !String(row.supplier_member_id || '').includes(filters.supplier) && !String(row.supplier_name || row.company_name || '').includes(filters.supplier)) return false;
    if (filters.proofing && row.supports_proofing !== true) return false;
    return true;
  });
}
