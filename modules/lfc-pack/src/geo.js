// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ geo preset (footer section 24, optional; since 0.20.0)
  // packColumnsParallel(cols, { geo: { x, y, bounds? } }): each row gets a 32-bit Hilbert key from its two coordinates quantized to 16 bits inside the bounds (given, or the data's own); the rows are
  // sorted by it (missing coordinates last); blocks default to 1 MB (blockBytes changes it). Section 24 is JSON { v: 2, x, y, key: null, bounds: [x0, y0, x1, y1], bits: 16, cells: 256,
  // heat: [cell, count, ...], zones: [[min, max] | null, ...] } with heat the row count of every non-empty cell of a 256 x 256 grid (cell = cy * 256 + cx) and zones each block's key range.
  // Files from 0.20.0 to 0.22.0 are v: 1 with key: '$hilbert', a hidden number column holding the key (its block zone maps give the ranges); readers take both.
  // A box read turns the box into the key runs of the quads it covers (a quad's keys are one run: the top bits of a key are its quad's Hilbert index), so only blocks whose key range meets a run are read.
  var SEC_GEO = 24, GEO_KEY = '$hilbert', GEO_BLOCK_BYTES = 1048576;   // about 10,000 rows of a 5-column table per block: box reads 2.8 to 6.7 times faster than a scan, against about 2 with the usual block size
  function hilbertXY(x, y, n) {   // Hilbert index of cell (x, y) in an n x n grid (n a power of 2), one level at a time; exact in doubles up to n = 65536
    var d = 0, s, rx, ry, t, m = n - 1;
    for (s = n >>> 1; s > 0; s >>>= 1) { rx = (x & s) ? 1 : 0; ry = (y & s) ? 1 : 0; d += s * s * ((3 * rx) ^ ry); if (!ry) { if (rx) { x ^= m; y ^= m; } t = x; x = y; y = t; } }
    return d;
  }
  // the same index for n = 65536 four levels at a time from a 1,024-entry table (state: swapped, flipped; 6.5 times faster than the loop above on 1,000,000 points, same answers)
  var HIL4 = (function () {
    var T1 = new Uint8Array(16), T2 = new Uint8Array(64), T4 = new Uint16Array(1024), st, a, b, xb, yb, sw, cp, tx, ty, q, x2, y2, x4, y4;
    for (st = 0; st < 4; st++) for (xb = 0; xb < 2; xb++) for (yb = 0; yb < 2; yb++) { sw = st >> 1; cp = st & 1; tx = xb ^ cp; ty = yb ^ cp; if (sw) { q = tx; tx = ty; ty = q; } q = (3 * tx) ^ ty; if (!ty) { if (tx) cp ^= 1; sw ^= 1; } T1[st * 4 + (xb << 1 | yb)] = q | ((sw * 2 + cp) << 2); }
    for (st = 0; st < 4; st++) for (x2 = 0; x2 < 4; x2++) for (y2 = 0; y2 < 4; y2++) { a = T1[st * 4 + ((x2 >> 1) << 1 | (y2 >> 1))]; b = T1[(a >> 2) * 4 + ((x2 & 1) << 1 | (y2 & 1))]; T2[st * 16 + (x2 << 2 | y2)] = ((a & 3) << 2 | (b & 3)) | ((b >> 2) << 4); }
    for (st = 0; st < 4; st++) for (x4 = 0; x4 < 16; x4++) for (y4 = 0; y4 < 16; y4++) { a = T2[st * 16 + ((x4 >> 2) << 2 | (y4 >> 2))]; b = T2[(a >> 4) * 16 + ((x4 & 3) << 2 | (y4 & 3))]; T4[(st << 8) | (x4 << 4) | y4] = ((a & 15) << 4 | (b & 15)) | ((b >> 4) << 8); }
    return T4;
  })();
  function hilbert16(x, y) { var d = 0, st = 0, e, sh; for (sh = 12; sh >= 0; sh -= 4) { e = HIL4[(st << 8) | (((x >>> sh) & 15) << 4) | ((y >>> sh) & 15)]; d = (d << 8) | (e & 255); st = e >> 8; } return d >>> 0; }
  function geoCol(obj, name) { if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(obj, name)) throw new Error('LfcPack: geo.x and geo.y must be column names of the table'); var a = obj[name]; if (isTsCol(a) || isDictCol(a) || isByteCol(a)) throw new Error('LfcPack: geo column ' + name + ' must hold numbers'); return a; }
  function geoNum(v) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity ? v : NaN; }
  function geoPrep(obj, opts) {   // -> { obj (sorted), hd (section 24 without zones), ks (sorted keys), nk (rows with a key), opts for the save }
    var g = opts.geo, X, Y, n, i, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a, b, heat, sx, sy, qx, qy, cells = [], hd;
    if (!g || typeof g !== 'object') throw new Error('LfcPack: geo must be { x, y, bounds? } (column names)');
    if (opts.sortBy != null && opts.sortBy !== false) throw new Error('LfcPack: geo sorts by its own key; leave sortBy out');
    if (opts.scramble) throw new Error('LfcPack: geo cannot be used with scramble');
    if (opts.exact || opts.base) throw new Error('LfcPack: geo cannot be used with exact or a delta save');
    if (Object.prototype.hasOwnProperty.call(obj, GEO_KEY)) throw new Error('LfcPack: geo adds the column ' + GEO_KEY + ', which the table already has');
    X = geoCol(obj, g.x); Y = geoCol(obj, g.y); n = X.length; if (Y.length !== n) throw new Error('LfcPack: geo.x and geo.y must have the same length');
    if (g.bounds != null) { if (!Array.isArray(g.bounds) || g.bounds.length !== 4 || !g.bounds.every(function (v) { return typeof v === 'number' && isFinite(v); }) || !(g.bounds[2] >= g.bounds[0] && g.bounds[3] >= g.bounds[1])) throw new Error('LfcPack: geo.bounds must be [x0, y0, x1, y1] with x1 >= x0 and y1 >= y0'); x0 = g.bounds[0]; y0 = g.bounds[1]; x1 = g.bounds[2]; y1 = g.bounds[3]; }
    else for (i = 0; i < n; i++) { a = geoNum(X[i]); b = geoNum(Y[i]); if (a !== a || b !== b) continue; if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
    if (!(x1 >= x0)) { x0 = y0 = 0; x1 = y1 = 1; }
    sx = x1 > x0 ? 65536 / (x1 - x0) : 0; sy = y1 > y0 ? 65536 / (y1 - y0) : 0; var K = new Uint32Array(n), miss = null; heat = new Uint32Array(65536);
    for (i = 0; i < n; i++) { a = X[i]; b = Y[i]; if (typeof a !== 'number' || typeof b !== 'number' || a !== a || b !== b || a === Infinity || a === -Infinity || b === Infinity || b === -Infinity) { if (!miss) miss = new Uint32Array(n); miss[i] = 1; continue; }
      qx = Math.floor((a - x0) * sx); qy = Math.floor((b - y0) * sy); if (qx < 0) qx = 0; else if (qx > 65535) qx = 65535; if (qy < 0) qy = 0; else if (qy > 65535) qy = 65535;
      K[i] = hilbert16(qx, qy); heat[(qy >>> 8) << 8 | (qx >>> 8)]++; }
    for (i = 0; i < 65536; i++) if (heat[i]) cells.push(i, heat[i]);
    hd = { v: 1, x: g.x, y: g.y, key: GEO_KEY, bounds: [x0, y0, x1, y1], bits: 16, cells: 256, heat: cells };
    // sorted here (a stable radix sort on the 32-bit keys, missing coordinates last: two or three passes instead of the four a Float64 column takes), then saved as presorted (section 20 still names $hilbert as the sort key, hidden)
    // since 0.23.0 the key is not stored as a column: section 24 keeps each block's key range instead (zones), which is all a box read needs (file 9% smaller, save faster)
    var P = radixPerm(miss, K, n), o2 = {}, k, so = { key: GEO_KEY, desc: false, keep: !!opts.keepOrder, hide: [GEO_KEY] }, ks = new Uint32Array(n), nk = n;
    if (so.keep && Object.prototype.hasOwnProperty.call(obj, SORT_ROW)) throw new Error('LfcPack: keepOrder adds the column ' + SORT_ROW + ', which the table already has');
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) o2[k] = permCol(obj[k], P);
    for (i = 0; i < n; i++) { k = P[i]; if (miss && miss[k]) { nk = i; break; } ks[i] = K[k]; }
    if (so.keep) { var rw = n < 2147483648 ? new Int32Array(n) : new Float64Array(n); for (i = 0; i < n; i++) rw[i] = P[i]; o2[SORT_ROW] = rw; }
    return { obj: o2, hd: hd, ks: ks, nk: nk, opts: Object.assign({}, opts, { geo: null, sortBy: null, keepOrder: false, _presort: so, blockBytes: opts.blockBytes || GEO_BLOCK_BYTES }) };
  }
  // section 24 for a finished save: the key range [min, max] of every block's rows (rows sorted by key, missing coordinates last: null for a block with none)
  function geoSection(gp, bytes) {
    var f = openFile(bytes), z = [], r = 0, i, c, a, b; gp.hd.v = 2; gp.hd.key = null;
    for (i = 0; i < f.blocks.length; i++) { c = f.blocks[i][3]; a = r; b = Math.min(r + c, gp.nk) - 1; z.push(b >= a ? [gp.ks[a], gp.ks[b]] : null); r += c; }
    gp.hd.zones = z; return te.encode(JSON.stringify(gp.hd));
  }
  function geoHeader(f) { var s = f.sec[SEC_GEO]; if (!s) return null; var hd = JSON.parse(tdr.decode(s)); if (!hd || (hd.v !== 1 && !(hd.v === 2 && Array.isArray(hd.zones))) || !Array.isArray(hd.bounds)) throw new Error('LfcPack: geo section damaged'); return hd; }
  // geo(bytes) -> { x, y, key, bounds, cells, heat: Uint32Array(cells * cells) } or null; nothing is decoded
  function geoInfo(hd) { var h = new Uint32Array(hd.cells * hd.cells), i; for (i = 0; i + 1 < hd.heat.length; i += 2) h[hd.heat[i]] = hd.heat[i + 1]; return { x: hd.x, y: hd.y, key: hd.key, bounds: hd.bounds.slice(), cells: hd.cells, heat: h, zones: hd.zones ? hd.zones.map(function (z) { return z && z.slice(); }) : null }; }
  function geo(bytes) { var hd = geoHeader(readFooter(S.zdec, bytesOf(bytes))); return hd ? geoInfo(hd) : null; }
  // the key runs [lo, hi] a box touches (merged, rising): quads of the 65,536 x 65,536 grid split level by level, a quad inside the box giving its whole key run (the keys of one quad at level L
  // are one run of 4^(16 - L)), until level 16 or more than GEO_EDGE quads lie on the box's edge, which then give their whole runs (a few rows outside the box are read and filtered out)
  var GEO_EDGE = 1024;
  function geoRuns(hd, bx0, by0, bx1, by1) {
    var b = hd.bounds, sx = b[2] > b[0] ? 65536 / (b[2] - b[0]) : 0, sy = b[3] > b[1] ? 65536 / (b[3] - b[1]) : 0, q = function (v, lo, s) { var r = Math.floor((v - lo) * s); return r < 0 ? 0 : r > 65535 ? 65535 : r; };
    if (!(bx1 >= bx0 && by1 >= by0)) return [];
    var X0 = q(bx0, b[0], sx), X1 = q(bx1, b[0], sx), Y0 = q(by0, b[1], sy), Y1 = q(by1, b[1], sy), runs = [], edge = [[0, 0]], L = 0, i, j, nx, s, x0, y0, span, next, d;
    for (;;) {
      s = 65536 / Math.pow(2, L); span = Math.pow(4, 16 - L); next = [];
      for (i = 0; i < edge.length; i++) { x0 = edge[i][0] * s; y0 = edge[i][1] * s;
        if (x0 > X1 || x0 + s - 1 < X0 || y0 > Y1 || y0 + s - 1 < Y0) continue;
        if ((x0 >= X0 && x0 + s - 1 <= X1 && y0 >= Y0 && y0 + s - 1 <= Y1) || L === 16) { d = hilbertXY(edge[i][0], edge[i][1], s === 1 ? 65536 : 65536 / s); runs.push([d * span, d * span + span - 1]); continue; }
        next.push(edge[i]); }
      if (!next.length) break;
      if (next.length > GEO_EDGE) { for (i = 0; i < next.length; i++) { d = hilbertXY(next[i][0], next[i][1], 65536 / s); runs.push([d * span, d * span + span - 1]); } break; }
      edge = []; for (i = 0; i < next.length; i++) for (j = 0; j < 4; j++) { nx = next[i]; edge.push([nx[0] * 2 + (j & 1), nx[1] * 2 + (j >> 1)]); }
      L++;
    }
    runs.sort(function (p, r) { return p[0] - r[0]; });
    var out = []; for (i = 0; i < runs.length; i++) { if (out.length && out[out.length - 1][1] + 1 >= runs[i][0]) { if (runs[i][1] > out[out.length - 1][1]) out[out.length - 1][1] = runs[i][1]; } else out.push(runs[i].slice()); }
    return out;
  }
  function geoMeets(runs, mn, mx) { var lo = 0, hi = runs.length; while (lo < hi) { var m = (lo + hi) >> 1; if (runs[m][1] < mn) lo = m + 1; else hi = m; } return lo < runs.length && runs[lo][0] <= mx; }
