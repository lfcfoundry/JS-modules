/*!
 * text-columns.js: read CSV or TSV text into typed columns. Number columns come out as Float64Array, everything else as text, without building a string for every number.
 * The field scan runs in WebAssembly (SIMD when the browser has it, 16 bytes at a time); plain JavaScript gives the same answers when it does not. No dependencies, no network.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.4.0 (API 0)
 *
 *   var t = TextColumns.parse(bytesOrString, { delimiter: ',', header: true });   // delimiter '\t' for TSV
 *   t.names;  t.count;                                                              // column names, number of data rows
 *   t.columns[0].values;                                                            // Float64Array for a number column, array of strings otherwise
 *   t.toRows();                                                                     // array of row objects (numbers are numbers, the rest is text)
 *   TextColumns.parse(bytes, { columns: ['price', 'city'] });                       // only these columns (names or 0-based numbers), in file order; the rest are never converted
 *   TextColumns.parse(bytes, { columns: function (name, index) { return name !== 'notes'; } });   // or a function that says yes or no for each column
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
    var held = null;
    onmessage = function (e) {
      var m = e.data, t, cols = [], types = [], tr = [], j, c, only, isText, ft, q;
      try {
        if (m.op === 'hold') { held = { bytes: m.bytes }; q = TextColumns._qscan(m.bytes, m.delim.charCodeAt(0)); postMessage({ id: m.id, q: [q[0], q[1], q[2]] }); return; }
        if (m.op === 'parse') { if (m.bytes) held = { bytes: m.bytes }; held.delim = m.delim; held.header = m.header; held.sel = m.sel; held.lazy = m.lazy; }
        isText = m.op === 'text';
        if (isText) ft = m.cols.map(function (p) { return held.sel ? held.sel[p] : p; });
        t = TextColumns.parse(held.bytes, { delimiter: held.delim, header: held.header, columns: held.sel, _text: ft, _off: isText ? 1 : held.lazy ? 2 : 1 });
        only = isText ? m.cols : null;
        for (j = 0; j < t.columns.length; j++) {
          if (only && only.indexOf(j) < 0) continue;
          c = t.columns[j]; types.push(c.type === 'number' ? 1 : c.off ? (c.offAscii ? 2 : 3) : 0); cols.push(c.off || c.values);
          if (c.type === 'number') tr.push(c.values.buffer); else if (c.off) tr.push(c.off[0].buffer, c.off[1].buffer, c.off[2].buffer);
        }
        postMessage({ id: m.id, names: t.names, count: t.count, types: types, cols: cols }, tr);
      } catch (err) { postMessage({ id: m.id, err: String(err && err.message || err) }); }
    };
  }
  var POOL = [], nextId = 1, PAR_MIN = 32000000;
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
  function warm(n, opts) { n = n || helperCount(opts); while (POOL.length < n) POOL.push(makeHelper(opts)); return POOL.length; }
  function closeHelpers() { POOL.forEach(function (h) { try { h.w.terminate(); } catch (e) { /* gone */ } }); POOL = []; }
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
        t = parse(u.subarray(0, end), { delimiter: String.fromCharCode(delim), header: false, _text: true });
        if (t.count === 1) { names = []; for (j = 0; j < t.columns.length; j++) names.push(header ? t.columns[j].values[0] : 'c' + (j + 1)); return pickColumns(want, names, names.length); }
      } catch (err) { /* a quoted header with a line break: take one more line */ }
      if (e < 0) return null;
    }
    return null;
  }
  /**
   * Same answers as parse(), but a big file is read by several helpers at once (Web Workers). Returns a promise. Falls back to parse() when the file is small, there are no workers,
   * the quotes are odd or any helper fails (so errors are the same plain-words errors). opts as parse() (columns and lazy work the same), plus: workers (default: the cores, at most 8), minBytes (default 32,000,000; call warm() early to start the helpers ahead of time).
   * A file with quote marks is cut at plain line ends and each helper counts the quote marks of its piece (WebAssembly) so the cuts are known to fall outside quotes; if one does not, the older single-thread cut is used.
   */
  async function parseParallel(input, opts) {
    opts = opts || {};
    var delim = (opts.delimiter || ',').charCodeAt(0), header = opts.header !== false, u = stripBom(toBytes(input)), len = u.length, serial = function () { var t = parse(u, opts); t.workers = 0; return t; };
    var n = helperCount(opts), T = opts._timing, t0 = T ? performance.now() : 0;
    if (opts.plain || n < 2 || len < (opts.minBytes === undefined ? PAR_MIN : opts.minBytes) || (!opts.spawn && (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL !== 'function' || !URL.createObjectURL))) return serial();
    if (opts.delimiter && opts.delimiter.length !== 1 || delim > 127 || delim === 10 || delim === 13 || delim === 34) return serial();
    var sel, lazy = !!opts.lazy, dch = String.fromCharCode(delim);
    if (opts.columns !== undefined && opts.columns !== null) { sel = selectColumns(u, delim, header, opts.columns); if (!sel) return serial(); }
    var hasQ = u.indexOf(34) >= 0, cuts = lineCuts(u, n), k, jobs = [], res, sendBytes = true, i, j, r;
    if (cuts.length < 2) return serial();
    warm(cuts.length, opts);
    function pieceEnd(c, k) { return k + 1 < c.length ? c[k + 1] : len; }
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
      var msg = { op: 'parse', delim: dch, header: header && k === 0, sel: sel, lazy: lazy }, tl = [];
      if (sendBytes) { msg.bytes = u.slice(cuts[k], pieceEnd(cuts, k)); tl.push(msg.bytes.buffer); }
      jobs.push(ask(POOL[k], msg, tl));
    }
    if (T) T.post = performance.now() - t0;
    res = await Promise.all(jobs);
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
      if (need.length) again.push(ask(POOL[k], { op: 'text', cols: need }).then(function (kk, nd) { return function (m) { return { k: kk, need: nd, m: m }; }; }(k, need)));
    }
    var extra = await Promise.all(again);
    for (i = 0; i < extra.length; i++) if (extra[i].m.err) return serial();
    var textOf = {}; extra.forEach(function (x) { x.need.forEach(function (c, ix) { textOf[x.k + ':' + c] = { t: x.m.types[ix], d: x.m.cols[ix] }; }); });
    function desc(k, j) { return textOf[k + ':' + j] || { t: res[k].types[j], d: res[k].cols[j] }; }
    var pieceText = {};
    function pieceStr(k) { if (pieceText[k] === undefined) pieceText[k] = td.decode(u.subarray(cuts[k], pieceEnd(cuts, k))); return pieceText[k]; }
    function fillText(j) {
      var v = new Array(total), at = 0, d, z, sv, tx, os, oe, oq, base, a;
      for (i = 0; i < live.length; i++) {
        k = live[i]; d = desc(k, j);
        if (d.t === 2) {   // field positions inside this piece: cut the strings here, from one decoded copy of the piece
          tx = pieceStr(k); os = d.d[0]; oe = d.d[1]; oq = d.d[2];
          for (z = 0; z < os.length; z++) { sv = tx.substring(os[z], oe[z]); v[at++] = oq[z] ? sv.split('""').join('"') : sv; }
        } else if (d.t === 3) {   // the same for a piece with non-ASCII text: the positions are bytes
          os = d.d[0]; oe = d.d[1]; oq = d.d[2]; base = cuts[k];
          for (z = 0; z < os.length; z++) { sv = td.decode(u.subarray(base + os[z], base + oe[z])); v[at++] = oq[z] ? sv.split('""').join('"') : sv; }
        } else { a = d.d; for (z = 0; z < a.length; z++) v[at++] = a[z]; }
      }
      return v;
    }
    function cellText(j, row) {
      var d, sv, kk;
      for (var ii = 0; ii < live.length; ii++) {
        if (row >= cnt[ii]) { row -= cnt[ii]; continue; }
        kk = live[ii]; d = desc(kk, j);
        if (d.t === 2) sv = pieceStr(kk).substring(d.d[0][row], d.d[1][row]); else if (d.t === 3) sv = td.decode(u.subarray(cuts[kk] + d.d[0][row], cuts[kk] + d.d[1][row])); else return d.d[row];
        return d.d[2][row] ? sv.split('""').join('"') : sv;
      }
    }
    var columns = [], v, a;
    for (j = 0; j < ncols; j++) {
      var col = { name: names[j], type: textCol[j] ? 'text' : 'number', values: null, get: getAt };
      if (!textCol[j]) { v = new Float64Array(total); var at = 0; for (i = 0; i < live.length; i++) { a = res[live[i]].cols[j]; v.set(a, at); at += a.length; } col.values = v; }
      else if (lazy) col = lazyJoined(names[j], function (jj) { return function () { return fillText(jj); }; }(j), function (jj) { return function (row) { return cellText(jj, row); }; }(j));
      else col.values = fillText(j);
      columns.push(col);
    }
    if (T) T.merge = performance.now() - t0;
    var out = makeTable(names, total, columns); out.workers = cuts.length;   // how many helpers read it (0 when it was read directly)
    return out;
  }
  function lazyJoined(name, make, one) {
    var col = { name: name, type: 'text', get: null }, vals = null;
    Object.defineProperty(col, 'values', { enumerable: true, configurable: true, get: function () { if (vals === null) vals = make(); return vals; } });
    col.get = function (i) { return vals !== null ? vals[i] : one(i); };
    return col;
  }

  return { version: '0.4.0', parse: parse, parseParallel: parseParallel, warm: warm, closeHelpers: closeHelpers, _qscan: qscan, ready: function () { return !!W; }, simd: function () { return !!(W && W.simd); } };
}));
