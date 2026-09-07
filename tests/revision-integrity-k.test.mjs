import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../state-integrity.js',import.meta.url),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
const S=ctx.LEVEL_UP_STATE_INTEGRITY;
assert.equal(S.SUPPORTED_SCHEMA_VERSION,2);

const v1={schemaVersion:1,student:{id:'michael'},evidence:[],lessonState:{},backup:{lastExportAttemptedAt:null,pendingAfterLesson:false}};
const migrated=S.migrateV1(v1,{originType:'NEW',now:'2026-09-07T20:00:00.000Z'});
assert.equal(migrated.schemaVersion,2);
assert.equal(migrated.stateRevision,null);
assert.equal(migrated.learnerRecordOrigin.type,'NEW');
assert.equal(migrated.learnerRecordOrigin.migratedFromSchemaVersion,1);
assert.equal(S.compareRevisions(migrated,migrated),'UNKNOWN_PRE_REVISION');

const p={...migrated,stateRevision:4};
const m={...migrated,stateRevision:4};
assert.equal(S.compareRevisions(p,m),'IN_SYNC');
assert.equal(S.compareRevisions({...p,stateRevision:5},m),'MIRROR_STALE');
assert.equal(S.compareRevisions(p,{...m,stateRevision:5}),'MIRROR_AHEAD');
assert.equal(S.maxObservedRevision([p,{...m,stateRevision:7},null]),7);
assert.equal(S.nextRevision(7),8);
assert.equal(S.nextRevision(0),1);
assert.equal(S.nextRevision(null),1);

const restoredV1=S.prepareRestoreCandidate(v1,{source:'JSON',now:'2026-09-07T20:01:00.000Z',observedRevisions:[{stateRevision:8},{stateRevision:5}]});
assert.equal(restoredV1.schemaVersion,2);
assert.equal(restoredV1.stateRevision,8);
assert.equal(restoredV1.learnerRecordOrigin.type,'RESTORED_JSON');
assert.equal(restoredV1.learnerRecordOrigin.priorRecordOffered,true);
assert.equal(restoredV1.restoredFrom.schemaVersion,1);
assert.equal(restoredV1.restoredFrom.migratedAt,'2026-09-07T20:01:00.000Z');

const current={...restoredV1,stateRevision:9};
const restoredCurrent=S.prepareRestoreCandidate(current,{source:'MIRROR',now:'2026-09-07T20:02:00.000Z',observedRevisions:[{stateRevision:12}]});
assert.equal(restoredCurrent.stateRevision,12);
assert.equal(restoredCurrent.learnerRecordOrigin.type,'RESTORED_MIRROR');
assert.equal(restoredCurrent.restoredFrom.schemaVersion,2);
assert.equal(restoredCurrent.restoredFrom.stateRevision,9);

const attempt={id:'a'};
const observation={id:'o'};
const derived={id:'d'};
S.annotateWriteProvenance(attempt,true);
S.annotateWriteProvenance(observation,true);
S.annotateWriteProvenance(derived,false);
assert.equal(attempt.redundancy_degraded_at_write,true);
assert.equal(observation.redundancy_degraded_at_write,true);
assert.equal(derived.redundancy_degraded_at_write,false);

assert.throws(()=>S.prepareRestoreCandidate({...v1,schemaVersion:0},{source:'JSON'}),/Unsupported backup schemaVersion/);
assert.throws(()=>S.migrateV1({...v1,evidence:[{independent:true}]}),/legacy evidence fields/);

console.log('PASS Patch K revision integrity and v1 forward migration');
