// Copyright (c) 2026 LFC Foundry. MIT License. compact() keeps every answer the same for flat, partitioned and list-set blobs: in WebAssembly, after switching to plain JavaScript, after stats() and after free().
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function sorted(n, gap) { const a = new Uint32Array(n); let v = Math.floor(r() * 50); for (let i = 0; i < n; i++) { v += Math.floor(r() * gap); a[i] = v; } return a; }
function answers(L, xs) {
  const n = L.length, idx = xs.map(x => x % Math.max(1, n));
  return JSON.stringify([Array.from(L.toArray()), idx.map(i => L.get(i)), xs.map(x => L.nextGEQ(x)), xs.map(x => L.rank(x)), n ? Array.from(L.getMany(idx)) : 0, Array.from(L.slice(n >> 2, n >> 1))]);
}
(async () => {
  await EF.ready(); assert.ok(EF.accelerated(), 'needs WebAssembly');
  let cases = 0;
  for (const n of [0, 1, 7, 1000, 50000]) for (const gap of [1, 3, 1000]) {
    const vals = sorted(n, gap), xs = []; for (let q = 0; q < 300; q++) xs.push(Math.floor(r() * (n ? vals[n - 1] + 10 : 10)));
    for (const kind of ['flat', 'partitioned']) {
      EF.setBackend('auto');
      const blob = kind === 'flat' ? EF.build(vals) : EF.buildPartitioned(vals), open = kind === 'flat' ? EF.open : EF.openPartitioned;
      const want = answers(open(blob), xs);
      const A = open(blob); assert.strictEqual(A.compact(), true); assert.strictEqual(A.bytes, null, kind + ' bytes let go');
      assert.strictEqual(A.stats().bytes, blob.length); assert.strictEqual(A.stats().compact, true);
      assert.strictEqual(answers(A, xs), want, kind + ' wasm after compact, n ' + n);
      EF.setBackend('js'); assert.strictEqual(answers(A, xs), want, kind + ' js after compact, n ' + n); EF.setBackend('auto');
      const B = open(blob, { compact: true }); assert.strictEqual(B.bytes, null); B.free(); assert.strictEqual(answers(B, xs), want, kind + ' after free, n ' + n);
      const C = open(blob, { compact: true }); EF.setBackend('js'); C.free(); assert.strictEqual(answers(C, xs), want, kind + ' js after free, n ' + n); EF.setBackend('auto');
      cases++;
    }
  }
  const lists = []; for (let i = 0; i < 2000; i++) lists.push(Array.from(sorted(i % 9 === 0 ? 0 : Math.floor(r() * 40), 30)));
  const lb = EF.buildLists(lists), ids = []; for (let q = 0; q < 3000; q++) ids.push(Math.floor(r() * 2000));
  const ref = EF.openLists(lb), want = JSON.stringify([ids.map(i => Array.from(ref.get(i) || [])), ref.getMany(ids), ref.decodeAll()].map(x => x.offsets ? [Array.from(x.offsets), Array.from(x.values)] : x));
  const look = S => JSON.stringify([ids.map(i => Array.from(S.get(i) || [])), S.getMany(ids), S.decodeAll()].map(x => x.offsets ? [Array.from(x.offsets), Array.from(x.values)] : x));
  const S1 = EF.openLists(lb, { compact: true }); assert.strictEqual(S1.bytes, null, 'list set bytes let go'); assert.strictEqual(look(S1), want, 'list set wasm after compact');
  EF.setBackend('js'); assert.strictEqual(look(S1), want, 'list set js after compact'); EF.setBackend('auto');
  S1.free(); assert.strictEqual(look(S1), want, 'list set after free');
  EF.setBackend('js'); const S2 = EF.openLists(lb); assert.strictEqual(S2.compact(), false, 'no compact without WebAssembly'); assert.ok(S2.bytes); EF.setBackend('auto');
  console.log('ok   elias-fano compact: ' + cases + ' flat and partitioned cases plus a 2000-list set give the same answers in WebAssembly, in JavaScript and after free()');
})().catch(e => { console.error(e); process.exit(1); });
