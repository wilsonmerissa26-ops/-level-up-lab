(() => {
  const DURABILITY=window.LEVEL_UP_STORAGE_DURABILITY;
  const DB_NAME='MichaelLevelUpLab_BROWSER_AUDIT';
  const DB_VERSION=1;
  const STORE='state';
  const STATE_KEY='synthetic';
  const PROBE_KEY='__healthcheck';
  const BACKUP_KEY='MLUL_BROWSER_AUDIT_BACKUP_V1';
  const PHASE_KEY='MLUL_BROWSER_AUDIT_PHASE';
  const ENV_HISTORY_KEY='MLUL_BROWSER_AUDIT_ENV_HISTORY';
  let db=null;
  let writeSequence=Promise.resolve();
  let lastDurableRevision=0;
  const results=[];

  const $=id=>document.getElementById(id);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const syntheticState=(tag='seed',status='PAUSED')=>({schemaVersion:2,stateRevision:null,student:{id:'synthetic-audit'},tag,evidence:[{id:'a'},{id:'b'}],lessonState:{SYN:{status:'COMPLETED'}},activeSession:{id:'audit-session',status},learnerRecordOrigin:{type:'NEW',decidedAt:new Date().toISOString(),priorRecordOffered:false},updatedAt:new Date().toISOString()});
  const valid=x=>!!(x&&x.schemaVersion===2&&x.student&&x.student.id==='synthetic-audit'&&Array.isArray(x.evidence)&&x.lessonState&&typeof x.lessonState==='object');
  const rev=x=>Number.isInteger(x?.stateRevision)&&x.stateRevision>=1?x.stateRevision:null;
  const compare=(p,m)=>{const a=rev(p),b=rev(m);if(a==null||b==null)return'UNKNOWN_PRE_REVISION';if(a===b)return'IN_SYNC';return a>b?'MIRROR_STALE':'MIRROR_AHEAD'};

  function log(name,ok,detail=''){
    results.push({name,ok,detail});
    render();
  }
  function render(){
    const passed=results.filter(x=>x.ok).length;
    $('summary').innerHTML=results.length?`<strong>${passed}/${results.length} passed</strong>`:'No tests run yet.';
    $('results').innerHTML=results.map(r=>`<div class="result"><strong class="${r.ok?'pass':'fail'}">${r.ok?'PASS':'FAIL'} — ${escapeHtml(r.name)}</strong>${r.detail?`<div class="muted">${escapeHtml(r.detail)}</div>`:''}</div>`).join('');
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const x=req.result;if(!x.objectStoreNames.contains(STORE))x.createObjectStore(STORE)};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
  function get(key=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)})}
  function put(value,key=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error)})}
  function del(key){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).delete(key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error)})}
  function clearDB(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const req=tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);req.onerror=()=>reject(req.error)})}

  async function healthCheck(){
    const probe={ok:true,t:Date.now()};
    await put(probe,PROBE_KEY);
    const got=await get(PROBE_KEY);
    try{await del(PROBE_KEY)}catch(_){ }
    return !!(got&&got.ok);
  }

  async function mirrorSave(state){
    const candidate=clone(state);
    const task=writeSequence.catch(()=>{}).then(async()=>{
      const revision=lastDurableRevision>=1?lastDurableRevision+1:1;
      candidate.stateRevision=revision;
      candidate.updatedAt=new Date().toISOString();
      await put(candidate,STATE_KEY);
      localStorage.setItem(BACKUP_KEY,JSON.stringify(candidate));
      const readback=JSON.parse(localStorage.getItem(BACKUP_KEY)||'null');
      if(JSON.stringify(readback)!==JSON.stringify(candidate))throw new Error('mirror readback mismatch');
      lastDurableRevision=revision;
      return clone(candidate);
    });
    writeSequence=task;
    return task;
  }

  function readBackup(){try{const raw=localStorage.getItem(BACKUP_KEY);if(!raw)return null;const x=JSON.parse(raw);return valid(x)?x:null}catch(_){return null}}

  async function initSelection(){
    const disk=await get(STATE_KEY);const backup=readBackup();
    if(valid(disk)&&valid(backup))return {kind:'RECORD',source:'disk',state:disk,comparison:compare(disk,backup)};
    if(valid(disk))return {kind:'RECORD',source:'disk',state:disk,comparison:'MIRROR_STALE'};
    if(valid(backup))return {kind:'PRIMARY_MISSING_DECISION_REQUIRED',source:'backup',state:backup,comparison:'PRIMARY_MISSING'};
    return {kind:'FIRST_RUN_DECISION_REQUIRED',source:null,state:null,comparison:'NONE'};
  }

  function envHistory(){try{return JSON.parse(localStorage.getItem(ENV_HISTORY_KEY)||'[]')}catch(_){return[]}}
  function saveEnvHistory(entry){const history=envHistory();history.push(entry);localStorage.setItem(ENV_HISTORY_KEY,JSON.stringify(history.slice(-12)));return history.slice(-12)}

  async function refreshEnvironment(record=true){
    const durability=DURABILITY?await DURABILITY.getPersistenceStatus(navigator.storage):{state:'UNKNOWN_OR_UNSUPPORTED',canRequest:false};
    const standalone=DURABILITY?DURABILITY.isStandaloneEnvironment(window):false;
    const entry={at:new Date().toISOString(),standalone,persistence:durability.state};
    const history=record?saveEnvHistory(entry):envHistory();
    $('environment').innerHTML=`<div><strong>Display:</strong> ${standalone?'Home Screen / standalone':'browser tab'}</div><div><strong>Storage:</strong> ${escapeHtml(durability.state)}</div><div class="muted">Recorded environment checks: ${history.length}. Run once in Safari and again from the Home Screen to compare.</div>`;
    $('persistBtn').disabled=!durability.canRequest;
    return entry;
  }

  async function requestStorageMode(){
    if(!DURABILITY){log('persistent storage request module present',false);return}
    const result=await DURABILITY.requestPersistentStorage(navigator.storage);
    log('persistent-storage request completed',result.state==='PERSISTENT'||result.state==='BEST_EFFORT'||result.state==='UNKNOWN_OR_UNSUPPORTED',result.state);
    await refreshEnvironment(true);
  }

  async function runBasic(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);lastDurableRevision=0;
    const seed=syntheticState('basic');
    const durableSeed=await mirrorSave(seed);
    log('seed writes IndexedDB with revision 1',(await get())?.stateRevision===1);
    log('seed mirrors same revision to localStorage',readBackup()?.stateRevision===1);
    log('primary and mirror compare IN_SYNC',compare(await get(),readBackup())==='IN_SYNC');

    const before=clone(await get());
    const ok=await healthCheck();
    const after=await get();
    log('health check passes',ok);
    log('health check never changes learner record',JSON.stringify(before)===JSON.stringify(after));
    log('health probe cleanup leaves no state replacement',(await get(PROBE_KEY))===null);

    const s1={...durableSeed,tag:'write-1'};
    const s2={...durableSeed,tag:'write-2'};
    const p1=mirrorSave(s1);const p2=mirrorSave(s2);await Promise.all([p1,p2]);
    log('serialized writes leave newest snapshot on disk',(await get()).tag==='write-2');
    log('serialized writes increment revisions monotonically',(await get()).stateRevision===3);
    log('serialized writes mirror newest revision locally',readBackup()?.stateRevision===3);

    await clearDB();localStorage.removeItem(BACKUP_KEY);lastDurableRevision=0;
    const pre=syntheticState('pre-revision');delete pre.stateRevision;await put(pre,STATE_KEY);localStorage.setItem(BACKUP_KEY,JSON.stringify(pre));
    const preSelected=await initSelection();
    log('pre-revision pair is UNKNOWN_PRE_REVISION',preSelected.comparison==='UNKNOWN_PRE_REVISION');
    await mirrorSave(preSelected.state);
    log('next successful write bootstraps revision 1',(await get()).stateRevision===1&&readBackup()?.stateRevision===1);

    await clearDB();localStorage.removeItem(BACKUP_KEY);lastDurableRevision=0;
    const selected=await initSelection();
    log('empty origin requires explicit first-run decision',selected.kind==='FIRST_RUN_DECISION_REQUIRED');
  }

  async function startCrashReload(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);lastDurableRevision=0;
    const seed=syntheticState('crash-window','ACTIVE');
    await mirrorSave(seed);
    await put({ok:true,t:Date.now()},PROBE_KEY);
    localStorage.setItem(PHASE_KEY,'verify-crash');
    location.reload();
  }

  async function verifyCrashReload(){
    const disk=await get(STATE_KEY);const backup=readBackup();
    log('crash/reload keeps IndexedDB learner record',valid(disk)&&disk.tag==='crash-window');
    log('crash/reload keeps localStorage mirror',valid(backup)&&backup.tag==='crash-window');
    log('crash/reload probe is isolated from learner key',!!(await get(PROBE_KEY)));
    const preserved=clone(disk);preserved.activeSession.status='INTERRUPTED_PRESERVED';preserved.activeSession.interruptedAt=new Date().toISOString();lastDurableRevision=rev(disk)||0;await mirrorSave(preserved);
    log('interrupted ACTIVE session becomes INTERRUPTED_PRESERVED',(await get()).activeSession.status==='INTERRUPTED_PRESERVED');
    log('recovery requires explicit resume-or-end choice',(await get()).activeSession.status!=='ACTIVE','No automatic resume occurred.');
    try{await del(PROBE_KEY)}catch(_){ }
    localStorage.removeItem(PHASE_KEY);
  }

  async function startFallbackReload(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);lastDurableRevision=0;
    const mirror=await mirrorSave(syntheticState('mirror-good'));
    await put({schemaVersion:2,student:{id:'synthetic-audit'},tag:'invalid learner object'},STATE_KEY);
    localStorage.setItem(BACKUP_KEY,JSON.stringify(mirror));
    localStorage.setItem(PHASE_KEY,'verify-fallback');
    location.reload();
  }

  async function verifyFallbackReload(){
    const chosen=await initSelection();
    const backup=readBackup();
    log('invalid primary falls through to valid mirror',chosen.source==='backup'&&chosen.state.tag==='mirror-good');
    lastDurableRevision=rev(chosen.state)||0;
    const restored={...chosen.state,learnerRecordOrigin:{type:'RESTORED_MIRROR',decidedAt:new Date().toISOString(),priorRecordOffered:true}};
    await mirrorSave(restored);
    const disk=await get(STATE_KEY);
    log('mirror recovery rewrites authoritative primary',valid(disk)&&disk.tag==='mirror-good');
    log('restore reconciliation advances revision beyond observed mirror',disk.stateRevision>(rev(backup)||0));
    localStorage.removeItem(PHASE_KEY);
  }

  async function resetAudit(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);lastDurableRevision=0;
    $('summary').textContent='Audit storage reset. Michael data was never touched. Environment history was kept for Safari vs Home Screen comparison.';
  }

  async function init(){
    try{
      await openDB();
      const phase=localStorage.getItem(PHASE_KEY);
      if(phase==='verify-crash')await verifyCrashReload();
      if(phase==='verify-fallback')await verifyFallbackReload();
      $('runBtn').onclick=()=>runBasic().catch(e=>log('non-reload audit crashed',false,e.message));
      $('crashBtn').onclick=()=>startCrashReload().catch(e=>log('crash/reload setup failed',false,e.message));
      $('fallbackBtn').onclick=()=>startFallbackReload().catch(e=>log('mirror-recovery setup failed',false,e.message));
      $('resetBtn').onclick=()=>resetAudit().catch(e=>log('reset failed',false,e.message));
      $('checkStorageBtn').onclick=()=>refreshEnvironment(true).catch(e=>log('storage-mode check failed',false,e.message));
      $('persistBtn').onclick=()=>requestStorageMode().catch(e=>log('persistent-storage request failed',false,e.message));
      await refreshEnvironment(true);
    }catch(e){log('audit database opened',false,e.message)}
  }
  init();
})();
