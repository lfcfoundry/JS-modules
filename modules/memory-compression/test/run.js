'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Checks for the object layer of memory-compression in Node. Usage: node test/run.js [path-to-module] [--js-only]   (FULL=1 for the long fuzz)
var assert = require('assert'), path = require('path'), D = require('./data.js');
var args = process.argv.slice(2), JS_ONLY = args.indexOf('--js-only') >= 0, modPath = args.filter(function (a) { return a[0] !== '-'; })[0] || path.join(__dirname, '..', 'memory-compression.js');
var J = require(path.resolve(modPath)).jso, FULL = !!process.env.FULL;
if (!JS_ONLY) J.ready();      // 2.0.3 starts the helper on first use; start it now so the helper checks below run
var WASM = JS_ONLY ? { wasm: false } : {};
var passed = 0, failed = 0;
// the message first: some browsers leave it out of the stack text
function why(e) { var m = String(e && e.message || e), st = String(e && e.stack || ''); return (st.indexOf(m) >= 0 ? st : m + '\n' + st).split('\n').slice(0, 4).join('\n   '); }
function t(name, fn) {
  var t0 = Date.now();
  try { fn(); passed++; console.log('  ok  ' + name + ' (' + (Date.now() - t0) + ' ms)'); } catch (e) { failed++; console.log('FAIL ' + name + '\n   ' + why(e)); }
}
var later = [];
function tAsync(name, fn) {      // a check that waits for promises; run after the plain ones
  later.push(function () {
    var t0 = Date.now();
    return Promise.resolve().then(fn).then(function () { passed++; console.log('  ok  ' + name + ' (' + (Date.now() - t0) + ' ms)'); }, function (e) { failed++; console.log('FAIL ' + name + '\n   ' + why(e)); });
  });
}
function same(a, b, label) { var e = D.same(a, b); if (e) throw new Error((label || 'values differ') + ': ' + e); }
function opt(o) { return Object.assign({}, WASM, o || {}); }
function rt(v, o, label) { var p = J.pack(v, opt(o)); var u = J.unpack(p, opt(o)); same(v, u, label); return p; }
function throwsJ(fn, label) { var threw = false; try { fn(); } catch (e) { threw = true; assert(/MemoryCompressionJSO|data is cut off|bad|Invalid|invalid|RangeError|MemoryCompression/.test(String(e && e.message || e)) || e instanceof RangeError, (label || '') + ' threw something unexpected: ' + e); } assert(threw, (label || '') + ' should throw'); }
function many(n, f) { var a = [], i; for (i = 0; i < n; i++) a.push(f(i)); return a; }

console.log('memory-compression (object layer), ' + (JS_ONLY ? 'plain JavaScript only' : 'WebAssembly helper ' + (J.accelerated() ? 'on' : 'off')));

