#!/usr/bin/env node
// graph-walk closeness on the calling thread against closenessAsync (kept helper threads), plain JavaScript and WebAssembly, early-stop A/B (tools/test-runner/ab.js), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-closeness-async-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), AB = require('../tools/test-runner/ab.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL WebAssembly did not start in this browser'); return false; }
  console.log('cores reported: ' + await p.evaluate(() => navigator.hardwareConcurrency));
  await p.evaluate(() => {
    let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.setup = (n, m) => { const f = [], t = []; while (f.length < m) { const a = Math.floor(rnd() * n), c = Math.floor(rnd() * n); if (a !== c) { f.push(a); t.push(c); } } window.G = GraphWalk.csr(n, f, t); };
    window.sync = (be) => { GraphWalk.setBackend(be); const t0 = performance.now(); GraphWalk.closeness(G); return performance.now() - t0; };
    window.asyn = async (be) => { GraphWalk.setBackend(be); const t0 = performance.now(); await GraphWalk.closenessAsync(G, { workers: Math.min(8, navigator.hardwareConcurrency) }); return performance.now() - t0; };
    window.same = async () => { const res = {}; for (const be of ['js', 'wasm']) { GraphWalk.setBackend(be); const a = GraphWalk.closeness(G), c = await GraphWalk.closenessAsync(G, { workers: 4, pool: false }), d = await GraphWalk.closenessAsync(G, { workers: 4 }); res[be] = a.every((v, i) => v === c[i] && v === d[i]); GraphWalk.closePool(); } return res; };
  });
  const rows = [], answers = [];
  for (const [n, m] of [[1500, 6000], [3000, 12000], [8000, 32000]]) {
    await p.evaluate((a, c) => setup(a, c), n, m); answers.push(n + '/' + m + ': ' + JSON.stringify(await p.evaluate(() => same())));
    for (const be of ['js', 'wasm']) {
      await p.evaluate((x) => asyn(x), be);   // starts the helpers and loads the graph once, like a user's second call
      const d = await AB.abSequential(() => p.evaluate((x) => sync(x), be), () => p.evaluate((x) => asyn(x), be), { limit: 0.05, minRounds: 4, maxRounds: 12 });
      rows.push(n + ' items, ' + m + ' links, ' + be + ': helpers/calling thread = ' + d.ratio.toFixed(2) + ' (' + d.low.toFixed(2) + ' to ' + d.high.toFixed(2) + '), ' + d.rounds + ' rounds, ' + d.verdict + (d.noisy ? ', noisy' : ''));
    }
  }
  srv.close(); console.log(answers.join('\n') + '\n' + rows.join('\n'));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, answers, rows }));
  return !answers.some((s) => /false/.test(s));
});
