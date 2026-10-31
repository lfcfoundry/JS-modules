// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ small helpers
  var te = new TextEncoder(), td = new TextDecoder(), tlat = new TextDecoder('latin1'), tdr = new TextDecoder('utf-8', { fatal: true });   // tdr: readers; text that is not valid UTF-8 is refused (SPEC 3), the writer's td replaces bad bytes
  var hasBuffer = typeof Buffer !== 'undefined' && Buffer.from;
  function concat(parts) {
    var n = 0, i; for (i = 0; i < parts.length; i++) n += parts[i].length;
    var o = new Uint8Array(n), p = 0; for (i = 0; i < parts.length; i++) { o.set(parts[i], p); p += parts[i].length; }
    return o;
  }
  function u32le(v) { var b = new Uint8Array(4); b[0] = v; b[1] = v >>> 8; b[2] = v >>> 16; b[3] = v >>> 24; return b; }
  function rd32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
  function rd16(b, p) { return b[p] | (b[p + 1] << 8); }
  function fromB64(s) {
    if (hasBuffer) return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = atob(s), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o;
  }
  function fnvStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }
  function setKey(o, k, v) { if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); else o[k] = v; }
  function bytesOf(x) {   // Uint8Array view of ArrayBuffer, typed array, Buffer or string (UTF-8)
    if (typeof x === 'string') return te.encode(x);
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    throw new TypeError('bytes, ArrayBuffer or string expected');
  }
  // CRC32 in plain JavaScript (zlib polynomial, slice-by-4); the wasm copy in the core module is used when it is loaded
  var CRCT = null;
  function crcJS(b, c) {
    if (!CRCT) { CRCT = new Uint32Array(1024); for (var n = 0; n < 256; n++) { var v = n; for (var k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1; CRCT[n] = v >>> 0; }
      for (n = 0; n < 256; n++) { v = CRCT[n]; for (var t = 1; t < 4; t++) { v = CRCT[v & 255] ^ (v >>> 8); CRCT[t * 256 + n] = v >>> 0; } } }
    var T = CRCT, p = 0, len = b.length; c = ~(c | 0);
    for (; p + 4 <= len; p += 4) { c ^= b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24); c = T[768 + (c & 255)] ^ T[512 + ((c >>> 8) & 255)] ^ T[256 + ((c >>> 16) & 255)] ^ T[c >>> 24]; }
    for (; p < len; p++) c = T[(c ^ b[p]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  }
  // a block whose tables are damaged but whose checksum is right (or a bug) must give one plain error, not a stray TypeError
  function guard(fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { var m = e && e.message; if (typeof m === 'string' && /^(zstd|LfcPack|damaged|not an LFC|block |footer)/.test(m)) throw e; throw new Error('damaged block: ' + m); }
    };
  }