t('scalars and special numbers', function () {
  [0, -0, 1, -1, 255, 256, 65535, 65536, 2147483647, -2147483648, 4294967295, 4294967296, 9007199254740991, -9007199254740991, 4503599627370495, 4503599627370496, 1e21, 1.5, -1.5, 0.1, 1 / 3, Math.PI, 5e-324, 1.7976931348623157e308, NaN, Infinity, -Infinity].forEach(function (v) { rt(v, null, 'number ' + v); rt([v], null, 'in array ' + v); });
  rt(true); rt(false); rt(null); rt(undefined); rt(123456789012345678901234567890n, null, 'bigint'); rt([1n, -5n]);
});
t('strings: empty, long, unicode, lone surrogates, a leading byte-order mark', function () {
  var cases = ['', 'a', 'héllo', '日本語', '😀 emoji', 'x'.repeat(100000), '﻿bom first', '\u0000nul', 'line\nbreak\r\n', 'lone \uD800 high', 'lone \uDC00 low', '\uDC00\uD800', 'a\uD83Dz'];
  cases.forEach(function (s) { rt(s, null, JSON.stringify(s).slice(0, 30)); rt([s], null, 'arr ' + s.length); rt({ k: s }, null, 'obj'); });
  rt(many(40, function (i) { return cases[i % cases.length]; }), null, 'column of strings');
  rt(many(40, function (i) { return 'a\uD800b' + i; }), null, 'column with a lone surrogate');
  rt(many(40, function (i) { return '﻿' + i; }), null, 'column starting with BOMs');
});
t('keys: empty, numeric, __proto__, constructor, unicode, long, lone surrogate', function () {
  var o = { '': 1, '1': 2, 'a b': 3, 'constructor': 4, 'toString': 5, 'ключ': 6, '日本': 7, ['k'.repeat(300)]: 8, 'a\uD800': 9 };
  Object.defineProperty(o, '__proto__', { value: { evil: 1 }, enumerable: true, writable: true, configurable: true });
  var p = J.pack(o, opt()), u = J.unpack(p, opt());
  same(o, u, 'object with odd keys'); assert.strictEqual(Object.getPrototypeOf(u), Object.prototype); assert.strictEqual({}.evil, undefined);
  var rows = many(30, function (i) { var r = { id: i }; Object.defineProperty(r, '__proto__', { value: i, enumerable: true, writable: true, configurable: true }); r['a-b'] = i * 2; r['9'] = 1; return r; });
  u = J.unpack(J.pack(rows, opt()), opt()); same(rows, u, 'records with __proto__ and numeric keys'); assert.strictEqual({}.id, undefined);
});
t('plain structures: nesting, empty containers, sparse arrays become undefined', function () {
  rt({}); rt([]); rt([[]]); rt({ a: {}, b: [], c: [{}] }); rt([[[[[1]]]]]);
  var sp = [1, , 3]; var u = J.unpack(J.pack(sp, opt()), opt()); assert.strictEqual(u.length, 3); assert.strictEqual(u[1], undefined); assert.strictEqual(u[2], 3);
  var deep = {}, cur = deep, i; for (i = 0; i < 200; i++) { cur.n = {}; cur = cur.n; } rt(deep, null, 'depth 200');
  var arr = []; for (i = 0; i < 100; i++) arr = [arr]; rt(arr, null, 'array depth 100');
});
t('Date, Map, Set, RegExp, typed arrays, ArrayBuffer, Buffer', function () {
  rt(new Date(0)); rt(new Date(NaN)); rt(new Date(1760000000123)); rt([new Date(1), new Date(2)]);
  rt(new Map([[1, 'a'], ['b', { c: 2 }], [{ k: 1 }, [1, 2]]])); rt(new Set([1, 'x', null, undefined, { a: 1 }])); rt(new Map()); rt(new Set());
  rt(new Map(many(40, function (i) { return [i, 'v' + i]; }))); rt(new Set(many(40, function (i) { return i * 2; })));
  rt(/ab+c/gi); rt([/x/, /y/m]);
  [Uint8Array, Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array].forEach(function (C) {
    var small = new C([1, 2, 3]), big = new C(many(5000, function (i) { return i % 100; }));
    rt(small, null, C.name + ' small'); rt(big, null, C.name + ' big'); rt({ a: big, b: small });
  });
  rt([1e300, 1e300], null, 'huge whole numbers'); rt(many(40, function (i) { return 9007199254740991 - i; }), null, 'whole numbers near 2^53'); rt(many(40, function (i) { return -(2 ** 60) + i * 1024; }), null, 'whole numbers near -2^60');
  var buf = new Float64Array(100).map(function (_, i) { return Math.sin(i); }); rt(buf.subarray(10, 30), null, 'subarray'); rt(new Float32Array(buf.buffer, 8, 20), null, 'offset view');
  var ab = new Uint8Array(many(3000, function (i) { return i * 7; })).buffer; rt(ab, null, 'ArrayBuffer'); var bb = J.unpack(J.pack(Buffer.from('hello world'), opt()), opt()); assert(bb instanceof Uint8Array && Buffer.from(bb).toString() === 'hello world', 'Buffer comes back as a Uint8Array with the same bytes');
  throwsJ(function () { J.pack(new DataView(new ArrayBuffer(8)), opt()); }, 'DataView');
  throwsJ(function () { J.pack(function () { }, opt()); }, 'function'); throwsJ(function () { J.pack(Symbol('x'), opt()); }, 'symbol'); throwsJ(function () { J.pack({ f: function () { } }, opt()); }, 'function in object');
});
t('number columns: every encoding, with -0, NaN, infinities mixed in', function () {
  var cases = {
    constant: many(40, function () { return 7; }), smallInts: many(40, function (i) { return i % 200; }), negInts: many(40, function (i) { return i - 20; }), wideInts: many(40, function (i) { return i * 70000; }),
    bigInts: many(40, function (i) { return 2 ** 33 + i * 3; }), nearSafe: many(40, function (i) { return 9007199254740991 - i; }), decimals2: many(40, function (i) { return i * 0.25 + 0.01; }),
    decimals6: many(40, function (i) { return Math.round((i * 1.37 - 7) * 1e6) / 1e6; }), price: many(40, function (i) { return Math.round((i * 3.31) * 100) / 100; }), f32: many(40, function (i) { return Math.fround(i / 3); }),
    f64: many(40, function (i) { return Math.sin(i) * 1e3; }), withNegZero: many(40, function (i) { return i === 7 ? -0 : i; }), allNegZero: many(40, function () { return -0; }), zerosMixed: many(40, function (i) { return i % 2 ? 0 : -0; }),
    withNaN: many(40, function (i) { return i === 5 ? NaN : i * 0.5; }), withInf: many(40, function (i) { return i === 3 ? Infinity : i === 9 ? -Infinity : i * 1.5; }), tiny: many(40, function (i) { return 5e-324 * (i + 1); }),
    huge: many(40, function (i) { return 1e300 * (i + 1); }), mixedIntFloat: many(40, function (i) { return i % 2 ? i : i + 0.5; }), allNaN: many(40, function () { return NaN; }), decimalsWithInt: many(40, function (i) { return i % 3 ? i + 0.1 : i; })
  };
  Object.keys(cases).forEach(function (k) { rt(cases[k], null, k); rt(cases[k].map(function (x) { return { v: x }; }), null, k + ' as field'); });
});
t('string, boolean, null and undefined columns', function () {
  rt(many(100, function (i) { return 'k' + (i % 5); }), null, 'dictionary'); rt(many(100, function (i) { return 'unique ' + i; }), null, 'raw strings');
  rt(many(100, function (i) { return i % 3 === 0; }), null, 'booleans'); rt(many(100, function () { return true; }), null, 'all true'); rt(many(40, function () { return null; }), null, 'all null'); rt(many(40, function () { return undefined; }), null, 'all undefined');
  rt(many(60, function (i) { return i % 4 === 0 ? null : i % 4 === 1 ? undefined : i; }), null, 'numbers with null and undefined');
  rt(many(60, function (i) { return i % 4 === 0 ? null : 's' + (i % 3); }), null, 'strings with null');
  rt(many(60, function (i) { return i % 2 ? null : undefined; }), null, 'null and undefined only');
  rt(many(60, function (i) { return i % 3 === 0 ? 1 : i % 3 === 1 ? 'a' : true; }), null, 'mixed kinds');
  rt(many(70000, function (i) { return 'v' + (i % 66000); }), null, 'dictionary near 65536');
  rt(many(80000, function (i) { return 'w' + i; }), null, 'many unique strings');
});
t('arrays in columns: tuples, ragged, nested', function () {
  rt(many(50, function (i) { return [i, i * 2]; }), null, 'pairs'); rt(many(50, function (i) { return [i, i + 0.5, 'a']; }), null, 'mixed triples');
  rt(many(50, function (i) { return many(i % 6, function (j) { return j * i; }); }), null, 'ragged'); rt(many(50, function () { return []; }), null, 'empty arrays');
  rt(many(50, function (i) { return many(9, function (j) { return j + i; }); }), null, 'length 9'); rt(many(50, function (i) { return [many(i % 3, function (j) { return { x: j }; })]; }), null, 'arrays of arrays of objects');
  rt(many(50, function (i) { return [[i, i], [i + 1, i + 1]]; }), null, 'nested pairs');
});
t('records: one shape, several shapes, too many shapes, missing and undefined keys, empty objects', function () {
  rt(many(100, function (i) { return { a: i, b: 'x' + (i % 4), c: i / 8 }; }), null, 'one shape');
  rt(many(100, function (i) { return i % 3 === 0 ? { a: i } : i % 3 === 1 ? { a: i, b: 1 } : { b: 2, a: i }; }), null, 'three shapes (key order counts)');
  rt(many(100, function (i) { var o = {}; o['k' + (i % 16)] = i; return o; }), null, '16 shapes'); rt(many(100, function (i) { var o = {}; o['k' + (i % 17)] = i; return o; }), null, '17 shapes');
  rt(many(100, function (i) { return i % 2 ? { a: 1, b: undefined } : { a: 1 }; }), null, 'undefined value vs missing key'); rt(many(40, function () { return {}; }), null, 'empty objects');
  rt(many(40, function (i) { return { a: { b: { c: i } } }; }), null, 'nested objects'); rt(many(40, function (i) { return i % 2 ? { a: 1 } : null; }), null, 'objects with null');
  rt(many(40, function (i) { return i === 20 ? new Date(5) : { a: i }; }), null, 'objects with a Date among them'); rt(many(40, function (i) { return Object.assign(Object.create(null), { a: i }); }), null, 'null-prototype objects');
  rt(many(40, function (i) { return { s: new Set([i]), m: new Map([[i, i]]) }; }), null, 'sets and maps in records');
  function Pt(x, y) { this.x = x; this.y = y; } var back = J.unpack(J.pack(many(40, function (i) { return new Pt(i, 2); }), opt()), opt()); assert.strictEqual(Object.getPrototypeOf(back[0]), Object.prototype); assert.strictEqual(back[7].x, 7);
});
t('fast paths for uniform rows fall back cleanly when a row does not fit', function () {
  var i, rows;
  rows = many(40, function (i) { return JSON.parse('{"__proto__":' + i + ',"a":' + (i * 0.5) + '}'); }); rt(rows, null, 'own __proto__ key in records');
  rows = many(40, function (i) { return { n: i * 1.5, m: i }; }); rows[17].n = null; rows[18].n = 'text'; rows[30].m = undefined; rt(rows, null, 'a numeric key meets null, text and undefined');
  rows = many(40, function (i) { return { n: i * 1.5, m: i }; }); rows[39] = { m: 1, n: 2 }; rt(rows, null, 'one row with the keys in another order');
  rows = many(40, function (i) { return { n: i, m: i }; }); rows[5] = [1, 2]; rt(rows, null, 'an array among objects'); rows[5] = new Date(7); rt(rows, null, 'a Date among objects'); rows[5] = null; rt(rows, null, 'null among objects');
  rows = many(40, function (i) { return { n: i, m: i }; }); rows[5] = Object.create(null); rows[5].n = 1; rows[5].m = 2; rt(rows, null, 'a null-prototype object among objects');
  rows = many(40, function (i) { return [i, i * 0.25]; }); rows[20] = [1, 2, 3]; rt(rows, null, 'pairs with one triple'); rows[20] = 'x'; rt(rows, null, 'pairs with a string'); rows[20] = []; rt(rows, null, 'pairs with an empty array');
  rows = many(40, function (i) { return [i, 'k' + (i % 3)]; }); rt(rows, null, 'pairs of a number and a string'); rows[4][0] = null; rt(rows, null, 'pairs with a null');
  rows = many(30, function (i) { return many(i % 5, function (j) { return [i + j, (i + j) * 0.5]; }); }); rt(rows, null, 'lists of pairs, ragged'); rows[7].push([1]); rt(rows, null, 'lists of pairs with one short pair'); rows[7] = [[1, 2], 'x']; rt(rows, null, 'lists of pairs with a string inside');
  rows = many(30, function (i) { return many(3, function (j) { return [i, j, null]; }); }); rt(rows, null, 'lists of triples with nulls');
  Object.prototype.polluted = 1;
  try { rows = many(40, function (i) { return { a: i, b: 'x' }; }); rt(rows, null, 'with an enumerable property on Object.prototype'); } finally { delete Object.prototype.polluted; }
  rows = many(40, function (i) { return { a: i, b: 'x' }; }); rows[3] = Object.assign(Object.create({ inherited: 1 }), { a: 1, b: 'y' });
  var back = J.unpack(J.pack(rows, opt()), opt()); assert.deepStrictEqual(Object.keys(back[3]), ['a', 'b']);
  var shared = { v: 1 }; rows = many(40, function () { return { s: shared }; }); rt(rows, { refs: true }, 'refs mode takes the general path');
});
t('data sets: all of them, both modes, exact', function () {
  var N = { 'nfm-links': 4000, 'nfm-nodes': 3000, 'api-users': 3000, 'geojson': 800, 'events': 4000, 'small': 400, 'irregular': 1500 };
  Object.keys(D.sets).forEach(function (name) { var d = D.sets[name](N[name]); ['fast', 'small'].forEach(function (m) { var p = rt(d, { mode: m }, name + ' ' + m); assert(p.length < JSON.stringify(d).length, name + ' ' + m + ' should be smaller than JSON'); }); });
});
t('smaller than JSON on the data sets, by a wide margin where the data is regular', function () {
  var links = D.sets['nfm-links'](5000), p = J.pack(links, opt()), j = JSON.stringify(links).length;
  assert(p.length < j * 0.2, 'links packed to ' + p.length + ' of ' + j);
});
t('pack is deterministic and the JavaScript path gives the same bytes as WebAssembly', function () {
  var d = D.sets['nfm-nodes'](3000); var a = J.pack(d, opt({ mode: 'fast' })), b = J.pack(d, opt({ mode: 'fast' })); assert.deepStrictEqual(Buffer.from(a), Buffer.from(b));
  if (!JS_ONLY && J.accelerated()) ['fast', 'small'].forEach(function (m) {
    ['nfm-links', 'api-users', 'irregular'].forEach(function (name) { var x = D.sets[name](2500), p1 = J.pack(x, { mode: m }), p2 = J.pack(x, { mode: m, wasm: false }); assert.deepStrictEqual(Buffer.from(p1), Buffer.from(p2), name + ' ' + m); same(x, J.unpack(p1, { wasm: false })); same(x, J.unpack(p2)); });
  });
});
t('refs: shared objects stay shared, cycles come back', function () {
  var shared = { s: 1 }, a = { x: shared, y: shared, list: [shared, shared] }; a.self = a; a.list.push(a.list);
  var u = J.unpack(J.pack(a, { refs: true }), WASM);
  assert.strictEqual(u.x, u.y); assert.strictEqual(u.list[0], u.x); assert.strictEqual(u.self, u); assert.strictEqual(u.list[2], u.list); assert.strictEqual(u.x.s, 1);
  var d = new Date(5); var v = J.unpack(J.pack({ a: d, b: d, m: new Map([[1, d]]) }, { refs: true }), WASM); assert.strictEqual(v.a, v.b); assert.strictEqual(v.m.get(1), v.a);
  var arr = many(50, function (i) { return { i: i, peer: null }; }); arr.forEach(function (o, i) { o.peer = arr[(i + 1) % 50]; });
  var w = J.unpack(J.pack(arr, { refs: true }), WASM); assert.strictEqual(w[0].peer, w[1]); assert.strictEqual(w[49].peer, w[0]);
  throwsJ(function () { J.pack(a, WASM); }, 'cycle without refs');
});
t('shared references without refs are copied (documented)', function () {
  var s = { v: 1 }, u = J.unpack(J.pack([s, s], WASM)); same([s, s], u); assert.notStrictEqual(u[0], u[1]);
});
t('view(): one object, one field, one column, without the others', function () {
  var rows = D.sets['nfm-links'](3000), p = J.pack(rows, opt()), v = J.view(p, opt());
  assert.strictEqual(v.length, 3000); assert.deepStrictEqual(v.keys, Object.keys(rows[0]));
  same(rows[0], v.get(0)); same(rows[2999], v.get(2999)); same(rows[1234], v.get(1234)); assert.strictEqual(v.get(3000), undefined); assert.strictEqual(v.get(-1), undefined);
  assert.strictEqual(v.field(77, 'to'), rows[77].to); assert.strictEqual(v.field(77, 'kind'), rows[77].kind); assert.strictEqual(v.field(77, 'hot'), rows[77].hot); assert.strictEqual(v.field(77, 'nope'), undefined);
  var col = v.column('from'); assert.strictEqual(col.length, 3000); assert.strictEqual(col[100], rows[100].from);
  same(rows, v.toArray());
  var strs = D.sets['nfm-nodes'](500), vs = J.view(J.pack(strs, opt()), opt()); assert.strictEqual(vs.get(321).label, strs[321].label); same(strs, vs.toArray());
  throwsJ(function () { J.view(J.pack([1, 2, 3], opt()), opt()); }, 'view of a small array');
  throwsJ(function () { J.view(J.pack(many(40, function (i) { return i; }), opt()), opt()); }, 'view of numbers');
  throwsJ(function () { J.view(J.pack(many(40, function (i) { return i % 2 ? { a: 1 } : { b: 1 }; }), opt()), opt()); }, 'view of two shapes');
});
t('text patterns: strings that are text around numbers', function () {
  var padded = function (n, w) { return ('0000000000000000' + n).slice(-w); };
  var cols = {
    emails: function (i) { return 'user' + i + '@example.org'; }, ids: function (i) { return 'node-' + (i * 7); }, zip: function (i) { return String(10000 + i * 13); },
    iso: function (i) { return '2025-' + padded(1 + i % 12, 2) + '-' + padded(1 + i % 28, 2) + 'T' + padded(i % 24, 2) + ':' + padded(i % 60, 2) + ':00Z'; },
    version: function (i) { return 'v' + (i % 3) + '.' + (i % 10) + '.' + i; }, negative: function (i) { return 'x' + (i % 2 ? '-' : '') + i; }, decimalText: function (i) { return (i / 4).toFixed(2); },
    padded6: function (i) { return padded(i * 31, 6); }, mixedWidth: function (i) { return i % 3 ? String(i) : padded(i, 5); }, onlyDigits: function (i) { return String(i); },
    leadingDigits: function (i) { return i + 'px'; }, twoWords: function (i) { return (i % 2 ? 'alpha ' : 'beta ') + i + ' ms'; },
    longRun: function (i) { return 'id' + (10 ** 15 + i); }, tooLongRun: function (i) { return 'id' + '1234567890123456' + i; }, nonAscii: function (i) { return 'é' + i; },
    zeroRuns: function (i) { return 'a' + (i % 2 ? '0' : '00') + 'b' + i; }, sameRunCount: function (i) { return i % 5 ? 'p' + i : 'q' + i + 'r'; }, someEmpty: function (i) { return i === 20 ? '' : 'n' + i; },
    thirtyTwo: function (i) { return 't' + String.fromCharCode(97 + (i % 32)) + i; }, thirtyThree: function (i) { return 't' + String.fromCharCode(97 + (i % 33)) + i; }, surrogate: function (i) { return i === 7 ? '\uD800' + i : 'n' + i; },
    bigNumbers: function (i) { return 'n' + (i * 1000003) + '/' + (i * 7); }, constantRun: function (i) { return 'year 2025 item ' + i; }, upperBound: function (i) { return 'k' + (999999999999999 - i); }
  };
  Object.keys(cols).forEach(function (k) { [40, 5000].forEach(function (n) { var col = many(n, cols[k]); ['fast', 'small'].forEach(function (m) { rt(col, { mode: m }, k + ' ' + n + ' ' + m); }); rt(col.map(function (x) { return { v: x }; }), null, k + ' ' + n + ' as field'); }); });
  var iso = many(5000, cols.iso), pk = J.pack(iso, opt()); assert(pk.length < 5000 * 4, 'timestamps should take well under 4 bytes each, took ' + pk.length);
  var em = many(5000, cols.emails); assert(J.pack(em, opt()).length < 2000, 'sequential e-mail addresses should take under 2 KB');
  if (!JS_ONLY && J.accelerated()) ['emails', 'twoWords', 'iso', 'thirtyTwo', 'mixedWidth'].forEach(function (k) { var col = many(6000, cols[k]); assert.deepStrictEqual(Buffer.from(J.pack(col)), Buffer.from(J.pack(col, { wasm: false })), 'same bytes with and without WebAssembly: ' + k); });
});
t('patterns: false keeps the strings whole (bigger, still exact); float32 is lossy only where asked', function () {
  var col = many(5000, function (i) { return { id: 'user' + i + '@example.org', t: '2025-03-05T04:' + ('0' + (i % 60)).slice(-2) + ':00Z' }; }), on = J.pack(col, opt()), off = J.pack(col, opt({ patterns: false }));
  assert(off.length > on.length * 1.5, 'turning patterns off should cost size: ' + on.length + ' vs ' + off.length);
  same(col, J.unpack(off, opt()));
  var f = many(3000, function (i) { return { x: Math.sin(i) * 100, k: i, y: i / 4 }; }), pf = J.pack(f, opt({ float32: true })), back = J.unpack(pf, opt()), i, rel;
  assert(pf.length < J.pack(f, opt()).length * 0.8, 'float32 should shrink the fractions column');
  for (i = 0; i < f.length; i++) { assert.strictEqual(back[i].k, f[i].k); assert.strictEqual(back[i].y, f[i].y); rel = Math.abs(back[i].x - f[i].x) / Math.max(1e-9, Math.abs(f[i].x)); assert(rel < 1.2e-7 || Math.abs(f[i].x) < 1e-6, 'float32 error too big at ' + i + ': ' + rel); }
});
t('text patterns: random strings built from a few pieces', function () {
  var r = D.rng(77), pieces = ['a', 'b', 'é', '-', '.', ' ', '0', '00', '7', '12', '345', '0123', '99999999999999999'], round, n, i, k, parts, col, s;
  for (round = 0; round < (FULL ? 400 : 60); round++) {
    n = round % 3 === 0 ? 5000 : 40 + Math.floor(r() * 60); col = []; parts = 1 + Math.floor(r() * 4);
    for (i = 0; i < n; i++) { s = ''; for (k = 0; k < parts; k++) s += r() < 0.7 ? pieces[Math.floor(r() * pieces.length)] : String(Math.floor(r() * 1e6)); col.push(s); }
    rt(col, { mode: round % 2 ? 'small' : 'fast' }, 'random pattern column ' + round);
  }
});
t('date-time columns: one number per timestamp, exact text back, bad dates fall back', function () {
  var P2 = function (v) { return ('0' + v).slice(-2); };
  var fmts = {
    iso: function (d) { return d.toISOString().slice(0, 19) + 'Z'; }, ms: function (d) { return d.toISOString(); }, minutes: function (d) { return d.toISOString().slice(0, 16) + 'Z'; },
    day: function (d) { return d.toISOString().slice(0, 10); }, space: function (d) { return d.toISOString().slice(0, 10) + ' ' + d.toISOString().slice(11, 19); },
    prefixed: function (d) { return 'at ' + d.toISOString().slice(0, 19) + ' UTC'; }, tail: function (d, i) { return d.toISOString().slice(0, 19) + 'Z#' + i; }
  };
  var r = D.rng(5), start = Date.UTC(1999, 11, 31, 23, 59, 55), keys = Object.keys(fmts);
  keys.forEach(function (k) {
    [100, 2047, 2048, 5000].forEach(function (n) {
      var step = k === 'minutes' ? 90000 : k === 'day' ? 129600000 : 1500, sorted = many(n, function (i) { return fmts[k](new Date(start + i * step + Math.floor(r() * 1000)), i); });
      var rand = many(n, function (i) { return fmts[k](new Date(Date.UTC(1900, 0, 1) + Math.floor(r() * 6e12)), i); });
      var same1 = many(n, function (i) { return fmts[k](new Date(start), i); });
      [sorted, rand, same1].forEach(function (col, w) { ['fast', 'small'].forEach(function (m) { var p = rt(col, { mode: m }, 'dates ' + k + ' ' + n + ' ' + m + ' ' + w); if (k !== 'tail' && w === 0) assert(p[2] >= 3, 'uses the date column: ' + k + ' ' + n + ' ' + m + ' ' + w); }); });
    });
  });
  var edge = ['0000-02-29', '1600-02-29', '1900-01-01', '2000-02-29', '2024-02-29', '2100-12-31', '9999-12-31', '1970-01-01', '1969-12-31', '0001-01-01'];
  edge.forEach(function (day) { [day, day + 'T00:00:00Z', day + 'T23:59:59Z'].forEach(function (s) { var col = many(60, function (i) { return i % 2 ? s : s.replace(/^(\d{4})/, function (m) { return ('000' + (+m + 1)).slice(-4); }).replace('0001-02-29', '0001-03-01'); }); rt(col, null, 'edge ' + s); }); });
  var bad = ['2025-02-29', '1900-02-29', '2100-02-29', '2025-13-01', '2025-00-10', '2025-04-31', '2025-01-00', '2025-01-01T24:00:00Z', '2025-01-01T23:60:00Z', '2025-01-01T23:59:60Z'];
  bad.forEach(function (s) {
    var col = many(60, function (i) { return i === 33 ? s : '2025-01-' + P2(1 + i % 28) + (s.length > 10 ? 'T' + P2(i % 24) + ':' + P2(i % 60) + ':' + P2(i % 60) + 'Z' : ''); });
    var p = rt(col, null, 'bad date ' + s); assert.notStrictEqual(p[2], 3, 'not stored as a date column: ' + s);
  });
  var sorted = many(5000, function (i) { return new Date(start + i * 1500).toISOString().slice(0, 19) + 'Z'; });
  var withDates = J.pack(sorted, opt()), plain = J.pack(sorted, opt({ patterns: false, front: false }));
  assert(withDates.length < 5000 * 0.9, 'sorted timestamps take under a byte each, took ' + withDates.length); assert(withDates.length < plain.length / 4, 'much smaller than stored as text');
  assert.strictEqual(J.pack(many(200, function (i) { return 'x' + i; }), opt())[2], 2, 'files with no date column still say format 2, so older readers open them');
  var gold = Buffer.from('TUoCBC0tCzwLAQIAAmlkAAJhdIOAgIAAvYCAgACJgICAAMyDgIAAAQEABjwAFAE8ALAJAgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6OwGMA01DAQEAALAJgIBAAf4C/gUyMDI1LTAxLTMxVDIzOjU5OjUwWhQAEzcUAIAyLTAxVDAwOgMAHjQUAC8xMRQAAB44FAAuMjUUAC8zMhQAAB45FAAuNDYUACw1MxQANDE6MMgABbQAPTE6MMgAPTE6McgAPTE6MsgAPTE6MsgAPTE6M8gAPTE6NMgAPTE6NMgAPTE6NcgAPTI6MMgAPTI6McgAPTI6McgAPTI6MsgAPTI6M8gAPTI6M8gAPTI6NMgAPTI6NcgAPTI6NcgAPTM6MMgAPTM6McgAPTM6MsgAPTM6MsgAPTM6M8gAPTM6NMgAPTM6NMgAPTM6NcgAPTQ6MMgAPTQ6MMgAPTQ6McgAPTQ6MsgAPTQ6M8gAPTQ6M8gAPTQ6NMgAPTQ6NcgAPTQ6NcgAPTU6MMgATDU6MTLkAj01OjHIAD01OjLIAD01OjPIAD01OjTIAD01OjTIAD01OjXIAD02OjDIAD02OjDIAD02OjHIAD02OjLIAD02OjLIAD02OjPIAFA2OjQzWgIAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5OjvW1obM', 'base64'), grows = many(60, function (i) { return { id: i, at: new Date(Date.UTC(2025, 0, 31, 23, 59, 50) + i * 7000).toISOString().slice(0, 19) + 'Z' }; });
  same(grows, J.unpack(new Uint8Array(gold), opt()), 'a file made by 1.1.0');
  var cut = J.pack(sorted, opt({ check: false })); for (var q = 0; q < cut.length; q += 7) throwsJ(function () { J.unpack(cut.subarray(0, q), opt()); }, 'cut at ' + q);
  if (!JS_ONLY) { var wp = J.pack(sorted, {}), jp = J.pack(sorted, { wasm: false }); assert.deepStrictEqual(Buffer.from(wp), Buffer.from(jp), 'same bytes with and without WebAssembly'); }
});
var ADAPT = J.picker;
t('number picker: every kind of number column comes back bit for bit', function () {
  var r = D.rng(31), g = function () { var a = 0, i; for (i = 0; i < 12; i++) a += r(); return a - 6; }, E = Number.EPSILON, shapes = {
    constant: function (n) { return many(n, function () { return 42; }); }, ids: function (n) { return many(n, function (i) { return i; }); },
    steps: function (n) { var t = 1e9; return many(n, function () { return (t += 1 + Math.floor(r() * 3)); }); }, runs: function (n) { return many(n, function (i) { return Math.floor(i / 50) % 7; }); },
    dictionary: function (n) { return many(n, function () { return [3, 17, 99, 1000][Math.floor(r() * 4)]; }); }, outliers: function (n) { return many(n, function () { return r() < 0.03 ? Math.floor(1e9 * r()) : Math.floor(r() * 100); }); },
    factor: function (n) { return many(n, function () { return 5 * Math.floor(r() * 1000) + 7; }); }, price: function (n) { var p = 100; return many(n, function () { p = Math.max(1, p + g() * 0.4); return Math.round(p * 100) / 100; }); },
    noisy: function (n) { return many(n, function () { return 34 + r() * 3; }); },
    nearMiss: function (n) { return many(n, function (i) { var d = Math.round((10 + g()) * 1000) / 1000; return i % 3 ? d : d * (1 + E * Math.floor(r() * 5)); }); },
    special: function (n) { return many(n, function (i) { return [NaN, Infinity, -Infinity, -0, 0, 5e-324, 1e300, -1e300, Number.MAX_VALUE, 1.5, 0.1][i % 11]; }); },
    huge: function (n) { return many(n, function () { return (r() - 0.5) * Math.pow(2, 60); }); }, big: function (n) { return many(n, function () { return Math.floor((r() - 0.5) * Math.pow(2, 50)); }); }
  }, names = Object.keys(shapes), sizes = [1, 2, 64, 300, 8192, 8193, 17000], q, z, a, back, bytes, i, opts = [{}, { sample: false }, { noEntropy: true }], o;
  for (q = 0; q < names.length; q++) for (z = 0; z < sizes.length; z++) {
    if (sizes[z] === 17000 && q % 4) continue; a = Float64Array.from(shapes[names[q]](sizes[z])); o = opts[(q + z) % 3];
    bytes = ADAPT.pack(a, o); back = ADAPT.unpack(bytes, a.length);
    for (i = 0; i < a.length; i++) if (!Object.is(a[i], back[i]) && !(a[i] !== a[i] && back[i] !== back[i])) throw new Error(names[q] + ' ' + sizes[z] + ' value ' + i + ': ' + a[i] + ' came back ' + back[i]);
  }
  var lab = []; ADAPT.pack(Float64Array.from(shapes.nearMiss(9000)), { labels: lab }); assert(lab.length === 2 && /^ALP/.test(lab[0]), 'decimals with float noise use the decimal way: ' + lab);
  var nm = Float64Array.from(shapes.nearMiss(20000)); assert(ADAPT.pack(nm).length < nm.length * 8 * 0.45, 'near misses cost less than half of plain doubles');
  assert.strictEqual(ADAPT.available(), true);
  throwsJ(function () { ADAPT.unpack(ADAPT.pack(Float64Array.from([1, 2, 3])), 4); }, 'a wrong count');
});
t('number picker: balanced and small modes, format 5, off switch, view, damaged files', function () {
  var r = D.rng(41), rows = many(6000, function (i) { var d = Math.round((37 + (r() - 0.5)) * 1e4) / 1e4; return { id: i, lat: i % 2 ? d : d * (1 + Number.EPSILON * Math.floor(r() * 6)), price: Math.round(r() * 1e4) / 100, t: 1.7e9 + i * 2 + Math.floor(r() * 3), n: 'n' + i }; });
  var plain = J.pack(rows, opt()), ap = J.pack(rows, opt({ mode: 'balanced' })), small = J.pack(rows, opt({ mode: 'small' })), rep = [];
  assert.strictEqual(plain[2] < 5, true, 'the default mode never writes format 5'); assert.strictEqual(ap[2], 5, 'a file that used the picker says format 5'); assert(ap.length < plain.length * 0.7, 'at least 30% smaller: ' + ap.length + ' against ' + plain.length);
  same(rows, J.unpack(ap, opt()), 'round trip'); same(rows, J.unpack(small, opt()), 'small mode round trip'); assert(small.length <= J.pack(rows, opt({ mode: 'small', picker: false })).length, 'small mode is no bigger than without the picker');
  J.pack(rows, opt({ mode: 'balanced', report: rep })); assert(rep.some(function (x) { return x.part === 'picker'; }), 'the report names the picker');
  assert.deepStrictEqual(Buffer.from(J.pack(rows, opt({ mode: 'balanced', picker: false }))), Buffer.from(plain), 'picker: false writes the plain file');
  assert.deepStrictEqual(Buffer.from(J.pack(rows, opt({ picker: true })).subarray(0, 3)), Buffer.from(ap.subarray(0, 3)), 'picker: true asks for it in the default mode');
  var few = rows.slice(0, 1000); assert.deepStrictEqual(Buffer.from(J.pack(few, opt({ mode: 'balanced' }))), Buffer.from(J.pack(few, opt())), 'under 1,024 rows it is not tried');
  var v = J.view(ap, opt()); same(rows[77], v.get(77), 'view get'); assert.strictEqual(v.field(5000, 'lat'), rows[5000].lat);
  var cut = J.pack(rows.slice(0, 1500), opt({ mode: 'balanced' })), q, i2, copy;
  for (q = 0; q < cut.length; q += 97) throwsJ(function () { J.unpack(cut.subarray(0, q), opt()); }, 'cut at ' + q);
  for (i2 = 0; i2 < cut.length; i2 += 29) { copy = Uint8Array.from(cut); copy[i2] ^= 0x5A; try { J.unpack(copy, opt()); } catch (e) { assert(/MemoryCompression|Invalid|RangeError|data is cut/.test(String(e)), 'a clean error: ' + e); } }
});
t('number picker: damaged blocks give clean errors and finish quickly', function () {
  var r = D.rng(51), a = Float64Array.from(many(3000, function (i) { return i % 2 ? Math.round(r() * 1e5) / 100 : r(); })), b = ADAPT.pack(a), k, x, t0 = Date.now(), clean = 0;
  for (k = 0; k < 300; k++) {
    x = Uint8Array.from(b); x[Math.floor(r() * x.length)] ^= 1 << Math.floor(r() * 8);
    try { ADAPT.unpack(x, 3000); clean++; } catch (e) { assert(/^Error: MemoryCompressionJSO:/.test(String(e)), 'a clean error: ' + e); }
  }
  for (k = 0; k < b.length; k += 53) throwsJ(function () { ADAPT.unpack(b.subarray(0, k), 3000); }, 'cut at ' + k);
  assert(Date.now() - t0 < 5000, 'no hang');
});
t('number picker: a long column whose character changes block by block still comes back exactly', function () {
  var r = D.rng(99), a = [], i, k, rows;
  for (k = 0; k < 14; k++) for (i = 0; i < 8192; i++) a.push(k % 5 === 0 ? i + k * 8192 : k % 5 === 1 ? r() * 1000 : k % 5 === 2 ? Math.round(r() * 1e4) / 100 : k % 5 === 3 ? (i % 7) * 3 : (r() < 0.5 ? -0 : 5e-324 * i));
  rows = a.map(function (v, j) { return { v: v, j: j }; });
  [{ mode: 'balanced' }, { mode: 'small' }].forEach(function (o) { var p = J.pack(rows, opt(o)), u = J.unpack(p, opt()), q; for (q = 0; q < rows.length; q++) if (!Object.is(u[q].v, rows[q].v) || u[q].j !== q) throw new Error('block ' + (q >> 13) + ' row ' + q + ' differs in ' + o.mode); });
});
t('number picker: dictionary codes of text columns, profile()', function () {
  var cities = many(300, function (i) { return 'City number ' + i; }), rr = D.rng(5), rows = many(8000, function (i) { return { city: cities[(Math.floor(i / 25) * 7 + (rr() < 0.2 ? 1 : 0)) % 300], k: i }; }), plain = J.pack(rows, opt()), bal = J.pack(rows, opt({ mode: 'balanced' })), rep = [];
  same(rows, J.unpack(bal, opt()), 'round trip'); assert(bal.length < plain.length * 0.95, 'codes in runs shrink: ' + bal.length + ' against ' + plain.length);
  J.pack(rows, opt({ mode: 'balanced', report: rep })); assert(rep.some(function (x) { return x.part === 'picker (dictionary codes)'; }), 'the report names it');
  var cut = J.pack(rows.slice(0, 1500), opt({ mode: 'balanced' })), q, copy;
  for (q = 0; q < cut.length; q += 61) throwsJ(function () { J.unpack(cut.subarray(0, q), opt()); }, 'cut at ' + q);
  for (q = 0; q < cut.length; q += 23) { copy = Uint8Array.from(cut); copy[q] ^= 0x5A; try { J.unpack(copy, opt()); } catch (e) { assert(/MemoryCompression|Invalid|RangeError|data is cut/.test(String(e)), 'a clean error: ' + e); } }
  var p = J.profile(rows, opt({ mode: 'balanced' }), 1); assert(p.bytes === bal.length && p.packMs > 0 && p.unpackMs >= 0 && p.parts.length > 3 && p.format === 5, 'profile gives sizes, times and parts (a browser that rounds its clock to 1 ms can read a fast unpack as 0)');
});
t('keeper: holds data packed, restores on demand, lets go of the least recently used copies under a budget', function () {
  var r = D.rng(61), rows = many(4000, function (i) { return { id: i, from: Math.floor(r() * 977), w: Math.round(r() * 1000) / 100, name: 'link ' + i }; }), levels = [], K = J.keeper(opt({ budget: 250000, onPressure: function (l) { levels.push(l); } })), h, m, v, col, freed;
  assert.strictEqual(typeof J.keeper, 'function'); assert.strictEqual(J.core && typeof J.core.pack, 'function'); h = K.hold('layout', rows); assert(h.packed > 0 && h.heap > h.packed * 3, 'packed is much smaller than the live objects: ' + h.packed + ' against ' + h.heap);
  m = K.memory(); assert.strictEqual(m.restored, 0, 'nothing restored after hold'); assert.strictEqual(m.items.layout.rows, 4000); assert.strictEqual(K.level(), 0);
  col = K.column('layout', 'from'); assert(col.length === 4000 && col[7] === rows[7].from, 'one column without restoring the objects'); assert(K.memory().restored < h.heap / 3, 'only that column is counted');
  v = K.get('layout'); same(rows, v, 'get is exact'); assert.strictEqual(K.get('layout'), v, 'get keeps the restored copy'); assert(K.memory().restored >= h.heap * 0.9);
  assert.strictEqual(K.level(), 2, 'over budget when the restored copy is in memory'); assert(levels.indexOf(2) >= 0, 'onPressure was told');
  freed = K.trim(0); assert(freed > 0 && K.memory().restored === 0, 'trim lets go of the restored copy'); assert.strictEqual(K.level(), 0); assert.strictEqual(levels[levels.length - 1], 0);
  same(rows, K.get('layout'), 'restores again after a trim');
  K.hold('a', [1, 2, 3]); K.hold('b', { x: 'y' }); K.get('a'); K.get('b'); K.get('layout'); K.touch('a');
  K.release('b'); assert.strictEqual(K.memory().items.b.restored, 0); K.release(); assert.strictEqual(K.memory().restored, 0, 'release() with no name lets go of everything');
  assert.deepStrictEqual(K.names().sort(), ['a', 'b', 'layout']); K.drop('a'); assert.strictEqual(K.has('a'), false); throwsJ(function () { K.get('a'); }, 'a dropped name');
  var small = J.keeper(opt({ budget: 50000 })), s1 = many(3000, function (i) { return { a: i, b: 'x' + i }; }); small.hold('one', s1); small.hold('two', s1.map(function (o) { return { a: o.a + 1, b: o.b }; }));
  small.get('one'); small.get('two'); assert(small.memory().items.one.restored === 0, 'the least recently used copy was let go first: ' + JSON.stringify(small.memory().items));
  var hp = J.heap(); assert(hp && 'source' in hp); assert(J.estimateBytes([{ a: 1.5, s: 'abcd' }]) > 40);
});
t('keeper: shared objects (refs), pin, calibrate, restore estimates', function () {
  var shared = { tag: 'shared' }, rows = many(300, function (i) { return { id: i, s: shared, n: { k: i % 7 } }; }), K = J.keeper(opt({ refs: true, budget: 1e9 })), a, v, m;
  K.hold('layout', rows); a = K.get('layout'); assert(a[0].s === a[299].s, 'refs: true passes through hold: shared objects stay shared'); same(rows, a, 'refs round trip');
  K.release('layout'); K.hold('nr', rows, { refs: false }); assert(K.get('nr')[0].s !== K.get('nr')[1].s, 'a per-call option overrides the keeper option');
  K.release(); m = K.memory(); assert.strictEqual(m.items.layout.restoreMsMeasured, true, 'a restore was timed'); assert(m.items.layout.restoreMs >= 0 && m.items.nr.restoreMs >= 0);
  K.hold('fresh', rows); assert.strictEqual(K.memory().items.fresh.restoreMsMeasured, false, 'a new item has an estimate, marked as not measured');
  var f0 = K.hold('p', rows).heap; assert.strictEqual(K.calibrate(), 1); K.calibrate(2.5); assert.strictEqual(K.hold('p2', rows).heap, Math.round(f0 * 2.5), 'calibrate scales the live size'); throwsJ(function () { K.calibrate(0); }, 'calibrate(0)'); throwsJ(function () { K.calibrate('x'); }, 'calibrate(text)');
  K.get('p'); assert.strictEqual(K.memory().factor, 2.5); assert.strictEqual(K.memory().items.p.restored, Math.round(f0 * 2.5));
  var small = J.keeper(opt({ budget: 400000 })), big = many(3000, function (i) { return { a: i, b: 'x' + i }; });
  small.hold('scene', big); small.hold('layout', big); small.hold('third', big); small.pin('scene'); small.get('scene'); small.get('layout'); small.get('third');
  assert(small.memory().items.scene.restored > 0 && small.memory().items.layout.restored === 0, 'a pinned item is never the one let go of: ' + JSON.stringify(small.memory().items));
  assert.strictEqual(small.release('scene'), false, 'release() skips a pinned item'); small.release(); assert(small.memory().items.scene.restored > 0); assert.strictEqual(small.trim(0), 0, 'trim leaves pinned items'); assert.strictEqual(small.drop('scene'), false);
  assert.strictEqual(small.pin('scene'), 2); assert.strictEqual(small.unpin('scene'), 1); assert.strictEqual(small.release('scene'), false, 'pinned twice, unpinned once: still pinned'); small.unpin('scene'); assert.strictEqual(small.release('scene'), true); assert.strictEqual(small.memory().items.scene.restored, 0);
  small.pin('scene'); assert.strictEqual(small.release('scene', true), true, 'force lets go of a pinned item'); assert.strictEqual(small.drop('scene', true), true);
});
tAsync('keeper: restore() gives the same value as get(), once for many callers, in slices', function () {
  var rows = many(2000, function (i) { return { id: i, name: 'n' + i, w: i / 8 }; }), K = J.keeper(opt()), p1, p2;
  K.hold('layout', rows); p1 = K.restore('layout'); p2 = K.restore('layout'); assert.strictEqual(p1, p2, 'two callers share one restore');
  return p1.then(function (v) {
    same(rows, v, 'restored value'); assert.strictEqual(K.get('layout'), v, 'get() returns the restored copy'); assert.strictEqual(K.memory().items.layout.restoredBy === 'slices', true);
    return K.restore('layout');
  }).then(function (v2) { same(rows, v2, 'restore of a restored item'); K.hold('layout', rows.slice(0, 50)); K.release('layout'); return K.restore('layout'); }).then(function (v3) { assert.strictEqual(v3.length, 50, 'sees the newest held value'); K.hold('small', [1, 2, 3]); return K.restore('small').then(function (v4) { same([1, 2, 3], v4); assert.strictEqual(K.memory().items.small.restoredBy, 'page', 'not an array of objects: restored on the page, one step later'); }); }).then(function () { K.drop('layout'); return K.restore('layout').then(function () { throw new Error('should reject'); }, function (e) { assert(/nothing is held/.test(e.message)); }); });
});
tAsync('keeper: each() hands out rows a run at a time, never the whole list, and view().slice() reads a range', function () {
  var rows = many(5000, function (i) { return { id: i, name: 'n' + (i % 40), w: i / 8 }; }), K = J.keeper(opt()), seen = [], firsts = [], vw;
  var h = K.hold('L', rows); vw = K.view('L'); same(rows.slice(100, 130), vw.slice(100, 130), 'slice'); same(rows.slice(4990), vw.slice(4990, 9999), 'slice past the end'); assert.strictEqual(vw.slice(10, 5).length, 0, 'empty range');
  return K.each('L', function (part, first) { firsts.push(first); assert(part.length <= 700, 'a run at a time'); seen = seen.concat(part); }, { chunk: 700 }).then(function (count) {
    assert.strictEqual(count, 5000); same(rows, seen, 'every row once, in order'); assert.strictEqual(firsts[1], 700); assert(K.memory().items.L.restored < h.heap / 2, 'the objects were not kept: ' + K.memory().items.L.restored + ' against ' + h.heap);
    K.hold('plain', [1, 2, 3]); return K.each('plain', function () { }).then(function () { throw new Error('should reject'); }, function (e) { assert(/view\(\)|array of objects/.test(e.message), e.message); });
  });
});
t('front coding: sorted text shares its starts, exact back, off switch, damaged files refused', function () {
  var r = D.rng(77), words = many(6000, function () { var w = '', k = 3 + Math.floor(r() * 9), q; for (q = 0; q < k; q++) w += String.fromCharCode(97 + Math.floor(r() * (q < 2 ? 6 : 26))); return w; }).sort();
  var rows = words.map(function (w, i) { return { id: i, word: w }; });
  var p = rt(rows, null, 'sorted words'), off = J.pack(rows, opt({ front: false }));
  assert.strictEqual(p[2], 4, 'a file with a front-coded column says format 4'); assert(p.length < off.length * 0.8, 'at least 20% smaller than the joined text: ' + p.length + ' against ' + off.length);
  assert.strictEqual(off[2], 2, 'front: false keeps older readers working'); same(rows, J.unpack(off, opt()), 'off switch');
  same(rows, J.view(p, opt()).toArray(), 'view'); assert.strictEqual(J.view(p, opt()).field(4321, 'word'), words[4321]);
  var paths = many(3000, function (i) { return '/usr/share/doc/pkg' + ((i / 20) | 0) + '/files/' + String(i % 20) + '-é日.txt'; }).sort();
  same(paths, J.unpack(J.pack(paths, opt()), opt()), 'paths with accents');
  var emoji = many(500, function (i) { return '😀😀😀' + ['a', 'b', '😀'][i % 3] + i; }).sort(), pe = J.pack(emoji, opt()); same(emoji, J.unpack(pe, opt()), 'prefixes that end inside a surrogate pair');
  var odd = many(400, function (i) { return i === 200 ? 'lone \uD800 high' : 'prefix-shared-' + String(i).padStart(4, '0'); }); same(odd, J.unpack(J.pack(odd, opt()), opt()), 'a lone surrogate keeps the plain way');
  var rand = many(2000, function () { return Math.floor(r() * 1e9).toString(36) + 'x'; }); assert.deepStrictEqual(Buffer.from(J.pack(rand, opt())), Buffer.from(J.pack(rand, opt({ front: false }))), 'unsorted text does not use it');
  var same_ = many(300, function (i) { return i % 3 ? 'same text here ' + (i >> 4) : ''; }).sort(); same(same_, J.unpack(J.pack(same_, opt()), opt()), 'duplicates and empty strings');
  var cut = J.pack(rows.slice(0, 600), opt({ check: false })), q, i2, copy;
  for (q = 0; q < cut.length; q += 41) throwsJ(function () { J.unpack(cut.subarray(0, q), opt()); }, 'cut at ' + q);
  for (i2 = 0; i2 < cut.length; i2 += 17) { copy = Uint8Array.from(cut); copy[i2] ^= 0x5A; try { J.unpack(copy, opt()); } catch (e) { assert(/MemoryCompression|Invalid|RangeError|data is cut/.test(String(e)), 'a clean error: ' + e); } }
});
t('fsst: text columns stored as codes, each string readable alone', function () {
  var r = D.rng(11), first = ['Anna', 'Bruno', 'Chen', 'Dara', 'Elif', 'Farid', 'Gita', 'Hugo', 'Ines', 'Jun'], last = ['Okafor', 'Petrov', 'Quinn', 'Rossi', 'Silva', 'Tanaka', 'Ueda', 'Vargas'], city = ['Lagos', 'Oslo', 'Quito', 'Hanoi', 'Lima', 'Turin', 'Cork', 'Perth'];
  var pick = function (a) { return a[Math.floor(r() * a.length)]; };
  var label = function () { return pick(first) + ' ' + pick(last) + ', ' + pick(city) + ' ' + Math.floor(r() * 30); };
  [600, 5000].forEach(function (n) {
    var rows = many(n, function (i) { return { id: i, label: label(), tag: 'k' + (i % 3) }; });
    var p = J.pack(rows, opt({ fsst: true })), plain = J.pack(rows, opt());
    assert.strictEqual(p[2], 3, 'a file with an FSST column says format 3'); assert(p.length < plain.length, 'FSST is smaller on short varied text: ' + p.length + ' against ' + plain.length);
    same(rows, J.unpack(p, opt()), 'unpack ' + n); same(rows, J.unpack(p, opt({ wasm: false })), 'unpack without WebAssembly ' + n);
    var v = J.view(p, opt()); assert(v.lazy); assert.strictEqual(v.field(n - 1, 'label'), rows[n - 1].label); same(rows[7], v.get(7), 'view get');
    assert(v.memory().restored < JSON.stringify(rows).length, 'the restored columns are smaller than the strings');       // asked while the columns are still codes (a column read row after row is turned into its strings)
    same(rows, v.toArray(), 'view toArray'); same(rows.map(function (x) { return x.label; }), v.column('label'), 'view column'); v.release(); assert.strictEqual(v.loaded().length, 0);
    same(rows, J.unpack(J.pack(rows, opt({ fsst: true, mode: 'small' })), opt()), 'small mode');
    if (!JS_ONLY && J.accelerated()) assert.deepStrictEqual(Buffer.from(J.pack(rows, { fsst: true })), Buffer.from(J.pack(rows, { fsst: true, wasm: false })), 'same bytes with and without WebAssembly ' + n);
  });
  var odd = many(5000, function (i) { return i % 7 === 0 ? '' : i % 11 === 0 ? '😀 émoji ' + i + ' 日本語' : i % 13 === 0 ? 'x'.repeat(70000 % (i + 1) + 1) : label() + (i % 5 === 0 ? '\u0001\u007fÿĀ￿' : ''); });
  var po = J.pack(odd, opt({ fsst: true })); same(odd, J.unpack(po, opt()), 'empty strings, 4-byte characters, long strings, rare characters');
  var lone = many(5000, function (i) { return i === 2500 ? 'lone \uD800 high' : label(); }); same(lone, J.unpack(J.pack(lone, opt({ fsst: true })), opt()), 'a lone surrogate keeps the plain way');
  var rows2 = many(1000, function (i) { return { s: label(), n: i }; }), pk = J.pack(rows2, opt({ fsst: true })), none = J.pack(rows2, opt());
  assert.deepStrictEqual(Buffer.from(J.pack(rows2, opt({ fsst: false }))), Buffer.from(none), 'off by default'); same(rows2, J.unpack(pk, opt()));
  var nested = { a: many(800, function () { return { v: label() }; }), b: many(800, function (i) { return i % 3 ? label() : null; }), c: many(800, function () { return [label(), label()]; }) };
  same(nested, J.unpack(J.pack(nested, opt({ fsst: true })), opt()), 'inside nested structures');
  var cut = J.pack(many(1200, function (i) { return { id: i, label: label() }; }), opt({ fsst: true }));
  for (var q = 0; q < cut.length; q += 31) throwsJ(function () { J.unpack(cut.subarray(0, q), opt()); }, 'cut at ' + q);
  var flips = 0, bad = 0, i2, copy;
  for (i2 = 0; i2 < cut.length; i2 += 13) { copy = Uint8Array.from(cut); copy[i2] ^= 0x55; flips++; try { J.unpack(copy, opt()); } catch (e) { bad++; assert(/MemoryCompression|Invalid|RangeError|data is cut/.test(String(e)), 'a clean error: ' + e); } }
  assert(flips > 20);
});
t('refs: columns of records and of references, shared and circular', function () {
  var nodes = many(300, function (i) { return { id: i, label: 'n' + i, x: i * 0.5, on: i % 2 === 0 }; });
  var edges = many(500, function (i) { return { from: nodes[i % 300], to: nodes[(i * 7) % 300], w: i }; });
  var g = { nodes: nodes, edges: edges, first: nodes[0] };
  var p = J.pack(g, opt({ refs: true })), u = J.unpack(p, opt());
  same(g, u, 'graph'); assert.strictEqual(u.edges[10].from, u.nodes[10 % 300]); assert.strictEqual(u.edges[499].to, u.nodes[(499 * 7) % 300]); assert.strictEqual(u.first, u.nodes[0]);
  assert(p.length < JSON.stringify(g).length / 8, 'the graph with references should pack under an eighth of JSON, took ' + p.length + ' of ' + JSON.stringify(g).length);
  var plain = J.pack(g, opt()); assert(p.length < plain.length, 'references are smaller than copies');
  var items = many(60, function (i) { return { k: i, back: null }; }); items.forEach(function (o) { o.back = items; }); var w = J.unpack(J.pack(items, opt({ refs: true })), opt());
  assert.strictEqual(w[5].back, w); same(items.map(function (o) { return o.k; }), w.map(function (o) { return o.k; }));
  var dup = many(40, function (i) { return { a: i }; }); dup[30] = dup[3]; var d2 = J.unpack(J.pack(dup, opt({ refs: true })), opt()); same(dup, d2); assert.strictEqual(d2[30], d2[3]);
  var pre = { a: 1 }; var mixed = many(40, function (i) { return i === 20 ? pre : { a: i }; }); var holder = { pre: pre, mixed: mixed }; var h2 = J.unpack(J.pack(holder, opt({ refs: true })), opt()); same(holder, h2); assert.strictEqual(h2.mixed[20], h2.pre);
  var nest = many(40, function (i) { return { a: i, inner: { b: i } }; }); var n2 = J.unpack(J.pack({ x: nest, y: nest[3], z: nest[3].inner }, opt({ refs: true })), opt()); assert.strictEqual(n2.y, n2.x[3]); assert.strictEqual(n2.z, n2.x[3].inner); same(nest, n2.x);
  var nums = many(5000, function (i) { return i * 0.25; }); var holder2 = { list: nums, again: nums }; var h3 = J.unpack(J.pack(holder2, opt({ refs: true })), opt()); assert.strictEqual(h3.list, h3.again); same(nums, h3.list);
  var objs = many(40, function (i) { return { a: i }; }), dates = many(40, function (i) { return new Date(i); }); var mix = { objs: objs, dates: dates, both: [objs[1], dates[2], objs[1]] }; var m2 = J.unpack(J.pack(mix, opt({ refs: true })), opt()); same(mix, m2); assert.strictEqual(m2.both[0], m2.objs[1]); assert.strictEqual(m2.both[1], m2.dates[2]);
  var set = new Set(objs), map = new Map(objs.map(function (o, i) { return [o, i]; })); var sm = J.unpack(J.pack({ set: set, map: map, objs: objs }, opt({ refs: true })), opt()); assert.strictEqual(sm.set.size, 40); assert(sm.set.has(sm.objs[3])); assert.strictEqual(sm.map.get(sm.objs[9]), 9);
});
t('refs: damaged files are refused or read, never trusted', function () {
  var nodes = many(40, function (i) { return { id: i, s: 'a' + (i % 3) }; }), g = { nodes: nodes, edges: many(40, function (i) { return { from: nodes[i], to: nodes[(i + 1) % 40] }; }) };
  var p = J.pack(g, opt({ refs: true, mode: 'small' })), r = D.rng(5), k, q;
  for (k = 0; k < (FULL ? 3000 : 500); k++) { q = Uint8Array.from(p); q[Math.floor(r() * q.length)] ^= 1 << Math.floor(r() * 8); try { J.unpack(q, opt({ maxItems: 1000000 })); } catch (e) { assert(/MemoryCompression|RangeError|SyntaxError|Invalid|invalid|out of range/.test(String(e.message || e) + e.constructor.name), 'flip threw ' + e); } }
  for (k = 0; k < p.length; k += 3) { try { J.unpack(p.subarray(0, k), opt()); assert.fail('a cut copy was accepted'); } catch (e) { assert(/MemoryCompression|RangeError/.test(String(e.message || e) + e.constructor.name), 'cut threw ' + e); } }
});
t('view(): nothing is restored until it is read; release() gives it back; format 1 files still open', function () {
  var rows = D.sets['nfm-nodes'](2000), p = J.pack(rows, opt()), v = J.view(p, opt());
  assert.strictEqual(v.lazy, true); assert.deepStrictEqual(v.loaded(), []); assert.strictEqual(v.memory().restored, 0); assert.strictEqual(v.memory().packed, p.length);
  assert.strictEqual(v.field(5, 'group'), rows[5].group); assert.deepStrictEqual(v.loaded(), ['group']); var m1 = v.memory().restored; assert(m1 > 0 && m1 < 100000, 'one column restored, ' + m1);
  assert.strictEqual(v.column('x')[7], rows[7].x); assert.deepStrictEqual(v.loaded(), ['x', 'group'].sort(function (a, b) { return rows[0] && Object.keys(rows[0]).indexOf(a) - Object.keys(rows[0]).indexOf(b); }));
  same(rows[100], v.get(100)); assert.strictEqual(v.loaded().length, v.keys.length); same(rows, v.toArray());
  v.release(); assert.deepStrictEqual(v.loaded(), []); same(rows[1999], v.get(1999)); assert.strictEqual(v.field(3, 'label'), rows[3].label);
  var nested = many(100, function (i) { return { id: i, pos: [i, i * 0.5], sub: { a: i, b: 'q' + (i % 3) }, tags: ['x', 'y' + i] }; }), vn = J.view(J.pack(nested, opt()), opt());
  assert.deepStrictEqual(vn.field(9, 'sub'), nested[9].sub); assert.deepStrictEqual(vn.field(9, 'pos'), nested[9].pos); same(nested, vn.toArray());
  var truncated = J.pack(rows, opt()).subarray(0, 300); throwsJ(function () { J.view(truncated, opt()).get(0); }, 'cut view');
  var old = Buffer.from('TUoBAG5uCQIAAARyb3dzCygLAQcAAmlkAARuYW1lAAF3AAN0YWcABGZsYWcAA3BvcwADc3ViAQEABigBARYBKADWAwICAgAGAwACAQMABgUKAgEBAAIBAQALAQIAAWEAAWIBAQAABgFxAAAEdGV4dAYCdjEAAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJwAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAbwBTUMBAQAA1gOAgEABrgGwdXNlcjBAeC5vcmcLABYxCwAWMgsAFjMLABY0CwAWNQsAFjYLABY3CwAWOAsAFjkLABgxbwAHcAAXMXEAFzFyABcxcwAXMXQAFzF1ABcxdgAXMXcAFzF4ABcyeAAXMngAFzJ4ABcyeAAXMngAFzJ4ABcyeAAXMngAFzJ4ABcyeAAXM3gAFzN4ABczeAAXM3gAFzN4ABczeAAXM3gAFzN4ABczeACAMzlAeC5vcmcAAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJwIAABkAMgBLAGQAfQCWAK8AyADhAPoAEwEsAUUBXgF3AZABqQHCAdsB9AENAiYCPwJYAnECigKjArwC1QLuAgcDIAM5A1IDawOEA50DtgPPAwBrMGsxazIAAAECAAECAAECAAECAAECAAECAAECAAECAAECAAECAAECAAECAAECAAAREREREQAAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnAAAFCg8UGR4jKC0yNzxBRktQVVpfZGluc3h9goeMkZaboKWqr7S5vsMAAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJw==', 'base64'), ov = { rows: many(40, function (i) { return { id: i, name: 'user' + i + '@x.org', w: i * 0.25, tag: 'k' + (i % 3), flag: i % 4 === 0, pos: [i, i * 0.5], sub: { a: i, b: 'q' } }; }), text: 'v1' };
  same(ov, J.unpack(new Uint8Array(old), opt()), 'a file made by format 1');
  var oldRows = J.pack(ov.rows, opt()); same(ov.rows, J.view(oldRows, opt()).toArray());
});
t('check: true detects a flipped byte', function () {
  var p = J.pack(D.sets['api-users'](500), opt({ check: true })); same(D.sets['api-users'](500), J.unpack(p, opt()));
  var q = Uint8Array.from(p); q[Math.floor(q.length / 2)] ^= 1; throwsJ(function () { J.unpack(q, opt()); }, 'flipped byte');
});
t('input validation: wrong magic, newer format, empty, not bytes', function () {
  throwsJ(function () { J.unpack(new Uint8Array(0)); }, 'empty'); throwsJ(function () { J.unpack(new Uint8Array([1, 2, 3, 4, 5, 6, 7])); }, 'magic');
  var p = J.pack([1], opt()); var q = Uint8Array.from(p); q[2] = 99; throwsJ(function () { J.unpack(q); }, 'version'); throwsJ(function () { J.unpack('text'); }, 'string'); throwsJ(function () { J.unpack(null); }, 'null');
  assert.strictEqual(J.unpack(J.pack([1, 2], opt()).buffer.slice(0, J.pack([1, 2], opt()).length), opt()).length, 2);
});
t('hostile data: cut at every length, one byte flipped everywhere, bombs', function () {
  var sample = [D.sets['small'](40), D.sets['irregular'](60), many(30, function (i) { return { a: i, s: 'x' + (i % 3), d: [i, i * 0.5] }; }), { m: new Map([[1, { a: [1, 2, 3] }]]), t: new Float32Array(30), r: /x/g, b: 5n }];
  sample.forEach(function (v, si) {
    var p = J.pack(v, opt({ mode: 'small' })), i, bad = 0;
    for (i = 0; i < p.length; i += (FULL ? 1 : 3)) { try { J.unpack(p.subarray(0, i), opt({ maxItems: 100000 })); bad++; } catch (e) { assert(/MemoryCompression|RangeError/.test(String(e.message || e) + e.constructor.name), 'cut ' + i + ' threw ' + e); } }
    assert(bad === 0, 'a cut copy was accepted for sample ' + si + ' (' + bad + ')');
    var seed = 1 + si, r = D.rng(seed), k;
    for (k = 0; k < (FULL ? 3000 : 600); k++) {
      var q = Uint8Array.from(p); q[Math.floor(r() * q.length)] ^= 1 << Math.floor(r() * 8);
      try { J.unpack(q, opt({ maxItems: 1000000 })); } catch (e) { assert(/MemoryCompression|RangeError|SyntaxError|Invalid|invalid|out of range/.test(String(e.message || e) + e.constructor.name), 'flip threw ' + e); }
    }
  });
  var evil = J.pack(many(20, function () { return 1; }), opt()); // a constant column of 20; make it claim 2^40 items
  var bomb = Uint8Array.from([0x4D, 0x4A, 1, 0, 6, 6, T_COLS(), 0x80, 0x80, 0x80, 0x80, 0x80, 0x20, 0, 4, 2]);
  throwsJ(function () { J.unpack(bomb, opt()); }, 'item bomb');
  function T_COLS() { return 11; }
  throwsJ(function () { J.unpack(J.pack(many(100, function (i) { return i; }), opt()), opt({ maxItems: 10 })); }, 'maxItems');
});
t('fuzz: random values of every supported kind round-trip exactly', function () {
  var r = D.rng(2026), count = FULL ? 4000 : 400, seeds = 0;
  function num() { var k = Math.floor(r() * 12); return k === 0 ? 0 : k === 1 ? -0 : k === 2 ? NaN : k === 3 ? Infinity : k === 4 ? Math.floor(r() * 100) : k === 5 ? -Math.floor(r() * 1e6) : k === 6 ? r() : k === 7 ? Math.round(r() * 1e4) / 100 : k === 8 ? Math.fround(r() * 100) : k === 9 ? r() * 1e12 : k === 10 ? 2 ** 40 + Math.floor(r() * 10) : (r() - 0.5) * 1e-300; }
  function str() { var k = Math.floor(r() * 7); return k === 0 ? '' : k === 1 ? 'k' + Math.floor(r() * 5) : k === 2 ? 'long text ' + Math.floor(r() * 1e6) : k === 3 ? '日本語' + Math.floor(r() * 9) : k === 4 ? 'z😀' : k === 5 ? '\uD800x' : 'plain'; }
  function val(d) {
    var k = Math.floor(r() * (d > 3 ? 8 : 16));
    switch (k) {
      case 0: return num(); case 1: return str(); case 2: return r() < 0.5; case 3: return null; case 4: return undefined; case 5: return num(); case 6: return str(); case 7: return 12345678901234567890n * BigInt(Math.floor(r() * 5));
      case 8: case 9: { var a = [], m = Math.floor(r() * 30), same_ = r() < 0.5, gen = [num, str, function () { return r() < 0.5; }][Math.floor(r() * 3)]; while (m--) a.push(same_ ? gen() : val(d + 1)); return a; }
      case 10: case 11: { var rows = [], n = 16 + Math.floor(r() * 30), keys = ['a', 'b', 'c', 'd', 'e'].slice(0, 1 + Math.floor(r() * 5)), shapes = 1 + Math.floor(r() * 3), q, o, kk; for (q = 0; q < n; q++) { o = {}; for (kk = 0; kk < keys.length; kk++) if (kk === 0 || r() < 0.9 || shapes === 1) o[(shapes > 1 && q % shapes === 1) ? keys[keys.length - 1 - kk] : keys[kk]] = r() < 0.1 ? val(d + 1) : (kk % 3 === 0 ? num() : kk % 3 === 1 ? str() : r() < 0.5); rows.push(o); } return rows; }
      case 12: return new Date(Math.floor(r() * 2e12));
      case 13: return new Map(many(Math.floor(r() * 20), function () { return [str(), val(d + 1)]; }));
      case 14: return new Float32Array(many(Math.floor(r() * 40), function () { return Math.fround(r() * 10); }));
      default: { var ob = {}, c = Math.floor(r() * 6); while (c--) ob['k' + Math.floor(r() * 9)] = val(d + 1); return ob; }
    }
  }
  var i, v, p;
  for (i = 0; i < count; i++) {
    v = val(0);
    try { p = J.pack(v, opt({ mode: i % 2 ? 'small' : 'fast' })); same(v, J.unpack(p, opt()), 'fuzz ' + i); } catch (e) { throw new Error('fuzz case ' + i + ': ' + (e.message || e)); }
    seeds++;
  }
  assert.strictEqual(seeds, count);
});

