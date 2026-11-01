/* Copyright (c) 2026 LFC Foundry. MIT License. The big wasm modules are stored deflated (since 0.4.13): checks every way they can be unpacked.
 * 1. Node (zlib), as the other checks run. 2. No zlib, no Buffer and no fromBase64, as an old browser: the built-in JS inflater, sync and async.
 * 3. The deflated text unpacks to exactly the bytes in wasm/*.wasm. Run: node modules/lfc-pack/test/inflate.cjs */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const here = path.join(__dirname, '..'), src = fs.readFileSync(path.join(here, 'lfc-pack.js'), 'utf8');
const lit = JSON.parse(/\/\*WASM:BEGIN\*\/(\{.*?\})\/\*WASM:END\*\//s.exec(src)[1]);
const files = { 'zstd-dec': 'zstd-dec.wasm', 'zstd-full': 'zstd-full.wasm', 'core': 'core.wasm', 'core-plain': 'core-plain.wasm' };
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
for (const k in files) {
  const b = Buffer.from(lit[k], 'base64'), want = fs.readFileSync(path.join(here, 'wasm', files[k]));
  ok(b.readUInt32LE(0) === want.length, k + ': stored size'); ok(zlib.inflateRawSync(b.subarray(4)).equals(want), k + ': deflated bytes unpack to wasm/' + files[k]);
}
(async () => {
  const rows = []; for (let i = 0; i < 3000; i++) rows.push({ id: i, name: 'n' + (i % 40), v: i * 1.25, t: 'x' + (i % 7) }); const txt = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const N = require('../lfc-pack.js'); await N.init(); const want = Buffer.from(N.pack(txt));
  // an old-browser-like context: no require, no Buffer, no Uint8Array.fromBase64, no DecompressionStream
  const U8 = function () {}; const ctx = { WebAssembly, TextEncoder, TextDecoder, atob, console, setTimeout, clearTimeout, Promise, Math, Date, JSON, Object, Array, Error, TypeError, RangeError, Map, Set, WeakMap, Symbol, Number, String, Boolean, DataView, ArrayBuffer, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, BigInt, BigInt64Array, BigUint64Array, performance, queueMicrotask };
  ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext('var __fb = Uint8Array.fromBase64; Uint8Array.fromBase64 = undefined;', ctx);
  vm.runInContext(src, ctx);
  vm.runInContext('Uint8Array.fromBase64 = __fb;', ctx);
  const L = ctx.LfcPack; ok(!!L, 'LfcPack global in the plain context');
  if (L) {
    await L.init(); const got = Buffer.from(L.pack(txt)); ok(got.equals(want), 'JS inflater: same file as with zlib');
    ok(L.unpack(L.pack(txt)).length === 3000, 'JS inflater: round trip'); L.trim(); ok(Buffer.from(L.pack(txt)).equals(want), 'JS inflater: after trim()');
  }
  console.log(bad ? bad + ' FAILED' : 'inflate: all passed (4 modules, zlib and JS inflater)'); process.exit(bad ? 1 : 0);
})();
