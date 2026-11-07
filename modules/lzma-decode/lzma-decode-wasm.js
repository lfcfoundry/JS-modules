/*!
 * lzma-decode-wasm.js: an optional faster LZMA decoder written in WebAssembly (about 4 KB, built from wasm/lzma-decode.c with wasm/build.sh).
 * Load lzma-decode.js first, then this file. It gives the same bytes as lzmaDecode for the same input; only the speed differs.
 * First decode of a 572 KB page: about 2 to 4 times faster in Chromium and Firefox, about 1.5 times in WebKitGTK and GNOME Web (numbers in README.md).
 * It needs a page that allows WebAssembly (the policy word is wasm-unsafe-eval); when the page does not allow it, or the browser has no WebAssembly,
 * or the settings are lc + lp > 4, or the input is bad, the call is handed to the JavaScript decoder, so it works everywhere and throws the same errors.
 *   lzmaDecodeWasm(src, outSize, opts)   same arguments and result as lzmaDecode (opts: lc, lp, pb, maxSize); the result is a Uint8Array of its own
 *   lzmaDecodeWasm.file(bytes, size, opts)   same as lzmaDecode.file
 *   lzmaDecodeWasm.available    true when this file found WebAssembly usable on this page (asks the engine now)
 *   .ready() a promise, true once the wasm compiled in the background (starts at load); .module() the compiled module or null (for postMessage to a worker)
 *   lzmaDecodeWasm.engine       'wasm' or 'js': which decoder the last call used;  .plain  the JavaScript decoder alone (lzmaDecode from lzma-decode.js)
 *
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.5.0 (API 1)
 */

(function (root, factory) {
  var core = typeof lzmaDecode === 'function' ? lzmaDecode : typeof module === 'object' && module.exports ? require('./lzma-decode.js') : root.lzmaDecode;     // in lzma-decode-with-wasm.js the plain decoder sits right above
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.lzmaDecodeWasm = api;
}(typeof self !== 'undefined' ? self : this, function (jsDecode) {
  'use strict';
  if (!jsDecode) throw new Error('lzma-decode-wasm.js: load lzma-decode.js first');
  var mod = null, settled = false, early = null;
  var bin = null;     // the decoded program, kept only until it is compiled once
  function wasmBytes() {
    if (bin) return bin;
    var src = /*WASM:BEGIN*/'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'/*WASM:END*/;
    if (typeof Uint8Array.fromBase64 === 'function') return (bin = Uint8Array.fromBase64(src));
    var txt = atob(src), bytes = new Uint8Array(txt.length);
    for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
    return (bin = bytes);
  }
  function accept(m) {     // keep m only if the page lets it start: some engines only refuse at the first Instance when the policy forbids WebAssembly
    settled = true; bin = null;
    try { new WebAssembly.Instance(m, {}); mod = m; } catch (e) { mod = null; }
    return mod;
  }
  function ensure() {     // the first decode that finds the early compile unfinished compiles on the spot, as before
    if (settled) return mod;
    try { return accept(new WebAssembly.Module(wasmBytes())); } catch (e) { settled = true; bin = null; return (mod = null); }
  }
  /* compile early: the engine compiles on another thread as soon as this file loads; the page keeps running and the first decode only starts the module */
  if (typeof WebAssembly !== 'object' || !WebAssembly || typeof WebAssembly.Module !== 'function') settled = true;     // no WebAssembly at all: decided now, as before
  try {
    early = typeof WebAssembly === 'object' && WebAssembly && typeof WebAssembly.compile === 'function'
      ? WebAssembly.compile(wasmBytes()).then(function (m) { return settled ? mod : accept(m); }, function () { if (!settled) { settled = true; bin = null; mod = null; } return mod; }) : Promise.resolve(null);
  } catch (e) { early = Promise.resolve(null); }

  function fallback(src, outSize, opts) {
    decode.engine = 'js';
    return jsDecode(src, outSize, opts);
  }

  var CHUNK = 65536;
  function decode(src, outSize, opts) {
    opts = opts || {};
    var lc = opts.lc === undefined ? 4 : opts.lc, lp = opts.lp === undefined ? 0 : opts.lp, pb = opts.pb === undefined ? 0 : opts.pb;
    if (!ensure()) return fallback(src, outSize, opts);
    // anything the wasm side does not take goes to the JavaScript decoder, which also owns every error message
    if (!((lc | 0) === lc && (lp | 0) === lp && (pb | 0) === pb && lc >= 0 && lp >= 0 && lc + lp <= 4 && pb <= 4 && (outSize | 0) === outSize && outSize >= 0 && outSize < 0x40000000) ||
        src.length >= 0x40000000 || (opts.maxSize !== undefined && !(outSize <= opts.maxSize))) return fallback(src, outSize, opts);
    var n = -3, mem, u8, at, outAt;
    try {
      var ex = new WebAssembly.Instance(mod, {}).exports;
      mem = ex.memory;
      at = ex.__heap_base.value || ex.__heap_base;     // an exported global is a WebAssembly.Global; its .value is the address
      outAt = at + ((src.length + 15) & ~15);
      var need = outAt + outSize + 16;
      if (mem.buffer.byteLength < need) mem.grow(Math.ceil((need - mem.buffer.byteLength) / 65536));
      new Uint8Array(mem.buffer).set(src, at);
      n = ex.lzma_begin(at, src.length, outAt, outSize, lc, lp, pb);
      for (var done = 0; !n;) {     // 64 KB of output per call: the browser moves to its optimized code between calls (one long call stays on the slower first code)
        done = done + CHUNK < outSize ? done + CHUNK : outSize;
        n = ex.lzma_more(done);
        if (n < 0 || n >= outSize) break;
        n = 0;
      }
    } catch (e) { n = -3; }     // out of memory, for one
    if (n !== outSize) return fallback(src, outSize, opts);
    decode.engine = 'wasm';
    return new Uint8Array(mem.buffer, outAt, outSize).slice();     // a copy, so the 2x memory of the run is freed and the result stands alone
  }

  decode.file = function (bytes, size, opts) {     // same header handling as lzmaDecode.file in lzma-decode.js
    var d, lc, lp, pb, i, unknown = true, high = false;
    if (bytes.length < 14) return jsDecode.file(bytes, size, opts);     // the JavaScript decoder owns the error messages
    d = bytes[0]; lc = d % 9; d = (d - lc) / 9; lp = d % 5; pb = (d - lp) / 5;
    for (i = 5; i < 13; i++) if (bytes[i] !== 255) unknown = false;
    for (i = 9; i < 13; i++) if (bytes[i]) high = true;
    if (unknown ? size === undefined : high) return jsDecode.file(bytes, size, opts);
    if (size === undefined) size = bytes[5] + bytes[6] * 256 + bytes[7] * 65536 + bytes[8] * 16777216;
    return decode(bytes.subarray(14), size, { lc: lc, lp: lp, pb: pb, maxSize: opts && opts.maxSize });     // byte 13 is the always-zero first stream byte
  };

  decode.plain = jsDecode;     // the JavaScript decoder itself, for a caller that wants no WebAssembly at all
  Object.defineProperty(decode, 'available', { get: function () { return !!ensure(); }, enumerable: true });
  decode.ready = function () { return early.then(function () { return !!mod; }); };     // a promise: true once the early compile worked, false when WebAssembly cannot be used here
  decode.module = function () { return mod; };     // the compiled WebAssembly.Module once ready, else null: send it to a worker with postMessage so the worker does not compile it again
  decode.engine = null;
  return decode;
}));
