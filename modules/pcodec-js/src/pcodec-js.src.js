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
 * The programs are stored deflated (then base64) and opened with the browser's built-in DecompressionStream before they are compiled; load() rejects with a clear message where that is missing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PcodecJS = factory();
})(typeof self !== 'undefined' ? self : this, function pcodecFactory() {
  'use strict';
  var PROGRAMS = @PROGRAMS@;                                         // { name: base64 of the deflate-raw packed program }; "fast" (SIMD) and "plain" read, "pack" read and write; the text is dropped once the program is compiled
  var TYPES = { u32: [1, Uint32Array], u64: [2, typeof BigUint64Array === 'function' ? BigUint64Array : null], i32: [3, Int32Array], i64: [4, typeof BigInt64Array === 'function' ? BigInt64Array : null], f32: [5, Float32Array], f64: [6, Float64Array], u16: [7, Uint16Array], i16: [8, Int16Array] };
  var KIND_NAME = { 1: 'u32', 2: 'u64', 3: 'i32', 4: 'i64', 5: 'f32', 6: 'f64', 7: 'u16', 8: 'i16' };
  var ERRORS = { '-1': 'this number type is not in this build', '-2': 'the data is damaged or cut short', '-3': 'the file holds a different count of numbers than asked', '-4': 'bad argument' };
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var WARM = @WARM@;                                                  // three tiny Pcodec files [kind, count, base64] that the warm-up unpacks in a loop
  var HAS_PACK = has('pack'), MAX_COUNT = 1 << 25, LEAN_MIN = 262144, LEAN_BATCH = 65536;   // unpack() of LEAN_MIN numbers or more decodes LEAN_BATCH numbers at a time straight into the result (see unpack)
  function has(k) { return Object.prototype.hasOwnProperty.call(PROGRAMS, k); }
  function now() { return typeof performance === 'object' && performance.now ? performance.now() : Date.now(); }
  function yieldNow() {                                                // gives the page a turn (a message, not a timer, so there is no 4 ms wait)
    return new Promise(function (r) {
      if (typeof MessageChannel === 'function') { var c = new MessageChannel(); c.port1.onmessage = function () { c.port1.close(); r(); }; c.port2.postMessage(0); } else setTimeout(r, 0);
    });
  }
  function b64(s) {
    var i, n, u;
    if (typeof atob === 'function') { s = atob(s); n = s.length; u = new Uint8Array(n); for (i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  function inflate(text) {                                             // base64 of a deflate-raw stream in, a promise for the bytes out (the browser's own decoder, off the page's main thread)
    if (typeof DecompressionStream !== 'function' || typeof Response !== 'function') return Promise.reject(new Error('PcodecJS needs DecompressionStream (built into current browsers and Node 18 and later) to open its packed WebAssembly program'));
    try { return new Response(new Response(b64(text)).body.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer(); } catch (e) { return Promise.reject(e); }
  }
  function typeOf(a) {
    for (var k in TYPES) if (TYPES[k][1] && a instanceof TYPES[k][1]) return k;
    return null;
  }
  // ---- split files: several ordinary Pcodec files (the parts) behind a small header, so a big column can be unpacked on several workers ----
  // bytes 0-3 "PCJM", 4 version (1), 5 zero, 6-9 count of all numbers (u32, little-endian), 10-11 number of parts (u16), then one u32 length per part, then the parts one after the other.
  function isSplit(b) { return b.length >= 12 && b[0] === 80 && b[1] === 67 && b[2] === 74 && b[3] === 77; }
  function u32at(b, i) { return (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0; }
  function parseSplit(b) {
    var np, off, parts = [], i, len;
    if (b[4] !== 1) throw new Error('PcodecJS: this split file has a version this build does not know');
    np = b[10] | b[11] << 8; off = 12 + 4 * np;
    if (!np || b.length < off) throw new Error('PcodecJS: ' + ERRORS['-2']);
    for (i = 0; i < np; i++) {
      len = u32at(b, 12 + 4 * i);
      if (!len || len > b.length - off) throw new Error('PcodecJS: ' + ERRORS['-2']);
      parts.push(b.subarray(off, off + len)); off += len;
    }
    if (off !== b.length) throw new Error('PcodecJS: ' + ERRORS['-2']);
    return { total: u32at(b, 6), parts: parts };
  }
  function buildSplit(total, files) {
    var len = 12 + 4 * files.length, i, q, out;
    for (i = 0; i < files.length; i++) len += files[i].length;
    out = new Uint8Array(len); out.set([80, 67, 74, 77, 1, 0, total & 255, total >>> 8 & 255, total >>> 16 & 255, total >>> 24 & 255, files.length & 255, files.length >>> 8], 0);
    q = 12 + 4 * files.length;
    for (i = 0; i < files.length; i++) { out[12 + 4 * i] = files[i].length & 255; out[13 + 4 * i] = files[i].length >>> 8 & 255; out[14 + 4 * i] = files[i].length >>> 16 & 255; out[15 + 4 * i] = files[i].length >>> 24 & 255; out.set(files[i], q); q += files[i].length; }
    return out;
  }
  function pick(want) {                                                 // the program this engine should run (want: 'fast' or 'plain' to force one)
    if (HAS_PACK) return 'pack';
    if (want && has(want)) return want;
    if (has('fast') && WebAssembly.validate(SIMD_PROBE)) return 'fast';
    if (has('plain')) return 'plain';
    throw new Error('PcodecJS: this file needs WebAssembly SIMD, which this browser does not have; use pcodec-js.js instead');
  }
  var compiled = {};                                                    // name -> promise for { name, module, size }: a program is opened and compiled once, then its text is dropped
  function compileAsync(want) {
    if (typeof WebAssembly !== 'object') return Promise.reject(new Error('PcodecJS needs WebAssembly, which this page does not have'));
    var name; try { name = pick(want); } catch (e) { return Promise.reject(e); }
    if (compiled[name]) return compiled[name];
    if (!PROGRAMS[name]) return Promise.reject(new Error('PcodecJS: this copy of the program is empty (a worker gets the compiled program handed over)'));
    return (compiled[name] = inflate(PROGRAMS[name]).then(function (bytes) {
      PROGRAMS[name] = '';                                              // the text is not needed any more
      return WebAssembly.compile(bytes).then(function (m) { return { name: name, module: m, size: bytes.byteLength }; }, function (e) {
        throw new Error('PcodecJS could not start its WebAssembly program (the page may need the policy word wasm-unsafe-eval): ' + (e && e.message));
      });
    }));
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
    function lean(x, p, len, kind, T, n) {                               // the stream route into a new array: same numbers as decompress, a few MB of program memory instead of the whole result
      var h = x.stream_open(kind, p, len), w = T.BYTES_PER_ELEMENT, d = 0, out, pos = 0, r;
      if (h < 0) fail(h);
      try {
        d = x.alloc(LEAN_BATCH * w);
        if (!d) throw new Error('PcodecJS: out of memory');
        out = new T(n);
        for (;;) {
          r = x.stream_read(h, d, LEAN_BATCH);
          if (r < 0) fail(r);
          if (r === 0) break;
          if (pos + r > n) fail(-3);
          out.set(new T(x.memory.buffer, d, r), pos); pos += r;
        }
        if (pos !== n) fail(-3);
      } finally {
        try { x.stream_close(h); if (d) x.release(d, LEAN_BATCH * w); } catch (e) { /* the program stopped; run() starts a new one */ }
      }
      return out;
    }
    var held = null;                                                     // the last { view: true } result, released on the next call
    function drop() { if (held && inst) { inst.release(held[0], held[1]); } held = null; }
    function peek(x, p, len) {
      var q = x.alloc(8), kind, n; kind = x.peek(p, len, q); n = new Uint32Array(x.memory.buffer, q, 1)[0]; x.release(q, 8);
      if (kind < 0) fail(kind);
      return { kind: kind, count: n };
    }
    var api = {
      engine: 'pco 1.0.4 (WebAssembly, ' + c.name + ')',
      programName: c.name, programModule: c.module,                      // the compiled program, to hand to a worker of your own (a WebAssembly.Module can be posted to a worker without compiling again)
      programBytes: c.size || 0,                                          // the program's size once opened (0 when it was handed over compiled)
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
            if (!opts.view && !opts.into && n >= LEAN_MIN) return lean(x, p, b.length, kind, T, n);   // big copy: decode in batches into the result, so the program never holds all the numbers
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
      // Like unpack, but hands the page a turn every opts.sliceMs (default 2) milliseconds; measured in the four test browsers the page is never frozen longer than about 5 to 6 ms at that setting (3 ms and up can reach 8 ms in WebKitGTK and GNOME Web).
      // Returns a promise for the typed array. Do not call release() or start a view unpack on this object while it runs.
      unpackAsync: function (src, opts) {
        opts = opts || {};
        var self = this, sliceMs = opts.sliceMs === undefined ? 2 : opts.sliceMs, it, T, n, out, pos = 0;
        return Promise.resolve().then(function () {
          it = self.stream(src, { batch: 4096 });
          n = opts.count !== undefined ? opts.count : it.countHint;
          if (!(n > 0) || n !== Math.floor(n) || n > (opts.maxCount || MAX_COUNT)) { it.return(); throw new Error('PcodecJS: bad count ' + n + (opts.count === undefined ? ' announced by the file (pass { count } or { maxCount } if you trust it)' : '')); }
          T = TYPES[it.type][1];
          if (opts.into) { if (!(opts.into instanceof T) || opts.into.length < n) { it.return(); throw new TypeError('PcodecJS: { into } must be a ' + T.name + ' of at least ' + n + ' numbers'); } out = opts.into; } else out = new T(n);
          return yieldNow().then(step);
        });
        function step() {
          var t0 = now(), r;
          for (;;) {
            r = it.next();
            if (r.done) break;
            if (pos + r.value.length > n) { it.return(); throw new Error('PcodecJS: ' + ERRORS['-3']); }
            out.set(r.value, pos); pos += r.value.length;
            if (now() - t0 >= sliceMs) return yieldNow().then(step);
          }
          if (pos !== n) throw new Error('PcodecJS: ' + ERRORS['-3']);
          return opts.into && out.length !== n ? out.subarray(0, n) : out;
        }
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
    // split files: the same calls work on them, one part after the other
    var infoPlain = api.info, unpackPlain = api.unpack, streamPlain = api.stream;
    function splitParts(c) {                                             // each part's type and count, checked against the header
      var i, r, type = null, counts = [], sum = 0;
      for (i = 0; i < c.parts.length; i++) {
        r = infoPlain(c.parts[i]);
        if (!r.type || (type && r.type !== type)) throw new Error('PcodecJS: ' + ERRORS['-2']);
        type = r.type; counts.push(r.count); sum += r.count;
      }
      if (sum !== c.total) throw new Error('PcodecJS: ' + ERRORS['-2']);
      return { type: type, counts: counts };
    }
    api.info = function (src) {
      var b = toBytes(src), c, p;
      if (!isSplit(b)) return infoPlain(src);
      c = parseSplit(b); p = splitParts(c);
      return { type: p.type, count: c.total, parts: c.parts.length };
    };
    api.unpack = function (src, opts) {
      var b = toBytes(src), c, p, T, n, out, i, off = 0;
      if (!isSplit(b)) return unpackPlain(src, opts);
      opts = opts || {};
      if (opts.view) throw new Error('PcodecJS: { view } does not work on a split file');
      c = parseSplit(b); p = splitParts(c); T = TYPES[p.type][1];
      if (!T) fail(-1);
      n = c.total;
      if (opts.count !== undefined && opts.count !== n) fail(-3);
      if (!(n > 0) || n > (opts.maxCount || MAX_COUNT)) throw new Error('PcodecJS: bad count ' + n + ' announced by the file (pass { maxCount } if you trust it)');
      if (opts.into) { if (!(opts.into instanceof T) || opts.into.length < n) throw new TypeError('PcodecJS: { into } must be a ' + T.name + ' of at least ' + n + ' numbers'); out = opts.into; } else out = new T(n);
      for (i = 0; i < c.parts.length; i++) { unpackPlain(c.parts[i], { count: p.counts[i], into: out.subarray(off, off + p.counts[i]) }); off += p.counts[i]; }
      return opts.into && out.length !== n ? out.subarray(0, n) : out;
    };
    api.stream = function (src, opts) {
      var b = toBytes(src), c, p, i = 0, cur = null, first, done = false, emitted = 0, it;
      if (!isSplit(b)) return streamPlain.call(api, src, opts);
      c = parseSplit(b); p = splitParts(c);
      first = streamPlain.call(api, c.parts[0], opts);
      function close() { done = true; if (cur) { cur.return(); cur = null; } }
      it = {
        type: first.type, countHint: c.total,
        next: function () {
          var r;
          if (done) return { done: true, value: undefined };
          for (;;) {
            if (!cur) {
              if (i >= c.parts.length) { done = true; if (emitted !== c.total) fail(-3); return { done: true, value: undefined }; }
              cur = i === 0 ? first : streamPlain.call(api, c.parts[i], opts); i++;
            }
            try { r = cur.next(); } catch (e) { cur = null; done = true; throw e; }
            if (!r.done) { emitted += r.value.length; return r; }
            cur = null;
          }
        },
        return: function () { close(); if (i === 0) first.return(); return { done: true, value: undefined }; },
      };
      it[typeof Symbol === 'function' && Symbol.iterator ? Symbol.iterator : '@@iterator'] = function () { return it; };
      return it;
    };
    @PACK_API@
    return api;
  }
  var cache = {};
  function start(w) { return cache[w] || (cache[w] = compileAsync(w).then(make)); }
  try { start('').catch(function () { /* load() will report it */ }); } catch (e) { /* load() will report it */ }   // compile early: the program starts compiling the moment this file runs, off the page's main thread, while the page does its other start-up work
  // load() gives the ready object. load({ program: 'plain' }) forces the program that needs no SIMD instead of the SIMD one when both are in the file. load({ warm: true }) also starts the warm-up (see api.warm).
  function load(opts) {
    var w = (opts && opts.program) || '', warm = opts && opts.warm, p;
    if (opts && opts.module) p = Promise.resolve({ name: opts.name || pick(w), module: opts.module }).then(make);   // already compiled (handed over by the page): nothing to compile here
    else p = start(w);
    if (warm) p.then(function (pc) { pc.warm(typeof warm === 'number' ? warm : undefined).catch(function () {}); });
    return p;
  }
  // The same calls, but run in a background worker so even a big pack() or unpack() never blocks the page.
  //   PcodecJS.worker().then(function (w) { return w.unpack(bytes); })       // promises for: info(bytes), unpack(bytes), pack(array, { level, smallest })
  // Add { transfer: true } to a call to hand your input array over without a copy (it is empty afterwards). w.terminate() ends the worker.
  // The page needs `worker-src blob:` in its policy. If the browser will not start a worker, the same object is returned running on the page (w.inWorker is false):
  // unpack then runs in slices of about 2 ms (unpackAsync), pack runs in one piece.
  function joinParts(parts, into) {                                      // typed arrays of one kind in, one typed array out (into: an array to fill instead of a new one)
    var n = 0, q = 0, i, out;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    out = into || new parts[0].constructor(n);
    for (i = 0; i < parts.length; i++) { out.set(parts[i], q); q += parts[i].length; }
    return out.length === n ? out : out.subarray(0, n);
  }
  function workerMain(factory) {                                       // this function's text runs inside the worker
    var pc = null, ready = null;
    self.onmessage = function (e) {
      var m = e.data;
      function reply(ok, value, tr) { self.postMessage({ id: m.id, ok: ok, value: ok ? value : undefined, error: ok ? undefined : String(value && value.message || value) }, tr || []); }
      if (m.op === 'init') { ready = factory().load({ program: m.opts.program, module: m.module, name: m.name }).then(function (x) { pc = x; reply(true, { engine: x.engine, canPack: x.canPack}); }, function (err) { reply(false, err); }); return; }
      ready.then(function () {
        var v;
        try {
          if (m.op === 'info') v = pc.info(m.a);
          else if (m.op === 'unpack') v = pc.unpack(m.a, m.o);
          else if (m.op === 'pack') v = pc.pack(m.a, m.o);
          else if (m.op === 'packPart') v = pc.packPart(m.a, m.o);
          else if (m.op === 'many') v = m.a.map(function (x) { return m.what === 'pack' ? pc.pack(x, m.o) : pc.unpack(x, m.o); });
          else if (m.op === 'join') { var jn = 0, jq = 0, ji; for (ji = 0; ji < m.a.length; ji++) jn += m.a[ji].length; v = m.o && m.o.into; if (v && (v.constructor !== m.a[0].constructor || v.length < jn)) throw new TypeError('PcodecJS: { into } does not fit'); v = v || new m.a[0].constructor(jn); for (ji = 0; ji < m.a.length; ji++) { v.set(m.a[ji], jq); jq += m.a[ji].length; } if (v.length !== jn) v = v.subarray(0, jn); }
          else throw new Error('unknown call');
          reply(true, v, Array.isArray(v) ? v.map(function (x) { return x.buffer; }) : v.buffer ? [v.buffer] : []);
        } catch (err) { reply(false, err); }
      });
    };
  }
  function worker(opts) {
    opts = opts || {};
    var lo = { program: opts.program };
    function onPage() {
      return load(lo).then(function (pc) {
        function p(f) { return new Promise(function (res) { res(f()); }); }
        return { inWorker: false, engine: pc.engine, canPack: pc.canPack,
          info: function (b) { return p(function () { return pc.info(b); }); },
          unpack: function (b, o) { return pc.unpackAsync(b, o); },
          pack: function (a, o) { return p(function () { return pc.pack(a, o); }); },
          packPart: function (a, o) { return p(function () { return pc.packPart(a, o); }); },
          join: function (parts, into) { return p(function () { return joinParts(parts, into); }); },
          many: function (what, list, o) { return p(function () { return list.map(function (x) { return what === 'pack' ? pc.pack(x, o) : pc.unpack(x, o); }); }); },
          terminate: function () {} };
      });
    }
    return new Promise(function (resolve, reject) {
      var w, url, pending = {}, seq = 0, up = false;
      try {
        if (typeof Worker !== 'function' || typeof Blob !== 'function' || !URL || !URL.createObjectURL) throw new Error('no worker');
        var stub = {}, k, text = pcodecFactory.toString();
        for (k in PROGRAMS) stub[k] = '';                              // the worker is handed the compiled program, so it does not need the program's text (nothing is opened twice): a small Blob starts faster
        text = text.replace(/var PROGRAMS = \{[^;]*\};/, function () { return 'var PROGRAMS = ' + JSON.stringify(stub) + ';'; });
        url = URL.createObjectURL(new Blob(['(' + workerMain.toString() + ')(' + text + ');'], { type: 'text/javascript' }));
        w = new Worker(url);
      } catch (e) { return onPage().then(resolve, reject); }
      function call(op, a, o, tr, extra) {
        return new Promise(function (res, rej) {
          var id = ++seq, msg = op === 'init' ? { id: id, op: op, opts: a } : { id: id, op: op, a: a, o: o }, k;
          pending[id] = [res, rej]; if (extra) for (k in extra) msg[k] = extra[k];
          w.postMessage(msg, tr || []);
        });
      }
      function giveUp() { var k; for (k in pending) pending[k][1](new Error('PcodecJS: the worker stopped')); pending = {}; }
      w.onmessage = function (e) { var m = e.data, h = pending[m.id]; if (!h) return; delete pending[m.id]; if (m.ok) h[0](m.value); else h[1](new Error(m.error)); };
      w.onerror = function () { try { w.terminate(); } catch (e) { /* gone */ } URL.revokeObjectURL(url); if (!up) { up = true; onPage().then(resolve, reject); } else giveUp(); };
      load(lo).then(function (pc) { return call('init', lo, undefined, [], { module: pc.programModule, name: pc.programName }); }).then(function (info) {
        if (up) return; up = true; URL.revokeObjectURL(url);
        function tr(x, o) { var t = o && o.transfer ? [x.buffer] : []; if (o && o.into && o.into.buffer) t.push(o.into.buffer); return t; }   // { into } hands the array's memory to the worker and comes back as the result
        resolve({ inWorker: true, engine: info.engine, canPack: info.canPack,
          info: function (b, o) { return call('info', b, undefined, tr(b, o)); },
          unpack: function (b, o) { return call('unpack', b, o, tr(b, o)); },
          pack: function (a, o) { return call('pack', a, o, tr(a, o)); },
          packPart: function (a, o) { return call('packPart', a, o, tr(a, o)); },
          many: function (what, list, o) { return call('many', list, o, [], { what: what }); },   // a whole group of files in one message each way
          join: function (parts, into) { return call('join', parts, into ? { into: into } : undefined, parts.map(function (x) { return x.buffer; }).concat(into ? [into.buffer] : [])); },
          terminate: function () { try { w.terminate(); } catch (e) { /* gone */ } giveUp(); } });
      }, function (err) { if (up) return; up = true; try { w.terminate(); } catch (e) { /* gone */ } URL.revokeObjectURL(url); onPage().then(resolve, function () { reject(err); }); });
    });
  }

  // Several background workers that share a job out, so a big job takes less time on a phone or laptop with several cores.
  //   PcodecJS.pool().then(function (p) { return p.pack([colA, colB, colC]); })       // an array of arrays in, an array of Pcodec files out (same order); one big array in, one file out
  //   p.unpack([fileA, fileB, fileC])                                                  // an array of files in, an array of typed arrays out; one file in, one array out (a normal file stays on one worker; a split file is shared out)
  //   p.unpack(file, { into: myArray })                                                // fills your array (its memory goes to a worker and comes back as the result; myArray itself is empty afterwards), so a big result needs no new 64 MB to collect
  //   p.unpack(splitFile, { parts: true })                                             // the parts as an array of typed arrays, in order, without copying them into one array
  //   p.pack(oneBigArray, { parts: true })                                             // a split file: ordinary Pcodec files for the column's pages behind a small header, packed on several workers and unpackable on several workers
  // Workers start the first time they are needed and a small job stays on one worker, because starting one costs about 10 to 25 ms: a job is shared out only when each worker would get about 25 ms of work (opts.laneMs, 0 shares it out always).
  // opts.warm: true (or a number) starts that many workers when the pool is made instead of at the first job, so the first big job does not wait 8 to 19 ms for them.
  // opts.size is the most workers (default: the cores the device reports less one, at most 4). One big array is cut into the pages Pcodec itself would use and the pieces join into exactly the bytes pack() writes; { smallest: true } packs it on one worker.
  // opts.idleMs (default 4000, 0 turns it off): when no job has run for that long the pool ends its workers, which gives their memory back (a worker that has opened a 4,000,000-number file holds 17 to 52 MB), and starts them again at the next job (the first costs about 8 to 29 ms, the rest 2 to 5 ms).
  // Needs the "pack" file for pack. Without Worker support the pool runs on the page one job after another (see worker()). p.terminate() ends all workers; p.workers() says how many are running now.
  var PACK_NS = 60, UNPACK_NS = 20;                                    // about how long one number takes to pack and to unpack, measured in the four test browsers
  function pageSizes(n) {                                              // the equal pages of at most 262,144 numbers Pcodec cuts a column into
    var np = Math.ceil(n / 262144), lo = Math.floor(n / np), r = n % np, out = [], i;
    for (i = 0; i < np; i++) out.push(i < r ? lo + 1 : lo);
    return out;
  }
  function pool(opts) {
    opts = opts || {};
    var hc = typeof navigator === 'object' && navigator && navigator.hardwareConcurrency || 4, lo = { program: opts.program },
      size = Math.max(1, Math.min(8, Math.floor(opts.size || Math.min(4, hc - 1)))), laneMs = opts.laneMs === undefined ? 25 : opts.laneMs, lanes = [], main = null, ended = false,
      idleMs = opts.idleMs === undefined ? 4000 : Math.max(0, +opts.idleMs || 0), busy = 0, timer = null;
    var started = 0;                                                   // workers started so far in this turn of the page
    function turns(n) { var q = Promise.resolve(), i; for (i = 0; i < n; i++) q = q.then(yieldNow); return q; }
    function lane(k) {
      if (!lanes[k]) {
        var wait = started++;                                          // the second, third ... worker started in one turn each wait one more turn, so starting 4 workers is never one long page task (about 2.5 ms each in Chromium, 10 ms together)
        if (!wait) Promise.resolve().then(function () { started = 0; });
        lanes[k] = wait ? turns(wait).then(function () { return worker(lo); }) : worker(lo); arm();
      }
      return lanes[k];
    }
    function disarm() { if (timer) { clearTimeout(timer); timer = null; } }
    function arm() {                                                   // the idle clock: counts from the last moment the pool was busy
      disarm();
      if (idleMs > 0 && !ended && !busy && lanes.length) { timer = setTimeout(park, idleMs); if (timer && typeof timer.unref === 'function') timer.unref(); }
    }
    function endLanes(spread) {                                         // spread: one worker per turn of the page (ending a worker is a page task of about 2 ms in Firefox)
      var old = lanes; lanes = [];
      old.forEach(function (p, i) { (spread && i ? turns(i) : Promise.resolve()).then(function () { return p; }).then(function (w) { w.terminate(); }, function () {}); });
    }
    function park() { timer = null; if (!busy && !ended) endLanes(true); }  // idle long enough: end the workers; lane() starts new ones at the next job
    function track(pr) { busy++; disarm(); function done() { busy--; arm(); } pr.then(done, done); return pr; }
    function lanesFor(count, ms) { return Math.max(1, Math.min(size, count, laneMs > 0 ? Math.floor(ms / laneMs) : size)); }
    function split(weights, k) {                                       // largest first, each to the least loaded worker: lists of positions
      var order = weights.map(function (_, i) { return i; }).sort(function (a, b) { return weights[b] - weights[a]; }), groups = [], load = [], i;
      for (i = 0; i < k; i++) { groups.push([]); load.push(0); }
      order.forEach(function (at) { var m = 0, j; for (j = 1; j < k; j++) if (load[j] < load[m]) m = j; groups[m].push(at); load[m] += weights[at]; });
      return groups;
    }
    function share(list, weights, ns, one, what, o) {
      var total = 0, out = new Array(list.length);
      if (!list.length) return Promise.resolve(out);
      weights.forEach(function (w) { total += w; });
      return Promise.all(split(weights, lanesFor(list.length, total * ns / 1e6)).map(function (g, k) {
        return lane(k).then(function (w) {
          if (what === 'unpack' && g.length > 1 && w.many) return w.many(what, g.map(function (at) { return list[at]; }), o).then(function (vs) { g.forEach(function (at, j) { out[at] = vs[j]; }); });
          return Promise.all(g.map(function (at) { return one(w, list[at]).then(function (v) { out[at] = v; }); }));
        });
      })).then(function () { return out; });
    }
    function packOne(x, o) {
      var n = x && ArrayBuffer.isView(x) ? x.length : 0, pages, k, G, parts = !!(o && o.parts), groups = [], g, from, to, at = 0, sent = [], chain = Promise.resolve(), want;
      if (!(n > 0) || (o && o.smallest)) return lane(0).then(function (w) { return w.pack(x, o); });
      pages = pageSizes(n); k = Math.min(lanesFor(pages.length, n * PACK_NS / 1e6), pages.length);
      if (parts) { want = o.parts === true ? 8 : Math.floor(o.parts); if (!(want >= 1)) return Promise.reject(new RangeError('PcodecJS: parts is a number from 1 up, or true')); G = Math.min(want, pages.length, 65535); if (G < 2) return lane(0).then(function (w) { return w.pack(x, { level: o.level }); }); k = Math.min(k, G); }
      else { if (k < 2) return lane(0).then(function (w) { return w.pack(x, o); }); G = k; }
      for (g = 0; g < G; g++) {                                        // G stretches of whole pages
        from = Math.floor(g * pages.length / G); to = Math.floor((g + 1) * pages.length / G);
        groups.push({ sizes: pages.slice(from, to), first: parts || g === 0, last: parts || g === G - 1 });
      }
      groups.forEach(function (p, g) {                                 // one stretch per turn of the page, so copying the array never freezes it for long
        chain = chain.then(function () {
          var cnt = 0, part;
          p.sizes.forEach(function (s) { cnt += s; });
          part = x.slice(at, at + cnt); at += cnt;                     // a copy of just this stretch (handed over, so it is not copied again)
          sent.push(lane(g % k).then(function (w) { return w.packPart(part, { sizes: p.sizes, total: parts ? cnt : n, level: o && o.level, first: p.first, last: p.last, transfer: true }); }));
          return g < groups.length - 1 ? yieldNow() : undefined;
        });
      });
      return chain.then(function () { return Promise.all(sent); }).then(function (outs) {
        var len = 0, out, q = 0, i;
        if (parts) return buildSplit(n, outs);
        outs.forEach(function (b) { len += b.length; }); out = new Uint8Array(len);
        for (i = 0; i < outs.length; i++) { out.set(outs[i], q); q += outs[i].length; }
        return out;
      });
    }
    function unpackSplit(b, o) {                                       // the parts of one split file share out over the workers
      var c = parseSplit(b), counts = [], total = 0, i, info, type = null, out, k;
      for (i = 0; i < c.parts.length; i++) {
        info = main.info(c.parts[i]);
        if (!info.type || (type && info.type !== type)) return Promise.reject(new Error('PcodecJS: ' + ERRORS['-2']));
        type = info.type; counts.push(info.count); total += info.count;
      }
      if (total !== c.total || !TYPES[type][1]) return Promise.reject(new Error('PcodecJS: ' + ERRORS['-2']));
      if (!(total > 0) || total > ((o && o.maxCount) || MAX_COUNT)) return Promise.reject(new Error('PcodecJS: bad count ' + total + ' announced by the file (pass { maxCount } if you trust it)'));
      if (o && o.into && (o.parts || !(o.into instanceof TYPES[type][1]) || o.into.length < total)) return Promise.reject(new TypeError('PcodecJS: { into } must be a ' + TYPES[type][1].name + ' of at least ' + total + ' numbers'));
      k = lanesFor(c.parts.length, total * UNPACK_NS / 1e6);
      if (k === 1 && !(o && o.parts)) return lane(0).then(function (w) { return w.unpack(b, o); });   // too small to share out: the one worker opens the whole file in one go
      out = new Array(counts.length);                                  // { parts: true } hands back the parts as they are
      return Promise.all(split(counts, k).map(function (g, gi) {
        return lane(gi).then(function (w) { return Promise.all(g.map(function (at) { return w.unpack(c.parts[at].slice(), { count: counts[at], transfer: true }).then(function (v) { out[at] = v; }); })); });
      })).then(function () {
        if (o && o.parts) return out;
        return lane(0).then(function (w) { return w.join(out, o && o.into); });   // the first worker joins the parts, so the page never stops to copy a big array
      });
    }
    function count(b) { try { return main.info(b).count; } catch (e) { return b && b.length || 1; } }
    return load(lo).then(function (pc) {
      main = pc;
      if (opts.warm) { var wn = opts.warm === true ? size : Math.min(size, Math.floor(opts.warm)), wi; for (wi = 0; wi < wn; wi++) lane(wi).then(null, function () {}); }   // start the workers now, off the critical path
      return {
        size: size,
        pack: function (x, o) {
          if (ended) return Promise.reject(new Error('PcodecJS: the pool has ended'));
          if (!pc.canPack) return Promise.reject(new Error('PcodecJS: pack needs pcodec-js-pack.js'));
          return track(Array.isArray(x) ? share(x, x.map(function (a) { return a && a.length || 1; }), PACK_NS, function (w, a) { return w.pack(a, o); }, 'pack', o) : packOne(x, o));
        },
        unpack: function (x, o) {
          if (ended) return Promise.reject(new Error('PcodecJS: the pool has ended'));
          if (Array.isArray(x) && o && o.into) return Promise.reject(new TypeError('PcodecJS: { into } takes one file, not a list'));
          if (Array.isArray(x)) return track(share(x, x.map(count), UNPACK_NS, function (w, b) { return w.unpack(b, o); }, 'unpack', o));
          var bytes = x instanceof ArrayBuffer ? new Uint8Array(x) : x;
          if (bytes instanceof Uint8Array && isSplit(bytes)) { try { return track(unpackSplit(bytes, o)); } catch (e) { return Promise.reject(e); } }
          return track(lane(0).then(function (w) { return w.unpack(x, o); }));
        },
        workers: function () { return lanes.length; },                  // how many background workers are running (or starting) now; 0 after the pool has parked or ended
        idleMs: idleMs,
        terminate: function () { ended = true; disarm(); endLanes(); },
      };
    });
  }
  return { version: '@VERSION@', load: load, worker: worker, pool: pool, types: Object.keys(TYPES).filter(function (k) { return TYPES[k][1]; }) };
});
