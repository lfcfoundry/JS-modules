/*!
 * gif-writer-fx.js, an optional companion of gif-writer.js: animation helpers: when each picture of an animation is shown (easing, turns, pauses, reversals, exact GIF delays),
 * when names show, and picture filters (color grading, blur, sharpen, glow, vignette). No DOM; runs in the page, in a worker and in Node.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from Netflow Map. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.6.0 (API 1)
 */
var GifWriterFx = (function () {
  'use strict';
  /* ---------------------------------------------------------------- easing and timing */
  var EASES = { linear: ['Steady', function (u) { return u; }], smooth: ['Smooth start and stop', function (u) { return 0.5 - 0.5 * Math.cos(Math.PI * u); }],
    strong: ['Slow ends, fast middle', function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }], out: ['Fast start, slow stop', function (u) { return 1 - (1 - u) * (1 - u) * (1 - u); }],
    inn: ['Slow start, fast stop', function (u) { return u * u * u; }] };
  function ease(name, u) { var e = EASES[name] || EASES.smooth; return e[1](u < 0 ? 0 : u > 1 ? 1 : u); }
  /** 0 at rest, 1 at the fastest point of the easing curve. */
  function speed(name, u) {
    var d = 0.002, a = ease(name, Math.max(0, u - d)), b = ease(name, Math.min(1, u + d)), s = (b - a) / (Math.min(1, u + d) - Math.max(0, u - d)), mx = 0, k;
    for (k = 0; k <= 20; k++) { var x = k / 20, v = (ease(name, Math.min(1, x + d)) - ease(name, Math.max(0, x - d))) / (Math.min(1, x + d) - Math.max(0, x - d)); if (v > mx) mx = v; }
    return mx > 0 ? Math.min(1, s / mx) : 0;
  }
  /** GIF delays are whole hundredths of a second: round each picture's time so the running total never drifts (25 FPS is exactly 4 each). Returns hundredths, each at least 2. */
  function delaysCs(ms) {
    var out = [], want = 0, have = 0, i;
    for (i = 0; i < ms.length; i++) { want += ms[i] / 10; var cs = Math.max(2, Math.round(want - have)); out.push(cs); have += cs; }
    return out;
  }
  var NAMES = { always: 'Always', never: 'Never', still: 'Only when it holds still (fade in and out)', slowing: 'When it slows down' };
  /**
   * The pictures of a turn-around animation. o = { fps, turns (1..12), turnSec, pauseSec, reverse, ease, arc (degrees: 360 = a full turn), names, fadeSec }.
   * Returns [{ yaw (radians from the start), ms (time shown), a (names, 0..1), phase: 'move'|'hold' }]. A hold is one long picture, plus a few short ones while names fade in.
   */
  function spinPlan(o) {
    var fps = o.fps || 25, step = 1000 / fps, turns = Math.max(1, Math.min(12, Math.round(o.turns || 1))), arc = Math.max(10, Math.min(360, o.arc || 360)) * Math.PI / 180;
    var reverse = !!o.reverse || arc < 2 * Math.PI - 1e-6, pause = Math.max(0, o.pauseSec || 0) * 1000, fade = Math.max(0, o.fadeSec === undefined ? 0.4 : o.fadeSec) * 1000, mode = o.names || 'always', nm = o.ease || 'linear';
    if (reverse && turns % 2) turns++;       // turning back after every pause includes the pause where the GIF starts over, so the number of turns must be even (and a swing back and forth must end where it began, so the loop has no jump)
    var nMove = Math.max(2, Math.round((o.turnSec || 4) * fps)), nFade = Math.max(0, Math.ceil(fade / step)), out = [], yaw = 0, i, j;
    for (i = 0; i < turns; i++) {
      var dir = reverse && i % 2 ? -1 : 1, from = yaw;
      for (j = 1; j <= nMove; j++) {
        var u = j / nMove, a = 1;
        if (mode === 'never') a = 0; else if (mode === 'still') a = pause > 0 && i > 0 && j <= nFade ? 1 - j / (nFade + 1) : 0;
        else if (mode === 'slowing') a = pause > 0 ? 1 - speed(nm, u) : 1 - speed(nm, u);
        out.push({ yaw: from + dir * arc * ease(nm, u), ms: step, a: a, phase: 'move' });
      }
      yaw = from + dir * arc;
      if (pause > 0) {
        var held = 0, k, nf = mode === 'still' ? Math.min(nFade, Math.floor(pause / step)) : 0;
        for (k = 1; k <= nf; k++) { out.push({ yaw: yaw, ms: step, a: Math.min(1, k / (nf + 1)), phase: 'hold' }); held += step; }
        if (pause - held > 0.5) out.push({ yaw: yaw, ms: pause - held, a: mode === 'never' ? 0 : 1, phase: 'hold' });
      }
    }
    return out;
  }
  /** Names for a picture between two states, u 0..1 across the change: shown fully on the states, faded while it changes. */
  function stateNames(mode, u) { return mode === 'never' ? 0 : mode === 'always' ? 1 : Math.abs(2 * u - 1); }

  /* ---------------------------------------------------------------- picture filters on RGBA bytes */
  var FILTER_KEYS = { brightness: [-1, 1, 0], contrast: [-1, 1, 0], saturation: [-1, 1, 0], warmth: [-1, 1, 0], hue: [-180, 180, 0], tone: null, blur: [0, 6, 0], sharpen: [0, 1, 0], glow: [0, 1, 0], vignette: [0, 1, 0] };
  /** File size choices: [label, number of colors, tolerance for leaving a pixel as it was (distance in 0..255 color space)]. */
  var SIZES = { best: ['Best picture (largest file)', 255, 0], small: ['Smaller file (colors a little less exact)', 128, 12], smallest: ['Smallest file (fewer colors, softer changes)', 64, 20] };
  var TONES = { none: 'None', sepia: 'Old photo (sepia)', mono: 'Black and white', cyan: 'Blue-green tint', ink: 'Blue ink' };
  function plainFilter() { return { brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0, tone: 'none', blur: 0, sharpen: 0, glow: 0, vignette: 0 }; }
  function cleanFilter(v) {
    var o = plainFilter(); if (!v || typeof v !== 'object') return o;
    Object.keys(FILTER_KEYS).forEach(function (k) { var r = FILTER_KEYS[k], x = v[k]; if (k === 'tone') { if (typeof x === 'string' && Object.prototype.hasOwnProperty.call(TONES, x)) o.tone = x; } else if (typeof x === 'number' && isFinite(x)) o[k] = Math.max(r[0], Math.min(r[1], x)); });
    return o;
  }
  function isPlainFilter(f) { var p = plainFilter(); return Object.keys(p).every(function (k) { return f[k] === p[k]; }); }
  var FILTER_PRESETS = [['Normal', {}], ['Crisp', { contrast: 0.12, saturation: 0.1, sharpen: 0.6 }], ['Warm film', { warmth: 0.35, contrast: 0.08, saturation: 0.1, vignette: 0.35 }], ['Cool night', { warmth: -0.35, brightness: -0.08, contrast: 0.12, vignette: 0.45 }],
    ['Neon glow', { saturation: 0.35, contrast: 0.15, glow: 0.7, vignette: 0.3 }], ['Soft dream', { blur: 1, glow: 0.45, brightness: 0.05, saturation: -0.05 }], ['Old photo', { tone: 'sepia', contrast: 0.1, vignette: 0.5 }], ['Black and white', { tone: 'mono', contrast: 0.15 }], ['Blue ink', { tone: 'ink', contrast: 0.1 }]];
  /** One 3x3 color matrix and a brightness/contrast curve cover every color change. */
  function colorMatrix(f) {
    var m = [1, 0, 0, 0, 1, 0, 0, 0, 1], mul = function (a, b) { var r = [], i, j, k; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) { var s = 0; for (k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j]; r.push(s); } return r; };
    var s = 1 + f.saturation, lr = 0.2126, lg = 0.7152, lb = 0.0722;
    m = mul([lr * (1 - s) + s, lg * (1 - s), lb * (1 - s), lr * (1 - s), lg * (1 - s) + s, lb * (1 - s), lr * (1 - s), lg * (1 - s), lb * (1 - s) + s], m);
    if (f.hue) { var c = Math.cos(f.hue * Math.PI / 180), n = Math.sin(f.hue * Math.PI / 180); m = mul([lr + c * (1 - lr) - n * lr, lg - c * lg - n * lg, lb - c * lb + n * (1 - lb), lr - c * lr + n * 0.143, lg + c * (1 - lg) + n * 0.14, lb - c * lb - n * 0.283, lr - c * lr - n * (1 - lr), lg - c * lg + n * lg, lb + c * (1 - lb) + n * lb], m); }
    if (f.tone === 'mono') m = mul([lr, lg, lb, lr, lg, lb, lr, lg, lb], m);
    else if (f.tone === 'sepia') m = mul([0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131], m);
    else if (f.tone === 'cyan') m = mul([lr * 0.55, lg * 0.55, lb * 0.55, lr * 0.85, lg * 0.95, lb * 0.85, lr * 1.0, lg * 1.05, lb * 1.0], m);
    else if (f.tone === 'ink') m = mul([lr * 0.45, lg * 0.45, lb * 0.45, lr * 0.62, lg * 0.62, lb * 0.62, lr * 1.0, lg * 1.0, lb * 1.0], m);
    return m;
  }
  function curve(f) {
    var lut = new Uint8ClampedArray(256), c = 1 + f.contrast * 1.2, i;
    for (i = 0; i < 256; i++) lut[i] = ((i / 255 - 0.5) * c + 0.5 + f.brightness * 0.5) * 255 + 0.5;
    return lut;
  }
  /** Box blur (rows then columns) of RGBA bytes, radius r, with running sums; edges repeat the edge pixel. src and dst may not be the same array. */
  function boxBlur(src, dst, tmp, w, h, r) {
    var d = 2 * r + 1, y, x, i, W4 = w * 4, s0, s1, s2, s3, row, a, b, o;
    var inv = 65536 / d | 0;
    for (y = 0; y < h; y++) {
      row = y * W4; s0 = s1 = s2 = s3 = 0;
      for (i = -r; i <= r; i++) { o = row + (i < 0 ? 0 : i >= w ? w - 1 : i) * 4; s0 += src[o]; s1 += src[o + 1]; s2 += src[o + 2]; s3 += src[o + 3]; }
      for (x = 0; x < w; x++) {
        o = row + x * 4; tmp[o] = (s0 * inv + 32768) >> 16; tmp[o + 1] = (s1 * inv + 32768) >> 16; tmp[o + 2] = (s2 * inv + 32768) >> 16; tmp[o + 3] = (s3 * inv + 32768) >> 16;
        a = row + (x + r + 1 >= w ? w - 1 : x + r + 1) * 4; b = row + (x - r < 0 ? 0 : x - r) * 4;
        s0 += src[a] - src[b]; s1 += src[a + 1] - src[b + 1]; s2 += src[a + 2] - src[b + 2]; s3 += src[a + 3] - src[b + 3];
      }
    }
    var sums = new Int32Array(W4), k;
    for (i = -r; i <= r; i++) { o = (i < 0 ? 0 : i >= h ? h - 1 : i) * W4; for (k = 0; k < W4; k++) sums[k] += tmp[o + k]; }
    for (y = 0; y < h; y++) {
      o = y * W4; a = (y + r + 1 >= h ? h - 1 : y + r + 1) * W4; b = (y - r < 0 ? 0 : y - r) * W4;
      for (k = 0; k < W4; k++) { dst[o + k] = (sums[k] * inv + 32768) >> 16; sums[k] += tmp[a + k] - tmp[b + k]; }
    }
  }
  /** Plain JavaScript version (the fallback, and the twin the WebAssembly one is checked against). */
  function applyJs(rgba, w, h, f) {
    f = cleanFilter(f); if (isPlainFilter(f)) return rgba;
    var n = w * h, i, p;
    if (f.blur > 0 || f.sharpen > 0 || f.glow > 0) {
      var tmp = new Uint8ClampedArray(rgba.length), out = new Uint8ClampedArray(rgba.length);
      if (f.blur > 0) { var rb = Math.max(1, Math.round(f.blur * w / 640)); boxBlur(rgba, out, tmp, w, h, rb); boxBlur(out, rgba, tmp, w, h, Math.max(1, rb >> 1)); }
      if (f.sharpen > 0) { boxBlur(rgba, out, tmp, w, h, Math.max(1, Math.round(w / 480))); var amt = f.sharpen * 1.4; for (i = 0; i < rgba.length; i++) if ((i & 3) !== 3) rgba[i] = rgba[i] + amt * (rgba[i] - out[i]); }
      if (f.glow > 0) {   /* the glow is soft, so it is worked out on a quarter-size copy and spread back with a smooth blow-up */
        var q = 4, sw = Math.max(2, (w / q) | 0), sh = Math.max(2, (h / q) | 0), small = new Uint8ClampedArray(sw * sh * 4), sx, sy, dx, dy, thr = 150, so, ss;
        for (sy = 0; sy < sh; sy++) for (sx = 0; sx < sw; sx++) {
          var r0 = 0, g0 = 0, b0 = 0; for (dy = 0; dy < q; dy++) { so = ((sy * q + dy) * w + sx * q) * 4; for (dx = 0; dx < q; dx++, so += 4) { r0 += rgba[so]; g0 += rgba[so + 1]; b0 += rgba[so + 2]; } }
          r0 >>= 4; g0 >>= 4; b0 >>= 4; var l = (r0 * 54 + g0 * 183 + b0 * 19) >> 8, k = l > thr ? (l - thr) / (255 - thr) : 0, o2 = (sy * sw + sx) * 4; small[o2] = r0 * k; small[o2 + 1] = g0 * k; small[o2 + 2] = b0 * k; small[o2 + 3] = 255;
        }
        var sb = new Uint8ClampedArray(small.length), st = new Uint8ClampedArray(small.length); boxBlur(small, sb, st, sw, sh, Math.max(1, Math.round(sw / 60)));
        var g = f.glow * 1.3, fx0, fy0, x0, y0, x1, y1, tx, ty, i00, i10, i01, i11;
        for (var yy = 0; yy < h; yy++) {
          fy0 = Math.min(sh - 1, Math.max(0, (yy + 0.5) / q - 0.5)); y0 = fy0 | 0; y1 = Math.min(sh - 1, y0 + 1); ty = fy0 - y0;
          for (var xx = 0; xx < w; xx++) {
            fx0 = Math.min(sw - 1, Math.max(0, (xx + 0.5) / q - 0.5)); x0 = fx0 | 0; x1 = Math.min(sw - 1, x0 + 1); tx = fx0 - x0;
            i00 = (y0 * sw + x0) * 4; i10 = (y0 * sw + x1) * 4; i01 = (y1 * sw + x0) * 4; i11 = (y1 * sw + x1) * 4; var po = (yy * w + xx) * 4;
            for (i = 0; i < 3; i++) { var bv = (sb[i00 + i] * (1 - tx) + sb[i10 + i] * tx) * (1 - ty) + (sb[i01 + i] * (1 - tx) + sb[i11 + i] * tx) * ty; bv = bv * g; if (bv > 255) bv = 255; var av = rgba[po + i]; rgba[po + i] = 255 - ((255 - av) * (255 - bv) >> 8); }
          }
        }
      }
    }
    var m = colorMatrix(f), lut = curve(f), wr = f.warmth * 28;
    var vig = f.vignette > 0, cx = (w - 1) / 2, cy = (h - 1) / 2, inv = 1 / (cx * cx + cy * cy), vs = f.vignette * 0.85;
    for (p = 0, i = 0; i < n; i++, p += 4) {
      var r = rgba[p], gg = rgba[p + 1], bb = rgba[p + 2];
      var nr = m[0] * r + m[1] * gg + m[2] * bb + wr, ng = m[3] * r + m[4] * gg + m[5] * bb, nb = m[6] * r + m[7] * gg + m[8] * bb - wr;
      nr = lut[nr < 0 ? 0 : nr > 255 ? 255 : nr | 0]; ng = lut[ng < 0 ? 0 : ng > 255 ? 255 : ng | 0]; nb = lut[nb < 0 ? 0 : nb > 255 ? 255 : nb | 0];
      if (vig) { var x = i % w - cx, y = ((i / w) | 0) - cy, d = (x * x + y * y) * inv, k2 = 1 - vs * d * d; nr *= k2; ng *= k2; nb *= k2; }
      rgba[p] = nr; rgba[p + 1] = ng; rgba[p + 2] = nb;
    }
    return rgba;
  }

  /* ---------------------------------------------------------------- WebAssembly twin (wasm/pixfx.c, rebuilt by wasm/build-fx.sh + wasm/embed-fx.py) */
  var WASM_B64 = /*WASM:pixfx:BEGIN*/'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'/*WASM:pixfx:END*/;
  var wx = null;
  /** Starts compiling the WebAssembly twin; resolves true when it is ready (apply() then uses it), false when this browser cannot (apply() keeps using JavaScript). */
  function initWasm() {
    if (wx) return Promise.resolve(true);
    if (!WASM_B64 || typeof WebAssembly === 'undefined' || typeof atob !== 'function') return Promise.resolve(false);
    var bin = atob(WASM_B64), bytes = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return WebAssembly.instantiate(bytes, {}).then(function (r) { wx = r.instance.exports; return true; }, function () { return false; });
  }
  function wasmReady() { return !!wx; }
  function applyWasm(rgba, w, h, f) {
    f = cleanFilter(f); if (isPlainFilter(f)) return rgba;
    var n4 = w * h * 4, sw = Math.max(2, (w / 4) | 0), sh = Math.max(2, (h / 4) | 0), sn = sw * sh * 4, al = function (x) { return (x + 15) & ~15; };
    var A = al(wx.__heap_base.value), B = A + al(n4), C = B + al(n4), S = C + al(n4), SB = S + al(sn), ST = SB + al(sn), SU = ST + al(sn), LU = SU + al(Math.max(w, sw) * 16), M = LU + 256, END = M + 80;
    var mem = wx.memory; if (mem.buffer.byteLength < END) mem.grow(Math.ceil((END - mem.buffer.byteLength) / 65536));
    var u8 = new Uint8Array(mem.buffer); u8.set(rgba, A);
    if (f.blur > 0) { var rb = Math.max(1, Math.round(f.blur * w / 640)); wx.blur(A, B, C, w, h, rb, SU); wx.blur(B, A, C, w, h, Math.max(1, rb >> 1), SU); }
    if (f.sharpen > 0) { wx.blur(A, B, C, w, h, Math.max(1, Math.round(w / 480)), SU); wx.unsharp(A, B, n4, f.sharpen * 1.4); }
    if (f.glow > 0) { wx.glow_down(A, S, w, sw, sh); wx.blur(S, SB, ST, sw, sh, Math.max(1, Math.round(sw / 60)), SU); wx.glow_up(A, SB, w, h, sw, sh, f.glow * 1.3); }
    var m = colorMatrix(f), lut = curve(f), cx = (w - 1) / 2, cy = (h - 1) / 2, inv = 1 / (cx * cx + cy * cy);
    new Float64Array(mem.buffer, M, 9).set(m); u8.set(lut, LU);
    wx.grade(A, w, h, M, LU, f.warmth * 28, f.vignette > 0 ? 1 : 0, cx, cy, inv, f.vignette * 0.85);
    rgba.set(u8.subarray(A, A + n4)); return rgba;
  }
  /** Changes the pixels of an RGBA picture in place (alpha is left alone). f is a cleaned filter. Returns the same array. Uses WebAssembly when initWasm() has finished. */
  function apply(rgba, w, h, f) { return wx ? applyWasm(rgba, w, h, f) : applyJs(rgba, w, h, f); }
  return { initWasm: initWasm, wasmReady: wasmReady, applyJs: applyJs, applyWasm: applyWasm, EASES: EASES, NAMES: NAMES, SIZES: SIZES, TONES: TONES, FILTER_PRESETS: FILTER_PRESETS, ease: ease, speed: speed, delaysCs: delaysCs, spinPlan: spinPlan, stateNames: stateNames, plainFilter: plainFilter, cleanFilter: cleanFilter, isPlainFilter: isPlainFilter, colorMatrix: colorMatrix, curve: curve, apply: apply };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GifWriterFx;
