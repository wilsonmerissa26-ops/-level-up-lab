from pathlib import Path

p=Path('app.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch anchor: {label}')
    s=s.replace(old,new,1)

rep('  const REVIEW_ENGINE = window.LEVEL_UP_REVIEW_ENGINE;\n',
    '  const REVIEW_ENGINE = window.LEVEL_UP_REVIEW_ENGINE;\n  const TRACK_A_ENGINE = window.LEVEL_UP_TRACK_A_ENGINE;\n  const TRACK_A_DIAGNOSTIC = window.LEVEL_UP_TRACK_A_DIAGNOSTIC;\n',
    'Track A globals')
rep('  let current = null;\n', '  let current = null;\n  let currentTrackA = null;\n', 'currentTrackA')
rep('    lessonState:{},\n    evidence:[],',
    '    lessonState:{},\n    trackASkillState:{},\n    trackAActiveSession:null,\n    evidence:[],',
    'fresh Track A state')
rep('    if(!Array.isArray(value.reviewSchedule)) value.reviewSchedule=[];\n    if(!value.settings || typeof value.settings!=="object")',
    '    if(!Array.isArray(value.reviewSchedule)) value.reviewSchedule=[];\n    if(!value.trackASkillState || typeof value.trackASkillState!=="object") value.trackASkillState={};\n    if(!Object.prototype.hasOwnProperty.call(value,"trackAActiveSession")) value.trackAActiveSession=null;\n    if(!value.settings || typeof value.settings!=="object")',
    'normalize Track A state')

