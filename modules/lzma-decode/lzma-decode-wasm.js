/*!
 * lzma-decode-wasm.js: an optional faster LZMA decoder written in WebAssembly (about 4 KB, built from wasm/lzma-decode.c with wasm/build.sh).
 * Load lzma-decode.js first, then this file. It gives the same bytes as lzmaDecode for the same input; only the speed differs.
 * First decode of a 572 KB page: about 2 to 4 times faster in Chromium and Firefox, about 1.5 times in WebKitGTK and GNOME Web (numbers in README.md).
 * It needs a page that allows WebAssembly (the policy word is wasm-unsafe-eval); when the page does not allow it, or the browser has no WebAssembly,
 * or the settings are lc + lp > 4, or the input is bad, the call is handed to the JavaScript decoder, so it works everywhere and throws the same errors.
 *
 *   lzmaDecodeWasm(src, outSize, opts)   same arguments and result as lzmaDecode (opts: lc, lp, pb, maxSize); the result is a Uint8Array of its own
 *   lzmaDecodeWasm.file(bytes, size, opts)   same as lzmaDecode.file
 *   lzmaDecodeWasm.available    true when this file found WebAssembly usable on this page
 *   lzmaDecodeWasm.engine       'wasm' or 'js': which decoder the last call used
 *
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
 */

(function (root, factory) {
  var core = typeof module === 'object' && module.exports ? require('./lzma-decode.js') : root.lzmaDecode;
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.lzmaDecodeWasm = api;
}(typeof self !== 'undefined' ? self : this, function (jsDecode) {
  'use strict';
  if (!jsDecode) throw new Error('lzma-decode-wasm.js: load lzma-decode.js first');
  var mod = null;
  try {
    var txt = atob(/*WASM:BEGIN*/'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'/*WASM:END*/), bytes = new Uint8Array(txt.length);
    for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
    mod = new WebAssembly.Module(bytes);
    new WebAssembly.Instance(mod, {});     // some engines only refuse here when the page's policy forbids WebAssembly
  } catch (e) { mod = null; }

  function fallback(src, outSize, opts) {
    decode.engine = 'js';
    return jsDecode(src, outSize, opts);
  }

  function decode(src, outSize, opts) {
    opts = opts || {};
    var lc = opts.lc === undefined ? 4 : opts.lc, lp = opts.lp === undefined ? 0 : opts.lp, pb = opts.pb === undefined ? 0 : opts.pb;
    if (!mod) return fallback(src, outSize, opts);
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
      n = ex.lzma_decode(at, src.length, outAt, outSize, lc, lp, pb);
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

  decode.available = !!mod;
  decode.engine = null;
  return decode;
}));
