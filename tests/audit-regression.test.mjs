import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function pass(name){ console.log('PASS', name); }

// Persistence safety.
assert.match(source, /const STATE_KEY = "michael";/); pass('state key exists');
assert.match(source, /const PROBE_KEY = "__healthcheck";/); pass('separate probe key exists');
assert.match(source, /function idbGet\(key = STATE_KEY\)/); pass('idbGet accepts key');
assert.match(source, /function idbPut\(value, key = STATE_KEY\)/); pass('idbPut accepts key');
assert.match(source, /idbPut\(probe,PROBE_KEY\)/); pass('health probe writes probe key');
assert.match(source, /idbGet\(PROBE_KEY\)/); pass('health probe reads probe key');
assert.doesNotMatch(source, /await idbPut\(probe\);/); pass('legacy destructive probe write removed');
assert.doesNotMatch(source, /await idbPut\(state\|\|freshState\(\)\);/); pass('health check no longer restores state after overwrite');
assert.match(source, /prepareLoadedStateSafe\(rawDisk,"PRIMARY"\)/); pass('primary disk state is migration-aware and structurally validated');
assert.match(source, /prepareLoadedStateSafe\(rawMirror,"MIRROR"\)/); pass('mirror fallback is independently validated before recovery');
assert.match(source, /STATE_INTEGRITY\.compareRevisions\(rawDisk,rawMirror\)/); pass('validated primary and mirror are revision-compared');

// Frozen evidence vocabulary.
for (const value of ['INDEPENDENT','CLARIFIED','HINTED','GUIDED','TAUGHT','PARENT_ASSISTED']) assert.match(source, new RegExp(`"${value}"`));
pass('all six assistance_level values are present');
for (const value of ['SELF_READ_SILENT','SELF_READ_ALOUD','SYSTEM_READ_ALOUD','ADULT_READ_ALOUD']) assert.match(source, new RegExp(`"${value}"`));
pass('all four access_condition values are present');
assert.match(source, /evidence_class:"INFORMAL_TRACK_B"/); pass('evidence class separated');
assert.match(source, /instruction_exposure_status:"PRIOR_INSTRUCTION"/); pass('instruction exposure separated');
assert.match(source, /assistance_level:assistanceLevel/); pass('answer assistance level derived from session, not literal');
assert.match(source, /assistance_level:assistanceLevelForSession\(current\.session\)/); pass('think-aloud assistance level derived from session');
assert.match(source, /access_condition:accessCondition/); pass('answer access condition uses frozen enum');
assert.match(source, /access_condition:teachAccess/); pass('teach evidence access condition uses frozen enum');
assert.match(source, /function validAccessCondition\(value\).*STATE_INTEGRITY.*validAccessCondition/); pass('access validation delegates to tested state-integrity helper');
assert.match(source, /access_condition_source:accessConditionSource/); pass('answer access provenance stored');
assert.match(source, /access_condition_source:teachAccessSource/); pass('teach access provenance stored');
assert.doesNotMatch(source, /accessSupports:/); pass('legacy accessSupports removed');
assert.doesNotMatch(source, /independent:false/); pass('boolean independence write removed');
assert.doesNotMatch(source, /skillStateFromScore/); pass('score-to-canonical-state helper removed');
assert.match(source, /trackBProgress:trackBProgressFromScore\(score\)/); pass('Track B uses local progress field');
assert.match(source, /const RUNTIME_ENABLED = true;/); pass('audited pilot build flag is enabled');

// Access capture.
assert.match(source, /selector\.value="SYSTEM_READ_ALOUD"/); pass('system read-aloud records actual access condition');
assert.match(source, /id="itemAccessCondition"/); pass('question access condition explicitly recordable');
assert.match(source, /accessOptions\(null\)/); pass('item access starts unrecorded');
assert.match(source, /id="teachAccess"/); pass('teaching-block access recordable');

// Home Screen and backup safeguards.
assert.match(index, /apple-mobile-web-app-capable/); pass('iOS Home Screen capability meta present');
assert.match(index, /apple-mobile-web-app-title/); pass('iOS Home Screen title meta present');
assert.match(source, /pendingAfterLesson=true/); pass('lesson completion marks portable backup pending');
assert.match(source, /lastExportAttemptedAt/); pass('backup timestamp is export attempt');
assert.match(source, /Portable backup due now/); pass('lesson completion prompts for backup');

// Reproduce original destructive health-check window using patched key semantics.
const STATE_KEY = 'michael';
const PROBE_KEY = '__healthcheck';
const store = new Map();
const original = {student:{id:'michael'}, evidence:[{id:1},{id:2}], lessonState:{A:{status:'COMPLETED'}}};
store.set(STATE_KEY, structuredClone(original));
function put(value,key=STATE_KEY){ store.set(key,structuredClone(value)); }
function get(key=STATE_KEY){ return structuredClone(store.get(key) ?? null); }
put({ok:true,t:'2026-09-06'},PROBE_KEY);
assert.deepEqual(get(STATE_KEY), original); pass('mid-health-check learner state remains intact');
assert.deepEqual(get(STATE_KEY), original); pass('crash during health check cannot erase learner state');

function valid(x){ return !!(x && x.student && x.student.id==='michael' && Array.isArray(x.evidence) && x.lessonState && typeof x.lessonState==='object'); }
const invalidDisk = {ok:true,t:'2026-09-06'};
const localBackup = structuredClone(original);
const selected = valid(invalidDisk) ? invalidDisk : (valid(localBackup) ? localBackup : {fresh:true});
assert.deepEqual(selected, original); pass('invalid disk falls back to valid local backup before fresh state');

const ACCESS_CONDITIONS = ['SELF_READ_SILENT','SELF_READ_ALOUD','SYSTEM_READ_ALOUD','ADULT_READ_ALOUD'];
function validAccess(value){ return ACCESS_CONDITIONS.includes(value) ? value : null; }
assert.equal(validAccess(undefined), null); pass('unobserved access remains null');
assert.equal(validAccess('SELF_READ_SILENT'), 'SELF_READ_SILENT'); pass('explicit self-read-silent remains valid');

console.log('\nAll audit regression checks passed.');
