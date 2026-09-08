(() => {
  const REASONS = Object.freeze({
    ALLOWED:'ALLOWED',
    BUILD_LOCKED:'BUILD_LOCKED',
    HOME_SCREEN_REQUIRED:'HOME_SCREEN_REQUIRED',
    PERSISTENT_STORAGE_REQUIRED:'PERSISTENT_STORAGE_REQUIRED'
  });

  function evaluate({buildEnabled=false,standalone=false,persistenceState='UNKNOWN_OR_UNSUPPORTED'}={}){
    if(!buildEnabled)return {allowed:false,reason:REASONS.BUILD_LOCKED};
    if(!standalone)return {allowed:false,reason:REASONS.HOME_SCREEN_REQUIRED};
    if(persistenceState!=='PERSISTENT')return {allowed:false,reason:REASONS.PERSISTENT_STORAGE_REQUIRED};
    return {allowed:true,reason:REASONS.ALLOWED};
  }

  function message(result){
    switch(result?.reason){
      case REASONS.HOME_SCREEN_REQUIRED:
        return "Michael's pilot is unlocked only in the installed Level-Up Home Screen app. Open Level-Up from its Home Screen icon.";
      case REASONS.PERSISTENT_STORAGE_REQUIRED:
        return "Michael's pilot requires persistent browser storage in the installed Home Screen app. Open Backup and confirm Persistent mode before starting learner evidence.";
      case REASONS.BUILD_LOCKED:
        return 'Student use is disabled while this build is under release lock.';
      default:
        return '';
    }
  }

  const api={REASONS,evaluate,message};
  if(typeof window!=='undefined')window.LEVEL_UP_RUNTIME_GATE=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_RUNTIME_GATE=api;
})();
