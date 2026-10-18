/* quality-governor: steps a quality level up or down from how long frames really take, with hysteresis. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.2.1 (API 1) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QualityGovernor = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';   // inside the wrapper, so pasting this file into a game does not make the whole game strict

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
   *     since the last change. A stall (a gap over `maxGap`, for example a hidden
   *     tab coming back) ends the "in a row".
   *
   * Stepping down is quick and stepping up is slow on purpose (hysteresis), so
   * the level does not flap between two settings at a borderline frame rate.
   * What a level MEANS is entirely up to the caller (fewer particles, lower
   * canvas resolution, ...): do it in `onChange`.
   *
   * FLIP-FLOP GUARD: hysteresis stops quick flapping but not a slow loop (the
   * lighter level is fine, the heavier one is too much for the device, so the
   * level goes up after ten calm seconds and down again a few seconds later,
   * for ever, and every cycle may cost a visible hitch). The guard counts such
   * quick reversals (a step up followed by a step down within `flipWindow` ms).
   * Each reversal doubles the wait before that level is tried again, and after
   * `flipLimit` reversals the governor gives up on that level and stays put.
   * The guard is off by default (`flipLimit: 0`, the older behavior); `flipLimit: 3` turns it on.
   *
   * KNOWN LIMITATION: "slow" and "fast" are measured against a 60 Hz screen
   * (16.7 ms) by default. A clean 30 Hz screen (33.3 ms gaps) therefore looks
   * slow and will be stepped all the way down even though it is running fine.
   * If you know the expected period, pass `expectedPeriod` (for example the
   * period learned by EvenDt) and the thresholds scale with it. The governor
   * cannot tell "this screen is 30 Hz" from "this machine is struggling at
   * 30 FPS" by itself.
   *
   * Usage:
   *   var gov = new QualityGovernor({
   *     levels: 5,
   *     onChange: function (level) { applyQuality(level); }
   *   });
   *   function frame(now) { gov.frame(now - last, now); last = now; }
   */
  function pick(v, d) { return v === undefined || v === null ? d : v; }

  // The original game's thresholds were 22 ms (slow) and 18.5 ms (fast) around
  // a 16.7 ms frame. They are kept as ratios so expectedPeriod can rescale them.
  var BASE_PERIOD = 16.7;
  var SLOW_RATIO = 22 / BASE_PERIOD;
  var FAST_RATIO = 18.5 / BASE_PERIOD;

  /**
   * @param {object} [opts]
   * @param {number}   [opts.levels=5]           How many levels there are: 0 .. levels-1.
   * @param {function} [opts.onChange]           Called as onChange(level, previousLevel) after every change, including force(). The state is already updated when it runs, and an error thrown by it never stops the governor (see onError).
   * @param {function} [opts.onError]            Called as onError(error) when onChange throws. Without it the error is rethrown from a timer (so it still shows in the console) and frame() carries on.
   * @param {number}   [opts.expectedPeriod=16.7] Normal frame gap (ms) of this screen. Sets the starting average and, unless overridden, the slow/fast thresholds.
   * @param {number}   [opts.slowAbove]          Smoothed gap (ms) above which frames count as slow. Default: expectedPeriod * 1.317 (22 ms at 16.7).
   * @param {number}   [opts.fastBelow]          Smoothed gap (ms) below which frames count as fast. Default: expectedPeriod * 1.108 (18.5 ms at 16.7).
   * @param {number}   [opts.smoothing=0.06]     Weight of each new gap in the running average (exponential moving average).
   * @param {number}   [opts.slowFrames=100]     Consecutive slow frames needed to step down.
   * @param {number}   [opts.downDelay=3000]     Minimum ms since the last change before a step down.
   * @param {number}   [opts.fastMs=10000]       Consecutive fast time (ms) needed to step up.
   * @param {number}   [opts.upDelay=10000]      Minimum ms since the last change before a step up.
   * @param {number}   [opts.maxGap=100]         Gaps above this (ms), or at or below 0, are not measured (tab switches, stalls) and break the slow streak; a gap above it also ends the fast streak. A run of `stallRun` such gaps is measured after all (see stallRun).
   * @param {number}   [opts.stallRun=4]         This many gaps over maxGap in a row mean a device that is always that slow, not a pause: they are measured, so a device under about 10 frames a second is no longer ignored. One to three stray stalls still change nothing.
   * @param {boolean}  [opts.stepUp=true]        false: the governor only ever steps down (it never undoes a level behind the player's back; the player or force() raises it).
   * @param {number}   [opts.flipLimit=0]        Quick reversals on one level before the governor gives up on that level. 0 (the default) = guard off, 3 is a good value.
   * @param {number}   [opts.flipWindow=30000]   A step down this soon (ms) after a step up to the same level is a reversal.
   * @param {boolean}  [opts.enabled=true]       When false, frame() does nothing.
   * @param {number}   [opts.level=0]            Starting level (onChange is not called for it).
   */
  function QualityGovernor(opts) {
    var o = opts || {};
//@begin options
    this.levels = Math.max(1, pick(o.levels, 5) | 0);
//@else
//@    this.levels = 5;
//@end
    this.onChange = typeof o.onChange === 'function' ? o.onChange : null;
//@begin errors
    this.onError = typeof o.onError === 'function' ? o.onError : null;
//@end
//@begin options
    this.expectedPeriod = pick(o.expectedPeriod, BASE_PERIOD);
    this.slowAbove = pick(o.slowAbove, this.expectedPeriod * SLOW_RATIO);
    this.fastBelow = pick(o.fastBelow, this.expectedPeriod * FAST_RATIO);
    this.smoothing = pick(o.smoothing, 0.06);
    this.slowFrames = pick(o.slowFrames, 100);
    this.downDelay = pick(o.downDelay, 3000);
    this.fastMs = pick(o.fastMs, 10000);
    this.upDelay = pick(o.upDelay, 10000);
    this.maxGap = pick(o.maxGap, 100);
//@else
//@    this.expectedPeriod = BASE_PERIOD; this.slowAbove = 22; this.fastBelow = 18.5; this.smoothing = 0.06; this.slowFrames = 100; this.downDelay = 3000; this.fastMs = 10000; this.upDelay = 10000; this.maxGap = 100;
//@end
//@begin flipGuard
    this.flipLimit = Math.max(0, pick(o.flipLimit, 0) | 0);
    this.flipWindow = pick(o.flipWindow, 30000);
//@end
//@begin stallRules
    this.stallRun = Math.max(1, pick(o.stallRun, 4) | 0);   // this many long gaps in a row are a slow device, not a stall
//@end
//@begin control
    this.stepUp = pick(o.stepUp, true);   // false: only ever steps down (a game that must not undo the player's choice behind their back)
    this.locked = false;   // lock(): the player picked a level; automatic steps stop until unlock()
//@end
//@begin stallRules
    this._run = 0;
//@end
//@begin control
    this.enabled = pick(o.enabled, true);
//@end
//@begin errors
    this.lastError = null;   // the last error thrown by onChange, if any
//@end
//@begin options
    this._level = Math.min(this.levels - 1, Math.max(0, pick(o.level, 0) | 0));
//@else
//@    this._level = 0;
//@end
    this._ema = this.expectedPeriod;
    this._slow = 0;
    this._fast = 0;
//@begin graceStart
    this._changedAt = null;   // time of the last change; set to the first frame's time so the start-up counts as a grace period
//@else
//@    this._changedAt = 0;
//@end
    this._lastNow = null;
//@begin flipGuard
    this._pen = [];           // quick reversals seen per level (index = the level that was too heavy)
    this._flips = 0;          // all reversals seen
    this._minLevel = 0;       // the lightest-to-heaviest limit: the governor will not step up above this level
    this._upTo = -1;          // level reached by the last automatic step up (-1 = last change was not one)
    this._upAt = 0;           // time of that step
    this._resetGuard();
//@end
  }

  /** Current quality level, 0 (full) .. levels-1 (lightest). */
  Object.defineProperty(QualityGovernor.prototype, 'level', { get: function () { return this._level; }, configurable: true });

