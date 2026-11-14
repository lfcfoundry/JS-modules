// Copyright (c) 2026 LFC Foundry. MIT License. unpackColumns(bytes, { into }): the same values, written into arrays the caller keeps.
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init();
  let s = 5; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const lines = []; const N = 30000;
  for (let i = 0; i < N; i++) { const o = { id: i, small: Math.floor(r() * 90), fare: Math.round(r() * 9000) / 100, big: Math.floor(r() * 1e9) * 3, name: 'n' + Math.floor(r() * 50), tip: r() < 0.2 ? null : Math.round(r() * 500) / 100 }; if (r() < 0.1) delete o.small; lines.push(JSON.stringify(o)); }
  const text = new TextEncoder().encode(lines.join('\n') + '\n');
  for (const blockBytes of [undefined, 60000]) for (const nulls of [undefined, 'NaN']) {
    const bytes = J.pack(text, blockBytes ? { blockBytes, block: 'flat' } : {}), base = J.unpackColumns(bytes, { nulls }), total = base.reduce((a, b) => a + b.n, 0);
    const into = { id: new Float64Array(total), small: new Float64Array(total), fare: new Float64Array(total), big: new Float64Array(total), tip: new Float64Array(total), name: new Float64Array(total) };
    for (let rep = 0; rep < 2; rep++) {   // a second read into the same arrays gives the same values
      const got = J.unpackColumns(bytes, { nulls, into }); assert.strictEqual(got.length, base.length); let off = 0, hits = 0;
      got.forEach((b, bi) => { assert.deepStrictEqual(b.keys, base[bi].keys); assert.strictEqual(b.n, base[bi].n);
        for (const k of b.keys) { const x = b.cols[k], y = base[bi].cols[k]; assert.strictEqual(x.length, y.length, k);
          for (let i = 0; i < x.length; i++) assert.ok(Object.is(x[i], y[i]) || x[i] === y[i], k + ' ' + i);
          assert.deepStrictEqual(b.present[k] && Array.from(b.present[k]), base[bi].present[k] && Array.from(base[bi].present[k]), 'present ' + k);
          if (x instanceof Float64Array && x.buffer === into[k].buffer) { assert.strictEqual(x.byteOffset, off * 8); hits++; } }
        off += b.n; });
      assert.ok(hits >= base.length * 3, 'into used: ' + hits);
    }
  }
  const bytes = J.pack(text);
  assert.throws(() => J.unpackColumns(bytes, { into: { id: new Float64Array(5) } }), /holds 5 values/);
  assert.throws(() => J.unpackColumns(bytes, { into: { id: new Int32Array(N) } }), /Float64Array/);
  console.log('into ok');
})().catch(e => { console.error(e); process.exit(1); });
