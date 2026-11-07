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
    ok(S.w === 920 && S.h === 580 && !S.frame, t + ' frame');
    if (n === 7) { const F1 = P.make(rows, spec, { width: 900, height: 560, frame: true }, global.NetflowScene); ok(F1.w === 920 && F1.h > 580 && F1.frame && F1.rects.filter((r) => r.frame).length === 2, t + ' frame: true adds the red tag and the rule'); }
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
/* axis names from column names (owner's card, 2026.11.05): tidied, one-letter names left out */
{
  const NS = global.NetflowScene, rows = [{ region_name: 'West', salesTotal: 5 }, { region_name: 'East', salesTotal: 3 }];
  const S = P.make(rows, { type: 'bar', x: 'region_name', y: 'salesTotal' }, { width: 600, height: 400 }, NS), names = S.labels.map((l) => l.t);
  ok(names.includes('Region name') && names.includes('Sales total') && !names.includes('region_name'), 'axis names tidied: ' + names.filter((t) => /name|total/i.test(t)).join(', '));
  const S2 = P.make([{ r: 'West', v: 5 }, { r: 'East', v: 3 }], { type: 'bar', x: 'r', y: 'v' }, { width: 600, height: 400 }, NS);
  ok(!S2.labels.some((l) => l.t === 'r' || l.t === 'v' || l.t === 'R' || l.t === 'V'), 'one-letter axis names left out');
}
/* opt-in title, subtitle and source: nothing changes without them; with them the block sits above (source below) and the picture does not move */
{
  const rows = table(40, 9), spec = { type: 'bar', x: 'region', y: 'sales' }, NS = global.NetflowScene;
  const a = P.make(rows, spec, { width: 900, height: 560 }, NS), b = P.make(rows, spec, { width: 900, height: 560, title: 'Sales', subtitle: 'All rows', source: 'Source: test' }, NS);
  ok(!a.titles && a.labels.every((l) => !l.title), 'no title block unless asked');
  ok(b.labels.slice(0, 3).map((l) => l.t).join('|') === 'Sales|All rows|Source: test', 'title, subtitle and source come first in the name list');
  ok(b.y0 < a.y0 && b.h > a.h && b.labels[2].y > a.y0 + a.h, 'the frame grows above for the title and below for the source');
  const own = (S) => JSON.stringify(S.rects.filter((r) => !r.frame));
  ok(own(a) === own(b), 'the picture itself does not move');
  ok(NS.toSvg(b, 't').indexOf('>Sales</text>') > 0, 'the export draws the title');
}
/* opt-in highlight: one series (or one bar) keeps its color, the rest turn gray; an unknown name changes nothing */
{
  const rows = table(200, 11), NS = global.NetflowScene, sp = { type: 'line', x: 'day', y: 'sales', color: 'region' };
  const key = (c) => c.slice(0, 3).map((v) => v.toFixed(3)).join();
  const a = P.make(rows, sp, { width: 900, height: 560 }, NS), b = P.make(rows, sp, { width: 900, height: 560, highlight: 'West' }, NS), c = P.make(rows, sp, { width: 900, height: 560, highlight: 'Nowhere' }, NS);
  const g = b.legend.filter((l) => l.t !== 'West'), w = b.legend.find((l) => l.t === 'West');
  const a0 = a.legend.filter((l) => l.t !== 'West'), fade = (c) => NS.mix(c, NS.palette('light').bg, 0.6);
  ok(g.length === 4 && g.every((l) => key(l.c) === key(fade(a0.find((m) => m.t === l.t).c))) && key(w.c) === key(a.legend.find((l) => l.t === 'West').c), 'highlight: the other series keep their own color at 40% strength, the chosen one is unchanged');
  ok(key(b.curves[b.curves.length - 1].color) === key(w.c), 'highlight: the chosen series is drawn last');
  ok(NS.toSvg(c, 't') === NS.toSvg(a, 't'), 'highlight: an unknown name changes nothing');
  const sm = table(60, 12), bp = P.make(sm, { type: 'scatter', x: 'cost', y: 'sales', color: 'kind' }, { width: 600, height: 400, highlight: 'B' }, NS);
  const bp0 = P.make(sm, { type: 'scatter', x: 'cost', y: 'sales', color: 'kind' }, { width: 600, height: 400 }, NS);
  ok(bp.legend.filter((l) => l.t !== 'B').every((l) => key(l.c) === key(fade(bp0.legend.find((m) => m.t === l.t).c))), 'highlight works on scatter');
  const br = P.make(sm, { type: 'bar', x: 'region', y: 'sales' }, { width: 600, height: 400, highlight: 'East' }, NS);
  ok(new Set(br.rects.filter((r) => !r.frame).map((r) => key(r.fill))).size === 2, 'highlight one bar with no color column');
  const many = []; for (let i = 0; i < 300; i++) many.push({ id: 'm' + i, attrs: { c: 'k' + (i % 30), g: 'k' + (i % 30), v: 30 - (i % 30) } });
  const ms = P.make(many, { type: 'bar', x: 'c', y: 'v', color: 'c' }, { width: 600, height: 400, highlight: 'k29' }, NS);
  ok(new Set(ms.rects.filter((r) => !r.frame).map((r) => key(r.fill))).size === 2, 'color same as x: one bar keeps its color');
  const mo = P.make(many, { type: 'bar', x: 'c', y: 'v', color: 'g' }, { width: 600, height: 400, highlight: 'k29' }, NS);
  ok(mo.legend.some((l) => l.t === 'k29'), 'a highlighted name past the color limit is kept, not folded into Other');
}
/* clean look (default): bar values on the bars and no number axis; clean: false keeps the axis; crowded values bring the axis back */
{
  const NS = global.NetflowScene, rows = ['North', 'South', 'East'].map((r, i) => ({ attrs: { region: r, sales: [120, 80, 45][i] } }));
  const a = P.make(rows, { type: 'bar', x: 'region', y: 'sales' }, { width: 600, height: 400 }, NS), b = P.make(rows, { type: 'bar', x: 'region', y: 'sales' }, { width: 600, height: 400, clean: false }, NS);
  const ts = (S) => S.labels.map((l) => l.t);
  ok(['120', '80', '45'].every((t) => ts(a).includes(t)), 'values on the bars: ' + ts(a).join(','));
  ok(!ts(a).includes('100') && ts(b).includes('100') && !ts(b).includes('45'), 'number axis only with clean: false');
  const many = []; for (let i = 0; i < 40; i++) many.push({ attrs: { k: 'K' + i, v: 123456 + i * 1000 } });
  const c = P.make(many, { type: 'bar', x: 'k', y: 'v', sort: 'none' }, { width: 400, height: 300 }, NS);
  ok(!ts(c).includes('123k'), 'values that do not fit bring the number axis back');
  const bx = P.make([1, 2, 3, 4, 5, 6, 7].map((v) => ({ attrs: { g: 'A', y: v } })), { type: 'box', x: 'g', y: 'y' }, { width: 400, height: 300 }, NS);
  ok(ts(bx).includes('4'), 'box median written: ' + ts(bx).join(','));
}
 /* one call: toSvg(rows) picks a bar chart of the first text column by the first number column; options carry chart and drawing words together */
{
  const s = P.toSvg([{ city: 'Detroit', share: 12 }, { city: 'Chicago', share: 16 }]);
  ok(s.indexOf('<svg') === 0 && s.indexOf('>Detroit<') > 0 && s.indexOf('>16<') > 0, 'toSvg(rows) draws bars with values');
  const l = P.toSvg(table(30, 5), { type: 'line', x: 'day', y: 'sales', theme: 'dark', title: 'Sales' }); ok(l.indexOf('>Sales<') > 0, 'chart and drawing words in one options object');
}
{ /* clean look: line names at the line ends, crowded bar names on two rows, years without separators */
  const NS = global.NetflowScene, cc = ['United States', 'Canada', 'Britain', 'Germany', 'France', 'Japan', 'Italy'], rows = [];
  cc.forEach((c, k) => { for (let y = 2010; y < 2026; y++) rows.push({ attrs: { year: y, country: c, rate: 5 + (k % 3) * 0.1 + (y - 2010) * 0.01 } }); });
  const S = P.make(rows, { type: 'line', x: 'year', y: 'rate', color: 'country' }, { width: 640, height: 400 }, NS);
  const tags = S.labels.filter((l) => cc.some((c) => l.t.startsWith(c + ' ')));
  ok(tags.length === 7, 'line ends: every line named (' + tags.length + ')');
  const ys = tags.map((l) => l.y).sort((a, b) => a - b); ok(ys.every((y, i) => !i || y - ys[i - 1] >= 12.99), 'line ends: names 13 px apart, never overlapping');
  ok(tags.every((l) => l.x + l.t.length * 6.05 <= 640 && l.y > 20 && l.y < 400), 'line ends: names inside the picture');
  ok(!S.labels.some((l) => l.t === 'country:'), 'line ends: no key row over the chart');
  ok(S.labels.some((l) => l.t === '2010') && !S.labels.some((l) => /^2,0/.test(l.t)), 'years print as 2010, not 2,010');
  const S0 = P.make(rows, { type: 'line', x: 'year', y: 'rate', color: 'country' }, { width: 640, height: 400, clean: false }, NS);
  ok(S0.labels.some((l) => l.t === 'country:'), 'clean: false keeps the key row');
  /* the 1:00 PM 11.01 rule covers line charts: no gridlines, no number axis, values on the lines */
  const flat = (S2) => S2.curves.filter((c) => c.line && (Math.abs(c.P[1] - c.P[c.P.length - 1]) < 0.01 || Math.abs(c.P[0] - c.P[c.P.length - 2]) < 0.01)).length - 1;   /* straight rules across the plot, less the one base line */
  ok(flat(S) === 0 && flat(S0) > 0, 'line chart: no gridlines (clean: false keeps them)');
  const st = S.labels.filter((l) => /^\d/.test(l.t) && l.x < S.labels.find((q) => q.t === '2010').x).map((l) => l.y).sort((p, q) => p - q);
  ok(tags.every((l) => /\d$/.test(l.t)) && st.length >= 2 && st.length < 7 && st.every((y, i) => !i || y - st[i - 1] >= 13), 'line chart: last value after each name; first values left of the lines, one that would touch another left out (' + st.length + ' of 7 shown)');
  const one = P.make(rows.filter((r) => r.attrs.country === 'Canada').map((r, i) => ({ attrs: { year: r.attrs.year, rate: [3, 9, 4, 1, 6, 5, 7, 2, 8, 4, 5, 6, 3, 4, 5, 6][i] } })), { type: 'line', x: 'year', y: 'rate' }, { width: 640, height: 400 }, NS);
  ok(['3', '6', '9', '1'].every((v) => one.labels.some((l) => l.t === v)) && flat(one) === 0, 'single line: first, last, high and low values written, no gridlines');
  const many = []; for (let k = 0; k < 12; k++) for (let y = 0; y < 5; y++) many.push({ attrs: { x: y, s: 'S' + k, v: k + y } });
  ok(P.make(many, { type: 'line', x: 'x', y: 'v', color: 's' }, { width: 640, height: 400 }, NS).labels.some((l) => l.t === 's:'), 'more than 10 lines: the key row comes back');
  const cities = ['Detroit', 'Chicago', 'Cleveland', 'Toronto', 'Columbus', 'Pittsburgh', 'Milwaukee', 'Buffalo'], br = cities.map((c, i) => ({ attrs: { city: c, share: 4 + i } }));
  const SB = P.make(br, { type: 'bar', x: 'city', y: 'share' }, { width: 560, height: 347 }, NS), names = SB.labels.filter((l) => cities.indexOf(l.t) >= 0);
  ok(names.length === 8, 'crowded bar names: all 8 shown (' + names.length + ')');
  const rowsY = new Set(names.map((l) => l.y)); ok(rowsY.size === 2, 'crowded bar names: on two rows');
  ok(names.every((a) => names.every((b) => a === b || a.y !== b.y || Math.abs(a.x - b.x) >= (a.t.length + b.t.length) * 6.05 / 2)), 'crowded bar names: none touch on a row');
}
// the chart picked from the shape of the rows (2.9.0): small tables shaped like real ones, each with the kinds a person would accept
{
  const days = (n, f) => Array.from({ length: n }, (_, i) => f(i, new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)));
  const T = [
    ['two names and numbers (the README example)', [{ city: 'Detroit', share: 12 }, { city: 'Chicago', share: 16 }], 'bar'],
    ['dates and a price', days(30, (i, d) => ({ date: d, price: 100 + i })), 'line'],
    ['"Jan 1 2000" dates', ['Jan 1 2000', 'Feb 1 2000', 'Mar 1 2000', 'Apr 1 2000', 'May 1 2000', 'Jun 1 2000'].map((d, i) => ({ date: d, price: 10 + i * i })), 'line'],
    ['a year column and a value', Array.from({ length: 20 }, (_, i) => ({ year: 1990 + i, temp: Math.sin(i) })), 'line'],
    ['one line per symbol', ['A', 'B', 'C'].flatMap((s) => days(10, (i, d) => ({ symbol: s, date: d, price: i + s.charCodeAt(0) }))), 'line'],
    ['month names are categories, not a time line', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => ({ month: m, sales: 5 + i })), 'bar'],
    ['two measures and a group', Array.from({ length: 60 }, (_, i) => ({ species: ['a', 'b', 'c'][i % 3], length: i % 17, depth: (i * 7) % 13 })), 'scatter'],
    ['latitude and longitude', Array.from({ length: 30 }, (_, i) => ({ name: 'p' + i, latitude: 40 + i / 10, longitude: -80 - i / 7 })), 'scatter'],
    ['from and to', [{ from: 'Salary', to: 'Rent', amount: 1800 }, { from: 'Salary', to: 'Food', amount: 600 }, { from: 'Gift', to: 'Food', amount: 300 }], 'sankey'],
    ['a parent column', [{ id: 1, name: 'root' }, { id: 2, name: 'a', parent: 1, size: 3 }, { id: 3, name: 'b', parent: 1, size: 5 }], 'treemap'],
    ['an id and one number', Array.from({ length: 80 }, (_, i) => ({ id: 1000 + i, rate: (i * 37) % 11 / 10 })), 'hist'],
    ['no numbers: rows counted per group', Array.from({ length: 20 }, (_, i) => ({ team: ['red', 'blue'][i % 2], person: 'p' + i })), 'bar'],
    ['a total per group', Array.from({ length: 40 }, (_, i) => ({ region: ['N', 'S', 'E', 'W'][i % 4], shop: 's' + i, sales: i, staff: i % 7 })), 'bar']
  ];
  let right = 0, miss = '';
  for (const [name, rows, want] of T) { const g = P.guess(rows); if (g && g.type === want && typeof g.why === 'string' && g.why.length > 10) right++; else miss += ' [' + name + ': ' + (g && g.type) + ']'; }
  ok(right === T.length, 'guess: ' + right + ' of ' + T.length + ' small tables get the chart a person would pick' + miss);
  const svgOld = P.toSvg([{ city: 'Detroit', share: 12 }, { city: 'Chicago', share: 16 }], { type: 'bar', x: 'city', y: 'share' });
  ok(P.toSvg([{ city: 'Detroit', share: 12 }, { city: 'Chicago', share: 16 }]) === svgOld, 'toSvg(rows) with no options: the README example draws the same bar chart as before');
  const a = P.auto(T[4][1]);
  ok(a.type === 'line' && a.spec.color === 'symbol' && /time column "date"/.test(a.why) && a.svg.indexOf('<svg') === 0, 'auto: the line, its colors and the reason');
  ok(a.others.length >= 1 && a.others.every((o) => o.spec.type === o.type && o.why), 'auto: other picks, each with its own reason');
  const b = P.toSvg(T[4][1], a.others[0].spec);
  ok(b.indexOf('<svg') === 0 && b !== a.svg, 'one-click change: toSvg(rows, others[0].spec) draws the other pick');
  ok(P.toSvg(T[8][1]) === P.auto(T[8][1]).svg && P.auto(T[8][1]).type === 'sankey', 'a from-to table draws as a Sankey through netflow-sankey');
  ok(P.auto(T[9][1]).type === 'treemap' && P.auto(T[9][1]).svg.indexOf('<svg') === 0, 'a parent table draws as a treemap through netflow-hierarchy');
  const big = []; for (let i = 0; i < 60; i++) for (let j = 0; j < 2; j++) big.push({ from: 'f' + i, to: 't' + ((i + j) % 50), count: i + 1 });
  ok(/the 40 biggest of 120 links/.test(P.auto(big).why), 'a big flow table keeps its 40 biggest links and says so');
  ok(P.guess([]) === null && P.auto([]).svg.indexOf('<svg') === 0, 'no rows: no guess, an empty picture');
  // takeaway and screen-reader text (opt-in): worked out from the rows, friendly names, a percent only on a fair base
  const tk = (rows, sp) => P.takeaway(rows, sp).text;
  const reg = [{ region: 'West', sales_total: 1227 }, { region: 'East', sales_total: 1080 }, { region: 'North', sales_total: 300 }];
  ok(tk(reg, { type: 'bar', x: 'region', y: 'sales_total' }) === 'West leads sales total with 1,227, 14% more than East (1,080)', 'takeaway, bar: friendly name and a fair percent: ' + tk(reg, { type: 'bar', x: 'region', y: 'sales_total' }));
  ok(P.takeaway(reg, { type: 'bar', x: 'region', y: 'sales_total' }).alt === 'sales total by region: West 1,227, East 1,080, North 300.', 'alt text lists every value');
  ok(tk([{ a: 'x', v: 5 }, { a: 'y', v: 0.1 }], { type: 'bar', x: 'a', y: 'v' }) === 'x leads v with 5, 50 times as much as y (0.1)', 'small base: no huge percent');
  ok(tk([{ a: 'x', v: 5 }, { a: 'y', v: 5 }, { a: 'z', v: 1 }], { type: 'bar', x: 'a', y: 'v' }) === 'x and y tie for the most v (5)', 'ties');
  ok(tk([{ a: 'x', v: -5 }, { a: 'y', v: -7 }], { type: 'bar', x: 'a', y: 'v' }) === 'x has the highest v with -5, ahead of y (-7)', 'negatives: no percent, "highest"');
  ok(tk([{ a: 'x', v: 0 }, { a: 'y', v: 0 }], { type: 'bar', x: 'a', y: 'v' }) === 'x and y tie for the most v (0)', 'zeros');
  ok(tk([{ a: 'x', v: 3 }, { a: 'y', v: '' }, { a: 'z', v: null }, { a: 'w', v: 1 }], { type: 'bar', x: 'a', y: 'v' }) === 'x leads v with 3, 3 times as much as w (1)', 'missing values are left out');
  ok(tk([{ d: '2020-03-01', p: 81 }, { d: '2020-01-01', p: 43 }, { d: '2020-02-01', p: 50 }], { type: 'line', x: 'd', y: 'p' }) === 'p rose 88% from 43 to 81', 'line: in time order, not row order');
  ok(tk([{ d: '2020-01-01', p: 0.2 }, { d: '2020-02-01', p: 50 }, { d: '2020-03-01', p: 81 }], { type: 'line', x: 'd', y: 'p' }) === 'p rose from 0.2 to 81', 'line: no percent from a tiny start');
  ok(tk([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6.1 }], { type: 'scatter', x: 'x', y: 'y' }) === 'y strongly rises with x (r = 1)' && /the same in every row/.test(tk([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }], { type: 'scatter', x: 'x', y: 'y' })), 'scatter: correlation, and a flat column said plainly');
  ok(tk([{ from: 'Salary', to: 'Rent', amount: 1200 }, { from: 'Salary', to: 'Food', amount: 500 }], { type: 'sankey', from: 'from', to: 'to', value: 'amount' }) === 'The biggest flow is Salary to Rent: 1,200, 71% of what leaves Salary', 'sankey: the biggest flow and its share');
  ok(tk([], { type: 'bar', x: 'a' }) === '' && tk(reg, { type: 'words', x: 'region' }) === '', 'nothing to say: empty text');
  const at = P.auto(reg); ok(at.takeaway === tk(reg, at.spec) && at.alt.length > 10, 'auto returns the takeaway and the alt text');
  ok(P.toSvg(reg, { type: 'bar', x: 'region', y: 'sales_total' }).indexOf('leads') < 0 && P.toSvg(reg, { type: 'bar', x: 'region', y: 'sales_total', title: 'auto' }).indexOf('>West leads sales total with 1,227, 14% more than East (1,080)</text>') > 0, "title: 'auto' draws the takeaway; nothing changes without it");
}
// the visuals review of the auto-chart sheet (2.10.0)
{
  const NS = global.NetflowScene, ts = (S) => S.labels.map((l) => l.t);
  const air = 'ABCDEFGHIJKL'.split(''), loops = []; air.forEach((a, i) => air.forEach((b, j) => { if (i !== j) loops.push({ origin: a, destination: b }); }));
  const ch = P.auto(loops);
  ok(ch.type === 'chord' && /chord/.test(ch.why) && /the 40 biggest of 132 links/.test(ch.why) && ch.svg.indexOf('<svg') === 0 && ch.others[0].type === 'sankey', 'many links where places both send and receive: a chord, with the Sankey as the next pick: ' + ch.why);
  ok(P.auto([{ from: 'Salary', to: 'Rent', amount: 1800 }, { from: 'Salary', to: 'Food', amount: 600 }]).type === 'sankey', 'a small flow table stays a Sankey');
  ok(P.toSvg(loops, { type: 'chord', from: 'origin', to: 'destination' }).indexOf('<svg') === 0 && /biggest flow/.test(P.takeaway(loops, ch.spec).text), "type: 'chord' draws through netflow-circular; the takeaway reads it like a Sankey");
  const sq = Array.from({ length: 100 }, (_, i) => ({ income: i * 10, health: i === 0 ? 14000 : 60 + (i % 20) }));
  ok(/thin line along "health"/.test(P.auto(sq).why) && !/thin line/.test(P.auto(sq.map((r, i) => ({ income: r.income, health: 60 + (i % 20) }))).why), 'a scatter squashed by one far value says so; a normal one does not');
  const bud = [-0.079, 1.2, 4.31, 2, -10.8].map((v, i) => ({ attrs: { year: 2000 + i, value: v } }));
  const Sb = P.make(bud, { type: 'line', x: 'year', y: 'value' }, { width: 640, height: 400 }, NS), vb = ts(Sb).filter((t) => /^-?\d+\.\d$/.test(t));
  ok(vb.includes('-0.1') && vb.includes('4.3') && vb.includes('-10.8') && !ts(Sb).includes('-0.079') && !ts(Sb).includes('4.31'), 'one precision per chart: -0.1, 4.3 and -10.8 (not -0.079, 4.31): ' + vb.join(' '));
  const pop = [9.7e6, 30e6, 144e6].map((v, i) => ({ attrs: { year: 1900 + i * 50, people: v } }));
  ok(ts(P.make(pop, { type: 'line', x: 'year', y: 'people' }, { width: 640, height: 400 }, NS)).includes('10M'), 'one precision: 9.7M next to 144M reads 10M');
  const Sy = P.make(Array.from({ length: 17 }, (_, i) => ({ attrs: { year: 2001 + i, v: i } })), { type: 'line', x: 'year', y: 'v' }, { width: 400, height: 260 }, NS);
  const yl = Sy.labels.filter((l) => /^20\d\d$/.test(l.t)).sort((p, q) => p.x - q.x);
  ok(yl.length >= 2 && yl.every((l, i) => !i || l.x - yl[i - 1].x >= 34) && yl.every((l) => +l.t % 5 === 0) && !ts(Sy).includes('Year'), 'year ticks on a narrow line: round years that do not touch, and no "Year" axis name: ' + yl.map((l) => l.t).join(' '));
  const Sd = P.make(Array.from({ length: 24 }, (_, i) => ({ attrs: { date: new Date(Date.UTC(1854, 3 + i, 1)).toISOString().slice(0, 10), w: i } })), { type: 'line', x: 'date', y: 'w' }, { width: 400, height: 260 }, NS);
  ok(ts(Sd).some((t) => /^[A-Z][a-z]{2} 185\d$/.test(t)) && !ts(Sd).includes('Date'), 'month ticks keep a year on the first label and on January: ' + Sd.labels.filter((l) => /^[A-Z][a-z]{2}( \d{4})?$/.test(l.t)).map((l) => l.t).join(' '));
  const Sh = P.make(Array.from({ length: 3000 }, (_, i) => ({ attrs: { rate: ((i * 7919) % 300) / 1000 } })), { type: 'hist', x: 'rate' }, { width: 400, height: 260 }, NS);
  const hl = Sh.labels.filter((l) => /^0(\.\d+)?$/.test(l.t) && l.y > 200 && l.align !== 'r').sort((p, q) => p.x - q.x);
  ok(hl.length >= 2 && hl.every((l, i) => !i || l.x - hl[i - 1].x >= (l.t.length + hl[i - 1].t.length) * 6.05 / 2 + 10), 'histogram decimals do not touch: ' + hl.map((l) => l.t).join(' '));
  const kr = []; 'abcdefgh'.split('').forEach((g) => { for (let i = 0; i < 5; i++) kr.push({ attrs: { x: i, y: i * 2, group: 'group_name_' + g } }); });
  const Sk = P.make(kr, { type: 'scatter', x: 'x', y: 'y', color: 'group' }, { width: 400, height: 260 }, NS);
  const more = Sk.labels.find((l) => /^\+\d+ more$/.test(l.t)), keys = Sk.labels.filter((l) => /^group_name/.test(l.t) && l.y === (more && more.y));
  ok(more && keys.length >= 1 && keys.every((k) => k.x + k.t.length * 6.6 < more.x), 'key row: "+N more" sits after the last name, never on it');
}
console.log(fails ? fails + ' of ' + checks + ' checks failed' : checks + ' checks passed');
process.exit(fails ? 1 : 0);
