// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ zstd on top of a wasm instance (wasm/zstd-glue.c)
  function makeZstd(inst) {
    var X = inst.exports, mem = X.memory, inP = 0, inCap = 0, outP = 0, outCap = 0;
    function view(p, n) { return new Uint8Array(mem.buffer, p, n); }
    function ensureIn(n) { if (n > inCap) { if (inP) X.free(inP); inCap = Math.max(n, inCap * 2, 65536); inP = X.malloc(inCap); if (!inP) { inCap = 0; throw new Error('out of wasm memory'); } } }
    function ensureOut(n) { if (n > outCap) { if (outP) X.free(outP); outCap = Math.max(n, outCap * 2, 65536); outP = X.malloc(outCap); if (!outP) { outCap = 0; throw new Error('out of wasm memory'); } } }
    function contentSize(src) {
      ensureIn(Math.min(src.length, 32)); view(inP, Math.min(src.length, 32)).set(src.subarray(0, 32));
      var n = X.content_size(inP, Math.min(src.length, 32)); return n === 0xFFFFFFFF ? -1 : n;
    }
    // decompressed bytes as a view into wasm memory: valid until the next call on this instance
    function decompressView(src, outLen) {
      if (outLen == null) outLen = contentSize(src); if (outLen < 0) throw new Error('zstd: unknown content size');
      ensureIn(src.length); view(inP, src.length).set(src); ensureOut(outLen);
      var r = X.decompress(outP, outLen, inP, src.length);
      if (X.is_error(r) || r !== outLen) throw new Error('zstd: damaged data');
      return view(outP, outLen);
    }
    var api = {
      contentSize: contentSize,
      decompressView: decompressView,
      decompress: function (src, outLen) { return decompressView(src, outLen).slice(); },
      heapUsed: function () { return X.heap_used(); },
      hasEncoder: !!X.compress
    };
    // checksums computed inside the module (rebuilds from wasm/zstd-glue.c); the input goes through the module's input buffer in pieces of up to 4 MB
    if (X.crc32) api.crc32 = function (b) {
      var o, n, c = 0; for (o = 0; o < b.length; o += 4194304) { n = Math.min(4194304, b.length - o); ensureIn(n); view(inP, n).set(b.subarray(o, o + n)); c = X.crc32(inP, n, c) >>> 0; } return c;
    };
    if (X.xxh64) api.xxh64 = function (b) {   // XXH64, seed 0, of the whole input in one piece: [low 32 bits, high 32 bits]
      ensureIn(b.length); view(inP, b.length).set(b); var lo = X.xxh64(inP, b.length) >>> 0; return [lo, X.xxh64_hi() >>> 0];
    };
    // about 2,048 evenly spaced bytes: at least 85% printable ASCII, newline or zero
    function textLike(b) { var st = Math.max(1, (b.length / 2048) | 0), n = 0, p = 0, q, c; for (q = 0; q < b.length; q += st) { c = b[q]; n++; if ((c >= 32 && c < 127) || c === 10 || c === 0) p++; } return p >= n * 0.85; }
    if (X.compress) {
      // most: when given, the caller only wants the frame if it takes at most that many bytes; null otherwise (zstd stops at the block that overflows, and a frame that fits is the same bytes)
      api.compress = function (src, level, windowLog, most) {
        ensureIn(src.length); view(inP, src.length).set(src); var cap = X.bound(src.length); ensureOut(cap);
        var lim = most != null && most + (most >> 2) + 256 < cap ? Math.max(0, most) : 0, dcap = lim ? lim + (lim >> 2) + 256 : cap;   // zstd stores a block raw when its output space is tight, so it gets a quarter more room than asked and a fit is judged after
        if (X.tune && (level == null || level === 3) && !windowLog && src.length >= MIN_SAMPLED && textLike(src)) return tuned(src, cap, lim, dcap);
        var r = X.compress(outP, dcap, inP, src.length, level == null ? 3 : level, windowLog || 0);
        if (lim && (X.is_error(r) || r > lim)) return null;
        if (X.is_error(r)) throw new Error('zstd: compress failed');
        return view(outP, r).slice();
      };
      // text-like frames at the default level: level 3 against two finer settings (fast strategy, 2^18 hash, shortest match 6 or 7).
      // A frame over 256 KB is judged on its middle 128 KB and compressed once with the winner; a smaller one is compressed all three ways and the smallest kept.
      // Logs 3.6% smaller, FHIR 1.0%, events 0.4%, pack time unchanged; the reader needs nothing new (plain zstd frames).
      var TUNES = [[0, 0, 0, 0], [1, 18, 0, 6], [1, 18, 0, 7]], SAMPLE = 131072, MIN_SAMPLED = 262144;
      var tuned = function (src, cap, lim, dcap) {
        var i, r, best = -1, size = Infinity, out = null;
        if (src.length >= MIN_SAMPLED) {
          var sl = Math.min(SAMPLE, src.length >> 3), so = (src.length >> 1) - (sl >> 1);
          for (i = 0; i < TUNES.length; i++) { X.tune(TUNES[i][0], TUNES[i][1], TUNES[i][2], TUNES[i][3]); r = X.compress(outP, cap, inP + so, sl, 3, 0); if (!X.is_error(r) && r < size) { size = r; best = i; } else if (i) break; }   // the next setting is tried only when the one before it won
          X.tune(TUNES[best][0], TUNES[best][1], TUNES[best][2], TUNES[best][3]); r = X.compress(outP, lim ? dcap : cap, inP, src.length, 3, 0); X.tune(0, 0, 0, 0);
          if (lim && (X.is_error(r) || r > lim)) return null;
          if (X.is_error(r)) throw new Error('zstd: compress failed');
          return view(outP, r).slice();
        }
        for (i = 0; i < TUNES.length; i++) { X.tune(TUNES[i][0], TUNES[i][1], TUNES[i][2], TUNES[i][3]); r = X.compress(outP, cap, inP, src.length, 3, 0); if (!X.is_error(r) && (!out || r < out.length)) out = view(outP, r).slice(); }
        X.tune(0, 0, 0, 0);
        if (!out) throw new Error('zstd: compress failed');
        return out;
      };
      api.release = function () { X.release(); if (inP) X.free(inP); if (outP) X.free(outP); inP = outP = 0; inCap = outCap = 0; };
    }
    return api;
  }
