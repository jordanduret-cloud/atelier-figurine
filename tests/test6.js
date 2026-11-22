const A = require('../src/engine.js');
// personnage asymetrique : un baton dans la main gauche du personnage (X positif)
A.SAMPLE_PARTS.push([34, 40, -24, 3, 18, 3, 0, [230, 210, 60]]);
const ang = [0,45,90,135,180,225,270,315];
const rev = ang.map(a => (360 - a) % 360);
(async () => {
  for (const [name, angles] of [['ordre normal', ang], ['ordre inverse (sens oppose)', rev]]) {
    const sh = A.renderSampleSheet({ angles, rows: 2, vw: 200 });
    const an = A.analyzeSheet(sh, { tol: 25, count: 8, rows: 2 });
    const views = A.prepareViewList(sh, an.mask, an.segs);
    const r = await A.reconstructN(views, { detail: 120 });
    console.log(name.padEnd(30), 'dir', r.info.direction, 'colors', r.info.colorScores.chosen.toFixed(4), r.info.colorScores.other.toFixed(4), 'coh', r.info.coherence.fb.toFixed(3));
  }
})();
