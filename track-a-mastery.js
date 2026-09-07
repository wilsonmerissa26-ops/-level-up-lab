(() => {
  const D=window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
  if(!D)throw new Error('Track A diagnostic bank must load before mastery generator.');

  function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function n(seed,min,max){return min+(hash(seed)%(max-min+1))}
  function freeItem(id,q,answer,templateId,transfer=false){return {id,template_id:templateId,template_version:'1.0.0',validated:true,q,free:String(answer),transfer}}
  function choiceItem(id,q,choices,answer,templateId,transfer=false){return {id,template_id:templateId,template_version:'1.0.0',validated:true,q,choices,answer,transfer}}

  function chooseFreshFromDiagnostic(skillId,sessionId,count,excludedFingerprints=[]){
    const excluded=new Set(excludedFingerprints||[]);const out=[];const seen=new Set(excluded);
    for(let attempt=0;attempt<30&&out.length<count;attempt++){
      const batch=D.generateDiagnostic(skillId,`${sessionId}_ret_${attempt}`);
      for(const item of batch){const fp=D.fingerprint(item);if(seen.has(fp))continue;seen.add(fp);out.push({...item,id:`${sessionId}_ret_${out.length+1}_${item.template_id.replace(/[^A-Z0-9]/gi,'_')}`,transfer:false});if(out.length===count)break}
    }
    if(out.length!==count)throw new Error(`Could not generate ${count} fresh retention items for ${skillId}.`);
    return out;
  }

  function transferInteger(seed,i){const start=-n(seed+'s',2,14),change=i===0?n(seed+'c',5,18):-n(seed+'c',3,12);return freeItem(`${seed}_t${i+1}`,`A temperature starts at ${start}°F and changes by ${change}°F. What is the new temperature?`,start+change,'TRANSFER.INT.TEMP',true)}
  function transferDistributive(seed,i){const k=n(seed+'k',2,7),c=n(seed+'c',2,9);const right=`${k}x + ${k*c}`;const q=`A game awards ${k}(x + ${c}) bonus points. Which expression shows the same total bonus?`;const choices=[right,`${k}x + ${c}`,`${k+c}x`,`${k}x - ${k*c}`];const r=n(seed+'r',0,3),rot=choices.slice(r).concat(choices.slice(0,r));return choiceItem(`${seed}_t${i+1}`,q,rot,rot.indexOf(right),'TRANSFER.DISTRIBUTE.GAME',true)}
  function transferCombine(seed,i){const a=n(seed+'a',2,6),b=n(seed+'b',2,6),c=n(seed+'c',1,8),d=n(seed+'d',1,6);const coeff=a+b,constant=c-d;const right=`${coeff}x ${constant<0?'-':'+'} ${Math.abs(constant)}`;const q=`A player scores ${a}x + ${c} points in one round and ${b}x - ${d} in another. Which expression represents the total?`;const choices=[right,`${a+b+c-d}x`,`${coeff+1}x ${constant<0?'-':'+'} ${Math.abs(constant)}`,`${a}x + ${b+c-d}`];const r=n(seed+'r',0,3),rot=choices.slice(r).concat(choices.slice(0,r));return choiceItem(`${seed}_t${i+1}`,q,rot,rot.indexOf(right),'TRANSFER.COMBINE.SCORE',true)}
  function transferOneStep(seed,i){const packs=n(seed+'p',2,7),each=n(seed+'e',3,12),total=packs*each;return freeItem(`${seed}_t${i+1}`,`${packs} identical packs hold ${total} items total. How many items are in each pack?`,each,'TRANSFER.EQ.ONE.PACKS',true)}
  function transferTwoStep(seed,i){const rate=n(seed+'r',2,8),hours=n(seed+'h',2,9),fee=n(seed+'f',3,12),total=fee+rate*hours;return freeItem(`${seed}_t${i+1}`,`A rental costs a $${fee} starting fee plus $${rate} per hour. The total is $${total}. How many hours was it rented?`,hours,'TRANSFER.EQ.TWO.RENTAL',true)}
  function transferInequality(seed,i){const have=n(seed+'h',2,10),per=n(seed+'p',2,6),levels=n(seed+'l',2,7),need=have+per*levels-1;const q=`Michael has ${have} points and earns ${per} points per level. He needs at least ${need} points. What is the least whole number of additional levels he needs?`;const least=Math.ceil((need-have)/per);return freeItem(`${seed}_t${i+1}`,q,least,'TRANSFER.INEQ.GOAL',true)}

  const TRANSFER={
    'MATH.INTEGER_OPS':transferInteger,
    'MATH.DISTRIBUTIVE':transferDistributive,
    'MATH.COMBINE_LIKE_TERMS':transferCombine,
    'MATH.ONE_STEP_EQUATIONS':transferOneStep,
    'MATH.TWO_STEP_EQUATIONS':transferTwoStep,
    'MATH.INTRO_INEQUALITIES':transferInequality
  };

  function generateRetention(skillId,checkpoint,sessionId,excludedFingerprints=[]){return chooseFreshFromDiagnostic(skillId,`${sessionId}_${checkpoint.replace(/\s+/g,'_')}`,2,excludedFingerprints)}
  function generateTransfer(skillId,sessionId,excludedFingerprints=[]){
    const gen=TRANSFER[skillId];if(!gen)throw new Error(`No transfer generator for ${skillId}.`);const excluded=new Set(excludedFingerprints||[]);const out=[];
    for(let attempt=0;attempt<20&&out.length<2;attempt++){
      for(let i=0;i<2&&out.length<2;i++){const item=gen(`${sessionId}_xfer_${attempt}_${i}`,i);const fp=D.fingerprint(item);if(excluded.has(fp)||out.some(x=>D.fingerprint(x)===fp))continue;out.push(item)}
    }
    if(out.length!==2)throw new Error(`Could not generate two fresh transfer items for ${skillId}.`);return out;
  }

  const api={generateRetention,generateTransfer};window.LEVEL_UP_TRACK_A_MASTERY=api;if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_MASTERY=api;
})();
