/*!
 * pcodec-js.js: Pcodec (a compressor for numbers) for web pages and Node, in one file with no dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version @VERSION@ (API 1) · @PROFILE_LINE@
 *
 * Pcodec ("pco") is a number compressor by Martin Loncaric and contributors (https://github.com/pcodec/pcodec, Apache-2.0, notice in NOTICE-pcodec.txt).
 * This file holds pco 1.0.4 as WebAssembly programs (built from wasm/ with wasm/build.sh), so it writes and reads ordinary Pcodec files: any other Pcodec can open what this writes, and this opens what any other Pcodec 1.x writes.
 *
 *   PcodecJS.load().then(function (pc) {                                      // pc is the ready object; load() rejects if WebAssembly is missing or blocked
 *     var bytes = pc.pack(new Float64Array([1.5, 2.5, 3.5]));                 // a Uint8Array (only in the "pack" file)
 *     var back  = pc.unpack(bytes);                                           // a Float64Array again, every bit the same (the file says its own type and count)
 *     for (var part of pc.stream(bytes)) use(part);                           // or a few thousand numbers at a time, no big buffer
 *   });
 *
 * Needs a page that allows WebAssembly (the policy word is wasm-unsafe-eval). There is no plain-JavaScript fallback; without WebAssembly load() rejects with a clear message.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PcodecJS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PROGRAMS = @PROGRAMS@;                                         // { name: base64 }; "fast" (SIMD) and "plain" read, "pack" read and write
  var TYPES = { u32: [1, Uint32Array], u64: [2, typeof BigUint64Array === 'function' ? BigUint64Array : null], i32: [3, Int32Array], i64: [4, typeof BigInt64Array === 'function' ? BigInt64Array : null], f32: [5, Float32Array], f64: [6, Float64Array], u16: [7, Uint16Array], i16: [8, Int16Array] };
  var KIND_NAME = { 1: 'u32', 2: 'u64', 3: 'i32', 4: 'i64', 5: 'f32', 6: 'f64', 7: 'u16', 8: 'i16' };
  var ERRORS = { '-1': 'this number type is not in this build', '-2': 'the data is damaged or cut short', '-3': 'the file holds a different count of numbers than asked', '-4': 'bad argument' };
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var WARM = @WARM@;                                                  // three tiny Pcodec files [kind, count, base64] that the warm-up unpacks in a loop
  var HAS_PACK = !!PROGRAMS.pack, MAX_COUNT = 1 << 25;

  function b64(s) {
    var i, n, u;
    if (typeof atob === 'function') { s = atob(s); n = s.length; u = new Uint8Array(n); for (i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  function typeOf(a) {
    for (var k in TYPES) if (TYPES[k][1] && a instanceof TYPES[k][1]) return k;
    return null;
  }
  function pick(want) {                                                 // the program this engine should run (want: 'fast' or 'plain' to force one)
    if (HAS_PACK) return 'pack';
    if (want && PROGRAMS[want]) return want;
    if (PROGRAMS.fast && WebAssembly.validate(SIMD_PROBE)) return 'fast';
    if (PROGRAMS.plain) return 'plain';
    throw new Error('PcodecJS: this file needs WebAssembly SIMD, which this browser does not have; use pcodec-js.js instead');
  }
  var compiled = null;
  function compileAsync(want) {
    if (typeof WebAssembly !== 'object') return Promise.reject(new Error('PcodecJS needs WebAssembly, which this page does not have'));
    var name; try { name = pick(want); } catch (e) { return Promise.reject(e); }
    return WebAssembly.compile(b64(PROGRAMS[name])).then(function (m) { compiled = { name: name, module: m }; return compiled; }, function (e) {
      throw new Error('PcodecJS could not start its WebAssembly program (the page may need the policy word wasm-unsafe-eval): ' + (e && e.message));
    });
  }
  function make(c) {
    var inst = null;
    function ex() { if (!inst) inst = new WebAssembly.Instance(c.module, {}).exports; return inst; }
    function fail(code) { throw new Error('PcodecJS: ' + (ERRORS[code] || 'error ' + code)); }
    function run(fn) {                                                   // a trap leaves the program in an unknown state, so drop it and start a new one next time
      try { return fn(ex()); } catch (e) { if (e instanceof WebAssembly.RuntimeError) { inst = null; throw new Error('PcodecJS: the data is damaged'); } throw e; }
    }
    function toBytes(src) {
      if (src instanceof Uint8Array) return src;
      if (src instanceof ArrayBuffer) return new Uint8Array(src);
      if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
      throw new TypeError('PcodecJS: expected bytes (a Uint8Array or an ArrayBuffer)');
    }
    function putIn(x, bytes) { var p = x.alloc(bytes.length); new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes); return p; }
    var held = null;                                                     // the last { view: true } result, released on the next call
    function drop() { if (held && inst) { inst.release(held[0], held[1]); } held = null; }
    function peek(x, p, len) {
      var q = x.alloc(8), kind, n; kind = x.peek(p, len, q); n = new Uint32Array(x.memory.buffer, q, 1)[0]; x.release(q, 8);
      if (kind < 0) fail(kind);
      return { kind: kind, count: n };
    }
    var api = {
      engine: 'pco 1.0.4 (WebAssembly, ' + c.name + ')',
      programBytes: PROGRAMS[c.name].length * 3 / 4 | 0,
      canPack: HAS_PACK,
      // What a file holds, read from its first bytes: { type: 'f64', count: 100000 }. The count comes from the file and is only a hint until unpack checks it.
      info: function (src) {
        var b = toBytes(src);
        return run(function (x) { drop(); var p = putIn(x, b), r; try { r = peek(x, p, b.length); } finally { x.release(p, b.length); } return { type: KIND_NAME[r.kind] || null, count: r.count }; });
      },
      // Exactly `count` numbers (default: the count the file announces, at most opts.maxCount, default 33,554,432). Returns a typed array of the file's type.
      // opts.view: true skips the last copy and returns a view into the program's memory, valid only until the next call on this object.
      // opts.into: an array of the file's type to fill instead of making a new one (returns it, or its first `count` numbers).
      unpack: function (src, opts) {
        opts = opts || {};
        var b = toBytes(src);
        return run(function (x) {
          drop();
          var p = putIn(x, b), d = 0, w, T, type, kind, n, r, out;
          try {
            var pk = peek(x, p, b.length); kind = pk.kind; type = KIND_NAME[kind];
            if (!type || !TYPES[type][1]) fail(-1);
            n = opts.count !== undefined ? opts.count : pk.count;
            if (!(n > 0) || n !== Math.floor(n) || n > (opts.maxCount || MAX_COUNT)) throw new Error('PcodecJS: bad count ' + n + (opts.count === undefined ? ' announced by the file (pass { count } or a larger { maxCount })' : ''));
            T = TYPES[type][1]; w = T.BYTES_PER_ELEMENT;
            d = x.alloc(n * w);
            if (!d) throw new Error('PcodecJS: out of memory');
            r = x.decompress(kind, p, b.length, d, n);
            if (r < 0) fail(r);
            if (opts.view) { held = [d, n * w]; d = 0; return new T(x.memory.buffer, held[0], n); }
            if (opts.into) {                                           // fill an array you already have (no new array to make and collect)
              if (!(opts.into instanceof T) || opts.into.length < n) throw new TypeError('PcodecJS: { into } must be a ' + T.name + ' of at least ' + n + ' numbers');
              opts.into.set(new T(x.memory.buffer, d, n)); return opts.into.length === n ? opts.into : opts.into.subarray(0, n);
            }
            out = new T(x.memory.buffer, d, n).slice();
          } finally { x.release(p, b.length); if (d) x.release(d, n * w); }
          return out;
        });
      },
      // Unpacks a few thousand numbers at a time. Each step is a view into the program's memory, valid until the next step; copy it with .slice() to keep it.
      // opts.batch is the largest step in numbers (a multiple of 256, default 4096).
      stream: function (src, opts) {
        opts = opts || {};
        var b = toBytes(src), batch = opts.batch || 4096;
        if (batch % 256 !== 0 || batch <= 0) throw new Error('PcodecJS: batch must be a multiple of 256');
        var x0 = ex(); drop();
        var copy = new Uint8Array(b); var p = putIn(x0, copy), pk, T, h, d = 0, w, self = this, done = false;
        try { pk = peek(x0, p, b.length); var type = KIND_NAME[pk.kind]; if (!type || !TYPES[type][1]) fail(-1); T = TYPES[type][1]; w = T.BYTES_PER_ELEMENT; h = x0.stream_open(pk.kind, p, b.length); if (h < 0) fail(h); d = x0.alloc(batch * w); if (!d) throw new Error('PcodecJS: out of memory'); }
        catch (e) { x0.release(p, b.length); throw e; }
        function close() { if (done) return; done = true; if (inst) { inst.stream_close(h); inst.release(d, batch * w); inst.release(p, b.length); } }
        var it = {
          type: KIND_NAME[pk.kind], countHint: pk.count,
          next: function () {
            if (done) return { done: true, value: undefined };
            var r;
            try { r = run(function (x) { return x.stream_read(h, d, batch); }); } catch (e) { done = true; throw e; }
            if (r < 0) { close(); fail(r); }
            if (r === 0) { close(); return { done: true, value: undefined }; }
            return { done: false, value: new T(inst.memory.buffer, d, r) };
          },
          return: function () { close(); return { done: true, value: undefined }; },
        };
        it[typeof Symbol === 'function' && Symbol.iterator ? Symbol.iterator : '@@iterator'] = function () { return it; };
        return it;
      },
      // Runs the program on three tiny built-in files for about `ms` milliseconds (default 15), in slices of about 3 ms so the page stays responsive, and returns a promise for when it ends.
      // Browsers start WebAssembly with a slow first version of each function and switch to the fast one only after it has run a while; the first unpack of a page is the slow one.
      // Call it while the page waits for its data. Measured: the first 100,000-number unpack takes 8 ms in Chromium and 11 ms in WebKitGTK cold, and 3.5 ms and 7 ms after a warm-up; Firefox is not helped.
      warm: function (ms) {
        var end = Date.now() + (ms === undefined ? 15 : ms), items = WARM.map(function (w) { return { kind: w[0], n: w[1], bytes: b64(w[2]) }; });
        function step() {
          var stop = Date.now() + 3, i, it, x, p, d, w;
          do {
            for (i = 0; i < items.length; i++) {
              it = items[i]; x = ex(); p = putIn(x, it.bytes); w = TYPES[KIND_NAME[it.kind]][1].BYTES_PER_ELEMENT; d = x.alloc(it.n * w);
              try { x.decompress(it.kind, p, it.bytes.length, d, it.n); } finally { x.release(p, it.bytes.length); x.release(d, it.n * w); }
            }
          } while (Date.now() < stop);
          if (Date.now() >= end) return Promise.resolve();
          return new Promise(function (r) { setTimeout(r, 0); }).then(step);
        }
        return new Promise(function (r) { setTimeout(r, 0); }).then(step);
      },
      // How many bytes of memory the program holds right now.
      memoryBytes: function () { return inst ? inst.memory.buffer.byteLength : 0; },
      // Frees the program's memory; the next call starts a new one.
      release: function () { inst = null; held = null; },
    };
    @PACK_API@
    return api;
  }
  var cache = {};
  // load() gives the ready object. load({ program: 'plain' }) forces the program that needs no SIMD instead of the SIMD one when both are in the file. load({ warm: true }) also starts the warm-up (see api.warm).
  function load(opts) {
    var w = (opts && opts.program) || '', warm = opts && opts.warm;
    var p = cache[w] || (cache[w] = compileAsync(w).then(make));
    if (warm) p.then(function (pc) { pc.warm(typeof warm === 'number' ? warm : undefined).catch(function () {}); });
    return p;
  }
  return { version: '@VERSION@', load: load, types: Object.keys(TYPES).filter(function (k) { return TYPES[k][1]; }) };
});
