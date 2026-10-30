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
    if (X.compress) {
      api.compress = function (src, level, windowLog) {
        ensureIn(src.length); view(inP, src.length).set(src); var cap = X.bound(src.length); ensureOut(cap);
        var r = X.compress(outP, cap, inP, src.length, level == null ? 3 : level, windowLog || 0);
        if (X.is_error(r)) throw new Error('zstd: compress failed');
        return view(outP, r).slice();
      };
      api.release = function () { X.release(); if (inP) X.free(inP); if (outP) X.free(outP); inP = outP = 0; inCap = outCap = 0; };
    }
    return api;
  }
