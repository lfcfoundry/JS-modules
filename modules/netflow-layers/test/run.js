/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-layers checks: the old drawing is untouched with every option off (pinned fingerprints made by Netflow Map's own layered engine),
 * story order, tags, the must-pass column, harder untangling, columns, step numbers, lanes, the SVG, and that the input is never changed. Run: node modules/netflow-layers/test/run.js */
'use strict';
const NL = require('../netflow-layers.js'), crypto = require('crypto');
let bad = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const t = (name, fn) => { const t0 = Date.now(); try { const r = fn(); console.log('ok   ' + name + ' (' + (Date.now() - t0) + ' ms)' + (r ? ' ' + r : '')); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
/* a story-shaped map: chapters of 2-4 branches that merge at a must-pass page, side links, shortcuts, a few links back */
function story(n, seed) {
  const r = rng(seed), edges = []; let id = 0; const mk = () => id++; let cur = mk(); const chokes = [cur];
  while (id < n) {
    const b = 2 + Math.floor(r() * 3), ends = [], br = [];
    for (let i = 0; i < b; i++) { const d = 1 + Math.floor(r() * 3); let p = cur; const list = []; for (let j = 0; j < d; j++) { const v = mk(); edges.push([p, v]); p = v; list.push(v); } ends.push(p); br.push(list); }
    for (let i = 0; i + 1 < b; i++) if (r() < 0.35) edges.push([br[i][Math.floor(r() * br[i].length)], br[i + 1][Math.floor(r() * br[i + 1].length)]]);
    const m = mk(); ends.forEach((e) => edges.push([e, m]));
    if (r() < 0.12) edges.push([m, chokes[Math.floor(r() * chokes.length)]]);
    if (r() < 0.15) edges.push([cur, m]);
    cur = m; chokes.push(m);
  }
  return { n: id, edges, chokes };
}
function dag(n, m, seed) { const r = rng(seed), e = []; for (let i = 1; i < n; i++) e.push([Math.floor(r() * i), i]); for (let i = 0; i < m - n + 1; i++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); if (a !== b) e.push(a < b ? [a, b] : [b, a]); } return { n, edges: e, chokes: [] }; }
const graph = (s, extra) => ({ root: 'n0', nodes: Array.from({ length: s.n }, (_, i) => ({ id: 'n' + i, label: 'Page ' + i, w: 140, h: 44, choke: s.chokes.indexOf(i) >= 0, lane: i % 3 })), edges: s.edges.map(([a, b]) => ({ from: 'n' + a, to: 'n' + b })) });
const fp = (R) => crypto.createHash('sha1').update(JSON.stringify([R.nodes.map((n) => [n.id, Math.round(n.x * 1e4) / 1e4, Math.round(n.y * 1e4) / 1e4, n.layer]), R.edges.map((e) => [e.from, e.to, e.kind, (e.pts || []).map((p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4])]), Math.round(R.width * 1e4) / 1e4, Math.round(R.height * 1e4) / 1e4, R.crossings])).digest('hex').slice(0, 16);
const PIN = {"story 30|LR":"a2ef0e73b8425d4d","story 30|TB":"ba65a7cb599ac803","story 120|LR":"bd5da8a0b1f45f46","story 120|TB":"e0a3622662a8ee3f","dag 60/120|LR":"b0bcaad382dc5d98","dag 60/120|TB":"35bcf746f4a43c79","story 400|LR":"23a0ae9e0e933295","story 400|TB":"d69d28c0cb08c66a"};
const MAPS = { 'story 30': story(30, 1), 'story 120': story(120, 2), 'dag 60/120': dag(60, 120, 3), 'story 400': story(400, 4) };

t('every option off: the same pictures Netflow Map\'s own layered engine draws (' + Object.keys(PIN).length + ' fingerprints)', () => {
  Object.keys(PIN).forEach((k) => { const [m, d] = k.split('|'); const got = fp(NL.layout(graph(MAPS[m]), { dir: d })); ok(got === PIN[k], k + ' changed: ' + got + ' vs ' + PIN[k]); });
});
t('the input is never changed', () => {
  const g = graph(MAPS['story 120']), before = JSON.stringify(g); NL.layout(g, { dir: 'TB', rows: 'story', tagLen: 8, wrap: true, spine: true, better: true }); ok(JSON.stringify(g) === before, 'input was edited');
});
t('a chain gets one row per step; a loop back is drawn as a back link', () => {
  const R = NL.layout({ root: 'a', nodes: ['a', 'b', 'c'].map((id) => ({ id, w: 100, h: 40 })), edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }] }, { dir: 'TB' });
  ok(R.nodes.map((n) => n.layer).join() === '0,1,2', 'rows ' + R.nodes.map((n) => n.layer)); ok(R.info.back === 1 && R.edges.filter((e) => e.kind === 'back').length === 1, 'one back link');
});
t('story order: a map with no loops has no back or sideways links; every link points down', () => {
  const g = graph(dag(300, 600, 5)), a = NL.layout(g, { dir: 'TB' }), b = NL.layout(g, { dir: 'TB', rows: 'story' });
  ok(a.info.back + a.info.flat > 50, 'the shortest-route drawing should show many'); ok(b.info.back === 0 && b.info.flat === 0, 'story order left some');
  const at = {}; b.nodes.forEach((n) => { at[n.id] = n.layer; }); b.edges.forEach((e) => ok(at[e.to] > at[e.from], 'link not pointing down'));
  return 'back or sideways ' + (a.info.back + a.info.flat) + ' to 0';
});
t('story order: pages the start cannot reach stay below the rest', () => {
  const g = graph(story(40, 8)); g.nodes.push({ id: 'x1', w: 140, h: 44 }, { id: 'x2', w: 140, h: 44 }); g.edges.push({ from: 'x1', to: 'x2' }, { from: 'x2', to: 'n3' });
  const R = NL.layout(g, { dir: 'TB', rows: 'story' }), ly = {}; R.nodes.forEach((n) => { ly[n.id] = n.layer; }); let mx = 0; R.nodes.forEach((n) => { if (!n.loose && n.layer > mx) mx = n.layer; });
  ok(ly.x1 > mx && ly.x2 > mx, 'loose pages should sit below');
});
t('tags: long links get kind tag and no stops; same input, same picture; far fewer stops', () => {
  const g = graph(story(1000, 9)), a = NL.layout(g, { dir: 'TB', tagLen: 8 }), b = NL.layout(g, { dir: 'TB', tagLen: 8 }), z = NL.layout(g, { dir: 'TB' });
  ok(a.info.tags > 0 && a.info.stops < z.info.stops / 10, 'stops ' + z.info.stops + ' to ' + a.info.stops); a.edges.forEach((e) => { if (e.kind === 'tag') ok(!e.pts.length, 'tag with stops'); }); ok(fp(a) === fp(b), 'not repeatable');
  return 'stops ' + z.info.stops + ' to ' + a.info.stops + ', ' + a.info.tags + ' tags';
});
t('tags: 20,000 pages that the plain drawing refuses draw in the time shown', () => {
  const g = graph(story(20000, 10)); let refused = false; try { NL.layout(g, { dir: 'TB' }); } catch (e) { refused = !!e.tooBig; }
  ok(refused, 'the plain drawing should refuse'); const R = NL.layout(g, { dir: 'TB', tagLen: 8 }); ok(R.nodes.length >= 20000 && R.info.tags > 100, 'no drawing'); return R.info.rows + ' rows, ' + R.info.tags + ' tags';
});
t('must-pass column: marked pages share one column', () => {
  const R = NL.layout(graph(story(300, 11)), { dir: 'TB', spine: true, tagLen: 8 }), ck = R.nodes.filter((n) => n.choke), xs = ck.map((n) => n.x + n.w / 2);
  ok(ck.length > 5 && Math.max.apply(null, xs) - Math.min.apply(null, xs) < 1, 'spread ' + (Math.max.apply(null, xs) - Math.min.apply(null, xs)));
});
t('harder untangling: never more crossings', () => {
  [story(1000, 12), dag(300, 700, 13)].forEach((s) => { const g = graph(s), a = NL.layout(g, { dir: 'TB', tagLen: 8 }), b = NL.layout(g, { dir: 'TB', tagLen: 8, better: true }); ok(b.crossings <= a.crossings, a.crossings + ' to ' + b.crossings); });
});
t('columns: a tall map is cut into side-by-side columns; boxes do not overlap; step positions are returned', () => {
  const g = graph(story(1500, 14)), one = NL.layout(g, { dir: 'TB', tagLen: 8 }), wr = NL.layout(g, { dir: 'TB', tagLen: 8, wrap: true });
  ok(wr.info.columns > 1 && wr.height / wr.width < one.height / one.width / 5, 'not wrapped enough'); ok(wr.ruler.length === wr.info.rows, 'ruler length');
  const bx = wr.nodes.map((n) => [n.x, n.y, n.x + n.w, n.y + n.h]); let ov = 0; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < Math.min(bx.length, i + 40); j++) { const A = bx[i], B = bx[j]; if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) ov++; } ok(!ov, ov + ' overlaps');
  return 'tall:wide ' + (one.height / one.width).toFixed(1) + ' to ' + (wr.height / wr.width).toFixed(2) + ' in ' + wr.info.columns + ' columns';
});
t('group columns: nodes of one group stay inside their own band', () => {
  const R = NL.layout(graph(story(200, 15)), { dir: 'TB', lanes: true }); ok(R.lanes.length > 1, 'bands'); R.nodes.forEach((n) => ok(R.lanes.some((l) => n.x >= l.from - 1 && n.x + n.w <= l.to + 1), 'outside every band'));
});
t('left to right works the same way (rows go across)', () => {
  const R = NL.layout(graph(story(60, 16)), { dir: 'LR', tagLen: 8 }); ok(R.dir === 'LR' && R.width > R.height * 0.4, 'shape'); const lx = {}; R.nodes.forEach((n) => { lx[n.layer] = (lx[n.layer] === undefined ? n.x : lx[n.layer]); }); ok(Object.keys(lx).length > 3, 'rows across');
});
t('SVG: boxes, curves, tag chips; no bad numbers; text is escaped', () => {
  const g = graph(story(400, 3)); g.nodes[1].label = 'A <b> & "c"'; const R = NL.layout(g, { dir: 'TB', tagLen: 8 }), svg = NL.toSvg(R);
  ok(/^<svg /.test(svg) && /<\/svg>$/.test(svg) && !/NaN|undefined/.test(svg), 'svg shape'); ok(svg.indexOf('A &lt;b&gt; &amp; &quot;c&quot;') >= 0 && svg.indexOf('<b>') < 0, 'not escaped'); ok((svg.match(/from Page/g) || []).length === R.info.tags, 'chip per tag end');
  return Math.round(svg.length / 1024) + ' KB';
});
t('bundle: off is the old picture; on, links that start together share stops; links still connect; same input, same picture', () => {
  const g = graph(story(1000, 3)), a = NL.layout(g, { dir: 'TB', rows: 'story' }), z = NL.layout(g, { dir: 'TB', rows: 'story', bundle: false });
  ok(fp(a) === fp(z), 'bundle:false changed the picture'); const b = NL.layout(g, { dir: 'TB', rows: 'story', bundle: true }), c = NL.layout(g, { dir: 'TB', rows: 'story', bundle: true });
  ok(b.info.stops < a.info.stops, 'stops ' + a.info.stops + ' to ' + b.info.stops); ok(fp(b) === fp(c), 'not the same twice');
  b.edges.forEach((e) => { if (e.pts && e.pts.length) e.pts.forEach((q) => ok(isFinite(q[0]) && isFinite(q[1]), 'bad point')); });
  const d = graph(dag(1000, 1999, 6)), r1 = NL.layout(d, { dir: 'TB' }), r2 = NL.layout(d, { dir: 'TB', bundle: true });
  ok(r2.info.stops < r1.info.stops * 0.8, 'random map ' + r1.info.stops + ' to ' + r2.info.stops);
  return 'story order ' + a.info.stops + ' to ' + b.info.stops + ' stops, loop-free random map ' + r1.info.stops + ' to ' + r2.info.stops;
});
t('SVG taper: forward links are filled shapes that narrow; off keeps strokes; no bad numbers', () => {
  const R = NL.layout(graph(story(120, 2)), { dir: 'TB' }), plain = NL.toSvg(R), tap = NL.toSvg(R, { taper: true });
  ok(!/NaN|undefined/.test(tap), 'bad number'); ok((tap.match(/ fill="#6b7a90" opacity="0.85"/g) || []).length > 50, 'no shapes'); ok(plain.indexOf(' fill="#6b7a90" opacity') < 0, 'plain drawing changed'); ok(tap.length > plain.length, 'taper should add points');
  return Math.round(tap.length / 1024) + ' KB against ' + Math.round(plain.length / 1024) + ' KB';
});
console.log(bad ? bad + ' FAILED' : 'all netflow-layers checks passed'); process.exit(bad ? 1 : 0);
