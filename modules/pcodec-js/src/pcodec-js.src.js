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
})(typeof self !== 'undefined' ? self : this, function pcodecFactory() {
  'use strict';
  var PROGRAMS = @PROGRAMS@;                                         // { name: base64 }; "fast" (SIMD) and "plain" read, "pack" read and write
  var TYPES = { u32: [1, Uint32Array], u64: [2, typeof BigUint64Array === 'function' ? BigUint64Array : null], i32: [3, Int32Array], i64: [4, typeof BigInt64Array === 'function' ? BigInt64Array : null], f32: [5, Float32Array], f64: [6, Float64Array], u16: [7, Uint16Array], i16: [8, Int16Array] };
  var KIND_NAME = { 1: 'u32', 2: 'u64', 3: 'i32', 4: 'i64', 5: 'f32', 6: 'f64', 7: 'u16', 8: 'i16' };
  var ERRORS = { '-1': 'this number type is not in this build', '-2': 'the data is damaged or cut short', '-3': 'the file holds a different count of numbers than asked', '-4': 'bad argument' };
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  var WARM = @WARM@;                                                  // three tiny Pcodec files [kind, count, base64] that the warm-up unpacks in a loop
  var HAS_PACK = !!PROGRAMS.pack, MAX_COUNT = 1 << 25;
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
  function compileAsync(want) {
    if (typeof WebAssembly !== 'object') return Promise.reject(new Error('PcodecJS needs WebAssembly, which this page does not have'));
    var name; try { name = pick(want); } catch (e) { return Promise.reject(e); }
    return WebAssembly.compile(b64(PROGRAMS[name])).then(function (m) { return { name: name, module: m }; }, function (e) {
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
      programName: c.name, programModule: c.module,                      // the compiled program, to hand to a worker of your own (a WebAssembly.Module can be posted to a worker without compiling again)
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
          else throw new Error('unknown call');
          reply(true, v, v.buffer ? [v.buffer] : []);
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
          terminate: function () {} };
      });
    }
    return new Promise(function (resolve, reject) {
      var w, url, pending = {}, seq = 0, up = false;
      try {
        if (typeof Worker !== 'function' || typeof Blob !== 'function' || !URL || !URL.createObjectURL) throw new Error('no worker');
        var stub = {}, k, text = pcodecFactory.toString();
        for (k in PROGRAMS) stub[k] = 'AAAA';                          // the worker is handed the compiled program, so it does not need the program's text: a small Blob starts faster
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
        function tr(x, o) { return o && o.transfer ? [x.buffer] : []; }
        resolve({ inWorker: true, engine: info.engine, canPack: info.canPack,
          info: function (b, o) { return call('info', b, undefined, tr(b, o)); },
          unpack: function (b, o) { return call('unpack', b, o, tr(b, o)); },
          pack: function (a, o) { return call('pack', a, o, tr(a, o)); },
          packPart: function (a, o) { return call('packPart', a, o, tr(a, o)); },
          terminate: function () { try { w.terminate(); } catch (e) { /* gone */ } giveUp(); } });
      }, function (err) { if (up) return; up = true; try { w.terminate(); } catch (e) { /* gone */ } URL.revokeObjectURL(url); onPage().then(resolve, function () { reject(err); }); });
    });
  }

  // Several background workers that share a job out, so a big job takes less time on a phone or laptop with several cores.
  //   PcodecJS.pool().then(function (p) { return p.pack([colA, colB, colC]); })       // an array of arrays in, an array of Pcodec files out (same order); one big array in, one file out
  //   p.unpack([fileA, fileB, fileC])                                                  // an array of files in, an array of typed arrays out; one file in, one array out (a single file cannot be shared out)
  // Workers start the first time they are needed and a small job stays on one worker, because starting one costs about 10 to 25 ms: a job is shared out only when each worker would get about 25 ms of work (opts.laneMs, 0 shares it out always).
  // opts.size is the most workers (default: the cores the device reports less one, at most 4). One big array is cut into the pages Pcodec itself would use and the pieces join into exactly the bytes pack() writes; { smallest: true } packs it on one worker.
  // Needs the "pack" file for pack. Without Worker support the pool runs on the page one job after another (see worker()). p.terminate() ends all workers.
  var PACK_NS = 60, UNPACK_NS = 20;                                    // about how long one number takes to pack and to unpack, measured in the four test browsers
  function pageSizes(n) {                                              // the equal pages of at most 262,144 numbers Pcodec cuts a column into
    var np = Math.ceil(n / 262144), lo = Math.floor(n / np), r = n % np, out = [], i;
    for (i = 0; i < np; i++) out.push(i < r ? lo + 1 : lo);
    return out;
  }
  function pool(opts) {
    opts = opts || {};
    var hc = typeof navigator === 'object' && navigator && navigator.hardwareConcurrency || 4, lo = { program: opts.program },
      size = Math.max(1, Math.min(8, Math.floor(opts.size || Math.min(4, hc - 1)))), laneMs = opts.laneMs === undefined ? 25 : opts.laneMs, lanes = [], main = null, ended = false;
    function lane(k) { return lanes[k] || (lanes[k] = worker(lo)); }
    function lanesFor(count, ms) { return Math.max(1, Math.min(size, count, laneMs > 0 ? Math.floor(ms / laneMs) : size)); }
    function split(weights, k) {                                       // largest first, each to the least loaded worker: lists of positions
      var order = weights.map(function (_, i) { return i; }).sort(function (a, b) { return weights[b] - weights[a]; }), groups = [], load = [], i;
      for (i = 0; i < k; i++) { groups.push([]); load.push(0); }
      order.forEach(function (at) { var m = 0, j; for (j = 1; j < k; j++) if (load[j] < load[m]) m = j; groups[m].push(at); load[m] += weights[at]; });
      return groups;
    }
    function share(list, weights, ns, one) {
      var total = 0, out = new Array(list.length);
      if (!list.length) return Promise.resolve(out);
      weights.forEach(function (w) { total += w; });
      return Promise.all(split(weights, lanesFor(list.length, total * ns / 1e6)).map(function (g, k) {
        return lane(k).then(function (w) { return Promise.all(g.map(function (at) { return one(w, list[at]).then(function (v) { out[at] = v; }); })); });
      })).then(function () { return out; });
    }
    function packOne(x, o) {
      var n = x && ArrayBuffer.isView(x) ? x.length : 0, pages, k, groups = [], g, from, to, at = 0, i;
      if (!(n > 0) || (o && o.smallest)) return lane(0).then(function (w) { return w.pack(x, o); });
      pages = pageSizes(n); k = Math.min(lanesFor(pages.length, n * PACK_NS / 1e6), pages.length);
      if (k < 2) return lane(0).then(function (w) { return w.pack(x, o); });
      for (g = 0; g < k; g++) {                                        // k stretches of whole pages
        from = Math.floor(g * pages.length / k); to = Math.floor((g + 1) * pages.length / k);
        groups.push({ sizes: pages.slice(from, to), first: g === 0, last: g === k - 1 });
      }
      var sent = [], chain = Promise.resolve();
      groups.forEach(function (p, g) {                                 // one stretch per turn of the page, so copying the array never freezes it for long
        chain = chain.then(function () {
          var cnt = 0, part;
          p.sizes.forEach(function (s) { cnt += s; });
          part = x.slice(at, at + cnt); at += cnt;                     // a copy of just this stretch (handed over, so it is not copied again)
          sent.push(lane(g).then(function (w) { return w.packPart(part, { sizes: p.sizes, total: n, level: o && o.level, first: p.first, last: p.last, transfer: true }); }));
          return g < groups.length - 1 ? yieldNow() : undefined;
        });
      });
      return chain.then(function () { return Promise.all(sent); }).then(function (outs) {
        var len = 0, out, q = 0;
        outs.forEach(function (b) { len += b.length; }); out = new Uint8Array(len);
        for (i = 0; i < outs.length; i++) { out.set(outs[i], q); q += outs[i].length; }
        return out;
      });
    }
    function count(b) { try { return main.info(b).count; } catch (e) { return b && b.length || 1; } }
    return load(lo).then(function (pc) {
      main = pc;
      return {
        size: size,
        pack: function (x, o) {
          if (ended) return Promise.reject(new Error('PcodecJS: the pool has ended'));
          if (!pc.canPack) return Promise.reject(new Error('PcodecJS: pack needs pcodec-js-pack.js'));
          return Array.isArray(x) ? share(x, x.map(function (a) { return a && a.length || 1; }), PACK_NS, function (w, a) { return w.pack(a, o); }) : packOne(x, o);
        },
        unpack: function (x, o) {
          if (ended) return Promise.reject(new Error('PcodecJS: the pool has ended'));
          return Array.isArray(x) ? share(x, x.map(count), UNPACK_NS, function (w, b) { return w.unpack(b, o); }) : lane(0).then(function (w) { return w.unpack(x, o); });
        },
        terminate: function () { ended = true; lanes.forEach(function (p) { p.then(function (w) { w.terminate(); }, function () {}); }); lanes = []; },
      };
    });
  }
  return { version: '@VERSION@', load: load, worker: worker, pool: pool, types: Object.keys(TYPES).filter(function (k) { return TYPES[k][1]; }) };
});
