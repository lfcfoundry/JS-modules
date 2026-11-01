/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-sankey checks: layering, every flow drawn at one scale, no overlaps, weighted order, plain input and SVG. Run: node modules/netflow-sankey/test/run.js */
'use strict';
const RL = require('../netflow-sankey.js');
let bad = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let q = Math.imul(s ^ (s >>> 15), 1 | s); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; };
// layers of items: each item sends 1 to 3 links to the next layer, plus a few links that run back
function synth(nl, per, seed, loops) {
  const r = rng(seed), links = [];
  for (let k = 0; k + 1 < nl; k++) for (let j = 0; j < per; j++) { const m = 1 + Math.floor(r() * 3); for (let q = 0; q < m; q++) links.push({ from: `S${k} i${j}`, to: `S${k + 1} i${Math.floor(r() * per)}`, value: 1 + Math.floor(r() * r() * 40) }); }
  for (let q = 0; q < loops; q++) { const a = 2 + Math.floor(r() * (nl - 2)); links.push({ from: `S${a} i${Math.floor(r() * per)}`, to: `S${Math.floor(r() * a)} i${Math.floor(r() * per)}`, value: 3 }); }
  return { links };
}
const net = () => synth(7, 10, 5, 3);

t('layering: a simple chain gets one layer per step, a cycle gets exactly one backward link', () => {
  const r = RL.layering(4, [{ from: 0, to: 1, flow: 5 }, { from: 1, to: 2, flow: 5 }, { from: 2, to: 3, flow: 5 }, { from: 2, to: 0, flow: 1 }], true);
  ok(Array.from(r.layer).join() === '0,1,2,3', 'layers ' + Array.from(r.layer).join()); ok(r.feedback.size === 1 && r.feedback.has(3), 'the light link back is the one turned around');
});
t('layering: extra sources sit next to their first consumer, not at the far end', () => {
  const r = RL.layering(4, [{ from: 0, to: 1, flow: 1 }, { from: 1, to: 2, flow: 1 }, { from: 3, to: 2, flow: 1 }], true);
  ok(r.layer[3] === 1 && r.layer[2] === 2 && r.feedback.size === 0, 'layers ' + Array.from(r.layer).join());
});
t('every link with flow is drawn (as a band or a loop), and band thickness is flow times one scale', () => {
  const input = net(), R = RL.layoutFlows(input), usable = input.links.filter((l) => l.from !== l.to && l.value > 0).length;
  const drawn = new Set(R.bands.map((b) => b.link).concat(R.loops.map((l) => l.link)));
  ok(drawn.size === usable, 'drawn ' + drawn.size + ' of ' + usable);
  let worst = 0; R.bands.forEach((b) => { const th = ((b.y0b - b.y0a) + (b.y1b - b.y1a)) / 2, want = b.value * R.ky; if (want > 0.8) worst = Math.max(worst, Math.abs(th - want) / want); });
  ok(worst < 1e-9, 'thickness off by ' + worst);
});
t('a band is as thick at both ends, and the ends stay inside their item bars', () => {
  const R = RL.layoutFlows(net()), byId = {}; R.nodes.forEach((n) => { byId[n.id] = n; });
  R.bands.forEach((b) => {
    ok(Math.abs((b.y0b - b.y0a) - (b.y1b - b.y1a)) < 1e-9, 'unequal ends');
    const a = byId[b.from], c = byId[b.to];
    if (Math.abs(b.x0 - (a.x + a.w)) < 1e-9) ok(b.y0a >= a.y - 1e-6 && b.y0b <= a.y + a.h + 1e-6, 'start outside its bar');
    if (Math.abs(b.x1 - c.x) < 1e-9) ok(b.y1a >= c.y - 1e-6 && b.y1b <= c.y + c.h + 1e-6, 'end outside its bar');
  });
});
t('no item bars overlap each other', () => {
  const R = RL.layoutFlows(net()); const by = {}; R.nodes.forEach((n) => { (by[n.layer] = by[n.layer] || []).push(n); });
  Object.values(by).forEach((list) => { list.sort((a, b) => a.y - b.y); for (let i = 1; i < list.length; i++) ok(list[i].y >= list[i - 1].y + list[i - 1].h - 1e-6, 'overlap'); });
});
// the yardstick: bands between the same two columns cross when their top ends and bottom ends are in opposite order; a crossing costs the product of the two flows
const yard = (R) => { let total = 0; const gaps = {}; R.bands.forEach((b) => { (gaps[b.x0] = gaps[b.x0] || []).push(b); });
  Object.values(gaps).forEach((list) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], c = list[j]; if (((a.y0a + a.y0b) / 2 - (c.y0a + c.y0b) / 2) * ((a.y1a + a.y1b) / 2 - (c.y1a + c.y1b) / 2) < 0) total += a.value * c.value; } });
  return total; };
