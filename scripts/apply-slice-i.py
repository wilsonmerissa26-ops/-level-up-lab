from pathlib import Path

p=Path('app.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch anchor: {label}')
    s=s.replace(old,new,1)

rep('  const TRACK_A_VERIFICATION = window.LEVEL_UP_TRACK_A_VERIFICATION;\n',
    '  const TRACK_A_VERIFICATION = window.LEVEL_UP_TRACK_A_VERIFICATION;\n  const TRACK_A_MASTERY_STATE = window.LEVEL_UP_TRACK_A_MASTERY_STATE;\n  const TRACK_A_MASTERY = window.LEVEL_UP_TRACK_A_MASTERY;\n',
    'mastery globals')

rep('    trackAActiveSession:null,\n    evidence:[],',
    '    trackAActiveSession:null,\n    trackAMasterySchedule:[],\n    evidence:[],',
    'fresh mastery schedule')

rep('    if(!Object.prototype.hasOwnProperty.call(value,"trackAActiveSession")) value.trackAActiveSession=null;\n    if(!value.settings || typeof value.settings!=="object")',
    '    if(!Object.prototype.hasOwnProperty.call(value,"trackAActiveSession")) value.trackAActiveSession=null;\n    if(!Array.isArray(value.trackAMasterySchedule)) value.trackAMasterySchedule=[];\n    if(!value.settings || typeof value.settings!=="object")',
    'normalize mastery schedule')

anchor='''  function trackAPromptIsFresh(skillId,item){
    const fp=TRACK_A_DIAGNOSTIC.fingerprint(item);
    return !state.evidence.some(e=>e.track==="A" && e.skillId===skillId && e.prompt_fingerprint===fp)
  }
'''
insert=anchor+r'''

  function trackAMasteryTasks(skillId){return (state.trackAMasterySchedule||[]).filter(t=>t.skillId===skillId)}

  function ensureTrackAMasterySchedule(skillId,provisionalAt=now()){
    if(!TRACK_A_MASTERY_STATE)return null;
    const rec=trackASkillRecord(skillId);if(!rec.masteryCycleId)rec.masteryCycleId=`ta_cycle_${Date.now()}_${skillId.replace(/[^A-Z0-9]/gi,"_")}`;
    if(!rec.provisionalAt)rec.provisionalAt=provisionalAt;
    const exists=state.trackAMasterySchedule.some(t=>t.cycleId===rec.masteryCycleId);
    if(!exists)state.trackAMasterySchedule.push(...TRACK_A_MASTERY_STATE.createSchedule(skillId,rec.masteryCycleId,rec.provisionalAt));
    rec.masteryEvidence=rec.masteryEvidence||{day2_passed:false,day7_passed:false,delayed_retrieval_passed:false,transfer_passed:false,maintenance_passed:false};
    state.trackASkillState[skillId]=rec;return rec.masteryCycleId;
  }

  async function initializeTrackAMastery(skillId){
    const rec=trackASkillRecord(skillId);if(rec.canonicalState!=="PROVISIONAL"){alert("Formal mastery scheduling begins only after PROVISIONAL evidence.");return}
    ensureTrackAMasterySchedule(skillId,rec.provisionalAt||now());if(!await save("initialize Track A mastery schedule"))return;render();
  }

  function masteryRouteInfo(skillId){
    const rec=trackASkillRecord(skillId);if(!rec.masteryCycleId||!TRACK_A_MASTERY_STATE)return null;
    return TRACK_A_MASTERY_STATE.nextTask(state.trackAMasterySchedule,skillId,now(),rec.canonicalState)
  }

  function masteryTaskLabel(task){
    if(!task)return "Formal mastery check";
    if(task.type==="TRANSFER")return "Transfer check";
    if(task.type==="MAINTENANCE")return "Day 21 maintenance";
    return `${task.checkpoint} retrieval`;
  }
'''
rep(anchor,insert,'mastery helper insertion')

