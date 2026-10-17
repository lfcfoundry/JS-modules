/* env-probes checks: plain Node, fake window/document/navigator/performance/localStorage. Run: node modules/env-probes/test/run.js
 * Copyright (c) 2026 LFC Foundry. MIT License */
'use strict';
var assert = require('assert');
var path = require('path');
var P = require(path.join(__dirname, '..', 'env-probes.js'));
var n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack || e)); process.exit(1); } }

// A fake clock: every read advances by `tick` ms and the result is floored to `res` ms (res 0 = no rounding).
function clock(res, tick) {
  var now = 1000.123;
  return { now: function () { now += tick; return res ? Math.floor(now / res) * res : now; } };
}
function fakeCanvas(opts) {
  opts = opts || {};
  var calls = { created: 0 };
  var doc = { createElement: function () {
    calls.created++;
    var w = 0, buf = null;
    var cv = { width: 0, height: 0, getContext: function () {
      if (opts.noContext) return null;
      buf = new Uint8ClampedArray(cv.width * cv.height * 4);
      return {
        fillStyle: '',
        createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        putImageData: function (img) { buf.set(img.data); },
        getImageData: function () {
          if (opts.throws) throw new Error('blocked');
          var d = new Uint8ClampedArray(buf);
          if (opts.blank) d.fill(0);
          if (opts.white) d.fill(255);
          if (opts.noise) opts.noise(d, cv.width);
          return { data: d };
        }
      };
    } };
    return cv;
  } };
  return { doc: doc, calls: calls };
}
function fakeStorage(mode) {
  var m = {};
  return {
    get length() { return Object.keys(m).length; },
    setItem: function (k, v) { if (mode === 'throw') { var e = new Error('denied'); e.name = 'SecurityError'; throw e; } if (mode === 'full') { var q = new Error('quota'); q.name = 'QuotaExceededError'; q.code = 22; throw q; } m[k] = String(v); },
    getItem: function (k) { return mode === 'lost' ? null : (k in m ? m[k] : null); },
    removeItem: function (k) { delete m[k]; },
    _put: function (k, v) { m[k] = v; }
  };
}
function mm(initial) {
  var listeners = [], list = { adds: 0, removes: 0 };
  var q = { matches: initial, addEventListener: function (e, h) { listeners.push(h); list.adds++; }, removeEventListener: function (e, h) { var i = listeners.indexOf(h); if (i >= 0) listeners.splice(i, 1); list.removes++; } };
  return { q: q, fire: function (v) { q.matches = v; listeners.slice().forEach(function (h) { h(); }); }, count: function () { return listeners.length; }, stats: list };
}
function reset(env) { P._env(env); }

// --- clock ---
t('precise clock is not rounded, step is tiny', function () {
  reset({ performance: clock(0.1, 0.01) });
  assert.strictEqual(P.timerRounded(), false);
  assert.ok(P.timerStepMs() > 0 && P.timerStepMs() < 1);
});
t('1 ms clock (stock Firefox/Safari) is not rounded', function () {
  reset({ performance: clock(1, 0.01) });
  assert.strictEqual(P.timerRounded(), false); assert.ok(Math.abs(P.timerStepMs() - 1) < 1e-6);
});
t('16.67 ms clock (Firefox privacy mode) is rounded', function () {
  reset({ performance: clock(1000 / 60, 0.002) });
  assert.strictEqual(P.timerRounded(), true);
  assert.ok(P.timerStepMs() === 0 || P.timerStepMs() > 8);
});
t('100 ms clock (Tor-style) is rounded, even when the loop sees no step', function () {
  reset({ performance: clock(100, 0.0001) });
  assert.strictEqual(P.timerRounded(), true);
});
t('a clock stuck at one value is rounded; a missing clock is rounded and does not throw', function () {
  reset({ performance: { now: function () { return 5; } } }); assert.strictEqual(P.timerRounded(), true); assert.strictEqual(P.timerStepMs(), 0);
  reset({ performance: { now: function () { throw new Error('x'); } } }); assert.strictEqual(P.timerRounded(), true);
});
t('clock loop is bounded and never waits on Date.now', function () {
  var reads = 0, realNow = Date.now, dateCalls = 0;
  Date.now = function () { dateCalls++; return realNow(); };
  try { reset({ performance: { now: function () { reads++; return 7; } } }); P.timerRounded(); } finally { Date.now = realNow; }
  assert.ok(reads <= 30002, 'reads ' + reads); assert.strictEqual(dateCalls, 0);
});
t('old 100 ms-only test misses 16.67 ms; new one catches it (legacy logic kept here for the comparison)', function () {
  var perf = clock(1000 / 60, 0.002);
  var a = perf.now(), b = perf.now();
  var legacy = a % 100 === 0 && b % 100 === 0;   // the old rule
  assert.strictEqual(legacy, false);
  reset({ performance: clock(1000 / 60, 0.002) });
  assert.strictEqual(P.timerRounded(), true);
});