old_track_a='''  function trackA(){
    return shell(`<div class="grid"><div class="card c8"><h2>Track A · Controlled Evidence</h2><p class="muted">Track A is the formal diagnostic/mastery lane. It is intentionally protected from Track B teaching contamination.</p><div class="callout"><strong>State sequence:</strong> UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED</div></div><div class="card c4"><h3>Locked rule</h3><p class="small muted">A skill taught in Track B is never later called a clean cold baseline. Formal evidence carries PRIOR_INSTRUCTION.</p></div><div class="card c12"><h3>Mastery rule</h3><p>Three fresh independent probes can support PROVISIONAL evidence. MASTERED still requires delayed retrieval plus transfer. “Cleared” is not the same as mastered.</p><p class="small muted">Track A delivery UI is intentionally not active yet. We are using Track B first while the permanent controlled diagnostic slice is built.</p></div></div>`)
  }
'''
new_track_a=r'''  function trackASkillRecord(skillId){
    return state.trackASkillState?.[skillId]||{canonicalState:"UNKNOWN",memoryStrength:"FRAGILE"}
  }

  function trackAPriorInstruction(skillId){
    return state.evidence.some(e=>e.skillId===skillId && e.instruction_exposure_status==="PRIOR_INSTRUCTION")
  }

  function trackAPromptIsFresh(skillId,item){
    const fp=TRACK_A_DIAGNOSTIC.fingerprint(item);
    return !state.evidence.some(e=>e.track==="A" && e.skillId===skillId && e.prompt_fingerprint===fp)
  }

  function trackAAssistanceOptions(selected=null){
    const labels={INDEPENDENT:"Independent",CLARIFIED:"Directions clarified",HINTED:"Hinted",GUIDED:"Guided",TAUGHT:"Taught during item",PARENT_ASSISTED:"Parent assisted"};
    return `<option value="" ${selected?"":"selected"}>Record assistance used</option>`+ASSISTANCE_LEVELS.map(v=>`<option value="${v}" ${v===selected?"selected":""}>${labels[v]}</option>`).join("")
  }

  function trackAActiveRecoverable(){
    const x=state.trackAActiveSession;
    return !!(x && ["ACTIVE","PAUSED","INTERRUPTED_PRESERVED"].includes(x.status) && TRACK_A_DIAGNOSTIC?.skill(x.skillId))
  }

  function trackAStatusRow(skill){
    const rec=trackASkillRecord(skill.id);const prior=trackAPriorInstruction(skill.id);const active=state.trackAActiveSession?.skillId===skill.id&&trackAActiveRecoverable();
    const canStart=RUNTIME_ENABLED && !state.activeSession && !state.trackAActiveSession && ["UNKNOWN","DIAGNOSTIC"].includes(rec.canonicalState);
    const action=active?`<button class="btn ${RUNTIME_ENABLED?"primary":""}" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackADiagnostic()">${RUNTIME_ENABLED?"Resume":"Audit hold"}</button>`:`<button class="btn ${canStart?"primary":""}" ${canStart?"":"disabled"} onclick="window.MLUL.startTrackADiagnostic('${skill.id}')">${RUNTIME_ENABLED?(["UNKNOWN","DIAGNOSTIC"].includes(rec.canonicalState)?"Start 3-probe diagnostic":"State routed") : "Audit hold"}</button>`;
    return `<tr><td>${escapeHTML(skill.title)}<div class="tiny muted">${escapeHTML(skill.id)}</div></td><td>${escapeHTML(rec.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(rec.memoryStrength||"FRAGILE")}</td><td>${prior?"PRIOR_INSTRUCTION":"Cold baseline eligible if controlled"}</td><td>${escapeHTML(rec.lastDiagnostic?.result||"—")}</td><td>${action}</td></tr>`
  }

  function trackA(){
    if(!TRACK_A_ENGINE||!TRACK_A_DIAGNOSTIC)return shell(`<div class="card"><h2>Track A</h2><p class="warn">Track A engine is unavailable. Student use remains blocked.</p></div>`);
    const rows=TRACK_A_DIAGNOSTIC.SKILLS.map(trackAStatusRow).join("");
    const active=trackAActiveRecoverable()?`<div class="notice" style="border-color:#0369a1;background:#082f49;color:#bae6fd"><strong>Controlled diagnostic preserved.</strong> ${escapeHTML(TRACK_A_DIAGNOSTIC.skill(state.trackAActiveSession.skillId)?.title||state.trackAActiveSession.skillId)} stopped before completion. Submitted probes remain saved. <div class="row" style="margin-top:10px"><button class="btn primary" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackADiagnostic()">Resume</button><button class="btn" onclick="window.MLUL.endTrackADiagnostic()">End this set, keep evidence</button></div></div>`:"";
    return shell(`<div class="grid"><div class="card c8"><h2>Track A · Controlled Evidence</h2><p class="muted">Formal diagnostics use fresh, reliable probes and keep access support separate from instructional assistance. No answer feedback is given between probes.</p><div class="callout"><strong>State sequence:</strong> UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED</div></div><div class="card c4"><h3>3-probe rule</h3><p class="small">3/3 controlled → PROVISIONAL support. 2/3 → minimal correction + 2 fresh verification probes. 0–1/3 → trace downward to the first unstable prerequisite.</p></div><div class="card c12">${active}<h3>Math controlled diagnostic map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Canonical state</th><th>Memory</th><th>Baseline</th><th>Last result</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div><div class="callout warn small" style="margin-top:14px"><strong>Release gate:</strong> this UI is implemented but student runtime stays disabled until the separate target-browser persistence audit passes.</div></div></div>`)
  }

  async function startTrackADiagnostic(skillId){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not take Track A diagnostics yet.");return}
    if(!TRACK_A_ENGINE||!TRACK_A_DIAGNOSTIC){alert("Track A engine is not loaded.");return}
    if(state.activeSession||state.trackAActiveSession){alert("Finish, resume, or end the preserved session before starting a Track A diagnostic.");return}
    const skill=TRACK_A_DIAGNOSTIC.skill(skillId);if(!skill)return;
    const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok){alert("The app cannot verify persistence, so the diagnostic will not start.");return}
    const rec=trackASkillRecord(skillId);const from=rec.canonicalState||"UNKNOWN";
    if(!["UNKNOWN","DIAGNOSTIC"].includes(from)){alert(`This skill is already routed to ${from}. Use the next required evidence path instead of restarting the cold diagnostic.`);return}
    const decision=TRACK_A_ENGINE.transitionDecision(from,"DIAGNOSTIC",{diagnostic_started:true});if(!decision.allowed){alert("Track A state guard blocked this diagnostic.");return}
    const id=`ta_sess_${Date.now()}_${skillId.replace(/[^A-Z0-9]/gi,"_")}`;const items=TRACK_A_DIAGNOSTIC.generateDiagnostic(skillId,id);
    const session={id,mode:"TRACK_A_DIAGNOSTIC",track:"A",subject:"Math",skillId,startedAt:now(),phase:"DIAGNOSTIC",itemIndex:0,items,responses:[],status:"ACTIVE"};
    state.trackASkillState[skillId]={...rec,canonicalState:"DIAGNOSTIC",diagnosticStartedAt:now(),lastTransitionReason:decision.reason};state.trackAActiveSession=session;
    if(!await save("start Track A diagnostic"))return;
    currentTrackA={session,skill};renderTrackAQuestion();
  }

  function renderTrackAQuestion(){
    const {session,skill}=currentTrackA;const q=session.items[session.itemIndex];if(!q){void finishTrackADiagnostic();return}
    const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="trackAAnswer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="trackAFreeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill info">FORMAL_CONTROLLED</span><h2 style="margin-top:10px">${escapeHTML(skill.title)}</h2><p class="muted">Controlled probe ${session.itemIndex+1} of 3 · no teaching or correctness feedback between probes</p></div><span class="badge">Track A</span></div><div class="row"><button class="btn" onclick="window.MLUL.readTrackAQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div><div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div><label class="small">How was this question accessed?</label><select id="trackAAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select><div class="spacer"></div><label class="small">Assistance used on this probe <strong>(required)</strong></label><select id="trackAAssistance">${trackAAssistanceOptions(null)}</select><div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="trackAConfidence" value="sure"> Sure</label><label class="small"><input type="radio" name="trackAConfidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="trackAConfidence" value="guess"> Guessing</label></div><div class="spacer"></div><div class="row"><button id="trackASubmit" class="btn primary" onclick="window.MLUL.submitTrackAAnswer()">Lock probe</button><button class="btn" onclick="window.MLUL.saveAndExitTrackA()">Save & Exit</button></div><div id="trackAHalt"></div></div>`);renderSaveStatus();window.scrollTo({top:0,behavior:"smooth"});
  }

  function readTrackAQuestion(){
    if(!currentTrackA)return;const q=currentTrackA.session.items[currentTrackA.session.itemIndex];const selector=document.getElementById("trackAAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}speak(q.q+(q.choices?" Choices. "+q.choices.join(". "):""));
  }

  async function submitTrackAAnswer(){
    if(!currentTrackA||currentTrackA.halted)return;const {session}=currentTrackA;const q=session.items[session.itemIndex];let raw="",choiceIndex=null;
    if(q.choices){const chosen=document.querySelector("input[name=trackAAnswer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}choiceIndex=Number(chosen.value);raw=q.choices[choiceIndex]}
    else{const el=document.getElementById("trackAFreeAnswer");raw=el?.value.trim()||"";if(!raw){alert("Type Michael's answer exactly. 'I don't know' is a valid response.");return}}
    const assistance=document.getElementById("trackAAssistance")?.value;if(!ASSISTANCE_LEVELS.includes(assistance)){alert("Record the assistance level before locking this formal probe.");return}
    const accessSelector=document.getElementById("trackAAccess");const accessCondition=validAccessCondition(accessSelector?.value);const accessSource=accessSourceFor(accessSelector,accessCondition);const confidence=document.querySelector("input[name=trackAConfidence]:checked")?.value||"not_recorded";
    const priorInstruction=trackAPriorInstruction(session.skillId);const fresh=trackAPromptIsFresh(session.skillId,q);const reliable=q.validated===true;const correct=TRACK_A_DIAGNOSTIC.checkAnswer(q,raw,choiceIndex);const fp=TRACK_A_DIAGNOSTIC.fingerprint(q);
    const ev={id:`ta_ev_${session.id}_${q.id}`,createdAt:now(),studentId:"michael",track:"A",evidence_class:"FORMAL_CONTROLLED",interaction_purpose:"DIAGNOSTIC",instruction_exposure_status:priorInstruction?"PRIOR_INSTRUCTION":null,cold_baseline_eligible:!priorInstruction,subject:"Math",skillId:session.skillId,itemId:q.id,prompt:q.q,prompt_fingerprint:fp,rawResponse:raw,selectedChoiceIndex:choiceIndex,isCorrect:correct,confidence,assistance_level:assistance,access_condition:accessCondition,access_condition_source:accessSource,fresh,reliable,generator:{template_id:q.template_id,template_version:q.template_version,validated:q.validated===true},interpretation:null};
    pushEvidenceOnce(ev);pushSessionResponseOnce(session,ev);session.itemIndex++;state.trackAActiveSession=session;
    const submit=document.getElementById("trackASubmit");if(submit)submit.disabled=true;
    if(!await save("Track A controlled probe")){currentTrackA.halted=true;const h=document.getElementById("trackAHalt");if(h)h.innerHTML=`<div class="callout warn"><strong>Session halted.</strong> The required write did not complete cleanly. Do not continue this diagnostic until the saved state is recovered.</div>`;return}
    if(session.itemIndex<session.items.length){renderTrackAQuestion();return}await finishTrackADiagnostic();
  }

  async function finishTrackADiagnostic(){
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.responses.length!==3)return;
    const probes=session.responses.map(e=>({fresh:e.fresh===true,reliable:e.reliable===true,assistance_level:e.assistance_level,correct:e.isCorrect===true}));const prior=session.responses.some(e=>e.instruction_exposure_status==="PRIOR_INSTRUCTION");const result=TRACK_A_ENGINE.evaluateThreeProbeDiagnostic(probes,{priorInstruction:prior,contradictoryEvidence:false});
    const rec=trackASkillRecord(session.skillId);let target=rec.canonicalState||"DIAGNOSTIC";if(result.result==="PROVISIONAL_SUPPORTED")target="PROVISIONAL";else if(["MISS_DETECTED","PREREQUISITE_TRACE_REQUIRED"].includes(result.result))target="GAP";
    if(target!==rec.canonicalState){const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,target,{diagnostic_result:result.result});if(!t.allowed)throw new Error(`Track A transition blocked: ${t.reason}`);rec.canonicalState=target;rec.lastTransitionReason=t.reason}
    const prerequisiteTarget=result.result==="PREREQUISITE_TRACE_REQUIRED"?TRACK_A_DIAGNOSTIC.prerequisiteOf(session.skillId):null;
    rec.lastDiagnostic={sessionId:session.id,result:result.result,correct_count:result.correct_count,next_action:result.next_action,reason:result.reason,cold_baseline_eligible:result.cold_baseline_eligible,instruction_exposure_status:result.instruction_exposure_status,completedAt:now(),prerequisite_target:prerequisiteTarget,verification_required:result.result==="MISS_DETECTED"?2:0};state.trackASkillState[session.skillId]=rec;
    session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A diagnostic"))return;
    const label=result.result==="PROVISIONAL_SUPPORTED"?"Provisional evidence supported":result.result==="MISS_DETECTED"?"One miss found":"Prerequisite trace needed";const route=result.result==="PREREQUISITE_TRACE_REQUIRED"?(prerequisiteTarget?`Next controlled target: ${TRACK_A_DIAGNOSTIC.skill(prerequisiteTarget).title}.`:"This is the root skill. Teach the smallest missing component before verification."):result.result==="MISS_DETECTED"?"Give the smallest correction, then use two fresh controlled verification probes.":"Schedule delayed retrieval and transfer before mastery can be considered.";
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${result.result==="PROVISIONAL_SUPPORTED"?"good":"warn"}">${escapeHTML(label)}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_DIAGNOSTIC.skill(session.skillId)?.title||session.skillId)}</h2><div class="big">${result.correct_count==null?"—":result.correct_count+"/3"}</div><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(result.next_action)}</strong><p class="small">${escapeHTML(result.reason)}</p><p class="small">${escapeHTML(route)}</p></div>${prior?`<div class="callout warn"><strong>Prior instruction attached.</strong> This formal evidence remains useful, but it is not a clean cold baseline.</div>`:""}<div class="row"><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div></div>`);renderSaveStatus();currentTrackA=null;
  }

  async function resumeTrackADiagnostic(){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. The controlled set remains preserved.");return}if(!trackAActiveRecoverable())return;const session=state.trackAActiveSession;session.status="ACTIVE";session.resumedAt=now();state.trackAActiveSession=session;if(!await save("resume Track A diagnostic"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(session.skillId)};if(session.itemIndex>=session.items.length){await finishTrackADiagnostic();return}renderTrackAQuestion();
  }

  async function saveAndExitTrackA(){
    if(!currentTrackA){location.hash="track-a";return}const session=currentTrackA.session;session.status="PAUSED";session.pausedAt=now();state.trackAActiveSession=session;if(!await save("pause Track A diagnostic"))return;speechSynthesis?.cancel?.();currentTrackA=null;location.hash="track-a";render();
  }

  async function endTrackADiagnostic(){
    const session=state.trackAActiveSession;if(!session)return;session.status="ENDED_PRESERVED";session.endedAt=now();state.trackAActiveSession=null;if(!await save("end Track A diagnostic set"))return;currentTrackA=null;render();
  }
'''
rep(old_track_a,new_track_a,'Track A UI replacement')