t('weighted order has fewer weighted crossings than plain order on the same links', () => {
  const input = net(), pw = yard(RL.layoutFlows(input)), pp = yard(RL.layoutFlows(input, { unweighted: true }));
  ok(pw < pp, 'weighted order ' + pw + ' against plain order ' + pp);
});
t('same input, same picture', () => { ok(JSON.stringify(RL.layoutFlows(net()).bands) === JSON.stringify(RL.layoutFlows(net()).bands), 'differs'); });
t('a big network stays quick', () => { const input = synth(10, 25, 5, 5), t0 = Date.now(); RL.layoutFlows(input); ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms'); });

t('plain input: bad links are dropped and counted, items that only appear in links are added, labels are kept', () => {
  const L = RL.fromLinks({ nodes: [{ id: 'a', label: 'Alpha' }, 'b'], links: [{ from: 'a', to: 'b', value: 4 }, { from: 'a', to: 'a', value: 5 }, { from: 'b', to: 'c', value: 0 }, { from: 'b', to: 'c', value: 'x' }, null, { from: 'b', to: 'c', value: 2 }] });
  ok(L.ignored === 4 && L.edges.length === 2, 'ignored ' + L.ignored + ', kept ' + L.edges.length);
  ok(L.nodes.map((n) => n.id).join() === 'a,b,c' && L.nodes[0].label === 'Alpha', 'items ' + L.nodes.map((n) => n.id));
  ok(L.edges[1].link === 5, 'a kept link remembers which of your links it is');
  let msg = ''; try { RL.fromLinks({ links: [{ from: '__proto__', to: 'x', value: 1 }] }); } catch (e) { msg = e.message; }
  ok(/cannot be used/.test(msg), 'a name that could poison an object is refused');
});
t('layoutFlows tells each band which of your links it is and how much flows', () => {
  const input = { links: [{ from: 'A', to: 'B', value: 5 }, { from: 'A', to: 'C', value: 3 }, { from: 'B', to: 'D', value: 5 }, { from: 'C', to: 'D', value: 3 }, { from: 'D', to: 'A', value: 1 }] };
  const R = RL.layoutFlows(input);
  ok(R.bands.length === 4 && R.loops.length === 1, 'bands ' + R.bands.length + ', loops ' + R.loops.length);
  ok(R.loops[0].link === 4 && R.loops[0].value === 1 && R.loops[0].from === 'D' && R.loops[0].to === 'A', 'the link back is a loop');
  ok(R.bands.every((b) => input.links[b.link].value === b.value), 'values match');
  ok(R.width > 0 && R.height > 0 && R.nodes.length === 4 && R.ignored === 0, 'size and items');
});
t('toSvg: one rect per item, one path per band and loop, text escaped, colors kept', () => {
  const R = RL.layoutFlows({ nodes: [{ id: 'a', label: 'A <b> & "q"' }], links: [{ from: 'a', to: 'b', value: 2 }, { from: 'b', to: 'c', value: 2 }, { from: 'c', to: 'a', value: 1 }] });
  const svg = RL.toSvg(R, { colors: ['#112233', '#445566'], title: 'T & U' });
  ok(/^<svg /.test(svg) && /<\/svg>$/.test(svg), 'wrapped in svg');
  ok((svg.match(/<rect /g) || []).length === R.nodes.length, 'rects');
  ok((svg.match(/<path /g) || []).length === R.bands.length + R.loops.length, 'paths');
  ok(svg.indexOf('A &lt;b&gt; &amp; &quot;q&quot;') >= 0 && svg.indexOf('<b>') < 0, 'label escaped');
  ok(svg.indexOf('aria-label="T &amp; U"') >= 0 && svg.indexOf('#112233') >= 0 && svg.indexOf('#445566') >= 0, 'title and colors');
  ok(RL.toSvg(R, { labels: false }).indexOf('<text') < 0, 'labels can be turned off');
});
t('title block: title, subtitle and source drawn (escaped) and the picture moved down inside a group; no block without them', () => {
  const R = RL.layoutFlows({ links: [{ from: 'a', to: 'b', value: 2 }, { from: 'a', to: 'c', value: 1 }] }, { budgetMs: 1e9 });
  const plain = RL.toSvg(R), all = RL.toSvg(R, { title: 'Wages & tax', subtitle: 'Per <year>', source: 'Source: test' });
  ok(plain.indexOf('<g transform') < 0 && plain.indexOf('font-size="20"') < 0, 'no block unless asked');
  ok(all.indexOf('<title>Wages &amp; tax</title>') > 0 && all.indexOf('aria-label="Wages &amp; tax"') > 0, 'hidden label kept');
  ok(/font-weight="700"[^>]*>Wages &amp; tax<\/text>/.test(all) && all.indexOf('>Per &lt;year&gt;</text>') > 0 && all.indexOf('>Source: test</text>') > 0, 'visible title, subtitle and source');
  const H = +/height="([\d.]+)"/.exec(all)[1]; ok(Math.abs(H - (R.height + 67.4 + 24)) < 0.01, 'room for the block: ' + H);
  ok(RL.toSvg(R, { source: 'S' }).indexOf('<g transform') < 0, 'a source alone adds room below only');
});
t('an empty or one-link input does not throw', () => {
  const R0 = RL.layoutFlows({ links: [] }); ok(R0.nodes.length === 0 && R0.bands.length === 0, 'empty');
  const R1 = RL.layoutFlows({ links: [{ from: 'a', to: 'b', value: 1 }] }); ok(R1.bands.length === 1 && R1.nodes.length === 2, 'one link');
  RL.toSvg(R0); RL.toSvg(R1);
});
// ---- netflow-sankey 2.0.0 is faster but must draw exactly what version 1.0.0 (the old name) drew: these hashes were made by that version (layout without the timing and without the 2.2.0 fields simplified and note, then the SVG text) ----
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const fingerprint = (input, opts) => { const R = RL.layoutFlows(input, Object.assign({ budgetMs: 1e9 }, opts)); return fnv(JSON.stringify(R, (k, v) => k === 'ms' || k === 'simplified' || k === 'note' ? undefined : v)) + ' ' + fnv(RL.toSvg(R)) + ' ' + fnv(oldTitle(RL.toSvg(R, { colors: ['#123', '#456'], title: 'T <&>', labels: false, bandOpacity: 0.3 }), R)); };
/* since 2.5.0 the title is also drawn above the picture; taking that block off must give back exactly what 1.0.0 drew */
const oldTitle = (svg, R) => { const h = String(+R.height.toFixed(2)), m = /<text x="14" y="34" font-size="20" font-weight="700"[^>]*>[^<]*<\/text><g transform="translate\(0 48\.4\)">/; if (!m.test(svg) || !svg.endsWith('</g></svg>')) return 'no title block'; return svg.replace(m, '').replace(/<\/g><\/svg>$/, '</svg>').replace(/viewBox="0 0 ([\d.]+) [\d.]+" width="([\d.]+)" height="[\d.]+"/, (a, w, w2) => 'viewBox="0 0 ' + w + ' ' + h + '" width="' + w2 + '" height="' + h + '"'); };
const PIN = {
  'a 7x10 network with 3 loops': '89c38031 c261bece 7570244e',
  'the same with plain (unweighted) order': '71efb5d1 66a8d0c2 4d247fa9',
  'a 5x40 network with fractional flows, long links, 12 loops and odd names': '227d055c 5f46f8b2 18dca2a5',
  'a 10x25 network, fewer restarts, fixed height': '705e4fd0 6143f42e 3a0c63fb',
};
const fracNet = () => { const r = rng(9), links = []; for (let k = 0; k + 1 < 5; k++) for (let j = 0; j < 40; j++) { const to = k + 1 + (r() < 0.2 ? Math.min(1, 3 - k) : 0); links.push({ from: `Ünï ${k} <${j}>`, to: `Ünï ${to} <${Math.floor(r() * 40)}>`, value: Math.round((0.05 + r() * 9) * 1000) / 1000 }); }
  for (let q = 0; q < 12; q++) links.push({ from: `Ünï 4 <${q}>`, to: `Ünï ${q % 3} <${q + 1}>`, value: 2.5 }); return { links }; };
t('same pictures as version 1.0.0: layout numbers and SVG text, four networks', () => {
  const got = {
    'a 7x10 network with 3 loops': fingerprint(net()),
    'the same with plain (unweighted) order': fingerprint(net(), { unweighted: true }),
    'a 5x40 network with fractional flows, long links, 12 loops and odd names': fingerprint(fracNet()),
    'a 10x25 network, fewer restarts, fixed height': fingerprint(synth(10, 25, 5, 5), { restarts: 2, height: 500 }),
  };
  Object.keys(PIN).forEach((k) => ok(got[k] === PIN[k], k + ': ' + got[k] + ' (version 1.0.0 gave ' + PIN[k] + ')'));
});
t('hand edits keep the order (fixedOrder) and pinned bars (fixY) exactly as before', () => {
  const R0 = RL.layoutFlows(net(), { budgetMs: 1e9 }), R1 = RL.layoutFlows(net(), { budgetMs: 1e9, fixedOrder: R0.order });
  ok(JSON.stringify(R1.order.layers) === JSON.stringify(R0.order.layers), 'order kept');
  const R2 = RL.layoutFlows(net(), { budgetMs: 1e9, fixedOrder: R0.order, fixY: { 'S2 i3': 120, 'S4 i1': 40 } });
  ok(R2.nodes.find((n) => n.id === 'S2 i3').y === 120 && R2.nodes.find((n) => n.id === 'S4 i1').pinned, 'pinned bars sit where they were put');
  ok(fnv(RL.toSvg(R1)) + ' ' + fnv(RL.toSvg(R2)) === 'a387c988 4ef018d2', 'svg ' + fnv(RL.toSvg(R1)) + ' ' + fnv(RL.toSvg(R2)));
});
t('an item named like a stand-in bar ("d1") with a long link: its bands stack without overlapping', () => {
  // version 1.0.0 mixed up the band ends of such an item with its own stand-in bar and started a band in the wrong place
  const R = RL.layoutFlows({ links: [{ from: 'd1', to: 'a', value: 5 }, { from: 'a', to: 'b', value: 5 }, { from: 'd1', to: 'b', value: 7 }, { from: 'd1', to: 'c', value: 2 }, { from: 'c', to: 'b', value: 2 }] });
  const bar = R.nodes.find((n) => n.id === 'd1'), out = R.bands.filter((b) => b.from === 'd1' && b.x0 === bar.x + bar.w).sort((p, q) => p.y0a - q.y0a);
  ok(out.length === 3, 'three bands leave d1');
  for (let i = 1; i < out.length; i++) ok(out[i].y0a >= out[i - 1].y0b - 1e-6, 'bands leaving d1 overlap');
});
// 2.1.0: options() and apply(), the two calls Netflow Map's Sankey view makes after layout()
const drawing = () => {   // the shape the engine's Sankey view hands to layout(): items with a layer, links with a flow, and pos (id -> item)
  const nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, label: id.toUpperCase(), layer: [0, 1, 1, 2][i] })), pos = {}; nodes.forEach((n) => { pos[n.id] = n; });
  const edges = [['a', 'b', 6], ['a', 'c', 4], ['b', 'd', 5], ['c', 'd', 4]].map(([from, to, flow]) => ({ from, to, flow, kind: 'link' }));
  return { nodes, edges, pos };
};
t('options(): settings are cleaned up and kept inside their limits', () => {
  const d = RL.options({});
  ok(JSON.stringify(d) === JSON.stringify({ nodeW: 14, gapLayer: undefined, autoGap: true, pad: 12, height: undefined, fixY: {}, justifySinks: true, fixedOrder: undefined }), 'defaults ' + JSON.stringify(d));
  const o = RL.options({ nodeW: 500, gap: 20, pad: -5, height: 9999, justify: false });
  ok(o.nodeW === 80 && o.pad === 2 && o.height === 4000 && o.justifySinks === false && o.autoGap === true && o.gapLayer === undefined, 'limits ' + JSON.stringify(o));
  const g = RL.options({ gap: 250 }); ok(g.gapLayer === 250 && g.autoGap === false, 'gap ' + JSON.stringify(g));
  ok(RL.options(null).nodeW === 14 && RL.options(undefined).pad === 12, 'null and undefined are fine');
  const ord = { layers: [['a'], ['b', 'c'], ['d']], loops: [] }; ok(RL.options({ order: ord }).fixedOrder === ord, 'a saved order is passed on');
  ok(RL.options({ order: { layers: [] } }).fixedOrder === undefined, 'half an order is dropped');
});
t('apply(): the picture is written into the drawing and the rest is kept in L.sk', () => {
  const L = drawing(), R = RL.layout(L, RL.options({ nodeW: 20 })), out = RL.apply(L, R);
  ok(out === L, 'returns the drawing it was given');
  L.nodes.forEach((n) => { const s = R.nodes.find((x) => x.id === n.id); ok(n.x === s.x && n.y === s.y && n.w === 20 && n.h === s.h && n.layer === s.layer, n.id + ' placed'); ok(n.cx === s.x + s.w / 2 && n.cy === s.y + s.h / 2, n.id + ' center'); ok(n.skIn === s.inFlow && n.skOut === s.outFlow && n.skPinned === false, n.id + ' flows'); });
  ok(L.width === R.width && L.height === R.height && L.dir === 'LR', 'size and direction');
  ok(L.sk.bands === R.bands && L.sk.loops === R.loops && L.sk.ky === R.ky && L.sk.order === R.order && L.sk.cols === R.cols && L.sk.crossingWeight === R.crossingWeight, 'kept in L.sk');
});
t('apply(): an item that is a copy of the drawn one (pos entry) is placed too, and an item missing from the result is left alone', () => {
  const L = drawing(); L.pos.a = Object.assign({}, L.nodes[0]); L.nodes.push({ id: 'z', label: 'Z', layer: 0 }); L.pos.z = L.nodes[4];
  const R = RL.layout(L, RL.options({})); R.nodes = R.nodes.filter((n) => n.id !== 'z'); RL.apply(L, R);
  ok(L.pos.a !== L.nodes[0] && L.pos.a.x === L.nodes[0].x && L.pos.a.y === L.nodes[0].y && L.pos.a.cx === L.nodes[0].cx, 'the copy matches');
  ok(L.nodes[4].x === undefined && L.nodes[4].skIn === undefined, 'item z is not in the result and is not placed');
});
t('layout(options(sk)) then apply() twice with the same settings gives the same picture; a saved order keeps the order', () => {
  const key = (L) => JSON.stringify([L.width, L.height, L.nodes.map((n) => [n.x, n.y, n.h]), L.sk.bands.length]);
  const a = RL.apply(drawing(), RL.layout(drawing(), RL.options({ gap: 220 }))), b = RL.apply(drawing(), RL.layout(drawing(), RL.options({ gap: 220 })));
  ok(key(a) === key(b), 'same twice');
  const c = RL.apply(drawing(), RL.layout(drawing(), RL.options({ gap: 220, order: a.sk.order, fixY: { b: 40 } })));
  ok(JSON.stringify(c.sk.order.layers) === JSON.stringify(a.sk.order.layers), 'order kept'); ok(Math.abs(c.nodes[1].y - 40) < 1e-6 && c.nodes[1].skPinned === true, 'b pinned at 40: ' + c.nodes[1].y);
});
// ---- 2.2.0: past 20,000 stand-in points the lightest very long links are drawn straight through (Netflow Map's own copy always did) ----
t('a 400-item chain with a link from the first item to every other: capped (not 80,000 bands), says so, every link still drawn', () => {
  const n = 400, links = []; for (let i = 1; i < n; i++) links.push({ from: 'n' + (i - 1), to: 'n' + i, value: 1 }); for (let i = 2; i < n; i++) links.push({ from: 'n0', to: 'n' + i, value: 1 });
  const R = RL.layoutFlows({ links }); ok(R.bands.length < 30000, R.bands.length + ' bands'); ok(R.simplified === 199 && /very long links/.test(R.note), 'simplified ' + R.simplified + ': ' + R.note);
  ok(new Set(R.bands.map((b) => b.edge)).size === links.length, 'every link drawn: ' + new Set(R.bands.map((b) => b.edge)).size + ' of ' + links.length);
});
t('a 30-item map is not changed by the cap (simplified 0, no note)', () => {
  const links = []; for (let i = 1; i < 30; i++) links.push({ from: 'n' + (i - 1), to: 'n' + i, value: 1 }); for (let i = 2; i < 30; i += 3) links.push({ from: 'n0', to: 'n' + i, value: 1 });
  const R = RL.layoutFlows({ links }); ok(R.simplified === 0 && R.note === '', 'simplified ' + R.simplified);
});
t('a 1,100-item random network with links drawn straight through: the crossing count is a real number and the same twice in a row (it was NaN in Netflow Map before its fix)', () => {
  const r = rng(7), n = 1100, links = []; for (let i = 1; i < n; i++) links.push({ from: 'n' + Math.floor(r() * i), to: 'n' + i, value: 1 }); for (let k = 0; k < n * 2; k++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); if (a !== b) links.push({ from: 'n' + a, to: 'n' + b, value: 1 + Math.floor(r() * 9) }); }
  const A = RL.layoutFlows({ links }, { budgetMs: 1e9 }), B = RL.layoutFlows({ links }, { budgetMs: 1e9 });
  ok(A.simplified > 0, 'set-up: straight-through links ' + A.simplified); ok(Number.isFinite(A.crossingWeight), 'crossingWeight ' + A.crossingWeight);
  const key = (R) => JSON.stringify(R, (k, v) => k === 'ms' ? undefined : v); ok(key(A) === key(B), 'not the same twice');
});
// ---- 2.2.1: nothing to draw ----
t('an empty drawing has height 0 (not -Infinity) and applies cleanly; one item alone has a finite size', () => {
  const L = { nodes: [], edges: [], pos: {} }, R = RL.layout(L); ok(R.height === 0 && Number.isFinite(R.width), 'height ' + R.height + ' width ' + R.width);
  RL.apply(L, R); ok(L.height === 0, 'L.height ' + L.height);
  const one = { nodes: [{ id: 'a', label: 'A', layer: 0 }], edges: [], pos: {} }; one.pos.a = one.nodes[0]; const R1 = RL.layout(one); ok(Number.isFinite(R1.height) && Number.isFinite(R1.width), 'one item: ' + R1.height + ' x ' + R1.width);
});
const LINKS = [{ from: 'Wages', to: 'Rent', value: 30 }, { from: 'Wages', to: 'Food', weight: 14 }, { from: 'Side <work>', to: 'Food', count: 4 }];
t('one call: toSvg(links) lays out and draws; value, weight and count all name the amount; a layout result still works the old way', () => {
  const svg = RL.toSvg(LINKS), R = RL.layoutFlows({ links: [{ from: 'Wages', to: 'Rent', value: 30 }, { from: 'Wages', to: 'Food', value: 14 }, { from: 'Side <work>', to: 'Food', value: 4 }] });
  ok(svg === RL.toSvg(R), 'same picture both ways'); ok(svg.indexOf('Side &lt;work&gt;') > 0, 'names escaped');
  ok(RL.toSvg({ links: LINKS }) === svg, '{ links } works too');
});
t('the public list: layoutFlows, toSvg, fromLinks, layout, apply, options, layering, crossWeight, roundPath, toBezier, wasmAvailable, wasmReady, wasmModule', () => {
  ok(Object.keys(RL).sort().join() === 'apply,crossWeight,fromLinks,layering,layout,layoutFlows,options,roundPath,toBezier,toSvg,wasmAvailable,wasmModule,wasmReady', Object.keys(RL).sort().join());
});