// --- canvas ---
t('canvas: exact read-back is ok', function () {
  var c = fakeCanvas(); reset({ performance: clock(0.1, 0.01), document: c.doc });
  assert.strictEqual(P.canvasReadback(), 'ok'); assert.strictEqual(P.canvasReadbackOk(), true);
});
t('canvas: one changed pixel anywhere is noisy (old code sampled only 16 of 64 and missed these)', function () {
  // pixel (x=9,y=3) is a drawn pixel in the middle rows, which the old probe never looked at
  var c = fakeCanvas({ noise: function (d, w) { d[(3 * w + 9) * 4 + 1] ^= 1; } });
  reset({ performance: clock(0.1, 0.01), document: c.doc });
  assert.strictEqual(P.canvasReadback(), 'noisy'); assert.strictEqual(P.canvasReadbackOk(), false);
  // the old rule on an 8x8 patch with the same kind of change in row 2: it looked at row 0 and row 7 only
  var d = new Uint8ClampedArray(8 * 8 * 4), i, legacyOk = true;
  for (i = 0; i < 8; i++) { d[i * 4] = i * 30 + 5; d[i * 4 + 1] = 255 - i * 20; d[i * 4 + 2] = i * 7 + 40; d[i * 4 + 3] = 255; }
  d[(2 * 8 + 3) * 4 + 1] = 77;   // noise in row 2
  for (i = 0; i < 8 && legacyOk; i++) { var o = i * 4, q = (7 * 8 + i) * 4; if (d[o] !== i * 30 + 5 || d[o + 1] !== 255 - i * 20 || d[o + 2] !== i * 7 + 40 || d[o + 3] !== 255 || d[q + 3] !== 0 || d[q] !== 0) legacyOk = false; }
  assert.strictEqual(legacyOk, true, 'the old sampled rule cannot see this');
});
t('canvas: noise on undrawn pixels is noisy', function () {
  var c = fakeCanvas({ noise: function (d, w) { d[(12 * w + 4) * 4 + 3] = 1; } });
  reset({ performance: clock(0.1, 0.01), document: c.doc }); assert.strictEqual(P.canvasReadback(), 'noisy');
});
t('canvas: blank, uniform, throwing, missing context and missing document are blocked', function () {
  [{ blank: true }, { white: true }, { throws: true }, { noContext: true }].forEach(function (o) {
    var c = fakeCanvas(o); reset({ performance: clock(0.1, 0.01), document: c.doc });
    assert.strictEqual(P.canvasReadback(), 'blocked', JSON.stringify(o)); assert.strictEqual(P.canvasReadbackOk(), false);
  });
  reset({ performance: clock(0.1, 0.01) }); assert.strictEqual(P.canvasReadback(), 'blocked');
});
t('canvas prompt guard: with a rounded clock the canvas is never created', function () {
  [clock(1000 / 60, 0.002), clock(100, 0.0001)].forEach(function (pf) {
    var c = fakeCanvas(); reset({ performance: pf, document: c.doc });
    assert.strictEqual(P.canvasReadbackOk(), false); assert.strictEqual(P.canvasReadback(), 'blocked');
    assert.strictEqual(c.calls.created, 0); assert.strictEqual(P.report().canvasSkipped, true);
  });
});

