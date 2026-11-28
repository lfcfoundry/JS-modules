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
  var SUM_Q = 257, SUM_QS = 65536, SUM_CNT = 4096, SUM_KEEP = 1025, PYR_BINS = 4096;   // 4,096 bins (since 0.16.0; 2,048 in 0.15.0): netflow-plot draws from bins while there are 2 or more per pixel, so charts up to 2,048 px wide
  function sposAt(j, N) { return Math.min(N - 1, Math.floor((j + (Math.imul(j ^ 0x9E3779B9, 0x85EBCA6B) >>> 0) / 4294967296) * N / SUM_QS)); }   // sample position j of SUM_QS over N > SUM_QS rows: one fixed place in each equal slice, rising with j
  function sumPos(n) { var p = new Int32Array(SUM_QS), j; for (j = 0; j < SUM_QS; j++) p[j] = sposAt(j, n); return p; }
  // since 0.24.0 the grid also has tail points (qt): the values at shares 2^(-j/2) and 1 - 2^(-j/2) for j = 13 .. 32 (from 1/91 to 1/65,536 from each end), where the 257 even steps are too coarse
  // (the last step is 1/256 of the values, so a 99.9th percentile read between it and the maximum was 80% to 300% off on skewed columns; with the tail points under 3%)
  // since 0.26.4 also 20 points at the shares people ask for most between the even steps (qx): 1 - p for p95, 96, 97, 97.5, 98, 98.5, 99, 99.25, 99.5, 99.75 and the same from the low end, so those
  // percentiles read straight from a point (on the real taxi fares p99 read 0.9% low between two tail points; the four inside 1/90.5 of an end are exact like the tail points)
  var SUM_QX = 10, QXS = [0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];
  var SUM_QT = 20, QP = (function () { var a = [], k, j; for (k = 0; k < SUM_Q; k++) a.push([k / (SUM_Q - 1), 0, k]); for (j = 0; j < SUM_QT; j++) { a.push([Math.pow(2, -(32 - j) / 2), 1, j]); a.push([1 - Math.pow(2, -(13 + j) / 2), 1, SUM_QT + j]); }
    for (j = 0; j < SUM_QX; j++) { a.push([QXS[j], 2, j]); a.push([1 - QXS[SUM_QX - 1 - j], 2, SUM_QX + j]); }
    a.sort(function (x, y) { return x[0] - y[0]; }); return a; })();   // every grid share, rising: [p, 0 even step | 1 tail, index]
  function qOf(get, m) {   // the grid from a value-at-rank function over m ranks (asked for in rising order): q (the 257 even steps) with q.qt (2 x SUM_QT tail values: the low tail rising, then the high tail rising)
    var q = new Array(SUM_Q), qt = new Array(2 * SUM_QT), qx = new Array(2 * SUM_QX), k, pos, lo, fr, v, e;
    for (k = 0; k < QP.length; k++) { e = QP[k]; pos = e[0] * (m - 1); lo = Math.floor(pos); fr = pos - lo; v = get(lo); v = fr > 0 && lo + 1 < m ? v + fr * (get(lo + 1) - v) : v; if (e[1] === 1) qt[e[2]] = v; else if (e[1]) qx[e[2]] = v; else q[e[2]] = v; }
    q.qt = qt; q.qx = qx; return q;
  }
  function qMap(q, f) { var o = q.map(f), i; if (q.qt) o.qt = q.qt.map(f); if (q.qx) o.qx = q.qx.map(f); if (q.qv) { o.qv = q.qv.slice(); for (i = 0; i < o.qv.length; i += 3) o.qv[i] = f(o.qv[i]); } return o; }
  // since 0.26.2, tied values (qv): a value that many rows share has no single rank, and reading counts linearly between grid points put it at one end of its run
  // (count above a shared price or fare 7 to 21% off on real columns). qv lists [value, values below it, values at or below it] for every value that holds 1/2,048
  // of the sample or more, estimated from the sample (exact where the tails were read from every value); countAbove / countBelow read those runs. Old readers ignore it.
  var SUM_TIE = 2048;
  function qTies(pts, wt, w1, m) {   // [value, weight below, weight at or below] for each run of 2 or more equal kept values holding m / SUM_TIE or more (weights in sample values; wt null: each kept value weighs w1)
    var o = [], i = 0, j, n = pts.length, run = 0, c, v, lim = m / SUM_TIE;
    while (i < n) { v = pts[i]; c = wt ? wt[i] : w1; j = i + 1; while (j < n && pts[j] === v) { c += wt ? wt[j] : w1; j++; }
      if (j - i >= 2 && c >= lim) o.push(v, run, run + c); run += c; i = j; }
    return o;
  }
  function qTiesTo(q, m, tot) { var t = q.qv, i; if (!t) return; for (i = 0; i < t.length; i += 3) { t[i + 1] = Math.round(t[i + 1] / m * tot); t[i + 2] = Math.round(t[i + 2] / m * tot); } }   // weights -> counts of the column's values
  function qSortedArr(s, m) { return qOf(function (r) { return s[r]; }, m); }
  function sumGridIdx(n) { var g = [], k, pos, lo; for (k = 0; k < QP.length; k++) { pos = QP[k][0] * (n - 1); lo = Math.floor(pos); g.push(lo, n - 1 - lo); if (lo + 1 < n) g.push(lo + 1, n - 2 - lo); } g.sort(function (x, y) { return x - y; }); return g.filter(function (x, i) { return x >= 0 && x < n && (i === 0 || x !== g[i - 1]); }); }   // the ranks the grid reads, and their mirror images (a falling column reads them from the end)   // the ranks the grid reads (rising)
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
    var N = R.n, bin = R.bin, tl = null, i, x, s, e, lmn, lmx, lc, mn = Infinity, mx = -Infinity, asc = true, desc = true, prev = 0, first = NaN, last = NaN, have = false, nul = 0, t, j, p, G, sv = null, svn = 0, gv = null, cnt = null;
    var b0 = bin ? Math.floor(a0 / bin) : 0, nb = bin && c ? Math.floor((a0 + c - 1) / bin) - b0 + 1 : 1, bmn = null, bmx = null, bct = null;
    if (bin) { bmn = new Float64Array(nb); bmx = new Float64Array(nb); bct = new Uint32Array(nb); }
    var ct = R.q && N > SUM_QS ? blockCuts(r, c, a0, N) : null, pre = !!(ct && ct.pre);   // since 0.26.0 a long column's sample is read first (blockCuts)
    if (ct) sv = ct.sv;
    // since 0.26.3 the tail values are taken in the same pass as the range once the order is settled (one read of the block instead of two: 27% to 39% quicker on blocks not in cache in all three browsers); the stretch before that is scanned after
    var tc = ct && ct.cap && ct.tlo < ct.th ? ct : null, th = 0, tlo = 0, tcap = 0, TB = null, nh = 0, nl = 0, eh = 0, el = 0, tf = -1;
    if (tc) { th = tc.th; tlo = tc.tlo; tcap = tc.cap; if (!TAILBUF || TAILBUF.length < 2 * tcap) TAILBUF = new Float64Array(2 * tcap); TB = TAILBUF; }
    for (t = 0; t < nb; t++) {
      s = bin ? Math.max(0, (b0 + t) * bin - a0) : 0; e = bin ? Math.min(c, (b0 + t + 1) * bin - a0) : c; lmn = Infinity; lmx = -Infinity; lc = 0; i = s;
      if (asc || desc) for (; i < e && (asc || desc); i++) { x = r[i]; if (x - x !== 0) continue; lc++; if (x < lmn) lmn = x; if (x > lmx) lmx = x; if (have) { if (x < prev) asc = false; else if (x > prev) desc = false; } else { have = true; first = x; } prev = x; }
      if (i < e) {   // once the order is settled as neither: range and count alone. NaN fails both compares, so the range needs no test per value; an infinity (missing too) shows as the range's end and sends the stretch to the careful loop (since 0.26.3; 25% to 40% quicker in all three browsers)
        var m1 = Infinity, m2 = -Infinity, nn = 0, i0 = i;
        if (tf < 0) tf = i0;
        if (tc) for (; i < e; i++) { x = r[i]; if (x !== x) nn++; if (x < m1) m1 = x; if (x > m2) m2 = x; if (x >= th) { if (x === th) eh++; else { if (nh < tcap) TB[nh] = x; nh++; } } else if (x <= tlo) { if (x === tlo) el++; else { if (nl < tcap) TB[tcap + nl] = x; nl++; } } }
        else for (; i < e; i++) { x = r[i]; if (x !== x) nn++; if (x < m1) m1 = x; if (x > m2) m2 = x; }
        if (m1 === -Infinity || m2 === Infinity) { m1 = Infinity; m2 = -Infinity; nn = 0; for (i = i0; i < e; i++) { x = r[i]; if (x - x !== 0) { nn++; continue; } if (x < m1) m1 = x; if (x > m2) m2 = x; } }
        lc += e - i0 - nn; if (m1 < lmn) lmn = m1; if (m2 > lmx) lmx = m2;
      }
      if (lc) { if (lmn < mn) mn = lmn; if (lmx > mx) mx = lmx; }
      nul += e - s - lc;
      if (bin) { bmn[t] = lc ? lmn : NaN; bmx[t] = lc ? lmx : NaN; bct[t] = lc; }
    }
    for (i = c - 1; i >= 0; i--) { x = r[i]; if (x - x === 0) { last = x; break; } }
    if (R.q && have) {
      if (N <= SUM_QS) { sv = new Float64Array(c - nul); for (i = 0, j = 0; i < c; i++) { x = r[i]; if (x - x === 0) sv[j++] = x; } }
      if (mx - mn <= SUM_CNT && mn === Math.floor(mn)) { cnt = new Int32Array(mx - mn + 1); for (i = 0; i < c; i++) { x = r[i]; if (x - x !== 0) continue; if (x !== Math.floor(x)) { cnt = null; break; } cnt[x - mn]++; } }   // whole numbers close together: counted
      // the sample sorted (since 0.24.0 without the radix sort when it is already in order, rising or falling, or when the block's values were counted: a counting sort over that small range)
      if (asc) { /* in order */ } else if (desc) { if (!pre) sv.reverse(); } else if (pre) { /* sorted before the pass */ } else if (cnt) { var sc = new Int32Array(cnt.length), q2; for (i = 0; i < sv.length; i++) sc[sv[i] - mn]++; for (q2 = 0, i = 0; q2 < sc.length; q2++) for (t = sc[q2]; t > 0; t--) sv[i++] = mn + q2; } else sortF64(sv, mn, mx);
      svn = sv.length;
      if (N > SUM_QS && svn > SUM_KEEP && c < N) { var kp = new Float64Array(SUM_KEEP), z; for (z = 0; z < SUM_KEEP; z++) kp[z] = sv[Math.floor((z + 0.5) * svn / SUM_KEEP)]; sv = kp; }   // a long block keeps SUM_KEEP order statistics of its sample, each the middle one of the svn / SUM_KEEP values it stands for (since 0.24.1; taking the sample's two ends too gave them the weight of a whole slice and read the tails high: p99 1.9% and the 99.9th 12% over on a skewed column, now 0.5% and 2.7%)
      G = R.G; gv = []; for (j = 0; j < G.length; j++) if (G[j] >= a0 && G[j] < a0 + c) gv.push(G[j], r[G[j] - a0]);
      if (ct && ct.cap && !asc && !desc && !cnt) {
        if (tc && tf >= 0) { for (i = 0; i < tf; i++) { x = r[i]; if (x >= th) { if (x === th) eh++; else { if (nh < tcap) TB[nh] = x; nh++; } } else if (x <= tlo) { if (x === tlo) el++; else { if (nl < tcap) TB[tcap + nl] = x; nl++; } } }
          tl = tailsFin(TB, tcap, th, tlo, nh, nl, eh, el); }
        else tl = blockTails(r, c, ct.th, ct.tlo, ct.cap);
      }   // (a counted block needs none: a column counted in every block has an exact grid)
    }
    return { a: a0, n: c, nulls: nul, have: have, mn: mn, mx: mx, asc: have && asc, desc: have && desc, first: first, last: last, sv: sv, svn: svn, gv: gv, cnt: cnt, b0: b0, bmn: bmn, bmx: bmx, bct: bct, tl: tl };
  }
  // since 0.26.0: every value in each end of the block, so the grid points in the outer 1/91 of the column (the tail points, and the last two even steps at each end) are read from all values, not the
  // sample (on skewed columns the sample put "count above" 10% to 70% off there). The cuts come from the block's own sorted sample, a little past 1/90.5 of the block, so a block a little heavier
  // in a tail still gives all it holds; one more pass (blockTails) takes every value at or past them into TAILBUF (high side from 0, low side from cap).
  var TAILBUF = null;
  // the block's sample (at the fixed positions sposAt gives), read before the pass; unless it is in order or looks counted (whole numbers within SUM_CNT), also sorted, with the tail cuts:
  // 15% past 1/90.5 of the block from each end, plus three standard errors of the sample. Kept apart from blockStats' pass (a pass with the cuts inside it ran slower in Firefox and WebKitGTK).
  function blockCuts(r, c, a0, N) {
    var j = Math.max(0, Math.floor(a0 * SUM_QS / N) - 1), t = 0, i, p, x, sv, sa = true, sd = true, lo = Infinity, hi = -Infinity, d;
    while (j < SUM_QS && sposAt(j, N) < a0) j++;
    sv = new Float64Array(Math.min(SUM_QS - j, Math.ceil(c * SUM_QS / N) + 2));   // positions rise by at least one slice each, so the block holds at most this many
    for (; j < SUM_QS && (p = sposAt(j, N)) < a0 + c; j++) { x = r[p - a0]; if (x - x === 0) sv[t++] = x; } sv = sv.subarray(0, t);
    for (i = 1; i < t && (sa || sd); i++) { if (sv[i] < sv[i - 1]) sa = false; else if (sv[i] > sv[i - 1]) sd = false; }
    if (!t || sa || sd) return { sv: sv, pre: false };
    for (i = 0; i < t; i++) { x = sv[i]; if (x !== Math.floor(x)) break; if (x < lo) lo = x; if (x > hi) hi = x; }
    if (i === t && hi - lo <= SUM_CNT) return { sv: sv, pre: false };   // whole numbers close together: the block will most likely be counted (exact without tails)
    sortF64(sv); d = Math.ceil((1.15 / 90.5 + 3 * Math.sqrt(t / 90.5) / t) * t) + 1;
    return d >= t ? { sv: sv, pre: true, th: -Infinity, tlo: Infinity, cap: c } : { sv: sv, pre: true, th: sv[t - 1 - d], tlo: sv[d], cap: Math.max(512, c >> 3) };
  }
  function blockTails(r, c, th, tlo, cap) {   // -> { th, hs, hv, tlo, ls, lv }: hv every value >= th (> th when hs), rising; lv every value <= tlo (< tlo when ls); a side whose cut value is shared by too many values takes the strict side of it
    var B, i, x, nh = 0, nl = 0, eh = 0, el = 0;
    if (tlo >= th) return blockTails0(r, c, th, tlo, cap);   // overlapping cuts (only on a tiny sample): the two-pass form
    if (!TAILBUF || TAILBUF.length < 2 * cap) TAILBUF = new Float64Array(2 * cap); B = TAILBUF;
    for (i = 0; i < c; i++) { x = r[i]; if (x >= th) { if (x === th) eh++; else { if (nh < cap) B[nh] = x; nh++; } } else if (x <= tlo) { if (x === tlo) el++; else { if (nl < cap) B[cap + nl] = x; nl++; } } }   // NaN fails both; values at a cut only counted (since 0.26.3: one pass, where a cut shared by many values, as a tip of 0, took a second)
    return tailsFin(B, cap, th, tlo, nh, nl, eh, el);
  }
  function tailsFin(B, cap, th, tlo, nh, nl, eh, el) {   // nh, nl values past the cuts in B (high from 0, low from cap), eh, el values at them: past the cut when they all fit, else the strict side
    var hs = false, ls = false;
    if (nh > cap || nl > cap) return null;
    if (nh + eh > cap) { if (th > -Infinity) hs = true; else return null; } else for (; eh > 0; eh--) B[nh++] = th;
    if (nl + el > cap) { if (tlo < Infinity) ls = true; else return null; } else for (; el > 0; el--) B[cap + nl++] = tlo;
    return { th: th, hs: hs, hv: tailVals(B.subarray(0, nh)), tlo: tlo, ls: ls, lv: tailVals(B.subarray(cap, cap + nl)) };
  }
  function blockTails0(r, c, th, tlo, cap) {
    var B, i, x, nh = 0, nl = 0, hs = false, ls = false;
    if (!TAILBUF || TAILBUF.length < 2 * cap) TAILBUF = new Float64Array(2 * cap); B = TAILBUF;
    for (i = 0; i < c; i++) { x = r[i]; if (x >= th) { if (nh < cap) B[nh] = x; nh++; } else if (x <= tlo) { if (nl < cap) B[cap + nl] = x; nl++; } }   // NaN fails both
    if (th > -Infinity && nh > cap) { hs = true; nh = 0; for (i = 0; i < c; i++) { x = r[i]; if (x > th) { if (nh === cap) return null; B[nh++] = x; } } }
    if (tlo < Infinity && nl > cap) { ls = true; nl = 0; for (i = 0; i < c; i++) { x = r[i]; if (x < tlo) { if (nl === cap) return null; B[cap + nl++] = x; } } }
    if (nh > cap || nl > cap) return null;
    return { th: th, hs: hs, hv: tailVals(B.subarray(0, nh)), tlo: tlo, ls: ls, lv: tailVals(B.subarray(cap, cap + nl)) };
  }
  function tailVals(a) { var o = new Float64Array(a.length), n = 0, i, x; for (i = 0; i < a.length; i++) { x = a[i]; if (x - x === 0) o[n++] = x; } return sortF64(n < o.length ? o.slice(0, n) : o); }   // finite values only (an infinity can pass a cut), rising
  // ascending sort of finite doubles in place (since 0.26.0): an LSD radix sort over the top 32 bits only (sign, exponent and 20 bits of the fraction: three 11-bit digits, digits every value shares
  // skipped), then one insertion pass puts values that share those bits right by the rest. 30% to 50% quicker than the full 64-bit sort below (and than sort()) from 1,500 values in all three browsers.
  // Columns whose values crowd few top words (dates in milliseconds share one per 17 minutes) take the full sort: when the top words span fewer than 4 per value, when 256 spread values show crowding,
  // or when the insertion pass moves too much.
  var KF = new Float64Array(1), KU = new Uint32Array(KF.buffer);
  function topKey(x) { KF[0] = x; var y = KU[1]; return y & 0x80000000 ? ~y >>> 0 : (y | 0x80000000) >>> 0; }   // the order-preserving key of x's top 32 bits (little-endian, as typed arrays are on every browser)
  function sortF64(a, lo, hi) {   // lo, hi: the smallest and largest value when the caller knows them
    var n = a.length, u, k, k2, v, v2, i, d, sh, cnt, y, t, pos, kk, mv = 0, x;
    if (n < 1500) { a.sort(); return a; }
    if (lo === undefined) { lo = Infinity; hi = -Infinity; for (i = 0; i < n; i++) { x = a[i]; if (x < lo) lo = x; if (x > hi) hi = x; } }
    if (sortWhole(a, n, lo, hi, 100) || sortWhole(a, n, lo, hi, 1)) return a;
    if (topKey(hi) - topKey(lo) < 4 * n || crowded(a, n)) return sortF64full(a);
    u = new Uint32Array(a.buffer, a.byteOffset, n * 2); k = new Uint32Array(n);
    for (i = 0; i < n; i++) { y = u[2 * i + 1]; k[i] = y & 0x80000000 ? ~y >>> 0 : (y | 0x80000000) >>> 0; }   // order-preserving keys
    k2 = new Uint32Array(n); v = new Float64Array(a); v2 = new Float64Array(n); cnt = new Int32Array(2048);
    for (d = 0; d < 3; d++) {
      sh = d * 11; cnt.fill(0);
      for (i = 0; i < n; i++) cnt[(k[i] >>> sh) & 2047]++;
      if (cnt[(k[0] >>> sh) & 2047] === n) continue;
      for (i = 0, pos = 0; i < 2048; i++) { t = cnt[i]; cnt[i] = pos; pos += t; }
      for (i = 0; i < n; i++) { t = cnt[(k[i] >>> sh) & 2047]++; k2[t] = k[i]; v2[t] = v[i]; }
      kk = k; k = k2; k2 = kk; kk = v; v = v2; v2 = kk;
    }
    for (i = 1; i < n; i++) { x = v[i]; if (x < v[i - 1]) { t = i; do { v[t] = v[t - 1]; t--; } while (t > 0 && v[t - 1] > x); v[t] = x; mv += i - t; if (mv > 2 * n) { a.set(v); return sortF64full(a); } } }
    a.set(v); return a;
  }
  // values that are all whole hundredths (or whole numbers) within 2^22 of them of each other, as prices, amounts and counts usually are: sorted as those whole numbers, two 11-bit passes, then
  // written back as m / sc, which is the same double the value was (checked for every value; the first that is not ends it). Since 0.26.0; about twice as quick as the top-word sort on such columns.
  var SWK = null, SWK2 = null;
  function sortWhole(a, n, lo, hi, sc) {
    var base = Math.round(lo * sc), span = Math.round(hi * sc) - base, k, k2, i, x, m, d, sh, cnt, t, pos, kk;
    if (!(span >= 0 && span < 4194304)) return false;
    if (!SWK || SWK.length < n) { SWK = new Int32Array(n); SWK2 = new Int32Array(n); } k = SWK; k2 = SWK2;
    for (i = 0; i < n; i++) { x = a[i]; m = Math.round(x * sc); if (m / sc !== x) return false; k[i] = m - base; }
    cnt = new Int32Array(2048);
    for (d = 0; d < 2; d++) {
      sh = d * 11; if (d && span < 2048) break; cnt.fill(0);
      for (i = 0; i < n; i++) cnt[(k[i] >> sh) & 2047]++;
      for (i = 0, pos = 0; i < 2048; i++) { t = cnt[i]; cnt[i] = pos; pos += t; }
      for (i = 0; i < n; i++) { t = cnt[(k[i] >> sh) & 2047]++; k2[t] = k[i]; }
      kk = k; k = k2; k2 = kk;
    }
    for (i = 0; i < n; i++) a[i] = (k[i] + base) / sc;
    return true;
  }
  var CRK = new Uint32Array(512), CRV = new Float64Array(512), CRU = new Uint8Array(512);
  function crowded(a, n) {   // 256 values spread over the array: do more than 4 share a top word with another value that is not equal to them (each such group costs the insertion pass its size squared)
    var st = Math.floor(n / 256), j, i, h, d = 0, y; CRU.fill(0);
    for (j = 0; j < 256; j++) { i = j * st; y = topKey(a[i]); h = Math.imul(y, 0x9E3779B1) >>> 23;
      while (CRU[h] && CRK[h] !== y) h = (h + 1) & 511;
      if (!CRU[h]) { CRU[h] = 1; CRK[h] = y; CRV[h] = a[i]; } else if (CRV[h] !== a[i] && ++d > 4) return true; }
    return false;
  }
  function sortF64full(a) {   // the same over all 64 bits (11-bit digits, digits every value shares are skipped)
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
  function sbMoves(sb) {   // a block's summary part's own buffers, moved (not copied) when a helper sends it back (since 0.26.0; the sample alone is 512 KB on a long block)
    var o = [], l, i, b; if (!sb) return o; l = [sb.sv, sb.cnt, sb.bmn, sb.bmx, sb.bct, sb.tl && sb.tl.hv, sb.tl && sb.tl.lv];
    for (i = 0; i < l.length; i++) { b = l[i] && l[i].buffer; if (b && !(TAILBUF && b === TAILBUF.buffer) && o.indexOf(b) < 0) o.push(b); }
    return o;
  }
  function capPut(cap, key, sb) { var c = cap.cols[key] || (cap.cols[key] = {}); c[sb.a] = sb; }
  function qWeighted(parts, m) {   // the grid over m sampled values, from each block's sorted kept values (sv, each standing for svn / sv.length values): exact when every block kept all of its sample
    var runs = [], i, j, b, w, a, c, v, wv, x, y, z, k = 0, cum, tot = 0, pts, wt, t;
    if (parts.length === 1 && parts[0].sv.length === parts[0].svn) { t = qSortedArr(parts[0].sv, m); t.qv = qTies(parts[0].sv, null, 1, m); return t; }   // one block that kept its whole sample: the grid straight from it (since 0.26.0)
    for (i = 0; i < parts.length; i++) { b = parts[i]; wv = new Float64Array(b.sv.length).fill(b.svn / b.sv.length); runs.push([b.sv, wv]); }
    while (runs.length > 1) { t = []; for (i = 0; i + 1 < runs.length; i += 2) { a = runs[i]; c = runs[i + 1]; v = new Float64Array(a[0].length + c[0].length); w = new Float64Array(v.length); x = 0; y = 0; z = 0;   // pairwise merges of sorted runs
        while (x < a[0].length && y < c[0].length) { if (a[0][x] <= c[0][y]) { v[z] = a[0][x]; w[z++] = a[1][x++]; } else { v[z] = c[0][y]; w[z++] = c[1][y++]; } }
        while (x < a[0].length) { v[z] = a[0][x]; w[z++] = a[1][x++]; } while (y < c[0].length) { v[z] = c[0][y]; w[z++] = c[1][y++]; } t.push([v, w]); }
      if (i < runs.length) t.push(runs[i]); runs = t; }
    pts = runs[0][0]; wt = runs[0][1]; cum = new Float64Array(pts.length);
    for (i = 0; i < pts.length; i++) { cum[i] = tot + (wt[i] - 1) / 2; tot += wt[i]; }   // the (fractional) rank each kept value stands at (its own rank when it stands for one value)
    t = qOf(function (r) { while (k + 1 < pts.length && cum[k + 1] <= r) k++; if (k + 1 >= pts.length || r <= cum[k]) return pts[k]; var f = (r - cum[k]) / (cum[k + 1] - cum[k]); return pts[k] + f * (pts[k + 1] - pts[k]); }, m);
    t.qv = qTies(pts, wt, 0, tot); return t;
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
        qc = qCounts(cnt, g.mn, tot); g.q = sc === 1 ? qc.q : qMap(qc.q, f); if (qc.exact) { g.qExact = true; g.qn = qc.qn; } }
      else { g.q = qWeighted(runs, m); qTiesTo(g.q, m, tot); if (n > SUM_QS) { g.qSample = m; tailExact(g.q, bl, tot); } if (sc !== 1) g.q = qMap(g.q, f); }
    }
    if (R.bin) {   // pyramid bins of the whole column
      var nb = Math.ceil(n / R.bin), pmn = new Float64Array(nb).fill(NaN), pmx = new Float64Array(nb).fill(NaN), pct = new Uint32Array(nb), t, gb, v;
      for (i = 0; i < bl.length; i++) { b = bl[i]; if (!b.bct) continue; for (t = 0; t < b.bct.length; t++) { if (!b.bct[t]) continue; gb = b.b0 + t; v = b.bmn[t] * sc; if (!(pmn[gb] <= v)) pmn[gb] = v; v = b.bmx[t] * sc; if (!(pmx[gb] >= v)) pmx[gb] = v; pct[gb] += b.bct[t]; } }
      g.pyr = { n: n, bin: R.bin, min: pmn, max: pmx, count: pct, first: g.have ? f(g.first) : NaN, last: g.have ? f(g.last) : NaN };
    }
    return g;
  }
  // the grid points whose ranks lie inside what every block gave from its ends (blockTails), read again from those values: a value at k from the top is exact while it is at or past every block's cut
  function tailExact(q, bl, tot) {
    var hs = [], ls = [], th = -Infinity, ths = -Infinity, tlo = Infinity, tlos = Infinity, i, b, t, k, e, pos, lo, fr, v, w, need = [], hr = [], lr = [], hv, lv, hn = 0, ln = 0;
    for (i = 0; i < bl.length; i++) { b = bl[i]; if (!b.have) continue; t = b.tl; if (!t) return; hs.push(t.hv); ls.push(t.lv); hn += t.hv.length; ln += t.lv.length;
      if (t.hs) { if (t.th > ths) ths = t.th; } else if (t.th > th) th = t.th; if (t.ls) { if (t.tlo < tlos) tlos = t.tlo; } else if (t.tlo < tlo) tlo = t.tlo; }
    for (k = 0; k < QP.length; k++) { pos = QP[k][0] * (tot - 1); lo = Math.floor(pos); need.push(lo); if (pos > lo && lo + 1 < tot) need.push(lo + 1); }   // the ranks the grid reads
    hn = heldPast(hs, th, ths, 1); ln = heldPast(ls, tlo, tlos, -1);   // only values past every block's cut count (all of the column's values there are held)
    for (k = 0; k < need.length; k++) { t = tot - 1 - need[k]; if (t < hn) hr.push(t); else if (need[k] < ln) lr.push(need[k]); }
    hv = walkRanks(hs, hr, -1); lv = walkRanks(ls, lr, 1);
    function at(r) { var t = tot - 1 - r, x; if (t < hn) { x = hv.get(t); if (x !== undefined) return x; } if (r < ln) { x = lv.get(r); if (x !== undefined) return x; } return NaN; }   // the value at rank r of the column, or NaN when it is not held
    var tq = q.qv, tv;   // tied values out where every value was kept: their counts exact (values above them all held, or values below them all held)
    if (tq) for (k = 0; k < tq.length; k += 3) { tv = tq[k];
      if (tv >= th && tv >= ths) { tq[k + 2] = tot - cntPast(hs, tv, 1, false); if (tv > ths) tq[k + 1] = tot - cntPast(hs, tv, 1, true); }
      else if (tv <= tlo && tv <= tlos) { tq[k + 1] = cntPast(ls, tv, -1, false); if (tv < tlos) tq[k + 2] = cntPast(ls, tv, -1, true); } }
    for (k = 0; k < QP.length; k++) { e = QP[k]; pos = e[0] * (tot - 1); lo = Math.floor(pos); fr = pos - lo;
      v = at(lo); if (v !== v) continue; if (fr > 0 && lo + 1 < tot) { w = at(lo + 1); if (w !== w) continue; v = v + fr * (w - v); }
      if (e[1] === 1) q.qt[e[2]] = v; else if (e[1]) { if (q.qx) q.qx[e[2]] = v; } else q[e[2]] = v; }
  }
  function cntPast(runs, v, dir, eq) {   // how many values of the rising runs are > v (dir 1; >= v with eq) or < v (dir -1; <= v with eq)
    var n = 0, i, a, lo, hi, md, x;
    for (i = 0; i < runs.length; i++) { a = runs[i]; lo = 0; hi = a.length;
      if (dir > 0) { while (lo < hi) { md = (lo + hi) >> 1; x = a[md]; if (eq ? x >= v : x > v) hi = md; else lo = md + 1; } n += a.length - lo; }
      else { while (lo < hi) { md = (lo + hi) >> 1; x = a[md]; if (eq ? x <= v : x < v) lo = md + 1; else hi = md; } n += lo; } }
    return n;
  }
  function heldPast(runs, t, ts, dir) {   // how many values of the rising runs are >= t and > ts (dir 1), or <= t and < ts (dir -1): binary searches
    var n = 0, i, a, lo, hi, md, x;
    for (i = 0; i < runs.length; i++) { a = runs[i]; lo = 0; hi = a.length;
      if (dir > 0) { while (lo < hi) { md = (lo + hi) >> 1; x = a[md]; if (x >= t && x > ts) hi = md; else lo = md + 1; } n += a.length - lo; }
      else { while (lo < hi) { md = (lo + hi) >> 1; x = a[md]; if (x <= t && x < ts) lo = md + 1; else hi = md; } n += lo; } }
    return n;
  }
  function walkRanks(runs, ranks, dir) {   // rising runs, walked together from the low end (dir 1) or the high end (dir -1) without merging them: Map of rank (counted from that end) -> value, for the ranks asked
    var m = new Map(), R = runs.length, p = new Int32Array(R), h = new Float64Array(R), i, j = 0, c, best, bv, top, run, sg = dir > 0 ? 1 : -1, end = dir > 0 ? Infinity : -Infinity;
    if (!ranks.length) return m;
    ranks.sort(function (x, y) { return x - y; }); top = ranks[ranks.length - 1];
    for (i = 0; i < R; i++) { p[i] = dir > 0 ? 0 : runs[i].length - 1; h[i] = runs[i].length ? sg * runs[i][p[i]] : Infinity; }   // heads, negated for the high end so the walk always takes the smallest
    for (c = 0; c <= top; c++) {
      best = 0; bv = h[0]; for (i = 1; i < R; i++) if (h[i] < bv) { bv = h[i]; best = i; }
      if (bv === Infinity) break;
      run = runs[best]; p[best] += dir; h[best] = p[best] >= 0 && p[best] < run.length ? sg * run[p[best]] : Infinity;
      while (j < ranks.length && ranks[j] === c) { m.set(c, sg * bv); j++; }
    }
    return m;
  }
  function sumWhole(r, n, R, sc, fl) { return sumMerge({ 0: blockStats(r, n, 0, R) }, n, R, sc, fl); }   // the same, with the whole column as one block (on this thread)
  function rowsF64(a, n) {   // a plain array of numbers, null and undefined -> Float64Array with NaN for the missing values; null when it holds anything else
    var r = new Float64Array(n), i, x; for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number') r[i] = x; else if (x === null || x === undefined) r[i] = NaN; else return null; } return r;
  }
  function putMerged(c, g, type) {   // a merged result into the summary entry; the pyramid rides along (taken off before the entry is written)
    c.type = type; c.nulls = g.nulls; c.min = g.have ? g.min : null; c.max = g.have ? g.max : null; c.sorted = g.have ? (g.asc ? 'asc' : g.desc ? 'desc' : null) : null;
    if (g.q) { c.q = g.q; if (g.q.qt && !g.qExact) c.qt = g.q.qt; if (g.q.qx && !g.qExact) c.qx = g.q.qx; if (g.q.qv && g.q.qv.length && !g.qExact) c.qv = g.q.qv; if (g.qExact) { c.qExact = true; c.qn = g.qn; } if (g.qSample) c.qSample = g.qSample; }
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
    if (!nl && (sa || sd)) { c.q = qOf(sa ? function (r) { return sumDateMs(a[r]); } : function (r) { return sumDateMs(a[n - 1 - r]); }, n); for (j = 0; j < c.q.length; j++) if (c.q[j] === null) { delete c.q; return; } for (j = 0; j < c.q.qt.length; j++) if (c.q.qt[j] === null) { delete c.q; return; } for (j = 0; j < c.q.qx.length; j++) if (c.q.qx[j] === null) { delete c.q; return; } c.qt = c.q.qt; c.qx = c.q.qx; return; }
    if (n <= SUM_QS / 4) { P = null; m = n; } else { P = sumPos(n); m = SUM_QS / 4; }
    sm = new Float64Array(m); step = P ? 4 : 1;
    for (j = 0, x = 0; j < m; j++) { t = a[P ? P[j * step] : j]; if (typeof t === 'string' && (t = sumDateMs(t)) !== null) sm[x++] = t; }
    if (!x) return; sm = sm.subarray(0, x); sm.sort(); c.q = qSortedArr(sm, x); c.qt = c.q.qt; if (c.q.qx) c.qx = c.q.qx; if (P) c.qSample = x;
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
    if (isByteCol(a)) {   // text held as bytes: length range in bytes; a column the writer stored as dates (every block left date numbers) is summed as dates (since 0.16.0)
      if (cp) { var kb = Object.keys(cp), du = kb.length > 0; for (i = 0; i < kb.length; i++) if (cp[kb[i]].u === undefined) du = false; if (du && (g = sumMergeU(cp, n, R)) && !g.nulls) return putMerged(c, g, 'date'); }
      if (n >= 1) { var bf = dateForm(a.end[0] - a.start[0], a.bytes[a.start[0] + 10]), bw = bf < 0 ? -1 : dateW(bf), bd = null, bt;   // date text the writer kept as text (few distinct values): parsed here
        if (bw > 0) { bd = new Float64Array(n); for (i = 0; i < n; i++) { if (a.end[i] - a.start[i] !== bw || !((bt = dateAt(a.bytes, a.start[i], bf)) >= 0)) { bd = null; break; } bd[i] = bt; } }
        if (bd) return putMerged(c, sumWhole(bd, n, R, bf & 4 ? 0.001 : 1, !!(bf & 4)), 'date'); }
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
    var so = opts._sort || null, keys = Object.keys(obj).filter(function (k) { return !(so && so.keep && k === SORT_ROW) && !(so && so.hide && so.hide.indexOf(k) >= 0); }), cut = keys.length > SUM_KEYS, m = cut ? SUM_KEYS : keys.length, cols = new Array(m), bad = false, R = sumReq(n, opts.quantiles !== false, opts.pyramids), cap = { cols: {}, R: R }, st = new Uint8Array(m);
    function one(k) { st[k] = 1; try { cols[k] = sumColumn(keys[k], obj[keys[k]], n, cap.cols[keys[k]], R); } catch (e) { bad = true; } }
    function next(early) {   // early (blocks still being written): only columns that are not plain arrays or typed numbers, since those wait for the parts every block leaves
      for (var k = 0; k < m; k++) if (!st[k] && !(early && waits(obj[keys[k]]))) { one(k); return true; }
      return false; }
    function waits(a) {   // typed numbers, timestamps and plain arrays wait for the blocks' parts, except a plain array of text that is not date-like (no block leaves a part for it; since 0.26.0 it runs early)
      if (ArrayBuffer.isView(a) || isTsCol(a)) return true; if (!Array.isArray(a)) return false;
      for (var i = 0; i < a.length && (a[i] === null || a[i] === undefined); i++);
      return !(i < a.length && typeof a[i] === 'string' && !SUM_DATE.test(a[i]));
    }
    function result() {
      if (bad) return { sum: null, pyr: null };
      var py = [], k, o; for (k = 0; k < m; k++) if (cols[k]._pyr) { py.push([keys[k], cols[k]._pyr]); delete cols[k]._pyr; }
      o = { v: 1, rows: n }; if (so) { if (so.key === null) o.scrambled = { seed: so.scr }; else o.sortedBy = so.key; if (so.hide) o.hidden = so.hide; if (so.keep) o.rowIndex = SORT_ROW; if (so.key !== null) for (k = 0; k < m; k++) if (keys[k] === so.key) cols[k].sorted = so.desc ? 'desc' : 'asc'; }   // since 0.16.0: the sortBy column, and the column keepOrder added (not summed itself)
      o.cols = cols; if (cut) { o.colsCut = true; if (so && (so.keep || so.hide)) o.keys = keys; }
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
  function pyramids(bytes, key, opts) {   // { key: { n, bin, min, max, count, first, last } } from footer section 21, one entry with key, or null; nothing is decoded
    if (key !== null && typeof key === 'object') { opts = key; key = undefined; }
    var p = pyrRead(readFooter(S.zdec, bytes).sec[SEC_PYRAMID], key), k;
    if (!p || !(opts && opts.full)) return p;
    if (key !== undefined) { pyrFull(bytes, key, p); return p; }
    for (k in p) pyrFull(bytes, k, p[k]);
    return p;
  }
  // { full: true } (since 0.16.0): each entry also gets full(), which reads that one column the first time it is called and returns all its values as a Float64Array (NaN for a missing value,
  // dates in epoch milliseconds, as the bins are), so a chart that is wider than the bins can draw every point without the app wiring up the read (netflow-plot calls it only then)
  function pyrFull(bytes, k, p) {
    var got = null;
    p.full = function () {
      if (got) return got;
      var bl = unpackColumns(bytes, { keys: [k], nulls: 'NaN', dates: 'numbers' }), n = 0, i, j, c, sc, o = 0;
      for (i = 0; i < bl.length; i++) n += bl[i].n;
      got = new Float64Array(n);
      for (i = 0; i < bl.length; i++) { c = bl[i].cols[k]; sc = bl[i].dates && bl[i].dates[k] && bl[i].dates[k].unit === 'us' ? 0.001 : 1;
        if (!c) { got.fill(NaN, o, o + bl[i].n); o += bl[i].n; continue; }
        for (j = 0; j < bl[i].n; j++) { var v = c[j]; got[o + j] = typeof v === 'number' ? v * sc : NaN; } o += bl[i].n; }
      return got;
    };
  }
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
    nf = concat([new Uint8Array([1]), S.zfull.compress(concat(parts), 1)]);   // level 1 (since 0.26.0; 3 before): 0.5 to 1 ms less per save, the footer under 0.1% of the file bigger
    t.set(u32le(nf.length), 0); t.set(u32le(crcJS(nf, 0)), 4); t.set(file.subarray(n - 8, n - 4), 8); t.set(MAGIC, 12);
    return concat([file.subarray(0, n - 16 - flen), nf, t]);
  }
  // since 0.18.0: answers from the quantile grid with nothing decoded. quantile(key, p) -> the value at share p (0..1) of the column's non-missing values, linear between ranks (as the grid is built);
  // countAbove(key, x) / countBelow(key, x) -> how many non-missing values are > x / < x. Exact when the entry is exact (qExact: the distinct values and their counts; or a grid read from every value
  // at ranks that hit each value), otherwise an estimate within the grid's rank error (one grid step is 1/256 of the values). null when the column has no grid. Dates: x and the answer in epoch ms (a Date is taken too).
  function sumEntry(s, key) { var cs = s.cols, i; for (i = 0; i < cs.length; i++) if (cs[i].key === key) return cs[i].q && cs[i].q.length ? cs[i] : null; return null; }
  function sumGrid(c) { var q = c.q; if (c.qExact || q[0] === c.min && q[q.length - 1] === c.max || typeof c.min !== 'number') return q; q = q.slice(); q[0] = c.min; q[q.length - 1] = c.max; return q; }   // a sampled grid's ends are the sample's: the true ends are min and max
  function sumX(x) { return x instanceof Date ? x.getTime() : +x; }
  // with tail points (since 0.24.0): the shares and values of every grid point, ends at min and max, read linearly between neighbours (as the even steps are)
  function sumPts(c) { var q = sumGrid(c), P = [], V = [], k, e, x = c.qx && c.qx.length === 2 * SUM_QX ? c.qx : null; for (k = 0; k < QP.length; k++) { e = QP[k]; if (e[1] === 2 && !x) continue; P.push(e[0]); V.push(e[1] === 1 ? c.qt[e[2]] : e[1] ? x[e[2]] : q[e[2]]); } return { P: P, V: V }; }   // (qx points only when the file has them)
  function sumQuantile(key, p) {
    var c = sumEntry(this, key), q, m, r, lo, k, run, v, w; if (!c) return null; p = +p; if (!(p >= 0 && p <= 1)) throw new Error('LfcPack: quantile p must be from 0 to 1');
    q = sumGrid(c); m = q.length;
    if (c.qExact) { for (k = 0, run = 0; k < m; k++) run += c.qn[k]; r = p * (run - 1); lo = Math.floor(r);
      for (k = 0, run = 0; k < m && run + c.qn[k] <= lo; k++) run += c.qn[k]; v = q[k]; if (r === lo || run + c.qn[k] > lo + 1) return v; w = q[k + 1]; return v + (r - lo) * (w - v); }
    if (c.qt && c.qt.length === 2 * SUM_QT) { var G = sumPts(c), P = G.P, V = G.V; for (k = 0; k + 2 < P.length && P[k + 1] <= p; k++); if (p <= P[k]) return V[k]; if (p >= P[k + 1]) return V[k + 1]; return V[k] + (p - P[k]) / (P[k + 1] - P[k]) * (V[k + 1] - V[k]); }
    r = p * (m - 1); lo = Math.floor(r); return r === lo ? q[lo] : q[lo] + (r - lo) * (q[lo + 1] - q[lo]);
  }
  function sumCount(key, x, above) {   // non-missing values > x (above) or < x
    var c = sumEntry(this, key), q, m, N, k, cnt, lo, hi, a, b, f; if (!c) return null; x = sumX(x); if (x !== x) return null; q = sumGrid(c); m = q.length; N = c.n - c.nulls;
    if (c.qExact) { for (k = 0, cnt = 0; k < m; k++) if (above ? q[k] > x : q[k] < x) cnt += c.qn[k]; return cnt; }
    if (above ? x < q[0] : x > q[m - 1]) return N; if (above ? x >= q[m - 1] : x <= q[0]) return 0;
    if (c.qv && c.qv.length) return sumCountTies(c, q, N, x, above);
    // the fractional rank r where the grid reaches x: values at ranks 0..floor(r) are <= x (for above), ranks 0..ceil(r)-1 are < x (for below)
    var s = (N - 1) / (m - 1), r;
    if (c.qt && c.qt.length === 2 * SUM_QT) { var G = sumPts(c), P = G.P, V = G.V, M = P.length;   // the same steps over the grid with tail points: the share where the grid reaches x, as a rank
      if (above) { lo = 0; hi = M - 2; while (lo < hi) { k = (lo + hi + 1) >> 1; if (V[k] <= x) lo = k; else hi = k - 1; } r = (P[lo] + (x - V[lo]) / (V[lo + 1] - V[lo]) * (P[lo + 1] - P[lo])) * (N - 1); r = Math.round(r * 1e9) / 1e9; return N - Math.min(N, Math.floor(r) + 1); }
      lo = 1; hi = M - 1; while (lo < hi) { k = (lo + hi) >> 1; if (V[k] >= x) hi = k; else lo = k + 1; } r = (P[lo - 1] + (x - V[lo - 1]) / (V[lo] - V[lo - 1]) * (P[lo] - P[lo - 1])) * (N - 1); r = Math.round(r * 1e9) / 1e9; return Math.min(N, Math.ceil(r)); }
    if (above) { lo = 0; hi = m - 2; while (lo < hi) { k = (lo + hi + 1) >> 1; if (q[k] <= x) lo = k; else hi = k - 1; } r = (lo + (x - q[lo]) / (q[lo + 1] - q[lo])) * s; r = Math.round(r * 1e9) / 1e9; return N - Math.min(N, Math.floor(r) + 1); }
    lo = 1; hi = m - 1; while (lo < hi) { k = (lo + hi) >> 1; if (q[k] >= x) hi = k; else lo = k + 1; } r = (lo - 1 + (x - q[lo - 1]) / (q[lo] - q[lo - 1])) * s; r = Math.round(r * 1e9) / 1e9; return Math.min(N, Math.ceil(r));
  }
  function sumCountTies(c, q, N, x, above) {   // since 0.26.2: the grid as knots [value, first rank, last rank]; a tied value spans its run (from qv), counts read linearly between knots
    var K = [], t = c.qv, P, V, k, i, j, v, a, b, le, lt, A, B, f;
    if (c.qt && c.qt.length === 2 * SUM_QT) { var G = sumPts(c); P = G.P; V = G.V; } else { P = []; V = q; for (k = 0; k < q.length; k++) P.push(k / (q.length - 1)); }
    for (k = 0, i = 0; k < V.length || i < t.length;) {   // merge grid points and tied values by value; grid points inside a tied run fold into it
      if (i < t.length && (k >= V.length || t[i] <= V[k])) { v = t[i]; K.push([v, t[i + 1], t[i + 2] - 1]); while (k < V.length && V[k] === v) k++; i += 3; }
      else { v = V[k]; a = P[k] * (N - 1); b = a; while (k + 1 < V.length && V[k + 1] === v) { k++; b = P[k] * (N - 1); } K.push([v, a, b]); k++; } }
    for (j = 1; j < K.length; j++) { if (K[j][1] < K[j - 1][2]) K[j][1] = K[j - 1][2]; if (K[j][2] < K[j][1]) K[j][2] = K[j][1]; }   // keep ranks rising where an estimate and an exact count meet
    for (j = 0; j < K.length && K[j][0] < x; j++);
    if (j < K.length && K[j][0] === x) { lt = K[j][1]; le = K[j][2] + 1; }
    else if (j === 0) { lt = le = 0; } else if (j === K.length) { lt = le = N; }
    else { A = K[j - 1]; B = K[j]; f = (x - A[0]) / (B[0] - A[0]); lt = le = A[2] + 1 + f * (B[1] - A[2] - 1); }
    le = Math.round(le); lt = Math.round(lt); if (le > N) le = N; if (lt < 0) lt = 0;
    return above ? N - le : lt;
  }
  function sumAttach(s) {
    if (s && Array.isArray(s.cols)) { var d = function (k, fn) { Object.defineProperty(s, k, { value: fn, enumerable: false, configurable: true, writable: true }); };
      d('quantile', sumQuantile); d('countAbove', function (key, x) { return sumCount.call(this, key, x, true); }); d('countBelow', function (key, x) { return sumCount.call(this, key, x, false); }); }
    return s;
  }
  function summary(bytes) { var s = readFooter(S.zdec, bytes).sec[SEC_SUMMARY]; return s ? sumAttach(JSON.parse(tdr.decode(s))) : null; }   // the column summary the file carries (footer section 20), or null; nothing is decoded
