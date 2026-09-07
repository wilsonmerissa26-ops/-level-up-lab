(() => {
  const STATES=Object.freeze(['UNKNOWN','DIAGNOSTIC','GAP','LEARNING','PRACTICING','PROVISIONAL','MASTERED','EXTENDED']);
  const ASSISTANCE_LEVELS=Object.freeze(['INDEPENDENT','CLARIFIED','HINTED','GUIDED','TAUGHT','PARENT_ASSISTED']);

  function isControlledProbe(p){
    return !!(p && p.fresh===true && p.reliable===true && p.assistance_level==='INDEPENDENT');
  }

  function baselineMeta(priorInstruction){
    return {instruction_exposure_status:priorInstruction?'PRIOR_INSTRUCTION':null,cold_baseline_eligible:!priorInstruction};
  }

  function evaluateThreeProbeDiagnostic(probes,options={}){
    if(!Array.isArray(probes) || probes.length!==3) throw new Error('Track A diagnostic requires exactly 3 probes.');
    const priorInstruction=options.priorInstruction===true;
    const contradictoryEvidence=options.contradictoryEvidence===true;
    const controlled=probes.filter(isControlledProbe);
    const meta=baselineMeta(priorInstruction);
    if(controlled.length!==3){
      return {...meta,result:'INSUFFICIENT_CONTROLLED_EVIDENCE',correct_count:null,next_action:'REPLACE_UNUSABLE_PROBES',reason:'All three probes must be fresh, reliable, and INDEPENDENT.'};
    }
    const correct=controlled.filter(p=>p.correct===true).length;
    if(correct===3){
      if(contradictoryEvidence){
        return {...meta,result:'NEEDS_MORE_EVIDENCE',correct_count:3,next_action:'RESOLVE_CONTRADICTORY_EVIDENCE',reason:'Three controlled probes were correct, but contradictory evidence blocks a provisional transition.'};
      }
      return {...meta,result:'PROVISIONAL_SUPPORTED',correct_count:3,next_action:'SCHEDULE_DELAYED_RETRIEVAL_AND_TRANSFER',reason:'Three fresh, reliable, independent probes support provisional status only.'};
    }
    if(correct===2){
      return {...meta,result:'MISS_DETECTED',correct_count:2,next_action:'MINIMAL_CORRECTION_THEN_2_FRESH_VERIFICATION',reason:'Two of three controlled probes were correct. Diagnose the miss before verifying with two fresh probes.'};
    }
    return {...meta,result:'PREREQUISITE_TRACE_REQUIRED',correct_count:correct,next_action:'TRACE_DOWN_TO_FIRST_UNSTABLE_PREREQUISITE',reason:'Zero or one of three controlled probes was correct. Do not keep probing at the same level.'};
  }

  function evaluateTwoProbeVerification(probes){
    if(!Array.isArray(probes) || probes.length!==2) throw new Error('Verification requires exactly 2 probes.');
    if(probes.some(p=>!isControlledProbe(p))) return {result:'INSUFFICIENT_CONTROLLED_EVIDENCE',next_action:'REPLACE_UNUSABLE_VERIFICATION_PROBES'};
    const correct=probes.filter(p=>p.correct===true).length;
    return correct===2
      ? {result:'VERIFICATION_PASSED',correct_count:2,next_action:'CONTINUE_CONTROLLED_EVIDENCE_PATH'}
      : {result:'VERIFICATION_FAILED',correct_count:correct,next_action:'TEACH_SMALLEST_MISSING_COMPONENT'};
  }

  function transitionDecision(from,to,ctx={}){
    if(!STATES.includes(from)||!STATES.includes(to)) return {allowed:false,reason:'UNKNOWN_STATE'};
    if(from===to) return {allowed:true,reason:'NO_CHANGE'};
    if(from==='UNKNOWN'&&to==='DIAGNOSTIC') return ctx.diagnostic_started===true?{allowed:true,reason:'DIAGNOSTIC_STARTED'}:{allowed:false,reason:'DIAGNOSTIC_NOT_STARTED'};
    if(from==='DIAGNOSTIC'&&to==='GAP') return ['MISS_DETECTED','PREREQUISITE_TRACE_REQUIRED'].includes(ctx.diagnostic_result)?{allowed:true,reason:'CONTROLLED_GAP_EVIDENCE'}:{allowed:false,reason:'GAP_NOT_ESTABLISHED'};
    if(from==='DIAGNOSTIC'&&to==='PROVISIONAL') return ctx.diagnostic_result==='PROVISIONAL_SUPPORTED'?{allowed:true,reason:'THREE_PROBE_RULE_MET'}:{allowed:false,reason:'PROVISIONAL_NOT_SUPPORTED'};
    if(from==='GAP'&&to==='LEARNING') return ctx.instruction_started===true?{allowed:true,reason:'INSTRUCTION_STARTED'}:{allowed:false,reason:'INSTRUCTION_NOT_STARTED'};
    if(from==='LEARNING'&&to==='PRACTICING') return ctx.smallest_component_verified===true?{allowed:true,reason:'TAUGHT_COMPONENT_VERIFIED'}:{allowed:false,reason:'COMPONENT_NOT_VERIFIED'};
    if(from==='PRACTICING'&&to==='PROVISIONAL') return ctx.verification_result==='VERIFICATION_PASSED'?{allowed:true,reason:'FRESH_VERIFICATION_PASSED'}:{allowed:false,reason:'VERIFICATION_NOT_PASSED'};
    if(from==='PROVISIONAL'&&to==='MASTERED'){
      if(ctx.delayed_retrieval_passed!==true) return {allowed:false,reason:'DELAYED_RETRIEVAL_REQUIRED'};
      if(ctx.transfer_passed!==true) return {allowed:false,reason:'TRANSFER_REQUIRED'};
      return {allowed:true,reason:'DELAYED_RETRIEVAL_AND_TRANSFER_PASSED'};
    }
    if(from==='MASTERED'&&to==='EXTENDED') return ctx.extension_evidence===true?{allowed:true,reason:'EXTENSION_EVIDENCE_PRESENT'}:{allowed:false,reason:'EXTENSION_EVIDENCE_REQUIRED'};
    return {allowed:false,reason:'TRANSITION_NOT_ALLOWED'};
  }

  function memoryStrengthFromEvidence({delayed_retrieval_passed=false,transfer_passed=false,maintenance_passed=false}={}){
    if(maintenance_passed&&transfer_passed)return 'FLEXIBLE';
    if(delayed_retrieval_passed&&transfer_passed)return 'STABLE';
    if(delayed_retrieval_passed)return 'BUILDING';
    return 'FRAGILE';
  }

  const api={STATES,ASSISTANCE_LEVELS,isControlledProbe,evaluateThreeProbeDiagnostic,evaluateTwoProbeVerification,transitionDecision,memoryStrengthFromEvidence};
  if(typeof window!=='undefined')window.LEVEL_UP_TRACK_A_ENGINE=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_ENGINE=api;
})();
