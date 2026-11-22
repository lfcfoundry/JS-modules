// Copyright (c) 2026 LFC Foundry. MIT License. toArray in WebAssembly (since 2.2.2 the SIMD build decodes flat lists with n >= 16 and l <= 16 eight values at a time)
// gives exactly the values it was built from: random lists across every low-bit width 0 to 20 (16 and 17 are the edges of the fast path), repeats, values near
// 4,294,967,295, lengths around multiples of 8, and the same after trim(); the JavaScript reader is the reference.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 2026; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
(async () => {
  await EF.ready(); assert.ok(EF.accelerated(), 'needs WebAssembly');
  let lists = 0, values = 0; const widths = new Set();
  function one(n, l, top) {
    const v = new Uint32Array(n); let x = top ? 4294967295 - n * Math.pow(2, l) * 2 : Math.floor(r() * 1000);
    for (let i = 0; i < n; i++) { x += r() < 0.1 ? 0 : Math.floor(r() * Math.pow(2, l + 1)); v[i] = Math.min(x, 4294967295); }
    v.sort(); const L = EF.open(EF.build(v)); widths.add(L.stats().lowBits);
    const a = L.toArray(); for (let i = 0; i < n; i++) if (a[i] !== v[i]) assert.fail('n ' + n + ' l ' + L.stats().lowBits + ': value ' + i + ' is ' + a[i] + ', want ' + v[i]);
    const o = new Uint32Array(n); L.toArray(o); assert.strictEqual(o[n - 1], v[n - 1]);
    lists++; values += n; L.free();
  }
  for (let t = 0; t < 3000; t++) { const l = t % 21, n = 16 + Math.floor(Math.pow(r(), 3) * 20000) + (t % 9); one(n, l, t % 17 === 0); }
  for (const n of [15, 16, 17, 23, 24, 25, 31, 32, 33, 1000, 1001, 1007, 1008]) for (let l = 0; l <= 20; l++) one(n, l, false);
  one(100000, 16, false); one(100000, 17, true); one(100000, 0, false);
  const v = Uint32Array.from({ length: 50000 }, (_, i) => i * 300), L = EF.open(EF.build(v)); L.compact(); EF.trim(); const a = L.toArray(); for (let i = 0; i < v.length; i++) assert.strictEqual(a[i], v[i], 'after trim');
  EF.setBackend('js'); const L2 = EF.open(EF.build(v)), b = L2.toArray(); EF.setBackend('auto'); for (let i = 0; i < v.length; i++) assert.strictEqual(b[i], v[i], 'JavaScript reader');
  assert.ok(widths.has(16) && widths.has(17) && widths.has(0), 'widths tested: ' + Array.from(widths).sort((x, y) => x - y).join(','));
  console.log('ok   elias-fano SIMD decode: ' + lists + ' lists, ' + values + ' values equal in WebAssembly' + (EF.simd() ? ' (SIMD build)' : ' (no SIMD here: the plain build ran)') + ', low-bit widths ' + Math.min(...widths) + ' to ' + Math.max(...widths) + ', also after trim and in JavaScript');
})().catch((e) => { console.error(e); process.exit(1); });
