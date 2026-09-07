from pathlib import Path
import re

p=Path('app.js')
s=p.read_text()

def rep(old,new,label,count=1):
    global s
    if old not in s:
        raise SystemExit(f'missing patch anchor: {label}')
    s=s.replace(old,new,count)

def sub(pattern,repl,label,count=1,flags=0):
    global s
    s2,n=re.subn(pattern,repl,s,count=count,flags=flags)
    if n!=count:
        raise SystemExit(f'patch regex {label}: expected {count}, got {n}')
    s=s2

rep('  const STATE_INTEGRITY = window.LEVEL_UP_STATE_INTEGRITY;\n',
    '  const STATE_INTEGRITY = window.LEVEL_UP_STATE_INTEGRITY;\n  const STORAGE_DURABILITY = window.LEVEL_UP_STORAGE_DURABILITY;\n',
    'storage durability binding')

rep('''  let saveHealthy = false;
  let backupMirrorHealthy = true;
  let lastDurableState = null;
  let writeSequence = Promise.resolve();
  let draftSaveTimer = null;
''','''  let saveHealthy = false;
  let backupMirrorHealthy = true;
  let lastDurableState = null;
  let lastDurableRevision = 0;
  let redundancyComparison = "UNVERIFIED";
  let storageRecoveryIssue = null;
  let firstRunDecisionRequired = false;
  let persistenceStatus = {state:"UNKNOWN_OR_UNSUPPORTED",supported:false,canRequest:false,checked:false,error:null};
  let writeSequence = Promise.resolve();
  let draftSaveTimer = null;
''','Patch K globals')

rep('''  const freshState = () => ({
    schemaVersion:1,
    student:CONTENT.student,
''','''  const freshState = () => ({
    schemaVersion:2,
    stateRevision:null,
    learnerRecordOrigin:{type:"NEW",decidedAt:new Date().toISOString(),priorRecordOffered:false},
    restoredFrom:null,
    student:CONTENT.student,
''','fresh schema v2')

old_block=re.search(r'''  function isValidLearnerState\(value\)\{.*?\n  async function persistenceHealthCheck\(\)\{''',s,re.S)
if not old_block: raise SystemExit('missing validation/save block')
new_block='''  function isValidLearnerState(value){
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

  async function persistenceHealthCheck(){'''
s=s[:old_block.start()]+new_block+s[old_block.end():]

rep('''  function pushEvidenceOnce(ev,sessionOverride=null){
    const found=state.evidence.find(x=>x.id===ev.id);if(found)return found;
    const session=sessionOverride||evidenceSessionContext();
    if(session&&STATE_INTEGRITY)STATE_INTEGRITY.linkEvidenceToSession(ev,session,state.evidence);
    state.evidence.push(ev);return ev
  }
''','''  function pushEvidenceOnce(ev,sessionOverride=null){
    const found=state.evidence.find(x=>x.id===ev.id);if(found)return found;
    const session=sessionOverride||evidenceSessionContext();
    if(session&&STATE_INTEGRITY)STATE_INTEGRITY.linkEvidenceToSession(ev,session,state.evidence);
    if(STATE_INTEGRITY)STATE_INTEGRITY.annotateWriteProvenance(ev,sameOriginRedundancyDegraded());
    state.evidence.push(ev);return ev
  }
''','evidence redundancy provenance')

rep('''  function renderSaveStatus(){
    const el=document.getElementById("saveStatus");
    if(!el)return;
    el.className="badge "+(saveHealthy?"good":"warn");
    el.innerHTML=(saveHealthy?"<span class='statusdot'></span>Persistence active":"<span class='statusdot bad'></span>Persistence problem");
  }
''','''  function renderSaveStatus(){
    const el=document.getElementById("saveStatus");
    if(!el)return;
    const good=saveHealthy&&!sameOriginRedundancyDegraded();
    el.className="badge "+(good?"good":"warn");
    if(!saveHealthy)el.innerHTML="<span class='statusdot bad'></span>Primary persistence problem";
    else if(sameOriginRedundancyDegraded())el.innerHTML="<span class='statusdot bad'></span>Primary saved · mirror degraded";
    else el.innerHTML="<span class='statusdot'></span>Primary + mirror synced";
  }
''','save status shows mirror')

# Guard every evidence-producing entry point before a learner begins.
for name in ['startLesson','startReview','startTrackADiagnostic','startTrackARepair','startTrackAVerification','startTrackAMasteryTask']:
    pattern=rf'(  async function {name}\([^\n]*\)\{{\n)'
    repl=rf'\1    if(!evidenceSessionAllowed())return;\n'
    s,n=re.subn(pattern,repl,s,count=1)
    if n!=1: raise SystemExit(f'missing evidence start guard: {name}')

# Replace Backup through init with the Patch K recovery/durability implementation.
start=s.find('  function backupView(){')
end=s.find('  window.MLUL={',start)
if start<0 or end<0: raise SystemExit('missing backup/init region')
new_region=r'''  function persistenceLabel(){
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

'''
s=s[:start]+new_region+s[end:]

# Add new public controls and Patch K audit state.
rep('''manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{''',
    '''manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,requestPersistentStorage,acknowledgeRedundancyOverride,createNewLearnerRecord,resolveMirrorAhead,markAccessObserved,__audit:{''',
    'public Patch K controls')
rep('''isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,pushEvidenceOnce''',
    '''isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,pushEvidenceOnce,sameOriginRedundancyDegraded''',
    'audit exports')

p.write_text(s)
print('Patch K app integration applied')
