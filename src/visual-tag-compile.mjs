import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CliError } from './errors.mjs';

async function jsonFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await jsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(path);
  }
  return out.sort();
}

function expandFile(data, source) {
  if (data.batch_id && Array.isArray(data.items)) return data.items.map(item => ({ ...item, batch_id: data.batch_id, tag_source: source }));
  if (!Array.isArray(data.batches)) throw new CliError('INVALID_VISUAL_TAGS', '视觉标签文件缺少 batch_id/items 或 batches', { source });
  const out = [];
  for (const batch of data.batches) {
    if (Array.isArray(batch.items)) out.push(...batch.items.map(item => ({ ...item, batch_id: batch.batch_id, tag_source: source })));
    if (Array.isArray(batch.assignments)) {
      for (const [offerId, profileId] of batch.assignments) {
        const profile = data.profiles?.[profileId];
        if (!profile) throw new CliError('INVALID_VISUAL_TAGS', '紧凑标签引用了不存在的 profile', { source, profile_id: profileId });
        out.push({ offer_id: offerId, ...profile, batch_id: batch.batch_id, tag_source: source });
      }
    }
  }
  return out;
}

const clusterDefs = [
  ['image_unavailable', '图片不可用', ['无法读取主图'], /image_unavailable|图片不可用|unusable/],
  ['utensil_accessory', '锅具配件', ['非锅体配件'], /锅铲|工具|配件/],
  ['electric_cooker', '电煮锅', ['独立电热锅体'], /电煮锅|电锅/],
  ['double_sided_pan', '合页双面煎锅', ['上下双面合页锅体'], /双面|合页|铰链/],
  ['multi_cavity_pan', '多孔多格早餐锅', ['多个独立煎制凹槽'], /四孔|三孔|十四孔|多孔|多格|分区|早餐|煎蛋烤肠|圆格|梅花|花形/],
  ['grill_pan', '条纹煎烤盘', ['条纹或烤盘式锅面'], /条纹|煎烤|牛排|烤盘|烤碗/],
  ['crepe_pan', '超浅煎饼锅', ['极浅边或无边圆盘'], /薄饼|煎饼|超浅|无边|低沿|平煎盘/],
  ['mini_pan', '迷你小煎锅', ['明显小尺寸单人锅体'], /迷你|小号|小煎锅|锅杯/],
  ['cookware_set', '多件锅具套装', ['同图多件锅具组合'], /套装|锅具组|多尺寸/],
  ['steamer_or_pot', '蒸煮锅与奶锅', ['蒸层、汤锅或奶锅结构'], /蒸|奶锅|汤锅|锅具套装/],
  ['wok', '圆底炒锅', ['圆底或明确炒锅轮廓'], /炒锅|圆底|中式/],
  ['double_handle_pan', '双耳双柄煎锅', ['无单长柄的双侧握持结构'], /双耳|双柄/],
  ['lidded_deep_pan', '带盖深壁煎炒锅', ['深壁锅体并配锅盖'], /(?=.*盖)(?=.*(?:深|加深|高边|直壁|弧壁))/],
  ['deep_pan', '无盖深壁煎炒锅', ['深壁锅体且未显示锅盖'], /深|加深|高边|直壁|弧壁/],
  ['lidded_shallow_pan', '带盖浅煎锅', ['浅锅体并配锅盖'], /盖/],
  ['shallow_frying_pan', '浅口平底煎锅', ['常规浅口单柄煎锅'], /./]
];

function classify(item) {
  if (item.status === 'image_unavailable' || item.status === 'unusable') return clusterDefs[0];
  const text = [item.subject, item.primary_style, ...(item.visual_tags || [])].filter(Boolean).join('|');
  return clusterDefs.find(([, , , pattern]) => pattern.test(text)) || clusterDefs.at(-1);
}

export async function compileVisualTags(manifestPath, tagDir) {
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8')); }
  catch { throw new CliError('INPUT_READ_FAILED', '无法读取视觉批次清单', { path: resolve(manifestPath) }); }
  const expected = manifest.batches.flatMap(batch => batch.items.map(item => ({ ...item, batch_id: batch.batch_id })));
  const tagged = [];
  for (const file of await jsonFiles(resolve(tagDir))) tagged.push(...expandFile(JSON.parse(await readFile(file, 'utf8')), file));
  const byId = new Map();
  for (const item of tagged) {
    if (byId.has(String(item.offer_id))) throw new CliError('DUPLICATE_VISUAL_TAG', '同一 offer_id 出现多个视觉标签', { offer_id: String(item.offer_id) });
    byId.set(String(item.offer_id), item);
  }
  const missing = expected.filter(item => !byId.has(String(item.offer_id))).map(item => String(item.offer_id));
  const unexpected = [...byId.keys()].filter(id => !expected.some(item => String(item.offer_id) === id));
  if (missing.length || unexpected.length) throw new CliError('VISUAL_TAG_COVERAGE_MISMATCH', '视觉标签覆盖与批次清单不一致', { missing, unexpected });
  const clusters = new Map();
  const items = expected.map(source => {
    const tag = byId.get(String(source.offer_id));
    const [clusterId, name, cues] = classify(tag);
    const row = { ...tag, offer_id: String(source.offer_id), batch_id: source.batch_id, image_url: source.image_url, cluster_id: clusterId };
    if (!clusters.has(clusterId)) clusters.set(clusterId, { cluster_id: clusterId, name, distinguishing_cues: cues, member_offer_ids: [] });
    clusters.get(clusterId).member_offer_ids.push(row.offer_id);
    return row;
  });
  const clusterList = [...clusters.values()].map(cluster => ({ ...cluster, member_count: cluster.member_offer_ids.length, representative_offer_ids: cluster.member_offer_ids.slice(0, 5) })).sort((a, b) => b.member_count - a.member_count);
  return {
    schema: '1688cli.visual-tag-catalog',
    schema_version: '1.0.0',
    source_manifest: resolve(manifestPath),
    tag_directory: resolve(tagDir),
    batch_size: manifest.batch_size,
    clustering_basis: 'post_tag_visual_structure',
    coverage: { requested: expected.length, tagged: items.filter(item => item.status === 'tagged').length, image_unavailable: items.filter(item => item.status !== 'tagged').length, unique_offer_ids: new Set(items.map(item => item.offer_id)).size },
    clusters: clusterList,
    items
  };
}
