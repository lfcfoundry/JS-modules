/*!
 * fx-governor.js: steps visual effects down by itself when the device can't keep up, and never up again behind the player's back.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.1 (API 1)
 *
 *   var gov = FxGovernor.create({ levels: ['full', 'lite', 'calm'], onChange: function (level) { document.body.dataset.fx = level; } });
 *   gov.start();                       // runs its own requestAnimationFrame loop; or call gov.frame(t) from your own loop
 *   gov.choose('full');                // the player picked a level: the governor stops adjusting (and its loop rests)
 *   gov.release();                     // hand control back (the loop wakes up again); release('full') also sets the level
 *
 * It averages frames over `windowMs`; if the average is under the line for `strikes` windows in a row, it moves one level down.
 * The line is `minFps` (default 36), or, if you give `expectedPeriod` (ms per frame on this screen, e.g. 16.67 or 33.3), about 60 percent of
 * the screen's normal rate, so a 30 Hz power-saving screen is not blamed on your effects. An explicit `minFps` always wins.
 * Pauses do not count against the device: a hidden tab, or a gap between frames longer than `gapMs`, restarts the counting.
 * But `longGaps` (3) such gaps in a row mean a device that is always that slow, so they are counted. A window under `severe` (0.5) of the line counts as all the strikes at once.
 * Loading does not count either: use `waitForReady: true` and call gov.ready() when art is decoded, and/or `startAfterMs` to ignore the first moments.
 * The governor does not look at the timer: it averages over seconds, which a rounded clock (see env-probes) barely disturbs.
 * It never goes below `maxAuto` by itself. The default keeps the LAST level for the player (levels.length - 2); pass maxAuto: levels.length - 1 to let it reach the last one.
 * Callbacks are guarded: one that throws never stops adaptation. When there is nothing left to decide, the loop stops by itself.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FxGovernor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LINE_SHARE = 0.6;   // with expectedPeriod: "too slow" means under 60 percent of the screen's normal rate
  function num(v, def) { return typeof v === 'number' && isFinite(v) ? v : def; }   // an explicit 0 is a real value, not "unset"
  function pos(v, def) { v = num(v, def); return v > 0 ? v : def; }

  function create(o) {
    o = o || {};
    var levels = o.levels && o.levels.length ? o.levels : ['full', 'lite', 'calm'], idx = Math.max(0, levels.indexOf(o.start || levels[0]));
    var windowMs = pos(o.windowMs, 3000), gapMs = pos(o.gapMs, 250), startAfterMs = Math.max(0, num(o.startAfterMs, 0));
    var strikes = Math.max(1, Math.floor(num(o.strikes, 2)));   // 0 or less means "the first slow window is enough" (same as 1)
    var longGaps = Math.max(1, Math.floor(num(o.longGaps, 3))), severe = num(o.severe, 0.5);   // 3 long gaps in a row are a slow device, not a pause; a window under half the line steps down at once
    var period = num(o.expectedPeriod, 0);
    var minFps = o.minFps != null && num(o.minFps, null) !== null ? o.minFps : (period > 0 ? LINE_SHARE * 1000 / period : 36);   // minFps: 0 means "never slow"
    var maxAuto = Math.min(levels.length - 1, Math.max(0, num(o.maxAuto, levels.length - 2)));   // the lowest level index the governor may reach by itself
    var frames = 0, t0 = 0, last = 0, slow = 0, chosen = false, raf = 0, running = false, armed = !o.waitForReady, warmFrom = 0, longRun = 0;

    function safe(fn, a, b) { try { fn(a, b); } catch (e) {} }
    function done() { return chosen || idx >= maxAuto; }   // nothing left for the governor to decide

    function frame(t) {
      if (done()) return;
      var gap = last ? t - last : 0; last = t;
      longRun = gap > gapMs ? longRun + 1 : 0;
      if (!armed) return;                                                    // still loading: not counted
      if (startAfterMs > 0) {
        if (!warmFrom) warmFrom = t;
        if (t - warmFrom < startAfterMs) { t0 = 0; slow = 0; return; }       // warm-up: not counted
      }
      if ((typeof document !== 'undefined' && document.hidden) || (gap > gapMs && longRun < longGaps)) { t0 = 0; slow = 0; }   // a pause is not a slow device
      if (!t0) { t0 = t; frames = 0; return; }
      frames++;
      if (t - t0 < windowMs) return;
      var fps = frames * 1000 / (t - t0);
      t0 = t; frames = 0;
      slow = fps < minFps ? slow + (fps < minFps * severe ? strikes : 1) : 0;
      if (o.onSample) safe(o.onSample, fps);
      if (slow >= strikes && idx < maxAuto) {
        idx++; slow = 0;
        if (o.onChange) safe(o.onChange, levels[idx], fps);
      }
    }

    function schedule() { if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop); }
    function cancel() { if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); raf = 0; }
    function loop(t) {
      raf = 0;
      if (!running) return;
      safe(frame, t);
      if (running && !done()) schedule();   // nothing left to decide: rest until release()
    }

    return {
      frame: frame,
      start: function () { if (running) return; running = true; if (!done()) schedule(); },
      stop: function () { running = false; cancel(); },
      choose: function (level) { var i = levels.indexOf(level); if (i < 0) return; chosen = true; idx = i; cancel(); },   // the player decides; automatic changes stop
      release: function (level) { var i = levels.indexOf(level); if (i >= 0) idx = i; chosen = false; t0 = 0; slow = 0; last = 0; if (running && !done()) schedule(); },   // hand control back to the governor
      ready: function () { armed = true; warmFrom = 0; t0 = 0; slow = 0; last = 0; },                          // loading is finished: start counting (after startAfterMs, if set)
      get level() { return levels[idx]; },
      get minFps() { return minFps; },
      get resting() { return running && done(); }   // true while started but the loop has stopped itself because nothing is left to decide
    };
  }
  return { create: create };
});
