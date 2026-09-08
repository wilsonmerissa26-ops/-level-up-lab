from pathlib import Path
import re

root=Path('.')
app_path=root/'app.js'
app=app_path.read_text()

# Bind deterministic runtime gate and flip the audited pilot build flag.
anchor='  const STORAGE_DURABILITY = window.LEVEL_UP_STORAGE_DURABILITY;\n'
insert=anchor+'  const RUNTIME_GATE = window.LEVEL_UP_RUNTIME_GATE;\n'
assert anchor in app and 'LEVEL_UP_RUNTIME_GATE' not in app
app=app.replace(anchor,insert,1)
old='  // Student runtime stays hard-disabled until the final local-persistence + synthetic-recovery audit is signed off.\n  const RUNTIME_ENABLED = false;'
new='  // Patch N: pilot runtime is enabled only through the audited Home Screen + PERSISTENT storage gate.\n  const RUNTIME_ENABLED = true;'
assert old in app
app=app.replace(old,new,1)

# Centralize the audited environment decision.
anchor='''  function evidenceSessionAllowed(){
    if(!sameOriginRedundancyDegraded()||redundancyOverrideAcknowledged())return true;
    alert("Same-origin redundancy is degraded. Open Backup to repair it or explicitly acknowledge degraded redundancy before collecting learner evidence.");
    return false;
  }
'''
addition=anchor+'''
  function runtimeGateStatus(){
    const standalone=STORAGE_DURABILITY?STORAGE_DURABILITY.isStandaloneEnvironment(window):false;
    if(!RUNTIME_GATE)return {allowed:false,reason:"BUILD_LOCKED"};
    return RUNTIME_GATE.evaluate({buildEnabled:RUNTIME_ENABLED,standalone,persistenceState:persistenceStatus?.state||"UNKNOWN_OR_UNSUPPORTED"});
  }
  function studentRuntimeAllowed(){return !!runtimeGateStatus().allowed}
  function runtimeBlockMessage(){const result=runtimeGateStatus();return RUNTIME_GATE?RUNTIME_GATE.message(result):"Student runtime gate is unavailable."}
  function blockStudentRuntime(){alert(runtimeBlockMessage());return false}
'''
assert anchor in app and 'function runtimeGateStatus()' not in app
app=app.replace(anchor,addition,1)

# Every pre-existing hard runtime guard now delegates to the audited environment gate.
pattern=re.compile(r'if\(!RUNTIME_ENABLED\)\{alert\("Student use is disabled[^\"]*"\);return\}')
app,count=pattern.subn('if(!studentRuntimeAllowed()){blockStudentRuntime();return}',app)
assert count==8, f'expected 8 runtime action guards, changed {count}'

# UI enable/disable paths follow the same gate.
app=app.replace('RUNTIME_ENABLED?', 'studentRuntimeAllowed()?')
app=app.replace('RUNTIME_ENABLED && prereqReady','studentRuntimeAllowed() && prereqReady')
app=app.replace('const enabled=RUNTIME_ENABLED&&!state.activeSession&&!state.trackAActiveSession;','const enabled=studentRuntimeAllowed()&&!state.activeSession&&!state.trackAActiveSession;')

# Make the pilot state legible instead of leaving stale audit-hold copy.
old_notice='''${studentRuntimeAllowed()?"":`<div class="notice" style="border-color:#b91c1c;background:#450a0a;color:#fecaca"><strong>BUILD UNDER AUDIT — STUDENT USE DISABLED.</strong> Michael cannot start lessons in this build. Frozen evidence enums are wired; the final local-persistence and synthetic-recovery audit must pass before runtime is enabled.</div>`}'''
new_notice='''${studentRuntimeAllowed()?`<div class="notice" style="border-color:#15803d;background:#052e16;color:#bbf7d0"><strong>AUDITED PILOT READY.</strong> Student sessions are enabled in this installed Home Screen environment with persistent storage.</div>`:`<div class="notice" style="border-color:#b91c1c;background:#450a0a;color:#fecaca"><strong>PILOT ENVIRONMENT LOCK.</strong> ${escapeHTML(runtimeBlockMessage())}</div>`}'''
assert old_notice in app
app=app.replace(old_notice,new_notice,1)
app=app.replace('Audit hold','Pilot gate')
app=app.replace('Student use disabled','Open audited app')
app=app.replace('this UI is implemented but student runtime stays disabled until the separate target-browser persistence audit passes.','student runtime is enabled only when the deterministic pilot gate confirms Home Screen / standalone plus PERSISTENT storage.')

# Export gate state through the existing audit surface.
old='sameOriginRedundancyDegraded}};'
new='sameOriginRedundancyDegraded,runtimeGateStatus,studentRuntimeAllowed,runtimeBlockMessage}};'
assert old in app
app=app.replace(old,new,1)

# Only three intentional raw build-flag references should remain: declaration, gate input, audit export.
remaining=app.count('RUNTIME_ENABLED')
assert remaining==3, f'unexpected raw RUNTIME_ENABLED references remain: {remaining}'
assert 'if(!RUNTIME_ENABLED)' not in app
app_path.write_text(app)

# Load runtime-gate.js before app.js.
index_path=root/'index.html'
index=index_path.read_text()
anchor='  <script src="storage-durability.js"></script>\n  <script src="state-integrity.js"></script>'
replacement='  <script src="storage-durability.js"></script>\n  <script src="runtime-gate.js"></script>\n  <script src="state-integrity.js"></script>'
assert anchor in index and 'runtime-gate.js' not in index
index_path.write_text(index.replace(anchor,replacement,1))

# Keep the user inside the already-audited Home Screen container when entering the live pilot.
audit_path=root/'audit-browser.html'
audit=audit_path.read_text()
anchor='''    <button id="smokeBtn" onclick="location.href='synthetic-e2e.html'">Open synthetic learner smoke test</button>
  </div>'''
replacement='''    <button id="smokeBtn" onclick="location.href='synthetic-e2e.html'">Open synthetic learner smoke test</button>
    <p class="muted">After the synthetic learner smoke test passes 30/30, use the live pilot from this same installed Home Screen app.</p>
    <button id="livePilotBtn" onclick="location.href='index.html'">Open Michael Level-Up Lab</button>
  </div>'''
assert anchor in audit and 'Open Michael Level-Up Lab' not in audit
audit_path.write_text(audit.replace(anchor,replacement,1))

# Existing release assertions move from hard lock to audited pilot build flag.
for path in (root/'tests').glob('*.test.mjs'):
    text=path.read_text()
    if 'RUNTIME_ENABLED = false' in text:
        text=text.replace('RUNTIME_ENABLED = false','RUNTIME_ENABLED = true')
        text=text.replace('student runtime remains audit-blocked','audited pilot build flag is enabled')
        text=text.replace('Michael runtime remains locked','audited pilot build flag is enabled')
        text=text.replace('runtime stays disabled','runtime is gated to the audited Home Screen environment')
        path.write_text(text)

for path in (root/'tests').glob('*.test.mjs'):
    assert 'RUNTIME_ENABLED = false' not in path.read_text(), f'stale runtime-lock assertion: {path}'

# Permanent audit.yml is updated separately through the GitHub connector because the
# Actions token intentionally has no workflow-file write permission.
print('Patch N source transformations applied successfully.')
