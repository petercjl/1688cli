import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { discoverPython, reportHealth } from './runtime.mjs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { CliError } from './errors.mjs';

const execFileAsync = promisify(execFile);
const home = homedir();

export function providerPaths(env = process.env) {
  const roots=[env.ALI1688_PROVIDER_ROOT, join(home,'.1688cli/providers'), join(home,'.openclaw/workspace/skills'), join(home,'.sealseek/skills'),join(home,'.workbuddy/skills'),join(home,'.agents/skills'),join(env.CODEX_HOME||join(home,'.codex'),'skills')].filter(Boolean);
  const locate=(name,override)=>override?resolve(override):roots.map(root=>join(root,name)).find(p=>existsSync(join(p,'cli.py')))||join(roots[0],name);
  return {
    product: locate('1688-product-find',env.ALI1688_PRODUCT_SKILL_DIR),
    supplier: locate('1688-source-suppliers',env.ALI1688_SUPPLIER_SKILL_DIR),
    akStore: resolve(env.ALI1688_AK_STORE || join(home, 'workspace/.1688-AK/.ak_store.json'))
  };
}

export async function akAvailable(env = process.env) {
  if (env.ALI_1688_AK) return { available: true, verified: false, source: 'environment' };
  try {
    const store = JSON.parse(await readFile(providerPaths(env).akStore, 'utf8'));
    return { available: Boolean(store.ak), verified: false, source: 'local-official-store' };
  } catch { return { available: false, verified: false, source: 'none' }; }
}

async function childEnvironment(env) {
  if (env.ALI_1688_AK) return env;
  try {
    const store = JSON.parse(await readFile(providerPaths(env).akStore, 'utf8'));
    if (store.ak) return { ...env, ALI_1688_AK: store.ak };
  } catch { /* Official CLI will report missing AK. */ }
  return env;
}

export async function providerHealth(env = process.env) {
  const paths = providerPaths(env);
  const present = async path => { try { await access(path, constants.R_OK); return true; } catch { return false; } };
  return {
    product_skill: { available: await present(join(paths.product, 'cli.py')), version: await skillVersion(paths.product) },
    supplier_skill: { available: await present(join(paths.supplier, 'cli.py')), version: await skillVersion(paths.supplier) },
    ak: await akAvailable(env),
    python: await discoverPython({env}),
    report: await reportHealth(env)
  };
}

async function skillVersion(dir) {
  try { const meta = JSON.parse(await readFile(join(dir, '_meta.json'), 'utf8')); return meta.version || meta.installedVersion || null; }
  catch { return null; }
}

export async function callOfficial(kind, command, args, options = {}) {
  const env = options.env || process.env;
  const paths = providerPaths(env);
  const script = join(kind === 'supplier' ? paths.supplier : paths.product, 'cli.py');
  try { await access(script, constants.R_OK); }
  catch { throw new CliError('PROVIDER_MISSING', `缺少官方 ${kind === 'supplier' ? '找供应商' : '找商品'} Skill，请先安装到其标准目录`, { kind }); }

  const python=await discoverPython({env});
  if(!python.available) throw new CliError('PYTHON_DEPENDENCY_MISSING','缺少可用 Python 3 或 requests、keyring、Pillow，请运行 doctor --json');
  let stdout;
  try {
    ({ stdout } = await execFileAsync(python.command, [...python.args, script, command, ...args], {
      env: await childEnvironment(env), timeout: options.timeoutMs || 90_000, maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8'
    }));
  } catch (error) {
    if (error.killed || error.signal) throw new CliError('PROVIDER_TIMEOUT', '官方 Skill 调用超时，请稍后重试');
    if (error.code === 'ENOENT') throw new CliError('PYTHON_MISSING', '找不到 Python 运行时，请安装 Python 3 或设置 ALI1688_PYTHON');
    stdout = error.stdout;
    if (!stdout) throw new CliError('PROVIDER_FAILED', '官方 Skill 运行失败，请运行 doctor 检查依赖');
  }

  let payload;
  try { payload = JSON.parse(stdout.trim()); }
  catch { throw new CliError('PROVIDER_INVALID_JSON', '官方 Skill 未返回有效 JSON'); }
  if (!payload.success) {
    const message = String(payload.markdown || '官方 Skill 查询失败').slice(0, 600);
    const code = payload.error_code || (message.includes('403') ? 'ACCESS_DENIED' : message.includes('AK') ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR');
    throw new CliError(code, message, code === 'ACCESS_DENIED' ? { hint: '检查 AK 是否过期、官方 Skill 权限和访问频率；doctor 仅检查 AK 已配置，不验证其有效性' } : {});
  }
  return payload;
}
