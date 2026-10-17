'use strict';
// A network as an application holds it: items that are objects, and links that point at the item objects themselves (not copies).
// Usage: node --expose-gc bench/graph-run.js [items=100000] [runs=3]   Prints a markdown table; every result is checked for values and for shared identity.
var path = require('path'), v8 = require('v8'), D = require(path.join(__dirname, '../test/data.js'));
var DEPS = process.env.JSO_DEPS || '/tmp/jso-deps/node_modules/', N = +process.argv[2] || 100000, RUNS = +process.argv[3] || 3;
var NEW = require(path.join(__dirname, '../memory-compression-jso.js')), OLD = process.env.JSO_OLD ? require(process.env.JSO_OLD) : null;
var msgpackr = require(DEPS + 'msgpackr'), cborx = require(DEPS + 'cbor-x');
function make(n) {
  var r = D.rng(31), nodes = [], links = [], i, g;
  for (i = 0; i < n; i++) { g = (i / 200) | 0; nodes.push({ id: i, label: 'Item ' + i, group: g, x: Math.cos(g) * 50 + r() * 8, y: Math.sin(g * 1.3) * 50 + r() * 8, z: g * 0.02 + r() * 3, pinned: r() < 0.01 }); }
  for (i = 0; i < n * 3; i++) links.push({ from: nodes[(i / 3) | 0], to: nodes[Math.floor(r() * n)], weight: Math.floor(r() * 8 + 1) * 0.25, hot: r() < 0.05 });
  return { nodes: nodes, links: links };
}
function check(a, b) {                                              // values equal AND the links point at the very item objects of the result
  var e = D.same(a, b), i;
  if (e) return 'differs: ' + e;
  for (i = 0; i < b.links.length; i += 997) if (b.links[i].from !== b.nodes[a.nodes.indexOf(a.links[i].from)] && b.links[i].from !== b.nodes[a.links[i].from.id]) return 'links point at copies';
  return 'exact, shared';
}
var g = make(N), json = JSON.stringify(g).length;
function best(f, k) { var b = 1e9, r, t0, e, i; for (i = 0; i < k; i++) { if (global.gc) gc(); t0 = process.hrtime.bigint(); r = f(); e = Number(process.hrtime.bigint() - t0) / 1e6; if (e < b) b = e; } return [b, r]; }
var C = [
  ['jso 1.1.0 fast (refs)', function (x) { return NEW.pack(x, { refs: true }); }, function (p) { return NEW.unpack(p); }],
  ['jso 1.1.0 small (refs)', function (x) { return NEW.pack(x, { refs: true, mode: 'small' }); }, function (p) { return NEW.unpack(p); }]
];
if (OLD) C.push(['jso 1.0.0 fast (refs)', function (x) { return OLD.pack(x, { refs: true }); }, function (p) { return OLD.unpack(p); }]);
var pr = new msgpackr.Packr({ structuredClone: true, useRecords: true }), ur = new msgpackr.Unpackr({ structuredClone: true, useRecords: true });
C.push(['msgpackr (structuredClone on)', function (x) { return pr.pack(x); }, function (p) { return ur.unpack(p); }]);
var pc = new cborx.Encoder({ structuredClone: true, useRecords: true }), dc = new cborx.Decoder({ structuredClone: true, useRecords: true });
C.push(['cbor-x (structuredClone on)', function (x) { return pc.encode(x); }, function (p) { return dc.decode(p); }]);
C.push(['v8.serialize', function (x) { return v8.serialize(x); }, function (p) { return v8.deserialize(p); }]);
C.push(['JSON (copies, links lose sharing)', function (x) { return Buffer.from(JSON.stringify(x)); }, function (p) { return JSON.parse(p.toString()); }]);
console.log('network of ' + N + ' items and ' + N * 3 + ' links (JSON text of the same, with links copied: ' + (json / 1e6).toFixed(1) + ' MB)\n');
console.log('| library | size | pack ms | unpack ms | result |\n|---|---:|---:|---:|---|');
C.forEach(function (c) {
  try {
    var a = best(function () { return c[1](g); }, RUNS), b = best(function () { return c[2](a[1]); }, RUNS);
    console.log('| ' + c[0] + ' | ' + (a[1].length / 1e6).toFixed(2) + ' MB | ' + a[0].toFixed(0) + ' | ' + b[0].toFixed(0) + ' | ' + (c[0].indexOf('JSON') === 0 ? 'values equal, links are copies' : check(g, b[1])) + ' |');
  } catch (e) { console.log('| ' + c[0] + ' | | | | failed: ' + String(e.message || e).slice(0, 80) + ' |'); }
});
