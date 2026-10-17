/*!
 * walker-sim.js: simulate random walkers on a network, with exact odds to check against. No dependencies.
 * Seeded and repeatable (trial t of seed s always draws the same numbers, however the run is cut into batches or shared between threads), with 16
 * kinds of random number for how many walkers arrive, how uncertain each link is and what each link costs; 95% ranges; exact odds, steps and cost to
 * check against; what-if sweeps. Names and help texts for the random-number kinds are in the optional walker-sim-menu.js.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.1.0 (API 2)
 *
 *   var P = WalkerSim.graph({ links: [{ from: "start", to: "a", weight: 3 }, { from: "start", to: "b", weight: 1 }] });
 *   var sim = WalkerSim.create(P, { seed: 7, trials: 10000 }); sim.run(1e9, 1e9);   // run(max trials, max milliseconds)
 *   var r = sim.snapshot();                                                          // r.endpoints: each end with its share and 95% range
 *   var exact = WalkerSim.exactEndpoints(P, { });                                    // the exact odds, when the set-up allows it
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WalkerSim = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var kernelMaker = null;     // set by walker-sim-wasm.js through useKernel

  /* ---------------------------------------------------------------- random numbers */
  function mix32(a, b) {
    var h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return h | 0;
  }
  /* Normal numbers by the ziggurat method (Marsaglia and Tsang 2000, "The Ziggurat Method for Generating Random Variables", 128 layers):
     about 98.8% of draws are one integer, one multiply and one compare; the rest fall back to a short exact test (edges of layers) or the exact tail method (Marsaglia 1964). */
  var ZK = new Float64Array(128), ZW = new Float64Array(128), ZF = new Float64Array(128), ZR = 3.442619855899;
  (function () {
    var m1 = 2147483648, dn = ZR, tn = dn, vn = 9.91256303526217e-3, q = vn / Math.exp(-0.5 * dn * dn), i;
    ZK[0] = (dn / q) * m1; ZK[1] = 0; ZW[0] = q / m1; ZW[127] = dn / m1; ZF[0] = 1; ZF[127] = Math.exp(-0.5 * dn * dn);
    for (i = 126; i >= 1; i--) { dn = Math.sqrt(-2 * Math.log(vn / dn + Math.exp(-0.5 * dn * dn))); ZK[i + 1] = (dn / tn) * m1; tn = dn; ZF[i] = Math.exp(-0.5 * dn * dn); ZW[i] = dn / m1; }
  })();
  var EK = new Float64Array(256), EW = new Float64Array(256), EF = new Float64Array(256), ER = 7.69711747013104972;   // exponential ziggurat (Marsaglia and Tsang 2000), 256 layers
  (function () {
    var m2 = 4294967296, de = ER, te = de, ve = 3.949659822581572e-3, q = ve / Math.exp(-de), i;
    EK[0] = (de / q) * m2; EK[1] = 0; EW[0] = q / m2; EW[255] = de / m2; EF[0] = 1; EF[255] = Math.exp(-de);
    for (i = 254; i >= 1; i--) { de = -Math.log(ve / de + Math.exp(-de)); EK[i + 1] = (de / te) * m2; te = de; EF[i] = Math.exp(-de); EW[i] = de / m2; }
  })();
  function makeRng(seed) {
    var s = seed | 0;
    var next = function () {   // a 32-bit integer (mulberry32)
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return t ^ (t >>> 14);
    };
    var u = function () { return (next() >>> 0) / 4294967296; };
    u.reseed = function (x) { s = x | 0; };
    u.state = function () { return s; };
    var slow = function (hz, iz) {
      for (;;) {
        var x = hz * ZW[iz];
        if (iz === 0) {   // the tail beyond 3.44
          var y;
          do { x = -Math.log(u() || 1e-300) * 0.2904764; y = -Math.log(u() || 1e-300); } while (y + y < x * x);
          return hz > 0 ? ZR + x : -ZR - x;
        }
        if (ZF[iz] + u() * (ZF[iz - 1] - ZF[iz]) < Math.exp(-0.5 * x * x)) return x;
        hz = next(); iz = hz & 127;
        if (Math.abs(hz) < ZK[iz]) return hz * ZW[iz];
      }
    };
    var slowExp = function (jz, iz) {
      for (;;) {
        if (iz === 0) return ER - Math.log(u() || 1e-300);
        var x = jz * EW[iz];
        if (EF[iz] + u() * (EF[iz - 1] - EF[iz]) < Math.exp(-x)) return x;
        jz = next() >>> 0; iz = jz & 255;
        if (jz < EK[iz]) return jz * EW[iz];
      }
    };
    u.exponential = function () { var jz = next() >>> 0, iz = jz & 255; return jz < EK[iz] ? jz * EW[iz] : slowExp(jz, iz); };
    u.normal = function () {
      var hz = next(), iz = hz & 127;
      return Math.abs(hz) < ZK[iz] ? hz * ZW[iz] : slow(hz, iz);
    };
    return u;
  }
  function rngFor(seed, trial) { return makeRng(mix32(seed | 0, trial | 0)); }

  /* ---------------------------------------------------------------- distributions */
  var LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    var a = LG[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gammaShape(r, k) { /* Marsaglia and Tsang; mean k, scale 1 */
    if (!(k > 0)) return 0;
    if (k < 1) { var u0 = r() || 1e-300; return gammaShape(r, k + 1) * Math.pow(u0, 1 / k); }
    var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      var x, v;
      do { x = r.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      var u = r() || 1e-300;
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  var POIS = new Map();
  function poisson(r, lam) {
    if (!(lam > 0)) return 0;
    if (lam < 30) {   // one uniform number and a walk along the cumulative odds (kept per average), not about lam + 1 uniform numbers
      var cdf = POIS.get(lam);
      if (!cdf) {
        if (POIS.size > 64) POIS.clear();
        cdf = []; var pk = Math.exp(-lam), acc = pk, kq = 0;
        cdf.push(acc);
        while (acc < 1 - 1e-15 && kq < 200) { kq++; pk *= lam / kq; acc += pk; cdf.push(acc); }
        POIS.set(lam, cdf);
      }
      var uu = r(), kz = 0, nz = cdf.length;
      while (kz < nz && uu > cdf[kz]) kz++;
      return kz;
    }
    var smu = Math.sqrt(lam), b = 0.931 + 2.53 * smu, a = -0.059 + 0.02483 * b, invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2);
    for (;;) {
      var U = r() - 0.5, V = r(), us = 0.5 - Math.abs(U), kk = Math.floor((2 * a / us + b) * U + lam + 0.43);
      if (us >= 0.07 && V <= vr) return kk;
      if (kk < 0 || (us < 0.013 && V > us)) continue;
      if (Math.log(V) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lam + kk * Math.log(lam) - lgamma(kk + 1)) return kk;
    }
  }
  function binomial(r, n, p) {
    n = Math.floor(n);
    if (!(n > 0) || !(p > 0)) return 0;
    if (p >= 1) return n;
    if (p > 0.5) return n - binomial(r, n, 1 - p);
    if (n * p < 10) {
      var q = 1 - p, s = p / q, a = (n + 1) * s, rr = Math.pow(q, n), u = r(), x = 0;
      while (u > rr && x < n) { u -= rr; x++; rr *= a / x - s; }
      return x;
    }
    var spq = Math.sqrt(n * p * (1 - p)), b = 1.15 + 2.53 * spq, a2 = -0.0873 + 0.0248 * b + 0.01 * p, c = n * p + 0.5, vr = 0.92 - 4.2 / b;
    var alpha = (2.83 + 5.1 / b) * spq, lpq = Math.log(p / (1 - p)), m = Math.floor((n + 1) * p), h = lgamma(m + 1) + lgamma(n - m + 1);
    for (;;) {
      var U = r() - 0.5, V = r(), us = 0.5 - Math.abs(U), k = Math.floor((2 * a2 / us + b) * U + c);
      if (k < 0 || k > n) continue;
      if (us >= 0.07 && V <= vr) return k;
      V = Math.log(V * alpha / (a2 / (us * us) + b));
      if (V <= h - lgamma(k + 1) - lgamma(n - k + 1) + (k - m) * lpq) return k;
    }
  }
  var DRAW = {
    fixed: function (r, a) { return a; },
    normal: function (r, a, b) { return a + (b > 0 ? b : 0) * r.normal(); },
    lognormal: function (r, a, b) {
      if (!(a > 0)) return 0;
      var s2 = Math.log(1 + (b / a) * (b / a)), mu = Math.log(a) - s2 / 2;
      return Math.exp(mu + Math.sqrt(s2) * r.normal());
    },
    poisson: function (r, a) { return poisson(r, a); },
    binomial: function (r, a, b) { return binomial(r, a, b); },
    negbinomial: function (r, a, b) {
      var v = b * b;
      if (!(a > 0)) return 0;
      if (!(v > a)) return poisson(r, a);
      var rr = a * a / (v - a);
      return poisson(r, gammaShape(r, rr) * (a / rr));
    },
    geometric: function (r, a) {
      if (!(a > 1)) return 1;
      var p = 1 / a;
      return Math.max(1, Math.ceil(Math.log(r() || 1e-300) / Math.log(1 - p)));
    },
    exponential: function (r, a) { return a > 0 ? a * r.exponential() : 0; },
    gamma: function (r, a, b) {
      if (!(a > 0)) return 0;
      if (!(b > 0)) return a;
      var k = (a / b) * (a / b), th = b * b / a;
      return gammaShape(r, k) * th;
    },
    weibull: function (r, a, b) { return a > 0 && b > 0 ? a * Math.pow(-Math.log(r() || 1e-300), 1 / b) : 0; },
    beta: function (r, a, b) {
      if (!(a > 0 && a < 1)) return a <= 0 ? 0 : 1;
      var nu = a * (1 - a) / (b * b) - 1;
      if (!(nu > 0)) return a;
      var x = gammaShape(r, a * nu), y = gammaShape(r, (1 - a) * nu);
      return x + y > 0 ? x / (x + y) : a;
    },
    uniform: function (r, a, b) { return a + (b - a) * r(); },
    triangular: function (r, a, b, c) {
      if (!(c > a)) return a;
      var u = r(), f = (b - a) / (c - a);
      return u < f ? a + Math.sqrt(u * (c - a) * (b - a)) : c - Math.sqrt((1 - u) * (c - a) * (c - b));
    },
    pareto: function (r, a, b) { return a > 0 && b > 0 ? a / Math.pow(r() || 1e-300, 1 / b) : 0; },
    dunif: function (r, a, b) { a = Math.ceil(a); b = Math.floor(b); return b < a ? a : a + Math.floor(r() * (b - a + 1)); }
  };
  /** The mean and variance a distribution should have (used by the tests and by the settings page to show what you chose). */
  function moments(dist, a, b, c) {
    switch (dist) {
      case 'fixed': return { mean: a, variance: 0 };
      case 'normal': case 'lognormal': case 'gamma': case 'beta': return { mean: a, variance: b * b };
      case 'poisson': return { mean: a, variance: a };
      case 'binomial': return { mean: a * b, variance: a * b * (1 - b) };
      case 'negbinomial': return { mean: a, variance: Math.max(a, b * b) };
      case 'geometric': return { mean: Math.max(1, a), variance: a > 1 ? (1 - 1 / a) * a * a : 0 };
      case 'exponential': return { mean: a, variance: a * a };
      case 'weibull': return { mean: a * Math.exp(lgamma(1 + 1 / b)), variance: a * a * (Math.exp(lgamma(1 + 2 / b)) - Math.exp(2 * lgamma(1 + 1 / b))) };
      case 'uniform': return { mean: (a + b) / 2, variance: (b - a) * (b - a) / 12 };
      case 'triangular': return { mean: (a + b + c) / 3, variance: (a * a + b * b + c * c - a * b - a * c - b * c) / 18 };
      case 'pareto': return { mean: b > 1 ? a * b / (b - 1) : Infinity, variance: b > 2 ? a * a * b / ((b - 1) * (b - 1) * (b - 2)) : Infinity };
      case 'dunif': { var lo = Math.ceil(a), hi = Math.floor(b), k = hi - lo + 1; return { mean: (lo + hi) / 2, variance: (k * k - 1) / 12 }; }
      default: return { mean: NaN, variance: NaN };
    }
  }
  /* Draws with the numbers that depend only on a, b and c worked out once (the logs and roots below used to be worked out again at every draw).
     Same numbers out for the same random numbers in. Only the kinds that spent most of their time on that are here; the others use DRAW as before. */
  var PREP = {
    lognormal: function (a, b) {
      if (!(a > 0)) return function () { return 0; };
      var s2 = Math.log(1 + (b / a) * (b / a)), mu = Math.log(a) - s2 / 2, sd = Math.sqrt(s2);
      return function (r) { return Math.exp(mu + sd * r.normal()); };
    },
    gamma: function (a, b) {
      if (!(a > 0)) return function () { return 0; };
      if (!(b > 0)) return function () { return a; };
      var k = (a / b) * (a / b), th = b * b / a;
      if (k < 1) return function (r) { return gammaShape(r, k) * th; };
      var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      return function (r) {
        for (;;) {
          var x, v;
          do { x = r.normal(); v = 1 + c * x; } while (v <= 0);
          v = v * v * v;
          var u = r() || 1e-300;
          if (u < 1 - 0.0331 * x * x * x * x) return d * v * th;
          if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * th;
        }
      };
    },
    weibull: function (a, b) {
      if (!(a > 0 && b > 0)) return function () { return 0; };
      var ib = 1 / b;
      return function (r) { return a * Math.pow(-Math.log(r() || 1e-300), ib); };
    },
    pareto: function (a, b) {
      if (!(a > 0 && b > 0)) return function () { return 0; };
      var ib = 1 / b;
      return function (r) { return a / Math.pow(r() || 1e-300, ib); };
    },
    geometric: function (a) {
      if (!(a > 1)) return function () { return 1; };
      var lq = Math.log(1 - 1 / a);
      return function (r) { return Math.max(1, Math.ceil(Math.log(r() || 1e-300) / lq)); };
    }
  };
  /** spec: { dist, a, b, c, values } with numbers, or arrays per element for a, b, c. Returns draw(rng, i). */
  function drawer(spec) {
    if (!spec || !spec.dist) return null;
    var f = DRAW[spec.dist], A = spec.a, B = spec.b, C = spec.c, V = spec.values, pf = PREP[spec.dist];
    if (spec.dist === 'empirical') {
      if (!V || !V.length) return null;
      return function (r) { return V[Math.floor(r() * V.length)]; };
    }
    if (!f) return null;
    var arr = function (x, i) { return x !== null && x !== undefined && typeof x === 'object' ? x[i] : x; };
    if (pf) {
      var obj = function (x) { return x !== null && x !== undefined && typeof x === 'object'; };
      if (!obj(A) && !obj(B) && !obj(C)) { var one = pf(A, B, C); return function (r) { return one(r); }; }
      var cache = [];
      return function (r, i) { var g = cache[i]; if (!g) g = cache[i] = pf(arr(A, i), arr(B, i), arr(C, i)); return g(r); };
    }
    return function (r, i) { return f(r, arr(A, i), arr(B, i), arr(C, i)); };
  }

  /* ---------------------------------------------------------------- the simulation */
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function wilson(k, n) {
    if (!n) return [0, 0];
    var p = k / n, z = 1.96, z2 = z * z, den = 1 + z2 / n, mid = (p + z2 / (2 * n)) / den, half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }
  function histogram(vals, bins, intBins) {
    if (!vals.length) return { lo: 0, hi: 0, bins: [] };
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < vals.length; i++) { if (vals[i] < lo) lo = vals[i]; if (vals[i] > hi) hi = vals[i]; }
    if (intBins) { lo = Math.floor(lo); hi = Math.floor(hi); bins = Math.min(bins, hi - lo + 1); }
    if (hi === lo) return { lo: lo, hi: hi, bins: [vals.length] };
    var b = new Array(bins).fill(0), w = (hi - lo) / bins;
    for (i = 0; i < vals.length; i++) { var k = Math.min(bins - 1, Math.floor((vals[i] - lo) / w)); b[k]++; }
    return { lo: lo, hi: hi, bins: b };
  }
  /* Whole numbers are kept as a table of how many times each value came up (exact, and nothing to sort), values past the table in a short list. */
  var TAB_MAX = 65536;
  function tabAdd(t, x) {
    if (x >= TAB_MAX) { (t.over || (t.over = [])).push(x); return; }
    if (x >= t.a.length) { var b = new Float64Array(Math.min(TAB_MAX, Math.max(x + 1, t.a.length * 2))); b.set(t.a); t.a = b; }
    t.a[x]++;
  }
  function tabCount(t) { var s = t.over ? t.over.length : 0; for (var i = 0; i < t.a.length; i++) s += t.a[i]; return s; }
  function tabNth(t, idx) {   // the idx-th smallest value (0-based)
    var acc = 0, i, a = t.a;
    for (i = 0; i < a.length; i++) { acc += a[i]; if (acc > idx) return i; }
    return t.over[idx - acc];
  }
  function tabQuantile(t, total, q) {
    if (!total) return NaN;
    var pos = (total - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos), x = tabNth(t, lo);
    return hi === lo ? x : x + (tabNth(t, hi) - x) * (pos - lo);
  }
  function tabMerge(t, u) {
    var i;
    if (u.a.length > t.a.length) { var b = new Float64Array(u.a.length); b.set(t.a); t.a = b; }
    for (i = 0; i < u.a.length; i++) t.a[i] += u.a[i];
    if (u.over) for (i = 0; i < u.over.length; i++) (t.over || (t.over = [])).push(u.over[i]);
  }
  function tabCopy(t) { return { a: t.a.slice(), over: t.over ? t.over.slice() : null }; }
  function tabSort(t) { if (t.over) t.over.sort(function (a, b) { return a - b; }); }
  /**
   * cfg: { seed, trials, firstTrial, stepCap, sources: [{v, w}], targets: [v] | null, arrivals: spec, rule: 'weights'|'uniform'|'first'|'curious'|'softmax',
   *        temp, weights: Float64Array(m) base weights, linkWeight: spec | null, linkCost: spec | null, dwell: spec | null, maxWalkers,
   *        precision, minWalkers }
   * trials is the last trial number plus one (the plan); firstTrial (default 0) lets one run be shared between several sims, see export() and merge().
   * precision: stop early once the widest 95% range (half its width, as a share of walkers, 0.005 = 0.5 points) is under it, after minWalkers (default 2000).
   */
  function create(P, cfg) {
    cfg = cfg || {};
    var n = P.n, m = P.m, seed = cfg.seed === undefined ? 1 : cfg.seed | 0, T = Math.max(1, cfg.trials | 0), cap = Math.min(2e6, cfg.stepCap || 400);
    var first = Math.max(0, Math.min(T, cfg.firstTrial | 0));
    var rule = cfg.rule || 'weights', temp = cfg.temp > 0 ? cfg.temp : 1;
    var maxWalkers = cfg.maxWalkers || 5e6, precision = cfg.precision > 0 ? +cfg.precision : 0, minWalkers = cfg.minWalkers > 0 ? +cfg.minWalkers : 2000;
    var base = cfg.weights || P.w;
    var srcs = (cfg.sources && cfg.sources.length ? cfg.sources : P.start >= 0 ? [{ v: P.start, w: 1 }] : []).filter(function (s) { return s.v >= 0 && s.v < n && s.w > 0; });
    var srcCum = [], tot = 0;
    srcs.forEach(function (s) { tot += s.w; srcCum.push(tot); });
    var isEnd = new Uint8Array(n), epOf = new Int32Array(n).fill(-1), ends = [], i;
    if (cfg.targets && cfg.targets.length) cfg.targets.forEach(function (v) { if (v >= 0 && v < n) isEnd[v] = 1; });
    for (i = 0; i < n; i++) if (P.outStart[i + 1] === P.outStart[i]) isEnd[i] = 1;
    for (i = 0; i < n; i++) if (isEnd[i]) { epOf[i] = ends.length; ends.push(i); }
    var K = ends.length;
    var dArr = drawer(cfg.arrivals || { dist: 'fixed', a: 1 }), dW = drawer(cfg.linkWeight), dCost = drawer(cfg.linkCost), dDwell = drawer(cfg.dwell);
    var W = new Float64Array(m), cum = new Float64Array(m), nodeTot = new Float64Array(n);
    var weightsFixed = !dW;
    var os = P.outStart, oe = P.outEdge;
    // The walkers step through "slots": the ways out of item v sit at os[v]..os[v+1]-1. cumN is the cumulative odds of each slot out of 1, tg the item it leads to.
    var cumN = new Float64Array(m), tg = new Int32Array(m), halt = new Uint8Array(n), movesCsr = new Float64Array(m), startCount = new Float64Array(n);
    for (i = 0; i < m; i++) tg[i] = P.to[oe[i]];
    var buildCum = function (rng) {
      for (var e = 0; e < m; e++) {
        var w = rule === 'uniform' || rule === 'first' ? 1 : (dW ? dW(rng, e) : base[e]);
        if (!(w > 0) || !isFinite(w)) w = 0;
        W[e] = w;
      }
      for (var v = 0; v < n; v++) {
        var a = os[v], b = os[v + 1], s = 0, mx = 0, k;
        if (rule === 'softmax') { for (k = a; k < b; k++) if (W[oe[k]] > mx) mx = W[oe[k]]; }
        for (k = a; k < b; k++) {
          var ww = W[oe[k]];
          if (rule === 'softmax') ww = Math.exp((ww - mx) / temp);
          s += ww; cum[k] = s;
        }
        nodeTot[v] = s;
        halt[v] = isEnd[v] || !(s > 0) ? 1 : 0;      // an item whose ways on all weigh 0 has no way on: walkers stop there and count as stuck
        for (k = a; k < b; k++) cumN[k] = s > 0 ? cum[k] / s : 1;
        if (b > a) cumN[b - 1] = Infinity;            // the last slot always catches what rounding leaves
      }
    };
    if (weightsFixed) buildCum(makeRng(1));
    // A lookup table per item: the first 8 bits of the random number pick the way on directly, and only the few slices that cross a boundary between two
    // ways on fall back to the scan (255). Same way on as the scan gives, so the counts do not change.
    var LUT = null, LB = 8, LN = 1 << LB;
    if (weightsFixed && (rule === 'weights' || rule === 'uniform' || rule === 'softmax')) {
      LUT = new Uint8Array(n * LN);
      for (var lv = 0; lv < n; lv++) {
        var la = os[lv], lb = os[lv + 1];
        if (halt[lv] || lb === la) continue;
        if (lb - la > 254) { LUT.fill(255, lv * LN, lv * LN + LN); continue; }
        var ls = la;
        for (var lj = 0; lj < LN; lj++) {
          var llo = lj / LN, lhi = (lj + 1) / LN;
          while (cumN[ls] <= llo) ls++;
          LUT[lv * LN + lj] = cumN[ls] >= lhi ? ls - la : 255;
        }
      }
    }
    var viaTable = rule !== 'first' && rule !== 'curious';       // those two pick their way on one item at a time (pickEdge); the rest scan cumN
    var st = {
      P: P, cfg: cfg, T: T, trial: first, first: first, nTrials: 0, K: K, ends: ends, epOf: epOf, walkers: 0, stuck: 0, stoppedEarly: false,
      visits: new Float64Array(n), moves: new Float64Array(m), epCount: new Float64Array(K), epSum: new Float64Array(K), epSumSq: new Float64Array(K), epShareSum: new Float64Array(K), epShareSq: new Float64Array(K), shareTrials: 0,
      epPerTrial: [], epCosts: [], costs: [], costSeen: 0, stepTab: { a: new Float64Array(cap + 1), over: null }, trace: [], nextTrace: 10, lastRng: null, startedAt: 0, busyMs: 0
    };
    for (i = 0; i < K; i++) { st.epPerTrial.push({ a: new Float64Array(16), over: null }); st.epCosts.push([]); }
    var seen = new Int32Array(n).fill(-1), stamp = 0, trialCounts = new Float64Array(K), COST_CAP = 100000, EPCOST_CAP = 5000;
    var sampState = (seed ^ 0x5bd1e995) >>> 0;       // its own random numbers for thinning the cost samples, so the walkers' numbers are never touched
    function sampler() { sampState = (Math.imul(sampState, 1664525) + 1013904223) >>> 0; return sampState / 4294967296; }

    function pickEdge(v, rng) {   // only for the rules 'first' and 'curious'; returns a slot index
      var a = os[v], b = os[v + 1], od = b - a, k;
      if (rule === 'first') return a;
      if (rule === 'curious') {
        var cnt = 0, sum = 0;
        for (k = a; k < b; k++) if (seen[tg[k]] !== stamp) { cnt++; sum += cum[k] - (k > a ? cum[k - 1] : 0); }
        if (cnt && cnt < od) {
          if (!(sum > 0)) { var skip = Math.floor(rng() * cnt); for (k = a; k < b; k++) if (seen[tg[k]] !== stamp && skip-- === 0) return k; }
          var x = rng() * sum;
          for (k = a; k < b; k++) if (seen[tg[k]] !== stamp) { x -= cum[k] - (k > a ? cum[k - 1] : 0); if (x <= 0) return k; }
          return b - 1;
        }
      }
      var r = rng() * nodeTot[v], lo = a, hi = b - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
      return lo;
    }
    function pushSample(arr, seenN, capN, x) {
      if (arr.length < capN) arr.push(x);
      else { var j = Math.floor(sampler() * seenN); if (j < capN) arr[j] = x; }
    }
    function rangeOf(k) {   // the 95% range of end k's share
      var cnt = st.epCount[k], wl = wilson(cnt, st.walkers), share = st.walkers ? cnt / st.walkers : 0, lo = wl[0], hi = wl[1];
      if (!weightsFixed && st.shareTrials >= 30) {
        var smean = st.epShareSum[k] / st.shareTrials, ssd = Math.sqrt(Math.max(0, st.epShareSq[k] / st.shareTrials - smean * smean) * st.shareTrials / (st.shareTrials - 1));
        var hw = 1.96 * ssd / Math.sqrt(st.shareTrials); lo = Math.min(lo, share - hw); hi = Math.max(hi, share + hw);
      }
      return [Math.max(0, lo), Math.min(1, hi)];
    }
    function widest() { var w = 0; for (var k = 0; k < K; k++) { var r = rangeOf(k); if ((r[1] - r[0]) / 2 > w) w = (r[1] - r[0]) / 2; } return w; }
    function refreshTotals() {   // visits and moves are kept as counts of slots used; the item totals follow from them
      var v, k;
      for (v = 0; v < n; v++) st.visits[v] = startCount[v];
      for (k = 0; k < m; k++) { st.moves[oe[k]] = movesCsr[k]; st.visits[tg[k]] += movesCsr[k]; }
    }
    var shared = makeRng(0), hand = null;
    // An optional faster walker (walker-sim-wasm.js) takes over the same loop with the same numbers once a run has walked wasmAfter walkers (20,000 unless cfg.wasmAfter says otherwise:
    // setting it up costs about as much as walking that many). It works in copies of the arrays the loop counts in, so what was counted so far is copied over.
    var wantHand = kernelMaker !== null && LUT !== null && viaTable && !dCost && !dDwell && cfg.wasm !== false && srcs.length === 1 && cap <= 100000, handAfter = cfg.wasmAfter >= 0 ? +cfg.wasmAfter : 20000;
    st.engine = 'js';
    function attachHand() {
      wantHand = false;
      hand = kernelMaker({ n: n, m: m, K: K, cap: cap, os: os, tg: tg, halt: halt, epOf: epOf, lut: LUT, cumN: cumN });
      if (!hand) return;
      hand.moves.set(movesCsr); hand.tab.set(st.stepTab.a);
      movesCsr = hand.moves; st.stepTab.a = hand.tab; trialCounts = hand.counts; st.engine = 'wasm';
    }
    // The walkers of one trial for the common case (fixed weights, one start, no costs): the generator's state sits in a local variable (the same numbers as rng() gives),
    // and a lookup table per item picks the way on from the first 8 bits of the random number (255 = a boundary falls in that slice: scan like the loop below does).
    function walkPlain(rng, count, start) {
      var lLut = LUT, lOs = os, lCum = cumN, lTg = tg, lHalt = halt, lMoves = movesCsr, lTab = st.stepTab.a, lEp = epOf, lCap = cap, s0 = rng.state(), stuck = 0;
      for (var wk = 0; wk < count; wk++) {
        var v = start, steps = 0, sl, t, e;
        while (lHalt[v] === 0 && steps < lCap) {
          sl = lOs[v];
          s0 = (s0 + 0x6d2b79f5) | 0;
          t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          t = t ^ (t >>> 14);
          if (lLut !== null) { e = lLut[(v << LB) + (t >>> (32 - LB))]; if (e !== 255) { sl += e; lMoves[sl]++; v = lTg[sl]; steps++; continue; } }
          var r = (t >>> 0) / 4294967296;
          while (lCum[sl] <= r) sl++;
          lMoves[sl]++; v = lTg[sl]; steps++;
        }
        lTab[steps]++;
        if (isEnd[v]) trialCounts[lEp[v]]++; else stuck++;
      }
      rng.reseed(s0);
      return stuck;
    }
    st.run = function (maxTrials, budgetMs) {
      var t0 = Date.now(), done = 0;
      if (!srcs.length) { st.trial = T; return { done: true, trials: st.nTrials }; }
      while (st.trial < T && done < maxTrials && (Date.now() - t0 < budgetMs || done === 0)) {
        if (wantHand && st.walkers >= handAfter) attachHand();
        var rng = shared; rng.reseed(mix32(seed | 0, st.trial | 0));
        if (!weightsFixed) buildCum(rng);
        var count = Math.max(0, Math.round(dArr(rng, 0)));
        if (st.walkers + count > maxWalkers) count = Math.max(0, maxWalkers - st.walkers);
        var k, stuckHere = 0, plain = viaTable && !dCost && !dDwell;
        for (k = 0; k < K; k++) trialCounts[k] = 0;
        var inLoop = 0;
        if (plain && srcs.length === 1) { startCount[srcs[0].v] += count; stuckHere = (hand ? hand.walk : walkPlain)(rng, count, srcs[0].v); inLoop = count; count = 0; }     // the common case; count comes back below
        for (var wk = 0; wk < count; wk++) {
          var s = srcs[0].v;
          if (srcs.length > 1) { var xr = rng() * tot, si = 0; while (si < srcs.length - 1 && srcCum[si] < xr) si++; s = srcs[si].v; }
          startCount[s]++;
          var v = s, steps = 0, cost = 0, sl;
          if (plain) {                          // the common case: a walker is a loop over cumulative odds and nothing else
            while (!halt[v] && steps < cap) {
              sl = os[v]; var r = rng();
              while (cumN[sl] <= r) sl++;
              movesCsr[sl]++; v = tg[sl]; steps++;
            }
          } else {
            stamp++; seen[v] = stamp;
            if (dDwell && !isEnd[v]) cost += dDwell(rng, v);
            while (!halt[v] && steps < cap) {
              if (viaTable) { sl = os[v]; var r2 = rng(); while (cumN[sl] <= r2) sl++; } else sl = pickEdge(v, rng);
              movesCsr[sl]++;
              if (dCost) cost += dCost(rng, oe[sl]);
              v = tg[sl]; steps++;
              seen[v] = stamp;
              if (dDwell && !isEnd[v]) cost += dDwell(rng, v);
            }
          }
          st.stepTab.a[steps]++;
          if (dCost || dDwell) { st.costSeen++; pushSample(st.costs, st.costSeen, COST_CAP, cost); }
          if (isEnd[v]) {
            var ep = epOf[v];
            trialCounts[ep]++;
            if (dCost || dDwell) { var ce = st.epCosts[ep]; ce.n = (ce.n || 0) + 1; pushSample(ce, ce.n, EPCOST_CAP, cost); }
          } else stuckHere++;
        }
        count += inLoop;
        st.walkers += count; st.stuck += stuckHere;
        for (k = 0; k < K; k++) {
          var tc = trialCounts[k];
          st.epCount[k] += tc; st.epSum[k] += tc; st.epSumSq[k] += tc * tc;
          if (count > 0) { var sh = tc / count; st.epShareSum[k] += sh; st.epShareSq[k] += sh * sh; }
          tabAdd(st.epPerTrial[k], tc);
        }
        if (count > 0) st.shareTrials++;
        st.trial++; st.nTrials++; done++;
        if (precision && st.walkers >= minWalkers && (st.nTrials & 7) === 0 && widest() < precision) { st.stoppedEarly = true; st.trial = T; }
        if (st.walkers >= st.nextTrace || st.trial === T) {
          var row = { walkers: st.walkers, trial: st.nTrials, shares: [] };
          for (k = 0; k < K; k++) row.shares.push(st.walkers ? st.epCount[k] / st.walkers : 0);
          st.trace.push(row); st.nextTrace = Math.ceil(st.walkers * 1.25) + 5;
        }
        if (st.walkers >= maxWalkers) { st.trial = T; break; }
      }
      refreshTotals();
      st.busyMs += Date.now() - t0;
      return { done: st.trial >= T, trials: st.nTrials };
    };
    /** Everything counted so far, as plain arrays and numbers that can be sent to another thread (structured clone) and added up with add() or merge(). */
    st.export = function () {
      return {
        trials: st.nTrials, walkers: st.walkers, stuck: st.stuck, shareTrials: st.shareTrials, startCount: startCount.slice(), moves: movesCsr.slice(),
        epCount: st.epCount.slice(), epSum: st.epSum.slice(), epSumSq: st.epSumSq.slice(), epShareSum: st.epShareSum.slice(), epShareSq: st.epShareSq.slice(),
        steps: tabCopy(st.stepTab), perTrial: st.epPerTrial.map(tabCopy), costs: st.costs.slice(), costSeen: st.costSeen, epCosts: st.epCosts.map(function (c) { var a = c.slice(); a.n = c.n || 0; return a; })
      };
    };
    /** Add what another sim (same graph and set-up, other trials) counted. Counts, shares, visits and moves come out exactly as if one sim had run all the trials. */
    st.add = function (x) {
      var k;
      st.nTrials += x.trials; st.walkers += x.walkers; st.stuck += x.stuck; st.shareTrials += x.shareTrials;
      for (k = 0; k < n; k++) startCount[k] += x.startCount[k];
      for (k = 0; k < m; k++) movesCsr[k] += x.moves[k];
      for (k = 0; k < K; k++) { st.epCount[k] += x.epCount[k]; st.epSum[k] += x.epSum[k]; st.epSumSq[k] += x.epSumSq[k]; st.epShareSum[k] += x.epShareSum[k]; st.epShareSq[k] += x.epShareSq[k]; tabMerge(st.epPerTrial[k], x.perTrial[k]); }
      tabMerge(st.stepTab, x.steps);
      var seenN = st.costSeen + x.costSeen;
      x.costs.forEach(function (c, j) { pushSample(st.costs, st.costSeen + j + 1, COST_CAP, c); });
      st.costSeen = seenN;
      for (k = 0; k < K; k++) { var src = x.epCosts[k], dst = st.epCosts[k], base0 = dst.n || 0; src.forEach(function (c, j) { pushSample(dst, base0 + j + 1, EPCOST_CAP, c); }); dst.n = base0 + (src.n || 0); }
      st.trial = Math.min(T, st.trial + x.trials);
      var row = { walkers: st.walkers, trial: st.nTrials, shares: [] };
      for (k = 0; k < K; k++) row.shares.push(st.walkers ? st.epCount[k] / st.walkers : 0);
      st.trace = [row];
      refreshTotals();
      return st;
    };
    /** A plain copy of the results so far (typed arrays are copied, so the next batch does not change what you hold). */
    st.snapshot = function () {
      var W0 = st.walkers || 1, eps = [], k;
      for (k = 0; k < K; k++) {
        var cnt = st.epCount[k], share = st.walkers ? cnt / st.walkers : 0, pt = st.epPerTrial[k], ptn = tabCount(pt);
        tabSort(pt);
        var mean = st.nTrials ? st.epSum[k] / st.nTrials : 0, sd = st.nTrials > 1 ? Math.sqrt(Math.max(0, st.epSumSq[k] / st.nTrials - mean * mean) * st.nTrials / (st.nTrials - 1)) : 0;
        var rg = rangeOf(k), cs = st.epCosts[k].slice().sort(function (a, b) { return a - b; });
        eps.push({
          v: st.ends[k], id: P.nodes[st.ends[k]].id, count: cnt, share: share, lo: rg[0], hi: rg[1],
          perTrial: { mean: mean, sd: sd, p5: tabQuantile(pt, ptn, 0.05), p50: tabQuantile(pt, ptn, 0.5), p95: tabQuantile(pt, ptn, 0.95) },
          cost: cs.length ? { n: st.epCosts[k].n, mean: cs.reduce(function (a, b) { return a + b; }, 0) / cs.length, p5: quantile(cs, 0.05), p50: quantile(cs, 0.5), p95: quantile(cs, 0.95) } : null
        });
      }
      var out = {
        trials: st.nTrials, planned: T, stoppedEarly: st.stoppedEarly, walkers: st.walkers, stuck: st.stuck, stuckShare: st.walkers ? st.stuck / st.walkers : 0,
        endpoints: eps, visits: st.visits.map(function (x) { return x / W0; }), moves: st.moves.map(function (x) { return x / W0; }),
        steps: null, stepStats: null, cost: null, trace: st.trace.slice(), busyMs: st.busyMs, weightsFixed: weightsFixed, rule: rule
      };
      var sa = st.stepTab.a, sn = tabCount(st.stepTab), lo = -1, hi = -1, sum = 0, j;
      for (j = 0; j < sa.length; j++) if (sa[j]) { if (lo < 0) lo = j; hi = j; sum += j * sa[j]; }
      if (sn) {   // every walker's step count is in the table, so these are exact (the cost samples below are not)
        var nb = Math.min(40, hi - lo + 1), hb = new Array(nb).fill(0), wd = (hi - lo) / nb;
        if (hi === lo) hb = [sn]; else for (j = lo; j <= hi; j++) if (sa[j]) hb[Math.min(nb - 1, Math.floor((j - lo) / wd))] += sa[j];
        out.steps = { lo: lo, hi: hi, bins: hb };
        out.stepStats = { mean: sum / sn, p5: tabQuantile(st.stepTab, sn, 0.05), p50: tabQuantile(st.stepTab, sn, 0.5), p95: tabQuantile(st.stepTab, sn, 0.95), max: hi };
      } else out.steps = { lo: 0, hi: 0, bins: [] };
      if (st.costs.length) {
        var cc = st.costs.slice().sort(function (a, b) { return a - b; }), mean2 = cc.reduce(function (a, b) { return a + b; }, 0) / cc.length;
        var v2 = cc.reduce(function (a, b) { return a + (b - mean2) * (b - mean2); }, 0) / Math.max(1, cc.length - 1);
        out.cost = { n: st.costSeen, mean: mean2, sd: Math.sqrt(v2), p5: quantile(cc, 0.05), p25: quantile(cc, 0.25), p50: quantile(cc, 0.5), p75: quantile(cc, 0.75), p95: quantile(cc, 0.95), hist: histogram(cc, 30, false) };
      }
      return out;
    };
    return st;
  }
  /** Add up the exports of several sims that ran different trial ranges of the same set-up (for example one per Web Worker). Returns a sim whose snapshot() reads like one run. */
  function merge(P, cfg, exports) {
    var all = create(P, cfg);
    exports.forEach(function (x) { all.add(x); });
    return all;
  }

  /* ---------------------------------------------------------------- plain input: a list of links -> the compact graph the walkers use */
  var BAD_IDS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  /**
   * input: { links: [{ from, to, weight }], nodes: [id or { id, label }] (optional), start: id (optional) }.
   * weight is how likely this way on is compared with the other ways out of the same item (missing or not above 0 counts as 1).
   * Items that only appear in links are added. If start is missing, a likely beginning is picked (an item nothing points to that reaches the most).
   */
  function graph(input) {
    input = input || {};
    var nodes = [], index = new Map(), f = [], t = [], w = [], eo = [], links = input.links || [], i;
    function addNode(n) {
      var id = n !== null && typeof n === 'object' ? String(n.id) : String(n);
      if (BAD_IDS[id]) throw new Error('"' + id + '" cannot be used as an item name here.');
      if (!index.has(id)) { index.set(id, nodes.length); nodes.push({ id: id, label: n !== null && typeof n === 'object' && n.label !== undefined ? String(n.label) : id }); }
      return index.get(id);
    }
    (input.nodes || []).forEach(addNode);
    for (i = 0; i < links.length; i++) {
      var l = links[i];
      if (!l) continue;
      var a = addNode(l.from), b = addNode(l.to), wt = Number(l.weight);
      f.push(a); t.push(b); w.push(wt > 0 && isFinite(wt) ? wt : 1); eo.push(i);
    }
    var n = nodes.length, m = f.length;
    var P = { n: n, m: m, nodes: nodes, index: index, edges: links, eorig: Int32Array.from(eo), from: Int32Array.from(f), to: Int32Array.from(t), w: Float64Array.from(w),
      outStart: new Int32Array(n + 1), outEdge: new Int32Array(m), inStart: new Int32Array(n + 1), inEdge: new Int32Array(m), start: -1 };
    for (i = 0; i < m; i++) { P.outStart[P.from[i] + 1]++; P.inStart[P.to[i] + 1]++; }
    for (i = 0; i < n; i++) { P.outStart[i + 1] += P.outStart[i]; P.inStart[i + 1] += P.inStart[i]; }
    var oc = P.outStart.slice(0, n), ic = P.inStart.slice(0, n);
    for (i = 0; i < m; i++) { P.outEdge[oc[P.from[i]]++] = i; P.inEdge[ic[P.to[i]]++] = i; }
    var want = input.start !== undefined && input.start !== null ? String(input.start) : null;
    P.start = want !== null && index.has(want) ? index.get(want) : autoStart(P);
    if (want !== null && !index.has(want)) throw new Error('The start item "' + want + '" is not in the graph.');
    return P;
  }
  function outdeg(P, v) { return P.outStart[v + 1] - P.outStart[v]; }
  /** Breadth-first distances from `root` (never entering `skip`); -1 where not reached. */
  function bfs(P, root, skip) {
    var d = new Int32Array(P.n).fill(-1);
    if (root < 0 || root === skip || P.n === 0) return d;
    var q = new Int32Array(P.n), h = 0, tl = 0;
    q[tl++] = root; d[root] = 0;
    while (h < tl) {
      var v = q[h++];
      for (var k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
        var w = P.to[P.outEdge[k]];
        if (w !== skip && d[w] < 0) { d[w] = d[v] + 1; q[tl++] = w; }
      }
    }
    return d;
  }
  /** The best place to start when the data does not say: a node nothing points to that reaches the most, else the busiest node. */
  function autoStart(P) {
    if (!P.n) return -1;
    var cands = [], i;
    for (i = 0; i < P.n; i++) {
      var inn = 0;
      for (var k = P.inStart[i]; k < P.inStart[i + 1]; k++) if (P.from[P.inEdge[k]] !== i) inn++;
      if (!inn && outdeg(P, i)) cands.push(i);
    }
    if (!cands.length) for (i = 0; i < P.n; i++) cands.push(i);
    cands.sort(function (a, b) { return outdeg(P, b) - outdeg(P, a) || a - b; });
    var best = cands[0], bestN = -1;
    for (i = 0; i < Math.min(cands.length, 40); i++) {
      var d = bfs(P, cands[i], -1), c = 0;
      for (var j = 0; j < P.n; j++) if (d[j] >= 0) c++;
      if (c > bestN) { bestN = c; best = cands[i]; }
    }
    return best;
  }
  /** The seeds of a flow: [{v, mass}] from o.sources (ids with relative masses), else the start with mass 1. */
  function seedsOf(P, o) {
    var out = [];
    if (o && o.sources && o.sources.length) {
      var tot = 0;
      o.sources.forEach(function (s) { var v = P.index.get(s.id); if (v !== undefined) { var m = s.mass > 0 ? s.mass : 1; out.push({ v: v, mass: m }); tot += m; } });
      out.forEach(function (s) { s.mass /= tot || 1; });
    }
    if (!out.length && P.start >= 0) out.push({ v: P.start, mass: 1 });
    return out;
  }
  /** How the flow spreads forward from the seeds: expected visits per item and moves per link, with the same step cap as before. */
  function spread(P, p, seeds, cap) {
    var n = P.n, m = P.m, visits = new Float64Array(n), moves = new Float64Array(m), x = new Float64Array(n), y = new Float64Array(n), act = [], k, e;
    seeds.forEach(function (s) { if (x[s.v] === 0) act.push(s.v); x[s.v] += s.mass; });
    for (var step = 0; step < cap && act.length; step++) {
      var nxt = [], mass = 0;
      for (var ai = 0; ai < act.length; ai++) {
        var u = act[ai], xu = x[u];
        x[u] = 0;
        visits[u] += xu;
        if (!outdeg(P, u)) continue;
        for (k = P.outStart[u]; k < P.outStart[u + 1]; k++) {
          e = P.outEdge[k];
          var w = P.to[e], flow = xu * p[e];
          moves[e] += flow;
          if (y[w] === 0) nxt.push(w);
          y[w] += flow; mass += flow;
        }
      }
      var tmp = x; x = y; y = tmp;
      act = nxt;
      if (mass < 1e-13) break;
    }
    for (var li = 0; li < act.length; li++) visits[act[li]] += x[act[li]];      // walkers still going when the step cap hits have arrived at their item too
    return { visits: visits, moves: moves };
  }
  /** Groups of items that can all reach each other through ways with a chance above 0 (Tarjan, without recursion). Each group is listed after every group it can reach. */
  function loopGroups(P, p, inSet) {
    var n = P.n, idx = new Int32Array(n).fill(-1), low = new Int32Array(n), on = new Uint8Array(n), ptr = new Int32Array(n), stack = [], call = [], groups = [], counter = 0, r, v, w, e, u, g;
    for (r = 0; r < n; r++) {
      if (!inSet[r] || idx[r] >= 0) continue;
      idx[r] = low[r] = counter++; stack.push(r); on[r] = 1; ptr[r] = P.outStart[r]; call.push(r);
      while (call.length) {
        v = call[call.length - 1];
        if (ptr[v] < P.outStart[v + 1]) {
          e = P.outEdge[ptr[v]++];
          if (!(p[e] > 0)) continue;
          w = P.to[e];
          if (!inSet[w]) continue;
          if (idx[w] < 0) { idx[w] = low[w] = counter++; stack.push(w); on[w] = 1; ptr[w] = P.outStart[w]; call.push(w); }
          else if (on[w] && idx[w] < low[v]) low[v] = idx[w];
        } else {
          call.pop();
          if (call.length) { u = call[call.length - 1]; if (low[v] < low[u]) low[u] = low[v]; }
          if (low[v] === idx[v]) { g = []; do { w = stack.pop(); on[w] = 0; g.push(w); } while (w !== v); groups.push(g); }
        }
      }
    }
    return groups;
  }
  /**
   * Solves the loops directly instead of going round them again and again: the items are split into groups that can reach each other, the groups are
   * handled from the ends backwards, and each group (a loop of up to maxLoop items) is solved by elimination. Fills c; false when a group is too big.
   */
  function solveLoops(P, p, c, K, ord, maxLoop) {
    var n = P.n, inSet = new Uint8Array(n), pos = new Int32Array(n).fill(-1), i, j, q, k, e, w, pe;
    ord.forEach(function (v) { inSet[v] = 1; });
    var groups = loopGroups(P, p, inSet), gi;
    for (gi = 0; gi < groups.length; gi++) if (groups[gi].length > maxLoop) return false;
    for (gi = 0; gi < groups.length; gi++) {
      var g = groups[gi], s = g.length, v;
      if (s === 1) {
        v = g[0];
        var acc = new Float64Array(K), self = 0;
        for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
          e = P.outEdge[k]; pe = p[e]; w = P.to[e];
          if (!(pe > 0)) continue;
          if (w === v) self += pe; else for (q = 0; q < K; q++) acc[q] += pe * c[w * K + q];
        }
        for (q = 0; q < K; q++) c[v * K + q] = self < 1 ? acc[q] / (1 - self) : 0;
        continue;
      }
      var A = new Float64Array(s * s), B = new Float64Array(s * K);
      for (j = 0; j < s; j++) pos[g[j]] = j;
      for (j = 0; j < s; j++) {
        v = g[j]; A[j * s + j] += 1;
        for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
          e = P.outEdge[k]; pe = p[e]; w = P.to[e];
          if (!(pe > 0)) continue;
          if (pos[w] >= 0) A[j * s + pos[w]] -= pe; else for (q = 0; q < K; q++) B[j * K + q] += pe * c[w * K + q];
        }
      }
      for (var col = 0; col < s; col++) {
        var piv = col, best = Math.abs(A[col * s + col]), r;
        for (r = col + 1; r < s; r++) if (Math.abs(A[r * s + col]) > best) { best = Math.abs(A[r * s + col]); piv = r; }
        if (!(best > 1e-300)) { for (j = 0; j < s; j++) pos[g[j]] = -1; return false; }
        if (piv !== col) {
          for (j = 0; j < s; j++) { var t1 = A[col * s + j]; A[col * s + j] = A[piv * s + j]; A[piv * s + j] = t1; }
          for (q = 0; q < K; q++) { var t2 = B[col * K + q]; B[col * K + q] = B[piv * K + q]; B[piv * K + q] = t2; }
        }
        var inv = 1 / A[col * s + col];
        for (r = col + 1; r < s; r++) {
          var f = A[r * s + col] * inv;
          if (f === 0) continue;
          A[r * s + col] = 0;
          for (j = col + 1; j < s; j++) A[r * s + j] -= f * A[col * s + j];
          for (q = 0; q < K; q++) B[r * K + q] -= f * B[col * K + q];
        }
      }
      for (var row = s - 1; row >= 0; row--) {
        for (q = 0; q < K; q++) {
          var xv = B[row * K + q];
          for (j = row + 1; j < s; j++) xv -= A[row * s + j] * B[j * K + q];
          B[row * K + q] = xv / A[row * s + row];
        }
      }
      for (j = 0; j < s; j++) { for (q = 0; q < K; q++) c[g[j] * K + q] = Math.max(0, B[j * K + q]); pos[g[j]] = -1; }
    }
    return true;
  }
  /**
   * Absorbing chain with K end classes: classOf(item with no way on) gives its class 0..K-1. Returns c (n * K: the chance of
   * finishing in each class from each item), start (the mix over the seeds), visits and moves (unless o.noSpread), and how well it went:
   * converged (true when another round would move nothing by more than 1e-9), error (about how far the answers may still be off), method ('sweeps' or 'loops').
   * Rounds are tried first (o.sweeps, default 500); a loop that needs more is solved directly (groups of up to o.maxLoop items, default 2500).
   * o.warm: the c of a similar problem to start from (faster for what-if runs, where only a few ways change).
   */
  function absorb(P, imp, o, classOf, K) {
    o = o || {};
    var n = P.n, m = P.m, cap = o.cap || 400, maxSweeps = o.sweeps || 500;
    var sumw = new Float64Array(n), p = new Float64Array(m), i, k, e;
    for (e = 0; e < m; e++) sumw[P.from[e]] += P.w[e];
    for (e = 0; e < m; e++) p[e] = sumw[P.from[e]] > 0 ? P.w[e] / sumw[P.from[e]] : 0;
    var reach = new Uint8Array(n), bq = new Int32Array(n), qh = 0, qt = 0;    // items that can finish at all: they reach an end through ways with a chance above 0
    for (i = 0; i < n; i++) if (!outdeg(P, i)) { reach[i] = 1; bq[qt++] = i; }
    while (qh < qt) {
      var v0 = bq[qh++];
      for (k = P.inStart[v0]; k < P.inStart[v0 + 1]; k++) { e = P.inEdge[k]; var u0 = P.from[e]; if (!reach[u0] && p[e] > 0) { reach[u0] = 1; bq[qt++] = u0; } }
    }
    var c = new Float64Array(n * K), q;
    if (o.warm) c.set(o.warm);
    if (!imp.order) {   // the items with a way on, farthest from the start first; the same for every what-if, so it is worked out once
      imp.order = [];
      for (i = 0; i < n; i++) if (outdeg(P, i)) imp.order.push(i);
      imp.order.sort(function (a, b) { return imp.depth[b] - imp.depth[a] || a - b; });
    }
    var ord = [];
    for (i = 0; i < n; i++) {
      if (outdeg(P, i)) { if (!reach[i]) for (q = 0; q < K; q++) c[i * K + q] = 0; }
      else { for (q = 0; q < K; q++) c[i * K + q] = 0; var ci = classOf(i); if (ci >= 0 && ci < K) c[i * K + ci] = 1; }
    }
    for (i = 0; i < imp.order.length; i++) if (reach[imp.order[i]]) ord.push(imp.order[i]);
    var acc = new Float64Array(K);
    function sweepOnce() {
      var delta = 0, oi, v, k, e, q, tK, pe, d;
      for (oi = 0; oi < ord.length; oi++) {
        v = ord[oi];
        for (q = 0; q < K; q++) acc[q] = 0;
        for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
          e = P.outEdge[k];
          tK = P.to[e] * K; pe = p[e];
          for (q = 0; q < K; q++) acc[q] += pe * c[tK + q];
        }
        d = 0;
        for (q = 0; q < K; q++) { d += Math.abs(acc[q] - c[v * K + q]); c[v * K + q] = acc[q]; }
        if (d > delta) delta = d;
      }
      return delta;
    }
    var delta = Infinity, prev = Infinity, sweeps = 0, method = 'sweeps', converged, error;
    while (sweeps < maxSweeps) { prev = delta; delta = sweepOnce(); sweeps++; if (delta < 1e-12) break; }
    function leftover() { var rho = prev > 0 && prev < Infinity ? delta / prev : 1; return rho < 1 ? delta * rho / (1 - rho) : 1; }
    if (delta < 1e-12) { converged = true; error = delta; }
    else if (solveLoops(P, p, c, K, ord, o.maxLoop || 2500)) { method = 'loops'; delta = sweepOnce(); converged = delta < 1e-9; error = delta; }
    else {   // a loop too big to solve directly: keep going round for a while and say how far it got
      var t0 = Date.now(), budget = o.budgetMs || 2000;
      while (Date.now() - t0 < budget && delta >= 1e-12) { for (var rep = 0; rep < 25 && delta >= 1e-12; rep++) { prev = delta; delta = sweepOnce(); sweeps++; } }
      converged = delta < 1e-12; error = converged ? delta : leftover();
    }
    var seeds = seedsOf(P, o), start = new Float64Array(K), sp = null;
    seeds.forEach(function (s) { for (var q2 = 0; q2 < K; q2++) start[q2] += s.mass * c[s.v * K + q2]; });
    if (!o.noSpread) sp = spread(P, p, seeds, cap);
    return { c: c, K: K, start: start, visits: sp && sp.visits, moves: sp && sp.moves, p: p, converged: converged, error: error, method: method, sweeps: sweeps };
  }
  function indeg(P, v) { return P.inStart[v + 1] - P.inStart[v]; }

  /** The standard deviation of one draw of a distribution spec for element i, or NaN when it has none. */
  function specSd(spec, i) {
    var V = spec.values, pick = function (x) { return x !== null && x !== undefined && typeof x === 'object' ? x[i] : x; };
    if (spec.dist === 'empirical') { if (!V || !V.length) return NaN; var mu = 0, q = 0, j; for (j = 0; j < V.length; j++) mu += V[j]; mu /= V.length; for (j = 0; j < V.length; j++) q += (V[j] - mu) * (V[j] - mu); return Math.sqrt(q / V.length); }
    var v = moments(spec.dist, pick(spec.a), pick(spec.b), pick(spec.c)).variance;
    return isFinite(v) ? Math.sqrt(Math.max(0, v)) : NaN;
  }
  /** The average of one draw of a distribution spec for element i (a link or an item), or NaN when it has no average. */
  function specMean(spec, i) {
    var d = spec.dist, V = spec.values;
    var pick = function (x) { return x !== null && x !== undefined && typeof x === 'object' ? x[i] : x; };
    if (d === 'empirical') { if (!V || !V.length) return NaN; var s = 0; for (var j = 0; j < V.length; j++) s += V[j]; return s / V.length; }
    var a = pick(spec.a), b = pick(spec.b), c = pick(spec.c);
    switch (d) {
      case 'lognormal': case 'gamma': case 'exponential': case 'negbinomial': case 'poisson': if (!(a > 0)) return 0; break;
      case 'weibull': case 'pareto': if (!(a > 0 && b > 0)) return 0; break;
      case 'binomial': a = Math.floor(a); if (!(a > 0) || !(b > 0)) return 0; if (b >= 1) return a; break;
      case 'beta': if (!(a > 0)) return 0; if (!(a < 1)) return 1; break;
      case 'triangular': if (!(c > a)) return a; break;
      case 'dunif': a = Math.ceil(a); b = Math.floor(b); if (b < a) return a; break;
    }
    var mean = moments(d, a, b, c).mean;
    return isFinite(mean) ? mean : NaN;
  }

  /* ---------------------------------------------------------------- exact answers to compare with, and what-if sweeps */
  /**
   * Exact end odds for the same set-up when that is possible (fixed weights, weights or uniform choice, ends are the items with no way on).
   * Also: meanSteps (average steps per walker, with the step cap), meanCost (average cost per walker when linkCost or dwell is set; null if one of them has no average),
   * and converged / error / method from absorb(), so a number that did not settle says so.
   */
  function exactEndpoints(P, cfg) {
    cfg = cfg || {};
    var rule = cfg.rule || 'weights';
    if (rule !== 'weights' && rule !== 'uniform') return null;
    if (cfg.linkWeight) return null;
    var ends = [], i, n = P.n;
    for (i = 0; i < n; i++) if (P.outStart[i + 1] === P.outStart[i]) ends.push(i);
    if (cfg.targets && cfg.targets.length) { var tset = new Set(cfg.targets); for (i = 0; i < n; i++) if (tset.has(i) && P.outStart[i + 1] !== P.outStart[i]) return null; }
    var K = ends.length;
    if (!K || K > 64) return null;
    var w = rule === 'uniform' ? new Float64Array(P.m).fill(1) : (cfg.weights || P.w);
    var Q = Object.assign({}, P, { w: w }), epOf = new Int32Array(n).fill(-1);
    ends.forEach(function (v, k) { epOf[v] = k; });
    var srcs = (cfg.sources && cfg.sources.length ? cfg.sources : P.start >= 0 ? [{ v: P.start, w: 1 }] : []);
    var tot = 0; srcs.forEach(function (s) { tot += s.w; });
    var seeds = srcs.map(function (s) { return { id: P.nodes[s.v].id, mass: s.w / (tot || 1) }; });
    var imp = { depth: bfs(Q, Q.start, -1) };
    var so = cfg.solver || {}, r = absorb(Q, imp, { sources: seeds, cap: cfg.stepCap || 400, sweeps: so.sweeps, maxLoop: so.maxLoop, budgetMs: so.budgetMs }, function (v) { return epOf[v]; }, K);
    var got = 0; for (i = 0; i < K; i++) got += r.start[i];
    var meanSteps = 0, e; for (e = 0; e < P.m; e++) meanSteps += r.moves[e];
    var meanCost = null, hasL = cfg.linkCost && cfg.linkCost.dist, hasD = cfg.dwell && cfg.dwell.dist;
    if (hasL || hasD) {
      meanCost = 0;
      if (hasL) for (e = 0; e < P.m && meanCost !== null; e++) { var ml = specMean(cfg.linkCost, e); meanCost = isFinite(ml) ? meanCost + r.moves[e] * ml : null; }
      if (hasD) for (i = 0; i < n && meanCost !== null; i++) if (P.outStart[i + 1] !== P.outStart[i]) { var md = specMean(cfg.dwell, i); meanCost = isFinite(md) ? meanCost + r.visits[i] * md : null; }
    }
    return { ends: ends, p: r.start, stuck: Math.max(0, 1 - got), visits: r.visits, moves: r.moves, weights: w, Q: Q, imp: imp, epOf: epOf, seeds: seeds, K: K, c: r.c,
      meanSteps: meanSteps, meanCost: meanCost, converged: r.converged, error: r.error, method: r.method };
  }

  /** Exact odds without the heavy insides, safe to send between threads. */
  function exactSummary(P, cfg) {
    var x = exactEndpoints(P, cfg);
    if (!x) return null;
    return { ends: x.ends.map(function (v) { return P.nodes[v].id; }), p: Array.prototype.slice.call(x.p), stuck: x.stuck, visits: x.visits, moves: x.moves, meanSteps: x.meanSteps, meanCost: x.meanCost, converged: x.converged, error: x.error, method: x.method };
  }

  function tv(a, sa, b, sb) {
    var d = Math.abs(sa - sb);
    for (var i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    return d / 2;
  }
  /**
   * What if this item (or link) were gone? Ranks the busiest items or links by how far the end odds move.
   * opts: { what: 'items' | 'links', top, budgetMs }. Rows: { kind, v | e, shift, stuck, after: [odds], before: [odds] }.
   * Each what-if starts from the answer for the full network (only a few ways change, so it settles in fewer rounds); converged says whether every one settled.
   */
  function sweep(P, cfg, opts) {
    opts = opts || {};
    var base = exactEndpoints(P, cfg);
    if (!base) return { ok: false, reason: 'The what-if sweep needs fixed link weights, a weighted or even choice, and ends that are items with no way on.', rows: [] };
    var what = opts.what === 'links' ? 'links' : 'items', top = opts.top || 40, t0 = Date.now(), budget = opts.budgetMs || 8000, rows = [], cand = [], i, e, allConverged = base.converged;
    var isSrc = new Set((cfg.sources || []).map(function (s) { return s.v; }));
    if (P.start >= 0 && !(cfg.sources && cfg.sources.length)) isSrc.add(P.start);
    if (what === 'items') {
      for (i = 0; i < P.n; i++) if (!isSrc.has(i) && base.epOf[i] < 0 && base.visits[i] > 1e-9) cand.push(i);
      cand.sort(function (a, b) { return base.visits[b] - base.visits[a]; });
    } else {
      for (e = 0; e < P.m; e++) if (base.moves[e] > 1e-9) cand.push(e);
      cand.sort(function (a, b) { return base.moves[b] - base.moves[a]; });
    }
    cand = cand.slice(0, top);
    for (var ci = 0; ci < cand.length; ci++) {
      if (Date.now() - t0 > budget) break;
      var w2 = Float64Array.from(base.weights), c = cand[ci];
      if (what === 'items') { for (e = 0; e < P.m; e++) if (P.to[e] === c) w2[e] = 0; } else w2[c] = 0;
      var Q2 = Object.assign({}, P, { w: w2 }), r = absorb(Q2, base.imp, { sources: base.seeds, cap: cfg.stepCap || 400, warm: base.c, noSpread: true }, function (v) { return base.epOf[v]; }, base.K);
      if (!r.converged) allConverged = false;
      var got = 0; for (i = 0; i < base.K; i++) got += r.start[i];
      var stuck = Math.max(0, 1 - got);
      rows.push(what === 'items' ? { kind: 'item', v: c, id: P.nodes[c].id, shift: tv(base.p, base.stuck, r.start, stuck), stuck: stuck, after: Array.prototype.slice.call(r.start) } : { kind: 'link', e: c, from: P.nodes[P.from[c]].id, to: P.nodes[P.to[c]].id, shift: tv(base.p, base.stuck, r.start, stuck), stuck: stuck, after: Array.prototype.slice.call(r.start) });
    }
    rows.sort(function (a, b) { return b.shift - a.shift; });
    return { ok: true, what: what, ends: base.ends.map(function (v) { return P.nodes[v].id; }), before: Array.prototype.slice.call(base.p), beforeStuck: base.stuck, rows: rows, partial: cand.length > rows.length, converged: allConverged };
  }

  /**
   * Which link weights matter most? For every link with walkers on it: how far each end's odds move per unit of that weight (exact, from the same solve as exactEndpoints,
   * no re-solving per link). Rows: { e, from, to, d: [change in each end's odds per +1 on the weight], reach: sum of absolute changes }, biggest reach first.
   * If cfg.linkWeight says how unsure each weight is, sd gives the spread of every end's odds that this causes (delta method). With linkWeight the odds are at the average weights.
   * opts: { top } (default 40 rows; all links are still used for sd). Needs what exactEndpoints needs, but linkWeight is allowed here.
   * The walkers' visits are counted within stepCap steps (default 400), so for networks where most walkers need more steps than that the numbers are low.
   */
  function sensitivity(P, cfg, opts) {
    opts = opts || {}; cfg = cfg || {};
    var spec = cfg.linkWeight && cfg.linkWeight.dist ? cfg.linkWeight : null, plainCfg = Object.assign({}, cfg), e0;
    delete plainCfg.linkWeight;
    if (spec) {     // the odds are worked out at the average of every weight
      var wm = new Float64Array(P.m);
      for (e0 = 0; e0 < P.m; e0++) { wm[e0] = specMean(spec, e0); if (!isFinite(wm[e0])) return { ok: false, reason: 'A link weight has no average, so there is no middle to work out the odds at.', rows: [] }; }
      plainCfg.weights = wm;
    }
    var x = exactEndpoints(P, plainCfg);
    if (!x || (cfg.rule || 'weights') !== 'weights') return { ok: false, reason: 'The sensitivity table needs the weighted choice (rule weights) and ends that are items with no way on.', rows: [] };
    var K = x.K, n = P.n, m = P.m, Su = new Float64Array(n), e, q, u, t, rows = [], vr = spec ? new Float64Array(K) : null;
    for (e = 0; e < m; e++) Su[P.from[e]] += x.weights[e];
    for (e = 0; e < m; e++) {
      u = P.from[e]; t = P.to[e];
      if (!(x.visits[u] > 0) || !(Su[u] > 0)) continue;
      var d = new Float64Array(K), reach = 0, f = x.visits[u] / Su[u], sd = vr ? specSd(spec, e) : 0;
      for (q = 0; q < K; q++) { d[q] = f * (x.c[t * K + q] - x.c[u * K + q]); reach += Math.abs(d[q]); if (vr) vr[q] += d[q] * d[q] * sd * sd; }
      rows.push({ e: e, from: P.nodes[u].id, to: P.nodes[t].id, d: Array.prototype.slice.call(d), reach: reach });
    }
    rows.sort(function (a, b) { return b.reach - a.reach; });
    var out = { ok: true, ends: x.ends.map(function (v) { return P.nodes[v].id; }), p: Array.prototype.slice.call(x.p), rows: rows.slice(0, opts.top || 40), converged: x.converged };
    if (vr) out.sd = Array.prototype.map.call(vr, Math.sqrt);
    return out;
  }

  return { graph: graph, DRAW: DRAW, moments: moments, drawer: drawer, makeRng: makeRng, rngFor: rngFor, lgamma: lgamma, create: create, merge: merge, exactEndpoints: exactEndpoints, exactSummary: exactSummary, sweep: sweep, sensitivity: sensitivity, useKernel: function (f) { kernelMaker = typeof f === 'function' ? f : null; }, wilson: wilson, quantile: quantile };
}));
