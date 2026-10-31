#!/usr/bin/env node
// graph-walk helper pool ideas, each alone and together: compiled module sent to helpers (kept instance), pieces handed out as helpers finish (dynamic), both. Same answers, then cold, warm and new-graph times.
// Run: node tests/graph-walk-pool-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 5)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 5);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/gw.js': fs.readFileSync(root + 'graph-walk/graph-walk.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/gw.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate(() => GraphWalk.ready());
  const cores = await p.evaluate(() => navigator.hardwareConcurrency); console.log('cores reported: ' + cores);
  await p.evaluate(() => {
    let seed = 9; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.make = (kind, n, m) => {
      const seen = new Set(), from = [], to = [], ends = [];
      while (from.length < m) {
        let a, c;
        if (kind === 'random' || ends.length < 10) { a = Math.floor(rnd() * n); c = Math.floor(rnd() * n); }
        else { a = Math.floor(rnd() * n); c = ends[Math.floor(rnd() * ends.length)]; }   // preferential: hubs collect links, so start items cost very different amounts
        const k = Math.min(a, c) * n + Math.max(a, c); if (a === c || seen.has(k)) continue; seen.add(k); from.push(a); to.push(c); ends.push(a, c);
      }
      return GraphWalk.csr(n, from, to);
    };
    window.MODES = { today: { _mod: false, _dyn: false, _keep: false }, module: { _dyn: false, _keep: false }, pieces: { _mod: false, _keep: false }, kept: { _mod: false }, both: { _keep: false }, all: {} };
    window.setup = (kind, n, m, ns) => { window.G1 = make(kind, n, m); window.G2 = make(kind, n, m); window.SRC = ns ? Array.from({ length: ns }, (_, i) => Math.floor(i * n / ns)) : null; };
    window.check = async () => { GraphWalk.setBackend('wasm'); const ref = GraphWalk.betweenness(G1, { sources: SRC }), res = {};
      for (const k of Object.keys(MODES)) for (const be of ['wasm', 'js']) { GraphWalk.setBackend(be); const c = await Promise.race([GraphWalk.betweennessAsync(G1, Object.assign({ sources: SRC, minWork: 0 }, MODES[k])), new Promise((r) => setTimeout(() => r(null), 20000))]); if (!c) { res[k + '-' + be] = 'hung'; GraphWalk.closePool(); continue; } res[k + '-' + be] = ref.every((v, i) => Math.abs(v - c[i]) <= 1e-9 * Math.max(1, Math.abs(v))); }
      GraphWalk.setBackend('wasm'); GraphWalk.closePool(); return res; };
    // one trial: cold call (no pool), warm repeat on the same graph, then a different graph on the warm pool
    window.trial = async (k) => { GraphWalk.closePool(); await new Promise((r) => setTimeout(r, 50)); const o = Object.assign({ sources: SRC, minWork: 0 }, MODES[k]);
      let t = performance.now(); await GraphWalk.betweennessAsync(G1, o); const cold = performance.now() - t;
      t = performance.now(); await GraphWalk.betweennessAsync(G1, o); const warm = performance.now() - t;
      t = performance.now(); await GraphWalk.betweennessAsync(G2, o); const swap = performance.now() - t;
      return [cold, warm, swap]; };
  });
  const rows = [], answers = [], names = process.env.MODES ? process.env.MODES.split(',') : ['today', 'module', 'pieces', 'kept', 'both', 'all'];
  const sets = process.env.SETS ? JSON.parse(process.env.SETS) : [['random', 20000, 80000, 256], ['hubs', 20000, 80000, 256], ['random', 3000, 12000, 0], ['hubs', 3000, 12000, 0]];
  for (const [kind, n, m, ns] of sets) {
    await p.evaluate((a, b2, c, d) => setup(a, b2, c, d), kind, n, m, ns);
    const ok = await p.evaluate(() => check()); answers.push(kind + ' ' + n + '/' + m + ': ' + JSON.stringify(ok));
    const acc = {}; for (const k of names) acc[k] = [[], [], []];
    for (let r = 0; r < REPS; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) { if (process.env.TRACE) process.stderr.write(kind + n + ' r' + r + ' ' + k + '\n'); const v = await p.evaluate((x) => Promise.race([trial(x), new Promise((res) => setTimeout(() => res('hung'), 30000))]), k); if (v === 'hung') { console.log('HUNG ' + kind + ' ' + n + ' ' + k + ' rep ' + r); return false; } for (let i = 0; i < 3; i++) acc[k][i].push(v[i]); }
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    for (const k of names) { const v = acc[k].map(med), b0 = acc.today.map(med); rows.push({ set: kind + ' ' + n + '/' + m + (ns ? ' ' + ns + ' starts' : ' all'), mode: k, cold: v[0].toFixed(1), warm: v[1].toFixed(1), swap: v[2].toFixed(1), gain: (b0[0] / v[0]).toFixed(2) + ' / ' + (b0[1] / v[1]).toFixed(2) + ' / ' + (b0[2] / v[2]).toFixed(2) }); }
  }
  srv.close();
  console.log(answers.join('\n'));
  console.log(T.table(rows, [{ key: 'set', title: 'graph', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'cold', title: 'cold ms' }, { key: 'warm', title: 'warm ms' }, { key: 'swap', title: 'new graph ms' }, { key: 'gain', title: 'today / mode (cold / warm / new)' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, cores, answers, rows }));
  return !answers.some((s) => /false|hung/.test(s));
});
