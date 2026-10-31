/*!
 * gpu-blur.js: blur a picture on the graphics card (WebGL 2), or in WebAssembly, or in plain JavaScript, and give the same picture every way.
 * The module picks the way by what the browser can do, never by the browser's name. Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.2.2 (API 1)
 *
 *   GpuBlur.blur(source, width, height, radius[, opts])   -> Promise of { canvas | pixels | texture, width, height, route }
 *   GpuBlur.blurSync(source, width, height, radius[, opts]) -> the same result at once (the page waits for the whole job)
 *   GpuBlur.ready()      -> Promise: wasm compiled and the card tried; resolves to GpuBlur.info()
 *   GpuBlur.info()       -> { webgl2, wasm, route, glMs, wasmMs, ... }, what the module found and which way it takes for a drawn picture
 *   GpuBlur.reference(rgba, width, height, radius) -> Uint8ClampedArray, the plain JavaScript result (the check for the other ways)
 *   GpuBlur.release()    -> drops the wasm memory and the card objects the module made (it starts again by itself on the next call)
 *
 * source: a canvas, an OffscreenCanvas, an ImageBitmap, an Image that has loaded, an ImageData, or RGBA bytes (Uint8Array or Uint8ClampedArray, width * height * 4).
 * radius: 0 to 100, about the same look as the 2 * sigma of a Gaussian (radius 12 is the look of CSS blur(6px)). Edges repeat the border pixel.
 * opts.out:    'canvas' (default; a canvas you draw with drawImage), 'pixels' (RGBA bytes in a Uint8ClampedArray) or 'texture' (needs opts.gl: stays on the card).
 * opts.route:  'auto' (default), 'webgl2', 'wasm', 'js', 'helpers' or 'threads'. A route that cannot run gives way to the next one (webgl2, or threads then helpers, then wasm, then js);
 *               result.route says which one ran.
 * opts.workers: helpers for the 'helpers' route (blur() only, opt-in; default every core, and giving a number turns the route on). Used above about 0.3 megapixel with 3 or more cores;
 *               the wasm kernel runs on row bands in background workers made from a blob: address (needs worker-src blob:), same bytes. opts.idleMs: how long they wait for the next job (5000).
 *               'threads' (blur() only, opt-in) does the same on one shared memory, with no band copies; it needs a cross-origin isolated page (the two isolation headers),
 *               so it never runs in a page opened from a file; opts.workers (default cores - 1) and opts.idleMs work the same way. info().threads says whether this page can use it.
 * opts.into:   a canvas to draw the result into (out 'canvas'); opts.gl: your own WebGL 2 context (out 'texture'); opts.budget: ms of work per slice (default 3).
 *
 * The blur is three box passes along each axis (a close Gaussian), in whole numbers, so WebGL 2, wasm and JavaScript give the same bytes.
 * No eval, no new Function; no blob: address and no worker unless the 'helpers' or 'threads' route is asked for. WebAssembly needs 'wasm-unsafe-eval' in script-src and falls back to JavaScript without it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GpuBlur = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = '1.2.2';
  var MAX_PIXELS = 33554432;          // 8192 x 4096
  var STRIP = 16;                     // columns per vertical strip (the wasm kernel's limit)
  var WASM_B64 = /*WASM:BEGIN*/'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'/*WASM:END*/;
  var WASMT_B64 = /*WASMT:BEGIN*/'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'/*WASMT:END*/;   // the same kernel built for one shared memory (wasm/blurmt.wasm), used only by the opt-in threads route

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ------------------------------------------------------------------ small helpers
  var chan = null, chanQ = [];
  function nextTask() {
    return new Promise(function (resolve) {
      if (typeof setImmediate === 'function') { setImmediate(resolve); return; }
      if (typeof MessageChannel === 'function') {
        if (!chan) { chan = new MessageChannel(); chan.port1.onmessage = function () { var f = chanQ.shift(); if (f) f(); }; }
        chanQ.push(resolve); chan.port2.postMessage(0); return;
      }
      setTimeout(resolve, 0);
    });
  }

  function boxHalf(radius) {            // half width b of each box: three boxes of width 2b+1 have variance b(b+1), a Gaussian of sigma = radius / 2
    var r = +radius;
    if (!(r > 0)) return 0;
    if (r > 100) r = 100;
    var s = r / 2, b = Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2);
    return b < 1 ? 1 : b;
  }

  function isBytes(x) { return typeof Uint8Array !== 'undefined' && (x instanceof Uint8Array || (typeof Uint8ClampedArray !== 'undefined' && x instanceof Uint8ClampedArray)); }

  function describe(src, w, h) {         // -> { kind: 'bytes' | 'dom', bytes, dom, w, h }
    var sw, sh, bytes = null, dom = null;
    if (src && typeof ImageData !== 'undefined' && src instanceof ImageData) { bytes = src.data; sw = src.width; sh = src.height; }
    else if (isBytes(src)) { bytes = src; sw = w; sh = h; }
    else if (src && typeof src === 'object') {
      dom = src; sw = src.naturalWidth || src.width || src.videoWidth; sh = src.naturalHeight || src.height || src.videoHeight;
      if (typeof src.complete === 'boolean' && !src.complete) throw new Error('gpu-blur: the picture has not loaded yet');
    } else throw new TypeError('gpu-blur: source must be a canvas, ImageBitmap, ImageData or RGBA bytes');
    if (sw == null) sw = w; if (sh == null) sh = h;
    if (w == null) w = sw; if (h == null) h = sh;
    w = +w; h = +h;
    if (!(w >= 1 && h >= 1) || w !== Math.floor(w) || h !== Math.floor(h)) throw new RangeError('gpu-blur: width and height must be whole numbers of at least 1');
    if (w * h > MAX_PIXELS) throw new RangeError('gpu-blur: the picture is larger than ' + MAX_PIXELS + ' pixels');
    if (sw !== w || sh !== h) throw new RangeError('gpu-blur: width and height do not match the source (' + sw + ' x ' + sh + ')');
    if (bytes && bytes.length < w * h * 4) throw new RangeError('gpu-blur: the bytes are shorter than width * height * 4');
    return { kind: bytes ? 'bytes' : 'dom', bytes: bytes, dom: dom, w: w, h: h };
  }

  // ------------------------------------------------------------------ plain JavaScript twin (same bytes as the wasm kernel)
  function boxLineJS(s, so, ss, d, dO, ds, n, b, inv) {
    var c, t, x, sum, a, k;
    for (c = 0; c < 4; c++) {
      sum = s[so + c] * (b + 1);
      for (t = 1; t <= b; t++) sum += s[so + (t < n ? t : n - 1) * ss + c];
      for (x = 0; x < n; x++) {
        d[dO + x * ds + c] = ((sum + b + 0.5) * inv) | 0;
        a = x + b + 1; if (a > n - 1) a = n - 1;
        k = x - b; if (k < 0) k = 0;
        sum += s[so + a * ss + c] - s[so + k * ss + c];
      }
    }
  }
  function jsJob(w, h, b) {
    var A = new Uint8Array(w * h * 4), B = new Uint8Array(w * h * 4);
    var r1 = new Uint8Array(w * 4), r2 = new Uint8Array(w * 4), c1 = new Uint8Array(h * 4), c2 = new Uint8Array(h * 4);
    var inv = 1 / (2 * b + 1);
    return {
      A: A, route: 'js', capPx: 8000,
      hrows: function (y0, y1) {
        for (var y = y0; y < y1; y++) {
          var o = y * w * 4;
          boxLineJS(A, o, 4, r1, 0, 4, w, b, inv); boxLineJS(r1, 0, 4, r2, 0, 4, w, b, inv); boxLineJS(r2, 0, 4, B, o, 4, w, b, inv);
        }
      },
      vcols: function (x0, x1) {
        for (var x = x0; x < x1; x++) {
          boxLineJS(B, x * 4, w * 4, c1, 0, 4, h, b, inv); boxLineJS(c1, 0, 4, c2, 0, 4, h, b, inv); boxLineJS(c2, 0, 4, A, x * 4, w * 4, h, b, inv);
        }
      },
      free: function () {}
    };
  }

  // ------------------------------------------------------------------ WebAssembly
  var wasm = { state: 'new', module: null, promise: null, pool: [], why: '' };    // state: new | ready | failed
  function b64bytes(s) {
    if (typeof atob === 'function') { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  function wasmSelfTest() {              // a small picture through the kernel and through the JavaScript twin: the same bytes or the wasm is not used
    var w = 37, h = 21, b = 3, px = new Uint8Array(w * h * 4), i, j = jsJob(w, h, b), k = wasmJob(w, h, b);
    if (!k) return false;
    for (i = 0; i < px.length; i++) px[i] = (i * 73 + (i >> 3) * 29) & 255;
    j.A.set(px); k.A.set(px);
    j.hrows(0, h); j.vcols(0, w); k.hrows(0, h); k.vcols(0, STRIP); k.vcols(STRIP, 2 * STRIP); k.vcols(2 * STRIP, w);
    var ok = true; for (i = 0; i < px.length; i++) if (j.A[i] !== k.A[i]) { ok = false; break; }
    k.free();
    return ok;
  }
  function wasmFail(why) { wasm.state = 'failed'; wasm.why = String(why && why.message || why); wasm.module = null; return false; }
  function ensureWasm() {                // -> Promise<boolean>
    if (wasm.promise) return wasm.promise;
    wasm.promise = new Promise(function (resolve) {
      try {
        if (typeof WebAssembly !== 'object' || !WebAssembly.compile || !WASM_B64) { resolve(wasmFail('no WebAssembly')); return; }
        WebAssembly.compile(b64bytes(WASM_B64)).then(function (m) {
          wasm.module = m;
          try { if (wasmSelfTest()) { wasm.state = 'ready'; resolve(true); } else resolve(wasmFail('self-test differs')); } catch (e) { resolve(wasmFail(e)); }
        }, function (e) { resolve(wasmFail(e)); });
      } catch (e) { resolve(wasmFail(e)); }
    });
    return wasm.promise;
  }
  function wasmNow() {                   // compiled module at once (small module: compiling it in place is allowed), else null
    if (wasm.state === 'ready') return true;
    if (wasm.state === 'failed') return false;
    if (typeof WebAssembly !== 'object' || !WASM_B64) { wasmFail('no WebAssembly'); return false; }
    try { wasm.module = new WebAssembly.Module(b64bytes(WASM_B64)); wasm.state = 'ready'; if (!wasmSelfTest()) return wasmFail('self-test differs'); return true; }
    catch (e) { return wasmFail(e); }
  }
  function wasmJob(w, h, b) {
    if (!wasm.module) return null;
    var pk = wasm.pool.pop(), inst;
    if (!pk) { var i = new WebAssembly.Instance(wasm.module, {}); pk = { ex: i.exports, mem: i.exports.memory }; }
    var BASE = 65536, al = function (n) { return (n + 15) & ~15; };
    var img = al(w * h * 4), rowA = BASE, rowB = rowA + al(w * 8), stA = rowB + al(w * 8), stB = stA + al(h * STRIP * 4), col = stB + al(h * STRIP * 4);
    var pA = col + STRIP * 16, pB = pA + img, end = pB + img;
    var have = pk.mem.buffer.byteLength;
    if (end > have) pk.mem.grow(Math.ceil((end - have) / 65536));
    var ex = pk.ex;
    return {
      A: new Uint8Array(pk.mem.buffer, pA, w * h * 4), route: 'wasm', capPx: 80000,
      hrows: function (y0, y1) { ex.hrows(pA, pB, rowA, rowB, w, y0, y1, b); },
      vcols: function (x0, x1) { ex.vcols(pB, pA, stA, stB, col, w, h, x0, x1, b); },
      free: function () { if (wasm.pool.length < 1) wasm.pool.push(pk); }
    };
  }

  // ------------------------------------------------------------------ the slicer: cuts a job into short tasks
  function runPhases(phases, budget, sync) {
    var i;
    if (sync) { for (i = 0; i < phases.length; i++) phases[i].fn(0, phases[i].total); return null; }
    var pi = 0, pos = 0;
    return new Promise(function (resolve, reject) {
      function slice() {
        try {
          var t0 = now();
          while (pi < phases.length) {
            var p = phases[pi], n = Math.min(p.chunk, p.total - pos), s = now();
            p.fn(pos, pos + n);
            var dt = now() - s; pos += n;
            if (dt > 0.1) p.chunk = Math.max(1, Math.min(p.max, Math.round(p.chunk * Math.max(0.25, Math.min(2, (budget * 0.3) / dt)))));
            else p.chunk = Math.min(p.max, p.chunk * 2);
            if (pos >= p.total) { pi++; pos = 0; }
            if (pi < phases.length && now() - t0 + dt >= budget) break;      // the next piece would probably run past the budget
          }
          if (pi >= phases.length) resolve(); else nextTask().then(slice);
        } catch (e) { reject(e); }
      }
      slice();
    });
  }
  function phase(total, itemPx, capPx, fn) {            // total items; itemPx = pixels one item touches; capPx = most pixels one chunk may touch
    var max = Math.max(1, Math.floor(capPx / itemPx));
    return { total: total, fn: fn, max: max, chunk: Math.max(1, Math.floor(max / 32)) };
  }

  // ------------------------------------------------------------------ canvases
  function makeCanvas(w, h) {
    var c = null;
    if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
    else if (typeof OffscreenCanvas === 'function') c = new OffscreenCanvas(w || 1, h || 1);
    if (c) { c.width = w || 1; c.height = h || 1; }
    return c;
  }
  var scratch = null;                    // a plain-memory 2D canvas used to read a picture's bytes; one job at a time holds it, a second job gets its own
  function scratchCtx(w, h) {
    var s = scratch, shared = !!s && !s.busy;
    if (!s || s.busy) { var c = makeCanvas(w, h); if (!c) return null; var x = c.getContext('2d', { willReadFrequently: true }); if (!x) return null; s = { c: c, x: x, busy: false }; if (!scratch) { scratch = s; shared = true; } }
    if (s.c.width !== w || s.c.height !== h) { s.c.width = w; s.c.height = h; }
    s.x.globalCompositeOperation = 'copy';
    if (shared) s.busy = true;
    return { x: s.x, release: function () { if (shared) s.busy = false; else { s.c.width = s.c.height = 1; } } };
  }

  // ------------------------------------------------------------------ CPU route (wasm or JavaScript): read, hrows, vcols, write
  function cpuRoute(kind, inp, w, h, b, out, opts, sync) {
    var job = kind === 'wasm' ? wasmJob(w, h, b) : jsJob(w, h, b);
    if (!job) throw new Error('gpu-blur: wasm is not available');
    var A = job.A, cap = job.capPx, phases = [], ctx = null, res = { width: w, height: h, route: job.route }, sx, lease = null;
    // read
    if (inp.kind === 'bytes') {
      var src = inp.bytes;
      if (!(src instanceof Uint8Array)) src = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);      // the same kind of array on both sides: a plain copy in every engine
      phases.push(phase(h, w, 200000, function (y0, y1) { A.set(src.subarray(y0 * w * 4, y1 * w * 4), y0 * w * 4); }));
    } else {
      lease = scratchCtx(w, h);
      if (!lease) { job.free(); throw new Error('gpu-blur: no 2D canvas to read the picture'); }
      sx = lease.x;
      var dom = inp.dom;
      // Reading a canvas costs a fixed amount per call in some browsers (the picture lives outside the page's process), so both the drawing into the reading
      // canvas and the reading of its bytes go in a few large bands (500,000 pixels to draw, 250,000 to read), not in the small adaptive pieces the other phases use.
      var nb = Math.max(1, Math.ceil(w * h / 500000)), per = Math.ceil(h / nb);
      phases.push({ total: nb, max: 1, chunk: 1, fn: function (b0, b1) { var y0 = b0 * per, y1 = Math.min(h, b1 * per); sx.globalCompositeOperation = b0 === 0 ? 'copy' : 'source-over'; /* 'copy' clears everything outside what it draws, so only the first band may use it */ sx.drawImage(dom, 0, y0, w, y1 - y0, 0, y0, w, y1 - y0); } });
      var nr = Math.max(1, Math.ceil(w * h / 250000)), perR = Math.ceil(h / nr);
      phases.push({ total: nr, max: 1, chunk: 1, fn: function (b0, b1) { var y0 = b0 * perR, y1 = Math.min(h, b1 * perR), d = sx.getImageData(0, y0, w, y1 - y0).data; A.set(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), y0 * w * 4); } });
    }
    phases.push(phase(h, w, cap, function (y0, y1) { job.hrows(y0, y1); }));
    phases.push(phase(Math.ceil(w / STRIP), STRIP * h, cap, function (s0, s1) { for (var s = s0; s < s1; s++) job.vcols(s * STRIP, Math.min(w, s * STRIP + STRIP)); }));
    // write
    if (out === 'pixels') {
      var px = job.route === 'js' ? new Uint8ClampedArray(A.buffer, A.byteOffset, w * h * 4) : new Uint8ClampedArray(w * h * 4);
      res.pixels = px;
      if (job.route !== 'js') phases.push(phase(h, w, 200000, function (y0, y1) { px.set(new Uint8ClampedArray(A.buffer, A.byteOffset + y0 * w * 4, (y1 - y0) * w * 4), y0 * w * 4); }));
    } else {
      var cv = opts.into || makeCanvas(w, h);
      if (!cv) { job.free(); throw new Error('gpu-blur: no canvas can be made here; use out: "pixels"'); }
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx = cv.getContext('2d');
      if (!ctx) { job.free(); throw new Error('gpu-blur: the target canvas has no 2D context'); }
      res.canvas = cv;
      // Writing goes in a few large fixed bands (about 250,000 pixels): in some engines every turn given back to the browser after a putImageData costs a lot on a big canvas,
      // so many small pieces made a 3840 x 2160 picture take seconds.
      var nw = Math.max(1, Math.ceil(w * h / 250000)), perW = Math.ceil(h / nw), band = null, bandRows = 0;
      phases.push({ total: nw, max: 1, chunk: 1, fn: function (b0, b1) {
        var y0 = b0 * perW, y1 = Math.min(h, b1 * perW);
        if (!band || bandRows !== y1 - y0) { band = ctx.createImageData(w, y1 - y0); bandRows = y1 - y0; }
        band.data.set(new Uint8ClampedArray(A.buffer, A.byteOffset + y0 * w * 4, (y1 - y0) * w * 4)); ctx.putImageData(band, 0, y0);
      } });
    }
    var done = function () { if (lease) lease.release(); job.free(); return res; };
    var failed = function (e) { if (lease) lease.release(); job.free(); throw e; };
    if (sync) { try { runPhases(phases, 0, true); } catch (e) { failed(e); } return done(); }
    return runPhases(phases, opts.budget || 3, false).then(done, failed);
  }


  // ------------------------------------------------------------------ helpers route (opt-in): the wasm kernel on row bands in background workers
  // Each helper blurs its band plus 3b rows above and below (the reach of three box passes), then sends back the middle rows, so the bytes are the ones the one-thread kernel gives.
  // Only for blur(), only when asked (route: 'helpers' or workers: n), only above about 0.3 megapixel and with 3 or more cores; anything that stops it (no Worker, a page policy
  // without worker-src blob:, a helper that fails) gives way to the one-thread wasm route. The helpers stay for idleMs (default 5000) after the last job; release() ends them now.
  //@helpers-begin (the only part that makes a blob: address or a Worker; it runs only when the helpers or threads route is asked for)
  var HELPER_MIN_PX = 300000, helpers = null;
  function helperMain() {
    var ex = null, mem = null, al = function (n) { return (n + 15) & ~15; };
    onmessage = function (e) {
      var m = e.data;
      if (m.module) { try { ex = new WebAssembly.Instance(m.module, {}).exports; mem = ex.memory; postMessage({ ready: 1 }); } catch (err) { postMessage({ ready: 0 }); } return; }
      var w = m.w, h = m.hh, b = m.b, S = 16, img = al(w * h * 4);
      var rowA = 65536, rowB = rowA + al(w * 8), stA = rowB + al(w * 8), stB = stA + al(h * S * 4), col = stB + al(h * S * 4), pA = col + S * 16, pB = pA + img, end = pB + img;
      if (end > mem.buffer.byteLength) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536));
      new Uint8Array(mem.buffer, pA, w * h * 4).set(new Uint8Array(m.buf));
      ex.hrows(pA, pB, rowA, rowB, w, 0, h, b);
      for (var x = 0; x < w; x += S) ex.vcols(pB, pA, stA, stB, col, w, h, x, Math.min(w, x + S), b);
      var out = new Uint8Array(m.keep * w * 4); out.set(new Uint8Array(mem.buffer, pA + m.top * w * 4, m.keep * w * 4));
      postMessage({ id: m.id, buf: out.buffer }, [out.buffer]);
    };
  }
  function closeHelpers() {
    var H = helpers; helpers = null; if (!H) return;
    if (H.timer) clearTimeout(H.timer);
    for (var i = 0; i < H.ws.length; i++) H.ws[i].terminate();
    try { URL.revokeObjectURL(H.url); } catch (e) { /* gone */ }
    for (var k in H.pending) H.pending[k].fail(new Error('gpu-blur: helpers closed'));
  }
  function getHelpers(n) {                // -> Promise of the pool; rejects when helpers cannot start here
    if (helpers && helpers.ws.length === n) return helpers.ready;
    closeHelpers();
    var H = { ws: [], pending: {}, id: 0, timer: 0, url: null }, url, starts = [];
    try { url = URL.createObjectURL(new Blob(['(' + helperMain.toString() + ')()'], { type: 'text/javascript' })); } catch (e) { return Promise.reject(e); }
    H.url = url; helpers = H;
    var dead = function (e) { if (helpers === H) closeHelpers(); for (var k in H.pending) H.pending[k].fail(e); };
    try {
      for (var i = 0; i < n; i++) (function () {
        var wk = new Worker(url); H.ws.push(wk);
        starts.push(new Promise(function (ok, bad) {
          wk.onerror = function (e) { e && e.preventDefault && e.preventDefault(); bad(new Error('gpu-blur: a helper could not start')); dead(new Error('gpu-blur: a helper failed')); };
          wk.onmessage = function (ev) {
            if (!ev.data.ready) { bad(new Error('gpu-blur: a helper could not start the kernel')); return; }
            wk.onmessage = function (e2) { var j = H.pending[e2.data.id]; if (j) { delete H.pending[e2.data.id]; j.done(e2.data.buf); } };
            ok();
          };
        }));
        wk.postMessage({ module: wasm.module });
      })();
    } catch (e) { closeHelpers(); return Promise.reject(e); }
    H.ready = Promise.all(starts).then(function () { return H; }, function (e) { if (helpers === H) closeHelpers(); throw e; });
    return H.ready;
  }
  function helperCount(opts, w, h, spare) {   // default: every core for helpers (the page only copies bands in and out while they work); spare: leave one core (the threads route)
    var cores = (typeof navigator === 'object' && navigator.hardwareConcurrency) || 1, n = opts.workers > 0 ? Math.floor(opts.workers) : spare ? cores - 1 : cores;
    return Math.max(0, Math.min(n, 16, h));
  }
  function helpersRoute(inp, w, h, b, out, opts) {
    var cores = (typeof navigator === 'object' && navigator.hardwareConcurrency) || 1, n = helperCount(opts, w, h);
    if (wasm.state !== 'ready' || !wasm.module) return Promise.reject(new Error('gpu-blur: wasm is not available'));
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL !== 'function' || !URL.createObjectURL) return Promise.reject(new Error('gpu-blur: no workers here'));
    if (n < 2 || (!(opts.workers > 0) && cores < 3) || w * h < (opts.helperMinPixels === undefined ? HELPER_MIN_PX : opts.helperMinPixels)) return Promise.reject(new Error('gpu-blur: too small or too few cores for helpers'));
    return getHelpers(n).then(function (H) {
      if (H.timer) { clearTimeout(H.timer); H.timer = 0; }
      var halo = 3 * b, per = Math.ceil(h / n), jobs = [], res = { width: w, height: h, route: 'helpers' }, px = null, ctx = null, lease = null, sx = null, i;
      if (out === 'pixels') res.pixels = px = new Uint8ClampedArray(w * h * 4);
      else {
        var cv = opts.into || makeCanvas(w, h);
        if (!cv) throw new Error('gpu-blur: no canvas can be made here; use out: "pixels"');
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        ctx = cv.getContext('2d'); if (!ctx) throw new Error('gpu-blur: the target canvas has no 2D context');
        res.canvas = cv;
      }
      if (inp.kind !== 'bytes') {
        lease = scratchCtx(w, h); if (!lease) throw new Error('gpu-blur: no 2D canvas to read the picture');
        sx = lease.x; sx.drawImage(inp.dom, 0, 0, w, h, 0, 0, w, h);
      }
      var src = inp.kind === 'bytes' ? (inp.bytes instanceof Uint8Array ? inp.bytes : new Uint8Array(inp.bytes.buffer, inp.bytes.byteOffset, inp.bytes.byteLength)) : null;
      for (i = 0; i < n; i++) {
        var y0 = i * per, y1 = Math.min(h, y0 + per); if (y0 >= y1) break;
        (function (y0, y1, k) {
          var s0 = Math.max(0, y0 - halo), s1 = Math.min(h, y1 + halo), buf;
          if (src) buf = src.slice(s0 * w * 4, s1 * w * 4).buffer;
          else { var d = sx.getImageData(0, s0, w, s1 - s0).data; buf = d.buffer.byteLength === d.byteLength ? d.buffer : d.slice().buffer; }
          jobs.push(new Promise(function (ok, bad) {
            var id = ++H.id;
            H.pending[id] = { fail: bad, done: function (rb) {
              try {
                if (px) px.set(new Uint8ClampedArray(rb), y0 * w * 4);
                else ctx.putImageData(new ImageData(new Uint8ClampedArray(rb), w, y1 - y0), 0, y0);
                ok();
              } catch (e) { bad(e); }
            } };
            H.ws[k].postMessage({ id: id, buf: buf, w: w, hh: s1 - s0, b: b, top: y0 - s0, keep: y1 - y0 }, [buf]);
          }));
        })(y0, y1, i);
      }
      if (lease) { lease.release(); lease = null; }
      var idle = function () { if (helpers === H) { if (H.timer) clearTimeout(H.timer); H.timer = setTimeout(closeHelpers, opts.idleMs === undefined ? 5000 : opts.idleMs); } };
      return Promise.all(jobs).then(function () { idle(); return res; }, function (e) { idle(); throw e; });
    });
  }
  // ------------------------------------------------------------------ threads route (opt-in): WebAssembly threads on one shared memory
  // Only on a page that is cross-origin isolated (sent with the two isolation headers, so SharedArrayBuffer exists), only for blur(), only when asked (route: 'threads').
  // The picture goes into one shared memory once; every helper runs the same kernel on it, first its share of the rows, then its share of the column strips,
  // so there are no halo rows and no band copies. Jobs run one at a time. Anything that stops it gives way to the helpers route, then one-thread wasm.
  var threads = null, threadsWhy = '';
  function threadMain() {
    var ex = null;
    onmessage = function (e) {
      var m = e.data;
      if (m.module) { try { ex = new WebAssembly.Instance(m.module, { env: { memory: m.memory } }).exports; postMessage({ ready: 1 }); } catch (err) { postMessage({ ready: 0 }); } return; }
      try {
        if (m.op === 'h') ex.hrows(m.A, m.B, m.rowA, m.rowB, m.w, m.y0, m.y1, m.b, m.km);
        else ex.vcols(m.B, m.A, m.stA, m.stB, m.col, m.w, m.h, m.x0, m.x1, m.b, m.km);
        postMessage({ id: m.id });
      } catch (err) { postMessage({ id: m.id, err: String(err && err.message || err) }); }
    };
  }
  function canThreads() { return typeof SharedArrayBuffer === 'function' && root.crossOriginIsolated === true && !!WASMT_B64 && typeof Worker === 'function'; }
  function closeThreads() {
    var T = threads; threads = null; if (!T) return;
    if (T.timer) clearTimeout(T.timer);
    for (var i = 0; i < T.ws.length; i++) T.ws[i].terminate();
    try { URL.revokeObjectURL(T.url); } catch (e) { /* gone */ }
    for (var k in T.pending) T.pending[k].fail(new Error('gpu-blur: threads closed'));
  }
  function getThreads(n, pages) {         // -> Promise of the pool, its shared memory at least `pages` pages
    if (threads && threads.ws.length === n && threads.maxPages >= pages) return threads.ready;
    closeThreads();
    var max = 256; while (max < pages) max *= 2;
    var T = { ws: [], pending: {}, id: 0, timer: 0, url: null, maxPages: max, kms: {}, chain: Promise.resolve() }, starts = [];
    try {
      if (!getThreads.module) getThreads.module = new WebAssembly.Module(b64bytes(WASMT_B64));
      T.memory = new WebAssembly.Memory({ initial: pages, maximum: max, shared: true });
      T.main = new WebAssembly.Instance(getThreads.module, { env: { memory: T.memory } }).exports;     // only for km(n)
      T.url = URL.createObjectURL(new Blob(['(' + threadMain.toString() + ')()'], { type: 'text/javascript' }));
    } catch (e) { return Promise.reject(e); }
    threads = T;
    var dead = function (e) { if (threads === T) closeThreads(); for (var k in T.pending) T.pending[k].fail(e); };
    try {
      for (var i = 0; i < n; i++) (function () {
        var wk = new Worker(T.url); T.ws.push(wk);
        starts.push(new Promise(function (ok, bad) {
          wk.onerror = function (e) { e && e.preventDefault && e.preventDefault(); bad(new Error('gpu-blur: a thread could not start')); dead(new Error('gpu-blur: a thread failed')); };
          wk.onmessage = function (ev) {
            if (!ev.data.ready) { bad(new Error('gpu-blur: a thread could not start the kernel')); return; }
            wk.onmessage = function (e2) { var j = T.pending[e2.data.id]; if (j) { delete T.pending[e2.data.id]; if (e2.data.err) j.fail(new Error('gpu-blur: ' + e2.data.err)); else j.done(); } };
            ok();
          };
        }));
        wk.postMessage({ module: getThreads.module, memory: T.memory });
      })();
    } catch (e) { closeThreads(); return Promise.reject(e); }
    T.ready = Promise.all(starts).then(function () { return T; }, function (e) { if (threads === T) closeThreads(); throw e; });
    return T.ready;
  }
  function threadsRoute(inp, w, h, b, out, opts) {
    var n = helperCount(opts, w, h, true);
    if (!canThreads()) return Promise.reject(new Error('gpu-blur: threads need a cross-origin isolated page'));
    if (threadsWhy) return Promise.reject(new Error(threadsWhy));
    if (wasm.state !== 'ready') return Promise.reject(new Error('gpu-blur: wasm is not available'));
    if (n < 2 || w * h < (opts.helperMinPixels === undefined ? HELPER_MIN_PX : opts.helperMinPixels)) return Promise.reject(new Error('gpu-blur: too small or too few cores for threads'));
    var al = function (x) { return (x + 63) & ~63; }, per = al(w * 8) * 2 + al(h * 64) * 2 + 256, A = 65536 + n * per, B = A + al(w * h * 4), end = B + al(w * h * 4);
    var pages = Math.ceil(end / 65536);
    return getThreads(n, pages).then(function (T) {
      var run = function () {
        if (T.timer) { clearTimeout(T.timer); T.timer = 0; }
        if (threads !== T) throw new Error('gpu-blur: threads closed');
        var have = T.memory.buffer.byteLength; if (end > have) T.memory.grow(Math.ceil((end - have) / 65536));
        var km = T.kms[b] || (T.kms[b] = T.main.km(2 * b + 1)), res = { width: w, height: h, route: 'threads' }, ctx = null, i;
        if (inp.kind === 'bytes') new Uint8Array(T.memory.buffer, A, w * h * 4).set(inp.bytes);
        else {
          var lease = scratchCtx(w, h); if (!lease) throw new Error('gpu-blur: no 2D canvas to read the picture');
          lease.x.drawImage(inp.dom, 0, 0, w, h, 0, 0, w, h);
          new Uint8Array(T.memory.buffer, A, w * h * 4).set(lease.x.getImageData(0, 0, w, h).data); lease.release();
        }
        var phaseRun = function (msgs) {
          return Promise.all(msgs.map(function (m, k) { return new Promise(function (ok, bad) { m.id = ++T.id; T.pending[m.id] = { done: ok, fail: bad }; T.ws[k].postMessage(m); }); }));
        };
        var hm = [], vm = [], rowsPer = Math.ceil(h / n / 2) * 2, strips = Math.ceil(w / STRIP), sPer = Math.ceil(strips / n);
        for (i = 0; i < n; i++) {
          var s = 65536 + i * per, y0 = i * rowsPer, y1 = Math.min(h, y0 + rowsPer), x0 = i * sPer * STRIP, x1 = Math.min(w, x0 + sPer * STRIP);
          if (y0 < y1) hm.push({ op: 'h', A: A, B: B, rowA: s, rowB: s + al(w * 8), w: w, y0: y0, y1: y1, b: b, km: km });
          if (x0 < x1) vm.push({ op: 'v', A: A, B: B, stA: s + 2 * al(w * 8), stB: s + 2 * al(w * 8) + al(h * 64), col: s + 2 * al(w * 8) + 2 * al(h * 64), w: w, h: h, x0: x0, x1: x1, b: b, km: km });
        }
        return phaseRun(hm).then(function () { return phaseRun(vm); }).then(function () {
          var px = new Uint8ClampedArray(w * h * 4); px.set(new Uint8Array(T.memory.buffer, A, w * h * 4));
          if (out === 'pixels') res.pixels = px;
          else {
            var cv = opts.into || makeCanvas(w, h);
            if (!cv) throw new Error('gpu-blur: no canvas can be made here; use out: "pixels"');
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            ctx = cv.getContext('2d'); if (!ctx) throw new Error('gpu-blur: the target canvas has no 2D context');
            ctx.putImageData(new ImageData(px, w, h), 0, 0); res.canvas = cv;
          }
          return res;
        });
      };
      var idle = function () { if (threads === T) { if (T.timer) clearTimeout(T.timer); T.timer = setTimeout(closeThreads, opts.idleMs === undefined ? 5000 : opts.idleMs); } };
      var job = T.chain.then(run);
      T.chain = job.then(idle, idle);
      return job;
    }, function (e) { threadsWhy = String(e && e.message || e); throw e; });
  }
  //@helpers-end

  // ------------------------------------------------------------------ WebGL 2 route
  var VS = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID&1)*2),float((gl_VertexID>>1)*2));gl_Position=vec4(p*2.-1.,0.,1.);}';
  var FS = '#version 300 es\nprecision highp float;precision highp int;\n' +
    'uniform sampler2D t;uniform ivec2 dir;uniform int B;uniform int flip;uniform int H;out vec4 o;\n' +
    'void main(){ivec2 p=ivec2(gl_FragCoord.xy);if(flip==1)p.y=H-1-p.y;ivec2 sz=textureSize(t,0)-1;ivec4 s=ivec4(0);\n' +
    'for(int i=-B;i<=B;i++){s+=ivec4(texelFetch(t,clamp(p+dir*i,ivec2(0),sz),0)*255.+.5);}\n' +
    'int n=2*B+1;o=vec4(floor(vec4(2*s+n)/float(2*n)))/255.;}';

  function glCompile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var m = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('gpu-blur: shader: ' + m); }
    return s;
  }
  function glState(gl) {                 // the program, the textures and the frame buffer for one WebGL 2 context
    var S = { gl: gl, w: 0, h: 0, tex: [null, null], fbo: gl.createFramebuffer(), vao: gl.createVertexArray() };
    var p = gl.createProgram(), vs = glCompile(gl, gl.VERTEX_SHADER, VS), fs = glCompile(gl, gl.FRAGMENT_SHADER, FS);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('gpu-blur: link: ' + gl.getProgramInfoLog(p));
    gl.deleteShader(vs); gl.deleteShader(fs);
    S.prog = p; S.u = {};
    ['t', 'dir', 'B', 'flip', 'H'].forEach(function (n) { S.u[n] = gl.getUniformLocation(p, n); });
    S.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return S;
  }
  function glTex(gl, w, h) {
    var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function glSave(gl) {
    var unit = gl.getParameter(gl.ACTIVE_TEXTURE), tex0;
    gl.activeTexture(gl.TEXTURE0); tex0 = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.activeTexture(unit);
    return { al: gl.getParameter(gl.UNPACK_ALIGNMENT), prog: gl.getParameter(gl.CURRENT_PROGRAM), vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING), fb: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      vp: gl.getParameter(gl.VIEWPORT), unit: unit, tex: tex0,
      blend: gl.isEnabled(gl.BLEND), scissor: gl.isEnabled(gl.SCISSOR_TEST), depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE), stencil: gl.isEnabled(gl.STENCIL_TEST),
      cm: gl.getParameter(gl.COLOR_WRITEMASK), pre: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), flip: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), cs: gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) };
  }
  function glRestore(gl, s) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.activeTexture(s.unit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb); gl.bindVertexArray(s.vao); gl.useProgram(s.prog); gl.viewport(s.vp[0], s.vp[1], s.vp[2], s.vp[3]);
    [[gl.BLEND, s.blend], [gl.SCISSOR_TEST, s.scissor], [gl.DEPTH_TEST, s.depth], [gl.CULL_FACE, s.cull], [gl.STENCIL_TEST, s.stencil]].forEach(function (e) { if (e[1]) gl.enable(e[0]); else gl.disable(e[0]); });
    gl.colorMask(s.cm[0], s.cm[1], s.cm[2], s.cm[3]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, s.pre); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, s.flip); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, s.cs); gl.pixelStorei(gl.UNPACK_ALIGNMENT, s.al);
  }
  // Draws the six passes. dest: 'canvas' (the context's own frame buffer, picture upright), 'fbo' (inside tex[0], read it with readPixels), or a texture you own.
  function glPasses(S, inp, w, h, b, dest, destTex) {
    var gl = S.gl;
    if (w > S.max || h > S.max) throw new Error('gpu-blur: the picture is larger than this card\'s texture size');
    if (S.w !== w || S.h !== h) {
      for (var i = 0; i < 2; i++) { if (S.tex[i]) gl.deleteTexture(S.tex[i]); S.tex[i] = glTex(gl, w, h); }
      S.w = w; S.h = h;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex[0]);
    if (inp.kind === 'bytes') {
      var by = inp.bytes; if (by.length !== w * h * 4 || !(by instanceof Uint8Array)) by = new Uint8Array(by.buffer, by.byteOffset, w * h * 4);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, by);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, inp.dom);
    gl.useProgram(S.prog); gl.bindVertexArray(S.vao);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true);
    gl.viewport(0, 0, w, h);
    gl.uniform1i(S.u.t, 0); gl.uniform1i(S.u.B, b); gl.uniform1i(S.u.H, h);
    var plan = [[0, 1, 1, 0], [1, 0, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1], [0, 1, 0, 1], [1, -1, 0, 1]];   // [from, to (-1 = destination), dx, dy]
    for (var k = 0; k < 6; k++) {
      var f = plan[k][0], t = plan[k][1];
      gl.bindTexture(gl.TEXTURE_2D, S.tex[f]);
      var flip = 0;
      if (t === -1) {
        if (dest === 'canvas') { gl.bindFramebuffer(gl.FRAMEBUFFER, null); flip = 1; }
        else { gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dest === 'fbo' ? S.tex[0] : destTex, 0); }
      } else { gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex[t], 0); }
      gl.uniform2i(S.u.dir, plan[k][2], plan[k][3]); gl.uniform1i(S.u.flip, flip);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  function glFence(gl, limitMs) {         // -> Promise<boolean>: did the card finish in time
    return new Promise(function (resolve) {
      var sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0 = now();
      if (!sync) { resolve(false); return; }
      gl.flush();
      (function poll() {
        var r = gl.clientWaitSync(sync, 0, 0);
        if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) { gl.deleteSync(sync); resolve(true); }
        else if (r === gl.WAIT_FAILED || now() - t0 > limitMs) { gl.deleteSync(sync); resolve(false); }
        else nextTask().then(poll);
      })();
    });
  }
  function glRead(S, w, h) {              // pixels from tex[0] without stalling the page: a buffer, a fence, then a copy
    var gl = S.gl, out = new Uint8ClampedArray(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex[0], 0);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return glFence(gl, 5000).then(function () {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, new Uint8Array(out.buffer));
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteBuffer(buf);
      return out;
    });
  }
  function glReadSync(S, w, h) {
    var gl = S.gl, out = new Uint8ClampedArray(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex[0], 0);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(out.buffer));
    return out;
  }

  // The module's own context (for out 'canvas' and 'pixels'); a context you pass in opts.gl is used as it is.
  var own = { gl: null, S: null, canvas: null, lost: false, triedStrict: false, triedLoose: false };
  function ownGL(strict) {                // strict: refuse a context the browser calls slow (failIfMajorPerformanceCaveat)
    if (own.gl) return (own.lost || own.gl.isContextLost()) ? null : own;
    if (strict ? own.triedStrict : own.triedLoose) return null;
    if (strict) own.triedStrict = true; else own.triedLoose = true;
    var c = makeCanvas(1, 1), gl = null;
    if (!c) return null;
    try {
      gl = c.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !!strict });
      if (!gl) return null;
      own.S = glState(gl); own.gl = gl; own.canvas = c;
      if (c.addEventListener) {
        c.addEventListener('webglcontextlost', function (e) { e.preventDefault(); own.lost = true; });
        c.addEventListener('webglcontextrestored', function () { try { own.S = glState(own.gl); own.S.w = own.S.h = 0; own.lost = false; } catch (e) { own.lost = true; } });
      }
      return own;
    } catch (e) { own.gl = null; own.S = null; return null; }
  }
  var userStates = typeof WeakMap === 'function' ? new WeakMap() : null;
  function userGL(gl) {
    var S = userStates && userStates.get(gl);
    if (!S) { S = glState(gl); if (userStates) userStates.set(gl, S); }
    return S;
  }

  function glRoute(inp, w, h, b, out, opts, sync) {
    var res = { width: w, height: h, route: 'webgl2' }, S, saved = null, gl;
    if (out === 'texture') {
      if (!opts.gl) throw new Error('gpu-blur: out "texture" needs opts.gl (a WebGL 2 context)');
      gl = opts.gl; if (gl.isContextLost()) throw new Error('gpu-blur: the WebGL 2 context is lost');
      S = userGL(gl); saved = glSave(gl);
      try {
        var tex = glTex(gl, w, h);
        glPasses(S, inp, w, h, b, 'tex', tex);
        res.texture = tex; res.gl = gl;
      } finally { glRestore(gl, saved); }
      return sync ? res : Promise.resolve(res);
    }
    var o = ownGL(false);
    if (!o) throw new Error('gpu-blur: WebGL 2 is not available');
    S = o.S; gl = o.gl;
    if (out === 'canvas') {
      var cv = opts.into || makeCanvas(w, h);
      if (!cv) throw new Error('gpu-blur: no canvas can be made here');
      if (o.canvas.width !== w || o.canvas.height !== h) { o.canvas.width = w; o.canvas.height = h; }
      glPasses(S, inp, w, h, b, 'canvas');
      if (gl.isContextLost()) throw new Error('gpu-blur: the WebGL 2 context was lost');
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      var c2 = cv.getContext('2d');
      if (!c2) throw new Error('gpu-blur: the target canvas has no 2D context');
      c2.globalCompositeOperation = 'copy'; c2.drawImage(o.canvas, 0, 0); c2.globalCompositeOperation = 'source-over';
      res.canvas = cv;
      return sync ? res : Promise.resolve(res);
    }
    glPasses(S, inp, w, h, b, 'fbo');
    if (gl.isContextLost()) throw new Error('gpu-blur: the WebGL 2 context was lost');
    if (sync) { res.pixels = glReadSync(S, w, h); return res; }
    return glRead(S, w, h).then(function (px) { res.pixels = px; return res; });
  }

  // ------------------------------------------------------------------ choosing the way
  var cal = null, calInfo = null;         // the one-time look at this device
  function probePicture(w, h) { var u = new Uint8Array(w * h * 4); for (var i = 0; i < u.length; i++) u[i] = (i * 131 + ((i / 4 / w) | 0) * 17) & 255; return u; }
  function probe() {
    var info = { glMs: null, wasmMs: null, gl: false, why: '' };
    var w = 480, h = 270, b = boxHalf(12), px = probePicture(w, h), inp = { kind: 'bytes', bytes: px, w: w, h: h };
    function runW() { var j = wasmJob(w, h, b); j.A.set(px); j.hrows(0, h); for (var s = 0; s < w; s += STRIP) j.vcols(s, Math.min(w, s + STRIP)); j.free(); }
    function timeWasm() {                 // five runs, each in its own task, the first one only warms up
      if (wasm.state !== 'ready') return Promise.resolve();
      var times = [], k = 0;
      function again() { var t0 = now(); runW(); if (k++ > 0) times.push(now() - t0); return k < 5 ? nextTask().then(again) : null; }
      return again().then(function () { times.sort(function (a, c) { return a - c; }); info.wasmMs = times[times.length >> 1]; });
    }
    function timeGL() {
      var o = ownGL(true);
      if (!o) { info.why = 'no WebGL 2, or only one the browser calls slow'; return Promise.resolve(); }
      var times = [], k = 0;
      function one() {
        var s0 = now();
        try { glPasses(o.S, inp, w, h, b, 'fbo'); } catch (e) { info.why = 'WebGL 2 failed: ' + (e && e.message); return Promise.resolve(); }
        return glFence(o.gl, 1500).then(function (ok) {
          if (!ok) { info.why = 'the card did not finish the probe in 1.5 s'; return; }
          var dt = now() - s0; if (k++ > 0) times.push(dt);
          if (k < 5) return one();
          times.sort(function (a, c) { return a - c; }); info.glMs = times[times.length >> 1];
        });
      }
      return one();
    }
    return timeWasm().then(timeGL).then(function () {
      if (info.glMs != null) {
        info.gl = info.wasmMs == null ? true : info.glMs <= 2 * info.wasmMs + 2;
        if (!info.gl) info.why = 'WebGL 2 took ' + info.glMs.toFixed(1) + ' ms against ' + info.wasmMs.toFixed(1) + ' ms for wasm on a 480 x 270 probe';
      }
      return info;
    });
  }
  function calibrate() {
    if (!cal) cal = ensureWasm().then(probe).then(function (i) { i.done = true; calInfo = i; return i; }, function () { calInfo = { gl: false, why: 'calibration failed', done: true }; return calInfo; });
    return cal;
  }

  function routeOrder(opts, out) {
    var forced = opts.route && opts.route !== 'auto' ? opts.route : null;
    if (out === 'texture') return ['webgl2'];
    if (forced && ['auto', 'webgl2', 'wasm', 'js', 'helpers', 'threads'].indexOf(forced) < 0) throw new RangeError('gpu-blur: route must be auto, webgl2, wasm, js, helpers or threads');
    if (forced === 'threads') return ['threads', 'helpers', 'wasm', 'js'];
    if (forced === 'helpers' || (!forced && opts.workers > 0)) return ['helpers', 'wasm', 'js'];
    if (forced === 'webgl2') return ['webgl2', 'wasm', 'js'];
    if (forced === 'wasm') return ['wasm', 'js'];
    if (forced === 'js') return ['js'];
    return null;
  }
  function autoOrder(out) {               // after calibrate()
    var order = [];
    if (out === 'canvas' && calInfo && calInfo.gl && !own.lost) order.push('webgl2');
    order.push('wasm', 'js');
    return order;
  }

  function normalize(src, w, h, radius, opts, sync) {
    opts = opts || {};
    var inp = describe(src, w, h), out = opts.out || 'canvas';
    if (out !== 'canvas' && out !== 'pixels' && out !== 'texture') throw new RangeError('gpu-blur: out must be "canvas", "pixels" or "texture"');
    return { inp: inp, out: out, b: boxHalf(radius), opts: opts, w: inp.w, h: inp.h };
  }

  function tryRoutes(q, order, sync) {     // sync: result at once; else Promise
    var i = 0, lastErr = null;
    function attempt(r) {
      if (r === 'webgl2') return glRoute(q.inp, q.w, q.h, q.b, q.out, q.opts, sync);
      if (r === 'threads') { if (sync) throw new Error('gpu-blur: threads need blur(), not blurSync()'); return threadsRoute(q.inp, q.w, q.h, q.b, q.out, q.opts); }
      if (r === 'helpers') { if (sync) throw new Error('gpu-blur: helpers need blur(), not blurSync()'); return helpersRoute(q.inp, q.w, q.h, q.b, q.out, q.opts); }
      if (r === 'wasm') {
        if (sync ? !wasmNow() : wasm.state !== 'ready') throw new Error('gpu-blur: wasm is not available');
        return cpuRoute('wasm', q.inp, q.w, q.h, q.b, q.out, q.opts, sync);
      }
      return cpuRoute('js', q.inp, q.w, q.h, q.b, q.out, q.opts, sync);
    }
    if (sync) {
      for (; i < order.length; i++) { try { return attempt(order[i]); } catch (e) { lastErr = e; if (q.out === 'texture') break; } }
      throw lastErr;
    }
    return new Promise(function (resolve, reject) {
      function next() {
        if (i >= order.length) { reject(lastErr || new Error('gpu-blur: no route could run')); return; }
        var r = order[i++], p;
        try { p = attempt(r); } catch (e) { lastErr = e; if (q.out === 'texture') { reject(e); return; } next(); return; }
        Promise.resolve(p).then(resolve, function (e) { lastErr = e; if (q.out === 'texture') reject(e); else next(); });
      }
      next();
    });
  }

  function blur(src, w, h, radius, opts) {
    var q;
    try { q = normalize(src, w, h, radius, opts); } catch (e) { return Promise.reject(e); }
    var order = routeOrder(q.opts, q.out);
    if (order) return (order.indexOf('wasm') >= 0 ? ensureWasm() : Promise.resolve()).then(function () { return tryRoutes(q, order, false); });
    return calibrate().then(function () { return tryRoutes(q, autoOrder(q.out), false); });
  }
  function blurSync(src, w, h, radius, opts) {
    var q = normalize(src, w, h, radius, opts), order = routeOrder(q.opts, q.out);
    if (!order) order = q.out === 'canvas' && calInfo && calInfo.gl && !own.lost ? ['webgl2', 'wasm', 'js'] : ['wasm', 'js'];
    return tryRoutes(q, order, true);
  }
  function reference(rgba, w, h, radius) {
    var q = normalize(rgba, w, h, radius, { out: 'pixels' });
    return cpuRoute('js', q.inp, q.w, q.h, q.b, 'pixels', q.opts, true).pixels;
  }

  function info() {
    var i = calInfo || {};
    var canvasRoute = i.done ? (i.gl ? 'webgl2' : wasm.state === 'ready' ? 'wasm' : 'js') : null;
    return { version: VERSION, wasm: wasm.state === 'ready', wasmState: wasm.state, wasmWhy: wasm.why, webgl2: !!(i.done && (i.glMs != null)), webgl2Worth: !!i.gl,
      glMs: i.glMs == null ? null : i.glMs, wasmMs: i.wasmMs == null ? null : i.wasmMs, why: i.why || '', canvasRoute: canvasRoute, pixelsRoute: wasm.state === 'ready' ? 'wasm' : (wasm.state === 'failed' ? 'js' : null), calibrated: !!i.done, threads: canThreads() && !threadsWhy };
  }
  function ready() { return calibrate().then(function () { return info(); }); }
  function release() {
    closeHelpers(); closeThreads(); threadsWhy = '';
    wasm.pool = [];
    if (scratch) { scratch.c.width = scratch.c.height = 1; scratch = null; }
    if (own.gl) { try { var ext = own.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* already gone */ } }
    own = { gl: null, S: null, canvas: null, lost: false, triedStrict: false, triedLoose: false };
    cal = null; calInfo = null;
  }

  return { blur: blur, blurSync: blurSync, ready: ready, info: info, reference: reference, release: release, boxHalf: boxHalf, version: VERSION };
});