old_route='''  function trackARouteForSkill(skillId,seen=new Set()){
    if(seen.has(skillId))return {type:"BLOCKED",skillId,reason:"PREREQUISITE_LOOP"};seen.add(skillId);
    const rec=trackASkillRecord(skillId);const st=rec.canonicalState||"UNKNOWN";
    if(["UNKNOWN","DIAGNOSTIC"].includes(st))return {type:"DIAGNOSTIC",skillId};
    if(st==="GAP"){
      if(rec.lastDiagnostic?.result==="PREREQUISITE_TRACE_REQUIRED"){
        const pre=rec.lastDiagnostic?.prerequisite_target;if(!pre)return {type:"REPAIR",skillId};
        const pr=trackASkillRecord(pre);if(["PROVISIONAL","MASTERED","EXTENDED"].includes(pr.canonicalState))return {type:"REPAIR",skillId};
        return trackARouteForSkill(pre,seen);
      }
      return {type:"REPAIR",skillId};
    }
    if(st==="LEARNING")return {type:"REPAIR",skillId};
    if(st==="PRACTICING")return {type:"VERIFY",skillId};
    if(st==="PROVISIONAL")return {type:"DELAYED_TRANSFER",skillId};
    if(["MASTERED","EXTENDED"].includes(st))return {type:"DONE",skillId};
    return {type:"BLOCKED",skillId,reason:"NO_ROUTE"};
  }
'''
new_route=r'''  function trackARouteForSkill(skillId,seen=new Set()){
    if(seen.has(skillId))return {type:"BLOCKED",skillId,reason:"PREREQUISITE_LOOP"};seen.add(skillId);
    const rec=trackASkillRecord(skillId);const st=rec.canonicalState||"UNKNOWN";
    if(["UNKNOWN","DIAGNOSTIC"].includes(st))return {type:"DIAGNOSTIC",skillId};
    if(st==="GAP"){
      if(rec.lastDiagnostic?.result==="PREREQUISITE_TRACE_REQUIRED"){
        const pre=rec.lastDiagnostic?.prerequisite_target;if(!pre)return {type:"REPAIR",skillId};
        const pr=trackASkillRecord(pre);if(["PROVISIONAL","MASTERED","EXTENDED"].includes(pr.canonicalState))return {type:"REPAIR",skillId};
        return trackARouteForSkill(pre,seen);
      }
      return {type:"REPAIR",skillId};
    }
    if(st==="LEARNING")return {type:"REPAIR",skillId};
    if(st==="PRACTICING")return {type:"VERIFY",skillId};
    if(st==="PROVISIONAL"){
      if(!rec.masteryCycleId)return {type:"SETUP_MASTERY",skillId};
      const next=masteryRouteInfo(skillId);if(!next)return {type:"SETUP_MASTERY",skillId};
      if(next.kind==="TASK_DUE")return {type:"MASTERY_TASK",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="REPAIR_REQUIRED")return {type:"MASTERY_REPAIR",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="REPLACE_REQUIRED")return {type:"MASTERY_REPLACE",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="READY_FOR_MASTERY_DECISION")return {type:"MASTERY_DECISION",skillId};
      return {type:"WAITING",skillId,task:next.task};
    }
    if(st==="MASTERED"){
      const next=masteryRouteInfo(skillId);if(!next)return {type:"DONE",skillId};
      if(next.kind==="MAINTENANCE_DUE")return {type:"MAINTENANCE_TASK",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="MAINTENANCE_REPAIR_REQUIRED")return {type:"MAINTENANCE_REPAIR",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="REPLACE_REQUIRED")return {type:"MASTERY_REPLACE",skillId,taskId:next.task.id,task:next.task};
      if(next.kind==="DONE")return {type:"DONE",skillId};
      return {type:"WAITING",skillId,task:next.task};
    }
    if(st==="EXTENDED")return {type:"DONE",skillId};
    return {type:"BLOCKED",skillId,reason:"NO_ROUTE"};
  }
'''
rep(old_route,new_route,'mastery route resolver')

