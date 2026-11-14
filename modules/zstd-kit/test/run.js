/* Copyright (c) 2026 LFC Foundry. MIT License.
 * zstd-kit checks: round trips at many sizes and levels, both directions against Node's own zstd (zlib, libzstd), XXH64 test vectors,
 * CRC-32 against zlib.crc32, the decode-only build, and the error paths. Run: node modules/zstd-kit/test/run.js (about 2 s) */
'use strict';
const path = require('path'), zlib = require('zlib'), K = require('../zstd-kit.js'), D = require('../zstd-kit-dec.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
let s = 12345; const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
function sample(n, kind) {
  const b = new Uint8Array(n);
  if (kind === 'random') for (let i = 0; i < n; i++) b[i] = rnd() * 256;
  else if (kind === 'text') { const w = ['alpha', 'beta', 'gamma', '{"id":', '12', ',"v":', '3.5}', '\n', 'error', 'ok ']; let p = 0; while (p < n) { const x = w[(rnd() * w.length) | 0]; for (let k = 0; k < x.length && p < n; k++) b[p++] = x.charCodeAt(k); } }
  else for (let i = 0; i < n; i++) b[i] = (i * 7) & 15;
  return b;
}
(async () => {
  ok(K.decodeOnly === false && D.decodeOnly === true, 'decodeOnly flags');
  let threw = false; try { K.compress(new Uint8Array(1)); } catch (e) { threw = /init\(\)/.test(e.message); } ok(threw, 'calls before init() say so');
  await K.init(); await D.init(); ok(K.ready() && D.ready(), 'ready after init');
  const sizes = [0, 1, 7, 100, 4096, 65537, 300000, 2100000];
  for (const n of sizes) for (const kind of ['random', 'text', 'pattern']) {
    const b = sample(n, kind), c = K.compress(b);
    ok(eq(K.decompress(c), b), 'round trip ' + kind + ' ' + n);
    ok(eq(D.decompress(c), b), 'decode-only build opens it ' + kind + ' ' + n);
    ok(eq(new Uint8Array(zlib.zstdDecompressSync(c)), b), 'Node zstd opens it ' + kind + ' ' + n);
    ok(K.contentSize(c) === n, 'frame records its size ' + n);
    ok(eq(D.decompress(new Uint8Array(zlib.zstdCompressSync(b))), b), 'opens Node zstd frames ' + kind + ' ' + n);
  }
  const t = sample(200000, 'text');
  for (const lv of [-7, -1, 1, 3, 9, 19, 22]) { const c = K.compress(t, lv); ok(eq(K.decompress(c), t), 'level ' + lv); }
  ok(K.compress(t, 19).length < K.compress(t, 1).length, 'level 19 smaller than level 1 on text');
  for (const bad of [23, -8, 2.5, '3']) { let e = false; try { K.compress(t, bad); } catch (x) { e = x instanceof RangeError; } ok(e, 'bad level ' + bad); }
  ok(eq(K.decompress(K.compress('café ☃')), new TextEncoder().encode('café ☃')), 'string input is UTF-8');
  ok(eq(K.decompress(K.compress(new Uint16Array([1, 2, 3]))), new Uint8Array(new Uint16Array([1, 2, 3]).buffer)), 'other typed arrays as bytes');
  // a frame with no recorded size: needs the size argument
  const ns = new Uint8Array(zlib.zstdCompressSync(t, { params: { [zlib.constants.ZSTD_c_contentSizeFlag]: 0 } }));
  ok(K.contentSize(ns) === -1, 'contentSize -1 when not recorded');
  let e1 = false; try { K.decompress(ns); } catch (x) { e1 = /size/.test(x.message); } ok(e1, 'no recorded size: asks for it');
  ok(eq(K.decompress(ns, t.length), t), 'no recorded size: works with it');
  const dmg = K.compress(t).slice(); dmg[dmg.length >> 1] ^= 0x55; let e2 = false; try { K.decompress(dmg); } catch (x) { e2 = /damaged/.test(x.message); } ok(e2, 'damaged frame throws');
  let e3 = false; try { K.decompress({}); } catch (x) { e3 = x instanceof TypeError; } ok(e3, 'wrong input type throws TypeError');
  // XXH64 vectors (seed 0) from the xxHash reference and CRC-32 against zlib
  const V = [['', 'ef46db3751d8e999'], ['a', 'd24ec4f1a98c6e5b'], ['abc', '44bc2cf5ad770999'], ['Nobody inspects the spammish repetition', 'fbcea83c8a378bf1']];
  for (const [x, h] of V) { ok(K.xxh64(x) === h, 'xxh64 "' + x + '"'); ok(D.xxh64(x) === h, 'decode-only xxh64 "' + x + '"'); }
  for (const n of [0, 1, 1000, 5000000]) { const b = sample(n, 'random'); ok(K.crc32(b) === zlib.crc32(b), 'crc32 ' + n); }
  ok(K.crc32('123456789') === 0xcbf43926, 'crc32 check value');
  K.release(); ok(eq(K.decompress(K.compress(t)), t), 'works after release()');
  console.log((fail ? 'FAILED ' : 'all zstd-kit checks passed ') + pass + ' ok, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
