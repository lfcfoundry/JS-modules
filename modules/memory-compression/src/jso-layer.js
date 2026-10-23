// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).
  // ================================================================ the object layer
  // Everything below needs only the packing core above (MC). Layout of a packed value:
  //   'M' 'J' version flags | [crc32] | control bytes (tags, counts, key names; packed when large) | blob area (packed numeric columns)
  // A value is walked once. Arrays of 16 or more things become COLUMNS: numbers as the narrowest exact integer, a decimal
  // scaled to integers, a float32 or a float64; strings as a dictionary or one joined text; booleans as bits; objects as
  // one column per key (a "shape"); arrays as lengths plus one flattened column. Each numeric column then goes through the
  // core's byte shuffle and LZ4/deflate stage. Anything irregular falls back to a plain tagged encoding.

  var JSO_VERSION = 5;                            // 2: a record column list starts with a directory of sizes so one column can be read alone; version 1 files are still read
  var T_UNDEF = 0, T_NULL = 1, T_FALSE = 2, T_TRUE = 3, T_INT = 4, T_F64 = 5, T_STR = 6, T_STR16 = 7, T_ARR = 8, T_OBJ = 9, T_OBJ0 = 10,
    T_COLS = 11, T_BIGINT = 12, T_DATE = 13, T_TYPED = 14, T_ABUF = 15, T_MAP = 16, T_SET = 17, T_REF = 18, T_REGEX = 19;
  var CT_CONST = 0, CT_INT = 1, CT_DEC = 2, CT_F32 = 3, CT_F64 = 4, CT_BOOL = 5, CT_STRD = 6, CT_STRR = 7, CT_NULLABLE = 8,
    CT_ARRAYS = 9, CT_TUPLE = 10, CT_RECORDS = 11, CT_ANY = 12, CT_TEMPLATE = 13, CT_REFS = 14, CT_REFRECS = 15, CT_TIMES = 16, CT_FSST = 17, CT_PCO = 18, CT_FRONT = 19, CT_ADAPT = 20, CT_STRDP = 21;
  var MIN_COLUMN = 16, MAX_TEMPLATES = 32, MAX_SLOTS = 32, MAX_SHAPES = 16, MAX_FUSED_KEYS = 64, MAX_DEPTH = 400, RAW_LIMIT = 48, ADAPT_MIN = 1024, DEFAULT_MAX_ITEMS = 100000000;
  var TYPED_CTORS = [Uint8Array, Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
  var G = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {};
  var OP = Object.prototype, TEXT_ENC = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, TEXT_DEC = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true }) : null;
  var RE_LONE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
  var P10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
  // Generated loops need new Function. It is not even tried (so a page that forbids it logs no blocked-eval error) when the page sets MEMORY_COMPRESSION_NO_EVAL = true
  // before this file loads, or has a <meta> Content-Security-Policy whose script-src (else default-src) lacks 'unsafe-eval'. A CSP sent as a header cannot be read from a page: use the switch there.
  function evalForbidden() { return policyLacks(["'unsafe-eval'"], true); }
  function wasmForbidden() { return policyLacks(["'unsafe-eval'", "'wasm-unsafe-eval'"], false); }
  function policyLacks(tokens, useSwitch) {      // true when a <meta> policy's script-src (else default-src) has none of the tokens (or, for eval, the global switch is set)
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : undefined, m, i, c, parts, j, d, s;
    if (useSwitch && g && g.MEMORY_COMPRESSION_NO_EVAL === true) return true;
    try {
      m = g && g.document && g.document.querySelectorAll ? g.document.querySelectorAll('meta[http-equiv]') : [];
      for (i = 0; i < m.length; i++) {
        if (String(m[i].getAttribute('http-equiv')).toLowerCase() !== 'content-security-policy') continue;
        parts = String(m[i].getAttribute('content') || '').split(';'); d = null; s = null;
        for (j = 0; j < parts.length; j++) {
          c = parts[j].trim().toLowerCase();
          if (/^script-src(\s|$)/.test(c) && s === null) s = c; else if (/^default-src(\s|$)/.test(c) && d === null) d = c;
        }
        c = s !== null ? s : d;
        if (c !== null && !tokens.some(function (t) { return c.indexOf(t) >= 0; })) return true;
      }
    } catch (e) { /* no page, or no access: go on to the real test */ }
    return false;
  }
  var CAN_EVAL = (function () { if (evalForbidden()) return false; try { return new Function('return 1')() === 1; } catch (e) { return false; } })();
  var GEN_CACHE = {}, GEN_COUNT = 0, GEN_LIMIT = 500;                 // generated helpers, kept per layout; forgotten all at once past 500 so odd inputs cannot grow it forever
  // Number columns taken from a small pool of Float64Arrays that pack() hands back when it is done, so a second pack of similar data allocates (and has zeroed) no new column memory.
  // The pool keeps at most POOL_MAX bytes between calls; freeBuffers() empties it, pack(x, {pool: false}) leaves it alone.
  var POOL = [], POOL_BYTES = 0, POOL_MAX = 48000000, POOL_ON = true;
  function takeF64(n) {
    var best = -1, bl = Infinity, i, a, l;
    if (POOL_ON) for (i = 0; i < POOL.length; i++) { l = POOL[i].length; if (l >= n && l < bl && l <= n * 2) { best = i; bl = l; } }
    if (best < 0) return new Float64Array(n);
    a = POOL.splice(best, 1)[0]; POOL_BYTES -= a.byteLength;
    return a.length === n ? a : a.subarray(0, n);
  }
  function giveF64(cols) {
    var i, c, a;
    if (!POOL_ON) return;
    for (i = 0; i < cols.length; i++) {
      c = cols[i];
      if (!(c instanceof Float64Array) || c.byteOffset !== 0 || c.buffer.byteLength < 4096 || POOL_BYTES + c.buffer.byteLength > POOL_MAX || POOL.length >= 16) continue;
      a = c.length === c.buffer.byteLength / 8 ? c : new Float64Array(c.buffer);
      POOL.push(a); POOL_BYTES += a.byteLength;
    }
    if (POOL_BYTES > 0) idleSoon();
  }
  function freeBuffers() { POOL = []; POOL_BYTES = 0; }
  // After the last big pack has been quiet for IDLE_MS, the buffer pool is emptied and both WebAssembly helpers give their memory back (a page that packs again simply makes them again, about 1 to 4 ms).
  var IDLE_MS = 2000, idleTimer = null;
  function idleSoon() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    if (typeof setTimeout !== 'function') return;
    idleTimer = setTimeout(function () { idleTimer = null; freeBuffers(); kwTrim(); MC.trimMemory(); }, IDLE_MS);
    if (idleTimer && typeof idleTimer.unref === 'function') idleTimer.unref();
  }
  if (typeof MC.onGrow === 'function') MC.onGrow(idleSoon);
  function genStore(sig, f) { if (GEN_COUNT >= GEN_LIMIT) { GEN_CACHE = {}; LEARNED = {}; GEN_COUNT = 0; } GEN_CACHE[sig] = f; GEN_COUNT++; }

  function jfail(m) { throw new Error('MemoryCompressionJSO: ' + m); }
  // The same bytes as TEXT_ENC.encode(s). Plain ASCII text (the usual case) is written with encodeInto into a buffer of exactly its length, which is several times faster than encode() in V8; anything else falls back.
  function utf8(s) {
    var n = s.length, out, r;
    if (n < 1024) return TEXT_ENC.encode(s);
    out = new Uint8Array(n); r = TEXT_ENC.encodeInto(s, out);
    return r.read === n && r.written === n ? out : TEXT_ENC.encode(s);
  }
  function wellFormed(s) { return typeof s.isWellFormed === 'function' ? s.isWellFormed() : !RE_LONE.test(s); }

  // ---- byte streams
  function Out() { this.b = new Uint8Array(2048); this.p = 0; this.dv = null; }
  Out.prototype.need = function (n) {
    if (this.p + n > this.b.length) { var nb = new Uint8Array(Math.max(this.b.length * 2, this.p + n)); nb.set(this.b.subarray(0, this.p)); this.b = nb; this.dv = null; }
  };
  Out.prototype.u8 = function (v) { if (this.p >= this.b.length) this.need(1); this.b[this.p++] = v; };
  Out.prototype.varint = function (v) {
    this.need(10);
    var b = this.b, p = this.p;
    if (v < 4294967296) { while (v > 127) { b[p++] = (v & 127) | 128; v >>>= 7; } b[p++] = v; }
    else { while (v >= 128) { b[p++] = (v % 128) | 128; v = Math.floor(v / 128); } b[p++] = v; }
    this.p = p;
  };
  Out.prototype.zigzag = function (v) { this.varint(v >= 0 ? v * 2 : -v * 2 - 1); };
  Out.prototype.bytes = function (u8) { this.need(u8.length); this.b.set(u8, this.p); this.p += u8.length; };
  Out.prototype.f64 = function (v) { this.need(8); if (!this.dv) this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.length); this.dv.setFloat64(this.p, v, true); this.p += 8; };
  Out.prototype.str = function (s) {          // length in bytes, then UTF-8; callers check wellFormed first
    var n = s.length, w, lenBytes, b, p, i, ch;
    if (n === 0) { this.u8(0); return; }
    this.need(n * 3 + 6);
    if (n < 24) {                                   // short and plain ASCII (most keys and labels): a loop beats the call into the encoder
      b = this.b; p = this.p + 1;
      for (i = 0; i < n; i++) { ch = s.charCodeAt(i); if (ch > 127) break; b[p + i] = ch; }
      if (i === n) { b[this.p] = n; this.p += n + 1; return; }
    }
    w = TEXT_ENC.encodeInto(s, this.b.subarray(this.p + 5)).written;
    lenBytes = w < 128 ? 1 : w < 16384 ? 2 : w < 2097152 ? 3 : w < 268435456 ? 4 : 5;
    if (lenBytes !== 5) this.b.copyWithin(this.p + lenBytes, this.p + 5, this.p + 5 + w);
    this.varintAt(w, lenBytes);
    this.p += lenBytes + w;
  };
  Out.prototype.varintAt = function (v, len) { var p = this.p, i; for (i = 0; i < len - 1; i++) { this.b[p++] = (v & 127) | 128; v >>>= 7; } this.b[p] = v; };
  Out.prototype.done = function () { return this.b.subarray(0, this.p); };

  // The packed column data: small writes go to a head buffer; a big packed column is kept as it is (no copy, no doubling buffer) and everything is joined once at the end.
  function Chunks() { this.list = []; this.base = 0; this.b = new Uint8Array(4096); this.p = 0; this.dv = null; }
  Chunks.prototype.need = Out.prototype.need;
  Chunks.prototype.u8 = Out.prototype.u8;
  Chunks.prototype.varint = Out.prototype.varint;
  Chunks.prototype.pos = function () { return this.base + this.p; };
  Chunks.prototype.flush = function () { if (this.p > 0) { this.list.push(this.b.subarray(0, this.p)); this.base += this.p; this.b = new Uint8Array(4096); this.p = 0; this.dv = null; } };
  Chunks.prototype.bytes = function (u8) {          // u8 must not be changed afterwards by the caller
    if (u8.length < 2048 || u8.byteOffset !== 0 || u8.buffer.byteLength !== u8.length) { this.need(u8.length); this.b.set(u8, this.p); this.p += u8.length; return; }     // views of bigger buffers (the helper's memory) are copied
    this.flush(); this.list.push(u8); this.base += u8.length;
  };
  Chunks.prototype.size = function () { return this.base + this.p; };
  Chunks.prototype.copyTo = function (dst, at) {
    var i, c; this.flush();
    for (i = 0; i < this.list.length; i++) { c = this.list[i]; dst.set(c, at); at += c.length; }
    return at;
  };
  function In(b, p, end) { this.b = b; this.p = p; this.end = end === undefined ? b.length : end; this.dv = null; }
  In.prototype.u8 = function () { if (this.p >= this.end) jfail('data is cut off'); return this.b[this.p++]; };
  In.prototype.varint = function () {
    var b = this.b, p = this.p, end = this.end, v = 0, m = 1, c;
    for (;;) {
      if (p >= end) jfail('data is cut off');
      c = b[p++]; v += (c & 127) * m;
      if (c < 128) break;
      m *= 128; if (m > 9007199254740992) jfail('number is too long');
    }
    this.p = p;
    return v;
  };
  In.prototype.zigzag = function () { var v = this.varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  In.prototype.take = function (n) { if (n < 0 || this.p + n > this.end) jfail('data is cut off'); var r = this.b.subarray(this.p, this.p + n); this.p += n; return r; };
  In.prototype.f64 = function () {
    if (this.p + 8 > this.end) jfail('data is cut off');
    if (!this.dv) this.dv = new DataView(this.b.buffer, this.b.byteOffset, this.b.length);
    var v = this.dv.getFloat64(this.p, true); this.p += 8; return v;
  };
  In.prototype.str = function () {
    var n = this.varint();
    if (n === 0) return '';
    var u = this.take(n);
    if (n < 24) { var s = '', i, c; for (i = 0; i < n; i++) { c = u[i]; if (c > 127) return TEXT_DEC.decode(u); s += String.fromCharCode(c); } return s; }
    return TEXT_DEC.decode(u);
  };

  // ---- tiny typed arrays are written raw, little-endian; bigger ones go through the packing core
  function rawPut(out, t) {
    var n = t.length, i, w = t.BYTES_PER_ELEMENT;
    if (w === 1) { out.bytes(t); return; }
    out.need(n * w);
    var dv = new DataView(out.b.buffer, out.b.byteOffset, out.b.length), p = out.p;
    if (t instanceof Float64Array) for (i = 0; i < n; i++) dv.setFloat64(p + i * 8, t[i], true);
    else if (t instanceof Float32Array) for (i = 0; i < n; i++) dv.setFloat32(p + i * 4, t[i], true);
    else if (w === 4) for (i = 0; i < n; i++) dv.setUint32(p + i * 4, t[i], true);
    else for (i = 0; i < n; i++) dv.setUint16(p + i * 2, t[i], true);
    out.p += n * w;
  }
  function rawGet(inp, Ctor, n) {
    var w = Ctor.BYTES_PER_ELEMENT, u = inp.take(n * w), t = new Ctor(n), i, dv;
    if (w === 1) { t.set(u); return t; }
    dv = new DataView(u.buffer, u.byteOffset, u.length);
    if (Ctor === Float64Array) for (i = 0; i < n; i++) t[i] = dv.getFloat64(i * 8, true);
    else if (Ctor === Float32Array) for (i = 0; i < n; i++) t[i] = dv.getFloat32(i * 4, true);
    else if (w === 4) for (i = 0; i < n; i++) t[i] = dv.getUint32(i * 4, true);
    else for (i = 0; i < n; i++) t[i] = dv.getUint16(i * 2, true);
    return t;
  }

  // ================================================================ writer
  function Enc(opts) {
    this.ctl = new Out(); this.blobs = new Chunks();
    this.mode = opts && opts.mode === 'small' ? 'small' : 'fast';
    this.picker = opts && opts.mode === 'balanced' ? opts.picker !== false : this.mode === 'small' ? !(opts && opts.picker === false) : !!(opts && opts.picker);     // fast: off unless asked; balanced and small: on
    this.level = opts && opts.level;
    this.refs = !!(opts && opts.refs);
    this.front = !(opts && opts.front === false);                       // text columns that share long starts with the row before (sorted words, paths) may be stored as 'start length + new end'
    this.fsst = !!(opts && opts.fsst);                                  // opt-in: text columns may be stored as FSST codes (any one string readable alone); costs training time
    this.patterns = !(opts && opts.patterns === false);                 // text patterns on by default; off saves time on text-heavy data at the cost of size
    this.float32 = !!(opts && opts.float32);                       // opt-in and lossy: columns of fractions that need 8 bytes each are kept in 4
    this.seen = this.refs ? new Map() : null;
    this.keys = new Map(); this.depth = 0;
    this.report = opts && opts.report || null;
    this.path = '';
    this.mcOpts = { mode: this.mode }; if (this.level !== undefined) this.mcOpts.level = this.level;
    if (opts && opts.wasm === false) this.mcOpts.wasm = false;
    this.hints = opts && opts.hints && typeof opts.hints === 'object' ? opts.hints : null;         // what won for each column in earlier packs of the same kind of list (pager pages): later packs try those ways first
    this.blobBytes = 0;
    this.defer = opts && opts.defer || null;                          // packAsync: the picker runs later (on workers); the plain form is written now and its place in the streams is noted
  }
  Enc.prototype.blob = function (t, name, pre) {      // t: a typed array. Raw when tiny, else packed by the core when that is smaller (pre: that packed form, when the caller already made it)
    var o = this.blobs, raw = t.length * t.BYTES_PER_ELEMENT, packed, start = o.pos();
    if (raw < RAW_LIMIT) { o.u8(0); rawPut(o, t); }
    else {
      packed = pre || MC.pack(t, this.mcOpts);
      if (packed.length < raw) { o.u8(1); o.varint(packed.length); o.bytes(packed); }
      else { o.u8(2); rawPut(o, t); }
    }
    if (this.report) this.report.push({ path: this.path, part: name || '', count: t.length, rawBytes: raw, bytes: o.pos() - start });
  };

  Enc.prototype.value = function (v) {
    var c = this.ctl, t = typeof v;
    if (t === 'number') { this.number(v); return; }
    if (t === 'string') { if (wellFormed(v)) { c.u8(T_STR); c.str(v); } else { c.u8(T_STR16); this.str16(v); } return; }
    if (t === 'boolean') { c.u8(v ? T_TRUE : T_FALSE); return; }
    if (t === 'undefined') { c.u8(T_UNDEF); return; }
    if (v === null) { c.u8(T_NULL); return; }
    if (t === 'bigint') { c.u8(T_BIGINT); c.str(v.toString()); return; }
    if (t === 'object') { this.object(v); return; }
    jfail('cannot pack a ' + t + (this.path ? ' at ' + this.path : ''));
  };
  Enc.prototype.number = function (v) {
    var c = this.ctl;
    if (v === Math.floor(v) && v > -4503599627370496 && v < 4503599627370496 && !(v === 0 && 1 / v < 0)) { c.u8(T_INT); c.zigzag(v); }
    else { c.u8(T_F64); c.f64(v); }
  };
  Enc.prototype.str16 = function (s) {
    var n = s.length, u = new Uint16Array(n), i;
    for (i = 0; i < n; i++) u[i] = s.charCodeAt(i);
    this.ctl.varint(n); this.blob(u, 'text');
  };
  Enc.prototype.key = function (k) {                  // property names are numbered the first time they appear
    var id = this.keys.get(k), c = this.ctl;
    if (id !== undefined) { c.varint(id + 1); return; }
    this.keys.set(k, this.keys.size); c.varint(0);
    if (wellFormed(k)) { c.u8(0); c.str(k); } else { c.u8(1); this.str16(k); }
  };
  Enc.prototype.object = function (v) {
    var c = this.ctl, seen = this.seen, i, n, keys, k, proto;
    if (seen) { i = seen.get(v); if (i !== undefined) { c.u8(T_REF); c.varint(i); return; } seen.set(v, seen.size); }
    if (++this.depth > MAX_DEPTH) jfail('nested too deeply (or it refers to itself: pass refs: true)');
    if (Array.isArray(v)) this.array(v);
    else if (v instanceof Date) { c.u8(T_DATE); c.f64(v.getTime()); }
    else if (ArrayBuffer.isView(v)) {
      var kind = -1, carrier;
      for (i = 0; i < TYPED_CTORS.length; i++) if (v instanceof TYPED_CTORS[i]) { kind = i; break; }
      if (kind < 0) jfail(v instanceof DataView ? 'cannot pack a DataView' : 'cannot pack 64-bit integer arrays yet');
      carrier = kind <= 2 ? new Uint8Array(v.buffer, v.byteOffset, v.length) : kind === 3 ? new Uint16Array(v.buffer, v.byteOffset, v.length) : kind === 5 ? new Uint32Array(v.buffer, v.byteOffset, v.length) : v;
      c.u8(T_TYPED); c.u8(kind); c.varint(v.length); this.blob(carrier, 'typed');
    } else if (v instanceof ArrayBuffer) { c.u8(T_ABUF); c.varint(v.byteLength); this.blob(new Uint8Array(v), 'bytes'); }
    else if (v instanceof Map) {
      n = v.size; c.u8(T_MAP); c.varint(n);
      var ks = new Array(n), vs = new Array(n); i = 0;
      v.forEach(function (val, key) { ks[i] = key; vs[i++] = val; });
      this.items(ks, n); this.items(vs, n);
    } else if (v instanceof Set) {
      n = v.size; c.u8(T_SET); c.varint(n);
      var xs = new Array(n); i = 0; v.forEach(function (val) { xs[i++] = val; });
      this.items(xs, n);
    } else if (v instanceof RegExp) { c.u8(T_REGEX); c.str(v.source); c.str(v.flags); }
    else {
      proto = Object.getPrototypeOf(v);
      keys = Object.keys(v); n = keys.length;
      c.u8(proto === null ? T_OBJ0 : T_OBJ); c.varint(n);
      for (i = 0; i < n; i++) {
        k = keys[i]; this.key(k);
        if (this.report) this.path += '.' + k;
        this.value(v[k]);
        if (this.report) this.path = this.path.slice(0, this.path.length - k.length - 1);
      }
    }
    this.depth--;
  };
  Enc.prototype.array = function (a) {
    var c = this.ctl, n = a.length, i;
    if (n >= MIN_COLUMN) { c.u8(T_COLS); c.varint(n); this.column(a, n); return; }
    c.u8(T_ARR); c.varint(n);
    for (i = 0; i < n; i++) this.value(a[i]);
  };
  Enc.prototype.items = function (a, n) {               // a list of n things with the count known to the reader
    var i;
    if (n >= MIN_COLUMN) { this.ctl.u8(1); this.column(a, n); }
    else { this.ctl.u8(0); for (i = 0; i < n; i++) this.value(a[i]); }
  };

  // ---- columns
  Enc.prototype.column = function (vals, n) {
    var t0 = this.report ? performance.now() : 0, path = this.path;
    if (++this.depth > MAX_DEPTH) jfail('nested too deeply');
    this.columnBody(vals, n);
    this.depth--;
    if (this.report) this.report.push({ path: path, part: 'column (time includes everything inside it)', count: n, ms: Math.round((performance.now() - t0) * 100) / 100 });
  };
  // one tight pass over a column that is probably all numbers; results go to SCAN (module-level so nothing is allocated)
  var SCAN = { min: 0, max: 0, allInt: true, f32: true, neg0: false, same: true };
  function scanNumbers(vals, n) {
    var i, x, min = Infinity, max = -Infinity, first = vals[0], same = true, nonInt = false, nonF32 = false, neg0 = false;
    for (i = 0; i < n; i++) {
      x = vals[i];
      if (typeof x !== 'number') return false;
      if (x < min) min = x;
      if (x > max) max = x;
      if (x !== first) same = false;
      if ((x | 0) !== x) {
        if (!nonInt && (x !== Math.floor(x) || x - x !== 0)) nonInt = true;
        if (!nonF32 && x === x && Math.fround(x) !== x) nonF32 = true;
      } else if (x === 0 && 1 / x < 0) neg0 = true;
    }
    SCAN.min = min; SCAN.max = max; SCAN.allInt = !nonInt; SCAN.f32 = !nonF32; SCAN.neg0 = neg0; SCAN.same = same;
    return true;
  }
  Enc.prototype.columnBody = function (vals, n) {
    var c = this.ctl, i, x, t, nNum = 0, nStr = 0, nBool = 0, nNull = 0, nUndef = 0, nArr = 0, nObj = 0, nOther = 0;
    var allInt = true, f32 = true, neg0 = false, min = Infinity, max = -Infinity, same = true, first = vals[0];
    if (typeof first === 'number' && scanNumbers(vals, n)) {
      if (SCAN.same && n > 1 && !(first === 0 && SCAN.neg0)) { c.u8(CT_CONST); this.value(first); return; }
      if (this.defer && n >= ADAPT_MIN) { this.deferNumbers(vals, n, SCAN.allInt && !SCAN.neg0, SCAN.f32, SCAN.min, SCAN.max, SCAN.neg0); return; }
      this.numbers(vals, n, SCAN.allInt && !SCAN.neg0, SCAN.f32, SCAN.min, SCAN.max, SCAN.neg0); return;
    }
    if (this.refs && typeof first === 'object' && first !== null) {           // with shared objects kept: a column of references to objects already written, or of flat records written here
      if (this.seen.has(first)) { if (this.refColumn(vals, n)) return; }
      else if (Object.getPrototypeOf(first) === OP && this.refRecords(vals, n)) return;
    } else if (typeof first === 'object' && first !== null) {          // a column of arrays or plain objects with one layout: checked and split in a single pass
      if (Array.isArray(first)) { if ((first.length > 0 && first.length <= 8 && this.fusedTuples(vals, n, first.length)) || this.fusedArrays(vals, n)) return; }
      else if (Object.getPrototypeOf(first) === OP && this.fusedRecords(vals, n)) return;
    }
    for (i = 0; i < n; i++) {
      x = vals[i]; t = typeof x;
      if (t === 'number') {
        nNum++;
        if (x !== x) { allInt = false; }
        else {
          if (allInt && x !== Math.floor(x)) allInt = false;
          if (f32 && Math.fround(x) !== x) f32 = false;
          if (x < min) min = x; if (x > max) max = x;
          if (x === 0 && 1 / x < 0) neg0 = true;
        }
        if (x - x !== 0) allInt = false;                           // NaN or an infinity
        if (same && x !== first) same = false;
      } else if (t === 'string') { nStr++; if (same && x !== first) same = false; }
      else if (t === 'boolean') { nBool++; if (same && x !== first) same = false; }
      else if (x === null) { nNull++; if (same && x !== first) same = false; }
      else if (t === 'undefined') { nUndef++; if (same && x !== first) same = false; }
      else if (t === 'object') {
        same = false;
        if (Array.isArray(x)) nArr++;
        else if (Object.getPrototypeOf(x) === OP) nObj++;
        else nOther++;
      } else nOther++;
    }
    var kinds = (nNum > 0) + (nStr > 0) + (nBool > 0) + (nArr > 0) + (nObj > 0), nonValue = nNull + nUndef;
    if (nOther > 0 || kinds > 1 || (this.refs && (nArr || nObj))) { this.any(vals, n); return; }
    if (kinds === 0) { if (same) { c.u8(CT_CONST); this.value(first); } else this.nullable(vals, n); return; }
    if (same && n > 1 && !(nNum && first === 0 && neg0)) { c.u8(CT_CONST); this.value(first); return; }
    if (nonValue > 0) { this.nullable(vals, n, nNull); return; }
    if (nNum) this.numbers(vals, n, allInt && !neg0, f32, min, max, neg0);
    else if (nStr) this.strings(vals, n);
    else if (nBool) this.bools(vals, n);
    else if (nArr) this.arrays(vals, n);
    else this.records(vals, n);
  };
  Enc.prototype.any = function (vals, n) {
    var i; this.ctl.u8(CT_ANY);
    for (i = 0; i < n; i++) this.value(vals[i]);
  };
  Enc.prototype.nullable = function (vals, n, nNull) {
    var kind = new Uint8Array(n), i, x, m = 0, compact, j = 0;
    for (i = 0; i < n; i++) { x = vals[i]; if (x === null) kind[i] = 1; else if (x === undefined) kind[i] = 2; else m++; }
    compact = new Array(m);
    for (i = 0; i < n; i++) if (kind[i] === 0) compact[j++] = vals[i];
    this.ctl.u8(CT_NULLABLE); this.ctl.varint(m);
    this.blob(kind, 'nulls');
    if (m > 0) this.column(compact, m);
  };
  // CT_INT body: width, base, packed offsets. Caller checked max - min < 2^32. With a tag (CT_INT, or CT_DEC with its scale e) this writes the tag too, and
  // a column of 1024 or more is also tried with the number picker when it is on: the smaller one is kept.
  Enc.prototype.intData = function (vals, n, min, max, tag, e) {
    var range = max - min, w = range < 256 ? 1 : range < 65536 ? 2 : 4, i, t = w === 1 ? new Uint8Array(n) : w === 2 ? new Uint16Array(n) : new Uint32Array(n), pre = null, src, c = this.ctl;
    for (i = 0; i < n; i++) t[i] = vals[i] - min;
    if (tag !== undefined) {
      if (this.picker && n >= ADAPT_MIN) {
        pre = MC.pack(t, this.mcOpts);
        if (vals instanceof Float64Array) src = vals;
        else { src = new Float64Array(n); for (i = 0; i < n; i++) src[i] = vals[i]; }
        if (this.altStore(src, n, tag === CT_DEC ? e : 0, Math.min(pre.length, n * t.BYTES_PER_ELEMENT))) return;
      }
      c.u8(tag); if (tag === CT_DEC) c.u8(e);
    }
    c.u8(w); c.zigzag(min); this.blob(t, 'ints', pre);
    if (this.defer) this.deferEnd();
  };
  // A number column stored by the number picker: src is a Float64Array of n whole numbers (or doubles). Written only when smaller than plainLen. False writes nothing.
  Enc.prototype.altStore = function (src, n, e, plainLen) {
    var ab, c = this.ctl, t0 = this.report ? performance.now() : 0;
    if (this.defer) {                                                 // packAsync: note where the plain form goes (the caller writes it next); deferEnd() closes the note
      this.defer.cur = { src: new Float64Array(src), n: n, e: e, plainLen: plainLen, c0: c.p, b0: this.blobs.pos(), c1: -1, b1: -1, res: null };
      this.defer.jobs.push(this.defer.cur);
      return false;
    }
    ab = this.adaptBytes(src);
    if (this.report && ab) this.report.push({ path: this.path, part: 'picker (time to try)', count: n, ms: Math.round((performance.now() - t0) * 100) / 100 });
    if (!ab || ab.bytes.length >= plainLen) return false;
    this.needsV5 = true;
    c.u8(CT_ADAPT); c.u8(e); c.u8(ab.z); c.varint(ab.bytes.length); this.blobs.bytes(ab.bytes);
    if (this.report) this.report.push({ path: this.path, part: 'picker', count: n, rawBytes: n * 8, bytes: ab.bytes.length });
    return true;
  };
  Enc.prototype.deferNumbers = function (vals, n, allInt, f32, min, max, neg0) {   // packAsync: the whole number column is encoded elsewhere; only its place is kept
    var src, i, at = this.blobs.pos();
    if (vals instanceof Float64Array && vals.length === n) src = vals.slice(); else { src = new Float64Array(n); for (i = 0; i < n; i++) src[i] = vals[i]; }
    this.defer.jobs.push({ kind: 1, src: src, n: n, a: [allInt, f32, min, max, neg0], c0: this.ctl.p, c1: this.ctl.p, b0: at, b1: at });
  };
  Enc.prototype.deferEnd = function () { var j = this.defer.cur; if (j) { j.c1 = this.ctl.p; j.b1 = this.blobs.pos(); this.defer.cur = null; } };
  // The codes of a text dictionary through the number picker: written only when smaller than the plain index column (a dictionary of names in a sorted or clustered order shrinks a lot).
  Enc.prototype.dictCodes = function (idx, n, m, dict) {
    var pre = MC.pack(idx, this.mcOpts), plain = Math.min(pre.length, n * idx.BYTES_PER_ELEMENT), ab, c = this.ctl;
    ab = this.adaptBytes(Float64Array.from(idx));
    if (!ab || ab.bytes.length >= plain) return false;
    this.needsV5 = true;
    c.u8(CT_STRDP); c.varint(m); this.rawStrings(dict, m); c.u8(ab.z); c.varint(ab.bytes.length); this.blobs.bytes(ab.bytes);
    if (this.report) this.report.push({ path: this.path, part: 'picker (dictionary codes)', count: n, rawBytes: n * idx.BYTES_PER_ELEMENT, bytes: ab.bytes.length });
    return true;
  };
  // The chooser's bytes for a Float64Array. In small mode the general compressor also gets a go at them, and at a version without the byte-coded ways (which it can still shrink).
  Enc.prototype.adaptBytes = function (src) {
    var a = PK, small = this.mode === 'small', best, z = 0, p, ne, probe, got, got0, plain, tryNe = true, i;
    try {
      if (src.length >= 32768) {                    // a long column is first tried on its first 8,192 numbers; if the chooser gains under 5% there, the rest is not tried
        probe = src.subarray(0, 8192); got = got0 = a.pack(probe, { sample: true, wasm: this.mcOpts.wasm });
        if (small) { p = MC.pack(got, this.mcOpts); if (p.length < got.length) got = p; }
        plain = MC.pack(probe, this.mcOpts);
        if (got.length > plain.length * 0.95) return null;
        if (small) {                                // the second pass (no entropy coding, then deflate) is only worth its time when it comes close on the same 8,192 numbers
          ne = a.pack(probe, { sample: true, noEntropy: true, wasm: this.mcOpts.wasm });
          if (ne.length === got0.length) { for (i = 0; i < ne.length && ne[i] === got0[i]; i++); tryNe = i < ne.length; }   // the very same bytes: the second pass would only repeat the first
          if (tryNe) { p = MC.pack(ne, this.mcOpts); tryNe = p.length < got.length * 1.02; }
        }
      }
      best = a.pack(src, { sample: true, wasm: this.mcOpts.wasm, hint: this.hints ? (this.hints[this.path] || (this.hints[this.path] = {})) : null });
      if (small) {
        p = MC.pack(best, this.mcOpts); if (p.length < best.length) { best = p; z = 1; }
        if (tryNe) { ne = a.pack(src, { sample: true, noEntropy: true }); p = MC.pack(ne, this.mcOpts); if (p.length < best.length) { best = p; z = 1; } }
      }
    } catch (err) { return null; }
    return { bytes: best, z: z };
  };
  function scaleDecimals(vals, n, p) {                  // whole numbers = value * p, only when dividing by p gives every value back exactly
    var t = new Float64Array(n), i, x, y;
    for (i = 0; i < n; i++) { x = vals[i]; y = Math.round(x * p); if (y / p !== x) return null; t[i] = y; }
    return t;
  }
  Enc.prototype.numbers = function (vals, n, allInt, f32, min, max, neg0) {
    var c = this.ctl, i, e, p, x, y, ints, ok, t, lo, hi, pre = null;
    if (allInt && (min <= -4503599627370496 || max >= 4503599627370496)) allInt = false;        // whole numbers beyond 2^52 stay plain doubles
    if (allInt && max - min < 4294967296) { this.intData(vals, n, min, max, CT_INT); return; }
    if (!allInt && !neg0 && min === min && max - min < 1e15 && min > -1e15 && max < 1e15) {     // decimals such as 12.34 or 0.125: scaled to whole numbers
      ok = false;
      for (e = 1; e <= 10 && !ok; e++) {                                    // pick the smallest scale that is exact for a sample, then check all
        p = P10[e]; ok = true;
        for (i = 0; i < n && i < 48; i++) { x = vals[i]; y = Math.round(x * p); if (y / p !== x) { ok = false; break; } }
      }
      for (e--; ok && e <= 10; e++) {                                       // a later value may need more digits than the sample: try the next scales
        p = P10[e];
        if (f32 && (max - min) * p >= 65536) break;                         // would be stored as 32-bit floats anyway
        ints = scaleDecimals(vals, n, p);
        if (ints) {
          lo = Math.round(min * p); hi = Math.round(max * p);
          if (hi < 4503599627370496 && lo > -4503599627370496 && hi - lo < 4294967296 && (hi - lo < 65536 || !f32)) { this.intData(ints, n, lo, hi, CT_DEC, e); return; }
          break;
        }
        if (e >= 3) break;
      }
    }
    if (f32 || (this.float32 && !allInt && min > -3e38 && max < 3e38)) { t = new Float32Array(n); for (i = 0; i < n; i++) t[i] = vals[i]; c.u8(CT_F32); this.blob(t, 'f32'); return; }
    if (vals instanceof Float64Array) t = vals;
    else { t = new Float64Array(n); for (i = 0; i < n; i++) t[i] = vals[i]; }
    if (this.picker && n >= ADAPT_MIN) {
      pre = MC.pack(t, this.mcOpts);
      if (this.altStore(t, n, 0, Math.min(pre.length, n * 8))) return;
    }
    c.u8(CT_F64); this.blob(t, 'f64', pre);
    if (this.defer) this.deferEnd();
  };
  Enc.prototype.bools = function (vals, n) {
    var bits = new Uint8Array((n + 7) >> 3), i;
    for (i = 0; i < n; i++) if (vals[i]) bits[i >> 3] |= 1 << (i & 7);
    this.ctl.u8(CT_BOOL); this.blob(bits, 'bits');
  };
  Enc.prototype.strings = function (vals, n) {
    var c = this.ctl, i, s, seen, dict, idx, id, m, sample = n < 256 ? n : 256, d0 = new Set(), pre;
    for (i = 0; i < sample; i++) d0.add(vals[i]);
    if (d0.size * 2 <= sample || n <= 64) {
      seen = new Map(); dict = []; idx = new Uint16Array(n);
      for (i = 0; i < n; i++) {
        s = vals[i];
        id = seen.get(s);                                                  // (a 'same as the last one' shortcut and a compare loop for few values were measured: no gain in V8, 0.8 to 1.6 ms slower to pack in WebKit)
        if (id === undefined) {
          id = dict.length;
          if (id >= 65536 || (id > 4096 && id * 2 > i + 1)) { seen = null; break; }
          seen.set(s, id); dict.push(s);
        }
        idx[i] = id;
      }
      if (seen) {
        m = dict.length; if (m <= 256) idx = new Uint8Array(idx);
        if (this.picker && n >= ADAPT_MIN && m >= 2 && this.dictCodes(idx, n, m, dict)) return;
        c.u8(CT_STRD); c.varint(m); this.rawStrings(dict, m); this.blob(idx, 'dict-index'); return;
      }
    }
    pre = joinText(vals, n);
    if (n >= 32 && this.patterns && pre && pre.ascii && this.template(vals, n, pre)) return;
    if (this.front && pre && pre.bytes && n >= 64 && this.frontColumn(vals, n, pre)) return;
    if (this.fsst && pre && this.fsstColumn(vals, n, pre)) return;
    c.u8(CT_STRR); this.rawStrings(vals, n, pre);
  };
  // the lengths and the joined UTF-8 text of a list of strings (kept for the writer so it is made once); null when it is too long for one piece
  function joinText(vals, n) {
    var lens = new Uint32Array(n), total = 0, i, l, joined, bytes;
    for (i = 0; i < n; i++) { l = vals[i].length; lens[i] = l; total += l; }
    if (total > 67108864) return null;
    joined = vals.join('');
    if (!wellFormed(joined)) return { lens: lens, joined: joined, bytes: null, ascii: false };
    bytes = utf8(joined);
    return { lens: lens, joined: joined, bytes: bytes, ascii: bytes.length === total };
  }
  // Strings that follow a pattern ('user' + number + '@example.org', '2025-03-05T04:15:00Z', 'Item 7 flow'): the text between the numbers is kept
  // once, each number goes into a column of its own. Up to 32 patterns with the same count of numbers. Returns false (and writes nothing) when the strings do not fit.
  function tplOf(s) {                                                     // the pieces of text between maximal runs of 1 to 15 digits; null when a run is longer
    var lits = [], n = s.length, i = 0, start = 0, c, e;
    while (i < n) {
      c = s.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        e = i + 1; while (e < n && (c = s.charCodeAt(e)) >= 48 && c <= 57) e++;
        if (e - i > 15) return null;
        lits.push(s.substring(start, i)); start = i = e;
      } else i++;
    }
    lits.push(s.substring(start, n));
    return lits;
  }
  // ---- the pattern scan: JavaScript below, and the same loop in WebAssembly (wasm/jso-kernels.c) when the page allows it
  var TRIE_NODES = 1024, KERNELS_B64 = /*KW:BEGIN*/'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'/*KW:END*/, KW = null, KW_STATE = 0;
  function b64bytes(t) {
    var bin = typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary'), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function kwTrim() { if (KW_STATE === 1 && KW && KW.mem.buffer.byteLength > 4194304) { KW = null; KW_STATE = 0; } }
  function kwGet() {                                // the helper's instance, made on first use; null when WebAssembly is missing or the page refuses it
    var inst;
    if (KW_STATE) return KW;
    KW_STATE = 2;
    try {
      if (typeof WebAssembly !== 'object' || !KERNELS_B64) return null;
      inst = new WebAssembly.Instance(KW_MOD || new WebAssembly.Module(b64bytes(KERNELS_B64)), {});
      KW = { x: inst.exports, mem: inst.exports.memory, base: (inst.exports.__heap_base.value + 15) & ~15 }; KW_STATE = 1;
    } catch (e) { KW = null; }
    return KW;
  }
  // Compiling starts when this file loads, in the background, so the first pack or unpack that wants the helper finds it ready (compiling it on the spot costs about 1 to 4 ms on the page's own
  // thread). Not started when a <meta> policy would refuse it (no error is logged for a page that forbids WebAssembly). If it is not ready yet when needed, it is compiled on the spot as before.
  var KW_MOD = null;
  (function () {
    try { if (typeof WebAssembly === 'object' && typeof WebAssembly.compile === 'function' && KERNELS_B64 && !wasmForbidden()) WebAssembly.compile(b64bytes(KERNELS_B64)).then(function (m) { KW_MOD = m; }, function () {}); } catch (e) { /* no helper: the plain code runs */ }
  })();
  function kwRoom(bytes) {                          // makes sure the helper's memory holds `bytes` after its base; false if it cannot (or it would be too big to keep)
    var need = KW.base + bytes, have = KW.mem.buffer.byteLength;
    if (need > 134217728) return false;
    if (need > have) { try { KW.mem.grow(Math.ceil((need - have) / 65536)); } catch (e) { return false; } if (need > 4194304) idleSoon(); }
    return true;
  }
  // The known patterns form a tree over the bytes of their text, with one branch (256) for "a run of digits"; a row is read by walking the tree once,
  // which gives the pattern and the numbers together. Node 0 is the root; next[node * 257 + byte] is the next node (0 = none), term[node] the pattern at its end.
  function Trie(next, term) { this.next = next; this.term = term; this.n = 1; next.fill(0, 0, 257); term[0] = -1; }
  Trie.prototype.child = function (node, edge) {
    var x = this.next[node * 257 + edge];
    if (x !== 0) return x;
    if (this.n >= TRIE_NODES) return -1;
    x = this.n++; this.next.fill(0, x * 257, x * 257 + 257); this.term[x] = -1; this.next[node * 257 + edge] = x; return x;
  };
  Trie.prototype.add = function (lits, id) {          // false when the tree is full
    var node = 0, j, k, L, R = lits.length - 1;
    for (j = 0; j <= R; j++) {
      L = lits[j];
      for (k = 0; k < L.length; k++) { node = this.child(node, L.charCodeAt(k)); if (node < 0) return false; }
      if (j < R) { node = this.child(node, 256); if (node < 0) return false; }
    }
    this.term[node] = id; return true;
  };
  function scanJS(b, lens, start, n, p, next, term, slots, R, tid, minL, maxL, lead, out) {      // same contract as tpl_scan in jso-kernels.c
    var i, end, node, q, k, ch, e, v, len, t;
    for (i = start; i < n; i++) {
      end = p + lens[i]; node = 0; q = p; k = 0;
      while (q < end) {
        ch = b[q];
        if (ch >= 48 && ch <= 57) {
          e = q; v = 0;
          do { v = v * 10 + (ch - 48); e++; } while (e < end && (ch = b[e]) >= 48 && ch <= 57);
          len = e - q;
          if (len > 15 || k >= R) { out[0] = i; out[1] = p; return i; }
          node = next[node * 257 + 256];
          if (node === 0) { out[0] = i; out[1] = p; return i; }
          slots[k * n + i] = v;
          if (len < minL[k]) minL[k] = len; if (len > maxL[k]) maxL[k] = len;
          if (len > 1 && b[q] === 48) lead[k] = 1;
          k++; q = e;
        } else { node = next[node * 257 + ch]; if (node === 0) { out[0] = i; out[1] = p; return i; } q++; }
      }
      t = term[node];
      if (t < 0) { out[0] = i; out[1] = p; return i; }
      tid[i] = t; p = end;
    }
    out[0] = n; out[1] = p; return n;
  }
  // Dates and times written as text ('2025-03-05T04:15:00Z'): the 3 to 7 numbers of the date and time can become one number (days, minutes, seconds or milliseconds
  // since 1970-01-01), which changes slowly in sorted data and so packs much smaller than separate month, day, hour columns. Only when every row is a real date.
  var TS_WIDTH = [4, 2, 2, 2, 2, 2, 3], TS_SEP = ['-', '-', 'T', ':', ':', '.'];
  function tsGroup(lits, R, minL, maxL) {                 // how many leading numbers form a date-time (0, 3, 5, 6 or 7), judged from the text between them and their fixed widths
    var g, j, ok;
    for (g = 7; g >= 3; g--) {
      if (g === 4 || g > R) continue;
      ok = true;
      for (j = 0; j < g && ok; j++) if (minL[j] !== TS_WIDTH[j] || maxL[j] !== TS_WIDTH[j]) ok = false;
      for (j = 1; j < g && ok; j++) if (lits[j] !== (j === 3 && lits[3] === ' ' ? ' ' : TS_SEP[j - 1])) ok = false;
      if (ok) return g;
    }
    return 0;
  }
  function daysFromCivil(y, m, d) {
    var era, yoe, doy;
    if (m <= 2) y--;
    era = Math.floor(y / 400); yoe = y - era * 400;
    doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  }
  var DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // the numbers of the date-time in slotsAll (slot j of row i at j * n + i) as one column, or null when a row is not a real date and time or when one number would cost more than the
  // separate ones (made-up dates that cycle through months, days and hours pack to almost nothing as separate columns): each is priced at the bytes of its range or of its
  // biggest step from the row before, whichever is smaller.
  function widthOf(x) { return x === 0 ? 0 : x < 256 ? 1 : x < 65536 ? 2 : x < 4294967296 ? 4 : 8; }
  function tsPack(g, f, n) {
    var out = new Float64Array(n), i, j, y, mo, d, h = 0, mi = 0, sec = 0, days, v, x, mn = [], mx = [], dm = [], cost = 0, own, tmin = Infinity, tmax = -Infinity, tdm = 0, mask = 0;
    while ((n >> (mask + 1)) > 1024) mask++;
    mask = (1 << mask) - 1;
    for (j = 0; j < g; j++) { mn.push(Infinity); mx.push(-Infinity); dm.push(0); }
    for (i = 0; i < n; i++) {
      y = f[i]; mo = f[n + i]; d = f[2 * n + i];
      if (mo < 1 || mo > 12 || d < 1 || d > (mo === 2 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : DIM[mo - 1])) return null;
      days = daysFromCivil(y, mo, d);
      if (g === 3) v = days;
      else {
        h = f[3 * n + i]; mi = f[4 * n + i];
        if (h > 23 || mi > 59) return null;
        if (g === 5) v = days * 1440 + h * 60 + mi;
        else {
          sec = f[5 * n + i];
          if (sec > 59) return null;
          v = days * 86400 + h * 3600 + mi * 60 + sec;
          if (g === 7) v = v * 1000 + f[6 * n + i];
        }
      }
      out[i] = v;
      if ((i & mask) !== 0) continue;                        // the price is judged from about 1000 rows spread over the column
      if (v < tmin) tmin = v; if (v > tmax) tmax = v;
      if (i > 0) { x = v - out[i - 1]; if (x < 0) x = -x; if (x > tdm) tdm = x; }
      for (j = 0; j < g; j++) {
        x = f[j * n + i]; if (x < mn[j]) mn[j] = x; if (x > mx[j]) mx[j] = x;
        if (i > 0) { x -= f[j * n + i - 1]; if (x < 0) x = -x; if (x > dm[j]) dm[j] = x; }
      }
    }
    for (j = 0; j < g; j++) cost += mx[j] === mn[j] ? 0 : Math.min(widthOf(mx[j] - mn[j]), widthOf(dm[j] * 2));
    own = tmax === tmin ? 0 : Math.min(widthOf(tmax - tmin), widthOf(tdm * 2));
    return own <= cost ? out : null;
  }
  // back to the separate numbers, one Int32Array per slot; the calendar part is worked out once per distinct day (sorted data repeats days)
  function tsUnpack(g, ts, n) {
    var cY = new Int32Array(n), cM = new Int32Array(n), cD = new Int32Array(n), cH = g >= 5 ? new Int32Array(n) : null, cI = g >= 5 ? new Int32Array(n) : null, cS = g >= 6 ? new Int32Array(n) : null, cF = g === 7 ? new Int32Array(n) : null;
    var per = g === 3 ? 1 : g === 5 ? 1440 : g === 6 ? 86400 : 86400000, i, v, days, rest, last = -1e18, y = 0, m = 0, d = 0, z, era, doe, yoe, doy, mp, ms, ra = ts.mode === 3 ? null : ts.a, cv = ts.mode === 3 ? ts.d : 0;
    for (i = 0; i < n; i++) {
      v = ra ? ra[i] : cv;
      days = Math.floor(v / per); rest = (v - days * per) | 0;
      if (days !== last) {
        last = days; z = days + 719468; era = Math.floor(z / 146097); doe = (z - era * 146097) | 0;
        yoe = ((doe - ((doe / 1460) | 0) + ((doe / 36524) | 0) - ((doe / 146096) | 0)) / 365) | 0;
        doy = doe - (365 * yoe + (yoe >> 2) - ((yoe / 100) | 0)); mp = ((5 * doy + 2) / 153) | 0;
        d = doy - (((153 * mp + 2) / 5) | 0) + 1; m = mp < 10 ? mp + 3 : mp - 9; y = yoe + era * 400 + (m <= 2 ? 1 : 0);
      }
      cY[i] = y; cM[i] = m; cD[i] = d;
      if (g === 3) continue;
      if (g === 7) { ms = rest % 1000; rest = (rest - ms) / 1000 | 0; cF[i] = ms; }
      if (g === 5) { cH[i] = (rest / 60) | 0; cI[i] = rest % 60; continue; }
      cH[i] = (rest / 3600) | 0; cI[i] = ((rest % 3600) / 60) | 0; cS[i] = rest % 60;
    }
    return g === 3 ? [cY, cM, cD] : g === 5 ? [cY, cM, cD, cH, cI] : g === 6 ? [cY, cM, cD, cH, cI, cS] : [cY, cM, cD, cH, cI, cS, cF];
  }
  var TRIE_JS = null;
  Enc.prototype.template = function (vals, n, pre) {
    var b = pre.bytes, lens = pre.lens, lits0 = tplOf(vals[0]), R, tpls, j, t, i, widths, L, c = this.ctl, nt, total = b.length, tr, kw = null, buf, off, at;
    var next, term, slotsAll, tid, minL, maxL, lead, out, bb, ll, row, p, r, g, ts;
    if (!lits0 || lits0.length < 2 || lits0.length > MAX_SLOTS + 1) return false;
    R = lits0.length - 1; tpls = [lits0];
    if (this.mcOpts.wasm !== false && n >= 4096 && (kw = kwGet())) {          // the helper's memory holds the bytes, lengths, numbers and tree; below 4096 rows the copy-in costs more than it saves
      at = KW.base;
      var oNext = at; at += TRIE_NODES * 257 * 2; var oTerm = at; at += TRIE_NODES; at = (at + 15) & ~15;
      var oBytes = at; at += total; at = (at + 15) & ~15;
      var oLens = at; at += n * 4; var oTid = at; at += n; at = (at + 15) & ~15;
      var oSlots = at; at += n * R * 8; var oMin = at; at += R * 4; var oMax = at; at += R * 4; var oLead = at; at += R; at = (at + 15) & ~15; var oOut = at; at += 8;
      if (!kwRoom(at - KW.base + 64)) kw = null;
      else {
        buf = KW.mem.buffer;
        next = new Int16Array(buf, oNext, TRIE_NODES * 257); term = new Int8Array(buf, oTerm, TRIE_NODES);
        bb = new Uint8Array(buf, oBytes, total); bb.set(b); ll = new Uint32Array(buf, oLens, n); ll.set(lens);
        tid = new Uint8Array(buf, oTid, n); slotsAll = new Float64Array(buf, oSlots, n * R);
        minL = new Int32Array(buf, oMin, R); maxL = new Int32Array(buf, oMax, R); lead = new Uint8Array(buf, oLead, R); out = new Uint32Array(buf, oOut, 2);
      }
    }
    if (!kw) {
      if (!TRIE_JS) TRIE_JS = [new Int16Array(TRIE_NODES * 257), new Int8Array(TRIE_NODES)];       // the tree is only read while scanning and every node is cleared when it is made, so one pair serves every column
      next = TRIE_JS[0]; term = TRIE_JS[1]; bb = b; ll = lens; tid = new Uint8Array(n); slotsAll = new Float64Array(n * R);
      minL = new Int32Array(R); maxL = new Int32Array(R); lead = new Uint8Array(R); out = new Uint32Array(2);
    }
    minL.fill(99); maxL.fill(0); lead.fill(0);
    tr = new Trie(next, term); tr.add(lits0, 0);
    row = 0; p = 0;
    for (;;) {
      r = kw ? KW.x.tpl_scan(oBytes, oLens, row, n, p, oNext, oTerm, oSlots, R, oTid, oMin, oMax, oLead, oOut) : scanJS(bb, ll, row, n, p, next, term, slotsAll, R, tid, minL, maxL, lead, out);
      if (r >= n) break;
      row = out[0]; p = out[1];                                     // this row fits no known pattern: add one (or give up)
      if (tpls.length >= MAX_TEMPLATES) return false;
      L = tplOf(vals[row]); if (!L || L.length !== R + 1) return false;
      if (!tr.add(L, tpls.length)) return false;
      tpls.push(L);
    }
    widths = [];
    for (j = 0; j < R; j++) { if (!lead[j]) widths.push(0); else if (minL[j] === maxL[j]) widths.push(minL[j]); else return false; }
    nt = tpls.length;
    if (nt === 1 && (g = tsGroup(tpls[0], R, minL, maxL)) && (ts = tsPack(g, slotsAll, n))) {
      this.usedTimes = true;
      c.u8(CT_TIMES); c.u8(g); c.varint(R);
      for (j = 0; j <= R; j++) c.str(tpls[0][j]);
      for (j = g; j < R; j++) c.varint(widths[j]);
      this.column(ts, n);
      for (j = g; j < R; j++) this.column(slotsAll.subarray(j * n, (j + 1) * n), n);
      return true;
    }
    c.u8(CT_TEMPLATE); c.varint(nt); c.varint(R);
    for (t = 0; t < nt; t++) for (j = 0; j <= R; j++) c.str(tpls[t][j]);
    for (j = 0; j < R; j++) c.varint(widths[j]);
    if (nt > 1) this.blob(tid, 'template-ids');
    for (j = 0; j < R; j++) this.column(slotsAll.subarray(j * n, (j + 1) * n), n);
    return true;
  };
  // ================================================================ FSST (short strings, each readable alone)
  // After Boncz, Neumann and Leis, "FSST: Fast Random Access String Compression", VLDB 2020. A table of up to 255 symbols (1 to 8 bytes) learned from the column; a string becomes one
  // byte per symbol and code 255 means "the next byte is literal", so any one string can be read without the others. The table is trained here in JavaScript; the wasm kernel (when
  // present, 4,096 strings and up) encodes and decodes whole columns with the same codes.
  var FS_ESC = 255, FS_ROUNDS = 5, FS_SAMPLE = 16384;
  function FsTable(symbols) {
    var b, i, sy = symbols;
    this.symbols = sy; this.byFirst = []; this.len = 0;
    for (b = 0; b < 256; b++) this.byFirst.push([]);
    for (i = 0; i < sy.length; i++) this.byFirst[sy[i][0]].push(i);
    for (b = 0; b < 256; b++) this.byFirst[b].sort(function (x, y) { return sy[y].length - sy[x].length; });
  }
  FsTable.prototype.match = function (s, pos, end) {                       // the code of the longest symbol at pos, or -1; the symbol's length goes in this.len
    var c = this.byFirst[s[pos]], syms = this.symbols, k, sym, L, j;
    for (k = 0; k < c.length; k++) {
      sym = syms[c[k]]; L = sym.length;
      if (pos + L > end) continue;
      j = 1; while (j < L && s[pos + j] === sym[j]) j++;
      if (j === L) { this.len = L; return c[k]; }
    }
    return -1;
  };
  function fsKey(u8) { var s = '', i; for (i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
  function fsConcat(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function fsTrain(bytes, offs, n) {                                       // a table from a random sample of the strings (a regular step lines up with repeating data and misses most of the variety)
    var data = [], total = offs[n], keep = total > FS_SAMPLE ? FS_SAMPLE / total : 1, rs = 2463534242, i, g, r, table = new FsTable([]), cnt, m, s, pos, end, c, sym, k, prev, e;
    var count1, count2, cand, out, seen, u, kk, ks, cs, k2;
    for (i = 0; i < n; i++) {
      rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
      if (keep < 1 && (rs >>> 0) / 4294967296 >= keep) continue;
      if (offs[i + 1] > offs[i]) data.push(bytes.subarray(offs[i], offs[i + 1]));
    }
    if (!data.length) return table;
    for (g = 1; g <= FS_ROUNDS; g++) {
      m = Math.max(1, Math.round(data.length * (g === FS_ROUNDS ? 1 : (8 + 30 * g) / 128)));        // later rounds use more of the sample
      count1 = {}; count2 = {};
      for (i = 0; i < m; i++) {
        s = data[(i * 7919) % data.length]; pos = 0; end = s.length; prev = null;
        while (pos < end) {
          c = table.match(s, pos, end);
          if (c < 0) { sym = s.subarray(pos, pos + 1); pos += 1; } else { sym = table.symbols[c]; pos += sym.length; }
          k = fsKey(sym); count1[k] = (count1[k] || 0) + 1;
          if (prev !== null && prev.sym.length + sym.length <= 8) { k2 = prev.k + '\u0100' + k; e = count2[k2]; if (e) e.n++; else count2[k2] = { n: 1, a: prev.sym, b: sym }; }
          prev = { k: k, sym: sym };
        }
      }
      cand = [];
      for (kk in count1) { u = new Uint8Array(kk.length); for (i = 0; i < kk.length; i++) u[i] = kk.charCodeAt(i); cand.push({ sym: u, gain: count1[kk] * u.length }); }
      for (kk in count2) { e = count2[kk]; cs = fsConcat(e.a, e.b); cand.push({ sym: cs, gain: e.n * cs.length }); }
      cand.sort(function (x, y) { return y.gain - x.gain || x.sym.length - y.sym.length; });
      seen = {}; out = [];
      for (i = 0; i < cand.length && out.length < 255; i++) { ks = fsKey(cand[i].sym); if (seen[ks]) continue; seen[ks] = 1; out.push(cand[i].sym); }
      table = new FsTable(out);
    }
    return table;
  }
  function fsEncodeJS(table, bytes, offs, n) {                             // { codes, coff }: all codes back to back and n + 1 offsets into them
    var coff = new Uint32Array(n + 1), codes = new Uint8Array(offs[n] * 2 + 8), o = 0, i, pos, end, c;
    for (i = 0; i < n; i++) {
      pos = offs[i]; end = offs[i + 1];
      while (pos < end) {
        c = table.match(bytes, pos, end);
        if (c >= 0) { codes[o++] = c; pos += table.len; } else { codes[o++] = FS_ESC; codes[o++] = bytes[pos++]; }
      }
      coff[i + 1] = o;
    }
    return { codes: codes.subarray(0, o), coff: coff };
  }
  function fsLoadKernel(kw, symbols) {                                     // the helper keeps one table at a time
    var tp = kw.x.fsst_tbl(), m = new Uint8Array(kw.mem.buffer), i, j, s;
    for (i = 0; i < symbols.length; i++) { s = symbols[i]; m[tp + i * 9] = s.length; for (j = 0; j < s.length; j++) m[tp + i * 9 + 1 + j] = s[j]; }
    kw.x.fsst_init(symbols.length);
  }
  function fsEncodeKernel(kw, table, bytes, offs, n) {                     // null when the helper's memory cannot hold the column
    var total = offs[n], al = function (x) { return (x + 15) & ~15; }, srcP = kw.base, offP = al(srcP + total + 16), dstP = al(offP + (n + 1) * 4), ooP = al(dstP + total * 2 + 16), end = ooP + (n + 1) * 4, o, mem;
    if (!kwRoom(end - kw.base + 64)) return null;
    mem = new Uint8Array(kw.mem.buffer);
    mem.set(bytes.subarray(0, total), srcP); mem.fill(0, srcP + total, srcP + total + 16);
    new Uint32Array(kw.mem.buffer, offP, n + 1).set(offs.subarray(0, n + 1));
    fsLoadKernel(kw, table.symbols);
    o = kw.x.fsst_encode_col(srcP, offP, n, dstP, ooP) >>> 0;
    return { codes: new Uint8Array(kw.mem.buffer, dstP, o).slice(), coff: new Uint32Array(kw.mem.buffer, ooP, n + 1).slice() };
  }
  function utf8Len(s) {
    var n = 0, i, c, l = s.length;
    for (i = 0; i < l; i++) { c = s.charCodeAt(i); n += c < 128 ? 1 : c < 2048 ? 2 : (c & 0xFC00) === 0xD800 ? (i++, 4) : 3; }
    return n;
  }
  function narrow(lens, n) {                                               // the smallest unsigned array that holds the lengths
    var max = 0, i, t;
    for (i = 0; i < n; i++) if (lens[i] > max) max = lens[i];
    t = max < 256 ? new Uint8Array(n) : max < 65536 ? new Uint16Array(n) : new Uint32Array(n);
    for (i = 0; i < n; i++) t[i] = lens[i];
    return t;
  }
  Enc.prototype.packedSize = function (t) {                                // what blob() would store for this array
    var raw = t.length * t.BYTES_PER_ELEMENT, p;
    if (raw < RAW_LIMIT) return raw + 1;
    p = MC.pack(t, this.mcOpts);
    return (p.length < raw ? p.length : raw) + 6;
  };
  // Front coding: each string stores how many UTF-16 units it shares with the string before it and then only its new end. Wins on sorted words, file paths and
  // other text whose neighbors start alike; tried only when the first 1,024 neighbors share a quarter of their characters, and kept only when at least 15% smaller than the joined text (a smaller win is not worth the extra time to read it back).
  Enc.prototype.frontColumn = function (vals, n, pre) {
    var i, j, a, b, m, k, pa, pb, shared = 0, total = 0, P, S, pre2, frontSize, textSize, c = this.ctl, ss = n < 1025 ? n : 1025;
    for (i = 1; i < ss; i++) {
      a = vals[i - 1]; b = vals[i]; m = a.length < b.length ? a.length : b.length;
      for (j = 0; j < m && a.charCodeAt(j) === b.charCodeAt(j); j++);
      shared += j; total += b.length;
    }
    if (shared * 4 < total) return false;
    if (pre.ascii && pre.bytes.length < 134217728) return this.frontBytes(n, pre);          // plain ASCII: the same work straight on the bytes, no new strings
    P = new Uint32Array(n); S = new Array(n); S[0] = vals[0];
    for (i = 1; i < n; i++) {
      a = vals[i - 1]; b = vals[i]; m = a.length < b.length ? a.length : b.length;
      for (j = 0; j < m && a.charCodeAt(j) === b.charCodeAt(j); j++);
      if (j > 0 && j < b.length && (b.charCodeAt(j - 1) & 0xFC00) === 0xD800) j--;               // never cut between the two halves of a pair
      P[i] = j; S[i] = j ? b.substring(j) : b;
    }
    k = n > 4096 ? 2048 : n;                                  // big columns are judged on their first 2,048 rows so the decision costs little
    if (k < n) {
      pa = joinText(vals.slice(0, k), k); pb = joinText(S.slice(0, k), k);
      if (!pa || !pa.bytes || !pb || !pb.bytes) return false;
      frontSize = this.packedSize(narrow(P.subarray(0, k), k)) + this.packedSize(narrow(pb.lens, k)) + this.packedSize(pb.bytes);
      textSize = this.packedSize(narrow(pa.lens, k)) + this.packedSize(pa.bytes);
      if (frontSize * 100 > textSize * 85) return false;
      pre2 = joinText(S, n);
      if (!pre2 || !pre2.bytes) return false;
    } else {
      pre2 = joinText(S, n);
      if (!pre2 || !pre2.bytes) return false;
      frontSize = this.packedSize(narrow(P, n)) + this.packedSize(narrow(pre2.lens, n)) + this.packedSize(pre2.bytes);
      textSize = this.packedSize(narrow(pre.lens, n)) + this.packedSize(pre.bytes);
      if (frontSize * 100 > textSize * 85) return false;
    }
    this.usedFront = true;
    c.u8(CT_FRONT); this.lengths(P, n); this.rawStrings(S, n, pre2);
    return true;
  };
  Enc.prototype.frontBytes = function (n, pre) {              // the front-coding step for ASCII text (one byte per character), judged on the first 2,048 rows when the column is large
    var bytes = pre.bytes, lens = pre.lens, P = new Uint32Array(n), L2 = new Uint32Array(n), out = new Uint8Array(bytes.length), i, j, m, l, o = 0, po = 0, w = 0, e, k = n > 4096 ? 2048 : n, frontSize, textSize, c = this.ctl;
    for (i = 0; i < n; i++) {
      l = lens[i]; j = 0;
      if (i > 0) { m = lens[i - 1] < l ? lens[i - 1] : l; while (j < m && bytes[po + j] === bytes[o + j]) j++; }
      P[i] = j; L2[i] = l - j;
      for (e = o + l, j += o; j < e; j++) out[w++] = bytes[j];
      po = o; o += l;
      if (i + 1 === k) {                                       // judged here, so a column that will not win stops after its first rows
        frontSize = this.packedSize(narrow(P.subarray(0, k), k)) + this.packedSize(narrow(L2.subarray(0, k), k)) + this.packedSize(out.subarray(0, w));
        textSize = this.packedSize(narrow(lens.subarray(0, k), k)) + this.packedSize(bytes.subarray(0, o));
        if (frontSize * 100 > textSize * 85) return false;
      }
    }
    this.usedFront = true;
    c.u8(CT_FRONT); this.lengths(P, n); this.rawStrings(null, n, { lens: L2, bytes: out.subarray(0, w), ascii: true });
    return true;
  };
  // A text column with no pattern and no small dictionary, stored as FSST codes when that is smaller than the joined text (pack option fsst: true). False writes nothing.
  Enc.prototype.fsstColumn = function (vals, n, pre) {
    var bytes = pre.bytes, total, offs, i, table, enc, kw = null, textLens, codeLens, fsSize, textSize, c = this.ctl, ns, j, s;
    if (!bytes || bytes.length === 0 || n < 512) return false;
    total = bytes.length;
    offs = new Uint32Array(n + 1);
    if (pre.ascii) for (i = 0; i < n; i++) offs[i + 1] = offs[i] + pre.lens[i];
    else for (i = 0; i < n; i++) offs[i + 1] = offs[i] + utf8Len(vals[i]);
    if (offs[n] !== total) return false;
    table = fsTrain(bytes, offs, n);
    ns = table.symbols.length;
    if (ns === 0) return false;
    if (this.mcOpts.wasm !== false && n >= 4096 && (kw = kwGet())) enc = fsEncodeKernel(kw, table, bytes, offs, n);
    if (!enc) enc = fsEncodeJS(table, bytes, offs, n);
    codeLens = new Uint32Array(n); for (i = 0; i < n; i++) codeLens[i] = enc.coff[i + 1] - enc.coff[i];
    fsSize = 1 + ns * 5 + this.packedSize(narrow(codeLens, n)) + this.packedSize(enc.codes);
    textSize = this.packedSize(narrow(pre.lens, n)) + this.packedSize(bytes);
    if (fsSize > textSize) return false;
    this.needsV3 = true;
    c.u8(CT_FSST); c.varint(ns);
    for (j = 0; j < ns; j++) { s = table.symbols[j]; c.u8(s.length); c.bytes(s); }
    c.varint(total);
    this.lengths(codeLens, n);
    this.blob(enc.codes, 'fsst-codes');
    return true;
  };
  Enc.prototype.rawStrings = function (vals, n, pre) {         // lengths (UTF-16 units) as numbers, then the joined text in pieces of at most 64M characters
    var c = this.ctl, lens = new Uint32Array(n), i, j, acc = 0, bounds = [0], joined, bytes, u, piece, limit = 67108864;
    if (pre) {
      this.lengths(pre.lens, n); c.varint(1); c.varint(n);
      if (pre.bytes) { c.u8(0); c.varint(pre.bytes.length); this.blob(pre.bytes, 'text'); }
      else { joined = pre.joined; c.u8(1); u = new Uint16Array(joined.length); for (j = 0; j < joined.length; j++) u[j] = joined.charCodeAt(j); c.varint(u.length); this.blob(u, 'text'); }
      return;
    }
    for (i = 0; i < n; i++) {
      lens[i] = vals[i].length;
      if (acc + lens[i] > limit && i > bounds[bounds.length - 1]) { bounds.push(i); acc = 0; }
      acc += lens[i];
    }
    bounds.push(n);
    this.lengths(lens, n);
    c.varint(bounds.length - 1);
    for (i = 0; i + 1 < bounds.length; i++) {
      piece = bounds.length === 2 ? vals : vals.slice(bounds[i], bounds[i + 1]);
      c.varint(bounds[i + 1] - bounds[i]);
      joined = piece.join('');
      if (wellFormed(joined)) { c.u8(0); bytes = utf8(joined); c.varint(bytes.length); this.blob(bytes, 'text'); }
      else { c.u8(1); u = new Uint16Array(joined.length); for (j = 0; j < joined.length; j++) u[j] = joined.charCodeAt(j); c.varint(u.length); this.blob(u, 'text'); }
    }
  };
  Enc.prototype.lengths = function (lens, n) {
    var i, max = 0, min = Infinity;
    for (i = 0; i < n; i++) { if (lens[i] > max) max = lens[i]; if (lens[i] < min) min = lens[i]; }
    if (min === max) { this.ctl.u8(CT_CONST); this.ctl.varint(min); return; }
    this.ctl.u8(CT_INT); this.intData(lens, n, min, max);
  };
  Enc.prototype.arrays = function (vals, n) {
    var c = this.ctl, i, j, k = vals[0].length, same = true, total = 0, a, lens, flat, col;
    for (i = 0; i < n; i++) { a = vals[i]; if (a.length !== k) same = false; total += a.length; }
    if (same && k > 0 && k <= 8) {
      c.u8(CT_TUPLE); c.varint(k);
      col = new Array(n);
      for (j = 0; j < k; j++) { for (i = 0; i < n; i++) col[i] = vals[i][j]; this.column(col, n); }
      return;
    }
    lens = new Uint32Array(n); flat = new Array(total); var q = 0;
    for (i = 0; i < n; i++) { a = vals[i]; lens[i] = a.length; for (j = 0; j < a.length; j++) flat[q++] = a[j]; }
    c.u8(CT_ARRAYS); c.varint(total);
    this.lengths(lens, n);
    if (total > 0) this.column(flat, total);
  };
  Enc.prototype.fusedTuples = function (vals, n, k) {
    var first = vals[0], idx = [], j, cols, c = this.ctl;
    for (j = 0; j < k; j++) idx.push(j);
    cols = splitColumns(function (types) { return tupleSplitter(k, types); }, 'T' + k, first, idx, vals, n);
    if (!cols) return false;
    c.u8(CT_TUPLE); c.varint(k);
    for (j = 0; j < k; j++) this.column(cols[j], n);
    return true;
  };
  Enc.prototype.fusedArrays = function (vals, n) {
    var lens = new Uint32Array(n), q = 0, i, j, a, len, k = 0, flat, cols;
    for (i = 0; i < n; i++) {
      a = vals[i]; if (!Array.isArray(a)) return false;
      len = a.length; lens[i] = len; q += len;
      if (k === 0 && len > 0 && Array.isArray(a[0])) k = a[0].length;
    }
    this.ctl.u8(CT_ARRAYS); this.ctl.varint(q);
    this.lengths(lens, n);
    if (q === 0) return true;
    if (k > 0 && k <= 8) {                                             // arrays of small tuples (coordinate lists): flattened and split into one column per position in one pass
      cols = splitColumns(function (types) { return tupleFlattener(k, types); }, 'F' + k, vals[firstNonEmpty(vals, n)][0], tupleIdx(k), vals, n, q);
      if (cols) {
        this.ctl.u8(CT_TUPLE); this.ctl.varint(k);
        for (j = 0; j < k; j++) this.column(cols[j], q);
        return true;
      }
    }
    flat = q > 30000000 ? [] : new Array(q); q = 0;
    for (i = 0; i < n; i++) { a = vals[i]; len = a.length; for (j = 0; j < len; j++) flat[q++] = a[j]; }
    this.column(flat, q);
    return true;
  };
  function varintLen(v) { var n = 1; while (v > 127) { v = Math.floor(v / 128); n++; } return n; }
  function patch5(b, at, v) { var i; for (i = 0; i < 4; i++) { b[at + i] = (v % 128) | 128; v = Math.floor(v / 128); } b[at + 4] = v; }
  // The columns of one list of same-shape records, each with its own key numbering, behind a directory of (control bytes, data bytes) per column
  // (written as 5-byte numbers filled in afterwards) so a reader can skip to any column.
  Enc.prototype.dirColumns = function (cols, n, keys, path) {
    var st = this.dirStart(cols.length), j;
    for (j = 0; j < cols.length; j++) this.dirColumn(st, cols[j], n, keys, j, path);
    this.path = path;
  };
  Enc.prototype.dirStart = function (nk) {
    var c = this.ctl, dir, j;
    c.need(nk * 10 + 16); dir = c.p;
    for (j = 0; j < nk * 2; j++) { c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 0; }
    return dir;
  };
  Enc.prototype.dirColumn = function (dir, col, n, keys, j, path) {
    var st = this.dirColumnBegin(j, keys, path);
    this.column(col, n);
    this.dirColumnEnd(dir, st, j);
  };
  Enc.prototype.dirColumnBegin = function (j, keys, path) {
    var st = { c0: this.ctl.p, b0: this.blobs.pos(), saved: this.keys, j0: this.defer ? this.defer.jobs.length : 0 };
    this.keys = new Map();
    if (this.report) this.path = path + '.' + keys[j];
    return st;
  };
  Enc.prototype.dirColumnEnd = function (dir, st, j) {
    var c = this.ctl;
    this.keys = st.saved;
    patch5(c.b, dir + j * 10, c.p - st.c0); patch5(c.b, dir + j * 10 + 5, this.blobs.pos() - st.b0);
    if (this.defer) this.defer.dirs.push({ at: dir + j * 10, c0: st.c0, c1: c.p, b0: st.b0, b1: this.blobs.pos(), j0: st.j0, j1: this.defer.jobs.length });
  };
  Enc.prototype.fusedRecords = function (vals, n) {
    var c = this.ctl, keys = Object.keys(vals[0]), nk = keys.length, cols, j, path = this.path;
    if (nk === 0 || nk > MAX_FUSED_KEYS) return false;
    cols = splitColumns(function (types) { return fusedExtractor(keys, types); }, 'R' + keys.join('\u0001') + '\u0002' + nk, vals[0], keys, vals, n);
    if (!cols) return false;
    c.u8(CT_RECORDS); c.varint(1); c.varint(nk);
    for (j = 0; j < nk; j++) { if (wellFormed(keys[j])) { c.u8(0); c.str(keys[j]); } else { c.u8(1); this.str16(keys[j]); } }
    this.dirColumns(cols, n, keys, path);
    giveF64(cols);
    return true;
  };
  // refs: true. Objects are numbered in the order they are written. A column whose values are all objects written before is just their numbers;
  // a column of flat records (every value a number, text, boolean, null or undefined, an object written before, or a plain flat object or array; none of the records written before or twice) is stored as columns, the records numbered one after another.
  Enc.prototype.refColumn = function (vals, n) {
    var ids = new Float64Array(n), i, id;
    for (i = 0; i < n; i++) { id = this.seen.get(vals[i]); if (id === undefined) return false; ids[i] = id; }
    this.ctl.u8(CT_REFS); this.column(ids, n);
    return true;
  };
  function flatContainer(v) {                          // an array or plain object holding only numbers, text, booleans, null, undefined or bigints
    var p, x, t, i;
    if (Array.isArray(v)) {
      for (i = 0; i < v.length; i++) { x = v[i]; t = typeof x; if ((t === 'object' && x !== null) || t === 'function' || t === 'symbol') return false; }
      return true;
    }
    if (Object.getPrototypeOf(v) !== OP) return false;
    for (p in v) { x = v[p]; t = typeof x; if ((t === 'object' && x !== null) || t === 'function' || t === 'symbol') return false; }
    return true;
  }
  // One pass over the records: checks each (same keys in the same order, none written before or twice) and splits it into columns; the records are numbered as they pass
  // (the caller takes the numbers back if it returns -1). Values that are objects must be ones written before (not siblings) or plain and flat (collected in `nested`).
  function refSplitter(keys) {
    var sig = 'g' + keys.join('\u0001') + '\u0002' + keys.length, f = GEN_CACHE[sig], j, src, nk = keys.length;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var r=[],i,o,k,p,v,t,id;';
      for (j = 0; j < nk; j++) src += 'var c' + j + '=new Array(n);r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){o=rows[i];if(typeof o!=="object"||o===null||Object.getPrototypeOf(o)!==OP||seen.has(o)){H.done=i;return -1;}seen.set(o,seen.size);H.done=i+1;k=0;for(p in o){if(p!==keys[k++])return -1;}if(k!==' + nk + ')return -1;';
      for (j = 0; j < nk; j++) {
        src += 'v=o[' + JSON.stringify(keys[j]) + '];c' + j + '[i]=v;t=typeof v;';
        src += 'if(t==="object"||t==="function"||t==="symbol"){if(t!=="object")return -1;if(v!==null){id=seen.get(v);if(id===undefined){if(!flat(v))return -1;nested.push(v);}else if(id>=base)return -1;}}';
      }
      src += '}return r;';
      f = new Function('rows', 'n', 'keys', 'OP', 'seen', 'base', 'nested', 'flat', 'H', src);
    } else {
      f = function (rows, n, ks, OPp, seen, base, nested, flat, H) {
        var r = [], i, jj, o, k, p, v, t, id;
        for (jj = 0; jj < nk; jj++) r.push(new Array(n));
        for (i = 0; i < n; i++) {
          o = rows[i];
          if (typeof o !== 'object' || o === null || Object.getPrototypeOf(o) !== OPp || seen.has(o)) { H.done = i; return -1; }
          seen.set(o, seen.size); H.done = i + 1; k = 0;
          for (p in o) { if (p !== ks[k++]) return -1; }
          if (k !== nk) return -1;
          for (jj = 0; jj < nk; jj++) {
            v = o[ks[jj]]; r[jj][i] = v; t = typeof v;
            if (t === 'object' || t === 'function' || t === 'symbol') { if (t !== 'object') return -1; if (v !== null) { id = seen.get(v); if (id === undefined) { if (!flat(v)) return -1; nested.push(v); } else if (id >= base) return -1; } }
          }
        }
        return r;
      };
    }
    genStore(sig, f);
    return f;
  }
  Enc.prototype.refRecords = function (vals, n) {
    var keys = Object.keys(vals[0]), nk = keys.length, i, j, id, c = this.ctl, seen = this.seen, nested = [], base = seen.size, H = { done: 0 }, cols, path = this.path, ok;
    if (nk === 0 || nk > MAX_FUSED_KEYS) return false;
    cols = refSplitter(keys)(vals, n, keys, OP, seen, base, nested, flatContainer, H);
    ok = typeof cols !== 'number';
    if (ok) for (i = 0; i < nested.length; i++) { id = seen.get(nested[i]); if (id !== undefined && id >= base) { ok = false; break; } }    // a record that holds another record of this list could not be built in one go
    if (!ok) { for (i = 0; i < H.done; i++) seen.delete(vals[i]); return false; }
    c.u8(CT_REFRECS); c.varint(1); c.varint(nk);
    for (j = 0; j < nk; j++) { if (wellFormed(keys[j])) { c.u8(0); c.str(keys[j]); } else { c.u8(1); this.str16(keys[j]); } }
    this.dirColumns(cols, n, keys, path);
    return true;
  };
  Enc.prototype.records = function (vals, n) {
    var c = this.ctl, i, j, o, keys, sig, shapes = [], bySig = {}, sh, last = null, lk, shapeOf = null, nk, same;
    for (i = 0; i < n; i++) {
      o = vals[i]; keys = Object.keys(o);
      if (last !== null && keys.length === last.keys.length) {
        same = true; lk = last.keys;
        for (j = 0; j < lk.length; j++) if (keys[j] !== lk[j]) { same = false; break; }
        if (same) { if (shapeOf) { shapeOf[i] = last.id; last.rows.push(o); } else last.count++; continue; }
      }
      sig = keys.join('\u0001') + '\u0002' + keys.length;
      sh = bySig[sig];
      if (sh === undefined) {
        if (shapes.length >= MAX_SHAPES) { this.any(vals, n); return; }
        sh = { id: shapes.length, keys: keys, rows: [], count: 0 }; bySig[sig] = sh; shapes.push(sh);
        if (shapes.length === 2 && !shapeOf) {                                  // a second shape appeared: go back and number the earlier rows
          shapeOf = new Uint8Array(n); shapes[0].rows = new Array(shapes[0].count); for (j = 0; j < i; j++) shapes[0].rows[j] = vals[j];
        }
      }
      if (shapeOf) { shapeOf[i] = sh.id; sh.rows.push(o); } else sh.count++;
      last = sh;
    }
    c.u8(CT_RECORDS); c.varint(shapes.length);
    for (i = 0; i < shapes.length; i++) {
      sh = shapes[i]; nk = sh.keys.length; c.varint(nk);
      for (j = 0; j < nk; j++) { if (wellFormed(sh.keys[j])) { c.u8(0); c.str(sh.keys[j]); } else { c.u8(1); this.str16(sh.keys[j]); } }
    }
    if (shapes.length > 1) this.blob(shapeOf, 'shape-index');
    for (i = 0; i < shapes.length; i++) {
      sh = shapes[i]; var rows = shapeOf ? sh.rows : vals, cnt = rows.length;
      if (shapes.length > 1) c.varint(cnt);
      var cols = extractor(sh.keys)(rows, cnt), path = this.path;
      if (shapes.length === 1) this.dirColumns(cols, cnt, sh.keys, path);
      else for (j = 0; j < sh.keys.length; j++) {
        if (this.report) this.path = path + '.' + sh.keys[j];
        if (cnt > 0) this.column(cols[j], cnt);
      }
      this.path = path;
    }
  };

  // ---- generated helpers (new Function when allowed; otherwise plain loops that do the same)
  function extractor(keys) {
    var sig = 'x' + keys.join('\u0001'), f = GEN_CACHE[sig], j, src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var r=[],i,o;';
      for (j = 0; j < keys.length; j++) src += 'var c' + j + '=new Array(n);r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){o=rows[i];';
      for (j = 0; j < keys.length; j++) src += 'c' + j + '[i]=o[' + JSON.stringify(keys[j]) + '];';
      src += '}return r;';
      f = new Function('rows', 'n', src);
    } else {
      f = function (rows, n) {
        var r = [], i, jj, o;
        for (jj = 0; jj < keys.length; jj++) r.push(new Array(n));
        for (i = 0; i < n; i++) { o = rows[i]; for (jj = 0; jj < keys.length; jj++) r[jj][i] = o[keys[jj]]; }
        return r;
      };
    }
    genStore(sig, f);
    return f;
  }
  // One pass over rows that all have the same plain-object layout: checks each row and splits it into one column per key.
  // Keys whose first value is a number go straight into a Float64Array (no boxed numbers, nothing for the collector to scan);
  // 'types' says which ('n' number, 'a' any). Returns the columns, -1 when a row does not fit, or -(2 + j) when key j held a non-number.
  function typesFor(first, keys, learned) {
    var t = learned ? learned.slice() : [], j;
    if (!learned) for (j = 0; j < keys.length; j++) t.push(typeof first[keys[j]] === 'number' ? 'n' : 'a');
    return t;
  }
  function fusedExtractor(keys, types) {
    var sig = 'f' + keys.join('\u0001') + '\u0002' + types.join(''), f = GEN_CACHE[sig], j, src, nk = keys.length;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var r=[],i,o,k,p,v;';
      for (j = 0; j < nk; j++) src += 'var c' + j + '=' + (types[j] === 'n' ? 'T(n)' : 'new Array(n)') + ';r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){o=rows[i];if(typeof o!=="object"||o===null||Object.getPrototypeOf(o)!==OP)return -1;k=0;for(p in o){if(p!==keys[k++])return -1;}if(k!==' + nk + ')return -1;';
      for (j = 0; j < nk; j++) {
        if (types[j] === 'n') src += 'v=o[' + JSON.stringify(keys[j]) + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[i]=v;';
        else src += 'c' + j + '[i]=o[' + JSON.stringify(keys[j]) + '];';
      }
      src += '}return r;';
      f = new Function('rows', 'n', 'keys', 'OP', 'T', src);
      f = (function (g) { return function (rows, n, ks) { return g(rows, n, ks, OP, takeF64); }; })(f);
    } else {
      f = function (rows, n, ks) {
        var r = [], i, jj, o, k, p, v;
        for (jj = 0; jj < nk; jj++) r.push(types[jj] === 'n' ? takeF64(n) : new Array(n));
        for (i = 0; i < n; i++) {
          o = rows[i];
          if (typeof o !== 'object' || o === null || Object.getPrototypeOf(o) !== OP) return -1;
          k = 0; for (p in o) { if (p !== ks[k++]) return -1; }
          if (k !== nk) return -1;
          for (jj = 0; jj < nk; jj++) { v = o[ks[jj]]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); r[jj][i] = v; }
        }
        return r;
      };
    }
    genStore(sig, f);
    return f;
  }
  // rows that are all arrays of exactly k items: one column per position, same conventions as fusedExtractor
  function tupleSplitter(k, types) {
    var sig = 't' + k + types.join(''), f = GEN_CACHE[sig], j, src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var r=[],i,a,v;';
      for (j = 0; j < k; j++) src += 'var c' + j + '=new ' + (types[j] === 'n' ? 'Float64Array' : 'Array') + '(n);r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){a=rows[i];if(!Array.isArray(a)||a.length!==' + k + ')return -1;';
      for (j = 0; j < k; j++) {
        if (types[j] === 'n') src += 'v=a[' + j + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[i]=v;';
        else src += 'c' + j + '[i]=a[' + j + '];';
      }
      src += '}return r;';
      f = new Function('rows', 'n', src);
    } else {
      f = function (rows, n) {
        var r = [], i, jj, a, v;
        for (jj = 0; jj < k; jj++) r.push(types[jj] === 'n' ? new Float64Array(n) : new Array(n));
        for (i = 0; i < n; i++) {
          a = rows[i]; if (!Array.isArray(a) || a.length !== k) return -1;
          for (jj = 0; jj < k; jj++) { v = a[jj]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); r[jj][i] = v; }
        }
        return r;
      };
    }
    genStore(sig, f);
    return f;
  }
  function firstNonEmpty(vals, n) { var i = 0; while (i < n && vals[i].length === 0) i++; return i; }
  function tupleIdx(k) { var r = [], j; for (j = 0; j < k; j++) r.push(j); return r; }
  // rows are arrays of tuples of k items: every tuple of every row, in order, split into one column per position
  function tupleFlattener(k, types) {
    var sig = 'u' + k + types.join(''), f = GEN_CACHE[sig], j, src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var r=[],i,m,a,t,v,q=0,len;';
      for (j = 0; j < k; j++) src += 'var c' + j + '=new ' + (types[j] === 'n' ? 'Float64Array' : 'Array') + '(total);r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){a=rows[i];len=a.length;for(m=0;m<len;m++){t=a[m];if(!Array.isArray(t)||t.length!==' + k + ')return -1;';
      for (j = 0; j < k; j++) {
        if (types[j] === 'n') src += 'v=t[' + j + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[q]=v;';
        else src += 'c' + j + '[q]=t[' + j + '];';
      }
      src += 'q++;}}return r;';
      f = new Function('rows', 'n', 'keys', 'total', src);
    } else {
      f = function (rows, n, ks, total) {
        var r = [], i, m, jj, a, t, v, q = 0, len;
        for (jj = 0; jj < k; jj++) r.push(types[jj] === 'n' ? new Float64Array(total) : new Array(total));
        for (i = 0; i < n; i++) {
          a = rows[i]; len = a.length;
          for (m = 0; m < len; m++) {
            t = a[m]; if (!Array.isArray(t) || t.length !== k) return -1;
            for (jj = 0; jj < k; jj++) { v = t[jj]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); r[jj][q] = v; }
            q++;
          }
        }
        return r;
      };
    }
    genStore(sig, f);
    return f;
  }
  var LEARNED = {};                                         // per layout: which positions turned out not to be plain numbers
  function splitColumns(make, sig, first, keys, vals, n, total) {  // runs an extractor, demoting a key to 'any' each time it meets a non-number; null when the rows do not fit
    var types = typesFor(first, keys, LEARNED[sig]), r, tries = 0;
    for (;;) {
      r = make(types)(vals, n, keys, total);
      if (typeof r !== 'number') { LEARNED[sig] = types; return r; }
      if (r === -1 || ++tries > keys.length) return null;
      types[-r - 2] = 'a';
    }
  }

  // builds rows from columns. Each column is described by [a, d, mode]: 0 a[i], 1 a[i] === 1, 2 d[a[i]], 3 d (a constant)
  function builder(keys, modes) {
    var sig = 'b' + keys.join('\u0001') + '\u0002' + modes.join(''), f = GEN_CACHE[sig], j, src, expr, pk;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var out=new Array(n),i;for(i=0;i<n;i++){out[i]={';
      for (j = 0; j < keys.length; j++) {
        expr = modes[j] === 0 ? 'a' + j + '[i]' : modes[j] === 1 ? '(a' + j + '[i]===1)' : modes[j] === 2 ? 'd' + j + '[a' + j + '[i]]' : 'd' + j;
        pk = keys[j] === '__proto__' ? '["__proto__"]' : JSON.stringify(keys[j]);
        src += (j ? ',' : '') + pk + ':' + expr;
      }
      src += '};}return out;';
      var params = ['n'];
      for (j = 0; j < keys.length; j++) { params.push('a' + j); params.push('d' + j); }
      f = new Function(params.join(','), src);
    } else {
      f = function (n) {
        var out = new Array(n), i, jj, o, m;
        for (i = 0; i < n; i++) {
          o = {};
          for (jj = 0; jj < keys.length; jj++) {
            m = modes[jj]; var a = arguments[1 + jj * 2], d = arguments[2 + jj * 2];
            define(o, keys[jj], m === 0 ? a[i] : m === 1 ? a[i] === 1 : m === 2 ? d[a[i]] : d);
          }
          out[i] = o;
        }
        return out;
      };
    }
    genStore(sig, f);
    return f;
  }
  function define(o, k, v) { if (k === '__proto__') Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); else o[k] = v; }

  // ================================================================ reader
  var RESERVED = {};                                 // stands in the reference list for a record that is not built yet
  function Dec(ctl, blobs, opts) {
    this.c = ctl; this.bl = blobs; this.keys = []; this.depth = 0; this.refs = null; this.ver = JSO_VERSION;
    this.budget = opts && opts.maxItems !== undefined ? opts.maxItems : DEFAULT_MAX_ITEMS;
    this.wasm = opts && opts.wasm === false ? false : undefined;
  }
  Dec.prototype.spend = function (n) { this.budget -= n; if (this.budget < 0) jfail('the data asks for more than maxItems values; pass a bigger maxItems if it is yours'); };
  Dec.prototype.blob = function (Ctor, n) {
    var b = this.bl, kind = b.u8(), len, t, u;
    if (kind === 0 || kind === 2) return rawGet(b, Ctor, n);
    if (kind !== 1) jfail('bad blob');
    len = b.varint(); u = b.take(len);
    t = MC.unpack(u, { maxSize: n * Ctor.BYTES_PER_ELEMENT + 64, wasm: this.wasm });
    if (!(t instanceof Ctor) || t.length !== n) jfail('a packed column has the wrong size');
    return t;
  };
  Dec.prototype.str16 = function () {
    var n = this.c.varint(), u;
    this.spend(n); u = this.blob(Uint16Array, n);
    return codesToString(u);
  };
  function codesToString(u) { var s = '', i, n = u.length; for (i = 0; i < n; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, Math.min(n, i + 8192))); return s; }
  Dec.prototype.keyName = function () {
    var id = this.c.varint(), k;
    if (id > 0) { if (id > this.keys.length) jfail('bad key reference'); return this.keys[id - 1]; }
    k = this.c.u8() === 0 ? this.c.str() : this.str16();
    this.keys.push(k); return k;
  };
  Dec.prototype.value = function () {
    var c = this.c, tag = c.u8(), n, i, r, k, v;
    switch (tag) {
      case T_UNDEF: return undefined;
      case T_NULL: return null;
      case T_FALSE: return false;
      case T_TRUE: return true;
      case T_INT: return c.zigzag();
      case T_F64: return c.f64();
      case T_STR: return c.str();
      case T_STR16: return this.str16();
      case T_BIGINT: return BigInt(c.str());
      case T_DATE: r = new Date(c.f64()); if (this.refs) this.refs.push(r); return r;
      case T_REF: i = c.varint(); if (!this.refs || i >= this.refs.length || this.refs[i] === RESERVED) jfail('bad reference'); return this.refs[i];
    }
    if (++this.depth > MAX_DEPTH) jfail('nested too deeply');
    switch (tag) {
      case T_ARR:
        n = c.varint(); this.spend(n); r = new Array(n); if (this.refs) this.refs.push(r);
        for (i = 0; i < n; i++) r[i] = this.value();
        break;
      case T_COLS:
        n = c.varint(); this.spend(n);
        if (this.refs) {                                              // the array exists (and can be referred to) before its values are restored
          r = new Array(n); this.refs.push(r);
          k = this.column(n);
          for (i = 0; i < n; i++) r[i] = k.get(i);
        } else r = this.column(n).full();
        break;
      case T_OBJ: case T_OBJ0:
        n = c.varint(); this.spend(n); r = tag === T_OBJ0 ? Object.create(null) : {}; if (this.refs) this.refs.push(r);
        for (i = 0; i < n; i++) { k = this.keyName(); v = this.value(); define(r, k, v); }
        break;
      case T_TYPED:
        k = c.u8(); n = c.varint(); this.spend(n);
        if (k >= TYPED_CTORS.length) jfail('unsupported typed array');
        r = this.typed(k, n); if (this.refs) this.refs.push(r);
        break;
      case T_ABUF: n = c.varint(); this.spend(n); r = this.blob(Uint8Array, n).buffer; if (this.refs) this.refs.push(r); break;
      case T_MAP:
        n = c.varint(); this.spend(n); r = new Map(); if (this.refs) this.refs.push(r);
        var ks = this.items(n), vs = this.items(n);
        for (i = 0; i < n; i++) r.set(ks[i], vs[i]);
        break;
      case T_SET:
        n = c.varint(); this.spend(n); r = new Set(); if (this.refs) this.refs.push(r);
        var xs = this.items(n); for (i = 0; i < n; i++) r.add(xs[i]);
        break;
      case T_REGEX: r = new RegExp(c.str(), c.str()); if (this.refs) this.refs.push(r); break;
      default: jfail('unknown tag ' + tag);
    }
    this.depth--;
    return r;
  };
  Dec.prototype.typed = function (kind, n) {
    var Ctor = TYPED_CTORS[kind], raw, t;
    if (kind === 0) return this.blob(Uint8Array, n);
    if (kind === 1 || kind === 2) { raw = this.blob(Uint8Array, n); return new Ctor(raw.buffer, raw.byteOffset, n); }
    if (kind === 7 || kind === 8) return this.blob(Ctor, n);
    t = this.blob(kind === 3 || kind === 4 ? Uint16Array : Uint32Array, n);
    return kind === 4 || kind === 6 ? t : new Ctor(t.buffer, t.byteOffset, n);
  };
  Dec.prototype.items = function (n) {
    var c = this.c, flag = c.u8(), i, r;
    if (flag === 1) return this.column(n).full();
    r = new Array(n); for (i = 0; i < n; i++) r[i] = this.value();
    return r;
  };

  // A column is returned as {n, mode, a, d}: mode 0 a[i] is the value, 1 a[i] === 1 is the value, 2 d[a[i]], 3 every value is d.
  // full() gives a plain array of the values.
  function Col(n, mode, a, d) { this.n = n; this.mode = mode; this.a = a; this.d = d; }
  Col.prototype.get = function (i) { var m = this.mode; if (m === 4) return fsGet(this.a, i); return m === 0 ? this.a[i] : m === 1 ? this.a[i] === 1 : m === 2 ? this.d[this.a[i]] : this.d; };
  Col.prototype.full = function () {
    var n = this.n, a = this.a, d = this.d, out, i, m = this.mode;
    if (m === 4) return fsAll(a, n);
    if (m === 0 && Array.isArray(a)) return a;
    out = new Array(n);
    if (m === 0) {                                                   // one loop per kind of array, so each loop sees one type
      if (a instanceof Float64Array) for (i = 0; i < n; i++) out[i] = a[i];
      else if (a instanceof Int32Array) for (i = 0; i < n; i++) out[i] = a[i];
      else if (a instanceof Uint8Array) for (i = 0; i < n; i++) out[i] = a[i];
      else if (a instanceof Uint16Array) for (i = 0; i < n; i++) out[i] = a[i];
      else for (i = 0; i < n; i++) out[i] = a[i];
    } else if (m === 1) for (i = 0; i < n; i++) out[i] = a[i] === 1;
    else if (m === 2) for (i = 0; i < n; i++) out[i] = d[a[i]];
    else for (i = 0; i < n; i++) out[i] = d;
    return out;
  };

  Dec.prototype.column = function (n) {
    if (++this.depth > MAX_DEPTH) jfail('nested too deeply');
    var r = this.columnBody(n);
    this.depth--;
    return r;
  };
  Dec.prototype.columnBody = function (n) {
    var c = this.c, ct = c.u8(), i, j, m, k, w, e, p, base, t, a, b, o, big, d, u, out, col, lens, flat, kinds, inner;
    switch (ct) {
      case CT_CONST: return new Col(n, 3, null, this.value());
      case CT_INT: return this.intCol(n);
      case CT_DEC:
        e = c.u8(); if (e > 10) jfail('bad scale'); p = P10[e];
        col = this.intCol(n); a = col.a; t = new Float64Array(n);
        if (col.mode === 3) { for (i = 0; i < n; i++) t[i] = col.d / p; } else if (a instanceof Int32Array) for (i = 0; i < n; i++) t[i] = a[i] / p;
        else if (a instanceof Float64Array) for (i = 0; i < n; i++) t[i] = a[i] / p;
        else for (i = 0; i < n; i++) t[i] = a[i] / p;
        return new Col(n, 0, t, null);
      case CT_PCO: jfail('this file has a number column written with Pcodec (module 1.2.0 or 1.3.0 with its add-on), which this module no longer supports; read it with 1.3.0');
      case CT_ADAPT:
        this.spend(n);
        e = c.u8(); k = c.u8(); m = c.varint();
        if (e > 10 || k > 1) jfail('bad adaptive column');
        a = this.bl.take(m);
        if (!PK.available()) jfail('this file stores a number column with the number picker, which needs a little-endian machine');
        try {
          if (k) a = MC.unpack(a, { maxSize: m * 64 + n * 16 + 4096, wasm: this.wasm });
          t = PK.unpack(a, n, this.wasm);
        } catch (err) { jfail('an adaptive number column is damaged'); }
        if (!(t instanceof Float64Array) || t.length !== n) jfail('an adaptive number column is damaged');
        if (e > 0) { p = P10[e]; a = new Float64Array(n); for (i = 0; i < n; i++) a[i] = t[i] / p; t = a; }
        return new Col(n, 0, t, null);
      case CT_FRONT:
        this.spend(n);
        if (n < 1) jfail('bad front-coded column');
        lens = this.lengthCol(n); flat = this.rawStrings(n, true); out = new Array(n);
        if (lens.get(0) !== 0) jfail('bad front-coded column');
        if (!Array.isArray(flat)) {
          t = flat.bytes; d = flat.lens; a = new Uint32Array(n + 1); w = 0;
          for (i = 0; i < n; i++) { w += d.get(i); if (w > 4294967295) jfail('bad string lengths'); a[i + 1] = w; }                                  // a[i+1]: end of the new ends so far
          if (w === t.length) {                                                                      // all ASCII: rebuild the whole text as bytes, decode it once
            b = new Uint32Array(n + 1); w = 0;                                                       // b[i]: where row i starts in the rebuilt text
            for (i = 0; i < n; i++) {
              m = lens.get(i);
              if (i > 0 && m > b[i] - b[i - 1]) jfail('bad front-coded column');
              e = b[i] + m + (a[i + 1] - a[i]);
              if (e > 134217728) jfail('a front-coded column would be too big');
              b[i + 1] = e;
            }
            u = new Uint8Array(b[n]);
            for (i = 0; i < n; i++) {
              m = lens.get(i); o = b[i];
              if (m > 24) u.copyWithin(o, b[i - 1], b[i - 1] + m); else for (j = 0; j < m; j++) u[o + j] = u[b[i - 1] + j];
              for (j = a[i], k = o + m; j < a[i + 1]; j++) u[k++] = t[j];
            }
            big = TEXT_DEC.decode(u);
            for (i = 0; i < n; i++) out[i] = big.substring(b[i], b[i + 1]);
            return new Col(n, 0, out, null);
          }
          big = TEXT_DEC.decode(t); flat = new Array(n);
          if (w !== big.length) jfail('bad string lengths');
          for (i = 0; i < n; i++) { if (a[i + 1] > big.length) jfail('bad string lengths'); flat[i] = big.substring(a[i], a[i + 1]); }
        }
        out[0] = flat[0]; w = flat[0].length;
        for (i = 1; i < n; i++) {
          m = lens.get(i);
          if (m > out[i - 1].length) jfail('bad front-coded column');
          out[i] = m ? out[i - 1].substring(0, m) + flat[i] : flat[i];
          w += out[i].length; if (w > 134217728) jfail('a front-coded column would be too big');         // a damaged file cannot ask for a thousand copies of a long string
        }
        return new Col(n, 0, out, null);
      case CT_F32: return new Col(n, 0, this.blob(Float32Array, n), null);
      case CT_F64: return new Col(n, 0, this.blob(Float64Array, n), null);
      case CT_BOOL: t = this.blob(Uint8Array, (n + 7) >> 3); a = new Uint8Array(n); for (i = 0; i < n; i++) a[i] = (t[i >> 3] >> (i & 7)) & 1; return new Col(n, 1, a, null);
      case CT_STRD:
        m = c.varint(); this.spend(m); if (m > n) jfail('dictionary bigger than its column');
        d = this.rawStrings(m);
        a = this.blob(m <= 256 ? Uint8Array : m <= 65536 ? Uint16Array : Uint32Array, n);
        for (i = 0; i < n; i++) if (a[i] >= m) jfail('dictionary index out of range');
        return new Col(n, 2, a, d);
      case CT_STRDP:
        m = c.varint(); this.spend(m); this.spend(n); if (m > n || m < 2) jfail('bad dictionary column');
        d = this.rawStrings(m); k = c.u8(); e = c.varint(); if (k > 1) jfail('bad dictionary column');
        t = this.bl.take(e);
        try { if (k) t = MC.unpack(t, { maxSize: e * 64 + n * 16 + 4096, wasm: this.wasm }); t = PK.unpack(t, n, this.wasm); } catch (err) { jfail('a dictionary column is damaged'); }
        a = new (m <= 256 ? Uint8Array : m <= 65536 ? Uint16Array : Uint32Array)(n);
        for (i = 0; i < n; i++) { if (!(t[i] >= 0 && t[i] < m)) jfail('dictionary index out of range'); a[i] = t[i]; }
        return new Col(n, 2, a, d);
      case CT_STRR: return new Col(n, 0, this.rawStrings(n), null);
      case CT_NULLABLE:
        m = c.varint(); if (m > n) jfail('bad count');
        kinds = this.blob(Uint8Array, n);
        inner = m > 0 ? this.column(m) : null;
        out = new Array(n); j = 0;
        for (i = 0; i < n; i++) {
          k = kinds[i];
          if (k === 0) { if (j >= m) jfail('bad nullable column'); out[i] = inner.get(j++); } else if (k === 1) out[i] = null; else if (k === 2) out[i] = undefined; else jfail('bad nullable column');
        }
        if (j !== m) jfail('bad nullable column');
        return new Col(n, 0, out, null);
      case CT_TUPLE:
        k = c.varint(); if (k < 1 || k > 8) jfail('bad tuple'); this.spend(n * k);
        var cols = []; for (j = 0; j < k; j++) cols.push(this.column(n));
        out = new Array(n);
        if (k === 2) {
          var c0 = cols[0], c1 = cols[1], x0 = c0.mode === 0 ? c0.a : null, x1 = c1.mode === 0 ? c1.a : null;
          if (x0 instanceof Float64Array && x1 instanceof Float64Array) for (i = 0; i < n; i++) out[i] = [x0[i], x1[i]];                      // the usual coordinate pair: both columns are plain decimals, read straight from their arrays
          else for (i = 0; i < n; i++) out[i] = [c0.get(i), c1.get(i)];
        }
        else for (i = 0; i < n; i++) { var r = new Array(k); for (j = 0; j < k; j++) r[j] = cols[j].get(i); out[i] = r; }
        return new Col(n, 0, out, null);
      case CT_ARRAYS:
        m = c.varint(); this.spend(m + n);
        lens = this.lengthCol(n);
        flat = m > 0 ? this.column(m) : null;
        out = new Array(n); var off = 0, len, row, fa = flat !== null && flat.mode === 0 && Array.isArray(flat.a) ? flat.a : null;
        for (i = 0; i < n; i++) {
          len = lens.get(i); if (off + len > m) jfail('bad array lengths');
          if (fa !== null) row = fa.slice(off, off + len);                                  // items already in a plain array: the engine copies the stretch in one go
          else { row = new Array(len); for (j = 0; j < len; j++) row[j] = flat.get(off + j); }
          out[i] = row; off += len;
        }
        if (off !== m) jfail('bad array lengths');
        return new Col(n, 0, out, null);
      case CT_RECORDS: return this.records(n, false);
      case CT_REFRECS: if (!this.refs) jfail('records with numbers in a file without references'); return this.records(n, true);
      case CT_REFS:
        if (!this.refs) jfail('references in a file without references');
        col = this.column(n); out = new Array(n);
        for (i = 0; i < n; i++) { j = col.get(i); if (j !== Math.floor(j) || j < 0 || j >= this.refs.length || this.refs[j] === RESERVED) jfail('bad reference'); out[i] = this.refs[j]; }
        return new Col(n, 0, out, null);
      case CT_TEMPLATE: return this.template(n);
      case CT_TIMES: return this.times(n);
      case CT_FSST: return this.fsst(n);
      case CT_ANY:
        out = new Array(n); this.spend(n);
        for (i = 0; i < n; i++) out[i] = this.value();
        return new Col(n, 0, out, null);
      default: jfail('unknown column type ' + ct);
    }
  };
  // The text of a whole date-time column straight from its numbers (nothing in between): the calendar part once per distinct day (a small cache), 'hh:mm:' from a table of 1440,
  // ':ss' from 60, '.mmm' from 1000. The tables are filled with push, not by writing into new Array(n): WebKit keeps the second kind of array in a slow "has holes" form (2 times slower here).
  // Two passes, like the text-pattern builder: a tight numeric pass turns each row into a day number, a minute of the day and a second (small arrays, no strings), then a
  // generated one-line loop joins pre-built pieces. WebKit runs this about 2 times faster than one loop that does the date arithmetic and the joining together.
  function dayText(days, L) {
    var z = days + 719468, era = Math.floor(z / 146097), doe = (z - era * 146097) | 0, yoe = ((doe - ((doe / 1460) | 0) + ((doe / 36524) | 0) - ((doe / 146096) | 0)) / 365) | 0;
    var doy = doe - (365 * yoe + (yoe >> 2) - ((yoe / 100) | 0)), mp = ((5 * doy + 2) / 153) | 0, d = doy - (((153 * mp + 2) / 5) | 0) + 1, m = mp < 10 ? mp + 3 : mp - 9, y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    return L[0] + pad(y, 4) + L[1] + pad(m, 2) + L[2] + pad(d, 2) + L[3];
  }
  function timesJoin(g) {
    var f = GEN_CACHE['tm' + g], src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'for(var i=0;i<n;i++)out[i]=DT[di[i]]' + (g >= 5 ? '+HM[mi[i]]' : '') + (g >= 6 ? '+SC[si[i]]' : '') + (g === 7 ? '+FR[fi[i]]' : '') + ';';
      f = new Function('out', 'n', 'DT', 'di', 'HM', 'mi', 'SC', 'si', 'FR', 'fi', src);
    } else {
      f = function (out, n, DT, di, HM, mi, SC, si, FR, fi) {
        var i;
        for (i = 0; i < n; i++) out[i] = g === 3 ? DT[di[i]] : g === 5 ? DT[di[i]] + HM[mi[i]] : g === 6 ? DT[di[i]] + HM[mi[i]] + SC[si[i]] : DT[di[i]] + HM[mi[i]] + SC[si[i]] + FR[fi[i]];
      };
    }
    genStore('tm' + g, f);
    return f;
  }
  function buildTimesFast(n, L, g, ts, minDay, span) {
    var per = g === 3 ? 1 : g === 5 ? 1440 : g === 6 ? 86400 : 86400000, ra = ts.mode === 3 ? null : ts.a, cv = ts.mode === 3 ? ts.d : 0;
    var di = new Int32Array(n), mi = g >= 5 ? new Uint16Array(n) : null, si = g >= 6 ? new Uint8Array(n) : null, fi = g === 7 ? new Uint16Array(n) : null;
    var dmap = new Int32Array(span).fill(-1), DT = [], HM = [], SC = [], FR = [], k, i, v, days, rest, sec, ms, last = NaN, id = 0, q;
    for (i = 0; i < n; i++) {
      v = ra ? ra[i] : cv;
      days = Math.floor(v / per);
      if (days !== last) {
        last = days; q = days - minDay; id = dmap[q];
        if (id < 0) { id = dmap[q] = DT.length; DT.push(dayText(days, L)); }
      }
      di[i] = id;
      if (g >= 5) {
        rest = (v - days * per) | 0;
        if (g === 5) mi[i] = rest;
        else {
          if (g === 7) { ms = rest % 1000; sec = (rest - ms) / 1000 | 0; fi[i] = ms; } else sec = rest;
          k = (sec / 60) | 0; mi[i] = k; si[i] = sec - k * 60;
        }
      }
    }
    if (g >= 5) for (k = 0; k < 1440; k++) HM.push(pad((k / 60) | 0, 2) + L[4] + pad(k % 60, 2) + L[5]);
    if (g >= 6) for (k = 0; k < 60; k++) SC.push(pad(k, 2) + L[6]);
    if (g === 7) for (k = 0; k < 1000; k++) FR.push(pad(k, 3) + L[7]);
    var out = new Array(n);
    timesJoin(g)(out, n, DT, di, HM, mi, SC, si, FR, fi);
    return out;
  }
  function buildTimes(n, L, g, ts) {
    var per = g === 3 ? 1 : g === 5 ? 1440 : g === 6 ? 86400 : 86400000, ra = ts.mode === 3 ? null : ts.a, lo = Infinity, hi = -Infinity, i, v, span;
    for (i = 0; i < n; i++) {
      v = ra ? ra[i] : ts.d;
      if (v - v !== 0) jfail('bad date pattern');
      if (v < lo) lo = v; if (v > hi) hi = v;
      if (!ra) break;
    }
    lo = Math.floor(lo / per); span = Math.floor(hi / per) - lo + 1;
    if (span <= 262144) return buildTimesFast(n, L, g, ts, lo, span);                                         // up to about 700 years of days
    return buildTimesSlow(n, L, g, ts);
  }
  function buildTimesSlow(n, L, g, ts) {
    var out = new Array(n), per = g === 3 ? 1 : g === 5 ? 1440 : g === 6 ? 86400 : 86400000, ra = ts.mode === 3 ? null : ts.a, cv = ts.mode === 3 ? ts.d : 0;
    var hm = [], sc = [], fr = [], k, i, v, days, rest, day = '', z, era, doe, yoe, doy, mp, y, m, d, sec, ms;
    var tags = new Float64Array(4096).fill(NaN), strs = new Array(4096).fill(''), slot, last = NaN;
    if (g >= 5) for (k = 0; k < 1440; k++) hm.push(pad((k / 60) | 0, 2) + L[4] + pad(k % 60, 2) + L[5]);
    if (g >= 6) for (k = 0; k < 60; k++) sc.push(pad(k, 2) + L[6]);
    if (g === 7) for (k = 0; k < 1000; k++) fr.push(pad(k, 3) + L[7]);
    for (i = 0; i < n; i++) {
      v = ra ? ra[i] : cv;
      if (v - v !== 0) jfail('bad date pattern');
      days = Math.floor(v / per);
      if (days !== last) {
        last = days; slot = days & 4095;
        if (tags[slot] === days) day = strs[slot];
        else {
          z = days + 719468; era = Math.floor(z / 146097); doe = (z - era * 146097) | 0;
          yoe = ((doe - ((doe / 1460) | 0) + ((doe / 36524) | 0) - ((doe / 146096) | 0)) / 365) | 0;
          doy = doe - (365 * yoe + (yoe >> 2) - ((yoe / 100) | 0)); mp = ((5 * doy + 2) / 153) | 0;
          d = doy - (((153 * mp + 2) / 5) | 0) + 1; m = mp < 10 ? mp + 3 : mp - 9; y = yoe + era * 400 + (m <= 2 ? 1 : 0);
          day = L[0] + pad(y, 4) + L[1] + pad(m, 2) + L[2] + pad(d, 2) + L[3];
          tags[slot] = days; strs[slot] = day;
        }
      }
      if (g === 3) { out[i] = day; continue; }
      rest = (v - days * per) | 0;
      if (g === 5) { out[i] = day + hm[rest]; continue; }
      if (g === 7) { ms = rest % 1000; sec = (rest - ms) / 1000 | 0; } else sec = rest;
      k = (sec / 60) | 0;
      out[i] = g === 7 ? day + hm[k] + sc[sec - k * 60] + fr[ms] : day + hm[k] + sc[sec - k * 60];
    }
    return out;
  }
  // FSST column, read side. a = { syms, symLen, codes, coff, raw, scratch, wasm }: a string is decoded when asked for
  function fsGet(f, i) {
    var from = f.coff[i], to = f.coff[i + 1], codes = f.codes, syms = f.syms, out = f.scratch, o = 0, k, c, sy, j, str;
    if ((to - from) * 8 + 8 > out.length) out = f.scratch = new Uint8Array((to - from) * 8 + 64);
    for (k = from; k < to; k++) {
      c = codes[k];
      if (c === FS_ESC) out[o++] = codes[++k];
      else { sy = syms[c]; for (j = 0; j < sy.length; j++) out[o++] = sy[j]; }
    }
    if (o < 24) { str = ''; for (j = 0; j < o; j++) { c = out[j]; if (c > 127) return TEXT_DEC.decode(out.subarray(0, o)); str += String.fromCharCode(c); } return str; }
    return TEXT_DEC.decode(out.subarray(0, o));
  }
  function fsAll(f, n) {                                                   // every string: all the bytes are decoded at once (by the wasm helper for 4,096 strings and up), then cut into strings
    var res = new Array(n), i, kw = null, al = function (x) { return (x + 15) & ~15; }, codesP, coffP, outP, ooP, end, u = null, ooff = null, joined, b, e, k, c, sy, j, o, codes = f.codes, coff = f.coff, syms = f.syms;
    if (f.wasm !== false && n >= 4096 && (kw = kwGet())) {
      codesP = kw.base; coffP = al(codesP + codes.length + 16); outP = al(coffP + (n + 1) * 4); ooP = al(outP + f.raw + 64); end = ooP + (n + 1) * 4;
      if (kwRoom(end - kw.base + 64)) {
        new Uint8Array(kw.mem.buffer).set(codes, codesP);
        new Uint32Array(kw.mem.buffer, coffP, n + 1).set(coff);
        fsLoadKernel(kw, syms);
        if ((kw.x.fsst_decode_col(codesP, coffP, n, outP, ooP) >>> 0) !== f.raw) jfail('FSST column decodes to the wrong size');
        u = new Uint8Array(kw.mem.buffer, outP, f.raw); ooff = new Uint32Array(kw.mem.buffer, ooP, n + 1);
      }
    }
    if (!u) {
      u = new Uint8Array(f.raw + 8); ooff = new Uint32Array(n + 1); o = 0;
      for (i = 0; i < n; i++) {
        e = coff[i + 1];
        for (k = coff[i]; k < e; k++) {
          c = codes[k];
          if (c === FS_ESC) u[o++] = codes[++k];
          else { sy = syms[c]; for (j = 0; j < sy.length; j++) u[o++] = sy[j]; }
        }
        ooff[i + 1] = o;
      }
    }
    joined = TEXT_DEC.decode(u.subarray(0, f.raw));
    if (joined.length === f.raw) { for (i = 0; i < n; i++) res[i] = joined.substring(ooff[i], ooff[i + 1]); return res; }          // plain ASCII: one character a byte
    for (i = 0; i < n; i++) { b = ooff[i]; e = ooff[i + 1]; res[i] = e === b ? '' : TEXT_DEC.decode(u.subarray(b, e)); }
    return res;
  }
  Dec.prototype.fsst = function (n) {
    var c = this.c, ns = c.varint(), syms = [], symLen = [], i, l, raw, lens, coff, total = 0, codes, k, e, dec = 0, a, kq;
    if (ns < 1 || ns > 255) jfail('bad FSST table');
    this.spend(n);
    for (i = 0; i < ns; i++) { l = c.u8(); if (l < 1 || l > 8) jfail('bad FSST table'); syms.push(c.take(l)); symLen.push(l); }
    raw = c.varint();
    if (raw > 67108864) jfail('FSST column is too big');
    lens = this.lengthCol(n); coff = new Uint32Array(n + 1);
    for (i = 0; i < n; i++) { total += lens.mode === 3 ? lens.d : lens.a[i]; if (total > 134217728) jfail('FSST column is too big'); coff[i + 1] = total; }
    codes = this.blob(Uint8Array, total);
    for (i = 0; i < n; i++) {                                              // every code names a symbol (or is a literal escape with its byte), and the decoded size adds up
      k = coff[i]; e = coff[i + 1];
      while (k < e) {
        a = codes[k++];
        if (a === FS_ESC) { if (k >= e) jfail('bad FSST codes'); k++; dec++; }
        else if (a >= ns) jfail('bad FSST codes');
        else dec += symLen[a];
      }
    }
    if (dec !== raw) jfail('FSST column decodes to the wrong size');
    a = { syms: syms, symLen: symLen, codes: codes, coff: coff, raw: raw, scratch: new Uint8Array(256), wasm: this.wasm };
    if (this.lazyText && this.depth === 1) return new Col(n, 4, a, null);
    return new Col(n, 0, fsAll(a, n), null);
  };
  Dec.prototype.times = function (n) {
    var c = this.c, g = c.u8(), R = c.varint(), L = [], widths = [], cols, ts, j;
    if ((g !== 3 && g !== 5 && g !== 6 && g !== 7) || R < g || R > MAX_SLOTS) jfail('bad date pattern');
    this.spend(n * (R + 1));
    for (j = 0; j <= R; j++) L.push(c.str());
    for (j = 0; j < R; j++) { if (j < g) widths.push(TS_WIDTH[j]); else { widths.push(c.varint()); if (widths[j] === 1 || widths[j] > 15) jfail('bad date pattern'); } }
    ts = this.column(n);
    if (ts.mode !== 0 && ts.mode !== 3) jfail('bad date pattern');
    if (R === g && n >= 2048) return new Col(n, 0, buildTimes(n, L, g, ts), null);
    cols = tsUnpack(g, ts, n).map(function (a) { var k, x = a[0]; for (k = 1; k < n && a[k] === x; k++); return k === n ? new Col(n, 3, null, x) : new Col(n, 0, a, null); });   // a number that never changes becomes part of the text
    for (j = g; j < R; j++) cols.push(this.column(n));
    return new Col(n, 0, buildTemplate(n, [L], R, widths, null, cols), null);
  };
  Dec.prototype.template = function (n) {
    var c = this.c, nt = c.varint(), R = c.varint(), tpls = [], widths = [], tid = null, cols = [], t, j, i, L, w;
    if (nt < 1 || nt > MAX_TEMPLATES || R < 1 || R > MAX_SLOTS) jfail('bad string pattern');
    this.spend(n * (R + 1));
    for (t = 0; t < nt; t++) { L = []; for (j = 0; j <= R; j++) L.push(c.str()); tpls.push(L); }
    for (j = 0; j < R; j++) { w = c.varint(); if (w === 1 || w > 15) jfail('bad string pattern'); widths.push(w); }
    if (nt > 1) { tid = this.blob(Uint8Array, n); for (i = 0; i < n; i++) if (tid[i] >= nt) jfail('bad string pattern'); }
    for (j = 0; j < R; j++) cols.push(this.column(n));
    return new Col(n, 0, buildTemplate(n, tpls, R, widths, tid, cols), null);
  };
  var ZEROS = '000000000000000';
  function pad(v, w) { var s = '' + v; return s.length >= w ? s : ZEROS.substring(0, w - s.length) + s; }
  // Slots that are table lookups (kind 1) and sit side by side are merged into one lookup: the row's combination of their values is one number (mixed radix), and its
  // text is made once per combination that shows up (a month, a day and an hour is at most 12 * 28 * 24 combinations however many rows there are). A row then costs one lookup instead
  // of a join of several pieces. Only for one pattern, at most 65,536 combinations, and at most 4 per row. Returns the merged slots, or null when nothing can be merged.
  function mixInto(idx, a, lo, span, n) {                          // one loop per kind of array, so each loop sees one type
    var i;
    if (a instanceof Uint8Array) for (i = 0; i < n; i++) idx[i] = idx[i] * span + (a[i] - lo);
    else if (a instanceof Uint16Array) for (i = 0; i < n; i++) idx[i] = idx[i] * span + (a[i] - lo);
    else if (a instanceof Int32Array) for (i = 0; i < n; i++) idx[i] = idx[i] * span + (a[i] - lo);
    else if (a instanceof Float64Array) for (i = 0; i < n; i++) idx[i] = idx[i] * span + (a[i] - lo);
    else for (i = 0; i < n; i++) idx[i] = idx[i] * span + (a[i] - lo);
  }
  function templateRun(n, L, R, widths, kinds, arrs, tabs, los) {
    var j0 = -1, j1 = -1, P = 1, cnt = 0, j, span, other = false, idx, T, make, k, r;
    for (j = 0; j < R; j++) {
      if (kinds[j] === 1) {
        span = tabs[j].length;
        if (j0 < 0) { j0 = j1 = j; P = span; cnt = 1; }
        else if (!other && P * span <= 65536 && P * span <= 4 * n) { P *= span; j1 = j; cnt++; }
        else other = true;
      } else if (kinds[j] !== 3) { if (j0 >= 0 && !other) other = true; else if (j0 < 0) other = true; }
    }
    if (cnt < 2 || P > 4 * n) return null;
    idx = new Uint16Array(n);
    for (j = j0; j <= j1; j++) if (kinds[j] === 1) mixInto(idx, arrs[j], los[j], tabs[j].length, n);
    T = new Array(P).fill('');
    make = function (x) {
      var vals = [], d, sp, q, str;
      for (q = j1; q >= j0; q--) { if (kinds[q] === 1) { sp = tabs[q].length; d = x % sp; x = (x - d) / sp; vals[q] = tabs[q][d]; } else vals[q] = tabs[q]; }
      str = vals[j0];
      for (q = j0 + 1; q <= j1; q++) str += L[q] + vals[q];
      return str;
    };
    for (k = 0; k < n; k++) { r = idx[k]; if (T[r] === '') T[r] = make(r); }
    // the slots after the merged ones that vary (or any slot that is not a constant outside the run) keep their own place; if nothing varies outside, the text around is folded in too
    for (j = 0; j < R; j++) if ((j < j0 || j > j1) && kinds[j] !== 3) { other = true; break; }
    var nl = [], nw = [], nk = [], na = [], nt = [], nlo = [];
    if (!other) {
      var pre = L[0], post = '', q2;
      for (q2 = 0; q2 < j0; q2++) pre += tabs[q2] + L[q2 + 1];
      pre = j0 > 0 ? pre : L[0];
      post = L[j1 + 1];
      for (q2 = j1 + 1; q2 < R; q2++) post += tabs[q2] + L[q2 + 1];
      if (pre || post) for (k = 0; k < P; k++) if (T[k] !== '') T[k] = pre + T[k] + post;
      return { lits: ['', ''], R: 1, widths: [0], kinds: [1], arrs: [idx], tabs: [T], los: [0] };
    }
    for (j = 0; j < j0; j++) { nl.push(L[j]); nw.push(widths[j]); nk.push(kinds[j]); na.push(arrs[j]); nt.push(tabs[j]); nlo.push(los[j]); }
    nl.push(L[j0]); nw.push(0); nk.push(1); na.push(idx); nt.push(T); nlo.push(0);
    for (j = j1 + 1; j < R; j++) { nl.push(L[j]); nw.push(widths[j]); nk.push(kinds[j]); na.push(arrs[j]); nt.push(tabs[j]); nlo.push(los[j]); }
    nl.push(L[R]);
    return { lits: nl, R: nk.length, widths: nw, kinds: nk, arrs: na, tabs: nt, los: nlo };
  }
  // The strings come back as literal + number + literal ...; a column of numbers that spans few values is turned into text once and looked up.
  function buildTemplate(n, tpls, R, widths, tid, cols) {
    var nt = tpls.length, out = new Array(n), kinds = [], arrs = [], tabs = [], los = [], lits, j, t, i, a, lo, hi, x, k, sig, f, v;
    for (j = 0; j < R; j++) {
      a = cols[j]; kinds.push(0); arrs.push(null); tabs.push(null); los.push(0);
      if (a.mode === 3) { kinds[j] = 3; tabs[j] = widths[j] ? pad(a.d, widths[j]) : '' + a.d; continue; }       // one value for every row: part of the text
      a = a.a; arrs[j] = a; lo = Infinity; hi = -Infinity;
      for (i = 0; i < n; i++) { x = a[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
      if (hi - lo <= 4096 && n > 4 * (hi - lo + 1) && lo === Math.floor(lo)) {
        v = new Array(hi - lo + 1); for (k = 0; k < v.length; k++) v[k] = widths[j] ? pad(lo + k, widths[j]) : '' + (lo + k);
        kinds[j] = 1; tabs[j] = v; los[j] = lo;
      } else if (widths[j]) kinds[j] = 2;
    }
    if (nt === 1 && (j = templateRun(n, tpls[0], R, widths, kinds, arrs, tabs, los))) { tpls = [j.lits]; R = j.R; widths = j.widths; kinds = j.kinds; arrs = j.arrs; tabs = j.tabs; los = j.los; }
    sig = 'p' + nt + '|' + R + '|' + kinds.join('') + '|' + widths.join(',') + '|' + JSON.stringify(tpls);
    f = GEN_CACHE[sig];
    if (!f) {
      if (CAN_EVAL) {
        var src = 'var i,t;for(i=0;i<n;i++){', body = [];
        for (t = 0; t < nt; t++) {
          var e = '', pend = tpls[t][0];
          for (j = 0; j < R; j++) {
            if (kinds[j] === 3) { pend += tabs[j] + tpls[t][j + 1]; continue; }       // constant: folded into the text
            e += (e ? '+' : '') + JSON.stringify(pend) + '+' + (kinds[j] === 0 ? 'A' + j + '[i]' : kinds[j] === 1 ? 'T' + j + '[A' + j + '[i]-' + 'LO' + j + ']' : 'pad(A' + j + '[i],' + widths[j] + ')');
            pend = tpls[t][j + 1];
          }
          e = e ? e + (pend ? '+' + JSON.stringify(pend) : '') : JSON.stringify(pend);
          body.push(e);
        }
        if (nt === 1) src += 'out[i]=' + body[0] + ';}';
        else { src += 't=tid[i];switch(t){'; for (t = 0; t < nt; t++) src += 'case ' + t + ':out[i]=' + body[t] + ';break;'; src += '}}'; }
        var params = ['out', 'n', 'tid', 'pad'];
        for (j = 0; j < R; j++) { params.push('A' + j); params.push('T' + j); params.push('LO' + j); }
        f = new Function(params.join(','), src);
      } else {
        f = function (out, n, tid, padf) {
          var i, jj, s, L, t, v, q;
          for (i = 0; i < n; i++) {
            t = tid ? tid[i] : 0; L = tpls[t]; s = L[0];
            for (jj = 0; jj < R; jj++) {
              q = 4 + jj * 3;
              v = kinds[jj] === 3 ? tabs[jj] : kinds[jj] === 1 ? arguments[q + 1][arguments[q][i] - arguments[q + 2]] : kinds[jj] === 2 ? padf(arguments[q][i], widths[jj]) : arguments[q][i];
              s += v + L[jj + 1];
            }
            out[i] = s;
          }
        };
      }
      genStore(sig, f);
    }
    var args = [out, n, tid, pad];
    for (j = 0; j < R; j++) { args.push(arrs[j]); args.push(tabs[j]); args.push(los[j]); }
    f.apply(null, args);
    return out;
  }
  Dec.prototype.intCol = function (n) {
    var c = this.c, w = c.u8(), base, t, i, a, Ctor;
    if (w !== 1 && w !== 2 && w !== 4) jfail('bad int width');
    base = c.zigzag(); Ctor = w === 1 ? Uint8Array : w === 2 ? Uint16Array : Uint32Array;
    t = this.blob(Ctor, n);
    if (base === 0) return new Col(n, 0, t, null);
    a = (base >= -2147483648 && base + (w === 4 ? 4294967295 : 65535) <= 2147483647 && w !== 4) ? new Int32Array(n) : new Float64Array(n);
    if (t instanceof Uint8Array) for (i = 0; i < n; i++) a[i] = t[i] + base;                  // one loop per width, so each loop sees one type of array
    else if (t instanceof Uint16Array) for (i = 0; i < n; i++) a[i] = t[i] + base;
    else for (i = 0; i < n; i++) a[i] = t[i] + base;
    return new Col(n, 0, a, null);
  };
  Dec.prototype.lengthCol = function (n) {
    var c = this.c, ct = c.u8();
    if (ct === CT_CONST) return new Col(n, 3, null, c.varint());
    if (ct !== CT_INT) jfail('bad lengths');
    return this.intCol(n);
  };
  Dec.prototype.rawStrings = function (n, raw) {                 // raw: a single UTF-8 piece comes back as {lens, bytes} so the caller can work on the bytes
    var c = this.c, lens, pieces, out = new Array(n), q = 0, pi, kind, len, cnt, bytes, big, off, i, u, end;
    this.spend(n);
    lens = this.lengthCol(n);
    pieces = c.varint();
    if (pieces > n + 1) jfail('bad string pieces');
    for (pi = 0; pi < pieces; pi++) {
      cnt = c.varint(); if (q + cnt > n) jfail('bad string pieces');
      kind = c.u8(); len = c.varint(); this.spend(len);
      if (raw && pieces === 1 && kind === 0 && cnt === n) return { lens: lens, bytes: this.blob(Uint8Array, len) };
      if (kind === 0) { bytes = this.blob(Uint8Array, len); big = TEXT_DEC.decode(bytes); }
      else if (kind === 1) { u = this.blob(Uint16Array, len); big = codesToString(u); }
      else jfail('bad text');
      off = 0; end = q + cnt;
      for (; q < end; q++) {
        i = lens.get(q);
        if (off + i > big.length) jfail('bad string lengths');
        out[q] = big.substring(off, off + i); off += i;
      }
      if (off !== big.length) jfail('bad string lengths');
    }
    if (q !== n) jfail('bad string lengths');
    return out;
  };
  Dec.prototype.records = function (n, register) {
    var base = 0, c = this.c, ns = c.varint(), shapes = [], i, j, nk, keys, shapeOf = null, cols, sh, out, counts = [], modes, args, rows, pos, cnt;
    if (ns < 1 || ns > MAX_SHAPES || (register && ns !== 1)) jfail('bad shape count');
    if (register) { base = this.refs.length; this.spend(n); for (i = 0; i < n; i++) this.refs.push(RESERVED); }
    for (i = 0; i < ns; i++) {
      nk = c.varint(); if (nk > 100000) jfail('too many keys'); keys = [];
      for (j = 0; j < nk; j++) keys.push(c.u8() === 0 ? c.str() : this.str16());
      shapes.push(keys);
    }
    if (ns > 1) { shapeOf = this.blob(Uint8Array, n); }
    for (i = 0; i < ns; i++) {
      keys = shapes[i]; cnt = ns > 1 ? c.varint() : n;
      if (cnt > n) jfail('bad row count');
      this.spend(cnt * keys.length);
      cols = []; modes = []; args = [cnt];
      if (ns === 1 && this.ver >= 2) {                                            // a directory of sizes comes first; each column has its own key numbering
        var dirC = [], dirB = [], c0, b0, savedKeys;
        for (j = 0; j < keys.length; j++) { dirC.push(c.varint()); dirB.push(c.varint()); }
        for (j = 0; j < keys.length; j++) {
          c0 = c.p; b0 = this.bl.p; savedKeys = this.keys; this.keys = [];
          var col2 = this.column(cnt); this.keys = savedKeys;
          if (c.p - c0 !== dirC[j] || this.bl.p - b0 !== dirB[j]) jfail('a column does not match its directory entry');
          cols.push(col2); modes.push(col2.mode); args.push(col2.a, col2.d);
        }
      } else
      for (j = 0; j < keys.length; j++) {
        if (cnt > 0) { var col = this.column(cnt); cols.push(col); modes.push(col.mode); args.push(col.a, col.d); }
      }
      rows = builder(keys, modes).apply(null, args);
      counts.push(rows);
      shapes[i] = rows;
    }
    if (register) for (i = 0; i < n; i++) this.refs[base + i] = shapes[0][i];
    if (ns === 1) return new Col(n, 0, shapes[0], null);
    out = new Array(n); pos = new Array(ns); for (i = 0; i < ns; i++) pos[i] = 0;
    for (i = 0; i < n; i++) { j = shapeOf[i]; if (j >= ns || pos[j] >= shapes[j].length) jfail('bad shape index'); out[i] = shapes[j][pos[j]++]; }
    return new Col(n, 0, out, null);
  };

  // ================================================================ public
  function toBytes(x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (x && ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    jfail('expected a Uint8Array');
  }
  function pack(value, opts) {
    opts = opts || {};
    if (!TEXT_ENC) jfail('this environment has no TextEncoder');
    var e = new Enc(opts);
    POOL_ON = opts.pool !== false;
    try { e.value(value); } finally { POOL_ON = true; }
    return finishPack(e, e.ctl.done(), e.blobs, opts);
  }
  function finishPack(e, ctlRaw, blobs, opts) {                        // control bytes + blobs -> the packed container
    var flags = 0, head, stored, packedCtl = null, out, p, crc;
    if (ctlRaw.length >= 256) {
      packedCtl = MC.pack(ctlRaw, e.mcOpts);
      if (packedCtl.length >= ctlRaw.length * 0.9) packedCtl = null;
    }
    stored = packedCtl || ctlRaw;
    if (e.refs) flags |= 1; if (packedCtl) flags |= 2; if (opts.check) flags |= 4;
    var blobsLen = blobs.size();
    head = new Out(); head.u8(0x4D); head.u8(0x4A); head.u8(e.needsV5 ? 5 : e.usedFront ? 4 : e.usedTimes || e.needsV3 ? 3 : 2); head.u8(flags);
    head.varint(ctlRaw.length); head.varint(stored.length);
    out = new Uint8Array(head.p + stored.length + blobsLen + (flags & 4 ? 4 : 0));
    out.set(head.done(), 0); p = head.p; out.set(stored, p); p += stored.length; p = blobs.copyTo(out, p);
    if (flags & 4) { crc = MC.crc32(out.subarray(0, p)); out[p] = crc; out[p + 1] = crc >>> 8; out[p + 2] = crc >>> 16; out[p + 3] = crc >>> 24; }
    if (opts.report) { opts.report.summary = { total: out.length, control: stored.length, controlRaw: ctlRaw.length, blobs: blobsLen }; }
    return out;
  }
  // packAsync(value, opts): the same bytes as pack(), but the number picker runs elsewhere. The values are encoded in the plain form first (what fast mode does), the number columns the picker
  // would try are noted with their place in the streams, run(jobs) returns a promise for the picker's answer for each (null: keep the plain form), and the answers that are smaller are spliced in.
  // run is given [{src, n, e, plainLen}] and resolves to an array of {bytes, z} or null; opts.pool (a pool made by makePool) supplies it, else the picker runs here after a yield.
  function packAsync(value, opts) {
    opts = opts || {};
    if (!TEXT_ENC) jfail('this environment has no TextEncoder');
    var defer = { jobs: [], dirs: [], cur: null }, o = {}, k, e, runner, T = opts.timing || null, tA = T ? performance.now() : 0, encoded;
    for (k in opts) o[k] = opts[k];
    o.defer = defer; o.hints = null;
    e = new Enc(o);
    if (Array.isArray(value) && value.length >= SLICE_MIN && !e.refs && !e.report) encoded = encodeSliced(e, value);     // a long list: row-to-column pass and column encodes in short slices, yielding between them
    else {
      POOL_ON = opts.pool !== false && !opts.workers;
      try { e.value(value); } finally { POOL_ON = true; }
      encoded = Promise.resolve(true);
    }
    return encoded.then(function () { return packAsyncRest(e, defer, value, opts, o, T, tA); });
  }
  var SLICE_MIN = 2048, SLICE_MS = 3, UNPACK_SLICE_MS = 5;
  var YCH = null, YQ = [];                                                // one channel for every yield: making a channel per yield cost 1 to 2 ms each in Chromium
  function nextTask() {
    return new Promise(function (res) {
      if (typeof setImmediate === 'function') { setImmediate(res); return; }
      if (typeof MessageChannel !== 'function') { setTimeout(res, 0); return; }
      if (!YCH) { YCH = new MessageChannel(); YCH.port1.onmessage = function () { var f = YQ.shift(); if (f) f(); }; }
      YQ.push(res); YCH.port2.postMessage(0);
    });
  }
  function fusedSlicer(keys, types) {                                    // fills columns from row `from` up to `to`: 0, -1 (a row does not fit) or -(2 + j) (key j held a non-number), like fusedExtractor
    var sig = 'g' + keys.join('\u0001') + '\u0002' + types.join(''), f = GEN_CACHE[sig], j, src, nk = keys.length;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var i,o,k,p,v;';
      for (j = 0; j < nk; j++) src += 'var c' + j + '=cols[' + j + '];';
      src += 'for(i=from;i<to;i++){o=rows[i];if(typeof o!=="object"||o===null||Object.getPrototypeOf(o)!==OP)return -1;k=0;for(p in o){if(p!==keys[k++])return -1;}if(k!==' + nk + ')return -1;';
      for (j = 0; j < nk; j++) {
        if (types[j] === 'n') src += 'v=o[' + JSON.stringify(keys[j]) + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[i]=v;';
        else src += 'c' + j + '[i]=o[' + JSON.stringify(keys[j]) + '];';
      }
      src += '}return 0;';
      f = new Function('rows', 'from', 'to', 'keys', 'cols', 'OP', src);
      f = (function (g) { return function (rows, from, to, ks, cols) { return g(rows, from, to, ks, cols, OP); }; })(f);
    } else {
      f = function (rows, from, to, ks, cols) {
        var i, jj, o, k, p, v;
        for (i = from; i < to; i++) {
          o = rows[i];
          if (typeof o !== 'object' || o === null || Object.getPrototypeOf(o) !== OP) return -1;
          k = 0; for (p in o) { if (p !== ks[k++]) return -1; }
          if (k !== nk) return -1;
          for (jj = 0; jj < nk; jj++) { v = o[ks[jj]]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); cols[jj][i] = v; }
        }
        return 0;
      };
    }
    genStore(sig, f);
    return f;
  }
  function extractSliced(vals, n, keys, sig) {                           // splitColumns in slices of about SLICE_MS; null when the rows do not fit
    var types = typesFor(vals[0], keys, LEARNED[sig]), tries = 0, nk = keys.length;
    function attempt() {
      var cols = [], j, i = 0, step = 512;
      for (j = 0; j < nk; j++) cols.push(types[j] === 'n' ? takeF64(n) : new Array(n));
      function go() {
        var t0 = performance.now(), r, to = Math.min(n, i + step), dt;
        r = fusedSlicer(keys, types)(vals, i, to, keys, cols);
        if (r !== 0) {
          if (r === -1 || ++tries > nk) return null;
          types[-r - 2] = 'a'; return attempt();
        }
        i = to; dt = performance.now() - t0;
        step = Math.max(256, Math.min(65536, Math.floor(step * (dt > 0.05 ? SLICE_MS / dt : 2))));
        if (i >= n) { LEARNED[sig] = types; return cols; }
        return nextTask().then(go);
      }
      return Promise.resolve().then(go);
    }
    return attempt();
  }
  function slicedLoop(n, work, ms) {                                          // work(from, to) -> true to go on, anything else stops with that value; slices of about SLICE_MS, a yield between them
    return new Promise(function (resolve, reject) {
      var i = 0, step = 512;
      function go() {
        try {
          var t0 = performance.now(), to = Math.min(n, i + step), r = work(i, to), dt;
          if (r !== true) { resolve(r); return; }
          i = to; dt = performance.now() - t0;
          step = Math.max(256, Math.min(65536, Math.floor(step * (dt > 0.05 ? (ms || SLICE_MS) / dt : 2))));
          if (i >= n) { resolve(true); return; }
          nextTask().then(go);
        } catch (err) { reject(err); }
      }
      go();
    });
  }
  function tupleSplitSlice(k, types) {                                    // tupleSplitter in slices: fills columns from row `from` to `to`; 0, -1 or -(2 + j)
    var sig = 'p' + k + types.join(''), f = GEN_CACHE[sig], j, src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var i,a,v;';
      for (j = 0; j < k; j++) src += 'var c' + j + '=cols[' + j + '];';
      src += 'for(i=from;i<to;i++){a=rows[i];if(!Array.isArray(a)||a.length!==' + k + ')return -1;';
      for (j = 0; j < k; j++) {
        if (types[j] === 'n') src += 'v=a[' + j + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[i]=v;';
        else src += 'c' + j + '[i]=a[' + j + '];';
      }
      src += '}return 0;';
      f = new Function('rows', 'from', 'to', 'cols', src);
    } else {
      f = function (rows, from, to, cols) {
        var i, jj, a, v;
        for (i = from; i < to; i++) {
          a = rows[i]; if (!Array.isArray(a) || a.length !== k) return -1;
          for (jj = 0; jj < k; jj++) { v = a[jj]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); cols[jj][i] = v; }
        }
        return 0;
      };
    }
    genStore(sig, f);
    return f;
  }
  function tupleFlatSlice(k, types) {                                     // tupleFlattener in slices: rows from..to, items written from position q on; returns the next q, -1 or -(2 + j)
    var sig = 'v' + k + types.join(''), f = GEN_CACHE[sig], j, src;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var i,m,a,t,v,len;';
      for (j = 0; j < k; j++) src += 'var c' + j + '=cols[' + j + '];';
      src += 'for(i=from;i<to;i++){a=rows[i];len=a.length;for(m=0;m<len;m++){t=a[m];if(!Array.isArray(t)||t.length!==' + k + ')return -1;';
      for (j = 0; j < k; j++) {
        if (types[j] === 'n') src += 'v=t[' + j + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[q]=v;';
        else src += 'c' + j + '[q]=t[' + j + '];';
      }
      src += 'q++;}}return q;';
      f = new Function('rows', 'from', 'to', 'cols', 'q', src);
    } else {
      f = function (rows, from, to, cols, q) {
        var i, m, jj, a, t, v, len;
        for (i = from; i < to; i++) {
          a = rows[i]; len = a.length;
          for (m = 0; m < len; m++) {
            t = a[m]; if (!Array.isArray(t) || t.length !== k) return -1;
            for (jj = 0; jj < k; jj++) { v = t[jj]; if (types[jj] === 'n' && typeof v !== 'number') return -(2 + jj); cols[jj][q] = v; }
            q++;
          }
        }
        return q;
      };
    }
    genStore(sig, f);
    return f;
  }
  function sliceAttempt(sig, first, idx, n, total, fill) {                // splitColumns with slices: fill(types, cols, from, to, state) -> true or an error code; the columns or null
    var types = typesFor(first, idx, LEARNED[sig]), tries = 0, k = idx.length;
    function attempt() {
      var cols = [], j, state = { q: 0 };
      for (j = 0; j < k; j++) cols.push(types[j] === 'n' ? new Float64Array(total) : new Array(total));
      return slicedLoop(n, function (from, to) { return fill(types, cols, from, to, state); }).then(function (r) {
        if (r === true) { LEARNED[sig] = types; return cols; }
        if (r === -1 || ++tries > k) return null;
        types[-r - 2] = 'a'; return attempt();
      });
    }
    return attempt();
  }
  function eachColumn(e, cols, count, j) {                                // the columns one after another, a yield between them
    if (j >= cols.length) return Promise.resolve(true);
    return e.columnAsync(cols[j], count).then(function () { return nextTask(); }).then(function () { return eachColumn(e, cols, count, j + 1); });
  }
  Enc.prototype.columnAsync = function (vals, n) {                        // column() for the shapes that take long on the page, in slices; anything else is the plain call
    var e = this, first = vals[0], p;
    if (n < 1024 || e.refs || first === null || typeof first !== 'object') { e.column(vals, n); return Promise.resolve(); }
    if (++e.depth > MAX_DEPTH) jfail('nested too deeply');
    if (Array.isArray(first)) {
      p = first.length > 0 && first.length <= 8 ? e.fusedTuplesAsync(vals, n, first.length) : Promise.resolve(false);
      p = p.then(function (ok) { return ok ? true : e.fusedArraysAsync(vals, n); });
    } else if (Object.getPrototypeOf(first) === OP) p = e.fusedRecordsAsync(vals, n);
    else p = Promise.resolve(false);
    return p.then(function (ok) { e.depth--; if (!ok) e.column(vals, n); });
  };
  Enc.prototype.fusedRecordsAsync = function (vals, n) {
    var e = this, c = e.ctl, keys = Object.keys(vals[0]), nk = keys.length, path = e.path;
    if (nk === 0 || nk > MAX_FUSED_KEYS) return Promise.resolve(false);
    return extractSliced(vals, n, keys, 'R' + keys.join('\u0001') + '\u0002' + nk).then(function (cols) {
      if (!cols) return false;
      var j, dir = 0;
      c.u8(CT_RECORDS); c.varint(1); c.varint(nk);
      for (j = 0; j < nk; j++) { if (wellFormed(keys[j])) { c.u8(0); c.str(keys[j]); } else { c.u8(1); e.str16(keys[j]); } }
      dir = e.dirStart(nk); j = 0;
      function step() {
        if (j >= nk) { e.path = path; return true; }
        var st = e.dirColumnBegin(j, keys, path), jj = j;
        return e.columnAsync(cols[j], n).then(function () { e.dirColumnEnd(dir, st, jj); j++; return nextTask(); }).then(step);
      }
      return step();
    });
  };
  Enc.prototype.fusedTuplesAsync = function (vals, n, k) {
    var e = this, c = e.ctl, idx = tupleIdx(k);
    return sliceAttempt('T' + k, vals[0], idx, n, n, function (types, cols, from, to) { var r = tupleSplitSlice(k, types)(vals, from, to, cols); return r === 0 ? true : r; }).then(function (cols) {
      if (!cols) return false;
      c.u8(CT_TUPLE); c.varint(k);
      return eachColumn(e, cols, n, 0);
    });
  };
  Enc.prototype.fusedArraysAsync = function (vals, n) {
    var e = this, c = e.ctl, lens = new Uint32Array(n), q = 0, i, j, a, len, k = 0, flat, idx, total;
    for (i = 0; i < n; i++) {
      a = vals[i]; if (!Array.isArray(a)) return Promise.resolve(false);
      len = a.length; lens[i] = len; q += len;
      if (k === 0 && len > 0 && Array.isArray(a[0])) k = a[0].length;
    }
    total = q;
    c.u8(CT_ARRAYS); c.varint(q);
    e.lengths(lens, n);
    if (q === 0) return Promise.resolve(true);
    function generic() {
      flat = q > 30000000 ? [] : new Array(q); var m = 0;
      for (i = 0; i < n; i++) { a = vals[i]; len = a.length; for (j = 0; j < len; j++) flat[m++] = a[j]; }
      return e.columnAsync(flat, m).then(function () { return true; });
    }
    if (k > 0 && k <= 8) {
      idx = tupleIdx(k);
      return sliceAttempt('F' + k, vals[firstNonEmpty(vals, n)][0], idx, n, total, function (types, cols, from, to, state) {
        var r = tupleFlatSlice(k, types)(vals, from, to, cols, state.q); if (r < 0) return r; state.q = r; return true;
      }).then(function (cols) {
        if (!cols) return generic();
        c.u8(CT_TUPLE); c.varint(k);
        return eachColumn(e, cols, total, 0);
      });
    }
    return generic();
  };
  function encodeSliced(e, vals) {                                       // the value as a long list: its columns encoded in slices; a promise for true
    var n = vals.length;
    e.depth++;                                                            // the array (value -> object)
    e.ctl.u8(T_COLS); e.ctl.varint(n);
    return e.columnAsync(vals, n).then(function () { e.depth--; return true; });
  }
  function packAsyncRest(e, defer, value, opts, o, T, tA) {
    var runner;
    if (T) T.encode = performance.now() - tA;
    if (!defer.jobs.length) return Promise.resolve(finishPack(e, e.ctl.done(), e.blobs, opts));
    runner = opts.workers && typeof opts.workers.run === 'function' ? opts.workers.run : function (jobs) {
      return Promise.resolve().then(function () { return jobs.map(function (j) { return j.kind === 1 ? colsFor(j.src, j.n, j.a, j.wopts) : adaptFor(j.src, e.mode, e.mcOpts.wasm); }); });
    };
    var tB = T ? performance.now() : 0, wopts = { mode: opts.mode, picker: opts.picker, level: opts.level, float32: opts.float32, wasm: opts.wasm };
    var jobsMsg = defer.jobs.map(function (j) { return j.kind === 1 ? { kind: 1, src: j.src, n: j.n, a: j.a, wopts: wopts, mode: e.mode, wasm: e.mcOpts.wasm } : { kind: 0, src: j.src, n: j.n, e: j.e, plainLen: j.plainLen, mode: e.mode, wasm: e.mcOpts.wasm }; });
    var pr = runner(jobsMsg); if (T) T.post = performance.now() - tB;
    return pr.then(function (res) {
      var tC = T ? performance.now() : 0, ctl = e.ctl.done(), flat, pos = 0, ctlOut = new Out(), blobOut = [], bpos = 0, i, j, r, tag, acc = [], d, at, dc, db, t, total = 0;
      for (i = 0; i < res.length; i++) if ((!res[i] && defer.jobs[i].kind === 1) || (res[i] && res[i].fail)) throw new Error('worker answer missing');          // caught below: the plain pack
      flat = new Uint8Array(e.blobs.size()); e.blobs.copyTo(flat, 0);
      for (i = 0; i < defer.jobs.length; i++) {
        j = defer.jobs[i]; r = res[i];
        if (j.kind === 1) {                                              // a whole number column: its control and data bytes go in at this place
          ctlOut.bytes(ctl.subarray(pos, j.c0)); ctlOut.bytes(r.ctl); pos = j.c1;
          blobOut.push(flat.subarray(bpos, j.b0)); blobOut.push(r.blob); bpos = j.b1; if (r.v5) e.needsV5 = true;
          acc.push({ j: j, ix: i, dc: r.ctl.length - (j.c1 - j.c0), db: r.blob.length - (j.b1 - j.b0) });
          continue;
        }
        if (!r || !r.bytes || r.bytes.length >= j.plainLen || j.c1 < 0) continue;                // the plain form stays
        ctlOut.bytes(ctl.subarray(pos, j.c0)); tag = new Out(); tag.u8(CT_ADAPT); tag.u8(j.e); tag.u8(r.z); tag.varint(r.bytes.length); ctlOut.bytes(tag.done()); pos = j.c1;
        blobOut.push(flat.subarray(bpos, j.b0)); blobOut.push(r.bytes); bpos = j.b1; e.needsV5 = true;
        acc.push({ j: j, ix: i, dc: tag.p - (j.c1 - j.c0), db: r.bytes.length - (j.b1 - j.b0) });
      }
      ctlOut.bytes(ctl.subarray(pos)); blobOut.push(flat.subarray(bpos));
      for (i = 0; i < blobOut.length; i++) total += blobOut[i].length;
      var newCtl = ctlOut.done();
      for (i = 0; i < defer.dirs.length; i++) {            // a spliced-in column changes the size of the column that holds it: the directory entries (5-byte numbers) are filled in again
        d = defer.dirs[i]; at = d.at; dc = d.c1 - d.c0; db = d.b1 - d.b0;
        for (t = 0; t < acc.length; t++) {
          if (acc[t].j.c1 <= d.at) at += acc[t].dc;
          if (acc[t].ix >= d.j0 && acc[t].ix < d.j1) { dc += acc[t].dc; db += acc[t].db; }
        }
        patch5(newCtl, at, dc); patch5(newCtl, at + 5, db);
      }
      var joined = { size: function () { return total; }, copyTo: function (dst, at2) { for (var q = 0; q < blobOut.length; q++) { dst.set(blobOut[q], at2); at2 += blobOut[q].length; } return at2; } };
      var outp = finishPack(e, newCtl, joined, opts); if (T) T.finish = performance.now() - tC; return outp;
    }).catch(function () { return pack(value, opts); });                // a worker failed: the same bytes the slow way
  }
  function colsFor(src, n, a, wopts) {                                  // a whole number column, encoded on its own: its control bytes, data bytes and whether it needs format 5
    var e2 = new Enc(wopts || {}), blobs = e2.blobs, flat;
    e2.numbers(src, n, a[0], a[1], a[2], a[3], a[4]);
    flat = new Uint8Array(blobs.size()); blobs.copyTo(flat, 0);
    return { ctl: e2.ctl.done().slice(), blob: flat, v5: !!e2.needsV5 };
  }
  function adaptFor(src, mode, wasm) {                                 // what the picker answers for one column, for a worker or the page
    var mcOpts = { mode: mode }; if (wasm === false) mcOpts.wasm = false;
    return Enc.prototype.adaptBytes.call({ mode: mode, mcOpts: mcOpts, hints: null, path: '' }, src);
  }
  function open(bytes, opts) {
    opts = opts || {};
    var b = toBytes(bytes), flags, ctlRaw, ctlStored, p, end = b.length, crc, ctl, rest, inp;
    if (!TEXT_DEC) jfail('this environment has no TextDecoder');
    if (b.length < 6 || b[0] !== 0x4D || b[1] !== 0x4A) jfail('not a MemoryCompressionJSO container');
    if (b[2] > JSO_VERSION || b[2] < 1) jfail('made by a newer version of the module (format ' + b[2] + ')');
    flags = b[3];
    if (flags & 4) {
      if (b.length < 10) jfail('data is cut off');
      end -= 4; crc = (b[end] | b[end + 1] << 8 | b[end + 2] << 16 | b[end + 3] << 24) >>> 0;
      if (MC.crc32(b.subarray(0, end)) >>> 0 !== crc) jfail('checksum does not match');
    }
    inp = new In(b, 4, end);
    ctlRaw = inp.varint(); ctlStored = inp.varint();
    if (ctlRaw > (opts.maxSize !== undefined ? opts.maxSize : 1073741824)) jfail('control data is bigger than maxSize');
    ctl = inp.take(ctlStored);
    if (flags & 2) { ctl = MC.unpack(ctl, { maxSize: ctlRaw + 64, wasm: opts.wasm === false ? false : undefined }); if (ctl.length !== ctlRaw) jfail('control data has the wrong size'); }
    else if (ctlStored !== ctlRaw) jfail('bad control size');
    var d = new Dec(new In(ctl, 0, ctl.length), new In(b, inp.p, end), opts);
    if (flags & 1) d.refs = [];
    d.ver = b[2];
    return d;
  }
  function unpack(bytes, opts) {
    var d = open(bytes, opts), v = d.value();
    if (d.c.p !== d.c.end) jfail('extra data after the value');
    return v;
  }

  function builderSlice(keys, modes) {                                    // builder() for rows from..to of an array made beforehand
    var sig = 'S' + keys.join('\u0001') + '\u0002' + modes.join(''), f = GEN_CACHE[sig], j, src, expr, pk, params;
    if (f) return f;
    if (CAN_EVAL) {
      src = 'var i;for(i=from;i<to;i++){out[i]={';
      for (j = 0; j < keys.length; j++) {
        expr = modes[j] === 0 ? 'a' + j + '[i]' : modes[j] === 1 ? '(a' + j + '[i]===1)' : modes[j] === 2 ? 'd' + j + '[a' + j + '[i]]' : 'd' + j;
        pk = keys[j] === '__proto__' ? '["__proto__"]' : JSON.stringify(keys[j]);
        src += (j ? ',' : '') + pk + ':' + expr;
      }
      src += '};}';
      params = ['out', 'from', 'to'];
      for (j = 0; j < keys.length; j++) { params.push('a' + j); params.push('d' + j); }
      f = new Function(params.join(','), src);
    } else {
      f = function (out, from, to) {
        var i, jj, o, m, a, d;
        for (i = from; i < to; i++) {
          o = {};
          for (jj = 0; jj < keys.length; jj++) { m = modes[jj]; a = arguments[3 + jj * 2]; d = arguments[4 + jj * 2]; define(o, keys[jj], m === 0 ? a[i] : m === 1 ? a[i] === 1 : m === 2 ? d[a[i]] : d); }
          out[i] = o;
        }
      };
    }
    genStore(sig, f);
    return f;
  }
  // unpackAsync(): the same value as unpack(), a promise; a long list of same-shape records is opened one column at a time and its rows are made in slices of about 5 ms with a yield between them,
  // so the page is never held for the whole open. The columns inside (records in records, arrays, coordinate pairs) are opened the same way. Anything else (short lists, mixed shapes,
  // shared objects, other values) is opened as unpack() does.
  function unpackAsync(bytes, opts) {
    var d, c, p0, n;
    try {
      d = open(bytes, opts); c = d.c; p0 = c.p;
      if (d.refs || d.ver < 2 || c.u8() !== T_COLS) { c.p = p0; return Promise.resolve(finishUnpack(d)); }
      n = c.varint();
      if (n < SLICE_MIN) { c.p = p0; return Promise.resolve(finishUnpack(d)); }
      d.depth = 1; d.spend(n);
    } catch (err) { return Promise.reject(err); }
    return d.columnAsync(n).then(function (col) {
      var out = col.full();
      if (c.p !== c.end) jfail('extra data after the value');
      return out;
    });
  }
  Dec.prototype.columnAsync = function (n) {                              // column() for the shapes that take long on the page, in slices; anything else is the plain call
    var d = this, c = d.c, p1 = c.p, ct, p;
    if (n < 1024) return Promise.resolve(d.column(n));
    try {
      ct = c.u8();
      if (ct === CT_RECORDS) { if (c.varint() !== 1 || d.ver < 2) ct = -1; else c.p = p1 + 1; }
      if (ct !== CT_RECORDS && ct !== CT_TUPLE && ct !== CT_ARRAYS) { c.p = p1; return Promise.resolve(d.column(n)); }
      if (++d.depth > MAX_DEPTH) jfail('nested too deeply');
    } catch (err) { return Promise.reject(err); }
    p = ct === CT_RECORDS ? d.recordsAsync(n) : ct === CT_TUPLE ? d.tupleAsync(n) : d.arraysAsync(n);
    return p.then(function (col) { d.depth--; return col; });
  };
  Dec.prototype.recordsAsync = function (n) {                              // CT_RECORDS with one shape (format 2): the byte for the kind is read, the shape count is not
    var d = this, c = d.c, ns = c.varint(), nk, j = 0, keys = [], dirC = [], dirB = [], cols = [], modes = [], out;
    nk = c.varint(); if (nk > 100000) jfail('too many keys');
    for (j = 0; j < nk; j++) keys.push(c.u8() === 0 ? c.str() : d.str16());
    d.spend(n * nk);
    for (j = 0; j < nk; j++) { dirC.push(c.varint()); dirB.push(c.varint()); }
    j = 0;
    function columns() {
      if (j >= nk) return true;
      var c0 = c.p, b0 = d.bl.p, saved = d.keys;
      d.keys = [];
      return d.columnAsync(n).then(function (col) {
        d.keys = saved;
        if (c.p - c0 !== dirC[j] || d.bl.p - b0 !== dirB[j]) jfail('a column does not match its directory entry');
        cols.push(col); modes.push(col.mode); j++;
        return nextTask();
      }).then(columns);
    }
    return columns().then(function () {
      var k, f = builderSlice(keys, modes), args = [out = new Array(n), 0, 0];
      for (k = 0; k < nk; k++) { args.push(cols[k].a); args.push(cols[k].d); }
      return slicedLoop(n, function (from, to) { args[1] = from; args[2] = to; f.apply(null, args); return true; }, UNPACK_SLICE_MS);
    }).then(function () { return new Col(n, 0, out, null); });
  };
  Dec.prototype.tupleAsync = function (n) {
    var d = this, c = d.c, k = c.varint(), cols = [], j = 0, out;
    if (k < 1 || k > 8) jfail('bad tuple');
    d.spend(n * k);
    function next() {
      if (j >= k) return true;
      return d.columnAsync(n).then(function (col) { cols.push(col); j++; return nextTask(); }).then(next);
    }
    return next().then(function () {
      var c0 = cols[0], c1 = cols[1], x0 = k === 2 && c0.mode === 0 ? c0.a : null, x1 = k === 2 && c1.mode === 0 ? c1.a : null, fast = x0 instanceof Float64Array && x1 instanceof Float64Array;
      out = new Array(n);
      return slicedLoop(n, function (from, to) {
        var i, jj, r;
        if (fast) for (i = from; i < to; i++) out[i] = [x0[i], x1[i]];
        else if (k === 2) for (i = from; i < to; i++) out[i] = [c0.get(i), c1.get(i)];
        else for (i = from; i < to; i++) { r = new Array(k); for (jj = 0; jj < k; jj++) r[jj] = cols[jj].get(i); out[i] = r; }
        return true;
      }, UNPACK_SLICE_MS);
    }).then(function () { return new Col(n, 0, out, null); });
  };
  Dec.prototype.arraysAsync = function (n) {
    var d = this, c = d.c, m = c.varint(), lens, out;
    d.spend(m + n);
    lens = d.lengthCol(n);
    return (m > 0 ? d.columnAsync(m) : Promise.resolve(null)).then(function (flat) {
      var off = 0, fa = flat !== null && flat.mode === 0 && Array.isArray(flat.a) ? flat.a : null;
      out = new Array(n);
      return slicedLoop(n, function (from, to) {
        var i, j, len, row;
        for (i = from; i < to; i++) {
          len = lens.get(i); if (off + len > m) jfail('bad array lengths');
          if (fa !== null) row = fa.slice(off, off + len);
          else { row = new Array(len); for (j = 0; j < len; j++) row[j] = flat.get(off + j); }
          out[i] = row; off += len;
        }
        return true;
      }, UNPACK_SLICE_MS).then(function () { if (off !== m) jfail('bad array lengths'); });
    }).then(function () { return new Col(n, 0, out, null); });
  };
  function finishUnpack(d) {
    var v = d.value();
    if (d.c.p !== d.c.end) jfail('extra data after the value');
    return v;
  }

  // view(): for a packed array of objects that stays packed. Nothing is restored when it opens; a column is restored the first time it is read
  // (format 2) and objects are made one at a time. release() lets go of the restored columns again.
  // shortView(): the same calls as view() for a packed array of objects with fewer than 16 rows, which is stored in the general form and cannot open column by column.
  // It is restored whole (it is small) and release() does nothing. Anything that is not an array of plain objects is refused as before.
  function shortView(bytes, opts) {
    var v = unpack(bytes, opts), keys = [], seen = Object.create(null), i, k, o, ok = Array.isArray(v), n = ok ? v.length : 0;
    for (i = 0; ok && i < n; i++) {
      o = v[i]; if (o === null || typeof o !== 'object' || Array.isArray(o) || Object.getPrototypeOf(o) !== Object.prototype && Object.getPrototypeOf(o) !== null) ok = false;
      else for (k in o) if (Object.prototype.hasOwnProperty.call(o, k) && !seen[k]) { seen[k] = 1; keys.push(k); }
    }
    if (!ok) jfail('view() needs a packed array of objects');
    var col = function (key) { var out = new Array(n), q; for (q = 0; q < n; q++) out[q] = v[q][key]; return out; };
    return {
      length: n, keys: keys.slice(), lazy: false,
      get: function (i) { if (i < 0 || i >= n || i !== Math.floor(i)) return undefined; return v[i]; },
      field: function (i, key) { if (!seen[key] || i < 0 || i >= n || i !== Math.floor(i)) return undefined; return v[i][key]; },
      column: function (key) { return seen[key] ? col(key) : undefined; },
      slice: function (from, to) {
        from = from === undefined ? 0 : Math.max(0, Math.floor(from)); to = to === undefined ? n : Math.min(n, Math.floor(to));
        return from <= to ? v.slice(from, to) : [];
      },
      toArray: function () { return v.slice(); },
      loaded: function () { return keys.slice(); },
      release: function () { },
      memory: function () { return { packed: bytes.length, restored: estimateBytes(v) }; }
    };
  }
  function view(bytes, opts) {
    var d = open(bytes, opts), c = d.c, tag = c.u8(), n, ct, ns, nk, keys = [], cols = [], i, j, lazy, dirC = [], dirB = [], offC = [], offB = [], ctlBuf = c.b, blobBuf = d.bl.b, blobEnd = d.bl.end;
    if (tag !== T_COLS) return shortView(bytes, opts);                // under 16 rows (or not objects): restored whole, then shown with the same calls
    n = c.varint(); d.spend(n);
    ct = c.u8();
    if (ct !== CT_RECORDS) jfail('view() needs a packed array of objects');
    ns = c.varint();
    if (ns !== 1) jfail('view() needs objects that all have the same keys');
    nk = c.varint();
    for (j = 0; j < nk; j++) keys.push(c.u8() === 0 ? c.str() : d.str16());
    d.spend(n * nk);
    lazy = d.ver >= 2;
    if (lazy) {                                                       // where each column starts, in the control bytes and in the data bytes
      for (j = 0; j < nk; j++) { dirC.push(c.varint()); dirB.push(c.varint()); }
      var pc = c.p, pb = d.bl.p;
      for (j = 0; j < nk; j++) { offC.push(pc); offB.push(pb); pc += dirC[j]; pb += dirB[j]; }
      if (pc > c.end || pb > blobEnd) jfail('data is cut off');
    } else for (j = 0; j < nk; j++) cols.push(d.column(n));
    var index = {}; for (j = 0; j < nk; j++) index[keys[j]] = j;
    var getter = null, vopts = opts || {};
    function col(q) {                                                  // the restored column q, restored now if it has not been
      var x = cols[q], sub;
      if (x) return x;
      sub = new Dec(new In(ctlBuf, offC[q], offC[q] + dirC[q]), new In(blobBuf, offB[q], offB[q] + dirB[q]), vopts);
      sub.ver = d.ver; sub.lazyText = true; sub.spend(n);
      x = sub.column(n);
      if (sub.c.p !== sub.c.end || sub.bl.p !== sub.bl.end) jfail('a column does not match its directory entry');
      cols[q] = x; getter = null;
      return x;
    }
    function all() { var q; for (q = 0; q < nk; q++) col(q); }
    function makeGetter() {
      all();
      if (CAN_EVAL) {
        var src = 'return function(i){return {', pj;
        for (pj = 0; pj < nk; pj++) src += (pj ? ',' : '') + (keys[pj] === '__proto__' ? '["__proto__"]' : JSON.stringify(keys[pj])) + ':c[' + pj + '].get(i)';
        getter = new Function('c', src + '};}')(cols);
      } else getter = function (i) { var o = {}, q; for (q = 0; q < nk; q++) define(o, keys[q], cols[q].get(i)); return o; };
      return getter;
    }
    function colBytes(x) {                                          // about: 8 bytes a slot, plus a byte a character for text
      var t, i, a = x.a;
      if (x.mode === 3) return 0;
      if (x.mode === 4) return a.codes.byteLength + a.coff.byteLength;
      if (a.byteLength !== undefined) return a.byteLength;
      t = a.length * 8; for (i = 0; i < a.length; i++) if (typeof a[i] === 'string') t += a[i].length;   // rows where the key is missing are undefined: count only the text
      return t;
    }
    return {
      length: n, keys: keys.slice(), lazy: lazy,
      get: function (i) { if (i < 0 || i >= n || i !== Math.floor(i)) return undefined; return (getter || makeGetter())(i); },
      field: function (i, key) { var q = index[key]; if (q === undefined || i < 0 || i >= n) return undefined; return col(q).get(i); },
      column: function (key) {                                  // the values of one key: a typed array when the column is numeric, otherwise a plain array
        var q = index[key], x; if (q === undefined) return undefined; x = col(q);
        return x.mode === 0 ? x.a : x.full();
      },
      slice: function (from, to) {                                // the objects from row from up to (not including) row to, made now; the other rows stay packed
        var out, g, i;
        from = from === undefined ? 0 : Math.max(0, Math.floor(from)); to = to === undefined ? n : Math.min(n, Math.floor(to));
        if (!(from <= to)) return [];
        g = getter || makeGetter(); out = new Array(to - from);
        for (i = from; i < to; i++) out[i - from] = g(i);
        return out;
      },
      toArray: function () { var out = new Array(n), q, g = getter || makeGetter(); for (q = 0; q < n; q++) out[q] = g(q); return out; },
      loaded: function () { return keys.filter(function (k, q) { return cols[q]; }); },
      release: function () { var q; if (!lazy) jfail('release() needs a file made by format 2 (pack it again)'); for (q = 0; q < nk; q++) cols[q] = undefined; getter = null; },
      memory: function () { var q, dec = 0; for (q = 0; q < nk; q++) if (cols[q]) dec += colBytes(cols[q]); return { packed: bytes.length, restored: dec }; }
    };
  }
