/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for the one-file memory-compression: the routing (which layer packs, which layer opens), the overrides, the old names, and data written by the two modules it replaces.
 * Run: node modules/memory-compression/test/router.js [path/to/memory-compression.js] */
'use strict';
var assert = require('assert'), path = require('path'), vm = null, fs = null;
try { vm = require('vm'); fs = require('fs'); } catch (e) { /* in a browser page the globals check below is skipped */ }
var file = path.resolve(process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : path.join(__dirname, '..', 'memory-compression.js'));
var M = require(file), n = 0;
function ok(name, fn) { fn(); n++; console.log('  ok  ' + name); }
var b64 = function (s) { return new Uint8Array(Buffer.from(s, 'base64')); };
// Packed by the two modules this one replaces: memory-compression 1.1.0 (Float32Array of 200, fast and small mode) and memory-compression 1.4.1 (40 records).
var OLD = { fast: 'TUMBAQcBoAaAgEAECAHLBPH/zgB2a49s/fBQ738K/dJAB02HDHfA58HSE9dMS+FKQ8OqLeiG7A03Dgxs4Ev1y5cr+BK3kyOFwTu/JIX/EIX/Su+YEp8DaJLDf83yM8Q0gK8J3tjt5RHszhewV40bXTn3r8+zGSwkeqqORL3C2O0FgpKZkuDmEFpXjenDhdZjMoyHXLP03ES0jvdMhRr0zFSkRdEeCsXEROB95Z3xvmpLohYUfC4GSrMIUp1G7fNONr9HQ60ujeCZ/vJ9pNwLKnMdtgWUpd6B24CDAMt5OlUDMUv27fv/8dvcKAfT6MSAynvMcbDCNFxuEf8E/+jIwQXdontOiMl7zGolL2WGkSwRDf/ftqXisnAO2I/JOc1im5uWsLNHIxb/1aSKvoc/oWKWyHvNWhEIx9rWYTUf/8yRb5tdDjPsncfazVKGdPcF+XxHJ/7CflR4Mt3GdqTFOc1K++EoLxuWWTD+uGw5VAesWACrxJfNQnFNWVk+sWs5/a9ZHTHceuuKssN7zTrmuYmCYMt8Qf2lRgINskl9E7nBqs0AY+EmWIOXqLW/xcfFv7Wol4JXJeBhAWXiJliDl6i2v8bHxb+1qJaCVyXfX4Fn4ydZg5eotsDGx8W/taeWglck3l3CaeQnWYOXqLbALADJp5aCViTdWwFr5ShaLAC2ViPcWSFt5ihag5gsANWBVSPbV0Jv5yhahJipQgCngVUj2lVicegpWxYAnZWBVCLZU4Fz6RYAm9hRkXUAQQABAAEAT/8AfQMWAC0vfgJCAAEPFgBCUAD/AH4C', small: 'TUMBAgcBoAaAgEAECAHqBGMoy+7P+fsh4H09199LDuy+7TzlB54fvCR83cf7oZfz4VW6L9re8Jrz8eQ88P56err2D6Htk5VbD1rvV2n9L9D63+v9DKH5zBmTDtef/WR8xKRhPee9G2+fCr45J74hvFc61vL7+vObJXVUqlb1uew9dOMta9OkmZMePBOICu99ebj1WrJRT3vM5i93XLb0ffdplfpyJmSJ60U5rqNHXB7UPp37cV+W9yIxkRo9Nq/NHEFz3d5+9jPb7+68Vq/3wcx/n2qX3OHWKpbdxjpl6b3G2w3NDKcrrUKZDb2/vf39/+PtOxrsl18caThVfaZwwyGTmDzB/yz/X5w4yHp3UbVfx8nqM1mq+qltE3UEef/f37b00aYCvhv9Jy3PJs2ePW3DZndlsf9Xl3Tta7dfmDTtRPXZKEGO47euJZrK/z8zMX92LJ/xm7nHb50Naiv5zvqzxl3936G6kAqju8fKlhy1POv1+6GGvvS0SIN/O3IsQ9jXRDCsPjL9rFOhb2Sk3cZsy7/rI2UN71S97tp0uPqs1bOdnU0Jp2sc/y51Y+Ld5FkrvPPgqrMMyQ/VIpqnr9i6/+jxo/u3rpjeFK76IJEx9ZFaRPP0Fdv2Hzt+dP/WFdOawlXvxzemP1aPbJ6+YtuBY8eP7t+6fFpTuMq92EOZT9Qjm6ev2Hbg2PGj+7cun9YUpnI3mjH7qUZU8/QV2w4cO350/9bl05rClO9EKuY+04hqnrFi2wGwucunNYYq3w53yn+uEdUyYyVcLVD0VmhS4QvNaCTRqY0hSjeDG4tfYojeCJxYyuDIwMiABv4z1DJTKlrHRF9RAA==', objs: 'TUoCAFRUCygLAQQAAmlkAARuYW1lAAVzY29yZQACb2uDgICAAKmAgIAAioCAgACZgoCAAISAgIAA0YCAgACBgICAAIaAgIAAAQEABigBASIBKADGBQIBAgAFAAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQHEAU1DAQEAAMYFgIBAAbYB8AJ1c2VyMEBleGFtcGxlLm9yZxEAHDERABwyEQAcMxEAHDQRABw1EQAcNhEAHDcRABw4EQAcOREAHjGrAA2sAB0xrQAdMa4AHTGvAB0xsAAdMbEAHTGyAB0xswAdMbQAHTK0AB0ytAAdMrQAHTK0AB0ytAAdMrQAHTK0AB0ytAAdMrQAHTK0AB0ztAAdM7QAHTO0AB0ztAAdM7QAHTO0AB0ztAAdM7QAHTO0ABQztABQZS5vcmcAAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJwIAAA8AHgAtADwASwBaAGkAeACHAJYApQC0AMMA0gDhAPAA/wAOAR0BLAE7AUoBWQFoAXcBhgGVAaQBswHCAdEB4AHvAf4BDQIcAisCOgJJAgBJkiRJkg==' };
var f32 = new Float32Array(200).map(function (_, i) { return Math.fround(Math.sin(i / 7) * 100); });
var recs = Array.from({ length: 40 }, function (_, i) { return { id: i, name: 'user' + i + '@example.org', score: i * 1.5, ok: i % 3 === 0 }; });
var f64 = new Float64Array(20000).map(function (_, i) { return Math.sin(i / 10) * 1000 + (i % 7); });

