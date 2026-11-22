// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ sortBy and keepOrder (writer settings, since 0.16.0; SPEC.md 2.3b)
  // sortBy: 'key' or ['key', 'asc' | 'desc']: the rows are stably sorted by that column before blocks are cut, so the zone maps of that column do not overlap and a range read skips most blocks.
  // Order: missing values (null, undefined, NaN, an empty timestamp) always last; numbers, dates and timestamps by value; text by UTF-8 bytes (text given as bytes or as a dictionary) or by UTF-16 code
  // units (JavaScript strings; the two differ only between U+E000..U+FFFF and characters past U+FFFF); in a column of mixed kinds, false < true < numbers < text < anything else (as its String()).
  // keepOrder: true adds the number column '$row' (each row's 0-based position before the sort); section 20 then says rowIndex: '$row', readers hide that column unless asked for it by name,
  // and unpack / unpackRows with { original: true } give the rows back in the order they were saved in.
  var SORT_ROW = '$row';
  // since 0.18.0: scramble (true or a seed): rows saved in a seeded random order instead, so every block is a uniform sample of the table and a reader can stop early with good estimates
  // (open().progressive). No row-position column is stored: the order comes back from the seed and the row count, so { original: true } gives the input order back. Section 20 says scrambled: { seed }.
  var SCRAMBLE_SEED = 0x2545F491;
  function sortOpt(opts) {   // -> null, or { key, desc, keep } (key null and scr the seed for scramble)
    var s = opts && opts.sortBy, k, d = 'asc', sc = opts && opts.scramble, seed;
    if (sc !== undefined && sc !== null && sc !== false) {
      if (s !== undefined && s !== null && s !== false) throw new Error('LfcPack: scramble cannot be used with sortBy (pick one)');
      seed = sc === true ? SCRAMBLE_SEED : sc;
      if (typeof seed !== 'number' || seed !== Math.floor(seed) || seed < 0 || seed > 4294967295) throw new Error('LfcPack: scramble must be true or a seed (a whole number from 0 to 4294967295)');
      if (opts.exact) throw new Error('LfcPack: scramble cannot be used with exact (an exact file keeps the input as it was)');
      if (opts.base) throw new Error('LfcPack: scramble cannot be used with a delta save (base)');
      if (opts.keepOrder) throw new Error('LfcPack: scramble keeps the order by itself (its seed); leave keepOrder out');
      return { key: null, desc: false, keep: false, scr: seed >>> 0 };
    }
    if (s === undefined || s === null || s === false) { if (opts && opts.keepOrder) throw new Error('LfcPack: keepOrder needs sortBy'); return null; }
    if (Array.isArray(s)) { k = s[0]; if (s.length > 1) d = s[1]; } else k = s;
    if (typeof k !== 'string' || !k) throw new Error("LfcPack: sortBy must be a column name or [name, 'asc' | 'desc']");
    if (d !== 'asc' && d !== 'desc') throw new Error("LfcPack: sortBy direction must be 'asc' or 'desc'");
    if (opts.exact) throw new Error('LfcPack: sortBy cannot be used with exact (an exact file keeps the input as it was)');
    if (opts.base) throw new Error('LfcPack: sortBy cannot be used with a delta save (base)');
    if (opts.keepOrder && k === SORT_ROW) throw new Error('LfcPack: sortBy cannot be ' + SORT_ROW + ' with keepOrder');
    var so = { key: k, desc: d === 'desc', keep: !!opts.keepOrder }; if (opts._hide) so.hide = opts._hide; return so;
  }
  // the seeded shuffle (Fisher-Yates over mulberry32): the same seed and row count always give the same order
  function scramblePerm(n, seed) {
    var P = new Uint32Array(n), i, j, x, a = seed | 0, t;
    for (i = 0; i < n; i++) P[i] = i;
    for (i = n - 1; i > 0; i--) { a = a + 0x6D2B79F5 | 0; t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; j = Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * (i + 1)); x = P[i]; P[i] = P[j]; P[j] = x; }
    return P;
  }
  // stable LSD radix sort of positions 0..m-1 by 32-bit keys (H high, L low or null), 16-bit digits, passes whose digit is the same for every key skipped -> Uint32Array of positions
  function radixPerm(H, L, m) {
    var p = new Uint32Array(m), q = new Uint32Array(m), cnt = new Uint32Array(65536), i, d, t, pass, K, sh, sum, c;
    for (i = 0; i < m; i++) p[i] = i;
    for (pass = 0; pass < 4; pass++) {
      K = pass < 2 ? L : H; if (!K) continue; sh = pass & 1 ? 16 : 0;
      cnt.fill(0); for (i = 0; i < m; i++) cnt[(K[i] >>> sh) & 65535]++;
      if (cnt[(K[0] >>> sh) & 65535] === m) continue;
      for (sum = 0, d = 0; d < 65536; d++) { c = cnt[d]; cnt[d] = sum; sum += c; }
      for (i = 0; i < m; i++) { t = p[i]; q[cnt[(K[t] >>> sh) & 65535]++] = t; }
      t = p; p = q; q = t;
    }
    return p;
  }
  // numbers (any array-like; null, undefined and NaN missing) -> Uint32Array of row positions in sorted order
  function sortPermNum(v, n, desc) {
    var f = new Float64Array(1), u = new Uint32Array(f.buffer), H = new Uint32Array(n), L = new Uint32Array(n), idx = new Uint32Array(n), m = 0, miss = [], i, x, h, l;
    for (i = 0; i < n; i++) {
      x = v[i]; if (x === null || x === undefined || x !== x) { miss.push(i); continue; }
      f[0] = x === 0 ? 0 : x; h = u[1]; l = u[0];
      if (h >= 0x80000000) { h = ~h >>> 0; l = ~l >>> 0; } else h = (h | 0x80000000) >>> 0;
      if (desc) { h = ~h >>> 0; l = ~l >>> 0; }
      H[m] = h; L[m] = l; idx[m++] = i;
    }
    var p = radixPerm(H, L, m), out = new Uint32Array(n);
    for (i = 0; i < m; i++) out[i] = idx[p[i]];
    for (i = 0; i < miss.length; i++) out[m + i] = miss[i];
    return out;
  }
  // radix by a 32-bit prefix, then each run of equal prefixes sorted by cmp (stable) when some value in it is longer than the prefix (long(i) true)
  function prefixPerm(idx, P, m, long, cmp) {
    var p = radixPerm(P, null, m), out = new Uint32Array(m), i, j, k, run, any;
    for (i = 0; i < m; i++) out[i] = idx[p[i]];
    for (i = 0; i < m; i = j) {
      j = i + 1; any = long(out[i]);
      while (j < m && P[p[j]] === P[p[i]]) { if (!any && long(out[j])) any = true; j++; }
      if (j - i > 1 && any) { run = Array.prototype.slice.call(out, i, j); run.sort(cmp); for (k = 0; k < run.length; k++) out[i + k] = run[k]; }
    }
    return out;
  }
  function bytesCmp(B, s1, e1, s2, e2) { var a = e1 - s1, b = e2 - s2, n = a < b ? a : b, i, d; for (i = 0; i < n; i++) { d = B[s1 + i] - B[s2 + i]; if (d) return d; } return a - b; }
  function sortPermBytes(bc, n, desc) {   // { bytes, start, end }: by UTF-8 bytes, shorter first on a shared start
    var B = bc.bytes, S = bc.start, E = bc.end, P = new Uint32Array(n), idx = new Uint32Array(n), i, s, l, k;
    for (i = 0; i < n; i++) { s = S[i]; l = E[i] - s; k = (l > 0 ? B[s] << 24 : 0) | (l > 1 ? B[s + 1] << 16 : 0) | (l > 2 ? B[s + 2] << 8 : 0) | (l > 3 ? B[s + 3] : 0); P[i] = desc ? ~k >>> 0 : k >>> 0; idx[i] = i; }
    return prefixPerm(idx, P, n, function (r) { return E[r] - S[r] > 3; }, function (a, b) { var c = bytesCmp(B, S[a], E[a], S[b], E[b]); return desc ? -c : c; });
  }
  function sortPermDict(dc, n, desc) {   // dictionary column: the labels ranked once, then a counting sort of the rows by rank
    var lb = dc.labels, NL = lb.start.length, ord = [], rank = new Uint32Array(NL), cnt, ids = dc.ids, out = new Uint32Array(n), i, r, sum, c;
    for (i = 0; i < NL; i++) ord.push(i);
    ord.sort(function (a, b) { var c2 = bytesCmp(lb.bytes, lb.start[a], lb.end[a], lb.start[b], lb.end[b]); return desc ? -c2 : c2; });
    for (i = 0, r = 0; i < NL; i++) { if (i && bytesCmp(lb.bytes, lb.start[ord[i - 1]], lb.end[ord[i - 1]], lb.start[ord[i]], lb.end[ord[i]]) !== 0) r++; rank[ord[i]] = r; }
    cnt = new Uint32Array(r + 2);
    for (i = 0; i < n; i++) cnt[rank[ids[i]] + 1]++;
    for (i = 0, sum = 0; i < cnt.length; i++) { c = cnt[i]; cnt[i] = sum; sum += c; }
    for (i = 0; i < n; i++) out[cnt[rank[ids[i]] + 1]++] = i;
    return out;
  }
  function sortRank(x) { var t = typeof x; return t === 'boolean' ? 0 : t === 'number' ? 1 : t === 'string' ? 2 : 3; }
  function sortPermAny(v, n, desc) {   // plain array (or a getter v(i)): numbers only -> radix; strings only -> radix by the first two code units, then the ties; else a stable compare sort
    var get = typeof v === 'function' ? v : null, i, x, nums = true, strs = true, miss = [], idx = [], m;
    for (i = 0; i < n; i++) { x = get ? get(i) : v[i]; if (x === null || x === undefined || x !== x) continue; if (typeof x !== 'number') nums = false; if (typeof x !== 'string') strs = false; if (!nums && !strs) break; }
    if (nums && !get) return sortPermNum(v, n, desc);
    if (nums) { var tmp = new Float64Array(n); for (i = 0; i < n; i++) { x = get(i); tmp[i] = x === null || x === undefined ? NaN : x; } return sortPermNum(tmp, n, desc); }
    var vals = get ? new Array(n) : v; if (get) for (i = 0; i < n; i++) vals[i] = get(i);
    for (i = 0; i < n; i++) { x = vals[i]; if (x === null || x === undefined || x !== x) miss.push(i); else idx.push(i); }
    m = idx.length;
    var sorted;
    if (strs) {
      var P = new Uint32Array(m), I = new Uint32Array(m), s, k;
      for (i = 0; i < m; i++) { s = vals[idx[i]]; k = ((s.length > 0 ? s.charCodeAt(0) : 0) << 16 | (s.length > 1 ? s.charCodeAt(1) : 0)) >>> 0; P[i] = desc ? ~k >>> 0 : k; I[i] = idx[i]; }
      sorted = prefixPerm(I, P, m, function (r) { return vals[r].length > 2; }, function (a, b) { var p2 = vals[a], q2 = vals[b], c = p2 < q2 ? -1 : p2 > q2 ? 1 : 0; return desc ? -c : c; });
    } else {
      idx.sort(function (a, b) { var p2 = vals[a], q2 = vals[b], ta = sortRank(p2), tb = sortRank(q2), c; if (ta !== tb) c = ta - tb; else { if (ta === 3) { p2 = String(p2); q2 = String(q2); } c = p2 < q2 ? -1 : p2 > q2 ? 1 : 0; } return desc ? -c : c; });
      sorted = idx;
    }
    var out = new Uint32Array(n); for (i = 0; i < m; i++) out[i] = sorted[i]; for (i = 0; i < miss.length; i++) out[m + i] = miss[i];
    return out;
  }
  function sortPermCol(a, n, desc) {
    if (isTsCol(a)) return sortPermNum(a.values, n, desc);
    if (isDictCol(a)) return sortPermDict(a, n, desc);
    if (isByteCol(a)) return sortPermBytes(a, n, desc);
    if (ArrayBuffer.isView(a)) return sortPermNum(a, n, desc);
    return sortPermAny(a, n, desc);
  }
  // one loop per common array type (since 0.23.0): a single loop shared by every type reads elements the slow generic way; these are 1.9 to 2.8 times faster on 1,000,000 rows
  function gatherF64(a, P) { var n = P.length, o = new Float64Array(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o; }
  function gatherI32(a, P) { var n = P.length, o = new Int32Array(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o; }
  function gatherU32(a, P) { var n = P.length, o = new Uint32Array(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o; }
  function gatherF32(a, P) { var n = P.length, o = new Float32Array(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o; }
  function gatherU8(a, P) { var n = P.length, o = new Uint8Array(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o; }
  function gatherTyped(a, P) {
    if (a instanceof Float64Array) return gatherF64(a, P); if (a instanceof Int32Array) return gatherI32(a, P); if (a instanceof Uint32Array) return gatherU32(a, P);
    if (a instanceof Float32Array) return gatherF32(a, P); if (a instanceof Uint8Array) return gatherU8(a, P);
    var n = P.length, o = new a.constructor(n), i; for (i = 0; i < n; i++) o[i] = a[P[i]]; return o;
  }
  function permCol(a, P) {
    var n = P.length, i, o;
    if (isTsCol(a)) { o = Object.assign({}, a); o.values = gatherTyped(a.values, P); return o; }
    if (isDictCol(a)) { o = Object.assign({}, a); o.ids = gatherTyped(a.ids, P); return o; }
    if (isByteCol(a)) {   // text bytes copied in the new order, so each block's text is one run of memory again
      var S = a.start, E = a.end, B = a.bytes, tot = 0, s, e, d = 0, j, nb, ns = new Int32Array(n), ne = new Int32Array(n);
      for (i = 0; i < n; i++) tot += E[P[i]] - S[P[i]];
      nb = new Uint8Array(tot);
      for (i = 0; i < n; i++) { s = S[P[i]]; e = E[P[i]]; ns[i] = d; if (e - s < 24) { for (j = s; j < e; j++) nb[d++] = B[j]; } else { nb.set(B.subarray(s, e), d); d += e - s; } ne[i] = d; }
      o = Object.assign({}, a); o.bytes = nb; o.start = ns; o.end = ne; return o;
    }
    if (ArrayBuffer.isView(a)) return gatherTyped(a, P);
    o = new Array(n); for (i = 0; i < n; i++) o[i] = a[P[i]]; return o;
  }
  // (plain string arrays stay arrays: turning them into text bytes here tied in Chromium 156 and was 1.2x slower in Firefox 158 on 1,000,000 rows)
  function colLen(a) { return isTsCol(a) ? a.values.length : isDictCol(a) ? a.ids.length : isByteCol(a) ? a.start.length : a.length; }
  // the column table obj sorted (a new object; the caller's columns are not changed) -> { obj, P }; with keep, obj ends with SORT_ROW
  function sortTable(obj, so) {
    if (so.key !== null && !Object.prototype.hasOwnProperty.call(obj, so.key)) throw new Error('LfcPack: sortBy column "' + so.key + '" is not in the table');
    if (so.keep && Object.prototype.hasOwnProperty.call(obj, SORT_ROW)) throw new Error('LfcPack: keepOrder adds the column ' + SORT_ROW + ', which the table already has');
    var k0 = so.key !== null ? so.key : Object.keys(obj)[0], c = obj[k0], n = c === undefined ? 0 : colLen(c), P = so.key === null ? scramblePerm(n, so.scr) : sortPermCol(c, n, so.desc), out = {}, k, i, r;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = permCol(obj[k], P);
    if (so.keep) { r = n < 2147483648 ? new Int32Array(n) : new Float64Array(n); for (i = 0; i < n; i++) r[i] = P[i]; out[SORT_ROW] = r; }
    return { obj: out, P: P };
  }
  // a row array sorted -> { rows, keys }: a new array of the same row objects; with keep, each row is a copy that ends with SORT_ROW, and keys lists every other key the rows carry
  function sortRowArray(rows, so) {
    var n = rows.length, P = so.key === null ? scramblePerm(n, so.scr) : sortPermAny(function (i) { var r = rows[i]; return r !== null && typeof r === 'object' ? r[so.key] : undefined; }, n, so.desc), out = new Array(n), i, r, o, k, seen = so.keep ? new Set() : null;
    for (i = 0; i < n; i++) {
      r = rows[P[i]];
      if (so.keep) { if (r === null || typeof r !== 'object' || Array.isArray(r)) throw new Error('LfcPack: keepOrder needs every row to be an object (row ' + P[i] + ')');
        if (Object.prototype.hasOwnProperty.call(r, SORT_ROW)) throw new Error('LfcPack: keepOrder adds the key ' + SORT_ROW + ', which row ' + P[i] + ' already has');
        o = {}; for (k in r) { o[k] = r[k]; if (!seen.has(k)) seen.add(k); } o[SORT_ROW] = P[i]; r = o; }
      out[i] = r;
    }
    return { rows: out, keys: seen ? Array.from(seen) : null };
  }
  // section 20 when the save sorted but wrote no summary (summary: false): which column, and the keys (so a reader can leave out SORT_ROW without reading a block)
  function sortSection(so, n, keys) { var o = { v: 1, rows: n }; if (so.key === null) o.scrambled = { seed: so.scr }; else o.sortedBy = so.key; if (so.hide) o.hidden = so.hide; if (so.keep) o.rowIndex = SORT_ROW; if (keys) o.keys = keys; o.cols = []; return te.encode(JSON.stringify(o)); }
  // readers: { key, keys } when the file was saved with keepOrder (keys: the other keys, or null when the footer cannot say), else null. Only the start of section 20 is read unless it names rowIndex.
  // readers: { seed, rows } when the file was saved with scramble, else null (only the start of section 20 is read)
  function scrambleOf(file) {
    var s = file.footer && file.footer.sec && file.footer.sec[SEC_SUMMARY], h, m, r;
    if (!s) return null;
    h = tdr.decode(s.subarray(0, Math.min(s.length, 512))); m = /"scrambled":\{"seed":(\d+)\}/.exec(h); r = /^\{"v":1,"rows":(\d+)/.exec(h);
    return m && r ? { seed: +m[1], rows: +r[1] } : null;
  }
  // the rows of a scrambled file in the order they were given: saved row i was input row P[i]
  function unscramble(rows, sc) {
    var n = rows.length, P, out, i;
    if (n !== sc.rows) throw new Error('LfcPack: original: true needs every row of the scrambled file (' + sc.rows + '), got ' + n);
    P = scramblePerm(n, sc.seed); out = new Array(n); for (i = 0; i < n; i++) out[P[i]] = rows[i];
    return out;
  }
  function rowIndexOf(file) {   // since 0.19.0 also for columns section 20 lists as hidden (geo's $hilbert): key is then null unless keepOrder named one
    var s = file.footer && file.footer.sec && file.footer.sec[SEC_SUMMARY], j, ks, i, h, hid;
    if (!s) return null;
    h = tdr.decode(s.subarray(0, Math.min(s.length, 512))); if (h.indexOf('"rowIndex"') < 0 && h.indexOf('"hidden"') < 0) return null;
    try { j = JSON.parse(tdr.decode(s)); } catch (e) { return null; }
    hid = Array.isArray(j.hidden) ? j.hidden : [];
    if (typeof j.rowIndex !== 'string' && !hid.length) return null;
    ks = Array.isArray(j.keys) ? j.keys.slice() : (!j.colsCut && Array.isArray(j.cols) && j.cols.length ? j.cols.map(function (c) { return c.key; }) : null);
    if (ks) ks = ks.filter(function (k) { return k !== j.rowIndex && hid.indexOf(k) < 0; });
    return { key: typeof j.rowIndex === 'string' ? j.rowIndex : null, keys: ks, hidden: hid };
  }

