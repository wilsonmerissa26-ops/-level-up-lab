import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
globalThis.window=globalThis;
for(const file of ['content.js','review-engine.js','track-a-engine.js','track-a-diagnostic.js','state-integrity.js','synthetic-e2e-core.js']){
  const source=fs.readFileSync(new URL(file,root),'utf8');
  vm.runInThisContext(source,{filename:file});
}

const CONTENT=globalThis.LEVEL_UP_CONTENT;
const REVIEW=globalThis.LEVEL_UP_REVIEW_ENGINE;
const ENGINE=globalThis.LEVEL_UP_TRACK_A_ENGINE;
const DIAG=globalThis.LEVEL_UP_TRACK_A_DIAGNOSTIC;
const INTEGRITY=globalThis.LEVEL_UP_STATE_INTEGRITY;
const CORE=globalThis.LEVEL_UP_SYNTHETIC_E2E_CORE;

assert.ok(CONTENT&&REVIEW&&ENGINE&&DIAG&&INTEGRITY&&CORE,'synthetic smoke dependencies load');

const now='2026-09-08T15:00:00.000Z';
let state=CORE.freshState(now);
assert.equal(state.student.id,'synthetic-e2e');
assert.equal(state.evidence.length,0);

const lesson=CONTENT.science[0];
const session=CORE.startTrackBSession(state,lesson,now);
assert.equal(state.activeSession.status,'ACTIVE');
assert.equal(state.sessions.length,1);

CORE.recordTrackBTeaching(state,session,lesson,INTEGRITY,now);
assert.equal(state.evidence.length,1);
assert.equal(state.evidence[0].evidence_class,'INFORMAL_TRACK_B');
assert.equal(state.evidence[0].interaction_purpose,'INSTRUCTIONAL');
assert.equal(state.evidence[0].instruction_exposure_status,'PRIOR_INSTRUCTION');
assert.equal(state.evidence[0].sessionId,session.id);
assert.equal(state.evidence[0].attemptNumber,1);

const checks=CORE.recordPerfectTrackBChecks(state,session,lesson,INTEGRITY,now);
assert.equal(checks.length,3);
assert.ok(checks.every(e=>e.isCorrect===true));
assert.ok(checks.every(e=>e.rawResponse));
assert.ok(checks.every(e=>e.sessionId===session.id&&e.attemptNumber===1));
assert.equal(state.activeSession.responses.length,4,'live active session retains teaching + practice responses before persistence');

// Simulate browser reload by serializing and reloading the learner record.
state=JSON.parse(JSON.stringify(state));
assert.equal(state.activeSession.status,'ACTIVE');
assert.equal(state.activeSession.responses.filter(x=>x.interaction_purpose==='PRACTICE').length,3,'persisted active session keeps all practice responses');
state.activeSession.status='INTERRUPTED_PRESERVED';
CORE.upsertSession(state,state.activeSession);
assert.equal(state.activeSession.status,'INTERRUPTED_PRESERVED');
assert.notEqual(state.activeSession.status,'ACTIVE');

// Explicit resume is a distinct action.
state.activeSession.status='ACTIVE';
CORE.upsertSession(state,state.activeSession);
const finished=CORE.completeTrackBLesson(state,state.activeSession,lesson,now);
assert.equal(finished.score,100);
assert.equal(finished.progress,'CHECK_STRONG');
assert.equal(state.activeSession,null);
assert.equal(state.lessonState[lesson.id].memoryStrength,'FRAGILE');
assert.equal(state.lessonState[lesson.id].instruction_exposure_status,'PRIOR_INSTRUCTION');
assert.equal(state.reviewSchedule.length,3);
assert.deepEqual(state.reviewSchedule.map(r=>r.window),['Day 2','Day 7','Day 21']);
assert.equal(state.trackASkillState[lesson.id],undefined,'Track B must not invent canonical mastery state');
assert.ok(state.sessions.some(s=>s.id===session.id&&s.status==='COMPLETED'));

const review=REVIEW.generateReview(lesson.id,'Day 2','synthetic_day2_review');
assert.equal(review.length,3);
const oldPrompts=new Set(lesson.checks.map(q=>q.q));
assert.ok(review.every(q=>!oldPrompts.has(q.q)),'delayed review prompts are fresh vs teaching checks');

const mathSkill='MATH.INTEGER_OPS';
CORE.addPriorInstructionForMath(state,INTEGRITY,mathSkill,now);
const formal=CORE.runPerfectTrackADiagnostic(state,mathSkill,DIAG,ENGINE,INTEGRITY,now);
assert.equal(formal.evaluation.result,'PROVISIONAL_SUPPORTED');
assert.equal(formal.evaluation.instruction_exposure_status,'PRIOR_INSTRUCTION');
assert.equal(formal.evaluation.cold_baseline_eligible,false);
assert.equal(state.trackASkillState[mathSkill].canonicalState,'PROVISIONAL');
assert.notEqual(state.trackASkillState[mathSkill].canonicalState,'MASTERED');
const formalEvidence=state.evidence.filter(e=>e.track==='A'&&e.skillId===mathSkill);
assert.equal(formalEvidence.length,3);
assert.ok(formalEvidence.every(e=>e.evidence_class==='FORMAL_CONTROLLED'));
assert.ok(formalEvidence.every(e=>e.assistance_level==='INDEPENDENT'&&e.fresh===true&&e.reliable===true));
assert.ok(formalEvidence.every(e=>e.rawResponse!==undefined&&e.sessionId&&e.attemptNumber===1));

const harness=fs.readFileSync(new URL('synthetic-e2e.js',root),'utf8');
assert.match(harness,/MichaelLevelUpLab_SYNTHETIC_E2E/);
assert.match(harness,/VERIFY_INTERRUPT/);
assert.match(harness,/AWAIT_EXPLICIT_RESUME/);
assert.match(harness,/VERIFY_FINAL/);
assert.match(harness,/location\.reload\(\)/);
assert.match(harness,/state\.stateRevision=result\.revision;/,'smoke save writes durable revision back onto the live state');
assert.doesNotMatch(harness,/return clone\(candidate\)/,'smoke save must not replace the live learner object with a detached clone');
assert.doesNotMatch(harness,/MichaelLevelUpLab['"]/,'synthetic harness must not target Michael production DB');

const auditPage=fs.readFileSync(new URL('audit-browser.html',root),'utf8');
const smokePage=fs.readFileSync(new URL('synthetic-e2e.html',root),'utf8');
assert.match(auditPage,/location\.href='synthetic-e2e\.html'/,'cleared installed audit app links directly to smoke gate');
assert.match(smokePage,/location\.href='audit-browser\.html'/,'smoke gate can return to persistence audit in same app container');

const app=fs.readFileSync(new URL('app.js',root),'utf8');
assert.match(app,/const RUNTIME_ENABLED = false;/,'Michael runtime remains locked');

console.log('Patch M synthetic end-to-end learner-path regression: PASS');
