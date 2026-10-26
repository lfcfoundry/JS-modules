#!/usr/bin/env node
// netflow-scene-index in one real browser at a time, behind the noise guard: building the position index vs the scene module's grid, box selects (2%, 10%, 40% side), 3,000 picks, memory; answers checked against the plain scan and grid. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/netflow-scene-index-browser.js <chromium|firefox|webkit> [out.json]     Env: ITEMS=1000000, REPS=7, BASELINE=1 to skip the noise guard
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const M = (f) => fs.readFileSync(path.resolve(__dirname, '../modules/' + f), 'utf8');
const ITEMS = +process.env.ITEMS || 1000000, REPS = +process.env.REPS || 7;
const html = '<!doctype html><meta charset=utf-8><title>t</title><script>' + M('elias-fano/elias-fano.js') + '</script><script>' + M('netflow-scene/netflow-scene-index.js') + '</script><script>' + M('netflow-scene/netflow-scene.js') + '</script>';
async function pageWork(N, reps) {
  await EliasFano.ready(); const SC = NetflowScene, NSI = NetflowSceneIndex;
  let seed = 12345; const R = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, G = () => (R() + R() + R() + R() - 2) * 1.7;
  const cx = [], cy = []; for (let k = 0; k < 60 * Math.max(1, (N / 30000) | 0); k++) { cx.push(R() * 20000); cy.push(R() * 12000); }
  const nodes = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < N; i++) { const k = i % cx.length, w = 20 + R() * 40, h = 14 + R() * 16, x = cx[k] + G() * 700 / Math.sqrt(N / 30000) - w / 2, y = cy[k] + G() * 450 / Math.sqrt(N / 30000) - h / 2; nodes.push({ i: i, key: 'n' + i, x: x, y: y, w: w, h: h }); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + w > x1) x1 = x + w; if (y + h > y1) y1 = y + h; }
  const base = { nodes: nodes, x0: x0 - 30, y0: y0 - 30, w: x1 - x0 + 60, h: y1 - y0 + 60, recStale: false, gridStale: true, syncRecs() {} };
  const mk = (idx) => Object.assign({}, base, { spatialMod: idx ? NSI : null, spatial: null });
  const W = base.w, H = base.h, boxes = { small: [], mid: [], big: [] }, pts = [];
  for (let j = 0; j < 3000; j++) { const n = nodes[(R() * N) | 0]; pts.push([n.x + n.w * R(), n.y + n.h * R()]); }
  [['small', 0.02], ['mid', 0.1], ['big', 0.4]].forEach((s) => { for (let j = 0; j < (N > 100000 ? 20 : 100); j++) { const bw = W * s[1], bh = H * s[1], bx = base.x0 + R() * (W - bw), by = base.y0 + R() * (H - bh); boxes[s[0]].push([bx, by, bx + bw, by + bh]); } });
  const out = { N: N, bad: [], accelerated: EliasFano.accelerated() };
  // answers
  const P = mk(false), F = mk(true); SC.pick(P, 0, 0, 0); F.spatial = NSI.build(F); F.gridStale = false;
  if (!F.spatial) { out.bad.push('no index built'); return out; }
  for (const s of Object.keys(boxes)) for (const b of boxes[s]) { const a = SC.inRect(P, b[0], b[1], b[2], b[3]), c = SC.inRect(F, b[0], b[1], b[2], b[3]); if (a.length !== c.length || a.some((k, i) => k !== c[i])) out.bad.push('box ' + s); }
  for (const p of pts) { const a = SC.pick(P, p[0], p[1], 3), c = SC.pick(F, p[0], p[1], 3); if ((a ? a.key : null) !== (c ? c.key : null)) out.bad.push('pick'); }
  out.mem = { indexEF: F.spatial.ef.bytes.length, indexOrder: F.spatial.order.length * 4, gridEntries: (() => { let s = 0; P.grid.map.forEach((a) => { s += a.length; }); return s; })(), gridCells: P.grid.map.size };
  const jobs = {
    build: { grid: () => { const S = mk(false); S.gridStale = true; SC.pick(S, 0, 0, 0); return S.grid.map.size; }, index: () => NSI.build(mk(true)).n },
    pick3000: { grid: () => { let s = 0; for (const p of pts) { const r = SC.pick(P, p[0], p[1], 3); s += r ? r.i : 0; } return s; }, index: () => { let s = 0; for (const p of pts) { const r = SC.pick(F, p[0], p[1], 3); s += r ? r.i : 0; } return s; } }
  };
  for (const s of Object.keys(boxes)) jobs['box ' + s + ' x' + boxes[s].length] = { scan: () => { let n = 0; boxes[s].forEach((b) => { n += SC.inRect(P, b[0], b[1], b[2], b[3]).length; }); return n; }, index: () => { let n = 0; boxes[s].forEach((b) => { n += SC.inRect(F, b[0], b[1], b[2], b[3]).length; }); return n; } };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  out.jobs = {};
  for (const name of Object.keys(jobs)) {
    const names = Object.keys(jobs[name]), got = {}; names.forEach((n) => { got[n] = []; });
    for (let k = 0; k < reps; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) { const t0 = performance.now(); jobs[name][n](); got[n].push(performance.now() - t0); }
    out.jobs[name] = {}; names.forEach((n) => { out.jobs[name][n] = { median: med(got[n]), best: Math.min.apply(null, got[n]) }; });
  }
  return out;
}
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': html });
  const run = async () => { const p = await b.newPage(); await p.goto(srv.base + '/page.html'); try { return await p.evaluate('(' + pageWork.toString() + ')(' + ITEMS + ',' + REPS + ')'); } finally { await p.close().catch(() => {}); } };
  const g = process.env.BASELINE ? { ok: true, result: await run(), calibrations: [] } : await T.guarded(b, which, run);
  srv.close();
  if (!g.ok) { console.log('NOISY: every try was off the quiet baseline; nothing published'); return false; }
  const r = g.result; console.log('items ' + r.N + ', wasm ' + r.accelerated + ', noise guard tries ' + (g.tries || 0) + ', memory ' + JSON.stringify(r.mem));
  console.log(T.table(Object.keys(r.jobs).map((j) => { const x = r.jobs[j], ks = Object.keys(x); return { j, a: ks[0] + ' ' + x[ks[0]].median.toFixed(2), b: ks[1] + ' ' + x[ks[1]].median.toFixed(2), r: (x[ks[0]].median / x[ks[1]].median).toFixed(2) + 'x faster with index' }; }), [{ key: 'j', title: 'job (ms, median)', align: 'left' }, { key: 'a', title: 'today' }, { key: 'b', title: 'index' }, { key: 'r', title: 'ratio' }]));
  if (r.bad.length) console.log('\nDIFFERENT ANSWERS: ' + Array.from(new Set(r.bad)).join('; '));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, r, calibrations: g.calibrations }));
  return !r.bad.length;
});
