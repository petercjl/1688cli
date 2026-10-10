import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { CliError } from './errors.mjs';

const execFileAsync = promisify(execFile);
const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');

export async function packageUpdate(apply = false, options = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const npm = options.npm || 'npm';
  let latest;
  try {
    const response = await execFileAsync(npm, ['view', manifest.name, 'version', '--json'], { timeout: 20_000, encoding: 'utf8' });
    latest = JSON.parse(response.stdout.trim());
  } catch {
    throw new CliError('UPDATE_CHECK_FAILED', '无法查询 npm 最新版本；包可能尚未发布或网络不可用');
  }
  const status = { package: manifest.name, installed_version: manifest.version, latest_version: latest, update_available: manifest.version !== latest };
  if (!apply || !status.update_available) return { ok: true, applied: false, ...status };
  try {
    await execFileAsync(npm, ['install', '--global', `${manifest.name}@latest`], { timeout: 180_000, encoding: 'utf8' });
    await execFileAsync('1688cli', ['skill', 'update', '--agent', 'all'], { timeout: 30_000, encoding: 'utf8' });
  } catch {
    throw new CliError('UPDATE_FAILED', 'npm 包或 Agent Skill 更新未完成；请运行 1688cli doctor --json 与 skill status 检查状态');
  }
  return { ok: true, applied: true, ...status };
}
