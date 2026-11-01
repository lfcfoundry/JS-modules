/*!
 * stage-curtains.js: velvet stage curtains that slide shut over a page, then fly open.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.4.2 (API 1)
 *
 * No dependencies. Needs: canvas 2D, Promise, Element.animate (Web Animations). Any modern browser (2020+).
 * create({ worker: true }) paints the velvet in a background worker (the page then needs worker-src blob:); StageCurtains.startWorker() starts it early, release() ends it.
 * The velvet's pixel loop runs in WebAssembly (a 2.6 KB SIMD module inside this file; the page policy needs 'wasm-unsafe-eval') and in JavaScript where that cannot start (no WebAssembly, no WebAssembly SIMD, no 'wasm-unsafe-eval'):
 * the picture is the same to within a few counts of 255 (the JavaScript loop is the reference). create({ wasm: false }) forces JavaScript.
 *
 *   var curtains = StageCurtains.create({ container: document.body, color: '#b3202a' });
 *   curtains.prepare().then(function () {      // paints the velvet in small slices (idle time), call early
 *     return curtains.close();                 // slides shut, resolves when both halves are in place
 *   }).then(function () {
 *     // change the scene behind the curtains here
 *     return curtains.open();                  // fly-through: halves part, whole thing grows and fades
 *   }).then(function () { curtains.destroy(); });
 *
 * Nothing here rejects: if the curtain cannot be painted (no canvas 2D, out of memory) prepare(), close() and open() still
 * resolve and the curtain is simply skipped, so a scene change is never blocked. When the system asks for reduced motion the
 * curtain fades in and out instead of sliding and zooming (option reducedMotion: true / false forces it either way).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageCurtains = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- small helpers ----
  var FALLBACK_RGB = [179, 32, 42];   // the default curtain red, used when a color cannot be understood
  // Reads #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (numbers or percentages; alpha is ignored). Returns [r,g,b] or null.
  function parseSimple(c) {
    var m, v;
    if (c.charAt(0) === '#') {
      m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
      if (!m) return null;
      v = m[1];
      if (v.length <= 4) v = v.charAt(0) + v.charAt(0) + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2);
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    m = /^rgba?\(([^)]*)\)$/i.exec(c);
    if (!m) return null;
    v = m[1].replace(/\/.*$/, '').split(/[\s,]+/).filter(function (x) { return x !== ''; });
    if (v.length < 3) return null;
    v = v.slice(0, 3).map(function (x) { var n = parseFloat(x); if (x.indexOf('%') > 0) n *= 2.55; return Math.max(0, Math.min(255, Math.round(n))); });
    return v.some(isNaN) ? null : v;
  }
  // Names, hsl() and other forms: let the browser's canvas turn them into #rrggbb (it cannot read CSS variables like var(--x)).
  function parseViaCanvas(c) {
    try {
      var x = document.createElement('canvas').getContext('2d'), a, b;
      x.fillStyle = '#000000'; x.fillStyle = c; a = x.fillStyle;
      x.fillStyle = '#ffffff'; x.fillStyle = c; b = x.fillStyle;
      return a === b ? parseSimple(String(a)) : null;   // different results mean the browser rejected the color
    } catch (e) { return null; }
  }
  function parseColor(c) {
    c = String(c == null ? '' : c).trim();
    return parseSimple(c) || parseViaCanvas(c) || FALLBACK_RGB.slice();
  }
  // Mixes color a toward color b by t (0..1). Returns 'rgb(r,g,b)'.
  function mix(a, b, t) {
    var A = parseColor(a), B = parseColor(b);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }
  // t > 0 lightens toward white, t < 0 darkens toward black.
  function shade(c, t) { return t > 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t); }
  var WASM_B64 = /*WASM:BEGIN*/'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'/*WASM:END*/;
  var WASM_ROWS = 16;   // rows per kernel call: the clock is read between calls, so a slice ends within about a millisecond of its limit

  // ---- the velvet maker: no page objects at all, so the very same code (as text) also runs in a background worker ----
  // makeCore(WASM_B64, WASM_ROWS) gives { rng, velvetCore }. Its source text is also what the worker is built from (see "the background worker" below), so there is one copy of the painter.
  function makeCore(WASM_B64, WASM_ROWS) {
    // Small seeded random generator (Lehmer), so a seed always paints the same velvet.
    function rng(seed) { var r = seed || 1; return function () { return (r = (r * 16807) % 2147483647) / 2147483647; }; }

    // ---- the WebAssembly velvet loop (wasm/velvet.c, built by wasm/build.sh, put here by wasm/embed.py) ----
    // The per-pixel loop of the velvet painter below, in WebAssembly (SIMD, four pixels at a time in single precision): the same picture to within a few counts (99.5% of the pixels within 5 of 255 is the
    // module's picture gate, not byte for byte; stepped curtains take an exact scalar path), about 3 to 6 times faster than the JavaScript loop. row() stays the reference.
    // One instance and one memory serve every painter; they are made on the first paint. If WebAssembly is missing, the page policy lacks
    // 'wasm-unsafe-eval', or anything throws, kernel() is null and the JavaScript loop paints instead (option wasm: false forces that).
    var kern;   // undefined: not tried yet; null: not usable; else { ex, mem, base, owner }
    function kernel() {
      if (kern !== undefined) return kern;
      kern = null;
      try {
        if (typeof WebAssembly !== 'object' || !WebAssembly || typeof atob !== 'function') return kern;
        var t, b, i;
        if (typeof Uint8Array.fromBase64 === 'function') b = Uint8Array.fromBase64(WASM_B64);
        else { t = atob(WASM_B64); b = new Uint8Array(t.length); for (i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); }
        var mem = new WebAssembly.Memory({ initial: 4 }), ex = new WebAssembly.Instance(new WebAssembly.Module(b), { env: { memory: mem } }).exports;
        kern = { ex: ex, mem: mem, base: ex.__heap_base.value, owner: null };
      } catch (e) { kern = null; }
      return kern;
    }

    // Paints ONE half of a curtain into a pixel buffer, row by row, so it can be spread over many idle moments.
    // PW, H: panel size in CSS px. k: canvas pixels per CSS px. B: the cloth color as [r, g, b]. stepped: quantize tones (flat, chunky look). wasm: false paints with JavaScript only.
    // px: the Uint8ClampedArray to paint into (Math.round(PW * k) * Math.round(H * k) * 4 long); made here when left out.
    // Returns { px, cw, ch, engine ('wasm' or 'js'), done, step(ms) -> true when finished }.
    function velvetCore(PW, H, k, B, seed, stepped, wasm, px) {
      var cw = Math.max(1, Math.round(PW * k)), ch = Math.max(1, Math.round(H * k));
      var p = px || new Uint8ClampedArray(cw * ch * 4);
        var rnd = rng(seed);
        // Orange, coral and yellow turn brown or olive when shaded toward black, and pale colors turn gray, so for those
        // the folds are shaded less deeply ("lift"). A very dark red is brightened to a rich crimson first.
        var cmx = Math.max(B[0], B[1], B[2]), cmn = Math.min(B[0], B[1], B[2]), lift = 0;
        if (cmx > 200 && cmx - cmn > 0.45 * cmx) {
          var hh = 60 * (cmx === B[0] ? (B[1] - B[2]) / (cmx - cmn) : (cmx === B[1] ? 2 + (B[2] - B[0]) / (cmx - cmn) : 4 + (B[0] - B[1]) / (cmx - cmn)));
          if (hh < 0) hh += 360;
          if (hh >= 8 && hh <= 70) lift = 1;
        } else if (cmx > 200 && cmn > 0.6 * cmx) lift = 1;
        if (cmx < 150 && B[0] === cmx && B[0] > 1.8 * Math.max(B[1], B[2])) { var up = 176 / cmx; B = B.map(function (v) { return v * up; }); lift = 1; }
        var warm = (B[2] > B[0] && B[2] >= B[1]) ? 1 : 1.08;   // a little warm tint, except for blue-leaning colors
        // The fold surface across the flat panel: three long waves plus a few sharp crease lines.
        var n = Math.ceil(PW * 1.6) + 4, hgt = new Float32Array(n), waves = [], w, i;
        for (w = 0; w < 3; w++) waves.push({ l: [110, 70, 46][w] * (0.8 + rnd() * 0.4), a: [1, 0.55, 0.25][w], ph: rnd() * 6.28 });
        for (i = 0; i < n; i++) { var v = 0; waves.forEach(function (q) { v += q.a * Math.sin(i / q.l * 6.283 + q.ph); }); hgt[i] = v; }
        var creases = []; for (var c = 0; c < 4; c++) creases.push({ at: rnd() * PW * 1.4, w: 2 + rnd() * 3 });
        var mn = 1e9, mx = -1e9; for (i = 0; i < n; i++) { mn = Math.min(mn, hgt[i]); mx = Math.max(mx, hgt[i]); }
        for (i = 0; i < n; i++) hgt[i] = (hgt[i] - mn) / (mx - mn);   // 0 = deepest trough, 1 = crest
        var G = 64, grain = new Float32Array(G * G); for (var g = 0; g < G * G; g++) grain[g] = rnd() * 2 - 1;
        // Per-column lookup tables, so the pixel loop does no pow() calls.
        var T85 = new Float64Array(n), T6 = new Float64Array(n), TSL = new Float64Array(n), THEM = new Float64Array(n);
        for (var t = 0; t < n; t++) {
          var hv = hgt[t];
          T85[t] = 0.2 + 0.95 * Math.pow(hv, 0.85);      // crests bright, troughs deep
          T6[t] = Math.pow(hv, 6) * 0.18;                // sheen on the very crests
          THEM[t] = (10 + hv * 6) * k;                   // the wavy hem line
          if (t >= 1 && t <= n - 2) { var sl0 = (hgt[t + 1] - hgt[t - 1]) * 0.5 * 40; TSL[t] = 1 + Math.max(-0.25, Math.min(0.25, -sl0 * 0.12)); }
        }
        var ncr = creases.length, crAt = creases.map(function (q) { return q.at; }), crW2 = creases.map(function (q) { return q.w * 2; });
        var y = 0, ph = rnd() * 6;
        // The WebAssembly path: sin and pow stay in JavaScript, as one value per row and one per column, handed over as tables.
        var K = wasm === false || !(B[0] >= 0 && B[1] >= 0 && B[2] >= 0) ? null : kernel(), job = {}, T = null;
        if (K) {
          var rows = new Float64Array(3 * ch), edgeT = new Float64Array(cw), yy, cc, ee;
          for (yy = 0; yy < ch; yy++) {
            var yf0 = yy / ch;
            rows[3 * yy] = (0.72 + 0.28 * Math.sin(Math.min(1, yf0 / 0.4) * Math.PI / 2)) * (1 - Math.pow(Math.max(0, yf0 - 0.5) / 0.5, 1.5) * 0.85);
            rows[3 * yy + 1] = 1 + 0.22 * (1 - yf0);
            rows[3 * yy + 2] = Math.sin(yy / k * 0.004 + ph) * 6;
          }
          for (cc = 0; cc < cw; cc++) {
            if (cc > cw - 16 * k) { ee = (cc - (cw - 16 * k)) / (16 * k); edgeT[cc] = (1 + 0.35 * Math.sin(Math.min(1, ee / 0.55) * Math.PI)) * (1 - 0.8 * Math.pow(Math.max(0, (ee - 0.55) / 0.45), 1.5)); }
            else edgeT[cc] = 1;
          }
          // Per fold column and per canvas column values that row() would recompute for every pixel, evaluated here once with the same expressions (see wasm/velvet.c).
          var aux = new Float64Array(6 * n + 2 * cw), q, cr, fl;
          for (q = 0; q < n; q++) {
            var s0 = T85[q] * TSL[q]; if (lift) s0 = 0.34 + s0 * 0.66;
            aux[6 * q] = ch - THEM[q]; aux[6 * q + 1] = s0; aux[6 * q + 2] = T6[q]; aux[6 * q + 3] = 0.5 + 0.6 * hgt[q];
            // a crease can touch a pixel whose fold column is q when the pixel's own position is within half a column of q (any position at all for the two clamped end columns)
            fl = 0;
            for (cr = 0; cr < ncr; cr++) if (q === 1 ? crAt[cr] - crW2[cr] < 1.6 : q === n - 2 ? crAt[cr] + crW2[cr] > n - 1.6 : Math.abs(q - crAt[cr]) < crW2[cr] + 1) fl = 1;
            aux[6 * q + 4] = fl;
          }
          for (q = 0; q < cw; q++) { var xq = q / k; aux[6 * n + 2 * q] = xq; aux[6 * n + 2 * q + 1] = 1 - xq / PW; }
          // The same values in single precision for the 4-pixel loop: per fold column 8 floats (shade, sheen, gold base, hem, 4 spare), then the n crease flags, then position, leading-edge ratio and
          // leading-edge factor per canvas column (cw + 8 floats each, so the last group of four can read past the end), then the 64 x 64 grain. Carried as a Float64Array over the same bytes so load() copies it unchanged.
          var a32 = new Float32Array(stepped ? 2 : (9 * n + 3 * (cw + 8) + 4096 + 1) & ~1), oX = 9 * n, oE = oX + cw + 8, oG = oE + cw + 8, oR = oG + cw + 8;
          if (!stepped) {   // a stepped curtain takes the exact scalar path and never reads these
            for (q = 0; q < n; q++) { a32[8 * q] = aux[6 * q + 1]; a32[8 * q + 1] = aux[6 * q + 2]; a32[8 * q + 2] = aux[6 * q + 3]; a32[8 * q + 3] = aux[6 * q]; a32[8 * n + q] = aux[6 * q + 4]; }
            for (q = 0; q < cw; q++) { a32[oX + q] = aux[6 * n + 2 * q]; a32[oE + q] = aux[6 * n + 2 * q + 1]; a32[oG + q] = edgeT[q]; }
            for (q = 0; q < 4096; q++) a32[oR + q] = grain[q];
          }
          T = { list: [hgt, T85, T6, THEM, TSL, crAt, crW2, edgeT, Float64Array.from(grain), new Float64Array([PW, k, ch, warm, B[0], B[1], B[2], stepped ? 0.03 : 0.02, lift, stepped ? 1 : 0]), rows, aux, new Float64Array(a32.buffer)], off: [] };
        }
        // Puts this painter's tables into the kernel's memory (unless they are already there) and returns where the rows will land.
        function load() {
          var list = T.list, off = T.off, pos = K.base, i, need;
          for (i = 0; i < list.length; i++) { off[i] = pos; pos += list[i].length * 8; }
          T.pix = pos; need = pos + WASM_ROWS * cw * 4;
          if (K.mem.buffer.byteLength < need) K.mem.grow(Math.ceil((need - K.mem.buffer.byteLength) / 65536));
          if (K.owner !== job) { for (i = 0; i < list.length; i++) new Float64Array(K.mem.buffer, off[i], list[i].length).set(list[i]); K.owner = job; }
        }
        // Paints rows y .. y1 - 1 with the kernel and copies them into the image.
        function bulk(y1) {
          var o = T.off;
          K.ex.paint(T.pix, cw, ch, y, y1, n, ncr, o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], o[9], o[10], o[11], o[12]);
          p.set(new Uint8Array(K.mem.buffer, T.pix, (y1 - y) * cw * 4), y * cw * 4);
          y = y1;
        }
        function row() {
          var yf = y / ch;
          // stage light: pooled in the upper middle, falling off to near black at the hem
          var light = (0.72 + 0.28 * Math.sin(Math.min(1, yf / 0.4) * Math.PI / 2)) * (1 - Math.pow(Math.max(0, yf - 0.5) / 0.5, 1.5) * 0.85);
          var fan = 1 + 0.22 * (1 - yf);                       // folds sit closer together up at the rod
          var wob = Math.sin(y / k * 0.004 + ph) * 6;
          for (var c2 = 0; c2 < cw; c2++) {
            var o = (y * cw + c2) * 4, X = c2 / k;
            var edge = 1 - X / PW;                              // 1 at the outer edge, 0 at the middle
            // folds fan out from the rod and meander a little, but only away from the middle, so the inner edge is a clean vertical line
            var u = PW - (PW - X) * fan + wob * edge + 2;
            var ui = Math.max(1, Math.min(n - 2, Math.round(u)));
            var hem = ch - THEM[ui];
            if (y > hem + 1.5 * k) { p[o] = 14; p[o + 1] = 8; p[o + 2] = 8; p[o + 3] = 255; continue; }   // dark floor under the hem
            var sh = T85[ui] * TSL[ui];
            if (lift) sh = 0.34 + sh * 0.66;
            for (var ci = 0; ci < ncr; ci++) { var d = Math.abs(u - crAt[ci]); if (d < crW2[ci]) sh *= 0.55 + 0.45 * (d / crW2[ci]); }
            // the leading edge: a soft rolled hem catching a little light, then turning away into the overlap's shadow
            if (c2 > cw - 16 * k) { var e = (c2 - (cw - 16 * k)) / (16 * k); sh *= (1 + 0.35 * Math.sin(Math.min(1, e / 0.55) * Math.PI)) * (1 - 0.8 * Math.pow(Math.max(0, (e - 0.55) / 0.45), 1.5)); }
            sh *= light * (1 + grain[(y & 63) * G + (c2 & 63)] * (stepped ? 0.03 : 0.02));
            var R = B[0] * sh * warm, Gc = B[1] * sh, Bc = B[2] * sh;
            var sheen = T6[ui] * light; R += (255 - R) * sheen; Gc += (255 - Gc) * sheen * 0.7; Bc += (255 - Bc) * sheen * 0.5;
            if (y > hem - 2.5 * k) { var gl = (0.5 + 0.6 * hgt[ui]) * Math.max(0.5, light); R = 231 * gl; Gc = 180 * gl; Bc = 58 * gl; }   // gold trim
            if (stepped) { R = Math.round(R / 20) * 20; Gc = Math.round(Gc / 20) * 20; Bc = Math.round(Bc / 20) * 20; }
            p[o] = R > 255 ? 255 : R; p[o + 1] = Gc > 255 ? 255 : Gc; p[o + 2] = Bc > 255 ? 255 : Bc; p[o + 3] = 255;
          }
          y++;
        }

      return {
        px: p, cw: cw, ch: ch, done: false,
        engine: K ? 'wasm' : 'js',
        step: function (ms) {
          var t0 = performance.now();
          if (K && y < ch) {
            try {
              load();
              while (y < ch) { bulk(Math.min(ch, y + WASM_ROWS)); if (ms && performance.now() - t0 > ms) break; }
            } catch (e) { K = null; this.engine = 'js'; }   // anything went wrong: the JavaScript loop finishes the remaining rows
          }
          if (!K) while (y < ch) { row(); if (ms && performance.now() - t0 > ms) break; }
          if (y >= ch) this.done = true;
          return this.done;
        }
      };
    }
    return { rng: rng, kernel: kernel, velvetCore: velvetCore };
  }
  var CORE = makeCore(WASM_B64, WASM_ROWS), rng = CORE.rng, kernel = CORE.kernel;

  // ---- the background worker (option worker: true) ----
  // The velvet of one curtain half takes about 30 ms of the page's own thread. In a worker it is painted without touching the page: the worker runs makeCore's own source text (this file keeps one copy of the
  // painter) and hands the finished pixels back as a transferable buffer, so the page only copies them into the canvas. One worker serves both halves and ends itself after a few idle seconds
  // (or at once with StageCurtains.release()). If anything about the worker fails (no Worker or Blob, a page policy without worker-src blob:, a thrown or posted error), the half is painted on the page instead,
  // from the start, and the worker is not tried again.
  var WK = null, wkBroken = false, WK_IDLE_MS = 4000, OPT = {};   // OPT: test switches (copy: copy arrived pixels as 1.x did; noWake: wait for the next slice as 1.x did), set through _test
  function workerOK() {
    return !wkBroken && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL === 'function' && typeof URL.createObjectURL === 'function';
  }
  function wkFail() {   // the worker cannot be used: every waiting half goes to the page
    var w = WK; wkBroken = true; WK = null;
    if (!w) return;
    clearTimeout(w.timer);
    try { w.w.terminate(); } catch (e) { /* gone */ }
    try { URL.revokeObjectURL(w.url); } catch (e) { /* gone */ }
    Object.keys(w.jobs).forEach(function (id) { w.jobs[id].failed = true; });
  }
  function getWorker() {
    if (WK) { clearTimeout(WK.timer); return WK; }
    if (!workerOK()) return null;
    try {
      var src = 'var C = (' + makeCore.toString() + ')(' + JSON.stringify(WASM_B64) + ', ' + WASM_ROWS + ');\n' +
        'onmessage = function (e) { var m = e.data; try { var c = C.velvetCore(m.PW, m.H, m.k, m.B, m.seed, m.stepped, m.wasm, null); c.step(0); var b = c.px.buffer; postMessage({ id: m.id, buf: b, engine: c.engine }, [b]); } catch (err) { postMessage({ id: m.id, error: String(err) }); } };';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), w = new Worker(url), rec = { w: w, url: url, jobs: {}, n: 0, timer: 0 };
      w.onmessage = function (e) {
        var m = e.data, j = rec.jobs[m && m.id];
        if (!j) return;
        delete rec.jobs[m.id];
        if (m.error || !m.buf) j.failed = true; else { j.buf = m.buf; j.engine = m.engine; j.ready = true; }
        if (j.kick) j.kick();   // wake prepare() now instead of at its next rest
        if (!Object.keys(rec.jobs).length) { clearTimeout(rec.timer); rec.timer = setTimeout(release, WK_IDLE_MS); }
      };
      w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); wkFail(); };
      WK = rec;
      return rec;
    } catch (e) { wkFail(); return null; }
  }
  function release() {   // ends the worker; a later painter makes a new one
    var w = WK; WK = null;
    if (!w) return;
    clearTimeout(w.timer);
    try { w.w.terminate(); } catch (e) { /* gone */ }
    try { URL.revokeObjectURL(w.url); } catch (e) { /* gone */ }
    Object.keys(w.jobs).forEach(function (id) { w.jobs[id].failed = true; });
  }

  // ---- the velvet painter ----
  // Paints ONE half of a curtain onto a canvas, row by row, so it can be spread over many idle moments.
  // PW, H: panel size in CSS px. k: canvas pixels per CSS px. base: the cloth color. stepped: quantize tones (flat, chunky look).
  // wasm: false paints with the JavaScript loop only (default: WebAssembly when it can start; the pixels are the same either way).
  // worker: true paints in a background worker (engine then reads 'worker+wasm' or 'worker+js'; 'wasm' or 'js' when it fell back to the page): the first step() starts the job, later steps return false until the
  // pixels have arrived, then they are put on the canvas and step() returns true. Same pixels as without the worker.
  // Returns { canvas, engine ('wasm', 'js', 'worker+wasm' or 'worker+js'), done, step(ms) -> true when finished }.
  function velvetPainter(PW, H, k, base, seed, stepped, wasm, worker) {
    var cw = Math.max(1, Math.round(PW * k)), ch = Math.max(1, Math.round(H * k));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var x = cv.getContext('2d'), img = x.createImageData(cw, ch), B = parseColor(base);
    var core = null, job = null, self = {};
    function onPage() { core = CORE.velvetCore(PW, H, k, B, seed, stepped, wasm, img.data); self.engine = core.engine; }
    self.canvas = cv; self.done = false;
    if (worker) self.engine = 'worker+' + (wasm === false ? 'js' : 'wasm'); else onPage();
    self.step = function (ms) {
      if (self.done) return true;
      if (worker && !core) {
        if (!job) {
          var wk = getWorker();
          if (wk) {
            job = { ready: false, failed: false, buf: null, engine: null, kick: function () { if (self.onready) self.onready(); } };
            wk.jobs[++wk.n] = job;
            try { wk.w.postMessage({ id: wk.n, PW: PW, H: H, k: k, B: B, seed: seed, stepped: stepped, wasm: wasm }); } catch (e) { wkFail(); }
          }
        }
        if (job && job.failed) job = null;
        if (job && job.ready) {
          try { x.putImageData(OPT.copy || typeof ImageData !== 'function' ? (img.data.set(new Uint8ClampedArray(job.buf)), img) : new ImageData(new Uint8ClampedArray(job.buf), cw, ch), 0, 0);   /* the arrived pixels as they are, no copy */ self.engine = 'worker+' + job.engine; self.done = true; return true; } catch (e) { job = null; }
        }
        if (job) return false;   // still painting in the worker
        onPage();               // no worker, or it failed: paint here, from the start
      }
      core.step(ms); self.engine = core.engine;
      if (core.done) { x.putImageData(img, 0, 0); self.done = true; }
      return self.done;
    };
    return self;
  }

  function mirrorCanvas(src) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var x = c.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return c;
  }

  // The valance: velvet swags on a gold rod, with gold fringe beads and little tassels between the swags (SVG text).
  var valanceIds = 0;
  function valanceSvg(w, base) {
    var id = 'scv' + (valanceIds++), n = Math.max(3, Math.round(w / 70)), sw = w / n;
    var s = '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + shade(base, -0.45) + '"/><stop offset="0.45" stop-color="' + shade(base, 0.08) + '"/><stop offset="1" stop-color="' + shade(base, -0.45) + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset="0.5" stop-color="#e7b43a"/><stop offset="1" stop-color="#8a5a0c"/></linearGradient></defs>' +
      '<rect width="' + w + '" height="26" fill="' + shade(base, -0.5) + '"/>';
    for (var i = 0; i < n; i++) {
      var x = i * sw;
      s += '<path d="M' + (x - 4) + ',20 Q' + (x + sw / 2) + ',70 ' + (x + sw + 4) + ',20 L' + (x + sw + 4) + ',16 L' + (x - 4) + ',16Z" fill="url(#' + id + ')"/>' +
        '<path d="M' + (x + 2) + ',24 Q' + (x + sw / 2) + ',62 ' + (x + sw - 2) + ',24" fill="none" stroke="' + shade(base, -0.55) + '" stroke-width="1.2" opacity="0.6"/>';
      for (var k = 1; k < 6; k++) {
        var t = k / 6, fx = x + sw * t, fy = 20 + (1 - Math.pow(2 * t - 1, 2)) * 28 + 10;
        s += '<line x1="' + fx + '" y1="' + (fy - 6) + '" x2="' + fx + '" y2="' + (fy + 5) + '" stroke="#e7b43a" stroke-width="2"/><circle cx="' + fx + '" cy="' + (fy + 6) + '" r="1.8" fill="#ffe38a"/>';
      }
      s += '<g transform="translate(' + (x + sw) + ',18)"><rect x="-3" y="0" width="6" height="10" rx="2" fill="url(#' + id + 'r)"/><path d="M-5,10 L5,10 L7,30 L-7,30Z" fill="url(#' + id + 'r)"/></g>';
    }
    s += '<rect y="10" width="' + w + '" height="7" fill="url(#' + id + 'r)"/><rect y="3" width="' + w + '" height="3" fill="#e7b43a"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="80">' + s + '</svg>';
  }

  // Velvet pile: fine vertical fibers, grain and soft "crushed velvet" mottling, painted over an existing canvas.
  function addPile(x, W, H, seed, stepped) {
    var d = x.getImageData(0, 0, W, H), p = d.data, rnd = rng(seed);
    var fib = new Float32Array(W), prev = 0, i;
    for (i = 0; i < W; i++) { prev = prev * 0.45 + (rnd() * 2 - 1) * 0.55; fib[i] = prev; }
    var a1 = rnd() * 6, a2 = rnd() * 6, gs = stepped ? 0.09 : 0.07, fs = stepped ? 0 : 0.1, ms = stepped ? 0.04 : 0.07;
    for (var y = 0; y < H; y++) for (var c = 0; c < W; c++) {
      var o = (y * W + c) * 4;
      if (!p[o + 3]) continue;
      var f = 1 + fib[c] * fs + (rnd() * 2 - 1) * gs + Math.sin(c * 0.09 + a1 + y * 0.004) * Math.sin(y * 0.011 + a2) * ms;
      p[o] = Math.min(255, p[o] * f); p[o + 1] = Math.min(255, p[o + 1] * f); p[o + 2] = Math.min(255, p[o + 2] * f);
    }
    x.putImageData(d, 0, 0);
  }

  // Draws SVG text onto a canvas (resolves with the canvas), then optionally adds the pile. Always resolves (a timer covers an
  // image that never loads), so a stuck valance cannot block a scene change.
  function svgToCanvas(svg, w, h, k, pileSeed, stepped) {
    return new Promise(function (resolve) {
      var im = new Image(), el = document.createElement('canvas'), fin = false, tm = 0;
      function finish() { if (fin) return; fin = true; if (tm) clearTimeout(tm); resolve(el); }
      el.width = Math.max(1, Math.round(w * k)); el.height = Math.max(1, Math.round(h * k));
      im.onload = function () {
        try {
          var x = el.getContext('2d');
          x.drawImage(im, 0, 0, el.width, el.height);
          if (pileSeed) { try { addPile(x, el.width, el.height, pileSeed, stepped); } catch (e) {} }   // (skipped where canvas read-back is blocked)
        } catch (e) {}
        finish();
      };
      im.onerror = finish;
      tm = setTimeout(finish, 4000);
      im.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      el.style.width = w + 'px'; el.style.height = h + 'px';
    });
  }

  // ---- the public object ----
  var CALM_MS = 320;
  var WARM_STEP_MS = 4;   // how much velvet a waiting close() paints each frame   // length of the fade used instead of the slide when the system asks for reduced motion

  // Plays one Web Animation on `el` for the style property `prop` ('transform' or 'opacity') and writes the end value INTO the
  // element, so a stalled or cancelled animation cannot leave it out of place (a timer is the safety net). The finished animation
  // is kept (not cancelled): cancelling it made the right half jump a hair on a phone. Returns { promise, abort, read }.
  function slide(el, prop, frames, finalValue, ms, delay, easing, axis) {
    var done = false, tm = 0, an = null, res, promise = new Promise(function (r) { res = r; });
    function settle() { if (done) return; done = true; if (tm) clearTimeout(tm); try { el.style[prop] = finalValue; } catch (e) {} res(); }
    try {
      el.style[prop] = frames[0][prop];
      an = el.animate(frames, { duration: ms, delay: delay, easing: easing, fill: 'forwards' });
      an.onfinish = settle;
      tm = setTimeout(settle, ms + delay + 400);   // safety net: a stalled animation (seen on a phone) can't leave a half out of place
    } catch (e) { settle(); }
    return {
      promise: promise, el: el, prop: prop, axis: axis,
      // the value on screen right now, as a string that can be written back into the element
      read: function () {
        try {
          var cs = window.getComputedStyle(el);
          if (prop === 'opacity') { var o = parseFloat(cs.opacity); return String(isNaN(o) ? 1 : o); }
          var m = /^matrix\(([^)]+)\)$/.exec(cs.transform), px = 0;
          if (m) px = parseFloat(m[1].split(',')[axis === 'y' ? 5 : 4]) || 0;
          return axis === 'y' ? 'translateY(' + px + 'px)' : 'translateX(' + px + 'px)';
        } catch (e) { return null; }
      },
      // stops the animation for good (an interrupted close) without writing the end value
      abort: function () { if (done) return; done = true; if (tm) clearTimeout(tm); try { if (an) an.cancel(); } catch (e) {} res(); },
      isDone: function () { return done; }
    };
  }

  function create(opts) {
    opts = opts || {};
    var container = opts.container || (typeof document !== 'undefined' ? document.body : null);
    var color = opts.color || '#b3202a';
    var seed = opts.seed || 11;
    var closeMs = opts.closeMs || 760, openMs = opts.openMs || 1300;
    var stepped = !!opts.stepped;   // opts.wasm: false paints the velvet with JavaScript only
    var zIndex = opts.zIndex == null ? 2147483000 : opts.zIndex;
    var state = { jobs: null, el: null, parts: null, ready: false, size: null, destroyed: false, closed: false,
      preparing: null, closePromise: null, opening: null, openEnd: null, slides: [], locked: null, hurry: false, waiting: null };

    function geometry() {
      var W = opts.width || container.clientWidth || window.innerWidth || 400;
      var H = opts.height || container.clientHeight || window.innerHeight || 800;
      var k = stepped ? 1 / 3 : Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.25);
      return { W: W, H: H, PW: Math.ceil(W / 2) + 6, k: k };
    }

    // True when the system asks for less motion (or opts.reducedMotion says so). Read each time a close or open starts.
    function isCalm() {
      if (opts.reducedMotion === true || opts.reducedMotion === false) return opts.reducedMotion;
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }

    // While closed, the elements that were in the container are made inert (no clicks, no Tab key, hidden from screen readers)
    // and put back when the curtain is gone. Elements added behind the curtain during the scene change are left alone.
    function lockPage() {
      var kids = container.children, i, c;
      state.locked = [];
      for (i = 0; kids && i < kids.length; i++) {
        c = kids[i];
        if (c === state.el || !c.setAttribute || (c.hasAttribute && c.hasAttribute('inert'))) continue;
        c.setAttribute('inert', ''); state.locked.push(c);
      }
    }
    function unlockPage() {
      var l = state.locked; state.locked = null;
      if (l) l.forEach(function (c) { try { c.removeAttribute('inert'); } catch (e) {} });
    }

    // Throws away a finished, not yet shown curtain (it is painted again by the next prepare()).
    function forget() { state.ready = false; state.el = state.parts = state.jobs = null; state.preparing = null; state.size = null; }

    // Paints both halves in small slices during idle time, then assembles the curtain (not yet in the page).
    // opts: sliceMs (default 2.5), restMs (default 45), hurry (paint at once). Resolves when ready, and also resolves (with the curtain
    // skipped) if painting is impossible or the curtain was destroyed meanwhile. Never rejects.
    function prepare(po) {
      po = po || {};
      if (state.destroyed) return Promise.resolve(api);
      if (state.ready) return Promise.resolve(api);
      if (state.preparing) return state.preparing;
      var gm, jobs;
      try {
        gm = geometry(); state.size = gm;
        jobs = state.jobs = [0, 1].map(function (n) { return velvetPainter(gm.PW, gm.H, gm.k, color, seed + n * 23, stepped, opts.wasm, opts.worker); });   // two different paintings
      } catch (e) { state.jobs = null; return Promise.resolve(api); }   // no canvas 2D (or no memory): skip the curtain
      var sliceMs = po.sliceMs || 2.5, restMs = po.restMs == null ? 45 : po.restMs;
      var realIdle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';
      // Without requestIdleCallback (Safari ships it switched off) a timer stands in for it. It cannot tell how much time is left,
      // so the "is this a real idle moment" check below is skipped and the painting goes ahead in short slices.
      var idle = realIdle
        ? function (f, o) { return window.requestIdleCallback(f, o); }
        : function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 3; }, didTimeout: false }); }, 16); };
      var p = new Promise(function (resolve, reject) {
        var restT = 0, over = false;
        function rest(ms) { restT = setTimeout(function () { restT = 0; slice(); }, ms); }
        // a worker's pixels arrived while this rests: put them in now (no wait for the rest and the next idle moment)
        if (!OPT.noWake) jobs.forEach(function (j) { j.onready = function () {
          if (!restT || over || state.destroyed) return;
          clearTimeout(restT); restT = 0;
          try { var all = true; jobs.forEach(function (jj) { if (!jj.done && !jj.step(sliceMs)) all = false; }); if (all) { over = true; resolve(); } else rest(restMs); } catch (e) { over = true; reject(e); }
        }; });
        function slice() {
          if (over) return;
          if (state.destroyed) return resolve();
          try {
            // close() is waiting for the velvet: paint 4 ms of it every frame (the page keeps moving) until the wait is used up
            var w = state.waiting;
            if (w && performance.now() - w.since < w.ms) {
              var all = true;
              jobs.forEach(function (j) { if (!j.done && !j.step(WARM_STEP_MS)) all = false; });
              if (all) { over = true; resolve(); } else rest(16);
              return;
            }
            idle(function (dl) {
              if (state.destroyed) return resolve();
              try {
                if (state.waiting && performance.now() - state.waiting.since < state.waiting.ms) { slice(); return; }   // close() asked while this was queued
                var hurry = po.hurry || state.hurry || !!state.waiting;
                var forced = !!dl.didTimeout;   // a page that is busy every frame never reports an idle moment: this turn is the one it gets
                if (over) return;
                if (realIdle && !hurry && !forced && dl.timeRemaining() < 7) { rest(restMs); return; }   // not a real idle moment
                var done = true;
                jobs.forEach(function (j) { if (!j.done && !j.step(hurry ? 0 : forced ? sliceMs * 2 : sliceMs)) done = false; });
                if (!done) { rest(restMs); return; }
                over = true; resolve();
              } catch (e) { reject(e); }
            }, { timeout: 250 });
          } catch (e) { reject(e); }
        }
        slice();
      }).then(function () {
        return state.destroyed ? null : svgToCanvas(valanceSvg(gm.W, color), gm.W, 80, gm.k, 99, stepped);
      }).then(function (val) {
        if (state.destroyed || !val) return api;
        var px = stepped ? ';image-rendering:pixelated' : '';   // chunky look only in stepped mode; otherwise let the browser smooth it
        var el = document.createElement('div');
        el.className = 'stage-curtains';
        el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:' + zIndex + ';transform-origin:50% 45%;will-change:transform,opacity';
        var parts = [];
        [jobs[0].canvas, mirrorCanvas(jobs[1].canvas)].forEach(function (c, side) {
          c.style.cssText = 'position:absolute;top:0;' + (side ? 'right' : 'left') + ':0;width:' + gm.PW + 'px;height:' + gm.H + 'px;will-change:transform;z-index:4' + px;
          el.appendChild(c); parts.push({ el: c, side: side, kind: 'half' });
        });
        val.style.cssText += ';position:absolute;left:0;top:0;width:100%;z-index:30;will-change:transform' + px;
        el.appendChild(val); parts.push({ el: val, kind: 'valance' });
        state.el = el; state.parts = parts; state.ready = true; state.hurry = false; state.waiting = null;
        return api;
      }).catch(function () {
        // Anything failed while painting: skip the curtain, but let the scene change go on.
        state.preparing = null; state.ready = false; state.el = state.parts = state.jobs = null; state.hurry = false; state.waiting = null;
        return api;
      });
      state.preparing = p;
      return p;
    }

    // Slides the curtains shut over the container. Calls prepare() first if needed. Resolves when both halves are in place
    // (a second close() while one is running gets the same answer, at the same moment). If the curtain could not be painted,
    // resolves at once and nothing is shown.
    function close() {
      if (state.destroyed) return Promise.resolve(api);
      if (state.opening) return state.opening.then(function () { return close(); });
      if (state.closePromise) return state.closePromise;
      // The velvet was painted for another size (the window was turned or resized since prepare()): paint it again, so no gap shows.
      if (state.ready && state.size) { var g = geometry(); if (g.W !== state.size.W || g.H !== state.size.H || g.k !== state.size.k) forget(); }
      // The caller is waiting now. Unless painting is done, paint what is left a little each frame for up to warmMs (default 2500),
      // then all at once; warmMs: 0 paints all at once straight away.
      var warmMs = opts.warmMs == null ? 2500 : opts.warmMs;
      if (!state.ready) { if (warmMs > 0) state.waiting = { since: performance.now(), ms: warmMs }; else state.hurry = true; }
      var p = state.closePromise = prepare({ hurry: warmMs <= 0 }).then(function () {
        if (state.destroyed || !state.ready || !state.el) { if (state.closePromise === p) state.closePromise = null; return api; }
        var calm = isCalm(), el = state.el;
        var halves = state.parts.filter(function (q) { return q.kind === 'half'; });
        var val = state.parts.filter(function (q) { return q.kind === 'valance'; })[0];
        state.closed = true; state.slides = [];
        el.setAttribute('aria-hidden', 'true');    // decorative: screen readers skip it
        if (calm) el.style.opacity = '0';
        container.appendChild(el);
        if (opts.lockPage === true || (opts.lockPage !== false && calm)) lockPage();
        if (calm) {
          // calm: everything is already in place, the whole curtain just fades in
          halves.forEach(function (q) { q.el.style.transform = 'translateX(0)'; });
          val.el.style.transform = 'translateY(0)';
          var f = slide(el, 'opacity', [{ opacity: 0 }, { opacity: 1 }], '1', CALM_MS, 0, 'ease-out');
          state.slides.push(f);
          return f.promise;
        }
        var v = slide(val.el, 'transform', [{ transform: 'translateY(-86px)' }, { transform: 'translateY(6px)', offset: 0.7 }, { transform: 'translateY(-2px)', offset: 0.88 }, { transform: 'translateY(0)' }], 'translateY(0)', closeMs * 0.84, 0, 'ease-out', 'y');
        state.slides.push(v);
        return Promise.all(halves.map(function (q) {
          var h = slide(q.el, 'transform', [{ transform: q.side ? 'translateX(105%)' : 'translateX(-105%)' }, { transform: 'translateX(0)' }], 'translateX(0)', closeMs, q.side ? 50 : 0, 'cubic-bezier(.3,.7,.25,1)', 'x');
          state.slides.push(h);
          return h.promise;
        }));
      }).then(function () { return api; }, function () { return api; });
      return p;
    }

    // Opens the curtains. opts: flythrough (default true): the whole curtain also grows and fades, as if the camera flies through.
    // Safe to call while the curtains are still sliding shut: they turn around from where they are, with no jump.
    function open(oo) {
      oo = oo || {};
      if (state.destroyed) return Promise.resolve(api);
      if (state.opening) return state.opening;
      if (state.closePromise && !state.closed) return state.closePromise.then(function () { return open(oo); });   // still being painted
      if (!state.closed || !state.el) return Promise.resolve(api);
      var calm = isCalm(), fly = oo.flythrough !== false && !calm, el = state.el;
      // A close that is still sliding: stop it where it is and write that place into the elements, so the open starts from there.
      var frozen = state.slides.map(function (h) { return h.isDone() ? null : h.read(); });
      state.slides.forEach(function (h, i) { h.abort(); if (frozen[i] != null) { try { h.el.style[h.prop] = frozen[i]; } catch (e) {} } });
      state.slides = [];
      function from(part, axis) {   // where this part is right now, as a keyframe value
        var cur = part.el.style.transform || '', m = /^translate([XY])\((-?[\d.eE+-]+)px\)$/.exec(cur);
        return m && m[1] === axis ? cur : 'translate' + axis + '(0)';
      }
      var startOpacity = parseFloat(el.style.opacity); if (isNaN(startOpacity)) startOpacity = 1;
      var anims = [];
      state.opening = new Promise(function (resolve) {
        var fin = false, tm = 0;
        function end() {
          if (fin) return; fin = true; if (tm) clearTimeout(tm);
          unlockPage();
          try { if (el.parentNode) el.parentNode.removeChild(el); el.removeAttribute('aria-hidden'); } catch (e) {}
          state.closed = false; state.ready = false; state.preparing = null; state.closePromise = null; state.opening = null; state.openEnd = null; state.hurry = false; state.waiting = null;
          resolve(api);
        }
        state.openEnd = end;
        try {
          if (calm) {
            anims.push(el.animate([{ opacity: startOpacity }, { opacity: 0 }], { duration: CALM_MS, easing: 'ease-in', fill: 'forwards' }));
          } else {
            state.parts.forEach(function (q) {
              if (q.kind === 'half') anims.push(q.el.animate([{ transform: from(q, 'X') }, { transform: q.side ? 'translateX(70%)' : 'translateX(-70%)' }], { duration: openMs, delay: 250, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }));
              else anims.push(q.el.animate([{ transform: from(q, 'Y') }, { transform: 'translateY(-90px)' }], { duration: openMs * 0.85, delay: 450, easing: 'ease-in', fill: 'forwards' }));
            });
            anims.push(el.animate(fly
              ? [{ transform: 'scale(1)', opacity: startOpacity }, { transform: 'scale(1.2)', opacity: startOpacity, offset: 0.5 }, { transform: 'scale(1.5)', opacity: 0 }]
              : [{ opacity: startOpacity }, { opacity: startOpacity, offset: 0.7 }, { opacity: 0 }],
              { duration: openMs, delay: 250, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' }));
          }
          anims[anims.length - 1].onfinish = end; anims[anims.length - 1].oncancel = end;   // (a timer ends it too, if the browser never says)
          tm = setTimeout(end, (calm ? CALM_MS : openMs + 250) + 500);
        } catch (e) { end(); }
      });
      return state.opening;
    }

    function destroy() {
      state.destroyed = true;
      state.slides.forEach(function (h) { h.abort(); }); state.slides = [];
      if (state.openEnd) state.openEnd();   // resolves an open() that is still running
      unlockPage();
      if (state.el && state.el.parentNode) state.el.parentNode.removeChild(state.el);
      state.el = state.parts = state.jobs = null;
    }

    var api = {
      prepare: prepare, close: close, open: open, destroy: destroy,
      get isReady() { return state.ready; },
      get isClosed() { return state.closed; },
      get element() { return state.el; }
    };
    return api;
  }

  return { _test: OPT, create: create, wasmAvailable: function () { return !!kernel(); }, release: release, startWorker: function () { return !!getWorker(); }, velvetPainter: velvetPainter, valanceSvg: valanceSvg, shade: shade, mix: mix, mirrorCanvas: mirrorCanvas };
});
