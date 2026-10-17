/* even-dt: smooths the uneven frame gaps a browser reports by snapping them to the screen's learned refresh period. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.1.0 (API 1) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EvenDt = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';   // inside the wrapper, so pasting this file into a game does not make the whole game strict

  /**
   * EvenDt
   *
   * Browsers report frame gaps (the time between two requestAnimationFrame
   * callbacks) that wobble by a millisecond or two even when every frame is
   * presented on time. A game that moves by that raw gap shows the wobble as a
   * faint shiver in scrolling scenery. EvenDt:
   *
   *   1. learns the screen's real period (the MEDIAN of the recent gaps),
   *   2. snaps each gap to the nearest whole multiple of that period when it is
   *      close enough (within `tolerance` of the period), and
   *   3. pays the left-over difference back slowly (`payback` per frame) so the
   *      game clock never drifts away from real time.
   *
   * Gaps that are not close to a whole multiple (real stalls) pass through
   * untouched, and the owed drift is dropped at that point.
   *
   * Usage:
   *   var even = new EvenDt();
   *   function frame(now) {
   *     var dtMs = even.next(now - last); last = now;
   *     step(dtMs / 1000);
   *   }
   *
   * Every option is optional; the defaults are the values from the game this was
   * extracted from.
   *
   * Limit: gaps of `minGap` (2 ms) or less are never learned from. On a very
   * fast screen (about 480 Hz, period near 2 ms) the jitter pushes many real
   * gaps under that line, the short ones are thrown away, and the learned
   * period comes out too long (7% in the test with half a millisecond of
   * jitter; at 360 Hz the same test showed about 1%, and at 240 Hz and below none).
   * On such a screen pass a smaller minGap (for example 0.5). The default stays
   * 2 so that duplicate callbacks and rounding artifacts are still ignored on
   * normal screens.
   */
  function pick(v, d) { return v === undefined || v === null ? d : v; }

  /**
   * @param {object} [opts]
   * @param {number} [opts.minGap=2]       Gaps at or below this (ms) are ignored (returned as is, not learned from).
   * @param {number} [opts.maxGap=60]      Gaps at or above this (ms) are ignored: tab switches, long stalls.
   * @param {number} [opts.window=40]      How many recent gaps the median is taken over.
   * @param {number} [opts.warmup=12]      Gaps needed before any snapping starts (raw gaps are returned until then).
   * @param {number} [opts.refreshEvery=8] The median is recomputed every this many accepted gaps.
   * @param {number} [opts.maxMultiple=3]  Largest whole multiple of the period that may be snapped to (2 = a dropped frame).
   * @param {number} [opts.tolerance=0.3]  A gap snaps only if it is within this fraction of the period from a multiple.
   * @param {number} [opts.payback=0.04]   Fraction of the owed drift paid back per frame (0 = never, 1 = at once).
   */
  function EvenDt(opts) {
    var o = opts || {};
    this.minGap = pick(o.minGap, 2);
    this.maxGap = pick(o.maxGap, 60);
    this.window = Math.max(3, pick(o.window, 40) | 0);
    this.warmup = Math.min(this.window, Math.max(1, pick(o.warmup, 12) | 0));
    this.refreshEvery = Math.max(1, pick(o.refreshEvery, 8) | 0);
    this.maxMultiple = pick(o.maxMultiple, 3);
    this.tolerance = pick(o.tolerance, 0.3);
    this.payback = pick(o.payback, 0.04);
    this._gaps = [];
    this._sorted = [];
    this._since = 0;
    this._period = 0;
    this._drift = 0;
  }

  /** The learned screen period in ms, or 0 while still warming up. */
  Object.defineProperty(EvenDt.prototype, 'period', { get: function () { return this._period; }, configurable: true });

  /** Milliseconds currently owed (positive: the game clock has run ahead of the snapped clock). Mostly for tests and debugging. */
  Object.defineProperty(EvenDt.prototype, 'drift', { get: function () { return this._drift; }, configurable: true });

  /** Forget everything learned. Call after a long pause or when the window moves to another screen. */
  EvenDt.prototype.reset = function () {
    this._gaps.length = 0;
    this._since = 0;
    this._period = 0;
    this._drift = 0;
    return this;
  };

  /**
   * Feed one raw frame gap in ms; get back the smoothed gap in ms.
   * Never returns a negative number. A gap that is not a positive finite
   * number returns 0.
   */
  EvenDt.prototype.next = function (gapMs) {
    var ri = +gapMs;
    if (!(ri > this.minGap && ri < this.maxGap)) return ri > 0 && isFinite(ri) ? ri : 0;
    var g = this._gaps;
    g.push(ri);
    if (g.length > this.window) g.shift();
    if (g.length < this.warmup) return ri;
    if (!this._period || ++this._since >= this.refreshEvery) {
      this._since = 0;
      var s = this._sorted;
      s.length = g.length;
      for (var i = 0; i < g.length; i++) s[i] = g[i];
      s.sort(function (a, b) { return a - b; });
      this._period = s[s.length >> 1];
    }
    var per = this._period;
    var n = Math.round(ri / per);
    var snap = n * per;
    if (n < 1 || n > this.maxMultiple || Math.abs(ri - snap) > per * this.tolerance) {
      this._drift = 0;
      return ri;
    }
    this._drift += ri - snap;
    var pay = this._drift * this.payback;
    this._drift -= pay;
    return snap + pay;
  };

  return EvenDt;
});
