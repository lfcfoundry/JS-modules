/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-scene-index checks (Node, pass/fail only, no timing): the index gives the same boxes (same keys, same order) and the same picked item as the scene module's own scan and grid,
 * on a real layout built with the module (small threshold) and on a 150,000-item made-up map with hidden items and shapes. Run: node modules/netflow-scene/test/index.js */
'use strict';
const E = require('../../netflow-engine/netflow-engine.js'), SC = require('../netflow-scene.js'), NSI = require('../netflow-scene-index.js');
const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exit(1); } };
const bigNetwork = require('./fixture.js');
const rng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
ok(NSI.available(), 'elias-fano must be found next to the scene module');
const small = { build: (S) => NSI.build(S, { min: 100 }), rect: NSI.rect, pick: NSI.pick };
let boxes = 0, picks = 0, viaIndex = 0;
function compare(plain, fast, R, tag) {
  ok(!!fast.spatial, tag + ': the index was built');
  const W = plain.w, H = plain.h;
  for (let t = 0; t < 120; t++) {
    const sz = [0.01, 0.03, 0.08, 0.3][t % 4], bw = W * sz * (0.5 + R()), bh = H * sz * (0.5 + R()), ax = plain.x0 + R() * W - bw / 2, ay = plain.y0 + R() * H - bh / 2;
    const a = SC.inRect(plain, ax, ay, ax + bw, ay + bh), b = SC.inRect(fast, ax, ay, ax + bw, ay + bh);
    ok(a.length === b.length && a.every((k, i) => k === b[i]), tag + ': box ' + t + ' (' + a.length + ' vs ' + b.length + ')'); boxes++; if (a.length) viaIndex++;
  }
  for (let t = 0; t < 400; t++) {
    const n = plain.nodes[Math.floor(R() * plain.nodes.length)], wx = n.x + n.w * R(), wy = n.y + n.h * R(), slop = [0, 3, 12][t % 3];
    const a = SC.pick(plain, wx, wy, slop), b = SC.pick(fast, wx, wy, slop);
    ok((a ? a.key : null) === (b ? b.key : null), tag + ': pick ' + t + ' ' + (a && a.key) + ' vs ' + (b && b.key)); picks++;
  }
}
{
  const L = E.build(bigNetwork(4000, 3, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
  const plain = SC.make(L, { colorBy: 'group', theme: 'light' }), fast = SC.make(L, { colorBy: 'group', theme: 'light', spatial: small });
  ok(plain.nodes.length >= 4000 && !plain.spatial && plain.grid, 'without the option the grid is used');
  ok(fast.spatial && !fast.grid, 'with the option the index replaces the grid');
  compare(plain, fast, rng(1), 'real layout');
  const tiny = SC.make(L, { colorBy: 'group', theme: 'light', spatial: NSI }); ok(!tiny.spatial && tiny.grid, 'under 100,000 items the grid stays');
}
{
  const R = rng(9), N = 150000, nodes = [];
  const cx = [], cy = []; for (let k = 0; k < 80; k++) { cx.push(R() * 20000); cy.push(R() * 12000); }
  for (let i = 0; i < N; i++) { const k = i % cx.length, w = 20 + R() * 40, h = 14 + R() * 16; nodes.push({ i: i, key: (i % 997 === 0 ? 'shape:' : 'n') + i, x: cx[k] + (R() + R() + R() - 1.5) * 900 - w / 2, y: cy[k] + (R() + R() + R() - 1.5) * 600 - h / 2, w: w, h: h, o: R() < 0.5 ? undefined : i + 0.5, hidden: i % 13 === 0 }); }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); });
  const mkScene = (spatial) => { const S = { nodes: nodes, x0: x0 - 30, y0: y0 - 30, w: x1 - x0 + 60, h: y1 - y0 + 60, recStale: false, gridStale: false, spatialMod: spatial || null, syncRecs() {} }; S.spatial = S.spatialMod ? S.spatialMod.build(S) : null; return S; };
  const plain = mkScene(), fast = mkScene(NSI);
  ok(!plain.spatial && fast.spatial, 'default threshold: built at 150,000 items');
  // the scene module's grid is made by pick() itself when gridStale; mimic make() for the plain scene
  plain.gridStale = true;
  compare(plain, fast, R, '150,000 made-up items');
  // after a move: mark stale, move some items, both must agree again
  for (let i = 0; i < 2000; i++) { const n = nodes[Math.floor(R() * N)]; n.x += 400; n.y -= 250; }
  plain.gridStale = true; fast.gridStale = true; plain.spatialMod = null; plain.spatial = null;
  compare(plain, fast, R, 'after moving items');
  const over = { nodes: new Array(1048577).fill(0).map((_, i) => ({ i: i, key: 'n' + i, x: i, y: 0, w: 1, h: 1 })), x0: 0, y0: 0, w: 1e6, h: 1 }; ok(NSI.build(over) === null, 'more than 1,048,576 items: no index');
}
console.log('ok   netflow-scene-index: ' + boxes + ' boxes (' + viaIndex + ' with items) and ' + picks + ' picks equal to the plain scan and grid, on a real layout, 150,000 made-up items with hidden items and shapes, and after moving items');
