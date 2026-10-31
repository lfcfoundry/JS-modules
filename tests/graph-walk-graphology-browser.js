#!/usr/bin/env node
// graph-walk (components, strongly connected components, topological order, shortest paths) against graphology 0.26 and its component, shortest-path and dag packages, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: GRAPHOLOGY_BUNDLE=/path/to/gra.js node tests/graph-walk-graphology-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 7), QUICK=1 (10,000-item graph only)
// The bundle is graphology, graphology-components, graphology-shortest-path and graphology-dag in one script that sets window.GRA (kept out of this repository).
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const REPS = +(process.env.REPS || 7), QUICK = !!process.env.QUICK;
if (!process.env.GRAPHOLOGY_BUNDLE) { console.log('set GRAPHOLOGY_BUNDLE to the graphology bundle (window.GRA)'); process.exit(2); }
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': rd('graph-walk/graph-walk.js'), '/gra.js': fs.readFileSync(process.env.GRAPHOLOGY_BUNDLE, 'utf8'),
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script><script src="/gra.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => {
    const GW = GraphWalk, GR = GRA;
    let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.reps = {};
    // one timing sample: runs the job enough times to last about 25 ms (Firefox rounds timers), returns ms per run
    window.sample = (key) => { try { return window.sample0(key); } catch (e) { return -1; } };
    window.sample0 = (key) => { const f = window.jobs[key]; let r = window.reps[key]; if (!r) { r = 1; for (;;) { const t0 = performance.now(); for (let i = 0; i < r; i++) f(); const dt = performance.now() - t0; if (dt >= 25 || r >= 4096) break; r = Math.min(4096, Math.max(r * 2, Math.ceil(r * 25 / Math.max(dt, 0.05)))); } window.reps[key] = r; } const t0 = performance.now(); for (let i = 0; i < r; i++) f(); return (performance.now() - t0) / r; };
    window.setup = (n, m, kind) => {
      const from = new Int32Array(m), to = new Int32Array(m), w = new Float64Array(m);
      for (let i = 0; i < m; i++) { let a = Math.floor(rnd() * n), c = Math.floor(rnd() * n); if (kind === 'dag') { while (a === c) c = Math.floor(rnd() * n); if (a > c) { const t = a; a = c; c = t; } } from[i] = a; to[i] = c; w[i] = 1 + Math.floor(rnd() * 20) + rnd(); }
      const buildGr = () => { const g = new GR.Graph(); for (let i = 0; i < n; i++) g.addNode(i); for (let i = 0; i < m; i++) g.addEdgeWithKey('e' + i, from[i], to[i], { weight: w[i] }); return g; };
      const res = {}; const g = GW.csr(n, from, to), gr = buildGr(), jobs = {};
      // start from the item that reaches the most (best of 40 tries) and aim at a random item it reaches, so every path job does real work
      let src = 0, bestReach = -1; for (let t = 0; t < 40; t++) { const c0 = t ? Math.floor(rnd() * n) : 0, d0 = GW.bfs(g, c0); let r0 = 0; for (let i = 0; i < n; i++) if (d0[i] >= 0) r0++; if (r0 > bestReach) { bestReach = r0; src = c0; } }
      const dd = GW.bfs(g, src); let target = src; for (let tries = 0; tries < 1000 && (target === src || dd[target] < 0); tries++) target = Math.floor(rnd() * n);
      res.reach = bestReach; res.pathLinks = dd[target];
      // answers must agree before anything is timed
      const part = (ours, theirs) => { const map = new Map(); let ok = true; const seen = new Set(); for (const grp of theirs) { const id = ours[+grp[0]]; if (seen.has(id)) ok = false; seen.add(id); for (const k of grp) if (ours[+k] !== id) ok = false; } return ok && seen.size === new Set(ours).size; };
      const und = (() => { const x = new GR.UndirectedGraph(); for (let i = 0; i < n; i++) x.addNode(i); for (let i = 0; i < m; i++) x.addEdge(from[i], to[i]); return x; })();
      const c = GW.components(g); res.components = part(c.id, GR.connectedComponents(und));
      const sc = GW.scc(g); try { res.scc = part(sc.id, GR.stronglyConnectedComponents(gr)); } catch (e) { res.scc = 'graphology throws: ' + e.message; }
      if (kind === 'dag') { const t = GW.topo(g), tg = GR.topologicalSort(gr), pos = new Int32Array(n); t.order.forEach((v, i) => { pos[v] = i; }); let ok = t.complete && t.order.length === tg.length; for (let i = 0; i < m; i++) if (pos[from[i]] >= pos[to[i]]) ok = false; res.topo = ok; }
      const r = GW.shortest(g, src, w), best = new Map(); for (let i = 0; i < m; i++) { const k = from[i] * n + to[i]; if (!(best.get(k) <= w[i])) best.set(k, w[i]); }
      const cost = (path) => { let s = 0; for (let i = 1; i < path.length; i++) s += best.get(+path[i - 1] * n + +path[i]); return s; };
      const all = GR.dijkstra.singleSource(gr, src, 'weight'); let okd = true, reached = 0; for (const k in all) { reached++; if (Math.abs(cost(all[k]) - r.dist[+k]) > 1e-6) okd = false; } for (let v = 0; v < n; v++) if (r.dist[v] < Infinity) reached--; res.dijkstra = okd && reached === 0;
      const bp = GR.dijkstra.bidirectional(gr, src, target, 'weight'); const rt = GW.path(g, src, target, w); res.dijkstraTarget = bp ? !!rt && Math.abs(cost(bp) - rt.cost) < 1e-6 && Math.abs(cost(bp) - cost(rt.links.map((e) => from[e]).concat([target]))) < 1e-6 : rt === null; const ub = GR.unweighted.bidirectional(gr, src, target), ru = GW.path(g, src, target); res.linksTarget = ub ? !!ru && ru.links.length === ub.length - 1 : ru === null;
      const ul = GR.unweighted.singleSourceLength(gr, src), u = GW.shortest(g, src); let oku = true, cnt = 0; for (const k in ul) { cnt++; if (ul[k] !== u.dist[+k]) oku = false; } for (let v = 0; v < n; v++) if (u.dist[v] < Infinity) cnt--; res.unweighted = oku && cnt === 0;
      jobs['build ours'] = () => GW.csr(n, from, to); jobs['build graphology'] = buildGr;
      jobs['components ours'] = () => GW.components(g); jobs['components graphology'] = () => GR.connectedComponents(und);
      jobs['scc ours'] = () => GW.scc(g); jobs['scc graphology'] = () => GR.stronglyConnectedComponents(gr);
      if (kind === 'dag') { jobs['topo ours'] = () => GW.topo(g); jobs['topo graphology'] = () => GR.topologicalSort(gr); }
      jobs['links ours'] = () => GW.shortest(g, src); jobs['links graphology'] = () => GR.unweighted.singleSourceLength(gr, src);
      jobs['links-one ours'] = () => GW.path(g, src, target); jobs['links-one graphology'] = () => GR.unweighted.bidirectional(gr, src, target);
      jobs['cold-one ours'] = () => { g._scratch = null; g.inEdge = null; return GW.path(g, src, target, w); }; jobs['cold-one graphology'] = () => GR.dijkstra.bidirectional(gr, src, target, 'weight');   // first call: builds the links-into-items index and working arrays
      jobs['dijkstra-all ours'] = () => GW.shortest(g, src, w); jobs['dijkstra-all graphology'] = () => GR.dijkstra.singleSource(gr, src, 'weight');
      jobs['dijkstra-one ours'] = () => GW.path(g, src, target, w); jobs['dijkstra-one graphology'] = () => GR.dijkstra.bidirectional(gr, src, target, 'weight');
      window.jobs = jobs; window.reps = {}; return res;
    };
  });
  const cases = QUICK ? [['random 10,000 items, 40,000 links', 10000, 40000, 'rnd']] : [
    ['random 10,000 items, 40,000 links', 10000, 40000, 'rnd'], ['random 100,000 items, 400,000 links', 100000, 400000, 'rnd'],
    ['sparse 100,000 items, 120,000 links (many small groups)', 100000, 120000, 'rnd'], ['acyclic 100,000 items, 400,000 links', 100000, 400000, 'dag']];
  const rows = [], allSame = [];
  for (const [label, n, m, kind] of cases) {
    const same = await p.evaluate((a, bb, k) => setup(a, bb, k), n, m, kind); allSame.push(label + ': ' + JSON.stringify(same));
    const steps = [['build', 'build'], ['components', 'components'], ['strongly connected', 'scc']].concat(kind === 'dag' ? [['topological order', 'topo']] : [])
      .concat([['paths by links (all items)', 'links'], ['path by links (one target)', 'links-one'], ['weighted paths (all items)', 'dijkstra-all'], ['weighted path (one target)', 'dijkstra-one'], ['weighted path, first call (builds index)', 'cold-one']]);
    for (const [title, key] of steps) {
      let threw = false;
      let ms = null; try { ms = await T.rotate(['ours', 'graphology'], REPS, async (v) => { const x = await p.evaluate((k) => sample(k), key + ' ' + v); if (x < 0) threw = true; return x; }); } catch (e) { threw = true; }
      if (threw) { rows.push({ set: label, name: title, before: NaN, after: NaN, failed: 'x' }); console.log(label + ' / ' + title + ': graphology throws, call stack too deep'); continue; }
      rows.push({ set: label, name: title, before: +ms.graphology.toFixed(3), after: +ms.ours.toFixed(3) });
    }
  }
  srv.close();
  const g = T.speedGuard(rows.filter((r) => !r.failed)).concat(rows.filter((r) => r.failed));
  console.log(allSame.join('\n'));
  console.log(T.table(g.filter((r) => !r.failed).map((r) => Object.assign({}, r, { ratio: r.ratio.toFixed(1) })), [{ key: 'set', title: 'graph', align: 'left' }, { key: 'name', title: 'job', align: 'left' }, { key: 'before', title: 'graphology ms' }, { key: 'after', title: 'graph-walk ms' }, { key: 'ratio', title: 'times faster' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, answers: allSame, rows: g }));
  return !allSame.some((s) => /:false/.test(s)) && !g.some((r) => r.slower);
});
