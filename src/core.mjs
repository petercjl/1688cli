import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const META = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
export const AGENTS = ['codex', 'sealseek', 'workbuddy'];
export const stateRoot = (env = process.env) => path.resolve(env.ALI1688_STATE_DIR || path.join(os.homedir(), '.1688cli'));
export async function exists(p) { try { return await fs.lstat(p); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
export function requireValue(ok, code, message, details = {}) { if(!ok) throw new CliError(code,message,details); }
export const hash = value => createHash('sha256').update(value).digest('hex');
export const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export async function createJson(p, value) {
  requireValue(!await exists(p), 'TARGET_EXISTS', '目标文件已存在', {path:p});
  await fs.mkdir(path.dirname(p),{recursive:true});
  await fs.writeFile(p,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
