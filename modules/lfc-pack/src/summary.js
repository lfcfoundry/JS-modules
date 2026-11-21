// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ column summaries (footer section 20, optional, advisory; SPEC.md 2.3a)
  // { v: 1, rows, cols: [{ key, type: 'num' | 'date' | 'text' | 'other', n, nulls, min, max, sorted, distinct, hist, len, top }], colsCut }; one entry per key over the whole file
  var SEC_SUMMARY = 20, SUM_KEYS = 1000, SUM_HIST = 64, SUM_TOP = 16, SUM_DISTINCT_CAP = 64, SUM_TEXT_ROWS = 65536;   // text columns are counted over their first SUM_TEXT_ROWS rows only (`sample` says so)
  var SUM_DATE = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(\.\d+)?Z?$/;
  // quantile grid (replaces hist unless quantiles: false): SUM_Q values at p = i / 256, linear between ranks. Exact when the column is ordered, is whole numbers over a short range (counted), or has at most SUM_QS values;
  // otherwise read from SUM_QS values at fixed jittered positions (`qSample` says how many). At most SUM_Q different values: those values with their counts instead (`qExact`, `qn`).
  var SUM_Q = 257, SUM_QS = 65536, SUM_QRANGE = 65536, sumPosN = -1, sumPosA = null;
  function sumPos(n) {   // SUM_QS row positions spread over 0..n-1, one at a fixed random place in each equal slice (the same for every column and every run)
    if (n === sumPosN) return sumPosA;
    var p = new Int32Array(SUM_QS), s = 0x9E3779B9, j, w = n / SUM_QS;
    for (j = 0; j < SUM_QS; j++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; p[j] = Math.min(n - 1, Math.floor((j + s / 4294967296) * w)); }
    sumPosN = n; sumPosA = p; return p;
  }
  function qOf(get, m) { var q = new Array(SUM_Q), k, pos, lo, fr, v; for (k = 0; k < SUM_Q; k++) { pos = k / (SUM_Q - 1) * (m - 1); lo = Math.floor(pos); fr = pos - lo; v = get(lo); q[k] = fr > 0 && lo + 1 < m ? v + fr * (get(lo + 1) - v) : v; } return q; }   // the grid from a value-at-rank function over m ranks
  function qSortedArr(s, m) { return qOf(function (r) { return s[r]; }, m); }
  function sumGridIdx(n) { var g = [], k, pos, lo; for (k = 0; k < SUM_Q; k++) { pos = k / (SUM_Q - 1) * (n - 1); lo = Math.floor(pos); g.push(lo); if (lo + 1 < n) g.push(lo + 1); } return g; }
  function qCounts(cnt, base, tot) {   // whole numbers counted over [base, base + cnt.length): exact distinct values, or the exact grid
    var d = 0, i, vals = [], ns = [], at, run;
    for (i = 0; i < cnt.length; i++) if (cnt[i]) { d++; if (d <= SUM_Q) { vals.push(base + i); ns.push(cnt[i]); } }
    if (d <= SUM_Q) return { q: vals, qn: ns, exact: true, distinct: d };
    at = 0; run = 0;   // value at rank r: walk the counts forward (ranks are asked for in rising order)
    return { q: qOf(function (r) { while (run + cnt[at] <= r) { run += cnt[at]; at++; } return base + at; }, tot), exact: false, distinct: d };
  }
  // one copy of the number pass per kind of array (integer typed arrays, float typed arrays, plain arrays), so each copy stays monomorphic and fast
  function makeSumNums(kind) {   // kind 0: integer typed array (no missing values), 1: float typed array, 2: plain array (numbers, null, undefined)
    return function (a, n, wantQ) {   // -> { nulls, min, max, asc, desc, hist | q.. }, or null when a plain array holds something that is not a number, null or undefined
      var mn = Infinity, mx = -Infinity, nul = 0, asc = true, desc = true, prev = 0, have = false, i, x, hist = null, w, b, r;
      if (kind === 0) {
        if (n > 0) { mn = mx = prev = a[0]; have = true; }
        for (i = 1; i < n && (asc || desc); i++) { x = a[i]; if (x < prev) asc = false; else if (x > prev) desc = false; if (x < mn) mn = x; else if (x > mx) mx = x; prev = x; }   // one pass: range and order, until the order is settled as neither
        for (; i < n; i++) { x = a[i]; if (x < mn) mn = x; else if (x > mx) mx = x; }   // then the range alone (no unpredictable order tests left)
      } else {
        for (i = 0; i < n && (asc || desc); i++) {
          x = a[i];
          if (kind === 2 && typeof x !== 'number') { if (x === null || x === undefined) { nul++; continue; } return null; }
          if (!(x - x === 0)) { nul++; continue; }   // NaN and +-Infinity count as missing: JSON cannot hold them
          if (!have) { mn = mx = prev = x; have = true; continue; }
          if (x < prev) asc = false; else if (x > prev) desc = false; if (x < mn) mn = x; else if (x > mx) mx = x; prev = x;
        }
        for (; i < n; i++) {   // the order is settled as neither: the range and missing values alone
          x = a[i];
          if (kind === 2 && typeof x !== 'number') { if (x === null || x === undefined) { nul++; continue; } return null; }
          if (!(x - x === 0)) { nul++; continue; }
          if (x < mn) mn = x; else if (x > mx) mx = x;
        }
      }
      r = { nulls: nul, min: have ? mn : null, max: have ? mx : null, asc: have && asc, desc: have && desc, hist: null };
      if (!have) return r;
      if (!wantQ) {
        if (mx > mn) {
          hist = new Array(SUM_HIST); for (b = 0; b < SUM_HIST; b++) hist[b] = 0;
          w = SUM_HIST / (mx - mn);
          if (kind === 0) for (i = 0; i < n; i++) { b = ((a[i] - mn) * w) | 0; hist[b >= SUM_HIST ? SUM_HIST - 1 : b]++; }
          else for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number' && x - x === 0) { b = ((x - mn) * w) | 0; hist[b >= SUM_HIST ? SUM_HIST - 1 : b]++; } }
          r.hist = hist;
        }
        return r;
      }
      var tot = n - nul, cnt, sm, m, j, P, isInt = kind === 0;
      if (!isInt && mx - mn <= SUM_QRANGE && mn === Math.floor(mn) && mx === Math.floor(mx)) {   // whole numbers in a short range: check every value is whole (stops at the first that is not), then count
        isInt = true; for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number' && x - x === 0 && x !== Math.floor(x)) { isInt = false; break; } }
      }
      if (isInt && mx - mn <= SUM_QRANGE) {
        cnt = new Int32Array(mx - mn + 1);
        if (kind === 0) for (i = 0; i < n; i++) cnt[a[i] - mn]++;
        else for (i = 0; i < n; i++) { x = a[i]; if (typeof x === 'number' && x - x === 0) cnt[x - mn]++; }
        var qc = qCounts(cnt, mn, tot); r.q = qc.q; if (qc.exact) { r.qExact = true; r.qn = qc.qn; } return r;
      }
      if (!nul && (asc || desc)) { r.q = qOf(desc && !asc ? function (k) { return a[n - 1 - k]; } : function (k) { return a[k]; }, n); return r; }   // ordered: the grid is read straight off the column
      if (tot <= SUM_QS) { sm = new Float64Array(tot); for (i = 0, j = 0; i < n; i++) { x = a[i]; if (typeof x === 'number' && x - x === 0) sm[j++] = x; } sm.sort(); r.q = qSortedArr(sm, tot); return r; }
      P = sumPos(n); sm = new Float64Array(SUM_QS); for (j = 0, m = 0; j < SUM_QS; j++) { x = a[P[j]]; if (typeof x === 'number' && x - x === 0) sm[m++] = x; }
      if (!m) return r;
      sm = sm.subarray(0, m); sm.sort(); r.q = qSortedArr(sm, m); r.qSample = m; return r;
    };
  }
  var sumI = makeSumNums(0), sumF = makeSumNums(1), sumP = makeSumNums(2);
  function sumNums(a, n, plain, wantQ) { return plain ? sumP(a, n, wantQ) : (a instanceof Float64Array || a instanceof Float32Array) ? sumF(a, n, wantQ) : sumI(a, n, wantQ); }
  function sumSorted(r) { return r.asc && r.desc ? 'asc' : r.asc ? 'asc' : r.desc ? 'desc' : null; }
  function sumPut(c, r, k) {   // copy the number pass result into the entry (k scales values: timestamps to milliseconds)
    var i, q;
    c.nulls = r.nulls; c.min = r.min === null ? null : r.min * k; c.max = r.max === null ? null : r.max * k; c.sorted = sumSorted(r);
    if (r.hist) c.hist = r.hist;
    if (r.q) { q = r.q; if (k !== 1) { q = q.slice(); for (i = 0; i < q.length; i++) q[i] *= k; } c.q = q; if (r.qExact) { c.qExact = true; c.qn = r.qn; } if (r.qSample) c.qSample = r.qSample; }
  }
  function sumDateMs(s) { var t = Date.parse((s.charCodeAt(10) === 32 ? s.slice(0, 10) + 'T' + s.slice(11) : s) + (s.charCodeAt(s.length - 1) === 90 ? '' : 'Z')); return t === t ? t : null; }   // read as UTC, as the date columns are
  function sumCapped(cp, n, Q) {   // the per-block date ranges the writer left (SUMCAP), merged, when they cover rows 0 to n - 1 exactly once; else null
    if (!cp) return null;
    var ks = Object.keys(cp), bl = [], i, j, b, r = { mn: Infinity, mx: -Infinity, asc: true, desc: true }, at = 0, p = null, m = 0, sm, gv = new Map(), g;
    for (i = 0; i < ks.length; i++) bl.push(cp[ks[i]]);
    bl.sort(function (x, y) { return x.a - y.a; });
    for (i = 0; i < bl.length; i++) { b = bl[i]; if (b.a !== at || b.u !== bl[0].u) return null; at += b.n; m += b.sv ? b.sv.length : 0;
      if (b.mn < r.mn) r.mn = b.mn; if (b.mx > r.mx) r.mx = b.mx;
      if (!b.asc || (p !== null && b.first < p)) r.asc = false; if (!b.desc || (p !== null && b.first > p)) r.desc = false; p = b.last; }
    if (at !== n) return null;
    if (!Q) return r;
    var k = bl[0].u ? 0.001 : 1, sc = function (v) { return v * k; };
    if (r.asc || r.desc) { for (i = 0; i < bl.length; i++) { g = bl[i].gv; for (j = 0; j < g.length; j += 2) gv.set(g[j], g[j + 1]); }   // ordered: the grid values were kept at their exact ranks
      r.q = qOf(r.asc ? function (x) { return sc(gv.get(x)); } : function (x) { return sc(gv.get(n - 1 - x)); }, n); return r; }
    sm = new Float64Array(m); for (i = 0, j = 0; i < bl.length; i++) { sm.set(bl[i].sv, j); j += bl[i].sv.length; }
    sm.sort(); r.q = qSortedArr(sm, m).map(sc); if (n > SUM_QS) r.qSample = m;
    return r;
  }
  function sumDateQ(c, a, n, nl, sa, sd) {   // the grid of a date column read from its strings (when the writer left no date numbers): ordered columns at exact ranks, others from up to SUM_QS / 4 parsed values
    var P, sm, j, m, x, t, step;
    if (!nl && (sa || sd)) { c.q = qOf(sa ? function (r) { return sumDateMs(a[r]); } : function (r) { return sumDateMs(a[n - 1 - r]); }, n); for (j = 0; j < c.q.length; j++) if (c.q[j] === null) { delete c.q; return; } return; }
    if (n <= SUM_QS / 4) { P = null; m = n; } else { P = sumPos(n); m = SUM_QS / 4; }
    sm = new Float64Array(m); step = P ? 4 : 1;
    for (j = 0, x = 0; j < m; j++) { t = a[P ? P[j * step] : j]; if (typeof t === 'string' && (t = sumDateMs(t)) !== null) sm[x++] = t; }
    if (!x) return; sm = sm.subarray(0, x); sm.sort(); c.q = qSortedArr(sm, x); if (P) c.qSample = x;
  }
  function sumColumn(key, a, n, cp, Q) {   // Q: make the quantile grid (else the 64-bucket hist)
    var c = { key: key, type: 'other', n: n }, r, i, v, k, mn, mx, nul, map, cnt, lab, top, ent, dc;
    if (isTsCol(a)) {   // timestamp column: values since 1970 in a.unit; min and max are given in epoch milliseconds
      r = sumNums(a.values, n, false, Q); k = a.unit === 's' ? 1000 : a.unit === 'ms' ? 1 : 0.001;
      c.type = 'date'; sumPut(c, r, k);
      return c;
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
      r = sumNums(a, n, false, Q); c.type = 'num'; sumPut(c, r, 1);
      return c;
    }
    if (!Array.isArray(a)) return c;
    for (i = 0; i < n && (a[i] === null || a[i] === undefined); i++);   // the first value that is there decides the kind
    if (i === n) { c.type = 'other'; c.nulls = n; return c; }
    if (typeof a[i] === 'number') {
      r = sumNums(a, n, true, Q);
      if (r) { c.type = 'num'; sumPut(c, r, 1); }
      return c;
    }
    if (typeof a[i] !== 'string') return c;
    // strings: date-like columns give their range (compared as text, which orders canonical dates), the others a length range, and the distinct count and top labels while there are few
    v = a[i]; k = SUM_DATE.test(v) && v.length >= 19 && SUM_DATE.test(a[n >> 1] || '') && SUM_DATE.test(a[n - 1] || '');
    if (k && (r = sumCapped(cp, n, Q))) { c.type = 'date'; c.nulls = 0; c.min = r.mn; c.max = r.mx; c.sorted = r.asc ? 'asc' : r.desc ? 'desc' : null; if (r.q) { c.q = r.q; if (r.qSample) c.qSample = r.qSample; } return c; }   // the writer already read every value as a date
    if (k) {   // date-like strings: an ordered column is settled by one pass of single compares (first and last are the range); otherwise a second pass finds min, max and whether it is descending
      var pv = null, nl = 0, sa = true, sd = true; mn = mx = null;
      for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (pv !== null && x < pv) { sa = false; break; } if (mn === null) mn = x; pv = x; }
      if (sa) mx = pv;
      else { mn = mx = null; pv = null; nl = 0; sd = true;
        for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (mn === null) { mn = mx = x; } else { if (x < mn) mn = x; else if (x > mx) mx = x; if (sd && x > pv) sd = false; } pv = x; } }
      var tmn = mn === null ? null : sumDateMs(mn), tmx = mx === null ? null : sumDateMs(mx);
      if (tmn !== null && tmx !== null) { c.type = 'date'; c.nulls = nl; c.min = tmn; c.max = tmx; c.sorted = sa ? 'asc' : sd ? 'desc' : null; if (Q) sumDateQ(c, a, n, nl, sa, sd); return c; }
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
  // the summary as one job per column, so a parallel save can run them on this thread while its helpers are busy (since 0.15.0); next() runs one column and says whether one ran, payload() runs the rest
  var SUM_OFF_MIN = 65536;   // number columns at least this long are summed on a helper when the save has helpers
  function sumJobs(obj, n, quantiles) {
    var keys = Object.keys(obj), cut = keys.length > SUM_KEYS, m = cut ? SUM_KEYS : keys.length, cols = new Array(m), bad = false, Q = quantiles !== false, cap = { cols: {}, n: n, q: Q, pos: Q && n > SUM_QS ? sumPos(n) : null, grid: Q ? sumGridIdx(n) : null }, away = [], st = new Uint8Array(m);   // st: 0 to do, 1 on a helper, 2 done
    function one(k) { st[k] = 2; try { cols[k] = sumColumn(keys[k], obj[keys[k]], n, cap.cols[keys[k]], Q); } catch (e) { bad = true; } }
    function next(early) {   // run one column still to do; early (blocks still being written): only columns that are not plain arrays, since a column of date strings waits for the date numbers every block leaves
      for (var k = 0; k < m; k++) if (!st[k] && !(early && Array.isArray(obj[keys[k]]))) { one(k); return true; }
      return false; }
    function result() { if (bad) return null; var o = { v: 1, rows: n, cols: cols }; if (cut) o.colsCut = true; return te.encode(JSON.stringify(o)); }
    return { cap: cap, next: next,
      offload: function (post) {   // hand the long number columns to helpers: post({ kind: 's', key, col, n, q }, transfer) -> Promise of { sum }; a copy is sent, the caller's array stays as it is
        var k, a, c, sent, txt = false; if (n < SUM_OFF_MIN) return;
        for (k = 0; k < m; k++) { a = obj[keys[k]]; if (!ArrayBuffer.isView(a) && !isTsCol(a)) txt = true; }
        if (!txt) return;   // numbers only: this thread mostly waits on the helpers, so it sums the columns itself while they pack (a copy for a helper costs more here)
        for (k = 0; k < m; k++) { if (st[k]) continue; a = obj[keys[k]];
          if (isTsCol(a)) { c = { kind: 'ts', unit: a.unit, values: a.values.slice(0, n) }; sent = c.values; } else if (ArrayBuffer.isView(a) && !(a instanceof DataView) && typeof a[0] !== 'bigint') { c = a.slice(0, n); sent = c; } else continue;
          st[k] = 1;
          away.push(post({ kind: 's', key: keys[k], col: c, n: n, q: Q }, [sent.buffer]).then((function (k2) { return function (msg) { cols[k2] = msg.sum; }; })(k), (function (k2) { return function () { one(k2); }; })(k))); } },
      done: function () { while (next(false)); return Promise.all(away).then(result); },   // -> Promise of the payload (null if a column failed); called once every block is written
      payload: function () { for (var k = 0; k < m; k++) if (st[k] !== 2) one(k); return result(); } };   // all on this thread
  }
  function columnSummary(obj, n, quantiles) { return sumJobs(obj, n, quantiles).payload(); }   // the section payload for the column table obj ({ key: column }) of n rows
  function addSection(file, id, payload) {   // the same file with one more optional footer section (no other byte of the blocks changes); a file that already has section `id` comes back as it is
    var n = file.length, flen = rd32(file, n - 16), f = file.subarray(n - 16 - flen, n - 16), body = f[0] === 1 ? S.zfull.decompress(f.subarray(1)) : f.subarray(1), p = 0, h = new Uint8Array(8), t = new Uint8Array(16), nf;
    while (p < body.length) { if (rd16(body, p) === id) return file; p += 8 + rd32(body, p + 4); }
    h[0] = id; h[1] = id >> 8; h.set(u32le(payload.length), 4);
    nf = concat([new Uint8Array([1]), S.zfull.compress(concat([body, h, payload]), 3)]);
    t.set(u32le(nf.length), 0); t.set(u32le(crcJS(nf, 0)), 4); t.set(file.subarray(n - 8, n - 4), 8); t.set(MAGIC, 12);
    return concat([file.subarray(0, n - 16 - flen), nf, t]);
  }
  function summary(bytes) { var s = readFooter(S.zdec, bytes).sec[SEC_SUMMARY]; return s ? JSON.parse(tdr.decode(s)) : null; }   // the column summary the file carries (footer section 20), or null; nothing is decoded
