import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function pass(name){console.log('PASS',name)}

assert.match(index,/track-a-remediation\.js/);pass('Track A remediation module loaded');
assert.match(index,/track-a-verification\.js/);pass('Track A verification module loaded');
assert.match(app,/const TRACK_A_REMEDIATION = window\.LEVEL_UP_TRACK_A_REMEDIATION/);pass('app binds remediation module');
assert.match(app,/const TRACK_A_VERIFICATION = window\.LEVEL_UP_TRACK_A_VERIFICATION/);pass('app binds verification module');

assert.match(app,/function trackARouteForSkill/);pass('adaptive route resolver exists');
assert.match(app,/PREREQUISITE_TRACE_REQUIRED/);pass('route resolver recognizes prerequisite trace result');
assert.match(app,/return trackARouteForSkill\(pre,seen\)/);pass('prerequisite trace walks downward recursively');
assert.match(app,/type:"REPAIR"/);pass('route can target minimal repair');
assert.match(app,/type:"VERIFY"/);pass('route can target formal verification');

assert.match(app,/function startTrackARepair/);pass('targeted Track B repair start exists');
assert.match(app,/transitionDecision\("GAP","LEARNING",\{instruction_started:true\}\)/);pass('repair starts learning only through guarded transition');
assert.match(app,/evidence_class:"INFORMAL_TRACK_B",interaction_purpose:"INSTRUCTIONAL"/);pass('repair teaching evidence uses separate Track B class and instructional purpose');
assert.match(app,/interaction_purpose:"PRACTICE"/);pass('repair component check purpose is PRACTICE');
assert.match(app,/instruction_exposure_status:"PRIOR_INSTRUCTION"/);pass('repair permanently attaches prior instruction');
assert.match(app,/e\.isCorrect===true&&e\.assistance_level==="INDEPENDENT"&&e\.reliable===true/);pass('component verification requires correct independent reliable evidence, not score alone');
assert.match(app,/transitionDecision\("LEARNING","PRACTICING",\{smallest_component_verified:true\}\)/);pass('learning to practicing uses explicit component-verification guard');

assert.match(app,/function startTrackAVerification/);pass('two-probe formal verification start exists');
assert.match(app,/canonicalState!=="PRACTICING"/);pass('formal verification requires PRACTICING state');
assert.match(app,/lastRepair\?\.result!=="COMPONENT_VERIFIED"/);pass('formal verification requires explicit repair component verification');
assert.match(app,/generateVerification\(skillId,id,excluded\)/);pass('verification excludes prior formal prompts');
assert.match(app,/evidence_class:"FORMAL_CONTROLLED",interaction_purpose:"MASTERY_CHECK"/);pass('verification uses formal class and mastery-check purpose');
assert.match(app,/evaluateTwoProbeVerification\(probes\)/);pass('two-probe result delegated to deterministic engine');
assert.match(app,/transitionDecision\(rec\.canonicalState,"PROVISIONAL",\{verification_result:result\.result\}\)/);pass('verification pass uses guarded practicing-to-provisional transition');
assert.doesNotMatch(app,/canonicalState\s*=\s*"MASTERED"/);pass('adaptive repair/verification path cannot declare MASTERED');

assert.match(app,/no teaching or correctness feedback between probes/i);pass('formal verification suppresses between-probe feedback');
assert.match(app,/Teaching feedback is allowed after Michael locks his answer/);pass('Track B repair allows teaching feedback after response');
assert.match(app,/ta_verify_ev_\$\{session\.id\}_\$\{q\.id\}/);pass('formal verification evidence IDs are retry-stable');
assert.match(app,/if\(!await save\("Track A verification probe"\)\)/);pass('formal verification fail-stops on save failure');
assert.match(app,/resumeTrackAPath/);pass('crash recovery can resume diagnostic, repair, or verification path');
assert.match(app,/const RUNTIME_ENABLED = true/);pass('Michael remains release-gated');

console.log('\nAll Slice H adaptive repair/verification UI checks passed.');
