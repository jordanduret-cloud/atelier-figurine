// Export jeu : triangles cibles, UV dans [0,1], GLB texture valide
const zlib = require('zlib');
const A = require('../src/engine.js');
function crc(buf){return A.crc32(buf);}
function png(w,h,rgba){
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(rgba.buffer,rgba.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);}
  const chunk=(t,d)=>{const b=Buffer.alloc(12+d.length);b.writeUInt32BE(d.length,0);b.write(t,4);d.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t),d]))>>>0,8+d.length);return b;};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
  const ang=[0,45,90,135,180,225,270,315];const sheet=A.renderSampleSheet({angles:ang,rows:2,vw:200}); 
  const an=A.analyzeSheet(sheet,{tol:25,count:8,rows:2});
  const views=A.prepareViewList(sheet,an.mask,an.segs);
  for (const target of [30000, 50000]) {
    const t0=Date.now();
    const asset=await A.reconstructGame(views,{targetTris:target,texSize:1024,height:1});
    const nt=asset.indices.length/3;
    let uvOk=true; for(const v of asset.uvs) if(!(v>=0&&v<=1)) uvOk=false;
    let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
    for(let i=0;i<asset.positions.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],asset.positions[i+k]);mx[k]=Math.max(mx[k],asset.positions[i+k]);}
    const bytes=png(asset.atlas.width,asset.atlas.height,asset.atlas.data);
    const glb=A.exportGLBTextured(asset,{bytes:new Uint8Array(bytes),mime:'image/png'},'test-modele');
    const dv=new DataView(glb);
    console.log('cible',target,'tris',nt,'detail',asset.info.Hv,'uvOk',uvOk,'minY',mn[1].toFixed(3),'maxY',mx[1].toFixed(3),'cx',((mn[0]+mx[0])/2).toFixed(3),'cz',((mn[2]+mx[2])/2).toFixed(3),
      'atlasScale',asset.info.atlasScale.toFixed(2),'flatTris',asset.info.flatTris,'cells',asset.info.flatColors,'glb',glb.byteLength,'magic',dv.getUint32(0,true)===0x46546c67,'len ok',dv.getUint32(8,true)===glb.byteLength,(Date.now()-t0)+'ms');
    if(target===30000){require('fs').writeFileSync(process.env.OUT||'/tmp/game.glb',Buffer.from(glb));require('fs').writeFileSync((process.env.OUT||'/tmp/game.glb')+'.png',bytes);}
  }
})().catch(e=>{console.error(e);process.exit(1);});