old_action='''  function trackAAction(route){
    if(!route)return "—";const target=TRACK_A_DIAGNOSTIC.skill(route.skillId);const targetName=target?.title||route.skillId;
    let label="";let handler="";
    if(route.type==="DIAGNOSTIC"){label=`Diagnose ${targetName}`;handler=`window.MLUL.startTrackADiagnostic('${route.skillId}')`}
    else if(route.type==="REPAIR"){label=`Repair ${targetName}`;handler=`window.MLUL.startTrackARepair('${route.skillId}')`}
    else if(route.type==="VERIFY"){label=`Verify ${targetName}`;handler=`window.MLUL.startTrackAVerification('${route.skillId}')`}
    else if(route.type==="DELAYED_TRANSFER")return `<span class="pill info">Formal delayed + transfer next</span>`;
    else if(route.type==="DONE")return `<span class="pill good">Lifecycle advanced</span>`;
    else return `<span class="pill warn">Route blocked</span>`;
    const enabled=RUNTIME_ENABLED&&!state.activeSession&&!state.trackAActiveSession;
    return `<button class="btn ${enabled?"primary":""}" ${enabled?"":"disabled"} onclick="${handler}">${RUNTIME_ENABLED?escapeHTML(label):`Audit hold · ${escapeHTML(label)}`}</button>`
  }
'''
new_action=r'''  function trackAAction(route){
    if(!route)return "—";const target=TRACK_A_DIAGNOSTIC.skill(route.skillId);const targetName=target?.title||route.skillId;
    let label="";let handler="";
    if(route.type==="DIAGNOSTIC"){label=`Diagnose ${targetName}`;handler=`window.MLUL.startTrackADiagnostic('${route.skillId}')`}
    else if(route.type==="REPAIR"){label=`Repair ${targetName}`;handler=`window.MLUL.startTrackARepair('${route.skillId}')`}
    else if(route.type==="VERIFY"){label=`Verify ${targetName}`;handler=`window.MLUL.startTrackAVerification('${route.skillId}')`}
    else if(route.type==="SETUP_MASTERY"){label="Schedule formal retrieval";handler=`window.MLUL.initializeTrackAMastery('${route.skillId}')`}
    else if(["MASTERY_TASK","MAINTENANCE_TASK"].includes(route.type)){label=masteryTaskLabel(route.task);handler=`window.MLUL.startTrackAMasteryTask('${route.taskId}')`}
    else if(["MASTERY_REPAIR","MAINTENANCE_REPAIR"].includes(route.type)){label=`Repair after ${masteryTaskLabel(route.task)} miss`;handler=`window.MLUL.startTrackARepair('${route.skillId}')`}
    else if(route.type==="MASTERY_REPLACE"){label=`Replace unusable ${masteryTaskLabel(route.task)}`;handler=`window.MLUL.replaceTrackAMasteryTask('${route.taskId}')`}
    else if(route.type==="MASTERY_DECISION"){label="Apply guarded mastery decision";handler=`window.MLUL.finalizeTrackAMastery('${route.skillId}')`}
    else if(route.type==="WAITING")return `<span class="pill info">${route.task?.dueAt?`${escapeHTML(masteryTaskLabel(route.task))} due ${new Date(route.task.dueAt).toLocaleDateString()}`:"Waiting for prior formal evidence"}</span>`;
    else if(route.type==="DONE")return `<span class="pill good">Lifecycle advanced</span>`;
    else return `<span class="pill warn">Route blocked</span>`;
    const enabled=RUNTIME_ENABLED&&!state.activeSession&&!state.trackAActiveSession;
    return `<button class="btn ${enabled?"primary":""}" ${enabled?"":"disabled"} onclick="${handler}">${RUNTIME_ENABLED?escapeHTML(label):`Audit hold · ${escapeHTML(label)}`}</button>`
  }
'''
rep(old_action,new_action,'mastery actions')

rep('''    const last=rec.lastVerification?.result||rec.lastRepair?.result||rec.lastDiagnostic?.result||"—";
''','''    const last=rec.lastMaintenance?.result||rec.lastMasteryCheck?.result||rec.lastVerification?.result||rec.lastRepair?.result||rec.lastDiagnostic?.result||"—";
''','status latest result')

rep('''    rec.lastDiagnostic={sessionId:session.id,result:result.result,correct_count:result.correct_count,next_action:result.next_action,reason:result.reason,cold_baseline_eligible:result.cold_baseline_eligible,instruction_exposure_status:result.instruction_exposure_status,completedAt:now(),prerequisite_target:prerequisiteTarget,verification_required:result.result==="MISS_DETECTED"?2:0};state.trackASkillState[session.skillId]=rec;
    session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A diagnostic"))return;
''','''    rec.lastDiagnostic={sessionId:session.id,result:result.result,correct_count:result.correct_count,next_action:result.next_action,reason:result.reason,cold_baseline_eligible:result.cold_baseline_eligible,instruction_exposure_status:result.instruction_exposure_status,completedAt:now(),prerequisite_target:prerequisiteTarget,verification_required:result.result==="MISS_DETECTED"?2:0};state.trackASkillState[session.skillId]=rec;
    if(rec.canonicalState==="PROVISIONAL")ensureTrackAMasterySchedule(session.skillId,rec.provisionalAt||now());
    session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A diagnostic"))return;
''','direct provisional scheduling')

