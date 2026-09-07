(() => {
  const D=window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
  if(!D)throw new Error('Track A diagnostic bank must load before verification generator.');

  function generateVerification(skillId,sessionId,excludedFingerprints=[]){
    const excluded=new Set(excludedFingerprints||[]);const chosen=[];const seen=new Set(excluded);
    for(let attempt=0;attempt<20 && chosen.length<2;attempt++){
      const batch=D.generateDiagnostic(skillId,`${sessionId}_verification_${attempt}`);
      for(const item of batch){
        const fp=D.fingerprint(item);if(seen.has(fp))continue;seen.add(fp);
        chosen.push({...item,id:`${sessionId}_verify_${chosen.length+1}_${item.template_id.replace(/[^A-Z0-9]/gi,'_')}`});
        if(chosen.length===2)break;
      }
    }
    if(chosen.length!==2)throw new Error(`Could not generate two fresh verification probes for ${skillId}.`);
    return chosen;
  }

  const api={generateVerification};
  window.LEVEL_UP_TRACK_A_VERIFICATION=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_VERIFICATION=api;
})();
