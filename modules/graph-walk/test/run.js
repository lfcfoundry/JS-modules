/* Copyright (c) 2026 LFC Foundry. MIT License. graph-walk checks (Node, pass/fail only): bfs and loops give exactly what Netflow Map's own inline walks give (reference copies below), on random graphs with self-links, repeated links, loops and unreached parts, plus a 30,000 item generated network. Run: node modules/graph-walk/test/run.js */
'use strict';
const G = require('../graph-walk.js'), fixture = require('../../netflow-scene/test/fixture.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// reference: the walks as Netflow Map's engine writes them today (src/engine.js bfs, and the loop-dropping depth-first in the traffic step)
function refBfs(P, root, skip) {
  var d = new Int32Array(P.n).fill(-1);
  if (root < 0 || root === skip || P.n === 0) return d;
  var q = new Int32Array(P.n), h = 0, tl = 0; q[tl++] = root; d[root] = 0;
  while (h < tl) { var v = q[h++]; for (var k = P.outStart[v]; k < P.outStart[v + 1]; k++) { var w = P.to[P.outEdge[k]]; if (w !== skip && d[w] < 0) { d[w] = d[v] + 1; q[tl++] = w; } } }
  return d;
}
function refLoops(P, start) {
  var n = P.n, state = new Uint8Array(n), keep = new Uint8Array(P.m), post = [], sp = 0, it = new Int32Array(n), stack = new Int32Array(n + 1);
  const outdeg = (v) => P.outStart[v + 1] - P.outStart[v];
  stack[sp++] = start; state[start] = 1;
  while (sp) {
    var v2 = stack[sp - 1], k2 = it[v2];
    if (k2 < outdeg(v2)) { it[v2]++; var e = P.outEdge[P.outStart[v2] + k2], w2 = P.to[e]; if (state[w2] === 1) continue; keep[e] = 1; if (!state[w2]) { state[w2] = 1; stack[sp++] = w2; } }
    else { state[v2] = 2; post.push(v2); sp--; }
  }
  return { keep, post };
}
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
let graphs = 0;
function check(name, n, from, to, roots) {
  const g = G.csr(n, from, to); graphs++;
  for (const r of roots) {
    ok(same(G.bfs(g, r), refBfs(g, r)), name + ': bfs root ' + r);
    const skip = (r + 1) % Math.max(1, n); ok(same(G.bfs(g, r, skip), refBfs(g, r, skip)), name + ': bfs root ' + r + ' skip ' + skip);
    const out = new Int32Array(n).fill(7); ok(G.bfs(g, r, -1, out) === out && same(out, refBfs(g, r)), name + ': bfs reuses out');
    if (r >= 0 && r < n) {
      const a = G.loops(g, r), b = refLoops(g, r);
      ok(same(a.keep, b.keep) && same(a.post, b.post), name + ': loops root ' + r);
      let c = 0; for (let i = 0; i < g.m; i++) { if (a.closes[i]) { c++; ok(!a.keep[i], name + ': closes and keep overlap'); } }
      ok(c === a.count, name + ': loop count');
      // keep must be loop-free: walking only kept links never returns to an item
      const indeg = new Int32Array(n); for (let i = 0; i < g.m; i++) if (a.keep[i]) indeg[g.to[i]]++;
      const q = []; for (let v = 0; v < n; v++) if (!indeg[v]) q.push(v); let seen = 0;
      while (q.length) { const v = q.pop(); seen++; for (let k = g.outStart[v]; k < g.outStart[v + 1]; k++) { const e = g.outEdge[k]; if (a.keep[e] && --indeg[g.to[e]] === 0) q.push(g.to[e]); } }
      ok(seen === n, name + ': kept links still hold a loop');
    }
  }
}
check('empty', 0, [], [], [-1, 0]);
check('one item', 1, [], [], [0, 1, -1]);
check('self link', 1, [0], [0], [0]);
check('two loop', 2, [0, 1], [1, 0], [0, 1]);
check('repeated links', 3, [0, 0, 0, 1], [1, 1, 2, 2], [0, 1, 2]);
const r = rng(5);
for (let t = 0; t < 300; t++) {
  const n = 1 + Math.floor(r() * 60), m = Math.floor(r() * n * 3), f = [], to = [];
  for (let i = 0; i < m; i++) { f.push(Math.floor(r() * n)); to.push(Math.floor(r() * n)); }
  check('random ' + t, n, f, to, [0, Math.floor(r() * n), n - 1, -1, n]);
}
const net = fixture(30000, 6, 7), idx = new Map(net.nodes.map((x, i) => [x.id, i])), f2 = [], t2 = [];
for (const e of net.edges) { if (idx.has(e.from) && idx.has(e.to)) { f2.push(idx.get(e.from)); t2.push(idx.get(e.to)); } }
check('generated 30,000 items', net.nodes.length, f2, t2, [0, 12345]);

// components, scc, topo, shortest, pathTo against slow textbook references (reachability matrix, Bellman-Ford)
function newChecks(name, n, f, t, w, r2) {
  const g = G.csr(n, f, t), m = f.length;
  const R = []; for (let i = 0; i < n; i++) { R.push(new Uint8Array(n)); R[i][i] = 1; } for (let i = 0; i < m; i++) R[f[i]][t[i]] = 1;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (R[i][k]) for (let j = 0; j < n; j++) if (R[k][j]) R[i][j] = 1;
  const U = R.map((row) => Uint8Array.from(row)); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (R[i][j]) U[j][i] = 1;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (U[i][k]) for (let j = 0; j < n; j++) if (U[k][j]) U[i][j] = 1;
  const c = G.components(g); let ok1 = c.id.length === n, seenIds = 0;
  for (let i = 0; i < n; i++) { if (c.id[i] > seenIds) ok1 = false; else if (c.id[i] === seenIds) seenIds++; for (let j = 0; j < n; j++) if ((c.id[i] === c.id[j]) !== !!U[i][j]) ok1 = false; }
  ok(ok1 && c.count === seenIds && c.sizes.reduce((a, b) => a + b, 0) === n, name + ': components');
  const s = G.scc(g); let ok2 = s.id.length === n; const ids = new Set(s.id);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if ((s.id[i] === s.id[j]) !== !!(R[i][j] && R[j][i])) ok2 = false; }
  for (let i = 0; i < m; i++) if (s.id[f[i]] < s.id[t[i]]) ok2 = false;
  ok(ok2 && ids.size === s.count && Math.max(-1, ...ids) === s.count - 1, name + ': scc');
  const tp = G.topo(g), pos = new Int32Array(n).fill(-1); tp.order.forEach((v, i) => { pos[v] = i; });
  let acyclic = true; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && R[i][j] && R[j][i]) acyclic = false; for (let i = 0; i < m; i++) if (f[i] === t[i]) acyclic = false;
  let ok3 = tp.complete === acyclic;
  for (let i = 0; i < m; i++) if (pos[f[i]] >= 0 && pos[t[i]] >= 0 && pos[f[i]] >= pos[t[i]]) ok3 = false;
  if (acyclic) for (let i = 0; i < n; i++) if (pos[i] < 0) ok3 = false;
  if (!acyclic) for (let v = 0; v < n; v++) if (pos[v] >= 0) { for (let u = 0; u < n; u++) if (u !== v && R[u][v] && R[v][u]) ok3 = false; for (let i = 0; i < m; i++) if (f[i] === v && t[i] === v) ok3 = false; }
  ok(ok3, name + ': topo');
  for (const src of r2) {
    const ref = new Float64Array(n).fill(Infinity); if (src >= 0 && src < n) ref[src] = 0;
    for (let it = 0; it < n; it++) for (let i = 0; i < m; i++) if (ref[f[i]] + w[i] < ref[t[i]]) ref[t[i]] = ref[f[i]] + w[i];
    const r = G.shortest(g, src, Float64Array.from(w)); let ok4 = true;
    for (let v = 0; v < n; v++) if (Math.abs(r.dist[v] - ref[v]) > 1e-9 && r.dist[v] !== ref[v]) ok4 = false;
    for (let v = 0; v < n; v++) { const p = G.pathTo(g, r, v); if (ref[v] === Infinity) { if (p !== null) ok4 = false; } else { let sum = 0, at = src; for (const e of p) { if (f[e] !== at) ok4 = false; at = t[e]; sum += w[e]; } if (at !== v || Math.abs(sum - ref[v]) > 1e-9) ok4 = false; } }
    ok(ok4, name + ': shortest weighted from ' + src);
    const u = G.shortest(g, src), d = G.bfs(g, src); let ok5 = true;
    for (let v = 0; v < n; v++) if ((d[v] < 0 ? Infinity : d[v]) !== u.dist[v]) ok5 = false;
    for (let v = 0; v < n; v++) { const p = G.pathTo(g, u, v); if (d[v] < 0 ? p !== null : !p || p.length !== d[v]) ok5 = false; }
    ok(ok5, name + ': shortest by links from ' + src);
    for (const tg2 of [(src + 3) % n, src, (src * 7 + 1) % n, n - 1]) {   // path: both-ends search, repeated on one graph (working arrays are reused), weighted and by links
      const pw = G.path(g, src, tg2, Float64Array.from(w)), pu = G.path(g, src, tg2); let okq = true;
      if (!(src >= 0 && src < n)) okq = pw === null && pu === null;
      else {
        if (ref[tg2] === Infinity) okq = pw === null; else { let sum = 0, at = src; for (const e of pw.links) { if (f[e] !== at) okq = false; at = t[e]; sum += w[e]; } if (at !== tg2 || Math.abs(sum - ref[tg2]) > 1e-9 || Math.abs(pw.cost - ref[tg2]) > 1e-9) okq = false; }
        if (d[tg2] < 0) okq = okq && pu === null; else { let at = src; for (const e of pu.links) { if (f[e] !== at) okq = false; at = t[e]; } if (at !== tg2 || pu.links.length !== d[tg2] || pu.cost !== d[tg2]) okq = false; }
      }
      ok(okq, name + ': path ' + src + ' to ' + tg2);
    }
    const tg = (src + 3) % n, e1 = G.shortest(g, src, Float64Array.from(w), tg), e2 = G.shortest(g, src, null, tg);
    { const pp = G.pathTo(g, e1, tg); let okp = ref[tg] === Infinity ? pp === null : pp !== null; if (okp && pp) { let sum = 0, at = src; for (const e of pp) { if (f[e] !== at) okp = false; at = t[e]; sum += w[e]; } if (at !== tg || Math.abs(sum - ref[tg]) > 1e-9 || Math.abs(e1.dist[tg] - ref[tg]) > 1e-9) okp = false; } ok(okp, name + ': early-stop path from ' + src); }
    ok((e1.dist[tg] === ref[tg] || Math.abs(e1.dist[tg] - ref[tg]) < 1e-9) && (ref[tg] === Infinity || e2.dist[tg] === (d[tg] < 0 ? Infinity : d[tg])), name + ': shortest stops early at target');
  }
}
newChecks('one item', 1, [], [], [], [0, -1, 1]);
newChecks('self link', 1, [0], [0], [2], [0]);
newChecks('chain with a shortcut', 4, [0, 1, 2, 0], [1, 2, 3, 3], [1, 1, 1, 5], [0, 3]);
newChecks('zero weights and ties', 4, [0, 0, 1, 2], [1, 2, 3, 3], [0, 0, 0, 0], [0]);
for (let t = 0; t < 400; t++) {
  const n = 1 + Math.floor(r() * 25), m = Math.floor(r() * n * 3), f = [], to = [], w = [];
  for (let i = 0; i < m; i++) { f.push(Math.floor(r() * n)); to.push(Math.floor(r() * n)); w.push(r() < 0.2 ? 0 : Math.floor(r() * 9) + r()); }
  newChecks('random2 ' + t, n, f, to, w, [0, Math.floor(r() * n), -1, n]);
}
{ const n = 300000, f = new Int32Array(n - 1), to = new Int32Array(n - 1); for (let i = 0; i < n - 1; i++) { f[i] = i; to[i] = i + 1; }
  const g = G.csr(n, f, to); ok(G.components(g).count === 1 && G.scc(g).count === n && G.topo(g).complete && G.shortest(g, 0, new Float64Array(n - 1).fill(1)).dist[n - 1] === n - 1, 'long chain'); }
{ const g3 = G.csr(3, [0, 1], [1, 2]); let bad3 = false; try { G.path(g3, 0, 2, Float64Array.of(1, -1)); } catch (e) { bad3 = e instanceof RangeError; } ok(bad3, 'path refuses a negative weight'); const pp = G.path(g3, 0, 2, Float64Array.of(1, 2)); ok(pp && pp.cost === 3 && pp.links.join() === '0,1', 'path works again after a refused call'); }
{ let bad2 = false; try { G.shortest(G.csr(2, [0], [1]), 0, Float64Array.of(-1)); } catch (e) { bad2 = e instanceof RangeError; } ok(bad2, 'negative weight refused'); }

