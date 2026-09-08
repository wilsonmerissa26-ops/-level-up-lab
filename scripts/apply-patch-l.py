from pathlib import Path

app_path=Path('app.js')
s=app_path.read_text()

def rep(old,new,label,count=1):
    global s
    if old not in s:
        raise SystemExit(f'missing Patch L anchor: {label}')
    s2=s.replace(old,new,count)
    if s2==s:
        raise SystemExit(f'Patch L replacement did not change source: {label}')
    s=s2

mirror_view='''  function mirrorAheadView(){
    const issue=storageRecoveryIssue;
    return `<div class="shell"><div class="card"><h2>Storage integrity decision required</h2><p class="muted">The localStorage mirror has a higher revision than authoritative IndexedDB. Level-Up will not guess which history to keep.</p><div class="callout warn"><strong>Primary revision:</strong> ${escapeHTML(STATE_INTEGRITY.revisionOf(issue?.rawPrimary)??"pre-revision")} · <strong>Mirror revision:</strong> ${escapeHTML(STATE_INTEGRITY.revisionOf(issue?.rawMirror)??"pre-revision")}</div><div class="row"><button class="btn primary" onclick="window.MLUL.resolveMirrorAhead('MIRROR')">Use newer mirror</button><button class="btn" onclick="window.MLUL.resolveMirrorAhead('PRIMARY')">Keep primary record</button></div></div></div>`;
  }
'''
primary_missing_view=mirror_view+'''
  function primaryMissingView(){
    const issue=storageRecoveryIssue;
    const learner=issue?.mirror?.student||issue?.rawMirror?.student||{};
    const revision=STATE_INTEGRITY.revisionOf(issue?.rawMirror||issue?.mirror);
    const updatedAt=issue?.mirror?.updatedAt||issue?.rawMirror?.updatedAt||null;
    return `<div class="shell"><div class="card"><h2>Primary learner record unavailable</h2><p class="muted">IndexedDB, the authoritative learner record, is unavailable. A same-origin localStorage mirror is available, but Level-Up will not promote it without your decision.</p><div class="callout"><strong>Learner:</strong> ${escapeHTML(learner.name||learner.id||"Unknown learner")} ${learner.grade?`· Grade ${escapeHTML(learner.grade)}`:""}${learner.school?` · ${escapeHTML(learner.school)}`:""}<br><strong>Mirror revision:</strong> ${escapeHTML(revision??"pre-revision")}<br><strong>Mirror updatedAt:</strong> ${escapeHTML(updatedAt?fmt(updatedAt):"not recorded")} <span class="tiny muted">(informational metadata only)</span></div><div class="callout warn"><strong>Recovery warning:</strong> Restoring this mirror may return the learner to an earlier saved state if the missing primary contained newer changes.</div><input type="file" id="importFile" accept="application/json,.json"><div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.restoreMirrorAsAuthoritative()">Restore this backup</button><button class="btn" onclick="window.MLUL.importBackup()">Import a JSON backup instead</button></div></div></div>`;
  }
'''
rep(mirror_view,primary_missing_view,'primaryMissingView insertion')

resolve_anchor='''  async function resolveMirrorAhead(choice){
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
'''
restore_handler=resolve_anchor+'''
  async function restoreMirrorAsAuthoritative(){
    const issue=storageRecoveryIssue;if(!issue||issue.type!=="PRIMARY_MISSING_MIRROR_PRESENT")return;
    const observed=[issue.rawPrimary,issue.rawMirror,issue.mirror];
    const previousIssue=storageRecoveryIssue;
    const previousState=state;
    const previousRevision=lastDurableRevision;
    lastDurableRevision=STATE_INTEGRITY.maxObservedRevision(observed);
    state=normalizeStateShape(STATE_INTEGRITY.prepareRestoreCandidate(issue.rawMirror||issue.mirror,{source:"MIRROR",now:now(),observedRevisions:observed}));
    storageRecoveryIssue=null;backupMirrorHealthy=false;redundancyComparison="MIRROR_STALE";
    if(!await save("restore offered mirror after primary missing")){
      state=previousState;lastDurableRevision=previousRevision;storageRecoveryIssue=previousIssue;backupMirrorHealthy=false;redundancyComparison="MIRROR_STALE";return;
    }
    render();
  }
'''
rep(resolve_anchor,restore_handler,'restoreMirrorAsAuthoritative insertion')

render_anchor='''    if(firstRunDecisionRequired){document.getElementById("app").innerHTML=firstRunView();return}
    if(storageRecoveryIssue?.type==="MIRROR_AHEAD"){document.getElementById("app").innerHTML=mirrorAheadView();return}
'''
render_new='''    if(firstRunDecisionRequired){document.getElementById("app").innerHTML=firstRunView();return}
    if(storageRecoveryIssue?.type==="MIRROR_AHEAD"){document.getElementById("app").innerHTML=mirrorAheadView();return}
    if(storageRecoveryIssue?.type==="PRIMARY_MISSING_MIRROR_PRESENT"){document.getElementById("app").innerHTML=primaryMissingView();return}
'''
rep(render_anchor,render_new,'primary-missing render gate')

old_branch='''      }else if(mirror){
        const observed=[rawDisk,rawMirror,mirror];lastDurableRevision=STATE_INTEGRITY.maxObservedRevision(observed);
        state=normalizeStateShape(STATE_INTEGRITY.prepareRestoreCandidate(rawMirror||mirror,{source:"MIRROR",now:now(),observedRevisions:observed}));
        backupMirrorHealthy=false;redundancyComparison="MIRROR_STALE";saveHealthy=true;
        if(!await save("restore mirror to primary"))throw new Error("Could not restore mirror to IndexedDB.");
      }else{
'''
new_branch='''      }else if(mirror){
        const observed=[rawDisk,rawMirror,mirror];
        lastDurableRevision=STATE_INTEGRITY.maxObservedRevision(observed);
        storageRecoveryIssue={type:"PRIMARY_MISSING_MIRROR_PRESENT",mirror,rawMirror,rawPrimary:rawDisk};
        backupMirrorHealthy=false;redundancyComparison="MIRROR_STALE";saveHealthy=true;
      }else{
'''
rep(old_branch,new_branch,'primary-missing init branch')

export_old='''createNewLearnerRecord,resolveMirrorAhead,markAccessObserved,__audit:{'''
export_new='''createNewLearnerRecord,resolveMirrorAhead,restoreMirrorAsAuthoritative,markAccessObserved,__audit:{'''
rep(export_old,export_new,'restore handler export')

app_path.write_text(s)

browser_path=Path('audit-browser.js')
b=browser_path.read_text()
old="if(valid(backup))return {kind:'RECORD',source:'backup',state:backup,comparison:'PRIMARY_MISSING'};"
new="if(valid(backup))return {kind:'PRIMARY_MISSING_DECISION_REQUIRED',source:'backup',state:backup,comparison:'PRIMARY_MISSING'};"
if old not in b:
    raise SystemExit('missing Patch L audit-browser primary-missing anchor')
browser_path.write_text(b.replace(old,new,1))
print('Patch L primary-missing recovery decision applied')
