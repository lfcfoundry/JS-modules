#!/usr/bin/env node
// graph-walk in one real browser at a time: the same answers as the walks Netflow Map writes inline today, and the time of each, taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/graph-walk-browser.js <chromium|firefox|webkit> [out.json]     Env: ITEMS (default 30000), REPS (default 15)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const ITEMS = +(process.env.ITEMS || 30000), REPS = +(process.env.REPS || 15);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': rd('graph-walk/graph-walk.js'), '/fixture.js': 'window.bigNetwork=(function(){var module={};' + rd('netflow-scene/test/fixture.js') + ';return module.exports})();',
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script><script src="/fixture.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate((n) => {
    const net = bigNetwork(n, 6, 7), idx = new Map(net.nodes.map((x, i) => [x.id, i])), f = [], t = [];
    for (const e of net.edges) if (idx.has(e.from) && idx.has(e.to)) { f.push(idx.get(e.from)); t.push(idx.get(e.to)); }
    window.G = GraphWalk.csr(net.nodes.length, f, t);
    // the walks as Netflow Map writes them inline today
    window.refBfs = function (P, root, skip) { var d = new Int32Array(P.n).fill(-1); if (root < 0 || root === skip || P.n === 0) return d; var q = new Int32Array(P.n), h = 0, tl = 0; q[tl++] = root; d[root] = 0; while (h < tl) { var v = q[h++]; for (var k = P.outStart[v]; k < P.outStart[v + 1]; k++) { var w = P.to[P.outEdge[k]]; if (w !== skip && d[w] < 0) { d[w] = d[v] + 1; q[tl++] = w; } } } return d; };
    window.refLoops = function (P, start) { var n = P.n, state = new Uint8Array(n), keep = new Uint8Array(P.m), post = [], sp = 0, it = new Int32Array(n), stack = new Int32Array(n + 1); stack[sp++] = start; state[start] = 1; while (sp) { var v2 = stack[sp - 1], k2 = it[v2]; if (k2 < P.outStart[v2 + 1] - P.outStart[v2]) { it[v2]++; var e = P.outEdge[P.outStart[v2] + k2], w2 = P.to[e]; if (state[w2] === 1) continue; keep[e] = 1; if (!state[w2]) { state[w2] = 1; stack[sp++] = w2; } } else { state[v2] = 2; post.push(v2); sp--; } } return { keep: keep, post: post }; };
    const a = GraphWalk.bfs(G, 0), b = refBfs(G, 0), c = GraphWalk.loops(G, 0), d = refLoops(G, 0);
    let bad = a.length !== b.length || c.post.length !== d.post.length;
    for (let i = 0; !bad && i < a.length; i++) if (a[i] !== b[i]) bad = true;
    for (let i = 0; !bad && i < c.keep.length; i++) if (c.keep[i] !== d.keep[i]) bad = true;
    for (let i = 0; !bad && i < c.post.length; i++) if (c.post[i] !== d.post[i]) bad = true;
    window.same = !bad; window.run = (w, c) => { const f = c === 'bfs' ? (w === 'old' ? refBfs : GraphWalk.bfs) : (w === 'old' ? refLoops : GraphWalk.loops), t0 = performance.now(); for (let i = 0; i < 20; i++) f(G, 0, -1); return (performance.now() - t0) / 20; };   // 20 walks per sample: Firefox rounds timers to a millisecond
  }, ITEMS);
  const same = await p.evaluate(() => same), links = await p.evaluate(() => G.m), rows = [];
  for (const c of ['bfs', 'loops']) { const ms = await T.rotate(['old', 'new'], REPS, (n) => p.evaluate((w, cc) => run(w, cc), n, c)); rows.push({ name: c, links, before: +ms.old.toFixed(1), after: +ms.new.toFixed(1) }); }
  srv.close();
  const g = T.speedGuard(rows);
  console.log(same ? 'same answers as the inline walks' : 'FAIL answers differ');
  console.log(T.table(g.map((r) => Object.assign({}, r, { ratio: r.ratio.toFixed(2) })), [{ key: 'name', title: ITEMS + ' items', align: 'left' }, { key: 'links', title: 'links' }, { key: 'before', title: 'inline ms' }, { key: 'after', title: 'graph-walk ms' }, { key: 'ratio', title: 'times faster' }, { key: 'verdict', title: 'verdict', align: 'left' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, same, rows: g }));
  return same && !g.some((r) => r.slower);
});
