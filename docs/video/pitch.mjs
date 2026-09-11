// Lotline pitch — native Higgsedit 0.14.0 composition.
// Run: higgsedit build pitch.mjs ; higgsedit render project --out renders/lotline-pitch.mp4
// All displayed UI is captured from Lotline's explicitly labeled Example mode.
async function buildPitch({ project, frame, text, rect, media }) {
  const p = await project({ dir: "project", size: "1920x1080", fps: 30, background: "#F7F7F2" });
  const C = { paper:"#F7F7F2", green:"#174D3C", ink:"#18211D", mute:"#56645A", line:"#DDE4DB", mint:"#C8DDBC", white:"#FFFFFF" };
  const a = await p.add("../media/home-crop.png");
  const b = await p.add("../media/results-crop.png");
  const c = await p.add("../media/handoff-crop.png");
  const d = await p.add("../media/planner-crop.png");
  const e = await p.add("../media/mobile-crop.png");
  // User-selected Ainsley voice, generated at neutral speed in Higgsfield.
  // Scene takes are placed at natural speed; only the fifth take's trailing silence is trimmed.
  const narrationTakes = [
    {
      "file": "voice01.wav",
      "at": 0.6,
      "from": 0,
      "duration": 8.47
    },
    {
      "file": "voice02.wav",
      "at": 12,
      "from": 0,
      "duration": 8.18
    },
    {
      "file": "voice03.wav",
      "at": 22.5,
      "from": 0,
      "duration": 8.18
    },
    {
      "file": "voice04.wav",
      "at": 32.4,
      "from": 0,
      "duration": 8.18
    },
    {
      "file": "voice05.wav",
      "at": 41.7,
      "from": 0,
      "duration": 5.65
    },
    {
      "file": "voice06.wav",
      "at": 48.8,
      "from": 0,
      "duration": 4.4
    }
  ];
  for (const take of narrationTakes) {
    const voice = await p.add("../voices/" + take.file);
    p.cut(voice, { at: take.at, from: take.from, dur: take.duration });
  }
  const t = (s,x,y,w,size=48,color=C.ink,extra={}) => text(s,{x,y,width:w,height:size*1.5,fontFamily:"Inter",fontSize:size,fontWeight:600,color,...extra});
  const mono = (s,x,y,w,size=62,color=C.green,extra={}) => t(s,x,y,w,size,color,{fontFamily:"JetBrains Mono",fontWeight:700,...extra});
  const line = (x,y,w,color=C.line) => rect({x,y,width:w,height:2,fill:color});
  const pop = (x,y,w,h,children,delay=0) => frame({x,y,width:w,height:h,layout:"none",at:delay,motion:{enter:{from:{y:22,opacity:0},duration:.55,easing:"house"}}},children);
  const logo = (x,y,s=3,color=C.green,animate=false) => [
    ...[[6,16,9],[14,11,14],[22,6,19]].map(([bx,by,h],i)=>rect({x:x+bx*s,y:y+by*s,width:4*s,height:h*s,radius:1.2*s,fill:color,...(animate?{animate:[{property:"opacity",from:0,to:1,at:.15+i*.16,duration:.4},{property:"offsetY",from:26,to:0,at:.15+i*.16,duration:.6,easing:"house"}]}:{})})),
    rect({x:x+4.5*s,y:y+27*s,width:23*s,height:s,fill:color,radius:s/2})
  ];
  const bar = (at,dur,name,children,dark=false) => {
    p.compose(frame({width:1920,height:1080,layout:"none",background:dark?C.green:C.paper},children),{at,dur,name});
  };
  const top = (chapter,dark=false) => [...logo(90,54,1.8,dark?C.paper:C.green),t("LOTLINE",158,68,250,23,dark?C.paper:C.green,{letterSpacing:3}),t(chapter,1100,68,725,23,dark?"#D3E1D3":C.mute,{align:"right",fontWeight:400}),line(96,124,1728,dark?"#427160":C.line)];
  const caption = (s,dark=false) => t(s,180,973,1560,27,dark?"#E3EBDE":C.mute,{align:"center",fontWeight:400});

  bar(0,4,"01 · Brand",[
    ...logo(245,290,12,C.green,true),
    pop(690,340,1050,300,[t("Lotline.",0,0,950,140,C.green,{letterSpacing:-7}),t("A little clarity for your next contribution.",8,196,1070,33,C.mute,{fontWeight:400})],.3),
    line(270,852,1380),
    t("YOUR ASSETS. YOUR PERCENTAGES.",270,891,1380,24,C.mute,{align:"center",letterSpacing:3,fontWeight:400})
  ]);
  bar(4,7,"02 · The product",[
    ...top("A CLEAR PLAN FOR YOUR NEXT CONTRIBUTION"),
    pop(96,187,610,600,[
      t("Your next",0,25,580,83,C.ink,{letterSpacing:-4}),
      t("contribution.",0,127,590,83,C.green,{letterSpacing:-4}),
      t("One clear plan.",0,270,590,48,C.ink,{letterSpacing:-2}),
      t("Choose xStocks on Solana.",0,366,570,30,C.mute,{fontWeight:400}),
      t("See how your USDC adds up.",0,413,590,30,C.mute,{fontWeight:400}),
      rect({x:0,y:517,width:292,height:67,fill:C.green,radius:14}),
      t("Make a plan  →",25,531,247,28,C.white)
    ]),
    pop(746,204,1080,675,[
      rect({x:0,y:0,width:1080,height:675,fill:C.white,radius:24,strokeColor:C.line,strokeWidth:2}),
      media({file:a,x:16,y:16,width:1048,height:643,fit:"contain",radius:12})
    ],.18),
    caption("Actual Lotline screen · illustrative assets and amounts")
  ]);
  const rows=[{symbol:"AAPLx",weight:"50%",amount:"5.000001",share:.5,color:C.green},{symbol:"MSFTx",weight:"30%",amount:"3.000000",share:.3,color:"#7D9C86"},{symbol:"NVDAx",weight:"20%",amount:"2.000000",share:.2,color:C.mint}];
  bar(11,11,"03 · Exact contribution",[
    ...top("YOUR SPLIT. EXACT TO THE MICRO-USDC."),
    pop(100,196,780,570,[
      t("Start with a budget.",0,0,800,56,C.ink,{letterSpacing:-2}),
      mono("10.000001",0,116,850,101,C.green,{letterSpacing:-5}),
      t("USDC",4,257,400,30,C.mute,{letterSpacing:2}),
      t("You choose the percentages.",0,383,775,32,C.ink,{fontWeight:400}),
      t("Every micro-USDC is accounted for.",0,441,785,30,C.mute,{fontWeight:400}),
      t("Illustrative allocation · not an investment recommendation",0,590,780,23,C.mute,{fontWeight:400})
    ]),
    ...rows.map((r,i)=>pop(980,205+i*215,838,190,[
      rect({x:0,y:0,width:838,height:190,fill:C.white,radius:20,strokeColor:C.line,strokeWidth:2}),
      t(r.symbol,30,23,310,29,C.ink), t(r.weight,576,23,220,29,C.mute,{align:"right"}),
      mono(r.amount,30,74,660,54,C.green),t("USDC",689,106,120,22,C.mute,{fontWeight:400}),
      rect({x:30,y:158,width:778,height:7,fill:"#E7EDE3",radius:3}),
      rect({x:30,y:158,width:778*r.share,height:7,fill:r.color,radius:3,animate:[{property:"scaleX",from:.01,to:1,at:.3,duration:.7,easing:"house"}]})
    ],.3+i*.3)),
    caption("5.000001 + 3.000000 + 2.000000 = 10.000001 USDC")
  ]);
  bar(22,10,"04 · Units in context",[
    ...top("CURRENT UNITS → CONTRIBUTION → ESTIMATED AFTER"),
    t("A clear view of what comes next.",96,179,1720,59,C.ink,{letterSpacing:-2}),
    pop(410,287,1100,630,[
      rect({x:0,y:0,width:1100,height:630,fill:C.white,radius:22,strokeColor:C.line,strokeWidth:2}),
      media({file:b,x:12,y:12,width:1076,height:606,fit:"contain",radius:12})
    ],.15),
    caption("Example mode shown · synthetic 1,000 USDC plan · onchain scaling honored in Live")
  ]);
  bar(32,9,"05 · Take the plan with you",[
    ...top("COPY. EXPORT. REVIEW."),
    pop(100,186,615,650,[
      t("Ready when",0,8,590,74,C.ink,{letterSpacing:-3}),
      t("you are.",0,103,600,74,C.green,{letterSpacing:-3}),
      t("01  Copy the plan",0,266,610,33,C.ink),
      t("02  Download the CSV",0,340,610,33,C.ink),
      t("03  Review on Jupiter",0,414,610,33,C.ink),
      t("You decide what happens next.",0,556,620,27,C.mute,{fontWeight:400})
    ]),
    pop(740,233,1080,635,[
      rect({x:0,y:0,width:1080,height:635,fill:C.white,radius:22,strokeColor:C.line,strokeWidth:2}),
      media({file:c,x:20,y:32,width:1040,height:540,fit:"contain",radius:12})
    ],.16),
    caption("Review current amounts and fees on Jupiter before trading")
  ]);
  bar(41,7,"06 · Every screen",[
    ...top("A FOCUSED WORKSPACE"),
    t("Your plan, wherever you are.",96,182,1720,65,C.ink,{letterSpacing:-3}),
    pop(96,300,1150,591,[
      rect({x:0,y:0,width:1150,height:591,fill:C.white,radius:22,strokeColor:C.line,strokeWidth:2}),
      media({file:d,x:15,y:15,width:1120,height:561,fit:"contain",radius:12})
    ],.1),
    pop(1390,283,331,630,[
      rect({x:-11,y:-11,width:353,height:652,fill:C.ink,radius:40}),
      media({file:e,x:0,y:0,width:331,height:630,fit:"cover",radius:29})
    ],.25),
    caption("Mobile and desktop · start without an account · Example screens shown")
  ]);
  bar(48,6,"07 · Call to action",[
    ...logo(105,262,9,C.paper,true),
    t("Lotline.",438,283,1310,146,C.paper,{letterSpacing:-6}),
    pop(443,498,1340,330,[
      t("A clear plan for your next",0,0,1310,66,C.paper,{letterSpacing:-2}),
      t("xStocks contribution.",0,91,1310,66,C.paper,{letterSpacing:-2}),
      rect({x:0,y:221,width:284,height:66,fill:C.paper,radius:13}),
      t("Make a plan  →",25,236,243,27,C.green)
    ],.2),
    t("github.com/operatoruplift/lotline",100,922,1720,28,"#D5E3D4",{align:"center",fontWeight:400}),
    t("Planning only. No transaction signing or execution.",100,982,1720,23,"#D5E3D4",{align:"center",fontWeight:400})
  ],true);
  await p.frame(17.5,"renders/allocation.png");
}

export default buildPitch;
