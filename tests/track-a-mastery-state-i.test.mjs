import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../track-a-mastery-state.js',import.meta.url),'utf8');
const context={window:{},Date};vm.createContext(context);vm.runInContext(source,context);
const S=context.window.LEVEL_UP_TRACK_A_MASTERY_STATE;
function pass(name){console.log('PASS',name)}

const base='2026-09-07T12:00:00.000Z';
let tasks=S.createSchedule('MATH.ONE_STEP_EQUATIONS','cycle1',base);
assert.equal(tasks.length,4);
assert.equal(S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 2').status,'SCHEDULED');
assert.equal(S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 7').status,'LOCKED');
assert.equal(S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Transfer').status,'LOCKED');
assert.equal(S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 21').status,'LOCKED');
pass('mastery schedule starts Day 2 open and later gates locked');

const independentPass=[{fresh:true,reliable:true,assistance_level:'INDEPENDENT',isCorrect:true},{fresh:true,reliable:true,assistance_level:'INDEPENDENT',isCorrect:true}];
const d2=S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 2');S.completeTask(tasks,d2.id,independentPass,'2026-09-09T12:00:00.000Z');
assert.equal(d2.passed,true);assert.equal(S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 7').status,'SCHEDULED');
pass('Day 2 pass unlocks Day 7');

const d7=S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Day 7');S.completeTask(tasks,d7.id,independentPass,'2026-09-14T12:00:00.000Z');
const transfer=S.latestTask(tasks,'MATH.ONE_STEP_EQUATIONS','Transfer');assert.equal(transfer.status,'SCHEDULED');assert.equal(transfer.dueAt,'2026-09-14T12:00:00.000Z');
pass('Day 7 pass after Day 2 unlocks transfer immediately');

S.completeTask(tasks,transfer.id,independentPass,'2026-09-14T13:00:00.000Z');
const conditions=S.masteryConditions(tasks,'MATH.ONE_STEP_EQUATIONS');assert.equal(conditions.delayed_retrieval_passed,true);assert.equal(conditions.transfer_passed,true);assert.equal(S.memoryStrength(tasks,'MATH.ONE_STEP_EQUATIONS'),'STABLE');
pass('Day 2 + Day 7 + transfer satisfy mastery evidence conditions and stable memory');

const maintenance=S.unlockMaintenance(tasks,'MATH.ONE_STEP_EQUATIONS');assert.equal(maintenance.status,'SCHEDULED');
S.completeTask(tasks,maintenance.id,independentPass,'2026-09-28T12:00:00.000Z');assert.equal(S.memoryStrength(tasks,'MATH.ONE_STEP_EQUATIONS'),'FLEXIBLE');
pass('Day 21 maintenance can raise memory strength to flexible');

let failTasks=S.createSchedule('MATH.INTEGER_OPS','cycle2',base);const f2=S.latestTask(failTasks,'MATH.INTEGER_OPS','Day 2');
const miss=[{fresh:true,reliable:true,assistance_level:'INDEPENDENT',isCorrect:true},{fresh:true,reliable:true,assistance_level:'INDEPENDENT',isCorrect:false}];S.completeTask(failTasks,f2.id,miss,'2026-09-09T12:00:00.000Z');assert.equal(f2.status,'FAILED');const retry=S.retryTask(failTasks,f2.id,'2026-09-09T13:00:00.000Z');assert.equal(retry.attempt,2);assert.equal(retry.previousTaskId,f2.id);assert.equal(retry.status,'SCHEDULED');
pass('controlled miss creates explicit retry task rather than overwriting failed evidence');

let unusable=S.createSchedule('MATH.INTEGER_OPS','cycle3',base);const u2=S.latestTask(unusable,'MATH.INTEGER_OPS','Day 2');const assisted=[{fresh:true,reliable:true,assistance_level:'HINTED',isCorrect:true},{fresh:true,reliable:true,assistance_level:'INDEPENDENT',isCorrect:true}];S.completeTask(unusable,u2.id,assisted,'2026-09-09T12:00:00.000Z');assert.equal(u2.status,'UNUSABLE');assert.equal(u2.passed,false);
pass('assisted formal retrieval is unusable, not a pass');

console.log('\nAll Slice I mastery-state checks passed.');
