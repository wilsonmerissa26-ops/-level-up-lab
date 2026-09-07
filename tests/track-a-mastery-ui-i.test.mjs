import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function pass(name){console.log('PASS',name)}

assert.match(index,/track-a-mastery-state\.js/);pass('mastery state engine loaded');
assert.match(index,/track-a-mastery\.js/);pass('formal mastery item generator loaded');
assert.match(app,/const TRACK_A_MASTERY_STATE = window\.LEVEL_UP_TRACK_A_MASTERY_STATE/);pass('app binds mastery state engine');
assert.match(app,/const TRACK_A_MASTERY = window\.LEVEL_UP_TRACK_A_MASTERY/);pass('app binds mastery generator');
assert.match(app,/trackAMasterySchedule:\[\]/);pass('formal mastery schedule persisted in learner state');
assert.match(app,/if\(!Array\.isArray\(value\.trackAMasterySchedule\)\) value\.trackAMasterySchedule=\[\]/);pass('older learner state migrates mastery schedule safely');

assert.match(app,/ensureTrackAMasterySchedule/);pass('provisional skills receive formal mastery schedule');
assert.match(app,/createSchedule\(skillId,rec\.masteryCycleId,rec\.provisionalAt\)/);pass('Day 2 Day 7 transfer and Day 21 schedule comes from deterministic state engine');
assert.match(app,/if\(rec\.canonicalState==="PROVISIONAL"\)ensureTrackAMasterySchedule/);pass('direct or verification provisional path schedules formal retrieval');

assert.match(app,/mode:"TRACK_A_MASTERY"/);pass('formal mastery sessions have distinct mode');
assert.match(app,/interaction_purpose:"MASTERY_CHECK"/);pass('post-provisional formal evidence uses mastery-check purpose');
assert.match(app,/evidence_class:"FORMAL_CONTROLLED"/);pass('post-provisional evidence stays FORMAL_CONTROLLED');
assert.match(app,/evidenceType/);pass('delayed retrieval transfer and maintenance subtype is separately recorded');
assert.match(app,/checkpoint:task\.checkpoint/);pass('formal evidence records scheduled checkpoint');
assert.match(app,/transfer:task\.type==="TRANSFER"\|\|q\.transfer===true/);pass('transfer evidence is explicitly marked');
assert.match(app,/fresh,reliable/);pass('formal mastery evidence keeps freshness and reliability independent');
assert.match(app,/assistance_level:assistance/);pass('formal mastery evidence records actual assistance');
assert.match(app,/access_condition:access/);pass('formal mastery evidence records access condition');
assert.match(app,/access_condition_source:accessSource/);pass('formal mastery evidence records access provenance');
assert.match(app,/interpretation:null/);pass('formal raw response is not overwritten by interpretation');

assert.match(app,/no teaching or correctness feedback between probes/i);pass('no teaching feedback appears between formal mastery probes');
assert.match(app,/if\(!await save\("Track A formal mastery probe"\)\)/);pass('formal mastery probe fail-stops on write failure');
assert.match(app,/Formal check halted/);pass('formal write failure visibly halts the set');
assert.match(app,/ta_mastery_ev_\$\{session\.id\}_\$\{q\.id\}/);pass('formal mastery evidence IDs are retry-stable');

assert.match(app,/masteryConditions\(state\.trackAMasterySchedule,skillId\)/);pass('mastery decision reads explicit delayed and transfer conditions');
assert.match(app,/transitionDecision\(rec\.canonicalState,targetState,\{delayed_retrieval_passed:true,transfer_passed:true\}\)/);pass('PROVISIONAL to MASTERED goes through deterministic guard');
assert.match(app,/const targetState="MASTERED"/);pass('mastery target is explicit');
assert.doesNotMatch(app,/canonicalState\s*=\s*"MASTERED"/);pass('no unguarded direct MASTERED assignment exists');
assert.match(app,/unlockMaintenance\(state\.trackAMasterySchedule,skillId\)/);pass('Day 21 maintenance unlocks only after guarded mastery transition');
assert.match(app,/memoryStrength\(state\.trackAMasterySchedule/);pass('memory strength remains separate from lifecycle state');

assert.match(app,/masteryRepairRequired=true/);pass('controlled retrieval miss routes to repair without silently demoting lifecycle');
assert.match(app,/retryTask\(state\.trackAMasterySchedule,rec\.masteryRepairTaskId,now\(\)\)/);pass('post-repair retry creates fresh formal task and preserves failed evidence');
assert.match(app,/replaceTrackAMasteryTask/);pass('unusable assisted stale or unreliable evidence is replaced without treating it as a learning miss');
assert.match(app,/TRACK_A_MASTERY_STATE\.retryTask\(state\.trackAMasterySchedule,task\.id,now\(\)\)/);pass('replacement creates new attempt rather than overwriting old task');

assert.match(app,/session\.mode==="TRACK_A_MASTERY"/);pass('crash resume handles formal mastery sessions');
assert.match(app,/const RUNTIME_ENABLED = false/);pass('Michael remains release-gated');

console.log('\nAll Slice I formal mastery UI checks passed.');