t('2.0.2: memory() counts text only where a text column has rows with the key missing (it used to throw)', function () {
  var rows = many(3000, function (i) { return { id: i, w: i % 7, kind: i % 2 ? undefined : 'a' + (i % 5) }; }), K = J.keeper(opt());
  K.hold('x', rows); same(rows[0], K.view('x').get(0)); var got = K.get('x'); assert.strictEqual(got.length, 3000); same(rows, got);
  var m = K.view('x').memory(); assert(m.restored > 0, 'restored ' + m.restored); assert(K.memory().total > 0);
  var v = J.view(J.pack(rows, opt()), opt()); v.column('kind'); assert(v.memory().restored >= 3000 * 8, 'a missing key counts as a slot, no text');
});
t('2.4.4: text columns of a view stay whole and are cut per row (plain text, wide text, patterns); the memory report counts them', function () {
  var W = ['harbor', 'ridge', 'copper', 'lantern', 'meadow', 'signal'], rows = many(5000, function (i) {
    return { id: i, label: W[i % 6] + ' ' + W[(i * 7) % 6] + ' number ' + (i * 31 % 977), tag: 'item-' + i + '-x', wide: i % 9 === 0 ? 'caf\u00e9 \u2603 ' + i : 'plain ' + i + ' text that is long', empty: i % 5 ? 'abcdefghijklmnop' + i : '', w: [W[i % 6], W[(i + 1) % 6]] };
  }), v = J.view(J.pack(rows, opt()), opt()), i, mem, back;
  for (i = 0; i < 5000; i += 7) { same(rows[i], v.get(i), 'row ' + i); same(rows[i].label, v.field(i, 'label'), 'field ' + i); }
  ['label', 'tag', 'wide', 'empty', 'w'].forEach(function (k) { same(rows.map(function (r) { return r[k]; }), Array.prototype.slice.call(v.column(k)), 'column ' + k); });
  same(rows.slice(40, 90), v.slice(40, 90), 'slice'); same(rows, v.toArray(), 'toArray');
  mem = v.memory().restored; assert(mem > 5000 * 6, 'the report counts the text: ' + mem);
  v.release(); assert.strictEqual(v.memory().restored, 0); same(rows[4999], v.get(4999), 'after release');
  back = J.view(J.pack(rows, opt({ mode: 'balanced' })), opt()); same(rows, back.toArray(), 'balanced pages');
});
t('2.4.4: the memory report of a view counts a text column once (a string header and the text), nested columns in pieces (the pieces only, where code can be generated), the open view as 8 KB, and a repeated string once in estimateBytes', function () {
  var W = ['harbor', 'ridge', 'copper', 'lantern', 'meadow', 'signal'], rows = many(5000, function (i) {
    return { id: i, label: W[i % 6] + ' ' + W[(i * 7) % 6] + ' number ' + (i * 31 % 977), tag: 'item-' + i + '-x', w: [W[i % 6], W[(i + 1) % 6]] };
  }), b = J.pack(rows, opt()), m = {}, s = 'abcdefghijklmnopqrstu';
  ['label', 'tag', 'w', 'id'].forEach(function (k) { var v = J.view(b, opt()); v.column(k); m[k] = v.memory().restored; });
  var evalOk = true; try { new Function('return 1')(); } catch (e) { evalOk = false; }                  // a pattern column is put together per row only where generated code is allowed
  assert(m.tag > 8192 + 5000 && (!evalOk || m.tag < 40000), 'pattern text column: ' + m.tag);         // 2.4.3 counted 93,890
  assert(m.label > 8192 + 5000 && (!evalOk || m.label < 100000), 'pattern text column with lookup tables: ' + m.label);   // 2.4.3 counted 159,434
  assert(m.w > 8192 + 5000 * 2 && (!evalOk || m.w < 40000), 'nested column kept in pieces and counted as such: ' + m.w);   // 2.4.3 counted 40,000; 2.6.2 counted over 100,000 (made for every row); 2.6.4 about 18,700 (pieces, an array per read)
  assert(m.id >= 8192 + 5000 * 2, 'the open view counts 8 KB: ' + m.id);                             // 2.4.3 counted 10,000
  assert(J.estimateBytes([s + '1', s + '1', s + '1']) < J.estimateBytes([s + '1', s + '2', s + '3']), 'a repeated string is counted once');
  assert(J.estimateBytes([s + '1'], 32) > J.estimateBytes([s + '1']), 'a long string cut from a bigger text has a bigger header');
});
t('2.5.0: a text column read row after row is turned into its strings in one pass (same rows, the report follows, column() hands out a copy); a few reads leave it whole', function () {
  var W = ['harbor', 'ridge', 'copper', 'lantern', 'meadow', 'signal'], rows = many(5000, function (i) {
    return { id: i, tag: 'item-' + i + '-x', wide: i % 9 === 0 ? 'caf\u00e9 \u2603 ' + i : 'plain ' + i + ' text that is long', empty: i % 5 ? 'abcdefghijklmnop' + i : '', w: W[i % 6] };
  }), b = J.pack(rows, opt()), v = J.view(b, opt()), i, m0, m1, m2, c;
  for (i = 0; i < 40; i++) same(rows[i * 3], v.get(i * 3), 'few reads ' + i);
  m0 = v.memory().restored; for (i = 0; i < 40; i++) v.get(i); assert.strictEqual(v.memory().restored, m0, 'a few reads change nothing');
  for (i = 0; i < 5000; i++) { if (i % 499 === 0) same(rows[i], v.get(i), 'row ' + i); else v.get(i); }       // the column has been read more times than it has rows / 32
  m1 = v.memory().restored; assert(m1 > m0 + 5000 * 8, 'the strings are counted once they are made: ' + m0 + ' then ' + m1);
  for (i = 0; i < 5000; i += 3) { same(rows[i], v.get(i), 'row after ' + i); same(rows[i].wide, v.field(i, 'wide'), 'field after ' + i); }
  same(rows, v.toArray(), 'toArray after'); same(rows.slice(7, 90), v.slice(7, 90), 'slice after');
  c = v.column('wide'); same(rows.map(function (r) { return r.wide; }), Array.prototype.slice.call(c), 'column after'); c[0] = 'changed'; c.length = 0; same(rows[0].wide, v.field(0, 'wide'), 'the column handed out is a copy');
  m2 = v.memory().restored; assert.strictEqual(m2, m1, 'asking again gives the same number');
  v.release(); assert.strictEqual(v.memory().restored, 0); same(rows[4321], v.get(4321), 'after release'); assert(v.memory().restored > 0 && v.memory().restored < m0 + 1, 'a released view is whole again, not filled: ' + v.memory().restored);
  var big = many(20000, function (i) { return { id: i, wide: i % 9 === 0 ? 'caf\u00e9 \u2603 ' + i : 'plain ' + i + ' text that is long' }; }), bv = J.view(J.pack(big, opt()), opt()), bm;
  bv.get(5); bm = bv.memory().restored; for (i = 0; i < 20000; i += 1) if (i % 997 === 0) same(big[i], bv.get(i), 'long list row ' + i); else bv.get(i);
  assert.strictEqual(bv.memory().restored, bm, 'a column of more than 16,384 rows is not made in one pass (a read must not wait for it)');
  var w = J.view(b, opt()); w.field(9, 'wide'); for (i = 0; i < 4000; i++) w.field(i, 'wide'); same(rows[4000], w.get(4000), 'a field column read alone, then the row');
});
t('2.6.4: nested columns (records, arrays, tuples) and dates stay in pieces in a view and give back the same values', function () {
  var W = ['harbor', 'ridge', 'copper', 'lantern'], rows = many(5000, function (i) {
    var ms = Date.UTC(2025, 0, 1) + i * 937000 + (i % 13) * 86400000;
    return { id: i, style: { fill: 4281558732 + (i % 7), stroke: 4278190080, w: 1 + (i % 4) / 2 }, tags: i % 3 ? [W[i % 4], W[(i + 1) % 4]] : [], addr: { city: W[i % 4], zip: '' + (10000 + i * 7 % 89999), geo: [i / 7, -i / 3] },
      roles: i % 5 ? [W[i % 4]] : [W[0], W[1], W[2]], at: new Date(ms).toISOString(), day: new Date(ms).toISOString().slice(0, 10), t: new Date(ms).toISOString().slice(0, 19) + 'Z', pts: [i, i + 1, i % 9] };
  }), v = J.view(J.pack(rows, opt()), opt()), i, mem;
  for (i = 0; i < 5000; i += 3) same(rows[i], v.get(i), 'row ' + i);
  ['style', 'tags', 'addr', 'roles', 'at', 'day', 't', 'pts'].forEach(function (k) { same(rows.map(function (r) { return r[k]; }), Array.prototype.slice.call(v.column(k)), 'column ' + k); });
  same(rows.slice(100, 140), v.slice(100, 140), 'slice'); same(rows, v.toArray(), 'toArray');
  var evalOn = true; try { new Function('return 1')(); } catch (e) { evalOn = false; }             // without generated code the old eager build stays (the same object each read)
  if (evalOn) assert.notStrictEqual(v.get(7).style, v.get(7).style, 'each read makes its own object');
  mem = v.memory().restored; assert(mem > 0 && mem < J.estimateBytes(rows), 'the report counts pieces: ' + mem + ' vs ' + J.estimateBytes(rows));
  v.release(); same(rows[4321], v.get(4321), 'after release');
  same(rows, J.view(J.pack(rows, opt({ mode: 'balanced' })), opt()).toArray(), 'balanced pages');
});
t('nested eager row builders distinguish key lists containing their separator', function () {
  function nestedRows(keys) { return many(5000, function (i) { var inner = {}; inner[keys[0]] = i; inner[keys[1]] = i + 1; return { nested: inner }; }); }
  var keysA = ['eager\u0001left', 'tail'], keysB = ['eager', 'left\u0001tail'];
  var rowsA = nestedRows(keysA), rowsB = nestedRows(keysB), packedA = J.pack(rowsA, opt({ mode: 'fast' })), packedB = J.pack(rowsB, opt({ mode: 'fast' }));
  same(rowsA, J.unpack(packedA, opt()), 'first key list'); same(rowsB, J.unpack(packedB, opt()), 'colliding key list');
});
t('nested lazy row builders distinguish key lists containing their separator', function () {
  function nestedRows(keys) { return many(5000, function (i) { var inner = {}; inner[keys[0]] = i; inner[keys[1]] = i + 1; return { nested: inner }; }); }
  var keysA = ['view\u0001left', 'tail'], keysB = ['view', 'left\u0001tail'];
  var rowsA = nestedRows(keysA), rowsB = nestedRows(keysB), packedA = J.pack(rowsA, opt({ mode: 'fast' })), packedB = J.pack(rowsB, opt({ mode: 'fast' }));
  same(rowsA, J.view(packedA, opt()).toArray(), 'first key list'); same(rowsB, J.view(packedB, opt()).toArray(), 'colliding key list');
});
t('2.0.2: view() of fewer than 16 objects works with the same calls; non-objects are still refused', function () {
  var rows = [{ a: 1, b: 'x' }, { a: 2 }, { a: 3, b: 'z', c: [1, 2] }], v = J.view(J.pack(rows, opt()), opt());
  assert.strictEqual(v.length, 3); assert.deepStrictEqual(v.keys, ['a', 'b', 'c']); assert.strictEqual(v.lazy, false);
  same(rows[2], v.get(2)); assert.strictEqual(v.get(3), undefined); assert.strictEqual(v.get(-1), undefined); assert.strictEqual(v.field(0, 'b'), 'x'); assert.strictEqual(v.field(1, 'b'), undefined);
  assert.strictEqual(v.field(0, 'constructor'), undefined); assert.strictEqual(v.field(0, '__proto__'), undefined); assert.strictEqual(v.column('nope'), undefined);
  assert.deepStrictEqual(v.column('a'), [1, 2, 3]); same(rows.slice(1, 3), v.slice(1, 3)); assert.strictEqual(v.slice(2, 1).length, 0); same(rows, v.toArray());
  assert.deepStrictEqual(v.loaded(), ['a', 'b', 'c']); v.release(); same(rows, v.toArray()); assert(v.memory().restored > 0 && v.memory().packed > 0);
  assert.strictEqual(J.view(J.pack([], opt()), opt()).length, 0);
  throwsJ(function () { J.view(J.pack([1, 2, 3], opt()), opt()); }, 'numbers'); throwsJ(function () { J.view(J.pack([{ a: 1 }, [2]], opt()), opt()); }, 'an array in the list');
  throwsJ(function () { J.view(J.pack({ a: 1 }, opt()), opt()); }, 'one object'); throwsJ(function () { J.view(J.pack([{ a: 1 }, null], opt()), opt()); }, 'null in the list');
  var K = J.keeper(opt()); K.hold('s', rows); same(rows[1], K.view('s').get(1)); same(rows.map(function (r) { return r.a; }), K.column('s', 'a')); K.release('s'); same(rows, K.get('s'));
  });
