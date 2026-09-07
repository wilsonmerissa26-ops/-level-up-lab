(() => {
  const DB_NAME='MichaelLevelUpLab_BROWSER_AUDIT';
  const DB_VERSION=1;
  const STORE='state';
  const STATE_KEY='synthetic';
  const PROBE_KEY='__healthcheck';
  const BACKUP_KEY='MLUL_BROWSER_AUDIT_BACKUP_V1';
  const PHASE_KEY='MLUL_BROWSER_AUDIT_PHASE';
  let db=null;
  let writeSequence=Promise.resolve();
  const results=[];

  const $=id=>document.getElementById(id);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const syntheticState=(tag='seed')=>({schemaVersion:1,student:{id:'synthetic-audit'},tag,evidence:[{id:'a'},{id:'b'}],lessonState:{SYN:{status:'COMPLETED'}},activeSession:{id:'audit-session',status:'PAUSED'},updatedAt:new Date().toISOString()});
  const valid=x=>!!(x&&x.student&&x.student.id==='synthetic-audit'&&Array.isArray(x.evidence)&&x.lessonState&&typeof x.lessonState==='object');

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
    const snap=clone(state);
    const task=writeSequence.catch(()=>{}).then(async()=>{await put(snap,STATE_KEY);localStorage.setItem(BACKUP_KEY,JSON.stringify(snap));return true});
    writeSequence=task;
    return task;
  }

  function readBackup(){try{const raw=localStorage.getItem(BACKUP_KEY);if(!raw)return null;const x=JSON.parse(raw);return valid(x)?x:null}catch(_){return null}}

  async function initSelection(){
    const disk=await get(STATE_KEY);
    if(valid(disk)){
      localStorage.setItem(BACKUP_KEY,JSON.stringify(disk));
      return {source:'disk',state:disk};
    }
    const backup=readBackup();
    if(valid(backup)){
      await put(backup,STATE_KEY);
      return {source:'backup',state:backup};
    }
    const fresh=syntheticState('fresh');
    await put(fresh,STATE_KEY);
    localStorage.setItem(BACKUP_KEY,JSON.stringify(fresh));
    return {source:'fresh',state:fresh};
  }

  async function runBasic(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);
    const seed=syntheticState('basic');
    await mirrorSave(seed);
    log('seed writes IndexedDB',JSON.stringify(await get())===JSON.stringify(seed));
    log('seed mirrors localStorage',JSON.stringify(readBackup())===JSON.stringify(seed));

    const before=clone(await get());
    const ok=await healthCheck();
    const after=await get();
    log('health check passes',ok);
    log('health check never changes learner record',JSON.stringify(before)===JSON.stringify(after));
    log('health probe cleanup leaves no state replacement',(await get(PROBE_KEY))===null);

    const s1=syntheticState('write-1');
    const s2=syntheticState('write-2');
    const p1=mirrorSave(s1);const p2=mirrorSave(s2);await Promise.all([p1,p2]);
    log('serialized writes leave newest snapshot on disk',(await get()).tag==='write-2');
    log('serialized writes mirror newest snapshot locally',readBackup()?.tag==='write-2');

    await clearDB();localStorage.removeItem(BACKUP_KEY);
    const selected=await initSelection();
    log('true first run creates fresh valid state',selected.source==='fresh'&&valid(selected.state));
  }

  async function startCrashReload(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);
    const seed=syntheticState('crash-window');
    await mirrorSave(seed);
    await put({ok:true,t:Date.now()},PROBE_KEY);
    localStorage.setItem(PHASE_KEY,'verify-crash');
    location.reload();
  }

  async function verifyCrashReload(){
    const disk=await get(STATE_KEY);const backup=readBackup();
    log('crash/reload keeps IndexedDB learner record',valid(disk)&&disk.tag==='crash-window');
    log('crash/reload keeps localStorage backup',valid(backup)&&backup.tag==='crash-window');
    log('crash/reload probe is isolated from learner key',!!(await get(PROBE_KEY)));
    try{await del(PROBE_KEY)}catch(_){ }
    localStorage.removeItem(PHASE_KEY);
  }

  async function startFallbackReload(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);
    const backup=syntheticState('fallback-good');
    localStorage.setItem(BACKUP_KEY,JSON.stringify(backup));
    await put({ok:true,t:'invalid learner object'},STATE_KEY);
    localStorage.setItem(PHASE_KEY,'verify-fallback');
    location.reload();
  }

  async function verifyFallbackReload(){
    const chosen=await initSelection();
    const disk=await get(STATE_KEY);const backup=readBackup();
    log('invalid disk falls through to valid backup',chosen.source==='backup'&&chosen.state.tag==='fallback-good');
    log('recovery rewrites backup to IndexedDB',valid(disk)&&disk.tag==='fallback-good');
    log('recovery does not erase the valid backup first',valid(backup)&&backup.tag==='fallback-good');
    localStorage.removeItem(PHASE_KEY);
  }

  async function resetAudit(){
    results.length=0;render();
    await clearDB();localStorage.removeItem(BACKUP_KEY);localStorage.removeItem(PHASE_KEY);
    $('summary').textContent='Audit storage reset. Michael data was never touched.';
  }

  async function init(){
    try{
      await openDB();
      const phase=localStorage.getItem(PHASE_KEY);
      if(phase==='verify-crash')await verifyCrashReload();
      if(phase==='verify-fallback')await verifyFallbackReload();
      $('runBtn').onclick=()=>runBasic().catch(e=>log('non-reload audit crashed',false,e.message));
      $('crashBtn').onclick=()=>startCrashReload().catch(e=>log('crash/reload setup failed',false,e.message));
      $('fallbackBtn').onclick=()=>startFallbackReload().catch(e=>log('fallback/reload setup failed',false,e.message));
      $('resetBtn').onclick=()=>resetAudit().catch(e=>log('reset failed',false,e.message));
    }catch(e){log('audit database opened',false,e.message)}
  }
  init();
})();
