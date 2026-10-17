/* lzma-decode: a small LZMA1 decoder. MIT License, Copyright (c) 2026 LFC Foundry. https://github.com/lfcfoundry/JS-modules Version 1.1.0 (API 1) */

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
