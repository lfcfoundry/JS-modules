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
let bad = false; try { G.csr(2, [0], [5]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects an item outside 0..n-1');
bad = false; try { G.csr(2, [0], [1, 1]); } catch (e) { bad = e instanceof RangeError; } ok(bad, 'csr rejects lists of different length');
ok(/^0\.\d+\.\d+$/.test(G.version) && G.api === 0, 'runtime version and API');
console.log('graph-walk: all checks passed (' + graphs + ' graphs)');
