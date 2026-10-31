/*!
 * text-columns.js: read CSV or TSV text into typed columns. Number columns come out as Float64Array, everything else as text, without building a string for every number.
 * The field scan runs in WebAssembly (SIMD when the browser has it, 16 bytes at a time); plain JavaScript gives the same answers when it does not. No dependencies, no network.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.6.3 (API 0)
 *
 *   var t = TextColumns.parse(bytesOrString, { delimiter: ',', header: true });   // delimiter '\t' for TSV
 *   t.names;  t.count;                                                              // column names, number of data rows
 *   t.columns[0].values;                                                            // Float64Array for a number column, array of strings otherwise
 *   t.toRows();                                                                     // array of row objects (numbers are numbers, the rest is text)
 *   TextColumns.parse(bytes, { columns: ['price', 'city'] });                       // only these columns (names or 0-based numbers), in file order; the rest are never converted
 *   TextColumns.parse(bytes, { columns: function (name, index) { return name !== 'notes'; } });   // or a function that says yes or no for each column
 *   TextColumns.parse(bytes, { types: { when: 'date', ok: 'boolean' } });          // opt in: YYYY-MM-DD becomes milliseconds (Float64Array), true/false becomes booleans; other columns unchanged
 *   await TextColumns.parseParallel(file, opts);                                    // a big file read by helpers at once; file may be a picked File (each helper reads its own piece)
 *   TextColumns.parse(bytes, { lazy: true });                                       // text columns build their strings when .values is first read (or one cell with .get(i)); keep the input bytes unchanged until then
 *
 * A column is a number column when every field is a plain decimal (-12, 3.25) of at most 15 digits without a leading zero; anything else (empty fields, 007, 1e5, text) keeps that column as text.
 * Quoted fields ("a,b", "say ""hi""") and \r\n line ends work; a ragged file (rows with different field counts) throws.
 */

