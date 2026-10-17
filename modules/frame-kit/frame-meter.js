/* frame-meter: a tiny speed meter for requestAnimationFrame games: frames a second, slowest frame, hitches with a plain-words cause, and tap-to-next-frame delay. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.1.0 (API 1) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FrameMeter = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';   // inside the wrapper, so pasting this file into a game does not make the whole game strict

  /**
   * FrameMeter
   *
   * Call frame(now, workMs) once per animation frame and input(eventTimeStamp)
   * from a pointerdown. Read lines() about twice a second and show the text.
   *
   *   - fps:     frames counted over the last report interval.
   *   - worst:   the longest gap between two frames in that interval.
   *   - hitch:   a frame whose gap is more than `ratio` times the average of the
   *              three frames before it AND longer than `hitchMs`. (A relative
   *              rule, so it works at 30, 60 or 120 Hz. Idea from PerfDog's jank
   *              rule, tuned for a flick game.)
   *   - cause:   when you pass workMs (how long your own update and draw took),
   *              a hitch is called "game" if the work was at least `gameShare`
   *              of the gap, otherwise "device" (the browser, the graphics
   *              driver or power saving). Without workMs the cause is unknown.
   *   - tap:     the median of the last `tapKeep` delays from an input event's
   *              timeStamp to the next frame callback. It is the delay until the
   *              next frame starts, not until the picture reaches the glass.
   *
   * PAUSES: a tab that was hidden and comes back, or a device that slept, shows
   * up as one huge gap. That is not a slow game, so the meter skips it: the
   * first gap after pause() (call it when the tab is hidden or a menu opens),
   * after document.hidden was seen, or a gap longer than `pauseGapMs` (default
   * 1000 ms) is not counted as a frame, a hitch or the worst gap, and the
   * running average and report interval start over.
   *
   * Pure logic: no DOM access except one guarded read of document.hidden, no
   * timers, no allocation per frame after warm-up.
   *
   * Limits: it cannot see graphics or presentation stalls (a frame can be
   * "on time" and still be shown late); script timing only. It says "device"
   * for anything that is not your own code. On a coarse clock (Firefox with
   * privacy protection rounds time to 16.67 ms or more) workMs is mostly 0 or
   * a whole tick, so "game or device" is not reliable there.
   */

  /**
   * @param {object} [opts]
   * @param {number} [opts.everyMs=500]     Report interval.
   * @param {number} [opts.hitchMs=50]      A hitch must be longer than this many ms.
   * @param {number} [opts.ratio=2]         ... and longer than this times the average of the three frames before it.
   * @param {number} [opts.gameShare=0.6]   Work share of the gap at or above which the cause is "game".
   * @param {number} [opts.windowMs=60000]  How long a hitch stays in the verdict.
   * @param {number} [opts.tapKeep=20]      How many tap delays the median covers.
   * @param {number} [opts.pauseGapMs=1000] A gap longer than this is a pause (hidden tab, sleep), not a frame.
   * @param {number} [opts.tapSlackMs=50]   A tap whose timeStamp is up to this many ms AFTER the frame time counts as a 0 ms delay (the event arrived during the frame); a larger mismatch is dropped.
   */
  function FrameMeter(opts) {
    opts = opts || {};
    this.everyMs = opts.everyMs || 500;
    this.hitchMs = opts.hitchMs || 50;
    this.ratio = opts.ratio || 2;
    this.gameShare = opts.gameShare || 0.6;
    this.windowMs = opts.windowMs || 60000;
    this.tapKeep = opts.tapKeep || 20;
    this.pauseGapMs = opts.pauseGapMs || 1000;
    this.tapSlackMs = opts.tapSlackMs == null ? 50 : opts.tapSlackMs;
    this.reset();
  }

  FrameMeter.prototype.reset = function () {
    this._started = false; this._skip = false; this._prev = 0;
    this._t0 = 0; this._n = 0; this._max = 0;
    this._g = [0, 0, 0]; this._gi = 0; this._gn = 0;
    this._hits = []; this._taps = []; this._tapAt = -1;
    this.fps = 0; this.worstMs = 0; this._changed = false;
    this.pauses = 0;        // how many pauses were skipped (for a debug line)
    this.tapsDropped = 0;   // taps thrown away because their timestamp did not fit the frame clock
  };

  /* Call when frames stop being representative (tab hidden, menu or ad open): the next gap is skipped. Returns the meter. */
  FrameMeter.prototype.pause = function () { this._skip = true; return this; };

  /* forget the running average and restart the report interval at `now` (does not touch the hitches already recorded) */
  FrameMeter.prototype._rebase = function (now) {
    this._skip = false; this._prev = now; this._t0 = now;
    this._n = 0; this._max = 0; this._gn = 0; this._gi = 0; this._tapAt = -1;
    this.pauses++;
  };

  /* now: the requestAnimationFrame timestamp. gapMs: pass your own gap if you already compute one, else it is taken from the last call. workMs: optional. Returns true when the numbers were refreshed. Never throws. */
  FrameMeter.prototype.frame = function (now, workMs, gapMs) {
    if (typeof now !== 'number' || now !== now) return false;
    if (!this._started) { this._started = true; this._t0 = now; this._prev = now; return false; }
    var real = now - this._prev, hidden = false;
    try { hidden = typeof document !== 'undefined' && document.hidden === true; } catch (e) { hidden = false; }
    var gap = gapMs == null ? real : gapMs;
    if (this._skip || hidden || !(real >= 0) || real > this.pauseGapMs || gap > this.pauseGapMs) { this._rebase(now); return false; }
    this._prev = now;
    if (this._tapAt >= 0) {
      var d = now - this._tapAt; this._tapAt = -1;
      if (d < 0 && d >= -this.tapSlackMs) d = 0;   // the event came in during this frame: its delay is zero, not negative
      if (d >= 0 && d <= 1000) { this._taps.push(d); if (this._taps.length > this.tapKeep) this._taps.shift(); }
      else this.tapsDropped++;
    }
    this._n++; if (gap > this._max) this._max = gap;
    if (this._gn >= 3) {
      var avg = (this._g[0] + this._g[1] + this._g[2]) / 3;
      if (gap > this.hitchMs && gap > this.ratio * avg) {
        var cause = workMs == null ? '?' : (workMs >= this.gameShare * gap ? 'game' : 'device');
        this._hits.push(now, cause);
      }
    }
    this._g[this._gi] = gap; this._gi = (this._gi + 1) % 3; if (this._gn < 3) this._gn++;
    var cut = now - this.windowMs; while (this._hits.length && this._hits[0] < cut) this._hits.splice(0, 2);
    if (now - this._t0 >= this.everyMs) {
      this.fps = Math.round(this._n * 1000 / (now - this._t0)); this.worstMs = Math.round(this._max);
      this._n = 0; this._max = 0; this._t0 = now; this._changed = true; return true;
    }
    return false;
  };

  /* call from pointerdown with event.timeStamp (same clock as the frame timestamp) */
  FrameMeter.prototype.input = function (eventTimeStamp) { if (typeof eventTimeStamp === 'number' && eventTimeStamp >= 0) this._tapAt = eventTimeStamp; };

  FrameMeter.prototype.tapMs = function () {
    var n = this._taps.length; if (!n) return -1;
    var s = this._taps.slice().sort(function (a, b) { return a - b; });
    return Math.round(s[n >> 1]);
  };

  /* hitches in the last windowMs: { count, game, device, unknown } */
  FrameMeter.prototype.hitches = function () {
    var r = { count: this._hits.length / 2, game: 0, device: 0, unknown: 0 }, i, c;
    for (i = 1; i < this._hits.length; i += 2) { c = this._hits[i]; if (c === 'game') r.game++; else if (c === 'device') r.device++; else r.unknown++; }
    return r;
  };

  /* plain words: "smooth", or "2 hitches: the game", "1 hitch: the device", "3 hitches: both" */
  FrameMeter.prototype.verdict = function () {
    var h = this.hitches(); if (!h.count) return 'smooth';
    var who = h.game && h.device ? 'both' : h.game ? 'the game' : h.device ? 'the device' : 'cause unknown';
    return h.count + (h.count === 1 ? ' hitch: ' : ' hitches: ') + who;
  };

  /* the lines to show, first the numbers, then your own lines (for example quality), then the tap delay and the verdict */
  FrameMeter.prototype.lines = function (extra) {
    var out = [this.fps + ' fps', 'worst ' + this.worstMs + ' ms'], i, t = this.tapMs();
    if (extra) for (i = 0; i < extra.length; i++) out.push(extra[i]);
    if (t >= 0) out.push('tap ' + t + ' ms');
    out.push(this.verdict());
    return out;
  };

  return FrameMeter;
});
