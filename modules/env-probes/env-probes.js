/*!
 * env-probes.js: tiny checks for browsers that quietly change what your page can do.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 *
 *  timerStepMs()         the smallest step performance.now() takes, in ms (0 when it never moved). Measured with a bounded loop, no waiting.
 *  timerRounded()        true when the clock is rounded: no step seen, or a step above about 8 ms. Catches Firefox "resist fingerprinting"
 *                        (about 16.67 ms) and Tor-style 100 ms. Per-frame timing is unreliable then (averages over seconds still work).
 *  canvasReadback()      'ok' | 'noisy' | 'blocked': does getImageData return exactly what was drawn? (every pixel of a 16x16 patch is checked)
 *  canvasNoise()         how bad the noise was: { maxDelta, share } (largest color-level error 0-255, share of pixels that differ); null when nothing was read.
 *  canvasReadbackOk()    the old yes/no form: true only for 'ok'. Not tried (false) when the clock is rounded: Tor Browser asks permission there and Firefox privacy mode adds noise.
 *  storageState()        'ok' | 'full' | 'blocked': can localStorage be written and read back? 'full' = quota error but data is already stored.
 *  storageWorks()        the old yes/no form: true only for 'ok'.
 *  reducedMotion()       true when the OS asks for less motion. reducedMotion(cb) calls cb(bool) on change and returns an unsubscribe function.
 *  coarsePointer()       true when the main input is touch.   anyCoarsePointer(): true when any input is touch (touch laptops).
 *  contrastPreference()  'more' | 'less' | 'custom' | 'none' (prefers-contrast).
 *  prefersReducedTransparency()  true when the device asks for less see-through or blurred glass.   hover() / anyHover(): true when the main / any input can hover.
 *  framed()              'none' | 'same-origin' | 'cross-origin': is this page inside another page (an itch.io style embed), and can it read the top page?
 *  capabilities()        { webLocks, wakeLock, closeWatcher, gamepad, compressionStream, idleCallback, webAnimations, viewTransitions }: true or false for each.
 *  report()              all of the above in one object (handy for bug reports and test logs).
 *  explain()             short plain-words sentences about what the report means for your page.
 * No dependencies. Every probe is wrapped in try/catch and never throws, in a page, a Worker or Node.
 * Results are cached after the first call for timerStepMs, timerRounded, canvasReadback(Ok) and storageState/storageWorks;
 * the motion, pointer and contrast questions are asked fresh each time.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EnvProbes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var cache = {}, env = {}, subs = [], mql = null, mqh = null;
  var STEP_LIMIT_MS = 8;      // a clock step above this is "rounded" (Firefox privacy mode is 16.67 ms, Tor-style is 100 ms)
  var MAX_READS = 30000, ENOUGH_STEPS = 3;   // bounded loop: three steps are enough to tell a rounded clock (every step 16+ ms) from a fine one
  var CW = 16, CH = 16, DRAWN_ROWS = 8;      // canvas patch; rows below DRAWN_ROWS stay undrawn and must stay fully transparent

  // Global lookups happen at call time and are guarded, so nothing throws in a Worker or Node. env is a test hook (see _env).
  function win() { return env.window || (typeof window !== 'undefined' ? window : null); }
  function doc() { return env.document || (typeof document !== 'undefined' ? document : null); }
  function nav() { return env.navigator || (typeof navigator !== 'undefined' ? navigator : null); }
  function perf() { return env.performance || (typeof performance !== 'undefined' ? performance : null); }
  function store() { try { return env.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (e) { return null; } }
  function media(q) { var w = win(); return w && typeof w.matchMedia === 'function' ? w.matchMedia(q) : null; }
  function asks(q) { try { var m = media(q); return !!(m && m.matches); } catch (e) { return false; } }

  function timerStepMs() {
    if ('step' in cache) return cache.step;
    var step = 0;
    try {
      var p = perf();
      if (p && typeof p.now === 'function') {
        var prev = p.now(), seen = 0, i, cur, d;
        for (i = 0; i < MAX_READS && seen < ENOUGH_STEPS; i++) {
          cur = p.now(); d = cur - prev;
          if (d > 0) { if (!step || d < step) step = d; seen++; prev = cur; }
        }
      }
    } catch (e) { step = 0; }
    return (cache.step = step);
  }

  function timerRounded() {
    if ('timer' in cache) return cache.timer;
    var s = timerStepMs();
    return (cache.timer = (s === 0 || s > STEP_LIMIT_MS));   // no clock, or no step in the whole loop, counts as rounded
  }

  function patch(x, y) { return [x * 16 + 5, 255 - y * 30, (x * 7 + y * 11 + 40) & 255]; }

  function canvasReadback() {
    if ('canvas' in cache) return cache.canvas;
    if (timerRounded()) { cache.canvasSkipped = true; return (cache.canvas = 'blocked'); }   // not tried: Tor Browser asks permission on read-back and Firefox privacy mode adds noise, so don't poke it
    var res = 'blocked';
    try {
      var dc = doc(), c = dc && dc.createElement('canvas');
      if (c) {
        c.width = CW; c.height = CH;
        var g = c.getContext('2d', { willReadFrequently: true }), x, y, p, o, bad = 0, same = true, mx = 0, k, e;
        if (g && typeof g.getImageData === 'function' && typeof g.putImageData === 'function' && typeof g.createImageData === 'function') {
          var img = g.createImageData(CW, CH), w = img.data;   // one write of the whole patch instead of 128 tiny fills
          for (y = 0; y < DRAWN_ROWS; y++) for (x = 0; x < CW; x++) { p = patch(x, y); o = (y * CW + x) * 4; w[o] = p[0]; w[o + 1] = p[1]; w[o + 2] = p[2]; w[o + 3] = 255; }
          g.putImageData(img, 0, 0);
          var d = g.getImageData(0, 0, CW, CH).data;
          if (d && d.length === CW * CH * 4) {
            for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
              o = (y * CW + x) * 4;
              if (y < DRAWN_ROWS) {
                p = patch(x, y);
                if (d[o] !== p[0] || d[o + 1] !== p[1] || d[o + 2] !== p[2] || d[o + 3] !== 255) {
                  bad++; for (k = 0; k < 4; k++) { e = Math.abs(d[o + k] - (k < 3 ? p[k] : 255)); if (e > mx) mx = e; }
                }
                if (d[o] !== d[0] || d[o + 1] !== d[1] || d[o + 2] !== d[2] || d[o + 3] !== d[3]) same = false;
              } else if (d[o] !== 0 || d[o + 1] !== 0 || d[o + 2] !== 0 || d[o + 3] !== 0) {   // never drawn: must stay fully transparent
                bad++; for (k = 0; k < 4; k++) { e = d[o + k]; if (e > mx) mx = e; }
              }
            }
            // Every drawn pixel has its own color, so identical pixels mean the image was blanked.
            res = same ? 'blocked' : (bad ? 'noisy' : 'ok');
            if (res !== 'blocked') cache.noise = { maxDelta: mx, share: Math.round(bad / (CW * CH) * 1000) / 1000 };
          }
        }
      }
    } catch (e) { res = 'blocked'; }
    return (cache.canvas = res);
  }

  function canvasNoise() { canvasReadback(); return cache.noise ? { maxDelta: cache.noise.maxDelta, share: cache.noise.share } : null; }

  function canvasReadbackOk() { return canvasReadback() === 'ok'; }

  function isQuota(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }

  function storageState() {
    if ('storage' in cache) return cache.storage;
    var res = 'blocked', s = store(), k = '__envprobe__';
    if (s) {
      try {
        s.setItem(k, '1');
        res = s.getItem(k) === '1' ? 'ok' : 'blocked';
        try { s.removeItem(k); } catch (e2) {}
      } catch (e) {
        // A quota error with data already stored means storage works but is full (MDN's own pattern). With nothing stored it is a blocked store.
        res = (isQuota(e) && s.length > 0) ? 'full' : 'blocked';
      }
    }
    return (cache.storage = res);
  }

  function storageWorks() { return storageState() === 'ok'; }

  var RM = '(prefers-reduced-motion: reduce)';

  function unsubscribeMotion(cb) {
    var i = subs.indexOf(cb);
    if (i >= 0) subs.splice(i, 1);
    if (!subs.length && mql) {
      try { if (mql.removeEventListener) mql.removeEventListener('change', mqh); else if (mql.removeListener) mql.removeListener(mqh); } catch (e) {}
      mql = null; mqh = null;
    }
  }

  function reducedMotion(cb) {
    var m = null, now = false;
    try { m = media(RM); now = !!(m && m.matches); } catch (e) { m = null; }
    if (typeof cb !== 'function') return now;
    try {
      if (subs.indexOf(cb) < 0) subs.push(cb);                      // the same callback is never added twice
      if (m && !mql) {                                              // one shared listener for all callbacks
        mql = m;
        mqh = function () {
          var v = !!mql.matches, list = subs.slice(), i;
          for (i = 0; i < list.length; i++) { try { list[i](v); } catch (e) {} }
        };
        if (mql.addEventListener) mql.addEventListener('change', mqh); else if (mql.addListener) mql.addListener(mqh);
      }
    } catch (e) {}
    var un = function () { try { unsubscribeMotion(cb); } catch (e) {} };
    un.matches = now;       // the current answer, so one call gives both the value and the way to stop listening
    return un;
  }

  function coarsePointer() { return asks('(pointer: coarse)'); }
  function anyCoarsePointer() { return asks('(any-pointer: coarse)'); }

  function contrastPreference() {
    if (asks('(prefers-contrast: more)')) return 'more';
    if (asks('(prefers-contrast: less)')) return 'less';
    if (asks('(prefers-contrast: custom)')) return 'custom';
    return 'none';
  }

  function prefersReducedTransparency() { return asks('(prefers-reduced-transparency: reduce)'); }
  function hover() { return asks('(hover: hover)'); }
  function anyHover() { return asks('(any-hover: hover)'); }

  function framed() {
    if ('framed' in cache) return cache.framed;
    var res = 'none', w = win();
    try {
      if (w && w.top !== w.self) {
        res = 'cross-origin';
        try { if (w.top.location.href !== undefined) res = 'same-origin'; } catch (e2) {}   // reading the top page's address throws when it belongs to another site
      }
    } catch (e) { res = 'cross-origin'; }
    return (cache.framed = res);
  }

  function capabilities() {
    var w = win(), d = doc(), n = nav(), c = {};
    function has(f) { try { return !!f(); } catch (e) { return false; } }
    c.webLocks = has(function () { return n.locks && typeof n.locks.request === 'function'; });
    c.wakeLock = has(function () { return n.wakeLock && typeof n.wakeLock.request === 'function'; });
    c.closeWatcher = has(function () { return typeof w.CloseWatcher === 'function'; });
    c.gamepad = has(function () { return typeof n.getGamepads === 'function'; });
    c.compressionStream = has(function () { return typeof w.CompressionStream === 'function'; });
    c.idleCallback = has(function () { return typeof w.requestIdleCallback === 'function'; });
    c.webAnimations = has(function () { return typeof w.Element.prototype.animate === 'function'; });
    c.viewTransitions = has(function () { return typeof d.startViewTransition === 'function'; });
    return c;
  }

  function report() {
    var r = {}, w, n;
    try { w = win(); n = nav(); } catch (e) {}
    try {
      r.timerRounded = timerRounded(); r.timerStepMs = timerStepMs();
      r.canvasReadbackOk = canvasReadbackOk(); r.canvasReadback = canvasReadback(); r.canvasSkipped = !!cache.canvasSkipped;
      r.storageWorks = storageWorks(); r.storageState = storageState();
      r.reducedMotion = reducedMotion(); r.coarsePointer = coarsePointer(); r.anyCoarsePointer = anyCoarsePointer(); r.contrastPreference = contrastPreference();
      r.prefersReducedTransparency = prefersReducedTransparency(); r.hover = hover(); r.anyHover = anyHover(); r.framed = framed();
      r.canvasNoise = canvasNoise(); r.capabilities = capabilities();
      r.inPage = !!(w && doc());
    } catch (e) {}
    try { r.dpr = (w && w.devicePixelRatio) || 1; } catch (e) { r.dpr = 1; }
    try { r.ua = (n && n.userAgent) || ''; } catch (e) { r.ua = ''; }
    return r;
  }

  function explain(rep) {
    var r = rep || report(), out = [];
    try {
      if (!r.inPage) out.push('This is not a normal page (a Worker or Node), so page checks such as canvas and touch are skipped.');
      if (r.timerRounded) out.push('This browser rounds its clock (smallest step ' + (r.timerStepMs ? 'about ' + Math.round(r.timerStepMs * 100) / 100 + ' ms' : 'not measurable') + '), so frame meters should be switched off. Frames may also be capped at 60 per second. Averages over a few seconds still work.');
      else out.push('The clock is precise enough (smallest step about ' + Math.round(r.timerStepMs * 1000) / 1000 + ' ms), so frame timing can be trusted.');
      if (r.canvasReadback === 'ok') out.push('Canvas pixels read back exactly, so code that analyzes pixels will work.');
      else if (r.canvasReadback === 'noisy') out.push('This browser adds noise to canvas pixels' + (r.canvasNoise ? (r.canvasNoise.maxDelta <= 3 ? ' (tiny, up to ' + r.canvasNoise.maxDelta + ' levels out of 255)' : ' (large, up to ' + r.canvasNoise.maxDelta + ' levels out of 255)') : '') + ', so code that analyzes pixels will see wrong values. Do not rely on it.');
      else if (r.canvasSkipped) out.push('Canvas read-back was not tried because the clock is rounded and the browser might ask the player for permission. Treat it as unavailable.');
      else out.push('Canvas read-back is blocked, so code that analyzes pixels cannot run here.');
      if (r.storageState === 'ok') out.push('Saving on this device works.');
      else if (r.storageState === 'full') out.push('Storage is full: old data can be read but new data will not fit, so ask the player to free some space.');
      else if (r.framed && r.framed !== 'none') out.push('This page is running inside another page, so the browser may block or limit saving here. Open it in its own tab to be sure progress is kept.');
      else out.push('This browser blocks saving (a private window or blocked site data), so progress will not be kept after the page closes.');
      out.push(r.reducedMotion ? 'The device asks for less motion, so use calmer animation.' : 'The device has not asked for less motion.');
      if (r.prefersReducedTransparency) out.push('The device asks for less see-through glass, so use solid backgrounds instead of blur.');
      if (r.coarsePointer) out.push('Touch is the main input, so make buttons big.');
      else if (r.anyCoarsePointer) out.push('A touch screen is present next to a mouse or trackpad, so support both.');
      else out.push('A mouse or trackpad is the main input.');
      if (r.inPage && r.hover === false && r.anyHover === false) out.push('Nothing here can hover, so do not hide anything behind a hover tooltip.');
      if (r.contrastPreference === 'more') out.push('The device asks for higher contrast, so use stronger text and borders.');
      else if (r.contrastPreference === 'less') out.push('The device asks for lower contrast, so avoid harsh black on white.');
      else if (r.contrastPreference === 'custom') out.push('The device uses custom contrast colors, so keep your own colors flexible.');
    } catch (e) {}
    return out;
  }

  return {
    timerStepMs: timerStepMs, timerRounded: timerRounded,
    canvasReadback: canvasReadback, canvasReadbackOk: canvasReadbackOk, canvasNoise: canvasNoise,
    storageState: storageState, storageWorks: storageWorks,
    reducedMotion: reducedMotion, coarsePointer: coarsePointer, anyCoarsePointer: anyCoarsePointer, contrastPreference: contrastPreference,
    prefersReducedTransparency: prefersReducedTransparency, hover: hover, anyHover: anyHover, framed: framed, capabilities: capabilities,
    report: report, explain: explain,
    _reset: function () { cache = {}; while (subs.length) unsubscribeMotion(subs[0]); },
    _env: function (e) { env = e || {}; cache = {}; }   // test hook: pass fake window/document/navigator/performance/localStorage; call _env() to go back to the real ones
  };
});
