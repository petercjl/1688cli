import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packageUpdate,newer} from '../src/updater.mjs';
const response=version=>async()=>({ok:true,json:async()=>({name:'@petercjl/1688cli',version})});
test('updates compare semver numerically and never downgrade',async()=>{
  assert.equal(newer('0.10.0','0.9.0'),true);assert.equal(newer('0.2.0','0.3.0'),false);assert.equal(newer('1.0.0-beta','0.3.0'),false);
  assert.equal((await packageUpdate(true,{current:'0.3.0',fetch:response('0.2.0')})).applied,false);
});
test('offline registry produces structured failure without install',async()=>{
  await assert.rejects(packageUpdate(true,{fetch:async()=>{throw new Error('offline');}}),{code:'UPDATE_CHECK_FAILED'});
});
test('development checkout is protected',async()=>{
  await assert.rejects(packageUpdate(true,{current:'0.3.0',fetch:response('0.4.0')}),{code:'DEVELOPMENT_CHECKOUT'});
});

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
async function fakeGlobal(t) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'1688-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const global=path.join(dir,'modules'),root=path.join(global,'@petercjl/1688cli');await fs.mkdir(root,{recursive:true});
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@petercjl/1688cli',version:'0.3.0'}));
 return {root,current:'0.3.0',stateRoot:path.join(dir,'state'),npmScript:'npm-cli.js',global,fetch:response('0.4.0'),status:async agent=>({managed:agent==='workbuddy',edited:false})};
}
test('package update verifies exact version, backs up and synchronizes only managed agents',async t=>{
 const o=await fakeGlobal(t), synced=[];
 o.run=async(_node,args)=>{
  if(args[1]==='root')return {stdout:o.global};
  if(args[1]==='install'){await fs.writeFile(path.join(o.root,'package.json'),JSON.stringify({name:'@petercjl/1688cli',version:'0.4.0'}));return {stdout:''};}
  synced.push(args[4]);return {stdout:'{}'};
 };
 const r=await packageUpdate(true,o);assert.equal(r.applied,true);assert.deepEqual(synced,['workbuddy']);
 assert.equal(JSON.parse(await fs.readFile(path.join(r.backup,'package.json'),'utf8')).version,'0.3.0');
});
test('package installation failure preserves verified backup',async t=>{
 const o=await fakeGlobal(t);o.run=async(_node,args)=>{if(args[1]==='root')return {stdout:o.global};throw new Error('offline');};
 let error;try{await packageUpdate(true,o);}catch(e){error=e;}
 assert.equal(error.code,'UPDATE_FAILED');assert.equal(JSON.parse(await fs.readFile(path.join(error.details.backup,'package.json'),'utf8')).version,'0.3.0');
});
