/*!
 * fx-governor.js: steps visual effects down by itself when the device can't keep up, and never up again behind the player's back.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *   var gov = FxGovernor.create({ levels: ['full', 'lite', 'calm'], onChange: function (level) { document.body.dataset.fx = level; } });
 *   gov.start();                       // runs its own requestAnimationFrame loop; or call gov.frame(t) from your own loop
 *   gov.choose('full');                // the player picked a level: the governor stops adjusting
 *
 * It averages frames over `windowMs`; if the average is under `minFps` for `strikes` windows in a row, it moves one level down.
 * Pauses do not count against the device: a hidden tab, or a gap between frames longer than `gapMs`, restarts the counting.
 * Skips itself when the browser rounds timers (nothing to measure), see env-probes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FxGovernor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function create(o) {
    o = o || {};
    var levels = o.levels || ['full', 'lite', 'calm'], idx = Math.max(0, levels.indexOf(o.start || levels[0]));
    var windowMs = o.windowMs || 3000, minFps = o.minFps || 36, strikes = o.strikes || 2, gapMs = o.gapMs || 250;
    var maxAuto = o.maxAuto == null ? levels.length - 2 : o.maxAuto;   // the lowest level index the governor may reach by itself (default: the second-to-last level; the last one is the player's choice)
    var frames = 0, t0 = 0, last = 0, slow = 0, chosen = false, raf = 0, running = false;

    function frame(t) {
      if (chosen || idx >= maxAuto) return;
      var gap = last ? t - last : 0; last = t;
      if ((typeof document !== 'undefined' && document.hidden) || gap > gapMs) { t0 = 0; slow = 0; }   // a pause is not a slow device
      if (!t0) { t0 = t; frames = 0; return; }
      frames++;
      if (t - t0 < windowMs) return;
      var fps = frames * 1000 / (t - t0);
      t0 = t; frames = 0;
      slow = fps < minFps ? slow + 1 : 0;
      if (o.onSample) o.onSample(fps);
      if (slow >= strikes && idx < maxAuto) {
        idx++; slow = 0;
        if (o.onChange) o.onChange(levels[idx], fps);
      }
    }
    function loop(t) { if (!running) return; frame(t); raf = requestAnimationFrame(loop); }
    return {
      frame: frame,
      start: function () { if (running) return; running = true; raf = requestAnimationFrame(loop); },
      stop: function () { running = false; cancelAnimationFrame(raf); },
      choose: function (level) { chosen = true; var i = levels.indexOf(level); if (i >= 0) idx = i; },   // the player decides; automatic changes stop
      release: function () { chosen = false; t0 = 0; slow = 0; },                                       // hand control back to the governor
      get level() { return levels[idx]; }
    };
  }
  return { create: create };
});
