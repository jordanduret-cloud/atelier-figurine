const A = require('../src/engine.js');
async function t(name, angles, opts) {
  const sh = A.renderSampleSheet({ angles, rows: 2, vw: 200 });
  const an = A.analyzeSheet(sh, { tol: 25, count: 8, rows: 2 });
  const views = A.prepareViewList(sh, an.mask, an.segs);
  const t0 = Date.now();
  const r = await A.reconstructN(views, Object.assign({ detail: 120 }, opts || {}));
  console.log(name.padEnd(34), 'angles', r.info.angles.map((a) => a.toFixed(0)).join(','), '| coh', r.info.coherence.fb.toFixed(3), r.info.coherence.lr.toFixed(3), '| dir', r.info.direction, '|', Date.now() - t0, 'ms');
}
(async () => {
  await t('45 deg reguliers', [0,45,90,135,180,225,270,315]);
  await t('30 deg aux diagonales (user)', [0,30,90,150,180,210,270,330]);
  await t('30 deg, estimation coupee', [0,30,90,150,180,210,270,330], { estimateAngles: false });
  await t('sens inverse + 30 deg', [0,330,270,210,180,150,90,30]);
})();
