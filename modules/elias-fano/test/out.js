// Copyright (c) 2026 LFC Foundry. MIT License.
// toArray(out) and slice(a, b, out) fill the caller's array with the same values as the plain calls, in JavaScript, WebAssembly and after compact(); a wrong out is refused.
const EF = require('../elias-fano.js'), assert = require('assert');
(async () => {
  if (EF.ready) await EF.ready();
  let x = 0; const v = new Uint32Array(200000); for (let i = 0; i < v.length; i++) { x += 1 + (Math.imul(i, 2654435761) >>> 27); v[i] = x; }
  for (const [name, mk] of [['wasm', () => EF.open(EF.build(v))], ['js', () => { EF.setBackend('js'); return EF.open(EF.build(v)); }], ['compact', () => { EF.setBackend('auto'); const e = EF.open(EF.build(v)); if (e.compact) e.compact(); return e; }]]) {
    const e = mk(), o = new Uint32Array(v.length);
    assert.strictEqual(e.toArray(o), o, name + ': toArray returns out'); assert.deepStrictEqual(o, e.toArray(), name + ': toArray(out) values');
    for (const [a, b] of [[0, 10], [5, 64 + 5], [1000, 1065], [3, 150000]]) { const s = new Uint32Array(b - a); assert.strictEqual(e.slice(a, b, s), s, name + ': slice returns out'); assert.deepStrictEqual(s, e.slice(a, b), name + ' slice ' + a + '-' + b); }
    assert.throws(() => e.toArray(new Uint32Array(3)), TypeError, name + ': short out refused'); assert.throws(() => e.slice(0, 10, new Float64Array(10)), TypeError, name + ': wrong kind refused');
  }
  console.log('ok   elias-fano out arrays: toArray(out) and slice(a, b, out) match the plain calls; wrong out refused');
})().catch((e) => { console.log('FAIL', e && e.message || e); process.exit(1); });
