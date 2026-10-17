/* Copyright (c) 2026 LFC Foundry. MIT License. Checks for memory-compression, including hostile and damaged input and a seeded fuzz.
 * Run: node modules/memory-compression/test/run.js [path/to/memory-compression.js] [--js-only]      (add FULL=1 for the long fuzz, about 10 times more cases) */
'use strict';
var assert = require('assert'), zlib = require('zlib'), path = require('path');
var args = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });
var FP = require(path.resolve(args[0] || path.join(__dirname, '..', 'memory-compression.js')));
var FULL = !!process.env.FULL, JS_ONLY = !!process.env.JS_ONLY || process.argv.indexOf('--js-only') > 0, n = 0, failed = 0;
if (JS_ONLY) { // run every check on the plain-JavaScript code only
  ['pack', 'unpack', 'lz4Compress', 'lz4Decompress'].forEach(function (k) { var f = FP[k]; FP[k] = function (a, b, c) { if (k === 'lz4Decompress') return f(a, b, Object.assign({ wasm: false }, c)); return f(a, Object.assign({ wasm: false }, b)); }; });
}
function t(name, fn) { var t0 = Date.now(); try { fn(); n++; if (process.env.TIMES) console.log((Date.now() - t0) + " ms  " + name); } catch (e) { failed++; console.log('FAIL', name, '\n  ', e && e.stack || e); } }

function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function bytesOf(a) { return new Uint8Array(a.buffer, a.byteOffset, a.byteLength); }
function same(a, b, msg) { var x = bytesOf(a), y = bytesOf(b); assert.strictEqual(x.length, y.length, (msg || '') + ' length'); assert.ok(Buffer.compare(Buffer.from(x.buffer, x.byteOffset, x.length), Buffer.from(y.buffer, y.byteOffset, y.length)) === 0, (msg || '') + ' bytes differ'); }
function throwsFP(fn, msg) { try { fn(); } catch (e) { assert.ok(/^MemoryCompression: /.test(e.message), (msg || '') + ' expected a MemoryCompression error, got: ' + e.message); return; } assert.fail((msg || '') + ' should have thrown'); }

// ---- data makers
function makeFloats(r, type, count, kind) {
  var T = type === 'f64' ? Float64Array : Float32Array, a = new T(count), x = r() * 1000, i;
  for (i = 0; i < count; i++) {
    if (kind === 0) { x += (r() - 0.5); a[i] = x; }
    else if (kind === 1) a[i] = r();
    else if (kind === 2) a[i] = Math.round(r() * 2000) / 2;
    else if (kind === 3) a[i] = i * 0.25;
    else a[i] = [0, -0, NaN, Infinity, -Infinity, 1e-45, 5e-324, 3.4e38, -1.5][(r() * 9) | 0];
  }
  return a;
}
function makeBytes(r, count, kind) {
  var a = new Uint8Array(count), i, v = 0;
  if (kind === 0) for (i = 0; i < count; i++) a[i] = (r() * 256) | 0;
  else if (kind === 1) for (i = 0; i < count; i++) a[i] = i % 7;
  else if (kind === 2) { var words = ['alpha', 'beta', 'gamma', 'delta', ' ', '\n', 'node', '{"x":']; var s = ''; while (s.length < count) s += words[(r() * words.length) | 0]; for (i = 0; i < count; i++) a[i] = s.charCodeAt(i); }
  else if (kind === 3) { i = 0; while (i < count) { var run = 1 + ((r() * 600) | 0), b = (r() * 256) | 0; while (run-- && i < count) a[i++] = b; } }
  else for (i = 0; i < count; i++) { v += (r() < 0.5 ? 1 : 255); a[i] = v; }
  return a;
}
// a real NaN with a payload, to prove bits survive
function oddFloats() {
  var u = new Uint32Array([0x7fc00001, 0xffc12345, 0x80000000, 0x00000001, 0x7f800001, 0x7fffffff, 0x00800000, 0x807fffff]);
  return new Float32Array(u.buffer.slice(0));
}