// --- storage ---
t('storage: ok, blocked, lost write', function () {
  reset({ localStorage: fakeStorage() }); assert.strictEqual(P.storageState(), 'ok'); assert.strictEqual(P.storageWorks(), true);
  reset({ localStorage: fakeStorage('throw') }); assert.strictEqual(P.storageState(), 'blocked'); assert.strictEqual(P.storageWorks(), false);
  reset({ localStorage: fakeStorage('lost') }); assert.strictEqual(P.storageState(), 'blocked');
  reset({}); assert.strictEqual(P.storageState(), 'blocked');
});
t('storage: quota error with data stored is full, with nothing stored is blocked; boolean stays false', function () {
  var s = fakeStorage('full'); s._put('save', 'x'); reset({ localStorage: s });
  assert.strictEqual(P.storageState(), 'full'); assert.strictEqual(P.storageWorks(), false);
  reset({ localStorage: fakeStorage('full') }); assert.strictEqual(P.storageState(), 'blocked');
});

// --- media queries ---
t('reducedMotion: no duplicate listeners, unsubscribe works, bad callbacks do not break others', function () {
  var m = mm(false);
  reset({ window: { matchMedia: function () { return m.q; } } });
  assert.strictEqual(P.reducedMotion(), false);
  var got = [], f = function (v) { got.push(v); };
  var un1 = P.reducedMotion(f), un2 = P.reducedMotion(f);
  assert.strictEqual(typeof un1, 'function'); assert.strictEqual(un1.matches, false);
  assert.strictEqual(m.count(), 1); assert.strictEqual(m.stats.adds, 1);
  var other = []; P.reducedMotion(function () { throw new Error('boom'); }); P.reducedMotion(function (v) { other.push(v); });
  m.fire(true); assert.deepStrictEqual(got, [true]); assert.deepStrictEqual(other, [true]);
  un1(); m.fire(false); assert.deepStrictEqual(got, [true]);
  assert.strictEqual(m.count(), 1);   // the other callbacks still hold the shared listener
  P._reset(); assert.strictEqual(m.count(), 0);
  var u = P.reducedMotion(f); assert.strictEqual(m.count(), 1); u(); assert.strictEqual(m.count(), 0); u();
  un2();
});
t('pointer and contrast questions', function () {
  var on = {};
  reset({ window: { matchMedia: function (q) { return { matches: !!on[q] }; } } });
  assert.strictEqual(P.coarsePointer(), false); assert.strictEqual(P.anyCoarsePointer(), false); assert.strictEqual(P.contrastPreference(), 'none');
  on['(any-pointer: coarse)'] = true; assert.strictEqual(P.anyCoarsePointer(), true); assert.strictEqual(P.coarsePointer(), false);
  on['(prefers-contrast: more)'] = true; assert.strictEqual(P.contrastPreference(), 'more');
  on['(prefers-contrast: more)'] = false; on['(prefers-contrast: less)'] = true; assert.strictEqual(P.contrastPreference(), 'less');
  on['(prefers-contrast: less)'] = false; on['(prefers-contrast: custom)'] = true; assert.strictEqual(P.contrastPreference(), 'custom');
});

// --- no throw outside a page; explain ---
t('report and explain never throw in Node (no page) and keep old fields', function () {
  P._env(); var r = P.report();
  ['timerRounded', 'canvasReadbackOk', 'storageWorks', 'reducedMotion', 'coarsePointer', 'dpr', 'ua'].forEach(function (k) { assert.ok(k in r, k); });
  assert.strictEqual(r.canvasReadbackOk, false); assert.strictEqual(r.inPage, false); assert.strictEqual(r.dpr, 1);
  var e = P.explain(); assert.ok(Array.isArray(e) && e.length > 3); e.forEach(function (s) { assert.strictEqual(typeof s, 'string'); });
  assert.strictEqual(P.reducedMotion(), false); assert.strictEqual(typeof P.reducedMotion(function () {}), 'function');
});
t('report and explain survive hostile fakes', function () {
  var boom = function () { throw new Error('x'); };
  reset({ window: { matchMedia: boom, get devicePixelRatio() { throw new Error('y'); } }, document: { createElement: boom }, navigator: { get userAgent() { throw new Error('z'); } }, performance: { now: boom }, localStorage: { setItem: boom, getItem: boom, removeItem: boom, length: 0 } });
  var r; try { r = P.report(); } catch (e) { r = null; }
  assert.ok(r, 'report threw'); assert.ok(Array.isArray(P.explain()));
});
t('explain says it in plain words for a rounded clock, noisy canvas and full storage', function () {
  var s = fakeStorage('full'); s._put('a', 'b');
  var c = fakeCanvas({ noise: function (d) { d[0] ^= 1; } });
  reset({ performance: clock(0.1, 0.01), document: c.doc, localStorage: s, window: { matchMedia: function () { return { matches: false }; } } });
  var txt = P.explain().join(' ');
  assert.ok(/noise to canvas/.test(txt)); assert.ok(/Storage is full/.test(txt)); assert.ok(/precise enough/.test(txt));
  reset({ performance: clock(1000 / 60, 0.002) });
  txt = P.explain().join(' '); assert.ok(/rounds its clock/.test(txt) && /frame meters should be switched off/.test(txt)); assert.ok(/not tried/.test(txt));
});

