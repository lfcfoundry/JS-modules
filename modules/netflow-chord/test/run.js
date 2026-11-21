/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for netflow-chord (Node, no page needed). */
'use strict';
var assert = require('assert'), C = require('../netflow-chord.js'), fail = 0, pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ')); } }
var NS, NH, NC; try { NS = require('../../netflow-scene/netflow-scene.js'); NH = require('../../netflow-hierarchy/netflow-hierarchy.js'); NC = require('../../netflow-circular/netflow-circular.js'); } catch (e) { NC = null; }
function rnd(seed) { var s = seed; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function make(n, p, seed, groups) { var r = rnd(seed), nodes = [], edges = [], i, j; for (i = 0; i < n; i++) nodes.push({ id: 'n' + i, label: 'N' + i, group: groups ? 'g' + (i % groups) : undefined }); for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (r() < p) edges.push({ from: 'n' + i, to: 'n' + j, widthV: 1 + Math.floor(r() * 99) }); return { nodes: nodes, edges: edges }; }
function same(a, b) { assert.strictEqual(a.length, b.length); for (var i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i], 'index ' + i); }
t('version and api', function () { assert.strictEqual(C.version, '1.0.0'); assert.strictEqual(C.api, 1); });
t('three arcs: sizes add up, angles go round once, bands are as wide as their amounts', function () {
  var L = C.layout({ nodes: [{ id: 'a', group: 'x' }, { id: 'b', group: 'y' }, { id: 'c' }], edges: [{ from: 'a', to: 'b', value: 3 }, { from: 'b', to: 'c', value: 2 }, { from: 'c', to: 'a', value: 1 }] }, { chordBy: 'items' });
  var ch = L.chart, F = ch.flowsT; assert.strictEqual(ch.type, 'chord'); assert.strictEqual(ch.arcs.length, 3); assert.strictEqual(F.n, 3); assert.strictEqual(ch.total, 6);
  var span = Math.max.apply(null, ch.arcs.map(function (a) { return a.a1; })) - Math.min.apply(null, ch.arcs.map(function (a) { return a.a0; })); assert.ok(span < Math.PI * 2 && span > Math.PI * 2 - 0.05, 'about once round');
  for (var q = 0; q < F.n; q++) { assert.ok(Math.abs((F.sa1[q] - F.sa0[q]) - (F.ta1[q] - F.ta0[q])) < 1e-12, 'both ends of a band are the same width'); }
  assert.ok(Math.abs((F.sa1[0] - F.sa0[0]) / (F.sa1[1] - F.sa0[1]) - 1.5) < 1e-9, 'band width follows the amount (3 to 2)');
});
t('amount names: widthV, value, flow, weight, count, else 1; zero and negative amounts make no band', function () {
  var G = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', widthV: 5 }, { from: 'b', to: 'a', value: 4 }, { from: 'a', to: 'a', flow: 3 }, { from: 'b', to: 'b', weight: 2 }] };
  var F = C.layout(G, { chordBy: 'items' }).chart.flowsT; assert.deepStrictEqual(Array.from(F.v.slice(0, F.n)), [5, 4, 3, 2]);
  F = C.layout({ nodes: G.nodes, edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b', value: 0 }, { from: 'a', to: 'b', value: -1 }] }, { chordBy: 'items' }).chart.flowsT; assert.strictEqual(F.n, 1); assert.strictEqual(F.v[0], 1 + 1 + 1, 'no amount counts 1 each, zero and negative fall back to 1 too');
});
t('links between the same pair add into one band and keep the list of links', function () {
  var G = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', value: 2 }, { from: 'a', to: 'b', value: 3 }, { from: 'b', to: 'a', value: 1 }] };
  var F = C.layout(G, { chordBy: 'items' }).chart.flowsT; assert.strictEqual(F.n, 2); assert.strictEqual(F.v[0], 5); assert.strictEqual(F.count[0], 2); assert.strictEqual(F.firstEdge[0], 0); assert.strictEqual(F.nextEdge[0], 1); assert.strictEqual(F.nextEdge[1], -1);
});
t('unknown ends and empty input do not throw', function () {
  assert.strictEqual(C.layout({ nodes: [], edges: [] }).chart.arcs.length, 0);
  var L = C.layout({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'zzz', value: 1 }] }); assert.strictEqual(L.chart.flowsT.n, 0); assert.strictEqual(L.chart.arcs.length, 2);
});
t('chordBy: auto gives one arc per group above 60 items, items and groups force it', function () {
  var G = make(80, 0.05, 3, 5); assert.strictEqual(C.layout(G).chart.arcs.length, 5); assert.strictEqual(C.layout(G, { chordBy: 'items' }).chart.arcs.length, 80); assert.strictEqual(C.layout(make(10, 0.3, 4, 2), { chordBy: 'groups' }).chart.arcs.length, 2);
});
t('width and height size the circle', function () { var L = C.layout(make(10, 0.4, 5, 0), { chordBy: 'items', width: 600, height: 400 }); assert.ok(Math.abs(L.chart.R - (400 / 2 - 45)) < 1e-9); });
if (NC) {
  [[12, 0.3, 11, 3, 'items'], [40, 0.2, 12, 0, 'items'], [90, 0.1, 13, 6, 'auto'], [150, 0.05, 14, 0, 'items'], [300, 0.02, 15, 8, 'groups']].forEach(function (c) {
    t('same arcs and bands as netflow-circular with its group order (' + c[0] + ' items, chordBy ' + c[4] + ')', function () {
      var A = make(c[0], c[1], c[2], c[3]), B = JSON.parse(JSON.stringify(A)), a = C.layout(A, { chordBy: c[4] }).chart, b = NC.layout('chord', B, { chordBy: c[4], chordOrder: 'fast', typed: true }).chart;
      assert.strictEqual(a.arcs.length, b.arcs.length); a.arcs.forEach(function (x, i) { var y = b.arcs[i]; ['k', 'a0', 'a1', 'mid', 'label', 'group', 'item', 'out', 'inn'].forEach(function (f) { assert.strictEqual(x[f], y[f], 'arc ' + i + ' ' + f); }); });
      ['s', 't', 'v', 'sa0', 'sa1', 'ta0', 'ta1', 'firstEdge', 'nextEdge', 'count'].forEach(function (f) { same(a.flowsT[f], b.flowsT[f]); });
      assert.strictEqual(a.flowsT.n, b.flowsT.n); assert.strictEqual(a.R, b.R); assert.strictEqual(a.th, b.th); assert.strictEqual(a.total, b.total);
    });
  });
  t('a layout from here draws the same picture through netflow-circular as its own', function () {
    var A = make(30, 0.2, 21, 4), B = JSON.parse(JSON.stringify(A)), la = C.layout(A, { chordBy: 'items' }), lb = NC.layout('chord', B, { chordBy: 'items', chordOrder: 'fast', typed: true });
    assert.strictEqual(NS.toSvg(NC.scene(la, {}, NS)), NS.toSvg(NC.scene(lb, {}, NS)));
  });
}
console.log((fail ? 'FAILED ' : 'all ') + pass + ' checks passed' + (fail ? ', ' + fail + ' failed' : '')); process.exit(fail ? 1 : 0);
