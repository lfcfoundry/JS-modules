// Copyright (c) 2026 LFC Foundry. MIT License.
// B38: unpackRowsParallel gives the same rows as unpackRows (JSON compare), on the first and later calls, for several layouts and block sizes; other options, nested and one-block files fall back.
'use strict';
const J = require('../lfc-pack.js'), g = require('./gen.cjs');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const tables = {
    numeric: Array.from({ length: 30000 }, (_, i) => ({ id: i, x: i * 0.5, n: i % 5 ? null : i })),
    labels: Array.from({ length: 30000 }, (_, i) => ({ id: i, s: 'k' + (i % 9), b: i % 2 === 0, t: 'row ' + i })),
    sparse: Array.from({ length: 30000 }, (_, i) => { const o = { id: i }; if (i % 3) o.a = i * 2; if (i % 4 === 0) o.b = 'x' + (i % 5); if (i > 20000) o.late = i; return o; }),
    logs: JSON.parse('[' + g.logs(20000).trim().split('\n').join(',') + ']')
  };
  for (const [nm, rows] of Object.entries(tables)) for (const bb of [undefined, 100000, 400000]) {
    const f = J.packRows(rows, bb ? { blockBytes: bb } : undefined), want = JSON.stringify(J.unpackRows(f));
    for (const call of ['first', 'second', 'third']) { let e = ''; try { e = JSON.stringify(await J.unpackRowsParallel(f, { workers: 2 })) === want ? '' : 'rows differ'; } catch (er) { e = 'ERR ' + er.message; } ok(!e, nm + ' ' + (bb || 'default') + ' ' + call + ' ' + e); }
  }
  { const f = J.packRows(tables.labels, { blockBytes: 100000 }), a = await J.unpackRowsParallel(f, { workers: 2, keys: ['id'] }); ok(JSON.stringify(a) === JSON.stringify(J.unpackRows(f, { keys: ['id'] })), 'other options go to unpackRows'); }
  { const f = J.pack(Buffer.from(g.events(20000)), { blockBytes: 100000 }); ok(JSON.stringify(await J.unpackRowsParallel(f, { workers: 2 })) === JSON.stringify(J.unpackRows(f)), 'nested file falls back to unpackRows'); }
  { const f = J.packRows(tables.numeric.slice(0, 50)); ok(JSON.stringify(await J.unpackRowsParallel(f)) === JSON.stringify(J.unpackRows(f)), 'one-block file'); }
  { const f = J.packRows(tables.labels, { blockBytes: 100000 }), bad2 = Uint8Array.from(f); bad2[Math.floor(f.length / 2)] ^= 1; let e = null; try { await J.unpackRowsParallel(bad2, { workers: 2 }); } catch (er) { e = er; } ok(e !== null, 'a damaged file is refused'); }
  J.trim && J.trim();
  console.log(bad ? 'b38: ' + bad + ' bad of ' + n : 'b38 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
