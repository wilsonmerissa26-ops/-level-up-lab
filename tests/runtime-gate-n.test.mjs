import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(new URL('runtime-gate.js',root),'utf8'),{filename:'runtime-gate.js'});
const GATE=globalThis.LEVEL_UP_RUNTIME_GATE;
assert.ok(GATE,'runtime gate module loads');

assert.deepEqual(GATE.evaluate({buildEnabled:false,standalone:true,persistenceState:'PERSISTENT'}),{allowed:false,reason:'BUILD_LOCKED'});
assert.deepEqual(GATE.evaluate({buildEnabled:true,standalone:false,persistenceState:'PERSISTENT'}),{allowed:false,reason:'HOME_SCREEN_REQUIRED'});
assert.deepEqual(GATE.evaluate({buildEnabled:true,standalone:true,persistenceState:'BEST_EFFORT'}),{allowed:false,reason:'PERSISTENT_STORAGE_REQUIRED'});
assert.deepEqual(GATE.evaluate({buildEnabled:true,standalone:true,persistenceState:'UNKNOWN_OR_UNSUPPORTED'}),{allowed:false,reason:'PERSISTENT_STORAGE_REQUIRED'});
assert.deepEqual(GATE.evaluate({buildEnabled:true,standalone:true,persistenceState:'PERSISTENT'}),{allowed:true,reason:'ALLOWED'});
assert.match(GATE.message({reason:'HOME_SCREEN_REQUIRED'}),/Home Screen/);
assert.match(GATE.message({reason:'PERSISTENT_STORAGE_REQUIRED'}),/persistent/i);

const index=fs.readFileSync(new URL('index.html',root),'utf8');
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const auditPage=fs.readFileSync(new URL('audit-browser.html',root),'utf8');
assert.match(index,/runtime-gate\.js/,'runtime gate loads before app');
assert.ok(index.indexOf('runtime-gate.js')<index.indexOf('app.js'),'runtime gate loads before app.js');
assert.match(app,/const RUNTIME_ENABLED = true;/,'pilot build flag is enabled after the signed-off iPad gates');
assert.match(app,/RUNTIME_GATE\.evaluate/,'app delegates runtime decision to deterministic gate');
assert.match(app,/function studentRuntimeAllowed\(\)/);
assert.match(app,/function blockStudentRuntime\(\)/);
assert.doesNotMatch(app,/if\(!RUNTIME_ENABLED\)\{alert\(/,'student entry points no longer bypass environment gate');
assert.match(app,/__audit:\{RUNTIME_ENABLED,[^}]*studentRuntimeAllowed/,'runtime gate remains inspectable in audit surface');
assert.match(auditPage,/Open Michael Level-Up Lab/,'installed audit app can enter the live pilot without leaving its storage container');

console.log('Patch N audited iPad pilot runtime gate: PASS');