old_parent='''  function parentView(){
    const science=CONTENT.science.map(l=>skillRow(l)).join("");const math=CONTENT.math.map(l=>skillRow(l)).join("");
    return shell(`<div class="grid"><div class="card c8"><h2>Parent View</h2><p class="muted">Michael's learning record separates school facts, teaching evidence, skill state, and memory strength. No one score gets to masquerade as the whole story.</p></div><div class="card c4"><div class="kpi"><div class="t">Track B evidence</div><div class="n">${state.evidence.length}</div></div></div>
      <div class="card c12"><h3>Physical Science skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${science}</tbody></table></div></div>
      <div class="card c12"><h3>Math bridge skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${math}</tbody></table></div></div>
    </div>`)
  }
'''
new_parent='''  function parentView(){
    const science=CONTENT.science.map(l=>skillRow(l)).join("");const math=CONTENT.math.map(l=>skillRow(l)).join("");
    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(r.lastDiagnostic?.result||"—")}</td><td>${r.lastDiagnostic?.cold_baseline_eligible===false?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
    const formalCount=state.evidence.filter(e=>e.evidence_class==="FORMAL_CONTROLLED").length;const informalCount=state.evidence.filter(e=>e.evidence_class==="INFORMAL_TRACK_B").length;
    return shell(`<div class="grid"><div class="card c8"><h2>Parent View</h2><p class="muted">Michael's learning record separates school facts, teaching evidence, controlled evidence, lifecycle state, and memory strength. No one score gets to masquerade as the whole story.</p></div><div class="card c4"><div class="kpi"><div class="t">Track B evidence</div><div class="n">${informalCount}</div></div><div class="spacer"></div><div class="kpi"><div class="t">Track A evidence</div><div class="n">${formalCount}</div></div></div>
      <div class="card c12"><h3>Physical Science skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${science}</tbody></table></div></div>
      <div class="card c12"><h3>Math bridge skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${math}</tbody></table></div></div>
      <div class="card c12"><h3>Track A controlled math map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Canonical state</th><th>Memory</th><th>Last diagnostic</th><th>Baseline note</th></tr></thead><tbody>${trackARows}</tbody></table></div></div>
    </div>`)
  }
'''
rep(old_parent,new_parent,'Parent Track A table')

