  // ================================================================ LZ4 on top of a wasm instance (wasm/lz4-glue.c)
  var FAIL = 0xFFFFFFFF, SMALL = 0xFFFFFFFE, MAX_IN = 0x7E000000;
  function makeLz4(inst) {
    var X = inst.exports, mem = X.memory, inP = 0, inCap = 0, outP = 0, outCap = 0;
    function view(p, n) { return new Uint8Array(mem.buffer, p, n); }
    function grab(p, cap, n) { if (p) X.free(p); var c = Math.max(n, cap * 2, 65536), q = X.malloc(c); if (!q) throw new Error('Lz4Kit: out of wasm memory'); return [q, c]; }
    function ensureIn(n) { if (n > inCap) { inCap = 0; var r = grab(inP, inCap, n); inP = r[0]; inCap = r[1]; } }
    function ensureOut(n) { if (n > outCap) { outCap = 0; var r = grab(outP, outCap, n); outP = r[0]; outCap = r[1]; } }
    function put(src) { ensureIn(src.length); view(inP, src.length).set(src); }
    function checkIn(src) { if (src.length > MAX_IN) throw new RangeError('Lz4Kit: input over 2,113,929,216 bytes (the LZ4 limit)'); }
    return {
      version: function () { var v = X.version() >>> 0; return ((v / 10000) | 0) + '.' + (((v / 100) | 0) % 100) + '.' + (v % 100); },
      // one LZ4 block (no size, no header). level 0: fast (accel 1 = default, larger is faster and bigger); 1 to 12: high compression
      block: function (src, level, accel, asView) {
        checkIn(src); put(src); var cap = X.bound(src.length); ensureOut(cap);
        var r = (level > 0 ? X.compress_hc(outP, cap, inP, src.length, level) : X.compress(outP, cap, inP, src.length, accel || 1)) >>> 0;
        if (r === FAIL) throw new Error('Lz4Kit: compress failed');
        return asView ? view(outP, r) : view(outP, r).slice();
      },
      // test hook for the 1.11.0 bug: a stream state full of `junk` bytes, LZ4_resetStreamHC at `level`, then one streamed block
      blockStream: function (src, level, junk) {
        checkIn(src); put(src); var cap = X.bound(src.length) >>> 0; ensureOut(cap);
        var r = X.compress_hc_stream(outP, cap, inP, src.length, level, junk | 0) >>> 0;
        if (r === FAIL) throw new Error('Lz4Kit: compress failed');
        return view(outP, r).slice();
      },
      unblock: function (blk, size, asView) {
        if (size > MAX_IN) throw new RangeError('Lz4Kit: size over 2,113,929,216 bytes');
        put(blk); ensureOut(size); var r = X.decompress(outP, size, inP, blk.length) >>> 0;
        if (r === FAIL || r !== size) throw new Error('Lz4Kit: damaged block, or the size does not match');
        return asView ? view(outP, size) : view(outP, size).slice();
      },
      frame: function (src, level, asView) {
        checkIn(src); put(src); var cap = X.frame_bound(src.length) >>> 0; ensureOut(cap);
        var r = X.frame_compress(outP, cap, inP, src.length, level) >>> 0;
        if (r === FAIL) throw new Error('Lz4Kit: compress failed');
        return asView ? view(outP, r) : view(outP, r).slice();
      },
      unframe: function (frame, size, asView) {
        put(frame); var cap = size != null ? size : Math.max(65536, Math.min(MAX_IN, frame.length * 8)), r;
        for (;;) {
          ensureOut(cap); r = X.frame_decompress(outP, cap, inP, frame.length) >>> 0;
          if (r === SMALL && size == null && cap < MAX_IN) { cap = Math.min(MAX_IN, cap * 4); continue; }
          break;
        }
        if (r === FAIL || r === SMALL) throw new Error('Lz4Kit: damaged frame' + (r === SMALL ? ', or larger than the size given' : ''));
        if (size != null && r !== size) throw new Error('Lz4Kit: the frame holds ' + r + ' bytes, not ' + size);
        return asView ? view(outP, r) : view(outP, r).slice();
      },
      heapUsed: function () { return X.heap_used(); },
      release: function () { if (inP) X.free(inP); if (outP) X.free(outP); inP = outP = 0; inCap = outCap = 0; }
    };
  }

  // ================================================================ public API
  var B64 = /*LK:BEGIN*//*LK:END*/, Z = null, P = null;
  function fromB64(s) {
    if (typeof atob !== 'function') return new Uint8Array(Buffer.from(s, 'base64'));
    var b = atob(s), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  // init(): compiles the WebAssembly once; every other call needs it to have finished
  function init() {
    if (!P) P = WebAssembly.instantiate(fromB64(B64), {}).then(function (r) { Z = makeLz4(r.instance); return true; }, function (e) { P = null; throw e; });
    return P;
  }
  function need() { if (!Z) throw new Error('Lz4Kit: call init() first and wait for it'); return Z; }
  function bytes(x) {
    if (x instanceof Uint8Array) return x;
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (typeof x === 'string') return new TextEncoder().encode(x);
    throw new TypeError('Lz4Kit: give a Uint8Array, another typed array, an ArrayBuffer or a string');
  }
  function lvl(level) {
    if (level == null) return 0;
    if (typeof level !== 'number' || level !== Math.floor(level) || level < 0 || level > 12) throw new RangeError('Lz4Kit: level is a whole number from 0 (fast) to 12 (best compression)');
    return level;
  }
  return {
    version: '1.1.2',
    lz4Version: '1.11.1',
    init: init,
    ready: function () { return !!Z; },
    // compress(data, level): one standard .lz4 frame (content size and a content checksum recorded). level 0 (default) is the fast mode; 1 to 12 is high compression
    compress: function (data, level, options) { return need().frame(bytes(data), lvl(level), !!(options && options.view)); },
    // decompress(frame, size): the original bytes. size is optional (it only saves a retry for output larger than 8 times the frame); frames written one after another are joined
    decompress: function (frame, size, options) { return need().unframe(bytes(frame), size, !!(options && options.view)); },
    // compressBlock(data, level, acceleration): one raw LZ4 block, with no size and no header. level as above; acceleration (level 0 only) 1 = default, larger is faster and bigger
    compressBlock: function (data, level, acceleration, options) {
      if (acceleration != null && (typeof acceleration !== 'number' || acceleration < 1 || acceleration !== Math.floor(acceleration))) throw new RangeError('Lz4Kit: acceleration is a whole number of 1 or more');
      return need().block(bytes(data), lvl(level), acceleration, !!(options && options.view));
    },
    // decompressBlock(block, size): the original bytes; a block does not record its size, so the size is required
    decompressBlock: function (block, size, options) {
      if (typeof size !== 'number' || size < 0 || size !== Math.floor(size)) throw new TypeError('Lz4Kit: decompressBlock needs the original size as its second argument');
      return need().unblock(bytes(block), size, !!(options && options.view));
    },
    // _streamHighBlock(data, level, junk): test hook, see test/run.js
    _streamHighBlock: function (data, level, junk) { return need().blockStream(bytes(data), level, junk); },
    release: function () { if (Z) Z.release(); }
  };
});
