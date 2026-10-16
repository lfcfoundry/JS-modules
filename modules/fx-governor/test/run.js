/* fx-governor checks: plain Node with a fake requestAnimationFrame. Run: node modules/fx-governor/test/run.js
 * Copyright (c) 2026 LFC Foundry. MIT License */
'use strict';
var assert = require('assert');
var path = require('path');
var G = require(path.join(__dirname, '..', 'fx-governor.js'));
var n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FAIL: ' + name + '\n' + (e && e.stack || e)); process.exit(1); } }

// A fake animation-frame queue we can step by hand.
var q = [], nextId = 1, requests = 0;
global.requestAnimationFrame = function (cb) { requests++; var id = nextId++; q.push({ id: id, cb: cb }); return id; };
global.cancelAnimationFrame = function (id) { q = q.filter(function (x) { return x.id !== id; }); };
function tick(time) { var cur = q; q = []; cur.forEach(function (x) { x.cb(time); }); }
function run(g, from, to, step) { for (var x = from; x < to; x += step) g.frame(x); }
function levelsOf(opts, from, to, step) { var out = []; var o = {}; for (var k in opts) o[k] = opts[k]; o.onChange = function (l) { out.push(l); }; var g = G.create(o); run(g, from, to, step); return out; }

// The four original behaviors (same as tests/run.js)
t('slow device steps down to lite and no further by default', function () { assert.deepStrictEqual(levelsOf({}, 1000, 12000, 50), ['lite']); });
t('fast device stays put', function () { assert.deepStrictEqual(levelsOf({}, 1000, 12000, 16), []); });
t('pauses do not count as slowness', function () {
  var out = [], g = G.create({ onChange: function (l) { out.push(l); } }), x = 1000;
  for (var i = 0; i < 160; i++) { g.frame(x); x += (i % 40 === 39) ? 600 : 50; }
  assert.deepStrictEqual(out, []);
});
t('a chosen level stops adjusting', function () {
  var out = [], g = G.create({ onChange: function (l) { out.push(l); } }); g.choose('full'); run(g, 1000, 12000, 50); assert.deepStrictEqual(out, []);
});

// maxAuto and explicit zeros
t('maxAuto: last level is reachable when asked for; default keeps it for the player', function () {
  assert.deepStrictEqual(levelsOf({ maxAuto: 2 }, 1000, 20000, 50), ['lite', 'calm']);
  assert.deepStrictEqual(levelsOf({}, 1000, 20000, 50), ['lite']);
  assert.deepStrictEqual(levelsOf({ levels: ['a', 'b'] }, 1000, 20000, 50), []);                 // two levels: default never moves (documented)
  assert.deepStrictEqual(levelsOf({ levels: ['a', 'b'], maxAuto: 1 }, 1000, 20000, 50), ['b']);
});
t('explicit minFps 0 means never slow; explicit strikes 0 acts like 1', function () {
  assert.deepStrictEqual(levelsOf({ minFps: 0 }, 1000, 20000, 50), []);
  var one = levelsOf({ strikes: 1 }, 1000, 5000, 50), zero = levelsOf({ strikes: 0 }, 1000, 5000, 50);
  assert.deepStrictEqual(one, ['lite']); assert.deepStrictEqual(zero, one);
  assert.deepStrictEqual(levelsOf({ strikes: 2 }, 1000, 5000, 50), []);   // default 2 strikes needs more time
  assert.strictEqual(G.create({ minFps: 0 }).minFps, 0);
});

// expectedPeriod
t('expectedPeriod: a 30 Hz screen is not blamed, a real struggle still is', function () {
  assert.deepStrictEqual(levelsOf({}, 1000, 12000, 33.3), ['lite']);                       // old behavior: 30 fps reads as slow
  assert.deepStrictEqual(levelsOf({ expectedPeriod: 33.3 }, 1000, 12000, 33.3), []);       // line is about 18 fps
  assert.deepStrictEqual(levelsOf({ expectedPeriod: 33.3 }, 1000, 12000, 100), ['lite']);  // 10 fps on a 30 Hz screen
  assert.deepStrictEqual(levelsOf({ expectedPeriod: 16.67 }, 1000, 12000, 33.3), ['lite']);  // 30 fps on a 60 Hz screen is a real struggle
});
t('expectedPeriod sets the line to 60 percent; minFps wins when both are given; bad values are ignored', function () {
  assert.ok(Math.abs(G.create({ expectedPeriod: 1000 / 60 }).minFps - 36) < 1e-9);
  assert.ok(Math.abs(G.create({ expectedPeriod: 1000 / 30 }).minFps - 18) < 1e-9);
  assert.strictEqual(G.create({ expectedPeriod: 33, minFps: 50 }).minFps, 50);
  assert.strictEqual(G.create({ expectedPeriod: -5 }).minFps, 36); assert.strictEqual(G.create({ expectedPeriod: 'x' }).minFps, 36);
  assert.strictEqual(G.create().minFps, 36);
});

