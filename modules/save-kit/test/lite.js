#!/usr/bin/env node
/* save-kit-lite checks: plain Node, no packages. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run: node modules/save-kit/test/lite.js
 * The main check feeds the same damaged slots to save-kit-lite and to save-kit's create() and requires identical answers (num, int, flag, str fields). */
'use strict';
const assert = require('assert'), Lite = require('../save-kit-lite.js'), Full = require('../save-kit.js');
const mem = (init) => { const m = Object.assign({}, init); return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
const schema = { score: 'num', level: 'int:99', sound: 'flag', name: 'str:5', note: 'str', free: 'int' }, defaults = { sound: 1, name: 'P', level: 1, score: 0, free: 7 };
let n = 0; const t = (name, fn) => { fn(); n++; };

t('save then load round-trips and stamps', () => {
  const st = mem(), k = Lite({ key: 'g', schema, defaults, storage: st }), s = k.validate({ score: 5.5, level: 3, sound: 0, name: 'Ann', note: 'hi', free: 9 });
  assert.strictEqual(k.save(s), true); const o = k.load(); assert.deepStrictEqual(o, { score: 5.5, level: 3, sound: 0, name: 'Ann', note: 'hi', free: 9 });
  assert.ok(JSON.parse(st.m.g).seen > 0); assert.ok(st.m['g-backup']);
});
t('a broken number is refused and nothing is written', () => {
  const st = mem(), k = Lite({ key: 'g', schema, storage: st });
  for (const bad of [NaN, Infinity, -1, '5']) assert.strictEqual(k.save({ score: bad }), false);
  assert.deepStrictEqual(st.m, {});
});
t('same answers as save-kit create() on 3000 random damaged slots', () => {
  let seed = 12345; const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = a => a[Math.floor(r() * a.length)];
  const vals = [0, 1, 2, 5.7, 98, 99, 100, 1e300, -3, null, 'x', 'abcdefg', 'abcde', '', true, [], {}, 0.5];
  const slot = () => { const x = {}; for (const f of Object.keys(schema)) if (r() < 0.8) x[f] = pick(vals); if (r() < 0.1) x.__proto__ = { score: 9 }; x.extra = 1; return r() < 0.1 ? 'not json' : r() < 0.05 ? '[1]' : JSON.stringify(x); };
  for (let i = 0; i < 3000; i++) {
    const init = {}; if (r() < 0.9) init.g = slot(); if (r() < 0.7) init['g-backup'] = slot();
    const a = Lite({ key: 'g', schema, defaults, storage: mem(init) }).load(), b = Full.create({ key: 'g', schema, defaults, storage: mem(init) }).load();
    assert.deepStrictEqual(a, b, 'slots ' + JSON.stringify(init));
  }
});
t('hostile keys never reach the state and nothing pollutes Object.prototype', () => {
  const k = Lite({ key: 'g', schema, defaults, storage: mem({ g: '{"__proto__":{"polluted":1},"constructor":{"x":1},"score":4}' }) }), o = k.load();
  assert.strictEqual(o.score, 4); assert.strictEqual(({}).polluted, undefined); assert.deepStrictEqual(Object.keys(o).sort(), Object.keys(schema).sort());
});
t('backup is written at most every backupEveryMs; clear removes both', () => {
  const st = mem(), k = Lite({ key: 'g', schema, storage: st, backupEveryMs: 1e9 }); k.save({ score: 1 }); st.m['g-backup'] = 'old'; k.save({ score: 2 });
  assert.strictEqual(st.m['g-backup'], 'old'); assert.strictEqual(k.clear(), true); assert.deepStrictEqual(st.m, {});
});
t('a main slot with more broken numbers loses to a better backup', () => {
  const st = mem({ g: '{"score":-1,"free":-1}', 'g-backup': '{"score":3,"free":4,"level":2}' }), o = Lite({ key: 'g', schema, defaults, storage: st }).load();
  assert.strictEqual(o.score, 3); assert.strictEqual(o.level, 2);
});
t('blocked storage: load is null, save is false, no exception', () => {
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } }, k = Lite({ key: 'g', schema, storage: bad });
  assert.strictEqual(k.load(), null); assert.strictEqual(k.save({ score: 1 }), false); assert.strictEqual(k.clear(), false);
});
console.log('save-kit-lite: ' + n + ' checks passed');
