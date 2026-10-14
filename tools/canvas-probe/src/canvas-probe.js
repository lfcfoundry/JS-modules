/*!
 * canvas-probe.js: counts what a canvas 2D game really asks the browser to do, frame by frame. For test builds only.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 JNFoo. MIT License (see LICENSE at the repository root).
 *
 *   var probe = CanvasProbe.install();          // wraps CanvasRenderingContext2D (and the Offscreen one if present)
 *   // ... in your loop, once per frame, after drawing:
 *   probe.frame();
 *   // ... later:
 *   console.log(probe.text());                  // plain words
 *   var r = probe.report();                     // the same, as numbers
 *   probe.uninstall();
 *
 * It reports, per frame (median, 95th percentile and worst of the last `keep` frames):
 *   - how many calls of each drawing method were made (drawImage, beginPath, fill, stroke, fillRect, fillText, gradients ...)
 *   - save() and restore() balance: contexts still holding an unmatched save() when the frame ended (a "slow leak"),
 *     restore() calls with nothing to restore, and the deepest nesting
 *   - drawImage audits: nine-argument calls whose source rectangle sticks out of the bitmap (on one or both axes) and
 *     draws shrunk below half size
 *   - style writes (fillStyle, strokeStyle, lineWidth, globalAlpha, font ...) and how many repeat the value already set
 *   - painted area: the area of every drawImage and fillRect (clipped to the canvas) divided by the canvas area ("overdraw")
 *
 * It counts; it does not time. Wrapping every call makes drawing slower, so never judge milliseconds with it on, and
 * never ship it. It never throws out of a wrapped call: if its own bookkeeping fails, the original call still runs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CanvasProbe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CALLS = ['drawImage', 'beginPath', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'measureText', 'createLinearGradient', 'createRadialGradient', 'createPattern', 'putImageData', 'getImageData'];
  var STYLES = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'shadowBlur', 'globalCompositeOperation'];

  function pct(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0; }
  function stats(values) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    return { median: pct(s, 0.5), p95: pct(s, 0.95), max: s.length ? s[s.length - 1] : 0 };
  }
  function round(n) { return Math.round(n * 100) / 100; }

  function defaultPrototypes() {
    var out = [];
    if (typeof CanvasRenderingContext2D !== 'undefined') out.push(CanvasRenderingContext2D.prototype);
    if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') out.push(OffscreenCanvasRenderingContext2D.prototype);
    return out;
  }

  // The device-pixel area that a w x h rectangle at (x, y) covers on this context's canvas, after its transform, clipped to the canvas.
  function rectArea(ctx, x, y, w, h) {
    var t = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    var xs = [], ys = [], i, px, py, cx = [x, x + w, x, x + w], cy = [y, y, y + h, y + h];
    for (i = 0; i < 4; i++) { px = t.a * cx[i] + t.c * cy[i] + t.e; py = t.b * cx[i] + t.d * cy[i] + t.f; xs.push(px); ys.push(py); }
    var cw = ctx.canvas ? ctx.canvas.width : 0, ch = ctx.canvas ? ctx.canvas.height : 0;
    var x0 = Math.max(0, Math.min.apply(null, xs)), x1 = Math.min(cw, Math.max.apply(null, xs));
    var y0 = Math.max(0, Math.min.apply(null, ys)), y1 = Math.min(ch, Math.max.apply(null, ys));
    return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
  }

  function install(opts) {
    opts = opts || {};
    var keep = opts.keep || 240, protos = opts.prototypes || defaultPrototypes();
    var restoreList = [], depth = typeof WeakMap === 'function' ? new WeakMap() : null, rafId = 0, installed = true;
    var cur, ring, open, under, maxDepth, bigCanvas, totals;

    function fresh() { return { calls: {}, nine: 0, overBoth: 0, overOne: 0, small: 0, writes: 0, same: 0, area: 0 }; }
    function reset() { cur = fresh(); ring = []; open = 0; under = 0; maxDepth = 0; bigCanvas = 0; totals = { frames: 0, leakFrames: 0, underflows: 0 }; if (depth && typeof WeakMap === 'function') depth = new WeakMap(); }
    reset();

    function getDepth(ctx) { return depth ? depth.get(ctx) || 0 : (ctx.__cpDepth || 0); }
    function setDepth(ctx, d) { if (depth) depth.set(ctx, d); else ctx.__cpDepth = d; }

    function noteCanvas(ctx) { var c = ctx.canvas, a = c ? c.width * c.height : 0; if (a > bigCanvas) bigCanvas = a; }

    function auditDraw(ctx, a) {
      var img = a[0], n = a.length;
      if (!img) return;
      var iw = img.naturalWidth || img.videoWidth || img.width || 0, ih = img.naturalHeight || img.videoHeight || img.height || 0;
      var sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      if (n >= 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; cur.nine++; }
      else if (n >= 5) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; }
      else { dx = a[1]; dy = a[2]; dw = sw; dh = sh; }
      if (n >= 9) {
        var ox = sx + sw > iw + 0.5 || sx < -0.5, oy = sy + sh > ih + 0.5 || sy < -0.5;
        if (ox && oy) cur.overBoth++; else if (ox || oy) cur.overOne++;
      }
      var t = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1 };
      var kx = Math.sqrt(t.a * t.a + t.b * t.b), ky = Math.sqrt(t.c * t.c + t.d * t.d);
      if (sw > 0 && sh > 0 && Math.abs(dw) * kx / sw < 0.5 && Math.abs(dh) * ky / sh < 0.5) cur.small++;
      cur.area += rectArea(ctx, dx, dy, dw, dh);
    }

    function wrapMethod(proto, name, before) {
      var d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || typeof d.value !== 'function') return;
      var orig = d.value;
      Object.defineProperty(proto, name, { value: function () {
        if (installed) { try { before(this, arguments); } catch (e) { /* bookkeeping must never break the game */ } }
        return orig.apply(this, arguments);
      }, writable: true, configurable: true, enumerable: d.enumerable });
      restoreList.push([proto, name, d]);
    }

    function wrapStyle(proto, name) {
      var d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || !d.get || !d.set) return;
      Object.defineProperty(proto, name, {
        get: function () { return d.get.call(this); },
        set: function (v) {
          if (!installed) { d.set.call(this, v); return; }
          var before; try { before = d.get.call(this); } catch (e) { before = undefined; }
          d.set.call(this, v);
          try { cur.writes++; if (d.get.call(this) === before) cur.same++; } catch (e) { /* ignore */ }
        },
        configurable: true, enumerable: d.enumerable
      });
      restoreList.push([proto, name, d]);
    }

    protos.forEach(function (proto) {
      CALLS.forEach(function (name) {
        wrapMethod(proto, name, function (ctx, a) {
          cur.calls[name] = (cur.calls[name] || 0) + 1;
          if (name === 'drawImage') { noteCanvas(ctx); auditDraw(ctx, a); }
          else if (name === 'fillRect') { noteCanvas(ctx); cur.area += rectArea(ctx, a[0], a[1], a[2], a[3]); }
        });
      });
      wrapMethod(proto, 'save', function (ctx) {
        var d = getDepth(ctx) + 1; if (d === 1) open++; setDepth(ctx, d); if (d > maxDepth) maxDepth = d;
      });
      wrapMethod(proto, 'restore', function (ctx) {
        var d = getDepth(ctx);
        if (d <= 0) { under++; totals.underflows++; return; }
        d--; setDepth(ctx, d); if (d === 0) open--;
      });
      STYLES.forEach(function (name) { wrapStyle(proto, name); });
    });

    function frame() {
      var rec = cur; cur = fresh();
      rec.leaks = open; rec.area = bigCanvas ? rec.area / bigCanvas : 0;
      totals.frames++; if (open > 0) totals.leakFrames++;
      ring.push(rec); if (ring.length > keep) ring.shift();
    }

    function pick(fn) { return ring.map(fn); }
    function report() {
      var calls = {}, all = {}, names = [];
      ring.forEach(function (r) { for (var k in r.calls) all[k] = 1; });
      for (var k in all) names.push(k);
      names.sort().forEach(function (k) { calls[k] = stats(pick(function (r) { return r.calls[k] || 0; })); });
      var writes = pick(function (r) { return r.writes; }), same = pick(function (r) { return r.same; });
      var sumW = writes.reduce(function (a, b) { return a + b; }, 0), sumS = same.reduce(function (a, b) { return a + b; }, 0);
      return {
        frames: totals.frames, kept: ring.length, calls: calls,
        saveRestore: { deepest: maxDepth, openContextsNow: open, leakFrames: totals.leakFrames, restoreWithoutSave: totals.underflows },
        drawImage: {
          nineArgument: stats(pick(function (r) { return r.nine; })),
          sourceOverhangBothAxes: ring.reduce(function (a, r) { return a + r.overBoth; }, 0),
          sourceOverhangOneAxis: ring.reduce(function (a, r) { return a + r.overOne; }, 0),
          belowHalfSize: stats(pick(function (r) { return r.small; }))
        },
        styleWrites: { perFrame: stats(writes), repeatShare: sumW ? round(sumS / sumW) : 0 },
        paintedArea: stats(pick(function (r) { return round(r.area); }))
      };
    }

    function text() {
      var r = report(), o = [], k, c;
      if (!r.kept) return 'No frames recorded yet: call probe.frame() once per frame.';
      o.push('Canvas probe: ' + r.kept + ' frames kept (' + r.frames + ' seen).');
      var parts = [];
      for (k in r.calls) { c = r.calls[k]; if (c.median || c.max) parts.push(k + ' ' + c.median + (c.max > c.median ? ' (worst ' + c.max + ')' : '')); }
      o.push('Calls per frame (median): ' + (parts.join(', ') || 'none') + '.');
      var s = r.saveRestore;
      o.push('save()/restore(): ' + (s.leakFrames ? s.leakFrames + ' frame(s) ended with an unmatched save() on ' + s.openContextsNow + ' context(s) now: a slow leak.' : 'balanced at the end of every frame.') +
        (s.restoreWithoutSave ? ' ' + s.restoreWithoutSave + ' restore() call(s) had nothing to restore.' : '') + ' Deepest nesting ' + s.deepest + '.');
      var d = r.drawImage;
      o.push('drawImage: ' + d.nineArgument.median + ' nine-argument calls per frame; source sticks out of the bitmap on both axes ' + d.sourceOverhangBothAxes + ' time(s), on one axis ' + d.sourceOverhangOneAxis +
        '; shrunk below half size ' + d.belowHalfSize.median + ' per frame (worst ' + d.belowHalfSize.max + ').');
      o.push('Style writes: ' + r.styleWrites.perFrame.median + ' per frame, ' + Math.round(r.styleWrites.repeatShare * 100) + '% repeat the value already set.');
      o.push('Painted area (drawImage and fillRect, clipped): ' + r.paintedArea.median + ' times the canvas per frame (worst ' + r.paintedArea.max + ').');
      return o.join('\n');
    }

    function uninstall() {
      installed = false;
      if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      restoreList.forEach(function (x) { Object.defineProperty(x[0], x[1], x[2]); });
      restoreList = [];
    }

    if (opts.auto && typeof requestAnimationFrame === 'function') {
      (function tick() { if (!installed) return; frame(); rafId = requestAnimationFrame(tick); })();
    }
    return { frame: frame, report: report, text: text, reset: reset, uninstall: uninstall, calls: CALLS.slice(), styles: STYLES.slice() };
  }

  return { install: install };
});
