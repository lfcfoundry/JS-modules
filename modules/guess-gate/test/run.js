/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for guess-gate (Node, no page needed): a made-up clock stands in for time. */
'use strict';
var assert = require('assert'), G = require('../guess-gate.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }
function clock() { var c = { t: 1000, now: function () { return c.t; }, tick: function (ms) { c.t += ms; } }; return c; }
t('version and api', function () { assert.strictEqual(G.version, '1.0.1'); assert.strictEqual(G.api, 1); });
t('nothing is allowed before start, before minMs, or after finish', function () {
  var c = clock(), g = G.create({ now: c.now, minMs: 40 });
  assert.strictEqual(g.allowed(), false); assert.strictEqual(g.run(function () { throw new Error('no'); }), false);
  g.start(); c.tick(39); assert.strictEqual(g.allowed(), false); assert.strictEqual(g.nextIn(), 1); c.tick(1); assert.strictEqual(g.allowed(), true);
  g.finish(); assert.strictEqual(g.allowed(), false); assert.strictEqual(g.nextIn(), Infinity);
});
t('guesses never use more than share of the time so far (plus the guess in progress), over many schedules', function () {
  [[0.1, 30, 5], [0.1, 3, 1], [0.25, 60, 10], [0.05, 20, 2], [1, 10, 10], [0.1, 200, 50]].forEach(function (p) {
    var share = p[0], cost = p[1], piece = p[2], c = clock(), g = G.create({ now: c.now, share: share, minMs: 40 }).start(), ran = 0;
    for (var e = 0; e < 3000; e += piece) { c.tick(piece); if (g.run(function () { c.tick(cost); })) ran++; var s = g.stats(); assert.ok(s.spent <= share * s.elapsed + cost + 1e-9, 'spent ' + s.spent + ' of ' + s.elapsed + ' at share ' + share); }
    var f = g.finish(); assert.strictEqual(f.guesses, ran); assert.ok(f.guesses >= 1, 'at least one guess');
    assert.ok(f.spent / f.elapsed <= share + cost / f.elapsed + 1e-9);
  });
});
t('a skipped guess is counted, nextIn says when the next one may run, and it is then allowed', function () {
  var c = clock(), g = G.create({ now: c.now, share: 0.1, minMs: 0 }).start();
  assert.strictEqual(g.run(function () { c.tick(50); }), true); assert.strictEqual(g.run(function () { assert.fail('ran'); }), false);
  var w = g.nextIn(); assert.ok(Math.abs(w - 950) < 1e-9, 'wait ' + w);   // 50 spent and the next one expected to cost 50: (50 + 50) / 0.1 = 1000 ms in, 50 gone
  assert.ok(Math.abs(g.nextIn(0) - 450) < 1e-9, 'with a free guess: 50 / 0.1 = 500 ms in');
  c.tick(w - 1); assert.strictEqual(g.allowed(), false); c.tick(1); assert.strictEqual(g.allowed(), true); assert.strictEqual(g.allowed(1000), false);
  assert.strictEqual(g.stats().skipped, 1);
});
t('a throwing guess still counts its time and rethrows', function () {
  var c = clock(), g = G.create({ now: c.now, share: 0.1, minMs: 0 }).start();
  assert.throws(function () { g.run(function () { c.tick(20); throw new Error('boom'); }); }, /boom/);
  var s = g.stats(); assert.strictEqual(s.spent, 20); assert.strictEqual(s.guesses, 1);
});
t('bad options are refused', function () {
  assert.throws(function () { G.create({ share: 0 }); }, /share/); assert.throws(function () { G.create({ share: 1.5 }); }, /share/); assert.throws(function () { G.create({ minMs: -1 }); }, /minMs/);
  assert.throws(function () { G.create().start().run(5); }, /needs a function/);
});
t('start again resets the counts; the default clock works', function () {
  var g = G.create({ minMs: 0 }).start(); assert.strictEqual(g.run(function () {}), true); g.start(); assert.strictEqual(g.stats().guesses, 0);
});
console.log(fail ? 'guess-gate: ' + fail + ' FAILED' : 'guess-gate: all ' + pass + ' checks passed'); process.exit(fail ? 1 : 0);
