// Copyright (c) 2026 LFC Foundry. MIT License. B59 + B60 (Firefox-only text counts in wasm / a small hash): forced on in Node they write the same bytes as with them off.
const assert = require('assert'), path = require('path');
const load = (on) => { for (const k of Object.keys(require.cache)) if (k.endsWith('lfc-pack.js')) delete require.cache[k]; globalThis.__B59 = on; globalThis.__B60 = on; return require(path.join(__dirname, '..', 'lfc-pack.js')); };
let s = 3; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const N = 6000, pick = (k, f) => 'v' + Math.floor(r() * k) + (f || '');
const sets = {
  dict300: () => Array.from({ length: N }, (_, i) => ({ a: pick(300), n: i })),
  few: () => Array.from({ length: N }, () => ({ a: pick(20), b: pick(100, 'x') })),
  distinct: () => Array.from({ length: N }, (_, i) => ({ a: 'u' + Math.floor(r() * 1e12) + i })),
  sample129: () => Array.from({ length: N }, (_, i) => ({ a: i < 1024 ? 'k' + (i % 129) : pick(40) })),
  zeroChar: () => Array.from({ length: N }, (_, i) => ({ a: i % 7 ? pick(50) : 'a\0b' + (i % 5) })),
  surrogate: () => Array.from({ length: N }, (_, i) => ({ a: i % 11 ? pick(60) : '\ud800x' + (i % 3) })),
  nonAscii: () => Array.from({ length: N }, (_, i) => ({ a: i % 3 ? pick(70) : 'café ' + (i % 90) + ' 😀' })),
  many: () => Array.from({ length: N }, (_, i) => ({ a: 'w' + (i % 2500) + 'z' })),
};
(async () => {
  const data = {}; for (const k in sets) data[k] = sets[k]();
  const off = load(0); await off.init(); const want = {};
  for (const k in sets) want[k] = Buffer.from(off.packRows(data[k]));
  const on = load(1); await on.init(); assert.notStrictEqual(on, off);
  for (const k in sets) assert.ok(Buffer.from(on.packRows(data[k])).equals(want[k]), 'same bytes: ' + k);
  console.log('b59 ok', Object.keys(sets).length, 'sets');
})().catch(e => { console.error(e); process.exit(1); });
