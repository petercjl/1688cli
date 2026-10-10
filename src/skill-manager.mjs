import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ROOT, META, AGENTS, exists, hash, readJson, createJson, requireValue, stateRoot } from './core.mjs';
const MARKER = '.1688cli-managed.json';
const UI = 'agents/openai.yaml';
export const skillSource = () => path.join(ROOT, 'skill');
export async function destination(agent, options={}) {
  requireValue(AGENTS.includes(agent),'INVALID_AGENT','支持的 Agent：codex、sealseek、workbuddy');
  if(options.path) return path.resolve(options.path);
  const env=options.env||process.env, home=options.home||os.homedir();
  const configured=env[`ALI1688_${agent.toUpperCase()}_SKILLS_DIR`];
  if(configured) return path.resolve(configured,'1688cli');
  if(agent==='codex') return path.join(env.CODEX_HOME||path.join(home,'.codex'),'skills','1688cli');
  // Preserve existing legacy installations; new SealSeek installs use its own home.
  if(agent==='sealseek' && await exists(path.join(home,'.agents/skills/1688cli'))) return path.join(home,'.agents/skills/1688cli');
  return path.join(home,`.${agent}`,'skills','1688cli');
}
export async function hashes(dir) {
  const result={};
  async function walk(rel='') {
    for(const e of (await fs.readdir(path.join(dir,rel),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(!rel && e.name===MARKER) continue;
      const name=rel?`${rel}/${e.name}`:e.name;
      requireValue(!e.isSymbolicLink(),'UNSAFE_SKILL_CONTENT','Skill 内部不允许符号链接',{file:name});
      if(e.isDirectory()) await walk(name); else if(e.isFile()) result[name]=hash(await fs.readFile(path.join(dir,name)));
      else requireValue(false,'UNSAFE_SKILL_CONTENT','Skill 包含非普通文件');
    }
  }
  await walk(); return result;
}
const same = (a,b) => Object.keys(a).length===Object.keys(b).length && Object.entries(a).every(([k,v])=>b[k]===v);
export async function status(agent, options={}) {
  const target=await destination(agent,options), stat=await exists(target), source=options.source||skillSource();
  const base={agent,path:target,installed:!!stat,managed:false,current:false,edited:false};
  if(!stat) return {...base,state:'missing'};
  if(stat.isSymbolicLink()) {
    const real=await fs.realpath(target).catch(()=>null);
    const canonical=await fs.realpath(source);
    const owner=real && path.basename(real)==='skill' ? await readJson(path.join(real,'../package.json')).catch(()=>null):null;
    const managed=real===canonical || owner?.name===META.name;
    return {...base,managed,current:real===canonical,mode:'link',state:real===canonical?'managed':managed?'managed-old':'occupied',linked_to_source:real===canonical};
  }
  const marker=stat.isDirectory()?await readJson(path.join(target,MARKER)).catch(()=>null):null;
  if(marker?.owner!==META.name || !marker.hashes || marker.agent!==agent) return {...base,state:'occupied'};
  const actual=await hashes(target), sourceHashes=await hashes(source);
  const edited=Object.entries(marker.hashes).some(([k,v])=>k!==UI && actual[k]!==v) || Object.keys(actual).some(k=>!(k in marker.hashes) && k!==UI);
  const current=!edited && marker.version===(options.version||META.version) && Object.keys(actual).length===Object.keys(sourceHashes).length && Object.entries(sourceHashes).every(([k,v])=>k===UI || actual[k]===v);
  return {...base,managed:true,current,edited,mode:'copy',version:marker.version,state:edited?'edited':current?'managed':'managed-old',digest:hash(JSON.stringify(actual))};
}
export async function skillStatus(options={}) {
  const selected=options.agent && options.agent!=='all'?[options.agent]:AGENTS;
  const agents={}; for(const agent of selected) agents[agent]=await status(agent,options);
  return {source:options.source||skillSource(),agents};
}
export async function installSkill(agent, options={}) {
  const info=await status(agent,options), target=info.path, source=options.source||skillSource();
  requireValue(!info.installed||info.managed,'TARGET_OCCUPIED','目标已有用户内容，请选择其他 --path',{path:target});
  requireValue(!info.edited||options.force,'LOCAL_EDITS','受管理 Skill 存在本地修改；核对后可用 --force 备份并更新',{path:target});
  const mode=options.mode||((options.platform||process.platform)==='win32'?'copy':'link');
  requireValue(['copy','link'].includes(mode),'INVALID_INPUT','mode 须为 copy 或 link');
  if(info.current && info.mode===mode) return {...info,state:'current'};
  const rename=options.rename||fs.rename;
  await fs.mkdir(path.dirname(target),{recursive:true});
  const stage=`${target}.staging-${randomUUID()}`;
  requireValue(!await exists(stage),'TARGET_EXISTS','暂存目录已存在');
  let backup=null, retired=null, syncMode='rename';
  if(info.installed) {
    backup=path.join(options.stateRoot||stateRoot(),'skill-backups',`${agent}-${randomUUID()}`);
    requireValue(!await exists(backup),'TARGET_EXISTS','备份目录已存在');
    await fs.mkdir(path.dirname(backup),{recursive:true,mode:0o700});
    await fs.cp(target,backup,{recursive:true,dereference:true,errorOnExist:true,force:false});
    requireValue(same(await hashes(target),await hashes(backup)),'BACKUP_VERIFICATION_FAILED','备份哈希校验失败',{backup});
  }
  // Customized metadata needs a managed copy so the canonical source stays immutable.
  const actualMode=mode==='link' && info.mode==='copy' ? 'copy':mode;
  if(actualMode==='link') await fs.symlink(source,stage,process.platform==='win32'?'junction':'dir');
  else {
    await fs.cp(source,stage,{recursive:true,errorOnExist:true,force:false});
    if(backup && await exists(path.join(backup,UI))) {
      const marker=await readJson(path.join(backup,MARKER)).catch(()=>null);
      if(marker && hash(await fs.readFile(path.join(backup,UI)))!==marker.hashes[UI]) {
        await fs.mkdir(path.join(stage,'agents'),{recursive:true});
        await fs.copyFile(path.join(backup,UI),path.join(stage,UI));
      }
    }
    await createJson(path.join(stage,MARKER),{owner:META.name,agent,version:options.version||META.version,hashes:await hashes(stage)});
  }
  const expected=await hashes(stage);
  try {
    if(info.installed) {
      const candidate=`${target}.retired-${randomUUID()}`;
      await rename(target,candidate); retired=candidate;
    }
    await rename(stage,target);
  } catch(e) {
    if(retired && !await exists(target)) { await fs.rename(retired,target); retired=null; }
    if(['EPERM','EBUSY','EACCES'].includes(e.code) && backup && info.mode==='copy' && actualMode==='copy') {
      syncMode='in-place';
      try {
        for(const name of Object.keys(expected)) {
          const dst=path.join(target,name); await fs.mkdir(path.dirname(dst),{recursive:true});
          await (options.copyFile||fs.copyFile)(path.join(stage,name),dst);
        }
        for(const name of Object.keys(await hashes(target))) if(!(name in expected)) await fs.unlink(path.join(target,name));
        await fs.copyFile(path.join(stage,MARKER),path.join(target,MARKER));
      } catch(err) {
        throw Object.assign(new Error('更新中断，完整备份可用于恢复'),{code:'SKILL_SYNC_FAILED',details:{backup,path:target,cause:err.code}});
      }
    } else {
      throw Object.assign(new Error('Skill 替换失败，原安装或备份已保留'),{code:'SKILL_UPDATE_FAILED',details:{backup,path:target,cause:e.code}});
    }
  }
  requireValue(same(await hashes(target),expected),'INSTALL_VERIFICATION_FAILED','安装哈希不一致',{backup,path:target});
  if(await exists(stage)) await fs.rm(stage,{recursive:true,force:true});
  if(retired) await fs.rm(retired,{recursive:true,force:true});
  return {...await status(agent,options),state:info.installed?'updated':'installed',backup,sync_mode:syncMode};
}
export const updateSkill=installSkill;
