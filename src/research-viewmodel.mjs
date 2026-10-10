import { CliError } from './errors.mjs';
import { validateResearchResult } from './research-validator.mjs';

const httpsUrl = value => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);
const money = value => value === null ? '价格待核实' : `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

function productCard(product, extra = {}) {
  const visual = product.visual_profile;
  return {
    title: product.title,
    image_url: product.image_url,
    alt: product.title,
    price: money(product.price),
    badge: extra.badge || ({ relevant: '符合需求', possible: '待核验', irrelevant: '不符合', unreviewed: '未判断' }[product.relevance] || '平台标价'),
    tone: extra.tone || 'info',
    facts: [
      { label: '规格 / SKU', value: product.sku_title || '未返回' },
      { label: '起订量', value: product.moq === null ? '未返回' : String(product.moq) },
      { label: '商家', value: product.supplier_name || '未返回' },
      ...(product.supplier_member_id ? [{ label: '商家会员 ID', value: product.supplier_member_id }] : []),
      { label: '商品 ID', value: product.offer_id },
      ...(visual ? [{ label: '视觉标签', value: visual.visual_tags.length ? visual.visual_tags.join('、') : '待核验' },
        { label: '视觉置信度', value: visual.confidence },
        ...(product.title_conflict && product.title_conflict !== 'not_checked' ? [{ label: '图文冲突', value: product.title_conflict }] : [])] : []),
      { label: '搜索来源', value: product.source_search_ids.join('、') }
    ],
    evidence: [visual?.visual_evidence?.length ? `图片依据：${visual.visual_evidence.join('；')}` : '', product.assessment, extra.evidence].filter(Boolean).join(' '),
    url: product.url,
    action_label: '打开 1688 商品',
    copy_value: product.url,
    copy_label: '复制链接'
  };
}

function validateWebCards(data) {
  const issues = [];
  for (const [i, product] of data.products.entries()) {
    if (!httpsUrl(product.url)) issues.push({ path: `products[${i}].url`, message: 'HTML 商品卡须有 HTTPS 商品链接' });
    if (!httpsUrl(product.image_url)) issues.push({ path: `products[${i}].image_url`, message: 'HTML 商品卡须有 HTTPS 网络图片地址' });
  }
  if (issues.length) throw new CliError('OUTPUT_CONTRACT_FAILED', 'HTML 商品卡缺少可用的链接或网络图片', { issues });
}

function overview(data, groupSummaries) {
  const kind = data.mode === 'explore' ? '款式分类' : '逐图找款';
  const fullInventory = ['2.0.0', '2.1.0'].includes(data.schema_version);
  const relevant = fullInventory ? data.products.filter(row => row.relevance === 'relevant').length : null;
  const possible = fullInventory ? data.products.filter(row => row.relevance === 'possible').length : null;
  return {
    id: 'overview', label: '总览', title: `${data.request.original_text || '1688 找货'} · ${kind}`,
    subtitle: '以下为本次搜索样本与候选清单，商品主图直接读取 1688 返回的 HTTPS 地址。',
    blocks: [
      { type: 'conclusion', title: '本次结论', items: [
        { label: '搜索范围', tone: 'info', segments: [{ text: `${data.search_log.length} 轮搜索、${data.products.length} 个唯一商品${fullInventory ? `；符合 ${relevant}、待核验 ${possible}` : ''}`, emphasis: 'strong' }], note: '唯一商品按 offer_id 计数；类别视图可重复引用，不代表全平台供给。' },
        { label: '决策边界', tone: 'warning', segments: [{ text: '图片与规格供初筛，材质、同款和成交条件仍需核验', emphasis: 'strong-italic', tone: 'warning' }] }
      ] },
      { type: 'metrics', columns: 3, items: [
        { label: '搜索轮次', value: String(data.search_log.length) },
        { label: '清单商品', value: String(data.products.length) },
        { label: kind, value: String(groupSummaries.length) }
      ] },
      { type: 'list', title: kind, items: groupSummaries.map(row => `${row.label} · ${row.count} 个商品`) },
      ...(fullInventory ? [{ type: 'list', title: '覆盖限制', items: data.coverage.limitations.length ? data.coverage.limitations : ['本轮搜索范围以查询日志为准。'] }] : []),
      { type: 'alert', title: '停止原因', text: data.stop_reason, tone: data.status === 'complete' ? 'info' : 'warning' }
    ]
  };
}

function methods(data) {
  return {
    id: 'evidence', label: '来源与待核验', title: '搜索轨迹与人工交接',
    subtitle: '平台返回信息仅供找货初筛；询盘、议价和确认由人完成。',
    blocks: [
      { type: 'table', title: '搜索轨迹', columns: ['ID', '方式', '输入', '返回数', '状态'], rows: data.search_log.map(row => [row.search_id, row.method, row.method === 'image' ? (row.reference_id || '图片') : (row.input || row.reference_id || ''), String(row.result_count), row.status]) },
      { type: 'list', title: '人工询价问题', ordered: true, items: data.human_handoff.questions },
      { type: 'list', title: '待核验事项', items: data.human_handoff.unverified }
    ]
  };
}

function comparison(data) {
  const rows = data.products.filter(product => ['relevant', 'possible'].includes(product.relevance));
  return {
    id: 'comparison', label: '价格与商家', title: '价格与商家初筛',
    subtitle: '每个商品 ID 一行；平台价格仅对应所示 SKU，阶梯价、税票和运费需人工询问。',
    blocks: [{ type: 'table', title: '相关及可能相关商品',
      columns: ['商品 ID', '商品', '类别', 'SKU', '标价', '起订量', '商家', '会员 ID', '相关性', '链接'],
      rows: rows.map(product => [product.offer_id, product.title, product.category_ids.join('、'), product.sku_title || '未返回',
        money(product.price), product.moq === null ? '未返回' : String(product.moq), product.supplier_name || '未返回',
        product.supplier_member_id || '未返回', product.relevance === 'relevant' ? '相关' : '待核验', product.url]) }]
  };
}

function exploreViews(data, productsById) {
  if (['2.0.0', '2.1.0'].includes(data.schema_version)) {
    const views = [];
    const summaries = [];
    for (const [index, cluster] of data.mode_data.clusters.entries()) {
      const members = data.products.filter(product => product.category_ids.includes(cluster.cluster_id) && product.relevance !== 'irrelevant');
      summaries.push({ label: cluster.name, count: members.length });
      views.push({ id: `category_${index + 1}`, label: cluster.name, title: cluster.name,
        subtitle: (cluster.visual_signature || cluster.distinguishing_cues).join('；') || '按本轮样本归类',
        blocks: [{ type: 'products', columns: 3, items: members.map(product => productCard(product)) },
          { type: 'list', title: '下一轮可试的搜索方向', items: cluster.next_search_options }] });
    }
    if (data.schema_version === '2.1.0') {
      const pending = data.products.filter(product => product.visual_profile?.status !== 'classified');
      if (pending.length) {
        summaries.push({ label: '视觉待核验', count: pending.length });
        views.push({ id: 'visual_review', label: '视觉待核验', title: '视觉待核验',
          subtitle: '主图不可用、主体不清或一图多款的商品不强行归类。',
          blocks: [{ type: 'products', columns: 3, items: pending.map(product => productCard(product)) }] });
      }
    }
    views.push({ id: 'all_candidates', label: '全部唯一链接', title: '全部唯一链接',
      subtitle: '按商品 ID 去重；可使用页面搜索定位商品、商家或规格。分类页允许重复引用同一商品。',
      blocks: [{ type: 'products', columns: 3, items: data.products.map(product => productCard(product)) }] });
    return { views, summaries };
  }
  const assigned = new Set();
  const views = [];
  const summaries = [];
  for (const [index, cluster] of data.mode_data.clusters.entries()) {
    const ids = cluster.representative_offer_ids;
    for (const id of ids) {
      if (assigned.has(id)) throw new CliError('OUTPUT_CONTRACT_FAILED', '商品被放入多个主要款式类别', { issues: [{ path: `mode_data.clusters[${index}].representative_offer_ids`, message: `重复商品 ID: ${id}` }] });
      assigned.add(id);
    }
    const cards = ids.map(id => productCard(productsById.get(id)));
    summaries.push({ label: cluster.name, count: cards.length });
    views.push({
      id: `category_${index + 1}`, label: cluster.name, title: cluster.name,
      subtitle: cluster.distinguishing_cues.join('；') || '按本轮样本归类',
      blocks: [
        { type: 'products', columns: 3, items: cards },
        { type: 'list', title: '下一轮可试的搜索方向', items: cluster.next_search_options }
      ]
    });
  }
  const remaining = data.products.filter(product => !assigned.has(product.offer_id));
  if (remaining.length) {
    summaries.push({ label: '待分类候选', count: remaining.length });
    views.push({ id: 'other_candidates', label: '待分类候选', title: '待分类候选', subtitle: '这些商品已在清单中，但尚未分配到主要款式类别。', blocks: [{ type: 'products', columns: 3, items: remaining.map(product => productCard(product)) }] });
  }
  return { views, summaries };
}

const matchLabels = { likely_same: '疑似同款', similar_alternative: '相近替代', mismatch: '差异明显', uncertain: '待判断' };
function preciseViews(data, productsById) {
  const shown = new Set();
  const views = [];
  const summaries = [];
  for (const [index, reference] of data.mode_data.references.entries()) {
    const matches = data.mode_data.matches.filter(row => row.reference_id === reference.reference_id);
    const cards = matches.map(match => {
      shown.add(match.offer_id);
      const evidence = [
        match.visible_evidence.length ? `可见依据：${match.visible_evidence.join('；')}` : '',
        match.differences.length ? `差异：${match.differences.join('；')}` : '',
        match.unknowns.length ? `未知：${match.unknowns.join('；')}` : ''
      ].filter(Boolean).join('。');
      return productCard(productsById.get(match.offer_id), { badge: matchLabels[match.match_level], tone: match.match_level === 'likely_same' ? 'positive' : 'warning', evidence });
    });
    summaries.push({ label: `参考图 ${reference.reference_id}`, count: cards.length });
    views.push({ id: `reference_${index + 1}`, label: `参考图 ${reference.reference_id}`, title: `参考图 ${reference.reference_id} 的候选`, subtitle: reference.relation_to_other_images || '逐图保留匹配关系', blocks: [{ type: 'products', columns: 3, items: cards }] });
  }
  const remaining = data.products.filter(product => !shown.has(product.offer_id));
  if (remaining.length) {
    summaries.push({ label: '未完成逐图比对', count: remaining.length });
    views.push({ id: 'unmatched', label: '未完成逐图比对', title: '未完成逐图比对', subtitle: '这些商品在清单中，但尚无参考图匹配记录。', blocks: [{ type: 'products', columns: 3, items: remaining.map(product => productCard(product)) }] });
  }
  return { views, summaries };
}

export function toCommerceViewModel(data) {
  validateResearchResult(data);
  validateWebCards(data);
  const productsById = new Map(data.products.map(product => [product.offer_id, product]));
  const grouped = data.mode === 'explore' ? exploreViews(data, productsById) : preciseViews(data, productsById);
  if (['2.0.0', '2.1.0'].includes(data.schema_version) && data.mode === 'precise') grouped.views.push({
    id: 'all_candidates', label: '全部唯一链接', title: '全部唯一链接',
    subtitle: '按商品 ID 去重；逐图页面可以重复引用同一商品。',
    blocks: [{ type: 'products', columns: 3, items: data.products.map(product => productCard(product)) }]
  });
  return {
    contract: 'compact-workbench@1.0',
    meta: {
      title: `${data.request.original_text || '1688 找货'} · 1688 找货报告`,
      subtitle: data.mode === 'explore' ? '款式探索与商品分类' : '参考图逐图匹配',
      footer: '平台标价与商家声明须核验；图片通过网络链接展示。',
      external_images: 'allow_https'
    },
    shell: {
      brand_mark: '1688', brand_title: '1688 找货', brand_subtitle: data.mode === 'explore' ? '款式探索' : '参考图找款',
      nav_label: '商品分类', status: [data.status === 'complete' ? '本轮搜索完成' : '本轮搜索未完成', `${data.products.length} 个清单商品`], search: true
    },
    views: [overview(data, grouped.summaries), ...grouped.views, ...(['2.0.0', '2.1.0'].includes(data.schema_version) ? [comparison(data)] : []), methods(data)]
  };
}