t('2.0.2: the eval probe is skipped (no blocked-eval error) with the global switch or a <meta> policy without unsafe-eval; otherwise it runs', function () {
  if (typeof require.resolve !== 'function') { console.log('  (skipped here: it reloads the module through the module cache of Node)'); return; }
  var modFile = require.resolve(path.resolve(modPath)), realF = global.Function, probes = 0, saved = { doc: global.document, flag: global.MEMORY_COMPRESSION_NO_EVAL };
  function load(doc, flag) {
    var m; delete require.cache[modFile]; global.document = doc; global.MEMORY_COMPRESSION_NO_EVAL = flag; probes = 0;
    global.Function = function () { if (arguments.length === 1 && arguments[0] === 'return 1') probes++; return realF.apply(this, arguments); }; global.Function.prototype = realF.prototype;
    try { m = require(modFile); } finally { global.Function = realF; if (saved.doc === undefined) delete global.document; else global.document = saved.doc; if (saved.flag === undefined) delete global.MEMORY_COMPRESSION_NO_EVAL; else global.MEMORY_COMPRESSION_NO_EVAL = saved.flag; }
    return m.jso;
  }
  function meta(content, equiv) { return { querySelectorAll: function () { return [{ getAttribute: function (k) { return k === 'http-equiv' ? (equiv || 'Content-Security-Policy') : content; } }]; } }; }
  var rows = D.sets['nfm-links'](400);
  try {
    var a = load(undefined, undefined); assert.strictEqual(probes, 1, 'no switch, no policy: the probe runs');
    var b = load(undefined, true); assert.strictEqual(probes, 0, 'global switch'); same(rows, b.unpack(b.pack(rows, opt()), opt()), 'plain loops give the same rows');
    assert.deepStrictEqual(Array.from(a.pack(rows, opt())), Array.from(b.pack(rows, opt())), 'same bytes with and without generated loops');
    load(meta("default-src 'none'; script-src 'self' 'wasm-unsafe-eval'"), undefined); assert.strictEqual(probes, 0, 'script-src without unsafe-eval');
    load(meta("default-src 'self' 'wasm-unsafe-eval'"), undefined); assert.strictEqual(probes, 0, 'default-src without unsafe-eval');
    load(meta("script-src 'self' 'unsafe-eval'"), undefined); assert.strictEqual(probes, 1, 'unsafe-eval allowed: the probe runs');
    load(meta("img-src *"), undefined); assert.strictEqual(probes, 1, 'a policy that says nothing about scripts: the probe runs');
    load(meta("script-src 'self'", 'refresh'), undefined); assert.strictEqual(probes, 1, 'another http-equiv is not a policy');
    load({ querySelectorAll: function () { throw new Error('no access'); } }, undefined); assert.strictEqual(probes, 1, 'a page that cannot be read: the probe runs');
  } finally { delete require.cache[modFile]; require(modFile); }
});

