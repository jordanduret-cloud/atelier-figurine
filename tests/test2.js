const A = require('../src/engine.js');

const VW = 224;
function cloneSheet(s) { return { width: s.width, height: s.height, data: new Uint8ClampedArray(s.data), ps: s.ps }; }
function blockOps(s, fn) { // fn(viewIndex, getPixel, setPixel)
  const out = cloneSheet(s);
  for (let v = 0; v < 4; v++) {
    const src = (x, y) => { const i = (y * s.width + v * VW + x) * 4; return [s.data[i], s.data[i + 1], s.data[i + 2], s.data[i + 3]]; };
    const dst = (x, y, c) => { const i = (y * s.width + v * VW + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = c[3]; };
    fn(v, src, dst);
  }
  return out;
}
function flipBlocks(s, which) {
  return blockOps(s, (v, src, dst) => { if (!which.includes(v)) return; for (let y = 0; y < s.height; y++) for (let x = 0; x < VW; x++) dst(x, y, src(VW - 1 - x, y)); });
}
function permute(s, order) { // order[k] = source block for position k
  const out = cloneSheet(s);
  for (let k = 0; k < 4; k++) for (let y = 0; y < s.height; y++) for (let x = 0; x < VW; x++) {
    const i = (y * s.width + order[k] * VW + x) * 4, j = (y * s.width + k * VW + x) * 4;
    out.data[j] = s.data[i]; out.data[j + 1] = s.data[i + 1]; out.data[j + 2] = s.data[i + 2]; out.data[j + 3] = 255;
  }
  return out;
}
function scaleBlocks(s, factors) {
  return blockOps(s, (v, src, dst) => {
    const f = factors[v], bgc = [243, 243, 240, 255];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < VW; x++) {
      const sx = Math.round((x - VW / 2) / f + VW / 2), sy = Math.round(320 + (y - 320) / f);
      dst(x, y, sx >= 0 && sx < VW && sy >= 0 && sy < s.height ? src(sx, sy) : bgc);
    }
  });
}
function noisyBg(s) {
  const out = cloneSheet(s);
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const i = (y * s.width + x) * 4;
    const d = Math.abs(s.data[i] - 243) + Math.abs(s.data[i + 1] - 243) + Math.abs(s.data[i + 2] - 240);
    if (d < 30) {
      const g = -18 + 36 * (x / s.width) + 10 * (y / s.height);
      const n = (rnd() - 0.5) * 8;
      out.data[i] = 243 + g + n; out.data[i + 1] = 243 + g + n; out.data[i + 2] = 240 + g + n;
    }
  }
  return out;
}
function transparentBg(s) {
  const out = cloneSheet(s);
  for (let i = 0; i < s.width * s.height; i++) {
    const d = Math.abs(s.data[i * 4] - 243) + Math.abs(s.data[i * 4 + 1] - 243) + Math.abs(s.data[i * 4 + 2] - 240);
    if (d < 6) out.data[i * 4 + 3] = 0;
  }
  return out;
}

async function run(name, sheet, roles, opts, anOpts) {
  try {
    const t0 = Date.now();
    const an = A.analyzeSheet(sheet, anOpts || { tol: 25 });
    const views = A.prepareViews(sheet, an.mask, an.segs, roles);
    const res = await A.reconstruct(views, Object.assign({ detail: 96 }, opts || {}));
    const f = res.info.facing;
    console.log(name.padEnd(34), 'segs', an.segs.map((s) => s.x1 - s.x0).join('/'), '| fb', res.info.coherence.fb.toFixed(3), 'lr', res.info.coherence.lr.toFixed(3),
      '| facing L', f.left, 'R', f.right, 'same', f.sameDirection, 'ev', f.evidence.toFixed(2), '| tris', res.info.triangles, '|', (Date.now() - t0) + 'ms');
  } catch (e) { console.log(name.padEnd(34), 'ERREUR:', e.message); }
}

(async () => {
  const base = A.renderSampleSheet();
  const std = ['left', 'front', 'right', 'back'];
  await run('baseline', base, std);
  await run('profils retournes (G et D)', flipBlocks(base, [0, 2]), std);
  await run('un seul profil retourne', flipBlocks(base, [2]), std);
  await run('ordre face,gauche,dos,droite', permute(base, [1, 0, 3, 2]), ['front', 'left', 'back', 'right']);
  await run('ordre face,droite,dos,gauche', permute(base, [1, 2, 3, 0]), ['front', 'right', 'back', 'left']);
  await run('fond degrade + bruit (tol 25)', noisyBg(base), std);
  await run('fond degrade + bruit (tol 40)', noisyBg(base), std, {}, { tol: 40 });
  await run('PNG transparent', transparentBg(base), std);
  await run('echelles differentes', scaleBlocks(base, [0.92, 1, 1.07, 0.96]), std);
  await run('decoupe egale', base, std, {}, { tol: 25, split: 'equal' });
  await run('mauvais roles (face = profil)', base, ['front', 'left', 'right', 'back']);
  await run('detail 64', base, std, { detail: 64 });
  await run('sans socle', base, std, { base: 'none' });
  await run('socle carre', base, std, { base: 'square' });
  await run('arrondi 0 / lissage 0', base, std, { roundness: 0, smooth: 0 });
  await run('arrondi 100 / lissage 100', base, std, { roundness: 1, smooth: 1 });
  // vues collees : on rapproche les blocs en rognant les marges
  const tight = { width: 4 * 200, height: base.height, data: new Uint8ClampedArray(4 * 200 * base.height * 4), ps: base.ps };
  for (let v = 0; v < 4; v++) for (let y = 0; y < base.height; y++) for (let x = 0; x < 200; x++) {
    const si = (y * base.width + v * VW + 12 + x) * 4, di = (y * tight.width + v * 200 + x) * 4;
    for (let k = 0; k < 4; k++) tight.data[di + k] = base.data[si + k];
  }
  await run('vues tres rapprochees', tight, std);
  // image vide
  const blank = { width: 200, height: 100, data: new Uint8ClampedArray(200 * 100 * 4).fill(255) };
  await run('image blanche', blank, std);
})();
