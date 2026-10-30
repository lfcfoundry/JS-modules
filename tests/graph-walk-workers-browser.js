#!/usr/bin/env node
// graph-walk betweenness on the calling thread (JavaScript, WebAssembly) against the worker-split betweennessAsync (JavaScript and WebAssembly helpers, 2 and all cores), in one real browser at a time: same answers, then the time of each, taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-workers-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 5)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 5);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL WebAssembly did not start in this browser'); return false; }
  const cores = await p.evaluate(() => navigator.hardwareConcurrency); console.log('cores reported: ' + cores);
  await p.evaluate(() => {
    let seed = 9; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.setup = (n, m) => {
      const seen = new Set(), from = [], to = []; while (from.length < m) { const a = Math.floor(rnd() * n), c = Math.floor(rnd() * n), k = Math.min(a, c) * n + Math.max(a, c); if (a === c || seen.has(k)) continue; seen.add(k); from.push(a); to.push(c); }
      window.G = GraphWalk.csr(n, from, to); window.ref = null;
    };
    const runs = { 'sync-js': () => { GraphWalk.setBackend('js'); return Promise.resolve(GraphWalk.betweenness(G)); }, 'sync-wasm': () => { GraphWalk.setBackend('wasm'); return Promise.resolve(GraphWalk.betweenness(G)); },
      'workers2-wasm': () => { GraphWalk.setBackend('wasm'); return GraphWalk.betweennessAsync(G, { workers: 2 }); }, 'workers-all-js': () => { GraphWalk.setBackend('js'); return GraphWalk.betweennessAsync(G, { workers: Math.min(8, navigator.hardwareConcurrency) }); },
      'workers-all-wasm': () => { GraphWalk.setBackend('wasm'); return GraphWalk.betweennessAsync(G, { workers: Math.min(8, navigator.hardwareConcurrency) }); } };
    window.check = async () => { const a = await runs['sync-js'](), res = {}; for (const k of Object.keys(runs)) { const c = await runs[k](); res[k] = c.length === a.length && a.every((v, i) => Math.abs(v - c[i]) < 1e-9); } return res; };
    window.time = async (k) => { const t0 = performance.now(); await runs[k](); return performance.now() - t0; };
  });
  const rows = [], answers = [];
  for (const [n, m] of [[2000, 8000], [5000, 20000]]) {
    await p.evaluate((a, c) => setup(a, c), n, m); answers.push(n + ' items, ' + m + ' links: ' + JSON.stringify(await p.evaluate(() => check())));
    const names = ['sync-js', 'sync-wasm', 'workers2-wasm', 'workers-all-js', 'workers-all-wasm'];
    const ms = await T.rotate(names, REPS, (k) => p.evaluate((x) => time(x), k));
    for (const k of names) rows.push({ set: n + ' items, ' + m + ' links', name: k, ms: +ms[k].toFixed(1), vsSyncJs: (ms['sync-js'] / ms[k]).toFixed(2) });
  }
  srv.close();
  console.log(answers.join('\n'));
  console.log(T.table(rows, [{ key: 'set', title: 'graph', align: 'left' }, { key: 'name', title: 'mode', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'vsSyncJs', title: 'vs sync JS' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, cores, answers, rows }));
  return !answers.some((s) => /false/.test(s));
});
