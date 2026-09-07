import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const diagnostic=fs.readFileSync(new URL('../track-a-diagnostic.js',import.meta.url),'utf8');
const remediation=fs.readFileSync(new URL('../track-a-remediation.js',import.meta.url),'utf8');
const verification=fs.readFileSync(new URL('../track-a-verification.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(diagnostic,context);vm.runInContext(remediation,context);vm.runInContext(verification,context);
const D=context.window.LEVEL_UP_TRACK_A_DIAGNOSTIC;const R=context.window.LEVEL_UP_TRACK_A_REMEDIATION;const V=context.window.LEVEL_UP_TRACK_A_VERIFICATION;
function pass(name){console.log('PASS',name)}

for(const skill of D.SKILLS){
  assert.ok(R.repair(skill.id),`missing repair for ${skill.id}`);
  assert.ok(R.repair(skill.id).teach.length>=2,`repair too thin for ${skill.id}`);
  const checks=R.generateComponentChecks(skill.id,'repair_session');
  assert.equal(checks.length,2);
  assert.equal(new Set(checks.map(x=>x.q)).size,2);
  for(const item of checks)assert.equal(item.validated,true);
}
pass('all six Track A math skills have targeted Track B repair content and two component checks');

for(const skill of D.SKILLS){
  const diagnosticSet=D.generateDiagnostic(skill.id,'prior_diag');
  const excluded=diagnosticSet.map(D.fingerprint);
  const v1=V.generateVerification(skill.id,'verify_session',excluded);
  const v2=V.generateVerification(skill.id,'verify_session',excluded);
  assert.equal(v1.length,2);
  assert.deepEqual(v1,v2,`${skill.id} verification must regenerate deterministically`);
  assert.equal(new Set(v1.map(D.fingerprint)).size,2);
  for(const item of v1)assert.ok(!excluded.includes(D.fingerprint(item)),`${skill.id} verification reused excluded diagnostic prompt`);
}
pass('two-probe verification generator excludes prior prompts and is deterministic for resume');

console.log('\nAll Slice H adaptive-path module checks passed.');
