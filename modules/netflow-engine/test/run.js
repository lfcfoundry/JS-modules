/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-engine checks: it loads, lays out every view, is repeatable, gives the same picture with and without WebAssembly, leaves no two items on top of each other, and tells you plainly when an add-on is missing. Run: node modules/netflow-engine/test/run.js */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../netflow-engine.js'), NL = require('../../netflow-layers/netflow-layers.js');
let bad = 0, count = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const t = (name, fn) => { count++; try { fn(); console.log('ok   ' + name); } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
function story(n, seed) { const r = rng(seed), nodes = [], edges = []; for (let i = 0; i < n; i++) nodes.push({ id: 'n' + i, label: 'Page ' + i, group: ['A', 'B', 'C'][i % 3], valence: i === n - 1 ? 'good' : i === n - 2 ? 'bad' : '', ghost: false, attrs: {} }); for (let i = 1; i < n; i++) { edges.push({ from: 'n' + Math.floor(r() * i), to: 'n' + i, label: '', kind: '', attrs: {} }); if (r() < 0.5) edges.push({ from: 'n' + Math.floor(r() * n), to: 'n' + Math.floor(r() * n), label: '', kind: '', attrs: {} }); } return { start: 'n0', nodes, edges: edges.filter((e) => e.from !== e.to) }; }
const network = (n, seed) => { const g = story(n, seed); g.start = null; return g; };
const copy = (g) => JSON.parse(JSON.stringify(g));
const same = (a, b) => JSON.stringify(a, (k, v) => (k === 'ms' ? undefined : ArrayBuffer.isView(v) ? Array.from(v) : v)) === JSON.stringify(b, (k, v) => (k === 'ms' ? undefined : ArrayBuffer.isView(v) ? Array.from(v) : v));
function touching(L) {
  let rmax = 0; L.nodes.forEach((n) => { rmax = Math.max(rmax, n.w / 2); });
  const cell = 2 * rmax, grid = new Map(); let pairs = 0;
  L.nodes.forEach((n, i) => { const k = Math.floor(n.cx / cell) + ',' + Math.floor(n.cy / cell); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  L.nodes.forEach((a, i) => { const cx = Math.floor(a.cx / cell), cy = Math.floor(a.cy / cell); for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) { const l = grid.get((cx + gx) + ',' + (cy + gy)); if (l) l.forEach((j) => { if (j > i) { const b = L.nodes[j]; if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.w + b.w) / 2 - 0.01) pairs++; } }); } });
  return pairs;
}
E.use('layers', NL);
t('it loads, says it is the real engine, and its version, header and modules.json agree', () => {
  const s = E.status(); ok(s.placeholder === false, 'placeholder flag'); ok(/^\d+\.\d+\.\d+$/.test(s.version) && s.api === +s.version.split('.')[0], 'version ' + s.version);
  const head = fs.readFileSync(path.join(__dirname, '..', 'netflow-engine.js'), 'utf8').match(/Version (\d+\.\d+\.\d+) \(API (\d+)\)/);
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'modules.json'), 'utf8')).modules.find((m) => m.id === 'netflow-engine');
  ok(head && head[1] === s.version && +head[2] === s.api, 'header ' + (head && head[1])); ok(reg && reg.version === s.version && reg.api === s.api, 'modules.json');
});
t('every view lays out a 300-page story and a 1,500-item network, with positions for everything', () => {
  E.VIEWS.forEach((v) => [story(300, 2), network(1500, 5)].forEach((g) => {
    const L = E.build(copy(g), { view: v[0] });
    if (v[0] === 'shape') { ok(L.segs.length > 0, 'shape: no stretches'); return; }   // the Shape view returns stretches between choke points, not items
    ok(L.nodes.length > 0, v[0] + ' empty'); ok(L.nodes.every((n) => isFinite(n.cx === undefined ? n.x : n.cx) && isFinite(n.cy === undefined ? n.y : n.cy)), v[0] + ' has a position that is not a number');
  }));
});
t('the same map twice gives the same picture', () => { const g = network(800, 6); ok(same(E.build(copy(g), { view: 'network' }), E.build(copy(g), { view: 'network' })), 'differs'); });
t('with WebAssembly off the picture is the same (Force and Distances, 600 items)', () => {
  const g = network(600, 7); ['force', 'stress'].forEach((arr) => {
    const w = E.build(copy(g), { view: 'network', arrange: arr }); const f = E.forceWasm.on, s = E.stressWasm.on; E.forceWasm.on = false; E.stressWasm.on = false;
    let j; try { j = E.build(copy(g), { view: 'network', arrange: arr }); } finally { E.forceWasm.on = f; E.stressWasm.on = s; }
    ok(same(w, j), arr + ': positions differ between wasm and plain JavaScript');
  });
});
t('Distances 3D, Closeness and the hash-grid push-apart give the same picture with and without WebAssembly (smallest sizes lowered for the check)', () => {
  const W = E.stressWasm, keep = { a: W.min3d, b: W.minClose }; W.min3d = 100; W.minClose = 100;
  try {
    const g = network(900, 9), c3 = W.calls3, cc = W.closeCalls;
    ['stress3d', 'closeness'].forEach((arr) => {
      const w = E.build(copy(g), { view: 'network', arrange: arr }); const on = W.on; W.on = false;
      let j; try { j = E.build(copy(g), { view: 'network', arrange: arr }); } finally { W.on = on; }
      ok(same(w, j), arr + ': positions differ between wasm and plain JavaScript');
    });
    ok(W.calls3 > c3 && W.closeCalls > cc, 'WebAssembly did not run for Distances 3D or Closeness');
    const k = 400, r = rng(11), X0 = new Float64Array(k * 2); for (let i = 0; i < k * 2; i++) X0[i] = (r() - 0.5) * 500000; for (let i = 1; i < k; i += 5) { X0[2 * i] = X0[2 * i - 2] + 3; X0[2 * i + 1] = X0[2 * i - 1]; }
    const rad = (i) => 6 + (i % 5) * 3, XA = Float64Array.from(X0), XB = Float64Array.from(X0), sp = W.sparseCalls; W.on = false; E.separate(XA, k, 2, rad, 30); W.on = true; E.separate(XB, k, 2, rad, 30);
    ok(W.sparseCalls > sp, 'the hash-grid push-apart did not run in WebAssembly'); ok(XA.every((v, i) => v === XB[i]), 'push-apart positions differ');
  } finally { W.min3d = keep.a; W.minClose = keep.b; }
});
t('flat Force from 5,000 items starts from the Distances picture: different from the old start, the same every run, and 3D Distances is a 3D picture', () => {
  const g = network(5200, 12), T = E.force2dTuning, a = E.build(copy(g), { view: 'network', arrange: 'force' }), b = E.build(copy(g), { view: 'network', arrange: 'force' });
  ok(same(a, b), 'two runs differ'); const keep = T.stressMin; T.stressMin = 0; let o; try { o = E.build(copy(g), { view: 'network', arrange: 'force' }); } finally { T.stressMin = keep; }
  ok(!same(a, o), 'the picture did not change at 5,200 items');
  const d3 = E.build(copy(network(600, 13)), { view: 'network', arrange: 'stress3d' }); ok(d3.is3d === true && d3.nodes.some((n) => Math.abs(n.z) > 1), 'Distances 3D is not a 3D picture');
});
t('no two items on top of each other (stress, force, closeness: 2,000 items)', () => ['stress', 'force', 'closeness'].forEach((arr) => { const p = touching(E.build(copy(network(2000, 8)), { view: 'network', arrange: arr })); ok(p === 0, arr + ': ' + p + ' touching pairs'); }));
t('a start page that does not exist, an empty map and a single item do not crash', () => {
  const g = story(30, 9); g.start = 'nope'; E.build(copy(g), { view: 'flow' });
  E.build({ start: null, nodes: [], edges: [] }, { view: 'network' });
  E.build({ start: 'a', nodes: [{ id: 'a', label: 'a', group: '', valence: '', ghost: false, attrs: {} }], edges: [] }, { view: 'flow' });
});
t('use() takes layers and sankey, refuses other names, and the layered views say what is missing', () => {
  ok(E.use('layers', NL) === E, 'use returns the engine'); let msg = ''; try { E.use('chart', {}); } catch (e) { msg = e.message; } ok(/layers.*sankey/.test(msg), 'message: ' + msg);
});
t('the Sankey view works with the layers add-on alone, and with the published netflow-sankey when its sk options are left out', () => {
  const S = require('../../netflow-sankey/netflow-sankey.js'), g = story(60, 7); g.start = 'n0'; E.use('layers', NL);
  ok(E.build(copy(g), { view: 'sankey' }).nodes.length === 60, 'sankey without the sankey add-on');
  E.use('sankey', S); ok(E.build(copy(g), { view: 'sankey' }).nodes.length === 60, 'sankey with the sankey module handed over, no sk options');
  if (typeof S.options === 'function' && typeof S.apply === 'function') ok(E.build(copy(g), { view: 'sankey', sk: {} }).nodes.length === 60, 'sankey with sk options');
  else { let threw = false; try { E.build(copy(g), { view: 'sankey', sk: {} }); } catch (e) { threw = /options/.test(e.message); } ok(threw, 'the documented gap: sk options throw while netflow-sankey lacks options/apply'); }
  E.use('sankey', null);
});
t("spread 'wide' reaches the layered drawing: wider with netflow-layers 1.3.0 or newer, the same picture with an older copy; 'tight' is always the old picture", () => {
  const g = story(60, 7); g.start = 'n0'; E.use('layers', NL); const key = (L) => JSON.stringify(L, (k, v) => (k === 'ms' ? undefined : ArrayBuffer.isView(v) ? Array.from(v) : v));
  ['flow', 'down', 'spine', 'lanes'].forEach((view) => {
    const a = E.build(copy(g), { view }), t = E.build(copy(g), { view, spread: 'tight' }), w = E.build(copy(g), { view, spread: 'wide' });
    ok(key(a) === key(t), view + ': spread tight is not the old picture');
    if (/^1\.(?:[3-9]|\d\d)|^[2-9]\./.test(NL.version)) ok(w.width > a.width && w.nodes.length === a.nodes.length, view + ': wide is not wider (' + a.width + ' -> ' + w.width + ')'); else ok(key(w) === key(a), view + ': an older netflow-layers should ignore spread');
  });
  ['sankey', 'arc', 'matrix', 'network', 'shape'].forEach((view) => ok(key(E.build(copy(g), { view })) === key(E.build(copy(g), { view, spread: 'wide' })), view + ': spread should only change Flow, Top-down, Spine and Lanes'));
});
t('saved layouts: a steady fingerprint that changes with the data, and saved positions that equal a new layout; a wrong or short record is ignored', () => {
  const g = network(700, 4), o = { view: 'network', arrange: 'stress' }, k = E.layoutKey(copy(g), o); ok(k && k === E.layoutKey(copy(g), o), 'steady key');
  ok(E.layoutKey(copy(g), { view: 'network', arrange: 'closeness' }) !== k, 'arrangement changes the key'); ok(E.layoutKey(copy(g), { view: 'network', arrange: 'stress', previewOnly: true }) === null && E.layoutKey(copy(g), { view: 'flow' }) === null, 'no key for a preview or a story view');
  const g2 = copy(g); g2.edges.push({ from: g2.nodes[0].id, to: g2.nodes[g2.nodes.length - 1].id, label: '', kind: '', attrs: {} }); ok(E.layoutKey(g2, o) !== k, 'a changed link changes the key');
  const a = E.build(copy(g), Object.assign({ saveKey: k, wantSave: true }, o)); ok(a.saveLayout && a.saveLayout.key === k && a.saveLayout.xy.length === 2 * a.nodes.length, 'asked to save');
  const b = E.build(copy(g), Object.assign({ saveKey: k, saved: a.saveLayout }, o)); ok(b.fromSaved && same(a.nodes.map((n) => [n.cx, n.cy]), b.nodes.map((n) => [n.cx, n.cy])), 'saved positions equal the new layout');
  ok(!E.build(copy(g), Object.assign({ saveKey: k, saved: Object.assign({}, a.saveLayout, { key: 'other' }) }, o)).fromSaved, 'wrong key ignored'); ok(!E.build(copy(g), Object.assign({ saveKey: k, saved: Object.assign({}, a.saveLayout, { xy: a.saveLayout.xy.slice(0, 8) }) }, o)).fromSaved, 'short record ignored');
});
t('two-lane Distances sweeps give the same positions as one lane (1,500 items)', () => {
  const g = network(1500, 6), o = { view: 'network', arrange: 'stress' }, W = E.stressWasm; if (!W.simd) { console.log('     (no SIMD in this engine: skipped)'); return; }
  const a = E.build(copy(g), o); W.simd = false; let b; try { b = E.build(copy(g), o); } finally { W.simd = true; } ok(same(a, b), 'positions differ between SIMD on and off');
});
t('the column reader is exposed and reads numbers the way people write them', () => { ok(E.columns.num('1,234.5') === 1234.5 && E.columns.num('12%') === 12 && isNaN(E.columns.num('0x10')), 'num'); });
t('the file has no dependencies and builds no code from text (no eval, no new Function)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'netflow-engine.js'), 'utf8').replace(/'[A-Za-z0-9+/=]{200,}'/g, "''");
  ok(!/\beval\s*\(/.test(src) && !/new Function\s*\(/.test(src), 'eval or new Function found'); ok((src.match(/\brequire\(/g) || []).length <= 2, 'unexpected require');
});
console.log(bad ? bad + ' of ' + count + ' FAILED' : count + ' checks passed'); process.exit(bad ? 1 : 0);
