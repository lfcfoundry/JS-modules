/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for speed-lab's numbers and answer (Node). The runner and panel are checked in a real browser by tests/pieces-browser.js. */
'use strict';
var assert = require('assert'), S = require('../speed-lab.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }
function rep(v, n) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
t('a steady 60 fps run: 60 fps, nothing lost, no stutters', function () {
  var s = S.stat(rep(1000 / 60, 300)); assert.ok(Math.abs(s.fps - 60) < 1e-9); assert.strictEqual(s.lost, 0); assert.strictEqual(s.late, 0); assert.strictEqual(s.big, 0); assert.ok(Math.abs(s.med - 1000 / 60) < 1e-9); assert.strictEqual(s.n, 300);
});
t('late frames and big stutters are counted and the lost time is measured against the usual frame', function () {
  var d = rep(16, 90).concat(rep(40, 8), [120, 200]); var s = S.stat(d);
  assert.strictEqual(s.late, 10); assert.strictEqual(s.big, 2, 'only the 120 and 200 ms frames are over 50 ms and 3 times the usual'); assert.strictEqual(s.worst, 200);
  var sum = d.reduce(function (a, b) { return a + b; }, 0); assert.ok(Math.abs(s.lost - 100 * (8 * 24 + 104 + 184) / sum) < 1e-9); assert.strictEqual(s.slow, (200 + 120 + 40 + 40 + 40) / 5, 'the slowest 5% of 100 frames is 5 frames');
});
t('too few frames gives zeros, not a crash', function () { var s = S.stat([16, 16], { n: 2, ms: 300 }); assert.strictEqual(s.fps, 0); assert.strictEqual(s.n, 2); assert.strictEqual(s.loaf, 2); assert.strictEqual(S.stat(null).n, 0); });
var step = function (id, role, label, fps, lost, big, extra) { return Object.assign({ id: id, role: role, label: label, fps: fps, lost: lost, big: big || 0, loaf: 0 }, extra || {}); };
t('the load hurts and one variant helps: the answer says so and names the biggest help', function () {
  var v = S.verdict([step('A', 'baseline', 'Nothing moving', 60, 1), step('B', 'load', 'Everything moving', 38, 14, 6), step('C', 'variant', 'Glow not drawn', 58, 2, 0), step('D', 'variant', 'Sparkles not drawn', 40, 12, 5), step('Z', 'heat', 'Nothing again', 59, 1)]);
  var txt = v.map(function (l) { return l.text; }).join('\n');
  assert.ok(/Nothing moving: 60 frames per second/.test(txt) && /Everything moving: 38 fps/.test(txt) && /DID make this device stutter/.test(txt));
  assert.ok(/Glow not drawn helped: 38 to 58 fps/.test(txt) && !/Sparkles not drawn helped/.test(txt) && /Biggest help: Glow not drawn\./.test(txt) && !/slower over the test/.test(txt));
});
t('the load does not hurt: the answer says the graphics chip may be the cost, and lists no variants', function () {
  var v = S.verdict([step('A', 'baseline', 'Idle', 60, 1), step('B', 'load', 'Busy', 59, 2), step('C', 'variant', 'Less busy', 60, 1)]);
  assert.ok(/did not make this device stutter/.test(v[1].text) && /graphics chip/.test(v[1].text) && !v.some(function (l) { return /helped/.test(l.text); }));
});
t('no variant helped; heat; busy-page moments; disturbed steps; closed covers; notes come first', function () {
  var v = S.verdict([step('A', 'baseline', 'Idle', 60, 1), step('B', 'load', 'Busy', 30, 20, 9, { loaf: 3 }), step('C', 'variant', 'V', 31, 19, 9, { bad: 'a card was on screen' }), step('Z', 'heat', 'Idle again', 40, 8)], { notes: ['This browser rounds the clock.'], closed: { 'a help panel': 2 } }), txt = v.map(function (l) { return l.text; });
  assert.strictEqual(txt[0], 'This browser rounds the clock.'); assert.ok(/1 step was disturbed \(C: a card was on screen\)/.test(txt[1])); assert.ok(/a help panel \(2 times\)/.test(txt[2]));
  assert.ok(txt.some(function (x) { return /None of the variants helped/.test(x); }) && txt.some(function (x) { return /busy too long in 3 moments/.test(x); }) && txt.some(function (x) { return /got slower over the test \(60 to 40 fps/.test(x); }));
});
t('without a baseline and a load the answer says what is missing instead of guessing', function () {
  var v = S.verdict([step('A', 'variant', 'x', 30, 1)]); assert.ok(/needs one baseline step and one load step/.test(v[v.length - 1].text));
});
t('the report has the answer, a header line and one row per step', function () {
  var res = { verdict: [{ kind: 'big', text: 'The answer.' }], steps: [Object.assign(step('A', 'baseline', 'Idle', 60, 1), { med: 16.7, late: 0, slow: 18, worst: 30, n: 200, loafMs: 0, vis: 55, tries: 1 })] };
  var txt = S.report(res, 'My test | today'); assert.ok(/^My test \| today/.test(txt) && /The answer\./.test(txt) && /A Idle \| 60 \| 16.7 \| 1 \| 0 \| 0 \| 18 \| 30 \| 200 \| 0 \| 0 \| 55 \| 1 \| /.test(txt));
});
console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'speed-lab: all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
