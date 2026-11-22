const fs=require('fs'); const A=require('../src/engine.js');
const SCR='/tmp/claude-0/-home-claude/dc5957f4-4c5e-5ab9-9243-41f3041ba333/scratchpad';
const img={width:512,height:286,data:new Uint8ClampedArray(fs.readFileSync(SCR+'/user.rgba'))};
console.log('layout user sheet', JSON.stringify(A.detectLayout(img,30)));
for (const [n,rows] of [[4,1],[8,1],[8,2],[12,2]]) { const ang=[...Array(n).keys()].map(i=>360*i/n);
  const sh = n===4 ? A.renderSampleSheet() : A.renderSampleSheet({angles:ang,rows,vw:n===12?170:200});
  console.log('sample',n,rows,JSON.stringify(A.detectLayout(sh,25))); }
(async()=>{
 const an=A.analyzeSheet(img,{tol:30,count:8,rows:2});
 const views=A.prepareViewList(img,an.mask,an.segs);
 const r=await A.reconstructN(views,{detail:144,angles:[0,30,90,150,180,210,270,330]});
 // composantes connexes du maillage
 const ix=r.indices,nv=r.positions.length/3,par=new Int32Array(nv).map((_,i)=>i);const f=a=>{while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;};
 for(let t=0;t<ix.length;t+=3){par[f(ix[t])]=f(ix[t+1]);par[f(ix[t+1])]=f(ix[t+2]);}
 const used=new Set();for(let t=0;t<ix.length;t++)used.add(f(ix[t]));
 console.log('user sheet mesh components', used.size, 'tris', r.info.triangles);
})();
