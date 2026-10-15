/*!
 * env-probes.js: tiny checks for browsers that quietly change what your page can do.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *  timerRounded()        true when performance.now() is rounded to 100 ms (Firefox "resist fingerprinting" / strict privacy).
 *                        Frame timing, FPS meters and adaptive-quality code are meaningless then.
 *  canvasReadbackOk()    true when canvas getImageData returns exactly what was drawn. Privacy modes scramble or block it,
 *                        which turns anything that analyzes pixels into noise (and Firefox may ask the user for permission).
 *  storageWorks()        true when localStorage can be written and read back (private windows and blocked site data can throw).
 *  reducedMotion(cb)     true when the OS asks for less motion; cb(bool) is called when the setting changes.
 *  coarsePointer()       true on touch-first devices.
 *  report()              all of the above in one object (handy for bug reports and test logs).
 * No dependencies. Every probe is wrapped in try/catch and never throws; results are cached after the first call.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EnvProbes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var cache = {};

  function timerRounded() {
    if ('timer' in cache) return cache.timer;
    var r = false;
    try {
      // Two readings about 6 ms apart that are both exact multiples of 100 give the rounding away.
      var a = performance.now(), t = Date.now(), b = a;
      while (Date.now() - t < 6) b = performance.now();
      r = a % 100 === 0 && b % 100 === 0;
    } catch (e) {}
    return (cache.timer = r);
  }

  function canvasReadbackOk() {
    if ('canvas' in cache) return cache.canvas;
    if (timerRounded()) return (cache.canvas = false);   // that mode also asks the user for permission on read-back: don't trigger it
    var ok = true;
    try {
      var c = document.createElement('canvas'); c.width = 8; c.height = 8;
      var x = c.getContext('2d', { willReadFrequently: true }), i;
      for (i = 0; i < 8; i++) { x.fillStyle = 'rgb(' + (i * 30 + 5) + ',' + (255 - i * 20) + ',' + (i * 7 + 40) + ')'; x.fillRect(i, 0, 1, 4); }
      var d = x.getImageData(0, 0, 8, 8).data;
      for (i = 0; i < 8 && ok; i++) {
        var o = i * 4, q = (7 * 8 + i) * 4;   // row 7 was never drawn: it must stay fully transparent
        if (d[o] !== i * 30 + 5 || d[o + 1] !== 255 - i * 20 || d[o + 2] !== i * 7 + 40 || d[o + 3] !== 255 || d[q + 3] !== 0 || d[q] !== 0) ok = false;
      }
    } catch (e) { ok = false; }
    return (cache.canvas = ok);
  }

  function storageWorks() {
    if ('storage' in cache) return cache.storage;
    var ok = false;
    try { var k = '__envprobe__'; localStorage.setItem(k, '1'); ok = localStorage.getItem(k) === '1'; localStorage.removeItem(k); } catch (e) {}
    return (cache.storage = ok);
  }

  function reducedMotion(cb) {
    try {
      var mq = matchMedia('(prefers-reduced-motion: reduce)');
      if (cb) { var h = function () { cb(mq.matches); }; if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h); }
      return mq.matches;
    } catch (e) { return false; }
  }

  function coarsePointer() {
    try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  }

  function report() {
    return { timerRounded: timerRounded(), canvasReadbackOk: canvasReadbackOk(), storageWorks: storageWorks(), reducedMotion: reducedMotion(), coarsePointer: coarsePointer(), dpr: window.devicePixelRatio || 1, ua: navigator.userAgent };
  }
  return { timerRounded: timerRounded, canvasReadbackOk: canvasReadbackOk, storageWorks: storageWorks, reducedMotion: reducedMotion, coarsePointer: coarsePointer, report: report, _reset: function () { cache = {}; } };
});
