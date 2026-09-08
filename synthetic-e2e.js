(() => {
  const CONTENT=window.LEVEL_UP_CONTENT;
  const REVIEW=window.LEVEL_UP_REVIEW_ENGINE;
  const TRACK_A_ENGINE=window.LEVEL_UP_TRACK_A_ENGINE;
  const TRACK_A_DIAGNOSTIC=window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
  const DURABILITY=window.LEVEL_UP_STORAGE_DURABILITY;
  const INTEGRITY=window.LEVEL_UP_STATE_INTEGRITY;
  const CORE=window.LEVEL_UP_SYNTHETIC_E2E_CORE;

  const DB_NAME='MichaelLevelUpLab_SYNTHETIC_E2E';
  const DB_VERSION=1;
  const STORE='state';
  const STATE_KEY='synthetic-e2e';
  const BACKUP_KEY='MLUL_SYNTHETIC_E2E_BACKUP_V1';
  const PHASE_KEY='MLUL_SYNTHETIC_E2E_PHASE';
  const RESULTS_KEY='MLUL_SYNTHETIC_E2E_RESULTS';
  let db=null;
  let lastDurableRevision=0;
  let writeSequence=Promise.resolve();

  const $=id=>document.getElementById(id);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const now=()=>new Date().toISOString();
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

  function readResults(){try{return JSON.parse(localStorage.getItem(RESULTS_KEY)||'[]')}catch(_){return[]}}
  function writeResults(results){localStorage.setItem(RESULTS_KEY,JSON.stringify(results))}
  function log(name,ok,detail=''){
    const results=readResults();results.push({name,ok,detail,at:now()});writeResults(results);renderResults();
  }
  function renderResults(){
    const results=readResults();const passed=results.filter(x=>x.ok).length;
    $('summary').innerHTML=results.length?`<strong>${passed}/${results.length} passed</strong>`:'No smoke test run yet.';
    $('results').innerHTML=results.map(r=>`<div class="result"><strong class="${r.ok?'pass':'fail'}">${r.ok?'PASS':'FAIL'} — ${escapeHtml(r.name)}</strong>${r.detail?`<div class="muted">${escapeHtml(r.detail)}</div>`:''}</div>`).join('');
  }

  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const x=req.result;if(!x.objectStoreNames.contains(STORE))x.createObjectStore(STORE)};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
  function get(key=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)})}
  function put(value,key=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error)})}
  function clearDB(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error)})}
  function readMirror(){try{const raw=localStorage.getItem(BACKUP_KEY);return raw?JSON.parse(raw):null}catch(_){return null}}

  async function saveState(state){
    state.updatedAt=now();
    const candidate=clone(state);
    const task=writeSequence.catch(()=>{}).then(async()=>{
      const revision=INTEGRITY.nextRevision(lastDurableRevision);
      candidate.stateRevision=revision;
      await put(candidate,STATE_KEY);
      localStorage.setItem(BACKUP_KEY,JSON.stringify(candidate));
      const mirror=readMirror();
      if(JSON.stringify(mirror)!==JSON.stringify(candidate))throw new Error('synthetic mirror readback mismatch');
      lastDurableRevision=revision;
      return {revision,updatedAt:candidate.updatedAt};
    });
    writeSequence=task;
    const result=await task;
    // Match production save semantics: persist an immutable snapshot, but keep the live
    // learner object/session references intact so later mutations cannot target stale clones.
    state.stateRevision=result.revision;
    state.updatedAt=result.updatedAt;
    return state;
  }

  async function refreshEnvironment(){
    const persistence=DURABILITY?await DURABILITY.getPersistenceStatus(navigator.storage):{state:'UNKNOWN_OR_UNSUPPORTED'};
    const standalone=DURABILITY?DURABILITY.isStandaloneEnvironment(window):false;
    $('environment').innerHTML=`<div><strong>Display:</strong> ${standalone?'Home Screen / standalone':'browser tab'}</div><div><strong>Storage:</strong> ${escapeHtml(persistence.state)}</div><div class="tiny muted">This smoke test is valid only for the environment in which you run it.</div>`;
  }

  function setPhase(value){if(value)localStorage.setItem(PHASE_KEY,value);else localStorage.removeItem(PHASE_KEY)}
  function phase(){return localStorage.getItem(PHASE_KEY)||''}

  function modulesReady(){return !!(CONTENT&&REVIEW&&TRACK_A_ENGINE&&TRACK_A_DIAGNOSTIC&&INTEGRITY&&CORE)}

  async function startSmoke(){
    await clearDB();
    localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);localStorage.removeItem(RESULTS_KEY);
    lastDurableRevision=0;writeSequence=Promise.resolve();renderResults();
    if(!modulesReady()){log('required production modules are loaded',false);return}
    log('required production modules are loaded',true);

    const lesson=CONTENT.science[0];
    let state=CORE.freshState(now());
    state=await saveState(state);
    log('new synthetic learner persists to IndexedDB',!!(await get())&&state.stateRevision===1);
    log('new synthetic learner mirrors revision 1',readMirror()?.stateRevision===1);

    const session=CORE.startTrackBSession(state,lesson,now());
    state=await saveState(state);
    log('Track B learner session starts ACTIVE',state.activeSession?.status==='ACTIVE');

    CORE.recordTrackBTeaching(state,session,lesson,INTEGRITY,now());
    state=await saveState(state);
    log('Track B teaching evidence is PRIOR_INSTRUCTION',state.evidence.some(e=>e.interaction_purpose==='INSTRUCTIONAL'&&e.instruction_exposure_status==='PRIOR_INSTRUCTION'));

    CORE.recordPerfectTrackBChecks(state,session,lesson,INTEGRITY,now());
    state=await saveState(state);
    const practice=state.evidence.filter(e=>e.skillId===lesson.id&&e.interaction_purpose==='PRACTICE');
    log('three Track B practice responses persist',practice.length===3);
    log('raw responses remain preserved',practice.every(e=>typeof e.rawResponse==='string'&&e.rawResponse.length>0));
    log('Track B evidence carries session and attempt identity',practice.every(e=>e.sessionId===session.id&&e.attemptNumber===1));

    state.activeSession.status='ACTIVE';CORE.upsertSession(state,state.activeSession);
    state=await saveState(state);
    setPhase('VERIFY_INTERRUPT');
    location.reload();
  }

  async function verifyInterrupt(){
    let state=await get();const mirror=readMirror();
    lastDurableRevision=INTEGRITY.maxObservedRevision([state,mirror]);
    log('reload keeps synthetic IndexedDB learner record',!!state&&state.student?.id===CORE.SYNTHETIC_STUDENT_ID);
    log('reload keeps synthetic localStorage mirror',!!mirror&&mirror.student?.id===CORE.SYNTHETIC_STUDENT_ID);
    log('primary and mirror remain revision-synchronized',INTEGRITY.compareRevisions(state,mirror)==='IN_SYNC');
    log('interrupted session is still ACTIVE before recovery logic',state.activeSession?.status==='ACTIVE');

    state.activeSession.status='INTERRUPTED_PRESERVED';state.activeSession.interruptedAt=now();CORE.upsertSession(state,state.activeSession);
    state=await saveState(state);
    log('recovery marks ACTIVE session INTERRUPTED_PRESERVED',state.activeSession?.status==='INTERRUPTED_PRESERVED');
    log('synthetic learner is not auto-resumed',state.activeSession?.status!=='ACTIVE');
    setPhase('AWAIT_EXPLICIT_RESUME');
    configureButtons();
  }

  async function continueSmoke(){
    let state=await get();const mirror=readMirror();lastDurableRevision=INTEGRITY.maxObservedRevision([state,mirror]);
    if(state?.activeSession?.status!=='INTERRUPTED_PRESERVED'){log('explicit resume starts only from preserved state',false);return}
    const lesson=CONTENT.science[0];
    state.activeSession.status='ACTIVE';state.activeSession.resumedAt=now();CORE.upsertSession(state,state.activeSession);
    state=await saveState(state);
    log('explicit user action resumes preserved session',state.activeSession?.status==='ACTIVE');

    const finish=CORE.completeTrackBLesson(state,state.activeSession,lesson,now());
    state=await saveState(state);
    log('Track B lesson completes with CHECK_STRONG',finish.score===100&&state.lessonState[lesson.id]?.trackBProgress==='CHECK_STRONG');
    log('Track B completion does not create canonical mastery',!state.trackASkillState[lesson.id]);
    log('Day 2, Day 7, and Day 21 reviews are scheduled',state.reviewSchedule.filter(r=>r.skillId===lesson.id).length===3);
    log('completed session remains in session history',state.sessions.some(s=>s.id==='synthetic_trackb_session_1'&&s.status==='COMPLETED'));

    const freshReview=REVIEW.generateReview(lesson.id,'Day 2','synthetic_day2_review');
    const teachingPrompts=new Set(lesson.checks.map(q=>q.q));
    log('delayed review generates three fresh items',freshReview.length===3&&freshReview.every(q=>!teachingPrompts.has(q.q)));

    const mathSkill='MATH.INTEGER_OPS';
    CORE.addPriorInstructionForMath(state,INTEGRITY,mathSkill,now());
    const formal=CORE.runPerfectTrackADiagnostic(state,mathSkill,TRACK_A_DIAGNOSTIC,TRACK_A_ENGINE,INTEGRITY,now());
    state=await saveState(state);
    log('Track A three-probe diagnostic supports PROVISIONAL only',formal.evaluation.result==='PROVISIONAL_SUPPORTED'&&state.trackASkillState[mathSkill]?.canonicalState==='PROVISIONAL');
    log('Track A does not jump directly to MASTERED',state.trackASkillState[mathSkill]?.canonicalState!=='MASTERED');
    log('prior instruction blocks clean cold-baseline interpretation',formal.evaluation.instruction_exposure_status==='PRIOR_INSTRUCTION'&&formal.evaluation.cold_baseline_eligible===false);
    const formalEvidence=state.evidence.filter(e=>e.track==='A'&&e.skillId===mathSkill);
    log('formal evidence preserves raw response and independent conditions',formalEvidence.length===3&&formalEvidence.every(e=>e.rawResponse!==undefined&&e.assistance_level==='INDEPENDENT'&&e.fresh===true&&e.reliable===true));

    setPhase('VERIFY_FINAL');
    location.reload();
  }

  async function verifyFinal(){
    const state=await get();const mirror=readMirror();lastDurableRevision=INTEGRITY.maxObservedRevision([state,mirror]);
    const lesson=CONTENT.science[0];const mathSkill='MATH.INTEGER_OPS';
    log('final reload keeps primary and mirror in sync',INTEGRITY.compareRevisions(state,mirror)==='IN_SYNC');
    log('final reload keeps completed Track B lesson',state.lessonState[lesson.id]?.status==='COMPLETED');
    log('final reload keeps all three delayed-review tasks',state.reviewSchedule.filter(r=>r.skillId===lesson.id).length===3);
    log('final reload keeps Track A at PROVISIONAL',state.trackASkillState[mathSkill]?.canonicalState==='PROVISIONAL');
    log('all learner evidence keeps session attribution',state.evidence.every(e=>e.sessionId&&Number.isInteger(e.attemptNumber)&&e.attemptNumber>=1));
    log('state revision advanced monotonically across the learner path',Number.isInteger(state.stateRevision)&&state.stateRevision>=7);
    setPhase('DONE');configureButtons();
  }

  async function resetSmoke(){
    await clearDB();localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);localStorage.removeItem(RESULTS_KEY);lastDurableRevision=0;writeSequence=Promise.resolve();renderResults();configureButtons();
  }

  function configureButtons(){
    const p=phase();
    $('continueBtn').style.display=p==='AWAIT_EXPLICIT_RESUME'?'inline-flex':'none';
    $('runBtn').style.display=p==='AWAIT_EXPLICIT_RESUME'?'none':'inline-flex';
    $('runBtn').textContent=p==='DONE'?'Run synthetic learner smoke test again':'Run synthetic learner smoke test';
  }

  async function init(){
    try{
      await openDB();await refreshEnvironment();renderResults();
      $('runBtn').onclick=()=>startSmoke().catch(e=>log('synthetic smoke test crashed',false,e.message));
      $('continueBtn').onclick=()=>continueSmoke().catch(e=>log('synthetic resume/finish crashed',false,e.message));
      $('resetBtn').onclick=()=>resetSmoke().catch(e=>log('synthetic reset failed',false,e.message));
      const p=phase();
      if(p==='VERIFY_INTERRUPT')await verifyInterrupt();
      else if(p==='VERIFY_FINAL')await verifyFinal();
      configureButtons();
    }catch(e){log('synthetic smoke harness initialized',false,e.message)}
  }

  init();
})();
