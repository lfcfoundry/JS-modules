#!/usr/bin/env node
// lfc-pack flat against nested blocks for rows of number lists (ids of linked items), unpack time at 30,000 and 300,000 rows, in one real browser at a time, taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-lists-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 9)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), REPS = +(process.env.REPS || 9);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(async () => {
    const J = window.LfcPack; await J.init(); let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.lists = (n) => { seed = 7; const o = []; for (let i = 0; i < n; i++) { const d = Math.floor(rnd() * 6), a = []; for (let k = 0; k < d; k++) a.push((i + Math.floor(rnd() * 200) - 100 + n) % n); a.sort((x, y) => x - y); o.push(JSON.stringify({ id: i, out: a, in: a.map((x) => (x * 7 + 3) % n) })); } return o.join('\n') + '\n'; };
    window.P = {}; window.bad = [];
    for (const n of [30000, 300000]) { const text = lists(n), want = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)); P[n] = { flat: J.pack(text, { block: 'flat' }), nested: J.pack(text, { block: 'nested' }) };
      for (const k of ['flat', 'nested']) { const got = J.unpack(P[n][k]); if (got.length !== want.length || JSON.stringify(got[n - 1]) !== JSON.stringify(want[n - 1]) || JSON.stringify(got[n >> 1]) !== JSON.stringify(want[n >> 1])) bad.push(n + ' ' + k); } }
    window.run = (n, k) => { const t0 = performance.now(); J.unpack(P[n][k]); return performance.now() - t0; };
  });
  const rows = [];
  for (const n of [30000, 300000]) { const ms = await T.rotate(['nested', 'flat'], REPS, (k) => p.evaluate((nn, kk) => run(nn, kk), n, k)); rows.push({ name: n.toLocaleString() + ' rows', before: +ms.nested.toFixed(1), after: +ms.flat.toFixed(1), bytes: await p.evaluate((nn) => P[nn].flat.length + ' vs ' + P[nn].nested.length, n) }); }
  const bad = await p.evaluate(() => bad); srv.close();
  const g = T.speedGuard(rows);
  console.log(bad.length ? 'FAIL round trips: ' + bad.join(', ') : 'round trips equal the input rows');
  console.log(T.table(g.map((r) => Object.assign({}, r, { ratio: (1 / r.ratio).toFixed(2) })), [{ key: 'name', title: 'lists set', align: 'left' }, { key: 'bytes', title: 'bytes flat vs nested', align: 'left' }, { key: 'before', title: 'nested ms' }, { key: 'after', title: 'flat ms' }, { key: 'ratio', title: 'flat / nested' }, { key: 'verdict', title: 'verdict', align: 'left' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, bad, rows: g }));
  return !bad.length && !g.some((r) => r.slower);
});
