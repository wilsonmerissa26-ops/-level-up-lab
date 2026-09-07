(() => {
  const SKILLS=Object.freeze([
    {id:'MATH.INTEGER_OPS',title:'Integer Operations',prereq:null,order:1},
    {id:'MATH.DISTRIBUTIVE',title:'Distributive Property',prereq:'MATH.INTEGER_OPS',order:2},
    {id:'MATH.COMBINE_LIKE_TERMS',title:'Combining Like Terms',prereq:'MATH.DISTRIBUTIVE',order:3},
    {id:'MATH.ONE_STEP_EQUATIONS',title:'One-Step Equations',prereq:'MATH.COMBINE_LIKE_TERMS',order:4},
    {id:'MATH.TWO_STEP_EQUATIONS',title:'Two-Step Equations',prereq:'MATH.ONE_STEP_EQUATIONS',order:5},
    {id:'MATH.INTRO_INEQUALITIES',title:'Introductory Inequalities',prereq:'MATH.TWO_STEP_EQUATIONS',order:6}
  ]);
  const SKILL_MAP=new Map(SKILLS.map(s=>[s.id,s]));

  function hash(text){
    let h=2166136261;
    for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
    return h>>>0;
  }
  function n(seed,min,max){return min+(hash(seed)%(max-min+1))}
  function nonZero(seed,min=-9,max=9){let v=n(seed,min,max);return v===0?1:v}
  function choiceItem(base,q,choices,answer,templateId){return {id:base,template_id:templateId,template_version:'1.0.0',validated:true,q,choices,answer}}
  function freeItem(base,q,answer,templateId){return {id:base,template_id:templateId,template_version:'1.0.0',validated:true,q,free:String(answer)}}

  function integerOps(seed,i){
    const base=`${seed}_p${i+1}`;
    if(i===0){const a=-n(seed+'a',2,12),b=n(seed+'b',3,14);return freeItem(base,`What is ${a} + ${b}?`,a+b,'INT.ADD.SIGNED')}
    if(i===1){const a=n(seed+'a',2,12),b=n(seed+'b',a+1,a+12);return freeItem(base,`What is ${a} - ${b}?`,a-b,'INT.SUB.SIGNED')}
    const a=-n(seed+'a',2,9),b=n(seed+'b',2,8);return freeItem(base,`What is ${a} × ${b}?`,a*b,'INT.MULT.SIGNED')
  }
  function distributive(seed,i){
    const base=`${seed}_p${i+1}`;const a=n(seed+'a',2,7),b=nonZero(seed+'b',-8,8);const c=a*b;
    const q=`Which expression is equivalent to ${a}(x ${b<0?'-':'+'} ${Math.abs(b)})?`;
    const right=`${a}x ${c<0?'-':'+'} ${Math.abs(c)}`;
    const choices=[right,`${a}x ${b<0?'-':'+'} ${Math.abs(b)}`,`${a+b}x`,`${a}x ${c<0?'+':'-'} ${Math.abs(c)}`];
    const rotate=n(seed+'r',0,3);const rotated=choices.slice(rotate).concat(choices.slice(0,rotate));
    return choiceItem(base,q,rotated,rotated.indexOf(right),'ALG.DISTRIBUTE.LINEAR')
  }
  function combine(seed,i){
    const base=`${seed}_p${i+1}`;const a=n(seed+'a',2,7),b=n(seed+'b',1,6),c=n(seed+'c',1,9),d=n(seed+'d',1,6);
    const coeff=a+b,constant=c-d;const q=`Which expression is equivalent to ${a}x + ${c} + ${b}x - ${d}?`;
    const right=`${coeff}x ${constant<0?'-':'+'} ${Math.abs(constant)}`;
    const choices=[right,`${a+b+c-d}x`,`${a}x ${constant<0?'-':'+'} ${Math.abs(constant)}`,`${coeff+1}x ${constant<0?'-':'+'} ${Math.abs(constant)}`];
    const rotate=n(seed+'r',0,3);const rotated=choices.slice(rotate).concat(choices.slice(0,rotate));
    return choiceItem(base,q,rotated,rotated.indexOf(right),'ALG.COMBINE.LINEAR')
  }
  function oneStep(seed,i){
    const base=`${seed}_p${i+1}`;const x=n(seed+'x',-8,9) || 4;
    if(i===0){const a=n(seed+'a',2,8),rhs=a*x;return freeItem(base,`Solve for x: ${a}x = ${rhs}`,x,'EQ.ONE.MULT')}
    if(i===1){const b=n(seed+'b',2,12),rhs=x+b;return freeItem(base,`Solve for x: x + ${b} = ${rhs}`,x,'EQ.ONE.ADD')}
    const d=n(seed+'d',2,7),lhs=x*d;return freeItem(base,`Solve for x: x ÷ ${d} = ${x}`,lhs,'EQ.ONE.DIV')
  }
  function twoStep(seed,i){
    const base=`${seed}_p${i+1}`;const x=n(seed+'x',-7,8) || 3;const a=n(seed+'a',2,6),b=n(seed+'b',1,10);const rhs=a*x+b;
    if(i===1){const rhs2=a*x-b;return freeItem(base,`Solve for x: ${a}x - ${b} = ${rhs2}`,x,'EQ.TWO.SUB')}
    return freeItem(base,`Solve for x: ${a}x + ${b} = ${rhs}`,x,'EQ.TWO.ADD')
  }
  function inequalities(seed,i){
    const base=`${seed}_p${i+1}`;const boundary=n(seed+'x',-5,8),b=n(seed+'b',2,9);
    if(i===0){const rhs=boundary+b,q=`Solve: x + ${b} > ${rhs}`;const right=`x > ${boundary}`;const choices=[right,`x < ${boundary}`,`x > ${rhs}`,`x ≥ ${boundary}`];const r=n(seed+'r',0,3),rot=choices.slice(r).concat(choices.slice(0,r));return choiceItem(base,q,rot,rot.indexOf(right),'INEQ.ONE.ADD')}
    if(i===1){const rhs=boundary-b,q=`Solve: x - ${b} ≤ ${rhs}`;const right=`x ≤ ${boundary}`;const choices=[right,`x ≥ ${boundary}`,`x < ${rhs}`,`x ≤ ${rhs}`];const r=n(seed+'r',0,3),rot=choices.slice(r).concat(choices.slice(0,r));return choiceItem(base,q,rot,rot.indexOf(right),'INEQ.ONE.SUB')}
    const a=-n(seed+'a',2,6),rhs=a*boundary,q=`Solve: ${a}x > ${rhs}`;const right=`x < ${boundary}`;const choices=[right,`x > ${boundary}`,`x ≤ ${boundary}`,`x < ${rhs}`];const r=n(seed+'r',0,3),rot=choices.slice(r).concat(choices.slice(0,r));return choiceItem(base,q,rot,rot.indexOf(right),'INEQ.NEGATIVE.FLIP')
  }

  const GENERATORS={
    'MATH.INTEGER_OPS':integerOps,
    'MATH.DISTRIBUTIVE':distributive,
    'MATH.COMBINE_LIKE_TERMS':combine,
    'MATH.ONE_STEP_EQUATIONS':oneStep,
    'MATH.TWO_STEP_EQUATIONS':twoStep,
    'MATH.INTRO_INEQUALITIES':inequalities
  };

  function generateDiagnostic(skillId,sessionId){
    if(!GENERATORS[skillId])throw new Error(`Unknown Track A skill: ${skillId}`);
    return [0,1,2].map(i=>GENERATORS[skillId](`${sessionId}_${skillId}_${i}`,i));
  }
  function normalizeNumeric(raw){
    const s=String(raw??'').trim().toLowerCase().replace(/\s+/g,'');
    const stripped=s.replace(/^x=/,'');
    return /^-?\d+(?:\.\d+)?$/.test(stripped)?Number(stripped):null;
  }
  function checkAnswer(item,raw,choiceIndex=null){
    if(Array.isArray(item.choices))return Number(choiceIndex)===item.answer;
    const got=normalizeNumeric(raw),want=normalizeNumeric(item.free);
    return got!==null&&want!==null&&Math.abs(got-want)<1e-9;
  }
  function fingerprint(item){return String(item.q).trim().toLowerCase().replace(/\s+/g,' ')}
  function prerequisiteOf(skillId){return SKILL_MAP.get(skillId)?.prereq??null}
  function skill(skillId){return SKILL_MAP.get(skillId)||null}

  const api={SKILLS,SKILL_MAP,generateDiagnostic,checkAnswer,fingerprint,prerequisiteOf,skill};
  if(typeof window!=='undefined')window.LEVEL_UP_TRACK_A_DIAGNOSTIC=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_DIAGNOSTIC=api;
})();
