(() => {
  const PERSISTENCE_STATES = Object.freeze({
    PERSISTENT:'PERSISTENT',
    BEST_EFFORT:'BEST_EFFORT',
    UNKNOWN_OR_UNSUPPORTED:'UNKNOWN_OR_UNSUPPORTED'
  });

  function storageCapability(storageManager){
    return {
      canCheck:!!(storageManager && typeof storageManager.persisted==='function'),
      canRequest:!!(storageManager && typeof storageManager.persist==='function')
    };
  }

  async function getPersistenceStatus(storageManager){
    const capability=storageCapability(storageManager);
    if(!capability.canCheck){
      return {state:PERSISTENCE_STATES.UNKNOWN_OR_UNSUPPORTED,supported:false,canRequest:capability.canRequest,checked:true,error:null};
    }
    try{
      const persistent=await storageManager.persisted();
      return {state:persistent?PERSISTENCE_STATES.PERSISTENT:PERSISTENCE_STATES.BEST_EFFORT,supported:true,canRequest:capability.canRequest,checked:true,error:null};
    }catch(err){
      return {state:PERSISTENCE_STATES.UNKNOWN_OR_UNSUPPORTED,supported:true,canRequest:capability.canRequest,checked:true,error:String(err?.message||err||'persisted() failed')};
    }
  }

  async function requestPersistentStorage(storageManager){
    const capability=storageCapability(storageManager);
    if(!capability.canRequest){
      return {state:PERSISTENCE_STATES.UNKNOWN_OR_UNSUPPORTED,supported:capability.canCheck,canRequest:false,requested:false,granted:false,error:null};
    }
    try{
      const granted=await storageManager.persist();
      return {state:granted?PERSISTENCE_STATES.PERSISTENT:PERSISTENCE_STATES.BEST_EFFORT,supported:true,canRequest:true,requested:true,granted:!!granted,error:null};
    }catch(err){
      return {state:PERSISTENCE_STATES.UNKNOWN_OR_UNSUPPORTED,supported:true,canRequest:true,requested:true,granted:false,error:String(err?.message||err||'persist() failed')};
    }
  }

  function isStandaloneEnvironment(env=globalThis){
    try{
      if(env?.navigator?.standalone===true)return true;
      if(typeof env?.matchMedia==='function' && env.matchMedia('(display-mode: standalone)')?.matches)return true;
    }catch(_){ }
    return false;
  }

  const api={PERSISTENCE_STATES,storageCapability,getPersistenceStatus,requestPersistentStorage,isStandaloneEnvironment};
  if(typeof window!=='undefined')window.LEVEL_UP_STORAGE_DURABILITY=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_STORAGE_DURABILITY=api;
})();