// --- 1.1.0 additions ---
t('clock: three steps are enough (fine clock stops early, rounded clock still rounded)', function () {
  var reads = 0, now = 0;
  reset({ performance: { now: function () { reads++; now += 0.01; return Math.floor(now / 0.5) * 0.5; } } });
  assert.strictEqual(P.timerRounded(), false); assert.ok(Math.abs(P.timerStepMs() - 0.5) < 1e-9);
  assert.ok(reads < 200, 'reads ' + reads);   // 3 steps of 0.5 ms at 0.01 ms per read is about 150 reads; 8 steps would need about 400
  reset({ performance: clock(1000 / 60, 0.002) }); assert.strictEqual(P.timerRounded(), true);
});
t('canvas: patch goes in with one putImageData and no per-pixel fills', function () {
  var c = fakeCanvas(), puts = 0, ctxOf;
  var orig = c.doc.createElement;
  c.doc.createElement = function () { var cv = orig(); var gc = cv.getContext; cv.getContext = function () { var g = gc.apply(cv, arguments); if (g) { var pi = g.putImageData; g.putImageData = function () { puts++; return pi.apply(g, arguments); }; g.fillRect = function () { throw new Error('per-pixel fill used'); }; } return g; }; return cv; };
  reset({ performance: clock(0.1, 0.01), document: c.doc });
  assert.strictEqual(P.canvasReadback(), 'ok'); assert.strictEqual(puts, 1);
});
t('canvas: a context without putImageData is blocked, not a crash', function () {
  var c = fakeCanvas(), orig = c.doc.createElement;
  c.doc.createElement = function () { var cv = orig(), gc = cv.getContext; cv.getContext = function () { var g = gc.apply(cv, arguments); delete g.putImageData; return g; }; return cv; };
  reset({ performance: clock(0.1, 0.01), document: c.doc }); assert.strictEqual(P.canvasReadback(), 'blocked');
});
t('canvasNoise: null when not read, zeros when exact, size and share when noisy', function () {
  reset({ performance: clock(1000 / 60, 0.002) }); assert.strictEqual(P.canvasNoise(), null);
  var c = fakeCanvas(); reset({ performance: clock(0.1, 0.01), document: c.doc });
  assert.deepStrictEqual(P.canvasNoise(), { maxDelta: 0, share: 0 });
  c = fakeCanvas({ noise: function (d, w) { d[(3 * w + 9) * 4 + 1] ^= 1; } });   // one pixel, one level
  reset({ performance: clock(0.1, 0.01), document: c.doc });
  assert.strictEqual(P.canvasReadback(), 'noisy'); var nz = P.canvasNoise();
  assert.strictEqual(nz.maxDelta, 1); assert.strictEqual(nz.share, 0.004);
  c = fakeCanvas({ noise: function (d) { for (var i = 0; i < d.length; i += 4) d[i] ^= 64; } });   // every pixel, big
  reset({ performance: clock(0.1, 0.01), document: c.doc }); P.canvasReadback(); nz = P.canvasNoise();
  assert.strictEqual(nz.maxDelta, 64); assert.strictEqual(nz.share, 1);   // every pixel changed, drawn or not
  c = fakeCanvas({ blank: true }); reset({ performance: clock(0.1, 0.01), document: c.doc }); assert.strictEqual(P.canvasNoise(), null);
  var r = P.report(); assert.ok('canvasNoise' in r);
});
t('canvas noise sentence says tiny or large', function () {
  var c = fakeCanvas({ noise: function (d, w) { d[(3 * w + 9) * 4 + 1] ^= 1; } });
  reset({ performance: clock(0.1, 0.01), document: c.doc }); assert.ok(/tiny, up to 1 levels/.test(P.explain().join(' ')));
  c = fakeCanvas({ noise: function (d) { d[0] = 105; } });
  reset({ performance: clock(0.1, 0.01), document: c.doc }); assert.ok(/large, up to 100 levels/.test(P.explain().join(' ')));
});
t('framed: none, same-origin, cross-origin, and a throwing window', function () {
  var me = {}, top = { location: { href: 'https://example.test/' } };
  reset({ window: { self: me, top: me } }); assert.strictEqual(P.framed(), 'none');
  reset({ window: { self: me, top: top } }); assert.strictEqual(P.framed(), 'same-origin');
  var wall = { get location() { throw new Error('SecurityError'); } };
  reset({ window: { self: me, top: wall } }); assert.strictEqual(P.framed(), 'cross-origin');
  reset({ window: { get top() { throw new Error('x'); }, self: me } }); assert.strictEqual(P.framed(), 'cross-origin');
  reset({}); assert.strictEqual(P.framed(), 'none');
});
t('explain: blocked storage inside a frame says so, outside a frame keeps the old words', function () {
  var me = {}, wall = { get location() { throw new Error('SecurityError'); } };
  var mq = function () { return { matches: false }; };
  reset({ localStorage: fakeStorage('throw'), window: { self: me, top: wall, matchMedia: mq } });
  var txt = P.explain().join(' '); assert.ok(/inside another page/.test(txt)); assert.ok(!/private window/.test(txt));
  reset({ localStorage: fakeStorage('throw'), window: { self: me, top: me, matchMedia: mq } });
  assert.ok(/private window/.test(P.explain().join(' ')));
});
t('transparency and hover questions', function () {
  var on = {};
  reset({ window: { matchMedia: function (q) { return { matches: !!on[q] }; } } });
  assert.strictEqual(P.prefersReducedTransparency(), false); assert.strictEqual(P.hover(), false); assert.strictEqual(P.anyHover(), false);
  on['(prefers-reduced-transparency: reduce)'] = true; on['(hover: hover)'] = true; on['(any-hover: hover)'] = true;
  assert.strictEqual(P.prefersReducedTransparency(), true); assert.strictEqual(P.hover(), true); assert.strictEqual(P.anyHover(), true);
});
t('explain: mentions solid backgrounds for reduced transparency and no-hover devices, only inside a page', function () {
  var on = { '(prefers-reduced-transparency: reduce)': true };
  reset({ document: {}, window: { matchMedia: function (q) { return { matches: !!on[q] }; } } });
  var txt = P.explain().join(' '); assert.ok(/solid backgrounds/.test(txt)); assert.ok(/hover tooltip/.test(txt));
  P._env(); assert.ok(!/hover tooltip/.test(P.explain().join(' ')));
});
t('capabilities: all false with nothing, true for each fake feature, never throws', function () {
  P._env(); var c = P.capabilities();
  ['webLocks', 'wakeLock', 'closeWatcher', 'gamepad', 'compressionStream', 'idleCallback', 'webAnimations', 'viewTransitions'].forEach(function (k) { assert.strictEqual(c[k], false, k); });
  var f = function () {};
  reset({ navigator: { locks: { request: f }, wakeLock: { request: f }, getGamepads: f }, window: { CloseWatcher: f, CompressionStream: f, requestIdleCallback: f, Element: { prototype: { animate: f } } }, document: { startViewTransition: f } });
  c = P.capabilities(); Object.keys(c).forEach(function (k) { assert.strictEqual(c[k], true, k); }); assert.strictEqual(Object.keys(c).length, 8);
  reset({ navigator: { get locks() { throw new Error('x'); } }, window: { get CloseWatcher() { throw new Error('y'); } } });
  c = P.capabilities(); assert.strictEqual(c.webLocks, false); assert.strictEqual(c.closeWatcher, false);
  assert.ok(P.report().capabilities);
});

P._env();
console.log('env-probes: ' + n + ' checks passed');
