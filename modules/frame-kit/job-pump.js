/* job-pump: runs queued build steps for about N milliseconds per frame so a big pre-render never hitches a frame. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/JNFoo/JS-modules */
'use strict';

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
var JobPump = (function () {
  function isIterator(r) {
    return !!r && typeof r === 'object' && typeof r.next === 'function' && typeof r[Symbol.iterator] === 'function';
  }

  /**
   * @param {object} [opts]
   * @param {function} [opts.now]     Clock returning milliseconds. Default: performance.now (or Date.now).
   * @param {function} [opts.onError] Called as onError(error) when a job throws. The failed job is dropped and the queue continues. Without it the error is rethrown from run() (the failed job is still dropped).
   */
  function JobPump(opts) {
    var o = opts || {};
    this._now = typeof o.now === 'function' ? o.now
      : (typeof performance !== 'undefined' && performance.now ? function () { return performance.now(); } : Date.now);
    this._onError = typeof o.onError === 'function' ? o.onError : null;
    this._q = [];
    this._head = 0;
    this._running = false;
  }

  /** Number of jobs waiting (a half-finished generator counts as one). */
  Object.defineProperty(JobPump.prototype, 'size', { get: function () { return this._q.length - this._head; }, configurable: true });

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
    var t0 = this._now();
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
          this._drop();
          if (!this._onError) throw err;
          this._onError(err);
          counted = true;
          finished = false;
          if (++steps >= min && this._now() - t0 >= budget) break;
          continue;
        }
        if (finished) this._drop();
        if (counted && ++steps >= min && this._now() - t0 >= budget) break;
      }
    } finally {
      this._running = false;
    }
    return this.size > 0;
  };

  /** Drop every waiting job. Half-finished generators are closed, so their `finally` blocks run. */
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

  JobPump.prototype._drop = function () {
    this._q[this._head++] = null;
    if (this._head === this._q.length) { this._q.length = 0; this._head = 0; }
    else if (this._head > 512 && this._head * 2 > this._q.length) { this._q.splice(0, this._head); this._head = 0; }
  };

  return JobPump;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = JobPump; else (typeof globalThis !== 'undefined' ? globalThis : this).JobPump = JobPump;
