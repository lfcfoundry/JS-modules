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
const flat = SC.make(L, base), objs = SC.make(L, Object.assign({ linkStyle: () => null }, base));
const n = flat.curveCount(); ok(n > 2000 && n === objs.curveCount(), 'a big map: ' + n + ' vs ' + objs.curveCount());
ok(flat.curvesPacked() && !objs.curvesPacked(), 'the flat build is packed from the start, the styled one is objects');
const snap = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.edge, c.from, c.to, c.dash || 0], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
const f0 = flat.curves.map((c) => c), o0 = snap(objs);   /* waking the flat one is allowed */
ok(!flat.curvesPacked(), 'reading S.curves makes the objects');
const fs = snap(flat); for (let i = 0; i < n; i++) ok(fs[i] === o0[i], 'link ' + i + ' differs:\n' + fs[i] + '\n' + o0[i]);
/* styling and picture lists on fresh packed scenes */
const mk = () => SC.make(L, base), a = mk(), b = SC.make(L, Object.assign({ linkStyle: () => null }, base));
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
/* the public link accessors the renderers use */
{
  const S = SC.make(E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' }), { colorBy: 'group', theme: 'light' });
  ok(S.curvesPacked() && S.curvesStraight() && S.curveCount() > 2000, 'packed, straight, counted');
  let seen = 0; S.eachCurveView((c, j) => { if (j === 0) ok(c.P.length === 8 && c.w > 0, 'view of a link'); seen++; }); ok(seen === S.curveCount(), 'eachCurveView visits every link');
  ok(S.curvesPacked(), 'reading through views leaves the links packed');
  console.log('ok   accessors: ' + seen + ' links read without waking the list');
}