rep('''    if(session.mode==="TRACK_A_VERIFICATION"){if(session.itemIndex>=session.items.length)await finishTrackAVerification();else renderTrackAVerificationQuestion();return}
    if(session.itemIndex>=session.items.length){await finishTrackADiagnostic();return}renderTrackAQuestion();
''','''    if(session.mode==="TRACK_A_VERIFICATION"){if(session.itemIndex>=session.items.length)await finishTrackAVerification();else renderTrackAVerificationQuestion();return}
    if(session.mode==="TRACK_A_MASTERY"){if(session.itemIndex>=session.items.length)await finishTrackAMasteryTask();else renderTrackAMasteryQuestion();return}
    if(session.itemIndex>=session.items.length){await finishTrackADiagnostic();return}renderTrackAQuestion();
''','resume mastery session')

rep('''    const route=trackARouteForSkill(skillId);if(route.type!=="REPAIR"||route.skillId!==skillId){alert("The adaptive route requires a different prerequisite step first.");return}
    const rec=trackASkillRecord(skillId);if(!["GAP","LEARNING","PRACTICING"].includes(rec.canonicalState)){alert("This skill is not currently routed to targeted repair.");return}
''','''    const route=trackARouteForSkill(skillId);if(!["REPAIR","MASTERY_REPAIR","MAINTENANCE_REPAIR"].includes(route.type)||route.skillId!==skillId){alert("The adaptive route requires a different prerequisite step first.");return}
    const rec=trackASkillRecord(skillId);const formalRepair=route.type==="MASTERY_REPAIR";const maintenanceRepair=route.type==="MAINTENANCE_REPAIR";if(!["GAP","LEARNING","PRACTICING"].includes(rec.canonicalState)&&!formalRepair&&!maintenanceRepair){alert("This skill is not currently routed to targeted repair.");return}
    if(formalRepair){rec.masteryRepairRequired=true;rec.masteryRepairTaskId=route.taskId}
    if(maintenanceRepair){rec.maintenanceRepairRequired=true;rec.maintenanceRepairTaskId=route.taskId}
''','allow post-retrieval repair')

old_finish_repair='''  async function finishTrackARepair(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_REPAIR"||session.responses.length!==session.items.length)return;const verified=session.responses.every(e=>e.isCorrect===true&&e.assistance_level==="INDEPENDENT"&&e.reliable===true);const rec=trackASkillRecord(session.skillId);let transitionReason=null;if(verified&&rec.canonicalState==="LEARNING"){const t=TRACK_A_ENGINE.transitionDecision("LEARNING","PRACTICING",{smallest_component_verified:true});if(!t.allowed)throw new Error(`Track A component transition blocked: ${t.reason}`);rec.canonicalState="PRACTICING";rec.lastTransitionReason=t.reason;transitionReason=t.reason}
    rec.lastRepair={sessionId:session.id,result:verified?"COMPONENT_VERIFIED":"NEEDS_MORE_INSTRUCTION",verified,completedAt:now(),independent_check_count:session.responses.filter(e=>e.assistance_level==="INDEPENDENT").length,transition_reason:transitionReason};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();state.trackAActiveSession=null;if(!await save("finish targeted Track B repair"))return;document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${verified?"good":"warn"}">${verified?"Component verified":"More repair needed"}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_REMEDIATION.repair(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${verified?"Next: two fresh FORMAL_CONTROLLED verification probes.":"Do not promote the skill from learning yet."}</strong><p class="small">The component check requires every repair-check item correct, reliable, and INDEPENDENT. This is not a percent-score shortcut.</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }
'''
new_finish_repair=r'''  async function finishTrackARepair(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_REPAIR"||session.responses.length!==session.items.length)return;const verified=session.responses.every(e=>e.isCorrect===true&&e.assistance_level==="INDEPENDENT"&&e.reliable===true);const rec=trackASkillRecord(session.skillId);let transitionReason=null;let retryCreated=null;
    if(verified&&rec.canonicalState==="LEARNING"){const t=TRACK_A_ENGINE.transitionDecision("LEARNING","PRACTICING",{smallest_component_verified:true});if(!t.allowed)throw new Error(`Track A component transition blocked: ${t.reason}`);rec.canonicalState="PRACTICING";rec.lastTransitionReason=t.reason;transitionReason=t.reason}
    if(verified&&rec.masteryRepairRequired&&rec.masteryRepairTaskId){retryCreated=TRACK_A_MASTERY_STATE.retryTask(state.trackAMasterySchedule,rec.masteryRepairTaskId,now());rec.masteryRepairRequired=false;rec.masteryRepairTaskId=null}
    if(verified&&rec.maintenanceRepairRequired&&rec.maintenanceRepairTaskId){retryCreated=TRACK_A_MASTERY_STATE.retryTask(state.trackAMasterySchedule,rec.maintenanceRepairTaskId,now());rec.maintenanceRepairRequired=false;rec.maintenanceRepairTaskId=null}
    rec.lastRepair={sessionId:session.id,result:verified?"COMPONENT_VERIFIED":"NEEDS_MORE_INSTRUCTION",verified,completedAt:now(),independent_check_count:session.responses.filter(e=>e.assistance_level==="INDEPENDENT").length,transition_reason:transitionReason,retry_task_id:retryCreated?.id||null};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();state.trackAActiveSession=null;if(!await save("finish targeted Track B repair"))return;
    const nextText=retryCreated?`A fresh ${masteryTaskLabel(retryCreated)} retry is ready. The failed evidence was preserved.`:verified&&rec.canonicalState==="PRACTICING"?"Next: two fresh FORMAL_CONTROLLED verification probes.":verified?"Return to the formal evidence path.":"Do not promote the skill from learning yet.";
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${verified?"good":"warn"}">${verified?"Component verified":"More repair needed"}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_REMEDIATION.repair(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(nextText)}</strong><p class="small">The component check requires every repair-check item correct, reliable, and INDEPENDENT. This is not a percent-score shortcut.</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }
'''
rep(old_finish_repair,new_finish_repair,'repair retry integration')

