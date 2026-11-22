const fs = require('fs');
const A = require('../src/engine.js');
const SCR = process.env.SCR || '/tmp/claude-0/-home-claude/dc5957f4-4c5e-5ab9-9243-41f3041ba333/scratchpad';
fs.mkdirSync(SCR, { recursive: true });

function writeRGBA(name, img) {
  fs.writeFileSync(`${SCR}/${name}.rgba`, Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length));
  fs.writeFileSync(`${SCR}/${name}.json`, JSON.stringify({ w: img.width, h: img.height }));
}

function checkMesh(mesh) {
  const ix = mesh.indices, p = mesh.positions;
  const edges = new Map();
  const key = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  let vol = 0, degenerate = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(key(u, v), (edges.get(key(u, v)) || 0) + 1);
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  let open = 0, nonman = 0;
  for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) nonman++; }
  return { edges: edges.size, open, nonman, degenerate, volume: vol };
}

(async () => {
  let t0 = Date.now();
  const sheet = A.renderSampleSheet();
  console.log('sample sheet', sheet.width, 'x', sheet.height, (Date.now() - t0) + 'ms');
  writeRGBA('sheet', sheet);

  t0 = Date.now();
  const an = A.analyzeSheet(sheet, { tol: 25 });
  console.log('segments', JSON.stringify(an.segs), (Date.now() - t0) + 'ms');

  const roles = ['left', 'front', 'right', 'back'];
  t0 = Date.now();
  const views = A.prepareViews(sheet, an.mask, an.segs, roles);
  console.log('prepareViews', (Date.now() - t0) + 'ms', Object.values(views).map((v) => `${v.role}:${v.w}x${v.h} hb=${v.hb}`).join(' '));

  t0 = Date.now();
  const res = await A.reconstruct(views, { detail: 144, keepField: true });
  console.log('reconstruct', (Date.now() - t0) + 'ms');
  console.log('info', JSON.stringify(res.info));
  console.log('size', JSON.stringify(res.size));
  const chk = checkMesh(res);
  console.log('mesh check', JSON.stringify(chk));

  // IoU vs ground truth (voxels above the base only)
  const { field, Gx, Gy, Gz, yf0, vs, Hv } = res.debug;
  const ps = sheet.ps;
  let inter = 0, uni = 0, onlyHull = 0, onlyGT = 0;
  for (let rf = Math.round(0.02 * Hv); rf < Hv; rf++) {
    for (let iz = 0; iz < Gz; iz++) for (let ix = 0; ix < Gx; ix++) {
      const X = (ix + 0.5 - Gx / 2) * vs * ps, Z = (iz + 0.5 - Gz / 2) * vs * ps, Y = (rf + 0.5) * vs * ps;
      const gt = A.sampleInside(X, Y, Z);
      const f = field[ix + Gx * ((yf0 + rf) + Gy * iz)] >= 0.5;
      if (gt && f) inter++; if (gt || f) uni++;
      if (f && !gt) onlyHull++; if (gt && !f) onlyGT++;
    }
  }
  console.log('IoU vs ground truth', (inter / uni).toFixed(3), 'extra', onlyHull, 'missing', onlyGT);

  // exports
  t0 = Date.now();
  const stl = A.exportSTL(res, 100);
  const glb = A.exportGLB(res, 100);
  const zip = A.makeZip([{ name: 'figurine.stl', data: new Uint8Array(stl) }, { name: 'figurine.glb', data: new Uint8Array(glb) }]);
  console.log('exports', (Date.now() - t0) + 'ms', 'stl', stl.byteLength, 'glb', glb.byteLength, 'zip', zip.length);
  fs.writeFileSync(`${SCR}/figurine.zip`, zip);
  fs.writeFileSync(`${SCR}/figurine.stl`, Buffer.from(stl));
  fs.writeFileSync(`${SCR}/figurine.glb`, Buffer.from(glb));

  // dump for rendering
  fs.writeFileSync(`${SCR}/mesh_pos.f32`, Buffer.from(res.positions.buffer));
  fs.writeFileSync(`${SCR}/mesh_col.u8`, Buffer.from(res.colors.buffer));
  fs.writeFileSync(`${SCR}/mesh_nrm.f32`, Buffer.from(res.normals.buffer));
  fs.writeFileSync(`${SCR}/mesh_idx.u32`, Buffer.from(res.indices.buffer));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
