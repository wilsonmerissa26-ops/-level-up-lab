from pathlib import Path
p=Path('app.js')
s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing patch anchor: {label}')
    s=s.replace(old,new,1)

rep('  const TRACK_A_MASTERY = window.LEVEL_UP_TRACK_A_MASTERY;\n',
    '  const TRACK_A_MASTERY = window.LEVEL_UP_TRACK_A_MASTERY;\n  const STATE_INTEGRITY = window.LEVEL_UP_STATE_INTEGRITY;\n',
    'state integrity binding')
rep('  let saveHealthy = false;\n  let writeSequence = Promise.resolve();\n',
    '  let saveHealthy = false;\n  let backupMirrorHealthy = true;\n  let lastDurableState = null;\n  let writeSequence = Promise.resolve();\n',
    'durable globals')
rep('''  function isValidLearnerState(value){
    return !!(value && value.student && value.student.id === "michael" && Array.isArray(value.evidence) && value.lessonState && typeof value.lessonState === "object");
  }
''','''  function isValidLearnerState(value){
    return !!(STATE_INTEGRITY && value && value.schemaVersion===STATE_INTEGRITY.SUPPORTED_SCHEMA_VERSION && STATE_INTEGRITY.coreLearnerStateValid(value) && !STATE_INTEGRITY.containsLegacyFields(value));
  }
''','strict learner validation')
rep('  function validAccessCondition(value){return ACCESS_CONDITIONS.includes(value)?value:null}\n',
    '  function validAccessCondition(value){return STATE_INTEGRITY?STATE_INTEGRITY.validAccessCondition(value):(ACCESS_CONDITIONS.includes(value)?value:null)}\n',
    'access validation delegate')
old_save='''  async function save(reason="update"){
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
'''
new_save='''  function rebindLiveStateReferences(){
    if(current?.session && state?.activeSession && current.session.id===state.activeSession.id) current.session=state.activeSession;
    if(currentTrackA?.session && state?.trackAActiveSession && currentTrackA.session.id===state.trackAActiveSession.id) currentTrackA.session=state.trackAActiveSession;
  }

  async function save(reason="update"){
    state.updatedAt=new Date().toISOString();
    const snapshot=JSON.parse(JSON.stringify(state));
    const task=writeSequence.catch(()=>{}).then(async()=>{
      // IndexedDB is the primary learner record. The localStorage copy is a secondary mirror.
      await idbPut(snapshot,STATE_KEY);
      let backupOk=true;
      try{localStorage.setItem(BACKUP_KEY,JSON.stringify(snapshot))}catch(err){backupOk=false;console.warn("Local backup mirror failed",err)}
      return {backupOk};
    });
    writeSequence=task;
    try{
      const result=await task;
      lastDurableState=JSON.parse(JSON.stringify(snapshot));
      backupMirrorHealthy=result.backupOk;
      saveHealthy=true;renderSaveStatus();
      return true;
    }catch(err){
      // Roll memory back to the last state that actually reached primary storage.
      if(lastDurableState){state=JSON.parse(JSON.stringify(lastDurableState));rebindLiveStateReferences()}
      saveHealthy=false;renderSaveStatus();
      alert("Saving failed. This change was rolled back to the last durable learner state. Do not continue until persistence is working.");
      console.error(reason,err);
      return false;
    }
  }
'''
rep(old_save,new_save,'durable save rollback')
rep('''  function pushEvidenceOnce(ev){const found=state.evidence.find(x=>x.id===ev.id);if(found)return found;state.evidence.push(ev);return ev}
''','''  function evidenceSessionContext(){return currentTrackA?.session||current?.session||state?.trackAActiveSession||state?.activeSession||null}
  function pushEvidenceOnce(ev,sessionOverride=null){
    const found=state.evidence.find(x=>x.id===ev.id);if(found)return found;
    const session=sessionOverride||evidenceSessionContext();
    if(session&&STATE_INTEGRITY)STATE_INTEGRITY.linkEvidenceToSession(ev,session,state.evidence);
    state.evidence.push(ev);return ev
  }
''','evidence session linkage')
old_import='''  function importBackup(){
    const file=document.getElementById("importFile").files[0];if(!file){alert("Choose a backup file first.");return}
    const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!x.student||x.student.id!=="michael")throw new Error("This is not Michael's Level-Up backup.");state=x;await save("restore");alert("Backup restored.");render()}catch(e){alert("Could not restore backup: "+e.message)}};r.readAsText(file)
  }
'''
new_import='''  function importBackup(){
    const file=document.getElementById("importFile").files[0];if(!file){alert("Choose a backup file first.");return}
    const r=new FileReader();r.onload=async()=>{
      try{
        const parsed=JSON.parse(r.result);
        if(!STATE_INTEGRITY)throw new Error("Restore validation module is unavailable.");
        // Validate and clone before touching live learner state.
        const candidate=normalizeStateShape(STATE_INTEGRITY.validateRestoreCandidate(parsed));
        if(!isValidLearnerState(candidate))throw new Error("Backup failed post-normalization validation.");
        const ok=await persistenceHealthCheck();renderSaveStatus();if(!ok)throw new Error("Persistence health check failed; restore was not attempted.");
        const previous=JSON.parse(JSON.stringify(state));
        state=candidate;
        if(!await save("restore")){state=previous;rebindLiveStateReferences();throw new Error("Restore could not be durably saved; previous learner state was kept in memory.")}
        alert("Backup restored.");render();
      }catch(e){alert("Could not restore backup: "+e.message)}
    };r.readAsText(file)
  }
'''
rep(old_import,new_import,'validated restore')
rep('''    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}if(currentTrackA){currentTrackA.session.status="PAUSED";currentTrackA.session.pausedAt=now();state.trackAActiveSession=currentTrackA.session;if(!await save("Track A navigation pause"))return}current=null;currentTrackA=null;render()});
''','''    lastDurableState=JSON.parse(JSON.stringify(state));
    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}if(currentTrackA){currentTrackA.session.status="PAUSED";currentTrackA.session.pausedAt=now();state.trackAActiveSession=currentTrackA.session;if(!await save("Track A navigation pause"))return}current=null;currentTrackA=null;render()});
''','initialize durable snapshot')
# Add explicit attempt/session columns to evidence view for parent auditability.
old_head='<thead><tr><th>Time</th><th>Track</th><th>Subject</th><th>Skill</th><th>Raw response</th>'
new_head='<thead><tr><th>Time</th><th>Track</th><th>Attempt</th><th>Session</th><th>Subject</th><th>Skill</th><th>Raw response</th>'
s=s.replace(old_head,new_head,1)
old_row='<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.track||"")}</td><td>${escapeHTML(e.subject||"")}</td>'
new_row='<tr><td>${fmt(e.createdAt)}</td><td>${escapeHTML(e.track||"")}</td><td>${escapeHTML(e.attemptNumber??"—")}</td><td>${escapeHTML(e.sessionId||"—")}</td><td>${escapeHTML(e.subject||"")}</td>'
s=s.replace(old_row,new_row,1)
s=s.replace('colspan="13" class="muted">No evidence recorded yet.</td>','colspan="15" class="muted">No evidence recorded yet.</td>',1)
p.write_text(s)
print('Release integrity patch J applied')