// kcore, mst, pagerank, betweenness against slow references
function moreChecks(name, n, f, t, w) {
  const g = G.csr(n, f, t), m = f.length;
  // k-core by repeated peeling
  { const alive = new Uint8Array(n).fill(1), core = new Int32Array(n); const degOf = (v) => { let d = 0; for (let i = 0; i < m; i++) { if (f[i] === t[i]) continue; if ((f[i] === v && alive[t[i]]) || (t[i] === v && alive[f[i]])) d++; } return d; };
    for (let k = 0, left = n; left > 0; k++) { let changed = true; while (changed) { changed = false; for (let v = 0; v < n; v++) if (alive[v] && degOf(v) < k) { alive[v] = 0; left--; core[v] = k - 1; changed = true; } } }
    const kc = G.kcore(g); ok(same(kc.core, core) && kc.max === Math.max(0, ...core), name + ': kcore'); }
  // minimum spanning forest: same total as Prim over each group, a forest, and spans every group
  { const r = G.mst(g, Float64Array.from(w)), c = G.components(g); ok(r.links.length === n - c.count, name + ': mst link count');
    const p = Array.from({ length: n }, (_, i) => i), find = (x) => { while (p[x] !== x) x = p[x]; return x; }; let tot = 0, fine = true;
    for (const e of r.links) { const a = find(f[e]), b = find(t[e]); if (a === b) fine = false; p[a] = b; tot += w[e]; }
    // Prim on the undirected view
    let prim = 0; const seen = new Uint8Array(n);
    for (let s0 = 0; s0 < n; s0++) { if (seen[s0]) continue; seen[s0] = 1; for (;;) { let be = -1; for (let i = 0; i < m; i++) { if (seen[f[i]] !== seen[t[i]] && (be < 0 || w[i] < w[be])) be = i; } if (be < 0) break; seen[f[be]] = 1; seen[t[be]] = 1; prim += w[be]; } }
    ok(fine && Math.abs(tot - prim) < 1e-9 && Math.abs(r.total - prim) < 1e-9, name + ': mst total ' + tot + ' vs prim ' + prim);
    for (let i = 1; i < r.links.length; i++) ok(w[r.links[i - 1]] <= w[r.links[i]], name + ': mst order'); }
  // pagerank: dense power iteration with the same stopping rule
  { const alpha = 0.85, out = new Float64Array(n); for (let i = 0; i < m; i++) out[f[i]]++;
    let x = new Float64Array(n).fill(1 / n), it = 0, conv = false;
    while (it < 100) { const y = new Float64Array(n); let dang = 0; for (let v = 0; v < n; v++) if (!out[v]) dang += x[v];
      for (let v = 0; v < n; v++) y[v] = (alpha * dang + 1 - alpha) / n; for (let i = 0; i < m; i++) y[t[i]] += alpha * x[f[i]] / out[f[i]];
      let err = 0; for (let v = 0; v < n; v++) err += Math.abs(y[v] - x[v]); x = y; it++; if (err < n * 1e-6) { conv = true; break; } }
    const r = G.pagerank(g); let okp = r.iterations === it && r.converged === conv; for (let v = 0; v < n; v++) if (Math.abs(r.rank[v] - x[v]) > 1e-12) okp = false; ok(okp, name + ': pagerank');
    if (m) { const ww = Float64Array.from(w, (v) => Math.abs(v) + 0.5), rw = G.pagerank(g, { weights: ww }); let s = 0; for (const v of rw.rank) s += v; ok(Math.abs(s - 1) < 1e-9, name + ': weighted pagerank sums to 1'); } }
  // betweenness: count shortest paths between every pair with a plain BFS and add up the shares
  { const adj = Array.from({ length: n }, () => []); for (let i = 0; i < m; i++) adj[f[i]].push(t[i]);
    const cnt = (s) => { const d = new Array(n).fill(-1), c = new Array(n).fill(0), q = [s]; d[s] = 0; c[s] = 1; for (let h = 0; h < q.length; h++) { const v = q[h]; for (const u of adj[v]) { if (d[u] < 0) { d[u] = d[v] + 1; q.push(u); } if (d[u] === d[v] + 1) c[u] += c[v]; } } return { d, c }; };
    const R = Array.from({ length: n }, (_, s) => cnt(s)), ref = new Float64Array(n);
    for (let s = 0; s < n; s++) for (let tt = 0; tt < n; tt++) { if (s === tt || R[s].d[tt] < 0) continue; for (let v = 0; v < n; v++) { if (v === s || v === tt || R[s].d[v] < 0 || R[v].d[tt] < 0 || R[s].d[v] + R[v].d[tt] !== R[s].d[tt]) continue; ref[v] += R[s].c[v] * R[v].c[tt] / R[s].c[tt]; } }
    const raw = G.betweenness(g, { normalized: false }); let okb = true; for (let v = 0; v < n; v++) if (Math.abs(raw[v] - ref[v]) > 1e-9) okb = false; ok(okb, name + ': betweenness');
    if (n > 2) { const nb = G.betweenness(g); for (let v = 0; v < n; v++) if (Math.abs(nb[v] - ref[v] / ((n - 1) * (n - 2))) > 1e-12) okb = false; ok(okb, name + ': betweenness normalized'); } }
}
moreChecks('one item', 1, [], [], []); moreChecks('self link', 2, [0, 0], [0, 1], [1, 2]); moreChecks('triangle plus tail', 4, [0, 1, 2, 2], [1, 2, 0, 3], [1, 2, 3, 4]);
moreChecks('repeated links', 3, [0, 0, 1], [1, 1, 2], [3, 1, 2]);
for (let tt = 0; tt < 150; tt++) {
  const n = 1 + Math.floor(r() * 14), m = Math.floor(r() * n * 3), f = [], to = [], w = [];
  for (let i = 0; i < m; i++) { f.push(Math.floor(r() * n)); to.push(Math.floor(r() * n)); w.push(r() < 0.3 ? 2 : Math.floor(r() * 9) - 2 + r()); }
  moreChecks('random3 ' + tt, n, f, to, w);
}

