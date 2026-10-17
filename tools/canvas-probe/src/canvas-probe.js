/*!
 * canvas-probe.js: counts what a canvas 2D game really asks the browser to do, frame by frame. For test builds only.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *   var probe = CanvasProbe.install();          // wraps CanvasRenderingContext2D (and the Offscreen one if present)
 *   // ... in your loop, once per frame, after drawing:
 *   probe.frame();
 *   // ... later:
 *   console.log(probe.text());                  // plain words
 *   var r = probe.report();                     // the same, as numbers
 *   var v = probe.check({ callsPerFrame: 620 }); // { ok, problems }: pass or fail for a test run (see check() below)
 *   probe.uninstall();
 *
 * It reports, per frame (median, 95th percentile and worst of the last `keep` frames):
 *   - how many calls of each drawing method were made (drawImage, beginPath, fill, stroke, fillRect, fillText, gradients,
 *     transforms, path building ...)
 *   - save() and restore() balance: contexts still holding an unmatched save() when the frame ended (a "slow leak"),
 *     restore() calls with nothing to restore, and the deepest nesting. reset() and a canvas width/height write empty the
 *     browser's saved-state stack, so they zero the count; a context that was thrown away stops counting.
 *   - drawImage audits: nine-argument calls whose source rectangle sticks out of the bitmap (on one or both axes) and
 *     draws shrunk below half size. A source whose size is unknown (image not loaded yet) is skipped, not flagged.
 *   - style writes (fillStyle, strokeStyle, lineWidth, globalAlpha, font, filter ...) and how many repeat the value already set
 *   - painted area: the area of every drawImage and fillRect (clipped to the canvas) divided by that canvas's own area
 *     ("overdraw"), with the main on-screen canvas on its own line
 *   - paths that keep growing because beginPath() is missing, and getImageData on a context made without willReadFrequently
 *   - with install({ deep: true }): draws made while a filter, a shadow or a non-default blend mode is set (off by default: it adds about 170 ns per draw)
 *
 * Counts of problems (leaks, overhangs, growing paths ...) are totals since the last reset(); the per-frame numbers cover the
 * last `keep` frames. It counts; it does not time. Wrapping every call makes drawing slower, so never judge milliseconds with
 * it on, and never ship it. It never throws out of a wrapped call or out of install(): if its own bookkeeping fails, the
 * original call still runs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CanvasProbe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CALLS = ['drawImage', 'beginPath', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'measureText', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'putImageData', 'getImageData',
    'setTransform', 'translate', 'scale', 'rotate', 'setLineDash',
    'rect', 'arc', 'arcTo', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'];
  // calls that add to the current path; a path only starts over at beginPath()
  var PATH = { rect: 1, arc: 1, arcTo: 1, ellipse: 1, roundRect: 1, moveTo: 1, lineTo: 1, quadraticCurveTo: 1, bezierCurveTo: 1 };
  var STYLES = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'shadowBlur', 'globalCompositeOperation',
    'filter', 'imageSmoothingEnabled', 'shadowColor', 'lineCap', 'textAlign', 'textBaseline'];
  var storeId = 0;

  function pct(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0; }
  function stats(values) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    return { median: pct(s, 0.5), p95: pct(s, 0.95), max: s.length ? s[s.length - 1] : 0 };
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function sum(list, fn) { var t = 0, i; for (i = 0; i < list.length; i++) t += fn(list[i]); return t; }
  function gopd(o, k) { return Object.getOwnPropertyDescriptor(o, k); }

  function defaultPrototypes() {
    var out = [];
    if (typeof CanvasRenderingContext2D !== 'undefined') out.push(CanvasRenderingContext2D.prototype);
    if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') out.push(OffscreenCanvasRenderingContext2D.prototype);
    return out;
  }
  function defaultCanvasPrototypes() {
    var out = [];
    if (typeof HTMLCanvasElement !== 'undefined') out.push(HTMLCanvasElement.prototype);
    if (typeof OffscreenCanvas !== 'undefined') out.push(OffscreenCanvas.prototype);
    return out;
  }

  // A key -> value map that does not keep its keys alive (a hidden property on very old browsers without WeakMap).
  function makeStore() {
    if (typeof WeakMap === 'function') { var m = new WeakMap(); return { get: function (k) { return m.get(k); }, set: function (k, v) { m.set(k, v); } }; }
    var p = '__cp' + (storeId++);
    return { get: function (k) { return k[p]; }, set: function (k, v) { try { k[p] = v; } catch (e) { /* frozen */ } } };
  }
  // A reference that lets a thrown-away context be forgotten (plain reference where WeakRef is missing).
  function makeRef(o) {
    if (typeof WeakRef === 'function') { try { return new WeakRef(o); } catch (e) { /* fall through */ } }
    return { deref: function () { return o; } };
  }

  // The device-pixel area that a w x h rectangle at (x, y) covers on this context's canvas, after the transform t, clipped to the canvas.
  function rectArea(ctx, t, x, y, w, h) {
    var x1 = x + w, y1 = y + h, a = t.a, b = t.b, c = t.c, d = t.d, e = t.e, f = t.f;
    var p0 = a * x + c * y + e, p1 = a * x1 + c * y + e, p2 = a * x + c * y1 + e, p3 = a * x1 + c * y1 + e;
    var q0 = b * x + d * y + f, q1 = b * x1 + d * y + f, q2 = b * x + d * y1 + f, q3 = b * x1 + d * y1 + f;
    var cw = ctx.canvas ? ctx.canvas.width : 0, ch = ctx.canvas ? ctx.canvas.height : 0;
    var x0 = Math.max(0, Math.min(p0, p1, p2, p3)), xe = Math.min(cw, Math.max(p0, p1, p2, p3));
    var y0 = Math.max(0, Math.min(q0, q1, q2, q3)), ye = Math.min(ch, Math.max(q0, q1, q2, q3));
    return xe > x0 && ye > y0 ? (xe - x0) * (ye - y0) : 0;
  }
  var IDENT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  function num(v) { return typeof v === 'number' && v > 0 && isFinite(v) ? v : 0; }
  // The size of a drawImage source as [width, height]; [0, 0] means "not known (yet)".
  function sourceSize(img) {
    if (!img || (typeof img !== 'object' && typeof img !== 'function')) return [0, 0];
    if ('naturalWidth' in img) return img.complete === false ? [0, 0] : [num(img.naturalWidth), num(img.naturalHeight)];   // an <img>; unloaded = unknown
    if ('displayWidth' in img) return [num(img.displayWidth), num(img.displayHeight)];                                   // a VideoFrame
    if ('videoWidth' in img) return [num(img.videoWidth), num(img.videoHeight)];                                         // a <video>
    return [num(img.width), num(img.height)];                                                                            // canvas, ImageBitmap, plain objects
  }

  function inert(err) {
    var msg = String(err && err.message ? err.message : err), none = { median: 0, p95: 0, max: 0 };
    return {
      frame: function () {}, reset: function () {}, forget: function () {}, uninstall: function () {}, calls: CALLS.slice(), styles: STYLES.slice(),
      report: function () { return { frames: 0, kept: 0, calls: {}, installFailed: msg, skipped: [], paintedArea: none }; },
      check: function () { return { ok: false, problems: ['Canvas probe could not start: ' + msg] }; },
      text: function () { return 'Canvas probe could not start: ' + msg; }
    };
  }

  function install(opts) {
    try { return build(opts || {}); } catch (e) { return inert(e); }   // never throw out of install()
  }

  function build(opts) {
    var keep = opts.keep || 240, protos = opts.prototypes || defaultPrototypes(), canvasProtos = opts.canvasPrototypes || defaultCanvasPrototypes();
    var growAfter = opts.pathGrowFrames || 3, deep = !!opts.deep;
    var restoreList = [], skipped = [], rafId = 0, installed = true, frameNo = 0;
    var states, openList, cur, ring, prevPath, maxDepth, totals;
    var meta = makeStore();         // creation options per context; kept across reset()
    var canvasCtx = makeStore();    // canvas -> its 2D context, so a width/height write can find the context

    function fresh() {
      return { calls: {}, total: 0, nine: 0, overBoth: 0, overOne: 0, unknown: 0, small: 0, writes: 0, same: 0, readback: 0, leaks: 0, pathGrowing: 0,
        mainArea: 0, mainSize: '', others: 0, otherMax: 0, touched: [], pathTouched: [], filt: 0, shad: 0, blend: 0 };
    }
    function reset() {
      cur = fresh(); ring = []; openList = []; prevPath = []; maxDepth = 0; states = makeStore();
      totals = { frames: 0, leakFrames: 0, underflows: 0, overBoth: 0, overOne: 0, unknown: 0, readback: 0, longestPath: 0, pathGrowFrames: 0 };
    }
    reset();

    function getState(ctx) {
      var s = states.get(ctx);
      if (!s) { s = { d: 0, listed: false, frame: -1, area: 0, w: 0, h: 0, canvas: null, pathCalls: 0, pathPrev: 0, pathFrame: -1, begunFrame: -1, streak: 0 }; states.set(ctx, s); }
      return s;
    }
    // reset() and a canvas width/height write empty the browser's saved-state stack and the current path.
    function zero(ctx) { var s = states.get(ctx); if (s) { s.d = 0; s.pathCalls = 0; s.pathPrev = 0; s.streak = 0; } }
    function forget(ctx) { try { zero(ctx); } catch (e) { /* ignore */ } }
    // Contexts that still hold a save(): drops the ones that were reset, restored or thrown away.
    function countOpen() {
      var keepList = [], i, c, s;
      for (i = 0; i < openList.length; i++) {
        c = openList[i].deref();
        if (!c) continue;
        s = states.get(c);
        if (s && s.d > 0) keepList.push(openList[i]); else if (s) s.listed = false;
      }
      openList = keepList;
      return keepList.length;
    }

    function isMain(c) {
      try {
        if (opts.mainCanvas) return typeof opts.mainCanvas === 'function' ? !!opts.mainCanvas(c) : c === opts.mainCanvas;
        return !!c && c.isConnected === true;
      } catch (e) { return false; }
    }
    // adds painted device pixels to this context's canvas for the frame in progress
    function paint(ctx, t, x, y, w, h) {
      var a = rectArea(ctx, t, x, y, w, h), s = getState(ctx), c = ctx.canvas;
      if (s.frame !== frameNo) { s.frame = frameNo; s.area = 0; cur.touched.push(s); }
      s.area += a; s.canvas = c; s.w = c ? c.width : 0; s.h = c ? c.height : 0;
    }

    function auditDraw(ctx, a) {
      var img = a[0], n = a.length;
      if (!img) return;
      var t = ctx.getTransform ? ctx.getTransform() : IDENT;   // read once: each read makes a new matrix object
      var sz = sourceSize(img), iw = sz[0], ih = sz[1], known = iw > 0 && ih > 0;
      var sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      if (!known) cur.unknown++;
      if (n >= 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; cur.nine++; }
      else if (n >= 5) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; }
      else { dx = a[1]; dy = a[2]; dw = sw; dh = sh; }
      if (n >= 9 && known) {
        var ox = sx + sw > iw + 0.5 || sx < -0.5, oy = sy + sh > ih + 0.5 || sy < -0.5;
        if (ox && oy) cur.overBoth++; else if (ox || oy) cur.overOne++;
      }
      var kx = Math.sqrt(t.a * t.a + t.b * t.b), ky = Math.sqrt(t.c * t.c + t.d * t.d);
      if (sw > 0 && sh > 0 && Math.abs(dw) * kx / sw < 0.5 && Math.abs(dh) * ky / sh < 0.5) cur.small++;
      paint(ctx, t, dx, dy, dw, dh);
    }

    // a path call: count it since the last beginPath()
    function onPath(ctx) {
      var s = getState(ctx);
      s.pathCalls++; if (s.pathCalls > totals.longestPath) totals.longestPath = s.pathCalls;
      if (s.pathFrame !== frameNo) { s.pathFrame = frameNo; cur.pathTouched.push(s); }
    }
    // getImageData on a context made without willReadFrequently
    function onRead(ctx) {
      var m = meta.get(ctx), at;
      if (!m) {   // made before the probe was installed: ask the context if it can tell
        m = {};
        try { at = ctx.getContextAttributes ? ctx.getContextAttributes() : null; if (at && typeof at.willReadFrequently === 'boolean') m.wrf = at.willReadFrequently; } catch (e) { /* unknown */ }
        meta.set(ctx, m);
      }
      if (m.wrf === false) { cur.readback++; totals.readback++; }
    }
    function rememberCanvas(ctx) { var c = ctx.canvas; if (c && !canvasCtx.get(c)) canvasCtx.set(c, ctx); }

    // deep mode: draws made while a filter, a shadow or a non-default blend mode is switched on, the usual hidden cost on phones.
    // Off by default: reading the three properties adds about 170 ns to every draw.
    function costly(ctx) {
      var f = ctx.filter, g = ctx.globalCompositeOperation;
      if (f && f !== 'none') cur.filt++;
      if (ctx.shadowBlur > 0) cur.shad++;
      if (g && g !== 'source-over') cur.blend++;
    }
    var handlers = {
      drawImage: function (ctx, a) { auditDraw(ctx, a); },
      fillRect: function (ctx, a) { paint(ctx, ctx.getTransform ? ctx.getTransform() : IDENT, a[0], a[1], a[2], a[3]); },
      beginPath: function (ctx) { var s = getState(ctx); s.pathCalls = 0; s.begunFrame = frameNo; },
      getImageData: onRead
    };
    if (deep) {
      handlers.drawImage = function (ctx, a) { costly(ctx); auditDraw(ctx, a); };
      handlers.fillRect = function (ctx, a) { costly(ctx); paint(ctx, ctx.getTransform ? ctx.getTransform() : IDENT, a[0], a[1], a[2], a[3]); };
      handlers.fill = handlers.stroke = handlers.fillText = handlers.strokeText = costly;
    }

    function define(proto, name, desc) {
      try { Object.defineProperty(proto, name, desc); return true; } catch (e) { skipped.push(name); return false; }   // frozen or odd prototype
    }

    function wrapMethod(proto, name, before) {
      var d = gopd(proto, name);
      if (!d || typeof d.value !== 'function') return;
      var orig = d.value;
      if (define(proto, name, { value: function () {
        if (installed) { try { before(this, arguments); } catch (e) { /* bookkeeping must never break the game */ } }
        return orig.apply(this, arguments);
      }, writable: true, configurable: true, enumerable: d.enumerable })) restoreList.push([proto, name, d]);
    }

    function wrapStyle(proto, name) {
      var d = gopd(proto, name);
      if (!d || !d.get || !d.set) return;
      if (define(proto, name, {
        get: function () { return d.get.call(this); },
        set: function (v) {
          if (!installed) { d.set.call(this, v); return; }
          var before; try { before = d.get.call(this); } catch (e) { before = undefined; }
          d.set.call(this, v);
          try { cur.writes++; if (d.get.call(this) === before) cur.same++; } catch (e) { /* ignore */ }
        },
        configurable: true, enumerable: d.enumerable
      })) restoreList.push([proto, name, d]);
    }

    // canvas.width / canvas.height writes throw away the saved states and the path, even when the value is the same
    function wrapSize(proto, name) {
      var d = gopd(proto, name);
      if (!d || !d.get || !d.set) return;
      if (define(proto, name, {
        get: function () { return d.get.call(this); },
        set: function (v) {
          if (installed) { try { var cx = canvasCtx.get(this); if (cx) zero(cx); } catch (e) { /* ignore */ } }
          d.set.call(this, v);
        },
        configurable: true, enumerable: d.enumerable
      })) restoreList.push([proto, name, d]);
    }

    // getContext('2d', options): remember the options (willReadFrequently) and which context belongs to which canvas
    function wrapGetContext(proto) {
      var d = gopd(proto, 'getContext');
      if (!d || typeof d.value !== 'function') return;
      var orig = d.value;
      if (define(proto, 'getContext', { value: function (type, attrs) {
        var ctx = orig.apply(this, arguments);
        if (installed && ctx && type === '2d') {
          try { meta.set(ctx, { wrf: !!(attrs && attrs.willReadFrequently) }); canvasCtx.set(this, ctx); } catch (e) { /* ignore */ }
        }
        return ctx;
      }, writable: true, configurable: true, enumerable: d.enumerable })) restoreList.push([proto, 'getContext', d]);
    }

    protos.forEach(function (proto) {
      try {
        CALLS.forEach(function (name) {
          var isPath = PATH[name] === 1, h = handlers[name];
          wrapMethod(proto, name, function (ctx, a) {
            cur.calls[name] = (cur.calls[name] || 0) + 1; cur.total++;
            if (isPath) onPath(ctx);
            if (h) h(ctx, a);
          });
        });
        wrapMethod(proto, 'save', function (ctx) {
          var s = getState(ctx);
          s.d++; if (!s.listed) { s.listed = true; openList.push(makeRef(ctx)); }
          if (s.d > maxDepth) maxDepth = s.d;
          rememberCanvas(ctx);
        });
        wrapMethod(proto, 'restore', function (ctx) {
          var s = states.get(ctx);
          if (!s || s.d <= 0) { totals.underflows++; return; }
          s.d--;
        });
        wrapMethod(proto, 'reset', function (ctx) { zero(ctx); });   // ctx.reset(): Chrome 99, Firefox 113; skipped where it does not exist
        STYLES.forEach(function (name) { wrapStyle(proto, name); });
      } catch (e) { skipped.push('prototype'); }
    });
    canvasProtos.forEach(function (proto) {
      try { wrapGetContext(proto); wrapSize(proto, 'width'); wrapSize(proto, 'height'); } catch (e) { skipped.push('canvas prototype'); }
    });

    function closeAreas(rec) {
      var t = rec.touched, i, s, pick = null, anyMain = false, ratio;
      for (i = 0; i < t.length; i++) { s = t[i]; s.size = s.w * s.h; s.main = isMain(s.canvas); if (s.main) anyMain = true; }
      if (anyMain || !opts.mainCanvas) {   // the on-screen canvas if there is one; otherwise the canvas painted most
        for (i = 0; i < t.length; i++) {
          s = t[i];
          if (anyMain && !s.main) continue;
          if (!pick || s.area > pick.area || (s.area === pick.area && s.size > pick.size)) pick = s;
        }
      }
      for (i = 0; i < t.length; i++) {
        s = t[i]; ratio = s.size ? s.area / s.size : 0;
        if (s === pick) { rec.mainArea = ratio; rec.mainSize = s.w + 'x' + s.h; }
        else { rec.others++; if (ratio > rec.otherMax) rec.otherMax = ratio; }
      }
    }
    // a path that grew in every one of the last `growAfter` frames with no beginPath() is a missing beginPath()
    function closePaths(rec) {
      var i, s, growing = 0;
      for (i = 0; i < prevPath.length; i++) if (prevPath[i].pathFrame !== frameNo) prevPath[i].streak = 0;
      for (i = 0; i < rec.pathTouched.length; i++) {
        s = rec.pathTouched[i];
        if (s.pathCalls > s.pathPrev && s.begunFrame !== frameNo) s.streak++; else s.streak = 0;
        s.pathPrev = s.pathCalls;
        if (s.streak >= growAfter) growing++;
      }
      rec.pathGrowing = growing; if (growing) totals.pathGrowFrames++;
      prevPath = rec.pathTouched;
    }

    function frame() {
      var rec = cur;
      totals.frames++;
      try {
        rec.leaks = countOpen(); if (rec.leaks > 0) totals.leakFrames++;
        totals.overBoth += rec.overBoth; totals.overOne += rec.overOne; totals.unknown += rec.unknown;
        closeAreas(rec); closePaths(rec);
      } catch (e) { /* bookkeeping must never break the game */ }
      rec.touched = rec.pathTouched = null;   // let go of the contexts
      frameNo++; cur = fresh();
      ring.push(rec); if (ring.length > keep) ring.shift();
    }

    function pick(fn) { return ring.map(fn); }
    function report() {
      var calls = {}, all = {}, names = [], k, lastSize = '', i;
      ring.forEach(function (r) { for (k in r.calls) all[k] = 1; });
      for (k in all) names.push(k);
      names.sort().forEach(function (n) { calls[n] = stats(pick(function (r) { return r.calls[n] || 0; })); });
      var sumW = sum(ring, function (r) { return r.writes; }), sumS = sum(ring, function (r) { return r.same; });
      for (i = ring.length - 1; i >= 0; i--) if (ring[i].mainSize) { lastSize = ring[i].mainSize; break; }
      var main = stats(pick(function (r) { return round(r.mainArea); })); main.canvas = lastSize;
      return {
        frames: totals.frames, kept: ring.length, deep: deep, calls: calls, callsPerFrame: stats(pick(function (r) { return r.total; })),
        saveRestore: { deepest: maxDepth, openContextsNow: countOpen(), leakFrames: totals.leakFrames, restoreWithoutSave: totals.underflows },
        drawImage: {
          nineArgument: stats(pick(function (r) { return r.nine; })),
          sourceOverhangBothAxes: totals.overBoth,
          sourceOverhangOneAxis: totals.overOne,
          sourceSizeUnknown: totals.unknown,
          belowHalfSize: stats(pick(function (r) { return r.small; }))
        },
        styleWrites: { perFrame: stats(pick(function (r) { return r.writes; })), repeatShare: sumW ? round(sumS / sumW) : 0 },
        paintedArea: main,
        paintedAreaOther: { canvasesPerFrame: stats(pick(function (r) { return r.others; })), busiest: stats(pick(function (r) { return round(r.otherMax); })) },
        pathWithoutBeginPath: { longestPath: totals.longestPath, growingNow: ring.length ? ring[ring.length - 1].pathGrowing : 0, framesWithGrowingPath: totals.pathGrowFrames },
        readback: { getImageDataWithoutWillReadFrequently: totals.readback, perFrame: stats(pick(function (r) { return r.readback; })) },
        costlyDraws: !deep ? null : { withFilter: stats(pick(function (r) { return r.filt; })), withShadow: stats(pick(function (r) { return r.shad; })), withBlendMode: stats(pick(function (r) { return r.blend; })) },
        skipped: skipped.slice()
      };
    }

    function text() {
      var r = report(), o = [], k, c;
      if (!r.kept) return 'No frames recorded yet: call probe.frame() once per frame.';
      o.push('Canvas probe: ' + r.kept + ' frames kept (' + r.frames + ' seen since the last reset). Per-frame numbers: median, then 95th percentile and worst of the kept frames.');
      var parts = [];
      for (k in r.calls) { c = r.calls[k]; if (c.median || c.max) parts.push(k + ' ' + c.median + (c.max > c.median ? ' (95th ' + c.p95 + ', worst ' + c.max + ')' : '')); }
      o.push('Calls per frame: ' + r.callsPerFrame.median + ' in all (95th ' + r.callsPerFrame.p95 + ', worst ' + r.callsPerFrame.max + '); by method: ' + (parts.join(', ') || 'none') + '.');
      var s = r.saveRestore;
      o.push('save()/restore(), totals since reset: ' + (s.leakFrames ? s.leakFrames + ' frame(s) ended with an unmatched save() on ' + s.openContextsNow + ' context(s) now: a slow leak.' : 'balanced at the end of every frame.') +
        (s.restoreWithoutSave ? ' ' + s.restoreWithoutSave + ' restore() call(s) had nothing to restore.' : '') + ' Deepest nesting ' + s.deepest + '.');
      var d = r.drawImage;
      o.push('drawImage: ' + d.nineArgument.median + ' nine-argument calls per frame (95th ' + d.nineArgument.p95 + '); source sticks out of the bitmap on both axes ' + d.sourceOverhangBothAxes + ' time(s), on one axis ' + d.sourceOverhangOneAxis +
        '; shrunk below half size ' + d.belowHalfSize.median + ' per frame (95th ' + d.belowHalfSize.p95 + ', worst ' + d.belowHalfSize.max + ').' +
        (d.sourceSizeUnknown ? ' ' + d.sourceSizeUnknown + ' draw(s) had a source whose size was not known yet (not checked).' : ''));
      o.push('Style writes: ' + r.styleWrites.perFrame.median + ' per frame (95th ' + r.styleWrites.perFrame.p95 + '), ' + Math.round(r.styleWrites.repeatShare * 100) + '% repeat the value already set.');
      var pa = r.paintedArea;
      o.push('Painted area, main canvas' + (pa.canvas ? ' (' + pa.canvas + ')' : '') + ': ' + pa.median + ' times the canvas per frame (95th ' + pa.p95 + ', worst ' + pa.max + ').');
      var po = r.paintedAreaOther;
      if (po.canvasesPerFrame.max) o.push('Painted area, other canvases (each against its own size): ' + po.canvasesPerFrame.median + ' drawn into per frame (worst ' + po.canvasesPerFrame.max + '); the busiest paints ' + po.busiest.median + ' times its own area (95th ' + po.busiest.p95 + ', worst ' + po.busiest.max + ').');
      var p = r.pathWithoutBeginPath;
      if (p.framesWithGrowingPath) o.push('Paths: ' + p.framesWithGrowingPath + ' frame(s) had a path that kept growing with no beginPath() (longest ' + p.longestPath + ' calls): a missing beginPath() slows the game down over time.');
      else if (p.longestPath) o.push('Paths: no path grew without beginPath(); the longest was ' + p.longestPath + ' calls.');
      if (r.costlyDraws) { var cd = r.costlyDraws; o.push('Deep mode is on. Draws made while a filter was set: ' + cd.withFilter.median + ' per frame (95th ' + cd.withFilter.p95 + ', worst ' + cd.withFilter.max + '); with a shadow: ' + cd.withShadow.median + ' (95th ' + cd.withShadow.p95 + '); with a blend mode other than the default: ' + cd.withBlendMode.median + ' (95th ' + cd.withBlendMode.p95 + '). These are the draws that cost the most on phones.'); }
      var rb = r.readback;
      if (rb.getImageDataWithoutWillReadFrequently) o.push('getImageData: ' + rb.getImageDataWithoutWillReadFrequently + ' call(s) on a canvas made without { willReadFrequently: true } (median ' + rb.perFrame.median + ' per frame). If you read pixels back often, create that canvas with the option; it can slow drawing on a canvas shown on screen.');
      if (r.skipped.length) o.push('Could not wrap (frozen or missing): ' + r.skipped.join(', ') + '.');
      return o.join('\n');
    }

    // Pass or fail for a test run. limits (all optional): callsPerFrame / callsPerFrameP95 (ceilings for the median / 95th percentile of the per-frame total of
    // wrapped calls), leakFrames, restoreWithoutSave, sourceOverhang, growingPathFrames (all default 0), and withFilter / withShadow / withBlendMode
    // (ceilings for the median draws per frame, need deep: true). null or Infinity switches one off. Returns { ok, problems } with plain-words problems.
    function check(limits) {
      var L = limits || {}, r = report(), bad = [];
      function lim(k, d) { var v = L[k]; return v === undefined ? d : v; }
      function on(v) { return typeof v === 'number' && isFinite(v); }
      if (!r.kept) return { ok: false, problems: ['No frames were recorded: call probe.frame() once per frame.'] };
      var c = lim('callsPerFrame', null), c95 = lim('callsPerFrameP95', null);
      if (on(c) && r.callsPerFrame.median > c) bad.push('Canvas calls per frame: median ' + r.callsPerFrame.median + ', over the limit of ' + c + '.');
      if (on(c95) && r.callsPerFrame.p95 > c95) bad.push('Canvas calls per frame: 95th percentile ' + r.callsPerFrame.p95 + ', over the limit of ' + c95 + '.');
      var lf = lim('leakFrames', 0), sr = r.saveRestore;
      if (on(lf) && sr.leakFrames > lf) bad.push(sr.leakFrames + ' frame(s) ended with an unmatched save() (a slow leak); the limit is ' + lf + '.');
      var rs = lim('restoreWithoutSave', 0);
      if (on(rs) && sr.restoreWithoutSave > rs) bad.push(sr.restoreWithoutSave + ' restore() call(s) had nothing to restore; the limit is ' + rs + '.');
      var so = lim('sourceOverhang', 0), oh = r.drawImage.sourceOverhangBothAxes + r.drawImage.sourceOverhangOneAxis;
      if (on(so) && oh > so) bad.push(oh + ' drawImage call(s) read a source rectangle that sticks out of the bitmap; the limit is ' + so + '.');
      var gp = lim('growingPathFrames', 0), pw = r.pathWithoutBeginPath.framesWithGrowingPath;
      if (on(gp) && pw > gp) bad.push(pw + ' frame(s) had a path that kept growing with no beginPath(); the limit is ' + gp + '.');
      var deepKeys = { withFilter: 'a filter', withShadow: 'a shadow', withBlendMode: 'a blend mode' }, k, v;
      for (k in deepKeys) {
        v = lim(k, null);
        if (!on(v)) continue;
        if (!r.costlyDraws) bad.push('The limit ' + k + ' needs the probe installed with deep: true.');
        else if (r.costlyDraws[k].median > v) bad.push('Draws made with ' + deepKeys[k] + ' set: median ' + r.costlyDraws[k].median + ' per frame, over the limit of ' + v + '.');
      }
      return { ok: !bad.length, problems: bad };
    }

    function uninstall() {
      installed = false;
      if (rafId && typeof cancelAnimationFrame === 'function') { try { cancelAnimationFrame(rafId); } catch (e) { /* ignore */ } }
      restoreList.forEach(function (x) { try { Object.defineProperty(x[0], x[1], x[2]); } catch (e) { /* ignore */ } });
      restoreList = [];
    }

    if (opts.auto && typeof requestAnimationFrame === 'function') {
      // the first frame is recorded on the first tick, not at install, so there is no empty first frame
      try { rafId = requestAnimationFrame(function tick() { if (!installed) return; frame(); rafId = requestAnimationFrame(tick); }); } catch (e) { skipped.push('auto'); }
    }
    return { frame: frame, report: report, text: text, check: check, reset: reset, forget: forget, uninstall: uninstall, calls: CALLS.slice(), styles: STYLES.slice() };
  }

  return { install: install };
});
