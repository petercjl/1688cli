import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverPython,pythonCandidates} from '../src/runtime.mjs';
import {providerPaths,akAvailable} from '../src/provider.mjs';
test('Agent-managed runtime discovered without override',async()=>{
  const r=await discoverPython({env:{},home:'/isolated',run:async(command)=>{
    if(!command.includes('.workbuddy'))throw new Error('absent');return {stdout:JSON.stringify({major:3,version:'3.13.0',missing:[]})};
  }});assert.equal(r.available,true);assert.equal(r.source,'agent-managed');assert.match(r.command,/workbuddy/);
});
test('runtime missing imports and absent runtimes fail honestly',async()=>{
  const r=await discoverPython({env:{ALI1688_PYTHON:'configured'},run:async()=>({stdout:JSON.stringify({major:3,missing:['requests']})})});
  assert.equal(r.available,false);assert.deepEqual(r.attempts[0].missing,['requests']);
  const missing=await discoverPython({env:{},run:async()=>{throw new Error('ENOENT');}});assert.equal(missing.available,false);
});
test('explicit runtime never silently replaced; Windows launcher uses separate args',async()=>{
  assert.equal(pythonCandidates({env:{ALI1688_PYTHON:'chosen'}}).length,1);
  assert.deepEqual(pythonCandidates({env:{},platform:'win32'}).at(-1).args,['-3']);
});
test('provider overrides and credential health do not disclose secret values',async()=>{
  assert.match(providerPaths({ALI1688_PRODUCT_SKILL_DIR:'/configured/provider'}).product,/configured/);
  const r=await akAvailable({ALI_1688_AK:'test-only-secret'});assert.equal(r.available,true);assert.equal(JSON.stringify(r).includes('test-only-secret'),false);
});
