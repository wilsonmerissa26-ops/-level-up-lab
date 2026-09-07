import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const audit=fs.readFileSync(new URL('../audit-browser.js',import.meta.url),'utf8');

assert.match(index,/storage-durability\.js/);
assert.match(app,/const STORAGE_DURABILITY = window\.LEVEL_UP_STORAGE_DURABILITY/);
assert.match(app,/schemaVersion:2/);
assert.match(app,/stateRevision:null/);
assert.match(app,/learnerRecordOrigin:/);
assert.match(app,/lastDurableRevision/);
assert.match(app,/STATE_INTEGRITY\.nextRevision\(lastDurableRevision\)/);
assert.match(app,/STATE_INTEGRITY\.compareRevisions/);
assert.match(app,/UNKNOWN_PRE_REVISION/);
assert.match(app,/MIRROR_AHEAD/);
assert.match(app,/redundancy_degraded_at_write/);
assert.match(app,/annotateWriteProvenance/);
assert.match(app,/prepareRestoreCandidate/);
assert.match(app,/observedRevisions/);
assert.match(app,/requestPersistentStorage/);
assert.match(app,/getPersistenceStatus/);
assert.doesNotMatch(app,/await STORAGE_DURABILITY\.requestPersistentStorage\([^)]*\).*init/s);
assert.match(app,/Start a new learner record/);
assert.match(app,/Restore JSON backup/);
assert.match(app,/INTERRUPTED_PRESERVED/);
assert.match(app,/Resume session/);
assert.match(app,/End session, keep evidence/);
assert.match(audit,/UNKNOWN_OR_UNSUPPORTED/);
assert.match(audit,/BEST_EFFORT/);
assert.match(audit,/PERSISTENT/);
assert.match(audit,/stateRevision/);
assert.match(audit,/INTERRUPTED_PRESERVED/);

console.log('PASS Patch K UI/browser integration contract');