rep('''    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_VERIFICATION"||session.responses.length!==2)return;const probes=session.responses.map(e=>({fresh:e.fresh===true,reliable:e.reliable===true,assistance_level:e.assistance_level,correct:e.isCorrect===true}));const result=TRACK_A_ENGINE.evaluateTwoProbeVerification(probes);const rec=trackASkillRecord(session.skillId);if(result.result==="VERIFICATION_PASSED"){const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,"PROVISIONAL",{verification_result:result.result});if(!t.allowed)throw new Error(`Track A verification transition blocked: ${t.reason}`);rec.canonicalState="PROVISIONAL";rec.lastTransitionReason=t.reason}rec.lastVerification={sessionId:session.id,result:result.result,correct_count:result.correct_count??null,next_action:result.next_action,completedAt:now()};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A verification"))return;
''','''    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_VERIFICATION"||session.responses.length!==2)return;const probes=session.responses.map(e=>({fresh:e.fresh===true,reliable:e.reliable===true,assistance_level:e.assistance_level,correct:e.isCorrect===true}));const result=TRACK_A_ENGINE.evaluateTwoProbeVerification(probes);const rec=trackASkillRecord(session.skillId);if(result.result==="VERIFICATION_PASSED"){const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,"PROVISIONAL",{verification_result:result.result});if(!t.allowed)throw new Error(`Track A verification transition blocked: ${t.reason}`);rec.canonicalState="PROVISIONAL";rec.provisionalAt=now();rec.lastTransitionReason=t.reason}rec.lastVerification={sessionId:session.id,result:result.result,correct_count:result.correct_count??null,next_action:result.next_action,completedAt:now()};state.trackASkillState[session.skillId]=rec;if(rec.canonicalState==="PROVISIONAL")ensureTrackAMasterySchedule(session.skillId,rec.provisionalAt||now());session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A verification"))return;
''','verification provisional scheduling')

