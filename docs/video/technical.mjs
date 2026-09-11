// Lotline technical walkthrough — native Higgsedit 0.14.0.
// Build and render in the Higgsfield sandbox. All UI images show Example mode.
async function buildTechnical({ project, frame, text, rect, media }) {
  const p = await project({ dir: "project", size: "1920x1080", fps: 30, background: "#F7F7F2" });
  const C = { paper:"#F7F7F2", green:"#174D3C", ink:"#18211D", muted:"#56645A", line:"#DDE4DB", mint:"#C8DDBC", white:"#FFFFFF", amber:"#B88424" };
  const planner = await p.add("../media/planner-crop.png");
  const results = await p.add("../media/results-crop.png");
  const tx = (s,x,y,w,size=36,color=C.ink,extra={}) => text(s,{x,y,width:w,height:size*1.6,fontFamily:"Inter",fontSize:size,fontWeight:500,color,...extra});
  const mono = (s,x,y,w,size=36,color=C.green,extra={}) => tx(s,x,y,w,size,color,{fontFamily:"JetBrains Mono",...extra});
  const rule = (x,y,w,c=C.line) => rect({x,y,width:w,height:2,fill:c});
  const pop = (x,y,w,h,children,at=0) => frame({x,y,width:w,height:h,layout:"none",at,motion:{enter:{from:{y:18,opacity:0},duration:.48,easing:"house"}}},children);
  const mark = (x,y,s=2,c=C.green) => [
    ...[[6,16,9],[14,11,14],[22,6,19]].map(([bx,by,h])=>rect({x:x+bx*s,y:y+by*s,width:4*s,height:h*s,radius:s,fill:c})),
    rect({x:x+4.5*s,y:y+27*s,width:23*s,height:s,fill:c})
  ];
  const card = (x,y,w,h,nodes,at=0) => pop(x,y,w,h,[rect({width:w,height:h,fill:C.white,radius:20,strokeColor:C.line,strokeWidth:2}),...nodes],at);
  const chip = (s,x,y,w=380) => [rect({x,y,width:w,height:54,fill:"#E4EDDF",radius:12}),tx(s,x+20,y+10,w-40,23,C.green)];
  const darkCode = (lines,x=96,y=330,w=1728,size=31) => pop(x,y,w,lines.length*59+76,[
    rect({width:w,height:lines.length*59+76,fill:C.ink,radius:20}),
    ...lines.map((s,i)=>mono(s,30,30+i*59,w-60,size,"#DBEBD8"))
  ],.14);
  const scene = (at,dur,n,title,subtitle,nodes,footer) => {
    p.compose(frame({width:1920,height:1080,layout:"none",background:C.paper},[
      ...mark(90,45,1.8),tx("LOTLINE / ENGINEERING",158,60,650,23,C.green,{letterSpacing:2}),
      tx(String(n).padStart(2,"0")+" / 12",1550,60,270,23,C.muted,{align:"right"}),
      rule(96,116,1728),
      tx(title,96,162,1730,59,C.ink,{fontWeight:600,letterSpacing:-2}),
      tx(subtitle,98,255,1720,28,C.muted,{fontWeight:400}),
      ...nodes,
      rule(96,968,1728),
      tx(footer,98,995,1720,23,C.muted,{fontWeight:400}),
      rect({x:96,y:1057,width:1728,height:4,fill:C.line}),
      rect({x:96,y:1057,width:1728*((at+dur)/160),height:4,fill:C.green})
    ]),{at,dur,name:String(n).padStart(2,"0")+" · "+title});
  };

  scene(0,12,1,"Exact planning. Read-only by design.","Choose up to three verified Solana xStocks, a USDC budget, and percentages.",[
    card(96,345,660,548,[
      tx("Choose → estimate → review",30,28,600,34,C.green,{fontWeight:600}),
      tx("Read wallet balances",30,120,600,34),
      tx("Request contribution quotes",30,198,610,32),
      tx("Copy or export the plan",30,276,600,34),
      rule(30,369,600),
      tx("No transaction assembly,",30,407,600,31,C.muted),
      tx("signing, or submission.",30,456,600,31,C.muted)
    ]),
    card(798,345,1028,548,[media({file:planner,x:14,y:14,width:1000,height:520,fit:"contain",radius:12})],.18)
  ],"Actual Lotline Example interface · synthetic data is labeled throughout");

  const node = (label,detail,x,y,w=510) => card(x,y,w,170,[
    tx(label,24,22,w-48,32,C.green,{fontWeight:600}),
    tx(detail,24,84,w-48,25,C.muted,{fontWeight:400})
  ]);
  scene(12,12,2,"A small, explicit trust boundary.","Validated inputs cross the server boundary; normalized results return to the browser.",[
    node("Browser planner","React UI · pure domain math",96,352,660),
    tx("→",800,398,100,64,C.green),
    node("Next.js route handlers","Input checks · bounded requests",930,352,896),
    ...[["Issuer metadata","Verified asset identity"],["Solana RPC","Accounts, mint, chain clock"],["Jupiter","Quote-only order response"]].map(([a,b],i)=>node(a,b,96+i*586,692,555)),
    tx("Server adapters verify each upstream response before use.",96,899,1728,29,C.green,{align:"center"}),
    rect({x:968,y:529,width:3,height:79,fill:C.green}),
    rule(365,608,1187,C.green),
    ...[365,951,1537].map(x=>rect({x,y:608,width:3,height:67,fill:C.green}))
  ],"lib/domain · lib/server · app/api — provider credentials stay on the server");

  scene(24,12,3,"Money enters as strings.","USDC has six decimal places. Percentages become integer basis points totaling 10,000.",[
    darkCode([
      "const [whole, fraction = ''] = input.split('.');",
      "const raw = BigInt(whole) * 1_000_000n",
      "          + BigInt(fraction.padEnd(6, '0'));"
    ],96,360,1728,36),
    ...chip("10.000001 USDC",98,650,510),
    tx("→",678,646,110,46,C.green),
    ...chip("10_000_001n micro-USDC",874,650,670),
    tx("Validation rejects excess precision, negatives, and oversized budgets.",100,770,1720,33),
    tx("Allocation money never passes through binary floating point.",100,835,1720,33,C.green)
  ],"lib/domain/math.ts · exact source excerpt, line-wrapped for readability");

  scene(36,14,4,"Largest remainder keeps the total exact.","10.000001 USDC at 50 / 30 / 20: floor each allocation, then assign the remaining micro-unit.",[
    ...[["50%","5.000000","5.000001","remainder: 5,000"],["30%","3.000000","3.000000","remainder: 3,000"],["20%","2.000000","2.000000","remainder: 2,000"]].map(([w,before,after,r],i)=>
      card(96+i*586,360,555,332,[
        tx(w,28,22,490,36,C.green),
        mono(before,28,99,495,45,C.ink,{duration:4}),
        mono(after,28,99,495,45,C.green,{at:4}),
        tx(r,28,193,490,27,C.muted),
        rect({x:28,y:270,width:499,height:8,fill:C.line,radius:4}),
        rect({x:28,y:270,width:[499,300,200][i],height:8,fill:C.green,radius:4,animate:[{property:"scaleX",from:.02,to:1,at:.3,duration:.8,easing:"house"}]})
      ],i*.12)),
    pop(98,738,1724,120,[
      rect({width:1724,height:112,fill:"#E4EDDF",radius:18}),
      mono("5.000001 + 3.000000 + 2.000000 = 10.000001",30,25,1660,38)
    ],4),
    tx("The 50% allocation receives +1 micro-USDC.",98,884,1300,30,C.green,{at:4})
  ],"Pure BigInt arithmetic · equal remainders use stable basket order · illustrative allocation");

  scene(50,14,5,"Verify identity before counting units.","A matching ticker alone is not enough to identify a supported asset.",[
    ...[
      ["01","Issuer deployment","Resolve the official Solana mint."],
      ["02","Mint validation","Check token program and scaled extension."],
      ["03","Every token account","Aggregate matching raw balances with BigInt."],
      ["04","Mint + chain clock","Resolve the active scheduled multiplier."]
    ].map(([n,a,b],i)=>card(96,342+i*140,1728,116,[
      mono(n,24,25,120,37,C.green),
      tx(a,140,21,520,33,C.ink,{fontWeight:600}),
      tx(b,692,26,990,30,C.muted,{fontWeight:400})
    ],i*.16))
  ],"lib/server/catalog.ts · lib/server/solana.ts · confirmed zero and unavailable remain distinct");

  scene(64,13,6,"Raw units are not the displayed holdings.","Token-2022 Scaled UI Amount requires mint configuration and chain time.",[
    darkCode([
      "const units = await",
      "  amountToUiAmountForMintWithoutSimulation(",
      "    rpc, address(mint), BigInt(raw)",
      "  );"
    ],96,355,1728,36),
    card(96,723,1728,170,[
      mono("holdingsRaw + quoteOutRaw → official conversion",30,25,1668,36),
      tx("Projected units are converted after raw amounts are added.",30,95,1650,29,C.muted)
    ],.25)
  ],"lib/server/solana.ts · exact call, line-wrapped · unverifiable scaling produces unavailable units");

  scene(77,13,7,"Jupiter receives three quote inputs.","The server checks returned mints and amounts, then exposes a narrow estimate.",[
    darkCode([
      "const params = new URLSearchParams({",
      "  inputMint: USDC_MINT,",
      "  outputMint: asset.mint,",
      "  amount: usdcRaw",
      "});"
    ],96,343,1110,31),
    card(1250,343,578,371,[
      tx("Quote-only boundary",26,28,520,32,C.green,{fontWeight:600}),
      tx("No taker parameter",26,107,520,30),
      tx("No execute request",26,183,520,30),
      tx("No transaction payload",26,259,520,29)
    ],.22),
    tx("Freshness is capped at 30 seconds and respects an earlier provider expiry.",98,785,1720,32),
    tx("No-route and malformed responses become explicit unavailable states.",98,851,1720,31,C.green)
  ],"lib/server/quotes.ts · exact URLSearchParams inputs shown in an equivalent multiline layout");

  scene(90,13,8,"Old responses cannot become a new plan.","A quote belongs to the exact budget, allocation, and asset identity that requested it.",[
    ...[
      ["Edit budget","Previous estimates invalidate"],
      ["Request again","Only the current request can win"],
      ["Expire / fail","Refresh or unavailable is visible"]
    ].map(([a,b],i)=>card(96+i*586,368,555,272,[
      tx(String(i+1).padStart(2,"0"),27,24,480,29,C.green),
      tx(a,27,89,500,36,C.ink,{fontWeight:600}),
      tx(b,27,169,500,27,C.muted)
    ],i*.17)),
    card(96,708,1728,186,[
      tx("Unavailable is a meaningful result.",30,27,1640,39,C.green,{fontWeight:600}),
      tx("Rate limits, partial RPC failures, missing configuration, and stale quotes",30,95,1650,31),
      tx("remain visible; synthetic Example values never replace failed Live data.",30,141,1650,29,C.muted)
    ],.3)
  ],"React request lifecycle · bounded server adapters · freshness and failure regression tests");

  scene(103,13,9,"Optional accounts save explicit plans.","Guest planning stays available. Saving to Supabase is a separate user action.",[
    card(96,351,790,535,[
      tx("Server-verified session",28,27,730,35,C.green,{fontWeight:600}),
      tx("auth.getUser() verifies the user",28,102,730,30),
      tx("Owner filters narrow every query",28,173,730,29),
      tx("Forced row-level security",28,244,730,31),
      tx("20 plans per owner",28,315,730,32),
      tx("Name · budget · allocations",28,406,730,28,C.muted)
    ]),
    darkCode([
      "-- Ownership predicate",
      "(select auth.uid())",
      "    = user_id",
      "-- Applied per operation",
      "-- SELECT / INSERT / DELETE"
    ],930,351,897,30),
    tx("Wallet addresses, balances, and",954,748,825,30,C.green),
    tx("quote responses are not saved.",954,796,825,30,C.green)
  ],"supabase/migrations · app/api/plans · public email confirmation still requires custom SMTP");

  scene(116,15,10,"Installed web app; fresh data stays online.","The same responsive PWA serves supported desktop and mobile browsers.",[
    card(96,357,840,522,[
      tx("Public offline Example",28,27,780,35,C.green,{fontWeight:600}),
      tx("Cache the public shell and assets",28,117,780,31),
      tx("Reload without a connection",28,195,780,32),
      tx("Calculate synthetic allocations",28,273,780,31),
      tx("Download the Example CSV",28,351,780,32),
      tx("Live, auth, and private APIs stay network-only.",28,440,780,25,C.muted)
    ]),
    card(980,357,844,522,[
      tx("Shared provider coordination",28,27,788,32,C.green,{fontWeight:600}),
      tx("Supabase reservations coordinate",28,117,788,30),
      tx("request starts across Vercel instances.",28,165,788,29),
      mono("Jupiter: 2.1 s spacing",28,266,788,33),
      mono("Solana: 150 ms spacing",28,331,788,33),
      tx("Bounded backlog · explicit failures",28,437,788,28,C.muted)
    ],.18)
  ],"public/sw.js · lib/server/provider-limits.ts · browser installation, not native App Store packages");

  scene(131,15,11,"Evidence separates fixtures from live results.","Dated verification records show what was exercised and what remains a deployment dependency.",[
    card(96,351,840,538,[
      tx("Deterministic coverage",28,27,780,35,C.green,{fontWeight:600}),
      tx("Exact rounding and token aggregation",28,111,780,29),
      tx("Scheduled scaling and provider failures",28,181,780,29),
      tx("Stale-response and account isolation",28,251,780,29),
      tx("Keyboard, exports, and offline PWA",28,321,780,30),
      tx("Hosted RLS / quota tests roll fixtures back.",28,433,780,25,C.muted)
    ]),
    card(980,351,844,538,[
      tx("Observed deployed Live smoke",28,27,788,31,C.green,{fontWeight:600}),
      mono("2026-09-11 · 17:23–17:24 UTC",28,110,788,29),
      tx("Six verified issuer assets",28,184,788,30),
      tx("Confirmed zero AAPLx / USDC holdings",28,255,788,28),
      tx("Real keyless 10 USDC Jupiter quote",28,326,788,29),
      tx("Historical observation; not current pricing.",28,433,788,25,C.muted)
    ],.2)
  ],"docs/integration-verification.md · docs/deployed-live-smoke.json · no transaction submitted");

  scene(146,14,12,"Take the plan. Keep the choice.","Copy the plan, download a CSV, or review each asset independently on Jupiter.",[
    card(96,352,1028,532,[media({file:results,x:14,y:14,width:1000,height:504,fit:"contain",radius:12})]),
    card(1168,352,656,532,[
      ...mark(29,33,3),
      tx("Lotline",148,57,450,54,C.green,{fontWeight:600}),
      tx("Exact contribution math.",30,197,595,34),
      tx("Read-only estimates.",30,270,595,34),
      tx("Your next decision.",30,343,595,34),
      tx("Source, setup, and evidence included.",30,444,595,24,C.muted)
    ],.2)
  ],"lotline-omega.vercel.app · github.com/operatoruplift/lotline · Example screen shown");
}
export default buildTechnical;
