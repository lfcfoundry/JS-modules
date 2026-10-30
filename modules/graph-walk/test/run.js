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
let bad = false; try { G.csr(2, [0], [5]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects an item outside 0..n-1');
bad = false; try { G.csr(2, [0], [1, 1]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects lists of different length');
ok(/^0\.\d+\.\d+$/.test(G.version) && G.api === 0, 'runtime version and API');
console.log('graph-walk: all checks passed (' + graphs + ' graphs)');
