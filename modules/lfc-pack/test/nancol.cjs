// Copyright (c) 2026 LFC Foundry. MIT License.
// B74p6: a Float64Array column with NaN (an empty cell) packs to the same bytes as a plain array with nulls; a column without NaN is unchanged. Pass/fail only.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  const o = { share: false }; let seed = 7; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (const n of [5, 100, 3000, 20000]) for (const gap of [0, 2, 9, 1000000]) {
    const f = new Float64Array(n), a = new Array(n);
    for (let i = 0; i < n; i++) { const v = i % 2 ? Math.round(r() * 10000) / 100 : Math.floor(r() * 1000); const nul = gap && i % gap === 1; f[i] = nul ? NaN : v; a[i] = nul ? null : v; }
    const ids = Float64Array.from({ length: n }, (_, i) => i);
    const pa = await JF.packBlock({ id: ids, x: a }, o), pf = await JF.packBlock({ id: ids, x: f }, o);
    assert.deepStrictEqual(Buffer.from(pf), Buffer.from(pa), 'typed NaN equals array with nulls n=' + n + ' gap=' + gap);
    const back = JF.unpackRows(pf); assert.strictEqual(back.length, n); for (const i of [0, 1, n >> 1, n - 1]) assert.strictEqual(back[i].x, a[i], 'value n=' + n + ' i=' + i);
  }
  console.log('nancol ok');
})().catch((e) => { console.error(e); process.exit(1); });
