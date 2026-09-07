(() => {
  const CONTENT = window.LEVEL_UP_CONTENT;
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
  let saveHealthy = false;
  let writeSequence = Promise.resolve();
  let draftSaveTimer = null;

  const freshState = () => ({
    schemaVersion:1,
    student:CONTENT.student,
    activeTrack:"B",
    lessonState:{},
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
    return !!(value && value.student && value.student.id === "michael" && Array.isArray(value.evidence) && value.lessonState && typeof value.lessonState === "object");
  }

  function readLocalBackup(){
    try{
      const raw=localStorage.getItem(BACKUP_KEY);
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      return isValidLearnerState(parsed)?parsed:null;
    }catch(_){return null}
  }

  async function save(reason="update"){
    state.updatedAt=new Date().toISOString();
    const snapshot=JSON.parse(JSON.stringify(state));
    const task=writeSequence.catch(()=>{}).then(async()=>{
      await idbPut(snapshot,STATE_KEY);
      localStorage.setItem(BACKUP_KEY,JSON.stringify(snapshot));
      return true;
    });
    writeSequence=task;
    try{
      await task;
      saveHealthy=true;renderSaveStatus();
      return true;
    }catch(err){
      saveHealthy=false;renderSaveStatus();
      alert("Saving failed. The session is paused so Michael's evidence is not lost. Export a backup before continuing.");
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
    if(!value.settings || typeof value.settings!=="object") value.settings={readAloud:true,extraProcessing:true,parentTypesVerbatim:true};
    return value;
  }

  function validAccessCondition(value){return ACCESS_CONDITIONS.includes(value)?value:null}

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
    }
  }

  function bindDraftAutosave(){
    if(!current)return;
    const selectors=["#sayBack","#teachAccess","#freeAnswer","#itemAccessCondition","input[name=answer]","input[name=confidence]"];
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
    current={lesson,session};
    if(session.phase==="TEACH")renderLessonTeach();else renderQuestion();
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
    el.className="badge "+(saveHealthy?"good":"warn");
    el.innerHTML=(saveHealthy?"<span class='statusdot'></span>Persistence active":"<span class='statusdot bad'></span>Persistence problem");
  }

  function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
  function normalize(s){return String(s).trim().toLowerCase().replace(/[^a-z0-9.+-]/g,"")}
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
    if(!RUNTIME_ENABLED){alert("Student use is disabled while this build is under audit. Michael should not use it yet.");return}
    const lesson=lessonById(id);if(!lesson)return;
    if(!isReady(lesson)){alert("Finish the prerequisite first.");return}
    const ok=await persistenceHealthCheck();renderSaveStatus();
    if(!ok){alert("The app cannot verify persistence, so the lesson will not start.");return}
    const session={id:`sess_${Date.now()}`,track:"B",subject,lessonId:id,startedAt:now(),phase:"TEACH",instructionDelivered:false,itemIndex:0,responses:[],access_policy:{allowed_access_conditions:[...ACCESS_CONDITIONS],extra_processing_available:true,parent_verbatim_available:true},teach_access_condition:null,teach_access_condition_source:"UNRECORDED",status:"ACTIVE"};
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
      state.evidence.push({id:`ev_${Date.now()}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:current.session.subject,skillId:current.lesson.id,evidenceType:"THINK_ALOUD",rawResponse:sayBack,interpretation:null,assistance_level:assistanceLevelForSession(current.session),access_condition:teachAccess,access_condition_source:teachAccessSource,access_observation:{access_condition:teachAccess,access_condition_source:teachAccessSource,parent_verbatim_used:true,extra_processing_available:true}});
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
    else{const el=document.getElementById("freeAnswer");raw=el.value.trim();if(!raw){alert("Type Michael's answer exactly. 'I don't know' is a valid answer.");return}correct=normalize(raw)===normalize(q.free)}
    const confidence=document.querySelector("input[name=confidence]:checked")?.value||"not_recorded";
    const accessSelector=document.getElementById("itemAccessCondition");
    const accessCondition=validAccessCondition(accessSelector?.value);
    const accessConditionSource=accessSourceFor(accessSelector,accessCondition);
    const assistanceLevel=assistanceLevelForSession(current.session);
    const ev={id:`ev_${Date.now()}_${current.session.itemIndex}`,createdAt:now(),studentId:"michael",track:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION",subject:current.session.subject,skillId:current.lesson.id,itemId:q.id,prompt:q.q,rawResponse:raw,isCorrect:correct,confidence,assistance_level:assistanceLevel,access_condition:accessCondition,access_condition_source:accessConditionSource,access_observation:{access_condition:accessCondition,access_condition_source:accessConditionSource,extra_processing_available:true,parent_verbatim_available:true},interpretation:correct?"immediate taught-response correct":"immediate taught-response needs more support"};
    state.evidence.push(ev);current.session.responses.push(ev);current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);
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
    const existing=state.reviewSchedule.filter(x=>x.skillId===skillId&&!x.completed);if(existing.length)return;
    [2,7,21].forEach(days=>{const d=new Date();d.setDate(d.getDate()+days);state.reviewSchedule.push({id:`rev_${Date.now()}_${days}`,skillId,subject,dueAt:d.toISOString(),window:`Day ${days}`,completed:false,sourceTrack:"B",evidence_class:"INFORMAL_TRACK_B",instruction_exposure_status:"PRIOR_INSTRUCTION"})});
  }

  function parentView(){
    const science=CONTENT.science.map(l=>skillRow(l)).join("");const math=CONTENT.math.map(l=>skillRow(l)).join("");
    return shell(`<div class="grid"><div class="card c8"><h2>Parent View</h2><p class="muted">Michael's learning record separates school facts, teaching evidence, skill state, and memory strength. No one score gets to masquerade as the whole story.</p></div><div class="card c4"><div class="kpi"><div class="t">Track B evidence</div><div class="n">${state.evidence.length}</div></div></div>
      <div class="card c12"><h3>Physical Science skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${science}</tbody></table></div></div>
      <div class="card c12"><h3>Math bridge skill map</h3><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Immediate score</th><th>Memory</th><th>Baseline note</th></tr></thead><tbody>${math}</tbody></table></div></div>
    </div>`)
  }

  function skillRow(l){const s=lessonStatus(l.id);return `<tr><td>${escapeHTML(l.title)}<div class="tiny muted">${escapeHTML(l.id)}</div></td><td>${s.trackBProgress||"NOT_STARTED"}</td><td>${s.score==null?"—":s.score+"%"}</td><td>${s.memoryStrength||"—"}</td><td>${s.instruction_exposure_status||"Not taught in Track B yet"}</td></tr>`}

  function evidenceView(){
    const rows=state.evidence.slice().reverse().map(e=>`<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.subject||"")}</td><td>${escapeHTML(e.skillId)}</td><td>${escapeHTML(e.rawResponse)}</td><td>${e.isCorrect===true?"✓":e.isCorrect===false?"Needs work":"—"}</td><td>${escapeHTML(e.evidence_class||"")}</td><td>${escapeHTML(e.instruction_exposure_status||"")}</td><td>${escapeHTML(e.assistance_level||"")}</td><td>${escapeHTML(e.access_condition??"—")}</td><td>${escapeHTML(e.access_condition_source||"UNRECORDED")}</td></tr>`).join("")||`<tr><td colspan="10" class="muted">No evidence recorded yet.</td></tr>`;
    return shell(`<div class="card"><div class="row between"><div><h2>Evidence Log</h2><p class="muted small">Raw evidence is preserved. Interpretation never overwrites Michael's original response. An unobserved access condition stays null instead of being inferred.</p></div><button class="btn" onclick="window.MLUL.exportBackup()">Export backup</button></div><div class="tablewrap"><table><thead><tr><th>Time</th><th>Subject</th><th>Skill</th><th>Raw response</th><th>Result</th><th>Evidence class</th><th>Exposure</th><th>Assistance</th><th>Access condition</th><th>Access source</th></tr></thead><tbody>${rows}</tbody></table></div></div>`)
  }

  function reviewsView(){
    const rows=state.reviewSchedule.slice().sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).map(r=>{const l=lessonById(r.skillId);const due=new Date(r.dueAt);const nowd=new Date();const status=r.completed?"Completed":due<=nowd?"Due now":"Scheduled";return `<tr><td>${escapeHTML(l?.title||r.skillId)}</td><td>${r.window}</td><td>${due.toLocaleDateString()}</td><td>${status}</td><td>${r.evidence_class} / ${r.instruction_exposure_status}</td></tr>`}).join("")||`<tr><td colspan="5" class="muted">Complete a Track B lesson to create delayed reviews.</td></tr>`;
    return shell(`<div class="card"><h2>Delayed Retrieval Queue</h2><p class="muted">Immediate success is not mastery. Track B schedules Day 2, Day 7, and Day 21 retrieval checkpoints by default.</p><div class="tablewrap"><table><thead><tr><th>Skill</th><th>Window</th><th>Due</th><th>Status</th><th>Evidence label</th></tr></thead><tbody>${rows}</tbody></table></div><div class="callout warn small"><strong>v1 foundation:</strong> review scheduling is active. Fresh review item generation is the next implementation slice; it will never reuse the exact teaching questions as the only mastery evidence.</div></div>`)
  }

  function trackA(){
    return shell(`<div class="grid"><div class="card c8"><h2>Track A · Controlled Evidence</h2><p class="muted">Track A is the formal diagnostic/mastery lane. It is intentionally protected from Track B teaching contamination.</p><div class="callout"><strong>State sequence:</strong> UNKNOWN → DIAGNOSTIC → GAP → LEARNING → PRACTICING → PROVISIONAL → MASTERED → EXTENDED</div></div><div class="card c4"><h3>Locked rule</h3><p class="small muted">A skill taught in Track B is never later called a clean cold baseline. Formal evidence carries PRIOR_INSTRUCTION.</p></div><div class="card c12"><h3>Mastery rule</h3><p>Three fresh independent probes can support PROVISIONAL evidence. MASTERED still requires delayed retrieval plus transfer. “Cleared” is not the same as mastered.</p><p class="small muted">Track A delivery UI is intentionally not active yet. We are using Track B first while the permanent controlled diagnostic slice is built.</p></div></div>`)
  }

  function backupView(){
    return shell(`<div class="grid"><div class="card c6"><h2>Backup</h2><p class="muted">IndexedDB saves every answer immediately in this browser. A JSON snapshot is the off-browser backup for the current self-contained pilot; the browser can record that an export was attempted but cannot prove the file was saved.</p><button class="btn primary" onclick="window.MLUL.exportBackup()">Attempt portable backup export</button><p class="tiny muted">Last export attempt: ${state.backup?.lastExportAttemptedAt?fmt(state.backup.lastExportAttemptedAt):"none yet"}</p></div><div class="card c6"><h2>Restore</h2><input type="file" id="importFile" accept="application/json,.json"><div class="spacer"></div><button class="btn" onclick="window.MLUL.importBackup()">Restore backup</button></div><div class="card c12"><h3>Local-storage retention requirement</h3><p class="small">For the audited local-only iPad pilot, install the web app to the Home Screen before use. A normal Safari tab is not accepted as the learner record's long-term storage environment. Cloud/server persistence may be added later for cross-device sync, off-device recovery, and commercial scale.</p></div><div class="card c12"><h3>Persistence health</h3><p id="healthText" class="small">Checking…</p><button class="btn" onclick="window.MLUL.checkPersistenceUI()">Run persistence test</button></div></div>`)
  }

  async function exportBackup(){
    if(!state.backup)state.backup={lastExportAttemptedAt:null,pendingAfterLesson:false};
    state.backup.lastExportAttemptedAt=now();
    // Keep pendingAfterLesson true: a browser download gesture cannot prove that a durable backup file exists.
    const snapshot=JSON.stringify(state,null,2);
    const blob=new Blob([snapshot],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Michael-Level-Up-Backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    await save("backup exported");
  }

  function importBackup(){
    const file=document.getElementById("importFile").files[0];if(!file){alert("Choose a backup file first.");return}
    const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!x.student||x.student.id!=="michael")throw new Error("This is not Michael's Level-Up backup.");state=x;await save("restore");alert("Backup restored.");render()}catch(e){alert("Could not restore backup: "+e.message)}};r.readAsText(file)
  }

  async function checkPersistenceUI(){const ok=await persistenceHealthCheck();renderSaveStatus();const el=document.getElementById("healthText");if(el)el.innerHTML=ok?"<span style='color:#9af0b8'>PASS: response persistence is working.</span>":"<span style='color:#ff9baa'>FAIL: do not run a lesson until storage is working.</span>"}

  function render(){
    if(current)return;
    const route=getRoute();const view={dashboard, "track-b":trackB,parent:parentView,evidence:evidenceView,reviews:reviewsView,"track-a":trackA,backup:backupView}[route]||dashboard;
    document.getElementById("app").innerHTML=view();renderSaveStatus();if(route==="backup")checkPersistenceUI();
  }

  async function init(){
    try{
      await openDB();
      const diskState=await idbGet(STATE_KEY);
      if(isValidLearnerState(diskState)){
        state=normalizeStateShape(diskState);
        // Disk is authoritative only after structural validation. Mirror it to backup.
        localStorage.setItem(BACKUP_KEY,JSON.stringify(state));
        saveHealthy=true;
      }else{
        const backupState=readLocalBackup();
        if(isValidLearnerState(backupState)){
          // Recover the known-good backup to IndexedDB. Do not overwrite the backup first.
          state=normalizeStateShape(backupState);
          await idbPut(state,STATE_KEY);
          saveHealthy=true;
        }else{
          // True first run: neither store contains a valid learner record.
          state=normalizeStateShape(freshState());
          await idbPut(state,STATE_KEY);
          localStorage.setItem(BACKUP_KEY,JSON.stringify(state));
          saveHealthy=true;
        }
      }
    }catch(e){
      console.error(e);
      const backupState=readLocalBackup();
      state=normalizeStateShape(isValidLearnerState(backupState)?backupState:freshState());
      saveHealthy=false;
    }
    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}current=null;render()});
    if(state.activeSession && state.activeSession.status==="ACTIVE"){
      // Crash/reload recovery: preserve the session in place and require an explicit resume or end choice.
      state.activeSession.status="INTERRUPTED_PRESERVED";
      state.activeSession.interruptedAt=now();
      upsertSessionRecord(state.activeSession);
      await save("recover interrupted session");
    }
    render();
  }

  window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord}};
  init();
})();
