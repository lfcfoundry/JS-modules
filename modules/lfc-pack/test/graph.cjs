// Copyright (c) 2026 LFC Foundry. MIT License.
// Graph section (footer section 23, since 0.17.0): CSR arrays stored raw after the blocks; graph() and open().graph() give typed views equal to a CSR built from the link columns.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const ref = (F, T, W, N, dir) => { const adj = Array.from({ length: N }, () => []); for (let i = 0; i < F.length; i++) { adj[F[i]].push([T[i], W ? Math.fround(W[i]) : 0]); if (!dir && F[i] !== T[i]) adj[T[i]].push([F[i], W ? Math.fround(W[i]) : 0]); } return adj; };
  const same = (G, adj, W) => { for (let u = 0; u < adj.length; u++) { const a = adj[u], s = G.offsets[u], e = G.offsets[u + 1]; if (e - s !== a.length) return false; for (let k = 0; k < a.length; k++) { if (G.targets[s + k] !== a[k][0]) return false; if (W && G.weights[s + k] !== a[k][1]) return false; } } return true; };
  const M = 50000, N = 8000, F = new Int32Array(M), T = new Int32Array(M), W = new Float64Array(M), lab = [];
  for (let i = 0; i < M; i++) { F[i] = (i * 7919) % N; T[i] = (i * 104729 + 3) % (N - 1); W[i] = (i % 97) / 7; }
  for (let i = 0; i < M; i++) lab.push('L' + (i % 50));
  for (const dir of [true, false]) for (const w of [true, false]) {
    const f = await J.packColumnsParallel({ src: F, dst: T, w: W, lab }, { graph: { from: 'src', to: 'dst', weight: w ? 'w' : undefined, directed: dir, reverse: true } });
    const G = J.graph(f), adj = ref(F, T, w ? W : null, N, dir);
    ok(G && G.nodes === N && G.edges === adj.reduce((s, a) => s + a.length, 0) && G.pairs === M && G.directed === dir, `header dir=${dir} w=${w}`);
    ok(same(G, adj, w), `CSR equals reference dir=${dir} w=${w}`);
    ok(G.targets.buffer === f.buffer || f.byteOffset & 3, `zero-copy view dir=${dir}`);
    if (dir) { const radj = ref(T, F, w ? W : null, N, true); ok(same({ offsets: G.rOffsets, targets: G.rTargets, weights: G.rWeights }, radj, w), 'reverse index'); } else ok(G.rOffsets === null, 'no reverse when undirected');
    ok(J.unpack(f).length === M && J.unpack(f)[5].src === F[5], `blocks read as before dir=${dir}`);
    const R = await J.open(f), G2 = await R.graph(); ok(same(G2, adj, w), `open().graph() dir=${dir}`);
    ok(J.summary(f) && J.pyramids(f), 'other sections kept');
  }
  { // arrays given directly, nodes option, edge cases
    const f = await J.packColumnsParallel({ a: new Float64Array(5000) }, { graph: { from: [0, 2, 2], to: [1, 0, 2], nodes: 10 } }), G = J.graph(f);
    ok(G.nodes === 10 && G.edges === 3 && Array.from(G.offsets).join() === '0,1,1,3,3,3,3,3,3,3,3' && Array.from(G.targets).join() === '1,0,2', 'arrays, nodes, self link');
    const f0 = await J.packColumnsParallel({ a: [1, 2, 3] }, { graph: { from: [], to: [] } }), G0 = J.graph(f0); ok(G0.nodes === 0 && G0.edges === 0 && G0.offsets.length === 1, 'empty graph');
    ok(J.graph(await J.packColumnsParallel({ a: [1, 2] }, {})) === null, 'no section: null');
    const f2 = J.addGraph(J.packRows([{ x: 1 }, { x: 2 }]), { from: [0, 1], to: [1, 0] }); ok(J.graph(f2).edges === 2 && J.unpack(f2).length === 2, 'addGraph on any file');
    const u = new Uint8Array(f.length + 1); u.set(f, 1); const G3 = J.graph(u.subarray(1)); ok(G3.edges === 3 && Array.from(G3.targets).join() === '1,0,2', 'unaligned bytes copied once');
    const d = f.slice(); d[J.graph(f).offsets.byteOffset - f.byteOffset + 4] ^= 1; let e = null; try { J.graph(d); } catch (x) { e = x; } ok(e && /checksum/.test(e.message), 'damaged region refused'); ok(J.graph(d, { verify: false }).nodes === 10, 'verify false skips the check');
    const bad1 = async (g, m) => { let x = null; try { await J.packColumnsParallel({ a: [1] }, { graph: g }); } catch (y) { x = y; } ok(x && /graph/.test(x.message), m); };
    await bad1({ from: [0, -1], to: [1, 1] }, 'negative node'); await bad1({ from: [0], to: [1, 2] }, 'length mismatch'); await bad1({ from: 'nope', to: 'a' }, 'unknown column'); await bad1({ from: [5], to: [1], nodes: 3 }, 'nodes too small');
  }
  { // since 0.21.0: pack: smaller region, same links per node (each row sorted by target, weights alongside)
    let a = 3; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const NN = 5000, MM = 40000, F = new Int32Array(MM), T = new Int32Array(MM), W = new Float64Array(MM), W2 = new Float64Array(MM);
    for (let i = 0; i < MM; i++) { F[i] = i < 300 ? 7 : r() * NN | 0; T[i] = r() * NN | 0; W[i] = Math.round(r() * 100) / 4; W2[i] = r(); }
    const rows = (G, off, tg, wt) => { const out = []; for (let u = 0; u < G.nodes; u++) { const s = []; for (let p = G[off][u]; p < G[off][u + 1]; p++) s.push(G[tg][p] + ':' + (wt && G[wt] ? G[wt][p] : '')); s.sort(); out.push(s.join(',')); } return out.join('|'); };
    const sortedRows = (G, off, tg) => { for (let u = 0; u < G.nodes; u++) for (let p = G[off][u] + 1; p < G[off][u + 1]; p++) if (G[tg][p] < G[tg][p - 1]) return false; return true; };
    for (const [nm, g] of [['directed + reverse, dict weights', { from: 'f', to: 't', weight: 'w', reverse: true }], ['undirected', { from: 'f', to: 't', weight: 'w', directed: false }], ['many weights (raw f32)', { from: 'f', to: 't', weight: 'w2', reverse: true }], ['no weights', { from: 'f', to: 't' }]]) {
      const tb = { f: F, t: T, w: W, w2: W2 }, f0 = await J.packColumnsParallel(tb, { graph: g }), f1 = await J.packColumnsParallel(tb, { graph: Object.assign({ pack: true }, g) }), A = J.graph(f0), B = J.graph(f1);
      ok(B.nodes === A.nodes && B.edges === A.edges && B.pairs === A.pairs && rows(A, 'offsets', 'targets', 'weights') === rows(B, 'offsets', 'targets', 'weights'), 'pack ' + nm + ': same links and weights per node');
      ok(sortedRows(B, 'offsets', 'targets') && Array.from(A.offsets).join() === Array.from(B.offsets).join(), 'pack ' + nm + ': offsets equal, rows sorted by target');
      if (g.reverse) ok(rows(A, 'rOffsets', 'rTargets', 'rWeights') === rows(B, 'rOffsets', 'rTargets', 'rWeights'), 'pack ' + nm + ': reverse equal');
      ok(f1.length < f0.length, 'pack ' + nm + ': file ' + f0.length + ' -> ' + f1.length);
      const R = await J.open(f1), C = await R.graph(); ok(rows(C, 'offsets', 'targets', 'weights') === rows(A, 'offsets', 'targets', 'weights'), 'pack ' + nm + ': open().graph()');
    }
    const plain = await J.packColumnsParallel({ f: F, t: T }, {}), ag = J.addGraph(plain, { from: F, to: T, weight: W, pack: true }), G2 = J.graph(ag);
    ok(G2.edges === MM && G2.weights.length === MM && J.unpack(ag).length === MM, 'addGraph with pack');
    let e2 = null; try { J.graph(ag.subarray(0, ag.length)); } catch (x) { e2 = x; } ok(e2 === null, 'packed region checksum verified');
  }
  console.log(bad ? bad + ' of ' + n + ' graph checks FAILED' : 'graph section: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
