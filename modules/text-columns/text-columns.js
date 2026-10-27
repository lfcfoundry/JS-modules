/*!
 * text-columns.js: read CSV or TSV text into typed columns. Number columns come out as Float64Array, everything else as text, without building a string for every number.
 * The field scan runs in WebAssembly (SIMD when the browser has it, 16 bytes at a time); plain JavaScript gives the same answers when it does not. No dependencies, no network.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.1.2 (API 0)
 *
 *   var t = TextColumns.parse(bytesOrString, { delimiter: ',', header: true });   // delimiter '\t' for TSV
 *   t.names;  t.count;                                                              // column names, number of data rows
 *   t.columns[0].values;                                                            // Float64Array for a number column, array of strings otherwise
 *   t.toRows();                                                                     // array of row objects (numbers are numbers, the rest is text)
 *
 * A column is a number column when every field is a plain decimal (-12, 3.25) of at most 15 digits without a leading zero; anything else (empty fields, 007, 1e5, text) keeps that column as text.
 * Quoted fields ("a,b", "say ""hi""") and \r\n line ends work; a ragged file (rows with different field counts) throws.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextColumns = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* ---- WebAssembly (wasm/tc.c): scan, count, ascii, numcol; compiled when the file loads; the plain JavaScript below answers until it is ready or when there is no WebAssembly ---- */
  var WASM_B64 = /*WASM:tc:BEGIN*/'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'/*WASM:tc:END*/;
  var WASM_SIMD_B64 = /*WASM:tcsimd:BEGIN*/'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'/*WASM:tcsimd:END*/;
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var W = null, loading = false;
  function fromB64(s) { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64')); var bin = atob(s), u = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function start() {
    if (W || loading || typeof WebAssembly !== 'object') return;
    loading = true;
    try {
      var simd = WebAssembly.validate(SIMD_PROBE), m = new WebAssembly.Module(fromB64(simd ? WASM_SIMD_B64 : WASM_B64)), x = new WebAssembly.Instance(m, {}).exports;
      W = { x: x, heap: x.__heap_base.value, simd: simd };
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

  function parse(input, opts) {
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
      var pnum = (o + 7) & ~7; o = (pnum + 8 * nf + 16) & ~15;   // room for one number column of up to nf rows, so memory never grows after the views below exist
      if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
      rc = x.scan(pin, len, delim, ps, pe, pq, pst);
      var s32 = new Uint32Array(mem.buffer, pst, 4);
      var fields = s32[0], nrowsAll = s32[1], ncols = s32[2];
      if (rc) throw new Error(RC[rc]);
      starts = new Uint32Array(mem.buffer, ps, fields); ends = new Uint32Array(mem.buffer, pe, fields); qflag = new Uint8Array(mem.buffer, pq, fields);
      inp = new Uint8Array(mem.buffer, pin, len);
      ascii = x.ascii(pin, len);
      numFn = function (col, out, nrows, firstRow) {
        var pn = pnum, okk = x.numcol(pin, ps + 4 * firstRow * ncols, pe + 4 * firstRow * ncols, ncols, nrows, col, pn);
        if (okk) out.set(new Float64Array(mem.buffer, pn, nrows));
        return okk;
      };
      return build(inp, starts, ends, qflag, ncols, nrowsAll, ascii, numFn, header, delim);
    }
    nf = countJS(u, len, delim);
    starts = new Uint32Array(nf); ends = new Uint32Array(nf); qflag = new Uint8Array(nf); st = new Uint32Array(4);
    rc = scanJS(u, len, delim, starts, ends, qflag, st);
    if (rc) throw new Error(RC[rc]);
    numFn = function (col, out, nrows, firstRow) { return numcolJS(u, starts.subarray(firstRow * st[2]), ends.subarray(firstRow * st[2]), st[2], nrows, col, out); };
    return build(u, starts.subarray(0, st[0]), ends.subarray(0, st[0]), qflag, st[2], st[1], asciiJS(u, len), numFn, header, delim);
  }
  var RC = [null, 'text-columns: the rows do not all have the same number of fields', 'text-columns: text after a closing quote', 'text-columns: a quote is never closed'];

  function build(inp, starts, ends, qflag, ncols, nrowsAll, ascii, numFn, header, delim) {
    var names = [], j, i, text = null;
    function str(a, b, q) {
      var s;
      if (ascii) { if (text === null) text = td.decode(inp); s = text.substring(a, b); }
      else s = td.decode(inp.subarray(a, b));
      return q ? s.split('""').join('"') : s;
    }
    var nrows = header ? Math.max(nrowsAll - 1, 0) : nrowsAll, firstRow = header ? 1 : 0;
    for (j = 0; j < ncols; j++) names.push(header && nrowsAll > 0 ? str(starts[j], ends[j], qflag[j]) : 'c' + (j + 1));
    var columns = [];
    for (j = 0; j < ncols; j++) {
      var col = { name: names[j], type: 'text', values: null }, nums = null;
      if (nrows > 0) { nums = new Float64Array(nrows); if (!numFn(j, nums, nrows, firstRow)) nums = null; }
      if (nums) { col.type = 'number'; col.values = nums; }
      else {
        var vals = new Array(nrows), k;
        for (i = 0; i < nrows; i++) { k = (i + firstRow) * ncols + j; vals[i] = str(starts[k], ends[k], qflag[k]); }
        col.values = vals;
      }
      columns.push(col);
    }
    return {
      names: names, count: nrows, columns: columns,
      toRows: function () {
        var seen = Object.create(null), c, nm, out = new Array(nrows), r, o;
        for (c = 0; c < ncols; c++) { nm = names[c]; if (Object.prototype.hasOwnProperty.call(seen, nm)) throw new Error('TextColumns: duplicate column name "' + nm + '"'); seen[nm] = true; }
        for (r = 0; r < nrows; r++) out[r] = {};
        for (c = 0; c < ncols; c++) { var cv = columns[c].values; nm = names[c]; for (r = 0; r < nrows; r++) { if (nm === '__proto__') Object.defineProperty(out[r], nm, { value: cv[r], writable: true, enumerable: true, configurable: true }); else out[r][nm] = cv[r]; } }
        return out;
      }
    };
  }

  return { version: '0.1.2', parse: parse, ready: function () { return !!W; }, simd: function () { return !!(W && W.simd); } };
}));
