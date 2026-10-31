#!/usr/bin/env node
// graph-walk max-flow, closeness, triangles, communities, critical path and landmark paths against other libraries (or hand-written code where no library exists), plain JavaScript and WebAssembly, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: GRAPHOLOGY_BUNDLE=/path/to/gra3.js node tests/graph-walk-newjobs-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (rounds, default 5)
// The bundle is graphology, graphology-metrics, graphology-communities-louvain, graphology-shortest-path, @algorithm.ts/dinic, ngraph.graph and ngraph.path in one script that sets window.GRA (kept out of this repository).
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 5);
if (!process.env.GRAPHOLOGY_BUNDLE) { console.log('set GRAPHOLOGY_BUNDLE to the bundle (window.GRA)'); process.exit(2); }
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/gra.js': fs.readFileSync(process.env.GRAPHOLOGY_BUNDLE, 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script><script src="/gra.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  if (!(await p.evaluate(() => GraphWalk.ready()))) { console.log('FAIL WebAssembly did not start in this browser'); return false; }
  await p.evaluate(() => {
    const GW = GraphWalk, GR = GRA; let seed = 17; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, ri = (k) => Math.floor(rnd() * k);
    window.sample = (key) => {
      const sp = key.indexOf(' '), who = key.slice(0, sp), job = key.slice(sp + 1), f = window.jobs[job][who]; if (who === 'js' || who === 'wasm') GW.setBackend(who); let r = window.reps[key];
      if (!r) { r = 1; for (;;) { const t0 = performance.now(); for (let i = 0; i < r; i++) f(); const dt = performance.now() - t0; if (dt >= 25 || r >= 4096) break; r = Math.min(4096, Math.max(r * 2, Math.ceil(r * 25 / Math.max(dt, 0.05)))); } window.reps[key] = r; }
      const t0 = performance.now(); for (let i = 0; i < r; i++) f(); return (performance.now() - t0) / r;
    };
    const simplePairs = (n, m) => { const seen = new Set(), f = [], t = []; while (f.length < m) { const a = ri(n), c = ri(n), k = Math.min(a, c) * n + Math.max(a, c); if (a === c || seen.has(k)) continue; seen.add(k); f.push(a); t.push(c); } return [f, t]; };
    window.setup = (kind) => {
      const res = {}, jobs = {}; window.jobs = jobs; window.reps = {};
      GW.setBackend('js');
      if (kind === 'flow') {
        const L = 40, Wd = 250, n = L * Wd + 2, S = n - 2, Tt = n - 1, f = [], t = [], cap = [];
        for (let j = 0; j < Wd; j++) { f.push(S); t.push(j); cap.push(1000); f.push((L - 1) * Wd + j); t.push(Tt); cap.push(1000); }
        for (let l = 0; l < L - 1; l++) for (let j = 0; j < Wd; j++) for (let k = 0; k < 4; k++) { f.push(l * Wd + j); t.push((l + 1) * Wd + ri(Wd)); cap.push(1 + ri(100)); }
        const F = Int32Array.from(f), Tn = Int32Array.from(t), C = Float64Array.from(cap);
        const dinic = () => { const d = new GR.Dinic(); d.init(S, Tt, n); for (let i = 0; i < F.length; i++) d.addEdge(F[i], Tn[i], C[i]); return d.maxflow(); };
        const ours = () => GW.maxflow(GW.csr(n, F, Tn), S, Tt, C).value;
        GW.setBackend('js'); const a = ours(), c = dinic(); GW.setBackend('wasm'); const d = ours(); res.maxflow = a === c && a === d; res.value = a;
        jobs['maxflow layered'] = { graphology: dinic, js: ours, wasm: ours };
        const n2 = 4000, f2 = [], t2 = [], cap2 = []; for (let i = 0; i < 100000; i++) { f2.push(ri(n2)); t2.push(ri(n2)); cap2.push(1 + ri(100)); }
        const F2 = Int32Array.from(f2), T2 = Int32Array.from(t2), C2 = Float64Array.from(cap2);
        const dinic2 = () => { const d = new GR.Dinic(); d.init(0, n2 - 1, n2); for (let i = 0; i < F2.length; i++) d.addEdge(F2[i], T2[i], C2[i]); return d.maxflow(); };
        const ours2 = () => GW.maxflow(GW.csr(n2, F2, T2), 0, n2 - 1, C2).value;
        GW.setBackend('js'); const a2 = ours2(); res.maxflowRandom = a2 === dinic2() && a2 === (GW.setBackend('wasm'), ours2()); res.valueRandom = a2;
        jobs['maxflow random (dense)'] = { graphology: dinic2, js: ours2, wasm: ours2 };
        const n3 = 20000, f3 = [], t3 = [], c3 = []; for (let i = 0; i < 100000; i++) { f3.push(ri(n3)); t3.push(ri(n3)); c3.push(1 + ri(100)); }
        const F3 = Int32Array.from(f3), T3 = Int32Array.from(t3), C3 = Float64Array.from(c3);
        const dinic3 = () => { const d = new GR.Dinic(); d.init(0, n3 - 1, n3); for (let i = 0; i < F3.length; i++) d.addEdge(F3[i], T3[i], C3[i]); return d.maxflow(); };
        const ours3 = () => GW.maxflow(GW.csr(n3, F3, T3), 0, n3 - 1, C3).value;
        jobs['maxflow sparse (tiny flow)'] = { graphology: dinic3, js: ours3, wasm: ours3 };
      } else if (kind === 'closeness') {
        const n = 3000, [f, t] = simplePairs(n, 12000), g = GW.csr(n, f, t), dg = new GR.Graph(); for (let i = 0; i < n; i++) dg.addNode(i); for (let i = 0; i < f.length; i++) dg.addEdge(f[i], t[i]);
        const ref = GR.closeness(dg); let ok1 = true; const a = GW.closeness(g); GW.setBackend('wasm'); const w = GW.closeness(g); for (let i = 0; i < n; i++) if (Math.abs(a[i] - ref[i]) > 1e-12 || a[i] !== w[i]) ok1 = false; res.closeness = ok1;
        jobs['closeness'] = { graphology: () => GR.closeness(dg), js: () => GW.closeness(g), wasm: () => GW.closeness(g) };
      } else if (kind === 'triangles') {
        const n = 50000, [f, t] = simplePairs(n, 250000), g = GW.csr(n, f, t);
        const hand = () => { const adj = Array.from({ length: n }, () => new Set()); for (let i = 0; i < f.length; i++) { adj[f[i]].add(t[i]); adj[t[i]].add(f[i]); } let tot = 0; for (let v = 0; v < n; v++) for (const u of adj[v]) if (u > v) for (const w of adj[u]) if (w > u && adj[v].has(w)) tot++; return tot; };
        const a = GW.triangles(g); GW.setBackend('wasm'); const w = GW.triangles(g); res.triangles = a.total === hand() && a.total === w.total && a.perItem.every((v, i) => v === w.perItem[i]); res.total = a.total;
        jobs['triangles'] = { graphology: hand, js: () => GW.triangles(g), wasm: () => GW.triangles(g) };
      } else if (kind === 'communities') {
        const groups = 100, per = 200, n = groups * per, f = [], t = [];
        for (let gi = 0; gi < groups; gi++) for (let k = 0; k < per * 4; k++) { const a = gi * per + ri(per), c = gi * per + ri(per); if (a !== c) { f.push(a); t.push(c); } }
        for (let k = 0; k < n * 0.5; k++) { const a = ri(n), c = ri(n); if (a !== c) { f.push(a); t.push(c); } }
        const g = GW.csr(n, f, t);
        const um = new GR.Graph(); for (let i = 0; i < n; i++) um.addNode(i); for (let i = 0; i < f.length; i++) um.addEdge(f[i], t[i]);
        const lv = () => GR.louvain.detailed(um, { getEdgeWeight: null }); const theirs = lv().modularity, a = GW.communities(g); GW.setBackend('wasm'); const w = GW.communities(g);
        res.communities = a.modularity >= theirs - 0.02 && a.count > 1 && a.id.every((v, i) => v === w.id[i]) && a.modularity === w.modularity; res.modularityOurs = +a.modularity.toFixed(4); res.modularityGraphology = +theirs.toFixed(4); res.groupsOurs = a.count;
        jobs['communities'] = { graphology: lv, js: () => GW.communities(g), wasm: () => GW.communities(g) };
      } else if (kind === 'critical') {
        const n = 100000, m = 400000, f = new Int32Array(m), t = new Int32Array(m), w = new Float64Array(m); for (let i = 0; i < m; i++) { let a = ri(n), c = ri(n); while (a === c) c = ri(n); if (a > c) { const x = a; a = c; c = x; } f[i] = a; t[i] = c; w[i] = 1 + ri(20) + rnd(); }
        const g = GW.csr(n, f, t);
        const hand = () => { const out = Array.from({ length: n }, () => []); const deg = new Int32Array(n); for (let i = 0; i < m; i++) { out[f[i]].push(i); deg[t[i]]++; } const q = []; for (let v = 0; v < n; v++) if (!deg[v]) q.push(v); const dist = new Float64Array(n); let best = 0; for (let h = 0; h < q.length; h++) { const v = q[h]; if (dist[v] > best) best = dist[v]; for (const e of out[v]) { const x = t[e]; if (dist[v] + w[e] > dist[x]) dist[x] = dist[v] + w[e]; if (--deg[x] === 0) q.push(x); } } return best; };
        const a = GW.criticalPath(g, w).length; GW.setBackend('wasm'); const c = GW.criticalPath(g, w).length; res.critical = Math.abs(a - hand()) < 1e-6 && a === c;
        jobs['critical path'] = { graphology: hand, js: () => GW.criticalPath(g, w), wasm: () => GW.criticalPath(g, w) };
      } else if (kind === 'landmarks') {
        const R = 200, n = R * R, f = [], t = [], w = []; const id = (x, y) => y * R + x;
        for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) { const x2 = x + dx, y2 = y + dy; if (x2 < R && y2 < R) { const c = 1 + ri(9); f.push(id(x, y)); t.push(id(x2, y2)); w.push(c); f.push(id(x2, y2)); t.push(id(x, y)); w.push(c); } }
        const g = GW.csr(n, f, t), W = Float64Array.from(w), Q = 100, qs = []; for (let i = 0; i < Q; i++) qs.push([ri(n), ri(n)]);
        const dg = new GR.Graph(); for (let i = 0; i < n; i++) dg.addNode(i); for (let i = 0; i < f.length; i++) dg.addEdgeWithKey('e' + i, f[i], t[i], { weight: W[i] });
        const ng = GR.ngraph(); for (let i = 0; i < f.length; i++) ng.addLink(f[i], t[i], { w: W[i] });
        const nba = GR.ngpath.nba(ng, { distance: (a, b, link) => link.data.w }), t0 = performance.now(); GW.setBackend('js'); const ix = GW.landmarks(g, { count: 8, weights: W }); res.landmarkBuildMs = +(performance.now() - t0).toFixed(1);
        let okc = true; for (const [a, c] of qs) { const p1 = GW.path(g, a, c, W), p2 = GW.landmarkPath(ix, a, c); if (!p1 || !p2 || Math.abs(p1.cost - p2.cost) > 1e-9) okc = false; } res.landmarks = okc;
        jobs['landmark paths (100 questions)'] = { graphology: () => { for (const [a, c] of qs) GR.dijkstra.bidirectional(dg, a, c, 'weight'); }, ngraph: () => { for (const [a, c] of qs) nba.find(a, c); }, js: () => { for (const [a, c] of qs) GW.path(g, a, c, W); }, wasm: () => { for (const [a, c] of qs) GW.landmarkPath(ix, a, c); } };
      }
      window.names = Object.keys(jobs); return res;
    };
  });
  const rows = [], answers = [];
  for (const kind of ['flow', 'closeness', 'triangles', 'communities', 'critical', 'landmarks']) {
    const same = await p.evaluate((k) => setup(k), kind); answers.push(kind + ': ' + JSON.stringify(same));
    for (const job of await p.evaluate(() => names)) {
      const impls = await p.evaluate((j) => Object.keys(jobs[j]), job);
      const ms = await T.rotate(impls, REPS, (v) => p.evaluate((k) => sample(k), v + ' ' + job));
      rows.push({ job, ms });
    }
  }
  srv.close();
  console.log(answers.join('\n'));
  for (const r of rows) console.log(r.job.padEnd(34) + Object.entries(r.ms).map(([k, v]) => k + ' ' + (v >= 100 ? Math.round(v) : v.toFixed(2))).join('   '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, answers, rows }));
  return !answers.some((s) => /false/.test(s));
});
