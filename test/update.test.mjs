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
