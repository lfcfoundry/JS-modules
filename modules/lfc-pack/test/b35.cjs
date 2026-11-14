// Copyright (c) 2026 LFC Foundry. MIT License.
// B35: unpackColumnsParallel gives every value unpackRows gives (Object.is; undefined where a row lacks the key), with and without helpers, for several block sizes, sparse rows, nulls, mixed types, the keys option, and nested blocks rejected. Pass/fail only. Run: node modules/lfc-pack/test/b35.cjs
'use strict';
const J = require('../lfc-pack.js'), g = require('./gen.cjs');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const same = (rows, C, keys) => { const ks = new Set(); rows.forEach((r) => Object.keys(r).forEach((k) => ks.add(k))); const want = keys ? [...ks].filter((k) => keys.includes(k)) : [...ks]; if (Object.keys(C).sort().join() !== want.sort().join()) return 'keys ' + Object.keys(C).join(); for (const k of want) { const a = C[k]; if (a.length !== rows.length) return 'length ' + k; for (let i = 0; i < rows.length; i++) { const v = Object.prototype.hasOwnProperty.call(rows[i], k) ? rows[i][k] : undefined; if (!Object.is(a[i], v)) return k + '[' + i + '] ' + a[i] + ' vs ' + v; } } return ''; };
  const tables = {
    numeric: Array.from({ length: 30000 }, (_, i) => ({ id: i, x: i * 0.5, y: (i * 7919) % 1001 / 3, n: i % 5 ? null : i })),
    labels: Array.from({ length: 30000 }, (_, i) => ({ id: i, s: 'k' + (i % 9), b: i % 2 === 0, t: 'row ' + i })),
    sparse: Array.from({ length: 30000 }, (_, i) => { const o = { id: i }; if (i % 3) o.a = i * 2; if (i % 4 === 0) o.b = 'x' + (i % 5); if (i > 20000) o.late = i; return o; }),
    mixed: Array.from({ length: 30000 }, (_, i) => ({ id: i, v: i % 7 === 0 ? 'text' + i : i % 3 ? i : null })),
    logs: JSON.parse('[' + g.logs(20000).trim().split('\n').join(',') + ']')
  };
  for (const [nm, rows] of Object.entries(tables)) for (const bb of [undefined, 100000, 400000]) {
    const f = J.packRows(rows, bb ? { blockBytes: bb } : undefined); let C = null, e = '';
    for (const call of ['first', 'second']) { try { C = await J.unpackColumnsParallel(f, { workers: 2 }); e = same(J.unpackRows(f), C); } catch (er) { e = 'ERR ' + er.message; } ok(!e, nm + ' ' + bb + ' ' + call + ' call matches unpackRows ' + e); await new Promise((r) => setTimeout(r, 30)); }
  }
  { const rows = tables.numeric, f = J.packRows(rows, { blockBytes: 100000 }), C = await J.unpackColumnsParallel(f, { keys: ['x', 'id'], workers: 2 }); ok(same(rows, C, ['x', 'id']) === '', 'keys option'); }
  { const f = J.pack(Buffer.from(g.events(20000)), { blockBytes: 100000 }); let e = null; try { await J.unpackColumnsParallel(f); } catch (er) { e = er; } ok(e !== null, 'nested blocks are rejected'); }
  J.trim && J.trim();
  console.log(bad ? 'b35: ' + bad + ' bad of ' + n : 'b35 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
