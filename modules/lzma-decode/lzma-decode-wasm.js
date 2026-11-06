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
 * Version 1.4.0 (API 1)
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
