#!/usr/bin/env node
// graph-walk k-core, spanning forest, PageRank and betweenness: plain JavaScript and WebAssembly against graphology-metrics 2.4 and graphology-cores 0.0.1 (spanning forest: a hand-written Kruskal, graphology has none), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: GRAPHOLOGY_BUNDLE=/path/to/gra2.js node tests/graph-walk-more-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 7)
// The bundle is graphology, graphology-metrics and graphology-cores in one script that sets window.GRA (kept out of this repository).
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 7);
if (!process.env.GRAPHOLOGY_BUNDLE) { console.log('set GRAPHOLOGY_BUNDLE to the graphology bundle (window.GRA)'); process.exit(2); }
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/gra.js': fs.readFileSync(process.env.GRAPHOLOGY_BUNDLE, 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script><script src="/gra.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL WebAssembly did not start in this browser'); return false; }
  await p.evaluate(() => {
    const GW = GraphWalk, GR = GRA; let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.sample = (key) => {
      const [who, job] = key.split(' '), f = window.jobs[job + ' ' + (who === 'graphology' ? 'gr' : 'gw')]; if (who !== 'graphology') GW.setBackend(who); let r = window.reps[key];
      if (!r) { r = 1; for (;;) { const t0 = performance.now(); for (let i = 0; i < r; i++) f(); const dt = performance.now() - t0; if (dt >= 25 || r >= 4096) break; r = Math.min(4096, Math.max(r * 2, Math.ceil(r * 25 / Math.max(dt, 0.05)))); } window.reps[key] = r; }
      const t0 = performance.now(); for (let i = 0; i < r; i++) f(); return (performance.now() - t0) / r;
    };
    window.setup = (n, m, simple) => {
      let from = [], to = [];
      if (simple) { const seen = new Set(); while (from.length < m) { const a = Math.floor(rnd() * n), c = Math.floor(rnd() * n); const k = Math.min(a, c) * n + Math.max(a, c); if (a === c || seen.has(k)) continue; seen.add(k); from.push(a); to.push(c); } }
      else for (let i = 0; i < m; i++) { from.push(Math.floor(rnd() * n)); to.push(Math.floor(rnd() * n)); }
      from = Int32Array.from(from); to = Int32Array.from(to); const w = Float64Array.from(from, () => 1 + Math.floor(rnd() * 1000) + rnd()), g = GW.csr(n, from, to), jobs = {}, res = {}, close = (x, y, tol) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= tol);
      const dg = new GR.Graph(); for (let i = 0; i < n; i++) dg.addNode(i); for (let i = 0; i < m; i++) dg.addEdge(from[i], to[i]);
      const key = (r) => Array.from({ length: n }, (_, i) => r[i]);
      if (!simple) {
        jobs['pagerank gw'] = () => GW.pagerank(g); jobs['pagerank gr'] = () => GR.pagerank(dg, { getEdgeWeight: null });
        const a = GW.pagerank(g), c = key(GR.pagerank(dg, { getEdgeWeight: null })); res.pagerank = close(Array.from(a.rank), c, 1e-9);
        const hand = () => { const idx = new Int32Array(m); for (let i = 0; i < m; i++) idx[i] = i; const sorted = Array.from(idx).sort((x, y) => w[x] - w[y]), par = new Int32Array(n).map((_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }; let tot = 0; for (const e of sorted) { const x = find(from[e]), y = find(to[e]); if (x !== y) { par[x] = y; tot += w[e]; } } return tot; };
        jobs['mst gw'] = () => GW.mst(g, w); jobs['mst gr'] = hand;
        res.mst = Math.abs(GW.mst(g, w).total - hand()) < 1e-6;
      } else if (n <= 5000) {
        jobs['betweenness gw'] = () => GW.betweenness(g); jobs['betweenness gr'] = () => GR.betweenness(dg, { getEdgeWeight: null });
        res.betweenness = close(Array.from(GW.betweenness(g)), key(GR.betweenness(dg, { getEdgeWeight: null })), 1e-9);
      } else {
        const ug = new GR.UndirectedGraph(); for (let i = 0; i < n; i++) ug.addNode(i); for (let i = 0; i < m; i++) ug.addEdge(from[i], to[i]);
        jobs['kcore gw'] = () => GW.kcore(g); jobs['kcore gr'] = () => GR.coreNumber(ug);
        res.kcore = close(Array.from(GW.kcore(g).core), key(GR.coreNumber(ug)), 0);
      }
      window.jobs = jobs; window.reps = {}; window.names = Object.keys(jobs).filter((k) => k.endsWith(' gw')).map((k) => k.split(' ')[0]); return res;
    };
  });
  const cases = [['random 100,000 items, 400,000 links', 100000, 400000, false], ['simple 100,000 items, 400,000 links', 100000, 400000, true], ['simple 2,000 items, 8,000 links', 2000, 8000, true]];
  const rows = [], answers = [];
  for (const [label, n, m, simple] of cases) {
    const same = await p.evaluate((a, c, s) => setup(a, c, s), n, m, simple); answers.push(label + ': ' + JSON.stringify(same));
    for (const job of await p.evaluate(() => names)) {
      const ms = await T.rotate(['graphology', 'js', 'wasm'], REPS, (v) => p.evaluate((k) => sample(k), v + ' ' + job));
      rows.push({ set: label, name: job, graphology: +ms.graphology.toFixed(3), js: +ms.js.toFixed(3), wasm: +ms.wasm.toFixed(3) });
    }
  }
  srv.close();
  console.log(answers.join('\n'));
  console.log(T.table(rows.map((r) => Object.assign({}, r, { vsJs: (r.graphology / r.js).toFixed(1), vsWasm: (r.graphology / r.wasm).toFixed(1), wasmGain: (r.js / r.wasm).toFixed(2) })), [{ key: 'set', title: 'graph', align: 'left' }, { key: 'name', title: 'job', align: 'left' }, { key: 'graphology', title: 'graphology ms' }, { key: 'js', title: 'JS ms' }, { key: 'wasm', title: 'wasm ms' }, { key: 'vsJs', title: 'JS vs graphology' }, { key: 'vsWasm', title: 'wasm vs graphology' }, { key: 'wasmGain', title: 'wasm vs JS' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, answers, rows }));
  return !answers.some((s) => /false/.test(s));
});
