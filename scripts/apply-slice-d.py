from pathlib import Path

APP = Path('app.js')
NEXT = Path('docs/NEXT_SLICES.md')


def replace_or_die(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)


s = APP.read_text()
if 'function manualSave()' not in s:
    s = replace_or_die(
        s,
        '  let saveHealthy = false;\n',
        '  let saveHealthy = false;\n  let writeSequence = Promise.resolve();\n  let draftSaveTimer = null;\n',
        'save globals',
    )

    s = replace_or_die(
        s,
        '''  async function save(reason="update"){
    state.updatedAt=new Date().toISOString();
    try{
      await idbPut(state);
      localStorage.setItem(BACKUP_KEY,JSON.stringify(state));
      saveHealthy=true;renderSaveStatus();
      return true;
    }catch(err){
      saveHealthy=false;renderSaveStatus();
      alert("Saving failed. The session is paused so Michael's evidence is not lost. Export a backup before continuing.");
      console.error(reason,err);
      return false;
    }
  }
''',
        '''  async function save(reason="update"){
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
''',
        'serialized save',
    )

    helper_block = r'''
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
'''
    s = replace_or_die(s, '  function renderSaveStatus(){\n', helper_block + '\n  function renderSaveStatus(){\n', 'persistence helpers')

    s = replace_or_die(
        s,
        '<div class="badges"><span id="saveStatus" class="badge"></span><span class="badge warn">Track B = PRIOR_INSTRUCTION</span></div>',
        '<div class="badges"><button class="btn" onclick="window.MLUL.manualSave()">Save</button><span id="saveStatus" class="badge"></span><span class="badge warn">Track B = PRIOR_INSTRUCTION</span></div>',
        'global save button',
    )

    s = replace_or_die(
        s,
        '${RUNTIME_ENABLED?"":`<div class="notice" style="border-color:#b91c1c;background:#450a0a;color:#fecaca"><strong>BUILD UNDER AUDIT — STUDENT USE DISABLED.</strong> Michael cannot start lessons in this build. Frozen evidence enums are wired; the final local-persistence and synthetic-recovery audit must pass before runtime is enabled.</div>`}\n      ${state?.backup?.pendingAfterLesson?',
        '${RUNTIME_ENABLED?"":`<div class="notice" style="border-color:#b91c1c;background:#450a0a;color:#fecaca"><strong>BUILD UNDER AUDIT — STUDENT USE DISABLED.</strong> Michael cannot start lessons in this build. Frozen evidence enums are wired; the final local-persistence and synthetic-recovery audit must pass before runtime is enabled.</div>`}\n      ${recoveryNotice()}\n      ${state?.backup?.pendingAfterLesson?',
        'recovery notice',
    )

    s = replace_or_die(
        s,
        'state.activeSession=session;state.sessions.push(session);await save("start lesson");\n    current={lesson,session};renderLessonTeach();',
        'state.activeSession=session;upsertSessionRecord(session);\n    if(!await save("start lesson"))return;\n    current={lesson,session};renderLessonTeach();',
        'start lesson fail-stop',
    )

    s = replace_or_die(
        s,
        '<div class="spacer"></div><button class="btn primary" onclick="window.MLUL.beginChecks()">Continue to Try</button>',
        '<div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.beginChecks()">Continue to Try</button><button class="btn" onclick="window.MLUL.manualSave()">Save</button><button class="btn" onclick="window.MLUL.saveAndExit()">Save & Exit</button></div>',
        'teach save controls',
    )

    s = replace_or_die(
        s,
        '</div>`);renderSaveStatus();window.scrollTo({top:0,behavior:"smooth"});\n  }\n\n  function readTeach()',
        '</div>`);renderSaveStatus();restoreDraftToUI();bindDraftAutosave();window.scrollTo({top:0,behavior:"smooth"});\n  }\n\n  function readTeach()',
        'teach draft restore',
    )

    s = replace_or_die(
        s,
        '    speak(t);\n  }\n\n  async function beginChecks()',
        '    speak(t);clearTimeout(draftSaveTimer);captureDraftFromUI();void save("teach read-aloud access");\n  }\n\n  async function beginChecks()',
        'teach read aloud save',
    )

    s = replace_or_die(
        s,
        'current.session.instructionDelivered=true;\n    current.session.phase="CHECK_AFTER_TEACH";current.session.itemIndex=0;state.activeSession=current.session;\n    if(!await save("begin checks"))return;',
        'current.session.instructionDelivered=true;\n    current.session.phase="CHECK_AFTER_TEACH";current.session.itemIndex=0;current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);\n    if(!await save("begin checks"))return;',
        'begin checks session sync',
    )

    s = replace_or_die(
        s,
        '<div class="spacer"></div><button class="btn primary" onclick="window.MLUL.submitAnswer()">Submit answer</button><div id="feedback"></div>',
        '<div class="spacer"></div><div class="row"><button class="btn primary" onclick="window.MLUL.submitAnswer()">Submit answer</button><button class="btn" onclick="window.MLUL.manualSave()">Save</button><button class="btn" onclick="window.MLUL.saveAndExit()">Save & Exit</button></div><div id="feedback"></div>',
        'question save controls',
    )

    s = replace_or_die(
        s,
        '</div>`);renderSaveStatus();\n  }\n\n  function readQuestion()',
        '</div>`);renderSaveStatus();restoreDraftToUI();bindDraftAutosave();\n  }\n\n  function readQuestion()',
        'question draft restore',
    )

    s = replace_or_die(
        s,
        '    speak(q.q+(q.choices?" Choices. "+q.choices.join(". "):""));\n  }',
        '    speak(q.q+(q.choices?" Choices. "+q.choices.join(". "):""));clearTimeout(draftSaveTimer);captureDraftFromUI();void save("question read-aloud access");\n  }',
        'question read aloud save',
    )

    s = replace_or_die(
        s,
        'state.evidence.push(ev);current.session.responses.push(ev);state.activeSession=current.session;\n    if(!await save("answer"))return;',
        'state.evidence.push(ev);current.session.responses.push(ev);current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);\n    if(!await save("answer"))return;',
        'answer session sync',
    )

    s = replace_or_die(
        s,
        'if(current.session.itemIndex<current.lesson.checks.length){state.activeSession=current.session;await save("next question");renderQuestion();return}',
        'if(current.session.itemIndex<current.lesson.checks.length){current.session.draft=null;state.activeSession=current.session;upsertSessionRecord(current.session);if(!await save("next question"))return;renderQuestion();return}',
        'next question fail-stop',
    )

    s = replace_or_die(
        s,
        'current.session.status="COMPLETED";current.session.completedAt=now();state.activeSession=null;',
        'current.session.status="COMPLETED";current.session.completedAt=now();current.session.draft=null;upsertSessionRecord(current.session);state.activeSession=null;',
        'finish session sync',
    )

    s = replace_or_die(
        s,
        'state.backup.pendingAfterLesson=true;\n    await save("finish lesson");',
        'state.backup.pendingAfterLesson=true;\n    if(!await save("finish lesson"))return;',
        'finish lesson fail-stop',
    )

    s = replace_or_die(
        s,
        '''    window.addEventListener("hashchange",()=>{speechSynthesis?.cancel?.();current=null;render()});
    if(state.activeSession && state.activeSession.status==="ACTIVE"){
      // Do not auto-resume without explicit parent choice. The record is preserved and visible in evidence.
      state.activeSession.status="INTERRUPTED_PRESERVED";state.activeSession=null;await save("recover interrupted session");
    }
    render();
''',
        '''    window.addEventListener("hashchange",async()=>{speechSynthesis?.cancel?.();if(current){clearTimeout(draftSaveTimer);captureDraftFromUI();if(!await save("navigation draft"))return}current=null;render()});
    if(state.activeSession && state.activeSession.status==="ACTIVE"){
      // Crash/reload recovery: preserve the session in place and require an explicit resume or end choice.
      state.activeSession.status="INTERRUPTED_PRESERVED";
      state.activeSession.interruptedAt=now();
      upsertSessionRecord(state.activeSession);
      await save("recover interrupted session");
    }
    render();
''',
        'interrupted-session recovery',
    )

    s = replace_or_die(
        s,
        'window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor}};',
        'window.MLUL={startLesson,readTeach,beginChecks,readQuestion,submitAnswer,nextQuestion,manualSave,saveAndExit,resumeInterruptedSession,endPreservedSession,exportBackup,importBackup,checkPersistenceUI,markAccessObserved,__audit:{RUNTIME_ENABLED,STATE_KEY,PROBE_KEY,ASSISTANCE_LEVELS,ACCESS_CONDITIONS,isValidLearnerState,assistanceLevelForSession,validAccessCondition,accessSourceFor,recoverableSession,captureDraftFromUI,upsertSessionRecord}};',
        'public actions',
    )

    APP.write_text(s)
    print('app.js patched for Slice D')
else:
    print('app.js already contains Slice D; no app patch needed')

n = NEXT.read_text()
old = '1. Finalize and independently audit Michael Track B local persistence with synthetic data: per-answer autosave, manual Save, Save & Exit, crash/reload recovery, backup/restore, and fail-stop on write error.\n2. Enable Michael only after the synthetic persistence audit passes.\n3. Add delayed-retrieval item generation for Day 2 / Day 7 / Day 21 reviews.'
new = '1. **Implemented in Patch D:** Track B local persistence/usability: per-answer persistence, draft autosave, manual Save, Save & Exit, crash/reload recovery, backup/restore, serialized writes, and fail-stop transitions.\n2. Run the synthetic **browser** persistence audit in the target environment. Enable Michael only after it passes.\n3. Add delayed-retrieval item generation for Day 2 / Day 7 / Day 21 reviews.'
if old in n:
    NEXT.write_text(n.replace(old, new, 1))
    print('NEXT_SLICES.md updated')
elif 'Implemented in Patch D' in n:
    print('NEXT_SLICES.md already updated')
else:
    raise SystemExit('NEXT_SLICES.md did not match expected state')