t('pager: opens only the page a row is in, gives back every row exactly, lets pages go in turn', function () {
  var r = D.rng(71), rows = many(5000, function (i) { return { id: i, a: r() < 0.5 ? null : Math.round(r() * 1000) / 10, name: 'row ' + i, tags: ['t' + (i % 7)] }; }), P = J.pager(rows, opt({ pageRows: 512, livePages: 2, readAhead: false })), i, m;
  assert.strictEqual(P.length, 5000); assert.strictEqual(P.memory().open, 0, 'nothing is open before the first read');
  [0, 511, 512, 4999, 2500, 3, 4096, 4999].forEach(function (k) { same(rows[k], P.get(k), 'row ' + k); });
  m = P.memory(); assert(m.open <= 2, 'at most 2 pages open: ' + m.open); assert(m.pageOuts > 0 && m.pageIns > m.open, 'pages came and went');
  for (i = 0; i < 5000; i += 7) same(rows[i], P.get(i), 'sweep ' + i);
  assert.strictEqual(P.get(-1), undefined); assert.strictEqual(P.get(5000), undefined);
  same(rows.slice(500, 1600), P.range(500, 1600), 'range over three pages'); same(rows, P.range(0), 'range of everything'); same([], P.range(10, 10), 'empty range');
  assert(m.packed > 0 && m.packed < JSON.stringify(rows).length / 3, 'packed pages are much smaller than the JSON text');
});
t('pager: edits survive a page leaving memory; push adds rows; release lets everything go', function () {
  var rows = many(3000, function (i) { return { id: i, v: i * 2, s: 'x' + (i % 11) }; }), P = J.pager(rows, opt({ pageRows: 256, livePages: 1, readAhead: false })), o, m;
  P.set(10, { id: 10, v: -1, s: 'set' }); o = P.get(1000); P.get(2000);     // page 0 left memory after set: the edit was packed first
  same({ id: 10, v: -1, s: 'set' }, P.get(10), 'set survives');
  o = P.get(300); o.v = 12345; P.changed(300); P.get(2999); P.get(0);
  assert.strictEqual(P.get(300).v, 12345, 'changed() keeps an edit made in place');
  assert.strictEqual(P.get(301).v, 602, 'the other rows of the page are untouched');
  assert.strictEqual(P.push({ id: 3000, v: 6000, s: 'p' }), 3001); assert.strictEqual(P.length, 3001); same({ id: 3000, v: 6000, s: 'p' }, P.get(3000), 'pushed row');
  for (var i = 0; i < 300; i++) P.push({ id: 3001 + i, v: i, s: 'q' });
  assert.strictEqual(P.length, 3301); same({ id: 3300, v: 299, s: 'q' }, P.get(3300), 'a second new page'); same(rows[1500], P.get(1500), 'old rows still there');
  P.release(); m = P.memory(); assert.strictEqual(m.open, 0); assert.strictEqual(m.dirty, 0, 'release packed the edited pages');
  same({ id: 10, v: -1, s: 'set' }, P.get(10), 'still there after release'); same({ id: 3300, v: 299, s: 'q' }, P.get(3300), 'pushed rows still there after release');
});
t('pager: pressure steps the open pages down, small and odd lists work', function () {
  var rows = many(2000, function (i) { return { id: i, k: 'a' + (i % 5) }; }), P = J.pager(rows, opt({ pageRows: 100, livePages: 8, readAhead: false })), lv = [], Q, E, S;
  for (var i = 0; i < 2000; i += 100) P.get(i);
  assert.strictEqual(P.memory().open, 8); P.pressure(1); assert.strictEqual(P.memory().open, 4, 'level 1 keeps half'); P.pressure(2); assert.strictEqual(P.memory().open, 0, 'level 2 keeps none');
  same(rows[1234], P.get(1234), 'a closed list still reads'); P.pressure(0); for (i = 0; i < 2000; i += 100) P.get(i); assert.strictEqual(P.memory().open, 8, 'back to normal');
  Q = J.pager([], opt({})); assert.strictEqual(Q.length, 0); assert.strictEqual(Q.get(0), undefined); Q.push({ a: 1 }); same({ a: 1 }, Q.get(0), 'push into an empty pager');
  E = J.pager(many(7, function (i) { return { i: i }; }), opt({ pageRows: 3 })); same({ i: 6 }, E.get(6), 'pages of 3 rows, 7 rows'); assert.strictEqual(E.memory().pages, 3);
  S = J.pager(many(50, function (i) { return i; }), opt({ pageRows: 1 })); assert.strictEqual(S.get(49), 49); assert.strictEqual(S.memory().pages, 50);
  throwsJ(function () { J.pager('nope'); }, 'not an array'); throwsJ(function () { P.set(99999, 1); }, 'set outside the list');
});
tAsync('pager: each() walks the pages with the page free in between and reads open pages as they are', function () {
  var rows = many(3000, function (i) { return { id: i, s: 'v' + (i % 13) }; }), P = J.pager(rows, opt({ pageRows: 200, livePages: 2, readAhead: false })), seen = [], firsts = [], before;
  P.set(5, { id: 5, s: 'edited' }); before = P.memory().open;
  return P.each(function (objs, first) { firsts.push(first); for (var i = 0; i < objs.length; i++) seen.push(objs[i]); }, { sliceMs: 1 }).then(function (n) {
    assert.strictEqual(n, 3000); assert.strictEqual(seen.length, 3000); assert.strictEqual(firsts.length, 15); assert.strictEqual(firsts[3], 600);
    assert.strictEqual(seen[5].s, 'edited', 'an open edited page is read as it is'); same(rows[2999], seen[2999], 'last row'); assert(P.memory().open <= before, 'each() does not leave pages open');
  });
});
tAsync('pager: reading rows in order opens the next page in the background', function () {
  var rows = many(1200, function (i) { return { id: i }; }), P = J.pager(rows, opt({ pageRows: 100, livePages: 4 }));
  P.get(0); P.get(150);
  return new Promise(function (res) { setTimeout(res, 20); }).then(function () { assert(P.memory().open >= 3, 'page 2 opened ahead: ' + P.memory().open); assert.strictEqual(P.get(250).id, 250); });
tAsync('pager: reading rows backward opens the previous page in the background', function () {
  var rows = many(1200, function (i) { return { id: i }; }), P = J.pager(rows, opt({ pageRows: 100, livePages: 4 }));
  P.get(950); P.get(850);
  return new Promise(function (res) { setTimeout(res, 20); }).then(function () { assert(P.memory().open >= 3, 'page 7 opened ahead: ' + P.memory().open); assert.strictEqual(P.get(750).id, 750); });
});
});

