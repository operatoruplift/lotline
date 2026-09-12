import fs from 'node:fs/promises';
import path from 'node:path';
const workspace=process.env.LOTLINE_VIDEO_WORKSPACE || '/home/user/work/lotline';
async function buildLotlineFilms({project,rect,text,media}) {
 const board=JSON.parse(await fs.readFile(path.join(workspace,'storyboard.json'),'utf8'));
 for(const [name,film] of Object.entries(board)){
  const dir=path.join(workspace,name);
  const p=await project({dir,size:'1920x1080',fps:30,background:'#F8F3E9'});
  const logo=await p.add(path.join(workspace,'logo.png'));
  p.compose([
   media({file:logo,x:50,y:22,width:52,height:52,fit:'contain'}),
   text('Lotline.',{x:115,y:24,width:230,height:60,fontFamily:'Inter',fontSize:38,fontWeight:700,color:'#174D3C'}),
   text(name==='product'?'PRODUCT FILM / SEPTEMBER 2026':'TECHNICAL WALKTHROUGH / SEPTEMBER 2026',{x:1210,y:36,width:660,height:38,fontFamily:'Inter',fontSize:17,fontWeight:600,letterSpacing:2,align:'right',color:'#6A786A'})
  ],{at:0,dur:film.duration,name:'Persistent identity'});
  for(const [i,c] of film.chapters.entries()){
   const dur=c.until-c.at;
   const capture=await p.add(path.join(workspace,'prepared',`${name}-${i}.mp4`));
   const enter=[{property:'opacity',from:0,to:1,duration:0.35}];
   p.compose([
    text(c.title,{x:52,y:92,width:1800,height:72,fontFamily:'Inter',fontSize:54,fontWeight:600,color:'#10271F',animate:enter}),
    rect({x:28,y:182,width:1388,height:870,fill:'#E6E9DF',radius:20}),
    media({file:capture,x:32,y:186,width:1380,height:862.5,fit:'contain',radius:16}),
    rect({x:1446,y:182,width:446,height:870,fill:'#174D3C',radius:20}),
    text(c.number+' / '+String(film.chapters.length).padStart(2,'0'),{x:1480,y:218,width:380,height:42,fontFamily:'Inter',fontSize:22,fontWeight:600,color:'#BED2B7'}),
    text(c.kicker,{x:1480,y:279,width:370,height:70,fontFamily:'Inter',fontSize:16,fontWeight:600,letterSpacing:1.6,color:'#BFD4B6',animate:enter}),
    text(c.headline,{x:1480,y:370,width:370,height:210,fontFamily:'Inter',fontSize:39,fontWeight:600,lineHeight:1.18,color:'#FAF7EF',animate:[{property:'offsetY',from:14,to:0,duration:0.55},...enter]}),
    text(c.body,{x:1480,y:602,width:370,height:320,fontFamily:'Inter',fontSize:25,lineHeight:1.5,color:'#E1EBDC',animate:enter}),
    text(c.tag,{x:1480,y:967,width:370,height:67,fontFamily:'Inter',fontSize:16,lineHeight:1.4,color:'#BFD4B6'}),
    rect({x:1480,y:1040,width:370,height:3,fill:'#426B56'}),
    rect({x:1480,y:1040,width:370,height:3,fill:'#C5DDAF',animate:[{property:'scaleX',from:0,to:1,duration:dur,easing:'linear'}]})
   ],{at:c.at,dur,name:`${name} chapter ${i+1}`});
  }
  await p.frame(3,'renders/poster.png');
  for(const [i,c]of film.chapters.entries())await p.frame(c.at+Math.min(4,(c.until-c.at)/2),`renders/chapter-${i+1}.png`);
  if(process.env.RENDER==='1'){
   const report=await p.render('renders/picture.mp4',{bitrate:1600000,concurrency:2,shards:4});
   await fs.writeFile(path.join(dir,'render-report.json'),JSON.stringify(report,null,2));
  }
 }
}

export default buildLotlineFilms;
