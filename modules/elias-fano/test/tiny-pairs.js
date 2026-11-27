// Copyright (c) 2026 LFC Foundry. MIT License. Two tiny lists (since 2.3.3 a direct merge): intersect equals a set intersection on 20,000 random pairs with repeats
// and empty lists, and nextGEQMany with a Uint32Array of queries gives the same answers as a plain array of the same queries.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 2333; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function list(n, span) { const v = new Uint32Array(n); for (let i = 0; i < n; i++) v[i] = Math.floor(r() * span) + (r() < 0.05 ? 4294967295 - span : 0); return v.sort(); }
(async () => {
  await EF.ready(); let checks = 0;
  for (let t = 0; t < 20000; t++) {
    const span = [50, 500, 1e5, 4294967296][t & 3], a = list(Math.floor(r() * 64), span), b = list(Math.floor(r() * 64), span);
    const A = EF.openTiny(EF.buildTiny(a)), B = EF.openTiny(EF.buildTiny(b)), sb = new Set(b);
    const want = Array.from(new Set(Array.from(a).filter(x => sb.has(x)))).join();
    assert.strictEqual(Array.from(EF.intersect([A, B])).join(), want, 'pair ' + t); checks++;
    if (t % 10 === 0) {
      const q = new Uint32Array(16); for (let j = 0; j < 16; j++) q[j] = Math.floor(r() * span);
      assert.strictEqual(Array.from(A.nextGEQMany(q)).join(), Array.from(A.nextGEQMany(Array.from(q))).join(), 'nextGEQMany Uint32Array'); checks++;
    }
  }
  console.log('tiny pairs: ' + checks + ' checks pass');
})().catch((e) => { console.error(e); process.exit(1); });
