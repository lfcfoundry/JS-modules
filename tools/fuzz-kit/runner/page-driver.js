/* page-driver: the in-page half of the fuzz-kit runners (fuzz_playwright.py and fuzz_puppeteer.mjs both inject it, after src/fuzz-core.js and your adapter's
   window.__fuzzConfig). Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules

   It starts one seed and leaves the answer in window variables, because a runner that waits on one long evaluate() call cannot notice a page that hangs:

     window.__fuzzStart(seed, nOps, { stopAt, shrink, shrinkTries, shrinkSecs, junkText, junkSkip, real, trace, swarm, repeat, script })   -> 1, at once (the run starts a moment later)
     window.__fuzzR     the result when done: { seed, ops, fails, visited, shrunk? } or { error }   (null while running)
     window.__fuzzLast  'index name' of the operation now running (readable only while the page still answers)
     window.__fuzzNeed / __fuzzTake() / __fuzzGive()   the real-input handshake (see Fuzzer.Real): the page asks, the runner acts with its driver, then calls __fuzzGive

   swarm: a number (chance that each operation is left out of a run); used for even seeds only, and only when the adapter did not set its own `swarm`.
   repeat: after the run, the SAME seed is run once more in the same page; the answer says whether the two runs had the same fingerprint (r.repeat).
   script: replay a recorded script (from a --shrink report) instead of a random run.

   shrink: when the seed fails, the SAME game is replayed from a recorded script (Fuzzer record mode) and cut down with Fuzzer.shrink, under a try cap and a time cap.
   The shrink calls window.__fuzzConfig(seed) again for every try, so your adapter must reset the app there (the example adapter does). */
(function (root) {
  'use strict';
  function msg(e) { return String(e && e.message || e).slice(0, 300); }

  root.__fuzzStart = function (seed, nOps, o) {
    o = o || {};
    root.__fuzzR = null; root.__fuzzNeed = null; root.__fuzzWake = null; root.__fuzzLast = '';
    root.__fuzzTake = function () { var n = root.__fuzzNeed; root.__fuzzNeed = null; return n; };
    root.__fuzzGive = function () { var w = root.__fuzzWake; root.__fuzzWake = null; if (w) w(); return 1; };
    if (o.real) root.__fuzzReal = function (req) { return new Promise(function (resolve) { root.__fuzzNeed = req; root.__fuzzWake = resolve; }); };
    else root.__fuzzReal = undefined;
    var F = root.Fuzzer;
    function cfgFor() {
      var cfg = root.__fuzzConfig(seed);
      if (o.swarm && cfg.swarm === undefined && Number(seed) % 2 === 0) cfg.swarm = o.swarm;
      if (o.junkText) cfg.invariants = (cfg.invariants || []).concat([F.Invariants.noJunkText({ skip: o.junkSkip || [] })]);
      return cfg;
    }
    var runOpts = { record: !!o.shrink };
    if (o.script) runOpts = { script: o.script };
    if (o.stopAt !== undefined && o.stopAt !== null) runOpts.stopAt = o.stopAt;
    runOpts.onOp = function (c) {
      root.__fuzzLast = c.i + ' ' + c.op;
      if (o.trace) { try { root.console.debug('__fuzz-op ' + c.i + ' ' + c.op); } catch (e) { } }   // console messages reach the runner even if the page hangs right after
    };
    // Start in a later turn: the engine runs synchronous operations back to back, so without this the runner's start call would not return until the whole run
    // was over, and a page stuck in an endless loop could never be noticed (the hang guard would never get a chance).
    root.setTimeout(function () {
      var p;
      try { p = new F(cfgFor()).run(nOps, runOpts); } catch (e) { root.__fuzzR = { error: 'could not start: ' + msg(e) }; return; }
      p.then(function (r) {
        if (!o.repeat) return r;
        return new F(cfgFor()).run(nOps, runOpts).then(function (r2) {
          r.repeat = { same: r.hash === r2.hash && r.fails.length === r2.fails.length, first: r.hash, second: r2.hash };
          return r;
        });
      }).then(function (r) {
        if (!(o.shrink && r.fails.length && r.script)) { delete r.script; return r; }
        var t0 = new Date().getTime();
        return F.shrink(function () { return new F(cfgFor()); }, r.script, { maxTries: o.shrinkTries || 200, maxMs: (o.shrinkSecs || 30) * 1000 }).then(function (s) {
          r.shrunk = { from: s.from, to: s.script.length, tries: s.tries, ms: new Date().getTime() - t0, stopped: s.stopped || '', repeats: !!s.finding, note: s.note || '',
            ops: s.script.map(function (e) { return e.op; }), script: s.script, finding: s.finding };
          delete r.script; return r;
        });
      }).then(function (r) { root.__fuzzR = r; }, function (e) { root.__fuzzR = { error: 'driver: ' + msg(e) }; });

    }, 0);
    return 1;
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
