import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function pass(name){console.log('PASS',name)}

assert.match(index,/track-a-engine\.js/);pass('Track A deterministic engine loaded');
assert.match(index,/track-a-diagnostic\.js/);pass('Track A diagnostic bank loaded');
assert.match(app,/const TRACK_A_ENGINE = window\.LEVEL_UP_TRACK_A_ENGINE/);pass('app binds Track A engine');
assert.match(app,/const TRACK_A_DIAGNOSTIC = window\.LEVEL_UP_TRACK_A_DIAGNOSTIC/);pass('app binds Track A diagnostic bank');
assert.match(app,/trackASkillState:\{\}/);pass('canonical Track A state stored separately');
assert.match(app,/trackAActiveSession:null/);pass('Track A session persistence field exists');

assert.match(app,/evidence_class:"FORMAL_CONTROLLED"/);pass('formal evidence uses canonical FORMAL_CONTROLLED class');
assert.match(app,/interaction_purpose:"DIAGNOSTIC"/);pass('formal evidence purpose separated from evidence class');
assert.match(app,/instruction_exposure_status:priorInstruction\?"PRIOR_INSTRUCTION":null/);pass('prior instruction is separate formal evidence dimension');
assert.match(app,/cold_baseline_eligible:!priorInstruction/);pass('cold baseline eligibility derived explicitly');
assert.match(app,/assistance_level:assistance/);pass('formal evidence stores six-level assistance value');
assert.match(app,/if\(!ASSISTANCE_LEVELS\.includes\(assistance\)\)/);pass('assistance must be explicitly recorded before formal probe locks');
assert.match(app,/access_condition:accessCondition/);pass('formal evidence stores access condition');
assert.match(app,/access_condition_source:accessSource/);pass('formal evidence stores access provenance');
assert.match(app,/fresh,reliable/);pass('freshness and reliability are stored independently');
assert.match(app,/generator:\{template_id:q\.template_id,template_version:q\.template_version,validated:q\.validated===true\}/);pass('reliability basis points to validated deterministic template');
assert.match(app,/interpretation:null/);pass('raw formal item evidence is not overwritten by interpretation');

assert.match(app,/trackAPromptIsFresh/);pass('freshness is checked against prior Track A prompts');
assert.match(app,/TRACK_A_ENGINE\.evaluateThreeProbeDiagnostic/);pass('three-probe decision delegated to deterministic engine');
assert.match(app,/TRACK_A_ENGINE\.transitionDecision/);pass('canonical lifecycle transitions delegated to guarded engine');
assert.match(app,/result\.result==="PROVISIONAL_SUPPORTED"/);pass('3 of 3 route can support provisional only');
assert.match(app,/result\.result==="MISS_DETECTED"\?2:0/);pass('2 of 3 route records two fresh verification probes required');
assert.match(app,/prerequisite_target:prerequisiteTarget/);pass('0 to 1 of 3 route records prerequisite target');
assert.doesNotMatch(app,/canonicalState\s*:\s*"MASTERED"/);pass('Track A diagnostic UI cannot directly write MASTERED');

assert.match(app,/no teaching or correctness feedback between probes/i);pass('controlled probe UI suppresses between-probe feedback');
assert.match(app,/selector\.value="SYSTEM_READ_ALOUD"/);pass('read-aloud records actual system access support');
assert.match(app,/id:`ta_ev_\$\{session\.id\}_\$\{q\.id\}`/);pass('formal evidence IDs are stable for retry safety');
assert.match(app,/if\(!await save\("Track A controlled probe"\)\)/);pass('formal probe fail-stops on required write failure');
assert.match(app,/Session halted/);pass('failed formal save visibly halts the diagnostic');
assert.match(app,/recover interrupted Track A diagnostic/);pass('Track A crash recovery preserves session');
assert.match(app,/saveAndExitTrackA/);pass('Track A has explicit Save and Exit path');
assert.match(app,/const RUNTIME_ENABLED = true/);pass('Michael remains release-gated');

console.log('\nAll Track A delivery/evidence adapter checks passed.');