// warm-up and ready
t('startAfterMs: a slow loading phase is not counted', function () {
  var slowLoad = function (opts) {
    var out = [], o = { onChange: function (l) { out.push(l); } }; for (var k in opts) o[k] = opts[k];
    var g = G.create(o); run(g, 1000, 9000, 50);     // 8 s of 20 fps while loading
    run(g, 9000, 20000, 16);                          // then smooth 60 fps
    return out;
  };
  assert.deepStrictEqual(slowLoad({}), ['lite']);                   // without warm-up, loading looks like a slow device
  assert.deepStrictEqual(slowLoad({ startAfterMs: 8000 }), []);
});
t('waitForReady and ready()', function () {
  var out = [], g = G.create({ waitForReady: true, onChange: function (l) { out.push(l); } });
  run(g, 1000, 20000, 50); assert.deepStrictEqual(out, []);         // not counting yet
  g.ready(); run(g, 20000, 32000, 50); assert.deepStrictEqual(out, ['lite']);
  // ready() also works with startAfterMs: the warm-up starts at the first frame after ready()
  out = []; g = G.create({ waitForReady: true, startAfterMs: 6000, onChange: function (l) { out.push(l); } });
  g.ready(); run(g, 1000, 7000, 50); assert.deepStrictEqual(out, []);
  run(g, 7000, 20000, 50); assert.deepStrictEqual(out, ['lite']);
});

// callbacks never end adaptation
t('a throwing onSample/onChange does not stop adaptation or the loop', function () {
  var seen = 0, g = G.create({ levels: ['a', 'b', 'c'], maxAuto: 2, onSample: function () { throw new Error('s'); }, onChange: function () { seen++; throw new Error('c'); } });
  run(g, 1000, 20000, 50); assert.strictEqual(g.level, 'c'); assert.strictEqual(seen, 2);
  q = []; var g2 = G.create({ onSample: function () { throw new Error('s'); } }); g2.start();
  for (var i = 0; i < 5; i++) tick(1000 + i * 50);
  assert.strictEqual(q.length, 1, 'loop still asked for the next frame'); g2.stop();
});

// the loop rests
t('the loop stops itself when the player chooses or the limit is reached, and wakes on release()', function () {
  q = []; var g = G.create({ onChange: function () {} }); g.start();
  assert.strictEqual(q.length, 1); tick(1000); assert.strictEqual(q.length, 1);
  g.choose('full'); assert.strictEqual(q.length, 0, 'choose cancels the pending frame'); assert.strictEqual(g.resting, true);
  var before = requests; g.start(); assert.strictEqual(q.length, 0); assert.strictEqual(requests, before);   // already running, nothing to decide
  g.release(); assert.strictEqual(q.length, 1, 'release restarts the loop'); assert.strictEqual(g.resting, false);
  // reaching the limit
  g.stop(); q = []; var g3 = G.create({ onChange: function () {} }); g3.start();
  var x = 1000; for (var i = 0; i < 400 && q.length; i++) { tick(x); x += 50; }
  assert.strictEqual(g3.level, 'lite'); assert.strictEqual(q.length, 0, 'loop rested at the limit'); assert.strictEqual(g3.resting, true);
  var r2 = requests; for (i = 0; i < 20; i++) tick(x += 50); assert.strictEqual(requests, r2, 'no wake-ups while resting');
  g3.release(); assert.strictEqual(q.length, 0, 'at the limit release has nothing to decide, so it stays asleep');
});
t('stop() ends the loop and start() after stop() works; no requestAnimationFrame does not throw', function () {
  q = []; var g = G.create(); g.start(); g.stop(); assert.strictEqual(q.length, 0); g.start(); assert.strictEqual(q.length, 1); g.stop();
  var raf = global.requestAnimationFrame; delete global.requestAnimationFrame;
  try { var g4 = G.create(); g4.start(); g4.stop(); } finally { global.requestAnimationFrame = raf; }
});

console.log('fx-governor: ' + n + ' checks passed');
