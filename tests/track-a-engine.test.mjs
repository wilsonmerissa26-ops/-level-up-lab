import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../track-a-engine.js',import.meta.url),'utf8');
const context={};vm.createContext(context);vm.runInContext(source,context);
const E=context.LEVEL_UP_TRACK_A_ENGINE;
const pass=name=>console.log('PASS',name);
const probe=(correct,extra={})=>({correct,fresh:true,reliable:true,assistance_level:'INDEPENDENT',...extra});

assert.deepEqual(Array.from(E.STATES),['UNKNOWN','DIAGNOSTIC','GAP','LEARNING','PRACTICING','PROVISIONAL','MASTERED','EXTENDED']);pass('canonical lifecycle registry intact');

let r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true),probe(true)]);
assert.equal(r.result,'PROVISIONAL_SUPPORTED');
assert.equal(r.correct_count,3);
assert.equal(r.cold_baseline_eligible,true);pass('3 of 3 controlled probes support PROVISIONAL only');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true),probe(true)],{priorInstruction:true});
assert.equal(r.result,'PROVISIONAL_SUPPORTED');
assert.equal(r.instruction_exposure_status,'PRIOR_INSTRUCTION');
assert.equal(r.cold_baseline_eligible,false);pass('prior instruction stays attached without discarding formal evidence');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true),probe(true)],{contradictoryEvidence:true});
assert.equal(r.result,'NEEDS_MORE_EVIDENCE');pass('contradictory evidence blocks provisional transition');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true),probe(false)]);
assert.equal(r.result,'MISS_DETECTED');
assert.equal(r.next_action,'MINIMAL_CORRECTION_THEN_2_FRESH_VERIFICATION');pass('2 of 3 routes to minimal correction and two fresh verification probes');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(false),probe(false)]);
assert.equal(r.result,'PREREQUISITE_TRACE_REQUIRED');
assert.equal(r.next_action,'TRACE_DOWN_TO_FIRST_UNSTABLE_PREREQUISITE');pass('0-1 of 3 traces downward instead of guessing');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true,{assistance_level:'HINTED'}),probe(true)]);
assert.equal(r.result,'INSUFFICIENT_CONTROLLED_EVIDENCE');pass('assisted probe cannot masquerade as independent diagnostic evidence');

r=E.evaluateThreeProbeDiagnostic([probe(true),probe(true,{fresh:false}),probe(true)]);
assert.equal(r.result,'INSUFFICIENT_CONTROLLED_EVIDENCE');pass('non-fresh probe cannot satisfy three-probe rule');

let v=E.evaluateTwoProbeVerification([probe(true),probe(true)]);
assert.equal(v.result,'VERIFICATION_PASSED');pass('two fresh independent verification probes can pass');
v=E.evaluateTwoProbeVerification([probe(true),probe(false)]);
assert.equal(v.result,'VERIFICATION_FAILED');pass('failed verification routes to smallest missing component');

assert.equal(E.transitionDecision('UNKNOWN','DIAGNOSTIC',{diagnostic_started:true}).allowed,true);pass('UNKNOWN to DIAGNOSTIC requires explicit start');
assert.equal(E.transitionDecision('DIAGNOSTIC','PROVISIONAL',{diagnostic_result:'PROVISIONAL_SUPPORTED'}).allowed,true);pass('PROVISIONAL transition requires diagnostic rule result');
assert.equal(E.transitionDecision('DIAGNOSTIC','PROVISIONAL',{score:100}).allowed,false);pass('raw score alone cannot write PROVISIONAL');
assert.equal(E.transitionDecision('PROVISIONAL','MASTERED',{delayed_retrieval_passed:true,transfer_passed:false}).allowed,false);pass('delayed retrieval without transfer cannot write MASTERED');
assert.equal(E.transitionDecision('PROVISIONAL','MASTERED',{delayed_retrieval_passed:false,transfer_passed:true}).allowed,false);pass('transfer without delayed retrieval cannot write MASTERED');
assert.equal(E.transitionDecision('PROVISIONAL','MASTERED',{delayed_retrieval_passed:true,transfer_passed:true}).allowed,true);pass('MASTERED requires delayed retrieval plus transfer');
assert.equal(E.transitionDecision('UNKNOWN','MASTERED',{score:100,delayed_retrieval_passed:true,transfer_passed:true}).allowed,false);pass('no shortcut from UNKNOWN to MASTERED');

assert.equal(E.memoryStrengthFromEvidence({}),'FRAGILE');
assert.equal(E.memoryStrengthFromEvidence({delayed_retrieval_passed:true}),'BUILDING');
assert.equal(E.memoryStrengthFromEvidence({delayed_retrieval_passed:true,transfer_passed:true}),'STABLE');
assert.equal(E.memoryStrengthFromEvidence({transfer_passed:true,maintenance_passed:true}),'FLEXIBLE');pass('memory strength remains separate from lifecycle state');

console.log('\nAll Track A engine checks passed.');