tAsync('pager: background: true reads at once, packs the pages in slices, then settle() packs later edits', function () {
  var rows = many(6000, function (i) { return { id: i, s: 'v' + (i % 17), n: i * 3 }; }), P = J.pager(rows, opt({ pageRows: 512, livePages: 2, background: true, sliceMs: 1 }));
  assert.strictEqual(P.memory().packed, 0, 'nothing is packed yet'); same(rows[4000], P.get(4000), 'readable before it is packed');
  return P.ready.then(function (Q) {
    var m = Q.memory(); assert(Q === P && m.dirty === 0 && m.packed > 0 && m.open <= 2, 'packed, clean and within the limit: ' + JSON.stringify(m));
    same(rows, Q.range(0), 'every row after the build'); Q.set(100, { id: 100, s: 'z', n: -1 }); assert.strictEqual(Q.memory().dirty, 1);
    return Q.settle(1);
  }).then(function (Q) { assert.strictEqual(Q.memory().dirty, 0, 'settle packed the edit'); Q.release(); same({ id: 100, s: 'z', n: -1 }, Q.get(100), 'edit kept'); });
});

tAsync('pager: spill moves closed pages to a store and getAsync() brings them back; an edit after that is kept', function () {
  var rows = many(4000, function (i) { return { id: i, s: 'w' + (i % 9), n: i * 5 }; }), mem = {}, writes = 0, store = {
    put: function (k, b) { writes++; return new Promise(function (res) { setTimeout(function () { mem[k] = b.slice(); res(); }, 0); }); },
    get: function (k) { return new Promise(function (res, rej) { setTimeout(function () { mem[k] ? res(mem[k].slice()) : rej(new Error('missing ' + k)); }, 0); }); },
    remove: function (k) { delete mem[k]; return Promise.resolve(); } }, P = J.pager(rows, opt({ pageRows: 500, livePages: 2, readAhead: false, spill: store })), before = P.memory().packed;
  P.get(10); P.get(700);
  return P.spill({ all: true }).then(function () {
    var m = P.memory(); assert.strictEqual(m.open, 0); assert.strictEqual(m.spilled, 8, 'all 8 pages are on disk'); assert.strictEqual(m.packed, 0, 'no packed bytes left in memory'); assert.strictEqual(writes, 8);
    throwsJ(function () { P.get(10); }, 'reading a spilled page without loading it');
    return P.getAsync(3999);
  }).then(function (o) {
    same(rows[3999], o, 'row from a spilled page'); P.set(3999, { id: 3999, s: 'edited', n: 0 }); return P.spill({ all: true });
  }).then(function () { assert.strictEqual(writes, 9, 'only the edited page was written again: ' + writes); return P.getAsync(3999); })
    .then(function (o) { same({ id: 3999, s: 'edited', n: 0 }, o, 'edit kept through the store'); return P.getAsync(250); })
    .then(function (o) { same(rows[250], o, 'an untouched page'); var seen = 0; return P.each(function (objs) { seen += objs.length; }).then(function () { assert.strictEqual(seen, 4000, 'each() reads spilled pages'); }); })
    .then(function () { return P.dispose(); }).then(function () { assert.strictEqual(Object.keys(mem).length, 0, 'dispose empties the store'); });
});
tAsync('pager: pressure level 2 spills by itself, read-ahead fetches the next spilled page', function () {
  var rows = many(3000, function (i) { return { id: i, k: 'a' + (i % 4) }; }), mem = {}, store = {
    put: function (k, b) { mem[k] = b.slice(); return Promise.resolve(); }, get: function (k) { return Promise.resolve(mem[k].slice()); }, remove: function (k) { delete mem[k]; return Promise.resolve(); } },
    P = J.pager(rows, opt({ pageRows: 300, livePages: 3, spill: store }));
  P.get(5); P.get(305); P.pressure(2);
  return new Promise(function (res) { setTimeout(res, 20); }).then(function () {
    assert.strictEqual(P.memory().spilled, 10, 'level 2 spilled every page'); P.pressure(0); return P.getAsync(0);
  }).then(function () { return P.getAsync(300); }).then(function () { P.get(0); P.get(300); P.get(0); return new Promise(function (res) { setTimeout(res, 20); }); })
    .then(function () { assert(P.memory().open >= 3, 'the next spilled page was fetched ahead: ' + P.memory().open); same(rows[650], P.get(650), 'read-ahead page is readable'); });
});

t('pager.plan: page size and open pages follow the row size and the device memory; "auto" options give back every row', function () {
  var rows = many(20000, function (i) { return { id: i, label: 'node ' + i, x: i / 3, tags: ['a', 'b'] }; }), big = J.pager.plan(rows, { deviceMemory: 8 }), small = J.pager.plan(rows, { deviceMemory: 1 }), thin = J.pager.plan(many(60000, function (i) { return { a: i, b: i % 9 }; }), { deviceMemory: 8 }), P, i;
  assert(small.pageRows < big.pageRows && small.pageRows >= 512 && big.pageRows <= 2048, 'smaller pages on a small device: ' + small.pageRows + ' / ' + big.pageRows);
  assert(thin.pageRows >= big.pageRows, 'thin rows never make shorter pages: ' + thin.pageRows);
  assert(big.livePages >= 2 && big.livePages <= 8 && small.livePages >= 2, 'live pages in range');
  assert.strictEqual(big.mode, 'fast'); assert.strictEqual(J.pager.plan(rows, { deviceMemory: 1, heapBytes: 1e6 }).mode, 'balanced');
  assert.strictEqual(J.pager.plan(many(10, function (i) { return { i: i }; }), { deviceMemory: 4 }).pageRows, 10, 'a short list is one page');
  P = J.pager(rows, opt({ pageRows: 'auto', livePages: 'auto', deviceMemory: 2 })); assert.strictEqual(P.memory().pageRows, J.pager.plan(rows, { deviceMemory: 2 }).pageRows);
  for (i = 0; i < rows.length; i += 997) same(rows[i], P.get(i), 'row ' + i);
});

t('pager: balanced pages remember which number ways won and still give back every row', function () {
  var r = D.rng(91), rows = many(9000, function (i) { return { id: i, t: 1700000000 + i * 37, v: Math.round(r() * 1000) / 10, k: i % 7 }; }), P = J.pager(rows, opt({ pageRows: 1000, livePages: 2, mode: 'balanced', readAhead: false })), i;
  assert(P.memory().packed > 0);
  for (i = 0; i < rows.length; i += 499) same(rows[i], P.get(i), 'row ' + i);
});

t('nested coordinate lists: arrays of pairs (decimal, whole-number and mixed), empty arrays and null entries come back exactly in every mode', function () {
  var rows = many(1200, function (i) { return { line: i % 9 ? [[i, i + 0.5], [i * 2, i * 3.25], [i, null]] : [], ints: [[i, i + 1], [i * 2, i * 3]], names: [['x', i], ['y', i]], deep: { p: [[1.5, 2], [3, 4.5]], q: i % 5 ? null : undefined } }; }), modes = ['fast', 'balanced', 'small'], m, out, i;
  for (m = 0; m < modes.length; m++) { out = J.unpack(J.pack(rows, opt({ mode: modes[m] }))); for (i = 0; i < rows.length; i += 37) same(rows[i], out[i], modes[m] + ' row ' + i); }
});

t('freeBuffers() lets go of the output buffer pack() keeps, and a pack after it gives the same bytes', function () {
  var a = new Float32Array(600000), i, x = 1, p1, p2; for (i = 0; i < a.length; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = (x >>> 8) / 256; }
  p1 = J.core.pack(a, opt({ mode: 'fast' })); assert(J.core.dropPackBuffer() > 0, 'a pack leaves a kept buffer'); J.core.pack(a, opt({ mode: 'fast' })); J.freeBuffers();
  assert.strictEqual(J.core.dropPackBuffer(), 0, 'freeBuffers drops the kept output buffer');
  p2 = J.core.pack(a, opt({ mode: 'fast' })); assert.strictEqual(Buffer.compare(Buffer.from(p1), Buffer.from(p2)), 0, 'same bytes after the buffer was dropped');
});
tAsync('a big kept output buffer is let go by itself after a quiet spell (about 2 s)', function () {
  var a = new Float32Array(600000), i, x = 1; for (i = 0; i < a.length; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = (x >>> 8) / 256; }
  J.core.pack(a, opt({ mode: 'fast' }));
  return new Promise(function (res) { setTimeout(res, 2600); }).then(function () { assert.strictEqual(J.core.dropPackBuffer(), 0, 'still kept after the quiet spell'); });
});

t('idle release: the helpers give their memory back and a later pack makes the very same bytes', function () {
  var rows = many(30000, function (i) { return { id: i, label: 'node ' + i + ' harbor', x: i / 3.1, y: (i * 7) % 1000 / 10, tags: ['a', 'b' + (i % 5)] }; }), a = J.pack(rows, opt({ mode: 'balanced' })), b, c;
  J.freeBuffers(); assert.strictEqual(typeof require(path.resolve(modPath)).trimMemory, 'function'); require(path.resolve(modPath)).trimMemory();
  b = J.pack(rows, opt({ mode: 'balanced' })); c = J.pack(rows, opt({ mode: 'fast' }));
  assert.strictEqual(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0, 'same bytes after the memory was given back');
  same(rows[12345], J.unpack(b)[12345], 'round trip'); same(rows[29999], J.unpack(c)[29999], 'round trip, fast');
});