//@begin stats
  /** The smoothed frame gap in ms (for a debug overlay). */
  Object.defineProperty(QualityGovernor.prototype, 'average', { get: function () { return this._ema; }, configurable: true });
//@end

//@begin flipGuard
  /** How many quick reversals (up, then down again soon) the flip-flop guard has seen. */
  Object.defineProperty(QualityGovernor.prototype, 'flips', { get: function () { return this._flips; }, configurable: true });

  /** True when the flip-flop guard has given up on at least one level: the governor will not step up past it. force() or resetGuard() clears this. */
  Object.defineProperty(QualityGovernor.prototype, 'gaveUp', { get: function () { return this._minLevel > 0; }, configurable: true });
//@end

//@begin flipGuard
  QualityGovernor.prototype._resetGuard = function () {
    this._pen.length = 0;
    for (var i = 0; i < this.levels; i++) this._pen.push(0);
    this._flips = 0; this._minLevel = 0; this._upTo = -1;
  };
//@end

//@begin control
  /** Freeze the level (the player chose it) until unlock(). */
  QualityGovernor.prototype.lock = function () { this.locked = true; return this; };
  QualityGovernor.prototype.unlock = function () { this.locked = false; this._slow = 0; this._fast = 0; return this; };
//@end

//@begin flipGuard
  /** Forget the reversals and the give-ups, so every level may be tried again. */
  QualityGovernor.prototype.resetGuard = function () { this._resetGuard(); return this; };
