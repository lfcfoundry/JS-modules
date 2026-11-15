// Copyright (c) 2026 LFC Foundry. MIT License. fast is the default since 0.12.0: a default save has the same bytes as { fast: true }, reads back exactly, and { fast: false } keeps the older layout (also read back exactly).
const J = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await J.init();
  let s = 9; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const mk = (n) => { const o = []; for (let i = 0; i < n; i++) o.push({ ts: 1760000000 + i * 3, level: ['INFO', 'WARN', 'ERROR'][Math.floor(r() * 3)], msg: 'request ' + Math.floor(r() * 1e9).toString(36) + ' from host-' + Math.floor(r() * 99), uniq: 'u' + Math.floor(r() * 1e12).toString(36) + i, ms: Math.round(r() * 5000) / 100 }); return o; };
  for (const n of [100, 3000, 6000, 20000]) {
    const rows = mk(n), d1 = J.packRows(rows), d2 = J.packRows(rows, {}), f = J.packRows(rows, { fast: true }), o = J.packRows(rows, { fast: false });
    assert.deepStrictEqual(Buffer.from(d1), Buffer.from(d2), 'default bytes n=' + n);
    assert.deepStrictEqual(J.unpackRows(f), rows.map(x => x), 'fast round trip n=' + n);
    assert.deepStrictEqual(Buffer.from(d1), Buffer.from(f), 'default bytes equal fast: true n=' + n);
    assert.deepStrictEqual(J.unpackRows(o), rows.map(x => x), 'fast: false round trip n=' + n);
    assert.ok(f.length < o.length * 1.1, 'fast size n=' + n + ' ' + f.length + ' vs ' + o.length);
  }
  console.log('fast ok');
})().catch(e => { console.error(e); process.exit(1); });
