/* job-pump: runs queued build steps for about N milliseconds per frame so a big pre-render never hitches a frame. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JobPump = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';   // inside the wrapper, so pasting this file into a game does not make the whole game strict

  /**
   * JobPump
   *
   * A first-in-first-out queue of build jobs that you drain a little at a time:
   * call run(budgetMs) once per frame and it executes steps until about
   * budgetMs have been spent, then returns so the frame can be drawn.
   *
   * A job is either
   *   - a plain function: one step, runs to completion; or
   *   - a generator function (or an already-created generator object): every
   *     `yield` ends one step, so a long job is cut into slices, and the pump
   *     resumes it on a later frame.
   *
   * The budget is checked AFTER each step, so a frame can overshoot the budget by
   * at most the length of one step: keep steps small (about a millisecond).
   * Jobs run strictly in the order they were added; a generator is finished
   * before the next job starts.
   *
   * COARSE CLOCKS: some browsers round the clock to 16.67 ms or more (Firefox with
   * privacy protection). Then a 4 ms budget cannot be measured: the clock reads
   * the same until a whole tick has passed, which is a whole frame. The pump
   * notices (it remembers the smallest clock jump it has seen, or you tell it with
   * `clockStepMs`) and, while the clock stays frozen, stops after a small number
   * of steps instead (`stuckSteps`, learned downwards when the clock then jumps
   * past the budget). This only protects you if steps are small.
   *
   * RULE: never hold a shared scratch resource (a reused temporary canvas, a
   * shared ImageData or typed array, a global "current" object) across a yield.
   * Another job may run between two slices and overwrite it. Fill it and use it
   * inside one slice, or give each job its own.
   *
   * Usage:
   *   var pump = new JobPump();
   *   pump.add(function* () { for (var y = 0; y < 2048; y += 16) { paintRows(y, 16); yield; } });
   *   pump.add(function () { bakeSmallThing(); });
   *   function frame() { pump.run(4); draw(); requestAnimationFrame(frame); }
   */
  var ITER = typeof Symbol === 'function' ? Symbol.iterator : null;

  function isIterator(r) {
    return !!r && typeof r === 'object' && typeof r.next === 'function' && !!ITER && typeof r[ITER] === 'function';
  }

  /* The default clock: performance.now when there is one, else Date.now. Always called as a plain function from our own closure. */
  function defaultClock() {
    var p = typeof performance !== 'undefined' ? performance : null;
    if (p && typeof p.now === 'function') return function () { return p.now(); };
    return function () { return Date.now(); };
  }

  /* A clock the caller gave us. A bare performance.now (or any DOM method) throws "Illegal invocation" when it is called without its object, so that one is wrapped. */
  function userClock(f) {
    var p = typeof performance !== 'undefined' ? performance : null;
    if (p && f === p.now) return function () { return p.now(); };
    return f;
  }

  /**
   * @param {object} [opts]
   * @param {function} [opts.now]         Clock returning milliseconds. Default: performance.now (or Date.now). A bare `performance.now` is fine. If the clock throws or does not return a number, the default clock is used instead.
   * @param {function} [opts.onError]     Called as onError(error) when a job throws. The failed job is dropped and the queue continues. Without it the error is rethrown from run() (the failed job is still dropped).
   * @param {number}   [opts.clockStepMs] The clock's smallest step in ms, if you know it (16.67 for a 60 Hz-rounded clock). Without it the pump learns it from the first jumps it sees.
   * @param {number}   [opts.stuckSteps=8] On a coarse clock: the most steps one run() may do while the clock has not moved (it can be lowered by the pump, never raised above this).
   */
  function JobPump(opts) {
    var o = opts || {};
    this._custom = typeof o.now === 'function';
    this._clock = this._custom ? userClock(o.now) : defaultClock();
    this._onError = typeof o.onError === 'function' ? o.onError : null;
    this._res = o.clockStepMs > 0 ? +o.clockStepMs : 0;   // smallest positive clock jump seen; 0 = not known yet
    this._capMax = o.stuckSteps >= 1 ? Math.floor(o.stuckSteps) : 8;
    this._cap = this._capMax;
    this._q = [];
    this._head = 0;
    this._running = false;
    this._t0 = 0;
    this._prev = 0;
  }

  /** Number of jobs waiting (a half-finished generator counts as one). */
  Object.defineProperty(JobPump.prototype, 'size', { get: function () { return this._q.length - this._head; }, configurable: true });

  /** The smallest clock jump the pump has seen, in ms (0 = none yet). A value above your budget means the clock is too coarse to measure it. */
  Object.defineProperty(JobPump.prototype, 'clockStepMs', { get: function () { return this._res; }, configurable: true });

  /**
   * Queue a job: a function, a generator function, or a generator object.
   * A function is called when its turn comes; if what it returns is a
   * generator object, that is run slice by slice (that is how generator
   * functions are told apart from plain ones, so a plain function must not
   * return an iterator). Returns the pump for chaining.
   */
  JobPump.prototype.add = function (job) {
    if (typeof job === 'function') this._q.push({ fn: job, gen: null });
    else if (isIterator(job)) this._q.push({ fn: null, gen: job });
    else throw new TypeError('JobPump.add: expected a function, generator function or generator object');
    return this;
  };

  /* one clock reading as a number; NaN when the clock throws or answers with something else */
  JobPump.prototype._tick = function () {
    try { var v = this._clock(); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
  };

  /* After a finished step: true when this run() should stop. */
  JobPump.prototype._over = function (steps, budget, coarse) {
    if (budget === 0) return true;   // the minimum number of steps is all that was asked for
    var now = this._tick(), d = now - this._prev;
    if (d > 0) { if (!(this._res > 0) || d < this._res) this._res = d; }
    if (now === now) this._prev = now;
    var e = now - this._t0;
    if (e >= budget) {
      // The clock jumped past the budget. On a coarse clock that tells us the steps were too many: take fewer next time.
      if (coarse && e > 0 && budget > 0) this._cap = Math.max(1, Math.min(this._cap, steps >> 1));
      return true;
    }
    if (coarse && !(e > 0) && steps >= this._cap) {   // the clock has not moved for `cap` steps: it cannot enforce the budget, so count steps
      if (this._cap < this._capMax) this._cap++;
      return true;
    }
    return false;
  };

  /**
   * Run steps for about budgetMs milliseconds (and at least minSteps steps,
   * default 1, so progress is guaranteed even with a budget of 0).
   * Use Infinity as the budget to finish everything now.
   * @returns {boolean} true while work remains.
   */
  JobPump.prototype.run = function (budgetMs, minSteps) {
    if (this._running) return this.size > 0;   // a job called run(): do nothing nested
    var budget = +budgetMs;
    if (!(budget >= 0)) budget = 0;
    var min = minSteps > 0 ? minSteps : 1;
    var t0 = this._tick();
    if (t0 !== t0 && this._custom) {   // the clock we were given does not work: use the default one from now on
      this._custom = false; this._clock = defaultClock(); t0 = this._tick();
    }
    this._t0 = t0; this._prev = t0;
    // A clock that cannot resolve the budget (or that we know nothing about yet) is checked by counting steps as well.
    var coarse = budget !== Infinity && (!(this._res > 0) || this._res > budget);
    var steps = 0;
    this._running = true;
    try {
      while (this._head < this._q.length) {
        var job = this._q[this._head];
        var finished = false;
        var counted = true;
        try {
          if (job.gen === null) {
            var r = job.fn();
            if (isIterator(r)) { job.gen = r; counted = false; }   // a generator function: starting it does no work yet
            else finished = true;
          } else {
            finished = !!job.gen.next().done;
          }
        } catch (err) {
          this._drop(job);
          if (!this._onError) throw err;
          this._onError(err);
          if (++steps >= min && this._over(steps, budget, coarse)) break;
          continue;
        }
        if (finished) this._drop(job);
        if (counted && ++steps >= min && this._over(steps, budget, coarse)) break;
      }
    } finally {
      this._running = false;
    }
    return this.size > 0;
  };

  /** Drop every waiting job. Half-finished generators are closed, so their `finally` blocks run. Safe to call from inside a job; jobs added after it (even by the same job) are kept. */
  JobPump.prototype.clear = function () {
    var q = this._q;
    var h = this._head;
    this._q = [];
    this._head = 0;
    for (var i = h; i < q.length; i++) {
      var g = q[i].gen;
      if (g && typeof g.return === 'function') { try { g.return(); } catch (e) { /* ignore */ } }
    }
    return this;
  };

  /* Remove `job` from the front of the queue. If clear() already swapped the queue during this step, the job is gone and the new queue is left alone. */
  JobPump.prototype._drop = function (job) {
    if (this._q[this._head] !== job) return;
    this._q[this._head++] = null;
    if (this._head === this._q.length) { this._q.length = 0; this._head = 0; }
    else if (this._head > 512 && this._head * 2 > this._q.length) { this._q.splice(0, this._head); this._head = 0; }
  };

  return JobPump;
});
