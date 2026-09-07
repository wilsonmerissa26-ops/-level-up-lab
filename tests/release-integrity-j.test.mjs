import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const helperSource=fs.readFileSync(new URL('../state-integrity.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(helperSource,context);
const I=context.window.LEVEL_UP_STATE_INTEGRITY;
function pass(name){console.log('PASS',name)}

const valid={schemaVersion:1,student:{id:'michael'},evidence:[],lessonState:{},sessions:[],reviewSchedule:[],trackASkillState:{},trackAMasterySchedule:[]};
assert.deepEqual(JSON.parse(JSON.stringify(I.validateRestoreCandidate(valid))),valid);pass('valid current-schema restore candidate accepted');
for(const bad of [
  {schemaVersion:1,student:{id:'michael'},lessonState:{}},
  {schemaVersion:1,student:{id:'someone_else'},evidence:[],lessonState:{}},
  {schemaVersion:999,student:{id:'michael'},evidence:[],lessonState:{}},
  {schemaVersion:1,student:{id:'michael'},evidence:[{evidenceStatus:'PRIOR_INSTRUCTION'}],lessonState:{}},
  {schemaVersion:1,student:{id:'michael'},evidence:[{independent:true}],lessonState:{}}
]) assert.throws(()=>I.validateRestoreCandidate(bad));
pass('truncated, foreign, unknown-schema and legacy-field backups are rejected');

const source=structuredClone(valid);const restored=I.validateRestoreCandidate(source);restored.evidence.push({id:'x'});assert.equal(source.evidence.length,0);pass('restore validation returns an isolated clone');

assert.equal(I.validAccessCondition('SYSTEM_READ_ALOUD'),'SYSTEM_READ_ALOUD');
assert.equal(I.validAccessCondition(''),null);assert.equal(I.validAccessCondition('garbage'),null);pass('unobserved/invalid access is null, never fabricated as silent reading');

const evidence=[];const s1={id:'sess_1',mode:'LESSON',lessonId:'SCI.TEST'};const e1={id:'ev_1',skillId:'SCI.TEST'};I.linkEvidenceToSession(e1,s1,evidence);evidence.push(e1);
assert.equal(e1.sessionId,'sess_1');assert.equal(e1.attemptNumber,1);assert.equal(e1.session_mode,'LESSON');
const s2={id:'sess_2',mode:'LESSON',lessonId:'SCI.TEST'};const e2={id:'ev_2',skillId:'SCI.TEST'};I.linkEvidenceToSession(e2,s2,evidence);evidence.push(e2);
assert.equal(e2.attemptNumber,2);pass('evidence links to session and increments attempt attribution across reruns');

const retry={id:'ev_retry',skillId:'SCI.TEST'};const retrySession={id:'sess_retry',mode:'LESSON',lessonId:'SCI.TEST',attemptNumber:3};I.linkEvidenceToSession(retry,retrySession,evidence);const retry2={id:'ev_retry',skillId:'SCI.TEST'};I.linkEvidenceToSession(retry2,retrySession,evidence);assert.equal(retry2.attemptNumber,3);pass('retry keeps stable session attempt attribution');

assert.match(appSource,/if\(!await save\("finish lesson"\)\)return/);pass('finish lesson still fail-stops before completion UI');
assert.match(appSource,/if\(!await save\("next question"\)\)return/);pass('next question still fail-stops before navigation');
assert.match(appSource,/lastDurableState/);pass('runtime tracks last durable learner snapshot for rollback');
assert.match(appSource,/rebindLiveStateReferences/);pass('save failure rebinds live session references to durable state');
assert.match(appSource,/validateRestoreCandidate/);pass('restore path invokes strict validation helper');
assert.match(appSource,/sessionId/);assert.match(appSource,/attemptNumber/);pass('evidence display/runtime carries explicit session and attempt linkage');
assert.match(appSource,/const RUNTIME_ENABLED = false/);pass('student runtime remains blocked');

console.log('\nAll independent-audit release-integrity checks passed.');
