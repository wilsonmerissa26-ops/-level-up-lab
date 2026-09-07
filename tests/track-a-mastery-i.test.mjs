import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const diagnostic=fs.readFileSync(new URL('../track-a-diagnostic.js',import.meta.url),'utf8');
const mastery=fs.readFileSync(new URL('../track-a-mastery.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(diagnostic,context);vm.runInContext(mastery,context);
const D=context.window.LEVEL_UP_TRACK_A_DIAGNOSTIC;const M=context.window.LEVEL_UP_TRACK_A_MASTERY;
function pass(name){console.log('PASS',name)}

for(const skill of D.SKILLS){
  const prior=D.generateDiagnostic(skill.id,'prior_formal');const excluded=prior.map(D.fingerprint);
  for(const checkpoint of ['Day 2','Day 7','Day 21']){
    const a=M.generateRetention(skill.id,checkpoint,'ret_session',excluded);const b=M.generateRetention(skill.id,checkpoint,'ret_session',excluded);
    assert.equal(a.length,2);assert.deepEqual(a,b);assert.equal(new Set(a.map(D.fingerprint)).size,2);
    for(const item of a){assert.equal(item.validated,true);assert.equal(item.transfer,false);assert.ok(!excluded.includes(D.fingerprint(item)))}
  }
  const x1=M.generateTransfer(skill.id,'xfer_session',excluded);const x2=M.generateTransfer(skill.id,'xfer_session',excluded);
  assert.equal(x1.length,2);assert.deepEqual(x1,x2);assert.equal(new Set(x1.map(D.fingerprint)).size,2);
  for(const item of x1){assert.equal(item.validated,true);assert.equal(item.transfer,true);assert.ok(!excluded.includes(D.fingerprint(item)));assert.ok(item.choices||Object.hasOwn(item,'free'))}
}
pass('all six skills generate deterministic fresh Day 2/7/21 retention sets');
pass('all six skills generate deterministic fresh transfer evidence');

console.log('\nAll Slice I mastery-generator checks passed.');
