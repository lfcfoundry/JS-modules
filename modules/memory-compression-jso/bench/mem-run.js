'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// What does keeping the data cost? Heap held as live objects vs as packed bytes (after a full gc), and what view() costs per read.
// Usage: node --expose-gc bench/mem-run.js
var D = require('../test/data.js'), J = require('../memory-compression-jso.js');
var N = { 'nfm-links': 300000, 'nfm-nodes': 100000, 'api-users': 50000, 'events': 200000 };
function heap() { global.gc(); global.gc(); var m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; }
function mb(x) { return (x / 1048576).toFixed(1); }
console.log('| set | live objects | packed fast | packed small | view() open | JSON text | objects / packed fast | objects / view |\n|---|---:|---:|---:|---:|---:|---:|---:|');
Object.keys(N).forEach(function (name) {
  var base = heap(), data = D.sets[name](N[name]); data = JSON.parse(JSON.stringify(data));        // as parsed data sits in memory (flat strings, shared hidden classes)
  var objs = heap() - base, f = J.pack(data, { mode: 'fast' }), s = J.pack(data, { mode: 'small' }), json = JSON.stringify(data).length;
  data = null; var b2 = heap(), vw = J.view(f), viewMem = heap() - b2 + f.length;      // the view keeps the packed bytes (they are the input) plus its decoded columns
  console.log('| ' + name + ' (' + N[name] + ') | ' + mb(objs) + ' MB | ' + mb(f.length) + ' MB | ' + mb(s.length) + ' MB | ' + mb(viewMem) + ' MB | ' + mb(json) + ' MB | ' + (objs / f.length).toFixed(0) + 'x | ' + (objs / viewMem).toFixed(1) + 'x |');
  vw = null;
});
console.log('\nview() reads on nfm-nodes (100,000 items), best of 7:');
var d = D.sets['nfm-nodes'](100000), p = J.pack(d, { mode: 'fast' }), t, v, best = function (f) { var b = 1e18, i, x; for (i = 0; i < 7; i++) { x = performance.now(); f(); x = performance.now() - x; if (x < b) b = x; } return b; };
var idx = [], r = D.rng(5), i; for (i = 0; i < 1000; i++) idx.push(Math.floor(r() * 100000));
v = J.view(p);
console.log('- open view (reads the control stream once): ' + best(function () { J.view(p); }).toFixed(2) + ' ms');
var tg = best(function () { for (var k = 0; k < 1000; k++) v.get(idx[k]); });
console.log('- 1,000 random get(i) after open: ' + tg.toFixed(2) + ' ms (' + tg.toFixed(2) + ' microseconds each, objects built on the spot)');
console.log('- 1,000 random field(i, "x"): ' + best(function () { for (var k = 0; k < 1000; k++) v.field(idx[k], 'x'); }).toFixed(2) + ' ms');
console.log('- column("x") as Float32/64Array: ' + best(function () { v.column('x'); }).toFixed(2) + ' ms');
console.log('- full unpack for comparison: ' + best(function () { J.unpack(p); }).toFixed(1) + ' ms');