t('pager: pageView keeps open pages as columns, gives back every row, and edits turn a page into objects', function () {
  var r = D.rng(33), rows = many(6000, function (i) { return { id: i, name: 'row ' + i, v: Math.round(r() * 1000) / 10, tags: ['t' + (i % 7)] }; }), P = J.pager(rows, opt({ pageRows: 500, livePages: 2, pageView: true })), i, m;
  for (i = 0; i < rows.length; i += 211) same(rows[i], P.get(i), 'row ' + i);
  m = P.memory(); assert(m.open <= 2 && m.pageIns >= 12, 'pages open and close: ' + JSON.stringify(m));
  P.set(100, { id: -1, name: 'edited', v: 0, tags: [] }); same({ id: -1, name: 'edited', v: 0, tags: [] }, P.get(100), 'edited row'); same(rows[101], P.get(101), 'row next to the edit');
  for (i = 0; i < 6000; i += 500) P.get(i); same({ id: -1, name: 'edited', v: 0, tags: [] }, P.get(100), 'edit survives the page leaving memory');
  assert.throws(function () { P.changed(5); }, /set\(i, value\)/);
  P.pressure(2); assert.strictEqual(P.memory().open, 0); same(rows[3000], P.get(3000), 'row after pressure');
  var odd = many(2000, function (i) { return i % 2 ? { a: i } : { b: i }; }), Q = J.pager(odd, opt({ pageRows: 300, pageView: true })), k;      // different keys in a page: shown as objects
  for (k = 0; k < odd.length; k += 97) same(odd[k], Q.get(k), 'odd row ' + k);
});

t('pager.plan: rows that are nearly all numbers are shown as column pages, text rows are not; pageView "auto" follows it', function () {
  var nums = many(5000, function (i) { return { a: i, b: i % 9, c: i / 7, d: true }; }), txt = many(5000, function (i) { return { id: i, name: 'row ' + i, tags: ['x'] }; }), P, i;
  assert.strictEqual(J.pager.plan(nums, { deviceMemory: 8 }).pageView, true); assert.strictEqual(J.pager.plan(txt, { deviceMemory: 8 }).pageView, false);
  P = J.pager(nums, opt({ pageRows: 'auto', pageView: 'auto', deviceMemory: 8 })); for (i = 0; i < nums.length; i += 311) same(nums[i], P.get(i), 'row ' + i);
});

tAsync('pager: cool() repacks closed pages smaller, rows stay exact, edits repack, the idle timer and spill cool by themselves', function () {
  var rows = many(9000, function (i) { return { id: i, from: (i * 7919) % 900, to: (i * 104729) % 913, w: ((i * 31) % 1000) / 10, t: 1700000000 + i * 37 + (i * i) % 29, k: i % 7 }; }), P = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false })), before = P.memory().packed, i, Q, store = {}, spillStore;
  return P.cool().then(function (res) {
    var m = P.memory();
    assert(m.packed < before && res.pages > 0 && m.cold > 0, 'smaller after cooling: ' + before + ' to ' + m.packed);
    for (i = 0; i < rows.length; i += 173) same(rows[i], P.get(i), 'row ' + i);
    P.set(10, { id: -5, from: 1, to: 2, w: 3, t: 4, k: 3 }); P.release(); same({ id: -5, from: 1, to: 2, w: 3, t: 4, k: 3 }, P.get(10), 'edit after cooling');
    Q = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false, cold: true, coldAfter: 30 }));
    return new Promise(function (res2) { setTimeout(res2, 250); });
  }).then(function () {
    assert(Q.memory().cold > 0, 'the idle timer cooled pages: ' + Q.memory().cold);
    for (i = 0; i < rows.length; i += 211) same(rows[i], Q.get(i), 'cooled row ' + i);
    Q.dispose();
    spillStore = { put: function (k, b) { store[k] = b; return Promise.resolve(); }, get: function (k) { return Promise.resolve(store[k]); }, remove: function (k) { delete store[k]; return Promise.resolve(); } };
    var S = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false, cold: true, coldAfter: 100000, spill: spillStore }));
    return S.spill({ all: true }).then(function () { assert(S.memory().cold > 0 && S.memory().spilled > 0, 'spill cooled first'); return S.getAsync(777); }).then(function (v) { same(rows[777], v, 'row back from storage'); S.dispose(); });
  });
});
tAsync('pager: cool() with a worker the page policy blocks (the error event comes right after creation) resolves with pages: 0 and is not tried again', function () {
  // closest honest fake of a browser whose policy refuses blob: workers: the constructor works and the error event follows in the next microtask (as in Chromium and WebKit); the real browser path is the policy page in results/ab-tiers-4b.js
  var rows = many(5000, function (i) { return { id: i, a: (i * 7919) % 900, b: i % 7 }; }), made = 0, realW = global.Worker, P, Q;
  global.Worker = function () { var self = this; made++; this.postMessage = function () {}; this.terminate = function () {}; Promise.resolve().then(function () { if (self.onerror) self.onerror({}); }); };
  function within(p, ms, what) { return Promise.race([p, new Promise(function (res, rej) { setTimeout(function () { rej(new Error(what + ' did not resolve in ' + ms + ' ms')); }, ms); })]); }
  P = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false }));
  return within(P.cool(), 1500, 'cool()').then(function (res) {
    assert(res.pages === 0 && res.worker === false, 'blocked worker: ' + JSON.stringify(res));
    return within(P.cool(), 500, 'second cool()');
  }).then(function (res2) {
    assert(res2.pages === 0 && made === 1, 'no second worker: made ' + made);
    for (var i = 0; i < rows.length; i += 331) same(rows[i], P.get(i), 'row ' + i);
    Q = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false, cold: true, coldAfter: 20 }));
    return new Promise(function (r) { setTimeout(r, 250); });
  }).then(function () { assert(made === 2, 'the idle timer stopped after one failure: made ' + made); Q.dispose(); }).then(function () { global.Worker = realW; }, function (e) { global.Worker = realW; throw e; });
});

tAsync('warm() resolves and leaves packing unchanged', function () {
  var v = many(3000, function (i) { return { id: i, v: i * 1.5, name: 'n' + (i % 13) }; }), before = J.pack(v, opt({ mode: 'balanced' }));
  return require(path.resolve(modPath)).warm(opt()).then(function () { assert.strictEqual(Buffer.compare(Buffer.from(before), Buffer.from(J.pack(v, opt({ mode: 'balanced' })))), 0, 'bytes changed after warm'); });
});
tAsync('warm() works in short tasks: it yields to the page at least 18 times (a pack and an open for each of 9 columns) and never packs the whole list in one block', function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : self, count = 0, undo, M = require(path.resolve(modPath));
  if (typeof g.setImmediate === 'function') { var si = g.setImmediate; g.setImmediate = function () { count++; return si.apply(this, arguments); }; undo = function () { g.setImmediate = si; }; }
  else { var pm = MessagePort.prototype.postMessage; MessagePort.prototype.postMessage = function () { count++; return pm.apply(this, arguments); }; undo = function () { MessagePort.prototype.postMessage = pm; }; }
  return M.warm(opt()).then(function (r) { undo(); assert.strictEqual(r, true, 'warm() resolves true'); assert(count >= 18, 'warm() yielded only ' + count + ' times'); }, function (e) { undo(); throw e; });
});
tAsync('packAsync gives the same bytes as pack in every mode (long record lists in slices, short lists, number columns, rows that do not fit, a worker-less pool)', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13), ok: i % 3 === 0, t: 1e12 + i * 977 }; }); };
  var odd = mk(5000); odd[3000] = { id: 1, x: 2 };
  var str = mk(5000); str[4000].v = 'x';
  var nul = mk(5000); nul[4500] = null;
  var cases = [mk(5000), mk(2047), mk(2048), mk(100), odd, str, nul, many(5000, function (i) { return Math.round(Math.sin(i / 50) * 1e5) / 100; }), Float64Array.from(many(5000, function (i) { return i * 3; }))];
  var modes = ['fast', 'balanced', 'small'], jobs = [];
  cases.forEach(function (v, ci) {
    modes.forEach(function (m) {
      jobs.push(J.packAsync(v, opt({ mode: m })).then(function (b) {
        var a = J.pack(v, opt({ mode: m }));
        assert.strictEqual(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0, 'case ' + ci + ' ' + m + ': packAsync bytes differ from pack');
        same(v, J.unpack(b, opt({ mode: m })), 'case ' + ci + ' ' + m);
      }));
    });
  });
  return Promise.all(jobs);
});

tAsync('packAsync: every test set at 100, 1,500, 4,000 and 9,000 rows (balanced and small) and top-level number columns give the same bytes as pack', function () {
  var work = [], keys = Object.keys(D.sets), col = many(5000, function (i) { return Math.round(Math.sin(i / 50) * 1e5) / 100; }), cnt = 0;
  keys.forEach(function (k) { [100, 1500, 4000, 9000].forEach(function (n) { ['balanced', 'small'].forEach(function (mode) { work.push([k, n, mode]); }); }); });
  [col, Float64Array.from(col), new Int32Array(5000).map(function (_, i) { return i * 3; })].forEach(function (x, xi) { ['fast', 'balanced', 'small'].forEach(function (mode) { work.push([x, xi, mode]); }); });
  return work.reduce(function (p, w) {
    return p.then(function () {
      var d, label = typeof w[0] === 'string' ? w[0] + ' ' + w[1] : 'column ' + w[1];
      try { d = typeof w[0] === 'string' ? D.sets[w[0]](w[1]) : w[0]; } catch (e) { return null; }
      return J.packAsync(d, opt({ mode: w[2] })).then(function (b) {
        var a = J.pack(d, opt({ mode: w[2] }));
        assert.strictEqual(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0, label + ' ' + w[2] + ': bytes differ (' + a.length + ' vs ' + b.length + ')');
        if (typeof w[0] === 'string') same(d, J.unpack(b, opt({ mode: w[2] })), label); cnt++;
      });
    });
  }, Promise.resolve()).then(function () { assert(cnt >= 60, 'cases run: ' + cnt); });
});

// A stand-in for browser workers that really runs the worker script (the file itself, loaded the way the blob: URL would) in this process, so the pool's splice path is checked end to end.
function fakeBrowser(kind) {          // kind: 'ok', 'blocked' (error event right after creation), 'throws' (new Worker throws), 'silent' (never answers, no error)
  var M = require(path.resolve(modPath)), real = { Worker: global.Worker, Blob: global.Blob, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }, st = { made: 0, jobs: 0, terminated: 0 };
  global.Blob = function (parts) { this.src = parts[0]; };
  URL.createObjectURL = function (b) { return b; }; URL.revokeObjectURL = function () {};
  global.Worker = function (blob) {
    var w = this, scope, run;
    st.made++;
    if (kind === 'throws') throw new Error('SecurityError: blob: workers are blocked');
    w.terminate = function () { st.terminated++; };
    if (kind === 'blocked') { w.postMessage = function () {}; Promise.resolve().then(function () { if (w.onerror) w.onerror({ preventDefault: function () {} }); }); return; }
    if (kind === 'silent') { w.postMessage = function () {}; return; }
    scope = { postMessage: function (m, tr) { setImmediate(function () { if (w.onmessage) w.onmessage({ data: m }); }); } };
    run = require('vm').runInThisContext('(function (self) {' + blob.src + ';return self;})')(scope);
    w.postMessage = function (m, tr) { var c = structuredClone(m, { transfer: tr }); st.jobs += c.jobs.length; setImmediate(function () { scope.onmessage({ data: c }); }); };
  };
  st.restore = function () { global.Worker = real.Worker; global.Blob = real.Blob; URL.createObjectURL = real.createObjectURL; URL.revokeObjectURL = real.revokeObjectURL; };
  st.M = M;
  return st;
}
function within(p, ms, what) { return Promise.race([p, new Promise(function (res, rej) { setTimeout(function () { rej(new Error(what + ' did not resolve in ' + ms + ' ms')); }, ms); })]); }
function asyncSame(v, o, pool, what) {
  return within(J.packAsync(v, Object.assign({ workers: pool }, opt(o))), 3000, what).then(function (b) {
    assert.strictEqual(Buffer.compare(Buffer.from(J.pack(v, opt(o))), Buffer.from(b)), 0, what + ': bytes differ from pack');
    same(v, J.unpack(b, opt(o)), what);
  });
}
function poolCases() {
  var r = D.rng(5);
  return [
    ['links', many(9000, function (i) { return { id: i, src: i % 300, dst: (i * 7) % 900, w: Math.round(r() * 1000) / 10, t: 1.7e9 + i * 37 }; })],
    ['fractions', many(5000, function (i) { return Math.round(Math.sin(i / 50) * 1e5) / 100; })],
    ['nested', many(4000, function (i) { return { id: i, pos: [i / 3, i * 0.5], tags: ['a', 'b'] }; })]
  ];
}
tAsync('packAsync with a pool of workers (the worker script run in this process): same bytes as pack, the number columns really went to the workers', function () {
  var fb = fakeBrowser('ok'), pool = fb.M.pool({ size: 2 });
  return poolCases().reduce(function (p, c) { return p.then(function () { return asyncSame(c[1], { mode: 'balanced' }, pool, c[0] + ' balanced'); }).then(function () { return asyncSame(c[1], { mode: 'small' }, pool, c[0] + ' small'); }); }, Promise.resolve()).then(function () {
    assert(fb.made === 2 && fb.jobs >= 6, 'workers made ' + fb.made + ', jobs sent ' + fb.jobs);
    pool.close(); assert.strictEqual(fb.terminated, 2, "close() ends both workers");
    return asyncSame(poolCases()[0][1], { mode: 'balanced' }, pool, 'closed pool answers on the page');
  }).then(function () { fb.restore(); }, function (e) { fb.restore(); throw e; });
});
tAsync('packAsync with workers the page policy blocks (error event after creation), a constructor that throws, or workers that never answer resolves with the same bytes as pack and does not hang', function () {
  var kinds = ['blocked', 'throws', 'silent'], cs = poolCases();
  return kinds.reduce(function (p, kind) {
    return p.then(function () {
      var fb = fakeBrowser(kind), pool = fb.M.pool({ size: 2, timeout: 60 });
      return cs.reduce(function (q, c) { return q.then(function () { return asyncSame(c[1], { mode: 'balanced' }, pool, kind + ' ' + c[0]); }); }, Promise.resolve()).then(function () {
        assert(fb.made <= 2, kind + ': no new workers after the failure, made ' + fb.made);
        fb.restore();
      }, function (e) { fb.restore(); throw e; });
    });
  }, Promise.resolve());
});

tAsync('unpackAsync gives the same value as unpack (long record lists in slices, short lists, mixed shapes, shared objects, other values)', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13), ok: i % 3 === 0, t: 1e12 + i * 977 }; }); };
  var odd = mk(5000); odd[3000] = { id: 1, x: 2 };
  var shared = { q: 1 }, refs = many(3000, function (i) { return { s: shared, i: i }; });
  var wide = many(30000, function (i) { return { id: i, x: Math.sin(i / 7) * 180, y: Math.cos(i / 11) * 90, d: Math.round(i * 0.37 * 100) / 100 }; });   // float columns of several picker blocks each
  var cases = [mk(5000), mk(2047), mk(2048), mk(100), odd, refs, [1, 2, 3], 'text', null, Float64Array.from(many(5000, function (i) { return i * 3; })), wide];
  var jobs = [];
  cases.forEach(function (v, ci) {
    ['fast', 'balanced', 'small'].forEach(function (m) {
      var b = J.pack(v, opt({ mode: m }));
      jobs.push(J.unpackAsync(b, opt()).then(function (x) { same(J.unpack(b, opt()), x, 'case ' + ci + ' ' + m); }));
    });
  });
  var bad = J.pack(mk(3000)); bad[bad.length - 3] ^= 0x55;
  jobs.push(J.unpackAsync(bad, opt()).then(function () { try { J.unpack(bad, opt()); } catch (e) { throw new Error('unpackAsync accepted bytes that unpack refuses'); } }, function () { }));
  return Promise.all(jobs);
});

