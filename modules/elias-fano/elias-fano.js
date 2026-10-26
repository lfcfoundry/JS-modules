/*!
 * elias-fano.js: keep sorted whole numbers small (Elias-Fano coding) and still ask them, without unpacking: "what is value number i" and "where is the first value at or above x".
 * Also keeps many sorted lists (links of every item of a map, posting lists) in one structure. Plain JavaScript, with a WebAssembly path (and a SIMD one) for batches and for decoding everything. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.3.1 (API 1)
 *
 *   var bytes = EliasFano.build(new Uint32Array([3, 8, 8, 20, 400]));   // Uint8Array, about 2 + log2(range / count) bits per value
 *   var list = EliasFano.open(bytes);  list.get(3);  // 20
 *   list.nextGEQ(9);                                 // 3 (the index of the first value >= 9); list.length when there is none
 *   list.rank(8);                                    // 3 (how many values are <= 8)
 *   var set = EliasFano.openLists(EliasFano.buildLists([[1, 5], [], [2, 2, 9]]));  set.get(2);  // Uint32Array [2, 2, 9];  set.decodeAll() -> { offsets, values }
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EliasFano = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAGIC = 0x00014645, HDR = 64, SAMPLE_SHIFT = 7, MAX_N = 1073741824;
  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('elias-fano: needs a little endian machine');

  /* ---- WebAssembly (wasm/ef.c): the same format and answers; compiled the moment this file loads, never blocking; the plain JavaScript below answers until it is ready ---- */
  var WASM_B64 = /*WASM:ef:BEGIN*/'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'/*WASM:ef:END*/, WASM_SIMD_B64 = /*WASM:efsimd:BEGIN*/'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'/*WASM:efsimd:END*/;
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var W = null, backend = 'auto', readyPromise = null, simdOn = false, mem = null, u8 = null, u32 = null, heapEnd = 0, blocks = [];   // blocks: free list [{o, n}] of the arena
  function b64bytes(t) { var bin, i; if (typeof atob === 'function') { var r = atob(t); bin = new Uint8Array(r.length); for (i = 0; i < r.length; i++) bin[i] = r.charCodeAt(i); } else bin = new Uint8Array(Buffer.from(t, 'base64')); return bin; }
  function views() { u8 = new Uint8Array(mem.buffer); u32 = new Uint32Array(mem.buffer); }
  function alloc(n) {   // first fit in the arena, 8 byte aligned; grows the memory when nothing fits
    n = (n + 7) & ~7; if (n === 0) n = 8;
    for (var i = 0; i < blocks.length; i++) { var b = blocks[i]; if (b.n >= n) { var o = b.o; if (b.n === n) blocks.splice(i, 1); else { b.o += n; b.n -= n; } return o; } }
    var at = heapEnd, need = at + n, have = mem.buffer.byteLength;
    if (need > have) { mem.grow(Math.ceil((need - have) / 65536)); views(); }
    heapEnd = need; return at;
  }
  function release(o, n) {
    n = (n + 7) & ~7; if (n === 0) n = 8;
    var i = 0; while (i < blocks.length && blocks[i].o < o) i++;
    blocks.splice(i, 0, { o: o, n: n });
    if (i + 1 < blocks.length && blocks[i].o + blocks[i].n === blocks[i + 1].o) { blocks[i].n += blocks[i + 1].n; blocks.splice(i + 1, 1); }
    if (i > 0 && blocks[i - 1].o + blocks[i - 1].n === blocks[i].o) { blocks[i - 1].n += blocks[i].n; blocks.splice(i, 1); i--; }
    if (blocks[i].o + blocks[i].n === heapEnd) { heapEnd = blocks[i].o; blocks.splice(i, 1); }
  }
  function start() {
    if (readyPromise) return readyPromise;
    if (typeof WebAssembly !== 'object' || !WASM_B64) return (readyPromise = Promise.resolve(false));
    try { simdOn = WebAssembly.validate(SIMD_PROBE) && !!WASM_SIMD_B64; } catch (e) { simdOn = false; }
    var bytes = b64bytes(simdOn ? WASM_SIMD_B64 : WASM_B64);
    readyPromise = WebAssembly.instantiate(bytes, {}).then(function (r) {
      var x = r.instance.exports; mem = x.memory; views(); heapEnd = x.__heap_base; blocks = []; W = x; return true;
    }, function () { W = null; return false; });
    return readyPromise;
  }
  function useWasm() { return W !== null && backend !== 'js'; }

  /* ---- layout shared by both builders ---- */
  function lowBits(n, maxv) { var u = maxv + 1, l = 0; while (l < 31 && n * Math.pow(2, l + 1) <= u) l++; return l; }
  function layout(n, maxv) {
    var l = n === 0 ? 0 : lowBits(n, maxv), s = SAMPLE_SHIFT, hmax = Math.floor(maxv / Math.pow(2, l)), nbits = n + hmax + 1;
    var lowOff = HDR, lowBytes = ((Math.ceil(n * l / 32) + 2) * 4 + 7) & ~7, highOff = lowOff + lowBytes, highBytes = (Math.ceil(nbits / 64) + 1) * 8;
    var s1Off = highOff + highBytes, s1Bytes = (Math.ceil(n / (1 << s)) * 4 + 7) & ~7, s0Off = s1Off + s1Bytes, s0Bytes = (Math.ceil((hmax + 1) / (1 << s)) * 4 + 7) & ~7;
    return { n: n, maxv: maxv, l: l, s: s, nbits: nbits, hmax: hmax, lowOff: lowOff, highOff: highOff, s1Off: s1Off, s0Off: s0Off, total: s0Off + s0Bytes };
  }
  function listHeader(bytes) {
    if (!bytes || bytes.byteLength < HDR || bytes.byteOffset % 4) throw new RangeError('elias-fano: truncated or unaligned list');
    var h = new Uint32Array(bytes.buffer, bytes.byteOffset, HDR >>> 2);
    if (h[0] !== MAGIC) throw new Error('elias-fano: not a list');
    if (h[1] > MAX_N || (h[1] === 0 && h[2] !== 0)) throw new RangeError('elias-fano: invalid list size');
    var expected = layout(h[1], h[2]);
    if (h[3] !== expected.l || h[4] !== expected.s || h[5] !== expected.nbits || h[6] !== expected.lowOff || h[7] !== expected.highOff || h[8] !== expected.s1Off || h[9] !== expected.s0Off || h[10] !== expected.total || bytes.byteLength !== expected.total)
      throw new RangeError('elias-fano: inconsistent list header or length');
    for (var i = 11; i < HDR / 4; i++) if (h[i] !== 0) throw new RangeError('elias-fano: unknown list header fields');
    return h;
  }
  function check(values) {
    var n = values.length, prev = 0, i, v;
    if (n > MAX_N) throw new RangeError('elias-fano: at most ' + MAX_N + ' values');
    for (i = 0; i < n; i++) { v = values[i]; if (!(v >= prev && v <= 4294967295) || v % 1 !== 0) throw new RangeError('elias-fano: values must be whole numbers, 0 to 4294967295, never going down (value ' + i + ')'); prev = v; }
  }

  /* ---- build in JavaScript ---- */
  function buildJS(values) {
    var n = values.length, maxv = n ? values[n - 1] : 0, L = layout(n, maxv), out = new Uint8Array(L.total), h = new Uint32Array(out.buffer);
    h[0] = MAGIC; h[1] = n; h[2] = maxv; h[3] = L.l; h[4] = L.s; h[5] = L.nbits; h[6] = L.lowOff; h[7] = L.highOff; h[8] = L.s1Off; h[9] = L.s0Off; h[10] = L.total;
    if (n === 0) return out;
    var l = L.l, low = new Uint32Array(out.buffer, L.lowOff), hi = new Uint32Array(out.buffer, L.highOff), a1 = new Uint32Array(out.buffer, L.s1Off), a0 = new Uint32Array(out.buffer, L.s0Off);
    var step = 1 << L.s, i, x, p, w, sh, xl, pos, m = l === 0 ? 0 : (l === 32 ? 0xffffffff : ((1 << l) - 1) >>> 0), pw = Math.pow(2, l);
    for (i = 0; i < n; i++) {
      x = values[i];
      if (l) { xl = (x & m) >>> 0; p = i * l; w = Math.floor(p / 32); sh = p - w * 32; low[w] = (low[w] | (xl << sh)) >>> 0; if (sh + l > 32) low[w + 1] = (low[w + 1] | (xl >>> (32 - sh))) >>> 0; }
      pos = Math.floor(x / pw) + i; hi[pos >>> 5] = (hi[pos >>> 5] | (1 << (pos & 31))) >>> 0;
    }
    for (var k = 0; (i = k * step) < n; k++) a1[k] = Math.floor(values[i] / pw) + i;
    var c = 0, j;
    for (k = 0; (j = k * step) <= L.hmax; k++) { while (c < n && Math.floor(values[c] / pw) <= j) c++; a0[k] = j + c; }
    return out;
  }
  function buildWasm(values) {
    var n = values.length, maxv = values[n - 1], L = layout(n, maxv), vp = alloc(n * 4), op = alloc(L.total), inp = values;
    if (!(values instanceof Uint32Array)) inp = Uint32Array.from(values);
    u8.fill(0, op, op + L.total); u32.set(inp, vp >>> 2);
    W.ef_build(vp, n, L.l, L.s, L.lowOff, L.highOff, L.s1Off, L.s0Off, L.total, op);
    var out = u8.slice(op, op + L.total); release(vp, n * 4); release(op, L.total); return out;
  }
  function build(values) {
    check(values); var n = values.length;
    return n > 0 && useWasm() ? buildWasm(values) : buildJS(values);
  }

  /* ---- reading in JavaScript ---- */
  function pop32(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  function sel32(x, r) {   // position of the r-th (from 0) set bit of x
    var pos = 0, c;
    c = pop32(x & 0xffff); if (r >= c) { r -= c; x >>>= 16; pos = 16; }
    c = pop32(x & 0xff); if (r >= c) { r -= c; x >>>= 8; pos += 8; }
    while (r) { x &= x - 1; r--; }
    return pos + (31 - Math.clz32(x & -x));
  }
  function List(bytes) {
    var h = listHeader(bytes);
    this.bytes = bytes; this.length = h[1]; this._maxv = h[2]; this._l = h[3]; this._s = h[4]; this._nbits = h[5]; this._ptr = 0; this._wm = false;
    var b = bytes.buffer, o = bytes.byteOffset;
    this._low = new Uint32Array(b, o + h[6], (h[7] - h[6]) >>> 2); this._hi = new Uint32Array(b, o + h[7], (h[8] - h[7]) >>> 2);
    this._s1 = new Uint32Array(b, o + h[8], (h[9] - h[8]) >>> 2); this._s0 = new Uint32Array(b, o + h[9], (h[10] - h[9]) >>> 2);
    this._pw = Math.pow(2, this._l); this._m = this._l === 0 ? 0 : ((1 << this._l) - 1) >>> 0;
  }
  var P = List.prototype;
  P._lowAt = function (i) {
    var l = this._l; if (l === 0) return 0;
    var p = i * l, w = Math.floor(p / 32), sh = p - w * 32, low = this._low, v = low[w] >>> sh;
    if (sh + l > 32) v = (v | (low[w + 1] << (32 - sh))) >>> 0;
    return (v & this._m) >>> 0;
  };
  P._sel1 = function (i) {
    var s = this._s, k = i >>> s, pos = this._s1[k], rem = i - (k << s), w = pos >>> 5, H = this._hi, cur = (H[w] & (-1 << (pos & 31))) >>> 0, c;
    while (rem >= (c = pop32(cur))) { rem -= c; cur = H[++w]; }
    return w * 32 + sel32(cur, rem);
  };
  P._sel0 = function (j) {
    var s = this._s, k = j >>> s, pos = this._s0[k], rem = j - (k << s), w = pos >>> 5, H = this._hi, cur = (~H[w] & (-1 << (pos & 31))) >>> 0, c;
    while (rem >= (c = pop32(cur))) { rem -= c; cur = ~H[++w] >>> 0; }
    return w * 32 + sel32(cur, rem);
  };
  P._getJS = function (i) { var hh = this._sel1(i) - i; return hh * this._pw + this._lowAt(i); };
  P._nextJS = function (x) {
    var n = this.length; if (n === 0 || x > this._maxv) return n;
    var pw = this._pw, h = Math.floor(x / pw), xl = x - h * pw, i, sp, H = this._hi;
    if (h === 0) { i = 0; sp = 0; } else { var pz = this._sel0(h - 1); i = pz - (h - 1); sp = pz + 1; }
    while (i < n) {
      if (!((H[sp >>> 5] >>> (sp & 31)) & 1)) return i;
      if (this._lowAt(i) >= xl) return i;
      i++; sp++;
    }
    return n;
  };
  P._decodeJS = function (out) {
    var n = this.length, H = this._hi, nw = Math.ceil(this._nbits / 32), i = 0, w, x, bit, pw = this._pw, j;
    for (w = 0; w < nw && i < n; w++) {
      x = H[w];
      while (x !== 0 && i < n) { bit = 31 - Math.clz32(x & -x); out[i] = (w * 32 + bit) - i; i++; x &= x - 1; }
    }
    for (j = 0; j < n; j++) out[j] = out[j] * pw + this._lowAt(j);
    return out;
  };

  /* ---- reading in WebAssembly: the list is copied into the module's memory the first time it is asked, and let go by free() ---- */
  P._wasm = function () {
    if (backend === 'js' || W === null) return false;
    if (!this._wm) { this._ptr = alloc(this.bytes.length); u8.set(this.bytes, this._ptr); this._wm = true; }
    return true;
  };
  P.free = function () { if (this._wm && W) { release(this._ptr, this.bytes.length); this._wm = false; this._ptr = 0; } };
  P.get = function (i) { if (!(i >= 0 && i < this.length) || i % 1 !== 0) return undefined; return this._wasm() ? W.ef_get(this._ptr, i) >>> 0 : this._getJS(i); };
  P.nextGEQ = function (x) { if (!(x > 0)) x = 0; if (x > 4294967295) return this.length; if (x % 1 !== 0) x = Math.ceil(x); return this._wasm() ? W.ef_next(this._ptr, x) >>> 0 : this._nextJS(x); };
  P.lowerBound = P.nextGEQ;   // how many values are below x (same number as nextGEQ)
  P.rank = function (x) { if (x !== x || x < 0) return 0; if (x >= 4294967295) return this.length; return this.nextGEQ(Math.floor(x) + 1); };   // how many values are at or below x
  P.nextValue = function (x) { var i = this.nextGEQ(x); return i < this.length ? this.get(i) : undefined; };
  P.contains = function (x) { var i = this.nextGEQ(x); return i < this.length && this.get(i) === x; };
  P.count = function (lo, hi) { return this.nextGEQ(hi) - this.nextGEQ(lo); };
  P.getMany = function (idx, out) {
    var k = idx.length, r = out || new Uint32Array(k), j;
    if (this._wasm()) {
      var ip = alloc(k * 4), op = alloc(k * 4); u32.set(idx instanceof Uint32Array ? idx : Uint32Array.from(idx), ip >>> 2);
      W.ef_get_many(this._ptr, ip, op, k); r.set(u32.subarray(op >>> 2, (op >>> 2) + k)); release(ip, k * 4); release(op, k * 4); return r;
    }
    for (j = 0; j < k; j++) r[j] = this._getJS(idx[j]);
    return r;
  };
  P.nextGEQMany = function (xs, out) {
    var k = xs.length, r = out || new Uint32Array(k), j;
    if (this._wasm()) {
      var ip = alloc(k * 4), op = alloc(k * 4); u32.set(xs instanceof Uint32Array ? xs : Uint32Array.from(xs), ip >>> 2);
      W.ef_next_many(this._ptr, ip, op, k); r.set(u32.subarray(op >>> 2, (op >>> 2) + k)); release(ip, k * 4); release(op, k * 4); return r;
    }
    for (j = 0; j < k; j++) r[j] = this._nextJS(xs[j]);
    return r;
  };
  P.rankMany = function (xs, out) {   // rank of each x in one call; values at the top of the range are looked up one by one
    var k = xs.length, r = out || new Uint32Array(k), q = new Uint32Array(k), j;
    for (j = 0; j < k; j++) { var x = xs[j]; q[j] = x >= 4294967295 ? 4294967295 : x < 0 || x !== x ? 0 : Math.floor(x) + 1; }
    this.nextGEQMany(q, r);
    for (j = 0; j < k; j++) { var y = xs[j]; if (y !== y || y < 0) r[j] = 0; else if (y >= 4294967295) r[j] = this.length; }
    return r;
  };
  P.toArray = function () {
    var n = this.length, r = new Uint32Array(n); if (n === 0) return r;
    if (this._wasm()) { var op = alloc(n * 4); W.ef_decode(this._ptr, op); r.set(u32.subarray(op >>> 2, (op >>> 2) + n)); release(op, n * 4); return r; }
    return this._decodeJS(r);
  };
  P.slice = function (a, b) {   // values a up to (not including) b as a Uint32Array
    var n = this.length; a = Math.max(0, a | 0); b = Math.min(n, b === undefined ? n : b | 0); if (b <= a) return new Uint32Array(0);
    var r = new Uint32Array(b - a), H = this._hi, sp = this._sel1(a), i = a, w = sp >>> 5, x = (H[w] & (-1 << (sp & 31))) >>> 0, pw = this._pw, bit;
    while (i < b) {
      while (x === 0) x = H[++w];
      bit = 31 - Math.clz32(x & -x); r[i - a] = (w * 32 + bit - i) * pw + this._lowAt(i); i++; x &= x - 1;
    }
    return r;
  };
  P.stats = function () { return { count: this.length, bytes: this.bytes.length, bitsPerValue: this.length ? this.bytes.length * 8 / this.length : 0, lowBits: this._l }; };

  function open(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.byteOffset % 4 !== 0) bytes = bytes.slice();
    return new List(bytes);
  }


  /* ---- many sorted lists in one structure (adjacency lists, posting lists): list i is kept as a run inside shared Elias-Fano sequences ----
     Every list is sorted. Inside a chunk of C lists, list j gets j*K added (K = biggest value + 1) so the whole chunk is one sorted sequence of values; where each list starts is a second sorted sequence.
     C is chosen so that a chunk stays below 2^32. */
  var LMAGIC = 0x314c4645;   // "EFL1"
  function buildLists(lists) {
    var n = lists.length, i, j, total = 0, maxv = 0, v, prev;
    for (i = 0; i < n; i++) { var L = lists[i]; total += L.length; prev = 0; for (j = 0; j < L.length; j++) { v = L[j]; if (!(v >= prev && v <= 4294967295) || v % 1 !== 0) throw new RangeError('elias-fano: list ' + i + ' is not sorted whole numbers'); prev = v; if (v > maxv) maxv = v; } }
    if (total > MAX_N) throw new RangeError('elias-fano: at most ' + MAX_N + ' values in all');
    var K = maxv + 1, C = Math.floor(4294967295 / K); if (C < 1) throw new RangeError('elias-fano: values up to 2^32-1 leave no room to chain lists');
    var starts = new Uint32Array(n + 1), pos = 0; for (i = 0; i < n; i++) { starts[i] = pos; pos += lists[i].length; } starts[n] = pos;
    var nc = Math.ceil(n / C), blobs = [], c, base, vals, k;
    for (c = 0; c < nc; c++) {
      var a = c * C, b = Math.min(n, a + C), cnt = starts[b] - starts[a]; vals = new Uint32Array(cnt); k = 0;
      for (i = a; i < b; i++) { var add = (i - a) * K, Li = lists[i]; for (j = 0; j < Li.length; j++) vals[k++] = Li[j] + add; }
      blobs.push(cnt ? build(vals) : new Uint8Array(0));
    }
    var off = build(starts), pad = function (x) { return (x + 7) & ~7; }, head = 6 + nc, size = pad(head * 4) + pad(off.length), t;
    for (c = 0; c < nc; c++) size += pad(blobs[c].length);
    var out = new Uint8Array(size), h = new Uint32Array(out.buffer, 0, head);
    h[0] = LMAGIC; h[1] = n; h[2] = K >>> 0; h[3] = C; h[4] = nc; h[5] = off.length;
    for (c = 0; c < nc; c++) h[6 + c] = blobs[c].length;
    t = pad(head * 4); out.set(off, t); t += pad(off.length);
    for (c = 0; c < nc; c++) { out.set(blobs[c], t); t += pad(blobs[c].length); }
    return out;
  }
  function Lists(bytes) {
    if (!bytes || bytes.byteLength < 24 || bytes.byteOffset % 4) throw new RangeError('elias-fano: truncated or unaligned list set');
    var h0 = new Uint32Array(bytes.buffer, bytes.byteOffset, 6);
    if (h0[0] !== LMAGIC) throw new Error('elias-fano: not a list set');
    var n = h0[1], K = h0[2], C = h0[3], nc = h0[4], offLen = h0[5];
    if (n >= MAX_N || !K || !C || C !== Math.floor(4294967295 / K) || nc !== Math.ceil(n / C)) throw new RangeError('elias-fano: inconsistent list-set header');
    var head = 6 + nc;
    if (head > Math.floor(bytes.byteLength / 4)) throw new RangeError('elias-fano: truncated list-set header');
    var h = new Uint32Array(bytes.buffer, bytes.byteOffset, head), pad = function (x) { return (x + 7) & ~7; }, t = pad(head * 4);
    if (offLen < HDR || t + offLen > bytes.byteLength) throw new RangeError('elias-fano: truncated list-set offsets');
    var offBytes = bytes.subarray(t, t + offLen), offHeader = listHeader(offBytes);
    if (offHeader[1] !== n + 1) throw new RangeError('elias-fano: list-set offsets have the wrong count');
    var offsets = open(offBytes), chunks = [], starts = [], totalValues = offsets.get(n), chunkValues = 0, c;
    t += pad(offLen);
    try {
      if (offsets.get(0) !== 0 || totalValues > MAX_N || t > bytes.byteLength) throw new RangeError('elias-fano: invalid list-set offsets');
      for (c = 0; c < nc; c++) {
        var chunkLen = h[6 + c], end = t + chunkLen, endPad = t + pad(chunkLen), firstList = c * C, lastList = Math.min(n, firstList + C);
        if (endPad > bytes.byteLength) throw new RangeError('elias-fano: truncated list-set chunk');
        var firstValue = offsets.get(firstList), lastValue = offsets.get(lastList), chunk = null;
        if (!(firstValue >= 0 && lastValue >= firstValue && lastValue <= totalValues)) throw new RangeError('elias-fano: invalid list-set range');
        if (chunkLen) { chunk = open(bytes.subarray(t, end)); if (chunk.length !== lastValue - firstValue) throw new RangeError('elias-fano: list-set chunk has the wrong count'); }
        else if (lastValue !== firstValue) throw new RangeError('elias-fano: missing list-set chunk');
        chunks.push(chunk); starts.push(firstValue); chunkValues += lastValue - firstValue; t = endPad;
      }
      if (t !== bytes.byteLength || chunkValues !== totalValues) throw new RangeError('elias-fano: inconsistent list-set length');
    } catch (e) { offsets.free(); chunks.forEach(function (chunk) { if (chunk) chunk.free(); }); throw e; }
    this.length = n; this._K = K; this._C = C; this.bytes = bytes; this._off = offsets; this._chunks = chunks; this._cstart = starts;
  }
  var LP = Lists.prototype;
  LP.size = function (i) { return this._off.get(i + 1) - this._off.get(i); };
  LP.get = function (i) {   // list i as a Uint32Array
    if (!(i >= 0 && i < this.length) || i % 1 !== 0) return undefined;
    var c = Math.floor(i / this._C), a = this._off.get(i), b = this._off.get(i + 1), cs = this._cstart[c], r;
    if (b === a) return new Uint32Array(0);
    r = this._chunks[c].slice(a - cs, b - cs); var base = (i - c * this._C) * this._K, j; for (j = 0; j < r.length; j++) r[j] -= base;
    return r;
  };
  LP.decodeAll = function () {   // everything at once: { offsets: Uint32Array(n + 1), values: Uint32Array } (plain offset arrays); uses the fast whole-sequence decoder
    var n = this.length, offsets = this._off.toArray(), values = new Uint32Array(offsets[n]), c, i, j, K = this._K, C = this._C;
    for (c = 0; c < this._chunks.length; c++) {
      if (!this._chunks[c]) continue;
      var all = this._chunks[c].toArray(), a = c * C, e = Math.min(n, a + C), cs = offsets[a];
      for (i = a; i < e; i++) { var base = (i - a) * K, p0 = offsets[i], p1 = offsets[i + 1]; for (j = p0; j < p1; j++) values[j] = all[j - cs] - base; }
    }
    return { offsets: offsets, values: values };
  };
  LP.free = function () { this._off.free(); for (var c = 0; c < this._chunks.length; c++) if (this._chunks[c]) this._chunks[c].free(); };
  function openLists(bytes) { if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes); if (bytes.byteOffset % 8 !== 0) bytes = bytes.slice(); return new Lists(bytes); }

  /* ---- partitioned lists (since 1.2.0): chunks of 2^logC values (the last one shorter); each chunk is stored as the cheapest of a dense range (no bits at all), a bitmap or Elias-Fano. Same format as wasm/ef.c describes. ---- */
  var PMAGIC = 0x00015046, PHDR = 48;
  function popc(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24; }
  function ctz(x) { return 31 - Math.clz32(x & -x); }
  function selw(x, r) { while (r) { x &= x - 1; r--; } return ctz(x); }
  function buildPartitioned(values, opts) {
    check(values);
    var logC = opts && opts.chunk ? Math.round(Math.log(opts.chunk) / Math.LN2) : 7;
    if (logC < 5 || logC > 10 || (1 << logC) !== (opts && opts.chunk ? opts.chunk : 128)) throw new RangeError('elias-fano: chunk must be 32, 64, 128, 256, 512 or 1024');
    var n = values.length, C = 1 << logC, nc = Math.ceil(n / C), first = new Uint32Array(nc), last = new Uint32Array(nc), off = new Uint32Array(nc + 1), meta = new Uint8Array((nc + 3) & ~3), plan = [], c, i, pos = 0;
    for (c = 0; c < nc; c++) {
      var a = c * C, b = Math.min(n, a + C), k = b - a, f = values[a], lv = values[b - 1], span = lv - f, strict = true, t, l = 0, words;
      for (i = a + 1; i < b; i++) if (values[i] === values[i - 1]) { strict = false; break; }
      first[c] = f; last[c] = lv;
      if (strict && span + 1 === k) { t = 0; words = 0; }
      else {
        l = lowBits(k, span); var nlw = Math.ceil(k * l / 32), nhw = Math.ceil((k + Math.floor(span / Math.pow(2, l)) + 1) / 32), efw = nlw + 1 + nhw, bmw = Math.ceil((span + 1) / 32);
        if (strict && bmw <= efw) { t = 1; words = bmw; l = 0; } else { t = 2; words = efw; }
      }
      meta[c] = t | (l << 2); plan.push({ a: a, b: b, t: t, l: l, words: words }); off[c] = pos * 4; pos += words;
    }
    off[nc] = pos * 4;
    var offF = PHDR, offL = offF + nc * 4, offO = offL + nc * 4, offM = offO + (nc + 1) * 4, offP = (offM + meta.length + 7) & ~7, total = offP + pos * 4;
    var out = new Uint8Array(total), h = new Uint32Array(out.buffer);
    h[0] = PMAGIC; h[1] = n; h[2] = logC; h[3] = nc; h[4] = offF; h[5] = offL; h[6] = offO; h[7] = offM; h[8] = offP; h[9] = total;
    h.set(first, offF >> 2); h.set(last, offL >> 2); h.set(off, offO >> 2); out.set(meta, offM);
    for (c = 0; c < nc; c++) {
      var p = plan[c], base = (offP >> 2) + (off[c] >> 2), f2 = first[c], d, j;
      if (p.t === 1) { for (i = p.a; i < p.b; i++) { d = values[i] - f2; h[base + (d >>> 5)] |= 1 << (d & 31); } }
      else if (p.t === 2) {
        var l2 = p.l, m = l2 === 0 ? 0 : ((1 << l2) - 1) >>> 0, pw = Math.pow(2, l2), nlw2 = Math.ceil((p.b - p.a) * l2 / 32), hb = base + nlw2 + 1;
        for (i = p.a, j = 0; i < p.b; i++, j++) {
          d = values[i] - f2;
          if (l2) { var xl = (d & m) >>> 0, q = j * l2, w = q >>> 5, sh = q & 31; h[base + w] |= xl << sh; if (sh + l2 > 32) h[base + w + 1] |= xl >>> (32 - sh); }
          var bit = Math.floor(d / pw) + j; h[hb + (bit >>> 5)] |= 1 << (bit & 31);
        }
      }
    }
    return out;
  }
  /** Refuses a damaged or hostile partitioned blob before anything reads it: the header, the directory (sizes, order, offsets) and, chunk by chunk, that the bits agree with the counts, so no read can leave the blob. */
  function pHeader(bytes) {
    if (!bytes || bytes.byteLength < PHDR || bytes.byteOffset % 4 || bytes.byteLength % 4) throw new RangeError('elias-fano: truncated or unaligned partitioned list');
    var h = new Uint32Array(bytes.buffer, bytes.byteOffset, PHDR / 4);
    if (h[0] !== PMAGIC) throw new Error('elias-fano: not a partitioned list');
    var n = h[1], logC = h[2], nc = h[3], C = 1 << logC, i, c;
    if (n > MAX_N || logC < 5 || logC > 10 || nc !== Math.ceil(n / C)) throw new RangeError('elias-fano: invalid partitioned list size');
    var offF = PHDR, offL = offF + nc * 4, offO = offL + nc * 4, offM = offO + (nc + 1) * 4, offP = (offM + ((nc + 3) & ~3) + 7) & ~7;
    if (h[4] !== offF || h[5] !== offL || h[6] !== offO || h[7] !== offM || h[8] !== offP || bytes.byteLength < offP || h[9] !== bytes.byteLength) throw new RangeError('elias-fano: inconsistent partitioned list header or length');
    for (i = 10; i < PHDR / 4; i++) if (h[i] !== 0) throw new RangeError('elias-fano: unknown partitioned list header fields');
    var W32 = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2), F = offF >> 2, Lw = offL >> 2, O = offO >> 2, pw = offP >> 2, payWords = (bytes.byteLength - offP) >> 2, prevLast = 0, pos = 0;
    if (nc && W32[O] !== 0) throw new RangeError('elias-fano: invalid partitioned list offsets');
    if (W32[O + nc] !== payWords * 4 && nc) throw new RangeError('elias-fano: partitioned list payload has the wrong length');
    for (c = 0; c < nc; c++) {
      var k = c + 1 < nc ? C : n - (nc - 1) * C, f = W32[F + c], lv = W32[Lw + c], span = lv - f, mt = bytes[offM + c], t = mt & 3, l = mt >> 2, words, p0 = W32[O + c] >> 2, p1 = W32[O + c + 1] >> 2, ones = 0, w;
      if (lv < f || f < prevLast || W32[O + c] % 4 || W32[O + c + 1] % 4 || p0 !== pos || p1 < p0 || p1 > payWords || mt > 0x7f) throw new RangeError('elias-fano: inconsistent partitioned list chunk ' + c);
      prevLast = lv;
      if (t === 0) { if (l !== 0 || span + 1 !== k) throw new RangeError('elias-fano: invalid dense chunk ' + c); words = 0; }
      else if (t === 1) { words = Math.ceil((span + 1) / 32); if (l !== 0 || k > span + 1) throw new RangeError('elias-fano: invalid bitmap chunk ' + c); }
      else if (t === 2) {
        if (l !== lowBits(k, span)) throw new RangeError('elias-fano: invalid Elias-Fano chunk ' + c);
        var nlw = Math.ceil(k * l / 32); words = nlw + 1 + Math.ceil((k + Math.floor(span / Math.pow(2, l)) + 1) / 32);
      } else throw new RangeError('elias-fano: unknown chunk kind in chunk ' + c);
      if (p1 - p0 !== words) throw new RangeError('elias-fano: partitioned list chunk ' + c + ' has the wrong length');
      if (t === 1) { for (w = 0; w < words; w++) ones += popc(W32[pw + p0 + w]); if (ones !== k || (span + 1) % 32 && (W32[pw + p0 + words - 1] >>> ((span + 1) % 32)) !== 0 || !(W32[pw + p0] & 1) || !((W32[pw + p0 + (span >>> 5)] >>> (span & 31)) & 1)) throw new RangeError('elias-fano: bitmap chunk ' + c + ' does not hold its values'); }
      if (t === 2) {
        var hb = pw + p0 + nlw + 1, nh = k + Math.floor(span / Math.pow(2, l)) + 1, hw = Math.ceil(nh / 32);
        for (w = 0; w < hw; w++) ones += popc(W32[hb + w]);
        if (ones !== k || nh % 32 && (W32[hb + hw - 1] >>> (nh % 32)) !== 0) throw new RangeError('elias-fano: Elias-Fano chunk ' + c + ' does not hold its values');
      }
      pos = p1;
    }
    if (pos !== payWords) throw new RangeError('elias-fano: partitioned list payload has unused bytes');
    return h;
  }
  function PList(bytes) {
    var h = pHeader(bytes);
    this.bytes = bytes; this.length = h[1]; this._logC = h[2]; this._nc = h[3]; var W32 = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length >> 2);
    this._h = W32; this._F = h[4] >> 2; this._L = h[5] >> 2; this._O = h[6] >> 2; this._M = h[7]; this._P = h[8] >> 2; this._wm = false; this._ptr = 0;
  }
  var PP = PList.prototype;
  PP._cn = function (c) { return c + 1 < this._nc ? (1 << this._logC) : this.length - ((this._nc - 1) << this._logC); };
  PP._cget = function (c, j) {
    var H = this._h, p = this._P + (H[this._O + c] >> 2), mt = this.bytes[this._M + c], t = mt & 3, l = mt >> 2, f = H[this._F + c], w, r, x;
    if (t === 0) return f + j;
    if (t === 1) { w = 0; r = j; while (r >= (x = popc(H[p + w]))) { r -= x; w++; } return f + w * 32 + selw(H[p + w], r); }
    var n = this._cn(c), hb = p + (((n * l + 31) >>> 5) + 1), pos, q, sh, lo;
    w = 0; r = j; while (r >= (x = popc(H[hb + w]))) { r -= x; w++; }
    pos = w * 32 + selw(H[hb + w], r);
    if (l === 0) lo = 0; else { q = j * l; w = q >>> 5; sh = q & 31; lo = (H[p + w] >>> sh); if (sh + l > 32) lo = (lo | (H[p + w + 1] << (32 - sh))); lo = (lo & (((1 << l) - 1) >>> 0)) >>> 0; }
    return f + (pos - j) * Math.pow(2, l) + lo;
  };
  PP._cnext = function (c, d) {   // index in chunk c of the first value >= first + d (1 <= d <= span)
    var H = this._h, p = this._P + (H[this._O + c] >> 2), mt = this.bytes[this._M + c], t = mt & 3, l = mt >> 2, w, x, cnt, n = this._cn(c);
    if (t === 0) return d;
    if (t === 1) { var wq = d >>> 5; cnt = 0; for (w = 0; w < wq; w++) cnt += popc(H[p + w]); if (d & 31) cnt += popc(H[p + wq] & ((1 << (d & 31)) - 1)); return cnt; }
    var span = H[this._L + c] - H[this._F + c], hb = p + (((n * l + 31) >>> 5) + 1), nhw = Math.ceil((n + Math.floor(span / Math.pow(2, l)) + 1) / 32), pw = Math.pow(2, l);
    var h = Math.floor(d / pw), xl = d - h * pw, j, q, pos, hj, r, lo, qq, sh;
    if (h === 0) { j = 0; q = 0; } else { r = h - 1; w = 0; while (r >= (x = popc(~H[hb + w]))) { r -= x; w++; } pos = w * 32 + selw(~H[hb + w] >>> 0, r); j = pos - (h - 1); q = pos + 1; }
    while (j < n) {
      w = q >>> 5; x = (H[hb + w] & (0xffffffff << (q & 31))) >>> 0;
      while (x === 0) { w++; if (w >= nhw) return n; x = H[hb + w]; }
      pos = w * 32 + ctz(x); hj = pos - j;
      if (hj > h) return j;
      if (l === 0) lo = 0; else { qq = j * l; w = qq >>> 5; sh = qq & 31; lo = (H[p + w] >>> sh); if (sh + l > 32) lo = (lo | (H[p + w + 1] << (32 - sh))); lo = (lo & (((1 << l) - 1) >>> 0)) >>> 0; }
      if (lo >= xl) return j;
      j++; q = pos + 1;
    }
    return n;
  };
  PP._nextJS = function (x) {
    var n = this.length, H = this._h, F = this._F, Lw = this._L, lo = 0, hi = this._nc - 1, c;
    if (n === 0 || x <= H[F]) return 0;
    if (x > H[Lw + hi]) return n;
    while (lo < hi) { var m = (lo + hi) >>> 1; if (H[Lw + m] >= x) hi = m; else lo = m + 1; }
    c = lo; if (x <= H[F + c]) return c << this._logC;
    return (c << this._logC) + this._cnext(c, x - H[F + c]);
  };
  PP._decodeJS = function (a, e, out) {
    var C = this._logC, c, j, i, n = this._nc;
    if (e <= a) return out;
    for (c = a >> C; c <= (e - 1) >> C; c++) { var base = c << C, nci = this._cn(c); for (j = Math.max(a - base, 0); j < Math.min(e - base, nci); j++) out[base + j - a] = this._cget(c, j); }
    return out;
  };
  PP._wasm = P._wasm;
  PP.free = P.free;
  PP.get = function (i) { if (!(i >= 0 && i < this.length) || i % 1 !== 0) return undefined; return this._wasm() ? W.pef_get(this._ptr, i) >>> 0 : this._cget(i >>> this._logC, i & ((1 << this._logC) - 1)); };
  PP.nextGEQ = function (x) { if (!(x > 0)) x = 0; if (x > 4294967295) return this.length; if (x % 1 !== 0) x = Math.ceil(x); return this._wasm() ? W.pef_next(this._ptr, x) >>> 0 : this._nextJS(x); };
  PP.lowerBound = PP.nextGEQ; PP.rank = P.rank; PP.nextValue = P.nextValue; PP.contains = P.contains; PP.count = P.count; PP.rankMany = P.rankMany;
  function manyP(name, jsOne, wname) {
    return function (xs, out) {
      var k = xs.length, r = out || new Uint32Array(k), j;
      if (this._wasm()) { var ip = alloc(k * 4), op = alloc(k * 4); u32.set(xs instanceof Uint32Array ? xs : Uint32Array.from(xs), ip >>> 2); W[wname](this._ptr, ip, op, k); r.set(u32.subarray(op >>> 2, (op >>> 2) + k)); release(ip, k * 4); release(op, k * 4); return r; }
      for (j = 0; j < k; j++) r[j] = jsOne.call(this, xs[j]);
      return r;
    };
  }
  PP.getMany = manyP('getMany', function (i) { return this._cget(i >>> this._logC, i & ((1 << this._logC) - 1)); }, 'pef_get_many');
  PP.nextGEQMany = manyP('nextGEQMany', PP._nextJS, 'pef_next_many');
  PP.slice = function (a, b) {
    var n = this.length; a = Math.max(0, a | 0); b = Math.min(n, b === undefined ? n : b | 0); if (b <= a) return new Uint32Array(0);
    var r = new Uint32Array(b - a);
    if (this._wasm()) { var op = alloc(r.length * 4); W.pef_decode_range(this._ptr, a, b, op); r.set(u32.subarray(op >>> 2, (op >>> 2) + r.length)); release(op, r.length * 4); return r; }
    return this._decodeJS(a, b, r);
  };
  PP.toArray = function () { return this.slice(0, this.length); };
  PP.stats = function () {
    var kinds = [0, 0, 0], c; for (c = 0; c < this._nc; c++) kinds[this.bytes[this._M + c] & 3]++;
    return { count: this.length, bytes: this.bytes.length, bitsPerValue: this.length ? this.bytes.length * 8 / this.length : 0, chunk: 1 << this._logC, chunks: this._nc, dense: kinds[0], bitmap: kinds[1], eliasFano: kinds[2] };
  };
  function openPartitioned(bytes) { if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes); if (bytes.byteOffset % 8 !== 0) bytes = bytes.slice(); return new PList(bytes); }

  /* ---- intersection of sorted lists: leapfrog over nextGEQ, nothing is decoded. Lists may be flat or partitioned, in any mix; each common value comes out once ---- */
  function intersect(lists) {
    var k = lists.length, i, ls = [];
    if (k === 0) return new Uint32Array(0);
    if (k > 64) throw new RangeError('elias-fano: intersect takes at most 64 lists');
    for (i = 0; i < k; i++) { if (!lists[i] || typeof lists[i].nextGEQ !== 'function') throw new TypeError('elias-fano: intersect takes opened lists'); ls.push(lists[i]); }
    ls.sort(function (a, b) { return a.length - b.length; });
    if (ls[0].length === 0) return new Uint32Array(0);
    var cap = ls[0].length, res, o = 0;
    if (useWasm()) {
      var hp = alloc(k * 8), op = alloc(cap * 4);
      for (i = 0; i < k; i++) { ls[i]._wasm(); u32[(hp >>> 2) + 2 * i] = ls[i]._ptr; u32[(hp >>> 2) + 2 * i + 1] = ls[i] instanceof PList ? 1 : 0; }
      o = W.ef_intersect(hp, k, op) >>> 0; res = u32.slice(op >>> 2, (op >>> 2) + o); release(hp, k * 8); release(op, cap * 4); return res;
    }
    res = new Uint32Array(cap);
    var cand = ls[0].get(0);
    for (;;) {
      var agree = true;
      for (i = 0; i < k; i++) { var L = ls[i], j = L.nextGEQ(cand); if (j >= L.length) return res.slice(0, o); var v = L.get(j); if (v !== cand) { cand = v; agree = false; } }
      if (agree) { res[o++] = cand; if (cand === 4294967295) return res.slice(0, o); cand++; }
    }
  }

  start();   // compile early
  return {
    version: '1.3.1', api: 1, build: build, open: open, buildPartitioned: buildPartitioned, openPartitioned: openPartitioned, intersect: intersect, buildLists: buildLists, openLists: openLists, ready: function () { return start(); },
    accelerated: function () { return useWasm(); }, simd: function () { return W !== null && simdOn; },
    setBackend: function (b) { if (b !== 'auto' && b !== 'js' && b !== 'wasm') throw new Error('backend is auto, js or wasm'); backend = b; },
    _buildJS: buildJS, _layout: layout
  };
}));
