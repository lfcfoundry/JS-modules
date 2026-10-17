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
t('an empty or one-link input does not throw', () => {
  const R0 = RL.layoutFlows({ links: [] }); ok(R0.nodes.length === 0 && R0.bands.length === 0, 'empty');
  const R1 = RL.layoutFlows({ links: [{ from: 'a', to: 'b', value: 1 }] }); ok(R1.bands.length === 1 && R1.nodes.length === 2, 'one link');
  RL.toSvg(R0); RL.toSvg(R1);
});
// ---- netflow-sankey 2.0.0 is faster but must draw exactly what river-layout 1.0.0 (the old name) drew: these hashes were made by that version (layout without the timing, then the SVG text) ----
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const fingerprint = (input, opts) => { const R = RL.layoutFlows(input, Object.assign({ budgetMs: 1e9 }, opts)); return fnv(JSON.stringify(R, (k, v) => k === 'ms' ? undefined : v)) + ' ' + fnv(RL.toSvg(R)) + ' ' + fnv(RL.toSvg(R, { colors: ['#123', '#456'], title: 'T <&>', labels: false, bandOpacity: 0.3 })); };
const PIN = {
  'a 7x10 network with 3 loops': '89c38031 c261bece 7570244e',
  'the same with plain (unweighted) order': '71efb5d1 66a8d0c2 4d247fa9',
  'a 5x40 network with fractional flows, long links, 12 loops and odd names': '227d055c 5f46f8b2 18dca2a5',
  'a 10x25 network, fewer restarts, fixed height': '705e4fd0 6143f42e 3a0c63fb',
};
const fracNet = () => { const r = rng(9), links = []; for (let k = 0; k + 1 < 5; k++) for (let j = 0; j < 40; j++) { const to = k + 1 + (r() < 0.2 ? Math.min(1, 3 - k) : 0); links.push({ from: `Ünï ${k} <${j}>`, to: `Ünï ${to} <${Math.floor(r() * 40)}>`, value: Math.round((0.05 + r() * 9) * 1000) / 1000 }); }
  for (let q = 0; q < 12; q++) links.push({ from: `Ünï 4 <${q}>`, to: `Ünï ${q % 3} <${q + 1}>`, value: 2.5 }); return { links }; };
t('same pictures as river-layout 1.0.0: layout numbers and SVG text, four networks', () => {
  const got = {
    'a 7x10 network with 3 loops': fingerprint(net()),
    'the same with plain (unweighted) order': fingerprint(net(), { unweighted: true }),
    'a 5x40 network with fractional flows, long links, 12 loops and odd names': fingerprint(fracNet()),
    'a 10x25 network, fewer restarts, fixed height': fingerprint(synth(10, 25, 5, 5), { restarts: 2, height: 500 }),
  };
  Object.keys(PIN).forEach((k) => ok(got[k] === PIN[k], k + ': ' + got[k] + ' (river-layout 1.0.0 gave ' + PIN[k] + ')'));
});
t('hand edits keep the order (fixedOrder) and pinned bars (fixY) exactly as before', () => {
  const R0 = RL.layoutFlows(net(), { budgetMs: 1e9 }), R1 = RL.layoutFlows(net(), { budgetMs: 1e9, fixedOrder: R0.order });
  ok(JSON.stringify(R1.order.layers) === JSON.stringify(R0.order.layers), 'order kept');
  const R2 = RL.layoutFlows(net(), { budgetMs: 1e9, fixedOrder: R0.order, fixY: { 'S2 i3': 120, 'S4 i1': 40 } });
  ok(R2.nodes.find((n) => n.id === 'S2 i3').y === 120 && R2.nodes.find((n) => n.id === 'S4 i1').pinned, 'pinned bars sit where they were put');
  ok(fnv(RL.toSvg(R1)) + ' ' + fnv(RL.toSvg(R2)) === 'a387c988 4ef018d2', 'svg ' + fnv(RL.toSvg(R1)) + ' ' + fnv(RL.toSvg(R2)));
});
t('an item named like a stand-in bar ("d1") with a long link: its bands stack without overlapping', () => {
  // river-layout 1.0.0 mixed up the band ends of such an item with its own stand-in bar and started a band in the wrong place
  const R = RL.layoutFlows({ links: [{ from: 'd1', to: 'a', value: 5 }, { from: 'a', to: 'b', value: 5 }, { from: 'd1', to: 'b', value: 7 }, { from: 'd1', to: 'c', value: 2 }, { from: 'c', to: 'b', value: 2 }] });
  const bar = R.nodes.find((n) => n.id === 'd1'), out = R.bands.filter((b) => b.from === 'd1' && b.x0 === bar.x + bar.w).sort((p, q) => p.y0a - q.y0a);
  ok(out.length === 3, 'three bands leave d1');
  for (let i = 1; i < out.length; i++) ok(out[i].y0a >= out[i - 1].y0b - 1e-6, 'bands leaving d1 overlap');
});
console.log(bad ? 'netflow-sankey: ' + bad + ' FAILED' : 'netflow-sankey: all passed'); process.exit(bad ? 1 : 0);