// maxflow against Edmonds-Karp on a dense matrix, plus conservation, capacity and cut checks
function flowChecks(name, n, f, t, cap) {
  const g = G.csr(n, f, t), m = f.length;
  for (const [s0, t0] of [[0, n - 1], [n - 1, 0], [Math.floor(n / 2), 0]]) {
    if (s0 === t0 || n < 2) continue;
    const C = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < m; i++) if (f[i] !== t[i]) C[f[i]][t[i]] += cap[i];
    let ref = 0; for (;;) { const par = new Int32Array(n).fill(-1); par[s0] = s0; const q = [s0]; for (let h = 0; h < q.length && par[t0] < 0; h++) { const v = q[h]; for (let w = 0; w < n; w++) if (par[w] < 0 && C[v][w] > 1e-12) { par[w] = v; q.push(w); } } if (par[t0] < 0) break; let b = Infinity; for (let v = t0; v !== s0; v = par[v]) b = Math.min(b, C[par[v]][v]); for (let v = t0; v !== s0; v = par[v]) { C[par[v]][v] -= b; C[v][par[v]] += b; } ref += b; }
    const r = G.maxflow(g, s0, t0, Float64Array.from(cap)); let okf = Math.abs(r.value - ref) < 1e-9;
    const bal = new Float64Array(n); for (let i = 0; i < m; i++) { if (r.flow[i] < -1e-12 || r.flow[i] > cap[i] + 1e-12) okf = false; if (f[i] === t[i] && r.flow[i] !== 0) okf = false; bal[f[i]] -= r.flow[i]; bal[t[i]] += r.flow[i]; }
    for (let v = 0; v < n; v++) { if (v === s0) { if (Math.abs(bal[v] + r.value) > 1e-9) okf = false; } else if (v === t0) { if (Math.abs(bal[v] - r.value) > 1e-9) okf = false; } else if (Math.abs(bal[v]) > 1e-9) okf = false; }
    let cutCap = 0; for (const e of r.cut) { cutCap += cap[e]; if (!r.side[f[e]] || r.side[t[e]]) okf = false; }
    if (Math.abs(cutCap - r.value) > 1e-9 || !r.side[s0] || r.side[t0]) okf = false;
    ok(okf, name + ': maxflow ' + s0 + ' to ' + t0 + ' value ' + r.value + ' vs ' + ref);
  }
}
flowChecks('chain', 3, [0, 1], [1, 2], [5, 3]); flowChecks('diamond', 4, [0, 0, 1, 2, 1], [1, 2, 3, 3, 2], [3, 2, 2, 3, 1]); flowChecks('parallel and self', 3, [0, 0, 1, 1], [1, 1, 2, 1], [1, 2, 4, 9]);
for (let tt = 0; tt < 300; tt++) {
  const n = 2 + Math.floor(r() * 12), m = Math.floor(r() * n * 3), f = [], to = [], cap = [];
  for (let i = 0; i < m; i++) { f.push(Math.floor(r() * n)); to.push(Math.floor(r() * n)); cap.push(r() < 0.15 ? 0 : Math.floor(r() * 9) + (r() < 0.3 ? r() : 0)); }
  flowChecks('random4 ' + tt, n, f, to, cap);
}
{ let bad = false; try { G.maxflow(G.csr(2, [0], [1]), 0, 0); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'maxflow refuses source = sink'); }

