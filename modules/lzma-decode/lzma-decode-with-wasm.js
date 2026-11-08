/*! lzma-decode-with-wasm.js: lzma-decode.js and lzma-decode-wasm.js in one file. lzmaDecode(...) here tries the WebAssembly decoder first and uses the JavaScript decoder
 * when WebAssembly is not usable (the page policy lacks 'wasm-unsafe-eval', or an old browser), so it always works and gives the same bytes. lzmaDecode.plain is the JavaScript decoder alone;
 * lzmaDecodeWasm is another name for lzmaDecode. Built by wasm/join.js from the two files named above: edit those, not this one. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.6.0 (API 1) */
/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.6.0 (API 1) */

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
  var out = new Uint8Array(outSize), ip = 0, op = 0, slen = src.length;
  var range = -1, code = 0;   // both kept as 32-bit integers; unsigned compares flip the top bit
  var state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  var pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
  // one probability array; offsets of each part
  var IM = 0, IR = IM + 192, IG0 = IR + 12, IG1 = IG0 + 12, IG2 = IG1 + 12, IRL = IG2 + 12, PS = IRL + 192, PSP = PS + 256, AL = PSP + 115, LEN = AL + 16, RLEN = LEN + 514, LIT = RLEN + 514;
  var P = new Uint16Array(LIT + (0x300 << (lc + lp))).fill(1024);
  var i, posState, prev, base, sym, matchByte, matchBit, len, slot, nb, dist, x, k, b, p, bound, m, c, L, r;
  for (i = 0; i < 4; i++) code = (code << 8) | (ip < slen ? src[ip] : 0), ip++;
  while (op < outSize) {
    if (ip > slen) throw new Error('LZMA: the compressed data ended early');
    posState = op & pbMask;
    { i = IM + (state << 4) + posState; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
    if (!b) {
      prev = op ? out[op - 1] : 0;
      base = LIT + 0x300 * (((op & lpMask) << lc) + (prev >> (8 - lc))); sym = 1;
      if (state >= 7) {
        matchByte = out[op - rep0 - 1];
        do {
          matchBit = (matchByte >> 7) & 1; matchByte <<= 1;
          { i = base + ((1 + matchBit) << 8) + sym; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
          sym = (sym << 1) | b;
          if (matchBit !== b) break;
        } while (sym < 256);
      }
      while (sym < 256) { { i = base + sym; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } sym = (sym << 1) | b; }
      out[op++] = sym;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    } else {
      { i = IR + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
      if (b) {
        { i = IG0 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
        if (!b) {
          { i = IRL + (state << 4) + posState; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
          if (!b) {
            if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
            state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; continue;
          }
        } else {
          { i = IG1 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
          if (!b) dist = rep1;
          else { { i = IG2 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } if (!b) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        L = RLEN; state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        L = LEN; state = state < 7 ? 7 : 10;
      }
      // length
      { i = L; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } }
      if (!b) { L += 2 + (posState << 3); c = 3; len = 0; }
      else { { i = L + 1; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } if (!b) { L += 130 + (posState << 3); c = 3; len = 8; } else { L += 258; c = 8; len = 16; } }
      for (m = 1, k = c; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } m = (m << 1) | b; }
      len += m - (1 << c);
      if (state === 7 || state === 10) {
        L = PS + ((len < 4 ? len : 3) << 6);
        for (m = 1, k = 6; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } m = (m << 1) | b; }
        slot = m - 64;
        if (slot < 4) rep0 = slot;
        else {
          nb = (slot >> 1) - 1; dist = (2 | (slot & 1)) << nb;
          if (slot < 14) { L = PSP + dist - slot; c = nb; }
          else {
            for (x = 0, k = nb - 4; k--;) {
              range >>>= 1; b = (code ^ -2147483648) >= (range ^ -2147483648) ? 1 : 0; if (b) code = (code - range) | 0;
              if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; }
              x = (x << 1) | b;
            }
            dist += x << 4; L = AL; c = 4;
          }
          for (m = 1, r = 0, k = 0; k < c; k++) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | (ip < slen ? src[ip] : 0); ip++; } } } m = (m << 1) | b; r |= b << k; }
          rep0 = (dist + r) >>> 0;
        }
      }
      if (rep0 === 0xFFFFFFFF) throw new Error('LZMA: the end marker came before ' + outSize + ' bytes were decoded');
      if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
      for (len += 2; len--; op++) out[op] = out[op - rep0 - 1];
    }
  }
  if (ip > slen) throw new Error('LZMA: the compressed data ended early');
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
 * Version 1.6.0 (API 1)
 */

(function (root, factory) {
  var core = typeof lzmaDecode === 'function' ? lzmaDecode : typeof module === 'object' && module.exports ? require('./lzma-decode.js') : root.lzmaDecode;     // in lzma-decode-with-wasm.js the plain decoder sits right above
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.lzmaDecodeWasm = api;
}(typeof self !== 'undefined' ? self : this, function (jsDecode) {
  'use strict';
  if (!jsDecode) throw new Error('lzma-decode-wasm.js: load lzma-decode.js first');
  var mod = null, settled = false, early = null;
  var inst = null;    // one Instance kept between calls while its memory stays at 16 MB or less (since 1.6.0): a repeat unpack skips starting a fresh one
  var KEEP = 16777216, made = 0;
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
      var ex = inst || (made++, inst = new WebAssembly.Instance(mod, {}).exports);     // lzma_begin resets every decoder state and table, so a kept Instance gives the same bytes
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
    if (n !== outSize) { inst = null; return fallback(src, outSize, opts); }     // a failed call never keeps its Instance
    decode.engine = 'wasm';
    var out = new Uint8Array(mem.buffer, outAt, outSize).slice();     // a copy, so the result stands alone
    if (mem.buffer.byteLength > KEEP) inst = null;     // memory never shrinks: past 16 MB the Instance is dropped, and its memory with it
    return out;
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

  Object.defineProperty(decode, '_made', { get: function () { return made; } });     // test hook: how many Instances decode has started
  decode.plain = jsDecode;     // the JavaScript decoder itself, for a caller that wants no WebAssembly at all
  Object.defineProperty(decode, 'available', { get: function () { return !!ensure(); }, enumerable: true });
  decode.ready = function () { return early.then(function () { return !!mod; }); };     // a promise: true once the early compile worked, false when WebAssembly cannot be used here
  decode.module = function () { return mod; };     // the compiled WebAssembly.Module once ready, else null: send it to a worker with postMessage so the worker does not compile it again
  decode.engine = null;
  return decode;
}));

/* from here on lzmaDecode means "WebAssembly first": in a page the plain global is replaced; in Node module.exports already is the WebAssembly-first function */
if (typeof module === 'undefined' || !module.exports) (typeof globalThis !== 'undefined' ? globalThis : this).lzmaDecode = lzmaDecodeWasm;
