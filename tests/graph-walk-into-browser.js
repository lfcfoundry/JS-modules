#!/usr/bin/env node
// graph-walk: each call with a new result array against the same call handed its previous result (WebAssembly kernels), alone and all together, early-stop A/B (tools/test-runner/ab.js), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-into-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), AB = require('../tools/test-runner/ab.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL no WebAssembly'); return false; }
  await p.evaluate(() => {
    let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const n = 500000, m = 1500000, f = new Int32Array(m), t = new Int32Array(m), w = new Float64Array(m); for (let i = 0; i < m; i++) { f[i] = Math.floor(rnd() * n); t[i] = Math.floor(rnd() * n); w[i] = 1 + Math.floor(rnd() * 9); }
    const G = GraphWalk.csr(n, f, t), small = GraphWalk.csr(3000, f.subarray(0, 12000).map((v) => v % 3000), t.subarray(0, 12000).map((v) => v % 3000)); GraphWalk.setBackend('wasm');
    const prev = {};
    const calls = {
      components: (u) => (prev.c = GraphWalk.components(G, u ? prev.c : undefined)), kcore: (u) => (prev.k = GraphWalk.kcore(G, u ? prev.k : undefined)),
      shortest: (u) => (prev.d = GraphWalk.shortest(G, 0, w, undefined, u ? prev.d : undefined)), pagerank: (u) => (prev.p = GraphWalk.pagerank(G, { into: u ? prev.p : undefined })),
    };
    calls['all together'] = (u) => { for (const k of ['components', 'kcore', 'shortest', 'pagerank']) calls[k](u); };
    window.names = Object.keys(calls);
    window.run = (nm, u) => { const t0 = performance.now(); calls[nm](u); return performance.now() - t0; };
  });
  const rows = [];
  for (const nm of await p.evaluate(() => names)) {
    await p.evaluate((x) => { run(x, true); run(x, true); }, nm);
    const d = await AB.abSequential(() => p.evaluate((x) => run(x, false), nm), () => p.evaluate((x) => run(x, true), nm), { limit: 0.05, minRounds: 4, maxRounds: 12 });
    rows.push(nm.padEnd(24) + 'previous result handed back / new array = ' + d.ratio.toFixed(2) + ' (' + d.low.toFixed(2) + ' to ' + d.high.toFixed(2) + '), ' + d.rounds + ' rounds, ' + d.verdict + (d.noisy ? ', noisy' : ''));
  }
  srv.close(); console.log(rows.join('\n')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows })); return true;
});
