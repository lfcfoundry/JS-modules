/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-layers checks: the old drawing is untouched with every option off (pinned fingerprints made by Netflow Map's own layered engine),
 * story order, tags, the must-pass column, harder untangling, columns, step numbers, lanes, the SVG, and that the input is never changed. Run: node modules/netflow-layers/test/run.js */
'use strict';
const NL0 = require('../netflow-layers.js'), crypto = require('crypto');
/* Since 1.7.0 a left-out deep / rows means the lighter search and both row choices. The checks below pin the pictures from before that,
   so they fill in deep: false and rows: 'route' (the old default) unless a check sets them; NL0 is the module as callers get it. */
const OLD = (o) => { const c = Object.assign({}, o || {}); if (c.deep === undefined) c.deep = false; if (c.rows === undefined) c.rows = 'route'; return c; };
const NL = Object.assign(Object.create(NL0), { layout: (g, o) => NL0.layout(g, OLD(o)), layered: (G, o) => NL0.layered(G, OLD(o)) });
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
t('maxVertices zero is an explicit cap', () => {
  const g = { root: 'a', nodes: [{ id: 'a', w: 10, h: 10 }], edges: [] }; let e = null;
  try { NL.layout(g, { maxVertices: 0 }); } catch (x) { e = x; }
  ok(!!e && e.tooBig, 'a nonempty graph must exceed a zero vertex cap');
});
t('maxVertices rejects NaN, negative, fractional and non-number caps; Infinity means no cap', () => {
  const g = { root: 'a', nodes: [{ id: 'a', w: 10, h: 10 }], edges: [] };
  for (const maxVertices of [NaN, -1, 1.5, '5']) { let e = null; try { NL.layout(g, { maxVertices }); } catch (x) { e = x; } ok(e instanceof RangeError, 'invalid maxVertices ' + maxVertices + ' must be rejected'); }
  ok(NL.layout(g, { maxVertices: Infinity }).nodes.length === 1, 'Infinity must mean no cap');
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
t('advanced pieces: layered, mapPlaceLine and mapCrossPairs are exported and layout() is layered() plus the wrap rule', () => {
  ok(typeof NL.layered === 'function' && typeof NL.mapPlaceLine === 'function' && typeof NL.mapCrossPairs === 'function', 'missing export');
  const g = graph(story(200, 4)), G = { nodes: g.nodes.map((n) => Object.assign({}, n)), edges: g.edges.map((e) => Object.assign({ count: 1 }, e)) };
  const a = NL.layered(G, { dir: 'TB', root: g.root, tagLen: 8 }), b = NL.layout(g, { dir: 'TB', tagLen: 8 });
  ok(fp(a) === fp(b), 'layered() and layout() differ');
  ok(NL.mapCrossPairs([[0, 1], [1, 0]]) === 1, 'one crossing expected');
});
// 1.3.0: spread 'wide' (more room for wide screens, more like a tree). 'tight' or nothing is the old picture.
const overlaps = (R) => { let c = 0; const ns = R.nodes; for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const p = ns[i], q = ns[j]; if (p.x < q.x + q.w - 1e-6 && q.x < p.x + p.w - 1e-6 && p.y < q.y + q.h - 1e-6 && q.y < p.y + p.h - 1e-6) c++; } return c; };
t("spread 'tight' (and no spread) is the old picture: the same fingerprints as before, both ways, all four maps", () => {
  Object.keys(PIN).forEach((k) => { const [m, d] = k.split('|'); const got = fp(NL.layout(graph(MAPS[m]), { dir: d, spread: 'tight' })); ok(got === PIN[k], k + ' with spread tight changed: ' + got); const odd = fp(NL.layout(graph(MAPS[m]), { dir: d, spread: 'anything else' })); ok(odd === PIN[k], k + ' with an unknown spread changed'); });
});
t("spread 'wide': no two boxes touch and every number is finite, with every other option on or off, both ways, three sizes", () => {
  const variants = [{}, { spine: true }, { rows: 'story' }, { tagLen: 3 }, { bundle: true }, { better: true }, { wrapRows: 6, dir: 'TB' }, { gapNode: 10, gapLayer: 50 }]; let n = 0;
  [['story', story(12, 1)], ['story', story(40, 2)], ['dag', dag(150, 300, 3)]].forEach(([, m]) => ['LR', 'TB'].forEach((dir) => variants.forEach((v) => {
    const R = NL.layout(graph(m), Object.assign({ dir, spread: 'wide' }, v)); n++;
    ok(R.nodes.every((b) => [b.x, b.y, b.w, b.h].every(Number.isFinite)), 'a number is not finite'); ok(overlaps(R) === 0, overlaps(R) + ' boxes overlap (' + dir + ' ' + JSON.stringify(v) + ')');
  })));
  return n + ' pictures';
});
t("spread 'wide' gives more room: sideways gaps grow top to bottom (width), rows grow left to right (width) and the same map draws the same way twice", () => {
  const m = MAPS['story 120'], a = NL.layout(graph(m), { dir: 'TB' }), b = NL.layout(graph(m), { dir: 'TB', spread: 'wide' }), b2 = NL.layout(graph(m), { dir: 'TB', spread: 'wide' });
  ok(b.width > a.width * 1.15 && Math.abs(b.height - a.height) < 1e-6, 'top to bottom: width ' + a.width + ' -> ' + b.width + ', height ' + a.height + ' -> ' + b.height);
  const c = NL.layout(graph(m), { dir: 'LR' }), d = NL.layout(graph(m), { dir: 'LR', spread: 'wide' });
  ok(d.width > c.width * 1.15 && d.height > c.height, 'left to right: ' + c.width + 'x' + c.height + ' -> ' + d.width + 'x' + d.height); ok(fp(b) === fp(b2), 'two runs differ');
  return 'top to bottom ' + Math.round(a.width) + ' -> ' + Math.round(b.width) + ' wide; left to right ' + Math.round(c.width) + ' -> ' + Math.round(d.width);
});
t("spread 'wide': a box that leads to several boxes sits over the middle of them", () => {
  const ids = ['r', 'a', 'b', 'c', 'a1', 'a2', 'a3', 'a4'], E = [['r', 'a'], ['r', 'b'], ['r', 'c'], ['a', 'a1'], ['a', 'a2'], ['a', 'a3'], ['a', 'a4']];
  const g = { root: 'r', nodes: ids.map((id) => ({ id, w: 100, h: 40 })), edges: E.map(([from, to]) => ({ from, to })) }, at = (R, id) => { const n = R.nodes.find((x) => x.id === id); return n.x + n.w / 2; };
  const R = NL.layout(g, { dir: 'TB', spread: 'wide' }); ok(Math.abs(at(R, 'r') - (at(R, 'a') + at(R, 'c')) / 2) < 1, 'root at ' + at(R, 'r') + ', middle of its children ' + (at(R, 'a') + at(R, 'c')) / 2);
  ok(Math.abs(at(R, 'a') - (at(R, 'a1') + at(R, 'a4')) / 2) < 1, 'a at ' + at(R, 'a') + ', middle of its children ' + (at(R, 'a1') + at(R, 'a4')) / 2);
});
t('1.3.1 flat-list rewrite: every option gives the fingerprints 1.3.0 gave (16 pins: tags and bundles, better and wide, columns and the must-pass column, lanes)', () => {
  const PIN2 = {"story 30|story-tags-bundle":"cee8f1a492bd1d79","story 30|better-wide":"b638c5bb6890ca33","story 30|wrap-spine":"146eb44be6992c8b","story 30|lanes":"41905b2523fb81c0","story 120|story-tags-bundle":"b6d0419e385c1488","story 120|better-wide":"f49c87153efb195c","story 120|wrap-spine":"8d0d272e67e7c9a3","story 120|lanes":"e7006a54d51e7a00","dag 60/120|story-tags-bundle":"8aad701333730367","dag 60/120|better-wide":"46958ab6d9b6abf4","dag 60/120|wrap-spine":"d1b78293fd424abf","dag 60/120|lanes":"886834f89a4e7616","story 400|story-tags-bundle":"76c211ab94754099","story 400|better-wide":"0f0cae5e4b084519","story 400|wrap-spine":"86d52201cdafa355","story 400|lanes":"12fda9f43de5fb4b"};
  const OPTS = { 'story-tags-bundle': { dir: 'TB', rows: 'story', tagLen: 6, bundle: true }, 'better-wide': { dir: 'LR', better: true, spread: 'wide' }, 'wrap-spine': { dir: 'TB', rows: 'story', wrap: true, spine: true, tagLen: 20 }, 'lanes': { dir: 'LR', lanes: true, bundle: true } };
  Object.keys(PIN2).forEach((k) => { const [m, o] = k.split('|'); const got = fp(NL.layout(graph(MAPS[m]), OPTS[o])); ok(got === PIN2[k], k + ' changed: ' + got + ' vs ' + PIN2[k]); });
});
/* WebAssembly twin (1.5.0): the row-order search and the row placement run in wasm/order.wasm; the answer must equal the plain JavaScript one to the last digit (Object.is on every number) */
const same = (a, b, path) => { if (typeof a === 'number') { if (!Object.is(a, b)) throw new Error('differs at ' + path + ': ' + a + ' vs ' + b); return; } if (a && typeof a === 'object') { const ka = Object.keys(a); ok(ka.length === Object.keys(b).length, 'keys at ' + path); ka.forEach((k) => same(a[k], b[k], path + '.' + k)); return; } ok(a === b, 'differs at ' + path); };
const OPT_SET = [{ dir: 'TB' }, { dir: 'LR' }, { dir: 'TB', rows: 'story', tagLen: 8, bundle: true }, { dir: 'LR', better: true, spread: 'wide' }, { dir: 'TB', rows: 'story', wrap: true, spine: true }, { dir: 'TB', lanes: true, better: true }, { dir: 'LR', rows: 'story', tagLen: 6, spine: true, lanes: true, spread: 'wide', better: true }];
t('wasm on and off: the same layers and places, to the last digit, on 8 maps x 7 option sets (wasm really ran)', () => {
  ok(NL.wasm && NL.wasm.on === true && NL.wasm.b64.length > 1000, 'no wasm inside'); const min0 = NL.wasm.min; NL.wasm.min = 0; let n = 0;
  try {
    const maps = [story(30, 1), story(120, 2), dag(60, 120, 3), story(400, 4), story(1500, 5), dag(300, 700, 6), story(3, 7), dag(2, 1, 8)];
    maps.forEach((m, mi) => OPT_SET.forEach((o, oi) => {
      const g = graph(m), c0 = NL.wasm.calls; NL.wasm.on = true; const A = NL.layout(g, o), used = NL.wasm.calls - c0; NL.wasm.on = false; const B = NL.layout(g, o);
      ok(used >= 2, 'wasm did not run on map ' + mi + ' set ' + oi + ' (' + NL.wasm.error + ')'); same(A, B, 'map' + mi + '/set' + oi); n++;
    }));
  } finally { NL.wasm.on = true; NL.wasm.min = min0; }
  return n + ' pictures';
});
t('wasm: the default skips maps under 100 stops, and a refused or missing WebAssembly falls back to the same JavaScript picture', () => {
  const g = graph(story(400, 4)), o = { dir: 'TB', rows: 'story', tagLen: 8, bundle: true }, ref = JSON.stringify(NL.layout(g, o));
  let c0 = NL.wasm.calls; NL.layout(graph(story(8, 2)), { dir: 'TB' }); ok(NL.wasm.calls === c0, 'a tiny map used wasm');
  const vm = require('vm'), src = require('fs').readFileSync(require.resolve('../netflow-layers.js'), 'utf8');
  const load = (codeGen) => { const ctx = vm.createContext({ module: { exports: {} }, console, Buffer }, { codeGeneration: { strings: codeGen, wasm: codeGen } }); vm.runInContext(src, ctx); return ctx.module.exports; };
  const denied = load(false), allowed = load(true);
  const a = JSON.stringify(denied.layout(g, o)); ok(a === ref, 'code generation refused: a different picture'); ok(denied.wasm.calls === 0 && /wasm|WebAssembly|code generation/i.test(denied.wasm.error), 'refusal not seen: ' + denied.wasm.error + ' calls ' + denied.wasm.calls);
  const b = JSON.stringify(allowed.layout(g, o)); ok(b === ref, 'vm copy with wasm: a different picture'); ok(allowed.wasm.calls >= 2, 'vm copy did not use wasm');
  return 'refused: ' + denied.wasm.error.slice(0, 60);
});
t('1.6.0 deep and rows best: off is the old picture; deep never has more crossings; best keeps the fewer of the two row choices; wasm on and off agree to the last digit', () => {
  const min0 = NL.wasm.min; NL.wasm.min = 0; let n = 0, gain = [];
  try {
    const maps = [story(30, 1), story(120, 2), dag(60, 120, 3), story(400, 4), dag(300, 700, 6), dag(600, 1140, 9), story(3, 7), dag(2, 1, 8)];
    maps.forEach((m, mi) => [{ dir: 'LR' }, { dir: 'TB', tagLen: 8, bundle: true }, { dir: 'LR', better: true, spine: true, lanes: true }].forEach((o0, oi) => {
      const g = graph(m), plain = NL.layout(g, o0), d = Object.assign({ deep: true }, o0), bst = Object.assign({ deep: true, rows: 'best' }, o0);
      NL.wasm.on = true; const A = NL.layout(g, d), Ab = NL.layout(g, bst); NL.wasm.on = false; const B = NL.layout(g, d), Bb = NL.layout(g, bst); NL.wasm.on = true;
      same(A, B, 'deep map' + mi + '/set' + oi); same(Ab, Bb, 'best map' + mi + '/set' + oi);
      ok(A.crossings <= plain.crossings, 'deep worse on map ' + mi + ': ' + plain.crossings + ' to ' + A.crossings);
      const st = NL.layout(g, Object.assign({ deep: true, rows: 'story' }, o0));
      ok(Ab.crossings === Math.min(A.crossings, st.crossings), 'best is not the fewer on map ' + mi);
      if (oi === 0 && plain.crossings > 100) gain.push(plain.crossings + ' to ' + Ab.crossings); n++;
    }));
    ok(JSON.stringify(graph(maps[3])) === JSON.stringify(graph(maps[3])), 'input');
  } finally { NL.wasm.on = true; NL.wasm.min = min0; }
  return n + ' maps; crossings ' + gain.join(', ');
});
t('1.6.0 deep: maps over 20,000 stops keep the old search (the same picture as without deep)', () => {
  const g = graph(dag(400, 760, 11)), m0 = NL._deep.maxStops; NL._deep.maxStops = 10;
  try { same(NL.layout(g, { deep: true }), NL.layout(g, {}), 'over the cap'); } finally { NL._deep.maxStops = m0; }
});
t('wasm: the embedded bytes are the ones wasm/order.wasm holds (rebuild with sh wasm/build.sh, then python3 wasm/embed.py)', () => {
  const fs = require('fs'), src = fs.readFileSync(require.resolve('../netflow-layers.js'), 'utf8'), b64 = /WASM:order:BEGIN\*\/'([^']*)'/.exec(src)[1];
  ok(Buffer.from(b64, 'base64').equals(fs.readFileSync(require('path').join(__dirname, '..', 'wasm', 'order.wasm'))), 'embedded bytes differ from wasm/order.wasm'); return Buffer.from(b64, 'base64').length + ' bytes';
});
t('1.7.0 default (lighter search, both row choices): never more crossings than the old default; wasm on and off agree; deep: false + rows: route and orderRounds: 0 keep the old picture', () => {
  let n = 0, fewer = 0;
  const maps = []; for (let i = 0; i < 10; i++) maps.push(graph(story(20 + i * 25, 30 + i))); for (let i = 0; i < 8; i++) maps.push(graph(dag(15 + i * 30, 2 * (15 + i * 30), 60 + i)));
  maps.forEach((g, i) => ['LR', 'TB'].forEach((d) => {
    const old = NL0.layout(g, { dir: d, deep: false, rows: 'route' }), now = NL0.layout(g, { dir: d });
    ok(now.crossings <= old.crossings, 'map ' + i + ' ' + d + ': ' + old.crossings + ' to ' + now.crossings); if (now.crossings < old.crossings) fewer++;
    NL0.wasm.on = false; const js = NL0.layout(g, { dir: d }); NL0.wasm.on = true; ok(fp(js) === fp(now), 'map ' + i + ' ' + d + ': wasm and JS differ');
    ok(fp(NL0.layout(g, { dir: d, orderRounds: 0 })) === fp(NL.layout(g, { dir: d, orderRounds: 0 })), 'map ' + i + ' ' + d + ': orderRounds 0 changed');
    n++;
  }));
  return n + ' maps, ' + fewer + ' with fewer crossings';
});
const LINKS = [{ from: 'Wages', to: 'Rent', value: 30 }, { from: 'Wages', to: 'Food', weight: 14 }, { from: 'Side <work>', to: 'Food', count: 4 }];
t('one call: toSvg(links) makes the items, sizes them, lays out and draws; a layout result still works', () => {
  const svg = NL.toSvg(LINKS); ok(svg.indexOf('<svg') === 0 && svg.indexOf('Side &lt;work&gt;') > 0 && svg.indexOf('>Rent<') > 0, 'drawn with names');
  const R = NL.layout({ root: 'a', nodes: [{ id: 'a', w: 80, h: 30 }, { id: 'b', w: 80, h: 30 }], edges: [{ from: 'a', to: 'b' }] }); ok(NL.toSvg(R).indexOf('>b<') > 0, 'old form');
});
console.log(bad ? bad + ' FAILED' : 'all netflow-layers checks passed'); process.exit(bad ? 1 : 0);
