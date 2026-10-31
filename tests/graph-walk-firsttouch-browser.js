#!/usr/bin/env node
// graph-walk: how much of a call is the first write into fresh result arrays (fresh vs reused), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); await p.evaluate(() => GraphWalk.ready());
  const res = await p.evaluate(async () => {
    let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, out = [];
    const n = 1000000, m = 3000000, f = new Int32Array(m), t = new Int32Array(m); for (let i = 0; i < m; i++) { f[i] = Math.floor(rnd() * n); t[i] = Math.floor(rnd() * n); }
    const g = GraphWalk.csr(n, f, t); GraphWalk.setBackend('wasm');
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1], tm = (fn, r) => { const a = []; for (let i = 0; i < r; i++) { const t0 = performance.now(); fn(); a.push(performance.now() - t0); } return med(a); };
    const keep = new Float64Array(n);
    const fresh = tm(() => { const a = new Float64Array(n); a.fill(1.5); return a[7]; }, 15), reused = tm(() => { keep.fill(1.5); return keep[7]; }, 15);
    GraphWalk.components(g); GraphWalk.shortest(g, 0); GraphWalk.pagerank(g);
    let prev = GraphWalk.components(g); const reuse = tm(() => { prev = GraphWalk.components(g, prev); }, 15), fr = tm(() => GraphWalk.components(g), 15);
    out.push('components 1M items: new result each call ' + fr.toFixed(1) + ' ms, result handed back ' + reuse.toFixed(1) + ' ms');
    out.push('write 8 MB array: fresh ' + fresh.toFixed(2) + ' ms, reused ' + reused.toFixed(2) + ' ms');
    for (const [nm, fn] of [['components', () => GraphWalk.components(g)], ['shortest', () => GraphWalk.shortest(g, 0)], ['pagerank', () => GraphWalk.pagerank(g)], ['kcore', () => GraphWalk.kcore(g)]]) out.push(nm + ' ' + tm(fn, 9).toFixed(1) + ' ms per call');
    return out;
  });
  srv.close(); console.log(res.join('\n')); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, res })); return true;
});
