import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../storage-durability.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
const D=ctx.LEVEL_UP_STORAGE_DURABILITY;
assert.ok(D);

const absent=await D.getPersistenceStatus(undefined);
assert.equal(absent.state,'UNKNOWN_OR_UNSUPPORTED');
assert.equal(absent.supported,false);
assert.equal(absent.canRequest,false);

const checkOnly=await D.getPersistenceStatus({persisted:async()=>false});
assert.equal(checkOnly.state,'BEST_EFFORT');
assert.equal(checkOnly.supported,true);
assert.equal(checkOnly.canRequest,false);

const already=await D.getPersistenceStatus({persisted:async()=>true,persist:async()=>true});
assert.equal(already.state,'PERSISTENT');
assert.equal(already.canRequest,true);

const denied=await D.requestPersistentStorage({persisted:async()=>false,persist:async()=>false});
assert.equal(denied.state,'BEST_EFFORT');
assert.equal(denied.requested,true);
assert.equal(denied.granted,false);

const granted=await D.requestPersistentStorage({persisted:async()=>false,persist:async()=>true});
assert.equal(granted.state,'PERSISTENT');
assert.equal(granted.granted,true);

const unsupportedRequest=await D.requestPersistentStorage({persisted:async()=>false});
assert.equal(unsupportedRequest.state,'UNKNOWN_OR_UNSUPPORTED');
assert.equal(unsupportedRequest.requested,false);

const failedCheck=await D.getPersistenceStatus({persisted:async()=>{throw new Error('blocked')}});
assert.equal(failedCheck.state,'UNKNOWN_OR_UNSUPPORTED');
assert.match(failedCheck.error,/blocked/);

assert.equal(D.isStandaloneEnvironment({navigator:{standalone:true}}),true);
assert.equal(D.isStandaloneEnvironment({navigator:{},matchMedia:()=>({matches:true})}),true);
assert.equal(D.isStandaloneEnvironment({navigator:{},matchMedia:()=>({matches:false})}),false);

console.log('PASS Patch K storage durability fakes');
