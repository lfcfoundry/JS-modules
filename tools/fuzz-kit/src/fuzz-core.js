/* fuzz-core: a seeded, reproducible random-input fuzzer for stateful web pages and games. Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/JNFoo/JS-modules */

/* A fuzzer here is: a list of weighted OPERATIONS (taps, key presses, menu clicks, "load a damaged save"...), a list of INVARIANTS
   (things that must hold after every operation) and an optional LIVENESS check (from anywhere, ordinary input must lead somewhere).
   One seed gives one exact sequence, so a failure is reproduced by running the same seed again; every failure carries the tail of
   operation names that led to it.

     var f = new Fuzzer({
       seed: 7,                                               // a number, or a string (strings are hashed, so 'a' and 'b' give different runs)
       ops: [ { name: 'tap', weight: 5, run: function (c) { app.tap(c.int(360), c.int(640)); } }, ... ],   // c: see Context below
       invariants: [ function (c) { return app.score >= 0 ? '' : 'score is negative'; } ],               // '' / falsy = fine; a string or an array of strings = broken
       liveness: { every: 25, signature: function (c) { return app.state + app.score; }, nudge: function (c) { app.tap(10, 10); app.step(60); }, tries: 60 },
       state: function (c) { return app.state; },            // optional: counted per operation so you can see which parts of the app were visited
       errors: true,                                          // also fail on window 'error' and 'unhandledrejection' events
       every: [ { n: 40, run: function (c) { app.render(); } } ],   // run something every n operations; may be async (it is awaited); a throw or a rejection becomes a finding
       afterFail: function (c) { app.reset(); },              // put the app back in a sane place after a failure so the run can go on (a throw here is a finding too)
       tailLength: 40, maxFails: 5
     });
     f.run(600).then(function (result) { ... });   // { seed, ops, fails: [{ i, op, what, tail }], visited: { state: count } }

   Context c (passed to everything): c.rand() uniform [0,1), c.int(n) 0..n-1, c.pick(array), c.chance(p), c.seed, c.i (operation index), c.op (current op name).
   run(n, { stopAt: k }) stops after operation k (to rebuild the exact state of a failure for debugging).
   run(n, { onOp: function (c) {} }) is called just before every operation (the runners use it to name the operation a hung page was in).

   SHRINKING a failure to the shortest replay. run(n, { record: true }) plays the NORMAL game for that seed (exactly the operations a plain
   run plays) and also returns a `script` ([{ op, s }, ...]); run(0, { script }) replays exactly those operations, so a script can be cut
   down and replayed. Fuzzer.shrink does the cutting (delta debugging): it keeps removing pieces of the script while the same failure still
   happens. A failure found by an ordinary seed can therefore be handed straight to the shrinker.
   (run(n, { perOp: true }) is the older way: it gives every operation a stream of its own, which is a DIFFERENT game from the plain run of
   the same seed, so a plain failure may not appear there. Use `record` unless you want that.)

     var make = function () { app.reset(); return new Fuzzer(cfgFor(seed)); };          // a NEW fuzzer on a freshly reset app, every time
     var r = await make().run(600, { record: true });
     if (r.fails.length) { var s = await Fuzzer.shrink(make, r.script, { maxTries: 400, maxMs: 20000 }); console.log(s.script.map(function (e) { return e.op; })); }
     // s = { script, finding: { i, op, what, tail }, tries, from, stopped? }   the same script always replays to the same failure

   Limits: the app must be put back to the same start by make(); a failure that depends on the clock or on operations that were cut away
   may not shrink; liveness and periodic hooks count operations by position, so a very short script may meet them at different moments.

   House rule note: the syntax is ES5 and it is wrapped as UMD (browser global `Fuzzer` and module.exports) without leaking other globals.
   The one runtime need beyond ES5 is Promise (every browser since 2015, and Node); run() and shrink() return promises. */