(function (root, factory) {
  var api = factory(factory.toString());
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TextColumns = api;
}(typeof self !== 'undefined' ? self : this, function (SELF_SRC) {
  'use strict';
  /* ---- WebAssembly (wasm/tc.c): scan, count, ascii, numcol; compiled when the file loads; the plain JavaScript below answers until it is ready or when there is no WebAssembly ---- */
  var WASM_B64 = /*WASM:tc:BEGIN*/'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'/*WASM:tc:END*/;
  var WASM_SIMD_B64 = /*WASM:tcsimd:BEGIN*/'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'/*WASM:tcsimd:END*/;
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var W = null, loading = false, TRIM = { ms: -1, min: 16777216, keep: 0, timer: 0, count: 0 };
  // WebAssembly memory only grows: after a big file the scanner's memory stays that big for the life of the page (or helper). With idleTrim(ms), when it is over 16 MB
  // and no call came for ms milliseconds, a fresh instance of the same compiled module (small memory) takes over and the old memory is let go. idleTrim(ms, keep) grows the
  // fresh memory to keep bytes right away, so the next file starts with that much room.
  function trimLater() {
    if (!W || !W.m || TRIM.ms < 0) return;
    if (TRIM.timer) { clearTimeout(TRIM.timer); TRIM.timer = 0; }
    if (W.x.memory.buffer.byteLength < TRIM.min) return;
    TRIM.timer = setTimeout(function () { TRIM.timer = 0; try { var x = new WebAssembly.Instance(W.m, {}).exports; if (TRIM.keep > x.memory.buffer.byteLength) x.memory.grow(Math.ceil((TRIM.keep - x.memory.buffer.byteLength) / 65536)); W.x = x; W.heap = x.__heap_base.value; TRIM.count++; } catch (e) { /* keep the old one */ } }, TRIM.ms);
  }
  function fromB64(s) { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); var bin = atob(s), u = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function start() {
    if (W || loading || typeof WebAssembly !== 'object') return;
    loading = true;
    try {
      var simd = WebAssembly.validate(SIMD_PROBE), m = new WebAssembly.Module(fromB64(simd ? WASM_SIMD_B64 : WASM_B64)), x = new WebAssembly.Instance(m, {}).exports;
      W = { x: x, m: m, heap: x.__heap_base.value, simd: simd };
    } catch (e) { W = null; }
  }
  start();

  var td = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null, te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  /* ---- plain JavaScript kernels: the same rules as tc.c ---- */
  function scanJS(inp, len, delim, starts, ends, qflag, st) {
    var f = 0, r = 0, ncols = 0, nrows = 0, fs = 0, qend = 0, skip = -1, inq = 0, quoted = 0, esc = 0, p, c;
    function field(e) { starts[f] = fs; ends[f] = e; qflag[f] = esc; f++; r++; quoted = 0; esc = 0; }
    function row() { if (!ncols) ncols = r; else if (r !== ncols) return false; nrows++; r = 0; return true; }
    function fin(rc) { st[0] = f; st[1] = nrows; st[2] = ncols; return rc; }
    for (p = 0; p < len; p++) {
      c = inp[p];
      if (c !== delim && c !== 10 && c !== 13 && c !== 34) continue;
      if (p === skip) continue;
      if (inq) { if (c === 34) { if (p + 1 < len && inp[p + 1] === 34) { skip = p + 1; esc = 1; } else { inq = 0; qend = p; } } }
      else if (c === 34 && p === fs && !quoted) { inq = 1; quoted = 1; fs = p + 1; }
      else if (quoted && c !== delim && c !== 10 && c !== 13) return fin(2);
      else if (c === delim) { if (quoted && p !== qend + 1) return fin(2); field(quoted ? qend : p); fs = p + 1; }
      else if (c === 10) { if (!(r === 0 && fs === p && !quoted)) { if (quoted && p !== qend + 1) return fin(2); field(quoted ? qend : p); if (!row()) return fin(1); } fs = p + 1; }
      else if (c === 13 && p + 1 < len && inp[p + 1] === 10) { if (!(r === 0 && fs === p && !quoted)) { if (quoted && p !== qend + 1) return fin(2); field(quoted ? qend : p); if (!row()) return fin(1); } fs = p + 2; skip = p + 1; }
    }
    if (inq) return fin(3);
    if (fs < len || r > 0 || quoted) { if (quoted && len !== qend + 1) return fin(2); field(quoted ? qend : len); if (!row()) return fin(1); }
    return fin(0);
  }
  function countJS(inp, len, delim) { var n = 1, i; for (i = 0; i < len; i++) if (inp[i] === delim || inp[i] === 10) n++; return n; }
  function qscanJS(u, delim, out) {   // same answers as tc.c qscan
    var n = 0, ok0 = 1, ok1 = 1, p = -1, pv, good;
    while ((p = u.indexOf(34, p + 1)) >= 0) { pv = p ? u[p - 1] : 10; good = pv === 10 || pv === delim || pv === 34; if (n & 1) ok1 &= good; else ok0 &= good; n++; }
    out[0] = n & 1; out[1] = ok0; out[2] = ok1;
  }
  function asciiJS(inp, len) { for (var i = 0; i < len; i++) if (inp[i] & 128) return 0; return 1; }
  var P10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];
  function numcolJS(inp, starts, ends, ncols, nrows, col, out) {
    var r, k, p, e, neg, nd, fd, dot, v, c, x, s0;
    for (r = 0; r < nrows; r++) {
      k = r * ncols + col; s0 = p = starts[k]; e = ends[k]; neg = 0; nd = 0; fd = 0; dot = 0; v = 0;
      if (p >= e) return 0;
      if (inp[p] === 45) { neg = 1; p++; if (p >= e) return 0; }
      for (; p < e; p++) {
        c = inp[p];
        if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); nd++; if (dot) fd++; if (nd > 15) return 0; }
        else if (c === 46 && !dot && nd > 0) dot = 1;
        else return 0;
      }
      if (nd === 0 || (dot && fd === 0)) return 0;
      if (nd > 1 && inp[s0 + neg] === 48 && !dot) return 0;
      x = v; if (fd) x /= P10[fd];
      out[r] = neg ? -x : x;
    }
    return 1;
  }

  /* ---- the part both paths share ---- */
  function toBytes(input) {
    if (typeof input === 'string') { if (!te) throw new Error('text-columns: a string needs TextEncoder; pass bytes'); return te.encode(input); }
    if (input instanceof Uint8Array) return input;
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('text-columns: pass a string or a Uint8Array');
  }
  function stripBom(u) { return u.length >= 3 && u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF ? u.subarray(3) : u; }

  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  /** Opt-in types (since 0.5.0): turns the named text columns into 'date' (YYYY-MM-DD as milliseconds since 1970 UTC, Float64Array) or 'boolean' (true/false, TRUE/FALSE, True/False as an array of booleans). A column that has any other field stays text. */
  function applyTypes(t, types) {
    var key, c, ci, v, i, n, out, m, ms, d, want, hit;
    for (key in types) {
      want = types[key]; if (want !== 'date' && want !== 'boolean' && want !== 'text' && want !== 'number') throw new Error('text-columns: unknown type "' + want + '" (use date, boolean, text or number)');
      hit = false;
      for (ci = 0; ci < t.columns.length; ci++) {
        c = t.columns[ci]; if (c.name !== key && String(ci) !== key) continue; hit = true;
        if (c.type !== 'text' || want === 'text' || want === 'number') continue;
        v = c.values; n = v.length; if (!n) continue;
        if (want === 'boolean') {
          out = new Array(n);
          for (i = 0; i < n; i++) { m = v[i]; if (m === 'true' || m === 'TRUE' || m === 'True') out[i] = true; else if (m === 'false' || m === 'FALSE' || m === 'False') out[i] = false; else { out = null; break; } }
          if (out) { c.type = 'boolean'; delete c.values; c.values = out; }
        } else {
          out = new Float64Array(n);
          for (i = 0; i < n; i++) { m = ISO_DATE.exec(v[i]); if (!m) { out = null; break; } ms = Date.UTC(+m[1], m[2] - 1, +m[3]); d = new Date(ms); if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== m[2] - 1 || d.getUTCDate() !== +m[3]) { out = null; break; } out[i] = ms; }
          if (out) { c.type = 'date'; delete c.values; c.values = out; }
        }
      }
      if (!hit) throw new Error('text-columns: there is no column named "' + key + '" for types');
    }
    return t;
  }
  function parse(input, opts) { var t; if (TRIM.timer) { clearTimeout(TRIM.timer); TRIM.timer = 0; } try { t = parseWindows(input, opts) || parseCore(input, opts); } finally { trimLater(); } shareLater(t, opts); return opts && opts.types ? applyTypes(t, opts.types) : t; }
  /* Since 0.6.3: a text column that repeats a few values (a city, a status) holds one string per value instead of one per row. After a parse returns,
     the page merges the repeats in slices of about 4 ms when it is idle (requestIdleCallback, else a timer), so the parse itself is not slower.
     Decided per column from its first 2,048 rows (at most 1 different value per 8 rows); at most 4,096 different values kept. Every value stays
     the same string; only the copies go away (kept memory 42-63% lower at 16 MB in Chromium). opts._shareLater: false skips it. */
  var SHARE = { q: [], timer: 0, seen: typeof WeakSet === 'function' ? new WeakSet() : null };
  function shareLater(t, opts) {
    if (!t || !t.columns || (opts && opts._shareLater === false) || typeof setTimeout !== 'function' || !SHARE.seen) return;
    for (var j = 0; j < t.columns.length; j++) {
      var c = t.columns[j];
      if (c.type === 'text' && Array.isArray(c.values) && c.values.length > 64 && !SHARE.seen.has(c.values)) { SHARE.seen.add(c.values); SHARE.q.push({ v: c.values, i: 0, m: new Map() }); }
    }
    shareSoon();
  }
  function shareSoon() {
    if (SHARE.timer || !SHARE.q.length) return;
    if (typeof requestIdleCallback === 'function') SHARE.timer = requestIdleCallback(shareStep, { timeout: 500 });
    else { SHARE.timer = setTimeout(shareStep, 0); if (SHARE.timer && SHARE.timer.unref) SHARE.timer.unref(); }
  }
  function shareStep() {
    SHARE.timer = 0;
    var clock = typeof performance === 'object' ? performance : Date, end = clock.now() + 4, J, v, n, m, i, s, g;
    while (SHARE.q.length && clock.now() < end) {
      J = SHARE.q[0]; v = J.v; n = v.length; m = J.m;
      for (i = J.i; i < n; i++) {
        if (i === 2048 && m.size * 8 > 2048) { i = n; break; }   // many different values: not worth it
        if ((i & 255) === 255 && clock.now() > end) break;
        s = v[i]; if (typeof s !== 'string') continue;
        g = m.get(s);
        if (g === undefined) { if (m.size < 4096) m.set(s, s); } else v[i] = g;
      }
      J.i = i; if (i >= n) { J.m = null; SHARE.q.shift(); }
    }
    shareSoon();
  }
  /* Windows (since 0.6.2, opts._win bytes; 0 = off): a big input is read in pieces of about that size, each cut just after a line end that is outside quote marks, so the
     scanner's WebAssembly memory grows to about 3.7 x the window instead of 3.7 x the whole input. Same answers: a column that is numbers in one piece and text in another
     is read again as text in the number pieces. Not used for lazy tables or columns chosen by name. */
  var WIN = 4194304;   // _win(bytes) changes it; 0 = read the whole input at once (0.6.1)
  function parseWindows(input, opts) {
    var win = opts && opts._win !== undefined ? opts._win : WIN;
    if (!(win > 0) || !W || (opts && (opts.lazy || opts.plain || (opts.columns && !(Array.isArray(opts.columns) && opts.columns.every(function (c) { return typeof c === 'number'; })))))) return null;
    var u = stripBom(toBytes(input)), len = u.length;
    if (len < 2 * win) return null;
    var cuts = [0], par = 0, p, nl, q = u.indexOf(34);   // q: the next quote mark not yet counted (-1: none left), so the file is searched for quote marks only once
    for (;;) {
      p = cuts[cuts.length - 1] + win; if (p >= len) break;
      for (;;) {
        nl = u.indexOf(10, p); if (nl < 0 || nl + 1 >= len) break;
        for (; q >= 0 && q < nl; q = u.indexOf(34, q + 1)) par ^= 1;   // quote marks before this line end: an even count means it is outside quotes
        if (!par) break;
        p = nl + 1;
      }
      if (nl < 0 || nl + 1 >= len) break;
      cuts.push(nl + 1);
    }
    if (cuts.length < 2) return null;
    var header = !(opts && opts.header === false), parts = [], k, j, i, total = 0, t, ft = opts && opts._text;
    function one(k, text) { var o2 = Object.assign({}, opts || {}); o2.header = header && k === 0; delete o2.types; if (text) o2._text = text; return parseCore(u.subarray(cuts[k], k + 1 < cuts.length ? cuts[k + 1] : len), o2); }
    for (k = 0; k < cuts.length; k++) {
      t = one(k, null);
      if (k > 0 && t.names.length !== parts[0].names.length && t.count > 0) throw new Error(RC[1]);
      parts.push(t); total += t.count;
    }
    var names = parts[0].names, nc = names.length, columns = [], again = [], v, at, a, kind;
    function kindOf(c) { return c.type === 'number' ? 'n' : c.off ? 'o' : 'v'; }
    for (j = 0; j < nc; j++) { var nNum = 0, nLive = 0; for (k = 0; k < parts.length; k++) if (parts[k].count > 0) { nLive++; if (parts[k].columns[j].type === 'number') nNum++; } if (nNum && nNum < nLive) again.push(j); }
    if (again.length) {   // numbers here, text elsewhere: read those pieces again with those columns as text (column numbers in the file, as _text takes them)
      var sel = opts && opts.columns ? opts.columns : null, fileCols = again.map(function (jj) { return sel ? sel[jj] : jj; }), txt = ft === true ? true : (ft || []).concat(fileCols);
      for (k = 0; k < parts.length; k++) {
        if (!parts[k].count || !again.some(function (jj) { return parts[k].columns[jj].type === 'number'; })) continue;
        t = one(k, txt); again.forEach(function (jj) { parts[k].columns[jj] = t.columns[jj]; });
      }
    }
    for (j = 0; j < nc; j++) {
      kind = null;
      for (k = 0; k < parts.length; k++) if (parts[k].count) { var kk2 = kindOf(parts[k].columns[j]); if (kind === null) kind = kk2; else if (kind !== kk2) return null; }   // positions in one piece and strings in another: read it whole
      var col = { name: names[j], type: kind === 'n' ? 'number' : 'text', values: null, get: getAt };
      if (kind === 'o') {
        var os = new Uint32Array(total), oe = new Uint32Array(total), oq = new Uint8Array(total), asc = true, sh;
        for (at = 0, k = 0; k < parts.length; k++) { if (!parts[k].count) continue; a = parts[k].columns[j]; sh = cuts[k]; if (!a.offAscii) asc = false; for (i = 0; i < a.off[0].length; i++) { os[at + i] = a.off[0][i] + sh; oe[at + i] = a.off[1][i] + sh; } oq.set(a.off[2], at); at += a.off[0].length; }
        col.off = [os, oe, oq]; col.offAscii = asc;
      } else {
        v = kind === 'n' ? new Float64Array(total) : new Array(total); at = 0;
        for (k = 0; k < parts.length; k++) { if (!parts[k].count) continue; a = parts[k].columns[j].values; if (kind === 'n') v.set(a, at); else for (i = 0; i < a.length; i++) v[at + i] = a[i]; at += a.length; parts[k].columns[j].values = null; }
        col.values = v;
      }
      columns.push(col);
    }
    return makeTable(names, total, columns);
  }
  function parseCore(input, opts) {
    opts = opts || {};
    var delim = (opts.delimiter || ',').charCodeAt(0), header = opts.header !== false, u = stripBom(toBytes(input)), len = u.length, i, j, rc;
    if (opts.delimiter && opts.delimiter.length !== 1) throw new Error('text-columns: the delimiter is one character');
    if (delim > 127 || delim === 10 || delim === 13 || delim === 34) throw new Error('text-columns: this delimiter is not supported');
    if (!W) start();
    var useW = !!W && !opts.plain && len >= 16 && len < 1500000000, inp, starts, ends, qflag, st, nf, mem, ascii, numFn;
    if (useW) {
      var x = W.x, o;
      mem = x.memory; o = (W.heap + 15) & ~15; var pin = o; o = (o + len + 32) & ~15;
      if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
      new Uint8Array(mem.buffer).set(u, pin);
      nf = x.count(pin, len, delim);
      var ps = o; o = (o + 4 * nf + 15) & ~15; var pe = o; o = (o + 4 * nf + 15) & ~15; var pq = o; o = (o + nf + 15) & ~15; var pst = o; o = (o + 32) & ~15;
      if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
      rc = x.scan(pin, len, delim, ps, pe, pq, pst);
      var s32 = new Uint32Array(mem.buffer, pst, 4);
      var fields = s32[0], nrowsAll = s32[1], ncols = s32[2];
      if (rc) throw new Error(RC[rc]);
      var pnum = (o + 7) & ~7; o = (pnum + 8 * (opts._numRoom === 'fields' ? nf : nrowsAll) + 16) & ~15;   // room for one number column (one value a row; before 0.6.2 one a field), made before the views below exist
      if (!(opts.lazy || opts._off) && o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
      var pgs = (o + 15) & ~15, pge = (pgs + 4 * nrowsAll + 15) & ~15, pgq = (pge + 4 * nrowsAll + 15) & ~15;   // room to gather one column's positions (text columns that stay as positions)
      if (opts.lazy || opts._off) { o = pgq + nrowsAll + 16; if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536)); }
      starts = new Uint32Array(mem.buffer, ps, fields); ends = new Uint32Array(mem.buffer, pe, fields); qflag = new Uint8Array(mem.buffer, pq, fields);
      inp = new Uint8Array(mem.buffer, pin, len);
      ascii = x.ascii(pin, len);
      numFn = function (col, out, nrows, firstRow) {
        var pn = pnum, okk = x.numcol(pin, ps + 4 * firstRow * ncols, pe + 4 * firstRow * ncols, ncols, nrows, col, pn);
        if (okk) out.set(new Float64Array(mem.buffer, pn, nrows));
        return okk;
      };
      var gatherFn = (opts.lazy || opts._off) ? function (col, os, oe, oq, nrows, firstRow) {
        x.gather(ps + 4 * firstRow * ncols, pe + 4 * firstRow * ncols, pq + firstRow * ncols, ncols, nrows, col, pgs, pge, pgq);
        os.set(new Uint32Array(mem.buffer, pgs, nrows)); oe.set(new Uint32Array(mem.buffer, pge, nrows)); oq.set(new Uint8Array(mem.buffer, pgq, nrows));
      } : null;
      return build(inp, starts, ends, qflag, ncols, nrowsAll, ascii, numFn, header, delim, opts._text, opts._off, opts, u, gatherFn);
    }
    nf = countJS(u, len, delim);
    starts = new Uint32Array(nf); ends = new Uint32Array(nf); qflag = new Uint8Array(nf); st = new Uint32Array(4);
    rc = scanJS(u, len, delim, starts, ends, qflag, st);
    if (rc) throw new Error(RC[rc]);
    numFn = function (col, out, nrows, firstRow) { return numcolJS(u, starts.subarray(firstRow * st[2]), ends.subarray(firstRow * st[2]), st[2], nrows, col, out); };
    return build(u, starts.subarray(0, st[0]), ends.subarray(0, st[0]), qflag, st[2], st[1], asciiJS(u, len), numFn, header, delim, opts._text, opts._off, opts, u);
  }
  var RC = [null, 'text-columns: the rows do not all have the same number of fields', 'text-columns: text after a closing quote', 'text-columns: a quote is never closed'];

  function getAt(i) { return this.values[i]; }
  /** Which columns to keep: names (matched to the header) and/or 0-based numbers; returns the numbers in file order. */
  function pickColumns(want, names, ncols) {
    if (want === undefined || want === null) return null;
    if (typeof want === 'function') { var fo = [], fj; for (fj = 0; fj < ncols; fj++) if (want(names[fj], fj)) fo.push(fj); return fo; }
    var list = Array.isArray(want) ? want : [want], mark = new Uint8Array(ncols), out = [], w, j, hit, x;
    if (!ncols) return out;
    for (x = 0; x < list.length; x++) {
      w = list[x];
      if (typeof w === 'number') { if (!(w >= 0 && w < ncols && w % 1 === 0)) throw new Error('text-columns: there is no column number ' + w); mark[w] = 1; }
      else { hit = false; for (j = 0; j < ncols; j++) if (names[j] === w) { mark[j] = 1; hit = true; } if (!hit) throw new Error('text-columns: there is no column named "' + w + '"'); }
    }
    for (j = 0; j < ncols; j++) if (mark[j]) out.push(j);
    return out;
  }
  function cutField(u, a, b, q, ascii, sh) {
    var s;
    if (ascii) { if (sh.text === null) sh.text = td.decode(u); s = sh.text.substring(a, b); } else s = td.decode(u.subarray(a, b));
    return q ? s.split('""').join('"') : s;
  }
  /** A text column whose strings are cut from the input bytes when .values is first read. */
  function lazyColumn(name, os, oe, oq, u, ascii, sh) {
    var col = { name: name, type: 'text', get: null }, vals = null;
    Object.defineProperty(col, 'values', { enumerable: true, configurable: true, get: function () {
      if (vals === null) { var n = os.length, i; vals = new Array(n); for (i = 0; i < n; i++) vals[i] = cutField(u, os[i], oe[i], oq[i], ascii, sh); }
      return vals;
    } });
    col.get = function (i) { return vals !== null ? vals[i] : cutField(u, os[i], oe[i], oq[i], ascii, sh); };
    return col;
  }

  function build(inp, starts, ends, qflag, ncols, nrowsAll, ascii, numFn, header, delim, forceText, wantOff, o, u, gatherFn) {
    var names = [], j, i, text = null, sh = { text: null };
    function fix(s, q) { return q ? s.split('""').join('"') : s; }
    function str(a, b, q) {
      var s;
      if (ascii) { if (text === null) text = td.decode(inp); s = text.substring(a, b); }
      else s = td.decode(inp.subarray(a, b));
      return q ? s.split('""').join('"') : s;
    }
    var nrows = header ? Math.max(nrowsAll - 1, 0) : nrowsAll, firstRow = header ? 1 : 0;
    for (j = 0; j < ncols; j++) names.push(header && nrowsAll > 0 ? fix(td.decode(inp.subarray(starts[j], ends[j])), qflag[j]) : 'c' + (j + 1));   // the header alone, so a lazy table never decodes the whole text for it
    var sel = pickColumns(o && o.columns, names, ncols), lazy = !!(o && o.lazy), si, outNames = [];
    var columns = [];
    for (si = 0; si < (sel ? sel.length : ncols); si++) {
      j = sel ? sel[si] : si; outNames.push(names[j]);
      var col = { name: names[j], type: 'text', values: null, get: getAt }, nums = null;
      if (nrows > 0 && !(forceText && (forceText === true || forceText.indexOf(j) >= 0))) { nums = new Float64Array(nrows); if (!numFn(j, nums, nrows, firstRow)) nums = null; }
      if (nums) { col.type = 'number'; col.values = nums; }
      else if ((wantOff && (ascii || wantOff === 2)) || (lazy && nrows > 0)) {   // field positions instead of strings: a helper hands these back (strings cost more to send than to cut on the other side), and lazy columns keep them until read
        var os = new Uint32Array(nrows), oe = new Uint32Array(nrows), oq = new Uint8Array(nrows), kk;
        if (gatherFn) gatherFn(j, os, oe, oq, nrows, firstRow);
        else for (i = 0; i < nrows; i++) { kk = (i + firstRow) * ncols + j; os[i] = starts[kk]; oe[i] = ends[kk]; oq[i] = qflag[kk]; }
        if (wantOff && (ascii || wantOff === 2)) { col.values = null; col.off = [os, oe, oq]; col.offAscii = ascii; }
        else col = lazyColumn(names[j], os, oe, oq, u, ascii, sh);
      } else {
        var vals = new Array(nrows), k;
        for (i = 0; i < nrows; i++) { k = (i + firstRow) * ncols + j; vals[i] = str(starts[k], ends[k], qflag[k]); }
        col.values = vals;
      }
      columns.push(col);
    }
    return makeTable(outNames, nrows, columns);
  }

  function makeTable(names, nrows, columns) {
    var ncols = names.length;
    return {
      names: names, count: nrows, columns: columns,
      toRows: function () {
        var seen = Object.create(null), c, nm, out = new Array(nrows), r;
        for (c = 0; c < ncols; c++) { nm = names[c]; if (seen[nm]) throw new Error('TextColumns: duplicate column name "' + nm + '"'); seen[nm] = true; }
        for (r = 0; r < nrows; r++) out[r] = {};
        for (c = 0; c < ncols; c++) {
          var cv = columns[c].values; nm = names[c];
          if (nm === '__proto__') for (r = 0; r < nrows; r++) Object.defineProperty(out[r], nm, { value: cv[r], writable: true, enumerable: true, configurable: true });   // a plain assignment would set the prototype; checked once per column, not per cell
          else for (r = 0; r < nrows; r++) out[r][nm] = cv[r];
        }
        return out;
      }
    };
  }


  function qscan(u, delim) {   // quote marks of a piece: [parity, even places ok, odd places ok] (see tc.c)
    var out = new Uint32Array(3), len = u.length;
    if (!W) start();
    if (W && len >= 16 && len < 1500000000) {
      var x = W.x, mem = x.memory, pin = (W.heap + 15) & ~15, po = (pin + len + 32) & ~15, end = po + 16;
      if (end > mem.buffer.byteLength) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536));
      new Uint8Array(mem.buffer).set(u, pin);
      x.qscan(pin, len, delim, po);
      out.set(new Uint32Array(mem.buffer, po, 3));
    } else qscanJS(u, delim, out);
    return out;
  }

  /* ---- parallel parse (since 0.2.0): a big file is cut at line ends, each helper reads its piece with this same code, and the typed columns are joined ---- */
  function workerBody() {   // runs inside a helper; `TextColumns` is this file's code loaded there
    var held = null, kept = null, strict = null;
    function toUnits(u, os, oe) {   // byte positions -> UTF-16 positions, in place (both rise row by row and oe[z] <= os[z + 1])
      var p = 0, q = 0, n = os.length, z, t, c;
      for (z = 0; z < n; z++) {
        for (t = os[z]; p < t; p++) { c = u[p]; if ((c & 0xC0) !== 0x80) q += c >= 0xF0 ? 2 : 1; } os[z] = q;
        for (t = oe[z]; p < t; p++) { c = u[p]; if ((c & 0xC0) !== 0x80) q += c >= 0xF0 ? 2 : 1; } oe[z] = q;
      }
    }
    // Since 0.6.0, for a piece with non-ASCII text: the piece's text is decoded once here (strictly, so positions stay exact) and sent as one string, with every text column's positions in that string;
    // the page then only cuts substrings, instead of decoding the piece itself or (non-ASCII text) every field one by one. A piece that is not valid UTF-8 keeps the byte positions.
    function withText(out, h, again) {
      var j, any = false;
      for (j = 0; j < out.types.length; j++) if (out.types[j] === 3) any = true;   // plain-ASCII pieces keep 0.5.1's way (the page decodes the piece once): sending their text was slower
      if (!any || h.bad) return;
      if (h.text === undefined) { try { strict = strict || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); h.text = strict.decode(h.bytes); } catch (x) { h.bad = true; return; } }
      for (j = 0; j < out.types.length; j++) if (out.types[j] === 3) { toUnits(h.bytes, out.cols[j][0], out.cols[j][1]); out.types[j] = 2; }
      if (!again || !h.sent) out.text = h.text;
      h.sent = true;
    }
    // Since 0.6.0, for a File or Blob: this helper reads its own piece of the file (the page never reads or copies it). The piece starts after the first line end at or after
    // byte a - 1 (the start of the file for the first piece, after a byte order mark) and ends after the first line end at or after byte b - 1, so the pieces meet exactly.
    function sliced(b, step) {   // _slice (test switch): read in slices of step bytes (WebKitGTK hands file data over on the page's thread, so smaller handovers mean shorter pauses there)
      var out = new Uint8Array(b.size), at = 0;
      function next() { if (at >= b.size) return Promise.resolve(out.buffer); var e = Math.min(b.size, at + step); return b.slice(at, e).arrayBuffer().then(function (x) { out.set(new Uint8Array(x), at); at = e; return next(); }); }
      return next();
    }
    function readPiece(m) {
      var size = m.blob.size, a = m.a, from = a === 0 ? 0 : a - 1, pad = 65536, s, end, nl;
      function more() {
        var to = m.last ? size : Math.min(size, m.b - 1 + pad);
        return (m.slice > 0 ? sliced(m.blob.slice(from, to), m.slice) : m.blob.slice(from, to).arrayBuffer()).then(function (ab) {
          var buf = new Uint8Array(ab);
          if (a === 0) s = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? 3 : 0; else { nl = buf.indexOf(10); s = nl < 0 ? buf.length : nl + 1; }
          nl = m.last ? -1 : buf.indexOf(10, Math.max(m.b - 1 - from, 0));
          if (nl >= 0) end = nl + 1; else if (to === size) end = buf.length; else { pad *= 4; return more(); }
          return buf.subarray(Math.min(s, end), end);
        });
      }
      return more();
    }
    onmessage = function (e) {
      var m = e.data;
      if (m.op !== 'read') return run(m);
      readPiece(m).then(function (u) { held = { bytes: u, delim: m.delim, header: m.header, sel: m.sel, lazy: m.lazy }; m.q = u.indexOf(34) >= 0 ? TextColumns._qscan(u, m.delim.charCodeAt(0)) : null; run(m); },
        function (err) { postMessage({ id: m.id, err: String(err && err.message || err) }); });
    };
    function run(m) {
      var t, cols = [], types = [], tr = [], j, c, only, isText, ft, q;
      try {
        if (m.op === 'mem') { postMessage({ id: m.id, bytes: TextColumns._memBytes(), trims: TextColumns._trim.count }); return; }
        if (m.trim !== undefined) TextColumns.idleTrim(m.trim, m.keep); if (m.win !== undefined) TextColumns._win(m.win);   // the page's idleTrim setting, for this helper's own memory
        if (m.op === 'fill') { for (j = 0; j < m.cols.length; j++) new Float64Array(m.bufs[j]).set(kept[m.cols[j]], m.at); if (!m.keep) kept = null; postMessage({ id: m.id, bufs: m.bufs }, m.bufs); return; }
        if (m.op !== 'text') kept = null;
        if (m.op === 'hold') { held = { bytes: m.bytes }; q = TextColumns._qscan(m.bytes, m.delim.charCodeAt(0)); postMessage({ id: m.id, q: [q[0], q[1], q[2]] }); return; }
        if (m.op === 'parse') { if (m.bytes) held = { bytes: m.bytes }; held.delim = m.delim; held.header = m.header; held.sel = m.sel; held.lazy = m.lazy; }
        isText = m.op === 'text';
        if (isText && m.bytes) held.bytes = m.bytes;   // a piece read from a file whose bytes went to the page
        if (isText) ft = m.cols.map(function (p) { return held.sel ? held.sel[p] : p; });
        t = TextColumns.parse(held.bytes, { _shareLater: false, delimiter: held.delim, header: held.header, columns: held.sel, _text: ft, _off: m.utf16 !== false || (!isText && held.lazy) ? 2 : 1 });   // 2: positions for every text column (non-ASCII too), turned into UTF-16 positions by withText
        only = isText ? m.cols : null;
        for (j = 0; j < t.columns.length; j++) {
          if (only && only.indexOf(j) < 0) continue;
          c = t.columns[j]; types.push(c.type === 'number' ? 1 : c.off ? (c.offAscii ? 2 : 3) : 0); cols.push(c.off || c.values);
          if (c.type === 'number') { if (m.join && !isText) { (kept = kept || [])[j] = c.values; cols[cols.length - 1] = null; } else tr.push(c.values.buffer); } else if (c.off) tr.push(c.off[0].buffer, c.off[1].buffer, c.off[2].buffer);
        }
        var out = { id: m.id, names: t.names, count: t.count, types: types, cols: cols };
        if (m.utf16 !== false) withText(out, held, isText);
        if (m.op === 'read' || m.giveBytes) {
          if (m.q) out.q = [m.q[0], m.q[1], m.q[2]];
          if (held.bytes) for (j = 0; j < types.length; j++) if (m.bytes || types[j] === 3 || (types[j] === 2 && out.text === undefined)) { out.bytes = held.bytes; tr.push(held.bytes.buffer); held.bytes = null; break; }   // bytes the page sent always go back   // the page cuts this piece's strings itself: it gets the bytes (moved, not copied)
        }
        postMessage(out, tr);
      } catch (err) { postMessage({ id: m.id, err: String(err && err.message || err) }); }
    }
  }
  var POOL = [], nextId = 1, PAR_MIN = 32000000, WARM_MIN = 4000000;   // floors: helpers still to start (about 30 to 130 ms) / helpers already running
  function helperCount(opts) {
    var hc = typeof navigator === 'object' && navigator && navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(opts && opts.workers > 0 ? Math.floor(opts.workers) : Math.min(hc, 8), 64));
  }
  function makeHelper(opts) {
    var code = 'var TextColumns=(' + SELF_SRC + ')();(' + workerBody.toString() + ')();', w, h;
    if (opts && typeof opts.spawn === 'function') w = opts.spawn(code);
    else { var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); w = new Worker(url); URL.revokeObjectURL(url); }
    h = { w: w, wait: {} };
    w.onmessage = function (e) { var m = e.data, r = h.wait[m.id]; if (r) { delete h.wait[m.id]; r(m); } };
    w.onerror = function (ev) { var ids = Object.keys(h.wait); ids.forEach(function (id) { var r = h.wait[id]; delete h.wait[id]; r({ err: 'helper failed' }); }); if (ev && ev.preventDefault) ev.preventDefault(); h.dead = true; };
    return h;
  }
  function ask(h, msg, transfer) { return new Promise(function (ok) { var id = nextId++; msg.id = id; h.wait[id] = ok; try { h.w.postMessage(msg, transfer || []); } catch (e) { delete h.wait[id]; ok({ err: 'helper failed' }); } }); }
  /** Starts n helpers ahead of time (each one compiles the scanner), so the first big parse does not pay for it. */
  function warm(n, opts) { n = n || helperCount(opts); while (POOL.length < n) POOL.push(makeHelper(opts)); idleClose(); return POOL.length; }
  function helperMem() { return Promise.all(POOL.map(function (h) { return ask(h, { op: 'mem' }); })); }   // test hook: each helper's WebAssembly memory
  function closeHelpers() { if (HIDLE.timer) { clearTimeout(HIDLE.timer); HIDLE.timer = 0; } POOL.forEach(function (h) { try { h.w.terminate(); } catch (e) { /* gone */ } }); POOL = []; }
  /** Offsets where each piece starts: after a line end that is not inside quotes. null when the quotes cannot be trusted (a quote in the middle of a plain field). */
  function splitPoints(u, delim, n) {
    var len = u.length, cuts = [0], hasQ = u.indexOf(34) >= 0, qpos = 0, par = 0, k, t, p, nl, q, prev, go;
    function quotesBefore(limit) {
      while ((q = u.indexOf(34, qpos)) >= 0 && q < limit) {
        if (!par) { prev = q ? u[q - 1] : 10; if (prev !== 10 && prev !== delim && prev !== 34) return false; }
        par ^= 1; qpos = q + 1;
      }
      return true;
    }
    for (k = 1; k < n; k++) {
      t = Math.floor(len / n * k); p = Math.max(t, cuts[cuts.length - 1] + 1); go = true;
      while (go) {
        nl = u.indexOf(10, p);
        if (nl < 0) return cuts;
        if (hasQ) { if (!quotesBefore(nl)) return null; if (par) { p = nl + 1; continue; } }
        go = false;
      }
      if (nl + 1 >= len) return cuts;
      cuts.push(nl + 1);
    }
    return cuts;
  }
  /** Cut points without looking at quotes (the helpers check the quotes afterwards, see parseParallel). */
  function lineCuts(u, n) {
    var len = u.length, cuts = [0], k, p, nl;
    for (k = 1; k < n; k++) {
      p = Math.max(Math.floor(len / n * k), cuts[cuts.length - 1] + 1); nl = u.indexOf(10, p);
      if (nl < 0 || nl + 1 >= len) return cuts;
      cuts.push(nl + 1);
    }
    return cuts;
  }
  /** Column numbers for a `columns` option that has names: reads just the first line (as many lines as a quoted header needs). null when the first line cannot be read on its own. */
  function selectColumns(u, delim, header, want) {
    var list = Array.isArray(want) ? want : [want], e = -1, tries, end, t, names, j;
    if (typeof want !== 'function' && list.every(function (w) { return typeof w === 'number'; })) return list;
    for (tries = 0; tries < 50; tries++) {
      e = u.indexOf(10, e + 1); end = e < 0 ? u.length : e; if (end > 0 && u[end - 1] === 13) end--;
      try {
        t = parse(u.subarray(0, end), { delimiter: String.fromCharCode(delim), header: false, _text: true, _shareLater: false });
        if (t.count === 1) { names = []; for (j = 0; j < t.columns.length; j++) names.push(header ? t.columns[j].values[0] : 'c' + (j + 1)); return pickColumns(want, names, names.length); }
      } catch (err) { /* a quoted header with a line break: take one more line */ }
      if (e < 0) return null;
    }
    return null;
  }
  /**
   * Same answers as parse(), but a big file is read by several helpers at once (Web Workers). Returns a promise. input: bytes, a string, or (since 0.6.0) a File or Blob, such as one picked
   * with <input type=file>: then each helper reads its own piece straight from the file, so the page never holds the whole file (about half the memory) and nothing is copied to the helpers. Falls back to parse() when the file is small, there are no workers,
   * the quotes are odd or any helper fails (so errors are the same plain-words errors). opts as parse() (columns and lazy work the same), plus: workers (default: the cores, at most 8), minBytes (default 4,000,000 when the helpers are already running, from warm() or an earlier call, else 32,000,000; call warm() early to start the helpers ahead of time).
   * A file with quote marks is cut at plain line ends and each helper counts the quote marks of its piece (WebAssembly) so the cuts are known to fall outside quotes; if one does not, the older single-thread cut is used.
   */
  async function parseParallel(input, opts) {
    var t; HIDLE.busy++; if (HIDLE.timer) { clearTimeout(HIDLE.timer); HIDLE.timer = 0; }
    try { t = await parseParallelCore(input, opts); } finally { HIDLE.busy--; idleClose(); }
    shareLater(t, opts);
    return opts && opts.types ? applyTypes(t, opts.types) : t;
  }
  /* Since 0.6.2: helpers hold their memory (and a thread) while they live, so _helperIdle(ms) closes them after ms with no call (-1 = never, the default and the 0.6.1 way).
     The next call starts them again (and, like a fresh page, a file under 32 MB is then read on the page). */
  var HIDLE = { ms: -1, timer: 0, busy: 0 };
  function idleClose() {
    if (HIDLE.busy || !POOL.length || HIDLE.ms < 0 || typeof setTimeout !== 'function') return;
    if (HIDLE.timer) clearTimeout(HIDLE.timer);
    HIDLE.timer = setTimeout(function () { HIDLE.timer = 0; if (!HIDLE.busy) closeHelpers(); }, HIDLE.ms);
    if (HIDLE.timer && HIDLE.timer.unref) HIDLE.timer.unref();
  }
  var yq = null;
  function yieldNow() {   // back to the page's event loop and straight on (a message, not a timer, so no 4 ms clamp)
    if (typeof MessageChannel !== 'function') return new Promise(function (ok) { setTimeout(ok, 0); });
    if (!yq) { yq = { ch: new MessageChannel(), waiting: [] }; yq.ch.port1.onmessage = function () { var w = yq.waiting.shift(); if (w) w(); }; if (yq.ch.port1.unref) { yq.ch.port1.unref(); yq.ch.port2.unref(); } }   // Node: the channel must not keep the process alive
    return new Promise(function (ok) { yq.waiting.push(ok); yq.ch.port2.postMessage(0); });
  }
  function isBlob(x) { return typeof Blob === 'function' && x instanceof Blob; }
  async function parseParallelCore(input, opts) {
    opts = opts || {};
    var blob = isBlob(input) ? input : null, n = helperCount(opts), T = opts._timing, t0 = T ? performance.now() : 0, len = blob ? blob.size : 0;
    var noHelpers = opts.plain || n < 2 || (!opts.spawn && (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL !== 'function' || !URL.createObjectURL));
    var delim = (opts.delimiter || ',').charCodeAt(0), header = opts.header !== false, badDelim = opts.delimiter && opts.delimiter.length !== 1 || delim > 127 || delim === 10 || delim === 13 || delim === 34;
    var floor = opts.minBytes === undefined ? (POOL.length >= n ? WARM_MIN : PAR_MIN) : opts.minBytes, u = null, sel, lazy = !!opts.lazy, dch = String.fromCharCode(delim), k, i, j, r, jobs = [], res;
    if (blob && (noHelpers || badDelim || len < floor || opts._file === false)) { input = new Uint8Array(await blob.arrayBuffer()); blob = null; }   // _file: false = read the whole file on the page, the 0.5.2 way (test switch)
    if (!blob) { u = stripBom(toBytes(input)); len = u.length; }
    var serial = async function () { if (!u) u = stripBom(new Uint8Array(await blob.arrayBuffer())); var t = parse(u, opts); t.workers = 0; return t; };
    if (noHelpers || len < floor || badDelim) return serial();
    if (opts.columns !== undefined && opts.columns !== null) {
      var head = u;
      if (blob) { head = stripBom(new Uint8Array(await blob.slice(0, Math.min(len, 1048576)).arrayBuffer())); if (len > 1048576) head = head.subarray(0, head.lastIndexOf(10) + 1); }   // the column names from the first megabyte, cut at its last line end
      sel = selectColumns(head, delim, header, opts.columns); if (!sel) return serial();
    }
    var cuts, hasQ, sendBytes = true, pb = null, join = opts._join !== false;   // _join: false = the page joins the number columns (0.6.0 way; test switch)
    function pieceEnd(c, k) { return k + 1 < c.length ? c[k + 1] : len; }
    var slice = opts._slice || 0;   // private: read in slices of this many bytes (tested 2026.10.31: it never lowered the longest page stop, the string build did)
    if (blob) {   // every helper reads its own piece and parses it; the quote check comes after, and a file whose cuts fall inside quotes is read again the 0.5.2 way
      warm(n, opts);
      for (k = 0; k < n; k++) jobs.push(ask(POOL[k], { op: 'read', blob: blob, a: Math.floor(len / n * k), b: Math.floor(len / n * (k + 1)), last: k === n - 1, delim: dch, header: header && k === 0, sel: sel, lazy: lazy, utf16: opts._utf16, join: join, slice: slice, trim: TRIM.ms, keep: TRIM.keep, win: WIN }));
      if (T) T.post = performance.now() - t0;
      res = await Promise.all(jobs); jobs = [];
      var qpar = 0, qgood = true, qany = false, qerr = false;
      for (k = 0; k < res.length; k++) { if (res[k].err) qerr = true; if (res[k].q) { qany = true; if (!(qpar ? res[k].q[2] : res[k].q[1])) qgood = false; qpar ^= res[k].q[0]; } if (k + 1 < res.length && qpar) qgood = false; }
      if (qany && (!qgood || qpar)) { opts = Object.assign({}, opts, { _file: false }); return parseParallelCore(new Uint8Array(await blob.arrayBuffer()), opts); }
      if (qerr) return serial();
      pb = res.map(function (x) { return x.bytes || null; });
      cuts = res.map(function () { return 0; });
    } else {
    hasQ = u.indexOf(34) >= 0; cuts = lineCuts(u, n);
    if (cuts.length < 2) return serial();
    warm(cuts.length, opts);
    if (hasQ) {   // phase 1: every helper keeps its piece and counts its quote marks; a cut is good when the quotes before it pair up and every quote that opens a field is where a field starts
      for (k = 0; k < cuts.length; k++) { var pc = u.slice(cuts[k], pieceEnd(cuts, k)); jobs.push(ask(POOL[k], { op: 'hold', bytes: pc, delim: dch }, [pc.buffer])); }
      res = await Promise.all(jobs); jobs = [];
      var par = 0, good = true;
      for (k = 0; k < res.length && good; k++) {
        if (res[k].err) return serial();
        if (!(par ? res[k].q[2] : res[k].q[1])) good = false;
        par ^= res[k].q[0]; if (k + 1 < res.length && par) good = false;
      }
      if (good) sendBytes = false;
      else { cuts = splitPoints(u, delim, n); if (!cuts || cuts.length < 2) return serial(); warm(cuts.length, opts); }
    }
    for (k = 0; k < cuts.length; k++) {
      var msg = { op: 'parse', delim: dch, header: header && k === 0, sel: sel, lazy: lazy, utf16: opts._utf16, join: join, trim: TRIM.ms, keep: TRIM.keep, win: WIN }, tl = [];   // _utf16: false = the 0.5.1 way (test switch)
      if (sendBytes) { msg.bytes = u.slice(cuts[k], pieceEnd(cuts, k)); tl.push(msg.bytes.buffer); }
      jobs.push(ask(POOL[k], msg, tl));
    }
    if (T) T.post = performance.now() - t0;
    res = await Promise.all(jobs);
    }
    if (T) T.wait = performance.now() - t0;
    for (k = 0; k < res.length; k++) if (res[k].err) return serial();
    var names = res[0].names, ncols = 0, total = 0, live = [], cnt = [];
    for (k = 0; k < res.length; k++) {
      r = res[k]; if (!(r.count > 0)) continue;
      if (!ncols) ncols = r.names.length; else if (r.names.length !== ncols) return serial();
      total += r.count; live.push(k); cnt.push(r.count);
    }
    if (!live.length) return serial();
    if (names.length !== ncols) return serial();
    var again = [], textCol = [];   // chunks whose column came out as numbers while another chunk's came out as text: the helper gives that column as text too
    for (j = 0; j < ncols; j++) { textCol[j] = live.some(function (kk) { return res[kk].types[j] !== 1; }); }
    for (i = 0; i < live.length; i++) {
      k = live[i]; var need = []; for (j = 0; j < ncols; j++) if (textCol[j] && res[k].types[j] === 1) need.push(j);
      if (need.length) again.push(ask(POOL[k], { op: 'text', cols: need, utf16: opts._utf16, giveBytes: !!pb, bytes: pb && pb[k] ? pb[k] : undefined }, pb && pb[k] ? [pb[k].buffer] : []).then(function (kk, nd) { return function (m) { return { k: kk, need: nd, m: m }; }; }(k, need)));
    }
    var extra = await Promise.all(again);
    for (i = 0; i < extra.length; i++) if (extra[i].m.err) return serial();
    if (pb) extra.forEach(function (x) { if (x.m.bytes) pb[x.k] = x.m.bytes; });   // a file piece's bytes, back from the helper when its re-asked column needs them
    var textOf = {}; extra.forEach(function (x) { x.need.forEach(function (c, ix) { textOf[x.k + ':' + c] = { t: x.m.types[ix], d: x.m.cols[ix] }; }); });
    function desc(k, j) { return textOf[k + ':' + j] || { t: res[k].types[j], d: res[k].cols[j] }; }
    var pieceText = {};
    for (k = 0; k < res.length; k++) if (res[k].text !== undefined) pieceText[k] = res[k].text;
    extra.forEach(function (x) { if (x.m.text !== undefined) pieceText[x.k] = x.m.text; });
    function pieceBytes(k) { return pb ? pb[k] : u.subarray(cuts[k], pieceEnd(cuts, k)); }
    function pieceStr(k) { if (pieceText[k] === undefined) pieceText[k] = td.decode(pieceBytes(k)); return pieceText[k]; }
    // A text column's strings, piece by piece. fillPart does rows [z0, z1) of one piece; fillText does a whole column at once (a lazy column's first read),
    // fillSliced (since 0.6.2) does it in slices of about 4 ms with a yield between them, so building millions of strings never holds the page for long.
    function fillPart(v, at, k, j, z0, z1) {
      var d = desc(k, j), z, sv, tx, os, oe, oq, base, a;
      if (d.t === 2) {   // field positions inside this piece: cut the strings here, from one decoded copy of the piece
        tx = pieceStr(k); os = d.d[0]; oe = d.d[1]; oq = d.d[2];
        for (z = z0; z < z1; z++) { sv = tx.substring(os[z], oe[z]); v[at++] = oq[z] ? sv.split('""').join('"') : sv; }
      } else if (d.t === 3) {   // the same for a piece with non-ASCII text: the positions are bytes
        os = d.d[0]; oe = d.d[1]; oq = d.d[2]; base = pieceBytes(k);
        for (z = z0; z < z1; z++) { sv = td.decode(base.subarray(os[z], oe[z])); v[at++] = oq[z] ? sv.split('""').join('"') : sv; }
      } else { a = d.d; for (z = z0; z < z1; z++) v[at++] = a[z]; }
      return at;
    }
    function fillText(j) { var v = new Array(total), at = 0, ii; for (ii = 0; ii < live.length; ii++) at = fillPart(v, at, live[ii], j, 0, cnt[ii]); return v; }
    async function fillSliced(j, clock) {
      var v = new Array(total), at = 0, ii, z, step = 2048, e, t;
      for (ii = 0; ii < live.length; ii++) for (z = 0; z < cnt[ii]; z = e) {
        e = Math.min(cnt[ii], z + step); t = performance.now(); at = fillPart(v, at, live[ii], j, z, e); t = performance.now() - t;
        step = t > 0.5 ? Math.max(256, Math.min(1 << 20, Math.round(step * 1.5 / t))) : Math.min(1 << 20, step * 2);   // about 1.5 ms a step
        if (performance.now() - clock.t > clock.budget) { await yieldNow(); clock.t = performance.now(); }
      }
      return v;
    }
    function cellText(j, row) {
      var d, sv, kk;
      for (var ii = 0; ii < live.length; ii++) {
        if (row >= cnt[ii]) { row -= cnt[ii]; continue; }
        kk = live[ii]; d = desc(kk, j);
        if (d.t === 2) sv = pieceStr(kk).substring(d.d[0][row], d.d[1][row]); else if (d.t === 3) sv = td.decode(pieceBytes(kk).subarray(d.d[0][row], d.d[1][row])); else return d.d[row];
        return d.d[2][row] ? sv.split('""').join('"') : sv;
      }
    }
    var columns = [], v, a, numVals = {}, slicedBuild = opts._sliceBuild !== false && typeof performance === 'object', clock = { t: performance.now(), budget: opts._budget || 4 };   // _sliceBuild: false = 0.6.1 (one long build)
    if (join) {   // since 0.6.1: the helpers kept their number columns; the page makes each full-length column once and the columns travel through the helpers in groups,
      // every helper copying its rows into a different group at each turn, so the page never copies them (a 45 MB number file no longer blocks the page for tens of ms)
      var js = [], L = live.length, offs = [], gc = [], gb = [], o2 = 0, step, got;
      for (j = 0; j < ncols; j++) if (!textCol[j]) js.push(j);
      for (i = 0; i < L; i++) { offs.push(o2); o2 += cnt[i]; gc.push([]); gb.push([]); }
      js.forEach(function (jj, q) { gc[q % L].push(jj); gb[q % L].push(new ArrayBuffer(total * 8)); });
      for (step = 0; js.length && step < L; step++) {
        got = await Promise.all(live.map(function (kk, ii) { var g = (ii + step) % L; return gb[g].length ? ask(POOL[kk], { op: 'fill', bufs: gb[g], cols: gc[g], at: offs[ii], keep: step < L - 1 }, gb[g]).then(function (m) { if (m.err || !m.bufs) return false; gb[g] = m.bufs; return true; }) : true; }));
        if (got.indexOf(false) >= 0) return serial();
      }
      js.forEach(function (jj, q) { numVals[jj] = new Float64Array(gb[q % L][Math.floor(q / L)]); });
    }
    for (j = 0; j < ncols; j++) {
      var col = { name: names[j], type: textCol[j] ? 'text' : 'number', values: null, get: getAt };
      if (numVals[j]) col.values = numVals[j];
      else if (!textCol[j]) { v = new Float64Array(total); var at = 0; for (i = 0; i < live.length; i++) { a = res[live[i]].cols[j]; v.set(a, at); at += a.length; } col.values = v; }
      else if (lazy) col = lazyJoined(names[j], function (jj) { return function () { return fillText(jj); }; }(j), function (jj) { return function (row) { return cellText(jj, row); }; }(j));
      else col.values = slicedBuild ? await fillSliced(j, clock) : fillText(j);
      columns.push(col);
    }
    if (T) T.merge = performance.now() - t0;
    var out = makeTable(names, total, columns); out.workers = res.length;   // how many helpers read it (0 when it was read directly)
    return out;
  }
  function lazyJoined(name, make, one) {
    var col = { name: name, type: 'text', get: null }, vals = null;
    Object.defineProperty(col, 'values', { enumerable: true, configurable: true, get: function () { if (vals === null) vals = make(); return vals; } });
    col.get = function (i) { return vals !== null ? vals[i] : one(i); };
    return col;
  }

  return { _helperIdle: function (ms) { if (ms !== undefined) { HIDLE.ms = +ms; if (HIDLE.ms < 0 && HIDLE.timer) { clearTimeout(HIDLE.timer); HIDLE.timer = 0; } else idleClose(); } return HIDLE.ms; }, _win: function (v) { if (v !== undefined) WIN = +v || 0; return WIN; }, idleTrim: function (ms, keep) { TRIM.ms = ms === undefined ? 3000 : +ms; TRIM.keep = keep > 0 ? +keep : 0; if (TRIM.ms < 0 && TRIM.timer) { clearTimeout(TRIM.timer); TRIM.timer = 0; } return TRIM.ms; }, _sharePending: function () { return SHARE.q.length; }, _trim: TRIM, _memBytes: function () { return W ? W.x.memory.buffer.byteLength : 0; }, _helperMem: helperMem, version: '0.6.3', parse: parse, parseParallel: parseParallel, warm: warm, closeHelpers: closeHelpers, _qscan: qscan, ready: function () { return !!W; }, simd: function () { return !!(W && W.simd); } };
}));
