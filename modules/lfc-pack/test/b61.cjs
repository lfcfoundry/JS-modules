// Copyright (c) 2026 LFC Foundry. MIT License. B61 (0.10.36): the faster row loop writes the same bytes as the old loop, on rows with missing keys, changed key order, a late or ever-new key, mixed types, all-null and sparse rows, in default, fast, templates and exact modes.
const assert = require('assert'), path = require('path');
const load = (on) => { for (const k of Object.keys(require.cache)) if (k.endsWith('lfc-pack.js')) delete require.cache[k]; globalThis.__B61 = on; return require(path.join(__dirname, '..', 'lfc-pack.js')); };
let s = 11; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; const N = 5000;
const sets = {
  plain: () => Array.from({ length: N }, (_, i) => ({ a: i, b: 'x' + (i % 40), c: Math.round(r() * 1e4) / 100 })),
  missing: () => Array.from({ length: N }, (_, i) => { const o = { a: i, b: 'x' + (i % 9) }; if (i % 4) o.c = r(); if (i % 7 === 0) delete o.b; return o; }),
  reorder: () => Array.from({ length: N }, (_, i) => i % 3 ? { a: i, b: 'y' } : { b: 'y', a: i }),
  lateKey: () => Array.from({ length: N }, (_, i) => i < 3000 ? { a: i } : { a: i, late: 'v' + (i % 5) }),
  everNew: () => Array.from({ length: 300 }, (_, i) => ({ ['k' + i]: i, a: 1 })),
  mixed: () => Array.from({ length: N }, (_, i) => ({ a: i % 2 ? i : 'str' + i, b: i % 3 ? null : true })),
  allNull: () => Array.from({ length: N }, () => ({ a: null, b: null })),
  sparse: () => Array.from({ length: N }, (_, i) => i % 50 ? {} : { a: i }),
};
const modes = [{}, { fast: true }, { templates: true }, { exact: true }];
(async () => {
  const data = {}; for (const k in sets) data[k] = sets[k]();
  const off = load(0); await off.init(); const want = {};
  for (const k in sets) for (const [mi, m] of modes.entries()) { try { want[k + mi] = Buffer.from(off.packRows(data[k], m)); } catch (e) { want[k + mi] = 'throws'; } }
  const on = load(1); await on.init(); assert.notStrictEqual(on, off); let n = 0;
  for (const k in sets) for (const [mi, m] of modes.entries()) { let got; try { got = Buffer.from(on.packRows(data[k], m)); } catch (e) { got = 'throws'; } const w = want[k + mi]; assert.ok(got === w || (Buffer.isBuffer(got) && Buffer.isBuffer(w) && got.equals(w)), 'same bytes: ' + k + ' ' + JSON.stringify(m)); n++; }
  console.log('b61 ok', n, 'cases');
})().catch(e => { console.error(e); process.exit(1); });
