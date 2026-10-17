/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for slow-note's log (Node, no page needed). The page parts are checked in a real browser by tests/pieces-browser.js. */
'use strict';
var assert = require('assert'), S = require('../slow-note.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }
function fakeStorage(seed) { var m = new Map(Object.entries(seed || {})); return { getItem: function (k) { return m.has(k) ? m.get(k) : null; }, setItem: function (k, v) { m.set(k, String(v)); }, _m: m }; }
function clock() { var c = { wallT: 1e12, sinceT: 10000, wall: function () { return c.wallT; }, since: function () { return c.sinceT; }, timers: [], later: function (fn, ms) { c.timers.push([fn, ms]); return c.timers.length; }, stop: function (id) { c.timers[id - 1] = null; } }; return c; }
t('nothing is noted in the first seconds after load', function () {
  var c = clock(), l = S.createLog({ wall: c.wall, since: c.since, later: c.later, stop: c.stop, storage: null }); c.sinceT = 3999;
  assert.strictEqual(l.add('error', 'x'), false); c.sinceT = 4000; assert.strictEqual(l.add('error', 'x'), true); assert.strictEqual(l.count(), 1);
});
t('one note of each kind per second; other kinds are not blocked', function () {
  var c = clock(), l = S.createLog({ wall: c.wall, since: c.since, later: c.later, stop: c.stop, storage: null });
  assert.ok(l.add('slow tap', 'a')); c.wallT += 999; assert.ok(!l.add('slow tap', 'b')); assert.ok(l.add('error', 'c')); c.wallT += 1; assert.ok(l.add('slow tap', 'd'));
  assert.deepStrictEqual(l.entries().map(function (e) { return e[2]; }), ['a', 'c', 'd']);
});
t('only the last max notes are kept, and text is cut at 220 characters plus the context', function () {
  var c = clock(), l = S.createLog({ wall: c.wall, since: c.since, later: c.later, stop: c.stop, storage: null, max: 3 });
  for (var i = 0; i < 5; i++) { c.wallT += 2000; l.add('error', 'n' + i); }
  assert.deepStrictEqual(l.entries().map(function (e) { return e[2]; }), ['n2', 'n3', 'n4']);
  c.wallT += 2000; l.add('error', new Array(400).join('x'), ' [lvl 2]'); var e = l.entries().pop(); assert.strictEqual(e[2].length, 220 + 8); assert.ok(/\[lvl 2\]$/.test(e[2]));
});
t('saves at most every saveMs, flush saves now, a reload brings the notes back', function () {
  var c = clock(), st = fakeStorage(), o = { wall: c.wall, since: c.since, later: c.later, stop: c.stop, storage: st, key: 'k' }, l = S.createLog(o);
  l.add('error', 'a'); c.wallT += 2000; l.add('error', 'b'); assert.strictEqual(c.timers.length, 1, 'one pending write, not two'); assert.strictEqual(c.timers[0][1], 4000); assert.strictEqual(st.getItem('k'), null);
  l.flush(); assert.strictEqual(JSON.parse(st.getItem('k')).length, 2);
  var again = S.createLog(o); assert.strictEqual(again.count(), 2); again.clear(); assert.strictEqual(JSON.parse(st.getItem('k')).length, 0);
});
t('a damaged or foreign saved note is ignored, never thrown', function () {
  [['k', 'not json'], ['k', '{"a":1}'], ['k', '[1,2,3]'], ['k', '[[1,"e"]]'], ['k', '[["x","e","t"]]']].forEach(function (p) { var l = S.createLog({ storage: fakeStorage({ k: p[1] }), key: p[0] }); assert.strictEqual(l.count(), 0, p[1]); });
  assert.strictEqual(S.createLog({ storage: fakeStorage({ k: '[[1,"e","t"],[2,"e","u"]]' }), key: 'k' }).count(), 2);
  var broken = { getItem: function () { throw new Error('denied'); }, setItem: function () { throw new Error('full'); } }, l2 = S.createLog({ storage: broken, key: 'k', quietMs: 0, since: function () { return 9; } });
  assert.ok(l2.add('error', 'x')); assert.strictEqual(l2.flush(), false);
});
t('a callback that throws does not break the note; entries come back as copies', function () {
  var l = S.createLog({ storage: null, quietMs: 0 }), seen = []; l.onChange(function () { throw new Error('bad page code'); }); l.onChange(function (n) { seen.push(n); });
  assert.ok(l.add('error', 'x')); assert.deepStrictEqual(seen, [1]); l.entries()[0][2] = 'changed'; assert.strictEqual(l.entries()[0][2], 'x');
});
t('startupWords never throws without a browser, and the cost of one note is tiny', function () {
  assert.ok(/^Start-up: /.test(S.startupWords({ a: 1 })));
  var l = S.createLog({ storage: null, quietMs: 0, perKindMs: 0, max: 30 }), t0 = process.hrtime.bigint(), n = 20000, i; for (i = 0; i < n; i++) l.add('error', 'boom ' + i);
  var us = Number(process.hrtime.bigint() - t0) / 1e3 / n; assert.ok(us < 50, 'one note took ' + us.toFixed(2) + ' microseconds'); console.log('       one note costs about ' + us.toFixed(1) + ' microseconds');
});
console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'slow-note: all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
