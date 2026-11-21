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
  { const f = J.pack(Buffer.from(g.events(20000)), { blockBytes: 100000 }), c = await J.unpackColumnsParallel(f, { keys: ['id', 'type'] }), r = J.unpackRows(f); ok(c.id.length === r.length && r.every((x, k) => c.id[k] === x.id && c.type[k] === x.type), 'nested blocks are read as rows, then columns (0.10.28)'); }
  { const rows = tables.labels, f = J.packRows(rows, { blockBytes: 100000 }), nb = J.stats(f).length, base = await J.unpackColumnsParallel(f, { workers: 2 });   // onBlock (since 0.14.11): once per block as it is read, the joined result as before
    for (const call of ['first', 'second', 'third']) {
      const seen = [], got = await J.unpackColumnsParallel(f, { workers: 2, onBlock: (b, i, c) => seen.push([i, c, b.n, Object.keys(b.cols).join()]) });
      ok(seen.length === nb && nb > 2, 'onBlock ' + call + ': one call per block (' + seen.length + ' of ' + nb + ')');
      ok(new Set(seen.map((x) => x[0])).size === nb && seen.every((x) => x[1] === nb), 'onBlock ' + call + ': every index once, count given');
      ok(seen.reduce((a, x) => a + x[2], 0) === rows.length, 'onBlock ' + call + ': block rows add up');
      ok(JSON.stringify(got) === JSON.stringify(base), 'onBlock ' + call + ': joined result unchanged');
    }
    let msg = ''; try { await J.unpackColumnsParallel(f, { workers: 2, onBlock: () => { throw new Error('stop here'); } }); } catch (e) { msg = e.message; } ok(msg === 'stop here', 'a throwing onBlock rejects the read: ' + msg);
    msg = ''; try { await J.unpackColumnsParallel(f, { onBlock: 5 }); } catch (e) { msg = e.message; } ok(/onBlock must be a function/.test(msg), 'onBlock must be a function: ' + msg);
  }
  J.trim && J.trim();
  console.log(bad ? 'b35: ' + bad + ' bad of ' + n : 'b35 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
