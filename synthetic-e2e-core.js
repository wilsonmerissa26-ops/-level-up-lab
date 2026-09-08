(() => {
  const SYNTHETIC_STUDENT_ID='synthetic-e2e';

  const isoNow=()=>new Date().toISOString();
  const clone=x=>JSON.parse(JSON.stringify(x));

  function freshState(now=isoNow()){
    return {
      schemaVersion:2,
      stateRevision:null,
      learnerRecordOrigin:{type:'NEW',decidedAt:now,priorRecordOffered:false},
      restoredFrom:null,
      student:{id:SYNTHETIC_STUDENT_ID,name:'Synthetic Learner',grade:'8'},
      lessonState:{},
      trackASkillState:{},
      evidence:[],
      sessions:[],
      reviewSchedule:[],
      activeSession:null,
      trackAActiveSession:null,
      backup:{lastExportAttemptedAt:null,pendingAfterLesson:false},
      updatedAt:now
    };
  }

  function upsertSession(state,session){
    const copy=clone(session);
    const i=state.sessions.findIndex(x=>x.id===session.id);
    if(i>=0)state.sessions[i]=copy;else state.sessions.push(copy);
  }

  function addEvidence(state,session,ev,stateIntegrity,redundancyDegraded=false){
    const existing=state.evidence.find(x=>x.id===ev.id);
    if(existing)return existing;
    if(stateIntegrity){
      stateIntegrity.linkEvidenceToSession(ev,session,state.evidence);
      stateIntegrity.annotateWriteProvenance(ev,redundancyDegraded);
    }
    state.evidence.push(ev);
    if(session && !session.responses.some(x=>x.id===ev.id))session.responses.push(clone(ev));
    upsertSession(state,session);
    return ev;
  }

  function startTrackBSession(state,lesson,now=isoNow()){
    const session={
      id:'synthetic_trackb_session_1',mode:'LESSON',track:'B',subject:'science',lessonId:lesson.id,
      startedAt:now,phase:'TEACH',instructionDelivered:false,itemIndex:0,responses:[],status:'ACTIVE'
    };
    state.activeSession=session;upsertSession(state,session);return session;
  }

  function recordTrackBTeaching(state,session,lesson,stateIntegrity,now=isoNow()){
    const ev={
      id:`synthetic_teach_${session.id}`,createdAt:now,studentId:SYNTHETIC_STUDENT_ID,track:'B',
      evidence_class:'INFORMAL_TRACK_B',interaction_purpose:'INSTRUCTIONAL',instruction_exposure_status:'PRIOR_INSTRUCTION',
      subject:'science',skillId:lesson.id,evidenceType:'THINK_ALOUD',rawResponse:'Energy can make things move or change.',
      interpretation:null,assistance_level:'TAUGHT',access_condition:null,access_condition_source:'UNRECORDED'
    };
    addEvidence(state,session,ev,stateIntegrity,false);
    session.instructionDelivered=true;session.phase='CHECK_AFTER_TEACH';upsertSession(state,session);return ev;
  }

  function recordPerfectTrackBChecks(state,session,lesson,stateIntegrity,now=isoNow()){
    const out=[];
    lesson.checks.forEach((q,index)=>{
      const raw=Array.isArray(q.choices)?q.choices[q.answer]:String(q.free);
      const ev={
        id:`synthetic_check_${session.id}_${index}`,createdAt:now,studentId:SYNTHETIC_STUDENT_ID,track:'B',
        evidence_class:'INFORMAL_TRACK_B',interaction_purpose:'PRACTICE',instruction_exposure_status:'PRIOR_INSTRUCTION',
        subject:'science',skillId:lesson.id,itemId:q.id,prompt:q.q,rawResponse:raw,isCorrect:true,confidence:'sure',
        assistance_level:'TAUGHT',access_condition:null,access_condition_source:'UNRECORDED',interpretation:'immediate check correct'
      };
      addEvidence(state,session,ev,stateIntegrity,false);out.push(ev);session.itemIndex=index+1;
    });
    upsertSession(state,session);return out;
  }

  function scheduleReviews(state,skillId,subject,baseTime=new Date()){
    if(state.reviewSchedule.some(x=>x.skillId===skillId))return;
    [2,7,21].forEach(days=>{
      const d=new Date(baseTime);d.setDate(d.getDate()+days);
      state.reviewSchedule.push({
        id:`synthetic_rev_${skillId.replace(/[^A-Z0-9]/gi,'_')}_${days}`,skillId,subject,dueAt:d.toISOString(),
        window:`Day ${days}`,completed:false,sourceTrack:'B',evidence_class:'INFORMAL_TRACK_B',instruction_exposure_status:'PRIOR_INSTRUCTION'
      });
    });
  }

  function completeTrackBLesson(state,session,lesson,now=isoNow()){
    const practice=session.responses.filter(x=>x.interaction_purpose==='PRACTICE');
    const correct=practice.filter(x=>x.isCorrect===true).length;
    const score=practice.length?Math.round(correct/practice.length*100):0;
    const progress=score===100?'CHECK_STRONG':score>=67?'CHECK_PARTIAL':'CHECK_NEEDS_RETEACH';
    state.lessonState[lesson.id]={
      status:'COMPLETED',score,attempts:1,completedAt:now,trackBProgress:progress,memoryStrength:'FRAGILE',
      instruction_exposure_status:'PRIOR_INSTRUCTION'
    };
    session.status='COMPLETED';session.completedAt=now;session.phase='COMPLETE';
    upsertSession(state,session);state.activeSession=null;scheduleReviews(state,lesson.id,'science',new Date(now));
    state.backup.pendingAfterLesson=true;
    return {score,progress};
  }

  function addPriorInstructionForMath(state,stateIntegrity,skillId,now=isoNow()){
    const session={id:'synthetic_math_exposure_session',mode:'LESSON',track:'B',subject:'math',lessonId:skillId,startedAt:now,status:'COMPLETED',responses:[]};
    const ev={
      id:'synthetic_math_prior_instruction',createdAt:now,studentId:SYNTHETIC_STUDENT_ID,track:'B',
      evidence_class:'INFORMAL_TRACK_B',interaction_purpose:'INSTRUCTIONAL',instruction_exposure_status:'PRIOR_INSTRUCTION',
      subject:'math',skillId,rawResponse:'Synthetic prior instruction',interpretation:null,assistance_level:'TAUGHT',
      access_condition:null,access_condition_source:'UNRECORDED'
    };
    addEvidence(state,session,ev,stateIntegrity,false);session.status='COMPLETED';upsertSession(state,session);return ev;
  }

  function runPerfectTrackADiagnostic(state,skillId,diagnostic,engine,stateIntegrity,now=isoNow()){
    const session={id:'synthetic_tracka_diag_session',mode:'TRACK_A_DIAGNOSTIC',track:'A',skillId,startedAt:now,status:'ACTIVE',responses:[]};
    const t1=engine.transitionDecision('UNKNOWN','DIAGNOSTIC',{diagnostic_started:true});
    if(!t1.allowed)throw new Error(`Track A start transition blocked: ${t1.reason}`);
    const items=diagnostic.generateDiagnostic(skillId,session.id);
    const prior=state.evidence.some(e=>e.skillId===skillId&&e.instruction_exposure_status==='PRIOR_INSTRUCTION');
    const probes=[];
    items.forEach((item,index)=>{
      const choiceIndex=Array.isArray(item.choices)?item.answer:null;
      const raw=Array.isArray(item.choices)?item.choices[item.answer]:String(item.free);
      const correct=diagnostic.checkAnswer(item,raw,choiceIndex);
      const ev={
        id:`synthetic_formal_${session.id}_${index}`,createdAt:now,studentId:SYNTHETIC_STUDENT_ID,track:'A',
        evidence_class:'FORMAL_CONTROLLED',interaction_purpose:'DIAGNOSTIC',instruction_exposure_status:prior?'PRIOR_INSTRUCTION':null,
        cold_baseline_eligible:!prior,subject:'Math',skillId,itemId:item.id,prompt:item.q,prompt_fingerprint:diagnostic.fingerprint(item),
        rawResponse:raw,selectedChoiceIndex:choiceIndex,isCorrect:correct,assistance_level:'INDEPENDENT',access_condition:null,
        access_condition_source:'UNRECORDED',fresh:true,reliable:item.validated===true,interpretation:null
      };
      addEvidence(state,session,ev,stateIntegrity,false);
      probes.push({correct,fresh:true,reliable:item.validated===true,assistance_level:'INDEPENDENT'});
    });
    const evaluation=engine.evaluateThreeProbeDiagnostic(probes,{priorInstruction:prior});
    const t2=engine.transitionDecision('DIAGNOSTIC','PROVISIONAL',{diagnostic_result:evaluation.result});
    if(!t2.allowed)throw new Error(`Track A provisional transition blocked: ${t2.reason}`);
    session.status='COMPLETED';session.completedAt=now;upsertSession(state,session);
    state.trackASkillState[skillId]={
      canonicalState:'PROVISIONAL',memoryStrength:'FRAGILE',lastDiagnostic:{result:evaluation.result,completedAt:now},
      instruction_exposure_status:evaluation.instruction_exposure_status,cold_baseline_eligible:evaluation.cold_baseline_eligible
    };
    return {session,items,evaluation};
  }

  const api={SYNTHETIC_STUDENT_ID,freshState,upsertSession,addEvidence,startTrackBSession,recordTrackBTeaching,recordPerfectTrackBChecks,scheduleReviews,completeTrackBLesson,addPriorInstructionForMath,runPerfectTrackADiagnostic};
  if(typeof window!=='undefined')window.LEVEL_UP_SYNTHETIC_E2E_CORE=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_SYNTHETIC_E2E_CORE=api;
})();