old_evidence='''  function evidenceView(){
    const rows=state.evidence.slice().reverse().map(e=>`<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.subject||"")}</td><td>${escapeHTML(e.skillId)}</td><td>${escapeHTML(e.rawResponse)}</td><td>${e.isCorrect===true?"✓":e.isCorrect===false?"Needs work":"—"}</td><td>${escapeHTML(e.evidence_class||"")}</td><td>${escapeHTML(e.instruction_exposure_status||"")}</td><td>${escapeHTML(e.assistance_level||"")}</td><td>${escapeHTML(e.access_condition??"—")}</td><td>${escapeHTML(e.access_condition_source||"UNRECORDED")}</td></tr>`).join("")||`<tr><td colspan="10" class="muted">No evidence recorded yet.</td></tr>`;
    return shell(`<div class="card"><div class="row between"><div><h2>Evidence Log</h2><p class="muted small">Raw evidence is preserved. Interpretation never overwrites Michael's original response. An unobserved access condition stays null instead of being inferred.</p></div><button class="btn" onclick="window.MLUL.exportBackup()">Export backup</button></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Subject</th><th>Skill</th><th>Raw response</th><th>Result</th><th>Evidence class</th><th>Exposure</th><th>Assistance</th><th>Access condition</th><th>Access source</th></tr></thead><tbody>${rows}</tbody></table></div></div>`)
  }
'''
new_evidence='''  function evidenceView(){
    const rows=state.evidence.slice().reverse().map(e=>`<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.track||"")}</td><td>${escapeHTML(e.subject||"")}</td><td>${escapeHTML(e.skillId)}</td><td>${escapeHTML(e.rawResponse)}</td><td>${e.isCorrect===true?"✓":e.isCorrect===false?"Needs work":"—"}</td><td>${escapeHTML(e.evidence_class||"")}</td><td>${escapeHTML(e.interaction_purpose||e.evidenceType||"—")}</td><td>${escapeHTML(e.instruction_exposure_status||"—")}</td><td>${escapeHTML(e.assistance_level||"")}</td><td>${escapeHTML(e.access_condition??"—")}</td><td>${escapeHTML(e.access_condition_source||"UNRECORDED")}</td><td>${e.fresh===true?"fresh":e.fresh===false?"not fresh":"—"} / ${e.reliable===true?"reliable":e.reliable===false?"unreliable":"—"}</td></tr>`).join("")||`<tr><td colspan="13" class="muted">No evidence recorded yet.</td></tr>`;
    return shell(`<div class="card"><div class="row between"><div><h2>Evidence Log</h2><p class="muted small">Raw evidence is preserved. Interpretation never overwrites Michael's original response. Formal controlled evidence keeps freshness, reliability, assistance, access, and prior-instruction status separately queryable.</p></div><button class="btn" onclick="window.MLUL.exportBackup()">Export backup</button></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Track</th><th>Subject</th><th>Skill</th><th>Raw response</th><th>Result</th><th>Evidence class</th><th>Purpose</th><th>Exposure</th><th>Assistance</th><th>Access condition</th><th>Access source</th><th>Quality</th></tr></thead><tbody>${rows}</tbody></table></div></div>`)
  }
'''
rep(old_evidence,new_evidence,'Evidence table')

