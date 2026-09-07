import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../track-a-diagnostic.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(source,context);
const D=context.window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
function pass(name){console.log('PASS',name)}

assert.equal(D.SKILLS.length,6);pass('six frozen v1 math diagnostic skills present');
assert.deepEqual(Array.from(D.SKILLS,x=>x.id),[
  'MATH.INTEGER_OPS','MATH.DISTRIBUTIVE','MATH.COMBINE_LIKE_TERMS','MATH.ONE_STEP_EQUATIONS','MATH.TWO_STEP_EQUATIONS','MATH.INTRO_INEQUALITIES'
]);pass('math prerequisite sequence preserved');
for(let i=1;i<D.SKILLS.length;i++)assert.equal(D.SKILLS[i].prereq,D.SKILLS[i-1].id);
pass('each non-root skill points to prior prerequisite');

for(const skill of D.SKILLS){
  const a=D.generateDiagnostic(skill.id,'session_same');
  const b=D.generateDiagnostic(skill.id,'session_same');
  assert.equal(a.length,3);
  assert.deepEqual(a,b,`${skill.id} must regenerate deterministically for resume`);
  assert.equal(new Set(a.map(x=>x.q)).size,3,`${skill.id} diagnostic prompts must be distinct`);
  for(const item of a){
    assert.equal(item.validated,true);
    assert.equal(item.template_version,'1.0.0');
    assert.ok(item.template_id);
    assert.ok(item.q);
    if(item.choices){
      assert.ok(Number.isInteger(item.answer));
      assert.equal(D.checkAnswer(item,item.choices[item.answer],item.answer),true);
      const wrong=(item.answer+1)%item.choices.length;
      assert.equal(D.checkAnswer(item,item.choices[wrong],wrong),false);
    }else{
      assert.equal(D.checkAnswer(item,item.free),true);
      assert.equal(D.checkAnswer(item,`x = ${item.free}`),true);
    }
  }
}
pass('all generated probes are validated, deterministic and scorable');

const one=D.generateDiagnostic('MATH.ONE_STEP_EQUATIONS','numeric_format');
for(const item of one)if(!item.choices)assert.equal(D.checkAnswer(item,` x = ${item.free} `),true);
pass('equation numeric answer normalization accepts x = value without overwriting raw response');

assert.equal(D.prerequisiteOf('MATH.TWO_STEP_EQUATIONS'),'MATH.ONE_STEP_EQUATIONS');
assert.equal(D.prerequisiteOf('MATH.INTEGER_OPS'),null);
pass('prerequisite lookup works');

console.log('\nAll Track A diagnostic-bank checks passed.');
