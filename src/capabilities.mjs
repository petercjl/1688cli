export const capabilities = Object.freeze([
  { id: 'products.search', name: '关键词找商品', description: '按需求关键词查找 1688 商品并返回可筛选的结构化清单', command: '1688cli products search "关键词" --limit 10', inputs: ['keyword'], optional: ['limit', 'sort', 'score-level', 'purchase-amount', 'tags', 'ic-tags'], output: 'JSON products[]', access: 'read' },
  { id: 'products.image', name: '以图找货', description: '用商品图片查找相似货源', command: '1688cli products image "图片路径或 URL"', inputs: ['image'], optional: ['limit', 'sort'], output: 'JSON products[]', access: 'read' },
  { id: 'products.link', name: '链接找同款', description: '用商品链接寻找相似货源', command: '1688cli products link "商品链接"', inputs: ['url'], optional: ['image', 'limit', 'sort'], output: 'JSON products[]', access: 'read' },
  { id: 'suppliers.search', name: '找供应商', description: '按采购需求查找供应商和可核验的工厂线索', command: '1688cli suppliers search "关键词"', inputs: ['query'], optional: [], output: 'JSON suppliers[]', access: 'read' },
  { id: 'screen', name: '筛选候选货源', description: '对已保存的商品或供应商清单按价格、起订量、相关性、类别和商家筛选', command: '1688cli screen candidates.json --max-price 50', inputs: ['input'], optional: ['max-price', 'max-moq', 'min-sold', 'location', 'relevance', 'category', 'supplier', 'proofing'], output: 'JSON products[] or suppliers[]', access: 'local-read' }
]);
