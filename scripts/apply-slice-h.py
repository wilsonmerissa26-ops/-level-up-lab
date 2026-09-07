from pathlib import Path

p=Path('app.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch anchor: {label}')
    s=s.replace(old,new,1)

rep('  const TRACK_A_DIAGNOSTIC = window.LEVEL_UP_TRACK_A_DIAGNOSTIC;\n',
    '  const TRACK_A_DIAGNOSTIC = window.LEVEL_UP_TRACK_A_DIAGNOSTIC;\n  const TRACK_A_REMEDIATION = window.LEVEL_UP_TRACK_A_REMEDIATION;\n  const TRACK_A_VERIFICATION = window.LEVEL_UP_TRACK_A_VERIFICATION;\n',
    'Track A path globals')

old_status='''  function trackAStatusRow(skill){
    const rec=trackASkillRecord(skill.id);const prior=trackAPriorInstruction(skill.id);const active=state.trackAActiveSession?.skillId===skill.id&&trackAActiveRecoverable();
    const canStart=RUNTIME_ENABLED && !state.activeSession && !state.trackAActiveSession && ["UNKNOWN","DIAGNOSTIC"].includes(rec.canonicalState);
    const action=active?`<button class="btn ${RUNTIME_ENABLED?"primary":""}" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackADiagnostic()">${RUNTIME_ENABLED?"Resume":"Audit hold"}</button>`:`<button class="btn ${canStart?"primary":""}" ${canStart?"":"disabled"} onclick="window.MLUL.startTrackADiagnostic('${skill.id}')">${RUNTIME_ENABLED?(["UNKNOWN","DIAGNOSTIC"].includes(rec.canonicalState)?"Start 3-probe diagnostic":"State routed") : "Audit hold"}</button>`;
    return `<tr><td>${escapeHTML(skill.title)}<div class="tiny muted">${escapeHTML(skill.id)}</div></td><td>${escapeHTML(rec.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(rec.memoryStrength||"FRAGILE")}</td><td>${prior?"PRIOR_INSTRUCTION":"Cold baseline eligible if controlled"}</td><td>${escapeHTML(rec.lastDiagnostic?.result||"—")}</td><td>${action}</td></tr>`
  }
'''
new_status=r'''  function trackARouteForSkill(skillId,seen=new Set()){
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

  function trackAAction(route){
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

  function trackAStatusRow(skill){
    const rec=trackASkillRecord(skill.id);const prior=trackAPriorInstruction(skill.id);const active=state.trackAActiveSession?.skillId===skill.id&&trackAActiveRecoverable();const route=trackARouteForSkill(skill.id);
    const action=active?`<button class="btn ${RUNTIME_ENABLED?"primary":""}" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackAPath()">${RUNTIME_ENABLED?"Resume preserved path":"Audit hold"}</button>`:trackAAction(route);
    const last=rec.lastVerification?.result||rec.lastRepair?.result||rec.lastDiagnostic?.result||"—";
    return `<tr><td>${escapeHTML(skill.title)}<div class="tiny muted">${escapeHTML(skill.id)}</div></td><td>${escapeHTML(rec.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(rec.memoryStrength||"FRAGILE")}</td><td>${prior?"PRIOR_INSTRUCTION":"Cold baseline eligible if controlled"}</td><td>${escapeHTML(last)}</td><td>${action}</td></tr>`
  }
'''
rep(old_status,new_status,'adaptive status routing')

rep('''    const active=trackAActiveRecoverable()?`<div class="notice" style="border-color:#0369a1;background:#082f49;color:#bae6fd"><strong>Controlled diagnostic preserved.</strong> ${escapeHTML(TRACK_A_DIAGNOSTIC.skill(state.trackAActiveSession.skillId)?.title||state.trackAActiveSession.skillId)} stopped before completion. Submitted probes remain saved. <div class="row" style="margin-top:10px"><button class="btn primary" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackADiagnostic()">Resume</button><button class="btn" onclick="window.MLUL.endTrackADiagnostic()">End this set, keep evidence</button></div></div>`:"";
''','''    const active=trackAActiveRecoverable()?`<div class="notice" style="border-color:#0369a1;background:#082f49;color:#bae6fd"><strong>Adaptive path preserved.</strong> ${escapeHTML(TRACK_A_DIAGNOSTIC.skill(state.trackAActiveSession.skillId)?.title||state.trackAActiveSession.skillId)} stopped during ${escapeHTML(state.trackAActiveSession.mode||"Track A work")}. Submitted evidence remains saved. <div class="row" style="margin-top:10px"><button class="btn primary" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackAPath()">Resume</button><button class="btn" onclick="window.MLUL.endTrackAPath()">End this set, keep evidence</button></div></div>`:"";
''','generic Track A active notice')

