(() => {
  const SUPPORTED_SCHEMA_VERSION = 1;
  const LEGACY_KEYS = new Set(['evidenceStatus','independent','skillState','accessSupport','accessSupports']);
  const ACCESS_CONDITIONS = Object.freeze(['SELF_READ_SILENT','SELF_READ_ALOUD','SYSTEM_READ_ALOUD','ADULT_READ_ALOUD']);

  function deepClone(value){ return JSON.parse(JSON.stringify(value)); }

  function containsLegacyFields(value){
    if(!value || typeof value!=='object') return false;
    if(Array.isArray(value)) return value.some(containsLegacyFields);
    for(const [key,child] of Object.entries(value)){
      if(LEGACY_KEYS.has(key)) return true;
      if(containsLegacyFields(child)) return true;
    }
    return false;
  }

  function coreLearnerStateValid(value){
    return !!(value && value.student && value.student.id==='michael' && Array.isArray(value.evidence) && value.lessonState && typeof value.lessonState==='object');
  }

  function validateRestoreCandidate(value){
    if(!value || typeof value!=='object') throw new Error('Backup is not a learner-state object.');
    if(value.schemaVersion!==SUPPORTED_SCHEMA_VERSION) throw new Error(`Unsupported backup schemaVersion: ${String(value.schemaVersion)}.`);
    if(!coreLearnerStateValid(value)) throw new Error('Backup is truncated or is not Michael’s Level-Up learner state.');
    if(containsLegacyFields(value)) throw new Error('Backup contains legacy evidence fields and must not be restored into this build.');
    return deepClone(value);
  }

  function validAccessCondition(value){ return ACCESS_CONDITIONS.includes(value)?value:null; }

  function nextAttemptNumber(evidence, sessionMode, skillId){
    const nums=(Array.isArray(evidence)?evidence:[])
      .filter(e=>e && e.session_mode===sessionMode && e.skillId===skillId && Number.isInteger(e.attemptNumber) && e.attemptNumber>0)
      .map(e=>e.attemptNumber);
    return nums.length?Math.max(...nums)+1:1;
  }

  function linkEvidenceToSession(ev, session, evidence=[]){
    if(!ev || typeof ev!=='object') throw new Error('Evidence object required.');
    if(!session || !session.id) throw new Error('Session context required for evidence.');
    const skillId=session.skillId||session.lessonId||ev.skillId;
    if(!Number.isInteger(session.attemptNumber) || session.attemptNumber<1){
      session.attemptNumber=nextAttemptNumber(evidence,session.mode,skillId);
    }
    ev.sessionId=session.id;
    ev.attemptNumber=session.attemptNumber;
    ev.session_mode=session.mode||null;
    return ev;
  }

  const api={SUPPORTED_SCHEMA_VERSION,ACCESS_CONDITIONS,deepClone,containsLegacyFields,coreLearnerStateValid,validateRestoreCandidate,validAccessCondition,nextAttemptNumber,linkEvidenceToSession};
  if(typeof window!=='undefined')window.LEVEL_UP_STATE_INTEGRITY=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_STATE_INTEGRITY=api;
})();
