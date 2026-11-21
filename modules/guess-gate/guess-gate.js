/*!
 * guess-gate.js: decides when a page may draw a first guess while data is still arriving, so the guesses never cost more than a set share of the import.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.1 (API 1)
 *
 *   var gate = GuessGate.create({ share: 0.05 });     // guesses may use up to 5% of the import time so far (the default)
 *   gate.start();                                     // the import begins
 *   // after each piece of data (a block, a file, a chunk of rows):
 *   gate.run(function () { drawFirstGuess(partialData); });   // runs the function only when it is allowed; returns true when it ran (the second argument, an estimate in ms, defaults to what the last guess cost)
 *   // when everything has arrived: draw the final picture yourself, then
 *   var s = gate.finish();                            // { elapsed, spent, guesses, skipped, share }
 */
var GuessGate = (function () {
  'use strict';
  function create(opts) {
    opts = opts || {};
    var share = opts.share === undefined ? 0.05 : +opts.share, minMs = opts.minMs === undefined ? 40 : +opts.minMs, now = typeof opts.now === 'function' ? opts.now : (typeof performance === 'object' && performance && performance.now ? function () { return performance.now(); } : Date.now);
    if (!(share > 0 && share <= 1)) throw new Error('GuessGate: share must be more than 0 and at most 1');
    if (!(minMs >= 0)) throw new Error('GuessGate: minMs must be 0 or more');
    var t0 = -1, spent = 0, guesses = 0, skipped = 0, done = false, last = 0;
    function elapsed() { return t0 < 0 ? 0 : now() - t0; }
    /** true when a guess may run now: the import has run for minMs, and the guesses so far plus this one would use no more than share of the time since start. est: what this guess will cost in ms (default: what the last one cost, 0 before the first) */
    function allowed(est) { if (t0 < 0 || done) return false; var e = now() - t0; return e >= minMs && spent + (est === undefined ? last : +est) <= share * e; }
    /** milliseconds until a guess is allowed, if nothing else is spent meanwhile (0 when allowed now) */
    function nextIn(est) { if (t0 < 0 || done) return Infinity; var e = now() - t0, need = Math.max(minMs, (spent + (est === undefined ? last : +est)) / share); return need > e ? need - e : 0; }
    /** runs fn when allowed and counts its time against the share, even when it throws; returns true when it ran, false when it was skipped */
    function run(fn, est) {
      if (typeof fn !== 'function') throw new Error('GuessGate: run needs a function');
      if (!allowed(est)) { if (t0 >= 0 && !done) skipped++; return false; }
      var a = now();
      try { fn(); } finally { last = now() - a; spent += last; guesses++; }
      return true;
    }
    return {
      start: function () { t0 = now(); spent = 0; guesses = 0; skipped = 0; done = false; last = 0; return this; },
      allowed: allowed, nextIn: nextIn, run: run,
      stats: function () { return { elapsed: elapsed(), spent: spent, guesses: guesses, skipped: skipped, share: share }; },
      finish: function () { var s = this.stats(); done = true; return s; }
    };
  }
  return { version: '1.0.1', api: 1, create: create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GuessGate;
