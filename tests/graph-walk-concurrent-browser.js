#!/usr/bin/env node
// graph-walk: two helper jobs at once (betweennessAsync and closenessAsync on two graphs) must finish with the same answers as one at a time, and a pool closed mid-job must not hang. One real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/';
T.main(async (b) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); await p.evaluate(() => GraphWalk.ready());
  const r = await p.evaluate(async () => {
    let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, mk = (n, m) => { const f = [], t = []; while (f.length < m) { const a = Math.floor(rnd() * n), c = Math.floor(rnd() * n); if (a !== c) { f.push(a); t.push(c); } } return GraphWalk.csr(n, f, t); };
    const A = mk(2500, 10000), B = mk(3000, 12000), same = (x, y) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-9), W = Math.min(4, navigator.hardwareConcurrency), o = { workers: W, idleMs: 300 }, res = {};
    for (const be of ['js', 'wasm']) {
      GraphWalk.setBackend(be); GraphWalk.closePool();
      const bA = GraphWalk.betweenness(A), cB = GraphWalk.closeness(B), bB = GraphWalk.betweenness(B), cA = GraphWalk.closeness(A);
      const race = (ps) => Promise.race([Promise.all(ps), new Promise((_, rej) => setTimeout(() => rej(new Error('hang')), 60000))]);
      try {
        const [x1, y1, x2, y2] = await race([GraphWalk.betweennessAsync(A, o), GraphWalk.closenessAsync(B, o), GraphWalk.betweennessAsync(B, o), GraphWalk.closenessAsync(A, o)]);
        res[be + ' four at once'] = same(x1, bA) && same(y1, cB) && same(x2, bB) && same(y2, cA);
        const q = GraphWalk.betweennessAsync(A, o); await new Promise((r2) => setTimeout(r2, 5)); GraphWalk.closePool();   // pool closed mid-job
        res[be + ' closed mid-job'] = same(await race([q]).then((v) => v[0]), bA);
        const first = GraphWalk.betweennessAsync(A, o), second = GraphWalk.closenessAsync(B, Object.assign({ idleMs: 50 }, o));   // the second finishing must not end the first's helpers
        const [f1, s1] = await race([first, second]); res[be + ' early timer'] = same(f1, bA) && same(s1, cB);
      } catch (e) { res[be] = String(e); }
      GraphWalk.closePool();
    }
    return res;
  });
  srv.close(); console.log(JSON.stringify(r, null, 1)); return Object.values(r).every((v) => v === true);
});
