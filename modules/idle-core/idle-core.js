/*!
 * idle-core.js: the small maths every idle / clicker game ends up needing, tested.
 * Part of JS-modules, https://github.com/JNFoo/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *  upgradeCost(base, risePct, owned, discount)   price of the next copy: base * (1 + rise/100)^owned * discount, rounded up
 *  milestoneMult(owned, [10,25,50])              owning 10 doubles each copy's output, 25 doubles again, 50 once more (x8)
 *  milestoneLeft(owned, [..])                    copies to go until the next doubling (0 when all reached)
 *  RateBook(computeFn)                           memoized rates: recomputed only after invalidate() (call it on every purchase)
 *  tickEarnings(dtSec, opts)                     seconds of income a clock tick is worth. Long gaps (a frozen phone or hidden
 *                                                tab) count at the away percent and are capped, like reopening the game.
 *  awayEarnings(ratePerSec, awaySec, opts)       income for time away: percent of normal speed, capped (default 8 h)
 *  BoostQueue(caps)                              timed multipliers that never overlap: one runs, the others wait their turn
 *  stageIndex(total, thresholds)                 which stage a running total belongs to
 *  stageProgress(total, thresholds, i)           0..1 through stage i
 *  formatBig(n) / formatRate(n) / formatTime(s)  1,234 -> 1.5M -> 2.25B ... 1Sx -> 1.23e24, "2h 13m"
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IdleCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function upgradeCost(base, risePct, owned, discount) {
    return Math.ceil(base * Math.pow(1 + risePct / 100, owned) * (discount == null ? 1 : discount));
  }

  var DEFAULT_MILESTONES = [10, 25, 50];
  function milestoneMult(owned, milestones) {
    var m = 1; (milestones || DEFAULT_MILESTONES).forEach(function (n) { if (owned >= n) m *= 2; }); return m;
  }
  function milestoneLeft(owned, milestones) {
    var ms = milestones || DEFAULT_MILESTONES;
    for (var i = 0; i < ms.length; i++) if (owned < ms[i]) return ms[i] - owned;
    return 0;
  }

  function RateBook(compute) {
    var memo = null, dirty = true;
    return { get: function () { if (dirty) { memo = compute(); dirty = false; } return memo; }, invalidate: function () { dirty = true; } };
  }

  // opts: graceSec (default 5: a tick longer than this is treated as time away), percent (away speed, 0..100, default 50), capSec (default 8 h)
  function tickEarnings(dtSec, opts) {
    opts = opts || {};
    var grace = opts.graceSec == null ? 5 : opts.graceSec, pct = opts.percent == null ? 50 : opts.percent, cap = opts.capSec == null ? 8 * 3600 : opts.capSec;
    if (!(dtSec > 0)) return 0;
    return dtSec > grace ? grace + Math.min(dtSec - grace, cap) * pct / 100 : dtSec;
  }
  function awayEarnings(ratePerSec, awaySec, opts) {
    opts = opts || {};
    var pct = opts.percent == null ? 50 : opts.percent, cap = opts.capSec == null ? 8 * 3600 : opts.capSec;
    if (!(awaySec > 0) || !(ratePerSec > 0)) return 0;
    return ratePerSec * Math.min(awaySec, cap) * pct / 100;
  }

  // Exclusive timed boosts. caps: { id: { secs: 20, max: 60 } }. State is a plain object you can save: { time: {id: secsLeft}, active: id|'' }.
  function BoostQueue(caps, saved) {
    var s = saved || { time: {}, active: '' };
    function current() { return s.active && s.time[s.active] > 0 ? s.active : ''; }
    return {
      state: s,
      get active() { return current(); },
      // Adds time to a boost. Returns 'start' (it runs now), 'more' (adds to the running one) or 'next' (waits its turn).
      give: function (id) {
        var c = caps[id] || { secs: 20, max: 60 };
        s.time[id] = Math.min(c.max, (s.time[id] || 0) + c.secs);
        var a = current();
        if (!a) { s.active = id; return 'start'; }
        return a === id ? 'more' : 'next';
      },
      // Counts the running boost down. Returns { ended: id|null, started: id|null } for UI messages.
      tick: function (dt) {
        var res = { ended: null, started: null }, a = current();
        if (!a) {
          var waiting = Object.keys(s.time).filter(function (k) { return s.time[k] > 0; })[0];
          if (waiting) { s.active = waiting; res.started = waiting; a = waiting; } else { s.active = ''; return res; }
        }
        s.time[a] = Math.max(0, s.time[a] - dt);
        if (s.time[a] === 0) {
          res.ended = a;
          var next = Object.keys(s.time).filter(function (k) { return k !== a && s.time[k] > 0; })[0];
          s.active = next || ''; if (next) res.started = next;
        }
        return res;
      }
    };
  }

  function stageIndex(total, thresholds) {
    var s = 0; thresholds.forEach(function (at, i) { if (total >= at) s = i; }); return s;
  }
  function stageProgress(total, thresholds, i) {
    var a = thresholds[i], b = thresholds[i + 1];
    if (b == null) return 1;
    return Math.max(0, Math.min(1, (total - a) / (b - a)));
  }

  var TIERS = [[1e21, 'Sx'], [1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  function short(n) {
    if (n >= 1e24) return n.toExponential(2).replace('e+', 'e');
    for (var i = 0; i < TIERS.length; i++) {
      if (n >= TIERS[i][0]) {
        var v = Math.round(n / TIERS[i][0] * 100) / 100;
        if (v >= 1000 && i > 0) return (Math.round(n / TIERS[i - 1][0] * 100) / 100) + TIERS[i - 1][1];   // 999.999M must read 1B, not 1000M
        return v + TIERS[i][1];
      }
    }
    return String(n);
  }
  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  function formatBig(n) { if (!isFinite(n)) return String(n); n = Math.floor(n); return n >= 1e6 ? short(n) : nf0.format(n); }
  function formatRate(n) { if (!isFinite(n)) return String(n); return n >= 1e6 ? short(n) : nf1.format(n); }
  function formatTime(sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? h + 'h ' + m + 'm' : (m > 0 ? m + ' min' : sec + ' sec');
  }

  return { upgradeCost: upgradeCost, milestoneMult: milestoneMult, milestoneLeft: milestoneLeft, RateBook: RateBook, tickEarnings: tickEarnings,
    awayEarnings: awayEarnings, BoostQueue: BoostQueue, stageIndex: stageIndex, stageProgress: stageProgress, formatBig: formatBig, formatRate: formatRate, formatTime: formatTime };
});
