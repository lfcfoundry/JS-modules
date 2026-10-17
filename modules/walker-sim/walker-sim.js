/*!
 * walker-sim.js: simulate random walkers on a network, with exact odds to check against. No dependencies.
 * Seeded and repeatable (trial t of seed s always draws the same numbers, however the run is cut into batches), with a menu of
 * distributions for how many walkers arrive, how uncertain each link is and what each link costs; 95% ranges; what-if sweeps.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
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
  /** name, plain-words help, whether it gives whole numbers, and what its three numbers mean. */
  var DISTS = [
    { id: 'fixed', name: 'Fixed value', discrete: false, blurb: 'Always the same number.', params: [{ k: 'a', label: 'Value' }] },
    { id: 'normal', name: 'Normal (Gaussian)', discrete: false, blurb: 'A bell curve around an average. Good for measurements and errors.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'lognormal', name: 'Lognormal', discrete: false, blurb: 'Never negative and skewed to the high side. Good for sizes, durations and prices.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'poisson', name: 'Poisson', discrete: true, blurb: 'Counts of things that happen independently at an average rate: arrivals, calls, defects.', params: [{ k: 'a', label: 'Average count' }] },
    { id: 'binomial', name: 'Binomial', discrete: true, blurb: 'How many of a fixed number of tries succeed.', params: [{ k: 'a', label: 'Number of tries' }, { k: 'b', label: 'Chance each time (0 to 1)' }] },
    { id: 'negbinomial', name: 'Negative binomial', discrete: true, blurb: 'Counts that vary more than Poisson (bursty arrivals).', params: [{ k: 'a', label: 'Average count' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'geometric', name: 'Geometric', discrete: true, blurb: 'How many tries until the first success.', params: [{ k: 'a', label: 'Average number of tries (1 or more)' }] },
    { id: 'exponential', name: 'Exponential', discrete: false, blurb: 'Waiting times when events are independent.', params: [{ k: 'a', label: 'Average' }] },
    { id: 'gamma', name: 'Gamma', discrete: false, blurb: 'Never negative; a flexible shape for durations and amounts.', params: [{ k: 'a', label: 'Average' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'weibull', name: 'Weibull', discrete: false, blurb: 'Lifetimes and delays; the shape says whether failures speed up or slow down.', params: [{ k: 'a', label: 'Typical size (scale)' }, { k: 'b', label: 'Shape (1 acts like exponential)' }] },
    { id: 'beta', name: 'Beta', discrete: false, blurb: 'A rate or share between 0 and 1 you are unsure about.', params: [{ k: 'a', label: 'Average (0 to 1)' }, { k: 'b', label: 'Spread (standard deviation)' }] },
    { id: 'uniform', name: 'Uniform', discrete: false, blurb: 'Anything between a lowest and a highest value is equally likely.', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Highest' }] },
    { id: 'triangular', name: 'Triangular', discrete: false, blurb: 'A best guess with a lowest and a highest possible value.', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Most likely' }, { k: 'c', label: 'Highest' }] },
    { id: 'pareto', name: 'Pareto', discrete: false, blurb: 'A few huge values and many small ones (wealth, sizes of cities).', params: [{ k: 'a', label: 'Smallest value' }, { k: 'b', label: 'Shape (bigger = lighter tail)' }] },
    { id: 'dunif', name: 'Whole-number uniform', discrete: true, blurb: 'Any whole number from a lowest to a highest, equally likely (a die roll).', params: [{ k: 'a', label: 'Lowest' }, { k: 'b', label: 'Highest' }] },
    { id: 'empirical', name: 'Resample from the data', discrete: false, blurb: 'Pick at random from the numbers in a column.', params: [] }
  ];
  var DIST_BY = {}; DISTS.forEach(function (d) { DIST_BY[d.id] = d; });

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
  /** spec: { dist, a, b, c, values } with numbers, or arrays per element for a, b, c. Returns draw(rng, i). */
  function drawer(spec) {
    if (!spec || !spec.dist) return null;
    var f = DRAW[spec.dist], A = spec.a, B = spec.b, C = spec.c, V = spec.values;
    if (spec.dist === 'empirical') {
      if (!V || !V.length) return null;
      return function (r) { return V[Math.floor(r() * V.length)]; };
    }
    if (!f) return null;
    var arr = function (x, i) { return x !== null && x !== undefined && typeof x === 'object' ? x[i] : x; };
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
  /**
   * cfg: { seed, trials, stepCap, sources: [{v, w}], targets: [v] | null, arrivals: spec, rule: 'weights'|'uniform'|'first'|'curious'|'softmax',
   *        temp, weights: Float64Array(m) base weights, linkWeight: spec | null, linkCost: spec | null, dwell: spec | null, maxWalkers }
   */
  function create(P, cfg) {
    cfg = cfg || {};
    var n = P.n, m = P.m, seed = cfg.seed === undefined ? 1 : cfg.seed | 0, T = Math.max(1, cfg.trials | 0), cap = cfg.stepCap || 400;
    var rule = cfg.rule || 'weights', temp = cfg.temp > 0 ? cfg.temp : 1;
    var maxWalkers = cfg.maxWalkers || 5e6;
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
    var buildCum = function (rng) {
      for (var e = 0; e < m; e++) {
        var w = rule === 'uniform' || rule === 'first' ? 1 : (dW ? dW(rng, e) : base[e]);
        if (!(w > 0) || !isFinite(w)) w = 0;
        W[e] = w;
      }
      for (var v = 0; v < n; v++) {
        var a = P.outStart[v], b = P.outStart[v + 1], s = 0, mx = 0, k;
        if (rule === 'softmax') { for (k = a; k < b; k++) if (W[P.outEdge[k]] > mx) mx = W[P.outEdge[k]]; }
        for (k = a; k < b; k++) {
          var ww = W[P.outEdge[k]];
          if (rule === 'softmax') ww = Math.exp((ww - mx) / temp);
          s += ww; cum[k] = s;
        }
        nodeTot[v] = s;
      }
    };
    if (weightsFixed) buildCum(makeRng(1));
    var st = {
      P: P, cfg: cfg, T: T, trial: 0, K: K, ends: ends, epOf: epOf, walkers: 0, stuck: 0,
      visits: new Float64Array(n), moves: new Float64Array(m), epCount: new Float64Array(K), epSum: new Float64Array(K), epSumSq: new Float64Array(K), epShareSum: new Float64Array(K), epShareSq: new Float64Array(K), shareTrials: 0,
      epPerTrial: [], epCosts: [], costs: [], costSeen: 0, steps: [], stepSeen: 0, trace: [], nextTrace: 10, lastRng: null, startedAt: 0, busyMs: 0
    };
    for (i = 0; i < K; i++) { st.epPerTrial.push([]); st.epCosts.push([]); }
    var seen = new Int32Array(n).fill(-1), stamp = 0, trialCounts = new Float64Array(K), EP_CAP = 4000, COST_CAP = 100000, STEP_CAP = 100000, EPCOST_CAP = 5000;

    function pickEdge(v, rng) {
      var a = P.outStart[v], b = P.outStart[v + 1], od = b - a, k;
      if (rule === 'first') return P.outEdge[a];
      if (rule === 'uniform') return P.outEdge[a + Math.floor(rng() * od)];
      if (rule === 'curious') {
        var cnt = 0, sum = 0;
        for (k = a; k < b; k++) if (seen[P.to[P.outEdge[k]]] !== stamp) { cnt++; sum += cum[k] - (k > a ? cum[k - 1] : 0); }
        if (cnt && cnt < od) {
          if (!(sum > 0)) { var skip = Math.floor(rng() * cnt); for (k = a; k < b; k++) if (seen[P.to[P.outEdge[k]]] !== stamp && skip-- === 0) return P.outEdge[k]; }
          var x = rng() * sum;
          for (k = a; k < b; k++) if (seen[P.to[P.outEdge[k]]] !== stamp) { x -= cum[k] - (k > a ? cum[k - 1] : 0); if (x <= 0) return P.outEdge[k]; }
          return P.outEdge[b - 1];
        }
      }
      var t = nodeTot[v];
      if (!(t > 0)) return P.outEdge[a + Math.floor(rng() * od)];
      var r = rng() * t, lo = a, hi = b - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
      return P.outEdge[lo];
    }
    function pushSample(arr, seenN, cap, x, rng) {
      if (arr.length < cap) arr.push(x);
      else { var j = Math.floor(rng() * seenN); if (j < cap) arr[j] = x; }
    }
    st.run = function (maxTrials, budgetMs) {
      var t0 = Date.now(), done = 0;
      if (!srcs.length) { st.trial = T; return { done: true, trials: st.trial }; }
      while (st.trial < T && done < maxTrials && (Date.now() - t0 < budgetMs || done === 0)) {
        var rng = rngFor(seed, st.trial);
        if (!weightsFixed) buildCum(rng);
        var count = Math.max(0, Math.round(dArr(rng, 0)));
        if (st.walkers + count > maxWalkers) count = Math.max(0, maxWalkers - st.walkers);
        var k;
        for (k = 0; k < K; k++) trialCounts[k] = 0;
        for (var wk = 0; wk < count; wk++) {
          var s = srcs[0].v;
          if (srcs.length > 1) { var xr = rng() * tot, si = 0; while (si < srcs.length - 1 && srcCum[si] < xr) si++; s = srcs[si].v; }
          stamp++;
          var v = s, steps = 0, cost = 0;
          seen[v] = stamp; st.visits[v]++;
          if (dDwell && !isEnd[v]) cost += dDwell(rng, v);
          while (!isEnd[v] && steps < cap) {
            var e = pickEdge(v, rng);
            st.moves[e]++;
            if (dCost) cost += dCost(rng, e);
            v = P.to[e]; steps++;
            seen[v] = stamp; st.visits[v]++;
            if (dDwell && !isEnd[v]) cost += dDwell(rng, v);
          }
          st.walkers++;
          st.stepSeen++; pushSample(st.steps, st.stepSeen, STEP_CAP, steps, rng);
          if (dCost || dDwell) { st.costSeen++; pushSample(st.costs, st.costSeen, COST_CAP, cost, rng); }
          if (isEnd[v]) {
            var ep = epOf[v];
            trialCounts[ep]++;
            if (dCost || dDwell) { var ce = st.epCosts[ep]; ce.n = (ce.n || 0) + 1; pushSample(ce, ce.n, EPCOST_CAP, cost, rng); }
          } else st.stuck++;
        }
        var nz = 0;
        for (k = 0; k < K; k++) { st.epCount[k] += trialCounts[k]; st.epSum[k] += trialCounts[k]; st.epSumSq[k] += trialCounts[k] * trialCounts[k]; if (count > 0) { var sh = trialCounts[k] / count; st.epShareSum[k] += sh; st.epShareSq[k] += sh * sh; } nz++; }
        if (count > 0) st.shareTrials++;
        for (k = 0; k < K; k++) { var pa = st.epPerTrial[k]; pa.n = (pa.n || 0) + 1; pushSample(pa, pa.n, EP_CAP, trialCounts[k], rng); }
        st.trial++; done++;
        if (st.walkers >= st.nextTrace || st.trial === T) {
          var row = { walkers: st.walkers, trial: st.trial, shares: [] };
          for (k = 0; k < K; k++) row.shares.push(st.walkers ? st.epCount[k] / st.walkers : 0);
          st.trace.push(row); st.nextTrace = Math.ceil(st.walkers * 1.25) + 5;
        }
        if (st.walkers >= maxWalkers) { st.trial = T; break; }
      }
      st.busyMs += Date.now() - t0;
      return { done: st.trial >= T, trials: st.trial };
    };
    /** A plain copy of the results so far (typed arrays are copied, so the next batch does not change what you hold). */
    st.snapshot = function () {
      var W0 = st.walkers || 1, eps = [], k;
      for (k = 0; k < K; k++) {
        var cnt = st.epCount[k], wl = wilson(cnt, st.walkers), share = st.walkers ? cnt / st.walkers : 0, tr = st.epPerTrial[k].slice().sort(function (a, b) { return a - b; });
        var mean = st.trial ? st.epSum[k] / st.trial : 0, sd = st.trial > 1 ? Math.sqrt(Math.max(0, st.epSumSq[k] / st.trial - mean * mean) * st.trial / (st.trial - 1)) : 0;
        var smean = st.shareTrials ? st.epShareSum[k] / st.shareTrials : 0, ssd = st.shareTrials > 1 ? Math.sqrt(Math.max(0, st.epShareSq[k] / st.shareTrials - smean * smean) * st.shareTrials / (st.shareTrials - 1)) : 0;
        var lo = wl[0], hi = wl[1];
        if (!weightsFixed && st.shareTrials >= 30) { var hw = 1.96 * ssd / Math.sqrt(st.shareTrials); lo = Math.min(lo, share - hw); hi = Math.max(hi, share + hw); }
        var cs = st.epCosts[k].slice().sort(function (a, b) { return a - b; });
        eps.push({
          v: st.ends[k], id: P.nodes[st.ends[k]].id, count: cnt, share: share, lo: Math.max(0, lo), hi: Math.min(1, hi),
          perTrial: { mean: mean, sd: sd, p5: quantile(tr, 0.05), p50: quantile(tr, 0.5), p95: quantile(tr, 0.95) },
          cost: cs.length ? { n: st.epCosts[k].n, mean: cs.reduce(function (a, b) { return a + b; }, 0) / cs.length, p5: quantile(cs, 0.05), p50: quantile(cs, 0.5), p95: quantile(cs, 0.95) } : null
        });
      }
      var out = {
        trials: st.trial, planned: T, walkers: st.walkers, stuck: st.stuck, stuckShare: st.walkers ? st.stuck / st.walkers : 0,
        endpoints: eps, visits: st.visits.map(function (x) { return x / W0; }), moves: st.moves.map(function (x) { return x / W0; }),
        steps: histogram(st.steps, 40, true), stepStats: null, cost: null, trace: st.trace.slice(), busyMs: st.busyMs, weightsFixed: weightsFixed, rule: rule
      };
      var ss = st.steps.slice().sort(function (a, b) { return a - b; });
      if (ss.length) out.stepStats = { mean: ss.reduce(function (a, b) { return a + b; }, 0) / ss.length, p5: quantile(ss, 0.05), p50: quantile(ss, 0.5), p95: quantile(ss, 0.95), max: ss[ss.length - 1] };
      if (st.costs.length) {
        var cc = st.costs.slice().sort(function (a, b) { return a - b; }), mean2 = cc.reduce(function (a, b) { return a + b; }, 0) / cc.length;
        var v2 = cc.reduce(function (a, b) { return a + (b - mean2) * (b - mean2); }, 0) / Math.max(1, cc.length - 1);
        out.cost = { n: st.costSeen, mean: mean2, sd: Math.sqrt(v2), p5: quantile(cc, 0.05), p25: quantile(cc, 0.25), p50: quantile(cc, 0.5), p75: quantile(cc, 0.75), p95: quantile(cc, 0.95), hist: histogram(cc, 30, false) };
      }
      return out;
    };
    return st;
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
    return { visits: visits, moves: moves };
  }
  /**
   * Absorbing chain with K end classes: classOf(item with no way on) gives its class 0..K-1. Returns c (n * K: the chance of
   * finishing in each class from each item), start (the mix over the seeds), visits and moves.
   */
  function absorb(P, imp, o, classOf, K) {
    o = o || {};
    var n = P.n, m = P.m, cap = o.cap || 400;
    var sumw = new Float64Array(n), p = new Float64Array(m), i, k, e;
    for (e = 0; e < m; e++) sumw[P.from[e]] += P.w[e];
    for (e = 0; e < m; e++) p[e] = sumw[P.from[e]] > 0 ? P.w[e] / sumw[P.from[e]] : 0;
    var c = new Float64Array(n * K);
    for (i = 0; i < n; i++) if (!outdeg(P, i)) { var ci = classOf(i); if (ci >= 0 && ci < K) c[i * K + ci] = 1; }
    var ord = [];
    for (i = 0; i < n; i++) if (outdeg(P, i)) ord.push(i);
    ord.sort(function (a, b) { return imp.depth[b] - imp.depth[a] || a - b; });
    var acc = new Float64Array(K);
    for (var sweep = 0; sweep < 500; sweep++) {
      var delta = 0;
      for (var oi = 0; oi < ord.length; oi++) {
        var v = ord[oi], q;
        for (q = 0; q < K; q++) acc[q] = 0;
        for (k = P.outStart[v]; k < P.outStart[v + 1]; k++) {
          e = P.outEdge[k];
          var tK = P.to[e] * K, pe = p[e];
          for (q = 0; q < K; q++) acc[q] += pe * c[tK + q];
        }
        var d = 0;
        for (q = 0; q < K; q++) { d += Math.abs(acc[q] - c[v * K + q]); c[v * K + q] = acc[q]; }
        if (d > delta) delta = d;
      }
      if (delta < 1e-12) break;
    }
    var seeds = seedsOf(P, o), sp = spread(P, p, seeds, cap), start = new Float64Array(K);
    seeds.forEach(function (s) { for (var q = 0; q < K; q++) start[q] += s.mass * c[s.v * K + q]; });
    return { c: c, K: K, start: start, visits: sp.visits, moves: sp.moves, p: p };
  }
  function indeg(P, v) { return P.inStart[v + 1] - P.inStart[v]; }

  /* ---------------------------------------------------------------- exact answers to compare with, and what-if sweeps */
  /** Exact end odds for the same set-up when that is possible (fixed weights, weights or uniform choice, ends are the items with no way on). */
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
    var r = absorb(Q, imp, { sources: seeds, cap: cfg.stepCap || 400 }, function (v) { return epOf[v]; }, K);
    var got = 0; for (i = 0; i < K; i++) got += r.start[i];
    return { ends: ends, p: r.start, stuck: Math.max(0, 1 - got), visits: r.visits, moves: r.moves, weights: w, Q: Q, imp: imp, epOf: epOf, seeds: seeds, K: K };
  }

  /** Exact odds without the heavy insides, safe to send between threads. */
  function exactSummary(P, cfg) {
    var x = exactEndpoints(P, cfg);
    if (!x) return null;
    return { ends: x.ends.map(function (v) { return P.nodes[v].id; }), p: Array.prototype.slice.call(x.p), stuck: x.stuck, visits: x.visits, moves: x.moves };
  }

  function tv(a, sa, b, sb) {
    var d = Math.abs(sa - sb);
    for (var i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    return d / 2;
  }
  /**
   * What if this item (or link) were gone? Ranks the busiest items or links by how far the end odds move.
   * opts: { what: 'items' | 'links', top, budgetMs }. Rows: { kind, v | e, shift, stuck, after: [odds], before: [odds] }.
   */
  function sweep(P, cfg, opts) {
    opts = opts || {};
    var base = exactEndpoints(P, cfg);
    if (!base) return { ok: false, reason: 'The what-if sweep needs fixed link weights, a weighted or even choice, and ends that are items with no way on.', rows: [] };
    var what = opts.what === 'links' ? 'links' : 'items', top = opts.top || 40, t0 = Date.now(), budget = opts.budgetMs || 8000, rows = [], cand = [], i, e;
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
      var Q2 = Object.assign({}, P, { w: w2 }), r = absorb(Q2, base.imp, { sources: base.seeds, cap: cfg.stepCap || 400 }, function (v) { return base.epOf[v]; }, base.K);
      var got = 0; for (i = 0; i < base.K; i++) got += r.start[i];
      var stuck = Math.max(0, 1 - got);
      rows.push(what === 'items' ? { kind: 'item', v: c, id: P.nodes[c].id, shift: tv(base.p, base.stuck, r.start, stuck), stuck: stuck, after: Array.prototype.slice.call(r.start) } : { kind: 'link', e: c, from: P.nodes[P.from[c]].id, to: P.nodes[P.to[c]].id, shift: tv(base.p, base.stuck, r.start, stuck), stuck: stuck, after: Array.prototype.slice.call(r.start) });
    }
    rows.sort(function (a, b) { return b.shift - a.shift; });
    return { ok: true, what: what, ends: base.ends.map(function (v) { return P.nodes[v].id; }), before: Array.prototype.slice.call(base.p), beforeStuck: base.stuck, rows: rows, partial: cand.length > rows.length };
  }

  return { graph: graph, DISTS: DISTS, DIST_BY: DIST_BY, DRAW: DRAW, moments: moments, drawer: drawer, makeRng: makeRng, rngFor: rngFor, lgamma: lgamma, create: create, exactEndpoints: exactEndpoints, exactSummary: exactSummary, sweep: sweep, wilson: wilson, quantile: quantile };
}));
