window.LEVEL_UP_CONTENT = {
  student:{id:"michael",name:"Michael",grade:"8",school:"Murphy Middle School"},
  tracks:{A:{name:"Track A",description:"Controlled diagnostic + mastery evidence"},B:{name:"Track B",description:"Immediate teaching + recovery"}},
  science:[
    {
      id:"SCI.SPS7A.ENERGY_FORMS", title:"Energy Basics + Forms", schoolTag:"7a foundation", minutes:"8–12 min",
      teach:[
        ["Energy is the ability to cause change or do work.","Think of energy as what makes things move, heat up, light up, make sound, or change."],
        ["Key forms: kinetic, potential, thermal, chemical, electrical, radiant, sound, and nuclear.","We learn the forms first so transfer and transformation make sense later."]
      ],
      checks:[
        {id:"e1",q:"A moving football has which form of energy because it is moving?",choices:["Kinetic","Chemical","Nuclear","Radiant"],answer:0,why:"Kinetic energy is energy of motion."},
        {id:"e2",q:"Energy stored in food is mainly which form?",choices:["Chemical","Sound","Radiant","Kinetic"],answer:0,why:"Food stores chemical energy."},
        {id:"e3",q:"Sunlight reaching Earth is mainly which form?",choices:["Radiant","Mechanical","Chemical","Sound"],answer:0,why:"Light from the Sun is radiant energy."}
      ]
    },
    {
      id:"SCI.SPS7A.TRANSFER_TRANSFORMATION", title:"Transfer vs Transformation", schoolTag:"7a Energy Transformations", minutes:"8–12 min", prereq:"SCI.SPS7A.ENERGY_FORMS",
      teach:[
        ["Transfer means energy moves from one object or place to another.","The form can stay the same while the energy moves."],
        ["Transformation means energy changes from one form to another.","Example: electrical energy changes into thermal energy in a toaster."]
      ],
      checks:[
        {id:"tt1",q:"A warm mug heats your colder hand. Which best fits the school classification?",choices:["Transfer","Transformation"],answer:0,why:"Thermal energy moves from the mug to the hand."},
        {id:"tt2",q:"A solar panel changes sunlight into electricity. Which best fits?",choices:["Transfer","Transformation"],answer:1,why:"Radiant energy changes into electrical energy."},
        {id:"tt3",q:"An electric fan uses electricity to spin its blades. Which best fits?",choices:["Transfer","Transformation"],answer:1,why:"Electrical energy changes into mechanical motion."}
      ]
    },
    {
      id:"SCI.SPS7B.MECHANICAL", title:"Kinetic, Potential + Mechanical", schoolTag:"7b", minutes:"8–12 min", prereq:"SCI.SPS7A.TRANSFER_TRANSFORMATION",
      teach:[
        ["Kinetic energy is energy of motion. Potential energy is stored because of position or condition.","A flying football has kinetic energy. A ball held high has gravitational potential energy."],
        ["Mechanical energy is the total of kinetic and potential energy.","On a roller coaster, energy shifts between these forms."]
      ],
      checks:[
        {id:"m1",q:"A coaster stopped at the top of the tallest hill has lots of…",choices:["Gravitational potential energy","Sound energy","Nuclear energy"],answer:0,why:"Its height stores gravitational potential energy."},
        {id:"m2",q:"As the coaster rolls downhill and speeds up, kinetic energy generally…",choices:["Increases","Disappears","Becomes nuclear"],answer:0,why:"More speed means more kinetic energy."},
        {id:"m3",q:"Mechanical energy combines…",choices:["Kinetic + potential","Thermal + sound","Electrical + chemical"],answer:0,why:"Mechanical energy is kinetic plus potential energy."}
      ]
    },
    {
      id:"SCI.SPS7C.HEAT_TRANSFER", title:"Conduction, Convection + Radiation", schoolTag:"7c", minutes:"10–12 min", prereq:"SCI.SPS7B.MECHANICAL",
      teach:[
        ["Conduction is heat transfer through direct contact.","A hot pan can heat a metal spoon touching it."],
        ["Convection is heat transfer by the movement of a fluid such as air or water.","Warm fluid rises and cool fluid sinks, creating a current."],
        ["Radiation transfers energy by electromagnetic waves and does not require direct contact.","You can feel heat from a campfire without touching it."]
      ],
      checks:[
        {id:"h1",q:"A metal spoon gets hot while sitting in soup. Which process?",choices:["Conduction","Convection","Radiation"],answer:0,why:"The spoon is heated through direct contact."},
        {id:"h2",q:"Warm air rises while cooler air sinks. Which process?",choices:["Conduction","Convection","Radiation"],answer:1,why:"Moving air carries thermal energy in a convection current."},
        {id:"h3",q:"You feel heat from a campfire without touching it. Which process?",choices:["Conduction","Convection","Radiation"],answer:2,why:"Radiation can move energy across space without direct contact."}
      ]
    },
    {
      id:"SCI.SPS7D.PARTICLE_MOTION", title:"Heat + Particle Motion", schoolTag:"7d", minutes:"8–12 min", prereq:"SCI.SPS7C.HEAT_TRANSFER",
      teach:[
        ["Temperature is related to the average kinetic energy of particles.","When temperature rises, particles generally move or vibrate faster."],
        ["When matter cools, average particle motion slows.","Particles do not simply stop because something cools down."]
      ],
      checks:[
        {id:"p1",q:"A substance heats up. What usually happens to average particle motion?",choices:["It speeds up","It stops","It becomes electrical"],answer:0,why:"Higher temperature means greater average particle kinetic energy."},
        {id:"p2",q:"A gas cools from 80°C to 30°C. Its average kinetic energy becomes…",choices:["Lower","Higher","Exactly zero"],answer:0,why:"Cooling lowers average particle kinetic energy."},
        {id:"p3",q:"A solid is heated but does not melt. Its particles generally…",choices:["Vibrate faster around their positions","Stop moving","Move freely like a gas"],answer:0,why:"Particles in a heated solid vibrate more rapidly."}
      ]
    },
    {
      id:"SCI.SPS7E.CONCEPT", title:"Specific Heat Concept", schoolTag:"7e-A", minutes:"8–12 min", prereq:"SCI.SPS7D.PARTICLE_MOTION",
      teach:[
        ["Specific heat tells how much energy a substance needs to change the temperature of a certain mass by 1°C.","High specific heat means more energy is needed for the same temperature change."],
        ["If two equal masses receive the same heat, the one whose temperature changes less has the higher specific heat.","That substance changes temperature more slowly."]
      ],
      checks:[
        {id:"s1",q:"Two equal masses receive equal heat. Sample A changes temperature less. Which has higher specific heat?",choices:["Sample A","Sample B","They must be equal"],answer:0,why:"Less temperature change from the same heat means higher specific heat."},
        {id:"s2",q:"High specific heat means a substance needs…",choices:["More energy for the same temperature change","No energy to warm up","Less mass"],answer:0,why:"Specific heat measures energy needed per mass per degree."},
        {id:"s3",q:"Equal masses get equal heat. The metal warms much more than the water. The metal likely has…",choices:["Lower specific heat","Higher specific heat","No specific heat"],answer:0,why:"A bigger temperature rise from the same heat suggests lower specific heat."}
      ]
    },
    {
      id:"SCI.SPS7E.SYMBOLS_UNITS", title:"Q, m, c + ΔT", schoolTag:"7e-B", minutes:"8–10 min", prereq:"SCI.SPS7E.CONCEPT",
      teach:[
        ["Q is heat energy transferred, usually measured in joules (J).","m is mass. c is specific heat capacity. ΔT is change in temperature."],
        ["ΔT means final temperature minus initial temperature.","The delta symbol means change in."]
      ],
      checks:[
        {id:"su1",q:"In Q = mcΔT, what does Q represent?",choices:["Heat energy transferred","Mass","Temperature change"],answer:0,why:"Q represents heat energy transferred."},
        {id:"su2",q:"In Q = mcΔT, what does m represent?",choices:["Mass","Mechanical energy","Minutes"],answer:0,why:"m represents mass."},
        {id:"su3",q:"In Q = mcΔT, what does ΔT represent?",choices:["Temperature change","Total energy","Time"],answer:0,why:"ΔT means change in temperature."}
      ]
    },
    {
      id:"SCI.SPS7E.DELTA_T", title:"Temperature Change ΔT", schoolTag:"7e-C", minutes:"8–10 min", prereq:"SCI.SPS7E.SYMBOLS_UNITS",
      teach:[
        ["Use ΔT = final temperature − initial temperature.","Example: 43°C − 18°C = 25°C."],
        ["A cooling problem can give a negative ΔT if final temperature is lower than initial temperature.","Keep the order final minus initial."]
      ],
      checks:[
        {id:"dt1",q:"A sample warms from 18°C to 43°C. What is ΔT?",free:"25",why:"43 − 18 = 25°C."},
        {id:"dt2",q:"A sample warms from 14°C to 39°C. What is ΔT?",free:"25",why:"39 − 14 = 25°C."},
        {id:"dt3",q:"A sample cools from 72°C to 50°C. Using final − initial, what is ΔT?",free:"-22",why:"50 − 72 = −22°C."}
      ]
    },
    {
      id:"SCI.SPS7E.FORMULA_SETUP", title:"Formula Setup", schoolTag:"7e-D", minutes:"10–12 min", prereq:"SCI.SPS7E.DELTA_T",
      teach:[
        ["The main relationship is Q = m × c × ΔT.","Before calculating, identify what each number means and compute ΔT if needed."],
        ["Setup first, arithmetic second.","That lets us tell whether a mistake is Science setup or Math calculation."]
      ],
      checks:[
        {id:"fs1",q:"Which equation matches heat energy, mass, specific heat, and temperature change?",choices:["Q = m × c × ΔT","Q = m + c + ΔT","Q = m ÷ c ÷ ΔT"],answer:0,why:"The heat equation is Q = mcΔT."},
        {id:"fs2",q:"m = 12 g, c = 0.50, temperature goes 20°C → 30°C. Which setup solves Q?",choices:["Q = 12 × 0.50 × 10","Q = 12 × 0.50 × 30","Q = 10 ÷ (12 × 0.50)"],answer:0,why:"ΔT is 10, so Q = 12 × 0.50 × 10."},
        {id:"fs3",q:"m = 8 g, c = 2, initial 15°C, final 25°C. Which three values belong in Q = mcΔT?",choices:["8, 2, 10","8, 2, 25","15, 25, 10"],answer:0,why:"Mass 8, c 2, ΔT 10."}
      ]
    },
    {
      id:"SCI.SPS7E.LITERAL_REARRANGE", title:"Science Formula Rearrangement", schoolTag:"7e-E", minutes:"10–12 min", prereq:"MATH.LITERAL_EQUATIONS",
      teach:[
        ["Rearranging a Science formula uses the same inverse-operation idea as literal equations.","We only start this after the Math Bridge shows the prerequisite is ready."],
        ["To isolate a variable, undo the operations around it.","For Q = mcΔT, solving for c means divide both sides by mΔT."]
      ],
      checks:[
        {id:"lr1",q:"Using Q = m × c × ΔT, solve for c.",choices:["c = Q ÷ (m × ΔT)","c = Q × m × ΔT","c = m × ΔT ÷ Q"],answer:0,why:"Divide both sides by m × ΔT."},
        {id:"lr2",q:"Using Q = m × c × ΔT, solve for m.",choices:["m = Q ÷ (c × ΔT)","m = Q × c × ΔT","m = c × ΔT ÷ Q"],answer:0,why:"Divide both sides by c × ΔT."},
        {id:"lr3",q:"Using Q = m × c × ΔT, solve for ΔT.",choices:["ΔT = Q ÷ (m × c)","ΔT = Q × m × c","ΔT = m × c ÷ Q"],answer:0,why:"Divide both sides by m × c."}
      ]
    },
    {
      id:"SCI.SPS7E.CALCULATION", title:"Specific Heat Calculations", schoolTag:"7e-F", minutes:"10–12 min", prereq:"SCI.SPS7E.LITERAL_REARRANGE",
      teach:[
        ["For Q = mcΔT, multiply m × c × ΔT when Q is the unknown.","If another variable is unknown, rearrange first, then calculate."],
        ["Keep the stages separate: identify values → arrange formula → calculate → check units.","That makes mistakes easier to diagnose and repair."]
      ],
      checks:[
        {id:"c1",q:"Use Q = mcΔT. m = 10, c = 2, ΔT = 5. What is Q?",free:"100",why:"10 × 2 × 5 = 100 J."},
        {id:"c2",q:"Use Q = mcΔT. m = 8, c = 1.5, ΔT = 10. What is Q?",free:"120",why:"8 × 1.5 × 10 = 120 J."},
        {id:"c3",q:"If Q = 480, m = 12, ΔT = 20 and c = Q ÷ (mΔT), what is c?",free:"2",why:"480 ÷ (12 × 20) = 2 J/g°C."}
      ]
    }
  ],
  math:[
    {
      id:"MATH.INVERSE_OPERATIONS", title:"Numeric Inverse Operations", schoolTag:"Math bridge floor", minutes:"8–10 min",
      teach:[
        ["Inverse operations undo each other.","Multiplication and division are opposites. Addition and subtraction are opposites."],
        ["The goal is to isolate x.","Do the opposite operation to both sides."]
      ],
      checks:[
        {id:"mi1",q:"Solve 3x = 12.",free:"4",why:"Divide both sides by 3. x = 4."},
        {id:"mi2",q:"Solve x ÷ 5 = 7.",free:"35",why:"Multiply both sides by 5. x = 35."},
        {id:"mi3",q:"Solve x + 8 = 21.",free:"13",why:"Subtract 8 from both sides. x = 13."}
      ]
    },
    {
      id:"MATH.LITERAL_EQUATIONS", title:"Literal Equations", schoolTag:"Math 3g/3h bridge", minutes:"10–12 min", prereq:"MATH.INVERSE_OPERATIONS",
      teach:[
        ["A literal equation uses several letters, but the goal is still to isolate the letter you were asked for.","Treat the other letters like known values written as symbols."],
        ["Undo operations in reverse order.","Example: d = rt. To solve for t, divide both sides by r: t = d ÷ r."]
      ],
      checks:[
        {id:"ml1",q:"Solve d = r × t for t.",choices:["t = d ÷ r","t = r ÷ d","t = d × r"],answer:0,why:"Divide both sides by r."},
        {id:"ml2",q:"Solve V = I × R for R.",choices:["R = V ÷ I","R = I ÷ V","R = V × I"],answer:0,why:"Divide both sides by I."},
        {id:"ml3",q:"Solve y = mx + b for x.",choices:["x = (y − b) ÷ m","x = (y + b) ÷ m","x = y − (b ÷ m)"],answer:0,why:"Subtract b, then divide by m."}
      ]
    }
  ]
};
