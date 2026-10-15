/*!
 * stage-curtains.js: velvet stage curtains that slide shut over a page, then fly open.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 * No dependencies. Needs: canvas 2D, Promise, Element.animate (Web Animations). Any modern browser (2020+).
 *
 *   var curtains = StageCurtains.create({ container: document.body, color: '#b3202a' });
 *   curtains.prepare().then(function () {      // paints the velvet in small slices (idle time), call early
 *     return curtains.close();                 // slides shut, resolves when both halves are in place
 *   }).then(function () {
 *     // change the scene behind the curtains here
 *     return curtains.open();                  // fly-through: halves part, whole thing grows and fades
 *   }).then(function () { curtains.destroy(); });
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageCurtains = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- small helpers ----
  function parseColor(c) {
    c = String(c).trim();
    if (c.charAt(0) === '#') {
      if (c.length === 4) c = '#' + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2) + c.charAt(3) + c.charAt(3);
      return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); });
    }
    return (c.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  }
  // Mixes color a toward color b by t (0..1). Returns 'rgb(r,g,b)'.
  function mix(a, b, t) {
    var A = parseColor(a), B = parseColor(b);
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }
  // t > 0 lightens toward white, t < 0 darkens toward black.
  function shade(c, t) { return t > 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t); }
  // Small seeded random generator (Lehmer), so a seed always paints the same velvet.
  function rng(seed) { var r = seed || 1; return function () { return (r = (r * 16807) % 2147483647) / 2147483647; }; }

  // ---- the velvet painter ----
  // Paints ONE half of a curtain onto a canvas, row by row, so it can be spread over many idle moments.
  // PW, H: panel size in CSS px. k: canvas pixels per CSS px. base: the cloth color. stepped: quantize tones (flat, chunky look).
  // Returns { canvas, step(ms) -> true when finished }.
  function velvetPainter(PW, H, k, base, seed, stepped) {
    var cw = Math.max(1, Math.round(PW * k)), ch = Math.max(1, Math.round(H * k));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var x = cv.getContext('2d'), img = x.createImageData(cw, ch), p = img.data;
    var rnd = rng(seed);
    var B = parseColor(base);
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
      canvas: cv, done: false,
      step: function (ms) {
        var t0 = performance.now();
        while (y < ch) { row(); if (ms && performance.now() - t0 > ms) break; }
        if (y >= ch && !this.done) { x.putImageData(img, 0, 0); this.done = true; }
        return this.done;
      }
    };
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

  // Draws SVG text onto a canvas (resolves with the canvas), then optionally adds the pile.
  function svgToCanvas(svg, w, h, k, pileSeed, stepped) {
    return new Promise(function (resolve) {
      var im = new Image(), el = document.createElement('canvas');
      el.width = Math.max(1, Math.round(w * k)); el.height = Math.max(1, Math.round(h * k));
      im.onload = function () {
        var x = el.getContext('2d');
        x.drawImage(im, 0, 0, el.width, el.height);
        if (pileSeed) { try { addPile(x, el.width, el.height, pileSeed, stepped); } catch (e) {} }   // (skipped where canvas read-back is blocked)
        resolve(el);
      };
      im.onerror = function () { resolve(el); };
      im.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      el.style.width = w + 'px'; el.style.height = h + 'px';
    });
  }

  // ---- the public object ----
  function create(opts) {
    opts = opts || {};
    var container = opts.container || document.body;
    var color = opts.color || '#b3202a';
    var seed = opts.seed || 11;
    var closeMs = opts.closeMs || 760, openMs = opts.openMs || 1300;
    var stepped = !!opts.stepped;
    var zIndex = opts.zIndex == null ? 2147483000 : opts.zIndex;
    var state = { jobs: null, el: null, parts: null, ready: false, size: null, destroyed: false, closed: false };

    function geometry() {
      var W = opts.width || container.clientWidth || window.innerWidth || 400;
      var H = opts.height || container.clientHeight || window.innerHeight || 800;
      var k = stepped ? 1 / 3 : Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.25);
      return { W: W, H: H, PW: Math.ceil(W / 2) + 6, k: k };
    }

    // Paints both halves in small slices during idle time, then assembles the curtain (not yet in the page).
    // opts: sliceMs (default 2.5), restMs (default 45). Resolves when ready.
    function prepare(po) {
      po = po || {};
      if (state.ready) return Promise.resolve(api);
      if (state.preparing) return state.preparing;
      var gm = geometry(); state.size = gm;
      state.jobs = [0, 1].map(function (n) { return velvetPainter(gm.PW, gm.H, gm.k, color, seed + n * 23, stepped); });   // two different paintings
      var sliceMs = po.sliceMs || 2.5, restMs = po.restMs == null ? 45 : po.restMs;
      var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 3; }, didTimeout: false }); }, 50); };
      state.preparing = new Promise(function (resolve) {
        (function slice() {
          if (state.destroyed) return resolve(api);
          idle(function (dl) {
            if (!dl.didTimeout && dl.timeRemaining() < 7 && !po.hurry) { setTimeout(slice, restMs); return; }   // not a real idle moment
            var done = true;
            state.jobs.forEach(function (j) { if (!j.done && !j.step(po.hurry ? 0 : sliceMs)) done = false; });
            if (!done) { setTimeout(slice, restMs); return; }
            resolve();
          }, { timeout: 800 });
        })();
      }).then(function () {
        return svgToCanvas(valanceSvg(gm.W, color), gm.W, 80, gm.k, 99, stepped);
      }).then(function (val) {
        var el = document.createElement('div');
        el.className = 'stage-curtains';
        el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:' + zIndex + ';transform-origin:50% 45%;will-change:transform,opacity';
        var parts = [];
        [state.jobs[0].canvas, mirrorCanvas(state.jobs[1].canvas)].forEach(function (c, side) {
          c.style.cssText = 'position:absolute;top:0;' + (side ? 'right' : 'left') + ':0;width:' + gm.PW + 'px;height:' + gm.H + 'px;will-change:transform;z-index:4';
          el.appendChild(c); parts.push({ el: c, side: side, kind: 'half' });
        });
        val.style.cssText += ';position:absolute;left:0;top:0;width:100%;z-index:30;will-change:transform';
        el.appendChild(val); parts.push({ el: val, kind: 'valance' });
        state.el = el; state.parts = parts; state.ready = true;
        return api;
      });
      return state.preparing;
    }

    // Finishes one half by writing its end place into the element itself (not relying on the animation to hold it).
    function slide(part, from, to, ms, delay, easing) {
      return new Promise(function (resolve) {
        var done = false;
        part.el.style.transform = from;
        var an = part.el.animate([{ transform: from }, { transform: to }], { duration: ms, delay: delay, easing: easing, fill: 'forwards' });
        function settle() { if (done) return; done = true; part.el.style.transform = to; try { an.cancel(); } catch (e) {} resolve(); }
        an.onfinish = settle;
        setTimeout(settle, ms + delay + 400);   // safety net: a stalled animation (seen on a phone) can't leave a half out of place
      });
    }

    // Slides the curtains shut over the container. Calls prepare() first if needed. Resolves when both halves are in place.
    function close() {
      return prepare({ hurry: true }).then(function () {
        if (state.destroyed || state.closed) return api;
        container.appendChild(state.el);
        state.closed = true;
        var halves = state.parts.filter(function (q) { return q.kind === 'half'; });
        var val = state.parts.filter(function (q) { return q.kind === 'valance'; })[0];
        val.el.style.transform = 'translateY(-86px)';
        var vAn = val.el.animate([{ transform: 'translateY(-86px)' }, { transform: 'translateY(6px)', offset: 0.7 }, { transform: 'translateY(-2px)', offset: 0.88 }, { transform: 'translateY(0)' }], { duration: closeMs * 0.84, easing: 'ease-out', fill: 'forwards' });
        vAn.onfinish = function () { val.el.style.transform = 'translateY(0)'; };
        return Promise.all(halves.map(function (q) {
          return slide(q, q.side ? 'translateX(105%)' : 'translateX(-105%)', 'translateX(0)', closeMs, q.side ? 50 : 0, 'cubic-bezier(.3,.7,.25,1)');
        }));
      }).then(function () { return api; });
    }

    // Opens the curtains. opts: flythrough (default true): the whole curtain also grows and fades, as if the camera flies through.
    function open(oo) {
      oo = oo || {};
      if (!state.closed || state.destroyed) return Promise.resolve(api);
      var fly = oo.flythrough !== false;
      var el = state.el;
      var anims = [];
      state.parts.forEach(function (q) {
        if (q.kind === 'half') anims.push(q.el.animate([{ transform: 'translateX(0)' }, { transform: q.side ? 'translateX(70%)' : 'translateX(-70%)' }], { duration: openMs, delay: 250, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }));
        else anims.push(q.el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-90px)' }], { duration: openMs * 0.85, delay: 450, easing: 'ease-in', fill: 'forwards' }));
      });
      anims.push(el.animate(fly
        ? [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.5 }, { transform: 'scale(1.5)', opacity: 0 }]
        : [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
        { duration: openMs, delay: 250, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' }));
      return new Promise(function (resolve) {
        var fin = false;
        function end() { if (fin) return; fin = true; if (el.parentNode) el.parentNode.removeChild(el); state.closed = false; state.ready = false; state.preparing = null; resolve(api); }
        anims[anims.length - 1].onfinish = end;
        setTimeout(end, openMs + 250 + 500);
      });
    }

    function destroy() {
      state.destroyed = true;
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

  return { create: create, velvetPainter: velvetPainter, valanceSvg: valanceSvg, shade: shade, mix: mix, mirrorCanvas: mirrorCanvas };
});
