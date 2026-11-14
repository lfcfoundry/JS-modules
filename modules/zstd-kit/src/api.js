
  // ================================================================ public API
  var B64 = /*ZK:BEGIN*//*ZK:END*/, DEC_ONLY = /*ZK-DEC*/false, Z = null, P = null;
  function fromB64(s) {
    if (typeof atob !== 'function') return new Uint8Array(Buffer.from(s, 'base64'));
    var b = atob(s), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  // init(): compiles the WebAssembly once (about 1 ms per 100 KB in the test browsers); every other call needs it to have finished
  function init() {
    if (!P) P = WebAssembly.instantiate(fromB64(B64), {}).then(function (r) { Z = makeZstd(r.instance); return true; }, function (e) { P = null; throw e; });
    return P;
  }
  function need() { if (!Z) throw new Error('ZstdKit: call init() first and wait for it'); return Z; }
  function bytes(x) {
    if (x instanceof Uint8Array) return x;
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (typeof x === 'string') return new TextEncoder().encode(x);
    throw new TypeError('ZstdKit: give a Uint8Array, another typed array, an ArrayBuffer or a string');
  }
  function hex64(h) { return (h[1] + 4294967296).toString(16).slice(1) + (h[0] + 4294967296).toString(16).slice(1); }
  return {
    version: '1.0.0',
    decodeOnly: DEC_ONLY,
    init: init,
    ready: function () { return !!Z; },
    // compress(data, level): one standard Zstandard frame (content size recorded). level -7 to 22, default 3; at the default level text of 256 KB or more
    // is tried with two finer match settings on a sample and the smallest kept (same format, any zstd reader opens it)
    compress: function (data, level) {
      var z = need(); if (!z.compress) throw new Error('ZstdKit: this is the decode-only build (zstd-kit-dec.js); load zstd-kit.js to compress');
      if (level == null) level = 3; if (typeof level !== 'number' || !(level >= -7 && level <= 22) || level !== Math.floor(level)) throw new RangeError('ZstdKit: level is a whole number from -7 to 22');
      return z.compress(bytes(data), level);
    },
    // decompress(frame, size): the original bytes. size is needed only when the frame does not record its content size
    decompress: function (frame, size) { var z = need(), b = bytes(frame); if (size == null && z.contentSize(b) < 0) throw new Error('ZstdKit: this frame does not record its size; pass the size as the second argument'); return z.decompress(b, size); },
    // contentSize(frame): the size the frame records, or -1 when it records none
    contentSize: function (frame) { return need().contentSize(bytes(frame)); },
    // xxh64(data): XXH64 with seed 0 as 16 lowercase hex digits
    xxh64: function (data) { return hex64(need().xxh64(bytes(data))); },
    // crc32(data): the zip / gzip / PNG CRC-32 as an unsigned number
    crc32: function (data) { return need().crc32(bytes(data)); },
    // release(): frees the compressor's working memory (WebAssembly memory itself never shrinks)
    release: function () { if (Z && Z.release) Z.release(); }
  };
});