(function (root, factory) {
  var F = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = F; else root.Fuzzer = F;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';

  /* ---------- small helpers: sync-or-async steps without async/await ---------- */
  var CONT = {}, STOP = {};
  function isThenable(v) { return !!v && typeof v.then === 'function'; }
  function when(v, fn) { return isThenable(v) ? v.then(fn) : fn(v); }
  // call(): a value or a promise. A sync throw or an async rejection goes to onError, whose return value is used instead. Never rejects.
  function guarded(call, onError) {
    var v;
    try { v = call(); } catch (e) { return onError(e); }
    return isThenable(v) ? v.then(function (x) { return x; }, onError) : v;
  }
  // Runs body() again and again until it returns something other than CONT. body may return a promise. One flat promise, no nesting, so long runs do not pile up memory.
  function drive(body) {
    return new Promise(function (resolve, reject) {
      function pump() {
        for (;;) {
          var r;
          try { r = body(); } catch (e) { reject(e); return; }
          if (isThenable(r)) { r.then(function (x) { if (x === CONT) pump(); else resolve(x); }, reject); return; }
          if (r !== CONT) { resolve(r); return; }
        }
      }
      pump();
    });
  }
  function errText(e, n) { return String(e && e.stack || e).slice(0, n); }

  /* ---------- seeded random numbers ---------- */
  function imulPoly(a, b) { var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff; return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0); }
  var imul = Math.imul || imulPoly;
  // A number keeps its old meaning (integer part, wrapped to 32 bits). Any string, even '5', is hashed (FNV-1a), so different strings give different streams.
  function seedToInt(s) {
    if (typeof s !== 'string') return s | 0;
    var h = 2166136261 | 0, k;
    for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = imul(h, 16777619); }
    return h | 0;
  }
  function mulberry32(seed) {
    var a = seedToInt(seed);
    var g = function () { a = a + 0x6D2B79F5 | 0; var t = imul(a ^ a >>> 15, 1 | a); t = t + imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    g.state = function () { return a; };   // a new mulberry32(g.state()) continues with exactly the numbers g would give next
    return g;
  }

  function weightOf(o) { return o.weight === undefined ? 1 : o.weight; }
  function checkWeights(ops) {
    var total = 0, k, w;
    for (k = 0; k < ops.length; k++) {
      w = weightOf(ops[k]);
      if (typeof w !== 'number' || !isFinite(w) || w < 0) throw new Error('Fuzzer: operation "' + ops[k].name + '" has a bad weight (' + String(w) + '); use a number that is 0 or more');
      total += w;
    }
    if (!(total > 0)) throw new Error('Fuzzer: every operation has weight 0, so nothing could ever run; give at least one operation a weight above 0');
    return total;
  }

  function Fuzzer(cfg) {
    if (!(this instanceof Fuzzer)) return new Fuzzer(cfg);
    this.cfg = cfg || {};
    if (!this.cfg.ops || !this.cfg.ops.length) throw new Error('Fuzzer needs at least one operation');
    checkWeights(this.cfg.ops);
  }

  Fuzzer.prototype.run = function (nOps, runOpts) {
    var self = this;
    return new Promise(function (resolve) { resolve(runImpl(self.cfg, nOps, runOpts || {})); });
  };

  function runImpl(cfg, nOps, runOpts) {
    var seed = cfg.seed === undefined ? 1 : cfg.seed, seedInt = seedToInt(seed), R = mulberry32(seed), ops = cfg.ops, total = checkWeights(ops), i = 0;
    var tailLen = cfg.tailLength || 40, maxFails = cfg.maxFails || 5, fails = [], tail = [], visited = {}, winErr = [], opsDone = 0, skipped = 0;
    var c = { seed: seed, i: 0, op: '' };
    function bind(G) { c.rand = G; c.int = function (n) { return Math.floor(G() * n); }; c.pick = function (a) { return a[Math.floor(G() * a.length)]; }; c.chance = function (p) { return G() < p; }; }
    bind(R);
    var replay = runOpts.script, perOp = !!(runOpts.perOp || replay), record = !!runOpts.record && !perOp;
    var S = mulberry32((seedInt ^ 0x9E3779B9) | 0), script = [], count = replay ? replay.length : nOps;
    var onErr = null, onRej = null, live = cfg.liveness, liveEvery = live && (live.every || 25);
    if (cfg.errors !== false && typeof root.addEventListener === 'function') {
      onErr = function (e) { winErr.push('error: ' + e.message); };
      onRej = function (e) { winErr.push('rejection: ' + (e.reason && e.reason.message || e.reason)); };
      root.addEventListener('error', onErr); root.addEventListener('unhandledrejection', onRej);
    }
    function choose() {
      var r = R() * total, k, last = ops[0];
      for (k = 0; k < ops.length; k++) { var w = weightOf(ops[k]); if (w > 0) last = ops[k]; r -= w; if (r < 0) return ops[k]; }
      return last;   // only reached by rounding; never an operation with weight 0
    }
    function fail(what, opName) { fails.push({ i: c.i, op: opName, what: what, tail: tail.slice() }); }
    function full() { return fails.length >= maxFails; }
    function recover() {
      if (!cfg.afterFail) return null;
      return guarded(function () { return cfg.afterFail(c); }, function (e) { fail('afterFail threw ' + errText(e, 300), 'afterFail'); });
    }
    function liveness() {   // from here, a handful of ordinary inputs must change the signature
      var before = String(live.signature(c)), k = 0, tries = live.tries || 60;
      return drive(function () {
        if (k >= tries) return 'no progress after ' + tries + ' ordinary inputs; stuck at ' + before;
        var kk = k++;
        return when(live.nudge(c, kk), function () { return String(live.signature(c)) !== before ? '' : CONT; });
      });
    }
    function next() {   // end of one operation: decide whether to go on
      if (full()) return STOP;
      if (runOpts.stopAt !== undefined && i >= runOpts.stopAt) return STOP;
      if (runOpts.firstOnly && fails.length) return STOP;
      i++; return CONT;
    }
    function everyHooks() {
      var list = cfg.every || [], k = 0;
      function nextHook() {
        while (k < list.length) {
          var ev = list[k++];
          if (i % ev.n === ev.n - 1) {
            var nm = ev.name || 'periodic', failed = false;
            return when(guarded(function () { return ev.run(c); }, function (e) { failed = true; fail(nm + ' threw ' + errText(e, 400), nm); }), function () {
              if (failed && full()) return STOP;
              return nextHook();
            });
          }
        }
        return next();
      }
      return nextHook();
    }
    function livenessStage() {
      if (live && i % liveEvery === liveEvery - 1) {
        return when(guarded(liveness, function (e) { return 'liveness threw ' + errText(e, 200); }), function (l) {
          if (!l) return everyHooks();
          fail(l, 'liveness');
          if (full()) return STOP;
          return when(recover(), function () { return full() ? STOP : everyHooks(); });
        });
      }
      return everyHooks();
    }
    function iteration() {
      if (i >= count) return STOP;
      c.i = i; var op, sub = 0;
      if (replay) {
        op = ops.filter(function (o) { return o.name === replay[i].op; })[0]; sub = replay[i].s;
        if (!op) { skipped++; i++; return CONT; }
      } else { op = choose(); if (perOp) sub = Math.floor(S() * 4294967296); }
      if (perOp) { bind(mulberry32(sub)); script.push({ op: op.name, s: sub }); }
      else if (record) script.push({ op: op.name, s: R.state() });   // the stream state the operation will start from: replaying it gives the operation the same numbers
      c.op = op.name;
      tail.push(op.name); if (tail.length > tailLen) tail.shift();
      if (runOpts.onOp) { try { runOpts.onOp(c); } catch (e) { } }
      var pre = null;
      if (cfg.before) { try { pre = cfg.before(c, op); } catch (e) { fail('before threw ' + errText(e, 300), op.name); } }   // optional: capture something before the op (for example numbers that must only grow)
      var threw = false;
      return when(guarded(function () { return op.run(c); }, function (e) { threw = true; fail('threw ' + errText(e, 400), op.name); }), function () {
        opsDone++;
        if (cfg.state) { try { var sv = String(cfg.state(c)); visited[sv] = (visited[sv] || 0) + 1; } catch (e) { fail('state threw ' + errText(e, 300), op.name); } }
        var bad = [];
        (cfg.invariants || []).forEach(function (inv) { try { var r = inv(c, pre); if (r) { if (Array.isArray(r)) bad = bad.concat(r.filter(Boolean)); else bad.push(String(r)); } } catch (e) { bad.push('invariant threw ' + errText(e, 200)); } });
        if (winErr.length) bad.push('window ' + winErr.splice(0).slice(0, 3).join(' | '));
        if (bad.length) fail(bad.join('; '), op.name);
        if (bad.length || threw) {
          if (full()) return STOP;
          return when(recover(), function () { return full() ? STOP : livenessStage(); });
        }
        return livenessStage();
      });
    }

    function cleanup() { if (onErr) { root.removeEventListener('error', onErr); root.removeEventListener('unhandledrejection', onRej); onErr = null; } }
    function finish() {
      cleanup();
      var out = { seed: seed, ops: opsDone, fails: fails, visited: visited };
      if (perOp || record) out.script = script;
      if (skipped) out.skipped = skipped;   // a replayed script named operations this fuzzer does not have
      return out;
    }
    return drive(iteration).then(null, function (e) {   // anything unexpected still returns the findings collected so far
      fails.push({ i: c.i, op: 'engine', what: 'run aborted: ' + errText(e, 300), tail: tail.slice() });
    }).then(finish, function (e) { cleanup(); throw e; });
  }

  /* Fuzzer.shrink(make, script, { maxTries, maxMs, pieces, match, matchChars }): the shortest sub-script that still fails the same way. See the notes at the top.
     maxTries (default 400) and maxMs (default none) stop the search early; the result then has `stopped: 'tries' | 'time'` and is shorter but not guaranteed minimal.
     "The same way" = the same operation name AND the same message with digits blanked ('#'), whole message (matchChars: n cuts it to n characters; default no cutoff).
     match(finding) may return your own key instead. Default search tests only the "complements" (the script with one slice removed); pieces: true also
     tests each slice alone first, as the original ddmin does, which can need fewer tries when the failure sits in one stretch. Both end 1-minimal. */
  Fuzzer.shrink = function (make, script, opts) {
    opts = opts || {};
    return new Promise(function (resolve) { resolve(shrinkImpl(make, script, opts)); });
  };
  function shrinkImpl(make, script, opts) {
    var maxTries = opts.maxTries || 400, maxMs = opts.maxMs || 0, tries = 0, from = script.length, t0 = new Date().getTime(), stopped = '';
    var sig = opts.match || function (f) { var m = String(f.what).replace(/[0-9.]+/g, '#').replace(/\s+/g, ' '); if (opts.matchChars) m = m.slice(0, opts.matchChars); return f.op + '|' + m; };
    function over() {
      if (tries >= maxTries) { stopped = 'tries'; return true; }
      if (maxMs && new Date().getTime() - t0 >= maxMs) { stopped = 'time'; return true; }
      return false;
    }
    function replay(s) { tries++; return make().run(0, { script: s, firstOnly: true }); }
    return replay(script).then(function (base) {
      if (!base.fails.length) return { script: script, finding: null, tries: tries, from: from, note: 'the script does not fail when replayed' };
      var key = sig(base.fails[0]);
      script = script.slice(0, base.fails[0].i + 1);   // nothing after the first failure matters
      function still(s) { if (over()) return Promise.resolve(false); return replay(s).then(function (r) { return r.fails.length > 0 && sig(r.fails[0]) === key; }); }
      var n = 2;
      function firstThatFails(cands) {   // index of the first candidate that still fails, or -1
        var k = 0;
        return drive(function () {
          if (k >= cands.length) return -1;
          var kk = k++;
          return still(cands[kk].s).then(function (ok) { return ok ? kk : CONT; });
        });
      }
      return drive(function () {
        if (script.length < 2 || over()) return STOP;
        var size = Math.ceil(script.length / n), cands = [], k;
        if (opts.pieces) for (k = 0; k < script.length; k += size) cands.push({ s: script.slice(k, k + size), sub: true });
        for (k = 0; k < script.length; k += size) { if (opts.pieces && n === 2) break; cands.push({ s: script.slice(0, k).concat(script.slice(k + size)), sub: false }); }
        cands = cands.filter(function (x) { return x.s.length > 0; });
        return firstThatFails(cands).then(function (hit) {
          if (hit >= 0) { script = cands[hit].s; n = cands[hit].sub ? 2 : Math.max(n - 1, 2); return CONT; }
          if (n >= script.length) return STOP;
          n = Math.min(script.length, n * 2); return CONT;
        });
      }).then(function () { return replay(script); }).then(function (last) {
        var out = { script: script, finding: last.fails[0] || null, tries: tries, from: from };
        if (stopped) out.stopped = stopped;
        return out;
      });
    });
  }

  /* ---------- input helpers for DOM pages. They only build and dispatch events; nothing here knows your app. ---------- */
  var DEFAULT_SELECTOR = 'button, input[type=checkbox], input[type=radio], select, input[type=range]';
  var KEYCODES = { Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, Meta: 91, ';': 186, '=': 187, ',': 188, '-': 189, '.': 190, '/': 191, '`': 192, '[': 219, '\\': 220, ']': 221, "'": 222 };
  var PUNCT_CODES = { ' ': 'Space', ';': 'Semicolon', '=': 'Equal', ',': 'Comma', '-': 'Minus', '.': 'Period', '/': 'Slash', '`': 'Backquote', '[': 'BracketLeft', '\\': 'Backslash', ']': 'BracketRight', "'": 'Quote' };
  var SIDE_CODES = { Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft' };
  function keyInfo(k) {   // the `code` and the legacy `keyCode` a US keyboard would report for the `key` value k
    var code = k, kc = KEYCODES[k] || 0, u;
    if (k.length === 1) {
      u = k.toUpperCase();
      if (u >= 'A' && u <= 'Z') { code = 'Key' + u; kc = u.charCodeAt(0); }
      else if (k >= '0' && k <= '9') { code = 'Digit' + k; kc = k.charCodeAt(0); }
      else code = PUNCT_CODES[k] || k;
    } else if (/^F([1-9]|1[0-2])$/.test(k)) kc = 111 + Number(k.slice(1));
    else if (SIDE_CODES[k]) code = SIDE_CODES[k];
    return { code: code, keyCode: kc };
  }
  var synthPointers = {}, captureGuarded = false, captureOrig = null;
  function guardCapture() {   // one-time, reversible: synthetic pointer ids make setPointerCapture throw NotFoundError; for ids we made up, treat it as a no-op
    if (captureGuarded || typeof Element === 'undefined' || !Element.prototype) return;
    captureGuarded = true; captureOrig = {};
    ['setPointerCapture', 'releasePointerCapture'].forEach(function (m) {
      var orig = Element.prototype[m]; if (typeof orig !== 'function') return;
      captureOrig[m] = orig;
      Element.prototype[m] = function (id) { try { return orig.apply(this, arguments); } catch (e) { if (e && e.name === 'NotFoundError' && synthPointers[id]) return undefined; throw e; } };
    });
  }

  var FuzzInput = {
    DEFAULT_SELECTOR: DEFAULT_SELECTOR,
    // Can a person see and use el right now? Not hidden (display, hidden attribute, visibility), not zero-size, not covered by something else
    // at its center. Off-screen elements count as visible (a person could scroll). opts.covering === false skips the covering test.
    visible: function (el, opts) {
      if (!el || el.disabled) return false;
      if (el.isConnected === false) return false;
      var e, cs, r, cx, cy, hit, w = root.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0, h = root.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
      for (e = el; e && e !== document.body && e.nodeType === 1; e = e.parentElement) { if (e.hidden || getComputedStyle(e).display === 'none') return false; }
      cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      if (opts && opts.covering === false) return true;
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h || !document.elementFromPoint) return true;
      hit = document.elementFromPoint(cx, cy);
      if (!hit || hit === el || (el.contains && el.contains(hit))) return true;
      if (hit.tagName === 'LABEL' && hit.control === el) return true;
      var rootNode = el.getRootNode && el.getRootNode();
      if (rootNode && rootNode.host && (hit === rootNode.host || (rootNode.host.contains && rootNode.host.contains(hit)))) return true;   // inside a shadow root: the page sees the host
      return false;
    },
    // Visible, enabled controls (default DEFAULT_SELECTOR: buttons, checkboxes, radios, selects, ranges). Links are NOT included unless asked:
    // pass { links: true } as the third argument (or put a[href] in your own selector). skip(el) can exclude more (file pickers, downloads...).
    clickables: function (selector, skip, opts) {
      var sel = selector || (opts && opts.links ? DEFAULT_SELECTOR + ', a[href]' : DEFAULT_SELECTOR);
      return Array.prototype.filter.call(document.querySelectorAll(sel), function (el) { return FuzzInput.visible(el, opts) && !(skip && skip(el)); });
    },
    // x, y in CLIENT pixels. These are synthetic events: a page that calls setPointerCapture(e.pointerId) would normally get a NotFoundError
    // (no real pointer has that id), which would be a false finding. By default that one error is swallowed for the ids this helper made up
    // (opts.captureGuard === false turns that off; Fuzzer.Input.unguardCapture() puts the browser's own method back). opts.pointerId changes the id (default 1).
    pointer: function (target, type, x, y, kind, opts) {
      opts = opts || {};
      var id = opts.pointerId === undefined ? 1 : opts.pointerId;
      if (opts.captureGuard !== false) { synthPointers[id] = true; guardCapture(); }
      var ev = new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: kind || 'touch', bubbles: true, cancelable: true, isPrimary: true, pointerId: id });
      (target || document.elementFromPoint(x, y) || document.body).dispatchEvent(ev); return ev;
    },
    unguardCapture: function () {
      if (!captureGuarded) return;
      Object.keys(captureOrig).forEach(function (m) { Element.prototype[m] = captureOrig[m]; });
      captureGuarded = false; captureOrig = null; synthPointers = {};
    },
    canvasPoint: function (canvas, lx, ly, logicalW, logicalH) { var r = canvas.getBoundingClientRect(); return { x: r.left + lx / logicalW * r.width, y: r.top + ly / logicalH * r.height }; },
    // A keydown or keyup for the `key` value k ('a', 'Enter', 'ArrowLeft', ' '). Sets key, code, keyCode and which like a real keyboard (US layout), goes to the focused
    // element (document.activeElement, else the body) and bubbles up to document and window. extra may override { code, keyCode, target, shiftKey, ctrlKey, altKey, metaKey }.
    key: function (k, down, repeat, extra) {
      extra = extra || {};
      if (k === 'Space') k = ' ';   // the key value of the space bar is a single space
      var info = keyInfo(String(k)), kc = extra.keyCode === undefined ? info.keyCode : extra.keyCode;
      var target = extra.target || document.activeElement || document.body;
      var ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, code: extra.code || info.code, keyCode: kc, which: kc, repeat: !!repeat, bubbles: true, cancelable: true, composed: true, shiftKey: !!extra.shiftKey, ctrlKey: !!extra.ctrlKey, altKey: !!extra.altKey, metaKey: !!extra.metaKey });
      if (ev.keyCode !== kc) { try { Object.defineProperty(ev, 'keyCode', { get: function () { return kc; } }); } catch (e) { } }   // some engines ignore keyCode in the constructor
      if (ev.which !== kc) { try { Object.defineProperty(ev, 'which', { get: function () { return kc; } }); } catch (e) { } }
      target.dispatchEvent(ev); return ev;
    },
    junk: function (c) { return c.pick([0, -1, 1, 2, 9, 10, 99, 1e6, 1e9, 1e15, -5, 0.5, 1e-9, 'x', null, true, [], {}, NaN, Infinity]); }   // values to damage saved data with
  };

  /* ---------- ready-made invariants ---------- */
  // Text that should never be on screen: NaN, undefined, [object Something]. opts: { skip: ['Infinity War', /undefined behaviour/i], words: ['Infinity', 'null'],
  // root: element (default document.body), text: function () { return string } (to test without a page) }. Words are matched as whole words, case-sensitive.
  function findJunk(text, opts) {
    opts = opts || {};
    var t = String(text), words = ['NaN', 'undefined'].concat(opts.words || []);
    (opts.skip || []).forEach(function (s) {
      if (typeof s === 'string') t = t.split(s).join(' ');
      else if (s && s.source) t = t.replace(new RegExp(s.source, (s.ignoreCase ? 'i' : '') + (s.multiline ? 'm' : '') + 'g'), ' ');
    });
    var parts = words.map(function (w) { return '(?:^|[^A-Za-z0-9_$])' + String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])'; });
    parts.push('\\[object\\b');
    var m = new RegExp(parts.join('|')).exec(t);
    if (!m) return '';
    var at = m.index + (/^[^A-Za-z[]/.test(m[0]) ? 1 : 0);
    return 'visible text shows "' + t.slice(Math.max(0, at - 25), at + 30).replace(/\s+/g, ' ').trim() + '"';
  }
  var Invariants = {
    findJunk: findJunk,
    noJunkText: function (opts) {
      opts = opts || {};
      return function () {
        var el = opts.root || (typeof document !== 'undefined' && document.body);
        if (!opts.text && !el) return '';
        return findJunk(opts.text ? opts.text() : el.innerText, opts);
      };
    }
  };

  /* ---------- real (trusted) input through the runner ---------- */
  // The runners started with --real-input offer a bridge: a real mouse move, click or key press made by the browser driver (page.mouse, page.keyboard), which
  // the page sees as trusted input with real pointer ids. Without the bridge these reject and Real.ops() returns [] so an adapter can always add them.
  var Real = {
    available: function () { return typeof root.__fuzzReal === 'function'; },
    send: function (req) {
      if (!Real.available()) return Promise.reject(new Error('real input is not available: start the runner with --real-input'));
      return root.__fuzzReal(req);
    },
    click: function (x, y) { return Real.send({ t: 'click', x: x, y: y }); },
    move: function (x, y) { return Real.send({ t: 'move', x: x, y: y }); },
    press: function (key) { return Real.send({ t: 'press', key: key }); },
    ops: function (o) {
      o = o || {};
      if (!Real.available()) return [];
      var w = o.weight === undefined ? 1 : o.weight, keys = o.keys || ['Enter', 'Escape', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      return [
        { name: 'real-click', weight: w, run: function (c) { return Real.click(c.int(root.innerWidth || 400), c.int(root.innerHeight || 700)); } },
        { name: 'real-move', weight: w, run: function (c) { return Real.move(c.int(root.innerWidth || 400), c.int(root.innerHeight || 700)); } },
        { name: 'real-key', weight: w, run: function (c) { return Real.press(c.pick(keys)); } }
      ];
    }
  };

  Fuzzer.mulberry32 = mulberry32; Fuzzer.Input = FuzzInput; Fuzzer.Invariants = Invariants; Fuzzer.Real = Real;
  Fuzzer._imulPoly = imulPoly;   // for the checks only
  return Fuzzer;
});