//@end

//@begin control
  /** Call when frames are not representative (menu open, tab hidden): drops the current slow and fast streaks. */
  QualityGovernor.prototype.hold = function () { this._slow = 0; this._fast = 0; return this; };
//@end

//@begin flipGuard
  /* how many times longer the wait before stepping up INTO level `a` is: 1, 2, 4 ... after each quick reversal on it */
  QualityGovernor.prototype._wait = function (a) {
    var p = this._pen[a] | 0;
    return p > 0 ? Math.pow(2, Math.min(p, 10)) : 1;
  };
//@end

  /**
   * Feed one frame.
   * @param {number} gapMs Real time since the previous frame, in ms.
   * @param {number} nowMs Current time in ms from any steady clock (rAF timestamp, performance.now()).
   */
  QualityGovernor.prototype.frame = function (gapMs, nowMs) {
//@begin control
    if (!this.enabled || this.locked) return;
//@end
//@begin graceStart
    if (this._changedAt === null) this._changedAt = nowMs;
//@end
//@begin stallRules
    var last = this._lastNow;
//@end
    this._lastNow = nowMs;
//@begin stallRules
    // A long stall (hidden tab, sleep, a freeze) ends both streaks: "10 s fast in a row" cannot include it.
    var long = gapMs > this.maxGap || (last !== null && nowMs - last > this.maxGap);
    this._run = long ? this._run + 1 : 0;
    var stalled = long && this._run < this.stallRun;
    if (!(gapMs > 0) || stalled) { this._slow = 0; if (stalled) this._fast = 0; return; }
//@else
//@    if (!(gapMs > 0) || gapMs > this.maxGap) { this._slow = 0; return; }
//@end
    this._ema += (gapMs - this._ema) * this.smoothing;
    if (this._ema > this.slowAbove) {
      this._slow++;
      this._fast = 0;
    } else {
      this._slow = 0;
      if (this._ema < this.fastBelow) this._fast += gapMs; else this._fast = 0;
    }
    if (this._slow >= this.slowFrames && this._level < this.levels - 1 && nowMs - this._changedAt > this.downDelay) {
      this._move(this._level + 1, nowMs, 1);
    } else if (
//@begin control
      this.stepUp &&
//@end
//@begin flipGuard
      this._level > this._minLevel
//@else
//@      this._level > 0
//@end
    ) {
//@begin flipGuard
      var m = this._wait(this._level - 1);
//@else
//@      var m = 1;
//@end
      if (this._fast > this.fastMs * m && nowMs - this._changedAt > this.upDelay * m) this._move(this._level - 1, nowMs, -1);
    }
  };

//@begin control
  /**
   * Jump to a level (clamped to 0..levels-1), for example from a user setting
   * such as a battery saver. Streaks and the average restart, the
   * step-delay clock restarts from the last frame time seen, and the flip-flop
   * guard starts over.
   */
  QualityGovernor.prototype.force = function (n) {
    var to = Math.min(this.levels - 1, Math.max(0, n | 0));
    this._move(to, this._lastNow === null ? null : this._lastNow, 0);
    return this;
  };
//@end

  /* kind: 1 = automatic step down, -1 = automatic step up, 0 = force(). All state is final before onChange is called. */
  QualityGovernor.prototype._move = function (to, now, kind) {
    var from = this._level;
//@begin flipGuard
    if (kind === 0) {
      this._resetGuard();
    } else if (kind < 0) {
      this._upTo = to; this._upAt = now;
    } else {
      if (this.flipLimit > 0 && this._upTo === from && now - this._upAt <= this.flipWindow) {
        // went up to `from` a moment ago and is already going down again: level `from` is too heavy for this device
        this._flips++;
        if (++this._pen[from] >= this.flipLimit && this._minLevel < from + 1) this._minLevel = from + 1;
      }
      this._upTo = -1;
    }
//@end
    this._level = to;
    this._changedAt = now;
    this._slow = 0;
    this._fast = 0;
    if (to > from) this._ema = this.expectedPeriod;   // after a step down the average starts over; after a step up it is kept
    if (to !== from && this.onChange) {
//@begin errors
      try { this.onChange(to, from); } catch (err) { this._fail(err); }
//@else
//@      this.onChange(to, from);
//@end
    }
  };

//@begin errors
  QualityGovernor.prototype._fail = function (err) {
    this.lastError = err;
    if (this.onError) { try { this.onError(err); } catch (e) { /* ignore */ } return; }
    if (typeof setTimeout === 'function') setTimeout(function () { throw err; }, 0);   // still visible in the console, but the frame loop is not hurt
  };
//@end

  return QualityGovernor;
});
