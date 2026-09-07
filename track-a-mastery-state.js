(() => {
  const CHECKPOINTS=Object.freeze(['Day 2','Day 7','Transfer','Day 21']);

  function isoPlusDays(iso,days){const d=new Date(iso);d.setDate(d.getDate()+days);return d.toISOString()}
  function taskId(cycleId,checkpoint,attempt=1){return `${cycleId}_${checkpoint.toLowerCase().replace(/[^a-z0-9]+/g,'_')}_a${attempt}`}
  function makeTask(cycleId,skillId,checkpoint,dueAt,status='SCHEDULED',attempt=1,previousTaskId=null){
    const type=checkpoint==='Transfer'?'TRANSFER':checkpoint==='Day 21'?'MAINTENANCE':'RETENTION';
    return {id:taskId(cycleId,checkpoint,attempt),cycleId,skillId,checkpoint,type,dueAt,status,attempt,previousTaskId,createdAt:new Date().toISOString(),completedAt:null,passed:null,result:null};
  }
  function createSchedule(skillId,cycleId,provisionalAt){
    return [
      makeTask(cycleId,skillId,'Day 2',isoPlusDays(provisionalAt,2),'SCHEDULED'),
      makeTask(cycleId,skillId,'Day 7',isoPlusDays(provisionalAt,7),'LOCKED'),
      makeTask(cycleId,skillId,'Transfer',null,'LOCKED'),
      makeTask(cycleId,skillId,'Day 21',isoPlusDays(provisionalAt,21),'LOCKED')
    ];
  }
  function latestTask(tasks,skillId,checkpoint){
    return (tasks||[]).filter(t=>t.skillId===skillId&&t.checkpoint===checkpoint).sort((a,b)=>(b.attempt||1)-(a.attempt||1))[0]||null;
  }
  function taskById(tasks,id){return (tasks||[]).find(t=>t.id===id)||null}
  function controlledSetPassed(responses){
    return Array.isArray(responses)&&responses.length===2&&responses.every(e=>e&&e.fresh===true&&e.reliable===true&&e.assistance_level==='INDEPENDENT'&&e.isCorrect===true)
  }
  function controlledSetUsable(responses){return Array.isArray(responses)&&responses.length===2&&responses.every(e=>e&&e.fresh===true&&e.reliable===true&&e.assistance_level==='INDEPENDENT')}
  function completeTask(tasks,id,responses,completedAt){
    const t=taskById(tasks,id);if(!t)throw new Error(`Unknown mastery task ${id}`);
    const usable=controlledSetUsable(responses);const passed=controlledSetPassed(responses);
    t.completedAt=completedAt;t.passed=passed;t.result=!usable?'INSUFFICIENT_CONTROLLED_EVIDENCE':passed?'PASSED':'FAILED';t.status=t.result==='PASSED'?'COMPLETED':t.result==='FAILED'?'FAILED':'UNUSABLE';
    if(t.checkpoint==='Day 2'&&passed){const d7=latestTask(tasks,t.skillId,'Day 7');if(d7&&d7.status==='LOCKED')d7.status='SCHEDULED'}
    if(t.checkpoint==='Day 7'&&passed){const d2=latestTask(tasks,t.skillId,'Day 2');if(d2?.passed===true){const x=latestTask(tasks,t.skillId,'Transfer');if(x&&x.status==='LOCKED'){x.status='SCHEDULED';x.dueAt=completedAt}}}
    return t;
  }
  function masteryConditions(tasks,skillId){
    const d2=latestTask(tasks,skillId,'Day 2');const d7=latestTask(tasks,skillId,'Day 7');const x=latestTask(tasks,skillId,'Transfer');
    return {day2_passed:d2?.passed===true,day7_passed:d7?.passed===true,delayed_retrieval_passed:d2?.passed===true&&d7?.passed===true,transfer_passed:x?.passed===true};
  }
  function unlockMaintenance(tasks,skillId){const m=latestTask(tasks,skillId,'Day 21');if(m&&m.status==='LOCKED')m.status='SCHEDULED';return m}
  function retryTask(tasks,failedTaskId,retryAt){
    const old=taskById(tasks,failedTaskId);if(!old)throw new Error(`Unknown failed task ${failedTaskId}`);
    const next=makeTask(old.cycleId,old.skillId,old.checkpoint,retryAt,'SCHEDULED',(old.attempt||1)+1,old.id);tasks.push(next);return next;
  }
  function memoryStrength(tasks,skillId){
    const c=masteryConditions(tasks,skillId);const m=latestTask(tasks,skillId,'Day 21');
    if(m?.passed===true&&c.transfer_passed)return 'FLEXIBLE';
    if(c.delayed_retrieval_passed&&c.transfer_passed)return 'STABLE';
    if(c.day2_passed||c.day7_passed)return 'BUILDING';
    return 'FRAGILE';
  }
  function nextTask(tasks,skillId,nowIso,canonicalState){
    const now=new Date(nowIso).getTime();
    const ordered=['Day 2','Day 7','Transfer'];
    if(canonicalState==='PROVISIONAL'){
      for(const checkpoint of ordered){
        const t=latestTask(tasks,skillId,checkpoint);if(!t)return null;
        if(t.status==='FAILED')return {kind:'REPAIR_REQUIRED',task:t};
        if(t.status==='UNUSABLE')return {kind:'REPLACE_REQUIRED',task:t};
        if(t.status==='SCHEDULED'){if(!t.dueAt||new Date(t.dueAt).getTime()<=now)return {kind:'TASK_DUE',task:t};return {kind:'WAITING',task:t}}
        if(t.status==='LOCKED')return {kind:'WAITING',task:t};
      }
      return {kind:'READY_FOR_MASTERY_DECISION',task:null};
    }
    if(canonicalState==='MASTERED'){
      const m=latestTask(tasks,skillId,'Day 21');if(!m)return null;
      if(m.status==='FAILED')return {kind:'MAINTENANCE_REPAIR_REQUIRED',task:m};
      if(m.status==='UNUSABLE')return {kind:'REPLACE_REQUIRED',task:m};
      if(m.status==='SCHEDULED'){if(new Date(m.dueAt).getTime()<=now)return {kind:'MAINTENANCE_DUE',task:m};return {kind:'WAITING',task:m}}
      if(m.status==='COMPLETED')return {kind:'DONE',task:m};
      return {kind:'WAITING',task:m};
    }
    return null;
  }

  const api={CHECKPOINTS,createSchedule,latestTask,taskById,controlledSetPassed,controlledSetUsable,completeTask,masteryConditions,unlockMaintenance,retryTask,memoryStrength,nextTask};
  if(typeof window!=='undefined')window.LEVEL_UP_TRACK_A_MASTERY_STATE=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_MASTERY_STATE=api;
})();
