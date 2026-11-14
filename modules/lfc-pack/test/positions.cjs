// Copyright (c) 2026 LFC Foundry. MIT License.
// W1: unpack(file, { equals | range, positions: true }) gives the row numbers of the rows the same query returns (Uint32Array, file order), for flat, nested, raw and sparse layouts, several block sizes, anyOf, null, missing keys, tables.
'use strict';
const J = require('../lfc-pack.js'), g = require('./gen.cjs');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const tables = {
    labels: Array.from({ length: 30000 }, (_, i) => ({ id: i, s: 'k' + (i % 9), b: i % 2 === 0, t: 'row ' + i, x: i * 0.5 })),
    nulls: Array.from({ length: 30000 }, (_, i) => ({ id: i, s: i % 7 === 0 ? null : 'v' + (i % 4), n: i % 5 ? null : i })),
    sparse: Array.from({ length: 30000 }, (_, i) => { const o = { id: i }; if (i % 3) o.a = i * 2; if (i % 4 === 0) o.s = 'x' + (i % 5); if (i > 20000) o.late = i; return o; }),
    logs: JSON.parse('[' + g.logs(20000).trim().split('\n').join(',') + ']')
  };
  const eqQ = (rows, key, v) => rows.map((r, i) => r[key] === v ? i : -1).filter(i => i >= 0);
  const anyQ = (rows, key, vs) => rows.map((r, i) => Object.prototype.hasOwnProperty.call(r, key) && vs.includes(r[key]) ? i : -1).filter(i => i >= 0);
  const rgQ = (rows, key, lo, hi) => rows.map((r, i) => typeof r[key] === 'number' && r[key] >= lo && r[key] <= hi ? i : -1).filter(i => i >= 0);
  const same = (a, b) => a instanceof Uint32Array && a.length === b.length && b.every((x, i) => a[i] === x);
  for (const [nm, rows] of Object.entries(tables)) for (const bb of [undefined, 60000, 400000]) {
    const f = J.packRows(rows, bb ? { blockBytes: bb } : undefined), all = J.unpack(f), tag = nm + ' ' + (bb || 'default') + ' ';
    const keys = Object.keys(rows[0]);
    for (const k of keys) {
      const vals = [rows[5][k], rows[100][k], rows[rows.length - 1][k], 'absent-value', null, 12345.5].map(v => v === undefined ? 'k1' : v);
      for (const v of vals) ok(same(J.unpack(f, { equals: { key: k, value: v }, positions: true }), eqQ(all, k, v)), tag + 'eq ' + k + '=' + String(v));
      ok(same(J.unpack(f, { equals: { key: k, anyOf: vals.slice(0, 3) }, positions: true }), anyQ(all, k, vals.slice(0, 3))), tag + 'anyOf ' + k);
      ok(same(J.unpack(f, { equals: { key: k, value: vals[0] }, positions: true, cache: true }), eqQ(all, k, vals[0])), tag + 'cache ignored ' + k);
    }
    ok(same(J.unpack(f, { equals: { key: 'nokey', value: null }, positions: true }), []), tag + 'missing key');
    for (const [lo, hi] of [[10, 50], [0, 1e9], [-5, -1], [100, 100], [5000, 25000]]) for (const k of ['id', 'x', 'a', 'n', 'late']) ok(same(J.unpack(f, { range: { key: k, min: lo, max: hi }, positions: true }), rgQ(all, k, lo, hi)), tag + 'range ' + k + ' ' + lo + '..' + hi);
  }
  { const f = J.pack(Buffer.from(g.events(20000)), { blockBytes: 100000 }), all = J.unpack(f), k = Object.keys(all[0])[0];
    ok(same(J.unpack(f, { equals: { key: k, value: all[7][k] }, positions: true }), eqQ(all, k, all[7][k])), 'nested file equals');
    const nk = Object.keys(all[0]).find(x => typeof all[0][x] === 'number');
    if (nk) ok(same(J.unpack(f, { range: { key: nk, min: all[10][nk], max: all[500][nk] }, positions: true }), rgQ(all, nk, all[10][nk], all[500][nk])), 'nested file range'); }
  { const f = J.packRows(tables.labels.slice(0, 20)), all = J.unpack(f); ok(same(J.unpack(f, { equals: { key: 's', value: 'k3' }, positions: true }), eqQ(all, 's', 'k3')), 'raw or tiny file'); }
  { const f = J.packRows(tables.labels, { blockBytes: 60000 }); let e = null; try { J.unpack(f, { positions: true }); } catch (er) { e = er; } ok(e !== null, 'positions alone is refused'); }
  { const f = J.packRows(tables.labels, { blockBytes: 60000 }), p = J.unpack(f, { equals: { key: 's', value: 'k3' }, positions: true }), r = J.unpack(f, { equals: { key: 's', value: 'k3' } }); ok(p.length === r.length && r.every((x, i) => x.id === p[i]), 'positions match the rows returned'); }
  J.trim && J.trim();
  console.log(bad ? 'positions: ' + bad + ' bad of ' + n : 'positions ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
