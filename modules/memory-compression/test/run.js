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
    var v = J.view(p, opt()); assert(v.lazy); assert.strictEqual(v.field(n - 1, 'label'), rows[n - 1].label); same(rows[7], v.get(7), 'view get'); same(rows, v.toArray(), 'view toArray'); same(rows.map(function (x) { return x.label; }), v.column('label'), 'view column');
    assert(v.memory().restored < JSON.stringify(rows).length, 'the restored column is smaller than the strings'); v.release(); assert.strictEqual(v.loaded().length, 0);
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

later.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () {
  console.log((failed ? failed + ' FAILED, ' : '') + passed + ' checks passed' + (FULL ? ' (full fuzz)' : ' (quick fuzz; FULL=1 for more)'));
  process.exit(failed ? 1 : 0);
});