// closeness, triangles, communities, criticalPath, landmarks against slow references
function groupChecks(name, n, f, t, w) {
  const g = G.csr(n, f, t), m = f.length;
  // closeness: BFS walking backwards from every item
  { const radj = Array.from({ length: n }, () => []); for (let i = 0; i < m; i++) radj[t[i]].push(f[i]);
    for (const wf of [false, true]) { const c = G.closeness(g, { wassermanFaust: wf }); for (let s0 = 0; s0 < n; s0++) { const d = new Array(n).fill(-1); d[s0] = 0; const q = [s0]; let tot = 0; for (let h = 0; h < q.length; h++) for (const u of radj[q[h]]) if (d[u] < 0) { d[u] = d[q[h]] + 1; tot += d[u]; q.push(u); } let want = tot > 0 && n > 1 ? (q.length - 1) / tot : 0; if (wf && want) want *= (q.length - 1) / (n - 1); ok(Math.abs(c[s0] - want) < 1e-12, name + ': closeness ' + s0); } }
    const sub = G.closeness(g, { sources: [0] }); ok(sub[0] === G.closeness(g)[0] && sub.every((v, i) => i === 0 || v === 0), name + ': closeness sources'); }
  // triangles: all triples on the undirected simple closure
  { const A = Array.from({ length: n }, () => new Uint8Array(n)); for (let i = 0; i < m; i++) if (f[i] !== t[i]) { A[f[i]][t[i]] = 1; A[t[i]][f[i]] = 1; }
    let tot = 0, triples = 0; const per = new Int32Array(n); for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) if (A[a][b] && A[b][c] && A[a][c]) { tot++; per[a]++; per[b]++; per[c]++; }
    const deg = A.map((row) => row.reduce((x, y) => x + y, 0)); for (const d of deg) triples += d * (d - 1) / 2;
    const r = G.triangles(g); let okt = r.total === tot && same(r.perItem, per) && Math.abs(r.transitivity - (triples ? 3 * tot / triples : 0)) < 1e-12;
    for (let v = 0; v < n; v++) { const want = deg[v] > 1 ? per[v] / (deg[v] * (deg[v] - 1) / 2) : 0; if (Math.abs(r.clustering[v] - want) > 1e-12) okt = false; }
    ok(okt, name + ': triangles'); }
  // communities: valid ids, modularity recomputed by the textbook sum, never worse than one group per item or one group
  { const ww = Float64Array.from(w, (v) => Math.abs(v) + 0.25); for (const weights of [undefined, ww]) {
      const r = G.communities(g, { weights }); let okc = r.id.length === n && r.count === (n ? Math.max(...r.id) + 1 : 0);
      const Qof = (id) => { let m2 = 0; const k = new Float64Array(n); for (let i = 0; i < m; i++) { const x = weights ? weights[i] : 1; k[f[i]] += x; k[t[i]] += x; m2 += 2 * x; } if (!m2) return 0; const ins = {}, tot = {}; for (let v = 0; v < n; v++) tot[id[v]] = (tot[id[v]] || 0) + k[v]; for (let i = 0; i < m; i++) if (id[f[i]] === id[t[i]]) ins[id[f[i]]] = (ins[id[f[i]]] || 0) + 2 * (weights ? weights[i] : 1); let q = 0; for (const c in tot) q += (ins[c] || 0) / m2 - (tot[c] / m2) * (tot[c] / m2); return q; };
      if (Math.abs(Qof(r.id) - r.modularity) > 1e-9) okc = false;
      if (r.modularity < Qof(new Int32Array(n)) - 1e-9 || r.modularity < Qof(Int32Array.from({ length: n }, (_, i) => i)) - 1e-9) okc = false;
      const sizes = new Int32Array(r.count); r.id.forEach((c) => sizes[c]++); for (let i = 1; i < r.count; i++) if (sizes[i] > sizes[i - 1]) okc = false;
      ok(okc, name + ': communities' + (weights ? ' weighted' : '')); } }
  // landmark path = path, for a few landmark counts
  { const wn = Float64Array.from(w, (v) => Math.abs(v)); for (const cnt of [1, 3]) { const ix = G.landmarks(g, { count: cnt, weights: wn }); for (let k = 0; k < 6; k++) { const a = Math.floor(r() * n), b = Math.floor(r() * n), p1 = G.landmarkPath(ix, a, b), p2 = G.path(g, a, b, wn); let okl = (p1 === null) === (p2 === null); if (okl && p1) { let sum = 0, at = a; for (const e of p1.links) { if (f[e] !== at) okl = false; at = t[e]; sum += wn[e]; } if (at !== b || Math.abs(sum - p2.cost) > 1e-9 || Math.abs(p1.cost - p2.cost) > 1e-9) okl = false; } ok(okl, name + ': landmarkPath ' + a + ' to ' + b + ' with ' + cnt); } } }
}
function dagCheck(name, n, f, t, w) {
  const g = G.csr(n, f, t), m = f.length, r1 = G.criticalPath(g, Float64Array.from(w)), topo = G.topo(g);
  ok(r1.complete === topo.complete, name + ': criticalPath complete flag'); if (!topo.complete) return;
  // best path ending at each item by trying every path with a DFS over the small DAG
  const out = Array.from({ length: n }, () => []); for (let i = 0; i < m; i++) out[f[i]].push(i);
  const best = new Float64Array(n); const dfs = (v, d) => { if (d > best[v]) best[v] = d; for (const e of out[v]) dfs(t[e], d + w[e]); }; for (let v = 0; v < n; v++) dfs(v, 0);
  let okp = true; for (let v = 0; v < n; v++) if (Math.abs(best[v] - r1.dist[v]) > 1e-9) okp = false;
  let sum = 0, at = n ? r1.end : -1; const links = Array.from(r1.links); let start = n ? r1.end : -1; for (let i = links.length - 1; i >= 0; i--) { if (t[links[i]] !== start) okp = false; start = f[links[i]]; } for (const e of links) sum += w[e];
  if (n && Math.abs(sum - r1.length) > 1e-9) okp = false; if (n && Math.abs(r1.length - Math.max(...best)) > 1e-9) okp = false;
  ok(okp, name + ': criticalPath');
}
groupChecks('triangle and tail', 5, [0, 1, 2, 2, 3], [1, 2, 0, 3, 4], [1, 1, 1, 1, 1]);
groupChecks('two cliques', 6, [0, 1, 2, 3, 4, 5, 2], [1, 2, 0, 4, 5, 3, 3], [1, 1, 1, 1, 1, 1, 1]);
{ const r2 = G.communities(G.csr(6, [0, 1, 2, 3, 4, 5, 2], [1, 2, 0, 4, 5, 3, 3])); ok(r2.count === 2 && r2.id[0] === r2.id[1] && r2.id[1] === r2.id[2] && r2.id[3] === r2.id[4] && r2.id[0] !== r2.id[3], 'communities find two triangles joined by one link'); }
for (let tt = 0; tt < 120; tt++) {
  const n = 1 + Math.floor(r() * 12), m = Math.floor(r() * n * 3), f = [], to = [], w = [];
  for (let i = 0; i < m; i++) { f.push(Math.floor(r() * n)); to.push(Math.floor(r() * n)); w.push(Math.floor(r() * 7) + r()); }
  groupChecks('random5 ' + tt, n, f, to, w);
  const df = [], dt = [], dw = []; for (let i = 0; i < m; i++) { let a = Math.floor(r() * n), b = Math.floor(r() * n); if (a === b) continue; if (a > b) { const x = a; a = b; b = x; } df.push(a); dt.push(b); dw.push(Math.floor(r() * 9) - 3 + r()); }
  dagCheck('dag ' + tt, n, df, dt, dw); dagCheck('maybe cyclic ' + tt, n, f, to, w);
}
let bad = false; try { G.csr(2, [0], [5]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects an item outside 0..n-1');
bad = false; try { G.csr(2, [0], [1, 1]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects lists of different length');
{ const g0 = G.csr(5, [0, 1, 2, 3], [1, 2, 3, 4]); G.closenessAsync(g0).then((a) => { const b = G.closeness(g0); ok(a.every((v, i) => v === b[i]), 'closenessAsync without workers answers like closeness'); }); }
{ const g1 = G.csr(6, [0, 1, 2, 3, 4], [1, 2, 3, 4, 5]); const a1 = G.components(g1); G.ready().then(() => G.trim()).then(() => { const b1 = G.components(g1), c1 = G.closeness(g1); ok(a1.count === b1.count && a1.id.every((v, i) => v === b1.id[i]) && c1.length === 6, 'answers are the same after trim()'); }); }
{ // handing a previous result back: same answers, and the same arrays reused where the kernel is WebAssembly
  const g2 = G.csr(7, [0, 1, 2, 3, 5, 4, 1], [1, 2, 0, 4, 6, 3, 5]), w2 = Float64Array.from([1, 2, 3, 1, 2, 5, 1]), same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const reuse = G.accelerated();
  const c1 = G.components(g2), c2 = G.components(g2, c1); ok(same(c1.id, c2.id) && c2.count === c1.count && (!reuse || c2.id === c1.id), 'components with a previous result');
  const k1 = G.kcore(g2), k2 = G.kcore(g2, k1); ok(same(k1.core, k2.core) && (!reuse || k2.core === k1.core), 'kcore with a previous result');
  const d1 = G.shortest(g2, 0, w2), d2 = G.shortest(g2, 0, w2, undefined, d1); ok(same(d1.dist, d2.dist) && same(d1.via, d2.via) && (!reuse || d2.dist === d1.dist), 'shortest with a previous result');
  const p1 = G.pagerank(g2), p2 = G.pagerank(g2, { into: p1 }); ok(same(p1.rank, p2.rank) && (!reuse || p2.rank === p1.rank), 'pagerank with a previous result');
  const g3 = G.csr(9, [0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7]), c3 = G.components(g3, c1); ok(c3.id.length === 9 && c3.count === 2, 'a previous result of another size is ignored');
}
ok(/^0\.\d+\.\d+$/.test(G.version) && G.api === 0, 'runtime version and API');
console.log('graph-walk: all checks passed (' + graphs + ' graphs)');
