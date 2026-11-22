const fs = require('fs');
const A = require('../src/engine.js');
const SCR = '/tmp/claude-0/-home-claude/dc5957f4-4c5e-5ab9-9243-41f3041ba333/scratchpad';
function chk(m){const ix=m.indices,p=m.positions,e=new Map();let open=0,non=0,vol=0;const key=(a,b)=>a<b?a*4294967296+b:b*4294967296+a;
 for(let t=0;t<ix.length;t+=3){const a=ix[t],b=ix[t+1],c=ix[t+2];for(const[u,v]of[[a,b],[b,c],[c,a]])e.set(key(u,v),(e.get(key(u,v))||0)+1);
 vol+=(p[a*3]*(p[b*3+1]*p[c*3+2]-p[b*3+2]*p[c*3+1])-p[a*3+1]*(p[b*3]*p[c*3+2]-p[b*3+2]*p[c*3])+p[a*3+2]*(p[b*3]*p[c*3+1]-p[b*3+1]*p[c*3]))/6;}
 for(const c of e.values()){if(c===1)open++;else if(c>2)non++;}return{open,non,vol:Math.round(vol)};}
function iou(res, sheet){const {field,Gx,Gy,Gz,yf0,vs,Hv}=res.debug;const ps=sheet.ps;
 // centre de masse du champ et du modele de reference (invariant a la translation horizontale)
 let fx=0,fz=0,fn=0,gx=0,gz=0,gn=0;const r0=Math.round(0.02*Hv);
 for(let rf=r0;rf<Hv;rf++)for(let iz=0;iz<Gz;iz++)for(let ix=0;ix<Gx;ix++){
  const X=(ix+0.5-Gx/2)*vs*ps,Z=(iz+0.5-Gz/2)*vs*ps,Y=(rf+0.5)*vs*ps;
  if(field[ix+Gx*((yf0+rf)+Gy*iz)]>=0.5){fx+=X;fz+=Z;fn++;} if(A.sampleInside(X,Y,Z)){gx+=X;gz+=Z;gn++;}}
 const dx=fx/fn-gx/gn, dz=fz/fn-gz/gn; let i=0,u=0;
 for(let rf=r0;rf<Hv;rf++)for(let iz=0;iz<Gz;iz++)for(let ix=0;ix<Gx;ix++){
  const X=(ix+0.5-Gx/2)*vs*ps-dx,Z=(iz+0.5-Gz/2)*vs*ps-dz,Y=(rf+0.5)*vs*ps;const gt=A.sampleInside(X,Y,Z);const f=field[ix+Gx*((yf0+rf)+Gy*iz)]>=0.5;
  if(gt&&f)i++;if(gt||f)u++;}return (i/u).toFixed(3)+' (dx '+dx.toFixed(1)+' dz '+dz.toFixed(1)+')';}
async function run(name, sheet, count, rows, opts, order, perturb){
  const t0=Date.now();
  let sh=sheet;
  const an=A.analyzeSheet(sh,{tol:25,count,rows});
  let segs=an.segs; 
  const views=A.prepareViewList(sh,an.mask,segs);
  const v2 = order? order.map(i=>views[i]) : views;
  if(perturb) v2.forEach((v,k)=>{v.cx+=perturb[k]||0;});
  const res=await A.reconstructN(v2,Object.assign({detail:144,keepField:true},opts||{}));
  const i=res.info;
  console.log(name.padEnd(30),'segs',segs.length,'dir',i.direction,'sc',i.directionScores.chosen.toFixed(3),'/',i.directionScores.other&&i.directionScores.other.toFixed(3),'| coh mean',i.coherence.fb.toFixed(3),'min',i.coherence.lr.toFixed(3),'| IoU',iou(res,sheet),'| mesh',JSON.stringify(chk(res)),'| tris',i.triangles,'|',Date.now()-t0,'ms');
  return res;
}
(async()=>{
  const ang8=[0,45,90,135,180,225,270,315], ang12=[0,30,60,90,120,150,180,210,240,270,300,330];
  let t=Date.now();
  const s8r2=A.renderSampleSheet({angles:ang8,rows:2,vw:200}); console.log('render 8x2rows',Date.now()-t,'ms',s8r2.width,s8r2.height);
  const s8r1=A.renderSampleSheet({angles:ang8,rows:1,vw:200});
  const s12=A.renderSampleSheet({angles:ang12,rows:2,vw:200});
  fs.writeFileSync(SCR+'/s8.rgba',Buffer.from(s8r2.data.buffer));fs.writeFileSync(SCR+'/s8.json',JSON.stringify({w:s8r2.width,h:s8r2.height}));
  const r=await run('8 vues, 2 rangees',s8r2,8,2);
  fs.writeFileSync(SCR+'/mesh_pos.f32',Buffer.from(r.positions.buffer));fs.writeFileSync(SCR+'/mesh_col.u8',Buffer.from(r.colors.buffer));fs.writeFileSync(SCR+'/mesh_nrm.f32',Buffer.from(r.normals.buffer));fs.writeFileSync(SCR+'/mesh_idx.u32',Buffer.from(r.indices.buffer));
  await run('8 vues, 1 rangee',s8r1,8,1);
  await run('12 vues, 2 rangees',s12,12,2);
  await run('8 vues ordre inverse',s8r1,8,1,{}, [0,7,6,5,4,3,2,1]);
  await run('8 vues decalees +-10px',s8r1,8,1,{}, null,[10,-8,6,-12,9,-5,11,-7]);
  await run('8 vues tolerance 1',s8r2,8,2,{tolerance:1});
  await run('4 vues via N (0,90,180,270)',A.renderSampleSheet({angles:[0,90,180,270],vw:224}),4,1);
  const z=A.exportGLB(r,100), s=A.exportSTL(r,100); console.log('exports ok',z.byteLength,s.byteLength);
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
