// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ column summaries (footer section 20, optional, advisory; SPEC.md 2.3a)
  // { v: 1, rows, cols: [{ key, type: 'num' | 'date' | 'text' | 'other', n, nulls, min, max, sorted, distinct, hist, len, top }], colsCut }; one entry per key over the whole file
  var SEC_SUMMARY = 20, SUM_KEYS = 1000, SUM_HIST = 64, SUM_TOP = 16, SUM_DISTINCT_CAP = 64;
  var SUM_DATE = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(\.\d+)?Z?$/;
  // one copy of the number pass per kind of array (integer typed arrays, float typed arrays, plain arrays), so each copy stays monomorphic and fast
  function makeSumNums(kind) {   // kind 0: integer typed array (no missing values), 1: float typed array, 2: plain array (numbers, null, undefined)
    return function (a, n) {   // -> { nulls, min, max, asc, desc, hist }, or null when a plain array holds something that is not a number, null or undefined
      var mn = Infinity, mx = -Infinity, nul = 0, asc = true, desc = true, prev = 0, have = false, i, x, hist = null, w, b;
      if (kind === 0) {
        for (i = 0; i < n; i++) { x = a[i]; if (x < mn) mn = x; if (x > mx) mx = x; }
        have = n > 0;
        for (i = 1; i < n; i++) if (a[i] < a[i - 1]) { asc = false; break; }   // each check stops at the first value that breaks the order
        if (!asc) { desc = true; for (i = 1; i < n; i++) if (a[i] > a[i - 1]) { desc = false; break; } }
      } else {
        for (i = 0; i < n; i++) {
          x = a[i];
          if (kind === 2 && typeof x !== 'number') { if (x === null || x === undefined) { nul++; continue; } return null; }
          if (!(x - x === 0)) { nul++; continue; }   // NaN and +-Infinity count as missing: JSON cannot hold them
          if (x < mn) mn = x; if (x > mx) mx = x;
          have = true;
        }
        for (i = 0, prev = -Infinity; i < n; i++) { x = a[i]; if (typeof x !== 'number' || x - x !== 0) continue; if (x < prev) { asc = false; break; } prev = x; }
        if (!asc) for (i = 0, prev = Infinity; i < n; i++) { x = a[i]; if (typeof x !== 'number' || x - x !== 0) continue; if (x > prev) { desc = false; break; } prev = x; }
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
  function sumSorted(r) { return r.asc && r.desc ? 'asc' : r.asc ? 'asc' : r.desc ? 'desc' : null; }
  function sumDateMs(s) { var t = Date.parse((s.charCodeAt(10) === 32 ? s.slice(0, 10) + 'T' + s.slice(11) : s) + (s.charCodeAt(s.length - 1) === 90 ? '' : 'Z')); return t === t ? t : null; }   // read as UTC, as the date columns are
  function sumColumn(key, a, n) {
    var c = { key: key, type: 'other', n: n }, r, i, v, k, mn, mx, nul, map, cnt, lab, top, ent, dc;
    if (isTsCol(a)) {   // timestamp column: values since 1970 in a.unit; min and max are given in epoch milliseconds
      r = sumNums(a.values, n, false); k = a.unit === 's' ? 1000 : a.unit === 'ms' ? 1 : 0.001;
      c.type = 'date'; c.nulls = r.nulls; c.min = r.min === null ? null : r.min * k; c.max = r.max === null ? null : r.max * k; c.sorted = sumSorted(r); if (r.hist) c.hist = r.hist;
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
      r = sumNums(a, n, false); c.type = 'num'; c.nulls = r.nulls; c.min = r.min; c.max = r.max; c.sorted = sumSorted(r); if (r.hist) c.hist = r.hist;
      return c;
    }
    if (!Array.isArray(a)) return c;
    for (i = 0; i < n && (a[i] === null || a[i] === undefined); i++);   // the first value that is there decides the kind
    if (i === n) { c.type = 'other'; c.nulls = n; return c; }
    if (typeof a[i] === 'number') {
      r = sumNums(a, n, true);
      if (r) { c.type = 'num'; c.nulls = r.nulls; c.min = r.min; c.max = r.max; c.sorted = sumSorted(r); if (r.hist) c.hist = r.hist; }
      return c;
    }
    if (typeof a[i] !== 'string') return c;
    // strings: date-like columns give their range (compared as text, which orders canonical dates), the others a length range, and the distinct count and top labels while there are few
    v = a[i]; k = SUM_DATE.test(v) && v.length >= 19 && SUM_DATE.test(a[n >> 1] || '') && SUM_DATE.test(a[n - 1] || '');
    if (k) {   // date-like strings: an ordered column is settled by one pass of single compares (first and last are the range); otherwise a second pass finds min, max and whether it is descending
      var pv = null, nl = 0, sa = true, sd = true; mn = mx = null;
      for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (pv !== null && x < pv) { sa = false; break; } if (mn === null) mn = x; pv = x; }
      if (sa) mx = pv;
      else { mn = mx = null; pv = null; nl = 0; sd = true;
        for (i = 0; i < n; i++) { x = a[i]; if (typeof x !== 'string') { if (x === null || x === undefined) { nl++; continue; } return c; } if (mn === null) { mn = mx = x; } else { if (x < mn) mn = x; else if (x > mx) mx = x; if (sd && x > pv) sd = false; } pv = x; } }
      var tmn = mn === null ? null : sumDateMs(mn), tmx = mx === null ? null : sumDateMs(mx);
      if (tmn !== null && tmx !== null) { c.type = 'date'; c.nulls = nl; c.min = tmn; c.max = tmx; c.sorted = sa ? 'asc' : sd ? 'desc' : null; return c; }
    }
    nul = 0; mn = null; mx = null; map = k ? null : new Map(); var lo = Infinity, hi = 0, ok = true, x, pv = null, sa = true, sd = true;
    for (i = 0; i < n; i++) {
      x = a[i];
      if (typeof x !== 'string') { if (x === null || x === undefined) { nul++; continue; } ok = false; break; }
      if (k) { if (mn === null || x < mn) mn = x; if (mx === null || x > mx) mx = x; if (pv !== null) { if (x < pv) sa = false; if (x > pv) sd = false; } pv = x; continue; }
      if (x.length < lo) lo = x.length; if (x.length > hi) hi = x.length;
      if (map) { dc = map.get(x); if (dc === undefined) { if (map.size >= SUM_DISTINCT_CAP) map = null; else map.set(x, 1); } else map.set(x, dc + 1); }
    }
    if (!ok) return c;
    c.nulls = nul;
    if (k) { var tmn = mn === null ? null : sumDateMs(mn), tmx = mx === null ? null : sumDateMs(mx); if (tmn !== null && tmx !== null) { c.type = 'date'; c.min = tmn; c.max = tmx; c.sorted = sa ? 'asc' : sd ? 'desc' : null; return c; } }
    c.type = 'text'; c.len = n > nul ? [lo, hi] : [0, 0]; c.distinct = map ? map.size : null;
    if (map) { ent = Array.from(map.entries()); ent.sort(function (p, q) { return q[1] - p[1]; }); c.top = ent.slice(0, SUM_TOP); }
    return c;
  }
  function columnSummary(obj, n) {   // the section payload for the column table obj ({ key: column }) of n rows
    var keys = Object.keys(obj), cols = [], i, cut = keys.length > SUM_KEYS, m = cut ? SUM_KEYS : keys.length, o;
    for (i = 0; i < m; i++) cols.push(sumColumn(keys[i], obj[keys[i]], n));
    o = { v: 1, rows: n, cols: cols }; if (cut) o.colsCut = true;
    return te.encode(JSON.stringify(o));
  }
  function addSection(file, id, payload) {   // the same file with one more optional footer section (no other byte of the blocks changes); a file that already has section `id` comes back as it is
    var n = file.length, flen = rd32(file, n - 16), f = file.subarray(n - 16 - flen, n - 16), body = f[0] === 1 ? S.zfull.decompress(f.subarray(1)) : f.subarray(1), p = 0, h = new Uint8Array(8), t = new Uint8Array(16), nf;
    while (p < body.length) { if (rd16(body, p) === id) return file; p += 8 + rd32(body, p + 4); }
    h[0] = id; h[1] = id >> 8; h.set(u32le(payload.length), 4);
    nf = concat([new Uint8Array([1]), S.zfull.compress(concat([body, h, payload]), 3)]);
    t.set(u32le(nf.length), 0); t.set(u32le(crcJS(nf, 0)), 4); t.set(file.subarray(n - 8, n - 4), 8); t.set(MAGIC, 12);
    return concat([file.subarray(0, n - 16 - flen), nf, t]);
  }
  function summary(bytes) { var s = readFooter(S.zdec, bytes).sec[SEC_SUMMARY]; return s ? JSON.parse(tdr.decode(s)) : null; }   // the column summary the file carries (footer section 20), or null; nothing is decoded
