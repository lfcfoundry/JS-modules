// Copyright (c) 2026 LFC Foundry. MIT License. Lists.getMany gives the same values as get, in JavaScript and in WebAssembly, for repeated, missing and out of range ids.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 3; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
(async () => {
  await EF.ready();
  const lists = []; for (let i = 0; i < 3000; i++) { const m = i % 7 === 0 ? 0 : Math.floor(r() * r() * 80); let cur = Math.floor(r() * 1000); const a = []; for (let j = 0; j < m; j++) { cur += Math.floor(r() * 5000); a.push(cur); } lists.push(a); }
  const blob = EF.buildLists(lists);
  for (const backend of ['js', 'wasm']) {
    EF.setBackend(backend); const set = EF.openLists(blob);
    const ids = []; for (let q = 0; q < 5000; q++) ids.push(q % 50 === 0 ? (q % 100 === 0 ? 99999 : -1) : Math.floor(r() * 3000));
    const g = set.getMany(ids); let seen = 0;
    ids.forEach((id, j) => { const want = set.get(id) || [], got = g.values.subarray(g.offsets[j], g.offsets[j + 1]); assert.deepStrictEqual(Array.from(got), Array.from(want), backend + ' id ' + id); seen += got.length; });
    assert.strictEqual(g.values.length, seen); assert.strictEqual(set.getMany([]).values.length, 0);
    set.free();
  }
  // decodeAll (one WebAssembly call per chunk since 1.10.0) and the opt-in cache give exactly what get gives, in both backends, with several chunks
  const wide = lists.map((a, i) => i === 3 ? a.concat([2000000000 + i]) : a), many = EF.buildLists(wide);   // a big value makes the step large, so the set splits into many chunks
  for (const backend of ['js', 'wasm']) {
    EF.setBackend(backend); const set = EF.openLists(many), da = set.decodeAll(), hot = EF.openLists(many, { cache: true });
    assert.strictEqual(hot.cache(), true); assert.strictEqual(set.cache(), false);
    for (let i = 0; i < wide.length; i++) {
      assert.deepStrictEqual(Array.from(da.values.subarray(da.offsets[i], da.offsets[i + 1])), wide[i], backend + ' decodeAll list ' + i);
      const x = hot.get(i); assert.deepStrictEqual(Array.from(x), wide[i], backend + ' cached list ' + i); assert.strictEqual(hot.get(i), x, 'same array again');
    }
    assert.strictEqual(set.get(-1), undefined); assert.strictEqual(hot.get(wide.length), undefined); hot.cache(false); assert.strictEqual(hot.cache(), false); assert.notStrictEqual(hot.get(1), hot.get(1));
    hot.cache(true); assert.deepStrictEqual(Array.from(hot.get(2)), wide[2]); set.free(); hot.free();
  }
  console.log('ok   elias-fano lists decodeAll and cache(true) agree with the lists, JavaScript and WebAssembly');
  console.log('ok   elias-fano lists getMany: 5000 ids (some missing) agree with get, JavaScript and WebAssembly');
})().catch(e => { console.error(e); process.exit(1); });
