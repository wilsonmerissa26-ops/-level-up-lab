(() => {
  const SKILL_IDS = Object.freeze([
    "SCI.SPS7A.ENERGY_FORMS",
    "SCI.SPS7A.TRANSFER_TRANSFORMATION",
    "SCI.SPS7B.MECHANICAL",
    "SCI.SPS7C.HEAT_TRANSFER",
    "SCI.SPS7D.PARTICLE_MOTION",
    "SCI.SPS7E.CONCEPT",
    "SCI.SPS7E.SYMBOLS_UNITS",
    "SCI.SPS7E.DELTA_T",
    "SCI.SPS7E.FORMULA_SETUP",
    "SCI.SPS7E.LITERAL_REARRANGE",
    "SCI.SPS7E.CALCULATION",
    "MATH.INVERSE_OPERATIONS",
    "MATH.LITERAL_EQUATIONS"
  ]);

  function hash(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return h>>>0;
  }
  function rng(seed){
    let a=seed>>>0;
    return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}
  }
  function pick(list,r){return list[Math.floor(r()*list.length)]}
  function shuffle(list,r){
    const a=[...list];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    return a;
  }
  function choice(prompt,correct,distractors,r,extra={}){
    const pool=[correct,...distractors].filter((v,i,a)=>a.indexOf(v)===i);
    const choices=shuffle(pool,r);
    return {q:prompt,choices,answer:choices.indexOf(correct),why:extra.why||"",transfer:!!extra.transfer};
  }
  function free(prompt,answer,why,extra={}){return {q:prompt,free:String(answer),why,transfer:!!extra.transfer}}
  function day21(windowLabel,index){return windowLabel==="Day 21" && index===2}

  const generators={
    "SCI.SPS7A.ENERGY_FORMS":(r,w)=>{
      const moving=pick(["a skateboard rolling down a sidewalk","a football flying through the air","a cyclist moving down the street"],r);
      const stored=pick(["a stretched rubber band","a book resting on a high shelf","water held behind a dam"],r);
      const source=pick(["a battery before it powers a toy","food before a runner uses it","gasoline before it burns in an engine"],r);
      return [
        choice(`Which form of energy is most directly shown by ${moving}?`,"Kinetic energy",["Chemical energy","Nuclear energy","Radiant energy"],r,{why:"Motion is kinetic energy."}),
        choice(`Which form of energy is stored in ${stored}?`,"Potential energy",["Sound energy","Kinetic energy","Radiant energy"],r,{why:"Stored energy due to position or condition is potential energy."}),
        choice(`Which form of energy is stored in ${source}?`,"Chemical energy",["Sound energy","Radiant energy","Kinetic energy"],r,{why:"Batteries, food, and fuels store chemical energy.",transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7A.TRANSFER_TRANSFORMATION":(r,w)=>{
      const transfer=pick(["a hot baking sheet warms the cookie touching it","one moving billiard ball strikes another and the second ball moves","a warm hand melts an ice cube it is holding"],r);
      const transform=pick(["a lamp changes electrical energy into light","a blender changes electrical energy into motion","a speaker changes electrical energy into sound"],r);
      const mixed=pick(["a battery-powered flashlight turns on","a phone vibrates when a notification arrives","an electric drill spins its bit"],r);
      return [
        choice(`For the school classification, ${transfer}. Is this mainly transfer or transformation?`,"Transfer",["Transformation"],r,{why:"Energy moves between objects without the key form changing."}),
        choice(`For the school classification, ${transform}. Is this mainly transfer or transformation?`,"Transformation",["Transfer"],r,{why:"Energy changes from one form to another."}),
        choice(`For the school classification, ${mixed}. Which best describes the energy change?`,"Transformation",["Transfer"],r,{why:"The device changes stored or electrical energy into another form.",transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7B.MECHANICAL":(r,w)=>{
      const high=pick(["a roller coaster paused at the top of a hill","a rock held above the ground","a sled sitting at the top of a snowy slope"],r);
      return [
        choice(`${high} has a large amount of which energy because of its height?`,"Gravitational potential energy",["Sound energy","Chemical energy","Electrical energy"],r,{why:"Height stores gravitational potential energy."}),
        choice("A cart speeds up as it rolls downhill. What happens to its kinetic energy?","It increases",["It decreases","It becomes zero","It turns completely into chemical energy"],r,{why:"Greater speed means greater kinetic energy."}),
        choice("In a simple mechanical-energy model, which two forms are added together?","Kinetic + potential",["Thermal + sound","Chemical + electrical","Radiant + nuclear"],r,{why:"Mechanical energy combines kinetic and potential energy.",transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7C.HEAT_TRANSFER":(r,w)=>{
      const cond=pick(["your hand touches a cold metal railing","a pan handle heats up while attached to a hot pan","an ice cube cools the drink touching it"],r);
      const conv=pick(["warm water rises in a pot while cooler water sinks","heated air rises above a radiator while cooler air moves down","air circulates in a room because warmer air rises"],r);
      const rad=pick(["sunlight warms your skin","you feel heat from glowing coals without touching them","a heat lamp warms food from across a short distance"],r);
      return [
        choice(`Which heat-transfer process best explains this: ${cond}?`,"Conduction",["Convection","Radiation"],r,{why:"Conduction transfers thermal energy through direct contact."}),
        choice(`Which heat-transfer process best explains this: ${conv}?`,"Convection",["Conduction","Radiation"],r,{why:"Convection transfers thermal energy through moving fluids."}),
        choice(`Which heat-transfer process best explains this: ${rad}?`,"Radiation",["Conduction","Convection"],r,{why:"Radiation transfers energy by electromagnetic waves without direct contact.",transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7D.PARTICLE_MOTION":(r,w)=>[
      choice("A solid is warmed but stays solid. What happens to its particles on average?","They vibrate faster",["They stop moving","They turn into electrons","They move freely like a gas"],r,{why:"Heating increases average particle kinetic energy."}),
      choice("A gas cools. What happens to the average kinetic energy of its particles?","It decreases",["It increases","It becomes exactly zero","It becomes chemical energy"],r,{why:"Cooling lowers average particle kinetic energy."}),
      choice("Two samples of the same substance are at different temperatures. Which sample has faster average particle motion?","The warmer sample",["The cooler sample","They must move at the same speed","Temperature does not relate to particle motion"],r,{why:"Higher temperature means greater average particle kinetic energy.",transfer:day21(w,2)})
    ],
    "SCI.SPS7E.CONCEPT":(r,w)=>[
      choice("Equal masses of two substances absorb the same heat. Substance X changes temperature less. Which has the higher specific heat?","Substance X",["Substance Y","They must be equal","There is not enough information because mass is equal"],r,{why:"Less temperature change from the same heat means higher specific heat."}),
      choice("A material with a high specific heat generally needs what to change its temperature by the same amount?","More energy",["Less energy","No energy","Less mass"],r,{why:"High specific heat means more energy is required per unit mass per degree."}),
      choice("On a sunny day, equal masses of two materials receive similar energy. One warms much faster. What does that suggest about the faster-warming material?","It has a lower specific heat",["It has a higher specific heat","It has no specific heat","Specific heat cannot affect temperature change"],r,{why:"A larger temperature rise from similar energy suggests lower specific heat.",transfer:day21(w,2)})
    ],
    "SCI.SPS7E.SYMBOLS_UNITS":(r,w)=>[
      choice("In the heat equation Q = mcΔT, which symbol represents specific heat capacity?","c",["Q","m","ΔT"],r,{why:"c represents specific heat capacity."}),
      choice("Which unit best matches heat energy Q in these problems?","joules (J)",["grams (g)","degrees Celsius (°C)","J/g°C"],r,{why:"Q is heat energy, measured in joules."}),
      choice("Which unit best matches specific heat capacity c?","J/g°C",["J","g","°C"],r,{why:"Specific heat is energy per unit mass per degree of temperature change.",transfer:day21(w,2)})
    ],
    "SCI.SPS7E.DELTA_T":(r,w)=>{
      const i1=10+Math.floor(r()*20), d1=8+Math.floor(r()*18), f1=i1+d1;
      const i2=50+Math.floor(r()*30), d2=7+Math.floor(r()*20), f2=i2-d2;
      const i3=5+Math.floor(r()*25), d3=10+Math.floor(r()*25), f3=i3+d3;
      return [
        free(`A sample warms from ${i1}°C to ${f1}°C. Using final − initial, what is ΔT?`,d1,`${f1} − ${i1} = ${d1}°C.`),
        free(`A sample cools from ${i2}°C to ${f2}°C. Using final − initial, what is ΔT?`,-d2,`${f2} − ${i2} = −${d2}°C.`),
        free(`A liquid starts at ${i3}°C and ends at ${f3}°C. What temperature change should go into ΔT?`,d3,`${f3} − ${i3} = ${d3}°C.`,{transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7E.FORMULA_SETUP":(r,w)=>{
      const m1=5+Math.floor(r()*10), c1=1+Math.floor(r()*4), dt1=5+Math.floor(r()*10);
      const ti=10+Math.floor(r()*15), dt2=5+Math.floor(r()*12), tf=ti+dt2, m2=8+Math.floor(r()*12), c2=(1+Math.floor(r()*4))/2;
      return [
        choice(`If m = ${m1} g, c = ${c1} J/g°C, and ΔT = ${dt1}°C, which setup correctly finds Q?`,`Q = ${m1} × ${c1} × ${dt1}`,[`Q = ${m1} + ${c1} + ${dt1}`,`Q = ${dt1} ÷ (${m1} × ${c1})`],r,{why:"For Q, multiply m × c × ΔT."}),
        choice(`A ${m2} g sample with c = ${c2} warms from ${ti}°C to ${tf}°C. Which value should be used for ΔT?`,String(dt2),[String(tf),String(ti)],r,{why:`ΔT = ${tf} − ${ti} = ${dt2}°C.`}),
        choice(`A problem gives m = ${m2} g, c = ${c2} J/g°C, initial T = ${ti}°C, final T = ${tf}°C. Which three values belong directly in Q = mcΔT?`,`${m2}, ${c2}, ${dt2}`,[`${m2}, ${c2}, ${tf}`,`${ti}, ${tf}, ${dt2}`],r,{why:"Use mass, specific heat, and final-minus-initial temperature change.",transfer:day21(w,2)})
      ];
    },
    "SCI.SPS7E.LITERAL_REARRANGE":(r,w)=>[
      choice("Which expression isolates m in Q = mcΔT?","m = Q ÷ (cΔT)",["m = QcΔT","m = cΔT ÷ Q","m = Q − cΔT"],r,{why:"Divide both sides by cΔT."}),
      choice("Which expression isolates ΔT in Q = mcΔT?","ΔT = Q ÷ (mc)",["ΔT = Qmc","ΔT = mc ÷ Q","ΔT = Q − mc"],r,{why:"Divide both sides by mc."}),
      choice("A lab problem gives Q, m, and ΔT but asks for c. Which rearranged formula should be used?","c = Q ÷ (mΔT)",["c = QmΔT","c = mΔT ÷ Q","c = Q − mΔT"],r,{why:"Divide Q by m times ΔT to isolate c.",transfer:day21(w,2)})
    ],
    "SCI.SPS7E.CALCULATION":(r,w)=>{
      const m1=4+Math.floor(r()*7), c1=1+Math.floor(r()*4), dt1=3+Math.floor(r()*8), q1=m1*c1*dt1;
      const m2=5+Math.floor(r()*8), c2=2+Math.floor(r()*4), dt2=4+Math.floor(r()*7), q2=m2*c2*dt2;
      const m3=4+Math.floor(r()*8), c3=1+Math.floor(r()*4), dt3=5+Math.floor(r()*8), q3=m3*c3*dt3;
      return [
        free(`Use Q = mcΔT. If m = ${m1} g, c = ${c1} J/g°C, and ΔT = ${dt1}°C, what is Q?`,q1,`${m1} × ${c1} × ${dt1} = ${q1} J.`),
        free(`Use Q = mcΔT. If m = ${m2} g, c = ${c2} J/g°C, and ΔT = ${dt2}°C, what is Q?`,q2,`${m2} × ${c2} × ${dt2} = ${q2} J.`),
        free(`A sample absorbs ${q3} J. Its mass is ${m3} g and ΔT is ${dt3}°C. Using c = Q ÷ (mΔT), what is c?`,c3,`${q3} ÷ (${m3} × ${dt3}) = ${c3} J/g°C.`,{transfer:day21(w,2)})
      ];
    },
    "MATH.INVERSE_OPERATIONS":(r,w)=>{
      const a=2+Math.floor(r()*7), x=3+Math.floor(r()*8), product=a*x;
      const divisor=2+Math.floor(r()*7), quotient=3+Math.floor(r()*8), dividend=divisor*quotient;
      const add=4+Math.floor(r()*10), result=add+5+Math.floor(r()*10), x3=result-add;
      return [
        free(`Solve ${a}x = ${product}. What is x?`,x,`Divide both sides by ${a}. x = ${x}.`),
        free(`Solve x ÷ ${divisor} = ${quotient}. What is x?`,dividend,`Multiply both sides by ${divisor}. x = ${dividend}.`),
        free(`Solve x + ${add} = ${result}. What is x?`,x3,`Subtract ${add} from both sides. x = ${x3}.`,{transfer:day21(w,2)})
      ];
    },
    "MATH.LITERAL_EQUATIONS":(r,w)=>[
      choice("Solve F = ma for a.","a = F ÷ m",["a = m ÷ F","a = Fm","a = F − m"],r,{why:"Divide both sides by m."}),
      choice("Solve A = lw for w.","w = A ÷ l",["w = l ÷ A","w = Al","w = A − l"],r,{why:"Divide both sides by l."}),
      choice("Solve C = 2πr for r.","r = C ÷ (2π)",["r = 2πC","r = 2π ÷ C","r = C − 2π"],r,{why:"Divide both sides by 2π.",transfer:day21(w,2)})
    ]
  };

  function generateReview(skillId,windowLabel,reviewId){
    const generator=generators[skillId];
    if(!generator)throw new Error(`No review generator for ${skillId}`);
    const r=rng(hash(`${skillId}|${windowLabel}|${reviewId}`));
    const items=generator(r,windowLabel,reviewId);
    return items.map((item,index)=>({
      ...item,
      id:`${reviewId}_item_${index+1}`,
      skillId,
      reviewWindow:windowLabel,
      transfer:!!item.transfer
    }));
  }

  window.LEVEL_UP_REVIEW_ENGINE=Object.freeze({SKILL_IDS,generateReview});
})();
