/*! lzma-decode-with-wasm.js: lzma-decode.js and lzma-decode-wasm.js in one file. lzmaDecode(...) here tries the WebAssembly decoder first and uses the JavaScript decoder
 * when WebAssembly is not usable (the page policy lacks 'wasm-unsafe-eval', or an old browser), so it always works and gives the same bytes. lzmaDecode.plain is the JavaScript decoder alone;
 * lzmaDecodeWasm is another name for lzmaDecode. Built by wasm/join.js from the two files named above: edit those, not this one. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.3.0 (API 1) */
/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.3.0 (API 1) */

/* Decodes a raw LZMA1 stream (no .lzma header) into a Uint8Array.

     lzmaDecode(src, outSize, opts)
       src      Uint8Array: the compressed bytes, WITHOUT the leading zero byte every LZMA stream starts with
                (a raw stream made by liblzma/xz starts "00 xx xx xx xx": drop the first byte)
       outSize  the exact number of bytes the result has (the decoder stops there; an end marker, if present, is ignored)
       opts     { lc, lp, pb, maxSize }  the literal-context, literal-position and position bits the stream was made with
                (defaults 4, 0, 0: what lzma-pack's packer uses). xz's own default is lc=3, lp=0, pb=2.
                maxSize (optional): refuse to allocate more than this many bytes. Use it when outSize comes from a file you did not
                pack yourself: a .lzma header can ask for up to 4 GB.

     lzmaDecodeFile(bytes, size, opts)  decodes a classic .lzma file (13-byte header: properties, dictionary size, 8-byte size).
                            If the header says "size unknown" (xz and Python's lzma write that), pass the size yourself.
                            opts may carry maxSize (the other fields come from the header).

   Throws an Error on input that is cut short (noticed as soon as the decoder reads past the end, not only at the end) or points
   before the start of the output, and when outSize is more than opts.maxSize. It does not verify a checksum:
   LZMA streams have none, so check the result yourself if you need to (lzma-pack's loader does).
   Written from the LZMA specification. The probability model is the standard one: 11-bit probabilities, adaptation shift 5,
   the range coder normalizes below 2^24. The output buffer doubles as the dictionary, so there is no window limit.
   Syntax is ES5, but Uint16Array.prototype.fill (used in probs) is an ES2015 method: a browser from before 2015 lacks it.
   This file is deliberately not wrapped in a UMD function: tools/lzma-pack/pack.py cuts it where the file helper below begins and pastes
   the part above into every packed page; that helper must stay the last function. The packer also drops lines that end in the marker comment "lean-cut" and turns every error throw into a bare throw (the packed page shows its own message), so keep each such line self-contained. Keep it plain ASCII for the same reason (the packed page is read as windows-1252). */
