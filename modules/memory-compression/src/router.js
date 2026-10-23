// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).

  // ================================================================ one pack / unpack / view that pick the layer
  // Packed data starts with two marker bytes: 'MC' (written by the packing core) or 'MJ' (written by the object layer). unpack() and view() read them; pack() decides from the input.
  function isBytesLike(x) { return x instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(x)); }
  function isNumberArray(x) {                 // a typed array the number picker can work on (not raw bytes, not a DataView, not 64-bit whole numbers)
    return ArrayBuffer.isView(x) && !(x instanceof DataView) && !(x instanceof Uint8Array) && !(x instanceof Uint8ClampedArray) &&
      !(typeof BigInt64Array !== 'undefined' && (x instanceof BigInt64Array || x instanceof BigUint64Array)) && x.length >= 64;
  }
  function withMode(opts, mode) { var o = {}, k; for (k in opts) o[k] = opts[k]; o.mode = mode; return o; }
  function autoPack(value, opts) {
    opts = opts || {};
    var layer = opts.layer === undefined ? 'auto' : opts.layer, mode = opts.mode, a, b;
    if (layer !== 'auto' && layer !== 'core' && layer !== 'objects') throw new Error("MemoryCompression: layer must be 'auto', 'core' or 'objects'");
    if (layer === 'objects') return jso.pack(value, opts);
    if (layer === 'core') return MC.pack(value, mode === 'balanced' ? withMode(opts, 'fast') : opts);
    if (!isBytesLike(value)) return jso.pack(value, opts);                                   // objects, arrays, text, numbers ...: the object layer
    if (isNumberArray(value) && (mode === 'balanced' || opts.picker === true)) return jso.pack(value, opts);   // asked for the number picker
    if (mode === 'balanced') return MC.pack(value, withMode(opts, 'fast'));
    a = MC.pack(value, opts);
    if (mode === 'small' && isNumberArray(value)) {                                           // smallest wins: the core's deflate path, the number picker with deflate, and the picker alone
      try { b = jso.pack(value, opts); if (b.length < a.length) a = b; } catch (e) { /* the core's result stands */ }
      try { b = jso.pack(value, withMode(opts, 'balanced')); if (b.length < a.length) a = b; } catch (e) { /* the best so far stands */ }
    }
    return a;
  }
  function layerOf(bytes) {
    var u = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
    if (u && u.length >= 2 && u[0] === 0x4D && u[1] === 0x4A) return 'objects';
    return 'core';                                                                            // anything else: the core says "not a MemoryCompression container"
  }
  function autoUnpack(bytes, opts) { return layerOf(bytes) === 'objects' ? jso.unpack(bytes, opts) : MC.unpack(bytes, opts); }
  function autoView(bytes, opts) { return layerOf(bytes) === 'objects' ? jso.view(bytes, opts) : MC.view(bytes, opts); }

  var unified = {}, key;
  for (key in MC) unified[key] = MC[key];                                                     // lz4Compress, deflate, inflate, zlib, gzip, shuffle, crc32 ... as in memory-compression 1.x
  unified.pack = autoPack; unified.unpack = autoUnpack; unified.view = autoView;
  unified.packAsync = function (value, opts) {                                               // the same bytes as pack(); the number picker runs on workers (opts.workers: a pool from MemoryCompression.pool())
    opts = opts || {}; var layer = opts.layer === undefined ? 'auto' : opts.layer;
    if (layer === 'core' || (layer === 'auto' && isBytesLike(value) && !(isNumberArray(value) && (opts.mode === 'balanced' || opts.picker === true)))) return Promise.resolve(autoPack(value, opts));
    if (opts.mode === 'small' && isBytesLike(value)) return Promise.resolve(autoPack(value, opts));
    return jso.packAsync(value, opts);
  };
  unified.unpackAsync = function (bytes, opts) {                                              // the same value as unpack(); a long list of records is opened in short slices
    try { return layerOf(bytes) === 'objects' ? jso.unpackAsync(bytes, opts) : Promise.resolve(MC.unpack(bytes, opts)); } catch (err) { return Promise.reject(err); }
  };
  unified.warm = function (opts) {                                                            // call once when the page is idle: the first big pack then skips 30 to 60 ms of cold-start work. A made-up 1,200-row list is packed and opened one column at a time, every pack and every open in a task of its own (each about 3 to 10 ms), and the result is thrown away
    opts = opts || {}; var po = { mode: 'balanced', wasm: opts.wasm }, wo = { wasm: opts.wasm }, N = 1200, names = ['id', 'from', 'to', 'w', 'x', 'y', 't', 'kind', 'hot'], make = [
      function (i) { return i; }, function (i) { return i % 97; }, function (i) { return (i * 7) % 211; }, function (i) { return (i % 13) * 0.25; }, function (i) { return i * 0.5; },
      function (i) { return Math.round(Math.sin(i / 50) * 1e5) / 1e3; }, function (i) { return 1700000000000 + i * 977; }, function (i) { return 'k' + (i % 5); }, function (i) { return i % 3 === 0; }];
    function rows(j) { var out = [], i, o; for (i = 0; i < N; i++) { o = {}; o[names[j]] = make[j](i); out.push(o); } return out; }
    function step(j) {                                                                        // column j: a task to pack it, a task to open it
      var b;
      return nextTask().then(function () { b = autoPack(rows(j), po); return nextTask(); }).then(function () { autoUnpack(b, wo); return j + 1 < names.length ? step(j + 1) : true; });
    }
    return Promise.resolve(unified.ready ? unified.ready() : true).then(function () { return step(0); }).then(function () { return true; }, function () { return false; });   // a warm-up that fails is not worth an error: false
  };
  unified.pool = makePool;
  unified.layerOf = layerOf;
  unified.freeBuffers = freeBuffers; unified.keeper = keeper; unified.pager = pager; unified.heap = heapInfo; unified.profile = profile; unified.estimateBytes = estimateBytes;
  unified.core = MC; unified.objects = jso; unified.jso = jso; unified.picker = PK;
  return unified;
});
