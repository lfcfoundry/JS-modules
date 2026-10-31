/*!
 * gpu-blur.js: blur a picture on the graphics card (WebGL 2), or in WebAssembly, or in plain JavaScript, and give the same picture every way.
 * The module picks the way by what the browser can do, never by the browser's name. Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.1 (API 1)
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
 * opts.route:  'auto' (default), 'webgl2', 'wasm' or 'js'. A route that cannot run gives way to the next one (webgl2, wasm, js); result.route says which one ran.
 * opts.into:   a canvas to draw the result into (out 'canvas'); opts.gl: your own WebGL 2 context (out 'texture'); opts.budget: ms of work per slice (default 3).
 *
 * The blur is three box passes along each axis (a close Gaussian), in whole numbers, so WebGL 2, wasm and JavaScript give the same bytes.
 * No eval, no new Function, no blob: address, no worker; WebAssembly needs 'wasm-unsafe-eval' in script-src and falls back to JavaScript without it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.GpuBlur = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_PIXELS = 33554432;          // 8192 x 4096
  var STRIP = 16;                     // columns per vertical strip (the wasm kernel's limit)
  var WASM_B64 = /*WASM:BEGIN*/'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'/*WASM:END*/;

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
      phases.push({ total: nb, max: 1, chunk: 1, fn: function (b0, b1) { var y0 = b0 * per, y1 = Math.min(h, b1 * per); sx.drawImage(dom, 0, y0, w, y1 - y0, 0, y0, w, y1 - y0); } });
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
      glMs: i.glMs == null ? null : i.glMs, wasmMs: i.wasmMs == null ? null : i.wasmMs, why: i.why || '', canvasRoute: canvasRoute, pixelsRoute: wasm.state === 'ready' ? 'wasm' : (wasm.state === 'failed' ? 'js' : null), calibrated: !!i.done };
  }
  function ready() { return calibrate().then(function () { return info(); }); }
  function release() {
    wasm.pool = [];
    if (scratch) { scratch.c.width = scratch.c.height = 1; scratch = null; }
    if (own.gl) { try { var ext = own.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { /* already gone */ } }
    own = { gl: null, S: null, canvas: null, lost: false, triedStrict: false, triedLoose: false };
    cal = null; calInfo = null;
  }

  return { blur: blur, blurSync: blurSync, ready: ready, info: info, reference: reference, release: release, boxHalf: boxHalf, version: VERSION };
});
