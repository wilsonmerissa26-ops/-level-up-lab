(() => {
  const D=window.LEVEL_UP_TRACK_A_DIAGNOSTIC;
  if(!D)throw new Error('Track A diagnostic bank must load before remediation module.');

  const REPAIRS=Object.freeze({
    'MATH.INTEGER_OPS':{
      title:'Integer Operations Repair',
      component:'signed-number operation rules',
      teach:[
        ['Addition with signs','Same signs: add the amounts and keep the sign. Different signs: subtract the smaller absolute value from the larger and keep the sign of the larger absolute value.'],
        ['Subtraction','Rewrite subtraction as adding the opposite, then use the addition rule.'],
        ['Multiplication','Same signs give a positive product. Different signs give a negative product.']
      ]
    },
    'MATH.DISTRIBUTIVE':{
      title:'Distributive Property Repair',
      component:'multiplying every term inside parentheses',
      teach:[
        ['Distribute to every term','The number outside the parentheses multiplies every term inside, not just the first one.'],
        ['Keep variable and constant parts separate','For 4(x + 3), multiply 4 by x and 4 by 3: 4x + 12.']
      ]
    },
    'MATH.COMBINE_LIKE_TERMS':{
      title:'Combining Like Terms Repair',
      component:'identifying and combining matching variable terms',
      teach:[
        ['Like terms must match','x-terms combine with x-terms. Plain numbers combine with plain numbers.'],
        ['Combine coefficients','3x + 2x becomes 5x. Keep the variable after combining the number parts.']
      ]
    },
    'MATH.ONE_STEP_EQUATIONS':{
      title:'One-Step Equation Repair',
      component:'inverse operations in one-step equations',
      teach:[
        ['Undo the operation','Use the inverse operation to isolate x. Addition undoes subtraction, and multiplication undoes division.'],
        ['Keep both sides balanced','Whatever operation you use on one side of the equation, use it on the other side too.']
      ]
    },
    'MATH.TWO_STEP_EQUATIONS':{
      title:'Two-Step Equation Repair',
      component:'reversing two operations in the correct order',
      teach:[
        ['Undo addition or subtraction first','For 2x + 5 = 17, subtract 5 before dividing by 2.'],
        ['Then undo multiplication or division','After the constant is removed, isolate x with the inverse operation on the coefficient.']
      ]
    },
    'MATH.INTRO_INEQUALITIES':{
      title:'Inequality Repair',
      component:'solving and reversing the inequality when multiplying or dividing by a negative',
      teach:[
        ['Solve like an equation','Use inverse operations to isolate x.'],
        ['Negative multiply/divide rule','If you multiply or divide both sides by a negative number, reverse the inequality sign.']
      ]
    }
  });

  function repair(skillId){return REPAIRS[skillId]||null}
  function generateComponentChecks(skillId,sessionId){
    if(!repair(skillId))throw new Error(`No remediation content for ${skillId}.`);
    const batch=D.generateDiagnostic(skillId,`${sessionId}_repair_check`);
    return batch.slice(0,2).map((item,i)=>({...item,id:`${sessionId}_repair_${i+1}`,interaction_purpose:'PRACTICE'}));
  }

  const api={REPAIRS,repair,generateComponentChecks};
  window.LEVEL_UP_TRACK_A_REMEDIATION=api;
  if(typeof globalThis!=='undefined')globalThis.LEVEL_UP_TRACK_A_REMEDIATION=api;
})();
