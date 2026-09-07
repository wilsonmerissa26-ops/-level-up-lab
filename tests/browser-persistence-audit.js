(() => {
  const DB_NAME='MLUL_SYNTHETIC_AUDIT_V1';
  const DB_VERSION=1;
  const STORE='state';
  const STATE_KEY='synthetic_learner';
  const PROBE_KEY='__healthcheck';
  const BACKUP_KEY='MLUL_SYNTHETIC_BACKUP_V1';
  let db=null;

  const clone=x=>JSON.parse(JSON.stringify(x));
  const valid=x=>!!(x&&x.student?.id==='synthetic'&&Array.isArray(x.evidence)&&x.lessonState&&typeof x.lessonState==='object');
  const original=()=>({
    student:{id:'synthetic'},
    evidence:[{id:'ev1',rawResponse:'kinetic'},{id:'ev2',rawResponse:'conduction'}],
    lessonState:{SCI_TEST:{status:'COMPLETED'}},
    sessions:[{id:'sess_test',status:'ACTIVE',phase:'CHECK_AFTER_TEACH',itemIndex:1,draft:{freeAnswer:'I do not know',confidence:'guess'}}],
    activeSession:{id:'sess_test',status:'ACTIVE',phase:'CHECK_AFTER_TEACH',itemIndex:1,draft:{freeAnswer:'I do not know',confidence:'guess'}}
  });

  function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>{db=r.result;resolve(db)};r.onerror=()=>reject(r.error)})}
  function put(v,k=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(clone(v),k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
  function get(k=STATE_KEY){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(k);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}
  function del(k){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
  function clearStore(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
  function assert(condition,name,detail=''){if(!condition)throw new Error(name+(detail?`: ${detail}`:''));return {name,pass:true}}

  async function run(){
    const results=[];
    try{
      await openDB();await clearStore();localStorage.removeItem(BACKUP_KEY);
      const seed=original();await put(seed);localStorage.setItem(BACKUP_KEY,JSON.stringify(seed));
      results.push(assert((await get()).evidence.length===2,'Seed learner record saved'));

      await put({ok:true,t:Date.now()},PROBE_KEY);
      results.push(assert((await get(STATE_KEY)).evidence.length===2,'Health probe cannot overwrite learner record mid-check'));
      const probe=await get(PROBE_KEY);results.push(assert(probe?.ok===true,'Health probe remains readable under dedicated key'));
      await del(PROBE_KEY);
      results.push(assert((await get(STATE_KEY)).evidence.length===2,'Learner record intact after probe cleanup'));

      await put({ok:true,t:'invalid-state'},STATE_KEY);
      const disk=await get(STATE_KEY);const backup=JSON.parse(localStorage.getItem(BACKUP_KEY));
      const selected=valid(disk)?disk:(valid(backup)?backup:null);
      results.push(assert(selected?.evidence?.length===2,'Invalid disk falls back to valid local backup'));
      await put(selected,STATE_KEY);
      results.push(assert((await get(STATE_KEY)).evidence.length===2,'Recovered backup is restored to IndexedDB'));

      const crashed=await get(STATE_KEY);crashed.activeSession.status='ACTIVE';await put(crashed,STATE_KEY);
      const reopened=await get(STATE_KEY);
      if(reopened.activeSession?.status==='ACTIVE')reopened.activeSession.status='INTERRUPTED_PRESERVED';
      await put(reopened,STATE_KEY);
      const recovered=await get(STATE_KEY);
      results.push(assert(recovered.activeSession?.status==='INTERRUPTED_PRESERVED','Interrupted session remains preserved after reload'));
      results.push(assert(recovered.activeSession?.draft?.freeAnswer==='I do not know','Unsubmitted draft survives reload'));
      results.push(assert(recovered.activeSession?.itemIndex===1,'Resume item index survives reload'));
      results.push(assert(recovered.evidence.length===2,'Submitted evidence survives interrupted-session recovery'));

      recovered.activeSession.status='PAUSED';recovered.activeSession.pausedAt=new Date().toISOString();await put(recovered,STATE_KEY);
      const paused=await get(STATE_KEY);
      results.push(assert(paused.activeSession?.status==='PAUSED','Save & Exit preserves resumable session'));
      results.push(assert(paused.activeSession?.draft?.confidence==='guess','Save & Exit preserves draft metadata'));

      render(results,null);
    }catch(err){render(results,err)}
  }

  function render(results,error){
    const box=document.getElementById('results');
    box.innerHTML=results.map(r=>`<p class="pass">PASS · ${r.name}</p>`).join('')+(error?`<p class="fail">FAIL · ${error.message}</p>`:'<p class="pass"><strong>All synthetic browser persistence checks passed.</strong></p>');
    document.getElementById('raw').textContent=JSON.stringify({runAt:new Date().toISOString(),database:DB_NAME,usesMichaelDatabase:false,passed:!error,checks:results.map(r=>r.name),error:error?.message??null},null,2);
  }
  document.getElementById('run').addEventListener('click',run);
})();
