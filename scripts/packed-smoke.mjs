import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ROOT,META} from '../src/core.mjs';
import {npmScript} from '../src/runtime.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'1688-package-'));
try {
 const npm=await npmScript();
 const run=(args,cwd=ROOT)=>execFileSync(process.execPath,[npm,...args],{cwd,encoding:'utf8',timeout:120000});
 const packed=JSON.parse(run(['pack','--json','--pack-destination',temp]));
 const names=packed[0].files.map(f=>f.path);
 assert(names.includes('skill/SKILL.md'));assert(names.includes('skill/adapters/workbuddy.json'));
 assert(!names.some(n=>/^(test|outputs|\.git|node_modules)\//.test(n)));
 run(['install','--prefix',path.join(temp,'install'),path.join(temp,packed[0].filename),'--ignore-scripts','--no-audit','--no-fund'],temp);
 const root=path.join(temp,'install/node_modules',...META.name.split('/'));
 const cli=path.join(root,'scripts/1688cli.mjs');
 const call=args=>JSON.parse(execFileSync(process.execPath,[cli,...args],{encoding:'utf8'}));
 assert.equal(call(['version']).version,META.version);
 assert.equal(call(['skill','source']).source,await fs.realpath(path.join(root,'skill')));
 for(const agent of ['codex','sealseek','workbuddy']){
  const target=path.join(temp,agent,'1688cli');
  assert.equal(call(['skill','install','--agent',agent,'--path',target,'--mode','copy']).results[0].current,true);
  assert.equal(call(['skill','status','--agent',agent,'--path',target]).agents[agent].current,true);
  assert.equal(call(['skill','update','--agent',agent,'--path',target,'--mode','copy']).results[0].state,'current');
 }
 const data=call(['screen',path.join(ROOT,'test/fixtures/products.json'),'--max-price','20','--max-moq','10']);
 assert.deepEqual(data.products.map(x=>x.offer_id),['1']);
 console.log(JSON.stringify({ok:true,version:META.version,packed_files:names.length,agents:['codex','sealseek','workbuddy'],business_smoke:'screen',platform:process.platform}));
} finally {await fs.rm(temp,{recursive:true,force:true});}
