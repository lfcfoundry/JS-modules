/* fuzz-core: a seeded, reproducible random-input fuzzer for stateful web pages and games. MIT License, Copyright (c) 2026 JNFoo. https://github.com/JNFoo/JS-modules */

/* A fuzzer here is: a list of weighted OPERATIONS (taps, key presses, menu clicks, "load a damaged save"...), a list of INVARIANTS
   (things that must hold after every operation) and an optional LIVENESS check (from anywhere, ordinary input must lead somewhere).
   One seed gives one exact sequence, so a failure is reproduced by running the same seed again; every failure carries the tail of
   operation names that led to it.

     var f = new Fuzzer({
       seed: 7,
       ops: [ { name: 'tap', weight: 5, run: function (c) { app.tap(c.int(360), c.int(640)); } }, ... ],   // c: see Context below
       invariants: [ function (c) { return app.score >= 0 ? '' : 'score is negative'; } ],               // '' / falsy = fine; a string or an array of strings = broken
       liveness: { every: 25, signature: function (c) { return app.state + app.score; }, nudge: function (c) { app.tap(10, 10); app.step(60); }, tries: 60 },
       state: function (c) { return app.state; },            // optional: counted per operation so you can see which parts of the app were visited
       errors: true,                                          // also fail on window 'error' and 'unhandledrejection' events
       every: [ { n: 40, run: function (c) { app.render(); } } ],   // run something every n operations (an exception becomes a failure)
       afterFail: function (c) { app.reset(); },              // put the app back in a sane place after a failure so the run can go on
       tailLength: 40, maxFails: 5
     });
     f.run(600).then(function (result) { ... });   // { seed, ops, fails: [{ i, op, what, tail }], visited: { state: count } }

   Context c (passed to everything): c.rand() uniform [0,1), c.int(n) 0..n-1, c.pick(array), c.chance(p), c.seed, c.i (operation index), c.op (current op name).
   Options for run(n, { stopAt: k }) stop after operation k (to rebuild the exact state of a failure for debugging).

   SHRINKING a failure to the shortest replay. run(n, { perOp: true }) gives every operation a random stream of its own and returns a
   `script` ([{ op, s }, ...]); run(0, { script }) replays exactly those operations, so a script can be cut down and replayed. Fuzzer.shrink
   does the cutting (delta debugging): it keeps removing pieces of the script while the same failure still happens.

     var make = function () { app.reset(); return new Fuzzer(cfgFor(seed)); };          // a NEW fuzzer on a freshly reset app, every time
     var r = await make().run(600, { perOp: true });
     if (r.fails.length) { var s = await Fuzzer.shrink(make, r.script); console.log(s.script.map(function (e) { return e.op; })); }
     // s = { script, finding: { i, op, what, tail }, tries, from }   the same script always replays to the same failure

   Limits: the app must be put back to the same start by make(); a failure that depends on the clock or on operations that were cut away
   may not shrink; liveness and periodic hooks count operations by position, so a very short script may meet them at different moments. */

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function Fuzzer(cfg) {
  if (!(this instanceof Fuzzer)) return new Fuzzer(cfg);
  this.cfg = cfg || {};
  if (!this.cfg.ops || !this.cfg.ops.length) throw new Error('Fuzzer needs at least one operation');
}

Fuzzer.prototype.run = async function (nOps, runOpts) {
  var cfg = this.cfg, seed = cfg.seed === undefined ? 1 : cfg.seed, R = mulberry32(seed), ops = cfg.ops, total = 0, i, j;
  runOpts = runOpts || {};
  var tailLen = cfg.tailLength || 40, maxFails = cfg.maxFails || 5, fails = [], tail = [], visited = {}, winErr = [], opsDone = 0;
  ops.forEach(function (o) { total += o.weight === undefined ? 1 : o.weight; });
  var c = { seed: seed, i: 0, op: '' };
  function bind(G) { c.rand = G; c.int = function (n) { return Math.floor(G() * n); }; c.pick = function (a) { return a[Math.floor(G() * a.length)]; }; c.chance = function (p) { return G() < p; }; }
  bind(R);
  var replay = runOpts.script, perOp = !!(runOpts.perOp || replay), S = mulberry32((seed ^ 0x9E3779B9) | 0), script = [], count = replay ? replay.length : nOps;
  var onErr = null, onRej = null;
  if (cfg.errors !== false && typeof window !== 'undefined' && window.addEventListener) {
    onErr = function (e) { winErr.push('error: ' + e.message); };
    onRej = function (e) { winErr.push('rejection: ' + (e.reason && e.reason.message || e.reason)); };
    window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onRej);
  }
  function choose() { var r = R() * total, k; for (k = 0; k < ops.length; k++) { r -= ops[k].weight === undefined ? 1 : ops[k].weight; if (r < 0) return ops[k]; } return ops[0]; }
  function fail(what, opName) { fails.push({ i: c.i, op: opName, what: what, tail: tail.slice() }); }
  async function recover() { try { if (cfg.afterFail) await cfg.afterFail(c); } catch (e) { } }
  async function liveness() {   // from here, a handful of ordinary inputs must change the signature
    var L = cfg.liveness, before = String(L.signature(c)), k, tries = L.tries || 60;
    for (k = 0; k < tries; k++) { await L.nudge(c, k); if (String(L.signature(c)) !== before) return ''; }
    return 'no progress after ' + tries + ' ordinary inputs; stuck at ' + before;
  }
  try {
    for (i = 0; i < count; i++) {
      c.i = i; var op, sub = 0;
      if (replay) { op = ops.filter(function (o) { return o.name === replay[i].op; })[0]; sub = replay[i].s; if (!op) continue; }
      else { op = choose(); if (perOp) sub = Math.floor(S() * 4294967296); }
      if (perOp) { bind(mulberry32(sub)); script.push({ op: op.name, s: sub }); }
      c.op = op.name;
      tail.push(op.name); if (tail.length > tailLen) tail.shift();
      var pre = cfg.before ? cfg.before(c, op) : null;   // optional: capture something before the op (for example numbers that must only grow)
      var threw = false; try { var p = op.run(c); if (p && p.then) await p; } catch (e) { threw = true; fail('threw ' + String(e && e.stack || e).slice(0, 400), op.name); }
      opsDone++;
      if (cfg.state) { var sv = String(cfg.state(c)); visited[sv] = (visited[sv] || 0) + 1; }
      var bad = [];
      (cfg.invariants || []).forEach(function (inv) { try { var r = inv(c, pre); if (r) { if (Array.isArray(r)) bad = bad.concat(r.filter(Boolean)); else bad.push(String(r)); } } catch (e) { bad.push('invariant threw ' + String(e && e.stack || e).slice(0, 200)); } });
      if (winErr.length) bad.push('window ' + winErr.splice(0).slice(0, 3).join(' | '));
      if (bad.length) fail(bad.join('; '), op.name);
      if (bad.length || threw) { if (fails.length >= maxFails) break; await recover(); }
      if (cfg.liveness && i % (cfg.liveness.every || 25) === (cfg.liveness.every || 25) - 1) {
        var l = ''; try { l = await liveness(); } catch (e) { l = 'liveness threw ' + String(e && e.stack || e).slice(0, 200); }
        if (l) { fail(l, 'liveness'); if (fails.length >= maxFails) break; await recover(); }
      }
      (cfg.every || []).forEach(function (ev) { if (i % ev.n === ev.n - 1) { try { var q = ev.run(c); if (q && q.then) return q; } catch (e) { fail((ev.name || 'periodic') + ' threw ' + String(e && e.stack || e).slice(0, 400), ev.name || 'periodic'); } } });
      if (runOpts.stopAt !== undefined && i >= runOpts.stopAt) break;
      if (runOpts.firstOnly && fails.length) break;
    }
  } finally {
    if (onErr) { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); }
  }
  var out = { seed: seed, ops: opsDone, fails: fails, visited: visited };
  if (perOp) out.script = script;
  return out;
};

