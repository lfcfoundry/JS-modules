/* frame-meter: a tiny speed meter for requestAnimationFrame games: frames a second, slowest frame, hitches with a plain-words cause, and tap-to-next-frame delay. MIT License, Copyright (c) 2026 JNFoo. https://github.com/JNFoo/JS-modules */
'use strict';

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
 * Pure logic: no DOM, no timers, no allocation per frame after warm-up.
 *
 * Limits: it cannot see graphics or presentation stalls (a frame can be
 * "on time" and still be shown late); script timing only. It says "device"
 * for anything that is not your own code.
 */
var FrameMeter = (function () {
  function FrameMeter(opts) {
    opts = opts || {};
    this.everyMs = opts.everyMs || 500;
    this.hitchMs = opts.hitchMs || 50;
    this.ratio = opts.ratio || 2;
    this.gameShare = opts.gameShare || 0.6;
    this.windowMs = opts.windowMs || 60000;
    this.tapKeep = opts.tapKeep || 20;
    this.reset();
  }

  FrameMeter.prototype.reset = function () {
    this._t0 = 0; this._n = 0; this._max = 0;
    this._g = [0, 0, 0]; this._gi = 0; this._gn = 0;
    this._hits = []; this._taps = []; this._tapAt = -1;
    this.fps = 0; this.worstMs = 0; this._changed = false;
  };

  /* now: the requestAnimationFrame timestamp. gapMs: pass your own gap if you already compute one, else it is taken from the last call. workMs: optional. Returns true when the numbers were refreshed. */
  FrameMeter.prototype.frame = function (now, workMs, gapMs) {
    if (!this._t0) { this._t0 = now; this._prev = now; return false; }
    var gap = gapMs == null ? now - this._prev : gapMs; this._prev = now;
    if (this._tapAt >= 0) {
      var d = now - this._tapAt; this._tapAt = -1;
      if (d >= 0 && d <= 1000) { this._taps.push(d); if (this._taps.length > this.tapKeep) this._taps.shift(); }
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
  FrameMeter.prototype.input = function (eventTimeStamp) { this._tapAt = eventTimeStamp; };

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
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FrameMeter; else (typeof globalThis !== 'undefined' ? globalThis : this).FrameMeter = FrameMeter;
