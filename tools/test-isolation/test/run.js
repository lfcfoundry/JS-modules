/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for test-isolation in Node (a fake Storage) and, in the browser test, a real one. */
'use strict';
var assert = require('assert'), T = require('../test-isolation.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }
function fakeStorage(seed) {   // keeps keys in insertion order like a real Storage
  var m = new Map(Object.entries(seed || {}));
  return { getItem: function (k) { return m.has(String(k)) ? m.get(String(k)) : null; }, setItem: function (k, v) { m.set(String(k), String(v)); }, removeItem: function (k) { m.delete(String(k)); },
    clear: function () { m.clear(); }, key: function (i) { var a = Array.from(m.keys()); return i >= 0 && i < a.length ? a[i] : null; }, get length() { return m.size; }, _keys: function () { return Array.from(m.keys()); } };
}
t('every key gets the prefix and the real keys are never read or touched', function () {
  var real = fakeStorage({ save: 'REAL', other: 'x' }), s = T.wrap(real, 'lab:');
  assert.strictEqual(s.getItem('save'), null);
  s.setItem('save', 'test'); s.setItem('n', 5);
  assert.strictEqual(real.getItem('save'), 'REAL'); assert.strictEqual(real.getItem('lab:save'), 'test'); assert.strictEqual(s.getItem('n'), '5');
  s.removeItem('save'); assert.strictEqual(real.getItem('save'), 'REAL'); assert.strictEqual(real.getItem('lab:save'), null);
});
t('clear removes only its own keys; key and length count only its own keys', function () {
  var real = fakeStorage({ a: '1', b: '2' }), s = T.wrap(real, 'p:');
  s.setItem('x', '1'); s.setItem('y', '2'); s.setItem('z', '3');
  assert.strictEqual(s.length, 3); assert.deepStrictEqual([0, 1, 2, 3, -1].map(function (i) { return s.key(i); }), ['x', 'y', 'z', null, null]);
  s.clear(); assert.strictEqual(s.length, 0); assert.deepStrictEqual(real._keys(), ['a', 'b']);
});
t('prefixes that start each other share keys, so choose prefixes that do not', function () {
  var real = fakeStorage({}), a = T.wrap(real, 'lab:'), b = T.wrap(real, 'lab:2:');
  b.setItem('k', 'B'); a.setItem('k', 'A');
  assert.strictEqual(a.length, 2, 'lab: owns lab:k and lab:2:k by plain prefix; use prefixes that do not start each other');
});
t('values are stored as text like a real Storage; an empty prefix is refused', function () {
  var s = T.wrap(fakeStorage({}), 'q:'); s.setItem('o', { a: 1 }); assert.strictEqual(s.getItem('o'), '[object Object]'); s.setItem('u', undefined); assert.strictEqual(s.getItem('u'), 'undefined');
  assert.throws(function () { T.wrap(fakeStorage({}), ''); }, /prefix cannot be empty/);
});
t('install swaps a page property, restore puts the original back, blocked storage is a plain ok:false', function () {
  var real = fakeStorage({ save: 'REAL' }), page = { localStorage: real };
  var r = T.install({ target: page, prefix: 'speedtest:' });
  assert.strictEqual(r.ok, true); assert.notStrictEqual(page.localStorage, real); page.localStorage.setItem('save', 'T'); assert.strictEqual(real.getItem('save'), 'REAL');
  r.restore(); assert.strictEqual(page.localStorage, real);
  var blocked = { get localStorage() { throw new Error('denied'); } }, b = T.install({ target: blocked });
  assert.strictEqual(b.ok, false); assert.ok(/would not give/.test(b.reason)); b.restore();
  assert.strictEqual(T.install({ target: {} }).ok, false);
});
t('the snippet does the same thing as install when run on its own', function () {
  var real = fakeStorage({ save: 'REAL' }), win = { localStorage: real, sessionStorage: fakeStorage({ s: 'REAL' }) };
  new Function('window', T.snippet('snip:', ['localStorage', 'sessionStorage']))(win);
  win.localStorage.setItem('save', 'T'); win.sessionStorage.setItem('s', 'T');
  assert.strictEqual(real.getItem('save'), 'REAL'); assert.strictEqual(real.getItem('snip:save'), 'T'); assert.strictEqual(win.sessionStorage.length, 1);
  var none = { get localStorage() { throw new Error('denied'); } }; new Function('window', T.snippet('x:'))(none);   // must not throw
  assert.ok(T.snippet('a"b').indexOf('"a\\"b"') > 0, 'a quote in the prefix is escaped');
});

t('property-style use behaves like a real Storage: read, write, in, delete, Object.keys, JSON.stringify, for-in', function () {
  var real = fakeStorage({ save: 'REAL' }), s = T.wrap(real, 'p:');
  s.a = '1'; s.setItem('b', 2);
  assert.strictEqual(real.getItem('p:a'), '1'); assert.strictEqual(s.a, '1'); assert.strictEqual(s.b, '2'); assert.strictEqual(s.save, undefined);
  assert.ok('a' in s); assert.ok(!('save' in s)); assert.deepStrictEqual(Object.keys(s), ['a', 'b']); assert.strictEqual(JSON.stringify(s), '{"a":"1","b":"2"}');
  var seen = []; for (var k in s) seen.push(k); assert.deepStrictEqual(seen, ['a', 'b']);
  delete s.a; assert.strictEqual(real.getItem('p:a'), null); assert.strictEqual(real.getItem('save'), 'REAL');
});
t('the remembered key list stays right: own writes, outside writes that change the count, and key loops', function () {
  var real = fakeStorage({ g: '1' }), s = T.wrap(real, 'c:');
  s.setItem('x', '1'); assert.strictEqual(s.length, 1); s.setItem('y', '1'); assert.strictEqual(s.length, 2);
  real.setItem('c:z', '1'); assert.strictEqual(s.length, 3, 'a key added behind its back is noticed (the count changed)');
  real.removeItem('c:z'); s.removeItem('x'); assert.deepStrictEqual([0, 1, 2].map(function (i) { return s.key(i); }), ['y', null, null]);
  s.clear(); assert.strictEqual(s.length, 0); assert.strictEqual(real.getItem('g'), '1');
});
t('fresh removes what an earlier run left; seed copies the real values in and never changes them', function () {
  var real = fakeStorage({ save: 'REAL', opt: 'o', 'lab:old': 'stale' }), page = { localStorage: real };
  var r = T.install({ target: page, prefix: 'lab:', fresh: true, seed: true });
  assert.strictEqual(page.localStorage.getItem('old'), null); assert.strictEqual(page.localStorage.getItem('save'), 'REAL'); assert.strictEqual(page.localStorage.length, 2);
  page.localStorage.setItem('save', 'TEST'); assert.strictEqual(real.getItem('save'), 'REAL'); assert.strictEqual(real.getItem('lab:save'), 'TEST'); r.restore();
  assert.throws(function () { T.install({ target: { localStorage: fakeStorage({}) }, prefix: '' }); }, /prefix cannot be empty/);
});
t('without Proxy it falls back to the method-only object', function () {
  var P = global.Proxy; global.Proxy = undefined;
  try { var real = fakeStorage({ save: 'REAL' }), s = T.wrap(real, 'n:'); s.setItem('a', '1'); assert.strictEqual(s.getItem('a'), '1'); assert.strictEqual(s.length, 1); assert.deepStrictEqual(Object.keys(s), []); assert.strictEqual(real.getItem('save'), 'REAL'); }
  finally { global.Proxy = P; }
});
console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'test-isolation: all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
