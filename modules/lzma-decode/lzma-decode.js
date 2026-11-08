/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.6.1 (API 1) */

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
      { i = IR + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
      if (b) {
        { i = IG0 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
        if (!b) {
          { i = IRL + (state << 4) + posState; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
          if (!b) {
            if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
            state = state < 7 ? 9 : 11; out[op] = out[op - rep0 - 1]; op++; continue;
          }
        } else {
          { i = IG1 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
          if (!b) dist = rep1;
          else { { i = IG2 + state; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } if (!b) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        L = RLEN; state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        L = LEN; state = state < 7 ? 7 : 10;
      }
      // length
      { i = L; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } }
      if (!b) { L += 2 + (posState << 3); c = 3; len = 0; }
      else { { i = L + 1; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } if (!b) { L += 130 + (posState << 3); c = 3; len = 8; } else { L += 258; c = 8; len = 16; } }
      for (m = 1, k = c; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; }
      len += m - (1 << c);
      if (state === 7 || state === 10) {
        L = PS + ((len < 4 ? len : 3) << 6);
        for (m = 1, k = 6; k--;) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; }
        slot = m - 64;
        if (slot < 4) rep0 = slot;
        else {
          nb = (slot >> 1) - 1; dist = (2 | (slot & 1)) << nb;
          if (slot < 14) { L = PSP + dist - slot; c = nb; }
          else {
            for (x = 0, k = nb - 4; k--;) {
              range >>>= 1; b = (code ^ -2147483648) >= (range ^ -2147483648) ? 1 : 0; if (b) code = (code - range) | 0;
              if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; }
              x = (x << 1) | b;
            }
            dist += x << 4; L = AL; c = 4;
          }
          for (m = 1, r = 0, k = 0; k < c; k++) { { i = L + m; { p = P[i]; bound = Math.imul(range >>> 11, p); if ((code ^ -2147483648) < (bound ^ -2147483648)) { range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; } else { range = (range - bound) | 0; code = (code - bound) | 0; P[i] = p - (p >> 5); b = 1; } if (!(range >>> 24)) { range <<= 8; code = (code << 8) | src[ip++]; } } } m = (m << 1) | b; r |= b << k; }
          rep0 = (dist + r) >>> 0;
        }
      }
      if (rep0 === 0xFFFFFFFF) throw new Error('LZMA: the end marker came before ' + outSize + ' bytes were decoded');
      if (rep0 >= op) throw new Error('LZMA: distance before the start of the output');
      len += 2; if (len > 24 && rep0 >= len) { if (op + len > outSize) len = outSize - op; out.copyWithin(op, op - rep0 - 1, op - rep0 - 1 + len); op += len; } else for (; len--; op++) out[op] = out[op - rep0 - 1];
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
