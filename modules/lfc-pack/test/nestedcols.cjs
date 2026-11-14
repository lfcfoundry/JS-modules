// Copyright (c) 2026 LFC Foundry. MIT License.
// Files where auto mode wrote a nested block (for example a small first block whose first row has an empty number or decimal cell) keep their column path:
// unpackColumns, unpackColumnsParallel, open().columns(i) and aggregate read the nested blocks as rows and give the same values as unpackRows. Pass/fail only. Run: node modules/lfc-pack/test/nestedcols.cjs
'use strict';
const L = require('../lfc-pack.js');
(async () => {
  await L.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
  const enc = new TextEncoder();
  const back = (e) => { const out = []; for (let i = 0; i < e.n; i++) { const o = {}; for (const k of e.keys) { const pr = e.present[k]; if (pr && !((pr[i >> 3] >> (i & 7)) & 1)) continue; } out.push(o); } for (const k of e.keys) { const pr = e.present[k], v = e.cols[k]; let c = 0; for (let i = 0; i < e.n; i++) { if (pr && !((pr[i >> 3] >> (i & 7)) & 1)) continue; out[i][k] = v[c++]; } } return out; };
  const norm = (rows, keys) => rows.map((r) => { const o = {}; for (const k of keys) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k]; return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]])); });
  let nestedSeen = 0;
  for (const first of ['null', 'empty', 'missing'])
    for (const [bb, rows] of [[1024, 50], [4096, 500], [65536, 500], [65536, 20000], [2097152, 500]]) {
      const lines = [];
      for (let i = 0; i < rows; i++) { const o = { id: i, x: i * 1.5, d: Math.round(i * 7) / 100, name: 'n' + (i % 7) }; if (i === 0) { if (first === 'null') { o.x = null; o.d = null; } else if (first === 'empty') { o.x = ''; o.d = ''; } else { delete o.x; delete o.d; } } lines.push(JSON.stringify(o)); }
      const f = L.pack(enc.encode(lines.join('\n') + '\n'), { blockBytes: bb }), R = await L.open(f), tag = first + ' ' + bb + ' ' + rows;
      if (R.blocks.some((b) => b.kind === 'n')) nestedSeen++;
      const all = L.unpackRows(f), keys = ['id', 'x', 'd', 'name'];
      let got = []; for (const e of L.unpackColumns(f)) got = got.concat(back(e));
      ok(JSON.stringify(norm(got, keys)) === JSON.stringify(norm(all, keys)), tag + ': unpackColumns');
      let got2 = []; for (const e of L.unpackColumns(f, { keys: ['x'] })) got2 = got2.concat(back(e));
      ok(JSON.stringify(norm(got2, ['x'])) === JSON.stringify(norm(all, ['x'])), tag + ': unpackColumns keys');
      const par = await L.unpackColumnsParallel(f, { workers: 2 });
      ok(par && par.x && par.x.length === all.length && all.every((r, i) => (r.x === undefined ? par.x[i] === undefined : Object.is(par.x[i], r.x))), tag + ': unpackColumnsParallel (one value per row)');
      const c0 = await R.columns(0, { keys: ['x', 'id'] }), b0 = await R.block(0);
      ok(JSON.stringify(norm(back(c0), ['x', 'id'])) === JSON.stringify(norm(b0, ['x', 'id'])), tag + ': open().columns(0) (' + R.blocks[0].kind + ')');
      const nums = all.map((r) => r.x).filter((v) => typeof v === 'number'), a = L.aggregate(f, { key: 'x' });
      ok(a.count === nums.length && Math.abs(a.sum - nums.reduce((s, v) => s + v, 0)) < 1e-6, tag + ': aggregate');
    }
  ok(nestedSeen >= 5, 'the cases include nested blocks (' + nestedSeen + ')');
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'all ' + n + ' passed');
  process.exit(bad ? 1 : 0);
})();
