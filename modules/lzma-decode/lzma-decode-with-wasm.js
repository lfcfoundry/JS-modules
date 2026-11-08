/*! lzma-decode-with-wasm.js: lzma-decode.js and lzma-decode-wasm.js in one file. lzmaDecode(...) here tries the WebAssembly decoder first and uses the JavaScript decoder
 * when WebAssembly is not usable (the page policy lacks 'wasm-unsafe-eval', or an old browser), so it always works and gives the same bytes. lzmaDecode.plain is the JavaScript decoder alone;
 * lzmaDecodeWasm is another name for lzmaDecode. Built by wasm/join.js from the two files named above: edit those, not this one. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.7.0 (API 1) */
/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.7.0 (API 1) */

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
function lzmaBit(P, src, i, S) {   // rarely used single-bit decodes share this one code site, so it sees full-range values early (no "not a Smi" deopts)
  var range = S[0], code = S[1], p = P[i], bound = Math.imul(range >>> 11, p), b;
  if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; }
  if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[S[2]++]; }
  S[0] = range; S[1] = code; return b;
}
function lzmaMatchStep(P, src, out, S, posState, outSize) {   // a match or a repeat: kept out of the main loop so the loop stays small and gets optimized sooner
  var range = S[0], code = S[1], ip = S[2], op = S[3], state = S[4], rep0 = S[5] >>> 0, rep1 = S[6] >>> 0, rep2 = S[7] >>> 0, rep3 = S[8] >>> 0, i, p, bound, b, len, slot, nb, dist, x, k, m, c, L, r;
    { i = 192 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
    if (b) {
      { i = 204 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
      if (!b) {
        { i = 240 + (state << 4) + posState; { S[0] = range; S[1] = code; S[2] = ip; b = lzmaBit(P, src, i, S); range = S[0]; code = S[1]; ip = S[2]; } }
        if (!b) {
          if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
          state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; { S[0] = range; S[1] = code; S[2] = ip; S[3] = op; S[4] = state; S[5] = rep0; S[6] = rep1; S[7] = rep2; S[8] = rep3; return; }
        }
      } else {
        { i = 216 + state; { S[0] = range; S[1] = code; S[2] = ip; b = lzmaBit(P, src, i, S); range = S[0]; code = S[1]; ip = S[2]; } }
        if (!b) dist = rep1;
        else { { i = 228 + state; { S[0] = range; S[1] = code; S[2] = ip; b = lzmaBit(P, src, i, S); range = S[0]; code = S[1]; ip = S[2]; } } if (!b) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
        rep1 = rep0; rep0 = dist;
      }
      L = 1333; state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      L = 819; state = state < 7 ? 7 : 10;
    }
    // length
    { i = L; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
    if (!b) { L += 2 + (posState << 3); c = 3; len = 0; }
    else { { i = L + 1; { S[0] = range; S[1] = code; S[2] = ip; b = lzmaBit(P, src, i, S); range = S[0]; code = S[1]; ip = S[2]; } } if (!b) { L += 130 + (posState << 3); c = 3; len = 8; } else { L += 258; c = 8; len = 16; } }
    for (m = 1, k = c; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; }
    len += m - (1 << c);
    if (state === 7 || state === 10) {
      L = 432 + ((len < 4 ? len : 3) << 6);
      for (m = 1, k = 6; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; }
      slot = m - 64;
      if (slot < 4) rep0 = slot;
      else {
        nb = (slot >> 1) - 1; dist = (2 | (slot & 1)) << nb;
        if (slot < 14) { L = 688 + dist - slot; c = nb; }
        else {
          for (x = 0, k = nb - 4; k--;) {
            range >>>= 1; b = (code ^ -2147483648) >= (range ^ -2147483648) ? 1 : 0; if (b) code = (code - range) | 0;
            if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; }
            x = (x << 1) | b;
          }
          dist += x << 4; L = 803; c = 4;
        }
        for (m = 1, r = 0, k = 0; k < c; k++) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; r |= b << k; }
        rep0 = (dist + r) >>> 0;
      }
    }
    if (rep0 === 0xFFFFFFFF) throw new Error('LZMA: the end marker came before ' + outSize + ' bytes were decoded');
    if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
    len += 2; if (len > 24 && rep0 >= len) { if (op + len > outSize) len = outSize - op; out.copyWithin(op, op - rep0 - 1, op - rep0 - 1 + len); op += len; } else for (; len--; op++) out[op] = out[op - rep0 - 1];
  S[0] = range; S[1] = code; S[2] = ip; S[3] = op; S[4] = state; S[5] = rep0; S[6] = rep1; S[7] = rep2; S[8] = rep3;
}

function lzmaDecode(src, outSize, opts) {
  opts = opts || {};
  var lc = opts.lc === undefined ? 4 : opts.lc, lp = opts.lp === undefined ? 0 : opts.lp, pb = opts.pb === undefined ? 0 : opts.pb;
  if (!(lc >= 0 && lc <= 8 && lp >= 0 && lp <= 4 && pb >= 0 && pb <= 4)) throw new Error('LZMA: lc 0-8, lp 0-4 and pb 0-4 are supported');   // lean-cut
  if (opts.maxSize !== undefined && !(outSize <= opts.maxSize)) throw new Error('LZMA: the result would be ' + outSize + ' bytes, more than the allowed maxSize of ' + opts.maxSize);   // lean-cut
  var out = new Uint8Array(outSize), ip = 0, op = 0, slen = src.length;
  var range = -1, code = 0;
  var state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  var pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
  // one probability array; offsets of each part
  var IM = 0, IR = IM + 192, IG0 = IR + 12, IG1 = IG0 + 12, IG2 = IG1 + 12, IRL = IG2 + 12, PS = IRL + 192, PSP = PS + 256, AL = PSP + 115, LEN = AL + 16, RLEN = LEN + 514, LIT = RLEN + 514;
  var P = new Uint16Array(LIT + (0x300 << (lc + lp))).fill(1024);
  var S = new Int32Array(9);
  var i, posState, prev, base, sym, matchByte, matchBit, len, slot, nb, dist, x, k, b, p, bound, m, c, L, r;
  for (i = 0; i < 4; i++) code = (code << 8) | (ip < slen ? src[ip] : 0), ip++;
  while (op < outSize) {
    if (ip > slen) throw new Error('LZMA: the compressed data ended early');
    posState = op & pbMask;
    { i = IM + (state << 4) + posState; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
    if (!b) {
      prev = op ? out[op - 1] : 0;
      base = LIT + 0x300 * (((op & lpMask) << lc) + (prev >> (8 - lc))); sym = 1;
      if (state >= 7) {
        matchByte = out[op - rep0 - 1];
        do {
          matchBit = (matchByte >> 7) & 1; matchByte <<= 1;
          { i = base + ((1 + matchBit) << 8) + sym; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
          sym = (sym << 1) | b;
          if (matchBit !== b) break;
        } while (sym < 256);
      }
      while (sym < 256) { { i = base + sym; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } sym = (sym << 1) | b; }
      out[op++] = sym;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
    } else {
      S[0] = range; S[1] = code; S[2] = ip; S[3] = op; S[4] = state; S[5] = rep0; S[6] = rep1; S[7] = rep2; S[8] = rep3;
      lzmaMatchStep(P, src, out, S, posState, outSize);
      range = S[0]; code = S[1]; ip = S[2]; op = S[3]; state = S[4]; rep0 = S[5] >>> 0; rep1 = S[6] >>> 0; rep2 = S[7] >>> 0; rep3 = S[8] >>> 0;
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

/* lzmaDecode.warm(): optional, never called for you. Decodes a built-in 16 KB sample (6.8 KB packed, made-up text) once, so the browser's JavaScript engine has already optimized the decoder
   when your real unpack comes. Call it from an idle callback (about 6-8 ms of work); the first plain-JavaScript unpack then took 0.91 (Chromium 156), 0.96 (Firefox 158) and 0.94 (WebKitGTK 2.52.6)
   of the time without it. Returns true after the sample decoded to its exact length. Nothing else changes: an unpack gives the same bytes with or without it. */
var lzmaWarmData = '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';
function lzmaWarm() {
  var t = typeof atob === 'function' ? atob(lzmaWarmData) : typeof Buffer === 'function' ? Buffer.from(lzmaWarmData, 'base64').toString('latin1') : null, z, i;
  if (t === null) return false;
  z = new Uint8Array(t.length); for (i = 0; i < t.length; i++) z[i] = t.charCodeAt(i);
  return lzmaDecodeFile(z, 16384).length === 16384;
}
lzmaDecode.warm = lzmaWarm;

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
 * Version 1.7.0 (API 1)
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
  decode.warm = jsDecode.warm;     // warms the JavaScript decoder only (the WebAssembly one needs no warm-up)
  decode.plain = jsDecode;     // the JavaScript decoder itself, for a caller that wants no WebAssembly at all
  Object.defineProperty(decode, 'available', { get: function () { return !!ensure(); }, enumerable: true });
  decode.ready = function () { return early.then(function () { return !!mod; }); };     // a promise: true once the early compile worked, false when WebAssembly cannot be used here
  decode.module = function () { return mod; };     // the compiled WebAssembly.Module once ready, else null: send it to a worker with postMessage so the worker does not compile it again
  decode.engine = null;
  return decode;
}));

/* from here on lzmaDecode means "WebAssembly first": in a page the plain global is replaced; in Node module.exports already is the WebAssembly-first function */
if (typeof module === 'undefined' || !module.exports) (typeof globalThis !== 'undefined' ? globalThis : this).lzmaDecode = lzmaDecodeWasm;
