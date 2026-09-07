(() => {
  const SUPPORTED_SCHEMA_VERSION = 2;
  const MIGRATABLE_SCHEMA_VERSIONS = Object.freeze([1]);
  const LEGACY_KEYS = new Set(['evidenceStatus','independent','skillState','accessSupport','accessSupports']);
  const ACCESS_CONDITIONS = Object.freeze(['SELF_READ_SILENT','SELF_READ_ALOUD','SYSTEM_READ_ALOUD','ADULT_READ_ALOUD']);
  const RECORD_ORIGIN_TYPES = Object.freeze(['NEW','RESTORED_MIRROR','RESTORED_JSON']);
  const REVISION_COMPARISONS = Object.freeze(['UNKNOWN_PRE_REVISION','IN_SYNC','MIRROR_STALE','MIRROR_AHEAD']);

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

  function validRevision(value){ return Number.isInteger(value) && value>=1; }
  function revisionOf(value){ return validRevision(value?.stateRevision)?value.stateRevision:null; }

  function validLearnerRecordOrigin(value){
    return !!(value && RECORD_ORIGIN_TYPES.includes(value.type) && typeof value.decidedAt==='string' && typeof value.priorRecordOffered==='boolean');
  }

  function makeLearnerRecordOrigin(type,now,priorRecordOffered=false,extra={}){
    if(!RECORD_ORIGIN_TYPES.includes(type)) throw new Error(`Unsupported learner record origin: ${String(type)}.`);
    return {type,decidedAt:now,priorRecordOffered:!!priorRecordOffered,...extra};
  }

  function validateCurrentState(value){
    if(!value || typeof value!=='object') throw new Error('Learner state is not an object.');
    if(value.schemaVersion!==SUPPORTED_SCHEMA_VERSION) throw new Error(`Unsupported learner schemaVersion: ${String(value.schemaVersion)}.`);
    if(!coreLearnerStateValid(value)) throw new Error('Learner state is truncated or belongs to another learner.');
    if(containsLegacyFields(value)) throw new Error('Learner state contains legacy evidence fields.');
    if(value.stateRevision!=null && !validRevision(value.stateRevision)) throw new Error('Learner state has an invalid stateRevision.');
    if(!validLearnerRecordOrigin(value.learnerRecordOrigin)) throw new Error('Learner state is missing valid learnerRecordOrigin provenance.');
    return deepClone(value);
  }

  function migrateV1(value,{originType='NEW',now=new Date().toISOString(),priorRecordOffered=false}={}){
    if(!value || value.schemaVersion!==1) throw new Error('Only schemaVersion 1 can be migrated by this build.');
    if(!coreLearnerStateValid(value)) throw new Error('Version 1 learner state is truncated or belongs to another learner.');
    if(containsLegacyFields(value)) throw new Error('Version 1 learner state contains legacy evidence fields and cannot be migrated safely.');
    const migrated=deepClone(value);
    migrated.schemaVersion=SUPPORTED_SCHEMA_VERSION;
    migrated.stateRevision=null;
    migrated.learnerRecordOrigin=makeLearnerRecordOrigin(originType,now,priorRecordOffered,{migratedFromSchemaVersion:1});
    if(!Object.prototype.hasOwnProperty.call(migrated,'restoredFrom'))migrated.restoredFrom=null;
    return migrated;
  }

  function prepareLoadedState(value,{source='PRIMARY',now=new Date().toISOString()}={}){
    if(!value || typeof value!=='object') throw new Error('Learner state is not an object.');
    if(value.schemaVersion===SUPPORTED_SCHEMA_VERSION)return validateCurrentState(value);
    if(value.schemaVersion===1){
      const originType=source==='MIRROR'?'RESTORED_MIRROR':'NEW';
      return migrateV1(value,{originType,now,priorRecordOffered:source==='MIRROR'});
    }
    throw new Error(`Unsupported learner schemaVersion: ${String(value.schemaVersion)}.`);
  }

  function maxObservedRevision(values=[]){
    let max=0;
    for(const value of values){
      const n=typeof value==='number'?(validRevision(value)?value:null):revisionOf(value);
      if(n!=null && n>max)max=n;
    }
    return max;
  }

  function nextRevision(lastDurableRevision){ return validRevision(lastDurableRevision)?lastDurableRevision+1:1; }

  function compareRevisions(primary,mirror){
    const p=revisionOf(primary),m=revisionOf(mirror);
    if(p==null || m==null)return 'UNKNOWN_PRE_REVISION';
    if(p===m)return 'IN_SYNC';
    return p>m?'MIRROR_STALE':'MIRROR_AHEAD';
  }

  function prepareRestoreCandidate(value,{source='JSON',now=new Date().toISOString(),observedRevisions=[]}={}){
    if(!value || typeof value!=='object') throw new Error('Backup is not a learner-state object.');
    let candidate;
    const originType=source==='MIRROR'?'RESTORED_MIRROR':'RESTORED_JSON';
    if(value.schemaVersion===SUPPORTED_SCHEMA_VERSION){
      candidate=validateCurrentState(value);
    }else if(MIGRATABLE_SCHEMA_VERSIONS.includes(value.schemaVersion)){
      candidate=migrateV1(value,{originType,now,priorRecordOffered:true});
    }else{
      throw new Error(`Unsupported backup schemaVersion: ${String(value.schemaVersion)}.`);
    }
    const sourceRevision=revisionOf(value);
    const baseRevision=maxObservedRevision([...observedRevisions,value,candidate]);
    candidate.stateRevision=baseRevision||null;
    candidate.learnerRecordOrigin=makeLearnerRecordOrigin(originType,now,true,{migratedFromSchemaVersion:value.schemaVersion===1?1:undefined});
    candidate.restoredFrom={type:originType,schemaVersion:value.schemaVersion,stateRevision:sourceRevision,restoredAt:now,migratedAt:value.schemaVersion===1?now:null};
    return candidate;
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

  function annotateWriteProvenance(record,redundancyDegraded){
    if(!record || typeof record!=='object') throw new Error('Record object required.');
    record.redundancy_degraded_at_write=!!redundancyDegraded;
    return record;
  }

  const api={SUPPORTED_SCHEMA_VERSION,MIGRATABLE_SCHEMA_VERSIONS,ACCESS_CONDITIONS,RECORD_ORIGIN_TYPES,REVISION_COMPARISONS,deepClone,containsLegacyFields,coreLearnerStateValid,validRevision,revisionOf,validLearnerRecordOrigin,makeLearnerRecordOrigin,validateCurrentState,migrateV1,prepareLoadedState,maxObservedRevision,nextRevision,compareRevisions,prepareRestoreCandidate,validAccessCondition,nextAttemptNumber,linkEvidenceToSession,annotateWriteProvenance};
  if(typeof window!=='undefined')window.LEVEL_UP_STATE_INTEGRITY=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_STATE_INTEGRITY=api;
})();
