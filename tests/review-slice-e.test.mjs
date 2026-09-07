import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const contentSource = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const reviewSource = fs.readFileSync(new URL('../review-engine.js', import.meta.url), 'utf8');
function pass(name){ console.log('PASS', name); }

const context={window:{}};
vm.createContext(context);
vm.runInContext(contentSource,context);
vm.runInContext(reviewSource,context);
const CONTENT=context.window.LEVEL_UP_CONTENT;
const ENGINE=context.window.LEVEL_UP_REVIEW_ENGINE;
const lessonMap=new Map([...CONTENT.science,...CONTENT.math].map(l=>[l.id,l]));

assert.equal(ENGINE.SKILL_IDS.length,13); pass('review engine covers all 13 Track B lesson skills');
for(const skillId of ENGINE.SKILL_IDS){
  assert.ok(lessonMap.has(skillId),`unknown review skill ${skillId}`);
  for(const windowLabel of ['Day 2','Day 7','Day 21']){
    const reviewId=`test_${skillId}_${windowLabel.replaceAll(' ','_')}`;
    const a=ENGINE.generateReview(skillId,windowLabel,reviewId);
    const b=ENGINE.generateReview(skillId,windowLabel,reviewId);
    assert.equal(a.length,3,`${skillId} ${windowLabel} should have 3 items`);
    assert.deepEqual(a,b,`${skillId} ${windowLabel} must be deterministic for resume`);
    assert.equal(new Set(a.map(x=>x.id)).size,3,`${skillId} ${windowLabel} ids unique`);
    const teachingPrompts=new Set(lessonMap.get(skillId).checks.map(x=>x.q));
    for(const item of a){
      assert.ok(!teachingPrompts.has(item.q),`${skillId} reused exact teaching prompt`);
      assert.ok(item.choices || Object.hasOwn(item,'free'),`${skillId} item is scorable`);
    }
    if(windowLabel==='Day 21')assert.ok(a.some(x=>x.transfer),`${skillId} Day 21 needs a transfer item`);
  }
}
pass('all review windows generate fresh deterministic scorable items');
pass('Day 21 includes transfer evidence for every skill');

assert.match(appSource,/function startReview\(/); pass('review runner start action exists');
assert.match(appSource,/phase:"RETRIEVAL"/); pass('review sessions use RETRIEVAL phase');
assert.match(appSource,/instructionDelivered:false/); pass('review sessions start without instruction');
assert.match(appSource,/evidenceType:"DELAYED_RETRIEVAL"/); pass('review evidence type is explicit');
assert.match(appSource,/review_window:/); pass('review window is stored on evidence');
assert.match(appSource,/transfer:/); pass('transfer marker is stored on review evidence');
assert.match(appSource,/function finishReview\(/); pass('review completion handler exists');
assert.match(appSource,/memoryStrengthForReview\(/); pass('review memory-strength rule is explicit');
assert.doesNotMatch(appSource,/skillState\s*:/); pass('review slice does not write canonical lifecycle state');
assert.match(appSource,/if\(!await save\("review answer"\)\)return/); pass('review answer fail-stops on persistence failure');
assert.match(appSource,/if\(!await save\("finish review"\)\)return/); pass('review completion fail-stops on persistence failure');

console.log('\nAll Slice E delayed-review checks passed.');