/* Fuzzer.shrink(make, script, { maxTries }): the shortest sub-script that still fails the same way. See the notes at the top. */
Fuzzer.shrink = async function (make, script, opts) {
  var maxTries = (opts && opts.maxTries) || 400, tries = 0, from = script.length;
  var sig = function (f) { return f.op + '|' + String(f.what).replace(/[0-9.]+/g, '#').slice(0, 80); };
  var replay = async function (s) { tries++; return make().run(0, { script: s, firstOnly: true }); };
  var base = await replay(script);
  if (!base.fails.length) return { script: script, finding: null, tries: tries, from: from, note: 'the script does not fail when replayed' };
  var key = sig(base.fails[0]);
  script = script.slice(0, base.fails[0].i + 1);   // nothing after the first failure matters
  var still = async function (s) { var r = await replay(s); return r.fails.length > 0 && sig(r.fails[0]) === key; };
  for (var n = 2; script.length >= 2 && tries < maxTries;) {
    var size = Math.ceil(script.length / n), reduced = false;
    for (var k = 0; k < script.length && tries < maxTries; k += size) {
      var cand = script.slice(0, k).concat(script.slice(k + size));
      if (cand.length && await still(cand)) { script = cand; n = Math.max(n - 1, 2); reduced = true; break; }
    }
    if (!reduced) { if (n >= script.length) break; n = Math.min(script.length, n * 2); }
  }
  var last = await replay(script);
  return { script: script, finding: last.fails[0] || null, tries: tries, from: from };
};

/* Small input helpers for DOM pages. They only build and dispatch events; nothing here knows your app. */
var FuzzInput = {
  visible: function (el) { if (!el || el.disabled) return false; for (var e = el; e && e !== document.body; e = e.parentElement) { if (e.hidden || getComputedStyle(e).display === 'none') return false; } return true; },
  clickables: function (selector, skip) {   // visible, enabled controls (default: buttons, checkboxes, radios, selects, ranges); skip(el) can exclude some (file pickers, downloads...)
    return Array.prototype.filter.call(document.querySelectorAll(selector || 'button, input[type=checkbox], input[type=radio], select, input[type=range], a[href]'), function (el) { return FuzzInput.visible(el) && !(skip && skip(el)); });
  },
  pointer: function (target, type, x, y, kind) {   // x, y in CLIENT pixels
    var ev = new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: kind || 'touch', bubbles: true, cancelable: true, isPrimary: true, pointerId: 1 });
    (target || document.elementFromPoint(x, y) || document.body).dispatchEvent(ev); return ev;
  },
  canvasPoint: function (canvas, lx, ly, logicalW, logicalH) { var r = canvas.getBoundingClientRect(); return { x: r.left + lx / logicalW * r.width, y: r.top + ly / logicalH * r.height }; },
  key: function (k, down, repeat) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, repeat: !!repeat, bubbles: true, cancelable: true })); },
  junk: function (c) { return c.pick([0, -1, 1, 2, 9, 10, 99, 1e6, 1e9, 1e15, -5, 0.5, 1e-9, 'x', null, true, [], {}, NaN, Infinity]); }   // values to damage saved data with
};
Fuzzer.mulberry32 = mulberry32; Fuzzer.Input = FuzzInput;

if (typeof module !== 'undefined' && module.exports) module.exports = Fuzzer; else (typeof globalThis !== 'undefined' ? globalThis : this).Fuzzer = Fuzzer;
