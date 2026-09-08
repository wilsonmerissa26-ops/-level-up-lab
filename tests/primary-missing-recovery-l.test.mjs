import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clone = value => JSON.parse(JSON.stringify(value));
const stateIntegritySource = fs.readFileSync('state-integrity.js','utf8');
let appSource = fs.readFileSync('app.js','utf8');

// Test-only instrumentation: execute the real init()/restore code while counting save()
// calls and exposing the in-memory recovery issue. No source-text behavior assertions are used.
const saveAnchor='  async function save(reason="update"){\n';
assert.ok(appSource.includes(saveAnchor),'save anchor missing');
appSource=appSource.replace(saveAnchor,saveAnchor+'    globalThis.__patchLSaveCalls=(globalThis.__patchLSaveCalls||0)+1;\n');
// Insert the audit getter immediately after the stable helper name. This remains valid when
// later release patches append additional __audit helpers after sameOriginRedundancyDegraded.
const auditMarker='sameOriginRedundancyDegraded';
const auditIndex=appSource.lastIndexOf(auditMarker);
assert.ok(auditIndex>=0,'audit export anchor missing');
const auditInsertAt=auditIndex+auditMarker.length;
appSource=appSource.slice(0,auditInsertAt)+',getStorageRecoveryIssue:()=>storageRecoveryIssue'+appSource.slice(auditInsertAt);

const mirror={
  schemaVersion:2,
  stateRevision:7,
  learnerRecordOrigin:{type:'NEW',decidedAt:'2026-09-07T20:00:00.000Z',priorRecordOffered:false},
  restoredFrom:null,
  student:{id:'michael',name:'Michael',grade:'8',school:'Murphy Middle School'},
  activeTrack:'B',
  lessonState:{},
  trackASkillState:{},
  trackAActiveSession:null,
  trackAMasterySchedule:[],
  evidence:[],
  sessions:[],
  reviewSchedule:[],
  schoolFacts:[],
  settings:{readAloud:true,extraProcessing:true,parentTypesVerbatim:true},
  backup:{lastExportAttemptedAt:null,pendingAfterLesson:false},
  activeSession:null,
  updatedAt:'2026-09-07T20:01:00.000Z'
};

const idbStore=new Map(); // PRIMARY deliberately absent.
const idbWrites=[];
const fakeDb={
  objectStoreNames:{contains:()=>true},
  transaction(){
    const tx={oncomplete:null,onerror:null,error:null,objectStore(){
      return {
        get(key){
          const req={onsuccess:null,onerror:null,result:undefined,error:null};
          queueMicrotask(()=>{req.result=idbStore.has(key)?clone(idbStore.get(key)):undefined;req.onsuccess?.()});
          return req;
        },
        put(value,key){
          const req={onsuccess:null,onerror:null,error:null};
          idbWrites.push({key,value:clone(value)});
          idbStore.set(key,clone(value));
          queueMicrotask(()=>tx.oncomplete?.());
          return req;
        },
        delete(key){
          const req={onsuccess:null,onerror:null,error:null};
          idbStore.delete(key);
          queueMicrotask(()=>tx.oncomplete?.());
          return req;
        }
      };
    }};
    return tx;
  }
};

const storageMap=new Map([['MLUL_BACKUP_V1',JSON.stringify(mirror)]]);
const appElement={innerHTML:'',className:''};
const sandbox={
  console,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Math,
  Promise,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Error,
  Intl,
  alert:()=>{},
  location:{hash:'#backup'},
  navigator:{storage:{}},
  speechSynthesis:{cancel(){}},
  SpeechSynthesisUtterance:function(){},
  document:{
    getElementById(id){return id==='app'?appElement:null},
    querySelector(){return null},
    querySelectorAll(){return []},
    createElement(){return {click(){},style:{}}}
  },
  localStorage:{
    getItem(key){return storageMap.has(key)?storageMap.get(key):null},
    setItem(key,value){storageMap.set(key,String(value))},
    removeItem(key){storageMap.delete(key)}
  },
  indexedDB:{
    open(){
      const req={result:null,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{req.result=fakeDb;req.onsuccess?.()});
      return req;
    }
  },
  LEVEL_UP_CONTENT:{student:mirror.student,science:[],math:[]},
  LEVEL_UP_REVIEW_ENGINE:null,
  LEVEL_UP_TRACK_A_ENGINE:null,
  LEVEL_UP_TRACK_A_DIAGNOSTIC:null,
  LEVEL_UP_TRACK_A_REMEDIATION:null,
  LEVEL_UP_TRACK_A_VERIFICATION:null,
  LEVEL_UP_TRACK_A_MASTERY_STATE:null,
  LEVEL_UP_TRACK_A_MASTERY:null,
  LEVEL_UP_RUNTIME_GATE:null,
  LEVEL_UP_STORAGE_DURABILITY:{
    async getPersistenceStatus(){return {state:'BEST_EFFORT',supported:true,canRequest:true,checked:true,error:null}},
    async requestPersistentStorage(){return {state:'BEST_EFFORT',supported:true,canRequest:true,checked:true,error:null}},
    isStandaloneEnvironment(){return false}
  },
  __patchLSaveCalls:0
};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
sandbox.window.addEventListener=()=>{};

const context=vm.createContext(sandbox);
vm.runInContext(stateIntegritySource,context,{filename:'state-integrity.js'});
vm.runInContext(appSource,context,{filename:'app.js'});

async function waitFor(predicate, message){
  for(let i=0;i<100;i++){
    if(predicate())return;
    await new Promise(r=>setTimeout(r,2));
  }
  throw new Error(message);
}

await waitFor(
  ()=>context.window.MLUL?.__audit?.getStorageRecoveryIssue?.()?.type==='PRIMARY_MISSING_MIRROR_PRESENT',
  'init did not reach primary-missing recovery decision state'
);

const issue=context.window.MLUL.__audit.getStorageRecoveryIssue();
assert.equal(issue.type,'PRIMARY_MISSING_MIRROR_PRESENT');
assert.equal(context.__patchLSaveCalls,0,'init must not call save when primary is missing and mirror exists');
assert.equal(idbWrites.filter(x=>x.key==='michael').length,0,'init must not write learner state to IndexedDB before parent choice');
assert.match(appElement.innerHTML,/Primary learner record unavailable/i);
assert.match(appElement.innerHTML,/Restore this backup/i);
assert.match(appElement.innerHTML,/Import a JSON backup instead/i);

await context.window.MLUL.restoreMirrorAsAuthoritative();
await waitFor(()=>idbStore.has('michael'),'parent restore choice did not persist learner record');

const restored=idbStore.get('michael');
assert.equal(restored.learnerRecordOrigin.type,'RESTORED_MIRROR');
assert.equal(restored.learnerRecordOrigin.priorRecordOffered,true);
assert.equal(restored.restoredFrom.type,'RESTORED_MIRROR');
assert.ok(restored.stateRevision>mirror.stateRevision,'restore must advance revision');
assert.equal(context.window.MLUL.__audit.getStorageRecoveryIssue(),null);
assert.ok(context.__patchLSaveCalls>=1,'parent restore choice must call save');

console.log('PASS Patch L primary-missing recovery requires explicit parent decision');