rep('''    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}current=null;render()});
''','''    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}if(currentTrackA){currentTrackA.session.status="PAUSED";currentTrackA.session.pausedAt=now();state.trackAActiveSession=currentTrackA.session;if(!await save("Track A navigation pause"))return}current=null;currentTrackA=null;render()});
''','hashchange Track A pause')
rep('''    if(state.activeSession && state.activeSession.status==="ACTIVE"){
      // Crash/reload recovery: preserve the session in place and require an explicit resume or end choice.
      state.activeSession.status="INTERRUPTED_PRESERVED";
      state.activeSession.interruptedAt=now();
      upsertSessionRecord(state.activeSession);
      await save("recover interrupted session");
    }
    render();
''','''    if(state.activeSession && state.activeSession.status==="ACTIVE"){
      // Crash/reload recovery: preserve the session in place and require an explicit resume or end choice.
      state.activeSession.status="INTERRUPTED_PRESERVED";
      state.activeSession.interruptedAt=now();
      upsertSessionRecord(state.activeSession);
      await save("recover interrupted session");
    }
    if(state.trackAActiveSession && state.trackAActiveSession.status==="ACTIVE"){
      state.trackAActiveSession.status="INTERRUPTED_PRESERVED";
      state.trackAActiveSession.interruptedAt=now();
      await save("recover interrupted Track A diagnostic");
    }
    render();
''','Track A crash recovery')
rep('''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore}};
''','''  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,resumeTrackADiagnostic,saveAndExitTrackA,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable}};
''','MLUL Track A exports')

p.write_text(s)
print('Slice G app patch applied')