// 2.3.0: the order search in WebAssembly. Same layout either way, to the last digit; plain JavaScript when WebAssembly is missing, refused, or a flow is not an ordinary number.
const noMs = (R) => JSON.stringify(R, (k, v) => (k === 'ms' ? 0 : v));
const dense = (nl, per, deg, seed, loops, longs) => {
  const r = rng(seed), links = [];
  for (let k = 0; k + 1 < nl; k++) for (let j = 0; j < per; j++) for (let q = 0; q < deg; q++) links.push({ from: `S${k} i${j}`, to: `S${k + 1} i${Math.floor(r() * per)}`, value: 1 + Math.floor(r() * r() * 40) });
  for (let q = 0; q < loops; q++) { const a = 2 + Math.floor(r() * (nl - 2)); links.push({ from: `S${a} i${Math.floor(r() * per)}`, to: `S${Math.floor(r() * a)} i${Math.floor(r() * per)}`, value: 3 }); }
  for (let q = 0; q < longs; q++) links.push({ from: `S0 i${Math.floor(r() * per)}`, to: `S${nl - 1} i${Math.floor(r() * per)}`, value: 2 });
  return { links };
};
t('compile early: wasmModule() is null at first, wasmReady() says true, the module is a WebAssembly.Module, and the first layout then starts it without compiling again; without WebAssembly.compile it says false and still lays out on wasm', () => {
  const cp = require('child_process'), script = "var M = WebAssembly.Module, made = 0, out = {}; if (process.env.NOCOMPILE) delete WebAssembly.compile;\n" +
    "var S = require(" + JSON.stringify(require('path').join(__dirname, '..', 'netflow-sankey.js')) + "); out.before = S.wasmModule();\n" +
    "S.wasmReady().then(function (ok) { out.ready = ok; out.isModule = S.wasmModule() instanceof M; WebAssembly.Module = function () { made++; return new M(arguments[0]); }; out.avail = S.wasmAvailable(); out.made = made; console.log(JSON.stringify(out)); });";
  const run = (env) => JSON.parse(cp.execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', env: Object.assign({}, process.env, env) }));
  const A = run({}), B = run({ NOCOMPILE: '1' });
  ok(A.before === null && A.ready === true && A.isModule === true && A.avail === true && A.made === 0, JSON.stringify(A));
  ok(B.before === null && B.ready === false && B.avail === true, JSON.stringify(B));
});
t('WebAssembly is available here and the order search uses it', () => { ok(RL.wasmAvailable() === true, 'wasmAvailable'); });
t('WebAssembly layouts equal the plain JavaScript ones (48 nets: weighted and unweighted, loops, long links, three seeds)', () => {
  let tried = 0; const bad2 = [];
  for (const c of [[3, 3, 2, 0, 0], [4, 6, 2, 1, 0], [6, 20, 4, 2, 1], [6, 40, 4, 0, 0], [8, 40, 5, 3, 4], [8, 80, 4, 1, 3], [10, 100, 3, 4, 4], [12, 150, 2, 2, 2]]) for (const seed of [1, 2, 3]) for (const unweighted of [false, true]) {
    const inp = dense(c[0], c[1], c[2], seed, c[3], c[4]), o = { budgetMs: 1e9, unweighted };
    tried++; if (noMs(RL.layoutFlows(inp, Object.assign({ wasm: false }, o))) !== noMs(RL.layoutFlows(inp, o))) bad2.push(c.join('x') + '/' + seed + '/' + unweighted);
  }
  ok(bad2.length === 0, bad2.length + ' of ' + tried + ' differ: ' + bad2.slice(0, 3).join('; '));
});
t('a saved order and the engine calls give the same picture with and without WebAssembly', () => {
  const mk = () => drawing(), a = RL.apply(mk(), RL.layout(mk(), RL.options({ gap: 220 }))), b = RL.apply(mk(), RL.layout(mk(), Object.assign(RL.options({ gap: 220 }), { wasm: false })));
  ok(noMs(a.sk.order) === noMs(b.sk.order) && a.sk.crossingWeight === b.sk.crossingWeight, 'order or crossing weight differ');
});
t('flows that are not ordinary numbers (NaN, Infinity, negative, huge) take the JavaScript path and give the same answer', () => {
  for (const v of [NaN, Infinity, -5, 1e150]) {
    const inp = dense(5, 8, 2, 4, 1, 1); inp.links[3].value = v;
    let a, b, ea = null, eb = null; try { a = noMs(RL.layoutFlows(inp, { wasm: false, budgetMs: 1e9 })); } catch (e) { ea = e.message; } try { b = noMs(RL.layoutFlows(inp, { budgetMs: 1e9 })); } catch (e) { eb = e.message; }
    ok(a === b && ea === eb, 'value ' + v + ' differs');
  }
});
t('without WebAssembly, with a refused module, and with an instance that fails: same layout', () => {
  const path2 = require.resolve('../netflow-sankey.js'), saved = globalThis.WebAssembly, inp = dense(6, 20, 4, 2, 2, 1), want = noMs(RL.layoutFlows(inp, { wasm: false, budgetMs: 1e9 }));
  const fresh = () => { delete require.cache[path2]; const m = require(path2); delete require.cache[path2]; return m; };
  try {
    globalThis.WebAssembly = undefined; const a = fresh(); ok(a.wasmAvailable() === false && noMs(a.layoutFlows(inp, { budgetMs: 1e9 })) === want, 'without WebAssembly');
    globalThis.WebAssembly = { Module: function () { throw new Error('refused by the page policy'); }, Instance: saved.Instance, Memory: saved.Memory }; const b = fresh(); ok(b.wasmAvailable() === false && noMs(b.layoutFlows(inp, { budgetMs: 1e9 })) === want, 'a refused module');
    globalThis.WebAssembly = { Module: saved.Module, Instance: function () { throw new Error('no instance'); }, Memory: saved.Memory }; const c = fresh(); ok(noMs(c.layoutFlows(inp, { budgetMs: 1e9 })) === want, 'an instance that fails');
  } finally { globalThis.WebAssembly = saved; }
});
t('two layouts in a row and a bigger one after a smaller one reuse the one WebAssembly memory correctly', () => {
  const small = dense(4, 6, 2, 1, 0, 0), big = dense(8, 80, 4, 1, 1, 3);
  const w1 = noMs(RL.layoutFlows(small, { budgetMs: 1e9 })), w2 = noMs(RL.layoutFlows(big, { budgetMs: 1e9 })), w3 = noMs(RL.layoutFlows(small, { budgetMs: 1e9 })), w4 = noMs(RL.layoutFlows(big, { budgetMs: 1e9 }));
  ok(w1 === w3 && w2 === w4 && w1 === noMs(RL.layoutFlows(small, { wasm: false, budgetMs: 1e9 })) && w2 === noMs(RL.layoutFlows(big, { wasm: false, budgetMs: 1e9 })), 'results changed with the memory in use');
});
t('the embedded WebAssembly is what wasm/order.c builds (embed.py --check and build.sh --check)', () => {
  const cp = require('child_process'), dir = require('path').join(__dirname, '..', 'wasm');
  cp.execFileSync('python3', [require('path').join(dir, 'embed.py'), '--check'], { stdio: 'pipe' });
  let hasClang = true; try { cp.execFileSync('clang', ['--version'], { stdio: 'pipe' }); } catch (e) { hasClang = false; }
  if (hasClang) cp.execFileSync('sh', [require('path').join(dir, 'build.sh'), '--check'], { stdio: 'pipe' });
});

t('stopCap: off by default; maps under stopCapFrom items keep every stand-in; above it, fewer stand-ins and every number finite', () => {
  const big = (n, seed) => { let s = seed; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; const nodes = [], links = []; const per = Math.ceil(n / 12);
    for (let i = 0; i < n; i++) nodes.push('n' + i); for (let i = per; i < n; i++) { const a = Math.floor(r() * Math.max(1, i - per)); links.push({ from: 'n' + a, to: 'n' + i, value: 1 + Math.floor(r() * 5) }); } return { nodes, links }; };
  const strip = (o) => { delete o.ms; return JSON.stringify(o); };
  const small = big(300, 3), A = strip(RL.layoutFlows(small, {})), B = strip(RL.layoutFlows(small, { stopCap: 0 }));
  ok(A === B, 'a 300-item map changed with stopCap');
  const g = big(1200, 5), d = RL.layoutFlows(g, {}), c = RL.layoutFlows(g, { stopCap: 50 });
  ok(c.simplified > d.simplified, 'stopCap did not draw more links straight: ' + d.simplified + ' vs ' + c.simplified);
  ok(c.nodes.every((n) => isFinite(n.x) && isFinite(n.y) && isFinite(n.h)), 'not finite');
  ok(strip(RL.layoutFlows(g, { stopCap: 50, stopCapFrom: 5000 })) === strip(RL.layoutFlows(g, {})), 'stopCapFrom did not hold it off');
});
console.log(bad ? 'netflow-sankey: ' + bad + ' FAILED' : 'netflow-sankey: all passed'); process.exit(bad ? 1 : 0);
