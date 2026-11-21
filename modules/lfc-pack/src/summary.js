// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ column summaries (footer section 20) and line-chart pyramids (section 21), both optional and advisory; SPEC.md 2.3a
  // 20: { v: 1, rows, cols: [{ key, type: 'num' | 'date' | 'text' | 'other', n, nulls, min, max, sorted, q, qExact, qn, qSample, hist, distinct, len, top, sample }], colsCut }, one entry per key over the whole file
  // 21: per number and date column, the min, max and count of every run of `bin` rows (see pyrPayload)
  // Number and date columns are summed inside the writer's own pass over each block (blockStats, on the helper that encodes the block when there is one), then merged here; a column the writer did not
  // read that way (a row or text save, a column with missing keys) gets the same passes on this thread over the whole column.
  var SEC_SUMMARY = 20, SEC_PYRAMID = 21, SUM_KEYS = 1000, SUM_HIST = 64, SUM_TOP = 16, SUM_DISTINCT_CAP = 64, SUM_TEXT_ROWS = 65536;   // text columns are counted over their first SUM_TEXT_ROWS rows only (`sample` says so)
  var SUM_DATE = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(\.\d+)?Z?$/;
  // quantile grid (replaces hist unless quantiles: false): SUM_Q values at p = i / 256, linear between ranks. Exact when the column is ordered with no missing values, is whole numbers within SUM_CNT of each
  // other in every block (counted), or has at most SUM_QS values; otherwise read from SUM_QS values at fixed positions (`qSample` says how many). At most SUM_Q different values: those values and their counts (`qExact`, `qn`).
  var SUM_Q = 257, SUM_QS = 65536, SUM_CNT = 4096, SUM_KEEP = 1025, PYR_BINS = 2048;
  function sposAt(j, N) { return Math.min(N - 1, Math.floor((j + (Math.imul(j ^ 0x9E3779B9, 0x85EBCA6B) >>> 0) / 4294967296) * N / SUM_QS)); }   // sample position j of SUM_QS over N > SUM_QS rows: one fixed place in each equal slice, rising with j
  function sumPos(n) { var p = new Int32Array(SUM_QS), j; for (j = 0; j < SUM_QS; j++) p[j] = sposAt(j, n); return p; }
  function qOf(get, m) { var q = new Array(SUM_Q), k, pos, lo, fr, v; for (k = 0; k < SUM_Q; k++) { pos = k / (SUM_Q - 1) * (m - 1); lo = Math.floor(pos); fr = pos - lo; v = get(lo); q[k] = fr > 0 && lo + 1 < m ? v + fr * (get(lo + 1) - v) : v; } return q; }   // the grid from a value-at-rank function over m ranks
  function qSortedArr(s, m) { return qOf(function (r) { return s[r]; }, m); }
  function sumGridIdx(n) { var g = [], k, pos, lo; for (k = 0; k < SUM_Q; k++) { pos = k / (SUM_Q - 1) * (n - 1); lo = Math.floor(pos); g.push(lo); if (lo + 1 < n) g.push(lo + 1); } return g; }   // the ranks the grid reads (rising)
  function qCounts(cnt, base, tot) {   // whole numbers counted over [base, base + cnt.length): exact distinct values, or the exact grid
    var d = 0, i, vals = [], ns = [], at, run;
    for (i = 0; i < cnt.length; i++) if (cnt[i]) { d++; if (d <= SUM_Q) { vals.push(base + i); ns.push(cnt[i]); } }
    if (d <= SUM_Q) return { q: vals, qn: ns, exact: true };
    at = 0; run = 0;   // value at rank r: walk the counts forward (ranks are asked for in rising order)
    return { q: qOf(function (r) { while (run + cnt[at] <= r) { run += cnt[at]; at++; } return base + at; }, tot), exact: false };
  }
  function sumReq(n, Q, pyr) {   // what every block reports: { n rows in all, q (quantile grid wanted), G (grid ranks), bin (rows per pyramid bin, 0 for none) }
    var bins = pyr === false ? 0 : pyr && pyr.bins > 0 ? Math.floor(pyr.bins) : PYR_BINS, bin = bins ? Math.max(1, Math.ceil(n / bins)) : 0;
    if (bin && bin < 4) bin = 0;   // under 4 rows a bin the column itself is as quick to draw, and the bins would outweigh it
    return { n: n, q: !!Q, G: Q ? sumGridIdx(n) : null, bin: bin };
  }
  // one block's part (rows a0 .. a0 + c - 1 of the column): r holds the row values (NaN and +-Infinity are missing); one pass for the range, order and pyramid bins, then the few sampled values
  function blockStats(r, c, a0, R) {
    var N = R.n, bin = R.bin, i, x, s, e, lmn, lmx, lc, mn = Infinity, mx = -Infinity, asc = true, desc = true, prev = 0, first = NaN, last = NaN, have = false, nul = 0, t, j, p, G, sv = null, svn = 0, gv = null, cnt = null;
    var b0 = bin ? Math.floor(a0 / bin) : 0, nb = bin && c ? Math.floor((a0 + c - 1) / bin) - b0 + 1 : 1, bmn = null, bmx = null, bct = null;
    if (bin) { bmn = new Float64Array(nb); bmx = new Float64Array(nb); bct = new Uint32Array(nb); }
    for (t = 0; t < nb; t++) {
      s = bin ? Math.max(0, (b0 + t) * bin - a0) : 0; e = bin ? Math.min(c, (b0 + t + 1) * bin - a0) : c; lmn = Infinity; lmx = -Infinity; lc = 0; i = s;
      if (asc || desc) for (; i < e && (asc || desc); i++) { x = r[i]; if (x - x !== 0) continue; lc++; if (x < lmn) lmn = x; if (x > lmx) lmx = x; if (have) { if (x < prev) asc = false; else if (x > prev) desc = false; } else { have = true; first = x; } prev = x; }
      for (; i < e; i++) { x = r[i]; if (x - x !== 0) continue; lc++; if (x < lmn) lmn = x; if (x > lmx) lmx = x; }   // once the order is settled as neither: range and count alone
      if (lc) { if (lmn < mn) mn = lmn; if (lmx > mx) mx = lmx; }
      nul += e - s - lc;
      if (bin) { bmn[t] = lc ? lmn : NaN; bmx[t] = lc ? lmx : NaN; bct[t] = lc; }
    }
    for (i = c - 1; i >= 0; i--) { x = r[i]; if (x - x === 0) { last = x; break; } }
    if (R.q && have) {
      if (N <= SUM_QS) { sv = new Float64Array(c - nul); for (i = 0, j = 0; i < c; i++) { x = r[i]; if (x - x === 0) sv[j++] = x; } }
      else { j = Math.max(0, Math.floor(a0 * SUM_QS / N) - 1); while (j < SUM_QS && sposAt(j, N) < a0) j++;
        sv = new Float64Array(Math.min(SUM_QS - j, Math.ceil(c * SUM_QS / N) + 2)); t = 0;   // positions rise by at least one slice each, so the block holds at most this many
        for (; j < SUM_QS && (p = sposAt(j, N)) < a0 + c; j++) { x = r[p - a0]; if (x - x === 0) sv[t++] = x; } sv = sv.subarray(0, t); }
      sortF64(sv); svn = sv.length;
      if (N > SUM_QS && svn > SUM_KEEP && c < N) { var kp = new Float64Array(SUM_KEEP), z; for (z = 0; z < SUM_KEEP; z++) kp[z] = sv[Math.round(z * (svn - 1) / (SUM_KEEP - 1))]; sv = kp; }   // a long block keeps SUM_KEEP evenly spaced order statistics of its sample, each standing for svn / SUM_KEEP values
      G = R.G; gv = []; for (j = 0; j < G.length; j++) if (G[j] >= a0 && G[j] < a0 + c) gv.push(G[j], r[G[j] - a0]);
      if (mx - mn <= SUM_CNT && mn === Math.floor(mn)) { cnt = new Int32Array(mx - mn + 1); for (i = 0; i < c; i++) { x = r[i]; if (x - x !== 0) continue; if (x !== Math.floor(x)) { cnt = null; break; } cnt[x - mn]++; } }   // whole numbers close together: counted
    }
    return { a: a0, n: c, nulls: nul, have: have, mn: mn, mx: mx, asc: have && asc, desc: have && desc, first: first, last: last, sv: sv, svn: svn, gv: gv, cnt: cnt, b0: b0, bmn: bmn, bmx: bmx, bct: bct };
  }
  function sortF64(a) {   // ascending sort of finite doubles in place: an LSD radix sort over the bit patterns (11-bit digits, digits every value shares are skipped); 3 to 5 times quicker than sort() on 64K values
    var n = a.length, u, lo, hi, l2, h2, i, d, sh, cnt = new Int32Array(2048), x, y, t, pos, w, srcLo, srcHi, dstLo, dstHi;
    if (n < 512) { a.sort(); return a; }
    u = new Uint32Array(a.buffer, a.byteOffset, n * 2); lo = new Uint32Array(n); hi = new Uint32Array(n); l2 = new Uint32Array(n); h2 = new Uint32Array(n);
    for (i = 0; i < n; i++) { x = u[2 * i]; y = u[2 * i + 1]; if (y & 0x80000000) { lo[i] = ~x >>> 0; hi[i] = ~y >>> 0; } else { lo[i] = x; hi[i] = (y | 0x80000000) >>> 0; } }   // order-preserving keys: negatives flipped, positives get the sign bit
    srcLo = lo; srcHi = hi; dstLo = l2; dstHi = h2;
    for (d = 0; d < 6; d++) {
      sh = d < 3 ? d * 11 : (d - 3) * 11; w = d < 3 ? srcLo : srcHi; cnt.fill(0);
      for (i = 0; i < n; i++) cnt[(w[i] >>> sh) & 2047]++;
      if (cnt[(w[0] >>> sh) & 2047] === n) continue;   // every value has this digit: nothing to move
      for (i = 0, pos = 0; i < 2048; i++) { t = cnt[i]; cnt[i] = pos; pos += t; }
      for (i = 0; i < n; i++) { t = cnt[(w[i] >>> sh) & 2047]++; dstLo[t] = srcLo[i]; dstHi[t] = srcHi[i]; }
      t = srcLo; srcLo = dstLo; dstLo = t; t = srcHi; srcHi = dstHi; dstHi = t;
    }
    for (i = 0; i < n; i++) { y = srcHi[i]; x = srcLo[i]; if (y & 0x80000000) { u[2 * i] = x; u[2 * i + 1] = (y & 0x7FFFFFFF) >>> 0; } else { u[2 * i] = ~x >>> 0; u[2 * i + 1] = ~y >>> 0; } }
    return a;
  }
  function capPut(cap, key, sb) { var c = cap.cols[key] || (cap.cols[key] = {}); c[sb.a] = sb; }
  function qWeighted(parts, m) {   // the grid over m sampled values, from each block's sorted kept values (sv, each standing for svn / sv.length values): exact when every block kept all of its sample
    var runs = [], i, j, b, w, a, c, v, wv, x, y, z, k = 0, cum, tot = 0, pts, wt, t;
    for (i = 0; i < parts.length; i++) { b = parts[i]; wv = new Float64Array(b.sv.length).fill(b.svn / b.sv.length); runs.push([b.sv, wv]); }
    while (runs.length > 1) { t = []; for (i = 0; i + 1 < runs.length; i += 2) { a = runs[i]; c = runs[i + 1]; v = new Float64Array(a[0].length + c[0].length); w = new Float64Array(v.length); x = 0; y = 0; z = 0;   // pairwise merges of sorted runs
        while (x < a[0].length && y < c[0].length) { if (a[0][x] <= c[0][y]) { v[z] = a[0][x]; w[z++] = a[1][x++]; } else { v[z] = c[0][y]; w[z++] = c[1][y++]; } }
        while (x < a[0].length) { v[z] = a[0][x]; w[z++] = a[1][x++]; } while (y < c[0].length) { v[z] = c[0][y]; w[z++] = c[1][y++]; } t.push([v, w]); }
      if (i < runs.length) t.push(runs[i]); runs = t; }
    pts = runs[0][0]; wt = runs[0][1]; cum = new Float64Array(pts.length);
    for (i = 0; i < pts.length; i++) { cum[i] = tot + (wt[i] - 1) / 2; tot += wt[i]; }   // the (fractional) rank each kept value stands at (its own rank when it stands for one value)
    return qOf(function (r) { while (k + 1 < pts.length && cum[k + 1] <= r) k++; if (k + 1 >= pts.length || r <= cum[k]) return pts[k]; var f = (r - cum[k]) / (cum[k + 1] - cum[k]); return pts[k] + f * (pts[k + 1] - pts[k]); }, m);
  }
  // the blocks' parts merged (null unless they cover rows 0 .. n - 1 exactly once); sc scales values (to epoch milliseconds for dates), fl takes whole milliseconds for min and max
  function sumMerge(cp, n, R, sc, fl) {
    if (!cp) return null;
    var ks = Object.keys(cp), bl = [], i, j, b, at = 0, p = null, g = { nulls: 0, have: false, mn: Infinity, mx: -Infinity, asc: true, desc: true, first: NaN, last: NaN, q: null }, m = 0, runs = [], cntOk = true, gm, sm, tot;
    for (i = 0; i < ks.length; i++) bl.push(cp[ks[i]]);
    bl.sort(function (x, y) { return x.a - y.a; });
    for (i = 0; i < bl.length; i++) { b = bl[i]; if (b.a !== at || b.u !== bl[0].u) return null; at += b.n; g.nulls += b.nulls; if (!b.have) continue;
      if (!g.have) { g.have = true; g.first = b.first; }
      if (b.mn < g.mn) g.mn = b.mn; if (b.mx > g.mx) g.mx = b.mx; g.last = b.last;
      if (!b.asc || (p !== null && b.first < p)) g.asc = false; if (!b.desc || (p !== null && b.first > p)) g.desc = false; p = b.last;
      if (R.q) { runs.push(b); m += b.svn; if (!b.cnt) cntOk = false; } }
    if (at !== n) return null;
    var f = function (v) { return v * sc; }, fm = function (v) { return fl ? Math.floor(v * sc) : v * sc; };
    if (g.have) { g.min = fm(g.mn); g.max = fm(g.mx); g.firstS = f(g.first); g.lastS = f(g.last); }
    if (R.q && g.have) {
      tot = n - g.nulls;
      if (!g.nulls && (g.asc || g.desc)) { gm = new Map(); for (i = 0; i < bl.length; i++) for (j = 0; j < bl[i].gv.length; j += 2) gm.set(bl[i].gv[j], bl[i].gv[j + 1]);   // ordered: the grid values were kept at their exact ranks
        g.q = qOf(g.asc ? function (x) { return f(gm.get(x)); } : function (x) { return f(gm.get(n - 1 - x)); }, n); }
      else if (cntOk && g.mx - g.mn <= 65536) { var cnt = new Int32Array(g.mx - g.mn + 1), qc; for (i = 0; i < bl.length; i++) { b = bl[i]; if (b.cnt) for (j = 0; j < b.cnt.length; j++) cnt[b.mn - g.mn + j] += b.cnt[j]; }
        qc = qCounts(cnt, g.mn, tot); g.q = sc === 1 ? qc.q : qc.q.map(f); if (qc.exact) { g.qExact = true; g.qn = qc.qn; } }
      else { g.q = qWeighted(runs, m); if (sc !== 1) g.q = g.q.map(f); if (n > SUM_QS) g.qSample = m; }
    }
    if (R.bin) {   // pyramid bins of the whole column
      var nb = Math.ceil(n / R.bin), pmn = new Float64Array(nb).fill(NaN), pmx = new Float64Array(nb).fill(NaN), pct = new Uint32Array(nb), t, gb, v;
      for (i = 0; i < bl.length; i++) { b = bl[i]; if (!b.bct) continue; for (t = 0; t < b.bct.length; t++) { if (!b.bct[t]) continue; gb = b.b0 + t; v = b.bmn[t] * sc; if (!(pmn[gb] <= v)) pmn[gb] = v; v = b.bmx[t] * sc; if (!(pmx[gb] >= v)) pmx[gb] = v; pct[gb] += b.bct[t]; } }
      g.pyr = { n: n, bin: R.bin, min: pmn, max: pmx, count: pct, first: g.have ? f(g.first) : NaN, last: g.have ? f(g.last) : NaN };
    }
    return g;
  }
  function sumWhole(r, n, R, sc, fl) { return sumMerge({ 0: blockStats(r, n, 0, R) }, n, R, sc, fl); }   // the same, with the whole column as one block (on this thread)
  function rowsF64(a, n) {   // a plain array of numbers, null and undefined -> Float64Array with NaN for the missing values; null when it holds anything else
    var r = new Float64Array(n), i, x; for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number') r[i] = x; else if (x === null || x === undefined) r[i] = NaN; else return null; } return r;
  }
  function putMerged(c, g, type) {   // a merged result into the summary entry; the pyramid rides along (taken off before the entry is written)
    c.type = type; c.nulls = g.nulls; c.min = g.have ? g.min : null; c.max = g.have ? g.max : null; c.sorted = g.have ? (g.asc ? 'asc' : g.desc ? 'desc' : null) : null;
    if (g.q) { c.q = g.q; if (g.qExact) { c.qExact = true; c.qn = g.qn; } if (g.qSample) c.qSample = g.qSample; }
    if (g.pyr) c._pyr = g.pyr;
    return c;
  }
  // the 64-bucket hist path (quantiles: false), one copy of the pass per kind of array (integer typed arrays, float typed arrays, plain arrays) so each stays monomorphic
  function makeSumNums(kind) {   // kind 0: integer typed array (no missing values), 1: float typed array, 2: plain array (numbers, null, undefined)
    return function (a, n) {   // -> { nulls, min, max, asc, desc, hist }, or null when a plain array holds something that is not a number, null or undefined
      var mn = Infinity, mx = -Infinity, nul = 0, asc = true, desc = true, prev = 0, have = false, i, x, hist = null, w, b;
      if (kind === 0) {
        if (n > 0) { mn = mx = prev = a[0]; have = true; }
        for (i = 1; i < n && (asc || desc); i++) { x = a[i]; if (x < prev) asc = false; else if (x > prev) desc = false; if (x < mn) mn = x; else if (x > mx) mx = x; prev = x; }
        for (; i < n; i++) { x = a[i]; if (x < mn) mn = x; else if (x > mx) mx = x; }
      } else {
        for (i = 0; i < n && (asc || desc); i++) {
          x = a[i];
          if (kind === 2 && typeof x !== 'number') { if (x === null || x === undefined) { nul++; continue; } return null; }
          if (!(x - x === 0)) { nul++; continue; }   // NaN and +-Infinity count as missing: JSON cannot hold them
          if (!have) { mn = mx = prev = x; have = true; continue; }
          if (x < prev) asc = false; else if (x > prev) desc = false; if (x < mn) mn = x; else if (x > mx) mx = x; prev = x;
        }
        for (; i < n; i++) {
          x = a[i];
          if (kind === 2 && typeof x !== 'number') { if (x === null || x === undefined) { nul++; continue; } return null; }
          if (!(x - x === 0)) { nul++; continue; }
          if (x < mn) mn = x; else if (x > mx) mx = x;
        }
      }
      if (have && mx > mn) {
        hist = new Array(SUM_HIST); for (b = 0; b < SUM_HIST; b++) hist[b] = 0;
        w = SUM_HIST / (mx - mn);
        if (kind === 0) for (i = 0; i < n; i++) { b = ((a[i] - mn) * w) | 0; hist[b >= SUM_HIST ? SUM_HIST - 1 : b]++; }
        else for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number' && x - x === 0) { b = ((x - mn) * w) | 0; hist[b >= SUM_HIST ? SUM_HIST - 1 : b]++; } }
      }
      return { nulls: nul, min: have ? mn : null, max: have ? mx : null, asc: have && asc, desc: have && desc, hist: hist };
    };
  }
  var sumI = makeSumNums(0), sumF = makeSumNums(1), sumP = makeSumNums(2);
  function sumNums(a, n, plain) { return plain ? sumP(a, n) : (a instanceof Float64Array || a instanceof Float32Array) ? sumF(a, n) : sumI(a, n); }
  function sumSorted(r) { return r.asc ? 'asc' : r.desc ? 'desc' : null; }
  function sumPut(c, r, k) { c.nulls = r.nulls; c.min = r.min === null ? null : r.min * k; c.max = r.max === null ? null : r.max * k; c.sorted = sumSorted(r); if (r.hist) c.hist = r.hist; }
  function sumDateMs(s) { var t = Date.parse((s.charCodeAt(10) === 32 ? s.slice(0, 10) + 'T' + s.slice(11) : s) + (s.charCodeAt(s.length - 1) === 90 ? '' : 'Z')); return t === t ? t : null; }   // read as UTC, as the date columns are
  function sumDateQ(c, a, n, nl, sa, sd) {   // the grid of a date column read from its strings (when the writer left no date numbers): ordered columns at exact ranks, others from up to SUM_QS / 4 parsed values
    var P, sm, j, m, x, t, step;
    if (!nl && (sa || sd)) { c.q = qOf(sa ? function (r) { return sumDateMs(a[r]); } : function (r) { return sumDateMs(a[n - 1 - r]); }, n); for (j = 0; j < c.q.length; j++) if (c.q[j] === null) { delete c.q; return; } return; }
    if (n <= SUM_QS / 4) { P = null; m = n; } else { P = sumPos(n); m = SUM_QS / 4; }
    sm = new Float64Array(m); step = P ? 4 : 1;
    for (j = 0, x = 0; j < m; j++) { t = a[P ? P[j * step] : j]; if (typeof t === 'string' && (t = sumDateMs(t)) !== null) sm[x++] = t; }
    if (!x) return; sm = sm.subarray(0, x); sm.sort(); c.q = qSortedArr(sm, x); if (P) c.qSample = x;
  }
  function sumMergeU(cp, n, R) { var k0 = Object.keys(cp)[0], u = k0 !== undefined && cp[k0].u; return sumMerge(cp, n, R, u ? 0.001 : 1, !!u); }   // date numbers the writer left: microseconds for six-digit forms
  function sumColumn(key, a, n, cp, R) {   // R: the request (sumReq), or a boolean (quantile grid or not, no pyramid) for tests; cp: the blocks' parts the writer left for this key, if any
    if (typeof R !== 'object' || R === null) R = sumReq(n, R !== false, false);
    var c = { key: key, type: 'other', n: n }, Q = R.q, r, g, i, v, k, mn, mx, nul, map, cnt, lab, top, ent, dc;
    if (isTsCol(a)) {   // timestamp column: values since 1970 in a.unit; min and max are given in epoch milliseconds
      k = a.unit === 's' ? 1000 : a.unit === 'ms' ? 1 : 0.001;
      if (!Q) { r = sumNums(a.values, n, false); c.type = 'date'; sumPut(c, r, k); return c; }
      g = cp && sumMergeU(cp, n, R) || sumWhole(a.values, n, R, k, a.unit === 'us');   // the writer's date numbers (ms or us), else the column's own
      return putMerged(c, g, 'date');
    }
    if (isDictCol(a)) {   // labels and one code per row: exact distinct count and counts per label
      lab = a.labels; cnt = new Int32Array(lab.start.length); for (i = 0; i < n; i++) cnt[a.ids[i]]++;
      ent = []; for (i = 0; i < cnt.length; i++) if (cnt[i]) ent.push([i, cnt[i]]);
      c.type = 'text'; c.nulls = 0; c.distinct = ent.length;
      mn = Infinity; mx = 0; for (i = 0; i < ent.length; i++) { v = lab.end[ent[i][0]] - lab.start[ent[i][0]]; if (v < mn) mn = v; if (v > mx) mx = v; }
      c.len = ent.length ? [mn, mx] : [0, 0];
      if (ent.length <= SUM_DISTINCT_CAP) { ent.sort(function (p, q) { return q[1] - p[1] || p[0] - q[0]; }); c.top = ent.slice(0, SUM_TOP).map(function (e) { return [tdr.decode(lab.bytes.subarray(lab.start[e[0]], lab.end[e[0]])), e[1]]; }); }
      return c;
    }
    if (isByteCol(a)) {   // text held as bytes: length range in bytes
      mn = Infinity; mx = 0; for (i = 0; i < n; i++) { v = a.end[i] - a.start[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      c.type = 'text'; c.nulls = 0; c.len = n ? [mn, mx] : [0, 0]; c.distinct = null;
      return c;
    }
    if (ArrayBuffer.isView(a)) {   // number typed array
      if (!Q) { r = sumNums(a, n, false); c.type = 'num'; sumPut(c, r, 1); return c; }
      g = cp && sumMerge(cp, n, R, 1, false) || sumWhole(a, n, R, 1, false);
      return putMerged(c, g, 'num');
    }
    if (!Array.isArray(a)) return c;
    for (i = 0; i < n && (a[i] === null || a[i] === undefined); i++);   // the first value that is there decides the kind
    if (i === n) { c.type = 'other'; c.nulls = n; return c; }
    if (typeof a[i] === 'number') {
      if (!Q) { r = sumNums(a, n, true); if (r) { c.type = 'num'; sumPut(c, r, 1); } return c; }
      g = cp && sumMerge(cp, n, R, 1, false); if (!g) { r = rowsF64(a, n); if (!r) return c; g = sumWhole(r, n, R, 1, false); }
      return putMerged(c, g, 'num');
    }
    if (typeof a[i] !== 'string') return c;
    // strings: date-like columns give their range (compared as text, which orders canonical dates), the others a length range, and the distinct count and top labels while there are few
    v = a[i]; k = SUM_DATE.test(v) && v.length >= 19 && SUM_DATE.test(a[n >> 1] || '') && SUM_DATE.test(a[n - 1] || '');
    if (k && cp && (g = sumMergeU(cp, n, R)) && !g.nulls) return putMerged(c, g, 'date');   // the writer already read every value as a date
    if (k) {   // date-like strings: an ordered column is settled by one pass of single compares (first and last are the range); otherwise a second pass finds min, max and whether it is descending
      var pv = null, nl = 0, sa = true, sd = true; mn = mx = null;
      for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (pv !== null && x < pv) { sa = false; break; } if (mn === null) mn = x; pv = x; }
      if (sa) mx = pv;
      else { mn = mx = null; pv = null; nl = 0; sd = true;
        for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (mn === null) { mn = mx = x; } else { if (x < mn) mn = x; else if (x > mx) mx = x; if (sd && x > pv) sd = false; } pv = x; } }
      var tmn = mn === null ? null : sumDateMs(mn), tmx = mx === null ? null : sumDateMs(mx);
      if (tmn !== null && tmx !== null) { c.type = 'date'; c.nulls = nl; c.min = tmn; c.max = tmx; c.sorted = sa ? 'asc' : sd ? 'desc' : null; if (Q) sumDateQ(c, a, n, nl, sa, sd); return c; }   // (no pyramid on this path)
    }
    nul = 0; mn = null; mx = null; map = k ? null : new Map(); var lo = Infinity, hi = 0, ok = true, x, pv = null, sa = true, sd = true, ns = k || n <= SUM_TEXT_ROWS ? n : SUM_TEXT_ROWS;
    for (i = 0; i < ns; i++) {
      x = a[i];
      if (typeof x !== 'string') { if (x === null || x === undefined) { nul++; continue; } ok = false; break; }
      if (k) { if (mn === null || x < mn) mn = x; if (mx === null || x > mx) mx = x; if (pv !== null) { if (x < pv) sa = false; if (x > pv) sd = false; } pv = x; continue; }
      if (x.length < lo) lo = x.length; if (x.length > hi) hi = x.length;
      if (map) { dc = map.get(x); if (dc === undefined) { if (map.size >= SUM_DISTINCT_CAP) map = null; else map.set(x, 1); } else map.set(x, dc + 1); }
    }
    if (!ok) return c;
    c.nulls = nul;
    if (k) { var tmn = mn === null ? null : sumDateMs(mn), tmx = mx === null ? null : sumDateMs(mx); if (tmn !== null && tmx !== null) { c.type = 'date'; c.min = tmn; c.max = tmx; c.sorted = sa ? 'asc' : sd ? 'desc' : null; return c; } }
    c.type = 'text'; c.len = ns > nul ? [lo, hi] : [0, 0]; c.distinct = map ? map.size : null; if (ns < n) c.sample = ns;   // len, distinct and top then describe the first `sample` rows
    if (map) { ent = Array.from(map.entries()); ent.sort(function (p, q) { return q[1] - p[1]; }); c.top = ent.slice(0, SUM_TOP); }
    return c;
  }
  // the summary as one job per column, so a parallel save runs them on this thread when it would wait anyway (since 0.15.0): next(early) runs one column and says whether one ran; done() -> Promise of
  // { sum: section 20 payload or null, pyr: section 21 payload or null }; cap is where the writer leaves each block's part (SUMCAP)
  function sumJobs(obj, n, opts) {
    opts = opts || {};
    var keys = Object.keys(obj), cut = keys.length > SUM_KEYS, m = cut ? SUM_KEYS : keys.length, cols = new Array(m), bad = false, R = sumReq(n, opts.quantiles !== false, opts.pyramids), cap = { cols: {}, R: R }, st = new Uint8Array(m);
    function one(k) { st[k] = 1; try { cols[k] = sumColumn(keys[k], obj[keys[k]], n, cap.cols[keys[k]], R); } catch (e) { bad = true; } }
    function next(early) {   // early (blocks still being written): only columns that are not plain arrays or typed numbers, since those wait for the parts every block leaves
      for (var k = 0; k < m; k++) if (!st[k] && !(early && (Array.isArray(obj[keys[k]]) || ArrayBuffer.isView(obj[keys[k]]) || isTsCol(obj[keys[k]])))) { one(k); return true; }
      return false; }
    function result() {
      if (bad) return { sum: null, pyr: null };
      var py = [], k, o; for (k = 0; k < m; k++) if (cols[k]._pyr) { py.push([keys[k], cols[k]._pyr]); delete cols[k]._pyr; }
      o = { v: 1, rows: n, cols: cols }; if (cut) o.colsCut = true;
      return { sum: te.encode(JSON.stringify(o)), pyr: py.length ? pyrPayload(py, n, R.bin) : null };
    }
    return { cap: cap, next: next, done: function () { while (next(false)); return Promise.resolve(result()); }, payload: function () { while (next(false)); return result(); } };
  }
  function columnSummary(obj, n, opts) { return sumJobs(obj, n, opts).payload().sum; }   // the section 20 payload for the column table obj ({ key: column }) of n rows
  // section 21: u32 header length, the JSON header { v: 1, n, bin, bins, cols: [[key, first, last]] } padded to 8 bytes, then per column min (Float64 x bins), max (Float64 x bins), count (Uint32 x bins, padded to 8)
  function pyrPayload(py, n, bin) {
    var bins = Math.ceil(n / bin), hd = te.encode(JSON.stringify({ v: 1, n: n, bin: bin, bins: bins, cols: py.map(function (x) { return [x[0], x[1].first === x[1].first ? x[1].first : null, x[1].last === x[1].last ? x[1].last : null]; }) })),
      h0 = (4 + hd.length + 7) & ~7, cb = (bins * 4 + 7) & ~7, per = bins * 16 + cb, out = new Uint8Array(h0 + per * py.length), i, o;
    out.set(u32le(hd.length), 0); out.set(hd, 4);
    for (i = 0; i < py.length; i++) { o = h0 + per * i; out.set(new Uint8Array(py[i][1].min.buffer, 0, bins * 8), o); out.set(new Uint8Array(py[i][1].max.buffer, 0, bins * 8), o + bins * 8); out.set(new Uint8Array(py[i][1].count.buffer, 0, bins * 4), o + bins * 16); }
    return out;
  }
  function pyramids(bytes, key) { return pyrRead(readFooter(S.zdec, bytes).sec[SEC_PYRAMID], key); }   // { key: { n, bin, min, max, count, first, last } } from footer section 21, one entry with key, or null; nothing is decoded
  function pyrRead(s, key) {   // typed arrays over one aligned copy of the section
    var hl, hd, buf, bins, h0, cb, per, out = {}, i, o, c;
    if (!s) return null;
    buf = new Uint8Array(s.length); buf.set(s); buf = buf.buffer; hl = rd32(s, 0); hd = JSON.parse(tdr.decode(s.subarray(4, 4 + hl))); bins = hd.bins; h0 = (4 + hl + 7) & ~7; cb = (bins * 4 + 7) & ~7; per = bins * 16 + cb;
    for (i = 0; i < hd.cols.length; i++) { c = hd.cols[i]; o = h0 + per * i;
      out[c[0]] = { n: hd.n, bin: hd.bin, min: new Float64Array(buf, o, bins), max: new Float64Array(buf, o + bins * 8, bins), count: new Uint32Array(buf, o + bins * 16, bins), first: c[1] === null ? NaN : c[1], last: c[2] === null ? NaN : c[2] }; }
    return key === undefined ? out : out[key] || null;
  }
  function addSection(file, id, payload) { return addSections(file, [[id, payload]]); }
  function addSections(file, list) {   // the same file with more optional footer sections ([[id, payload]]; no other byte of the blocks changes); an id the file already has is left as it is
    var n = file.length, flen = rd32(file, n - 16), f = file.subarray(n - 16 - flen, n - 16), body = f[0] === 1 ? S.zfull.decompress(f.subarray(1)) : f.subarray(1), p, h, t = new Uint8Array(16), nf, parts = [body], i, id, have = {};
    for (p = 0; p < body.length; p += 8 + rd32(body, p + 4)) have[rd16(body, p)] = 1;
    for (i = 0; i < list.length; i++) { id = list[i][0]; if (have[id] || !list[i][1]) continue; h = new Uint8Array(8); h[0] = id; h[1] = id >> 8; h.set(u32le(list[i][1].length), 4); parts.push(h, list[i][1]); have[id] = 1; }
    if (parts.length === 1) return file;
    nf = concat([new Uint8Array([1]), S.zfull.compress(concat(parts), 3)]);
    t.set(u32le(nf.length), 0); t.set(u32le(crcJS(nf, 0)), 4); t.set(file.subarray(n - 8, n - 4), 8); t.set(MAGIC, 12);
    return concat([file.subarray(0, n - 16 - flen), nf, t]);
  }
  function summary(bytes) { var s = readFooter(S.zdec, bytes).sec[SEC_SUMMARY]; return s ? JSON.parse(tdr.decode(s)) : null; }   // the column summary the file carries (footer section 20), or null; nothing is decoded