tAsync('2.6.0: unpackAsync onRows is called after each slice with contiguous ranges that cover the list once, in order, the rows already final, the same array that comes back; unused it changes nothing', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13), ok: i % 3 === 0, t: 1e12 + i * 977, pos: [i / 3, i * 0.5] }; }); };
  var jobs = [];
  [30000, 5000, 2048].forEach(function (n) {
    ['fast', 'balanced', 'small'].forEach(function (m) {
      var data = mk(n), b = J.pack(data, opt({ mode: m })), ref = J.unpack(b, opt()), next = 0, calls = 0, arr = null, seen = new Uint8Array(n);
      jobs.push(J.unpackAsync(b, opt({ onRows: function (rows, from, to) {
        if (arr === null) arr = rows; if (rows !== arr) throw new Error('a different array in a later call');
        if (from !== next || to <= from || to > n) throw new Error('ranges not contiguous: ' + from + '..' + to + ' after ' + next);
        for (var i = from; i < to; i++) { if (seen[i]) throw new Error('row ' + i + ' announced twice'); seen[i] = 1; var e = D.same(ref[i], rows[i]); if (e) throw new Error('row ' + i + ' not final when announced: ' + e); }
        next = to; calls++;
      } })).then(function (x) {
        if (next !== n) throw new Error(n + ' ' + m + ': onRows covered ' + next + ' rows');
        if (n === 30000 && calls < 2) throw new Error('only ' + calls + ' call(s) for 30000 rows');
        if (x !== arr) throw new Error('the returned array is not the one given to onRows');
        same(ref, x, 'value with onRows ' + n + ' ' + m);
        return J.unpackAsync(b, opt()).then(function (y) { same(ref, y, 'value without onRows ' + n + ' ' + m); });
      }));
    });
  });
  return Promise.all(jobs);
});
tAsync('2.9.0: stream: true hands long lists to onRows a page at a time (rows final when handed over, cleared right after), page sets the size; lists up to 131,072 rows take the plain path', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13) + (i % 977 ? '' : 'x' + i), ok: i % 3 === 0, t: 1e12 + i * 977 }; }); };
  var big = mk(140000), b = J.pack(big, opt({ mode: 'balanced' })), ref = J.unpack(b, opt()), jobs = [];
  [[undefined, 4096], [1000, 1000]].forEach(function (pg) {
    var next = 0, arr = null;
    jobs.push(J.unpackAsync(b, opt({ stream: true, page: pg[0], onRows: function (rows, from, to) {
      if (arr === null) arr = rows; if (rows !== arr) throw new Error('a different array in a later call');
      if (from !== next || to - from > pg[1] || to <= from) throw new Error('page ' + from + '..' + to + ' after ' + next);
      if (from > 0 && rows[from - 1] !== undefined) throw new Error('row ' + (from - 1) + ' was kept after its call');
      for (var i = from; i < to; i++) { var e = D.same(ref[i], rows[i]); if (e) throw new Error('row ' + i + ': ' + e); }
      next = to;
    } })).then(function (x) {
      if (next !== 140000) throw new Error('stream covered ' + next + ' rows');
      if (x.length !== 140000 || x[0] !== undefined || x[139999] !== undefined) throw new Error('stream should give back a list of let-go rows');
    }));
  });
  var short = mk(5000), b2 = J.pack(short, opt({ mode: 'balanced' })), calls = 0;
  jobs.push(J.unpackAsync(b2, opt({ stream: true, onRows: function () { calls++; } })).then(function (x) { same(short, x, 'short list with stream'); if (!calls) throw new Error('short list: onRows not called'); }));
  jobs.push(J.unpackAsync(b, opt({ stream: true })).then(function (x) { same(ref, x, 'stream without onRows is ignored'); }));
  return Promise.all(jobs);
});
tAsync('2.6.0: onRows is not called for short lists, mixed shapes, other values, lists inside rows, and a value that is not a function is ignored', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5, tags: many(2, function (j) { return { k: j, i: i }; }) }; }); };
  var odd = mk(5000); odd[3000] = { id: 1, x: 2 };
  var cases = [mk(2047), odd, [1, 2, 3], 'text', null, Float64Array.from(many(5000, function (i) { return i * 3; })), many(5000, function (i) { return [i, [{ a: i }]]; })];
  var hits = 0, jobs = cases.map(function (v) {
    var b = J.pack(v, opt({ mode: 'balanced' }));
    return J.unpackAsync(b, opt({ onRows: function () { hits++; } })).then(function (x) { same(J.unpack(b, opt()), x, 'value'); });
  });
  var top = mk(4000), b2 = J.pack(top, opt({ mode: 'balanced' })), lens = [];                  // lists of records inside the rows must not call it: only the 4000 outer rows are announced
  jobs.push(J.unpackAsync(b2, opt({ onRows: function (rows, from, to) { lens.push(to - from); } })).then(function (x) {
    same(top, x, 'nested value'); var s = 0; lens.forEach(function (z) { s += z; }); if (s !== 4000) throw new Error('nested lists were announced: ' + s);
  }));
  ['yes', 5, {}, true].forEach(function (junk) { jobs.push(J.unpackAsync(b2, opt({ onRows: junk })).then(function (x) { same(top, x, 'non-function onRows'); })); });
  return Promise.all(jobs).then(function () { if (hits) throw new Error('called ' + hits + ' times for values that are not a long list of records'); });
});
tAsync('2.6.0: a callback that throws makes unpackAsync reject with its error (no hang, no half result); the next call, with or without onRows, is whole', function () {
  var data = many(30000, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13) }; }), b = J.pack(data, opt({ mode: 'balanced' })), boom = new Error('boom'), after = [];
  function bad(at) { var n = 0; return function (r, f, t) { if (at < 0 ? t === 30000 : n++ === at) throw boom; }; }   // at -1: the last call
  var count = 0;
  return J.unpackAsync(b, opt({ onRows: function () { count++; } })).then(function () {
    assert(count >= 1, 'no calls');
    return [0, 1, -1].reduce(function (p, at) {
    return p.then(function () {
      return within(J.unpackAsync(b, opt({ onRows: bad(at) })), 3000, 'throw at call ' + at).then(function () { throw new Error('no rejection when the callback threw at call ' + at); }, function (e) { if (e !== boom) throw e; });
    });
    }, Promise.resolve());
  }).then(function () {
    return Promise.all([J.unpackAsync(b, opt()), J.unpackAsync(b, opt({ onRows: function (r, f, t) { after.push(t - f); } })), J.unpackAsync(b, opt({ onRows: bad(0) })).then(function () { return 'x'; }, function () { return 'rejected'; })]);
  }).then(function (r) {
    same(data, r[0], 'plain call after a throw'); same(data, r[1], 'onRows call after a throw'); assert.strictEqual(r[2], 'rejected'); assert.strictEqual(after.reduce(function (a, z) { return a + z; }, 0), 30000);
    same(data, J.unpack(b, opt()), 'unpack after a throw');
  });
});

tAsync('unpackAsync never waits on workers: with workers the page blocks, a constructor that throws or workers that stay silent it still resolves with the same value, uses no worker, and runs beside a packAsync that falls back', function () {
  var mk = function (n) { return many(n, function (i) { return { id: i, v: i * 1.5 + (i % 7), name: 'n' + (i % 13), pos: [i / 3, i * 0.5], tags: ['a', 'b' + (i % 5)], t: 1e12 + i * 977 }; }); };
  var data = mk(6000), bytes = J.pack(data, opt({ mode: 'balanced' }));
  return ['blocked', 'throws', 'silent'].reduce(function (p, kind) {
    return p.then(function () {
      var fb = fakeBrowser(kind), pool = fb.M.pool({ size: 2, timeout: 60 }), t0 = Date.now();
      return Promise.all([
        within(J.unpackAsync(bytes, opt()), 3000, kind + ' unpackAsync'),
        within(J.packAsync(data, opt({ mode: 'balanced', workers: pool })), 3000, kind + ' packAsync beside it'),
        within(J.unpackAsync(bytes, opt()), 3000, kind + ' second unpackAsync')
      ]).then(function (r) {
        same(J.unpack(bytes, opt()), r[0], kind + ' value'); same(data, r[2], kind + ' second value');
        assert.strictEqual(Buffer.compare(Buffer.from(J.pack(data, opt({ mode: 'balanced' }))), Buffer.from(r[1])), 0, kind + ': packAsync bytes differ');
        assert(Date.now() - t0 < 2500, kind + ': took ' + (Date.now() - t0) + ' ms');
        assert(fb.jobs === 0 && fb.made <= 2, kind + ': unpackAsync touched the workers, made ' + fb.made);
        fb.restore(); pool.close();
      }, function (e) { fb.restore(); pool.close(); throw e; });
    });
  }, Promise.resolve());
});
tAsync('unpackAsync, packAsync and a second unpackAsync running together all settle when the yield goes through the one shared message channel (no setImmediate)', function () {
  var realSI = global.setImmediate, data = many(5000, function (i) { return { id: i, a: [i, i + 1], s: 'k' + (i % 9), t: 1e12 + i * 31 }; }), bytes = J.pack(data, opt());
  global.setImmediate = undefined;
  function done() { global.setImmediate = realSI; }
  return within(Promise.all([J.unpackAsync(bytes, opt()), J.packAsync(data, opt({ mode: 'fast' })), J.unpackAsync(bytes, opt()), J.packAsync(data, opt({ mode: 'fast' }))]), 4000, 'shared channel').then(function (r) {
    done(); same(data, r[0], 'first'); same(data, r[2], 'second');
    assert.strictEqual(Buffer.compare(Buffer.from(r[1]), Buffer.from(J.pack(data, opt({ mode: 'fast' })))), 0, 'packAsync bytes');
    assert.strictEqual(Buffer.compare(Buffer.from(r[3]), Buffer.from(r[1])), 0, 'the two packAsync runs differ');
  }, function (e) { done(); throw e; });
});

tAsync('packAsync and unpackAsync yield only when the slice has used its time: a clock that does not move gives no yield at all, a clock that jumps gives one at every piece, same bytes and rows either way', function () {
  var realNow = performance.now, realSI = global.setImmediate, yields = 0, tick = 0, mode = 'frozen', data = many(6000, function (i) { return { id: i, a: [i, i + 1], s: 'k' + (i % 9), t: 1e12 + i * 31, w: (i % 50) / 8 }; }), ref = J.pack(data, opt({ mode: 'fast' })), bytes = ref;
  performance.now = function () { return mode === 'frozen' ? 5000 : (tick += 7); };
  global.setImmediate = function (f) { yields++; return realSI(f); };
  function restore() { performance.now = realNow; global.setImmediate = realSI; }
  function run(m) { mode = m; yields = 0; tick = 0; return J.packAsync(data, opt({ mode: 'fast' })).then(function (b) { var py = yields; yields = 0; return J.unpackAsync(bytes, opt()).then(function (r) { return { pack: py, unpack: yields, bytes: b, rows: r }; }); }); }
  return run('frozen').then(function (a) {
    assert.strictEqual(a.pack, 0, 'packAsync yielded ' + a.pack + ' times on a clock that does not move');
    assert.strictEqual(a.unpack, 0, 'unpackAsync yielded ' + a.unpack + ' times on a clock that does not move');
    assert.strictEqual(Buffer.compare(Buffer.from(a.bytes), Buffer.from(ref)), 0, 'packAsync bytes (frozen clock)'); same(data, a.rows, 'unpackAsync rows (frozen clock)');
    return run('jumping');
  }).then(function (b) {
    assert(b.pack >= 3 && b.unpack >= 3, 'a clock that jumps 7 ms a reading must make both yield: pack ' + b.pack + ', unpack ' + b.unpack);
    assert.strictEqual(Buffer.compare(Buffer.from(b.bytes), Buffer.from(ref)), 0, 'packAsync bytes (jumping clock)'); same(data, b.rows, 'unpackAsync rows (jumping clock)');
    restore();
  }, function (e) { restore(); throw e; });
});
tAsync('pager cold: get() does not read the clock, a pager that is read in every interval is not cooled, and one left alone is', function () {
  var rows = many(9000, function (i) { return { id: i, from: (i * 7919) % 900, to: (i * 104729) % 913, w: ((i * 31) % 1000) / 10, t: 1700000000 + i * 37 + (i * i) % 29, k: i % 7 }; }), realNow = performance.now, calls = 0, P, i, stop = false;
  P = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false, cold: true, coldAfter: 100000 }));
  P.get(5);
  performance.now = function () { calls++; return realNow.call(performance); };
  try { for (i = 0; i < 20000; i++) P.get(i % 2048); } finally { performance.now = realNow; }
  assert.strictEqual(calls, 0, 'get() read the clock ' + calls + ' times with cold: true');
  P.dispose();
  P = J.pager(rows, opt({ pageRows: 2048, livePages: 2, readAhead: false, cold: true, coldAfter: 200 }));
  return new Promise(function (res) {
    var n = 0, h = setInterval(function () { P.get((n++ * 37) % 9000); if (n > 35) { clearInterval(h); res(); } }, 20);      // about 700 ms of reads, three and a half intervals
  }).then(function () {
    assert.strictEqual(P.memory().cold, 0, 'cooled while it was being read: ' + P.memory().cold);
    return new Promise(function (res) { setTimeout(res, 700); });
  }).then(function () {
    assert(P.memory().cold > 0, 'left alone for three intervals, nothing cooled'); same(rows[1234], P.get(1234), 'row after cooling'); P.dispose();
  });
});

tAsync('pool.start() packs a small made-up list once through the workers (answer thrown away), only once, and a packAsync after it still gives the same bytes; a blocked pool and a throwing constructor do not break start()', function () {
  var fb = fakeBrowser('ok'), pool = fb.M.pool({ size: 2 }), data = many(5000, function (i) { return { id: i, a: (i * 7919) % 900, t: 1e12 + i * 31 }; });
  pool.start();
  assert.strictEqual(fb.made, 2, 'workers made: ' + fb.made);
  return new Promise(function (r) { setTimeout(r, 400); }).then(function () {
    var j1 = fb.jobs; assert(j1 >= 2, 'priming sent jobs to the workers: ' + j1);
    pool.start(); return new Promise(function (r) { setTimeout(r, 50); }).then(function () { assert.strictEqual(fb.jobs, j1, 'a second start() primed again: ' + j1 + ' to ' + fb.jobs); });
  }).then(function () { return within(J.packAsync(data, opt({ mode: 'balanced', workers: pool })), 3000, 'packAsync after priming'); }).then(function (b) {
    assert.strictEqual(Buffer.compare(Buffer.from(J.pack(data, opt({ mode: 'balanced' }))), Buffer.from(b)), 0, 'bytes differ after priming');
    fb.restore(); pool.close();
    return ['blocked', 'throws', 'silent'].reduce(function (p, kind) { return p.then(function () { var f2 = fakeBrowser(kind), p2 = f2.M.pool({ size: 2, timeout: 60 }); p2.start(); return new Promise(function (r) { setTimeout(r, 30); }).then(function () { f2.restore(); p2.close(); }); }); }, Promise.resolve());
  }, function (e) { fb.restore(); pool.close(); throw e; });
});
tAsync('pool.start() returns a promise: true the first time, false the second time and on a closed pool; a blocked pool still resolves (true, the warm-up runs on the page); a caller that ignores the return still works', function () {
  var fb = fakeBrowser('ok'), pool = fb.M.pool({ size: 2 }), p1, p2;
  p1 = pool.start(); p2 = pool.start();
  assert(p1 && typeof p1.then === 'function' && p2 && typeof p2.then === 'function', 'start() did not return promises');
  return Promise.all([p1, p2]).then(function (r) {
    assert.strictEqual(r[0], true, 'first start() resolved ' + r[0]); assert.strictEqual(r[1], false, 'second start() resolved ' + r[1]);
    return pool.start();
  }).then(function (r3) {
    assert.strictEqual(r3, false, 'third start() resolved ' + r3); pool.close();
    return pool.start();
  }).then(function (r4) {
    assert.strictEqual(r4, false, 'start() on a closed pool resolved ' + r4); fb.restore();
    var f2 = fakeBrowser('blocked'), p3 = f2.M.pool({ size: 2, timeout: 60 });
    return p3.start().then(function (r5) { assert.strictEqual(r5, true, 'blocked pool: the warm-up pack ran on the page and resolved ' + r5); return p3.start(); }).then(function (r6) { assert.strictEqual(r6, false, 'second start() on a blocked pool resolved ' + r6); f2.restore(); p3.close(); });
  }, function (e) { fb.restore(); throw e; });
});
t('rows without generated code: 1 to 18 fields, a field called __proto__, missing and mixed values give the same rows as with generated code (a child process that forbids code generation)', function () {
  var cp = require('child_process'), script = "var M=require(" + JSON.stringify(path.resolve(modPath)) + ");var out=[];for(var nk=1;nk<=18;nk++){var rows=[];for(var i=0;i<3000;i++){var o={};for(var j=0;j<nk;j++)o['k'+j]=j%3===0?i*j:j%3===1?'s'+(i%7):(i%2===0);rows.push(o);}var b=M.pack(rows,{mode:'fast'});out.push(JSON.stringify(M.unpack(b))===JSON.stringify(rows));}var pr=[];for(var i=0;i<3000;i++){var o={a:i};Object.defineProperty(o,'__proto__',{value:i%5,enumerable:true,writable:true,configurable:true});o.z='x'+i;pr.push(o);}var b2=M.pack(pr,{mode:'fast'});var u=M.unpack(b2);out.push(u.length===3000&&Object.keys(u[7]).join()==='a,__proto__,z'&&u[7]['__proto__']===2&&Object.getPrototypeOf(u[7])===Object.prototype);console.log(out.join());";
  var r = cp.execFileSync(process.execPath, ['--disallow-code-generation-from-strings', '-e', script], { encoding: 'utf8' }).trim();
  assert.strictEqual(r, new Array(19).fill('true').join(','), r);
});

later.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
  console.log((failed ? failed + ' FAILED, ' : '') + passed + ' checks passed' + (FULL ? ' (full fuzz)' : ' (quick fuzz; FULL=1 for more)'));
  process.exit(failed ? 1 : 0);
});