ok('one file gives the old names: MemoryCompression with the core functions, .jso/.objects/.core/.picker, and the object-layer extras', function () {
  ['pack', 'unpack', 'view', 'lz4Compress', 'deflate', 'inflate', 'gzip', 'crc32', 'shuffle', 'keeper', 'estimateBytes', 'profile', 'freeBuffers', 'ready', 'accelerated', 'layerOf'].forEach(function (k) { assert.strictEqual(typeof M[k], 'function', k); });
  assert.strictEqual(M.jso, M.objects); assert.strictEqual(typeof M.jso.pack, 'function'); assert.strictEqual(typeof M.jso.core.pack, 'function'); assert(M.picker && M.core);
});
ok('in a browser page both global names are set, and MemoryCompressionJSO is the object layer', function () {
  if (!vm || !fs) return;   // needs Node's vm and fs; the browser run checks the real globals through its own page
  var sandbox = { self: null }; sandbox.self = sandbox; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  assert.strictEqual(typeof sandbox.MemoryCompression.pack, 'function'); assert.strictEqual(sandbox.MemoryCompressionJSO, sandbox.MemoryCompression.jso);
  assert.strictEqual(typeof sandbox.MemoryCompressionJSO.keeper, 'function');
});
ok('bytes and typed arrays go to the core: same bytes as the core alone, marker "MC"', function () {
  [f32, new Uint8Array(5000).map(function (_, i) { return i * 7; }), new Int32Array(300).map(function (_, i) { return i * i; })].forEach(function (x) {
    var p = M.pack(x); assert.strictEqual(M.layerOf(p), 'core'); assert.deepStrictEqual(Array.from(p), Array.from(M.core.pack(x)));
    var back = M.unpack(p); assert.strictEqual(back.constructor, x.constructor); assert.deepStrictEqual(Array.from(back), Array.from(x));
  });
});
ok('objects, records, text and plain arrays go to the object layer, marker "MJ"', function () {
  [recs, { a: 1, b: [1, 2, { c: 'x' }] }, 'some text', [1, 2, 3, 4.5], null, new Date(0)].forEach(function (x) {
    var p = M.pack(x); assert.strictEqual(M.layerOf(p), 'objects'); assert.deepStrictEqual(M.unpack(p), x);
  });
});
ok("mode 'balanced' sends a number array through the number picker (object layer) and it comes back exactly; raw bytes stay in the core", function () {
  var p = M.pack(f64, { mode: 'balanced' }); assert.strictEqual(M.layerOf(p), 'objects'); assert.deepStrictEqual(Array.from(M.unpack(p)), Array.from(f64));
  var bytes = new Uint8Array(3000).map(function (_, i) { return i % 251; }), q = M.pack(bytes, { mode: 'balanced' });
  assert.strictEqual(M.layerOf(q), 'core'); assert.deepStrictEqual(Array.from(M.unpack(q)), Array.from(bytes));
});
ok("mode 'small' on a number array keeps the smallest of the core's deflate path, the picker with deflate, and the picker alone", function () {
  var small = M.pack(f64, { mode: 'small' }), core = M.core.pack(f64, { mode: 'small' }), bal = M.jso.pack(f64, { mode: 'balanced' }), full = M.jso.pack(f64, { mode: 'small' });
  assert.strictEqual(small.length, Math.min(core.length, bal.length, full.length)); assert.deepStrictEqual(Array.from(M.unpack(small)), Array.from(f64));
});
ok("mode 'fast' (and no mode) never runs the picker", function () { assert.strictEqual(M.layerOf(M.pack(f64, { mode: 'fast' })), 'core'); assert.strictEqual(M.layerOf(M.pack(f64)), 'core'); });
ok("opts.layer overrides: 'core' for bytes, 'objects' for a typed array; 'core' refuses an object; a wrong word is refused", function () {
  assert.strictEqual(M.layerOf(M.pack(f64, { layer: 'objects' })), 'objects'); assert.strictEqual(M.layerOf(M.pack(f64, { layer: 'core', mode: 'balanced' })), 'core');
  assert.throws(function () { M.pack(recs, { layer: 'core' }); }, /MemoryCompression/); assert.throws(function () { M.pack(f64, { layer: 'both' }); }, /layer must be/);
});
ok('unpack() opens what memory-compression 1.1.0 wrote (fast and small) and what memory-compression 1.4.1 wrote', function () {
  [OLD.fast, OLD.small].forEach(function (s) { var p = b64(s); assert.strictEqual(M.layerOf(p), 'core'); var back = M.unpack(p); assert.strictEqual(back.constructor, Float32Array); assert.deepStrictEqual(Array.from(back), Array.from(f32)); });
  var o = b64(OLD.objs); assert.strictEqual(M.layerOf(o), 'objects'); assert.deepStrictEqual(M.unpack(o), recs);
  assert.deepStrictEqual(M.jso.unpack(o), recs);
});
ok('the object layer alone (MemoryCompressionJSO) still packs a typed array its own way, and unpack() opens it', function () {
  var p = M.jso.pack(f32); assert.strictEqual(M.layerOf(p), 'objects'); assert.deepStrictEqual(Array.from(M.unpack(p)), Array.from(f32));
});
ok('view() picks the layer too: chunks for a core container, get(i) for packed records', function () {
  var v = M.view(M.pack(new Uint8Array(5000).map(function (_, i) { return i * 3; }), { chunk: 4096 })); assert.strictEqual(typeof v.chunkLength, 'function'); assert(v.chunks >= 2);
  var w = M.view(M.pack(recs)); assert.deepStrictEqual(w.get(7), recs[7]);
});
ok('unpack() and view() refuse anything that is not packed data, with the core\'s plain message, and ArrayBuffer input works', function () {
  [new Uint8Array(0), new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), new Uint8Array([0x4D, 0x58, 0, 0, 0, 0, 0, 0])].forEach(function (b) {
    assert.throws(function () { M.unpack(b); }, /not a MemoryCompression/); assert.throws(function () { M.view(b); }, /not a MemoryCompression/);
  });
  var p = M.pack(recs); assert.deepStrictEqual(M.unpack(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength)), recs);
});
ok('keeper and estimateBytes work from the one file', function () {
  var k = M.keeper({ budget: 1 << 20 }); k.hold('layout', recs); assert.deepStrictEqual(k.get('layout'), recs); assert(M.estimateBytes(recs) > 0);
});
// The WebAssembly helper starts on the first pack or unpack (2.0.3), not at load. A fresh copy is loaded so nothing has packed yet.
var lazyReady = null;
ok('the WebAssembly helper starts on first use: off after load, on after the first pack, same bytes as 2.0.2', function () {
  if (typeof WebAssembly !== 'object') { console.log('  (skipped: no WebAssembly)'); return; }
  if (typeof require.resolve !== 'function') { console.log('  (skipped here: it reloads the module through the module cache of Node)'); return; }
  delete require.cache[require.resolve(file)];
  var L = require(file), d = new Uint8Array(100000).map(function (_, i) { return (i * 7 + (i >> 5)) & 255; });
  assert.strictEqual(L.accelerated(), false, 'accelerated() is false right after load');
  var p = L.pack(d);
  assert.strictEqual(L.accelerated(), true, 'accelerated() is true after the first pack');
  assert.strictEqual(require('crypto').createHash('sha256').update(p).digest('hex').slice(0, 16), '46b9cc16fa0c0ccd', 'bytes equal those from 2.0.2');
  assert.strictEqual(p.length, 25217);
  assert.deepStrictEqual(Buffer.from(p), Buffer.from(L.pack(d, { wasm: false })), 'same bytes without the helper');
  lazyReady = L.ready();
  assert.strictEqual(typeof lazyReady.then, 'function', 'ready() returns a promise');
});
Promise.resolve(lazyReady).then(function (v) {
  if (lazyReady) { assert.strictEqual(v, true, 'ready() resolves true'); n++; console.log('  ok  ready() resolves true after the helper has started'); }
  console.log(n + ' checks passed');
});
