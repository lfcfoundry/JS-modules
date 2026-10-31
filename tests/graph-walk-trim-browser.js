#!/usr/bin/env node
// graph-walk trim(): time of trim() itself, and of the first call after it (graph copied in again) against a normal call, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-trim-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL WebAssembly did not start'); return false; }
  const res = await p.evaluate(async () => {
    let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, out = [];
    for (const [n, m] of [[20000, 100000], [200000, 1000000]]) {
      const f = new Int32Array(m), t = new Int32Array(m); for (let i = 0; i < m; i++) { f[i] = Math.floor(rnd() * n); t[i] = Math.floor(rnd() * n); }
      const g = GraphWalk.csr(n, f, t); GraphWalk.setBackend('wasm');
      const med = (a) => a.sort((x, y) => x - y)[a.length >> 1], steady = [], after = [], tr = [];
      GraphWalk.components(g);
      for (let r = 0; r < 7; r++) {
        let t0 = performance.now(); GraphWalk.components(g); steady.push(performance.now() - t0);
        t0 = performance.now(); await GraphWalk.trim(); tr.push(performance.now() - t0);
        t0 = performance.now(); GraphWalk.components(g); after.push(performance.now() - t0);
      }
      out.push(n + ' items, ' + m + ' links: components steady ' + med(steady).toFixed(1) + ' ms, trim() itself ' + med(tr).toFixed(1) + ' ms, first call after trim ' + med(after).toFixed(1) + ' ms');
    }
    return out;
  });
  srv.close(); console.log(res.join('\n')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, res })); return true;
});
