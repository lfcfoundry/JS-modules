/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-scene checks (Node pass/fail only, no timing): the link look cache (o.lookPlan) and the flat link lists give the same links as a plain build, and the public link accessors work.
 * Run: node modules/netflow-scene/test/run.js */
'use strict';
const E = require('../../netflow-engine/netflow-engine.js'), SC = require('../netflow-scene.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const bigNetwork = require('./fixture.js');
/* look plan */
{
const L = E.build(bigNetwork(1200, 6, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
let calls = 0;
const opts = (extra) => Object.assign({ colorBy: 'group', theme: 'light', linkStyle: () => { calls++; return null; } }, extra);
const snap = (S) => JSON.stringify(S.curves.map((c) => [c.P, c.w, c.color, c.arrow, c.line, c.edge, c.dash]));
const plain = SC.make(L, opts()); const base = calls; ok(base > 500, 'look worked out per link: ' + base);
const plan = {};
calls = 0; const a = SC.make(L, opts({ lookPlan: plan })); const first = calls;
calls = 0; const b = SC.make(L, opts({ lookPlan: plan })); const second = calls;
ok(first === base, 'first build with a plan costs the same: ' + first + ' vs ' + base);
ok(second === 0, 'second build reuses every look: ' + second);
ok(snap(a) === snap(plain) && snap(b) === snap(plain), 'same links as a fresh build');
calls = 0; SC.make(L, opts({ lookPlan: plan, theme: 'dark' })); ok(calls === base, 'another theme starts over: ' + calls);
calls = 0; SC.make(L, opts({ lookPlan: plan, theme: 'dark' })); ok(calls === 0, 'and keeps the new looks');
const L2 = E.build(bigNetwork(800, 6, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
calls = 0; SC.make(L2, opts({ lookPlan: plan, theme: 'dark' })); ok(calls > 0, 'another map starts over: ' + calls);
calls = 0; SC.make(L2, opts({ theme: 'dark' })); ok(calls > 0, 'no plan, no reuse');
console.log('ok   look plan: ' + base + ' looks once, 0 on the next picture');
}
/* flat links */
{
const L = E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
const base = { colorBy: 'group', theme: 'light' };
const flat = SC.make(L, base), objs = SC.make(L, Object.assign({ flat: false }, base));
const n = flat.curveCount(); ok(n > 2000 && n === objs.curveCount(), 'a big map: ' + n + ' vs ' + objs.curveCount());
ok(flat.curvesPacked() && !objs.curvesPacked(), 'the flat build is packed from the start, the styled one is objects');
const snap = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.edge, c.from, c.to, c.dash || 0], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
const f0 = flat.curves.map((c) => c), o0 = snap(objs);   /* waking the flat one is allowed */
ok(!flat.curvesPacked(), 'reading S.curves makes the objects');
const fs = snap(flat); for (let i = 0; i < n; i++) ok(fs[i] === o0[i], 'link ' + i + ' differs:\n' + fs[i] + '\n' + o0[i]);
/* styling and picture lists on fresh packed scenes */
const mk = () => SC.make(L, base), a = mk(), b = SC.make(L, Object.assign({ flat: false }, base));
const focus = new Set(L.nodes.slice(0, 40).map((x) => x.key || x.id));
for (const st of [{}, { focus }, { focus, edges: new Set([3, 5, 9]) }, {}]) {
  SC.style(a, st); SC.style(b, st); ok(a.curvesPacked(), 'styling leaves the links packed');
  const A = a.curves.map((c) => c.a === undefined ? 1 : c.a), B = b.curves.map((c) => c.a === undefined ? 1 : c.a);
  for (let i = 0; i < n; i++) ok(Math.fround(A[i]) === Math.fround(B[i]), 'alpha of link ' + i + ': ' + A[i] + ' vs ' + B[i]);
  a.packNow(); ok(a.curvesPacked(), 'packed again');
}
const c = mk(); SC.style(c, { selEdges: new Set([2]) }); ok(c.curves[2].base && c.curves[2].a === 1, 'a selected link falls back to objects and is lit');
console.log('ok   flat links: ' + n + ' links equal, styling reads the lists');
}
/* flat links with link rules, dashes, arrowheads and bends (1.1.0) */
{
const L = E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
const rules = (e, ei) => ei % 11 === 0 ? { color: '#d33', w: 3, dash: 'dot' } : ei % 7 === 0 ? { arrow: true } : ei % 5 === 0 ? { bend: 0.2, opacity: 0.4 } : ei % 13 === 0 ? { hide: true } : ei % 17 === 0 ? { dash: 'long', arrow: true, bend: -0.15 } : null;
const snap = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.tip, c.edge, c.from, c.to, c.dash || 0, c.a], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
for (const extra of [{ linkStyle: rules }, { curve: 0.25 }, { linkStyle: rules, curve: 0.1 }]) {
  const base = Object.assign({ colorBy: 'group', theme: 'light' }, extra);
  const flat = SC.make(L, base), objs = SC.make(L, Object.assign({ flat: false }, base));
  const n = flat.curveCount(); ok(n > 2000 && n === objs.curveCount(), 'count ' + n + ' vs ' + objs.curveCount());
  ok(flat.curvesPacked() && !objs.curvesPacked(), 'flat is packed from the start');
  let tips = 0, seen = 0; flat.eachCurveView((v) => { seen++; if (v.tip) tips++; }); ok(seen === n && flat.curvesPacked(), 'eachCurveView leaves it packed');
  const fs = snap(flat), os = snap(objs);
  for (let i = 0; i < n; i++) ok(fs[i] === os[i], 'link ' + i + ' differs:\n' + fs[i] + '\n' + os[i]);
  console.log('ok   flat rules ' + Object.keys(extra).join('+') + ': ' + n + ' links equal, ' + tips + ' arrowheads packed');
}
}
/* the public link accessors the renderers use */
{
  const S = SC.make(E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' }), { colorBy: 'group', theme: 'light' });
  ok(S.curvesPacked() && S.curvesStraight() && S.curveCount() > 2000, 'packed, straight, counted');
  let seen = 0; S.eachCurveView((c, j) => { if (j === 0) ok(c.P.length === 8 && c.w > 0, 'view of a link'); seen++; }); ok(seen === S.curveCount(), 'eachCurveView visits every link');
  ok(S.curvesPacked(), 'reading through views leaves the links packed');
  console.log('ok   accessors: ' + seen + ' links read without waking the list');
}
{ /* families (opt-in): groups sharing the part before ':' share one hue in steps that only get stronger on the background; off by default */
  const groups = ['EU: France', 'EU: Spain', 'EU: Italy', 'Asia: Japan', 'Asia: India', 'Brazil'], L = { view: 'network', kind: 'network', nodes: groups.map((g, i) => ({ id: 'n' + i, label: g, group: g, x: i * 40, y: 0, w: 20, h: 20, cx: i * 40, cy: 0 })), edges: [] };
  const lin = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4), lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]), cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const theme of ['light', 'dark']) {
    const T = SC.palette(theme), F = SC.familyColors(groups.slice().sort(), T, true), key = (c) => c.slice(0, 3).map((v) => Math.round(v * 255)).join();
    const fam = (g) => g.split(':')[0], hueOf = (g) => key(F.get(groups.filter((x) => fam(x) === fam(g)).sort()[0]));
    ok(new Set(groups.map((g) => key(F.get(g)))).size === groups.length, theme + ' families: every group still has its own color');
    ok(key(F.get('EU: France')) === key(T.groups[2]) && key(F.get('Asia: India')) === key(T.groups[0]) && key(F.get('Brazil')) === key(T.groups[1]), theme + ' families: each family starts on one list color, in sorted order');
    ok(groups.every((g) => cr(F.get(g), T.bg) >= cr(SC.palette(theme).groups[['Asia', 'Brazil', 'EU'].indexOf(fam(g))], T.bg) - 0.01), theme + ' families: steps never get weaker on the background');
    const S0 = SC.make(L, { theme }), S1 = SC.make(L, { theme, families: true });
    ok(key(S0.nodes[0].fill || S0.dots[0].fill) !== key(S1.nodes[0].fill || S1.dots[0].fill) || key(S0.dots[1].fill) !== key(S1.dots[1].fill), theme + ' families: make() uses them');
    ok(key(SC.make(L, { theme }).dots[0].fill) === key(S0.dots[0].fill), theme + ' families off: colors as before');
  }
  ok(SC.familyColors(['a'], SC.palette('light'), false) === null, 'families off: no map');
  console.log('ok   families: shared hues for prefixed groups, opt-in');
}
/* Sankey value labels and notes (sk.valueLabel, sk.unit, sk.percentOf, notes) */
{
  const SK = require('../../netflow-sankey/netflow-sankey.js'); E.use('sankey', SK);
  const d = [{ from: 'Salary', to: 'Rent', value: 1800 }, { from: 'Salary', to: 'Food', value: 1200 }, { from: 'Gift', to: 'Food', value: 300 }, { from: 'Food', to: 'Groceries', value: 1000 }, { from: 'Food', to: 'Eating out', value: 500 }];
  const texts = (o) => E.toSvg(d, Object.assign({ view: 'sankey' }, o)), tx = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  ok(texts({ sk: { nodeValues: true } }) === texts({ sk: { valueLabel: 'under' } }), 'nodeValues: true is valueLabel under, as before');
  ok(texts({ sk: {} }) === texts({ sk: { valueLabel: 'none', unit: '$' } }), 'nothing asked: the same picture');
  ok(tx(texts({ sk: { valueLabel: 'both', unit: '$' } })).includes('$1,500 (45%)'), 'both with a money sign');
  ok(tx(texts({ sk: { valueLabel: 'inline', unit: 'GWh' } })).some((x) => /^Rent\s1,800 GWh$/.test(x)), 'inline with a word unit');
  ok(tx(texts({ sk: { valueLabel: 'percent', percentOf: 'column' } })).includes('100%'), 'percent of the column');
  const L = E.build({ nodes: ['Salary', 'Rent', 'Food', 'Gift', 'Groceries', 'Eating out'].map((id) => ({ id, label: id })), edges: d.map((e) => ({ from: e.from, to: e.to, weight: e.value })) }, { view: 'sankey', sk: {}, amounts: true, widthBy: 'weight' });
  const S = SC.make(L, { sk: { valueLabel: 'inline', unit: '$' }, nodeStyle: (n) => n.nodeId === 'Rent' ? { labelText: 'Housing' } : null, notes: [{ text: 'Food is {share:Food} of {total}', x: 0.5, y: 0.02, anchor: 'Food' }, { text: 'Gift {value:Gift}', x: 0.1, y: 0.9 }, { text: 'Rent', x: 0.2, y: 0.95, anchor: 'Salary>Rent' }] });
  ok(S.labels.some((l) => /^Housing\s\$1,800$/.test(l.t)), 'a labelText override keeps working with the amount');
  ok(S.labels.some((l) => l.note && l.t === 'Food is 45% of $3,300'), 'a note with live words');
  ok(S.curves.filter((c) => c.note).length === 2, 'two leader lines');
  ok(S.labels.some((l) => l.note && l.t === 'Gift $300'), 'a note finds an item by the data\'s own id');
  const S2 = SC.make(L, { sk: { unit: '$' }, notes: [{ text: '{top} | {topbox}', x: 0.5, y: 0.02 }] });
  ok(S2.labels.some((l) => l.note && l.t === 'Salary \u2192 Rent, $1,800 | Salary, $3,000'), '{top} is the biggest flow and {topbox} the biggest box, each with its amount');
  console.log('ok   sankey value labels and notes');
}
/* big runs of plain dots go in layers whose dots never touch (since 1.11.0); 999 or fewer stay circles */
{
  const dot = (cx, cy) => ({ cx, cy, r: 3.6, fill: [176, 122, 161, 0.85], stroke: [0, 0, 0, 0], sw: 0 });
  const mk = (n) => { const S = SC.make({ kind: 'network', view: 'network', dir: 'none', nodes: [], edges: [], width: 400, height: 300 }, {}); S.dots = []; for (let i = 0; i < n; i++) S.dots.push(dot(20 + (i * 37) % 360, 20 + (i * 53) % 260)); return S; };
  const small = SC.toSvg(mk(999)), big = SC.toSvg(mk(3000));
  ok((small.match(/<circle /g) || []).length === 999 && !/<path d="M[\d.]+ [\d.]+a/.test(small), '999 dots: one circle each, as before');
  ok(!/<circle /.test(big), '3,000 dots: no circles');
  const layers = [...big.matchAll(/<path d="(M[^"]*a[^"]*)"\/>/g)].map((m) => [...m[1].matchAll(/M([-\d.]+) ([-\d.]+)a/g)].map((q) => [+q[1] + 3.6, +q[2]]));
  ok(layers.reduce((a, l) => a + l.length, 0) === 3000, 'every dot is in one layer');
  ok(layers.every((l) => l.every((p, i) => l.every((q, j) => j <= i || (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 >= 7.2 * 7.2))), 'no two dots in a layer touch');
  console.log('ok   big dot runs: layers that never touch');
}
/* straight curve pieces (handles at a third and two thirds) are written as L; real curves stay C (since 1.10.6) */
{
  const S = SC.make({ kind: 'network', view: 'network', dir: 'none', nodes: [], edges: [], width: 200, height: 100 }, {});
  const ax = 10, ay = 20, bx = 70, by = 50;
  S.curves = [{ P: [ax, ay, ax + (bx - ax) / 3, ay + (by - ay) / 3, ax + 2 * (bx - ax) / 3, ay + 2 * (by - ay) / 3, bx, by, 90, 10, 120, 90, 150, 40], w: 2, color: [0, 0, 0, 1] }];
  const svg = SC.toSvg(S);
  ok(svg.includes('d="M10 20L70 50C90 10 120 90 150 40"'), 'a straight piece is L, a bent one stays C');
  console.log('ok   straight curve pieces as L');
}
/* a look shared by one or two dots in a row sits on the dots, not in a group of its own (since 1.12.1); three or more still share a group, and the order of the dots never changes */
{
  const S = SC.make({ kind: 'network', view: 'network', dir: 'none', nodes: [], edges: [], width: 200, height: 100 }, {});
  const A = [1, 0, 0, 1], B = [0, 0, 1, 1], N = [0, 0, 0, 0];
  const mk = (f, x) => ({ cx: x, cy: 10, r: 3, fill: f, stroke: N, sw: 0, kind: 1 });
  S.dots = [mk(A, 10), mk(B, 20), mk(B, 30), mk(A, 40), mk(A, 50), mk(A, 60), mk(B, 70)];
  const svg = SC.toSvg(S), xs = [...svg.matchAll(/<circle[^>]*? cx="(\d+)"/g)].map((m) => +m[1]);
  ok(xs.join() === '10,20,30,40,50,60,70', 'dots keep their order');
  ok(/<circle fill="rgba\(255,0,0,1\)" cx="10"/.test(svg) && /<circle fill="rgba\(0,0,255,1\)" cx="30"/.test(svg), 'a short run carries its fill on the circle');
  ok(svg.split('<g fill=').length === 2 && /<g fill="rgba\(255,0,0,1\)">\s*<circle cx="40"/.test(svg), 'a run of three keeps one group');
  console.log('ok   short dot runs carry their own look');
}
/* long lines in pieces (since 1.10.4): a solid line over 8,000 segments is written as overlapping pieces of 2048; the pieces join up to the same points, and shorter or dashed lines stay one path */
{
  global.NetflowScene = SC; const P = require('../../netflow-plot/netflow-plot.js');
  const line = (n, o) => { const r = []; for (let i = 0; i < n; i++) r.push({ x: i, y: Math.sin(i / 50) * 40 + (i % 7) }); return SC.toSvg(P.make(r, Object.assign({ type: 'line', x: 'x', y: 'y' }, o), {}, SC)); };
  const strokes = (s) => (s.match(/<path d="M[^"]*" fill="none" stroke="[^"]*" stroke-width/g) || []);
  const big = strokes(line(20000)), small = strokes(line(8000)), C = (a) => a.reduce((n, d) => n + (d.match(/[CL]/g) || []).length, 0);
  ok(big.length - small.length === 9, 'a 20,000-point line is 10 pieces where an 8,000-point line is one path (' + big.length + ' vs ' + small.length + ' stroked paths)');
  const other = C(small) - 7999;   /* curves that are not the line (the same in both pictures) */
  ok(C(big) - (big.length - small.length) === 19999 + other, 'the pieces hold every segment once, plus one shared segment per join (' + C(big) + ')');
  console.log('ok   long lines in pieces of 2048 above 8,000 segments');
}
/* three groups (since 1.12.0): mauve, light green and orange, the set most apart for every kind of color vision; checked in normal vision and three simulated
   color-vision types (Machado 2009 matrices, CIELAB distance), in light and dark; four groups keep the usual order; a plot key shows all three names */
{
  const M = { deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]], prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], trit: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const sim = (c, k) => { const l = c.slice(0, 3).map((v) => lin(v > 1 ? v / 255 : v)); return k ? M[k].map((r) => Math.min(1, Math.max(0, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))) : l; };
  const lab = ([r, g, b]) => { const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116, X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const worst = (set) => { let m = 1e9; for (const k of [null, 'deut', 'prot', 'trit']) for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const A = lab(sim(set[i], k)), B = lab(sim(set[j], k)); m = Math.min(m, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])); } return m; };
  const gaps = [], gaps0 = [];
  for (const th of ['light', 'dark']) {
    const g = SC.palette(th).groups, t3 = SC.threeGroups(g).slice(0, 3), w3 = worst(t3), w0 = worst(g.slice(0, 3)); gaps.push(w3.toFixed(1)); gaps0.push(w0.toFixed(1));
    ok(w3 >= 25 && w3 > w0 * 1.5, th + ': the three-group set is at least 25 apart in every color vision and well past the first three (' + w3.toFixed(1) + ' vs ' + w0.toFixed(1) + ')');
    const graph = (n) => { const nodes = [], edges = []; for (let i = 0; i < n * 3; i++) { nodes.push({ id: 'n' + i, group: 'g' + (i % n) }); if (i) edges.push({ from: 'n' + (i - 1), to: 'n' + i }); } return E.build({ nodes, edges }, { view: 'network', colorBy: 'group' }); };
    const key = (S) => S.legend.filter((l) => l.k === 'swatch').map((l) => String(l.c.slice(0, 3)));
    ok(JSON.stringify(key(SC.make(graph(3), { colorBy: 'group', theme: th }))) === JSON.stringify(t3.map((c) => String(c.slice(0, 3)))), th + ': a three-group graph uses mauve, light green and orange');
    ok(JSON.stringify(key(SC.make(graph(4), { colorBy: 'group', theme: th }))) === JSON.stringify(g.slice(0, 4).map((c) => String(c.slice(0, 3)))), th + ': four groups keep the usual order');
    ok(JSON.stringify(key(SC.make(graph(3), { colorBy: 'group', theme: th, palette: 'vivid' }))) === JSON.stringify(SC.palette(th, 'vivid').groups.slice(0, 3).map((c) => String(c.slice(0, 3)))), th + ': a chosen palette keeps its own order');
  }
  global.NetflowScene = SC; const P = require('../../netflow-plot/netflow-plot.js'), rows = [];
  for (let i = 0; i < 60; i++) rows.push({ a: i % 17, b: (i * 7) % 23, s: ['Adelie', 'Chinstrap', 'Gentoo'][i % 3] });
  const svg = P.toSvg(rows, { type: 'scatter', x: 'a', y: 'b', color: 's', width: 300, height: 220 });
  ok(['Adelie', 'Chinstrap', 'Gentoo'].every((n) => svg.includes('>' + n + '<')) && !svg.includes(' more<'), 'a 300-wide scatter key names all three groups');
  console.log('ok   three groups: worst color-vision gap ' + gaps.join(' and ') + ' (light, dark; today ' + gaps0.join(' and ') + '), four keep their order, all three names in the key');
}
