// Creusage par les couleurs : un "C" (creux ouvert vers +X) que les silhouettes seules remplissent.
const A = require('../src/engine.js');
const parts = [];
const pal = [[200,60,52],[240,200,70],[52,86,160],[40,150,140],[150,70,170],[240,140,50],[90,170,70],[220,90,150],[60,60,70],[250,250,250],[120,80,40],[30,120,200]];
const R = 26, a0 = 65, a1 = 295, K = 12;
for (let i = 0; i < K; i++) {
  const a = (a0 + (a1 - a0) * i / (K - 1)) * Math.PI / 180;
  parts.push([R * Math.cos(a), 30, R * Math.sin(a), 9, 28, 9, 0, pal[i % pal.length]]);
}
parts.push([-8, 30, 0, 6, 26, 6, 0, [255, 255, 255]]);
const gt = (x, y, z) => { for (const q of parts) { const dx=x-q[0], dy=y-q[1], dz=z-q[2]; if ((dx/q[3])**2+(dy/q[4])**2+(dz/q[5])**2<=1) return true; } return false; };
(async () => {
  const ang = [0,45,90,135,180,225,270,315];
  const sheet = A.renderSampleSheet({ angles: ang, rows: 2, vw: 260, vh: 260, ps: 0.3, ground: 245, parts });
  const an = A.analyzeSheet(sheet, { tol: 25, count: 8, rows: 2 });
  const views = A.prepareViewList(sheet, an.mask, an.segs);
  for (const carve of [false, true]) {
    const SH = [0, 0]; const m = await A.reconstructN(views, { base: 'none', detail: 80, carve, angles: ang, direction: 1, tolerance: 0, keepField: true, carveTau: +process.env.TAU || 55 });
    const d = m.debug, info = m.info;
    const ys = [18, 30, 42].map((y) => Math.round(d.yf0 + (y - 2) / 0.3 / d.vs));
    const F2 = (x, z, k) => d.field[x + d.Gx * (ys[k] + d.Gy * z)] >= 0.5;
    let bestIoU = -1, bs = null, bcav = 0, bvol = 0;
    for (let sx = -30; sx <= 30; sx += 1) for (let sz = -30; sz <= 30; sz += 1) {
      let inter = 0, uni = 0, cf = 0, ct = 0;
      for (let k = 0; k < 3; k++) for (let z = 0; z < d.Gz; z += 2) for (let x = 0; x < d.Gx; x += 2) {
        const f = F2(x, z, k), X = (x + 0.5 - d.Gx / 2) * d.vs * 0.3 + sx, Z = (z + 0.5 - d.Gz / 2) * d.vs * 0.3 + sz;
        const g = gt(X, [18, 30, 42][k], Z);
        if (f && g) inter++; if (f || g) uni++;
        if (X > 3 && X < 13 && Math.abs(Z) < 11) { ct++; if (f) cf++; }
      }
      if (inter / uni > bestIoU) { bestIoU = inter / uni; bs = [sx, sz]; bcav = cf / ct; }
    }
    let art = '';
    for (let z = 0; z < d.Gz; z += 3) { for (let x = 0; x < d.Gx; x += 2) {
      const f = F2(x, z, 1), X = (x + 0.5 - d.Gx / 2) * d.vs * 0.3 + bs[0], Z = (z + 0.5 - d.Gz / 2) * d.vs * 0.3 + bs[1], g = gt(X, 30, Z);
      art += f && g ? '#' : f ? 'x' : g ? 'o' : '.'; } art += '\n'; }
    if (process.env.ART) console.log(art, bs);
    console.log('carve', carve, 'IoU(coupes)', bestIoU.toFixed(3), 'creux rempli', bcav.toFixed(2), JSON.stringify(info.carve), 'coh', info.coherence.fb.toFixed(2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
