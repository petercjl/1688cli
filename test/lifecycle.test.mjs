import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {installSkill,status,hashes,destination} from '../src/skill-manager.mjs';
import {AGENTS} from '../src/core.mjs';
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'1688-安装-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await fs.mkdir(path.join(source,'agents'),{recursive:true});
  await fs.writeFile(path.join(source,'SKILL.md'),'中文找货\n');await fs.writeFile(path.join(source,'agents/openai.yaml'),'interface: {}\n');
  return {root,source,path:path.join(root,'target'),stateRoot:path.join(root,'state'),mode:'copy'};
}
for(const agent of AGENTS) test(`${agent}: fresh/repeat install, UTF-8 hashes, update and backup`,async t=>{
  const o=await fixture(t); const a=await installSkill(agent,o);assert.equal(a.state,'installed');assert.equal(a.current,true);
  assert.deepEqual(await hashes(o.source),await hashes(o.path));assert.equal((await installSkill(agent,o)).state,'current');
  await fs.writeFile(path.join(o.source,'SKILL.md'),'新版中文\n');const b=await installSkill(agent,o);assert.equal(b.current,true);assert.ok(b.backup);
  assert.equal(await fs.readFile(path.join(b.backup,'SKILL.md'),'utf8'),'中文找货\n');
});
test('unknown and unmanaged targets refused without mutation',async t=>{
  const o=await fixture(t);await fs.mkdir(o.path);await fs.writeFile(path.join(o.path,'mine.txt'),'mine');
  await assert.rejects(installSkill('other',o),{code:'INVALID_AGENT'});await assert.rejects(installSkill('codex',o),{code:'TARGET_OCCUPIED'});
  assert.equal(await fs.readFile(path.join(o.path,'mine.txt'),'utf8'),'mine');
});
test('local edits refused, force preserves complete backup and customized UI',async t=>{
  const o=await fixture(t);await installSkill('workbuddy',o);
  await fs.writeFile(path.join(o.path,'SKILL.md'),'my edits');await fs.writeFile(path.join(o.path,'agents/openai.yaml'),'interface: custom');
  assert.equal((await status('workbuddy',o)).edited,true);await assert.rejects(installSkill('workbuddy',o),{code:'LOCAL_EDITS'});
  const r=await installSkill('workbuddy',{...o,force:true});assert.equal(await fs.readFile(path.join(r.backup,'SKILL.md'),'utf8'),'my edits');
  assert.equal(await fs.readFile(path.join(o.path,'agents/openai.yaml'),'utf8'),'interface: custom');assert.equal(r.current,true);
});
test('locked directory uses verified in-place update and preserves UI',async t=>{
  const o=await fixture(t);await installSkill('sealseek',o);await fs.writeFile(path.join(o.path,'agents/openai.yaml'),'custom');
  await fs.writeFile(path.join(o.source,'SKILL.md'),'新');
  const r=await installSkill('sealseek',{...o,rename:async()=>{throw Object.assign(new Error('locked'),{code:'EPERM'});}});
  assert.equal(r.sync_mode,'in-place');assert.equal(r.current,true);assert.ok(r.backup);assert.equal(await fs.readFile(path.join(o.path,'agents/openai.yaml'),'utf8'),'custom');
});
test('interrupted in-place sync reports recoverable backup',async t=>{
  const o=await fixture(t);await installSkill('codex',o);await fs.writeFile(path.join(o.source,'SKILL.md'),'new');
  let error;try {await installSkill('codex',{...o,rename:async()=>{throw Object.assign(new Error('locked'),{code:'EBUSY'});},copyFile:async()=>{throw Object.assign(new Error('disk'),{code:'ENOSPC'});}});}catch(e){error=e;}
  assert.equal(error.code,'SKILL_SYNC_FAILED');assert.equal(await fs.readFile(path.join(error.details.backup,'SKILL.md'),'utf8'),'中文找货\n');
});
test('failed stage rename restores original target',async t=>{
  const o=await fixture(t);await installSkill('codex',o);await fs.writeFile(path.join(o.source,'SKILL.md'),'new');
  let n=0;await assert.rejects(installSkill('codex',{...o,rename:async(a,b)=>{if(++n===2)throw Object.assign(new Error('disk'),{code:'ENOSPC'});return fs.rename(a,b);}}),{code:'SKILL_UPDATE_FAILED'});
  assert.equal(await fs.readFile(path.join(o.path,'SKILL.md'),'utf8'),'中文找货\n');
});
test('Windows defaults to copy; legacy SealSeek target preserved',async t=>{
  const o=await fixture(t);delete o.mode;const r=await installSkill('codex',{...o,platform:'win32'});assert.equal(r.mode,'copy');
  const legacy=path.join(o.root,'.agents/skills/1688cli');await fs.mkdir(legacy,{recursive:true});
  assert.equal(await destination('sealseek',{home:o.root,env:{}}),legacy);
});
test('link installation and copy migration preserve original source',async t=>{
  const o=await fixture(t);const r=await installSkill('codex',{...o,mode:'link'});assert.equal(r.mode,'link');
  const next=await installSkill('codex',o);assert.equal(next.mode,'copy');assert.ok(next.backup);
  assert.equal(await fs.readFile(path.join(o.source,'SKILL.md'),'utf8'),'中文找货\n');
});
