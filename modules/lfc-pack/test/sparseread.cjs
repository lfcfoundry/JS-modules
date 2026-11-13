// Copyright (c) 2026 LFC Foundry. MIT License.
// Sparse tables (rows with different key sets): full reads, keys, equals and row ranges give the rows that went in. Pass/fail only. Run: node modules/lfc-pack/test/sparseread.cjs
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0; let s = 7; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [K, p] of [[8, 0.9], [12, 0.5], [24, 0.97], [27, 0.9], [40, 0.5], [60, 0.95]]) for (const N of [100, 3000]) {
    const rows = []; for (let i = 0; i < N; i++) { const x = { id: i }; for (let k = 1; k < K; k++) if (r() < p) x[k % 5 === 4 ? 'k ' + k : 'c' + k] = k % 3 === 0 ? (r() * 99) | 0 : k % 3 === 1 ? 's' + ((r() * 9) | 0) + (r() < 0.01 ? 'é😀' : '') : r() < 0.05 ? null : r() < 0.5; rows.push(x); }
    const f = J.pack(Buffer.from(rows.map((x) => JSON.stringify(x)).join('\n') + '\n'), { blockBytes: 16384 }), want = JSON.parse('[' + rows.map((x) => JSON.stringify(x)).join(',') + ']'), tag = K + ' keys ' + p + ' x ' + N;
    ok(same(J.unpackRows(f).map((x) => Object.keys(x).sort()), want.map((x) => Object.keys(x).sort())) && same(J.unpackRows(f).map((x) => JSON.stringify(x, Object.keys(x).sort())), want.map((x) => JSON.stringify(x, Object.keys(x).sort()))), tag + ': full read gives the rows');
    ok(same(J.unpackRows(f, { from: 7, count: 50 }), J.unpackRows(f).slice(7, 57)), tag + ': row range');
    const v = want.find((x) => x.c1 !== undefined); if (v) ok(same(J.unpack(f, { equals: { key: 'c1', value: v.c1 } }), J.unpackRows(f).filter((x) => x.c1 === v.c1)), tag + ': equality');
    ok(same(J.unpack(f, { keys: ['id', 'c2'] }), J.unpackRows(f).map((x) => { const o = {}; for (const k of ['id', 'c2']) if (k in x) o[k] = x[k]; return o; })), tag + ': keys projection');
  }
  console.log(bad ? 'sparseread: ' + bad + ' bad of ' + n : 'sparseread ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
