/* Atelier Figurine : moteur. Planche 4 vues vers maillage colore, STL, GLB, ZIP. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Atelier = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ====================================================================
     1. Masque de la silhouette
     ==================================================================== */
  function medianOf(arr) { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; }

  function estimateBackground(img) {
    const w = img.width, h = img.height, d = img.data;
    const R = [], G = [], B = [];
    const ring = Math.max(1, Math.min(3, (Math.min(w, h) / 100) | 0));
    const push = (x, y) => { const i = (y * w + x) * 4; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); };
    for (let y = 0; y < h; y++) for (let k = 0; k < ring; k++) { push(k, y); push(w - 1 - k, y); }
    for (let x = ring; x < w - ring; x++) for (let k = 0; k < ring; k++) { push(x, k); push(x, h - 1 - k); }
    return [medianOf(R), medianOf(G), medianOf(B)];
  }

  function computeMask(img, tol) {
    const w = img.width, h = img.height, d = img.data, n = w * h;
    let transparent = 0;
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 128) transparent++;
    const mask = new Uint8Array(n);
    if (transparent > n * 0.01) {
      for (let i = 0; i < n; i++) mask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
      return { mask, bg: null, alpha: true };
    }
    const bg = estimateBackground(img);
    const T = 4 + tol * 1.6, T2 = T * T;
    const cand = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const dr = d[i * 4] - bg[0], dg = d[i * 4 + 1] - bg[1], db = d[i * 4 + 2] - bg[2];
      cand[i] = dr * dr + dg * dg + db * db <= T2 ? 1 : 0;
    }
    const isBg = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const seed = (i) => { if (cand[i] && !isBg[i]) { isBg[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w, y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    for (let i = 0; i < n; i++) mask[i] = isBg[i] ? 0 : 1;
    return { mask, bg, alpha: false };
  }

  /* Retire les poussieres, les textes et les traits fins (separateurs, sol). */
  function cleanMask(mask, w, h) {
    const n = w * h;
    const label = new Int32Array(n);
    const stack = new Int32Array(n);
    const comps = [];
    let nl = 0, total = 0;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || label[s]) continue;
      nl++;
      let sp = 0;
      stack[sp++] = s; label[s] = nl;
      let area = 0, minx = w, maxx = -1, miny = h, maxy = -1;
      while (sp > 0) {
        const i = stack[--sp];
        const x = i % w, y = (i / w) | 0;
        area++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (mask[j] && !label[j]) { label[j] = nl; stack[sp++] = j; }
          }
        }
      }
      comps.push({ area, minx, maxx, miny, maxy });
      total += area;
    }
    if (!comps.length) return mask;
    const minArea = total * 0.0025;
    const minThick = Math.max(2, 0.008 * Math.max(w, h));
    const keep = new Uint8Array(nl + 1);
    let largest = 0, kept = 0;
    comps.forEach((c, k) => {
      if (c.area > comps[largest].area) largest = k;
      const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
      if (c.area >= minArea && Math.min(bw, bh) >= minThick) { keep[k + 1] = 1; kept++; }
    });
    if (!kept) keep[largest + 1] = 1;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = label[i] && keep[label[i]] ? 1 : 0;
    return out;
  }

  /* ====================================================================
     2. Decoupe de la planche en 4 vues
     ==================================================================== */
  function equalSplit(x0, x1, k) {
    const out = [];
    for (let i = 0; i < k; i++) out.push({ x0: Math.round(x0 + ((x1 - x0) * i) / k), x1: Math.round(x0 + ((x1 - x0) * (i + 1)) / k) });
    return out;
  }

  /* Decoupe un profil 1D (colonnes ou lignes occupees) en k plages. */
  function splitProfile(col, len, k, mode) {
    let xmin = -1, xmax = -1;
    for (let x = 0; x < len; x++) if (col[x] > 0) { if (xmin < 0) xmin = x; xmax = x; }
    if (xmin < 0) return null;
    if (mode === 'equal') return equalSplit(xmin, xmax + 1, k);
    let runs = [];
    let s = -1;
    for (let x = 0; x <= len; x++) {
      const on = x < len && col[x] > 0;
      if (on && s < 0) s = x;
      else if (!on && s >= 0) { runs.push({ x0: s, x1: x }); s = -1; }
    }
    const minGap = Math.max(2, Math.round(0.006 * len));
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r.x0 - last.x1 < minGap) last.x1 = r.x1; else merged.push({ x0: r.x0, x1: r.x1 });
    }
    runs = merged;
    while (runs.length > k) {
      let bi = 0, bg = Infinity;
      for (let i = 0; i < runs.length - 1; i++) { const g = runs[i + 1].x0 - runs[i].x1; if (g < bg) { bg = g; bi = i; } }
      runs.splice(bi, 2, { x0: runs[bi].x0, x1: runs[bi + 1].x1 });
    }
    let guard = 0;
    while (runs.length < k && guard++ < 24) {
      let wi = 0;
      for (let i = 1; i < runs.length; i++) if (runs[i].x1 - runs[i].x0 > runs[wi].x1 - runs[wi].x0) wi = i;
      const r = runs[wi], width = r.x1 - r.x0;
      if (width < 12) break;
      const lo = r.x0 + Math.floor(width * 0.3), hi = r.x0 + Math.ceil(width * 0.7);
      let best = -1, bv = Infinity;
      for (let x = lo; x <= hi; x++) {
        const v = col[x] + (col[x - 1] || 0) + (col[x + 1] || 0);
        if (v < bv) { bv = v; best = x; }
      }
      runs.splice(wi, 1, { x0: r.x0, x1: best }, { x0: best, x1: r.x1 });
    }
    if (runs.length !== k) return equalSplit(xmin, xmax + 1, k);
    return runs;
  }

  /* Planche en `count` vues, reparties sur `rows` bandes horizontales (ordre : bande par bande, de gauche a droite). */
  function findSegments(mask, w, h, mode, count, rows) {
    count = count || 4; rows = rows || 1;
    const perRow = Math.ceil(count / rows);
    let bands;
    if (rows > 1) {
      const rp = new Int32Array(h);
      for (let y = 0; y < h; y++) { const o = y * w; let c = 0; for (let x = 0; x < w; x++) c += mask[o + x]; rp[y] = c; }
      bands = splitProfile(rp, h, rows, mode);
      if (!bands) return null;
    } else bands = [{ x0: 0, x1: h }];
    const out = [];
    for (const bd of bands) {
      const col = new Int32Array(w);
      for (let y = bd.x0; y < bd.x1; y++) { const o = y * w; for (let x = 0; x < w; x++) if (mask[o + x]) col[x]++; }
      const runs = splitProfile(col, w, perRow, mode);
      if (!runs) return null;
      for (const r of runs) out.push({ x0: r.x0, x1: r.x1, y0: bd.x0, y1: bd.x1 });
    }
    return out;
  }

  function analyzeSheet(img, opts) {
    const o = Object.assign({ tol: 25, split: 'auto', count: 4, rows: 1 }, opts || {});
    const m = computeMask(img, o.tol);
    const mask = cleanMask(m.mask, img.width, img.height);
    const segs = findSegments(mask, img.width, img.height, o.split, o.count, o.rows);
    if (!segs) throw new Error("Aucune forme détectée. Change la tolérance du fond.");
    const w = img.width, h = img.height;
    for (const sg of segs) {
      let minX = w, maxX = -1, minY = h, maxY = -1;
      for (let y = sg.y0; y < sg.y1; y++) for (let x = sg.x0; x < sg.x1; x++) if (mask[y * w + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      sg.bx0 = minX; sg.bx1 = maxX + 1; sg.by0 = minY; sg.by1 = maxY + 1; sg.empty = maxX < 0;
    }
    return { mask, segs, bg: m.bg, alpha: m.alpha };
  }

  /* Supprime les petits morceaux flottants (eclats, bouts de membres isoles) : ils ne s'impriment pas. */
  function dropSmallParts(field, nx, ny, nz, iso, ratio) {
    const N = nx * ny * nz, label = new Int32Array(N), sizes = [0];
    const stack = new Int32Array(N);
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (label[i] || field[i] < iso) continue;
      count++; let sp = 0, size = 0;
      stack[sp++] = i; label[i] = count;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % nx, y = ((p / nx) | 0) % ny, z = (p / (nx * ny)) | 0;
        if (x > 0 && !label[p - 1] && field[p - 1] >= iso) { label[p - 1] = count; stack[sp++] = p - 1; }
        if (x < nx - 1 && !label[p + 1] && field[p + 1] >= iso) { label[p + 1] = count; stack[sp++] = p + 1; }
        if (y > 0 && !label[p - nx] && field[p - nx] >= iso) { label[p - nx] = count; stack[sp++] = p - nx; }
        if (y < ny - 1 && !label[p + nx] && field[p + nx] >= iso) { label[p + nx] = count; stack[sp++] = p + nx; }
        if (z > 0 && !label[p - nx * ny] && field[p - nx * ny] >= iso) { label[p - nx * ny] = count; stack[sp++] = p - nx * ny; }
        if (z < nz - 1 && !label[p + nx * ny] && field[p + nx * ny] >= iso) { label[p + nx * ny] = count; stack[sp++] = p + nx * ny; }
      }
      sizes.push(size);
    }
    let big = 0; for (let c = 1; c <= count; c++) if (sizes[c] > big) big = sizes[c];
    let removed = 0;
    for (let i = 0; i < N; i++) {
      const c = label[i];
      if (c && sizes[c] < ratio * big) { field[i] = 0; removed++; }
    }
    // l'eventuel halo des petites parties (valeurs < iso) est sans effet sur le maillage
    return removed;
  }

  /* Detecte le nombre de vues et leur disposition (1 a 3 lignes) d'apres les formes de la planche. */
  function detectLayout(img, tol) {
    const m = computeMask(img, tol || 25);
    const mask = cleanMask(m.mask, img.width, img.height), w = img.width, h = img.height;
    const runsOf = (p, len) => {
      const minGap = Math.max(2, Math.round(0.006 * len)), out = [];
      let s = -1;
      for (let i = 0; i <= len; i++) {
        const on = i < len && p[i] > 0;
        if (on && s < 0) s = i; else if (!on && s >= 0) { out.push([s, i]); s = -1; }
      }
      const mg = [];
      for (const r of out) { const l = mg[mg.length - 1]; if (l && r[0] - l[1] < minGap) l[1] = r[1]; else mg.push([r[0], r[1]]); }
      return mg;
    };
    const rp = new Int32Array(h);
    for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += mask[y * w + x]; rp[y] = c; }
    let bands = runsOf(rp, h);
    const tallest = Math.max.apply(null, bands.map((b) => b[1] - b[0]));
    bands = bands.filter((b) => b[1] - b[0] > 0.4 * tallest);
    if (!bands.length || bands.length > 3) return null;
    const per = [];
    for (const b of bands) {
      const col = new Int32Array(w);
      for (let y = b[0]; y < b[1]; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) col[x]++;
      const runs = runsOf(col, w).filter((r) => r[1] - r[0] > 0.02 * w);
      per.push(runs.length);
    }
    if (per.some((c) => c !== per[0])) return null;
    const count = per[0] * bands.length;
    if (count !== 4 && count !== 8 && count !== 12) return null;
    return { count, rows: bands.length, perRow: per[0] };
  }

  /* ====================================================================
     3. Preparation des vues (recadrage, couleurs, image integrale)
     ==================================================================== */
  function buildSAT(mask, w, h) {
    const W = w + 1, s = new Int32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += mask[y * w + x]; s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row; }
    }
    return s;
  }
  function satAt(s, w, h, x, y) {
    x = x < 0 ? 0 : x > w ? w : x; y = y < 0 ? 0 : y > h ? h : y;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w, x0 + 1), y1 = Math.min(h, y0 + 1);
    const fx = x - x0, fy = y - y0, W = w + 1;
    const a = s[y0 * W + x0], b = s[y0 * W + x1], c = s[y1 * W + x0], d = s[y1 * W + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function boxCov(s, w, h, c0, r0, c1, r1) {
    const area = (c1 - c0) * (r1 - r0);
    if (area <= 0) return 0;
    const sum = satAt(s, w, h, c1, r1) - satAt(s, w, h, c0, r1) - satAt(s, w, h, c1, r0) + satAt(s, w, h, c0, r0);
    return clamp(sum / area, 0, 1);
  }

  /* Texture : les pixels de bord (contamines par le fond) sont remplaces par la couleur interieure la plus proche. */
  function fillTexture(v) {
    const w = v.w, h = v.h, n = w * h, mask = v.mask, rgb = v.rgb;
    const INF = 1e9, d = new Int32Array(n);
    for (let i = 0; i < n; i++) d[i] = mask[i] ? INF : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3);
      if (y > 0) {
        m = Math.min(m, d[i - w] + 3);
        if (x > 0) m = Math.min(m, d[i - w - 1] + 4);
        if (x < w - 1) m = Math.min(m, d[i - w + 1] + 4);
      }
      d[i] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 3);
      if (y < h - 1) {
        m = Math.min(m, d[i + w] + 3);
        if (x < w - 1) m = Math.min(m, d[i + w + 1] + 4);
        if (x > 0) m = Math.min(m, d[i + w - 1] + 4);
      }
      d[i] = m;
    }
    const out = new Uint8ClampedArray(n * 3);
    const dist = new Int16Array(n).fill(-1);
    const queue = new Int32Array(n);
    let qh = 0, qt = 0;
    for (let i = 0; i < n; i++) {
      if (mask[i] && d[i] >= 6) {
        out[i * 3] = rgb[i * 3]; out[i * 3 + 1] = rgb[i * 3 + 1]; out[i * 3 + 2] = rgb[i * 3 + 2];
        dist[i] = 0; queue[qt++] = i;
      }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w, y = (i / w) | 0;
      const nd = dist[i] + 1;
      const tryN = (j) => {
        if (dist[j] >= 0) return;
        dist[j] = nd; out[j * 3] = out[i * 3]; out[j * 3 + 1] = out[i * 3 + 1]; out[j * 3 + 2] = out[i * 3 + 2];
        queue[qt++] = j;
      };
      if (x > 0) tryN(i - 1);
      if (x < w - 1) tryN(i + 1);
      if (y > 0) tryN(i - w);
      if (y < h - 1) tryN(i + w);
    }
    for (let i = 0; i < n; i++) {
      if (dist[i] < 0 || (mask[i] && dist[i] > 8)) {
        out[i * 3] = rgb[i * 3]; out[i * 3 + 1] = rgb[i * 3 + 1]; out[i * 3 + 2] = rgb[i * 3 + 2];
      }
    }
    return out;
  }

  const ROLES = ['front', 'back', 'left', 'right'];

  function prepareViews(img, mask, segs, roles) {
    const w = img.width, h = img.height, data = img.data;
    if (new Set(roles).size !== 4 || !ROLES.every((r) => roles.includes(r))) throw new Error('Chaque vue (gauche, face, droite, dos) doit être utilisée une seule fois.');
    const views = {};
    for (let s = 0; s < segs.length; s++) {
      const x0 = segs[s].x0, x1 = segs[s].x1;
      let minX = w, maxX = -1, minY = h, maxY = -1;
      for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) if (mask[y * w + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (maxX < 0) throw new Error('La vue ' + (s + 1) + ' est vide. Change la découpe ou la tolérance du fond.');
      const m = 6;
      const cx0 = Math.max(0, minX - m), cx1 = Math.min(w, maxX + 1 + m), cy0 = Math.max(0, minY - m), cy1 = Math.min(h, maxY + 1 + m);
      const cw = cx1 - cx0, ch = cy1 - cy0;
      const vm = new Uint8Array(cw * ch), rgb = new Uint8ClampedArray(cw * ch * 3);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const gx = cx0 + x, gi = (cy0 + y) * w + gx, li = y * cw + x;
        vm[li] = gx >= x0 && gx < x1 && mask[gi] ? 1 : 0;
        rgb[li * 3] = data[gi * 4]; rgb[li * 3 + 1] = data[gi * 4 + 1]; rgb[li * 3 + 2] = data[gi * 4 + 2];
      }
      const v = { role: roles[s], seg: s, w: cw, h: ch, mask: vm, rgb };
      v.bx0 = minX - cx0; v.bx1 = maxX + 1 - cx0; v.by0 = minY - cy0; v.by1 = maxY + 1 - cy0;
      v.hb = v.by1 - v.by0; v.cx = (v.bx0 + v.bx1) / 2; v.bottom = v.by1;
      v.tex = fillTexture(v);
      v.sat = buildSAT(vm, cw, ch);
      views[roles[s]] = v;
    }
    return views;
  }

  /* Vues dans l'ordre de la planche (mode multi-angles) : pas de roles, un angle par position. */
  function prepareViewList(img, mask, segs) {
    const w = img.width, h = img.height, data = img.data, list = [];
    for (let s = 0; s < segs.length; s++) {
      const sg = segs[s];
      if (sg.empty) throw new Error('La vue ' + (s + 1) + ' est vide. Change la découpe ou la tolérance du fond.');
      const x0 = sg.x0, x1 = sg.x1, y0 = sg.y0 === undefined ? 0 : sg.y0, y1 = sg.y1 === undefined ? h : sg.y1;
      const m = 6;
      const cx0 = Math.max(0, sg.bx0 - m), cx1 = Math.min(w, sg.bx1 + m), cy0 = Math.max(0, sg.by0 - m), cy1 = Math.min(h, sg.by1 + m);
      const cw = cx1 - cx0, ch = cy1 - cy0;
      const vm = new Uint8Array(cw * ch), rgb = new Uint8ClampedArray(cw * ch * 3);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const gx = cx0 + x, gy = cy0 + y, gi = gy * w + gx, li = y * cw + x;
        vm[li] = gx >= x0 && gx < x1 && gy >= y0 && gy < y1 && mask[gi] ? 1 : 0;
        rgb[li * 3] = data[gi * 4]; rgb[li * 3 + 1] = data[gi * 4 + 1]; rgb[li * 3 + 2] = data[gi * 4 + 2];
      }
      const v = { seg: s, w: cw, h: ch, mask: vm, rgb };
      v.bx0 = sg.bx0 - cx0; v.bx1 = sg.bx1 - cx0; v.by0 = sg.by0 - cy0; v.by1 = sg.by1 - cy0;
      v.hb = v.by1 - v.by0; v.cx = (v.bx0 + v.bx1) / 2; v.bottom = v.by1;
      v.tex = fillTexture(v);
      v.sat = buildSAT(vm, cw, ch);
      list.push(v);
    }
    return list;
  }

  /* ====================================================================
     4. Cartes de couverture, alignement, orientation des profils
     ==================================================================== */
  function coverage(v, sign, shiftVox, half, n, Hv, vs) {
    const out = new Float32Array(Hv * n);
    for (let rf = 0; rf < Hv; rf++) {
      const r0 = v.bottom - ((rf + 1) * vs) / v.sc, r1 = v.bottom - (rf * vs) / v.sc;
      for (let i = 0; i < n; i++) {
        const A0 = (i - half - shiftVox) * vs, A1 = (i + 1 - half - shiftVox) * vs;
        let c0 = v.cx + (sign * A0) / v.sc, c1 = v.cx + (sign * A1) / v.sc;
        if (c0 > c1) { const t = c0; c0 = c1; c1 = t; }
        out[rf * n + i] = boxCov(v.sat, v.w, v.h, c0, r0, c1, r1);
      }
    }
    return out;
  }

  function mirrorMap(M, Hv, n) {
    const o = new Float32Array(M.length);
    for (let r = 0; r < Hv; r++) for (let i = 0; i < n; i++) o[r * n + i] = M[r * n + n - 1 - i];
    return o;
  }

  function bestShift(A, Bm, Hv, n, maxShift) {
    let best = 0, bestIoU = -1;
    const order = [0];
    for (let k = 1; k <= maxShift; k++) order.push(k, -k);
    for (const d of order) {
      let inter = 0, uni = 0;
      for (let r = 0; r < Hv; r++) {
        const o = r * n;
        for (let i = 0; i < n; i++) {
          const a = A[o + i] >= 0.5, j = i - d;
          const b = j >= 0 && j < n ? Bm[o + j] >= 0.5 : false;
          if (a && b) inter++;
          if (a || b) uni++;
        }
      }
      const iou = uni ? inter / uni : 0;
      if (iou > bestIoU + 1e-6) { bestIoU = iou; best = d; }
    }
    return { shift: best, iou: bestIoU };
  }

  function colorDist(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) / 441;
  }
  function texAvg(v, c0, c1, r) {
    const w = v.w, h = v.h;
    const y = clamp(Math.round(r - 0.5), 0, h - 1);
    let sr = 0, sg = 0, sb = 0, k = 0;
    for (let c = Math.round(c0); c <= Math.round(c1); c++) {
      const x = clamp(c, 0, w - 1), i = (y * w + x) * 3;
      sr += v.tex[i]; sg += v.tex[i + 1]; sb += v.tex[i + 2]; k++;
    }
    return k ? [sr / k, sg / k, sb / k] : null;
  }
  function centerColor(v, t) {
    const r = v.bottom - t * v.hb;
    const y = clamp(Math.round(r - 0.5), 0, v.h - 1);
    const xc = Math.round(v.cx - 0.5);
    if (!v.mask[y * v.w + clamp(xc, 0, v.w - 1)]) return null;
    const half = Math.max(1, 0.03 * (v.bx1 - v.bx0));
    return texAvg(v, v.cx - half, v.cx + half, r);
  }
  function endColors(v, t) {
    const r = v.bottom - t * v.hb;
    const y = clamp(Math.round(r - 0.5), 0, v.h - 1);
    let cmin = -1, cmax = -1;
    for (let x = 0; x < v.w; x++) if (v.mask[y * v.w + x]) { if (cmin < 0) cmin = x; cmax = x; }
    if (cmin < 0 || cmax - cmin < 9) return null;
    return { left: texAvg(v, cmin + 3, cmin + 5, r), right: texAvg(v, cmax - 5, cmax - 3, r) };
  }
  function facingCosts(F, B, S) {
    let costL = 0, costR = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      const t = 0.03 + (0.94 * k) / 39;
      const cf = centerColor(F, t), cb = centerColor(B, t);
      if (!cf || !cb) continue;
      const e = endColors(S, t);
      if (!e) continue;
      costL += colorDist(cf, e.left) + colorDist(cb, e.right);
      costR += colorDist(cf, e.right) + colorDist(cb, e.left);
      n++;
    }
    return { costL, costR, n };
  }

  /* Decide dans quel sens regardent les deux profils (-1 = vers la gauche de l'image). */
  function decideSides(F, B, L, R, mapLp, mapRp, Hv, n, maxShift) {
    const same = bestShift(mapLp, mapRp, Hv, n, maxShift).iou;
    const mirr = bestShift(mirrorMap(mapLp, Hv, n), mapRp, Hv, n, maxShift).iou;
    const useSame = same > mirr + 0.03;
    const cL = facingCosts(F, B, L), cR = facingCosts(F, B, R);
    let costA, costB, A, Bh;
    if (!useSame) { costA = cL.costL + cR.costR; costB = cL.costR + cR.costL; A = [-1, 1]; Bh = [1, -1]; }
    else { costA = cL.costR + cR.costR; costB = cL.costL + cR.costL; A = [1, 1]; Bh = [-1, -1]; }
    const tot = costA + costB;
    const rel = tot > 0 ? (costB - costA) / tot : 0;
    let pick = A;
    if (Math.abs(rel) >= 0.06) pick = rel > 0 ? A : Bh;
    return { fL: pick[0], fR: pick[1], useSame, same, mirr, rel };
  }

  /* ====================================================================
     5. Volume : sections elliptiques par rangee, lissage, socle
     ==================================================================== */
  function rowRuns(cov, off, n) {
    let runs = [];
    let i = 0;
    while (i < n) {
      if (cov[off + i] >= 0.5) {
        let j = i;
        while (j < n && cov[off + j] >= 0.5) j++;
        const cL = i > 0 ? cov[off + i - 1] : 0, cR = j < n ? cov[off + j] : 0;
        let e0 = i + 1 - cov[off + i] - cL;
        let e1 = j - 1 + cov[off + j - 1] + cR;
        const mid = (e0 + e1) / 2;
        if (e1 - e0 < 0.5) { e0 = mid - 0.25; e1 = mid + 0.25; }
        runs.push([e0, e1]);
        i = j;
      } else i++;
    }
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= 1.0) last[1] = r[1]; else merged.push([r[0], r[1]]);
    }
    return merged;
  }

  function gaussian3(f, nx, ny, nz, sigma) {
    if (sigma < 0.3) return f;
    const r = Math.max(1, Math.ceil(sigma * 2.6));
    const k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    let x0 = nx, x1 = -1, y0 = ny, y1 = -1, z0 = nz, z1 = -1;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
      const o = nx * (y + ny * z);
      for (let x = 0; x < nx; x++) if (f[o + x] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    }
    if (x1 < 0) return f;
    x0 = Math.max(0, x0 - r); x1 = Math.min(nx - 1, x1 + r);
    y0 = Math.max(0, y0 - r); y1 = Math.min(ny - 1, y1 + r);
    z0 = Math.max(0, z0 - r); z1 = Math.min(nz - 1, z1 + r);
    const tmp = new Float32Array(f.length);
    const pass = (src, dst, axis) => {
      const stride = axis === 0 ? 1 : axis === 1 ? nx : nx * ny;
      const len = axis === 0 ? nx : axis === 1 ? ny : nz;
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
        let i = x0 + nx * (y + ny * z);
        for (let x = x0; x <= x1; x++, i++) {
          const pos = axis === 0 ? x : axis === 1 ? y : z;
          const lo = Math.max(-r, -pos), hi = Math.min(r, len - 1 - pos);
          let acc = 0;
          for (let d = lo; d <= hi; d++) acc += src[i + d * stride] * k[d + r];
          dst[i] = acc;
        }
      }
    };
    pass(f, tmp, 0);
    pass(tmp, f, 1);
    pass(f, tmp, 2);
    return tmp;
  }

  /* Socle : cylindre ou bloc a bords arrondis, valeur douce 0..1 (iso 0,5 sur la surface). */
  function makeBase(kind, cx, cz, R, y0, hb) {
    const hh = hb / 2, ymid = y0 + hh, rr = Math.min(hh * 0.8, 2.2);
    return function (x, y, z) {
      const dx = x - cx, dz = z - cz, dy = Math.abs(y - ymid) - (hh - rr);
      let out;
      if (kind === 'square') {
        const qx = Math.abs(dx) - (R - rr), qz = Math.abs(dz) - (R - rr);
        const ox = Math.max(qx, 0), oy = Math.max(dy, 0), oz = Math.max(qz, 0);
        out = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, dy, qz), 0) - rr;
      } else {
        const qx = Math.sqrt(dx * dx + dz * dz) - (R - rr);
        const ox = Math.max(qx, 0), oy = Math.max(dy, 0);
        out = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, dy), 0) - rr;
      }
      return clamp(0.5 - out, 0, 1);
    };
  }

  /* ====================================================================
     6. Surface Nets : iso-surface lisse sans tables
     ==================================================================== */
  function Grow(T, cap) { this.T = T; this.a = new T(cap); this.n = 0; }
  Grow.prototype.push = function (v) {
    if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  };

  function surfaceNets(f, nx, ny, nz, iso) {
    const cx = nx - 1, cy = ny - 1, cz = nz - 1;
    const cell = new Int32Array(cx * cy * cz).fill(-1);
    const pos = new Grow(Float32Array, 1 << 16);
    const sy = nx, sz = nx * ny;
    const E = [];
    for (let i = 0; i < 8; i++) for (let b = 1; b <= 4; b <<= 1) { const j = i ^ b; if (i < j) E.push(i, j); }
    const val = new Float32Array(8);
    let nv = 0;
    for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) {
      let base = nx * (y + ny * z);
      for (let x = 0; x < cx; x++, base++) {
        const v0 = f[base], v1 = f[base + 1], v2 = f[base + sy], v3 = f[base + sy + 1];
        const v4 = f[base + sz], v5 = f[base + sz + 1], v6 = f[base + sz + sy], v7 = f[base + sz + sy + 1];
        const mask = (v0 >= iso ? 1 : 0) | (v1 >= iso ? 2 : 0) | (v2 >= iso ? 4 : 0) | (v3 >= iso ? 8 : 0) |
          (v4 >= iso ? 16 : 0) | (v5 >= iso ? 32 : 0) | (v6 >= iso ? 64 : 0) | (v7 >= iso ? 128 : 0);
        if (mask === 0 || mask === 255) continue;
        val[0] = v0; val[1] = v1; val[2] = v2; val[3] = v3; val[4] = v4; val[5] = v5; val[6] = v6; val[7] = v7;
        let sx = 0, sy2 = 0, sz2 = 0, cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = E[e], b = E[e + 1];
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = (iso - val[a]) / (val[b] - val[a]);
          const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1, bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
          sx += ax + (bx - ax) * t; sy2 += ay + (by - ay) * t; sz2 += az + (bz - az) * t; cnt++;
        }
        cell[x + cx * (y + cy * z)] = nv++;
        pos.push(x + sx / cnt); pos.push(y + sy2 / cnt); pos.push(z + sz2 / cnt);
      }
    }
    if (!nv) throw new Error('Aucun volume détecté.');
    const P = pos.a;
    const idx = new Grow(Uint32Array, 1 << 17);
    const cstr = [1, cx, cx * cy];
    const emit = (axis, cb, lowerInside) => {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const A = cell[cb - cstr[u] - cstr[v]], B = cell[cb - cstr[v]], C = cell[cb], D = cell[cb - cstr[u]];
      let q0, q1, q2, q3;
      if (lowerInside) { q0 = A; q1 = B; q2 = C; q3 = D; } else { q0 = A; q1 = D; q2 = C; q3 = B; }
      const d02 = sq(P, q0, q2), d13 = sq(P, q1, q3);
      if (d02 <= d13) { idx.push(q0); idx.push(q1); idx.push(q2); idx.push(q0); idx.push(q2); idx.push(q3); }
      else { idx.push(q0); idx.push(q1); idx.push(q3); idx.push(q1); idx.push(q2); idx.push(q3); }
    };
    function sq(Pp, a, b) {
      const dx = Pp[a * 3] - Pp[b * 3], dy = Pp[a * 3 + 1] - Pp[b * 3 + 1], dz = Pp[a * 3 + 2] - Pp[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    }
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) {
      let p = nx * (y + ny * z);
      for (let x = 0; x < nx; x++, p++) {
        const a0 = f[p] >= iso;
        if (x < nx - 1 && (f[p + 1] >= iso) !== a0 && y >= 1 && z >= 1 && y < cy && z < cz) emit(0, x + cx * (y + cy * z), a0);
        if (y < ny - 1 && (f[p + sy] >= iso) !== a0 && z >= 1 && x >= 1 && z < cz && x < cx) emit(1, x + cx * (y + cy * z), a0);
        if (z < nz - 1 && (f[p + sz] >= iso) !== a0 && x >= 1 && y >= 1 && x < cx && y < cy) emit(2, x + cx * (y + cy * z), a0);
      }
    }
    return { positions: pos.a.slice(0, nv * 3), indices: idx.a.slice(0, idx.n) };
  }

  function computeNormals(p, ix) {
    const n = new Float32Array(p.length);
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }

  /* ====================================================================
     7. Couleurs des sommets, par projection des 4 vues
     ==================================================================== */
  function bil(v, c, r, out) {
    const w = v.w, h = v.h;
    let x = c - 0.5, y = r - 0.5;
    x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0, t = v.tex;
    const i00 = (y0 * w + x0) * 3, i10 = (y0 * w + x1) * 3, i01 = (y1 * w + x0) * 3, i11 = (y1 * w + x1) * 3;
    for (let ch = 0; ch < 3; ch++) {
      out[ch] = (t[i00 + ch] * (1 - fx) + t[i10 + ch] * fx) * (1 - fy) + (t[i01 + ch] * (1 - fx) + t[i11 + ch] * fx) * fy;
    }
  }
  function sampleView(v, A, Y, vs, out) {
    const c = v.cx + (v.sign * (A - v.shift * vs)) / v.sc;
    const r = v.bottom - Y / v.sc;
    const ppv = vs / v.sc;
    if (ppv < 1.6) { bil(v, c, r, out); return; }
    const k = ppv / 3, tmp = [0, 0, 0];
    out[0] = out[1] = out[2] = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      bil(v, c + i * k, r + j * k, tmp);
      out[0] += tmp[0]; out[1] += tmp[1]; out[2] += tmp[2];
    }
    out[0] /= 9; out[1] /= 9; out[2] /= 9;
  }

  function colorVertices(views, vs, G, yf0, pos, nrm, baseFn, baseColor) {
    const nv = pos.length / 3;
    const colors = new Uint8Array(nv * 3);
    const F = views.front, B = views.back, L = views.left, R = views.right;
    const acc = [0, 0, 0], tmp = [0, 0, 0];
    const gam = 3;
    for (let i = 0; i < nv; i++) {
      const gx = pos[i * 3], gy = pos[i * 3 + 1], gz = pos[i * 3 + 2];
      if (baseFn && baseFn(gx, gy, gz) >= 0.45) {
        colors[i * 3] = baseColor[0]; colors[i * 3 + 1] = baseColor[1]; colors[i * 3 + 2] = baseColor[2];
        continue;
      }
      const nx = nrm[i * 3], nz = nrm[i * 3 + 2];
      const wF = Math.pow(Math.max(0, nz), gam), wB = Math.pow(Math.max(0, -nz), gam);
      const wL = Math.pow(Math.max(0, nx), gam), wR = Math.pow(Math.max(0, -nx), gam);
      let sw = wF + wB + wL + wR;
      const X = (gx - G.x / 2) * vs, Y = (gy - yf0) * vs, Z = (gz - G.z / 2) * vs;
      acc[0] = acc[1] = acc[2] = 0;
      const add = (v, A, w) => {
        if (w <= 0) return;
        sampleView(v, A, Y, vs, tmp);
        acc[0] += tmp[0] * w; acc[1] += tmp[1] * w; acc[2] += tmp[2] * w;
      };
      if (sw < 1e-4) { sw = 4; add(F, X, 1); add(B, X, 1); add(L, Z, 1); add(R, Z, 1); }
      else { add(F, X, wF); add(B, X, wB); add(L, Z, wL); add(R, Z, wR); }
      colors[i * 3] = clamp(Math.round(acc[0] / sw), 0, 255);
      colors[i * 3 + 1] = clamp(Math.round(acc[1] / sw), 0, 255);
      colors[i * 3 + 2] = clamp(Math.round(acc[2] / sw), 0, 255);
    }
    return colors;
  }

  /* ====================================================================
     8. Reconstruction complete
     ==================================================================== */
  const DEFAULTS = { detail: 144, roundness: 0.7, smooth: 0.4, base: 'round', baseScale: 1, baseColor: [58, 60, 66], flipSides: false, keepField: false };

  async function reconstruct(views, opts, progress) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const step = async (m) => { if (progress) await progress(m); };
    const F = views.front, B = views.back, L = views.left, R = views.right;
    const all = [F, B, L, R];
    for (const v of all) if (!v) throw new Error('Il manque une vue (face, dos, gauche ou droite).');

    await step('Alignement des vues…');
    const hs = all.map((v) => v.hb).sort((a, b) => a - b);
    const Hf = (hs[1] + hs[2]) / 2;
    for (const v of all) v.sc = Hf / v.hb;
    const Hv = clamp(Math.round(o.detail), 48, 280);
    const vs = Hf / Hv;
    const halfX = Math.ceil(Math.max(F.w * F.sc, B.w * B.sc) / 2 / vs) + 4;
    const halfZ = Math.ceil(Math.max(L.w * L.sc, R.w * R.sc) / 2 / vs) + 4;
    const Wf = 2 * halfX, Zf = 2 * halfZ;
    const maxShiftX = Math.max(3, Math.round(0.06 * Wf)), maxShiftZ = Math.max(3, Math.round(0.06 * Zf));

    F.sign = 1; B.sign = -1; F.shift = 0;
    const mapF = coverage(F, 1, 0, halfX, Wf, Hv, vs);
    const mapB0 = coverage(B, -1, 0, halfX, Wf, Hv, vs);
    const sb = bestShift(mapF, mapB0, Hv, Wf, maxShiftX);
    B.shift = sb.shift;
    const mapB = coverage(B, -1, B.shift, halfX, Wf, Hv, vs);

    const mapLp = coverage(L, 1, 0, halfZ, Zf, Hv, vs);
    const mapRp = coverage(R, 1, 0, halfZ, Zf, Hv, vs);
    const dec = decideSides(F, B, L, R, mapLp, mapRp, Hv, Zf, maxShiftZ);
    let fL = dec.fL, fR = dec.fR;
    if (o.flipSides) { fL = -fL; fR = -fR; }
    L.sign = fL; R.sign = fR; L.shift = 0;
    const mapL = fL === 1 ? mapLp : coverage(L, fL, 0, halfZ, Zf, Hv, vs);
    const mapR0 = coverage(R, fR, 0, halfZ, Zf, Hv, vs);
    const sr = bestShift(mapL, mapR0, Hv, Zf, maxShiftZ);
    R.shift = sr.shift;
    const mapR = coverage(R, fR, R.shift, halfZ, Zf, Hv, vs);

    await step('Volume…');
    const covXmin = new Float32Array(mapF.length), covXmax = new Float32Array(mapF.length);
    for (let i = 0; i < mapF.length; i++) { covXmin[i] = Math.min(mapF[i], mapB[i]); covXmax[i] = Math.max(mapF[i], mapB[i]); }
    const covZmin = new Float32Array(mapL.length), covZmax = new Float32Array(mapL.length);
    for (let i = 0; i < mapL.length; i++) { covZmin[i] = Math.min(mapL[i], mapR[i]); covZmax[i] = Math.max(mapL[i], mapR[i]); }

    const runsX = new Array(Hv), runsZ = new Array(Hv);
    for (let rf = 0; rf < Hv; rf++) {
      let rx = rowRuns(covXmin, rf * Wf, Wf); if (!rx.length) rx = rowRuns(covXmax, rf * Wf, Wf);
      let rz = rowRuns(covZmin, rf * Zf, Zf); if (!rz.length) rz = rowRuns(covZmax, rf * Zf, Zf);
      runsX[rf] = rx; runsZ[rf] = rz;
    }
    const ok = (rf) => runsX[rf].length > 0 && runsZ[rf].length > 0;
    const maxGap = Math.max(3, Math.round(0.08 * Hv));
    for (let rf = 0; rf < Hv; rf++) {
      if (ok(rf) || (!runsX[rf].length && !runsZ[rf].length)) continue;
      let best = -1;
      for (let d = 1; d <= maxGap; d++) {
        if (rf - d >= 0 && ok(rf - d)) { best = rf - d; break; }
        if (rf + d < Hv && ok(rf + d)) { best = rf + d; break; }
      }
      if (best >= 0) { if (!runsX[rf].length) runsX[rf] = runsX[best]; if (!runsZ[rf].length) runsZ[rf] = runsZ[best]; }
    }
    let anyRow = false;
    for (let rf = 0; rf < Hv; rf++) if (ok(rf)) { anyRow = true; break; }
    if (!anyRow) throw new Error("Les vues ne se recoupent pas : vérifie l'ordre des vues.");

    /* Empreinte des pieds, pour dimensionner le socle. */
    const footRows = Math.max(2, Math.round(0.1 * Hv));
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (let rf = 0; rf < footRows; rf++) {
      if (!ok(rf)) continue;
      for (const r of runsX[rf]) { xmin = Math.min(xmin, r[0]); xmax = Math.max(xmax, r[1]); }
      for (const r of runsZ[rf]) { zmin = Math.min(zmin, r[0]); zmax = Math.max(zmax, r[1]); }
    }
    if (!isFinite(xmin)) {
      for (let rf = 0; rf < Hv; rf++) {
        if (!ok(rf)) continue;
        for (const r of runsX[rf]) { xmin = Math.min(xmin, r[0]); xmax = Math.max(xmax, r[1]); }
        for (const r of runsZ[rf]) { zmin = Math.min(zmin, r[0]); zmax = Math.max(zmax, r[1]); }
      }
    }
    const xb = (xmin + xmax) / 2, zb = (zmin + zmax) / 2;
    const ax = (xmax - xmin) / 2, az = (zmax - zmin) / 2;
    const withBase = o.base !== 'none';
    const Rb = Math.max(ax, az) * 1.18 * o.baseScale + 3;

    const PAD = 6;
    const hb = withBase ? Math.max(4, Math.round(0.075 * Hv)) : 0;
    const emb = withBase ? 2 : 0;
    const yf0 = PAD + hb - emb;
    const Gy = yf0 + Hv + PAD;
    const Ex = withBase ? Math.max(halfX, Math.abs(xb - halfX) + Rb + 2) : halfX;
    const Ez = withBase ? Math.max(halfZ, Math.abs(zb - halfZ) + Rb + 2) : halfZ;
    const gxHalf = Math.ceil(Ex) + PAD, gzHalf = Math.ceil(Ez) + PAD;
    const Gx = 2 * gxHalf, Gz = 2 * gzHalf;
    const ox = gxHalf - halfX, oz = gzHalf - halfZ;
    const bcx = xb + ox, bcz = zb + oz;

    const p = 2 + 8 * (1 - o.roundness) * (1 - o.roundness);
    const centers = [];
    for (let rf = Math.round(0.2 * Hv); rf < Math.round(0.85 * Hv); rf++) {
      if (!ok(rf)) continue;
      let lo = Infinity, hi = -Infinity;
      for (const r of runsZ[rf]) { lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]); }
      centers.push((lo + hi) / 2);
    }
    centers.sort((a, b) => a - b);
    const zcBody = centers.length ? centers[centers.length >> 1] : zb;
    let field = new Float32Array(Gx * Gy * Gz);
    const xi = new Int16Array(Wf), zi = new Int16Array(Zf);
    for (let rf = 0; rf < Hv; rf++) {
      if (!ok(rf)) continue;
      const rx = runsX[rf], rz = runsZ[rf];
      xi.fill(-1); zi.fill(-1);
      for (let k = 0; k < rx.length; k++) {
        const a = Math.max(0, Math.ceil(rx[k][0] - 0.5)), b = Math.min(Wf - 1, Math.floor(rx[k][1] - 0.5));
        for (let i = a; i <= b; i++) xi[i] = k;
      }
      for (let k = 0; k < rz.length; k++) {
        const a = Math.max(0, Math.ceil(rz[k][0] - 0.5)), b = Math.min(Zf - 1, Math.floor(rz[k][1] - 0.5));
        for (let i = a; i <= b; i++) zi[i] = k;
      }
      // Bras et appendices etroits a cote d'un tronc : leur profondeur est plafonnee, progressivement,
      // et centree sur la profondeur moyenne du corps (sinon ils prennent celle du tronc, sac a dos compris).
      let wmax = 0;
      for (const r of rx) wmax = Math.max(wmax, r[1] - r[0]);
      const capB = new Float32Array(rx.length), capS = new Float32Array(rx.length);
      for (let k = 0; k < rx.length; k++) {
        const wk = rx[k][1] - rx[k][0];
        const s = clamp((0.55 - wk / wmax) / 0.25, 0, 1);
        capS[k] = s; capB[k] = 1.3 * (wk / 2);
      }
      const gy = yf0 + rf;
      for (let iz = 0; iz < Zf; iz++) {
        const kz = zi[iz];
        if (kz < 0) continue;
        const z0 = rz[kz][0], z1 = rz[kz][1], zc = (z0 + z1) / 2;
        const bz = (z1 - z0) / 2, dz = iz + 0.5 - zc, vv = Math.abs(dz) / bz;
        const vp = Math.pow(vv, p);
        for (let ix = 0; ix < Wf; ix++) {
          const kx = xi[ix];
          if (kx < 0) continue;
          const x0 = rx[kx][0], x1 = rx[kx][1];
          const aa = (x1 - x0) / 2, dx = ix + 0.5 - (x0 + x1) / 2, uu = Math.abs(dx) / aa;
          let dzk = dz, vqk = vv, vpk = vp;
          const s = capS[kx];
          if (s > 0 && capB[kx] < bz) {
            const bEff = bz * (1 - s) + capB[kx] * s;
            const zcEff = clamp(zcBody, z0 + bEff, z1 - bEff);
            dzk = iz + 0.5 - (zc * (1 - s) + zcEff * s);
            vqk = Math.abs(dzk) / bEff; vpk = Math.pow(vqk, p);
          }
          const q = p === 2 ? Math.sqrt(uu * uu + vqk * vqk) : Math.pow(Math.pow(uu, p) + vpk, 1 / p);
          let val;
          if (q <= 1e-6) val = 1;
          else val = clamp(0.5 + Math.sqrt(dx * dx + dzk * dzk) * (1 / q - 1), 0, 1);
          field[(ix + ox) + Gx * (gy + Gy * (iz + oz))] = val;
        }
      }
    }

    await step('Lissage…');
    const sigma = 0.5 + 2.0 * o.smooth;
    field = gaussian3(field, Gx, Gy, Gz, sigma);
    dropSmallParts(field, Gx, Gy, Gz, 0.5, 0.03);

    let baseFn = null;
    if (withBase) {
      await step('Socle…');
      baseFn = makeBase(o.base, bcx, bcz, o.base === 'square' ? Rb * 0.95 : Rb, PAD, hb);
      const bx0 = Math.max(0, Math.floor(bcx - Rb - 2)), bx1 = Math.min(Gx - 1, Math.ceil(bcx + Rb + 2));
      const bz0 = Math.max(0, Math.floor(bcz - Rb - 2)), bz1 = Math.min(Gz - 1, Math.ceil(bcz + Rb + 2));
      for (let z = bz0; z <= bz1; z++) for (let y = PAD - 1; y <= PAD + hb; y++) for (let x = bx0; x <= bx1; x++) {
        const v = baseFn(x + 0.5, y + 0.5, z + 0.5);
        if (v <= 0) continue;
        const i = x + Gx * (y + Gy * z);
        if (v > field[i]) field[i] = v;
      }
    }

    await step('Maillage…');
    const sn = surfaceNets(field, Gx, Gy, Gz, 0.5);
    const nv = sn.positions.length / 3;
    const grid = new Float32Array(nv * 3);
    for (let i = 0; i < grid.length; i++) grid[i] = sn.positions[i] + 0.5;
    const nrm = computeNormals(grid, sn.indices);

    await step('Couleurs…');
    const colors = colorVertices(views, vs, { x: Gx, z: Gz }, yf0, grid, nrm, baseFn, o.baseColor);

    const yBottom = withBase ? PAD : yf0;
    const positions = new Float32Array(nv * 3);
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = grid[i * 3] - bcx, y = grid[i * 3 + 1] - yBottom, z = grid[i * 3 + 2] - bcz;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    const res = {
      positions, normals: nrm, colors, indices: sn.indices,
      size: { x: mxx - mnx, y: mxy - mny, z: mxz - mnz },
      info: {
        Hv, vs, Hf, triangles: sn.indices.length / 3, vertices: nv,
        coherence: { fb: sb.iou, lr: sr.iou },
        facing: { left: fL, right: fR, sameDirection: dec.useSame, evidence: dec.rel, iouMirror: dec.mirr, iouSame: dec.same },
        grid: [Gx, Gy, Gz], hb, emb, yf0, withBase,
        origin: { x: bcx - Gx / 2, z: bcz - Gz / 2, yFeet: yf0 - yBottom },
      },
    };
    if (o.keepField) res.debug = { field, Gx, Gy, Gz, yf0, vs, Hv };
    return res;
  }

  /* ====================================================================
     8b. Reconstruction multi-angles (N vues regulierement reparties autour du personnage)
     La vue k est prise a l'azimut 2*pi*k/N : 0 = face, puis cote gauche du personnage, dos, cote droit.
     ==================================================================== */
  function mkRes(views, Hf, Hv) {
    const vs = Hf / Hv;
    let wmax = 0;
    for (const v of views) wmax = Math.max(wmax, v.w * v.sc);
    const half = Math.ceil(wmax / 2 / vs) + 4, n = 2 * half;
    for (const v of views) v.cov = coverage(v, 1, 0, half, n, Hv, vs);
    return { Hv, vs, half, n };
  }

  /* Un tour d'alignement : chaque vue est recalee sur le volume construit avec toutes les AUTRES vues. */
  function alignRound(views, R, ths, sh, vert) {
    const { Hv, n, half } = R, N = views.length;
    const c = ths.map(Math.cos), s = ths.map(Math.sin);
    const projs = views.map(() => new Float32Array(Hv * n));
    const cov = views.map((v) => v.cov);
    for (let rf = 0; rf < Hv; rf++) {
      const rb = rf * n;
      for (let iz = 0; iz < n; iz++) {
        const Z = iz + 0.5 - half;
        for (let ix = 0; ix < n; ix++) {
          const X = ix + 0.5 - half;
          let miss = 0, who = -1;
          for (let k = 0; k < N; k++) {
            const u = X * c[k] - Z * s[k] - sh[k] + half - 0.5;
            const i0 = Math.floor(u), f = u - i0;
            const a = i0 >= 0 && i0 < n ? cov[k][rb + i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < n ? cov[k][rb + i0 + 1] : 0;
            if (a * (1 - f) + b * f < 0.5) { miss++; who = k; if (miss > 1) break; }
          }
          if (miss > 1) continue;
          for (let k = 0; k < N; k++) {
            if (miss === 1 && who !== k) continue;
            const u = X * c[k] - Z * s[k] + half - 0.5;
            const i0 = Math.floor(u);
            if (i0 >= 0 && i0 < n) projs[k][rb + i0] = 1;
            if (i0 + 1 >= 0 && i0 + 1 < n) projs[k][rb + i0 + 1] = 1;
          }
        }
      }
    }
    const maxShift = Math.max(3, Math.round(0.12 * n));
    const out = new Array(N), ious = new Array(N);
    const dyMax = Math.max(2, Math.round(0.045 * Hv));
    for (let k = 0; k < N; k++) {
      const v = views[k];
      if (vert) {
        // decalage vertical et leger changement d'echelle de la vue (cadrages qui different d'une vue a l'autre)
        let best = null;
        for (const m of [0.97, 0.985, 1, 1.015, 1.03]) for (let dy = -dyMax; dy <= dyMax; dy++) {
          v.sc = v.sc0 * m; v.bottom = v.bottom0 + (dy * R.vs) / v.sc;
          const cv = coverage(v, 1, 0, half, n, Hv, R.vs);
          const r = bestShift(projs[k], cv, Hv, n, maxShift);
          const score = r.iou - 0.05 * Math.abs(m - 1) - 0.0005 * Math.abs(dy);
          if (!best || score > best.score) best = { score, iou: r.iou, shift: r.shift, sc: v.sc, bottom: v.bottom, cv };
        }
        v.sc = best.sc; v.bottom = best.bottom; v.cov = best.cv;
        out[k] = best.shift; ious[k] = best.iou;
      } else {
        const r = bestShift(projs[k], v.cov, Hv, n, maxShift);
        out[k] = r.shift; ious[k] = r.iou;
      }
    }
    return { sh: out, ious };
  }

  function colorVerticesN(views, ths, vs, G, yf0, pos, nrm, baseFn, baseColor, gam) {
    const nv = pos.length / 3, N = views.length;
    const colors = new Uint8Array(nv * 3);
    const c = ths.map(Math.cos), s = ths.map(Math.sin);
    const acc = [0, 0, 0], tmp = [0, 0, 0], w = new Float32Array(N);
    for (let i = 0; i < nv; i++) {
      const gx = pos[i * 3], gy = pos[i * 3 + 1], gz = pos[i * 3 + 2];
      if (baseFn && baseFn(gx, gy, gz) >= 0.45) {
        colors[i * 3] = baseColor[0]; colors[i * 3 + 1] = baseColor[1]; colors[i * 3 + 2] = baseColor[2];
        continue;
      }
      const nx = nrm[i * 3], nz = nrm[i * 3 + 2];
      let sw = 0;
      for (let k = 0; k < N; k++) { const d = nx * s[k] + nz * c[k]; w[k] = d > 0 ? Math.pow(d, gam) : 0; sw += w[k]; }
      const X = (gx - G.x / 2) * vs, Y = (gy - yf0) * vs, Z = (gz - G.z / 2) * vs;
      acc[0] = acc[1] = acc[2] = 0;
      if (sw < 1e-4) { for (let k = 0; k < N; k++) w[k] = 1; sw = N; }
      for (let k = 0; k < N; k++) {
        if (w[k] <= 0) continue;
        sampleView(views[k], X * c[k] - Z * s[k], Y, vs, tmp);
        acc[0] += tmp[0] * w[k]; acc[1] += tmp[1] * w[k]; acc[2] += tmp[2] * w[k];
      }
      colors[i * 3] = clamp(Math.round(acc[0] / sw), 0, 255);
      colors[i * 3 + 1] = clamp(Math.round(acc[1] / sw), 0, 255);
      colors[i * 3 + 2] = clamp(Math.round(acc[2] / sw), 0, 255);
    }
    return colors;
  }

  /* Coherence des couleurs entre vues voisines sur la surface du volume : sert a departager les deux sens de rotation
     (les silhouettes seules ne le permettent pas : inverser le sens revient a retourner le volume d'avant en arriere). */
  function colorConsistency(views, R, ths, sh) {
    const { Hv, n, half, vs } = R, N = views.length;
    const c = ths.map(Math.cos), s = ths.map(Math.sin);
    const occ = new Uint8Array(n * Hv * n);
    const id = (ix, rf, iz) => ix + n * (rf + Hv * iz);
    for (let rf = 0; rf < Hv; rf++) {
      const rb = rf * n;
      for (let iz = 0; iz < n; iz++) {
        const Z = iz + 0.5 - half;
        for (let ix = 0; ix < n; ix++) {
          const X = ix + 0.5 - half;
          let ok = 1;
          for (let k = 0; k < N; k++) {
            const u = X * c[k] - Z * s[k] - sh[k] + half - 0.5;
            const i0 = Math.floor(u), f = u - i0, cv = views[k].cov;
            const a = i0 >= 0 && i0 < n ? cv[rb + i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < n ? cv[rb + i0 + 1] : 0;
            if (a * (1 - f) + b * f < 0.5) { ok = 0; break; }
          }
          occ[id(ix, rf, iz)] = ok;
        }
      }
    }
    for (let k = 0; k < N; k++) { views[k].sign = 1; views[k].shift = sh[k]; }
    const col = Array.from({ length: N }, () => [0, 0, 0]);
    const ids = [];
    let total = 0, cnt = 0, tick = 0;
    for (let rf = 1; rf < Hv - 1; rf++) for (let iz = 1; iz < n - 1; iz++) for (let ix = 1; ix < n - 1; ix++) {
      if (!occ[id(ix, rf, iz)]) continue;
      let nx = 0, ny = 0, nz = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx | dy | dz) === 0) continue;
        if (!occ[id(ix + dx, rf + dy, iz + dz)]) { nx += dx; ny += dy; nz += dz; }
      }
      const l = Math.hypot(nx, ny, nz);
      if (l < 1.5) continue;
      if ((tick++ % 3) !== 0) continue;
      nx /= l; nz /= l;
      ids.length = 0;
      for (let k = 0; k < N; k++) if (nx * s[k] + nz * c[k] > 0.65) ids.push(k);
      if (ids.length < 2) continue;
      const X = ix + 0.5 - half, Z = iz + 0.5 - half;
      for (const k of ids) sampleView(views[k], (X * c[k] - Z * s[k]) * vs, (rf + 0.5) * vs, vs, col[k]);
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        total += colorDist(col[ids[a]], col[ids[b]]); cnt++;
      }
    }
    return cnt ? total / cnt : 1;
  }

  /* Recherche de l'azimut (et du decalage) de certaines vues : on projette le volume construit avec les autres vues. */
  function angleSearch(views, R, ths, sh, include, targets, range, step) {
    const { Hv, n, half } = R, N = views.length;
    const inc = []; for (let k = 0; k < N; k++) if (include[k]) inc.push(k);
    const c = ths.map(Math.cos), s = ths.map(Math.sin);
    const shared = [], own = new Map();
    for (const k of targets) own.set(k, []);
    for (let rf = 0; rf < Hv; rf++) {
      const rb = rf * n;
      for (let iz = 0; iz < n; iz++) {
        const Z = iz + 0.5 - half;
        for (let ix = 0; ix < n; ix++) {
          const X = ix + 0.5 - half;
          let miss = 0, who = -1;
          for (let q = 0; q < inc.length; q++) {
            const k = inc[q];
            const u = X * c[k] - Z * s[k] - sh[k] + half - 0.5;
            const i0 = Math.floor(u), f = u - i0, cv = views[k].cov;
            const a = i0 >= 0 && i0 < n ? cv[rb + i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < n ? cv[rb + i0 + 1] : 0;
            if (a * (1 - f) + b * f < 0.5) { miss++; who = k; if (miss > 1) break; }
          }
          if (miss === 0) shared.push(rf, X, Z);
          else if (miss === 1 && own.has(who)) own.get(who).push(rf, X, Z);
        }
      }
    }
    const outT = ths.slice(), outS = sh.slice(), maxShift = Math.max(3, Math.round(0.12 * n));
    for (const k of targets) {
      let best = null;
      const mine = own.get(k);
      for (let d = -range; d <= range + 1e-9; d += step) {
        const th = ths[k] + (d * Math.PI) / 180, ck = Math.cos(th), sk = Math.sin(th);
        const proj = new Float32Array(Hv * n);
        const put = (L) => {
          for (let q = 0; q < L.length; q += 3) {
            const u = L[q + 1] * ck - L[q + 2] * sk + half - 0.5, i0 = Math.floor(u), rb = L[q] * n;
            if (i0 >= 0 && i0 < n) proj[rb + i0] = 1;
            if (i0 + 1 >= 0 && i0 + 1 < n) proj[rb + i0 + 1] = 1;
          }
        };
        put(shared); put(mine);
        const r = bestShift(proj, views[k].cov, Hv, n, maxShift);
        const score = r.iou - 0.0004 * Math.abs(d);
        if (!best || score > best.score) best = { score, th, shift: r.shift, iou: r.iou };
      }
      outT[k] = best.th; outS[k] = best.shift;
    }
    return { ths: outT, sh: outS };
  }

  /* Sens de rotation d'apres les pieds des deux profils : la pointe du pied indique ou regarde le personnage.
     Renvoie > 0 si la vue N/4 regarde vers la gauche de l'image (sens normal), < 0 sinon, ~0 si indecis. */
  function footCue(views) {
    const N = views.length;
    if (N % 4) return 0;
    const cx = (v, t0, t1) => {
      let sx = 0, n = 0;
      for (let y = Math.max(0, Math.round(v.bottom - t1 * v.hb)); y < Math.min(v.h, Math.round(v.bottom - t0 * v.hb)); y++)
        for (let x = 0; x < v.w; x++) if (v.mask[y * v.w + x]) { sx += x; n++; }
      return n ? sx / n : null;
    };
    const off = (v) => {
      const f = cx(v, 0, 0.06), l = cx(v, 0.22, 0.5);
      return f === null || l === null ? 0 : (f - l) / v.hb;
    };
    return -off(views[N / 4]) + off(views[(3 * N) / 4]);
  }

  async function reconstructN(views, opts, progress) {
    const o = Object.assign({}, DEFAULTS, { direction: 'auto', tolerance: 'auto' }, opts || {});
    const step = async (m) => { if (progress) await progress(m); };
    const N = views.length;
    if (N < 4) throw new Error('Il faut au moins 4 vues.');

    await step('Alignement des vues…');
    const hs = views.map((v) => v.hb).sort((a, b) => a - b);
    const Hf = hs.length % 2 ? hs[hs.length >> 1] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2;
    for (const v of views) { v.sc = Hf / v.hb; v.sc0 = v.sc; if (v.bottom0 === undefined) v.bottom0 = v.bottom; v.bottom = v.bottom0; }
    const baseAng = o.angles && o.angles.length === N ? o.angles.map((d) => (d * Math.PI) / 180) : views.map((_, k) => (2 * Math.PI * k) / N);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const rounds = (R, ths, sh0, nr) => {
      let sh = sh0.slice(), last = null;
      for (let r = 0; r < nr; r++) { last = alignRound(views, R, ths, sh, true); sh = last.sh; }
      return { sh, ious: last.ious };
    };

    const R1 = mkRes(views, Hf, 56);
    const dirs = o.direction === 'auto' ? [1, -1] : [o.direction === -1 ? -1 : 1];
    const cands = [];
    const est = o.estimateAngles === true && N % 4 === 0 && !o.angles;
    const card = est ? [0, N / 4, N / 2, (3 * N) / 4] : [];
    const others = views.map((_, k) => k).filter((k) => !card.includes(k));
    const allOn = views.map(() => true);
    for (const sg of dirs) {
      let ths0 = baseAng.map((t) => sg * t), sh0 = new Array(N).fill(0);
      if (est) {
        // 1) les 4 vues cardinales (face, gauche, dos, droite) donnent un premier volume
        const sub = card.map((i) => views[i]), thc = card.map((i) => ths0[i]);
        let shc = [0, 0, 0, 0];
        for (let r = 0; r < 3; r++) shc = alignRound(sub, R1, thc, shc).sh;
        card.forEach((i, j) => { sh0[i] = shc[j]; });
        // 2) les vues intermediaires y sont recalees en angle, puis tout est affine
        let rs = angleSearch(views, R1, ths0, sh0, views.map((_, k) => card.includes(k)), others, 35, 5);
        ths0 = rs.ths; sh0 = rs.sh;
        sh0 = rounds(R1, ths0, sh0, 2).sh;
        rs = angleSearch(views, R1, ths0, sh0, allOn, others, 10, 2.5);
        ths0 = rs.ths; sh0 = rs.sh;
      }
      const r = rounds(R1, ths0, sh0, 3);
      cands.push({ sign: sg, ths: ths0, sh: r.sh, score: mean(r.ious), ious: r.ious, adj: views.map((v) => ({ sc: v.sc, bottom: v.bottom })) });
      for (const v of views) { v.sc = v.sc0; v.bottom = v.bottom0; }
    }
    let best = cands[0];
    const applyAdj = (cd) => { views.forEach((v, k) => { v.sc = cd.adj[k].sc; v.bottom = cd.adj[k].bottom; }); mkRes(views, Hf, 56); };
    if (cands.length === 2) {
      for (const cd of cands) { applyAdj(cd); cd.color = colorConsistency(views, R1, cd.ths, cd.sh); }
      const cue = footCue(views);
      if (Math.abs(cue) > 0.06) best = cue > 0 ? cands[0] : cands[1];
      else if (cands[1].color < cands[0].color * 0.82) best = cands[1];
      best.cue = cue;
    }
    applyAdj(best);
    const other = cands.find((q) => q !== best);
    best.alt = other ? other.score : null;
    best.colorScores = { chosen: best.color, other: other ? other.color : null };
    let ths = best.ths;
    const Hv = clamp(Math.round(o.detail), 48, 280);
    const vs = Hf / Hv;
    const R2 = mkRes(views, Hf, clamp(Hv, 64, 96));
    const sh2 = best.sh.map((d) => Math.round((d * R1.vs) / R2.vs));
    let shR2 = sh2;
    if (est) {
      const rs = angleSearch(views, R2, ths, shR2, allOn, others, 4, 1);
      ths = rs.ths; shR2 = rs.sh;
    }
    const fin = rounds(R2, ths, shR2, 2);
    const shiftV = fin.sh.map((d) => (d * R2.vs) / vs);
    const R = mkRes(views, Hf, Hv);
    const { half, n } = R;

    await step('Volume…');
    const c = ths.map(Math.cos), s = ths.map(Math.sin);
    const order = ths.map((t, k) => k).sort((a, b) => Math.abs(Math.sin(2 * ths[a])) - Math.abs(Math.sin(2 * ths[b])));
    const tol = o.tolerance === 'auto' ? (mean(fin.ious) < 0.88 ? 1 : 0) : (o.tolerance ? 1 : 0);
    const PAD = 6;
    const withBase = o.base !== 'none';
    const hb = withBase ? Math.max(4, Math.round(0.075 * Hv)) : 0;
    const emb = withBase ? 2 : 0;
    const yf0 = PAD + hb - emb;
    const Gy = yf0 + Hv + PAD;

    // champ sur la grille de travail (n x Hv x n), puis recopie dans la grille finale
    const work = new Float32Array(n * Hv * n);
    const covRows = order.map((k) => views[k].cov);
    const oc = order.map((k) => c[k]), os = order.map((k) => s[k]), osh = order.map((k) => shiftV[k]);
    for (let rf = 0; rf < Hv; rf++) {
      const rb = rf * n;
      for (let iz = 0; iz < n; iz++) {
        const Z = iz + 0.5 - half;
        for (let ix = 0; ix < n; ix++) {
          const X = ix + 0.5 - half;
          let m1 = 1, m2 = 1;
          for (let q = 0; q < N; q++) {
            const u = X * oc[q] - Z * os[q] - osh[q] + half - 0.5;
            const i0 = Math.floor(u), f = u - i0, cv = covRows[q];
            const a = i0 >= 0 && i0 < n ? cv[rb + i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < n ? cv[rb + i0 + 1] : 0;
            const val = a * (1 - f) + b * f;
            if (val < m1) { m2 = m1; m1 = val; } else if (val < m2) m2 = val;
            if ((tol ? m2 : m1) <= 0) break;
          }
          work[ix + n * (rf + Hv * iz)] = tol ? m2 : m1;
        }
      }
    }
    let any = false;
    for (let i = 0; i < work.length; i++) if (work[i] >= 0.5) { any = true; break; }
    if (!any) throw new Error("Les vues ne se recoupent pas : vérifie l'ordre des vues.");

    const footRows = Math.max(2, Math.round(0.1 * Hv));
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    const scan = (r0, r1) => {
      for (let rf = r0; rf < r1; rf++) for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) if (work[ix + n * (rf + Hv * iz)] >= 0.5) {
        if (ix < xmin) xmin = ix; if (ix + 1 > xmax) xmax = ix + 1; if (iz < zmin) zmin = iz; if (iz + 1 > zmax) zmax = iz + 1;
      }
    };
    scan(0, footRows);
    if (!isFinite(xmin)) scan(0, Hv);
    const xb = (xmin + xmax) / 2, zb = (zmin + zmax) / 2;
    const ax = (xmax - xmin) / 2, az = (zmax - zmin) / 2;
    const Rb = Math.max(ax, az) * 1.18 * o.baseScale + 3;
    const Ex = withBase ? Math.max(half, Math.abs(xb - half) + Rb + 2) : half;
    const Ez = withBase ? Math.max(half, Math.abs(zb - half) + Rb + 2) : half;
    const gxHalf = Math.ceil(Ex) + PAD, gzHalf = Math.ceil(Ez) + PAD;
    const Gx = 2 * gxHalf, Gz = 2 * gzHalf;
    const ox = gxHalf - half, oz = gzHalf - half;
    const bcx = xb + ox, bcz = zb + oz;
    let field = new Float32Array(Gx * Gy * Gz);
    for (let rf = 0; rf < Hv; rf++) for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const v = work[ix + n * (rf + Hv * iz)];
      if (v > 0) field[(ix + ox) + Gx * ((yf0 + rf) + Gy * (iz + oz))] = v;
    }

    await step('Lissage…');
    field = gaussian3(field, Gx, Gy, Gz, 0.5 + 2.0 * o.smooth);
    dropSmallParts(field, Gx, Gy, Gz, 0.5, 0.03);

    let baseFn = null;
    if (withBase) {
      await step('Socle…');
      baseFn = makeBase(o.base, bcx, bcz, o.base === 'square' ? Rb * 0.95 : Rb, PAD, hb);
      const bx0 = Math.max(0, Math.floor(bcx - Rb - 2)), bx1 = Math.min(Gx - 1, Math.ceil(bcx + Rb + 2));
      const bz0 = Math.max(0, Math.floor(bcz - Rb - 2)), bz1 = Math.min(Gz - 1, Math.ceil(bcz + Rb + 2));
      for (let z = bz0; z <= bz1; z++) for (let y = PAD - 1; y <= PAD + hb; y++) for (let x = bx0; x <= bx1; x++) {
        const v = baseFn(x + 0.5, y + 0.5, z + 0.5);
        if (v <= 0) continue;
        const i = x + Gx * (y + Gy * z);
        if (v > field[i]) field[i] = v;
      }
    }

    await step('Maillage…');
    const sn = surfaceNets(field, Gx, Gy, Gz, 0.5);
    const nv = sn.positions.length / 3;
    const grid = new Float32Array(nv * 3);
    for (let i = 0; i < grid.length; i++) grid[i] = sn.positions[i] + 0.5;
    const nrm = computeNormals(grid, sn.indices);

    await step('Couleurs…');
    for (let k = 0; k < N; k++) { views[k].sign = 1; views[k].shift = shiftV[k]; }
    const colors = colorVerticesN(views, ths, vs, { x: Gx, z: Gz }, yf0, grid, nrm, baseFn, o.baseColor, N >= 8 ? 4 : 3);

    const yBottom = withBase ? PAD : yf0;
    const positions = new Float32Array(nv * 3);
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = grid[i * 3] - bcx, y = grid[i * 3 + 1] - yBottom, z = grid[i * 3 + 2] - bcz;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    const res = {
      positions, normals: nrm, colors, indices: sn.indices,
      size: { x: mxx - mnx, y: mxy - mny, z: mxz - mnz },
      info: {
        Hv, vs, Hf, triangles: sn.indices.length / 3, vertices: nv, views: N, direction: best.sign, toleranceUsed: tol,
        directionScores: { chosen: best.score, other: best.alt }, colorScores: best.colorScores, footCue: best.cue,
        coherence: { fb: mean(fin.ious), lr: Math.min.apply(null, fin.ious) },
        perView: fin.ious, angles: ths.map((t) => ((((t * best.sign * 180) / Math.PI) % 360) + 360) % 360),
        grid: [Gx, Gy, Gz], hb, emb, yf0, withBase,
        origin: { x: bcx - Gx / 2, z: bcz - Gz / 2, yFeet: yf0 - yBottom },
      },
    };
    if (o.keepField) res.debug = { field, Gx, Gy, Gz, yf0, vs, Hv };
    return res;
  }

  /* ====================================================================
     9. Exports : STL binaire (Z vers le haut, mm), GLB, ZIP
     ==================================================================== */
  function exportSTL(mesh, heightMm) {
    const s = heightMm / mesh.size.y;
    const ix = mesh.indices, p = mesh.positions, nt = ix.length / 3;
    const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
    const hdr = 'Atelier Figurine - STL binaire (mm)';
    for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i));
    dv.setUint32(80, nt, true);
    let o = 84;
    const v = new Float32Array(9);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const i = ix[t * 3 + k] * 3;
        v[k * 3] = p[i] * s; v[k * 3 + 1] = -p[i + 2] * s; v[k * 3 + 2] = p[i + 1] * s;
      }
      const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
      const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, v[k], true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
    return buf;
  }

  const SRGB2LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  function exportGLB(mesh, heightMm) {
    const s = (heightMm / mesh.size.y) * 0.001; // metres
    const nv = mesh.positions.length / 3, ni = mesh.indices.length;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) {
      for (let k = 0; k < 3; k++) {
        const v = mesh.positions[i * 3 + k] * s;
        pos[i * 3 + k] = v;
        if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
        col[i * 3 + k] = SRGB2LIN[mesh.colors[i * 3 + k]];
      }
    }
    const binLen = nv * 12 * 3 + ni * 4;
    const json = {
      asset: { version: '2.0', generator: 'Atelier Figurine' },
      scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Figurine' }],
      meshes: [{ name: 'Figurine', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
      materials: [{ name: 'Couleurs', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx },
        { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
        { bufferView: 2, componentType: 5126, count: nv, type: 'VEC3' },
        { bufferView: 3, componentType: 5125, count: ni, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: nv * 12, target: 34962 },
        { buffer: 0, byteOffset: nv * 12, byteLength: nv * 12, target: 34962 },
        { buffer: 0, byteOffset: nv * 24, byteLength: nv * 12, target: 34962 },
        { buffer: 0, byteOffset: nv * 36, byteLength: ni * 4, target: 34963 },
      ],
      buffers: [{ byteLength: binLen }],
    };
    let js = JSON.stringify(json);
    while (js.length % 4) js += ' ';
    const jsBytes = new TextEncoder().encode(js);
    const total = 12 + 8 + jsBytes.length + 8 + binLen;
    const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
    u8.set(jsBytes, 20);
    let o = 20 + jsBytes.length;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    o += 8;
    u8.set(new Uint8Array(pos.buffer), o); o += nv * 12;
    u8.set(new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, nv * 12), o); o += nv * 12;
    u8.set(new Uint8Array(col.buffer), o); o += nv * 12;
    u8.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, ni * 4), o);
    return out;
  }

  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ZIP sans compression (methode 0). files : [{name, data:Uint8Array}] */
  function makeZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
    let size = 22;
    for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    let o = 0;
    for (const e of entries) {
      e.off = o;
      dv.setUint32(o, 0x04034b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 0x0800, true); dv.setUint16(o + 8, 0, true);
      dv.setUint16(o + 10, dosTime, true); dv.setUint16(o + 12, dosDate, true); dv.setUint32(o + 14, e.crc, true);
      dv.setUint32(o + 18, e.data.length, true); dv.setUint32(o + 22, e.data.length, true);
      dv.setUint16(o + 26, e.name.length, true); dv.setUint16(o + 28, 0, true);
      out.set(e.name, o + 30); out.set(e.data, o + 30 + e.name.length);
      o += 30 + e.name.length + e.data.length;
    }
    const cdStart = o;
    for (const e of entries) {
      dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true); dv.setUint16(o + 8, 0x0800, true);
      dv.setUint16(o + 10, 0, true); dv.setUint16(o + 12, dosTime, true); dv.setUint16(o + 14, dosDate, true);
      dv.setUint32(o + 16, e.crc, true); dv.setUint32(o + 20, e.data.length, true); dv.setUint32(o + 24, e.data.length, true);
      dv.setUint16(o + 28, e.name.length, true); dv.setUint16(o + 30, 0, true); dv.setUint16(o + 32, 0, true);
      dv.setUint16(o + 34, 0, true); dv.setUint16(o + 36, 0, true); dv.setUint32(o + 38, 0, true); dv.setUint32(o + 42, e.off, true);
      out.set(e.name, o + 46);
      o += 46 + e.name.length;
    }
    dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 4, 0, true); dv.setUint16(o + 6, 0, true);
    dv.setUint16(o + 8, entries.length, true); dv.setUint16(o + 10, entries.length, true);
    dv.setUint32(o + 12, o - cdStart, true); dv.setUint32(o + 16, cdStart, true); dv.setUint16(o + 20, 0, true);
    return out;
  }

  /* ====================================================================
     10. Planche d'exemple : petit personnage en ellipsoides, 4 vues orthographiques
     ==================================================================== */
  // [cx, cy, cz, rx, ry, rz, rotZ(deg), [r, g, b]] ; X vers la gauche du personnage, Y haut, Z devant.
  const SAMPLE_PARTS = [
    [7, 22, 0, 6.5, 22, 7, 0, [52, 86, 160]],
    [-7, 22, 0, 6.5, 22, 7, 0, [52, 86, 160]],
    [7.5, 4.5, 4.5, 7, 4.5, 11, 0, [96, 62, 38]],
    [-7.5, 4.5, 4.5, 7, 4.5, 11, 0, [96, 62, 38]],
    [0, 52, 0, 15, 20, 10.5, 0, [200, 60, 52]],
    [0, 55, 10, 4.5, 4.5, 1.8, 0, [240, 200, 70]],
    [0, 52, -12.5, 11, 14, 6, 0, [40, 150, 140]],
    [22, 51, 0, 5, 17, 5, 18.4, [200, 60, 52]],
    [-22, 51, 0, 5, 17, 5, -18.4, [200, 60, 52]],
    [27.5, 35, 0, 5.2, 5.2, 5.2, 0, [240, 194, 155]],
    [-27.5, 35, 0, 5.2, 5.2, 5.2, 0, [240, 194, 155]],
    [0, 70, 0, 4.5, 4, 4.5, 0, [240, 194, 155]],
    [0, 83, 0, 14, 15, 13.5, 0, [240, 194, 155]],
    [0, 87.5, -2.5, 14.8, 12.8, 14, 0, [58, 42, 32]],
    [5, 83.5, 12, 2, 2.6, 1.8, 0, [28, 28, 34]],
    [-5, 83.5, 12, 2, 2.6, 1.8, 0, [28, 28, 34]],
    [0, 79.5, 13.4, 2.2, 2.0, 2.6, 0, [226, 170, 134]],
  ];

  function sampleInside(x, y, z) {
    for (const q of SAMPLE_PARTS) {
      const a = (q[6] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = x - q[0], dy = y - q[1], dz = z - q[2];
      const lx = c * dx + s * dy, ly = -s * dx + c * dy;
      if ((lx / q[3]) ** 2 + (ly / q[4]) ** 2 + (dz / q[5]) ** 2 <= 1) return true;
    }
    return false;
  }

  function renderSampleSheet(opts) {
    const o = Object.assign({ vw: 224, vh: 330, ps: 0.34, ground: 320, ss: 2, bg: [243, 243, 240], angles: null, rows: 1 }, opts || {});
    let views = [
      { D: [-1, 0, 0], r: [0, 0, -1] }, // gauche (camera a +X)
      { D: [0, 0, -1], r: [1, 0, 0] },  // face
      { D: [1, 0, 0], r: [0, 0, 1] },   // droite
      { D: [0, 0, 1], r: [-1, 0, 0] },  // dos
    ];
    if (o.angles) views = o.angles.map((deg) => {
      const t = (deg * Math.PI) / 180, sn = Math.sin(t), cs = Math.cos(t);
      return { D: [-sn, 0, -cs], r: [cs, 0, -sn] };
    });
    const NV = views.length, perRow = Math.ceil(NV / o.rows);
    const W = o.vw * perRow, H = o.vh * o.rows;
    const data = new Uint8ClampedArray(W * H * 4);
    const Lc = [0.35, 0.55, 0.75];
    const ll = Math.hypot(Lc[0], Lc[1], Lc[2]);
    Lc[0] /= ll; Lc[1] /= ll; Lc[2] /= ll;
    const parts = SAMPLE_PARTS.map((q) => {
      const a = (q[6] * Math.PI) / 180;
      return { c: [q[0], q[1], q[2]], r: [q[3], q[4], q[5]], cos: Math.cos(a), sin: Math.sin(a), col: q[7] };
    });
    const acc = new Float32Array(3);
    const ss = o.ss;
    for (let vi = 0; vi < NV; vi++) {
      const { D, r } = views[vi];
      const rowI = Math.floor(vi / perRow), colI = vi % perRow;
      for (let j = 0; j < o.vh; j++) for (let i = 0; i < o.vw; i++) {
        acc[0] = acc[1] = acc[2] = 0;
        for (let sj = 0; sj < ss; sj++) for (let si = 0; si < ss; si++) {
          const sx = (i + (si + 0.5) / ss - o.vw / 2) * o.ps;
          const sy = (o.ground - (j + (sj + 0.5) / ss)) * o.ps;
          const O = [r[0] * sx - D[0] * 200, sy - D[1] * 200, r[2] * sx - D[2] * 200];
          let bestT = Infinity, bestPart = null, bestN = null;
          for (const q of parts) {
            const ox = O[0] - q.c[0], oy = O[1] - q.c[1], oz = O[2] - q.c[2];
            const lox = (q.cos * ox + q.sin * oy) / q.r[0], loy = (-q.sin * ox + q.cos * oy) / q.r[1], loz = oz / q.r[2];
            const ldx = (q.cos * D[0] + q.sin * D[1]) / q.r[0], ldy = (-q.sin * D[0] + q.cos * D[1]) / q.r[1], ldz = D[2] / q.r[2];
            const a = ldx * ldx + ldy * ldy + ldz * ldz, b = lox * ldx + loy * ldy + loz * ldz, c = lox * lox + loy * loy + loz * loz - 1;
            const disc = b * b - a * c;
            if (disc < 0) continue;
            const t = (-b - Math.sqrt(disc)) / a;
            if (t < bestT) {
              bestT = t; bestPart = q;
              const px = lox + ldx * t, py = loy + ldy * t, pz = loz + ldz * t;
              const gx = px / q.r[0], gy = py / q.r[1], gz = pz / q.r[2];
              bestN = [q.cos * gx - q.sin * gy, q.sin * gx + q.cos * gy, gz];
            }
          }
          if (bestPart) {
            const nl = Math.hypot(bestN[0], bestN[1], bestN[2]) || 1;
            const nx = bestN[0] / nl, ny = bestN[1] / nl, nz = bestN[2] / nl;
            const cam = [nx * r[0] + nz * r[2], ny, -(nx * D[0] + ny * D[1] + nz * D[2])];
            const ndl = cam[0] * Lc[0] + cam[1] * Lc[1] + cam[2] * Lc[2];
            const sh = ndl > 0.5 ? 1 : ndl > 0 ? 0.8 : 0.62;
            acc[0] += bestPart.col[0] * sh; acc[1] += bestPart.col[1] * sh; acc[2] += bestPart.col[2] * sh;
          } else { acc[0] += o.bg[0]; acc[1] += o.bg[1]; acc[2] += o.bg[2]; }
        }
        const k = ss * ss, di = ((rowI * o.vh + j) * W + colI * o.vw + i) * 4;
        data[di] = acc[0] / k; data[di + 1] = acc[1] / k; data[di + 2] = acc[2] / k; data[di + 3] = 255;
      }
    }
    return { width: W, height: H, data, ps: o.ps };
  }

  return {
    computeMask, cleanMask, findSegments, analyzeSheet, prepareViews, prepareViewList, reconstruct, reconstructN, detectLayout, dropSmallParts,
    exportSTL, exportGLB, makeZip, crc32, renderSampleSheet, sampleInside, SAMPLE_PARTS, DEFAULTS,
    _internal: { surfaceNets, rowRuns, bestShift, coverage, gaussian3, decideSides },
  };
}));
