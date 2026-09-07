(() => {
  const CONTENT = window.LEVEL_UP_CONTENT;
  const REVIEW_ENGINE = window.LEVEL_UP_REVIEW_ENGINE;
  const TRACK_A_ENGINE = window.LEVEL_UP_TRACK_A_ENGINE;
  const TRACK_A_DIAGNOSTIC = window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
  const TRACK_A_REMEDIATION = window.LEVEL_UP_TRACK_A_REMEDIATION;
  const TRACK_A_VERIFICATION = window.LEVEL_UP_TRACK_A_VERIFICATION;
  const TRACK_A_MASTERY_STATE = window.LEVEL_UP_TRACK_A_MASTERY_STATE;
  const TRACK_A_MASTERY = window.LEVEL_UP_TRACK_A_MASTERY;
  const STATE_INTEGRITY = window.LEVEL_UP_STATE_INTEGRITY;
  const STORAGE_DURABILITY = window.LEVEL_UP_STORAGE_DURABILITY;
  const DB_NAME = "MichaelLevelUpLab";
  const DB_VERSION = 1;
  const STORE = "state";
  const STATE_KEY = "michael";
  const PROBE_KEY = "__healthcheck";
  const BACKUP_KEY = "MLUL_BACKUP_V1";
  const ASSISTANCE_LEVELS = Object.freeze(["INDEPENDENT","CLARIFIED","HINTED","GUIDED","TAUGHT","PARENT_ASSISTED"]);
  const ACCESS_CONDITIONS = Object.freeze(["SELF_READ_SILENT","SELF_READ_ALOUD","SYSTEM_READ_ALOUD","ADULT_READ_ALOUD"]);
  // Student runtime stays hard-disabled until the final local-persistence + synthetic-recovery audit is signed off.
  const RUNTIME_ENABLED = false;
  let dbHandle = null;
  let state = null;
  let current = null;
  let currentTrackA = null;
  let saveHealthy = false;
  let backupMirrorHealthy = true;
  let lastDurableState = null;
  let lastDurableRevision = 0;
  let redundancyComparison = "UNVERIFIED";
  let storageRecoveryIssue = null;
  let firstRunDecisionRequired = false;
  let persistenceStatus = {state:"UNKNOWN_OR_UNSUPPORTED",supported:false,canRequest:false,checked:false,error:null};
  let writeSequence = Promise.resolve();
  let draftSaveTimer = null;

  const freshState = () => ({
    schemaVersion:2,
    stateRevision:null,
    learnerRecordOrigin:{type:"NEW",decidedAt:new Date().toISOString(),priorRecordOffered:false},
    restoredFrom:null,
    student:CONTENT.student,
    activeTrack:"B",
    lessonState:{},
    trackASkillState:{},
    trackAActiveSession:null,
    trackAMasterySchedule:[],
    evidence:[],
    sessions:[],
    reviewSchedule:[],
    schoolFacts:[
      {id:"grade.science",subject:"Physical Science",value:"47",status:"CONFIRMED",source:"parent gradebook report"},
      {id:"grade.math",subject:"Math",value:"80",status:"CONFIRMED",source:"parent gradebook report"}
    ],
    settings:{readAloud:true,extraProcessing:true,parentTypesVerbatim:true},
    backup:{lastExportAttemptedAt:null,pendingAfterLesson:false},
    activeSession:null,
    updatedAt:new Date().toISOString()
  });

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess=()=>{dbHandle=req.result;resolve(dbHandle)};
      req.onerror=()=>reject(req.error);
    });
  }

  function idbGet(key = STATE_KEY){
    return new Promise((resolve,reject)=>{
      const tx=dbHandle.transaction(STORE,"readonly");
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }

  function idbPut(value, key = STATE_KEY){
    return new Promise((resolve,reject)=>{
      const tx=dbHandle.transaction(STORE,"readwrite");
      const req=tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error);
    });
  }

  function idbDelete(key){
    return new Promise((resolve,reject)=>{
      const tx=dbHandle.transaction(STORE,"readwrite");
      const req=tx.objectStore(STORE).delete(key);
      tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error);
    });
  }

  function isValidLearnerState(value){
    if(!STATE_INTEGRITY)return false;
    try{STATE_INTEGRITY.validateCurrentState(value);return true}catch(_){return false}
  }

  function prepareLoadedStateSafe(value,source){
    if(!STATE_INTEGRITY||!value)return null;
    try{return STATE_INTEGRITY.prepareLoadedState(value,{source,now:new Date().toISOString()})}catch(_){return null}
  }

  function readLocalBackupRaw(){
    try{const raw=localStorage.getItem(BACKUP_KEY);return raw?JSON.parse(raw):null}catch(_){return null}
  }

  function readLocalBackup(){return prepareLoadedStateSafe(readLocalBackupRaw(),"MIRROR")}

  function mirrorWriteAndReadback(snapshot){
    try{
      localStorage.setItem(BACKUP_KEY,JSON.stringify(snapshot));
      const raw=localStorage.getItem(BACKUP_KEY);if(!raw)return false;
      const readback=JSON.parse(raw);
      return readback?.stateRevision===snapshot.stateRevision && JSON.stringify(readback)===JSON.stringify(snapshot);
    }catch(err){console.warn("Local backup mirror failed",err);return false}
  }

  function rebindLiveStateReferences(){
    if(current?.session && state?.activeSession && current.session.id===state.activeSession.id) current.session=state.activeSession;
    if(currentTrackA?.session && state?.trackAActiveSession && currentTrackA.session.id===state.trackAActiveSession.id) currentTrackA.session=state.trackAActiveSession;
  }

  function sameOriginRedundancyDegraded(){return !backupMirrorHealthy || ["MIRROR_AHEAD","MIRROR_STALE"].includes(redundancyComparison)}
  function redundancyOverrideAcknowledged(){return !!state?.backup?.redundancyOverrideAcknowledgedAt}
  function evidenceSessionAllowed(){
    if(!sameOriginRedundancyDegraded()||redundancyOverrideAcknowledged())return true;
    alert("Same-origin redundancy is degraded. Open Backup to repair it or explicitly acknowledge degraded redundancy before collecting learner evidence.");
    return false;
  }

  async function save(reason="update"){
    if(!state)return false;
    state.updatedAt=new Date().toISOString();
    const candidate=JSON.parse(JSON.stringify(state));
    const task=writeSequence.catch(()=>{}).then(async()=>{
      const revision=STATE_INTEGRITY.nextRevision(lastDurableRevision);
      candidate.schemaVersion=STATE_INTEGRITY.SUPPORTED_SCHEMA_VERSION;
      candidate.stateRevision=revision;
      await idbPut(candidate,STATE_KEY);
      const backupOk=mirrorWriteAndReadback(candidate);
      return {backupOk,revision,snapshot:JSON.parse(JSON.stringify(candidate))};
    });
    writeSequence=task;
    try{
      const result=await task;
      lastDurableRevision=result.revision;
      if(state)state.stateRevision=result.revision;
      lastDurableState=JSON.parse(JSON.stringify(result.snapshot));
      backupMirrorHealthy=result.backupOk;
      redundancyComparison=result.backupOk?"IN_SYNC":"MIRROR_STALE";
      saveHealthy=true;renderSaveStatus();
      return true;
    }catch(err){
      if(lastDurableState){state=JSON.parse(JSON.stringify(lastDurableState));rebindLiveStateReferences()}
      saveHealthy=false;renderSaveStatus();
      alert("Saving failed. This change was rolled back to the last durable learner state. Do not continue until persistence is working.");
      console.error(reason,err);
      return false;
    }
  }

  async function persistenceHealthCheck(){
    try{
      const probe={ok:true,t:new Date().toISOString()};
      await idbPut(probe,PROBE_KEY);
      const got=await idbGet(PROBE_KEY);
      // The probe never touches STATE_KEY. A crash at any point cannot replace Michael's record.
      try{await idbDelete(PROBE_KEY)}catch(_){/* stale probe is harmless */}
      saveHealthy=!!(got && got.ok);
      return saveHealthy;
    }catch(e){saveHealthy=false;return false}
  }

  function normalizeStateShape(value){
    if(!value || typeof value!=="object")return value;
    if(!value.backup || typeof value.backup!=="object") value.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
    if(value.backup.lastExportAttemptedAt==null && value.backup.lastExportedAt) value.backup.lastExportAttemptedAt=value.backup.lastExportedAt;
    delete value.backup.lastExportedAt;
    if(!Array.isArray(value.sessions)) value.sessions=[];
    if(!Array.isArray(value.reviewSchedule)) value.reviewSchedule=[];
    if(!value.trackASkillState || typeof value.trackASkillState!=="object") value.trackASkillState={};
    if(!Object.prototype.hasOwnProperty.call(value,"trackAActiveSession")) value.trackAActiveSession=null;
    if(!Array.isArray(value.trackAMasterySchedule)) value.trackAMasterySchedule=[];
    if(!value.settings || typeof value.settings!=="object") value.settings={readAloud:true,extraProcessing:true,parentTypesVerbatim:true};
    return value;
  }

  function validAccessCondition(value){return STATE_INTEGRITY?STATE_INTEGRITY.validAccessCondition(value):(ACCESS_CONDITIONS.includes(value)?value:null)}

  function assistanceLevelForSession(session){
    if(!session)return "INDEPENDENT";
    if(ASSISTANCE_LEVELS.includes(session.assistance_level_override))return session.assistance_level_override;
    if(session.phase==="TEACH")return "TAUGHT";
    if(session.phase==="CHECK_AFTER_TEACH")return session.instructionDelivered?"TAUGHT":"INDEPENDENT";
    if(session.phase==="RETRIEVAL" || session.phase==="CHECK_ONLY")return "INDEPENDENT";
    return session.instructionDelivered?"TAUGHT":"INDEPENDENT";
  }

  function accessOptions(selected=null){
    const labels={SELF_READ_SILENT:"Self-read silently",SELF_READ_ALOUD:"Michael read aloud",SYSTEM_READ_ALOUD:"System read aloud",ADULT_READ_ALOUD:"Adult read aloud"};
    return `<option value="" ${selected?"":"selected"}>Not recorded</option>`+ACCESS_CONDITIONS.map(v=>`<option value="${v}" ${v===selected?"selected":""}>${labels[v]}</option>`).join("");
  }

  function markAccessObserved(selector){
    if(selector) selector.dataset.accessConditionSource=validAccessCondition(selector.value)?"OBSERVED":"UNRECORDED";
  }

  function accessSourceFor(selector, value){
    return value && selector?.dataset?.accessConditionSource==="OBSERVED" ? "OBSERVED" : "UNRECORDED";
  }


  function upsertSessionRecord(session){
    if(!session || !Array.isArray(state.sessions))return;
    const copy=JSON.parse(JSON.stringify(session));
    const index=state.sessions.findIndex(x=>x.id===session.id);
    if(index>=0)state.sessions[index]=copy;else state.sessions.push(copy);
  }

  function recoverableSession(){
    const session=state?.activeSession;
    return !!(session && ["ACTIVE","PAUSED","INTERRUPTED_PRESERVED"].includes(session.status) && lessonById(session.lessonId));
  }

  function captureDraftFromUI(){
    if(!current || !current.session)return null;
    const session=current.session;
    const draft={phase:session.phase,itemIndex:session.itemIndex,savedAt:now()};
    if(session.phase==="TEACH"){
      const teachAccess=document.getElementById("teachAccess");
      draft.sayBack=document.getElementById("sayBack")?.value??"";
      draft.access_condition=validAccessCondition(teachAccess?.value);
      draft.access_condition_source=accessSourceFor(teachAccess,draft.access_condition);
    }else if(session.phase==="CHECK_AFTER_TEACH" || session.phase==="CHECK_ONLY" || session.phase==="RETRIEVAL"){
      const free=document.getElementById("freeAnswer");
      const selected=document.querySelector("input[name=answer]:checked");
      const confidence=document.querySelector("input[name=confidence]:checked");
      const access=document.getElementById("itemAccessCondition");
      draft.freeAnswer=free?.value??"";
      draft.choiceValue=selected?.value??null;
      draft.confidence=confidence?.value??null;
      draft.access_condition=validAccessCondition(access?.value);
      draft.access_condition_source=accessSourceFor(access,draft.access_condition);
      const assistance=document.getElementById("itemAssistanceLevel");
      draft.assistance_level=ASSISTANCE_LEVELS.includes(assistance?.value)?assistance.value:null;
    }
    session.draft=draft;
    state.activeSession=session;
    upsertSessionRecord(session);
    return draft;
  }

  function restoreDraftToUI(){
    if(!current?.session?.draft)return;
    const d=current.session.draft;
    if(d.phase!==current.session.phase || d.itemIndex!==current.session.itemIndex)return;
    if(current.session.phase==="TEACH"){
      const sayBack=document.getElementById("sayBack");if(sayBack)sayBack.value=d.sayBack??"";
      const access=document.getElementById("teachAccess");if(access){access.value=d.access_condition??"";access.dataset.accessConditionSource=d.access_condition_source||"UNRECORDED"}
    }else{
      const free=document.getElementById("freeAnswer");if(free)free.value=d.freeAnswer??"";
      if(d.choiceValue!=null){const radio=document.querySelector(`input[name=answer][value="${d.choiceValue}"]`);if(radio)radio.checked=true}
      if(d.confidence){const confidence=document.querySelector(`input[name=confidence][value="${d.confidence}"]`);if(confidence)confidence.checked=true}
      const access=document.getElementById("itemAccessCondition");if(access){access.value=d.access_condition??"";access.dataset.accessConditionSource=d.access_condition_source||"UNRECORDED"}
      const assistance=document.getElementById("itemAssistanceLevel");if(assistance&&d.assistance_level)assistance.value=d.assistance_level;
    }
  }

  function bindDraftAutosave(){
    if(!current)return;
    const selectors=["#sayBack","#teachAccess","#freeAnswer","#itemAccessCondition","#itemAssistanceLevel","input[name=answer]","input[name=confidence]"];
    document.querySelectorAll(selectors.join(",")).forEach(el=>{
      const isTyping=el.tagName==="INPUT" && el.type==="text" || el.tagName==="TEXTAREA";
      const event=isTyping?"input":"change";
      el.addEventListener(event,()=>{
        if(isTyping)queueDraftSave("draft autosave");
        else{clearTimeout(draftSaveTimer);captureDraftFromUI();void save("draft autosave")}
      });
    });
  }

  function queueDraftSave(reason="draft autosave"){
    if(!current)return;
    clearTimeout(draftSaveTimer);
    captureDraftFromUI();
    draftSaveTimer=setTimeout(async()=>{if(current){captureDraftFromUI();await save(reason)}},500);
  }

  async function manualSave(){
    if(current)captureDraftFromUI();
    const ok=await save("manual save");
    if(ok){const el=document.getElementById("saveStatus");if(el)el.innerHTML="<span class='statusdot'></span>Saved now"}
    return ok;
  }

  async function saveAndExit(){
    if(!current){await manualSave();location.hash="dashboard";return}
    clearTimeout(draftSaveTimer);
    captureDraftFromUI();
    current.session.status="PAUSED";
    current.session.pausedAt=now();
    state.activeSession=current.session;
    upsertSessionRecord(current.session);
    if(!await save("save and exit"))return;
    speechSynthesis?.cancel?.();
    current=null;
    location.hash="dashboard";
    render();
  }

  async function resumeInterruptedSession(){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. The preserved session will remain saved.");return}
    const session=state.activeSession;
    if(!recoverableSession()){alert("There is no preserved session to resume.");return}
    const lesson=lessonById(session.lessonId);
    session.status="ACTIVE";
    session.resumedAt=now();
    state.activeSession=session;
    upsertSessionRecord(session);
    if(!await save("resume session"))return;
    if(session.mode==="REVIEW" || session.reviewId){
      const review=reviewById(session.reviewId);if(!review||!REVIEW_ENGINE){alert("The preserved review cannot be reconstructed safely.");current=null;return}
      const reviewItems=REVIEW_ENGINE.generateReview(session.lessonId,review.window,review.id);current={lesson,session,review,reviewItems};renderReviewQuestion();
    }else{
      current={lesson,session};if(session.phase==="TEACH")renderLessonTeach();else renderQuestion();
    }
  }

  async function endPreservedSession(){
    const session=state.activeSession;
    if(!recoverableSession())return;
    session.status="ENDED_PRESERVED";
    session.endedAt=now();
    upsertSessionRecord(session);
    state.activeSession=null;
    if(!await save("end preserved session"))return;
    current=null;render();
  }

  function recoveryNotice(){
    if(current || !recoverableSession())return "";
    const session=state.activeSession;const lesson=lessonById(session.lessonId);
    return `<div class="notice" style="border-color:#0369a1;background:#082f49;color:#bae6fd"><strong>Session preserved.</strong> ${escapeHTML(lesson?.title||session.lessonId)} stopped before completion. Nothing was deleted. ${session.draft?.savedAt?`Last draft save: ${fmt(session.draft.savedAt)}.`:""}<div class="row" style="margin-top:10px"><button class="btn primary" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeInterruptedSession()">Resume session</button><button class="btn" onclick="window.MLUL.endPreservedSession()">End session, keep evidence</button></div></div>`;
  }

  function renderSaveStatus(){
    const el=document.getElementById("saveStatus");
    if(!el)return;
    const good=saveHealthy&&!sameOriginRedundancyDegraded();
    el.className="badge "+(good?"good":"warn");
    if(!saveHealthy)el.innerHTML="<span class='statusdot bad'></span>Primary persistence problem";
    else if(sameOriginRedundancyDegraded())el.innerHTML="<span class='statusdot bad'></span>Primary saved · mirror degraded";
    else el.innerHTML="<span class='statusdot'></span>Primary + mirror synced";
  }

  function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
  function normalize(s){return String(s).trim().toLowerCase().replace(/[^a-z0-9.+-]/g,"")}
  function numericFromResponse(value){const m=String(value??"").replace(/,/g,"").match(/[-+]?\d*\.?\d+/);return m?Number(m[0]):null}
  function answersMatch(raw,expected){
    const expectedNum=numericFromResponse(expected);
    if(expectedNum!==null && /^[-+]?\d*\.?\d+$/.test(String(expected).trim())){
      const rawNum=numericFromResponse(raw);return rawNum!==null && Math.abs(rawNum-expectedNum)<1e-9;
    }
    return normalize(raw)===normalize(expected);
  }
  function evidenceSessionContext(){return currentTrackA?.session||current?.session||state?.trackAActiveSession||state?.activeSession||null}
  function pushEvidenceOnce(ev,sessionOverride=null){
    const found=state.evidence.find(x=>x.id===ev.id);if(found)return found;
    const session=sessionOverride||evidenceSessionContext();
    if(session&&STATE_INTEGRITY)STATE_INTEGRITY.linkEvidenceToSession(ev,session,state.evidence);
    if(STATE_INTEGRITY)STATE_INTEGRITY.annotateWriteProvenance(ev,sameOriginRedundancyDegraded());
    state.evidence.push(ev);return ev
  }
  function pushSessionResponseOnce(session,ev){const found=session.responses.find(x=>x.id===ev.id);if(found)return found;session.responses.push(ev);return ev}
  function now(){return new Date().toISOString()}
  function fmt(iso){return new Date(iso).toLocaleString()}
  function allLessons(){return [...CONTENT.science,...CONTENT.math]}
  function lessonById(id){return allLessons().find(x=>x.id===id)}
  function lessonStatus(id){return state.lessonState[id]||{status:"NOT_STARTED",score:null,attempts:0}}
  function isReady(lesson){return !lesson.prereq || lessonStatus(lesson.prereq).status==="COMPLETED"}
  function trackBProgressFromScore(score){if(score===100)return"CHECK_STRONG";if(score>=67)return"CHECK_PARTIAL";return"CHECK_NEEDS_RETEACH"}

  function getRoute(){return (location.hash||"#dashboard").slice(1)}

  function speak(text){
    if(!("speechSynthesis" in window)){alert("Read-aloud is not supported in this browser.");return}
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text.replaceAll("ΔT","delta T").replaceAll("×"," times ").replaceAll("÷"," divided by ").replaceAll("="," equals "));
    u.rate=.9;speechSynthesis.speak(u);
  }

  function shell(body){
    return `<div class="shell">
      <div class="top">
        <div class="brand"><h1>Michael Level-Up Lab</h1><p>Permanent system foundation · Track B live first</p></div>
        <div class="badges"><button class="btn" onclick="window.MLUL.manualSave()">Save</button><span id="saveStatus" class="badge"></span><span class="badge warn">Track B = PRIOR_INSTRUCTION</span></div>
      </div>
      <div class="notice"><strong>Evidence rule:</strong> Track B teaches Michael now. Every taught skill is permanently labeled <strong>PRIOR_INSTRUCTION</strong>. Raw responses and support conditions are stored separately from interpretation. Track A controlled diagnostics will never treat these skills as a clean cold baseline.</div>
      ${RUNTIME_ENABLED?"":`<div class="notice" style="border-color:#b91c1c;background:#450a0a;color:#fecaca"><strong>BUILD UNDER AUDIT — STUDENT USE DISABLED.</strong> Michael cannot start lessons in this build. Frozen evidence enums are wired; the final local-persistence and synthetic-recovery audit must pass before runtime is enabled.</div>`}
      ${recoveryNotice()}
      ${state?.backup?.pendingAfterLesson?`<div class="notice" style="border-color:#b45309;background:#451a03;color:#fde68a"><strong>Portable backup still pending.</strong> A lesson completed and the browser cannot confirm that an exported file was actually saved. ${state.backup.lastExportAttemptedAt?`An export was attempted ${fmt(state.backup.lastExportAttemptedAt)}, but the browser cannot confirm the file was actually saved.`:`No export attempt is recorded for this lesson yet.`}</div>`:""}
      <div class="nav">
        ${navBtn("dashboard","Dashboard")}${navBtn("track-b","Track B")}${navBtn("parent","Parent View")}${navBtn("evidence","Evidence")}${navBtn("reviews","Review Queue")}${navBtn("track-a","Track A")}${navBtn("backup","Backup")}
      </div>${body}<footer>Michael Level-Up Lab · v1 foundation</footer></div>`
  }
  function navBtn(route,label){return `<button class="${getRoute()===route?"active":""}" onclick="location.hash='${route}'">${label}</button>`}

  function dashboard(){
    const completed=allLessons().filter(l=>lessonStatus(l.id).status==="COMPLETED").length;
    const total=allLessons().length;
    const pct=Math.round(completed/total*100);
    const due=state.reviewSchedule.filter(r=>!r.completed && new Date(r.dueAt)<=new Date()).length;
    return shell(`<div class="grid">
      <div class="card c8"><h2>Michael's Level-Up Home</h2><p class="muted">We are rebuilding Physical Science from the beginning while preserving every piece of evidence for the permanent system.</p><div class="progress"><div style="width:${pct}%"></div></div><p class="small muted">${completed} of ${total} current Track B lessons completed.</p><div class="row"><button class="btn primary" onclick="location.hash='track-b'">Continue Track B</button><button class="btn" onclick="location.hash='parent'">Open Parent View</button></div></div>
      <div class="card c4"><div class="kpi"><div class="t">Evidence records</div><div class="n">${state.evidence.length}</div></div><div class="spacer"></div><div class="kpi"><div class="t">Reviews due</div><div class="n">${due}</div></div></div>
      <div class="card c6"><h3>Track B · build under audit</h3><p><strong>Immediate teaching + school recovery</strong></p><p class="small muted">Science first, then the Math bridge when formula work requires it. Read-aloud, short blocks, verbal explanation, and automatic evidence capture are built in.</p><button class="btn primary" onclick="location.hash='track-b'">Open Track B</button></div>
      <div class="card c6"><h3>Track A · protected baseline</h3><p><strong>Controlled diagnostics + mastery engine</strong></p><p class="small muted">Track A remains separate. Any Track B-taught skill enters formal evidence with PRIOR_INSTRUCTION attached.</p><button class="btn" onclick="location.hash='track-a'">See Track A rules</button></div>
      <div class="card c12"><h3>School Success snapshot</h3><div class="row"><span class="pill warn">Physical Science 47</span><span class="pill info">Math 80</span><span class="pill">No missing assignments reported</span></div><p class="small muted" style="margin-bottom:0">School Success and Core Growth remain separate lanes inside the same learner record.</p></div>
    </div>`)
  }

  function trackB(){
    return shell(`<div class="grid">
      <div class="card c8"><h2>Track B · Immediate Learning</h2><p class="muted">Teaching sequence: <strong>SEE IT → DO IT → SAY IT → SOLVE IT → EXPLAIN IT → RETRIEVE LATER.</strong></p><div class="callout green small"><strong>No more full Unit 1 retest.</strong> Michael starts at the beginning, gets taught, answers fresh checks, and returns later for delayed retrieval.</div></div>
      <div class="card c4"><div class="label">Current priority</div><div class="big">Science</div><div class="small muted">Unit 1 Energy Recovery</div></div>
      <div class="card c8"><h3>Physical Science · Unit 1</h3><div class="stack">${CONTENT.science.map(l=>lessonCard(l,"science")).join("")}</div></div>
      <div class="card c4"><h3>Math Bridge</h3><p class="small muted">Used when Science reaches formula math. We start at numeric inverse operations before literal equations.</p><div class="stack">${CONTENT.math.map(l=>lessonCard(l,"math")).join("")}</div></div>
      <div class="card c12"><h3>Other subjects</h3><div class="row"><span class="pill">ELA · module slot ready</span><span class="pill">Social Studies · module slot ready</span><span class="pill">School Radar · integration slot ready</span></div><p class="small muted">These are intentionally not populated yet. They plug into this same system later instead of becoming separate websites.</p></div>
    </div>`)
  }

  function lessonCard(l,subject){
    const st=lessonStatus(l.id);const prereqReady=isReady(l);const usable=RUNTIME_ENABLED && prereqReady;
    const pill=!RUNTIME_ENABLED?`<span class="pill warn">Audit hold</span>`:st.status==="COMPLETED"?`<span class="pill good">Completed · ${st.score}%</span>`:prereqReady?`<span class="pill info">Ready</span>`:`<span class="pill warn">Prerequisite first</span>`;
    return `<div class="lesson-card ${usable?"":"locked"}"><h3>${escapeHTML(l.title)}</h3><div class="row"><span class="pill purple">${escapeHTML(l.schoolTag)}</span><span class="pill">${l.minutes}</span>${pill}</div><div class="lesson-actions"><button class="btn ${st.status==="COMPLETED"?"good":"primary"}" ${usable?"":"disabled"} onclick="window.MLUL.startLesson('${l.id}','${subject}')">${!RUNTIME_ENABLED?"Student use disabled":st.status==="COMPLETED"?"Review lesson":"Start lesson"}</button></div></div>`
  }

  async function startLesson(id,subject){
    if(!evidenceSessionAllowed())return;
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not use it yet.");return}
    const lesson=lessonById(id);if(!lesson)return;
    if(!isReady(lesson)){alert("Finish the prerequisite first.");return}
    const ok=await persistenceHealthCheck();renderSaveStatus();
    if(!ok){alert("The app cannot verify persistence, so the lesson will not start.");return}
    const session={id:`sess_${Date.now()}`,mode:"LESSON",track:"B",subject,lessonId:id,startedAt:now(),phase:"TEACH",instructionDelivered:false,itemIndex:0,responses:[],access_policy:{allowed_access_conditions:[...ACCESS_CONDITIONS],extra_processing_available:true,parent_verbatim_available:true},teach_access_condition:null,teach_access_condition_source:"UNRECORDED",status:"ACTIVE"};
    state.activeSession=session;upsertSessionRecord(session);
    if(!await save("start lesson"))return;
    current={lesson,session};renderLessonTeach();
  }

  function renderLessonTeach(){
    const {lesson}=current;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill purple">${lesson.schoolTag}</span><h2 style="margin-top:10px">${lesson.title}</h2><p class="muted">Track B teaching session · PRIOR_INSTRUCTION</p></div><span class="badge warn">Teaching evidence</span></div>
      <div class="row"><button class="btn" onclick="window.MLUL.readTeach()">🔊 Read lesson</button><button class="btn" onclick="speechSynthesis.pause()">⏸ Pause</button><button class="btn" onclick="speechSynthesis.resume()">▶ Resume</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div>
      <div class="spacer"></div>${lesson.teach.map((t,i)=>`<div class="teacher"><strong>Teach ${i+1}</strong><p>${escapeHTML(t[0])}</p><p class="small muted">${escapeHTML(t[1])}</p></div>`).join("")}
      <div class="callout purple"><strong>Say it back:</strong> Michael explains the idea in his own words. Parent can type his exact words below. This is teaching evidence, not a diagnostic score.</div>
      <label class="small">How did Michael access this teaching block?</label><select id="teachAccess" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(current.session.teach_access_condition)}</select>
      <div class="spacer"></div><label class="small">Michael's explanation (optional but useful)</label><textarea id="sayBack" rows="3" placeholder="Type exactly what Michael says"></textarea>
      <div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.beginChecks()">Continue to Try</button><button class="btn" onclick="window.MLUL.manualSave()">Save</button><button class="btn" onclick="window.MLUL.saveAndExit()">Save & Exit</button></div>
    </div>`);renderSaveStatus();restoreDraftToUI();bindDraftAutosave();window.scrollTo({top:0,behavior:"smooth"});
  }

  function readTeach(){
    const t=current.lesson.teach.map(x=>x.join(" ")).join(" ");
    current.session.teach_access_condition="SYSTEM_READ_ALOUD";
    current.session.teach_access_condition_source="OBSERVED";
    const selector=document.getElementById("teachAccess");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}
    speak(t);clearTimeout(draftSaveTimer);captureDraftFromUI();void save("teach read-aloud access");
  }

  async function beginChecks(){
    const sayBack=document.getElementById("sayBack").value.trim();
    const teachSelector=document.getElementById("teachAccess");
    const teachAccess=validAccessCondition(teachSelector?.value||current.session.teach_access_condition);
    const teachAccessSource=teachAccess ? (teachSelector?.dataset?.accessConditionSource||current.session.teach_access_condition_source||"UNRECORDED") : "UNRECORDED";
    current.session.teach_access_condition=teachAccess;
    current.session.teach_access_condition_source=teachAccessSource;
    if(sayBack){
      pushEvidenceOnce({id:`ev_${current.session.id}_think`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:current.session.subject,skillId:current.lesson.id,evidenceType:"THINK_ALOUD",rawResponse:sayBack,interpretation:null,assistance_level:assistanceLevelForSession(current.session),access_condition:teachAccess,access_condition_source:teachAccessSource,access_observation:{access_condition:teachAccess,access_condition_source:teachAccessSource,parent_verbatim_used:true,extra_processing_available:true}});
    }
    current.session.instructionDelivered=true;
    current.session.phase="CHECK_AFTER_TEACH";current.session.itemIndex=0;current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);
    if(!await save("begin checks"))return;
    renderQuestion();
  }

  function renderQuestion(){
    const q=current.lesson.checks[current.session.itemIndex];
    const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="answer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="freeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill purple">${current.lesson.schoolTag}</span><h2 style="margin-top:10px">Try ${current.session.itemIndex+1} of ${current.lesson.checks.length}</h2></div><span class="badge warn">Track B</span></div>
      <div class="row"><button class="btn" onclick="window.MLUL.readQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div>
      <div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div>
      <label class="small">How was this question accessed?</label><select id="itemAccessCondition" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select>
      <div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="confidence" value="sure"> Sure</label><label class="small"><input type="radio" name="confidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="confidence" value="guess"> Guessing</label></div>
      <div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.submitAnswer()">Submit answer</button><button class="btn" onclick="window.MLUL.manualSave()">Save</button><button class="btn" onclick="window.MLUL.saveAndExit()">Save & Exit</button></div><div id="feedback"></div>
    </div>`);renderSaveStatus();restoreDraftToUI();bindDraftAutosave();
  }

  function readQuestion(){
    const q=current.lesson.checks[current.session.itemIndex];
    const selector=document.getElementById("itemAccessCondition");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}
    speak(q.q+(q.choices?" Choices. "+q.choices.join(". "):""));clearTimeout(draftSaveTimer);captureDraftFromUI();void save("question read-aloud access");
  }

  async function submitAnswer(){
    const q=current.lesson.checks[current.session.itemIndex];let raw="",correct=false;
    if(q.choices){const chosen=document.querySelector("input[name=answer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}const idx=Number(chosen.value);raw=q.choices[idx];correct=idx===q.answer}
    else{const el=document.getElementById("freeAnswer");raw=el.value.trim();if(!raw){alert("Type Michael's answer exactly. 'I don't know' is a valid answer.");return}correct=answersMatch(raw,q.free)}
    const confidence=document.querySelector("input[name=confidence]:checked")?.value||"not_recorded";
    const accessSelector=document.getElementById("itemAccessCondition");
    const accessCondition=validAccessCondition(accessSelector?.value);
    const accessConditionSource=accessSourceFor(accessSelector,accessCondition);
    const assistanceLevel=assistanceLevelForSession(current.session);
    const ev={id:`ev_${current.session.id}_${current.session.itemIndex}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:current.session.subject,skillId:current.lesson.id,itemId:q.id,prompt:q.q,rawResponse:raw,isCorrect:correct,confidence,assistance_level:assistanceLevel,access_condition:accessCondition,access_condition_source:accessConditionSource,access_observation:{access_condition:accessCondition,access_condition_source:accessConditionSource,extra_processing_available:true,parent_verbatim_available:true},interpretation:correct?"immediate taught-response correct":"immediate taught-response needs more support"};
    pushEvidenceOnce(ev);pushSessionResponseOnce(current.session,ev);current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);
    if(!await save("answer"))return;
    document.querySelectorAll("input").forEach(x=>x.disabled=true);
    const fb=document.getElementById("feedback");fb.className="feedback "+(correct?"good":"warn");fb.innerHTML=`<strong>${correct?"Yes — that's it.":"Not yet."}</strong><div class="small" style="margin-top:6px">${escapeHTML(q.why)}</div><div class="small muted" style="margin-top:6px">Because this is Track B, teaching feedback is allowed after Michael answers.</div><button class="btn ${correct?"good":"warn"}" style="margin-top:10px" onclick="window.MLUL.nextQuestion()">${current.session.itemIndex===current.lesson.checks.length-1?"Finish lesson":"Next"}</button>`;
  }

  async function nextQuestion(){
    current.session.itemIndex++;
    if(current.session.itemIndex<current.lesson.checks.length){current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);if(!await save("next question"))return;renderQuestion();return}
    await finishLesson();
  }

  async function finishLesson(){
    const r=current.session.responses;const correct=r.filter(x=>x.isCorrect).length;const total=r.length;const score=Math.round(correct/total*100);
    const old=lessonStatus(current.lesson.id);state.lessonState[current.lesson.id]={status:"COMPLETED",score,attempts:(old.attempts||0)+1,completedAt:now(),trackBProgress:trackBProgressFromScore(score),memoryStrength:"FRAGILE",instruction_exposure_status:"PRIOR_INSTRUCTION"};
    current.session.status="COMPLETED";current.session.completedAt=now();current.session.draft=null;upsertSessionRecord(current.session);state.activeSession=null;
    scheduleReviews(current.lesson.id,current.session.subject);
    if(!state.backup)state.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
    state.backup.pendingAfterLesson=true;
    if(!await save("finish lesson"))return;
    document.getElementById("app").innerHTML=shell(`<div class="card center"><span class="pill good">Lesson complete</span><h2 style="margin-top:12px">${current.lesson.title}</h2><div class="big">${correct}/${total}</div><p class="muted">Immediate Track B check</p><div class="callout"><strong>This is not mastery and does not write a canonical lifecycle state.</strong> Track B immediate-check result: ${trackBProgressFromScore(score)}. Memory remains FRAGILE until delayed retrieval shows it sticks.</div><div class="callout warn" style="margin-top:14px"><strong>Portable backup due now.</strong> Download the learner backup before ending this local-only pilot session.</div><div class="row" style="justify-content:center"><button class="btn primary" onclick="window.MLUL.exportBackup()">Download backup now</button><button class="btn" onclick="location.hash='track-b'">Back to Track B</button></div></div>`);renderSaveStatus();current=null;
  }

  function scheduleReviews(skillId,subject){
    const existing=state.reviewSchedule.filter(x=>x.skillId===skillId);if(existing.length)return;
    [2,7,21].forEach(days=>{const d=new Date();d.setDate(d.getDate()+days);state.reviewSchedule.push({id:`rev_${Date.now()}_${days}`,skillId,subject,dueAt:d.toISOString(),window:`Day ${days}`,completed:false,sourceTrack:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION"})});
  }


  function reviewById(id){return state.reviewSchedule.find(x=>x.id===id)||null}
  function reviewIsDue(review){return !!(review && !review.completed && new Date(review.dueAt)<=new Date())}
  function reviewOutcomeFromScore(score){if(score===100)return"RETRIEVAL_STRONG";if(score>=67)return"RETRIEVAL_PARTIAL";return"RETRIEVAL_WEAK"}
  function memoryStrengthForReview(windowLabel,score,transferCorrect){
    if(score<67)return"FRAGILE";
    if(score<100)return"BUILDING";
    if(windowLabel==="Day 2")return"BUILDING";
    if(windowLabel==="Day 7")return"STABLE";
    if(windowLabel==="Day 21")return transferCorrect?"FLEXIBLE":"STABLE";
    return"BUILDING";
  }
  function assistanceOptions(selected="INDEPENDENT"){
    const labels={INDEPENDENT:"Independent",CLARIFIED:"Directions clarified",HINTED:"Hinted",GUIDED:"Guided",TAUGHT:"Taught during item",PARENT_ASSISTED:"Parent assisted"};
    return ASSISTANCE_LEVELS.map(v=>`<option value="${v}" ${v===selected?"selected":""}>${labels[v]}</option>`).join("");
  }

  async function startReview(reviewId){
    if(!evidenceSessionAllowed())return;
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not take reviews yet.");return}
    if(recoverableSession()){alert("A session is already preserved. Resume it or end it before starting another review.");return}
    const review=reviewById(reviewId);if(!review){alert("Review not found.");return}
    if(!reviewIsDue(review)){alert("This review is not due yet or is already completed.");return}
    if(!REVIEW_ENGINE){alert("The fresh review engine is not available.");return}
    const lesson=lessonById(review.skillId);if(!lesson)return;
    const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok){alert("The app cannot verify persistence, so the review will not start.");return}
    const reviewItems=REVIEW_ENGINE.generateReview(review.skillId,review.window,review.id);
    const session={id:`review_sess_${Date.now()}`,mode:"REVIEW",track:"B",subject:review.subject,lessonId:review.skillId,reviewId:review.id,reviewWindow:review.window,startedAt:now(),phase:"RETRIEVAL",instructionDelivered:false,itemIndex:0,responses:[],access_policy:{allowed_access_conditions:[...ACCESS_CONDITIONS],extra_processing_available:true,parent_verbatim_available:true},status:"ACTIVE",draft:null};
    state.activeSession=session;upsertSessionRecord(session);if(!await save("start review"))return;
    current={lesson,session,review,reviewItems};renderReviewQuestion();
  }

  function renderReviewQuestion(){
    const q=current.reviewItems[current.session.itemIndex];
    const input=q.choices?q.choices.map((x,i)=>`<label class="choice"><input type="radio" name="answer" value="${i}"><span>${escapeHTML(x)}</span></label>`).join(""):`<input type="text" id="freeAnswer" placeholder="Type Michael's answer exactly. 'I don't know' is allowed.">`;
    document.getElementById("app").innerHTML=shell(`<div class="card"><div class="row between"><div><span class="pill info">${current.review.window}</span><h2 style="margin-top:10px">Delayed retrieval ${current.session.itemIndex+1} of ${current.reviewItems.length}</h2><p class="muted">Fresh questions · no teaching feedback until the review is finished</p></div><span class="badge">${current.lesson.schoolTag}</span></div>
      <div class="row"><button class="btn" onclick="window.MLUL.readReviewQuestion()">🔊 Read to me</button><button class="btn" onclick="speechSynthesis.cancel()">■ Stop</button></div>
      <div class="question">${escapeHTML(q.q)}</div><div class="choices">${input}</div>
      <label class="small">How was this question accessed?</label><select id="itemAccessCondition" onchange="window.MLUL.markAccessObserved(this)">${accessOptions(null)}</select>
      <div class="spacer"></div><label class="small">Assistance on this item</label><select id="itemAssistanceLevel">${assistanceOptions(current.session.draft?.assistance_level||"INDEPENDENT")}</select>
      <div class="spacer"></div><div class="row"><label class="small"><input type="radio" name="confidence" value="sure"> Sure</label><label class="small"><input type="radio" name="confidence" value="kinda"> Kinda sure</label><label class="small"><input type="radio" name="confidence" value="guess"> Guessing</label></div>
      <div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.submitReviewAnswer()">Submit answer</button><button class="btn" onclick="window.MLUL.manualSave()">Save</button><button class="btn" onclick="window.MLUL.saveAndExit()">Save & Exit</button></div>
    </div>`);renderSaveStatus();restoreDraftToUI();const assist=document.getElementById("itemAssistanceLevel");if(assist&&current.session.draft?.assistance_level)assist.value=current.session.draft.assistance_level;bindDraftAutosave();
  }

  function readReviewQuestion(){
    const q=current.reviewItems[current.session.itemIndex];const selector=document.getElementById("itemAccessCondition");if(selector){selector.value="SYSTEM_READ_ALOUD";markAccessObserved(selector)}
    speak(q.q+(q.choices?" Choices. "+q.choices.join(". "):""));clearTimeout(draftSaveTimer);captureDraftFromUI();void save("review read-aloud access");
  }

  async function submitReviewAnswer(){
    const q=current.reviewItems[current.session.itemIndex];let raw="",correct=false;
    if(q.choices){const chosen=document.querySelector("input[name=answer]:checked");if(!chosen){alert("Choose Michael's answer first.");return}const idx=Number(chosen.value);raw=q.choices[idx];correct=idx===q.answer}
    else{const el=document.getElementById("freeAnswer");raw=el.value.trim();if(!raw){alert("Type Michael's answer exactly. 'I don't know' is a valid answer.");return}correct=answersMatch(raw,q.free)}
    const confidence=document.querySelector("input[name=confidence]:checked")?.value||"not_recorded";
    const accessSelector=document.getElementById("itemAccessCondition");const accessCondition=validAccessCondition(accessSelector?.value);const accessConditionSource=accessSourceFor(accessSelector,accessCondition);
    const assistanceSelector=document.getElementById("itemAssistanceLevel");const assistance=ASSISTANCE_LEVELS.includes(assistanceSelector?.value)?assistanceSelector.value:"INDEPENDENT";
    const ev={id:`review_ev_${current.session.id}_${current.session.itemIndex}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION",evidenceType:"DELAYED_RETRIEVAL",subject:current.session.subject,skillId:current.review.skillId,itemId:q.id,prompt:q.q,rawResponse:raw,isCorrect:correct,confidence,review_window:current.review.window,transfer:!!q.transfer,assistance_level:assistance,access_condition:accessCondition,access_condition_source:accessConditionSource,access_observation:{access_condition:accessCondition,access_condition_source:accessConditionSource,extra_processing_available:true,parent_verbatim_available:true},interpretation:correct?"delayed retrieval correct":"delayed retrieval miss"};
    pushEvidenceOnce(ev);pushSessionResponseOnce(current.session,ev);current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);if(!await save("review answer"))return;
    current.session.itemIndex++;
    if(current.session.itemIndex<current.reviewItems.length){state.activeSession=current.session;upsertSessionRecord(current.session);if(!await save("review next question"))return;renderReviewQuestion();return}
    await finishReview();
  }

  async function finishReview(){
    const responses=current.session.responses;const correct=responses.filter(x=>x.isCorrect).length;const total=responses.length;const score=Math.round(correct/total*100);const transferResponses=responses.filter(x=>x.transfer);const transferCorrect=transferResponses.length>0&&transferResponses.every(x=>x.isCorrect);
    const review=reviewById(current.review.id);review.completed=true;review.completedAt=now();review.score=score;review.outcome=reviewOutcomeFromScore(score);review.transferCorrect=transferCorrect;
    const lessonState=state.lessonState[current.review.skillId]||{};lessonState.memoryStrength=memoryStrengthForReview(review.window,score,transferCorrect);lessonState.lastReviewAt=review.completedAt;lessonState.lastReviewWindow=review.window;lessonState.trackBReviewOutcome=review.outcome;state.lessonState[current.review.skillId]=lessonState;
    current.session.status="COMPLETED";current.session.completedAt=now();current.session.draft=null;upsertSessionRecord(current.session);state.activeSession=null;if(!await save("finish review"))return;
    const corrections=current.reviewItems.map((q,i)=>{const r=responses[i];const expected=q.choices?q.choices[q.answer]:q.free;return `<div class="teacher"><strong>${r?.isCorrect?"✓":"Review"} ${escapeHTML(q.q)}</strong><p class="small">Michael: ${escapeHTML(r?.rawResponse||"")}</p><p class="small muted">Answer: ${escapeHTML(expected)}${q.why?` · ${escapeHTML(q.why)}`:""}</p></div>`}).join("");
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill good">${review.window} retrieval complete</span><h2 style="margin-top:12px">${current.lesson.title}</h2><div class="big">${correct}/${total}</div><p class="muted">${review.outcome} · Memory: ${lessonState.memoryStrength}</p><div class="callout"><strong>Still not a mastery declaration.</strong> Delayed retrieval updates memory evidence only. Track A owns canonical mastery transitions.</div><div class="spacer"></div>${corrections}<div class="row"><button class="btn primary" onclick="location.hash='reviews'">Back to Review Queue</button></div></div>`);renderSaveStatus();current=null;
  }

  function parentView(){
    const science=CONTENT.science.map(l=>skillRow(l)).join("");const math=CONTENT.math.map(l=>skillRow(l)).join("");
    const trackARows=TRACK_A_DIAGNOSTIC?TRACK_A_DIAGNOSTIC.SKILLS.map(s=>{const r=trackASkillRecord(s.id);const last=r.lastMaintenance?.result||r.lastMasteryCheck?.result||r.lastVerification?.result||r.lastRepair?.result||r.lastDiagnostic?.result||"—";return `<tr><td>${escapeHTML(s.title)}<div class="tiny muted">${escapeHTML(s.id)}</div></td><td>${escapeHTML(r.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(r.memoryStrength||"FRAGILE")}</td><td>${escapeHTML(last)}</td><td>${trackAPriorInstruction(s.id)?"PRIOR_INSTRUCTION / not cold":"—"}</td></tr>`}).join(""):"";
    const formalCount=state.evidence.filter(e=>e.evidence_class==="FORMAL_CONTROLLED").length;const informalCount=state.evidence.filter(e=>e.evidence_class==="INFORMAL_TRACK_B").length;
    return shell(`<div class="grid"><div class="card c8"><h2>Parent View</h2><p class="muted">Michael's learning record separates school facts, teaching evidence, controlled evidence, lifecycle state, and memory strength. No one score gets to masquerade as the whole story.</p></div><div class="card c4"><div class="kpi"><div class="t">Track B evidence</div><div class="n">${informalCount}</div></div><div class="spacer"></div><div class="kpi"><div class="t">Track A evidence</div><div class="n">${formalCount}</div></div></div>
      <div class="card c12"><h3>Physical Science skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${science}</tbody></table></div></div>
      <div class="card c12"><h3>Math bridge skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${math}</tbody></table></div></div>
      <div class="card c12"><h3>Track A controlled math map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Canonical state</th><th>Memory</th><th>Last diagnostic</th><th>Baseline note</th></tr></thead><tbody>${trackARows}</tbody></table></div></div>
    </div>`)
  }

  function skillRow(l){const s=lessonStatus(l.id);return `<tr><td>${escapeHTML(l.title)}<div class="tiny muted">${escapeHTML(l.id)}</div></td><td>${s.trackBProgress||"NOT_STARTED"}</td><td>${s.score==null?"—":s.score+"%"}</td><td>${s.memoryStrength||"—"}</td><td>${s.instruction_exposure_status||"Not taught in Track B yet"}</td></tr>`}

  function evidenceView(){
    const rows=state.evidence.slice().reverse().map(e=>`<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.track||"")}</td><td>${escapeHTML(e.attemptNumber??"—")}</td><td>${escapeHTML(e.sessionId||"—")}</td><td>${escapeHTML(e.subject||"")}</td><td>${escapeHTML(e.skillId)}</td><td>${escapeHTML(e.rawResponse)}</td><td>${e.isCorrect===true?"✓":e.isCorrect===false?"Needs work":"—"}</td><td>${escapeHTML(e.evidence_class||"")}</td><td>${escapeHTML(e.interaction_purpose||e.evidenceType||"—")}</td><td>${escapeHTML(e.instruction_exposure_status||"—")}</td><td>${escapeHTML(e.assistance_level||"")}</td><td>${escapeHTML(e.access_condition??"—")}</td><td>${escapeHTML(e.access_condition_source||"UNRECORDED")}</td><td>${e.fresh===true?"fresh":e.fresh===false?"not fresh":"—"} / ${e.reliable===true?"reliable":e.reliable===false?"unreliable":"—"}</td></tr>`).join("")||`<tr><td colspan="15" class="muted">No evidence recorded yet.</td></tr>`;
    return shell(`<div class="card"><div class="row between"><div><h2>Evidence Log</h2><p class="muted small">Raw evidence is preserved. Interpretation never overwrites Michael's original response. Formal controlled evidence keeps freshness, reliability, assistance, access, and prior-instruction status separately queryable.</p></div><button class="btn" onclick="window.MLUL.exportBackup()">Export backup</button></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Track</th><th>Attempt</th><th>Session</th><th>Subject</th><th>Skill</th><th>Raw response</th><th>Result</th><th>Evidence class</th><th>Purpose</th><th>Exposure</th><th>Assistance</th><th>Access condition</th><th>Access source</th><th>Quality</th></tr></thead><tbody>${rows}</tbody></table></div></div>`)
  }

  function reviewsView(){
    const rows=state.reviewSchedule.slice().sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).map(r=>{
      const l=lessonById(r.skillId);const due=new Date(r.dueAt);const dueNow=due<=new Date();const status=r.completed?`Completed · ${r.score}%`:dueNow?"Due now":"Scheduled";
      const action=r.completed?"—":dueNow?`<button class="btn ${RUNTIME_ENABLED?"primary":""}" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.startReview('${r.id}')">${RUNTIME_ENABLED?"Start fresh review":"Audit hold"}</button>`:"Not due yet";
      return `<tr><td>${escapeHTML(l?.title||r.skillId)}</td><td>${r.window}</td><td>${due.toLocaleDateString()}</td><td>${status}</td><td>${r.evidence_class} / ${r.instruction_exposure_status}</td><td>${action}</td></tr>`
    }).join("")||`<tr><td colspan="6" class="muted">Complete a Track B lesson to create delayed reviews.</td></tr>`;
    return shell(`<div class="card"><h2>Delayed Retrieval Queue</h2><p class="muted">Immediate success is not mastery. Track B schedules Day 2, Day 7, and Day 21 retrieval checkpoints and generates fresh deterministic items for each window.</p><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Window</th><th>Due</th><th>Status</th><th>Evidence label</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div><div class="callout small"><strong>Freshness rule:</strong> delayed reviews do not reuse the exact teaching prompts. Day 21 includes transfer evidence. Canonical mastery still belongs to Track A.</div></div>`)
  }

  function trackASkillRecord(skillId){
    return state.trackASkillState?.[skillId]||{canonicalState:"UNKNOWN",memoryStrength:"FRAGILE"}
  }

  function trackAPriorInstruction(skillId){
    return state.evidence.some(e=>e.skillId===skillId && e.instruction_exposure_status==="PRIOR_INSTRUCTION")
  }

  function trackAPromptIsFresh(skillId,item){
    const fp=TRACK_A_DIAGNOSTIC.fingerprint(item);
    return !state.evidence.some(e=>e.track==="A" && e.skillId===skillId && e.prompt_fingerprint===fp)
  }


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

  function trackAAssistanceOptions(selected=null){
    const labels={INDEPENDENT:"Independent",CLARIFIED:"Directions clarified",HINTED:"Hinted",GUIDED:"Guided",TAUGHT:"Taught during item",PARENT_ASSISTED:"Parent assisted"};
    return `<option value="" ${selected?"":"selected"}>Record assistance used</option>`+ASSISTANCE_LEVELS.map(v=>`<option value="${v}" ${v===selected?"selected":""}>${labels[v]}</option>`).join("")
  }

  function trackAActiveRecoverable(){
    const x=state.trackAActiveSession;
    return !!(x && ["ACTIVE","PAUSED","INTERRUPTED_PRESERVED"].includes(x.status) && TRACK_A_DIAGNOSTIC?.skill(x.skillId))
  }

  function trackARouteForSkill(skillId,seen=new Set()){
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

  function trackAAction(route){
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

  function trackAStatusRow(skill){
    const rec=trackASkillRecord(skill.id);const prior=trackAPriorInstruction(skill.id);const active=state.trackAActiveSession?.skillId===skill.id&&trackAActiveRecoverable();const route=trackARouteForSkill(skill.id);
    const action=active?`<button class="btn ${RUNTIME_ENABLED?"primary":""}" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackAPath()">${RUNTIME_ENABLED?"Resume preserved path":"Audit hold"}</button>`:trackAAction(route);
    const last=rec.lastMaintenance?.result||rec.lastMasteryCheck?.result||rec.lastVerification?.result||rec.lastRepair?.result||rec.lastDiagnostic?.result||"—";
    return `<tr><td>${escapeHTML(skill.title)}<div class="tiny muted">${escapeHTML(skill.id)}</div></td><td>${escapeHTML(rec.canonicalState||"UNKNOWN")}</td><td>${escapeHTML(rec.memoryStrength||"FRAGILE")}</td><td>${prior?"PRIOR_INSTRUCTION":"Cold baseline eligible if controlled"}</td><td>${escapeHTML(last)}</td><td>${action}</td></tr>`
  }

  function trackA(){
    if(!TRACK_A_ENGINE||!TRACK_A_DIAGNOSTIC)return shell(`<div class="card"><h2>Track A</h2><p class="warn">Track A engine is unavailable. Student use remains blocked.</p></div>`);
    const rows=TRACK_A_DIAGNOSTIC.SKILLS.map(trackAStatusRow).join("");
    const active=trackAActiveRecoverable()?`<div class="notice" style="border-color:#0369a1;background:#082f49;color:#bae6fd"><strong>Adaptive path preserved.</strong> ${escapeHTML(TRACK_A_DIAGNOSTIC.skill(state.trackAActiveSession.skillId)?.title||state.trackAActiveSession.skillId)} stopped during ${escapeHTML(state.trackAActiveSession.mode||"Track A work")}. Submitted evidence remains saved. <div class="row" style="margin-top:10px"><button class="btn primary" ${RUNTIME_ENABLED?"":"disabled"} onclick="window.MLUL.resumeTrackAPath()">Resume</button><button class="btn" onclick="window.MLUL.endTrackAPath()">End this set, keep evidence</button></div></div>`:"";
    return shell(`<div class="grid"><div class="card c8"><h2>Track A · Controlled Evidence</h2><p class="muted">Formal diagnostics use fresh, reliable probes and keep access support separate from instructional assistance. No answer feedback is given between probes.</p><div class="callout"><strong>State sequence:</strong> UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED</div></div><div class="card c4"><h3>3-probe rule</h3><p class="small">3/3 controlled → PROVISIONAL support. 2/3 → minimal correction + 2 fresh verification probes. 0–1/3 → trace downward to the first unstable prerequisite.</p></div><div class="card c12">${active}<h3>Math controlled diagnostic map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Canonical state</th><th>Memory</th><th>Baseline</th><th>Last result</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div><div class="callout warn small" style="margin-top:14px"><strong>Release gate:</strong> this UI is implemented but student runtime stays disabled until the separate target-browser persistence audit passes.</div></div></div>`)
  }

  async function startTrackADiagnostic(skillId){
    if(!evidenceSessionAllowed())return;
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
    if(rec.canonicalState==="PROVISIONAL")ensureTrackAMasterySchedule(session.skillId,rec.provisionalAt||now());
    session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A diagnostic"))return;
    const label=result.result==="PROVISIONAL_SUPPORTED"?"Provisional evidence supported":result.result==="MISS_DETECTED"?"One miss found":"Prerequisite trace needed";const route=result.result==="PREREQUISITE_TRACE_REQUIRED"?(prerequisiteTarget?`Next controlled target: ${TRACK_A_DIAGNOSTIC.skill(prerequisiteTarget).title}.`:"This is the root skill. Teach the smallest missing component before verification."):result.result==="MISS_DETECTED"?"Give the smallest correction, then use two fresh controlled verification probes.":"Schedule delayed retrieval and transfer before mastery can be considered.";
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${result.result==="PROVISIONAL_SUPPORTED"?"good":"warn"}">${escapeHTML(label)}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_DIAGNOSTIC.skill(session.skillId)?.title||session.skillId)}</h2><div class="big">${result.correct_count==null?"—":result.correct_count+"/3"}</div><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(result.next_action)}</strong><p class="small">${escapeHTML(result.reason)}</p><p class="small">${escapeHTML(route)}</p></div>${prior?`<div class="callout warn"><strong>Prior instruction attached.</strong> This formal evidence remains useful, but it is not a clean cold baseline.</div>`:""}<div class="row"><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div></div>`);renderSaveStatus();currentTrackA=null;
  }

  async function resumeTrackAPath(){
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. The preserved path remains saved.");return}if(!trackAActiveRecoverable())return;const session=state.trackAActiveSession;session.status="ACTIVE";session.resumedAt=now();state.trackAActiveSession=session;if(!await save("resume Track A path"))return;currentTrackA={session,skill:TRACK_A_DIAGNOSTIC.skill(session.skillId)};
    if(session.mode==="TRACK_A_REPAIR"){if(session.phase==="TEACH")renderTrackARepairTeach();else if(session.itemIndex>=session.items.length)await finishTrackARepair();else renderTrackARepairCheck();return}
    if(session.mode==="TRACK_A_VERIFICATION"){if(session.itemIndex>=session.items.length)await finishTrackAVerification();else renderTrackAVerificationQuestion();return}
    if(session.mode==="TRACK_A_MASTERY"){if(session.itemIndex>=session.items.length)await finishTrackAMasteryTask();else renderTrackAMasteryQuestion();return}
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
    if(!evidenceSessionAllowed())return;
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not start repair yet.");return}
    if(!TRACK_A_REMEDIATION||!TRACK_A_ENGINE){alert("Track A remediation module is unavailable.");return}
    if(state.activeSession||state.trackAActiveSession){alert("Finish, resume, or end the preserved session first.");return}
    const route=trackARouteForSkill(skillId);if(!["REPAIR","MASTERY_REPAIR","MAINTENANCE_REPAIR"].includes(route.type)||route.skillId!==skillId){alert("The adaptive route requires a different prerequisite step first.");return}
    const rec=trackASkillRecord(skillId);const formalRepair=route.type==="MASTERY_REPAIR";const maintenanceRepair=route.type==="MAINTENANCE_REPAIR";if(!["GAP","LEARNING","PRACTICING"].includes(rec.canonicalState)&&!formalRepair&&!maintenanceRepair){alert("This skill is not currently routed to targeted repair.");return}
    if(formalRepair){rec.masteryRepairRequired=true;rec.masteryRepairTaskId=route.taskId}
    if(maintenanceRepair){rec.maintenanceRepairRequired=true;rec.maintenanceRepairTaskId=route.taskId}
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
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_REPAIR"||session.responses.length!==session.items.length)return;const verified=session.responses.every(e=>e.isCorrect===true&&e.assistance_level==="INDEPENDENT"&&e.reliable===true);const rec=trackASkillRecord(session.skillId);let transitionReason=null;let retryCreated=null;
    if(verified&&rec.canonicalState==="LEARNING"){const t=TRACK_A_ENGINE.transitionDecision("LEARNING","PRACTICING",{smallest_component_verified:true});if(!t.allowed)throw new Error(`Track A component transition blocked: ${t.reason}`);rec.canonicalState="PRACTICING";rec.lastTransitionReason=t.reason;transitionReason=t.reason}
    if(verified&&rec.masteryRepairRequired&&rec.masteryRepairTaskId){retryCreated=TRACK_A_MASTERY_STATE.retryTask(state.trackAMasterySchedule,rec.masteryRepairTaskId,now());rec.masteryRepairRequired=false;rec.masteryRepairTaskId=null}
    if(verified&&rec.maintenanceRepairRequired&&rec.maintenanceRepairTaskId){retryCreated=TRACK_A_MASTERY_STATE.retryTask(state.trackAMasterySchedule,rec.maintenanceRepairTaskId,now());rec.maintenanceRepairRequired=false;rec.maintenanceRepairTaskId=null}
    rec.lastRepair={sessionId:session.id,result:verified?"COMPONENT_VERIFIED":"NEEDS_MORE_INSTRUCTION",verified,completedAt:now(),independent_check_count:session.responses.filter(e=>e.assistance_level==="INDEPENDENT").length,transition_reason:transitionReason,retry_task_id:retryCreated?.id||null};state.trackASkillState[session.skillId]=rec;session.status="COMPLETED";session.completedAt=now();state.trackAActiveSession=null;if(!await save("finish targeted Track B repair"))return;
    const nextText=retryCreated?`A fresh ${masteryTaskLabel(retryCreated)} retry is ready. The failed evidence was preserved.`:verified&&rec.canonicalState==="PRACTICING"?"Next: two fresh FORMAL_CONTROLLED verification probes.":verified?"Return to the formal evidence path.":"Do not promote the skill from learning yet.";
    document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${verified?"good":"warn"}">${verified?"Component verified":"More repair needed"}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_REMEDIATION.repair(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(nextText)}</strong><p class="small">The component check requires every repair-check item correct, reliable, and INDEPENDENT. This is not a percent-score shortcut.</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }

  async function startTrackAVerification(skillId){
    if(!evidenceSessionAllowed())return;
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
    const session=state.trackAActiveSession||currentTrackA?.session;if(!session||session.mode!=="TRACK_A_VERIFICATION"||session.responses.length!==2)return;const probes=session.responses.map(e=>({fresh:e.fresh===true,reliable:e.reliable===true,assistance_level:e.assistance_level,correct:e.isCorrect===true}));const result=TRACK_A_ENGINE.evaluateTwoProbeVerification(probes);const rec=trackASkillRecord(session.skillId);if(result.result==="VERIFICATION_PASSED"){const t=TRACK_A_ENGINE.transitionDecision(rec.canonicalState,"PROVISIONAL",{verification_result:result.result});if(!t.allowed)throw new Error(`Track A verification transition blocked: ${t.reason}`);rec.canonicalState="PROVISIONAL";rec.provisionalAt=now();rec.lastTransitionReason=t.reason}rec.lastVerification={sessionId:session.id,result:result.result,correct_count:result.correct_count??null,next_action:result.next_action,completedAt:now()};state.trackASkillState[session.skillId]=rec;if(rec.canonicalState==="PROVISIONAL")ensureTrackAMasterySchedule(session.skillId,rec.provisionalAt||now());session.status="COMPLETED";session.completedAt=now();session.result=result;state.trackAActiveSession=null;if(!await save("finish Track A verification"))return;
    const passed=result.result==="VERIFICATION_PASSED";document.getElementById("app").innerHTML=shell(`<div class="card"><span class="pill ${passed?"good":"warn"}">${escapeHTML(result.result)}</span><h2 style="margin-top:12px">${escapeHTML(TRACK_A_DIAGNOSTIC.skill(session.skillId).title)}</h2><p class="muted">Canonical state: ${escapeHTML(rec.canonicalState)}</p><div class="callout"><strong>${escapeHTML(result.next_action)}</strong><p class="small">${passed?"The skill is PROVISIONAL only. Formal delayed retrieval plus transfer are still required before mastery.":result.result==="VERIFICATION_FAILED"?"Return to the smallest missing component and reteach. Do not promote the lifecycle state.":"Replace unusable formal probes; assisted, stale, or unreliable probes do not count."}</p></div><button class="btn primary" onclick="location.hash='track-a'">Back to Track A</button></div>`);renderSaveStatus();currentTrackA=null;
  }


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
    if(!evidenceSessionAllowed())return;
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

  function persistenceLabel(){
    const stateName=persistenceStatus?.state||"UNKNOWN_OR_UNSUPPORTED";
    return stateName==="PERSISTENT"?"Persistent mode granted":stateName==="BEST_EFFORT"?"Best-effort storage":"Unknown or unsupported";
  }

  function backupView(){
    const standalone=STORAGE_DURABILITY?STORAGE_DURABILITY.isStandaloneEnvironment(window):false;
    const mirrorText=sameOriginRedundancyDegraded()?`Degraded (${escapeHTML(redundancyComparison)})`:`Synced at revision ${escapeHTML(state.stateRevision??"pre-revision")}`;
    return shell(`<div class="grid"><div class="card c6"><h2>External JSON backup</h2><p class="muted">This is the only protection layer here that survives total loss of this origin's browser storage.</p><button class="btn primary" onclick="window.MLUL.exportBackup()">Attempt portable backup export</button><p class="tiny muted">Last export attempt: ${state.backup?.lastExportAttemptedAt?fmt(state.backup.lastExportAttemptedAt):"none yet"}</p></div><div class="card c6"><h2>Restore JSON</h2><input type="file" id="importFile" accept="application/json,.json"><div class="spacer"></div><button class="btn" onclick="window.MLUL.importBackup()">Restore JSON backup</button></div><div class="card c6"><h3>Home Screen layer</h3><p class="small">Current display mode: <strong>${standalone?"Home Screen / standalone":"browser tab"}</strong>.</p><p class="tiny muted">Home Screen installation and persistent-storage mode address different browser-storage mechanisms. Neither replaces the external JSON backup.</p></div><div class="card c6"><h3>Persistent storage layer</h3><p class="small"><strong>${escapeHTML(persistenceLabel())}</strong></p><button class="btn" ${persistenceStatus?.canRequest?"":"disabled"} onclick="window.MLUL.requestPersistentStorage()">Request persistent storage</button><p class="tiny muted">This request only runs from this parent-facing button, never during init().</p></div><div class="card c6"><h3>Same-origin integrity</h3><p class="small">IndexedDB is authoritative. localStorage is a synchronization mirror, not an off-origin backup.</p><p class="small"><strong>Mirror:</strong> ${mirrorText}</p>${sameOriginRedundancyDegraded()&&!redundancyOverrideAcknowledged()?`<button class="btn" onclick="window.MLUL.acknowledgeRedundancyOverride()">Acknowledge degraded redundancy</button>`:""}</div><div class="card c6"><h3>Persistence health</h3><p id="healthText" class="small">Checking…</p><button class="btn" onclick="window.MLUL.checkPersistenceUI()">Run primary persistence test</button></div></div>`)
  }

  async function exportBackup(){
    if(!state.backup)state.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
    state.backup.lastExportAttemptedAt=now();
    const snapshot=JSON.stringify(state,null,2);
    const blob=new Blob([snapshot],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Michael-Level-Up-Backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    await save("backup exported");
  }

  async function requestPersistentStorage(){
    if(!STORAGE_DURABILITY){persistenceStatus={state:"UNKNOWN_OR_UNSUPPORTED",supported:false,canRequest:false,checked:true,error:"module unavailable"};render();return}
    persistenceStatus=await STORAGE_DURABILITY.requestPersistentStorage(navigator.storage);
    render();
  }

  async function refreshPersistenceStatus(){
    if(!STORAGE_DURABILITY){persistenceStatus={state:"UNKNOWN_OR_UNSUPPORTED",supported:false,canRequest:false,checked:true,error:"module unavailable"};return persistenceStatus}
    persistenceStatus=await STORAGE_DURABILITY.getPersistenceStatus(navigator.storage);
    return persistenceStatus;
  }

  async function acknowledgeRedundancyOverride(){
    if(!state.backup)state.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
    state.backup.redundancyOverrideAcknowledgedAt=now();
    if(!await save("acknowledge degraded redundancy"))return;
    render();
  }

  function firstRunView(){
    return `<div class="shell"><div class="card"><h2>No valid learner record is loaded</h2><p class="muted">This can be a true first run or total same-origin storage loss. Level-Up will not silently create a replacement record.</p><div class="callout warn"><strong>Choose deliberately.</strong> Restore an external JSON backup if one exists, or explicitly start a new learner record.</div><input type="file" id="importFile" accept="application/json,.json"><div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.importBackup()">Restore JSON backup</button><button class="btn" onclick="window.MLUL.createNewLearnerRecord()">Start a new learner record</button></div></div></div>`;
  }

  function mirrorAheadView(){
    const issue=storageRecoveryIssue;
    return `<div class="shell"><div class="card"><h2>Storage integrity decision required</h2><p class="muted">The localStorage mirror has a higher revision than authoritative IndexedDB. Level-Up will not guess which history to keep.</p><div class="callout warn"><strong>Primary revision:</strong> ${escapeHTML(STATE_INTEGRITY.revisionOf(issue?.rawPrimary)??"pre-revision")} · <strong>Mirror revision:</strong> ${escapeHTML(STATE_INTEGRITY.revisionOf(issue?.rawMirror)??"pre-revision")}</div><div class="row"><button class="btn primary" onclick="window.MLUL.resolveMirrorAhead('MIRROR')">Use newer mirror</button><button class="btn" onclick="window.MLUL.resolveMirrorAhead('PRIMARY')">Keep primary record</button></div></div></div>`;
  }

  async function createNewLearnerRecord(){
    const hadPrior=!!storageRecoveryIssue;
    state=normalizeStateShape(freshState());
    state.learnerRecordOrigin=STATE_INTEGRITY.makeLearnerRecordOrigin("NEW",now(),hadPrior);
    lastDurableRevision=STATE_INTEGRITY.maxObservedRevision([storageRecoveryIssue?.rawPrimary,storageRecoveryIssue?.rawMirror]);
    firstRunDecisionRequired=false;storageRecoveryIssue=null;
    if(!await save("create new learner record")){firstRunDecisionRequired=true;return}
    render();
  }

  async function resolveMirrorAhead(choice){
    const issue=storageRecoveryIssue;if(!issue||issue.type!=="MIRROR_AHEAD")return;
    const observed=[issue.rawPrimary,issue.rawMirror,issue.primary,issue.mirror];
    lastDurableRevision=STATE_INTEGRITY.maxObservedRevision(observed);
    if(choice==="MIRROR"){
      state=normalizeStateShape(STATE_INTEGRITY.prepareRestoreCandidate(issue.rawMirror||issue.mirror,{source:"MIRROR",now:now(),observedRevisions:observed}));
    }else{
      state=normalizeStateShape(JSON.parse(JSON.stringify(issue.primary)));
      if(!state.backup)state.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
      state.backup.lastRecoveryDecision={type:"KEEP_PRIMARY_OVER_AHEAD_MIRROR",decidedAt:now(),observedMirrorRevision:STATE_INTEGRITY.revisionOf(issue.rawMirror)};
      state.stateRevision=lastDurableRevision||state.stateRevision;
    }
    const previousIssue=storageRecoveryIssue;storageRecoveryIssue=null;backupMirrorHealthy=false;redundancyComparison="MIRROR_AHEAD";
    if(!await save("resolve mirror ahead")){storageRecoveryIssue=previousIssue;return}
    render();
  }

  function importBackup(){
    const file=document.getElementById("importFile")?.files?.[0];if(!file){alert("Choose a backup file first.");return}
    const r=new FileReader();r.onload=async()=>{
      try{
        const parsed=JSON.parse(r.result);
        if(!STATE_INTEGRITY)throw new Error("Restore validation module is unavailable.");
        const diskRaw=await idbGet(STATE_KEY).catch(()=>null);const mirrorRaw=readLocalBackupRaw();
        const observed=[diskRaw,mirrorRaw,state];
        const baseRevision=STATE_INTEGRITY.maxObservedRevision(observed);
        const candidate=normalizeStateShape(STATE_INTEGRITY.prepareRestoreCandidate(parsed,{source:"JSON",now:now(),observedRevisions:observed}));
        const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok)throw new Error("Persistence health check failed; restore was not attempted.");
        const previous=state?JSON.parse(JSON.stringify(state)):null;const previousRevision=lastDurableRevision;
        state=candidate;lastDurableRevision=baseRevision;
        if(!await save("restore JSON")){state=previous;lastDurableRevision=previousRevision;rebindLiveStateReferences();throw new Error("Restore could not be durably saved; previous learner state was kept in memory.")}
        firstRunDecisionRequired=false;storageRecoveryIssue=null;
        alert("Backup restored.");render();
      }catch(e){alert("Could not restore backup: "+e.message)}
    };r.readAsText(file)
  }

  async function checkPersistenceUI(){const ok=await persistenceHealthCheck();renderSaveStatus();const el=document.getElementById("healthText");if(el)el.innerHTML=ok?"<span style='color:#9af0b8'>PASS: primary IndexedDB response persistence is working.</span>":"<span style='color:#ff9baa'>FAIL: do not run a lesson until primary storage is working.</span>"}

  function render(){
    if(current)return;
    if(firstRunDecisionRequired){document.getElementById("app").innerHTML=firstRunView();return}
    if(storageRecoveryIssue?.type==="MIRROR_AHEAD"){document.getElementById("app").innerHTML=mirrorAheadView();return}
    const route=getRoute();const view={dashboard, "track-b":trackB,parent:parentView,evidence:evidenceView,reviews:reviewsView,"track-a":trackA,backup:backupView}[route]||dashboard;
    document.getElementById("app").innerHTML=view();renderSaveStatus();if(route==="backup")checkPersistenceUI();
  }

  async function init(){
    try{
      await openDB();
      await refreshPersistenceStatus();
      const rawDisk=await idbGet(STATE_KEY);const rawMirror=readLocalBackupRaw();
      const disk=prepareLoadedStateSafe(rawDisk,"PRIMARY");const mirror=prepareLoadedStateSafe(rawMirror,"MIRROR");
      if(disk&&mirror){
        const comparison=STATE_INTEGRITY.compareRevisions(rawDisk,rawMirror);
        state=normalizeStateShape(disk);lastDurableRevision=STATE_INTEGRITY.maxObservedRevision([rawDisk,rawMirror,disk,mirror]);
        if(comparison==="MIRROR_AHEAD"){
          storageRecoveryIssue={type:"MIRROR_AHEAD",primary:disk,mirror,rawPrimary:rawDisk,rawMirror};backupMirrorHealthy=false;redundancyComparison=comparison;saveHealthy=true;
        }else if(comparison==="UNKNOWN_PRE_REVISION"){
          backupMirrorHealthy=false;redundancyComparison=comparison;saveHealthy=true;
          if(!await save("bootstrap revision model"))throw new Error("Could not establish the first revision.");
        }else if(comparison==="MIRROR_STALE"){
          backupMirrorHealthy=mirrorWriteAndReadback(state);redundancyComparison=backupMirrorHealthy?"IN_SYNC":"MIRROR_STALE";saveHealthy=true;
        }else{backupMirrorHealthy=true;redundancyComparison="IN_SYNC";saveHealthy=true}
      }else if(disk){
        state=normalizeStateShape(disk);lastDurableRevision=STATE_INTEGRITY.maxObservedRevision([rawDisk,disk]);saveHealthy=true;
        if(STATE_INTEGRITY.revisionOf(rawDisk)==null){backupMirrorHealthy=false;redundancyComparison="UNKNOWN_PRE_REVISION";if(!await save("bootstrap primary revision"))throw new Error("Could not bootstrap primary revision.")}
        else{backupMirrorHealthy=mirrorWriteAndReadback(state);redundancyComparison=backupMirrorHealthy?"IN_SYNC":"MIRROR_STALE"}
      }else if(mirror){
        const observed=[rawDisk,rawMirror,mirror];lastDurableRevision=STATE_INTEGRITY.maxObservedRevision(observed);
        state=normalizeStateShape(STATE_INTEGRITY.prepareRestoreCandidate(rawMirror||mirror,{source:"MIRROR",now:now(),observedRevisions:observed}));
        backupMirrorHealthy=false;redundancyComparison="MIRROR_STALE";saveHealthy=true;
        if(!await save("restore mirror to primary"))throw new Error("Could not restore mirror to IndexedDB.");
      }else{
        state=normalizeStateShape(freshState());firstRunDecisionRequired=true;saveHealthy=true;backupMirrorHealthy=false;redundancyComparison="UNVERIFIED";
        if(rawDisk||rawMirror)storageRecoveryIssue={type:"NO_VALID_RECORD",rawPrimary:rawDisk,rawMirror};
      }
    }catch(e){
      console.error(e);
      state=normalizeStateShape(freshState());firstRunDecisionRequired=true;saveHealthy=false;backupMirrorHealthy=false;redundancyComparison="UNVERIFIED";
    }
    if(state?.stateRevision){lastDurableRevision=state.stateRevision;lastDurableState=JSON.parse(JSON.stringify(state))}
    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}if(currentTrackA){currentTrackA.session.status="PAUSED";currentTrackA.session.pausedAt=now();state.trackAActiveSession=currentTrackA.session;if(!await save("Track A navigation pause"))return}current=null;currentTrackA=null;render()});
    if(!firstRunDecisionRequired&&!storageRecoveryIssue&&state.activeSession && state.activeSession.status==="ACTIVE"){
      state.activeSession.status="INTERRUPTED_PRESERVED";state.activeSession.interruptedAt=now();upsertSessionRecord(state.activeSession);await save("recover interrupted session");
    }
    if(!firstRunDecisionRequired&&!storageRecoveryIssue&&state.trackAActiveSession && state.trackAActiveSession.status==="ACTIVE"){
      state.trackAActiveSession.status="INTERRUPTED_PRESERVED";state.trackAActiveSession.interruptedAt=now();await save("recover interrupted Track A diagnostic");
    }
    render();
  }

  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,startReview,readReviewQuestion,submitReviewAnswer,startTrackADiagnostic,readTrackAQuestion,submitTrackAAnswer,startTrackARepair,readTrackARepairTeach,beginTrackARepairChecks,readTrackARepairQuestion,submitTrackARepairAnswer,nextTrackARepairCheck,startTrackAVerification,readTrackAVerificationQuestion,submitTrackAVerificationAnswer,initializeTrackAMastery,startTrackAMasteryTask,readTrackAMasteryQuestion,submitTrackAMasteryAnswer,replaceTrackAMasteryTask,finalizeTrackAMastery,resumeTrackAPath,resumeTrackADiagnostic,saveAndExitTrackA,endTrackAPath,endTrackADiagnostic,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,requestPersistentStorage,acknowledgeRedundancyOverride,createNewLearnerRecord,resolveMirrorAhead,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord,answersMatch,memoryStrengthForReview,reviewOutcomeFromScore,trackAPriorInstruction,trackAPromptIsFresh,trackAActiveRecoverable,trackARouteForSkill,ensureTrackAMasterySchedule,masteryRouteInfo,maybeFinalizeTrackAMastery,sameOriginRedundancyDegraded}};
  init();
})();
