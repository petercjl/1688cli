import { CliError } from './errors.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const list = value => Array.isArray(value);
const numberOrNull = value => value === null || (typeof value === 'number' && Number.isFinite(value));

export function validateResearchResult(data) {
  const issues = [];
  const check = (condition, path, message) => { if (!condition) issues.push({ path, message }); };
  check(object(data), '$', '结果必须是 JSON 对象');
  if (!object(data)) throw new CliError('OUTPUT_CONTRACT_FAILED', '找货结果不符合输出契约', { issues });

  check(data.schema === '1688-sourcing-result', 'schema', '须为 1688-sourcing-result');
  check(['1.0.0', '2.0.0', '2.1.0'].includes(data.schema_version), 'schema_version', '须为 1.0.0、2.0.0 或 2.1.0');
  const fullInventory = ['2.0.0', '2.1.0'].includes(data.schema_version);
  const visualInventory = data.schema_version === '2.1.0';
  check(['explore', 'precise'].includes(data.mode), 'mode', '须为 explore 或 precise');
  check(['complete', 'partial', 'needs_input'].includes(data.status), 'status', '状态值无效');
  check(object(data.request), 'request', '缺少需求对象');
  check(list(data.search_log), 'search_log', '须为查询记录数组');
  check(list(data.products), 'products', '须为商品数组');
  check(object(data.mode_data), 'mode_data', '须为模式结果对象');
  check(object(data.human_handoff), 'human_handoff', '缺少人工交接对象');
  check(text(data.stop_reason), 'stop_reason', '须说明停止或暂停原因');

  const request = data.request || {};
  check(typeof request.original_text === 'string', 'request.original_text', '须保留原始文字，可为空串');
  check(list(request.reference_images), 'request.reference_images', '须为参考图数组');
  check(list(request.hard_constraints), 'request.hard_constraints', '须为数组');
  check(list(request.preferences), 'request.preferences', '须为数组');
  if (data.mode === 'explore') check(list(request.reference_images) && request.reference_images.length === 0, 'request.reference_images', '探索模式须无用户参考图');
  if (data.mode === 'precise') check(list(request.reference_images) && request.reference_images.length > 0, 'request.reference_images', '精确模式须有用户参考图');
  const inputRefIds = new Set();
  for (const [i, row] of (list(request.reference_images) ? request.reference_images : []).entries()) {
    const at = `request.reference_images[${i}]`;
    if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
    check(text(row.reference_id), `${at}.reference_id`, '缺少参考图 ID');
    if (text(row.reference_id)) {
      check(!inputRefIds.has(row.reference_id), `${at}.reference_id`, '参考图 ID 重复');
      inputRefIds.add(row.reference_id);
    }
    check(text(row.source), `${at}.source`, '缺少参考图来源');
  }

  const searchIds = new Set();
  const successfulSearchIds = new Set();
  const returnedOfferIds = new Set();
  let returnedRows = 0;
  const imageSearchesByRef = new Map();
  for (const [i, row] of (list(data.search_log) ? data.search_log : []).entries()) {
    const at = `search_log[${i}]`;
    if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
    check(text(row.search_id), `${at}.search_id`, '缺少搜索 ID');
    if (text(row.search_id)) {
      check(!searchIds.has(row.search_id), `${at}.search_id`, '搜索 ID 重复');
      searchIds.add(row.search_id);
    }
    check(['text', 'image', 'link', 'supplier'].includes(row.method), `${at}.method`, '搜索方法无效');
    check(text(row.input) || text(row.reference_id), `${at}.input`, '须有查询输入或参考图 ID');
    check(text(row.reason), `${at}.reason`, '须记录搜索理由');
    check(['success', 'failed', 'blocked'].includes(row.status), `${at}.status`, '查询状态无效');
    check(Number.isSafeInteger(row.result_count) && row.result_count >= 0, `${at}.result_count`, '须为非负整数');
    check(row.raw_path === null || text(row.raw_path), `${at}.raw_path`, '须为原始 JSON 路径或 null');
    if (fullInventory && row.status === 'success' && row.method !== 'supplier') {
      check(list(row.offer_ids), `${at}.offer_ids`, '成功的商品查询须列出本轮全部商品 ID');
      if (list(row.offer_ids)) {
        check(new Set(row.offer_ids).size === row.offer_ids.length, `${at}.offer_ids`, '本轮商品 ID 须去重');
        check(row.offer_ids.length <= row.result_count, `${at}.offer_ids`, '唯一商品数不能超过返回行数');
        for (const id of row.offer_ids) { check(text(id), `${at}.offer_ids`, '商品 ID 不能为空'); if (text(id)) returnedOfferIds.add(id); }
      }
      if (Number.isSafeInteger(row.result_count)) returnedRows += row.result_count;
    }
    if (row.status === 'success' && text(row.search_id)) successfulSearchIds.add(row.search_id);
    if (row.method === 'image') {
      check(text(row.reference_id), `${at}.reference_id`, '以图搜图须标明参考图 ID');
      if (text(row.reference_id)) {
        check(inputRefIds.has(row.reference_id) || data.mode === 'explore', `${at}.reference_id`, '引用了不存在的用户参考图');
        const searches = imageSearchesByRef.get(row.reference_id) || [];
        searches.push(row);
        imageSearchesByRef.set(row.reference_id, searches);
      }
    }
  }
  if (data.mode === 'explore' && data.status === 'complete') {
    check(list(data.search_log) && data.search_log.some(row => object(row) && row.method === 'text' && row.status === 'success'), 'search_log', '已完成的探索结果须有成功的关键词首搜');
  }

  const offerIds = new Set();
  const relevanceCounts = { relevant: 0, possible: 0, irrelevant: 0, unreviewed: 0 };
  for (const [i, row] of (list(data.products) ? data.products : []).entries()) {
    const at = `products[${i}]`;
    if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
    check(text(row.offer_id), `${at}.offer_id`, '缺少商品 ID');
    if (text(row.offer_id)) {
      check(!offerIds.has(row.offer_id), `${at}.offer_id`, '商品 ID 重复，须合并来源');
      offerIds.add(row.offer_id);
    }
    for (const key of ['title', 'url', 'image_url', 'sku_title', 'supplier_name', 'assessment']) check(typeof row[key] === 'string', `${at}.${key}`, '须为字符串，未知可为空串');
    for (const key of ['price', 'moq']) check(numberOrNull(row[key]), `${at}.${key}`, '须为数字或 null');
    check(list(row.source_search_ids) && row.source_search_ids.length > 0, `${at}.source_search_ids`, '须保留至少一个召回来源');
    for (const id of (list(row.source_search_ids) ? row.source_search_ids : [])) check(successfulSearchIds.has(id), `${at}.source_search_ids`, `搜索 ID 不存在或未成功: ${id}`);
    if (fullInventory) {
      check(Object.hasOwn(relevanceCounts, row.relevance), `${at}.relevance`, '相关性状态无效');
      if (Object.hasOwn(relevanceCounts, row.relevance)) relevanceCounts[row.relevance]++;
      check(list(row.category_ids), `${at}.category_ids`, '须为类别 ID 数组');
      check(list(row.observations) && row.observations.length > 0, `${at}.observations`, '须保留规格价格观察');
      if (row.relevance !== 'unreviewed') check(text(row.assessment), `${at}.assessment`, '已判断商品须说明依据');
      for (const sourceId of (list(row.source_search_ids) ? row.source_search_ids : [])) {
        const source = (list(data.search_log) ? data.search_log : []).find(search => search.search_id === sourceId);
        check(list(source?.offer_ids) && source.offer_ids.includes(row.offer_id), `${at}.source_search_ids`, `来源 ${sourceId} 未返回该商品 ID`);
      }
      for (const [j, observation] of (list(row.observations) ? row.observations : []).entries()) {
        check(object(observation) && row.source_search_ids?.includes(observation.search_id), `${at}.observations[${j}]`, '规格价格观察须指向该商品的搜索来源');
      }
      if (visualInventory && data.mode === 'explore') {
        const profile = row.visual_profile;
        check(object(profile), `${at}.visual_profile`, '视觉分类结果须包含 visual_profile');
        if (object(profile)) {
          check(profile.basis === 'primary_image', `${at}.visual_profile.basis`, '视觉打标依据须为 primary_image');
          check(['classified', 'needs_review', 'unusable'].includes(profile.status), `${at}.visual_profile.status`, '视觉分析状态无效');
          check(typeof profile.subject === 'string', `${at}.visual_profile.subject`, '主体描述须为字符串');
          for (const key of ['visual_tags', 'visual_evidence']) check(list(profile[key]), `${at}.visual_profile.${key}`, '须为数组');
          check(['high', 'medium', 'low', 'unavailable'].includes(profile.confidence), `${at}.visual_profile.confidence`, '视觉置信度无效');
          if (profile.status === 'classified') {
            check(text(row.primary_style_class_id), `${at}.primary_style_class_id`, '已分类商品须有唯一主要款式类别');
            check(list(profile.visual_tags) && profile.visual_tags.length > 0, `${at}.visual_profile.visual_tags`, '已分类商品须有视觉标签');
            check(list(profile.visual_evidence) && profile.visual_evidence.length > 0, `${at}.visual_profile.visual_evidence`, '已分类商品须有可见依据');
            check(profile.confidence !== 'unavailable', `${at}.visual_profile.confidence`, '已分类商品不能使用 unavailable');
          } else {
            check(row.primary_style_class_id === null, `${at}.primary_style_class_id`, '待核验或不可用图片不得强制归入款式类别');
          }
        }
        check(['none', 'possible', 'clear', 'not_checked'].includes(row.title_conflict), `${at}.title_conflict`, '标题冲突状态无效');
        check(typeof row.title_note === 'string', `${at}.title_note`, '标题复核说明须为字符串');
      }
    }
  }
  if (fullInventory) {
    for (const id of returnedOfferIds) check(offerIds.has(id), 'products', `查询返回的商品 ${id} 未进入完整商品库`);
    for (const id of offerIds) check(returnedOfferIds.has(id), 'products', `商品 ${id} 未出现在查询返回 ID 中`);
    if (data.status === 'complete') check(relevanceCounts.unreviewed === 0, 'products', '完成状态下不得有未判断商品');
    check(object(data.coverage), 'coverage', '须记录覆盖范围');
    if (object(data.coverage)) {
      check(data.coverage.returned_rows === returnedRows, 'coverage.returned_rows', '返回行数与搜索日志不一致');
      check(data.coverage.unique_offers === offerIds.size, 'coverage.unique_offers', '唯一商品数与商品库不一致');
      check(typeof data.coverage.backend_exhaustive === 'boolean', 'coverage.backend_exhaustive', '须明确底层是否已证实完整遍历');
      check(list(data.coverage.limitations), 'coverage.limitations', '须记录覆盖限制');
    }
  }

  const mode = data.mode_data || {};
  if (data.mode === 'explore') {
    check(list(mode.clusters), 'mode_data.clusters', '探索结果须包含款式类别数组');
    check(list(mode.priority_cluster_ids), 'mode_data.priority_cluster_ids', '探索结果须包含优先方向 ID 数组');
    const clusterIds = new Set();
    for (const [i, row] of (list(mode.clusters) ? mode.clusters : []).entries()) {
      const at = `mode_data.clusters[${i}]`;
      if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
      check(text(row.cluster_id), `${at}.cluster_id`, '缺少类别 ID');
      if (text(row.cluster_id)) { check(!clusterIds.has(row.cluster_id), `${at}.cluster_id`, '类别 ID 重复'); clusterIds.add(row.cluster_id); }
      check(text(row.name), `${at}.name`, '缺少类别名称');
      for (const key of ['distinguishing_cues', 'representative_offer_ids', 'search_terms_seen', 'next_search_options']) check(list(row[key]), `${at}.${key}`, '须为数组');
      for (const id of (list(row.representative_offer_ids) ? row.representative_offer_ids : [])) check(offerIds.has(id), `${at}.representative_offer_ids`, `不存在的商品 ID: ${id}`);
      if (visualInventory) {
        check(list(row.visual_signature) && row.visual_signature.length > 0, `${at}.visual_signature`, '视觉类别须包含可见特征签名');
        check(list(row.member_offer_ids), `${at}.member_offer_ids`, '视觉类别须列出全部成员商品 ID');
        for (const id of (list(row.member_offer_ids) ? row.member_offer_ids : [])) check(offerIds.has(id), `${at}.member_offer_ids`, `不存在的商品 ID: ${id}`);
      }
    }
    for (const id of (list(mode.priority_cluster_ids) ? mode.priority_cluster_ids : [])) check(clusterIds.has(id), 'mode_data.priority_cluster_ids', `不存在的类别 ID: ${id}`);
    if (fullInventory) for (const [i, row] of (list(data.products) ? data.products : []).entries()) {
      if (!object(row) || !list(row.category_ids)) continue;
      check(new Set(row.category_ids).size === row.category_ids.length, `products[${i}].category_ids`, '同一商品不可重复归入同一类别');
      for (const id of row.category_ids) check(clusterIds.has(id), `products[${i}].category_ids`, `不存在的类别 ID: ${id}`);
    }
    if (visualInventory) {
      check(mode.visual_batch_size === 10, 'mode_data.visual_batch_size', '每批视觉分析必须固定为 10 张以内');
      check(mode.visual_analysis_complete === true || data.status !== 'complete', 'mode_data.visual_analysis_complete', '完成状态须确认逐图视觉分析已完成');
      check(mode.clustering_basis === 'visual_tags_after_image_analysis', 'mode_data.clustering_basis', '聚类必须在逐图打标完成后基于视觉标签进行');
      check(list(mode.visual_batches), 'mode_data.visual_batches', '须保留视觉分析批次');
      const batchOfferIds = new Set();
      for (const [i, batch] of (list(mode.visual_batches) ? mode.visual_batches : []).entries()) {
        const at = `mode_data.visual_batches[${i}]`;
        check(object(batch), at, '视觉批次须为对象');
        if (!object(batch)) continue;
        check(text(batch.batch_id), `${at}.batch_id`, '视觉批次缺少 ID');
        check(list(batch.offer_ids) && batch.offer_ids.length > 0 && batch.offer_ids.length <= 10, `${at}.offer_ids`, '每个视觉批次须包含 1-10 个商品');
        for (const id of (list(batch.offer_ids) ? batch.offer_ids : [])) {
          check(offerIds.has(id), `${at}.offer_ids`, `不存在的商品 ID: ${id}`);
          check(!batchOfferIds.has(id), `${at}.offer_ids`, `商品重复出现在视觉批次中: ${id}`);
          batchOfferIds.add(id);
        }
      }
      if (data.status === 'complete') for (const product of (list(data.products) ? data.products : [])) {
        check(batchOfferIds.has(product.offer_id) || product.visual_profile?.status === 'unusable', 'mode_data.visual_batches', `商品 ${product.offer_id} 未进入视觉批次且未标记图片不可用`);
      }
      const clusteredIds = new Set();
      for (const [i, cluster] of (list(mode.clusters) ? mode.clusters : []).entries()) for (const id of (list(cluster.member_offer_ids) ? cluster.member_offer_ids : [])) {
        check(!clusteredIds.has(id), `mode_data.clusters[${i}].member_offer_ids`, `商品只能属于一个主要视觉款式类别: ${id}`);
        clusteredIds.add(id);
      }
      for (const [i, product] of (list(data.products) ? data.products : []).entries()) {
        if (!object(product)) continue;
        if (product.visual_profile?.status === 'classified') {
          check(clusterIds.has(product.primary_style_class_id), `products[${i}].primary_style_class_id`, '主要视觉款式类别不存在');
          check(product.category_ids.length === 1 && product.category_ids[0] === product.primary_style_class_id, `products[${i}].category_ids`, '视觉分类只保留一个主要款式类别');
          check(clusteredIds.has(product.offer_id), `products[${i}].primary_style_class_id`, '已分类商品未进入对应视觉聚类');
          const cluster = (list(mode.clusters) ? mode.clusters : []).find(item => item.cluster_id === product.primary_style_class_id);
          check(cluster?.member_offer_ids?.includes(product.offer_id), `products[${i}].primary_style_class_id`, '商品主要类别与聚类成员不一致');
        } else check(product.category_ids.length === 0, `products[${i}].category_ids`, '待核验或图片不可用商品不得进入款式类别');
      }
    }
  }
  if (data.mode === 'precise') {
    check(list(mode.references), 'mode_data.references', '精确结果须包含逐图参考数组');
    check(list(mode.matches), 'mode_data.matches', '精确结果须包含逐图匹配数组');
    const refIds = new Set();
    for (const [i, row] of (list(mode.references) ? mode.references : []).entries()) {
      const at = `mode_data.references[${i}]`;
      if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
      check(text(row.reference_id), `${at}.reference_id`, '缺少参考图 ID');
      if (text(row.reference_id)) { check(!refIds.has(row.reference_id), `${at}.reference_id`, '参考图 ID 重复'); refIds.add(row.reference_id); }
      check(text(row.source), `${at}.source`, '缺少参考图来源');
      check(typeof row.relation_to_other_images === 'string', `${at}.relation_to_other_images`, '须为字符串，可为空串');
    }
    check(refIds.size === inputRefIds.size && [...inputRefIds].every(id => refIds.has(id)), 'mode_data.references', '参考图 ID 须与输入逐一一致');
    for (const id of inputRefIds) {
      const searches = imageSearchesByRef.get(id) || [];
      if (data.status === 'complete') check(searches.some(row => row.status === 'success'), 'search_log', `参考图 ${id} 缺少成功的以图搜图记录`);
      else if (data.status === 'partial') check(searches.length > 0, 'search_log', `参考图 ${id} 缺少以图搜图尝试记录`);
    }
    for (const [i, row] of (list(mode.matches) ? mode.matches : []).entries()) {
      const at = `mode_data.matches[${i}]`;
      if (!object(row)) { issues.push({ path: at, message: '须为对象' }); continue; }
      check(refIds.has(row.reference_id), `${at}.reference_id`, '引用了不存在的参考图');
      check(offerIds.has(row.offer_id), `${at}.offer_id`, '引用了不存在的商品');
      check(['likely_same', 'similar_alternative', 'mismatch', 'uncertain'].includes(row.match_level), `${at}.match_level`, '匹配级别无效');
      for (const key of ['visible_evidence', 'differences', 'unknowns']) check(list(row[key]), `${at}.${key}`, '须为数组');
    }
  }

  const handoff = data.human_handoff || {};
  check(list(handoff.questions), 'human_handoff.questions', '须为人工询价问题数组');
  check(list(handoff.unverified), 'human_handoff.unverified', '须为待核验事项数组');

  if (issues.length) throw new CliError('OUTPUT_CONTRACT_FAILED', '找货结果不符合输出契约', { issues });
  return { ok: true, mode: data.mode, status: data.status, searches: searchIds.size, products: offerIds.size, ...(fullInventory ? { relevance: relevanceCounts } : {}) };
}
