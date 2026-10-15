/* quality-governor: steps a quality level up or down from how long frames really take, with hysteresis. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules */
'use strict';

/**
 * QualityGovernor
 *
 * Feed it every frame's real gap and the current time; it keeps a smoothed
 * average of the gap and moves a quality level between 0 (full quality) and
 * levels-1 (lightest):
 *
 *   - STEP DOWN (level + 1) when the smoothed gap has been "slow" for
 *     `slowFrames` frames in a row AND at least `downDelay` ms have passed
 *     since the last change. The average is then reset so the next step has to
 *     be earned again from scratch.
 *   - STEP UP (level - 1) when the smoothed gap has been "fast" for a total of
 *     `fastMs` of real time in a row AND at least `upDelay` ms have passed
 *     since the last change.
 *
 * Stepping down is quick and stepping up is slow on purpose (hysteresis), so
 * the level does not flap between two settings at a borderline frame rate.
 * What a level MEANS is entirely up to the caller (fewer particles, lower
 * canvas resolution, ...): do it in `onChange`.
 *
 * KNOWN LIMITATION: "slow" and "fast" are measured against a 60 Hz screen
 * (16.7 ms) by default. A clean 30 Hz screen (33.3 ms gaps) therefore looks
 * slow and will be stepped all the way down even though it is running fine.
 * If you know the expected period, pass `expectedPeriod` (for example the
 * period learned by EvenDt) and the thresholds scale with it. The governor
 * cannot tell "this screen is 30 Hz" from "this machine is struggling at
 * 30 fps" by itself.
 *
 * Usage:
 *   var gov = new QualityGovernor({
 *     levels: 5,
 *     onChange(level) { applyQuality(level); }
 *   });
 *   function frame(now) { gov.frame(now - last, now); last = now; }
 */
var QualityGovernor = (function () {
  function pick(v, d) { return v === undefined || v === null ? d : v; }

  // The original game's thresholds were 22 ms (slow) and 18.5 ms (fast) around
  // a 16.7 ms frame. They are kept as ratios so expectedPeriod can rescale them.
  var BASE_PERIOD = 16.7;
  var SLOW_RATIO = 22 / BASE_PERIOD;
  var FAST_RATIO = 18.5 / BASE_PERIOD;

  /**
   * @param {object} [opts]
   * @param {number}   [opts.levels=5]           How many levels there are: 0 .. levels-1.
   * @param {function} [opts.onChange]           Called as onChange(level, previousLevel) after every change, including force().
   * @param {number}   [opts.expectedPeriod=16.7] Normal frame gap (ms) of this screen. Sets the starting average and, unless overridden, the slow/fast thresholds.
   * @param {number}   [opts.slowAbove]          Smoothed gap (ms) above which frames count as slow. Default: expectedPeriod * 1.317 (22 ms at 16.7).
   * @param {number}   [opts.fastBelow]          Smoothed gap (ms) below which frames count as fast. Default: expectedPeriod * 1.108 (18.5 ms at 16.7).
   * @param {number}   [opts.smoothing=0.06]     Weight of each new gap in the running average (exponential moving average).
   * @param {number}   [opts.slowFrames=100]     Consecutive slow frames needed to step down.
   * @param {number}   [opts.downDelay=3000]     Minimum ms since the last change before a step down.
   * @param {number}   [opts.fastMs=10000]       Consecutive fast time (ms) needed to step up.
   * @param {number}   [opts.upDelay=10000]      Minimum ms since the last change before a step up.
   * @param {number}   [opts.maxGap=100]         Gaps above this (ms), or at or below 0, are not measured (tab switches, stalls) and break the slow streak.
   * @param {boolean}  [opts.enabled=true]       When false, frame() does nothing.
   * @param {number}   [opts.level=0]            Starting level (onChange is not called for it).
   */
  function QualityGovernor(opts) {
    var o = opts || {};
    this.levels = Math.max(1, pick(o.levels, 5) | 0);
    this.onChange = typeof o.onChange === 'function' ? o.onChange : null;
    this.expectedPeriod = pick(o.expectedPeriod, BASE_PERIOD);
    this.slowAbove = pick(o.slowAbove, this.expectedPeriod * SLOW_RATIO);
    this.fastBelow = pick(o.fastBelow, this.expectedPeriod * FAST_RATIO);
    this.smoothing = pick(o.smoothing, 0.06);
    this.slowFrames = pick(o.slowFrames, 100);
    this.downDelay = pick(o.downDelay, 3000);
    this.fastMs = pick(o.fastMs, 10000);
    this.upDelay = pick(o.upDelay, 10000);
    this.maxGap = pick(o.maxGap, 100);
    this.enabled = pick(o.enabled, true);
    this._level = Math.min(this.levels - 1, Math.max(0, pick(o.level, 0) | 0));
    this._ema = this.expectedPeriod;
    this._slow = 0;
    this._fast = 0;
    this._changedAt = null;   // time of the last change; set to the first frame's time so the start-up counts as a grace period
    this._lastNow = null;
  }

  /** Current quality level, 0 (full) .. levels-1 (lightest). */
  Object.defineProperty(QualityGovernor.prototype, 'level', { get: function () { return this._level; }, configurable: true });

  /** The smoothed frame gap in ms (for a debug overlay). */
  Object.defineProperty(QualityGovernor.prototype, 'average', { get: function () { return this._ema; }, configurable: true });

  /** Call when frames are not representative (menu open, tab hidden): drops the current slow streak. */
  QualityGovernor.prototype.hold = function () { this._slow = 0; return this; };

  /**
   * Feed one frame.
   * @param {number} gapMs Real time since the previous frame, in ms.
   * @param {number} nowMs Current time in ms from any steady clock (rAF timestamp, performance.now()).
   */
  QualityGovernor.prototype.frame = function (gapMs, nowMs) {
    if (!this.enabled) return;
    if (this._changedAt === null) this._changedAt = nowMs;
    this._lastNow = nowMs;
    if (!(gapMs > 0) || gapMs > this.maxGap) { this._slow = 0; return; }
    this._ema += (gapMs - this._ema) * this.smoothing;
    if (this._ema > this.slowAbove) {
      this._slow++;
      this._fast = 0;
    } else {
      this._slow = 0;
      if (this._ema < this.fastBelow) this._fast += gapMs; else this._fast = 0;
    }
    if (this._slow >= this.slowFrames && this._level < this.levels - 1 && nowMs - this._changedAt > this.downDelay) {
      this._move(this._level + 1, nowMs);
    } else if (this._fast > this.fastMs && this._level > 0 && nowMs - this._changedAt > this.upDelay) {
      this._move(this._level - 1, nowMs);
    }
  };

  /**
   * Jump to a level (clamped to 0..levels-1), for example from a user setting
   * such as a battery saver. Streaks and the average restart, and the
   * step-delay clock restarts from the last frame time seen.
   */
  QualityGovernor.prototype.force = function (n) {
    var to = Math.min(this.levels - 1, Math.max(0, n | 0));
    this._move(to, this._lastNow === null ? null : this._lastNow);
    return this;
  };

  QualityGovernor.prototype._move = function (to, now) {
    var from = this._level;
    this._level = to;
    this._changedAt = now;
    this._slow = 0;
    this._fast = 0;
    if (to > from) this._ema = this.expectedPeriod;   // after a step down the average starts over; after a step up it is kept
    if (to !== from && this.onChange) this.onChange(to, from);
  };

  return QualityGovernor;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QualityGovernor; else (typeof globalThis !== 'undefined' ? globalThis : this).QualityGovernor = QualityGovernor;