mastery_functions=r'''
  async function replaceTrackAMasteryTask(taskId){
    const task=TRACK_A_MASTERY_STATE?.taskById(state.trackAMasterySchedule,taskId);if(!task||task.status!=="UNUSABLE"){alert("There is no unusable formal task to replace.");return}
    TRACK_A_MASTERY_STATE.retryTask(state.trackAMasterySchedule,task.id,now());if(!await save("replace unusable formal mastery task"))return;render();
  }

  function maybeFinalizeTrackAMastery(skillId){
    const rec=trackASkillRecord(skillId);const conditions=TRACK_A_MASTERY_STATE.masteryConditions(state.trackAMasterySchedule,skillId);rec.masteryEvidence={...(rec.masteryEvidence||{}),...conditions,maintenance_passed:TRACK_A_MASTERY_STATE.latestTask(state.trackAMasterySchedule,skillId,"Day 21")?.passed===true};rec.memoryStrength=TRACK_A_MASTERY_STATE.memoryStrength(state.trackAMasterySchedule,skillId);
    if(rec.canonicalState==="PROVISIONAL"&&conditions.delayed_retrieval_passed&&conditions.transfer_passed){const targetState="MASTERED";const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,targetState,{delayed_retrieval_passed:true,transfer_passed:true});if(!t.allowed)throw new Error(`Track A mastery transition blocked: ${t.reason}`);rec.canonicalState=targetState;rec.masteredAt=now();rec.lastTransitionReason=t.reason;TRACK_A_MASTERY_STATE.unlockMaintenance(state.trackAMasterySchedule,skillId)}
    state.trackASkillState[skillId]=rec;return rec;
  }

  async function finalizeTrackAMastery(skillId){maybeFinalizeTrackAMastery(skillId);if(!await save("guarded Track A mastery decision"))return;render()}

  async function startTrackAMasteryTask(taskId){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not take formal retrieval yet.");return}
    if(!TRACK_A_MASTERY||!TRACK_A_MASTERY_STATE||!TRACK_A_ENGINE){alert("Formal mastery modules are unavailable.");return}
    if(state.activeSession||state.trackAActiveSession){alert("Finish, resume, or end the preserved session first.");return}
    const task=TRACK_A_MASTERY_STATE.taskById(state.trackAMasterySchedule,taskId);if(!task||task.status!=="SCHEDULED"){alert("This formal task is not available to start.");return}
    if(task.dueAt&&new Date(task.dueAt)>new Date()){alert("This formal task is not due yet.");return}
    const rec=trackASkillRecord(task.skillId);if(task.type==="MAINTENANCE"&&rec.canonicalState!=="MASTERED"){alert("Day 21 maintenance stays locked until mastery is established.");return}if(task.type!=="MAINTENANCE"&&rec.canonicalState!=="PROVISIONAL"){alert("Formal retrieval and transfer require PROVISIONAL state.");return}
    const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok){alert("The app cannot verify persistence, so formal retrieval will not start.");return}
    const id=`ta_mastery_${Date.now()}_${task.id.replace(/[^A-Z0-9]/gi,"_")}`;const excluded=state.evidence.filter(e=>e.track==="A"&&e.skillId===task.skillId&&e.prompt_fingerprint).map(e=>e.prompt_fingerprint);const items=task.type==="TRANSFER"?TRACK_A_MASTERY.generateTransfer(task.skillId,id,excluded):TRACK_A_MASTERY.generateRetention(task.skillId,task.checkpoint,id,excluded);
    const phase=task.type==="TRANSFER"?"TRANSFER":task.type==="MAINTENANCE"?"MAINTENANCE":"DELAYED_RETRIEVAL";const session={id,mode:"TRACK_A_MASTERY",track:"A",subject:"Math",skillId:task.skillId,taskId:task.id,checkpoint:task.checkpoint,masteryType:task.type,startedAt:now(),phase,itemIndex:0,items,responses:[],status:"ACTIVE"};state.trackAActiveSession=session;if(!await save("start Track A formal mastery task"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(task.skillId),task};renderTrackAMasteryQuestion();
  }

  function renderTrackAMasteryQuestion(){
    const {session}=currentTrackA;const task=currentTrackA.task||TRACK_A_MASTERY_STATE.taskById(state.trackAMasterySchedule,session.taskId);currentTrackA.task=task;const q=session.items[session.itemIndex];if(!q){void finishTrackAMasteryTask();return}const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="masteryAnswer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="masteryFreeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill info">FORMAL_CONTROLLED · MASTERY_CHECK</span><h2 style="margin-top:10px">${escapeHTML(currentTrackA.skill.title)}</h2><p class="muted">${escapeHTML(masteryTaskLabel(task))} · probe ${session.itemIndex+1} of 2 · no teaching or correctness feedback between probes</p></div><span class="badge">Track A</span></div><div class="row"><button class="btn" onclick="window.MLUL.readTrackAMasteryQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div><div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div><label class="small">How was this question accessed?</label><select id="masteryAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select><div class="spacer"></div><label class="small">Assistance used on this formal probe <strong>(required)</strong></label><select id="masteryAssistance">${trackAAssistanceOptions(null)}</select><div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="masteryConfidence" value="sure"> Sure</label><label class="small"><input type="radio" name="masteryConfidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="masteryConfidence" value="guess"> Guessing</label></div><div class="spacer"></div><div class="row"><button id="masterySubmit" class="btn primary" onclick="window.MLUL.submitTrackAMasteryAnswer()">Lock formal probe</button><button class="btn" onclick="window.MLUL.saveAndExitTrackA()">Save & Exit</button></div><div id="masteryHalt"></div></div>`);renderSaveStatus();
  }

  function readTrackAMasteryQuestion(){const q=currentTrackA.session.items[currentTrackA.session.itemIndex];const selector=document.getElementById("masteryAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}speak(q.q+(q.choices?" Choices. "+q.choices.join('. '):""))}

  async function submitTrackAMasteryAnswer(){
    if(!currentTrackA||currentTrackA.halted)return;const {session}=currentTrackA;const task=currentTrackA.task||TRACK_A_MASTERY_STATE.taskById(state.trackAMasterySchedule,session.taskId);const q=session.items[session.itemIndex];let raw="",choiceIndex=null;if(q.choices){const chosen=document.querySelector("input[name=masteryAnswer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}choiceIndex=Number(chosen.value);raw=q.choices[choiceIndex]}else{raw=document.getElementById("masteryFreeAnswer")?.value.trim()||"";if(!raw){alert("Type Michael's answer exactly. 'I don't know' is valid.");return}}const assistance=document.getElementById("masteryAssistance")?.value;if(!ASSISTANCE_LEVELS.includes(assistance)){alert("Record the assistance level before locking this formal probe.");return}const accessSelector=document.getElementById("masteryAccess");const access=validAccessCondition(accessSelector?.value);const accessSource=accessSourceFor(accessSelector,access);const confidence=document.querySelector("input[name=masteryConfidence]:checked")?.value||"not_recorded";const prior=trackAPriorInstruction(session.skillId);const fresh=trackAPromptIsFresh(session.skillId,q);const reliable=q.validated===true;const correct=TRACK_A_DIAGNOSTIC.checkAnswer(q,raw,choiceIndex);const fp=TRACK_A_DIAGNOSTIC.fingerprint(q);const evidenceType=task.type==="TRANSFER"?"FORMAL_TRANSFER":task.type==="MAINTENANCE"?"FORMAL_MAINTENANCE":"FORMAL_DELAYED_RETRIEVAL";
    const ev={id:`ta_mastery_ev_${session.id}_${q.id}`,createdAt:now(),studentId:"michael",track:"A",evidence_class:"FORMAL_CONTROLLED",interaction_purpose:"MASTERY_CHECK",evidenceType,instruction_exposure_status:prior?"PRIOR_INSTRUCTION":null,cold_baseline_eligible:!prior,subject:"Math",skillId:session.skillId,itemId:q.id,prompt:q.q,prompt_fingerprint:fp,rawResponse:raw,selectedChoiceIndex:choiceIndex,isCorrect:correct,confidence,assistance_level:assistance,access_condition:access,access_condition_source:accessSource,fresh,reliable,checkpoint:task.checkpoint,transfer:task.type==="TRANSFER"||q.transfer===true,schedule_task_id:task.id,generator:{template_id:q.template_id,template_version:q.template_version,validated:q.validated===true},interpretation:null};pushEvidenceOnce(ev);pushSessionResponseOnce(session,ev);session.itemIndex++;state.trackAActiveSession=session;const submit=document.getElementById("masterySubmit");if(submit)submit.disabled=true;if(!await save("Track A formal mastery probe")){currentTrackA.halted=true;const h=document.getElementById("masteryHalt");if(h)h.innerHTML=`<div class="callout warn"><strong>Formal check halted.</strong> Required evidence did not save cleanly.</div>`;return}if(session.itemIndex<session.items.length){renderTrackAMasteryQuestion();return}await finishTrackAMasteryTask();
  }

  async function finishTrackAMasteryTask(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_MASTERY"||session.responses.length!==2)return;const task=TRACK_A_MASTERY_STATE.taskById(state.trackAMasterySchedule,session.taskId);if(!task)return;const completed=TRACK_A_MASTERY_STATE.completeTask(state.trackAMasterySchedule,task.id,session.responses,now());const rec=trackASkillRecord(session.skillId);rec.lastMasteryCheck={taskId:task.id,checkpoint:task.checkpoint,result:completed.result,passed:completed.passed,completedAt:completed.completedAt};if(task.type==="MAINTENANCE")rec.lastMaintenance=rec.lastMasteryCheck;
    if(completed.status==="FAILED"){if(task.type==="MAINTENANCE"){rec.maintenanceRepairRequired=true;rec.maintenanceRepairTaskId=task.id}else{rec.masteryRepairRequired=true;rec.masteryRepairTaskId=task.id}}
    rec.memoryStrength=TRACK_A_MASTERY_STATE.memoryStrength(state.trackAMasterySchedule,session.skillId);state.trackASkillState[session.skillId]=rec;let advanced=false;if(completed.status==="COMPLETED"&&task.type!=="MAINTENANCE"){const before=rec.canonicalState;const after=maybeFinalizeTrackAMastery(session.skillId);advanced=before!==after.canonicalState}if(completed.status==="COMPLETED"&&task.type==="MAINTENANCE"){const updated=trackASkillRecord(session.skillId);updated.masteryEvidence={...(updated.masteryEvidence||{}),maintenance_passed:true};updated.memoryStrength=TRACK_A_MASTERY_STATE.memoryStrength(state.trackAMasterySchedule,session.skillId);state.trackASkillState[session.skillId]=updated}
    session.status="COMPLETED";session.completedAt=now();state.trackAActiveSession=null;if(!await save("finish Track A formal mastery task"))return;const finalRec=trackASkillRecord(session.skillId);const label=completed.result==="PASSED"?(advanced?"MASTERED":"Formal checkpoint passed"):completed.result==="FAILED"?"Retrieval/transfer miss":"Unusable formal evidence";const guidance=completed.result==="PASSED"?(advanced?"Delayed retrieval and transfer both passed through the guarded lifecycle transition. Day 21 maintenance remains separate.":task.type==="MAINTENANCE"?"Maintenance passed. Memory strength can advance without inventing a new lifecycle state.":"The next formal checkpoint stays gated by its schedule."):completed.result==="FAILED"?"Teach the smallest missing component in Track B, preserve PRIOR_INSTRUCTION, then retry with fresh formal probes.":"Do not teach from an assisted/stale/unreliable set. Replace the unusable probes with fresh controlled probes.";
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${completed.result==="PASSED"?"good":"warn"}">${escapeHTML(label)}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_DIAGNOSTIC.skill(session.skillId).title)}</h2><p class="muted">${escapeHTML(masteryTaskLabel(task))} · Canonical state: ${escapeHTML(finalRec.canonicalState)} · Memory: ${escapeHTML(finalRec.memoryStrength||"FRAGILE")}</p><div class="callout"><strong>${escapeHTML(completed.result)}</strong><p class="small">${escapeHTML(guidance)}</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }

'''
rep('''  function backupView(){
''',mastery_functions+'''  function backupView(){
''','insert mastery session functions')

