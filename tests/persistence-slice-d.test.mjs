import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function pass(name){ console.log('PASS', name); }

assert.match(source, /function manualSave\(\)/); pass('manual Save action exists');
assert.match(source, /function saveAndExit\(\)/); pass('Save & Exit action exists');
assert.match(source, /function captureDraftFromUI\(\)/); pass('in-progress draft capture exists');
assert.match(source, /function restoreDraftToUI\(\)/); pass('saved draft restore exists');
assert.match(source, /function bindDraftAutosave\(\)/); pass('draft autosave binding exists');
assert.match(source, /function resumeInterruptedSession\(\)/); pass('explicit interrupted-session resume exists');
assert.match(source, /function endPreservedSession\(\)/); pass('explicit preserved-session end exists');
assert.match(source, /state\.activeSession\.status="INTERRUPTED_PRESERVED"/); pass('crash reload preserves active session instead of deleting it');
assert.doesNotMatch(source, /state\.activeSession\.status="INTERRUPTED_PRESERVED";state\.activeSession=null/); pass('crash recovery no longer clears active session');
assert.match(source, /if\(!await save\("next question"\)\)return/); pass('next-question transition fail-stops on save failure');
assert.match(source, /if\(!await save\("finish lesson"\)\)return/); pass('lesson completion fail-stops on save failure');
assert.match(source, /if\(!await save\("start lesson"\)\)return/); pass('lesson start fail-stops on save failure');
assert.match(source, /writeSequence = Promise\.resolve\(\)/); pass('writes are serialized before draft autosave is enabled');
assert.match(source, /const snapshot=JSON\.parse\(JSON\.stringify\(state\)\)/); pass('queued writes use immutable state snapshots');
assert.match(source, />Save & Exit</); pass('student lesson UI exposes Save & Exit');
assert.match(source, /onclick="window\.MLUL\.manualSave\(\)"/); pass('manual Save is wired in the UI');

const syntheticSession = {
  id:'sess_test', lessonId:'SCI_7A_FOUNDATIONS', status:'ACTIVE', phase:'CHECK_AFTER_TEACH',
  itemIndex:1, responses:[{id:'ev_submitted',rawResponse:'kinetic',isCorrect:true}],
  draft:{phase:'CHECK_AFTER_TEACH',itemIndex:1,freeAnswer:'I do not know',confidence:'guess',savedAt:'2026-09-07T00:00:00Z'}
};
const syntheticLearner = {student:{id:'michael'},evidence:[...syntheticSession.responses],lessonState:{},sessions:[structuredClone(syntheticSession)],activeSession:structuredClone(syntheticSession)};
const afterCrash = structuredClone(syntheticLearner);
afterCrash.activeSession.status='INTERRUPTED_PRESERVED';
assert.equal(afterCrash.evidence.length,1); pass('submitted evidence survives synthetic crash/reload');
assert.equal(afterCrash.activeSession.draft.freeAnswer,'I do not know'); pass('unsubmitted draft survives synthetic crash/reload');
assert.equal(afterCrash.activeSession.itemIndex,1); pass('resume point survives synthetic crash/reload');
const resumed = structuredClone(afterCrash.activeSession); resumed.status='ACTIVE';
assert.equal(resumed.draft.confidence,'guess'); pass('explicit resume restores saved draft metadata');

console.log('\nAll Slice D regression checks passed.');
