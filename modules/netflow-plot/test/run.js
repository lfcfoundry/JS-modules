/* Copyright (c) 2026 LFC Foundry. MIT License. Run: node modules/netflow-plot/test/run.js. netflow-plot checks (Node, pass/fail only): every type draws finite shapes from a table, with empty, one-row and odd columns, and the pointer finds its marks. */
'use strict';
global.NetflowScene = require('../../netflow-scene/netflow-scene.js');
const P = require('../netflow-plot.js');
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
function rnd(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function table(n, seed) {
  const r = rnd(seed), cats = ['North', 'South', 'East', 'West', 'Central'], rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: 'r' + i, label: 'Row ' + i, attrs: { region: cats[i % 5], kind: ['A', 'B', 'C'][Math.floor(r() * 3)], sales: Math.round(100 + r() * 900 * (1 + i % 5)), cost: Math.round(50 + r() * 500), score: ((r() + r() + r()) * 10).toFixed(2), day: new Date(Date.UTC(2025, 0, 1) + Math.floor(r() * 500) * 864e5).toISOString().slice(0, 10), note: ['fast ship', 'slow ship', 'great value', 'late order'][i % 4], blank: i % 3 ? '' : 'x' } });
  return rows;
}
const SPECS = {
  bar: { x: 'region', y: 'sales', color: 'kind' }, line: { x: 'day', y: 'sales', color: 'region', smooth: 7 }, area: { x: 'day', y: 'sales', color: 'region', stack: 'stream' },
  scatter: { x: 'cost', y: 'sales', color: 'region', size: 'score' }, connected: { x: 'cost', y: 'sales' }, beeswarm: { x: 'sales', color: 'kind' }, dotplot: { x: 'region', y: 'sales', color: 'kind' },
  hist: { x: 'sales', color: 'kind' }, box: { x: 'region', y: 'sales' }, density: { x: 'sales', color: 'kind' }, ridgeline: { x: 'sales', color: 'region' }, hexbin: { x: 'cost', y: 'sales' },
  heat: { x: 'day', y: 'sales' }, donut: { x: 'kind' }, radialbar: { x: 'region', y: 'sales' }, parallel: { cols: ['sales', 'cost', 'score'], color: 'kind' },
  splom: { cols: ['sales', 'cost', 'score'] }, qq: { x: 'score' }, slope: { x: 'kind', color: 'region', y: 'sales' }, marimekko: { x: 'region', color: 'kind', y: 'sales' }, voronoi: { x: 'cost', y: 'sales' }, words: { x: 'note' }
};
const finite = (S) => {
  const bad = [];
  S.rects.forEach((q) => { if (!isFinite(q.x + q.y + q.w + q.h)) bad.push('rect'); });
  S.dots.forEach((q) => { if (!isFinite(q.cx + q.cy + q.r)) bad.push('dot'); });
  (S.curves || []).forEach((c) => { const p = c.P || c.pts || []; for (let i = 0; i < p.length; i++) if (!isFinite(p[i])) { bad.push('curve'); break; } });
  S.polys.forEach((q) => { for (let i = 0; i < q.pts.length; i++) if (!isFinite(q.pts[i])) { bad.push('poly'); break; } });
  S.labels.forEach((l) => { if (!isFinite(l.x + l.y) || /NaN|undefined/.test(l.t)) bad.push('label ' + l.t); });
  return bad;
};
ok(P.TYPES.length === Object.keys(SPECS).length, 'every type has a case here');
for (const [n, seed] of [[0, 1], [1, 2], [7, 3], [2000, 4]]) {
  const rows = table(n, seed);
  for (const t of P.TYPES.map((x) => x[0])) {
    const spec = Object.assign({ type: t }, SPECS[t]);
    let S = null; try { S = P.make(rows, spec, { width: 900, height: 560 }, global.NetflowScene); } catch (e) { ok(false, t + ' at ' + n + ' rows threw ' + e.message); continue; }
    const bad = finite(S); ok(!bad.length, t + ' at ' + n + ' rows: ' + bad.slice(0, 3).join(', '));
    ok(S.w === 920 && S.h === 580, t + ' frame');
    if (n >= 7 && t !== 'words') ok(S.rects.length + S.dots.length + S.polys.length + (S.curves || []).length > 0, t + ' at ' + n + ' rows draws shapes');
    /* a missing or wrong column draws a note, not a crash */
    try { const S2 = P.make(rows, Object.assign({}, spec, { x: 'nope', y: 'blank', color: 'nope2' }), { width: 400, height: 300 }, global.NetflowScene); ok(!finite(S2).length, t + ' with missing columns'); } catch (e) { ok(false, t + ' with missing columns threw ' + e.message); }
  }
}
/* the pointer finds a bar and a wedge */
const rows = table(50, 9), sb = P.make(rows, { type: 'bar', x: 'region', y: 'sales' }, { width: 900, height: 560 }, global.NetflowScene), m0 = sb.marks[0];
ok(m0 && P.markAt(sb, (m0.x0 + m0.x1) / 2, (m0.y0 + m0.y1) / 2) === m0, 'bar under the pointer');
ok(P.markAt(sb, -5, -5) === null, 'nothing outside');
const sp = P.make(rows, { type: 'donut', x: 'kind' }, { width: 600, height: 600 }, global.NetflowScene), w = sp.marks[0].wedge, am = (w[4] + w[5]) / 2, rm = (w[2] + w[3]) / 2;
ok(P.markAt(sp, w[0] + Math.cos(am) * rm, w[1] + Math.sin(am) * rm) === sp.marks[0], 'wedge under the pointer');
/* bar totals add up */
const tot = rows.reduce((s, r) => s + r.attrs.sales, 0), sum = sb.marks.reduce((s, m) => s + (m.v || 0), 0);
ok(Math.abs(sum - tot) < 1e-6 * tot || !sb.marks.some((m) => m.v !== undefined), 'bar totals ' + sum + ' vs ' + tot);
/* ticks and kde */
const tk = P.ticks(0, 97, 6); ok(tk.lo <= 0 && tk.hi >= 97 && tk.list.length >= 3, 'ticks cover the range');
const d = P.kde([1, 2, 3, 4, 5], 0, 6, 61, 0.8); let area = 0; for (let i = 0; i < 61; i++) area += d[i] * 0.1; ok(Math.abs(area - 1) < 0.05, 'density sums to one: ' + area.toFixed(3));
ok(Math.abs(P.normInv(0.975) - 1.95996) < 1e-3, 'normal quantile');
console.log(fails ? fails + ' of ' + checks + ' checks failed' : checks + ' checks passed');
process.exit(fails ? 1 : 0);
