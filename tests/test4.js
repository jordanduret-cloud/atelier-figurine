const A = require('../src/engine.js');
(async () => {
  let t = Date.now();
  const s = A.renderSampleSheet({ vw: 672, vh: 990, ps: 0.34 / 3, ground: 960, ss: 1 });
  console.log('render big sheet', s.width, 'x', s.height, Date.now() - t, 'ms');
  t = Date.now();
  const an = A.analyzeSheet(s, { tol: 25 });
  console.log('analyze', Date.now() - t, 'ms', an.segs.map((q) => q.x1 - q.x0).join('/'));
  t = Date.now();
  const views = A.prepareViews(s, an.mask, an.segs, ['left', 'front', 'right', 'back']);
  console.log('prepare', Date.now() - t, 'ms');
  for (const d of [96, 144, 208]) {
    t = Date.now();
    const r = await A.reconstruct(views, { detail: d });
    const mem = process.memoryUsage();
    console.log('detail', d, 'grid', r.info.grid.join('x'), 'tris', r.info.triangles, Date.now() - t, 'ms', 'rss', Math.round(mem.rss / 1048576) + 'MB');
  }
})();
