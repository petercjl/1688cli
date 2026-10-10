import { lstat, mkdir, readFile, readlink, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../skill');
const targets = {
  codex: join(homedir(), '.codex/skills/1688cli'),
  sealseek: join(homedir(), '.agents/skills/1688cli')
};

export function skillSource() { return source; }

export async function skillStatus() {
  const results = {};
  for (const [agent, path] of Object.entries(targets)) {
    try {
      const stat = await lstat(path);
      const linkedTo = stat.isSymbolicLink() ? resolve(dirname(path), await readlink(path)) : null;
      const current = linkedTo === source;
      const previous = linkedTo && !current ? await isPreviousPackageSkill(linkedTo) : false;
      results[agent] = { path, state: current ? 'managed' : previous ? 'managed-old' : 'occupied', linked_to_source: current };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      results[agent] = { path, state: 'missing', linked_to_source: false };
    }
  }
  return { source, agents: results };
}

async function isPreviousPackageSkill(path) {
  if (path.split('/').at(-1) !== 'skill') return false;
  try {
    const manifest = JSON.parse(await readFile(join(path, '../package.json'), 'utf8'));
    return manifest.name === '@petercjl/1688cli';
  } catch { return false; }
}

export async function installSkill(agent) {
  if (!targets[agent]) throw new CliError('INVALID_AGENT', '支持的 Agent：codex、sealseek');
  const status = (await skillStatus()).agents[agent];
  if (status.state === 'occupied') throw new CliError('TARGET_OCCUPIED', '目标 Skill 路径已有用户内容，拒绝覆盖', { path: status.path });
  if (status.state === 'managed') return { agent, path: status.path, state: 'current' };
  if (status.state === 'managed-old') throw new CliError('SKILL_UPDATE_REQUIRED', '受管理 Skill 指向旧包，请运行 skill update', { path: status.path });
  await mkdir(dirname(status.path), { recursive: true });
  await symlink(source, status.path, 'dir');
  return { agent, path: status.path, state: 'installed' };
}

export async function updateSkill(agent) {
  if (!targets[agent]) throw new CliError('INVALID_AGENT', '支持的 Agent：codex、sealseek');
  const status = (await skillStatus()).agents[agent];
  if (status.state === 'occupied') throw new CliError('TARGET_OCCUPIED', '目标 Skill 路径已有用户内容，拒绝覆盖', { path: status.path });
  if (status.state === 'managed' || status.state === 'managed-old') {
    await unlink(status.path);
    await symlink(source, status.path, 'dir');
    return { agent, path: status.path, state: 'updated' };
  }
  return installSkill(agent);
}