// ---- LZ4 (checked against a tiny reference decoder written from the format description, and against fixed vectors)
function refLz4Decode(src, size) {
  var out = new Uint8Array(size), ip = 0, op = 0;
  while (ip < src.length) {
    var tok = src[ip++], lit = tok >> 4, e;
    if (lit === 15) do { e = src[ip++]; lit += e; } while (e === 255);
    for (var i = 0; i < lit; i++) out[op++] = src[ip++];
    if (ip >= src.length) break;
    var off = src[ip] | src[ip + 1] << 8; ip += 2;
    var ml = tok & 15; if (ml === 15) do { e = src[ip++]; ml += e; } while (e === 255);
    ml += 4;
    for (var j = 0; j < ml; j++) { out[op] = out[op - off]; op++; }
  }
  assert.strictEqual(op, size); return out;
}
t('lz4: a hand-made block from the format description decodes', function () {
  // token 0x1F: 1 literal, match 15+4; then 'a', offset 1, extra 0 -> 'a' x 20, final literal-only sequence 'b'
  var blk = Uint8Array.from([0x1F, 0x61, 0x01, 0x00, 0x00, 0x10, 0x62]);
  var got = FP.lz4Decompress(blk, 21);
  assert.strictEqual(Buffer.from(got).toString(), 'a'.repeat(20) + 'b');
});
t('lz4: our blocks decode with the reference decoder, edge sizes included', function () {
  var r = rng(1), sizes = [0, 1, 2, 4, 11, 12, 13, 14, 15, 16, 17, 31, 32, 33, 255, 256, 270, 271, 4096, 65535, 65536, 65537, 200000];
  sizes.forEach(function (sz) {
    for (var k = 0; k < 5; k++) {
      var d = makeBytes(r, sz, k), c = FP.lz4Compress(d);
      same(refLz4Decode(c, sz), d, 'ref size ' + sz + ' kind ' + k);
      same(FP.lz4Decompress(c, sz), d, 'own size ' + sz + ' kind ' + k);
    }
  });
});
t('lz4: the last 5 bytes are literals and the last match starts 12 or more bytes from the end (what other decoders require)', function () {
  var d = new Uint8Array(100).fill(7), c = FP.lz4Compress(d), ip = 0, lastMatchStart = -1, op = 0;
  while (ip < c.length) {
    var tok = c[ip++], lit = tok >> 4, e; if (lit === 15) do { e = c[ip++]; lit += e; } while (e === 255);
    ip += lit; op += lit; if (ip >= c.length) { assert.ok(lit >= 5, 'final literals ' + lit); break; }
    lastMatchStart = op; ip += 2; var ml = tok & 15; if (ml === 15) do { e = c[ip++]; ml += e; } while (e === 255); op += ml + 4;
  }
  assert.ok(lastMatchStart <= 100 - 12, 'last match starts at ' + lastMatchStart);
});
t('lz4: cut-off, lying and hostile blocks throw, never hang or write outside', function () {
  var r = rng(2), d = makeBytes(r, 5000, 2), c = FP.lz4Compress(d);
  for (var cut = 0; cut < c.length; cut += 7) { try { FP.lz4Decompress(c.subarray(0, cut), 5000); assert.fail('cut ' + cut + ' accepted'); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
  throwsFP(function () { FP.lz4Decompress(c, 4999); }, 'size too small');
  throwsFP(function () { FP.lz4Decompress(c, 5001); }, 'size too big');
  throwsFP(function () { FP.lz4Decompress(Uint8Array.from([0x0F, 0x00, 0x00]), 20); }, 'offset 0');
  throwsFP(function () { FP.lz4Decompress(Uint8Array.from([0x10, 0x61, 0x09, 0x00]), 30); }, 'offset before start');
  throwsFP(function () { FP.lz4Decompress(c, 5000, { maxSize: 100 }); }, 'maxSize');
  for (var k = 0; k < 300; k++) { var junk = makeBytes(r, 1 + ((r() * 300) | 0), 0); try { FP.lz4Decompress(junk, (r() * 1000) | 0); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
});

// ---- deflate family against Node's zlib, both directions
t('deflate: every level is read by zlib, on every kind of data', function () {
  var r = rng(3);
  [0, 1, 3, 6, 9].forEach(function (level) {
    [0, 1, 2, 3, 5, 100, 4000, 40000, 70000].forEach(function (sz) {
      for (var k = 0; k < 5; k++) {
        var d = makeBytes(r, sz, k), c = FP.deflate(d, { level: level });
        same(zlib.inflateRawSync(c), d, 'level ' + level + ' size ' + sz + ' kind ' + k);
        same(FP.inflate(c), d, 'own inflate level ' + level + ' size ' + sz + ' kind ' + k);
      }
    });
  });
});
t('inflate: reads zlib output at every level (fixed, dynamic, stored blocks)', function () {
  var r = rng(4);
  for (var level = 0; level <= 9; level++) for (var k = 0; k < 5; k++) {
    var d = makeBytes(r, 1 + ((r() * 150000) | 0), k), c = zlib.deflateRawSync(d, { level: level });
    same(FP.inflate(c), d, 'level ' + level + ' kind ' + k);
    same(FP.inflate(c, { size: d.length }), d, 'sized level ' + level + ' kind ' + k);
  }
  same(FP.inflate(zlib.deflateRawSync(Buffer.alloc(0))), new Uint8Array(0), 'empty');
  same(FP.inflate(zlib.deflateRawSync(Buffer.from('hello'), { strategy: zlib.constants.Z_FIXED })), Buffer.from('hello'), 'fixed');
  same(FP.inflate(zlib.deflateRawSync(Buffer.alloc(100000, 'ab'), { strategy: zlib.constants.Z_HUFFMAN_ONLY })), Buffer.alloc(100000, 'ab'), 'huffman only');
  same(FP.inflate(zlib.deflateRawSync(Buffer.alloc(100000, 'ab'), { strategy: zlib.constants.Z_RLE })), Buffer.alloc(100000, 'ab'), 'rle');
});
t('zlib and gzip wrappers agree with Node both ways', function () {
  var r = rng(5), d = makeBytes(r, 30000, 2);
  same(zlib.inflateSync(FP.zlib(d)), d, 'zlib'); same(FP.unzlib(zlib.deflateSync(d)), d, 'unzlib');
  same(zlib.gunzipSync(FP.gzip(d)), d, 'gzip'); same(FP.gunzip(zlib.gzipSync(d)), d, 'gunzip');
  same(FP.unzlib(FP.zlib(new Uint8Array(0))), new Uint8Array(0), 'empty zlib');
  var bad = FP.gzip(d); bad[bad.length - 9] ^= 1; throwsFP(function () { FP.gunzip(bad); }, 'gzip checksum');
  var badz = FP.zlib(d); badz[badz.length - 1] ^= 1; throwsFP(function () { FP.unzlib(badz); }, 'zlib checksum');
  assert.strictEqual(FP.crc32(d), zlib.crc32 ? zlib.crc32(d) : FP.crc32(d)); assert.strictEqual(FP.crc32(Buffer.from('123456789')), 0xCBF43926);
  assert.strictEqual(FP.adler32(Buffer.from('Wikipedia')), 0x11E60398);
});
t('inflate: damaged, cut-off and bomb input throws a MemoryCompression error', function () {
  var r = rng(6), d = makeBytes(r, 20000, 2), c = FP.deflate(d, { level: 6 });
  for (var cut = 0; cut < c.length; cut += 11) { try { FP.inflate(c.subarray(0, cut), { size: 20000 }); assert.fail('cut ' + cut + ' accepted'); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
  var bomb = zlib.deflateRawSync(Buffer.alloc(50 * 1048576)), got;
  throwsFP(function () { FP.inflate(bomb, { maxSize: 1000000 }); }, 'bomb with maxSize');
  throwsFP(function () { FP.inflate(bomb, { size: 1000 }); }, 'bomb with a wrong size');
  for (var k = 0; k < 400; k++) { var junk = makeBytes(r, 1 + ((r() * 400) | 0), 0); try { FP.inflate(junk, { maxSize: 100000 }); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
  for (k = 0; k < 400; k++) { var flip = Uint8Array.from(c); flip[(r() * flip.length) | 0] ^= 1 << ((r() * 8) | 0); try { FP.inflate(flip, { maxSize: 100000 }); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
});

// ---- pack / unpack
var TYPE_NAMES = ['Uint8Array', 'Int8Array', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array'];
t('inflate: cut-off or damaged data with the default limit fails at once (it used to decode zero padding up to 1 GiB, about 12 s)', function () {
  var r = rng(18), d = makeBytes(r, 30000, 2), g = FP.gzip(d), t0 = Date.now(), k;
  for (k = 0; k < 200; k++) { var f = Uint8Array.from(g); f[10 + ((r() * (f.length - 18)) | 0)] ^= 1 << ((r() * 8) | 0); try { FP.gunzip(f); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
  for (k = 1; k < 40; k++) throwsFP(function () { FP.inflate(FP.deflate(d).subarray(0, FP.deflate(d).length - k)); }, 'cut ' + k);
  assert.ok(Date.now() - t0 < 4000, 'took ' + (Date.now() - t0) + ' ms');
});
t('pack: every array type comes back as the same type with the same bits, both modes', function () {
  var r = rng(7);
  TYPE_NAMES.forEach(function (name) {
    var C = global[name], cnt = 3001, a = new C(cnt), raw = bytesOf(a), i;
    for (i = 0; i < raw.length; i++) raw[i] = i % 5 === 0 ? (r() * 256) | 0 : (i >> 4) & 255;
    ['fast', 'small'].forEach(function (mode) {
      var out = FP.unpack(FP.pack(a, { mode: mode }));
      assert.ok(out instanceof C, name + ' type'); same(out, a, name + ' ' + mode);
    });
  });
  if (typeof BigInt64Array !== 'undefined') { var bi = new BigInt64Array(500); for (var i = 0; i < 500; i++) bi[i] = BigInt(i) * 1234567n; var bo = FP.unpack(FP.pack(bi)); assert.ok(bo instanceof BigInt64Array); same(bo, bi, 'bigint'); }
});
t('pack: odd floats (NaN payloads, -0, denormals, infinities) survive bit for bit', function () {
  var f = oddFloats(), big = new Float32Array(20000), i; for (i = 0; i < big.length; i++) big[i] = f[i % f.length];
  same(FP.unpack(FP.pack(big)), big, 'f32 fast'); same(FP.unpack(FP.pack(big, { mode: 'small' })), big, 'f32 small');
  var d = new Float64Array(9000), r = rng(8); for (i = 0; i < d.length; i++) d[i] = makeFloats(r, 'f64', 1, 4)[0];
  same(FP.unpack(FP.pack(d, { check: true })), d, 'f64');
});
t('pack: floats really get smaller (the point of the module)', function () {
  var r = rng(9), walk = makeFloats(r, 'f32', 200000, 0), plain = FP.lz4Compress(walk).length, packed = FP.pack(walk).length, small = FP.pack(walk, { mode: 'small' }).length;
  assert.ok(packed < plain * 0.8, 'fast pack ' + packed + ' against plain lz4 ' + plain);
  assert.ok(small < FP.deflate(walk).length * 0.85, 'small pack ' + small + ' against plain deflate ' + FP.deflate(walk).length);
  var noise = makeFloats(r, 'f32', 100000, 1), pn = FP.pack(noise); assert.ok(pn.length <= noise.byteLength + 64, 'random floats must not grow by more than the container');
  var raw = new Uint8Array(100000); for (var i = 0; i < raw.length; i++) raw[i] = (r() * 256) | 0; assert.ok(FP.pack(raw).length <= raw.length + 64, 'random bytes must not grow by more than the container');
});
t('pack: sizes around chunk and element edges, tails, empty and tiny input', function () {
  var r = rng(10);
  [0, 1, 2, 3, 4, 5, 7, 8, 9, 63, 64, 65, 4095, 4096, 4097, 8191, 8192, 8193, 12288, 20001].forEach(function (sz) {
    [undefined, 3, 4, 8, 28].forEach(function (w) {
      var d = makeBytes(r, sz, 1 + (sz % 3)), o = { chunk: 4096 }; if (w) { o.width = w; o.shuffle = true; }
      ['fast', 'small'].forEach(function (mode) { o.mode = mode; same(FP.unpack(FP.pack(d, o)), d, 'size ' + sz + ' width ' + w + ' ' + mode); });
    });
  });
  same(FP.unpack(FP.pack(new Float32Array(0))), new Float32Array(0), 'empty f32');
});
t('pack: records (a width the data does not announce), auto width and per-column delta', function () {
  var r = rng(11), cnt = 20000, buf = new ArrayBuffer(cnt * 20), dv = new DataView(buf), i;
  for (i = 0; i < cnt; i++) { dv.setUint32(i * 20, i, true); dv.setFloat32(i * 20 + 4, 100 + i * 0.01 + r(), true); dv.setFloat32(i * 20 + 8, r() * 50, true); dv.setUint32(i * 20 + 12, 0xff3366ff, true); dv.setUint16(i * 20 + 16, i & 7, true); dv.setUint16(i * 20 + 18, 0, true); }
  var d = new Uint8Array(buf), plain = FP.pack(d).length, w20 = FP.pack(d, { width: 20 }), auto = FP.pack(d, { width: 'auto' });
  assert.ok(w20.length < plain * 0.75, 'width 20: ' + w20.length + ' vs ' + plain); assert.ok(auto.length <= w20.length * 1.02, 'auto should find a width at least as good: ' + auto.length + ' vs ' + w20.length);
  same(FP.unpack(w20), d, 'w20'); same(FP.unpack(auto), d, 'auto'); same(FP.unpack(FP.pack(d, { width: 20, delta: false })), d, 'no delta');
  assert.ok(FP.pack(d, { width: 20 }).length < FP.pack(d, { width: 20, delta: false }).length, 'the id column counts up, so delta must help');
});
t('pack: checksum catches damage; maxSize and bad headers throw', function () {
  var r = rng(12), a = makeFloats(r, 'f32', 5000, 0), c = FP.pack(a, { check: true }), bad = Uint8Array.from(c);
  same(FP.unpack(c), a, 'clean'); bad[bad.length - 7] ^= 0x40; throwsFP(function () { FP.unpack(bad); }, 'flipped bit with check');
  throwsFP(function () { FP.unpack(c, { maxSize: 100 }); }, 'maxSize');
  throwsFP(function () { FP.unpack(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])); }, 'not a container');
  throwsFP(function () { FP.unpack(new Uint8Array(0)); }, 'empty');
  var v2 = Uint8Array.from(c); v2[2] = 2; throwsFP(function () { FP.unpack(v2); }, 'future version');
  throwsFP(function () { FP.pack(a, { mode: 'huge' }); }, 'bad mode');
  throwsFP(function () { FP.pack('text'); }, 'string input');
  assert.strictEqual(FP.unpack(FP.pack(a), { as: 'bytes' }).constructor, Uint8Array);
});
t('unpack: every cut and many flipped bytes throw or return exactly the right length, never hang', function () {
  var r = rng(13);
  [{ mode: 'fast' }, { mode: 'small' }, { mode: 'fast', width: 28 }].forEach(function (o) {
    var a = makeFloats(r, 'f32', 6000, 0), src = o.width ? bytesOf(a) : a, c = FP.pack(src, Object.assign({ chunk: 8192 }, o));
    for (var cut = 0; cut < c.length; cut += 13) { try { FP.unpack(c.subarray(0, cut)); assert.fail('cut ' + cut + ' accepted'); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
    for (var k = 0; k < 600; k++) {
      var f = Uint8Array.from(c); f[(r() * f.length) | 0] ^= 1 << ((r() * 8) | 0);
      try { var o2 = FP.unpack(f, { maxSize: 1 << 22 }); assert.ok(o2.byteLength <= 1 << 22); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); }
    }
  });
});
t('shuffle and unshuffle are exact inverses for every width', function () {
  var r = rng(14);
  for (var w = 1; w <= 40; w++) for (var sz = 0; sz < 3; sz++) { var d = makeBytes(r, w * 37 + sz * 5 + (sz ? 3 : 0), 0); same(FP.unshuffle(FP.shuffle(d, w), w), d, 'width ' + w + ' size ' + d.length); }
  var f = new Float32Array([1, 2, 3, 4]), s = FP.shuffle(f); assert.deepStrictEqual(Array.from(s.subarray(0, 4)), [0, 0, 0, 0]); assert.deepStrictEqual(Array.from(s.subarray(12, 16)), [0x3f, 0x40, 0x40, 0x40]);
  var odd = new Uint8Array(1000 + 1), view = odd.subarray(1); for (var i = 0; i < view.length; i++) view[i] = i; same(FP.unshuffle(FP.shuffle(view, 4), 4), view, 'unaligned view');
});
t('input views: subarrays with an offset, Buffers and ArrayBuffers are packed correctly', function () {
  var r = rng(15), big = makeBytes(r, 60000, 2), view = big.subarray(1001, 31001), buf = Buffer.from(big.buffer, big.byteOffset + 3, 20000);
  same(FP.unpack(FP.pack(view, { width: 4, shuffle: true })), view, 'offset view'); same(FP.unpack(FP.pack(buf)), buf, 'Buffer'); same(FP.unpack(FP.pack(big.buffer.slice(0, 50000))), big.subarray(0, 50000), 'ArrayBuffer');
  var f = new Float32Array(big.buffer.slice(0, 40000)).subarray(7, 5000); same(FP.unpack(FP.pack(f)), f, 'float32 subarray');
});

t('WebAssembly and plain JavaScript give the same bytes (compressed output, not just the round trip)', function () {
  if (JS_ONLY || !FP.accelerated()) { console.log('  (skipped: WebAssembly not on)'); return; }
  var r = rng(16);
  for (var k = 0; k < 60; k++) {
    var cnt = (r() * 40000) | 0, src = k % 3 === 0 ? makeFloats(r, 'f32', cnt, (r() * 4) | 0) : k % 3 === 1 ? makeFloats(r, 'f64', cnt, (r() * 4) | 0) : makeBytes(r, cnt, (r() * 5) | 0);
    var o = { chunk: [4096, 10000, 1 << 20][k % 3] }; if (k % 4 === 0) o.width = [3, 4, 8, 12, 28, 'auto'][k % 6];
    if (k % 2) { o.mode = 'small'; o.level = [1, 2, 3, 4, 6, 9][k % 6]; }
    var a = FP.pack(src, Object.assign({ wasm: false }, o)), b = FP.pack(src, o);
    same(a, b, 'pack ' + k); same(FP.unpack(a), src, 'wasm unpack of js pack ' + k); same(FP.unpack(b, { wasm: false }), src, 'js unpack of wasm pack ' + k);
    var bytes = bytesOf(src); if (bytes.length >= 64) same(FP.lz4Compress(bytes, { wasm: false }), FP.lz4Compress(bytes), 'lz4 ' + k);
    if (bytes.length >= 4) { var lv = [1, 2, 3, 4, 6, 9][k % 6]; same(FP.deflate(bytes, { level: lv, wasm: false }), FP.deflate(bytes, { level: lv }), 'deflate level ' + lv + ' case ' + k); same(FP.inflate(zlib.deflateRawSync(bytes), { size: bytes.length, wasm: false }), FP.inflate(zlib.deflateRawSync(bytes), { size: bytes.length }), 'inflate case ' + k); }
  }
});
t('unpack into a buffer you already have', function () {
  var r = rng(17), a = makeFloats(r, 'f32', 30000, 0), target = new Float32Array(a.length), got = FP.unpack(FP.pack(a), { into: target });
  assert.strictEqual(got, target); same(target, a, 'into');
  throwsFP(function () { FP.unpack(FP.pack(a), { into: new Float32Array(5) }); }, 'wrong size');
  var big = new Uint8Array(a.byteLength + 3), view = big.subarray(3); FP.unpack(FP.pack(a, { mode: 'small', width: 4 }), { into: view }); same(view, bytesOf(a), 'unaligned target');
});

// ---- fuzz: random data, random options, both modes, with a known seed so a failure can be replayed
t('view: every chunk restores exactly, alone, into a buffer you pass, in both coders and both code paths', function () {
  var r = rng(404), n = 28 * 9000, src = new Uint8Array(n), i;
  for (i = 0; i < n; i++) src[i] = (i % 28 < 12) ? (i * 7 + ((r() * 4) | 0)) & 255 : (r() * 256) | 0;
  [{ mode: 'fast' }, { mode: 'small' }, { mode: 'fast', wasm: false }, { mode: 'small', wasm: false }, { mode: 'fast', width: 28, chunk: 50000 }, { mode: 'small', width: 28, chunk: 50000, check: true }].forEach(function (o) {
    var packed = FP.pack(src, o), v = FP.view(packed, { wasm: o.wasm }), buf = new Uint8Array(v.chunkBytes), got = 0, k;
    assert.strictEqual(v.size, n); assert.strictEqual(v.packedBytes, packed.length);
    for (k = v.chunks - 1; k >= 0; k--) {     // backwards, to show the order does not matter
      var want = src.subarray(k * v.chunkBytes, k * v.chunkBytes + v.chunkLength(k)), a = FP.view(packed).read(k), b = v.read(k, buf);
      same(a, want, JSON.stringify(o) + ' chunk ' + k); same(b.subarray(0, want.length), want, 'into ' + k); got += want.length;
    }
    assert.strictEqual(got, n);
  });
  var empty = FP.view(FP.pack(new Uint8Array(0))); assert.strictEqual(empty.chunks, 0);
});
t('view: bad chunk numbers, a too-small buffer, damaged and cut-off containers throw a MemoryCompression error', function () {
  var packed = FP.pack(new Float32Array(5000).map(function (x, i) { return i * 0.25; })), v = FP.view(packed);
  [-1, v.chunks, 1.5, NaN].forEach(function (i) { throwsFP(function () { v.read(i); }, 'chunk ' + i); });
  throwsFP(function () { v.read(0, new Uint8Array(3)); }, 'small buffer');
  throwsFP(function () { FP.view(new Uint8Array(10)); }, 'not a container');
  for (var cut = 0; cut < packed.length; cut += 5) { try { var w = FP.view(packed.subarray(0, cut)); for (var k = 0; k < w.chunks; k++) w.read(k); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
  var r = rng(405); for (var q = 0; q < 300; q++) { var f = Uint8Array.from(packed); f[(r() * f.length) | 0] ^= 1 << ((r() * 8) | 0); try { var w2 = FP.view(f, { maxSize: 1 << 22 }); for (var k2 = 0; k2 < w2.chunks; k2++) w2.read(k2); } catch (e) { assert.ok(/MemoryCompression/.test(e.message), e.message); } }
});
t('fuzz: random data and options round-trip exactly (seeded)', function () {
  var cases = FULL ? 3000 : 300, seed0 = +process.env.SEED || 20261017, k;
  for (k = 0; k < cases; k++) {
    var r = rng(seed0 + k), kind = (r() * 6) | 0, cnt = (r() * 3) < 1 ? (r() * 60) | 0 : (r() * 12000) | 0, src;
    if (kind < 2) src = makeFloats(r, 'f32', cnt, (r() * 5) | 0);
    else if (kind === 2) src = makeFloats(r, 'f64', cnt, (r() * 5) | 0);
    else src = makeBytes(r, cnt, (r() * 5) | 0);
    var o = { mode: r() < 0.5 ? 'fast' : 'small', chunk: [4096, 5000, 65536, 1 << 20][(r() * 4) | 0], check: r() < 0.3 };
    if (r() < 0.4) o.width = [2, 3, 4, 7, 8, 12, 28, 'auto'][(r() * 8) | 0];
    if (r() < 0.2) o.delta = false; if (r() < 0.2) o.shuffle = true;
    if (o.mode === 'small') o.level = (r() * 10) | 0;
    var packed;
    try { packed = FP.pack(src, o); same(FP.unpack(packed), src, 'seed ' + (seed0 + k) + ' ' + JSON.stringify(o)); }
    catch (e) { e.message += '   [replay with SEED=' + (seed0 + k) + ' and one case]'; throw e; }
    if (k % 7 === 0) { // plain formats on the same bytes
      var b = bytesOf(src); same(FP.lz4Decompress(FP.lz4Compress(b), b.length), b, 'lz4 seed ' + (seed0 + k));
      var lvl = (r() * 10) | 0; same(zlib.inflateRawSync(FP.deflate(b, { level: lvl })), b, 'deflate seed ' + (seed0 + k) + ' level ' + lvl);
      same(FP.inflate(zlib.deflateRawSync(b, { level: (r() * 10) | 0 })), b, 'inflate seed ' + (seed0 + k));
    }
  }
});

console.log(n + ' checks passed' + (failed ? ', ' + failed + ' FAILED' : '') + (FULL ? ' (full fuzz)' : ' (quick fuzz; FULL=1 for more)'));
process.exitCode = failed ? 1 : 0;
