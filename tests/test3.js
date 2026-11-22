const A = require('../src/engine.js');
(async () => {
  const base = A.renderSampleSheet();
  const VW = 224;
  for (const pitch of [200, 190, 175]) {
    const W = pitch * 4 + 40, H = base.height;
    const s = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4), ps: base.ps };
    for (let i = 0; i < W * H; i++) { s.data[i * 4] = 243; s.data[i * 4 + 1] = 243; s.data[i * 4 + 2] = 240; s.data[i * 4 + 3] = 255; }
    for (let v = 0; v < 4; v++) for (let y = 0; y < H; y++) for (let x = 0; x < VW; x++) {
      const si = (y * base.width + v * VW + x) * 4;
      const d = Math.abs(base.data[si] - 243) + Math.abs(base.data[si + 1] - 243) + Math.abs(base.data[si + 2] - 240);
      if (d < 12) continue;
      const dx = 20 + v * pitch + x - 12, di = (y * W + dx) * 4;
      if (dx < 0 || dx >= W) continue;
      for (let k = 0; k < 4; k++) s.data[di + k] = base.data[si + k];
    }
    try {
      const an = A.analyzeSheet(s, { tol: 25 });
      const views = A.prepareViews(s, an.mask, an.segs, ['left', 'front', 'right', 'back']);
      const res = await A.reconstruct(views, { detail: 96 });
      console.log('pitch', pitch, 'segs', an.segs.map((q) => q.x0 + '-' + q.x1).join(' '), '| fb', res.info.coherence.fb.toFixed(3), 'lr', res.info.coherence.lr.toFixed(3));
    } catch (e) { console.log('pitch', pitch, 'ERREUR', e.message); }
  }
})();
