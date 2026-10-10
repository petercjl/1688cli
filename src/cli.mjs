import { META, AGENTS } from './core.mjs';
import { readFile, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { capabilities } from './capabilities.mjs';
import { CliError, failure } from './errors.mjs';
import { callOfficial, providerHealth } from './provider.mjs';
import { normalizeProducts, normalizeSuppliers, screenRows } from './normalize.mjs';
import { installSkill, skillSource, skillStatus, updateSkill } from './skill-manager.mjs';
import { packageUpdate } from './updater.mjs';
import { validateResearchResult } from './research-validator.mjs';
import { toCommerceViewModel } from './research-viewmodel.mjs';
import { collectResearch } from './research-collect.mjs';
import { buildResearch } from './research-build.mjs';
import { buildVisualBatches } from './visual-batches.mjs';
import { materializeVisualBatches } from './visual-materialize.mjs';
import { compileVisualTags } from './visual-tag-compile.mjs';

const usage = `1688cli — 1688 只读找货与供应商筛选

用法:
  1688cli products search <关键词> [--limit N] [--sort price_asc|price_desc|sold_desc|yx_desc]
  1688cli products image <图片路径或URL> [选项]
  1688cli products link <商品链接> [--image 图片URL] [选项]
  1688cli suppliers search <关键词>
  1688cli screen <结果JSON> [--max-price N] [--max-moq N] [--relevance relevant,possible] [--category ID] [--supplier 名称或会员ID]
  1688cli research validate <sourcing-result.json>
  1688cli research collect <search-manifest.json> --output <new-inventory.json>
  1688cli research build <inventory.json> --context <analysis.json> --output <new-sourcing-result.json>
  1688cli research visual-batches <inventory-or-result.json> --output <new-visual-batches.json>
  1688cli research visual-materialize <visual-batches.json> --output-dir <new-directory>
  1688cli research visual-compile <visual-batches.json> --tag-dir <标签目录> --output <new-catalog.json>
  1688cli research viewmodel <sourcing-result.json> --output <new-viewmodel.json>
  1688cli capabilities [--json]
  1688cli doctor --json
  1688cli update [--check|--apply]
  1688cli skill source|status|install|update [--agent codex|sealseek|workbuddy|all] [--mode link|copy] [--path DIR]

查询结果默认输出 JSON 到 stdout。--output <新文件> 可保存 JSON；已有文件拒绝覆盖。`;

const sortValues = new Set(['price_asc', 'price_desc', 'sold_desc', 'yx_desc']);
const scoreValues = new Set(['high', 'medium', 'low']);
const optionNames = new Set(['limit', 'sort', 'score-level', 'purchase-amount', 'tags', 'ic-tags', 'image', 'output', 'output-dir', 'tag-dir', 'context', 'max-price', 'max-moq', 'min-sold', 'location', 'relevance', 'category', 'supplier', 'agent', 'path', 'mode']);
const flags = new Set(['json', 'proofing', 'check', 'apply', 'help', 'version', 'force']);

export function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { positionals.push(item); continue; }
    const name = item.slice(2);
    if (flags.has(name)) { options[name] = true; continue; }
    if (!optionNames.has(name)) throw new CliError('INVALID_OPTION', `未知选项：${item}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new CliError('MISSING_OPTION_VALUE', `选项 ${item} 缺少值`);
    options[name] = argv[++i];
  }
  return { positionals, options };
}

function positiveInt(value, name, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new CliError('INVALID_INPUT', `${name} 必须是正整数`);
  return n;
}

function nonnegative(value, name) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new CliError('INVALID_INPUT', `${name} 必须是非负数字`);
  return n;
}

function required(value, label) {
  if (!value || value.startsWith('--')) throw new CliError('MISSING_INPUT', `缺少${label}`);
  return value;
}

function productOptions(options) {
  const args = ['--limit', String(positiveInt(options.limit, 'limit', 10))];
  if (options.sort) {
    if (!sortValues.has(options.sort)) throw new CliError('INVALID_INPUT', 'sort 值无效');
    args.push('--sort', options.sort);
  }
  if (options['score-level']) {
    if (!scoreValues.has(options['score-level'])) throw new CliError('INVALID_INPUT', 'score-level 值无效');
    args.push('--score-level', options['score-level']);
  }
  if (options['purchase-amount']) args.push('--purchase-amount', String(positiveInt(options['purchase-amount'], 'purchase-amount')));
  if (options.tags) args.push('--tags', options.tags);
  if (options['ic-tags']) args.push('--ic-tags', options['ic-tags']);
  return args;
}

async function runCommand(positionals, options) {
  const [group, action, input] = positionals;
  if (group === 'version' || options.version) return { version: META.version };
  if (!group || group === 'help' || options.help) return { help: usage };
  if (group === 'capabilities') return { ok: true, package: META.name, version: META.version, agents: AGENTS, operating_systems: ['darwin','win32'], capabilities, lifecycle: ['skill source','skill status','skill install','skill update','update check','update install'], dependencies: ['Python 3: requests, keyring, Pillow','official 1688-product-find','official 1688-source-suppliers','1688 AK','HTML only: compact-commerce-ui Skill and commerce-ui CLI'] };
  if (group === 'doctor') {
    const health = await providerHealth();
    return { report_ready: health.report.available, ok: health.product_skill.available && health.supplier_skill.available && health.ak.available && health.python.available, package: '@petercjl/1688cli', version: META.version, read_only: true, ...health, skill: await skillStatus() };
  }
  if (group === 'update') {
    if(action && !['check','install'].includes(action)) throw new CliError('UNKNOWN_COMMAND','update 支持 check、install');
    return packageUpdate(Boolean(options.apply || action==='install'));
  }
  if (group === 'skill') {
    if (action === 'source') return { ok: true, source: skillSource() };
    if (action === 'status') return { ok: true, ...(await skillStatus({agent:options.agent,path:options.path})) };
    if (!['install', 'update'].includes(action)) throw new CliError('UNKNOWN_COMMAND', 'skill 支持 source、status、install、update');
    const agents = options.agent === 'all' ? AGENTS : [options.agent || 'codex'];
    if(options.path && agents.length>1) throw new CliError('INVALID_INPUT','--path 须指定单个 Agent');
    const opts={path:options.path,mode:options.mode,force:options.force};
    const results = [];
    for (const agent of agents) results.push(action === 'install' ? await installSkill(agent,opts) : await updateSkill(agent,opts));
    return { ok: true, results };
  }
  if (group === 'products') {
    const config = { search: ['text_search', '--query', 'text'], image: ['image_search', '--image', 'image'], link: ['link_search', '--url', 'link'] }[action];
    if (!config) throw new CliError('UNKNOWN_COMMAND', 'products 支持 search、image、link');
    const query = required(input, action === 'search' ? '关键词' : '图片或链接');
    const args = [config[1], query, ...productOptions(options)];
    if (action === 'link' && options.image) args.push('--image', options.image);
    const payload = await callOfficial('product', config[0], args);
    const rows = normalizeProducts(payload, query, config[2]);
    return { ok: true, kind: 'products', query, count: rows.length, products: rows };
  }
  if (group === 'suppliers' && action === 'search') {
    const query = required(input, '供应商关键词');
    const payload = await callOfficial('supplier', 'ali_1688_source_suppliers', ['--query', query], { timeoutMs: 120_000 });
    const rows = normalizeSuppliers(payload, query);
    return { ok: true, kind: 'suppliers', query, count: rows.length, suppliers: rows };
  }
  if (group === 'screen') {
    const path = resolve(required(action, '结果 JSON 文件'));
    let data;
    try { data = JSON.parse(await readFile(path, 'utf8')); }
    catch { throw new CliError('INPUT_READ_FAILED', '无法读取输入 JSON 文件', { path }); }
    const kind = data.kind || (Array.isArray(data.products) ? 'products' : Array.isArray(data.suppliers) ? 'suppliers' : null);
    const rows = kind === 'products' ? data.products : kind === 'suppliers' ? data.suppliers : null;
    if (!Array.isArray(rows)) throw new CliError('INVALID_INPUT', '输入须包含 products 或 suppliers 数组');
    if (options.relevance && options.relevance.split(',').some(value => !['relevant', 'possible', 'irrelevant', 'unreviewed'].includes(value))) throw new CliError('INVALID_INPUT', 'relevance 值须为 relevant、possible、irrelevant、unreviewed 的逗号列表');
    const selected = screenRows(rows, {
      maxPrice: nonnegative(options['max-price'], 'max-price'),
      maxMoq: nonnegative(options['max-moq'], 'max-moq'),
      minSold: nonnegative(options['min-sold'], 'min-sold'),
      location: options.location,
      relevance: options.relevance,
      category: options.category,
      supplier: options.supplier,
      proofing: options.proofing
    });
    return { ok: true, kind, input_count: rows.length, count: selected.length, [kind]: selected };
  }
  if (group === 'research' && ['validate', 'viewmodel', 'collect', 'build', 'visual-batches', 'visual-materialize', 'visual-compile'].includes(action)) {
    const path = resolve(required(input, '找货结果 JSON 文件'));
    if (action === 'collect') return collectResearch(path);
    if (action === 'build') return buildResearch(path, resolve(required(options.context, '判断 JSON 文件')));
    if (action === 'visual-batches') return buildVisualBatches(path);
    if (action === 'visual-materialize') return materializeVisualBatches(path, resolve(required(options['output-dir'], '新输出目录')));
    if (action === 'visual-compile') return compileVisualTags(path, resolve(required(options['tag-dir'], '视觉标签目录')));
    let data;
    try { data = JSON.parse(await readFile(path, 'utf8')); }
    catch { throw new CliError('INPUT_READ_FAILED', '无法读取找货结果 JSON 文件', { path }); }
    return action === 'validate' ? { ...validateResearchResult(data), path } : toCommerceViewModel(data);
  }
  throw new CliError('UNKNOWN_COMMAND', '未知命令；运行 1688cli help 查看用法');
}

async function saveNew(path, content) {
  let handle;
  try {
    handle = await open(resolve(path), 'wx', 0o600);
    await handle.writeFile(content);
  } catch (error) {
    if (error.code === 'EEXIST') throw new CliError('OUTPUT_EXISTS', '输出文件已存在，拒绝覆盖', { path: resolve(path) });
    throw error;
  } finally { await handle?.close(); }
}

export async function main(argv, io = console) {
  try {
    const { positionals, options } = parseArgs(argv);
    const result = await runCommand(positionals, options);
    const output = result.help || JSON.stringify(result, null, 2);
    if (options.output) await saveNew(options.output, `${output}\n`);
    const researchSaved = options.output && positionals[0] === 'research' && ['viewmodel', 'collect', 'build', 'visual-batches', 'visual-compile'].includes(positionals[1]);
    const summary = researchSaved && positionals[1] === 'collect'
      ? { ok: true, path: resolve(options.output), searches: result.search_log.length, products: result.products.length, coverage: result.coverage }
      : researchSaved && positionals[1] === 'build' ? { ok: true, path: resolve(options.output), ...validateResearchResult(result) }
      : researchSaved && positionals[1] === 'visual-batches' ? { ok: true, path: resolve(options.output), batch_size: result.batch_size, batches: result.batches.length, coverage: result.coverage }
      : researchSaved && positionals[1] === 'visual-compile' ? { ok: true, path: resolve(options.output), clusters: result.clusters.length, coverage: result.coverage }
      : researchSaved ? { ok: true, path: resolve(options.output), contract: result.contract, views: result.views.length } : null;
    io.log(researchSaved ? JSON.stringify(summary, null, 2) : output);
    return result.ok === false ? 1 : 0;
  } catch (error) {
    io.error(JSON.stringify(failure(error)));
    if (io === console) process.exitCode = 1;
    return 1;
  }
}
