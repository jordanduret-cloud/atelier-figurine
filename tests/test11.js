// Le creusage ne doit pas abimer une forme normale (personnage 8 vues) : IoU avec/sans
const A=require('../src/engine.js');
const src=require('fs').readFileSync(__dirname+'/test5.js','utf8');
const m=src.match(/function iou[\s\S]*?\n}\n/);
eval(m[0].replace('function iou','global.iou=function'));
(async()=>{
  const ang8=[0,45,90,135,180,225,270,315];
  const sheet=A.renderSampleSheet({angles:ang8,rows:2,vw:200});
  const an=A.analyzeSheet(sheet,{tol:25,count:8,rows:2});
  for(const carve of [false,true]){
    const views=A.prepareViewList(sheet,an.mask,an.segs);
    const t0=Date.now();
    const r=await A.reconstructN(views,{detail:144,keepField:true,carve,carveTau:+process.env.TAU,carveMax:0.9,angles:ang8,direction:1});
    console.log('carve',carve,'IoU',global.iou(r,sheet),'tris',r.info.triangles,JSON.stringify(r.info.carve),(Date.now()-t0)+'ms');
  }
})();
