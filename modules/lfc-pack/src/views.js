// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ two-way views (footer section 22, optional; since 0.22.0)
  // packColumnsParallel(cols, { views: true | [[keyA, keyB], ...] }): for pairs of label columns (at most VIEW_LABELS different values each, at most VIEW_CELLS label pairs), the row count of every pair of
  // labels and, for each number column, the count, sum, min and max of its non-missing values there; so a two-way group-by is answered from the footer with nothing decoded.
  // Section 22 is JSON { v: 1, rows, dims: { key: [label, ...] }, measures: [key, ...], views: [{ a, b, cells: [ia * nb + ib, ...], count: [...], m: { key: { n?, sum, min, max } } }] }; n only when that
  // number column has missing values. true picks up to VIEW_DIMS label columns and VIEW_PAIRS pairs; a list names the pairs.
  var SEC_VIEWS = 22, VIEW_LABELS = 64, VIEW_CELLS = 4096, VIEW_DIMS = 8, VIEW_PAIRS = 16, VIEW_MEASURES = 8, VIEW_FULL = 65536;
  function viewLabels(a, n) {   // -> { labels, ids: Uint8Array } for a column with at most VIEW_LABELS different values (strings, numbers, booleans, null), else null
    var ids = new Uint8Array(n), labels = [], map = new Map(), i, v, k;
    if (isDictCol(a)) { var L = a.labels, used = new Map(), dl = []; for (i = 0; i < L.start.length; i++) dl.push(tdr.decode(L.bytes.subarray(L.start[i], L.end[i])));
      for (i = 0; i < n; i++) { v = a.ids[i]; k = used.get(v); if (k === undefined) { if (labels.length === VIEW_LABELS) return null; k = labels.length; used.set(v, k); labels.push(v < dl.length ? dl[v] : null); } ids[i] = k; }
      return { labels: labels, ids: ids }; }
    if (isTsCol(a) || isByteCol(a)) return null;
    if (ArrayBuffer.isView(a) && (a instanceof Float64Array || a instanceof Float32Array)) { for (i = 0; i < n; i++) { v = a[i]; if (v === v && v !== Math.floor(v)) return null; } }
    if (!ArrayBuffer.isView(a) && !Array.isArray(a)) return null;
    if (ArrayBuffer.isView(a) && !(a instanceof Float64Array || a instanceof Float32Array)) {   // whole numbers: a lookup table over their range instead of a Map
      var lo = Infinity, hi = -Infinity; for (i = 0; i < n; i++) { v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (n && hi - lo < 65536) { var tb = new Int16Array(hi - lo + 1).fill(-1); for (i = 0; i < n; i++) { v = a[i] - lo; k = tb[v]; if (k < 0) { if (labels.length === VIEW_LABELS) return null; k = tb[v] = labels.length; labels.push(a[i]); } ids[i] = k; } return { labels: labels, ids: ids }; }
    }
    for (i = 0; i < n; i++) { v = a[i]; if (v === undefined || (typeof v === 'number' && v !== v)) v = null; else if (typeof v === 'object' && v !== null) return null;
      k = map.get(v); if (k === undefined) { if (labels.length === VIEW_LABELS) return null; k = labels.length; map.set(v, k); labels.push(v); } ids[i] = k; }
    return { labels: labels, ids: ids };
  }
  function viewMeasure(a) { return ArrayBuffer.isView(a) && !(a instanceof BigInt64Array || a instanceof BigUint64Array) && !(a instanceof DataView); }
  function viewSpec(spec) { if (spec === true) return; if (!Array.isArray(spec) || !spec.length) throw new Error('LfcPack: views must be true or a list of [keyA, keyB] pairs'); for (var i = 0; i < spec.length; i++) if (!Array.isArray(spec[i]) || spec[i].length !== 2 || typeof spec[i][0] !== 'string' || typeof spec[i][1] !== 'string' || spec[i][0] === spec[i][1]) throw new Error('LfcPack: views must be true or a list of [keyA, keyB] pairs of two different columns'); }
  function viewsBuild(obj, spec, ex) {
    var keys = Object.keys(obj).filter(function (k) { return !ex || ex.indexOf(k) < 0; }), n = -1, k, a, dims = {}, D = {}, pairs = [], i, j, p, meas = [], out = { v: 1, rows: 0, dims: dims, measures: meas, views: [] };
    for (k = 0; k < keys.length; k++) { a = obj[keys[k]]; n = isTsCol(a) ? a.values.length : isDictCol(a) ? a.ids.length : isByteCol(a) ? a.start.length : a.length; break; }
    if (n < 0) return null; out.rows = n;
    var want = null; if (Array.isArray(spec)) { want = {}; for (i = 0; i < spec.length; i++) { if (!Array.isArray(spec[i]) || spec[i].length !== 2 || typeof spec[i][0] !== 'string' || typeof spec[i][1] !== 'string' || spec[i][0] === spec[i][1]) throw new Error('LfcPack: views must be true or a list of [keyA, keyB] pairs of two different columns'); want[spec[i][0]] = 1; want[spec[i][1]] = 1; } }
    else if (spec !== true) throw new Error('LfcPack: views must be true or a list of [keyA, keyB] pairs');
    for (k = 0; k < keys.length; k++) { if (want ? !want[keys[k]] : Object.keys(D).length >= VIEW_DIMS) continue; if (!want && viewMeasure(obj[keys[k]]) && !(obj[keys[k]] instanceof Int8Array || obj[keys[k]] instanceof Uint8Array || obj[keys[k]] instanceof Int16Array || obj[keys[k]] instanceof Uint16Array || obj[keys[k]] instanceof Int32Array)) continue;
      a = viewLabels(obj[keys[k]], n); if (a) D[keys[k]] = a; else if (want) throw new Error('LfcPack: views column ' + keys[k] + ' has more than ' + VIEW_LABELS + ' different values (or is not a label column)'); }
    if (want) { for (i = 0; i < spec.length; i++) { if (!Object.prototype.hasOwnProperty.call(obj, spec[i][0]) || !Object.prototype.hasOwnProperty.call(obj, spec[i][1])) throw new Error('LfcPack: views names a column the table does not have'); pairs.push(spec[i]); } }
    else { var dk = Object.keys(D); for (i = 0; i < dk.length && pairs.length < VIEW_PAIRS; i++) for (j = i + 1; j < dk.length && pairs.length < VIEW_PAIRS; j++) if (D[dk[i]].labels.length * D[dk[j]].labels.length <= VIEW_CELLS) pairs.push([dk[i], dk[j]]); }
    for (k = 0; k < keys.length && meas.length < VIEW_MEASURES; k++) if (!D[keys[k]] && viewMeasure(obj[keys[k]])) meas.push(keys[k]);
    var used = {}, X = [], q, c, i2, v2, x;
    for (q = 0; q < meas.length; q++) { x = obj[meas[q]]; X.push(x instanceof Float64Array ? x : Float64Array.from(x)); }   // one array kind, so the loops below stay monomorphic
    // one pass over the rows: per cell of the pair, or (when all the pairs' columns together have at most VIEW_FULL label combinations) per combination of all of them, then each pair summed from it
    var dl = []; for (p = 0; p < pairs.length; p++) { if (dl.indexOf(pairs[p][0]) < 0) dl.push(pairs[p][0]); if (dl.indexOf(pairs[p][1]) < 0) dl.push(pairs[p][1]); }
    var full = 1; for (i = 0; i < dl.length; i++) full *= D[dl[i]].labels.length;
    function agg(cellOf, C) {   // -> { cnt, s: [], mn: [], mx: [], nn: [], miss: [] } over C cells
      var cnt = new Float64Array(C), cell = new Int32Array(n), R = { cnt: cnt, s: [], mn: [], mx: [], nn: [], miss: [] }, s, mn, mx, nn, xs, ms, cc;
      for (i2 = 0; i2 < n; i2++) { cc = cellOf(i2); cell[i2] = cc; cnt[cc]++; }
      for (q = 0; q < X.length; q++) { xs = X[q]; s = new Float64Array(C); mn = new Float64Array(C).fill(Infinity); mx = new Float64Array(C).fill(-Infinity); nn = new Float64Array(C); ms = false;
        for (i2 = 0; i2 < n; i2++) { v2 = xs[i2]; if (v2 !== v2) { ms = true; continue; } cc = cell[i2]; s[cc] += v2; nn[cc]++; if (v2 < mn[cc]) mn[cc] = v2; if (v2 > mx[cc]) mx[cc] = v2; }
        R.s.push(s); R.mn.push(mn); R.mx.push(mx); R.nn.push(nn); R.miss.push(ms); }
      return R;
    }
    function emit(pa, R, C) {   // a pair's cells from its own aggregates
      var cells = [], cc = [], mo = {}, m;
      for (c = 0; c < C; c++) if (R.cnt[c]) { cells.push(c); cc.push(R.cnt[c]); }
      for (q = 0; q < meas.length; q++) { m = { sum: [], min: [], max: [] }; if (R.miss[q]) m.n = [];
        for (i = 0; i < cells.length; i++) { c = cells[i]; m.sum.push(R.s[q][c]); m.min.push(R.nn[q][c] ? R.mn[q][c] : null); m.max.push(R.nn[q][c] ? R.mx[q][c] : null); if (R.miss[q]) m.n.push(R.nn[q][c]); }
        mo[meas[q]] = m; }
      used[pa[0]] = used[pa[1]] = 1; out.views.push({ a: pa[0], b: pa[1], cells: cells, count: cc, m: mo });
    }
    for (p = 0; p < pairs.length; p++) { var CP = D[pairs[p][0]].labels.length * D[pairs[p][1]].labels.length; if (CP > VIEW_CELLS) throw new Error('LfcPack: views pair ' + pairs[p].join(' x ') + ' has ' + CP + ' label pairs (at most ' + VIEW_CELLS + ')'); }
    if (pairs.length > 1 && full <= VIEW_FULL) {
      var IDS = dl.map(function (k2) { return D[k2].ids; }), NL = dl.map(function (k2) { return D[k2].labels.length; }), nd = dl.length, F = agg(function (r2) { var cc = 0; for (var d = 0; d < nd; d++) cc = cc * NL[d] + IDS[d][r2]; return cc; }, full), strides = [];
      for (i = 0; i < nd; i++) { strides[i] = 1; for (var e2 = i + 1; e2 < nd; e2++) strides[i] *= NL[e2]; }
      for (p = 0; p < pairs.length; p++) {
        var ia2 = dl.indexOf(pairs[p][0]), ib2 = dl.indexOf(pairs[p][1]), nb2 = NL[ib2], C2 = NL[ia2] * nb2, R2 = { cnt: new Float64Array(C2), s: [], mn: [], mx: [], nn: [], miss: F.miss }, map = new Int32Array(full), f2;
        for (f2 = 0; f2 < full; f2++) map[f2] = (Math.floor(f2 / strides[ia2]) % NL[ia2]) * nb2 + (Math.floor(f2 / strides[ib2]) % nb2);
        for (q = 0; q < X.length; q++) { R2.s.push(new Float64Array(C2)); R2.mn.push(new Float64Array(C2).fill(Infinity)); R2.mx.push(new Float64Array(C2).fill(-Infinity)); R2.nn.push(new Float64Array(C2)); }
        for (f2 = 0; f2 < full; f2++) { if (!F.cnt[f2]) continue; c = map[f2]; R2.cnt[c] += F.cnt[f2];
          for (q = 0; q < X.length; q++) { R2.s[q][c] += F.s[q][f2]; R2.nn[q][c] += F.nn[q][f2]; if (F.mn[q][f2] < R2.mn[q][c]) R2.mn[q][c] = F.mn[q][f2]; if (F.mx[q][f2] > R2.mx[q][c]) R2.mx[q][c] = F.mx[q][f2]; } }
        emit(pairs[p], R2, C2);
      }
    } else for (p = 0; p < pairs.length; p++) { var A2 = D[pairs[p][0]].ids, B2 = D[pairs[p][1]].ids, nb3 = D[pairs[p][1]].labels.length; emit(pairs[p], agg(function (r2) { return A2[r2] * nb3 + B2[r2]; }, D[pairs[p][0]].labels.length * nb3), D[pairs[p][0]].labels.length * nb3); }
    for (k in used) dims[k] = D[k].labels;
    return out.views.length ? te.encode(JSON.stringify(out)) : null;
  }
  // readers: views(bytes) -> [[keyA, keyB], ...] the file can answer (or []); view(bytes, keyA, keyB) -> { a, b, labelsA, labelsB, cells: [{ a, b, count, cols: { key: { n, sum, min, max, mean } } }] } or null
  function viewSec(f) { var s = f.sec[SEC_VIEWS]; if (!s) return null; var j = JSON.parse(tdr.decode(s)); if (!j || j.v !== 1 || !Array.isArray(j.views)) throw new Error('LfcPack: views section damaged'); return j; }
  function viewList(j) { return j ? j.views.map(function (w) { return [w.a, w.b]; }) : []; }
  function viewOf(j, ka, kb) {
    if (!j) return null; var w = null, flip = false, i, q, o, A, B, nb, c, x, cell, mq;
    for (i = 0; i < j.views.length; i++) { if (j.views[i].a === ka && j.views[i].b === kb) { w = j.views[i]; break; } if (j.views[i].a === kb && j.views[i].b === ka) { w = j.views[i]; flip = true; break; } }
    if (!w) return null;
    A = j.dims[w.a]; B = j.dims[w.b]; nb = B.length; o = { a: ka, b: kb, labelsA: flip ? B.slice() : A.slice(), labelsB: flip ? A.slice() : B.slice(), cells: [] };
    for (i = 0; i < w.cells.length; i++) { c = w.cells[i]; cell = { a: flip ? B[c % nb] : A[Math.floor(c / nb)], b: flip ? A[Math.floor(c / nb)] : B[c % nb], count: w.count[i], cols: {} };
      for (q in w.m) { mq = w.m[q]; x = mq.n ? mq.n[i] : w.count[i]; cell.cols[q] = { n: x, sum: mq.sum[i], min: mq.min[i], max: mq.max[i], mean: x ? mq.sum[i] / x : null }; }
      o.cells.push(cell); }
    return o;
  }
  function view(bytes, ka, kb) { return viewOf(viewSec(readFooter(S.zdec, bytesOf(bytes))), ka, kb); }
  function views(bytes) { return viewList(viewSec(readFooter(S.zdec, bytesOf(bytes)))); }
