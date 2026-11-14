// ASCII text straight to bytes (2.16.4, WebKit only by default): forced on gives the same bytes as forced off on every data set and on edge cases. Node only. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
var assert = require('assert'), path = require('path'), D = require('./data.js');
var file = path.resolve(__dirname, '..', 'memory-compression.js');
function load(on) { delete require.cache[require.resolve(file)]; globalThis.__MC_JT_ASCII = on; var M = require(file).jso; delete globalThis.__MC_JT_ASCII; return M; }
var A = load(true), B = load(false), n = 0;
var edge = [['plain', 'text', ''], ['café', 'x', 'y'], ['a\u0000b', 'c'], ['lone \ud800', 'ok'], ['😀 emoji', 'z'], ['', '', ''], ['tab\tnew\nline', 'q']];
var lists = Object.keys(D.sets).map(function (k) { return D.sets[k](3000); });
edge.forEach(function (e) { var big = []; for (var i = 0; i < 2000; i++) big.push(e[i % e.length] + (i % 7 ? '' : i)); lists.push(big); lists.push(big.map(function (s, i) { return { s: s, k: i }; })); });
lists.forEach(function (v) { ['fast', 'balanced', 'small'].forEach(function (m) {
  var a = A.pack(v, { mode: m }), b = B.pack(v, { mode: m });
  assert.deepStrictEqual(Buffer.from(a), Buffer.from(b), 'same bytes, ' + m);
  var e = D.same(v, A.unpack(a)); assert(!e, e); n++;
}); });
console.log('ascii: ' + n + ' cases, the ASCII path gives the same bytes');
