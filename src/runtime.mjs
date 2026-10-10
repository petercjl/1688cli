import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const execute=promisify(execFile);
export function pythonCandidates({env=process.env,home=os.homedir(),platform=process.platform}={}) {
  if(env.ALI1688_PYTHON) return [{command:env.ALI1688_PYTHON,args:[],source:'configured'}];
  const candidates=[];
  for(const root of [env.SEALSEEK_HOME||path.join(home,'.sealseek'),env.WORKBUDDY_HOME||path.join(home,'.workbuddy'),env.CODEX_HOME||path.join(home,'.codex')]) {
    candidates.push({command:path.join(root,'binaries/python/envs/default',platform==='win32'?'Scripts/python.exe':'bin/python3'),args:[],source:'agent-managed'});
    if(platform==='win32') candidates.push({command:path.join(root,'binaries/python/envs/default/python.exe'),args:[],source:'agent-managed'});
  }
  if(env.VIRTUAL_ENV) candidates.push({command:path.join(env.VIRTUAL_ENV,platform==='win32'?'Scripts/python.exe':'bin/python3'),args:[],source:'venv'});
  candidates.push({command:'python3',args:[],source:'path'},{command:'python',args:[],source:'path'});
  if(platform==='win32') candidates.push({command:'py',args:['-3'],source:'launcher'});
  return candidates;
}
export async function discoverPython(options={}) {
  const run=options.run||execute, attempts=[];
  const imports=options.imports||['requests','keyring','PIL'];
  const code=`import sys,json,importlib.util; print(json.dumps({'version':sys.version.split()[0], 'major':sys.version_info.major, 'missing':[x for x in ${JSON.stringify(imports)} if importlib.util.find_spec(x) is None]}))`;
  for(const c of pythonCandidates(options)) {
    try {
      const {stdout}=await run(c.command,[...c.args,'-c',code],{env:options.env||process.env,encoding:'utf8',timeout:10000,windowsHide:true});
      const data=JSON.parse(stdout.trim());
      if(data.major===3 && !data.missing.length) return {available:true,...c,version:data.version,missing:[]};
      attempts.push({...c,missing:data.missing||[],reason:'IMPORTS_MISSING'});
    } catch { attempts.push({...c,reason:'UNAVAILABLE'}); }
  }
  return {available:false,attempts};
}
// Invoke npm through its JS entry: avoids Windows .cmd quoting and shell interpolation.
export async function npmScript(env=process.env) {
  const candidates=[env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')];
  for(const p of (env.PATH||'').split(path.delimiter)) candidates.push(path.join(p,process.platform==='win32'?'npm.cmd':'npm'));
  for(const p of candidates.filter(Boolean)) {
    try {
      const real=await fs.realpath(p);
      const script=real.endsWith('npm-cli.js')?real:path.join(path.dirname(real),'node_modules/npm/bin/npm-cli.js');
      await fs.access(script); return script;
    } catch {}
  }
  throw Object.assign(new Error('找不到 npm CLI，请安装带 npm 的 Node.js'),{code:'NPM_MISSING'});
}

export async function nodeCli(name, packageName, relativeEntry, env=process.env) {
  for(const dir of (env.PATH||'').split(path.delimiter)) {
    try {
      const real=await fs.realpath(path.join(dir,name));
      if(/\.(mjs|cjs|js)$/.test(real)) return real;
    } catch {}
  }
  try {
    const npm=await npmScript(env);
    const {stdout}=await execute(process.execPath,[npm,'root','--global'],{encoding:'utf8',timeout:10000,windowsHide:true});
    const entry=path.join(stdout.trim(),...packageName.split('/'),relativeEntry);await fs.access(entry);return entry;
  } catch {return null;}
}
export async function reportHealth(env=process.env) {
  const entry=await nodeCli('commerce-ui','@petercjl/commerce-ui','bin/commerce-ui.mjs',env);
  if(!entry) return {available:false,required_for:'html',code:'RENDERER_MISSING'};
  try {
    const run=async args=>JSON.parse((await execute(process.execPath,[entry,...args],{env,encoding:'utf8',timeout:15000,windowsHide:true})).stdout);
    const version=await run(['version','--json']);
    const schema=await run(['schema','--template','compact-workbench']);
    const source=await run(['skill','source','--json']);
    const base=source.source||source.path;
    if(!base)throw new Error('No canonical Skill');
    const text=await fs.readFile(path.join(base,'SKILL.md'),'utf8');
    if(!/^name: compact-commerce-ui$/m.test(text)||schema.ok===false)throw new Error('Contract unavailable');
    return {available:true,required_for:'html',version:version.version||null,skill_source:base,contract:'compact-workbench@1.0'};
  } catch {return {available:false,required_for:'html',code:'RENDERER_CONTRACT_UNAVAILABLE'};}
}