rep('''    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);const last=r.lastVerification?.result||r.lastRepair?.result||r.lastDiagnostic?.result||"—";return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(last)}</td><td>${trackAPriorInstruction(s.id)?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
''','''    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);const last=r.lastMaintenance?.result||r.lastMasteryCheck?.result||r.lastVerification?.result||r.lastRepair?.result||r.lastDiagnostic?.result||"—";return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(last)}</td><td>${trackAPriorInstruction(s.id)?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
''','parent mastery latest result')

rep('''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,startTrackARepair,readTrackARepairTeach,beginTrackARepairChecks,readTrackARepairQuestion,submitTrackARepairAnswer,nextTrackARepairCheck,startTrackAVerification,readTrackAVerificationQuestion,submitTrackAVerificationAnswer,resumeTrackAPath,resumeTrackADiagnostic,saveAndExitTrackA,endTrackAPath,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable,trackARouteForSkill}};
''','''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,startTrackARepair,readTrackARepairTeach,beginTrackARepairChecks,readTrackARepairQuestion,submitTrackARepairAnswer,nextTrackARepairCheck,startTrackAVerification,readTrackAVerificationQuestion,submitTrackAVerificationAnswer,initializeTrackAMastery,startTrackAMasteryTask,readTrackAMasteryQuestion,submitTrackAMasteryAnswer,replaceTrackAMasteryTask,finalizeTrackAMastery,resumeTrackAPath,resumeTrackADiagnostic,saveAndExitTrackA,endTrackAPath,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable,trackARouteForSkill,ensureTrackAMasterySchedule,masteryRouteInfo,maybeFinalizeTrackAMastery}};
''','mastery exports')

p.write_text(s)
print('Slice I app patch applied')
