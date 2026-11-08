/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.7.1 (API 1) */

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

/* lzmaDecode.warm(): optional, never called for you. Decodes a built-in 16 KB sample (6.1 KB packed; code and markdown from our own MIT repositories) once, so the browser's JavaScript engine has already optimized the decoder
   when your real unpack comes. Call it from an idle callback (about 6-13 ms of work); the first plain-JavaScript unpack then took 0.73 (Chromium 156), 0.83 (Firefox 158), 0.89 (WebKitGTK 2.52.6) and 0.86 (Android Chrome 156)
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
