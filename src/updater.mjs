import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT,META,AGENTS,exists,requireValue,stateRoot,readJson } from './core.mjs';
import { execute,npmScript } from './runtime.mjs';
import { status, hashes } from './skill-manager.mjs';
export function newer(a,b) {
  if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b)) return false;
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i];
  return false;
}
export async function packageUpdate(apply=false, options={}) {
  const root=options.root||ROOT, current=options.current||META.version, run=options.run||execute;
  let latest;
  try {
    const response=await (options.fetch||fetch)(`https://registry.npmjs.org/${encodeURIComponent(META.name)}/latest`,{signal:AbortSignal.timeout(15000)});
    requireValue(response.ok,'UPDATE_CHECK_FAILED','npm 查询失败');
    const value=await response.json();
    requireValue(value.name===META.name && /^\d+\.\d+\.\d+$/.test(value.version),'INVALID_REGISTRY_METADATA','npm 返回版本无效'); latest=value.version;
  } catch(e) { throw Object.assign(new Error('无法查询 npm 正式版本；现有安装保持可用'),{code:e.code||'UPDATE_CHECK_FAILED'}); }
  const result={ok:true,package:META.name,installed_version:current,latest_version:latest,update_available:newer(latest,current),channel:'latest',applied:false};
  if(!apply||!result.update_available) return result;
  requireValue(!await exists(path.join(root,'.git')),'DEVELOPMENT_CHECKOUT','源码仓库通过 Git 更新；npm 更新仅面向全局安装');
  const npm=options.npmScript||await npmScript();
  const call=args=>run(process.execPath,[npm,...args],{encoding:'utf8',timeout:180000,windowsHide:true});
  const globalRoot=(await call(['root','--global'])).stdout.trim();
  const installed=path.join(globalRoot,...META.name.split('/'));
  requireValue(await fs.realpath(installed)===await fs.realpath(root),'UNSUPPORTED_INSTALLATION','仅支持 npm 全局安装更新');
  const selected=[];
  for(const agent of AGENTS) {
    const info=await (options.status||status)(agent);
    requireValue(!info.managed||!info.edited,'LOCAL_EDITS','先处理本地 Skill 修改后再更新',{agent});
    if(info.managed) selected.push(agent);
  }
  const backup=path.join(options.stateRoot||stateRoot(),'package-backups',randomUUID());
  requireValue(!await exists(backup),'TARGET_EXISTS','备份目标已存在');
  await fs.mkdir(path.dirname(backup),{recursive:true,mode:0o700});
  await fs.cp(root,backup,{recursive:true,dereference:true,errorOnExist:true,force:false});
  requireValue(JSON.stringify(await hashes(root))===JSON.stringify(await hashes(backup)),'BACKUP_VERIFICATION_FAILED','包备份校验失败',{backup});
  try {
    await call(['install','--global',`${META.name}@${latest}`,'--ignore-scripts','--no-audit','--no-fund']);
    const actual=await readJson(path.join(installed,'package.json'));
    requireValue(actual.name===META.name && actual.version===latest,'UPDATE_VERIFICATION_FAILED','安装版本与请求不一致');
    for(const agent of selected) await run(process.execPath,[path.join(installed,'scripts/1688cli.mjs'),'skill','update','--agent',agent,'--json'],{encoding:'utf8',timeout:30000,windowsHide:true});
  } catch(e) {
    throw Object.assign(new Error('更新未完成，备份已保留；检查 doctor 和 skill status 后恢复'),{code:'UPDATE_FAILED',details:{backup,cause:e.code}});
  }
  return {...result,applied:true,backup,skills_synchronized:selected};
}