function lzmaDecode(src, outSize, opts) {
  opts = opts || {};
  var lc = opts.lc === undefined ? 4 : opts.lc, lp = opts.lp === undefined ? 0 : opts.lp, pb = opts.pb === undefined ? 0 : opts.pb;
  if (!(lc >= 0 && lc <= 8 && lp >= 0 && lp <= 4 && pb >= 0 && pb <= 4)) throw new Error('LZMA: lc 0-8, lp 0-4 and pb 0-4 are supported');   // lean-cut
  if (opts.maxSize !== undefined && !(outSize <= opts.maxSize)) throw new Error('LZMA: the result would be ' + outSize + ' bytes, more than the allowed maxSize of ' + opts.maxSize);   // lean-cut
  var out = new Uint8Array(outSize), ip = 0, op = 0;
  var range = 0xFFFFFFFF, code = 0;            // the range coder: both stay unsigned 32-bit
  var state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;   // the match state (0-11) and the four most recent distances (minus one)
  var pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
  function probs(n) { return new Uint16Array(n).fill(1024); }   // 1024 = probability 0.5 in 11 bits
  var isMatch = probs(12 << 4), isRep = probs(12), isRepG0 = probs(12), isRepG1 = probs(12), isRepG2 = probs(12), isRep0Long = probs(12 << 4),
      posSlot = probs(4 << 6), posSpecial = probs(115), align = probs(16),
      lenCoder = probs(514), repLenCoder = probs(514),   // each: choice, choice2, 16 low trees of 8, 16 mid trees of 8, one high tree of 256
      literal = probs(0x300 << (lc + lp));
  var bitVal;                                   // scratch for rtree
  function next() { return src[ip++]; }
  function bit(a, i) {   // decode one adaptive bit with probability a[i], then move the probability toward what was seen
    var p = a[i], bound = (range >>> 11) * p, b;
    if (code < bound) { range = bound; a[i] = p + ((2048 - p) >> 5); b = 0; }
    else { range -= bound; code -= bound; a[i] = p - (p >> 5); b = 1; }
    if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | next()) >>> 0; }
    return b;
  }
  function tree(a, base, bits) {   // a bit tree, most significant bit first
    var m = 1, c = bits;
    while (c--) m = (m << 1) | bit(a, base + m);
    return m - (1 << bits);
  }
  function rtree(a, base, bits) {   // a bit tree, least significant bit first
    var m = 1, r = 0, c;
    for (c = 0; c < bits; c++) { bitVal = bit(a, base + m); m = (m << 1) | bitVal; r |= bitVal << c; }
    return r;
  }
  function length(a, posState) {   // a match length minus 2: low (0-7), mid (8-15) or high (16-271)
    if (!bit(a, 0)) return tree(a, 2 + (posState << 3), 3);
    if (!bit(a, 1)) return 8 + tree(a, 130 + (posState << 3), 3);
    return 16 + tree(a, 258, 8);
  }
  var i, posState, prev, base, sym, matchByte, matchBit, len, slot, nb, dist, x, k, b;
  for (i = 0; i < 4; i++) code = (code * 256 + next()) >>> 0;   // the first 4 bytes of the stream seed the range coder
  while (op < outSize) {
    if (ip > src.length) throw new Error('LZMA: the compressed data ended early');   // a valid stream never reads past its end: stop at once, not after decoding garbage to the full size
    posState = op & pbMask;
    if (!bit(isMatch, (state << 4) + posState)) {   // a literal byte
      prev = op ? out[op - 1] : 0;
      base = 0x300 * (((op & lpMask) << lc) + (prev >> (8 - lc))); sym = 1;
      if (state >= 7) {   // just after a match: the byte at the last distance guides the first bits
        matchByte = out[op - rep0 - 1];
        do {
          matchBit = (matchByte >> 7) & 1; matchByte <<= 1;
          b = bit(literal, base + ((1 + matchBit) << 8) + sym); sym = (sym << 1) | b;
          if (matchBit !== b) break;
        } while (sym < 256);
      }
      while (sym < 256) sym = (sym << 1) | bit(literal, base + sym);
      out[op++] = sym;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    } else {
      if (bit(isRep, state)) {   // repeat an earlier distance
        if (!bit(isRepG0, state)) {
          if (!bit(isRep0Long, (state << 4) + posState)) {   // a "short rep": one byte at the last distance
            if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
            state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; continue;
          }
        } else {
          if (!bit(isRepG1, state)) dist = rep1;
          else { if (!bit(isRepG2, state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        len = length(repLenCoder, posState); state = state < 7 ? 8 : 11;
      } else {   // a new match: a length, then a distance
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = length(lenCoder, posState); state = state < 7 ? 7 : 10;
        slot = tree(posSlot, (len < 4 ? len : 3) << 6, 6);
        if (slot < 4) rep0 = slot;
        else {
          nb = (slot >> 1) - 1; dist = (2 | (slot & 1)) << nb;
          if (slot < 14) dist += rtree(posSpecial, dist - slot, nb);
          else {   // the middle bits are coded at probability 0.5 ("direct bits"), the last four with the align tree
            for (x = 0, k = nb - 4; k--;) {
              range >>>= 1; b = code >= range ? 1 : 0; if (b) code -= range;
              if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | next()) >>> 0; }
              x = (x << 1) | b;
            }
            dist += (x << 4) + rtree(align, 0, 4);
          }
          rep0 = dist >>> 0;
        }
      }
      if (rep0 === 0xFFFFFFFF) throw new Error('LZMA: the end marker came before ' + outSize + ' bytes were decoded');
      if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
      for (len += 2; len--; op++) out[op] = out[op - rep0 - 1];   // copy byte by byte: the source may overlap the destination
    }
  }
  if (ip > src.length) throw new Error('LZMA: the compressed data ended early');
  return out;
}

function lzmaDecodeFile(bytes, size, opts) {   // a classic .lzma file: props byte, 4-byte dictionary size, 8-byte uncompressed size, then the stream
  if (bytes.length < 14) throw new Error('LZMA: file too short');
  var d = bytes[0], lc = d % 9; d = (d - lc) / 9;
  var lp = d % 5, pb = (d - lp) / 5, i, unknown = true, high = false;
  for (i = 5; i < 13; i++) if (bytes[i] !== 255) unknown = false;
  for (i = 9; i < 13; i++) if (bytes[i]) high = true;
  if (unknown) { if (size === undefined) throw new Error('LZMA: the file does not say how big the result is: pass the size as the second argument'); }
  else if (high) throw new Error('LZMA: sizes above 4 GB are not supported');
  else if (size === undefined) size = bytes[5] + bytes[6] * 256 + bytes[7] * 65536 + bytes[8] * 16777216;
  return lzmaDecode(bytes.subarray(14), size, { lc: lc, lp: lp, pb: pb, maxSize: opts && opts.maxSize });   // byte 13 is the always-zero first stream byte
}
lzmaDecode.file = lzmaDecodeFile;

if (typeof module !== 'undefined' && module.exports) module.exports = lzmaDecode; else (typeof globalThis !== 'undefined' ? globalThis : this).lzmaDecode = lzmaDecode;

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
 * Version 1.3.0 (API 1)
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
    var txt = atob(/*WASM:BEGIN*/'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'/*WASM:END*/), bytes = new Uint8Array(txt.length);
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

  decode.plain = jsDecode;     // the JavaScript decoder itself, for a caller that wants no WebAssembly at all
  Object.defineProperty(decode, 'available', { get: function () { return !!ensure(); }, enumerable: true });
  decode.ready = function () { return early.then(function () { return !!mod; }); };     // a promise: true once the early compile worked, false when WebAssembly cannot be used here
  decode.module = function () { return mod; };     // the compiled WebAssembly.Module once ready, else null: send it to a worker with postMessage so the worker does not compile it again
  decode.engine = null;
  return decode;
}));

/* from here on lzmaDecode means "WebAssembly first": in a page the plain global is replaced; in Node module.exports already is the WebAssembly-first function */
if (typeof module === 'undefined' || !module.exports) (typeof globalThis !== 'undefined' ? globalThis : this).lzmaDecode = lzmaDecodeWasm;
