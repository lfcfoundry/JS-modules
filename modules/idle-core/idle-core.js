/*!
 * idle-core.js: the small maths every idle / clicker game ends up needing, tested.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 *
 *  upgradeCost(base, risePct, owned, discount)   price of the next copy: base * (1 + rise/100)^owned * discount, rounded up
 *  costOfMany(base, risePct, owned, n, discount) price of the next n copies in one sum (the "buy 10" button)
 *  maxAffordable(base, risePct, owned, money, discount)  how many copies the money buys (the "buy max" button)
 *  milestoneMult(owned, [10,25,50])              owning 10 doubles each copy's output, 25 doubles again, 50 once more (x8)
 *  milestoneLeft(owned, [..])                    copies to go until the next doubling (0 when all reached)
 *  RateBook(computeFn)                           memoized rates: recomputed only after invalidate() (call it on every purchase)
 *  tickEarnings(dtSec, opts)                     seconds of income a clock tick is worth. Long gaps (a frozen phone or hidden
 *                                                tab) count at the away percent and are capped, like reopening the game.
 *  awayEarnings(ratePerSec, awaySec, opts)       income for time away: percent of normal speed, capped (default 8 h)
 *  awayClock(opts)                               wall-clock gap between hiding the page and coming back (uses Date.now())
 *  BoostQueue(caps)                              timed multipliers that never overlap: one runs, the others wait their turn
 *  stageIndex(total, thresholds)                 which stage a running total belongs to
 *  stageProgress(total, thresholds, i)           0..1 through stage i
 *  formatBig(n) / formatRate(n) / formatTime(s)  1,234 -> 1.5M -> 2.25B ... 1Sx -> 1.23e24, "2h 13m", "2d 5h"
 *  safe(n, fallback)                             n when it is a finite number, else the fallback (default 0)
 *
 * Costs, rates and away income never come back as Infinity or NaN: a value past LIMIT (1e300) is held at LIMIT.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IdleCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMIT = 1e300;                 // largest value any cost, rate or income is allowed to reach (finite, so it can be saved)
  var DAY_SEC = 86400;

  // ---- small guards -------------------------------------------------------------------------------------------------
  function safe(n, fallback) { return typeof n === 'number' && isFinite(n) ? n : (fallback === undefined ? 0 : fallback); }
  function limit(n) { return n !== n ? 0 : (n > LIMIT ? LIMIT : (n < -LIMIT ? -LIMIT : n)); }   // NaN -> 0, +-Infinity -> +-LIMIT
  function toNum(n) { if (typeof n === 'number') return n; try { return Number(n); } catch (e) { return NaN; } }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function pctOf(p) { if (typeof p !== 'number' || p !== p) return 50; return p < 0 ? 0 : (p > 100 ? 100 : p); }   // 0..100, default 50
  function capOf(c) { return Math.max(0, safe(c, 8 * 3600)); }

  // Round up, but first forgive floating-point noise: 121.00000000000001 is the price 121, not 122.
  // "Noise" is 1e-9 for ordinary prices and 1e-13 of the price for big ones (a power of 1.1 can drift that far).
  function roundUp(x) {
    if (!(x > 0)) return 0;
    if (x >= 9e15) return x;         // past 2^53 every double is already a whole number
    var r = Math.round(x);
    if (r >= 1 && Math.abs(x - r) <= Math.max(1e-9, x * 1e-13)) return r;
    return Math.ceil(x);
  }

  // ---- prices -------------------------------------------------------------------------------------------------------
  // Shared clean-up of the arguments: base >= 0, rise > -100 (percent), owned >= 0, discount >= 0 (missing or broken = 1).
  function priceArgs(base, risePct, owned, discount) {
    return {
      base: Math.max(0, safe(base, 0)),
      p: Math.max(-99, safe(risePct, 0)) / 100,
      owned: Math.max(0, safe(owned, 0)),
      disc: discount == null ? 1 : Math.max(0, safe(discount, 1))
    };
  }

  function upgradeCost(base, risePct, owned, discount) {
    var a = priceArgs(base, risePct, owned, discount);
    if (a.base === 0 || a.disc === 0) return 0;
    return roundUp(limit(a.base * a.disc * Math.pow(1 + a.p, a.owned)));
  }

  // Closed-form sum of n prices (Kongregate "Math of Idle Games"): first * (r^n - 1) / (r - 1), where r = 1 + rise/100.
  // expm1/log1p keep it accurate when the rise is tiny (r very close to 1); older engines fall back to pow.
  var expm1 = Math.expm1 || function (x) { return Math.exp(x) - 1; };
  var log1p = Math.log1p || function (x) { return Math.log(1 + x); };
  function firstPrice(a) { return a.base * a.disc * Math.pow(1 + a.p, a.owned); }
  function bundle(a, n) {                        // exact (unrounded) price of n copies, before the single round-up
    var first = firstPrice(a);
    if (a.p === 0) return first * n;
    return first * expm1(n * log1p(a.p)) / a.p;
  }

  // The whole bundle is rounded up once, so it can be up to n cheaper than buying one at a time (each single price is rounded up).
  function costOfMany(base, risePct, owned, n, discount) {
    var a = priceArgs(base, risePct, owned, discount);
    n = Math.floor(Math.max(0, safe(n, 0)));
    if (n === 0 || a.base === 0 || a.disc === 0) return 0;
    return roundUp(limit(bundle(a, n)));
  }

  // Largest n with costOfMany(...n) <= money. 0 when not even one copy is affordable, and 0 when the copies are free.
  function maxAffordable(base, risePct, owned, money, discount) {
    var a = priceArgs(base, risePct, owned, discount);
    money = Math.min(LIMIT, safe(money, 0));
    var first = firstPrice(a);
    if (!(first > 0) || !isFinite(first) || money <= 0) return 0;
    var est = a.p === 0 ? money / first : log1p(money * a.p / first) / log1p(a.p);
    var n = Math.floor(safe(est, 0)), i;
    if (n < 0) n = 0;
    function cost(k) { return roundUp(limit(bundle(a, k))); }
    for (i = 0; i < 8 && n > 0 && cost(n) > money; i++) n--;          // the estimate can be one too high ...
    for (i = 0; i < 8 && cost(n + 1) <= money; i++) n++;              // ... or one too low
    return n;
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

  // Rates: whatever compute() returns is cleaned (a number, or the numbers inside an object or array, never NaN or Infinity).
  function cleanRates(v) {
    if (typeof v === 'number') return limit(v);
    if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { if (typeof v[k] === 'number') v[k] = limit(v[k]); });
    return v;
  }
  function RateBook(compute) {
    var memo = null, dirty = true;
    return { get: function () { if (dirty) { memo = cleanRates(compute()); dirty = false; } return memo; }, invalidate: function () { dirty = true; } };
  }

  // ---- time away ----------------------------------------------------------------------------------------------------
  // opts: graceSec (default 5: a tick longer than this is treated as time away), percent (away speed, 0..100, default 50), capSec (default 8 h)
  function tickEarnings(dtSec, opts) {
    opts = opts || {};
    var grace = Math.max(0, safe(opts.graceSec, 5)), pct = pctOf(opts.percent), cap = capOf(opts.capSec);
    if (!(dtSec > 0)) return 0;
    return limit(dtSec > grace ? grace + Math.min(dtSec - grace, cap) * pct / 100 : dtSec);
  }
  function awayEarnings(ratePerSec, awaySec, opts) {
    opts = opts || {};
    var pct = pctOf(opts.percent), cap = capOf(opts.capSec);
    if (!(awaySec > 0) || !(ratePerSec > 0)) return 0;
    return limit(ratePerSec * Math.min(awaySec, cap) * pct / 100);
  }

  // Wall-clock gap for "welcome back" income. performance.now() can stop while a laptop sleeps (only Windows keeps it running),
  // so for long gaps feed the module Date.now(). Negative gaps (clock moved back) and impossible ones (more than maxSec,
  // default 30 days: a clock set far ahead) count as 0; everything else is capped (default 8 h, the same cap as awayEarnings).
  // opts: capSec, maxSec, now (a function returning milliseconds; default Date.now, only needed for tests).
  function awayClock(opts) {
    opts = opts || {};
    var cap = capOf(opts.capSec), maxSec = Math.max(0, safe(opts.maxSec, 30 * DAY_SEC));
    var nowFn = typeof opts.now === 'function' ? opts.now : Date.now;
    var stamp = 0;
    function now(at) { var t = typeof at === 'number' ? at : safe(nowFn(), 0); return safe(t, 0); }
    function gap(from, to) {
      if (!(from > 0) || !isFinite(from)) return 0;
      var d = (to - from) / 1000;
      return d > 0 && d <= maxSec ? Math.min(d, cap) : 0;
    }
    return {
      // Call when the page hides (visibilitychange / pagehide) and whenever you save. Returns the stamp to store in the save.
      hide: function (at) { try { stamp = now(at); } catch (e) { stamp = 0; } return stamp; },
      // Call when the page shows again. Returns the seconds away (0 when there is no stamp, once the gap was read).
      show: function (at) { var g = 0; try { g = gap(stamp, now(at)); } catch (e) { g = 0; } stamp = 0; return g; },
      // For a stamp read back from a save on load (phones may close a hidden page without any event).
      since: function (savedStamp, at) { try { return gap(safe(savedStamp, 0), now(at)); } catch (e) { return 0; } },
      get stamp() { return stamp; },
      set stamp(v) { stamp = Math.max(0, safe(v, 0)); }
    };
  }

  // ---- boosts -------------------------------------------------------------------------------------------------------
  // Exclusive timed boosts. caps: { id: { secs: 20, max: 60 } }.
  // State is a plain object you can save: { time: {id: secsLeft}, active: id|'', order: [ids waiting, in the order they were given] }.
  // A saved state from an older version (no "order") or a broken one ({}) is repaired, never thrown on.
  function BoostQueue(caps, saved) {
    caps = caps && typeof caps === 'object' ? caps : {};
    var s = saved && typeof saved === 'object' ? saved : {};
    if (!s.time || typeof s.time !== 'object' || Array.isArray(s.time)) s.time = {};
    if (typeof s.active !== 'string') s.active = '';
    function capOfId(id) {
      var c = has(caps, id) && caps[id] && typeof caps[id] === 'object' ? caps[id] : {};
      return { secs: Math.max(0, safe(c.secs, 20)), max: Math.max(0, safe(c.max, 60)) };
    }
    Object.keys(s.time).forEach(function (k) {          // clean what came from storage: finite, 0..max
      var v = s.time[k];
      s.time[k] = typeof v === 'number' && v > 0 ? Math.min(capOfId(k).max, safe(v, 0)) : 0;
    });
    var ord = [];
    if (Array.isArray(s.order)) s.order.forEach(function (id) { if (typeof id === 'string' && s.time[id] > 0 && ord.indexOf(id) < 0) ord.push(id); });
    Object.keys(s.time).forEach(function (k) { if (s.time[k] > 0 && ord.indexOf(k) < 0) ord.push(k); });   // old saves: key order is all we have
    s.order = ord;

    function current() { return s.active && s.time[s.active] > 0 ? s.active : ''; }
    function drop(id) { var i = s.order.indexOf(id); if (i >= 0) s.order.splice(i, 1); }
    function nextAfter(except) {
      for (var i = 0; i < s.order.length; i++) if (s.order[i] !== except && s.time[s.order[i]] > 0) return s.order[i];
      return '';
    }
    return {
      state: s,
      get active() { return current(); },
      // Adds time to a boost. Returns 'start' (it runs now), 'more' (adds to the running one), 'next' (waits its turn)
      // or '' (nothing was added because the boost's secs is 0).
      give: function (id) {
        id = String(id);
        var c = capOfId(id), t = Math.min(c.max, (s.time[id] > 0 ? s.time[id] : 0) + c.secs);
        s.time[id] = t;
        if (!(t > 0)) return '';
        if (s.order.indexOf(id) < 0) s.order.push(id);
        var a = current();
        if (!a) { s.active = id; return 'start'; }
        return a === id ? 'more' : 'next';
      },
      // Counts the running boost down. Returns { ended: id|null, started: id|null } for UI messages.
      // A zero, negative or NaN step changes nothing (it can never grow a boost or erase one).
      tick: function (dt) {
        var res = { ended: null, started: null }, a = current();
        dt = dt > 0 ? dt : 0;
        if (!a) {
          var waiting = nextAfter('');
          if (waiting) { s.active = waiting; res.started = waiting; a = waiting; } else { s.active = ''; return res; }
        }
        s.time[a] = Math.max(0, s.time[a] - dt);
        if (s.time[a] === 0) {
          res.ended = a; drop(a);
          var next = nextAfter(a);
          s.active = next; if (next) res.started = next;
        }
        return res;
      }
    };
  }

  // ---- stages -------------------------------------------------------------------------------------------------------
  function stageIndex(total, thresholds) {
    var s = 0; (thresholds || []).forEach(function (at, i) { if (total >= at) s = i; }); return s;
  }
  function stageProgress(total, thresholds, i) {
    thresholds = thresholds || [];
    var a = thresholds[i], b = thresholds[i + 1];
    if (b == null) return 1;
    if (!(b > a)) return total >= b ? 1 : 0;                        // equal (or backwards) thresholds: a step, never NaN
    var p = (total - a) / (b - a);
    return p !== p ? 0 : Math.max(0, Math.min(1, p));
  }

  // ---- formatting ---------------------------------------------------------------------------------------------------
  var TIERS = [[1e21, 'Sx'], [1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  function short(n) {                                              // n is finite and >= 1e6
    if (n >= 1e24) return n.toExponential(2).replace('e+', 'e');
    for (var i = 0; i < TIERS.length; i++) {
      if (n >= TIERS[i][0]) {
        var v = Math.round(n / TIERS[i][0] * 100) / 100;
        if (v >= 1000) {                                           // 999.999M must read 1B, not 1000M
          if (i > 0) return (Math.round(n / TIERS[i - 1][0] * 100) / 100) + TIERS[i - 1][1];
          return n.toExponential(2).replace('e+', 'e');            // top tier: 999.999Sx reads 1.00e24, not 1000Sx
        }
        return v + TIERS[i][1];
      }
    }
    return String(n);
  }
  var nf0 = null, nf1 = null;
  try { nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }); nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }); } catch (e) { nf0 = nf1 = null; }
  function commas(n, digits) {                                     // n >= 0 and < 1e21
    if (nf0) return (digits ? nf1 : nf0).format(n);
    var f = Math.round(n * (digits ? 10 : 1)) / (digits ? 10 : 1), p = String(f).split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] ? '.' + p[1] : '');
  }
  function formatBig(n) {
    n = toNum(n);
    if (n !== n) return '0';
    if (n === Infinity || n === -Infinity) return String(n);
    var a = Math.floor(Math.abs(n)), out = a >= 1e6 ? short(a) : commas(a, 0);
    return n < 0 && a > 0 ? '-' + out : out;
  }
  function formatRate(n) {
    n = toNum(n);
    if (n !== n) return '0';
    if (n === Infinity || n === -Infinity) return String(n);
    var a = Math.abs(n), out = a >= 1e6 ? short(a) : commas(a, 1);
    return n < 0 && Math.round(a * 10) > 0 ? '-' + out : out;
  }
  function formatTime(sec) {
    sec = toNum(sec);
    if (sec === Infinity) return 'Infinity';
    if (!(sec > 0)) return '0 sec';                                // NaN and negative values
    sec = Math.floor(sec);
    var d = Math.floor(sec / DAY_SEC), h = Math.floor((sec % DAY_SEC) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    h = Math.floor(sec / 3600);
    return h > 0 ? h + 'h ' + m + 'm' : (m > 0 ? m + ' min' : sec + ' sec');
  }

  return { upgradeCost: upgradeCost, costOfMany: costOfMany, maxAffordable: maxAffordable, milestoneMult: milestoneMult, milestoneLeft: milestoneLeft,
    RateBook: RateBook, tickEarnings: tickEarnings, awayEarnings: awayEarnings, awayClock: awayClock, BoostQueue: BoostQueue,
    stageIndex: stageIndex, stageProgress: stageProgress, formatBig: formatBig, formatRate: formatRate, formatTime: formatTime,
    safe: safe, LIMIT: LIMIT };
});
