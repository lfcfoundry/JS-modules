'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Which JavaScript values does each library bring back exactly? Every probe is packed as {v: value} and compared with the exact check used in the benchmark.
// Usage: node bench/features.js            (needs the libraries in /tmp/jso-deps/node_modules, same as node-run.js)
var D = require('../test/data.js');
var DEP = process.env.JSO_DEPS || '/tmp/jso-deps/node_modules/', L = { JSO: require('../memory-compression-jso.js') };
function tryReq(k, m) { try { L[k] = require(DEP + m); } catch (e) { } }
tryReq('fflate', 'fflate'); tryReq('lz4js', 'lz4js'); tryReq('msgpackr', 'msgpackr'); tryReq('cbor', 'cbor-x'); tryReq('msgpack', '@msgpack/msgpack'); tryReq('notepack', 'notepack.io'); tryReq('bson', 'bson'); L.v8 = require('v8');
var C = require('./contenders.js')(L).filter(function (c) { return /^(jso-fast|JSON$|msgpackr$|msgpackr-records|cbor-x$|cbor-x-records|@msgpack\/msgpack|notepack\.io|v8\.serialize|bson)$/.test(c.id); });
class Pt { constructor() { this.x = 1; this.y = 2; } }
var self = { name: 'self' }; self.me = self;
var shared = { s: 1 }, nullProto = Object.create(null); nullProto.k = 1;
var probes = [
  ['undefined value', function () { return { a: undefined, b: 1 }; }], ['NaN', function () { return NaN; }], ['-0', function () { return -0; }], ['Infinity', function () { return -Infinity; }],
  ['BigInt', function () { return 12345678901234567890n; }], ['Date', function () { return new Date(1760000000123); }], ['invalid Date', function () { return new Date(NaN); }],
  ['Map', function () { return new Map([['a', 1], [2, { x: 1 }]]); }], ['Set', function () { return new Set([1, 'a', { x: 1 }]); }], ['RegExp', function () { return /a+b/gi; }],
  ['Float32Array', function () { return new Float32Array([1.5, 2.5, NaN]); }], ['ArrayBuffer', function () { return new Uint8Array([1, 2, 3]).buffer; }],
  ['sparse array', function () { return [1, , 3]; }], ['own "__proto__" key', function () { return JSON.parse('{"__proto__":{"x":1},"a":2}'); }], ['lone surrogate in text', function () { return 'a\uD800b'; }],
  ['whole number above 2^53', function () { return 1e300; }], ['class instance', function () { return new Pt(); }], ['null-prototype object', function () { return nullProto; }],
  ['same object twice (stays one object)', function () { return [shared, shared]; }], ['object that contains itself', function () { return self; }]
];
function judge(name, v, back) {                    // back is what came out of packing {v: v}
  var b = back && back.v;
  if (name === 'class instance') return b && b.x === 1 && b.y === 2 ? (Object.getPrototypeOf(b) === Pt.prototype ? 'exact' : 'plain object') : 'wrong';
  if (name === 'same object twice (stays one object)') return b && b[0] === b[1] ? 'exact' : b && D.same(v, b) === null ? 'two copies' : 'wrong';
  if (name === 'object that contains itself') return b && b.me === b ? 'exact' : 'wrong';
  return D.same({ v: v }, back) ? 'changed' : 'exact';
}
var out = {};
C.forEach(function (c) {
  out[c.id] = {};
  probes.forEach(function (p) {
    var v = p[1](), w = { v: v }, r, back, h;
    try {
      if (c.id === 'jso-fast' && /contains itself|same object/.test(p[0])) { back = L.JSO.unpack(L.JSO.pack(w, { refs: true })); r = judge(p[0], v, back); if (r === 'exact') r = 'exact (refs: true)'; }
      else { h = c.make([w]); back = h.dec(h.enc(w)); r = judge(p[0], v, back); }
    } catch (e) { r = 'throws'; }
    out[c.id][p[0]] = r;
  });
});
console.log('| value | ' + C.map(function (c) { return c.id; }).join(' | ') + ' |\n|---|' + C.map(function () { return '---'; }).join('|') + '|');
probes.forEach(function (p) { console.log('| ' + p[0] + ' | ' + C.map(function (c) { return out[c.id][p[0]]; }).join(' | ') + ' |'); });