rep('''  async function resumeTrackADiagnostic(){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. The controlled set remains preserved.");return}if(!trackAActiveRecoverable())return;const session=state.trackAActiveSession;session.status="ACTIVE";session.resumedAt=now();state.trackAActiveSession=session;if(!await save("resume Track A diagnostic"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(session.skillId)};if(session.itemIndex>=session.items.length){await finishTrackADiagnostic();return}renderTrackAQuestion();
  }

  async function saveAndExitTrackA(){
    if(!currentTrackA){location.hash="track-a";return}const session=currentTrackA.session;session.status="PAUSED";session.pausedAt=now();state.trackAActiveSession=session;if(!await save("pause Track A diagnostic"))return;speechSynthesis?.cancel?.();currentTrackA=null;location.hash="track-a";render();
  }

  async function endTrackADiagnostic(){
    const session=state.trackAActiveSession;if(!session)return;session.status="ENDED_PRESERVED";session.endedAt=now();state.trackAActiveSession=null;if(!await save("end Track A diagnostic set"))return;currentTrackA=null;render();
  }
''',r'''  async function resumeTrackAPath(){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. The preserved path remains saved.");return}if(!trackAActiveRecoverable())return;const session=state.trackAActiveSession;session.status="ACTIVE";session.resumedAt=now();state.trackAActiveSession=session;if(!await save("resume Track A path"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(session.skillId)};
    if(session.mode==="TRACK_A_REPAIR"){if(session.phase==="TEACH")renderTrackARepairTeach();else if(session.itemIndex>=session.items.length)await finishTrackARepair();else renderTrackARepairCheck();return}
    if(session.mode==="TRACK_A_VERIFICATION"){if(session.itemIndex>=session.items.length)await finishTrackAVerification();else renderTrackAVerificationQuestion();return}
    if(session.itemIndex>=session.items.length){await finishTrackADiagnostic();return}renderTrackAQuestion();
  }

  async function resumeTrackADiagnostic(){return resumeTrackAPath()}

  async function saveAndExitTrackA(){
    if(!currentTrackA){location.hash="track-a";return}const session=currentTrackA.session;session.status="PAUSED";session.pausedAt=now();state.trackAActiveSession=session;if(!await save("pause Track A path"))return;speechSynthesis?.cancel?.();currentTrackA=null;location.hash="track-a";render();
  }

  async function endTrackAPath(){
    const session=state.trackAActiveSession;if(!session)return;session.status="ENDED_PRESERVED";session.endedAt=now();state.trackAActiveSession=null;if(!await save("end Track A path set"))return;currentTrackA=null;render();
  }

  async function endTrackADiagnostic(){return endTrackAPath()}

  async function startTrackARepair(skillId){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not start repair yet.");return}
    if(!TRACK_A_REMEDIATION||!TRACK_A_ENGINE){alert("Track A remediation module is unavailable.");return}
    if(state.activeSession||state.trackAActiveSession){alert("Finish, resume, or end the preserved session first.");return}
    const route=trackARouteForSkill(skillId);if(route.type!=="REPAIR"||route.skillId!==skillId){alert("The adaptive route requires a different prerequisite step first.");return}
    const rec=trackASkillRecord(skillId);if(!["GAP","LEARNING","PRACTICING"].includes(rec.canonicalState)){alert("This skill is not currently routed to targeted repair.");return}
    const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok){alert("The app cannot verify persistence, so repair will not start.");return}
    if(rec.canonicalState==="GAP"){const t=TRACK_A_ENGINE.transitionDecision("GAP","LEARNING",{instruction_started:true});if(!t.allowed)throw new Error(`Track A repair transition blocked: ${t.reason}`);rec.canonicalState="LEARNING";rec.lastTransitionReason=t.reason;rec.learningStartedAt=now()}
    const repair=TRACK_A_REMEDIATION.repair(skillId);const id=`ta_repair_${Date.now()}_${skillId.replace(/[^A-Z0-9]/gi,"_")}`;const items=TRACK_A_REMEDIATION.generateComponentChecks(skillId,id);const session={id,mode:"TRACK_A_REPAIR",track:"B",subject:"Math",skillId,startedAt:now(),phase:"TEACH",itemIndex:0,items,responses:[],status:"ACTIVE",teach_access_condition:null,teach_access_condition_source:"UNRECORDED"};state.trackASkillState[skillId]=rec;state.trackAActiveSession=session;if(!await save("start targeted Track B repair"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(skillId),repair};renderTrackARepairTeach();
  }

  function renderTrackARepairTeach(){
    const {session}=currentTrackA;const repair=currentTrackA.repair||TRACK_A_REMEDIATION.repair(session.skillId);currentTrackA.repair=repair;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill warn">INFORMAL_TRACK_B · PRIOR_INSTRUCTION</span><h2 style="margin-top:10px">${escapeHTML(repair.title)}</h2><p class="muted">Targeted correction for the smallest identified component: ${escapeHTML(repair.component)}</p></div><span class="badge warn">Teaching</span></div><div class="row"><button class="btn" onclick="window.MLUL.readTrackARepairTeach()">🔊 Read lesson</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div><div class="spacer"></div>${repair.teach.map((t,i)=>`<div class="teacher"><strong>Repair ${i+1}</strong><p>${escapeHTML(t[0])}</p><p class="small muted">${escapeHTML(t[1])}</p></div>`).join("")}<label class="small">How was this teaching block accessed?</label><select id="trackARepairTeachAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(session.teach_access_condition)}</select><div class="spacer"></div><label class="small">Michael's say-back (optional)</label><textarea id="trackARepairSayBack" rows="3" placeholder="Type exactly what Michael says"></textarea><div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.beginTrackARepairChecks()">Try the component check</button><button class="btn" onclick="window.MLUL.saveAndExitTrackA()">Save & Exit</button></div></div>`);renderSaveStatus();
  }

  function readTrackARepairTeach(){
    if(!currentTrackA)return;const repair=currentTrackA.repair||TRACK_A_REMEDIATION.repair(currentTrackA.session.skillId);const selector=document.getElementById("trackARepairTeachAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}currentTrackA.session.teach_access_condition="SYSTEM_READ_ALOUD";currentTrackA.session.teach_access_condition_source="OBSERVED";speak(repair.teach.map(x=>x.join('. ')).join('. '));
  }

  async function beginTrackARepairChecks(){
    const session=currentTrackA.session;const selector=document.getElementById("trackARepairTeachAccess");const access=validAccessCondition(selector?.value||session.teach_access_condition);const source=access?(selector?.dataset?.accessConditionSource||session.teach_access_condition_source||"UNRECORDED"):"UNRECORDED";const sayBack=document.getElementById("trackARepairSayBack")?.value.trim()||"";
    session.teach_access_condition=access;session.teach_access_condition_source=source;session.phase="COMPONENT_CHECK";session.itemIndex=0;session.instructionDelivered=true;
    pushEvidenceOnce({id:`ta_repair_teach_${session.id}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",interaction_purpose:"INSTRUCTIONAL",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:"Math",skillId:session.skillId,evidenceType:"INSTRUCTION_DELIVERED",prompt:`Targeted repair instruction: ${TRACK_A_REMEDIATION.repair(session.skillId).title}`,rawResponse:sayBack,studentResponsePresent:!!sayBack,isCorrect:null,assistance_level:"TAUGHT",access_condition:access,access_condition_source:source,interpretation:null});state.trackAActiveSession=session;if(!await save("begin targeted repair component checks"))return;renderTrackARepairCheck();
  }

  function renderTrackARepairCheck(){
    const {session}=currentTrackA;const q=session.items[session.itemIndex];if(!q){void finishTrackARepair();return}const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="repairAnswer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="repairFreeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill warn">Track B repair check</span><h2 style="margin-top:10px">Component check ${session.itemIndex+1} of ${session.items.length}</h2><p class="muted">Teaching feedback is allowed after Michael locks his answer.</p></div><span class="badge">${escapeHTML(currentTrackA.skill.title)}</span></div><div class="row"><button class="btn" onclick="window.MLUL.readTrackARepairQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div><div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div><label class="small">How was this question accessed?</label><select id="repairAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select><div class="spacer"></div><label class="small">Assistance used on this check <strong>(required)</strong></label><select id="repairAssistance">${trackAAssistanceOptions(null)}</select><div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="repairConfidence" value="sure"> Sure</label><label class="small"><input type="radio" name="repairConfidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="repairConfidence" value="guess"> Guessing</label></div><div class="spacer"></div><button id="repairSubmit" class="btn primary" onclick="window.MLUL.submitTrackARepairAnswer()">Lock answer</button><div id="repairFeedback"></div></div>`);renderSaveStatus();
  }

  function readTrackARepairQuestion(){const q=currentTrackA.session.items[currentTrackA.session.itemIndex];const selector=document.getElementById("repairAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}speak(q.q+(q.choices?" Choices. "+q.choices.join('. '):""))}

  async function submitTrackARepairAnswer(){
    if(!currentTrackA||currentTrackA.halted)return;const {session}=currentTrackA;const q=session.items[session.itemIndex];let raw="",choiceIndex=null;if(q.choices){const chosen=document.querySelector("input[name=repairAnswer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}choiceIndex=Number(chosen.value);raw=q.choices[choiceIndex]}else{raw=document.getElementById("repairFreeAnswer")?.value.trim()||"";if(!raw){alert("Type Michael's answer exactly. 'I don't know' is valid.");return}}
    const assistance=document.getElementById("repairAssistance")?.value;if(!ASSISTANCE_LEVELS.includes(assistance)){alert("Record the assistance level before locking this repair check.");return}const accessSelector=document.getElementById("repairAccess");const access=validAccessCondition(accessSelector?.value);const accessSource=accessSourceFor(accessSelector,access);const confidence=document.querySelector("input[name=repairConfidence]:checked")?.value||"not_recorded";const correct=TRACK_A_DIAGNOSTIC.checkAnswer(q,raw,choiceIndex);
    const ev={id:`ta_repair_ev_${session.id}_${q.id}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",interaction_purpose:"PRACTICE",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:"Math",skillId:session.skillId,itemId:q.id,prompt:q.q,rawResponse:raw,selectedChoiceIndex:choiceIndex,isCorrect:correct,confidence,assistance_level:assistance,access_condition:access,access_condition_source:accessSource,fresh:true,reliable:q.validated===true,generator:{template_id:q.template_id,template_version:q.template_version,validated:q.validated===true},interpretation:correct?"targeted component check correct":"targeted component check needs more instruction"};pushEvidenceOnce(ev);pushSessionResponseOnce(session,ev);state.trackAActiveSession=session;const submit=document.getElementById("repairSubmit");if(submit)submit.disabled=true;if(!await save("targeted repair component answer")){currentTrackA.halted=true;return}const expected=q.choices?q.choices[q.answer]:q.free;const fb=document.getElementById("repairFeedback");fb.className=`feedback ${correct?"good":"warn"}`;fb.innerHTML=`<strong>${correct?"Yes — that's it.":"Not yet."}</strong><div class="small" style="margin-top:6px">Answer: ${escapeHTML(expected)}</div><button class="btn ${correct?"good":"warn"}" style="margin-top:10px" onclick="window.MLUL.nextTrackARepairCheck()">${session.itemIndex===session.items.length-1?"Finish repair":"Next"}</button>`;
  }

  async function nextTrackARepairCheck(){const session=currentTrackA.session;session.itemIndex++;state.trackAActiveSession=session;if(!await save("next targeted repair check"))return;if(session.itemIndex<session.items.length){renderTrackARepairCheck();return}await finishTrackARepair()}

  async function finishTrackARepair(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_REPAIR"||session.responses.length!==session.items.length)return;const verified=session.responses.every(e=>e.isCorrect===true&&e.assistance_level==="INDEPENDENT"&&e.reliable===true);const rec=trackASkillRecord(session.skillId);let transitionReason=null;if(verified&&rec.canonicalState==="LEARNING"){const t=TRACK_A_ENGINE.transitionDecision("LEARNING","PRACTICING",{smallest_component_verified:true});if(!t.allowed)throw new Error(`Track A component transition blocked: ${t.reason}`);rec.canonicalState="PRACTICING";rec.lastTransitionReason=t.reason;transitionReason=t.reason}
    rec.lastRepair={sessionId:session.id,result:verified?"COMPONENT_VERIFIED":"NEEDS_MORE_INSTRUCTION",verified,completedAt:now(),independent_check_count:session.responses.filter(e=>e.assistance_level==="INDEPENDENT").length,transition_reason:transitionReason};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();state.trackAActiveSession=null;if(!await save("finish targeted Track B repair"))return;document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${verified?"good":"warn"}">${verified?"Component verified":"More repair needed"}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_REMEDIATION.repair(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${verified?"Next: two fresh FORMAL_CONTROLLED verification probes.":"Do not promote the skill from learning yet."}</strong><p class="small">The component check requires every repair-check item correct, reliable, and INDEPENDENT. This is not a percent-score shortcut.</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }

  async function startTrackAVerification(skillId){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not take verification yet.");return}if(!TRACK_A_VERIFICATION||!TRACK_A_ENGINE){alert("Track A verification module is unavailable.");return}if(state.activeSession||state.trackAActiveSession){alert("Finish, resume, or end the preserved session first.");return}const rec=trackASkillRecord(skillId);if(rec.canonicalState!=="PRACTICING"){alert("Formal verification requires the skill to be in PRACTICING.");return}if(rec.lastRepair?.result!=="COMPONENT_VERIFIED"){alert("The smallest corrected component must be explicitly verified before formal verification.");return}const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok){alert("The app cannot verify persistence, so formal verification will not start.");return}
    const id=`ta_verify_${Date.now()}_${skillId.replace(/[^A-Z0-9]/gi,"_")}`;const excluded=state.evidence.filter(e=>e.track==="A"&&e.skillId===skillId&&e.prompt_fingerprint).map(e=>e.prompt_fingerprint);const items=TRACK_A_VERIFICATION.generateVerification(skillId,id,excluded);const session={id,mode:"TRACK_A_VERIFICATION",track:"A",subject:"Math",skillId,startedAt:now(),phase:"VERIFICATION",itemIndex:0,items,responses:[],status:"ACTIVE"};state.trackAActiveSession=session;if(!await save("start Track A two-probe verification"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(skillId)};renderTrackAVerificationQuestion();
  }

  function renderTrackAVerificationQuestion(){
    const {session}=currentTrackA;const q=session.items[session.itemIndex];if(!q){void finishTrackAVerification();return}const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="verifyAnswer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="verifyFreeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill info">FORMAL_CONTROLLED · MASTERY_CHECK</span><h2 style="margin-top:10px">${escapeHTML(currentTrackA.skill.title)}</h2><p class="muted">Fresh verification probe ${session.itemIndex+1} of 2 · no teaching or correctness feedback between probes</p></div><span class="badge">Track A</span></div><div class="row"><button class="btn" onclick="window.MLUL.readTrackAVerificationQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div><div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div><label class="small">How was this question accessed?</label><select id="verifyAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select><div class="spacer"></div><label class="small">Assistance used on this formal probe <strong>(required)</strong></label><select id="verifyAssistance">${trackAAssistanceOptions(null)}</select><div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="verifyConfidence" value="sure"> Sure</label><label class="small"><input type="radio" name="verifyConfidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="verifyConfidence" value="guess"> Guessing</label></div><div class="spacer"></div><div class="row"><button id="verifySubmit" class="btn primary" onclick="window.MLUL.submitTrackAVerificationAnswer()">Lock verification probe</button><button class="btn" onclick="window.MLUL.saveAndExitTrackA()">Save & Exit</button></div><div id="verifyHalt"></div></div>`);renderSaveStatus();
  }

  function readTrackAVerificationQuestion(){const q=currentTrackA.session.items[currentTrackA.session.itemIndex];const selector=document.getElementById("verifyAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}speak(q.q+(q.choices?" Choices. "+q.choices.join('. '):""))}

  async function submitTrackAVerificationAnswer(){
    if(!currentTrackA||currentTrackA.halted)return;const {session}=currentTrackA;const q=session.items[session.itemIndex];let raw="",choiceIndex=null;if(q.choices){const chosen=document.querySelector("input[name=verifyAnswer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}choiceIndex=Number(chosen.value);raw=q.choices[choiceIndex]}else{raw=document.getElementById("verifyFreeAnswer")?.value.trim()||"";if(!raw){alert("Type Michael's answer exactly. 'I don't know' is valid.");return}}const assistance=document.getElementById("verifyAssistance")?.value;if(!ASSISTANCE_LEVELS.includes(assistance)){alert("Record the assistance level before locking this formal verification probe.");return}const accessSelector=document.getElementById("verifyAccess");const access=validAccessCondition(accessSelector?.value);const accessSource=accessSourceFor(accessSelector,access);const confidence=document.querySelector("input[name=verifyConfidence]:checked")?.value||"not_recorded";const prior=trackAPriorInstruction(session.skillId);const fresh=trackAPromptIsFresh(session.skillId,q);const reliable=q.validated===true;const correct=TRACK_A_DIAGNOSTIC.checkAnswer(q,raw,choiceIndex);const fp=TRACK_A_DIAGNOSTIC.fingerprint(q);
    const ev={id:`ta_verify_ev_${session.id}_${q.id}`,createdAt:now(),studentId:"michael",track:"A",evidence_class:"FORMAL_CONTROLLED",interaction_purpose:"MASTERY_CHECK",instruction_exposure_status:prior?"PRIOR_INSTRUCTION":null,cold_baseline_eligible:!prior,subject:"Math",skillId:session.skillId,itemId:q.id,prompt:q.q,prompt_fingerprint:fp,rawResponse:raw,selectedChoiceIndex:choiceIndex,isCorrect:correct,confidence,assistance_level:assistance,access_condition:access,access_condition_source:accessSource,fresh,reliable,generator:{template_id:q.template_id,template_version:q.template_version,validated:q.validated===true},interpretation:null};pushEvidenceOnce(ev);pushSessionResponseOnce(session,ev);session.itemIndex++;state.trackAActiveSession=session;const submit=document.getElementById("verifySubmit");if(submit)submit.disabled=true;if(!await save("Track A verification probe")){currentTrackA.halted=true;const h=document.getElementById("verifyHalt");if(h)h.innerHTML=`<div class="callout warn"><strong>Verification halted.</strong> Required evidence did not save cleanly.</div>`;return}if(session.itemIndex<session.items.length){renderTrackAVerificationQuestion();return}await finishTrackAVerification();
  }

  async function finishTrackAVerification(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_VERIFICATION"||session.responses.length!==2)return;const probes=session.responses.map(e=>({fresh:e.fresh===true,reliable:e.reliable===true,assistance_level:e.assistance_level,correct:e.isCorrect===true}));const result=TRACK_A_ENGINE.evaluateTwoProbeVerification(probes);const rec=trackASkillRecord(session.skillId);if(result.result==="VERIFICATION_PASSED"){const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,"PROVISIONAL",{verification_result:result.result});if(!t.allowed)throw new Error(`Track A verification transition blocked: ${t.reason}`);rec.canonicalState="PROVISIONAL";rec.lastTransitionReason=t.reason}rec.lastVerification={sessionId:session.id,result:result.result,correct_count:result.correct_count??null,next_action:result.next_action,completedAt:now()};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A verification"))return;const passed=result.result==="VERIFICATION_PASSED";document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${passed?"good":"warn"}">${escapeHTML(result.result)}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_DIAGNOSTIC.skill(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(result.next_action)}</strong><p class="small">${passed?"The skill is PROVISIONAL only. Formal delayed retrieval plus transfer are still required before mastery.":result.result==="VERIFICATION_FAILED"?"Return to the smallest missing component and reteach. Do not promote the lifecycle state.":"Replace unusable formal probes; assisted, stale, or unreliable probes do not count."}</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }
''','generic resume + adaptive repair and verification')

rep('''    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(r.lastDiagnostic?.result||"—")}</td><td>${r.lastDiagnostic?.cold_baseline_eligible===false?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
''','''    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);const last=r.lastVerification?.result||r.lastRepair?.result||r.lastDiagnostic?.result||"—";return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(last)}</td><td>${trackAPriorInstruction(s.id)?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
''','parent latest Track A path result')

rep('''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,resumeTrackADiagnostic,saveAndExitTrackA,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable}};
''','''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,startTrackARepair,readTrackARepairTeach,beginTrackARepairChecks,readTrackARepairQuestion,submitTrackARepairAnswer,nextTrackARepairCheck,startTrackAVerification,readTrackAVerificationQuestion,submitTrackAVerificationAnswer,resumeTrackAPath,resumeTrackADiagnostic,saveAndExitTrackA,endTrackAPath,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable,trackARouteForSkill}};
''','MLUL adaptive path exports')

p.write_text(s)
print('Slice H app patch applied')
