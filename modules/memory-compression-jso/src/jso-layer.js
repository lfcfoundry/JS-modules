  // ================================================================ the object layer
  // Everything below needs only the packing core above (MC). Layout of a packed value:
  //   'M' 'J' version flags | [crc32] | control bytes (tags, counts, key names; packed when large) | blob area (packed numeric columns)
  // A value is walked once. Arrays of 16 or more things become COLUMNS: numbers as the narrowest exact integer, a decimal
  // scaled to integers, a float32 or a float64; strings as a dictionary or one joined text; booleans as bits; objects as
  // one column per key (a "shape"); arrays as lengths plus one flattened column. Each numeric column then goes through the
  // core's byte shuffle and LZ4/deflate stage. Anything irregular falls back to a plain tagged encoding.

  var JSO_VERSION = 2;                            // 2: a record column list starts with a directory of sizes so one column can be read alone; version 1 files are still read
  var T_UNDEF = 0, T_NULL = 1, T_FALSE = 2, T_TRUE = 3, T_INT = 4, T_F64 = 5, T_STR = 6, T_STR16 = 7, T_ARR = 8, T_OBJ = 9, T_OBJ0 = 10,
    T_COLS = 11, T_BIGINT = 12, T_DATE = 13, T_TYPED = 14, T_ABUF = 15, T_MAP = 16, T_SET = 17, T_REF = 18, T_REGEX = 19;
  var CT_CONST = 0, CT_INT = 1, CT_DEC = 2, CT_F32 = 3, CT_F64 = 4, CT_BOOL = 5, CT_STRD = 6, CT_STRR = 7, CT_NULLABLE = 8,
    CT_ARRAYS = 9, CT_TUPLE = 10, CT_RECORDS = 11, CT_ANY = 12, CT_TEMPLATE = 13, CT_REFS = 14, CT_REFRECS = 15;
  var MIN_COLUMN = 16, MAX_TEMPLATES = 32, MAX_SLOTS = 32, MAX_SHAPES = 16, MAX_FUSED_KEYS = 64, MAX_DEPTH = 400, RAW_LIMIT = 48, DEFAULT_MAX_ITEMS = 100000000;
  var TYPED_CTORS = [Uint8Array, Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
  var G = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {};
  var OP = Object.prototype, TEXT_ENC = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, TEXT_DEC = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true }) : null;
  var RE_LONE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
  var P10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
  var CAN_EVAL = (function () { try { return new Function('return 1')() === 1; } catch (e) { return false; } })();
  var GEN_CACHE = {}, GEN_COUNT = 0, GEN_LIMIT = 500;                 // generated helpers, kept per layout; forgotten all at once past 500 so odd inputs cannot grow it forever
  function genStore(sig, f) { if (GEN_COUNT >= GEN_LIMIT) { GEN_CACHE = {}; LEARNED = {}; GEN_COUNT = 0; } GEN_CACHE[sig] = f; GEN_COUNT++; }

  function jfail(m) { throw new Error('MemoryCompressionJSO: ' + m); }
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
    this.level = opts && opts.level;
    this.refs = !!(opts && opts.refs);
    this.patterns = !(opts && opts.patterns === false);                 // text patterns on by default; off saves time on text-heavy data at the cost of size
    this.float32 = !!(opts && opts.float32);                       // opt-in and lossy: columns of fractions that need 8 bytes each are kept in 4
    this.seen = this.refs ? new Map() : null;
    this.keys = new Map(); this.depth = 0;
    this.report = opts && opts.report || null;
    this.path = '';
    this.mcOpts = { mode: this.mode }; if (this.level !== undefined) this.mcOpts.level = this.level;
    if (opts && opts.wasm === false) this.mcOpts.wasm = false;
    this.blobBytes = 0;
  }
  Enc.prototype.blob = function (t, name) {      // t: a typed array. Raw when tiny, else packed by the core when that is smaller
    var o = this.blobs, raw = t.length * t.BYTES_PER_ELEMENT, packed, start = o.pos();
    if (raw < RAW_LIMIT) { o.u8(0); rawPut(o, t); }
    else {
      packed = MC.pack(t, this.mcOpts);
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
  Enc.prototype.intData = function (vals, n, min, max) {      // CT_INT body: width, base, packed offsets. Caller checked max - min < 2^32
    var range = max - min, w = range < 256 ? 1 : range < 65536 ? 2 : 4, i, t = w === 1 ? new Uint8Array(n) : w === 2 ? new Uint16Array(n) : new Uint32Array(n);
    for (i = 0; i < n; i++) t[i] = vals[i] - min;
    this.ctl.u8(w); this.ctl.zigzag(min); this.blob(t, 'ints');
  };
  function scaleDecimals(vals, n, p) {                  // whole numbers = value * p, only when dividing by p gives every value back exactly
    var t = new Float64Array(n), i, x, y;
    for (i = 0; i < n; i++) { x = vals[i]; y = Math.round(x * p); if (y / p !== x) return null; t[i] = y; }
    return t;
  }
  Enc.prototype.numbers = function (vals, n, allInt, f32, min, max, neg0) {
    var c = this.ctl, i, e, p, x, y, ints, ok, t, lo, hi;
    if (allInt && (min <= -4503599627370496 || max >= 4503599627370496)) allInt = false;        // whole numbers beyond 2^52 stay plain doubles
    if (allInt && max - min < 4294967296) { c.u8(CT_INT); this.intData(vals, n, min, max); return; }
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
          if (hi < 4503599627370496 && lo > -4503599627370496 && hi - lo < 4294967296 && (hi - lo < 65536 || !f32)) { c.u8(CT_DEC); c.u8(e); this.intData(ints, n, lo, hi); return; }
          break;
        }
        if (e >= 3) break;
      }
    }
    if (f32 || (this.float32 && !allInt && min > -3e38 && max < 3e38)) { t = new Float32Array(n); for (i = 0; i < n; i++) t[i] = vals[i]; c.u8(CT_F32); this.blob(t, 'f32'); return; }
    if (vals instanceof Float64Array) t = vals;
    else { t = new Float64Array(n); for (i = 0; i < n; i++) t[i] = vals[i]; }
    c.u8(CT_F64); this.blob(t, 'f64');
  };
  Enc.prototype.bools = function (vals, n) {
    var bits = new Uint8Array((n + 7) >> 3), i;
    for (i = 0; i < n; i++) if (vals[i]) bits[i >> 3] |= 1 << (i & 7);
    this.ctl.u8(CT_BOOL); this.blob(bits, 'bits');
  };
  Enc.prototype.strings = function (vals, n) {
    var c = this.ctl, i, s, seen, dict, idx, id, m, sample = n < 256 ? n : 256, d0 = new Set(), pre, prev = 0;
    for (i = 0; i < sample; i++) d0.add(vals[i]);
    if (d0.size * 2 <= sample || n <= 64) {
      seen = new Map(); dict = []; idx = new Uint16Array(n);
      for (i = 0; i < n; i++) {
        s = vals[i];
        if (s === dict[prev]) { idx[i] = prev; continue; }                 // same as the last one: no lookup
        id = 0; m = dict.length;
        if (m <= 8) { while (id < m && dict[id] !== s) id++; if (id === m) id = undefined; }   // a handful of values: comparing beats hashing
        else id = seen.get(s);
        if (id === undefined) {
          id = dict.length;
          if (id >= 65536 || (id > 4096 && id * 2 > i + 1)) { seen = null; break; }
          seen.set(s, id); dict.push(s);
        }
        idx[i] = prev = id;
      }
      if (seen) {
        m = dict.length; if (m <= 256) idx = new Uint8Array(idx);
        c.u8(CT_STRD); c.varint(m); this.rawStrings(dict, m); this.blob(idx, 'dict-index'); return;
      }
    }
    pre = joinText(vals, n);
    if (n >= 32 && this.patterns && pre && pre.ascii && this.template(vals, n, pre)) return;
    c.u8(CT_STRR); this.rawStrings(vals, n, pre);
  };
  // the lengths and the joined UTF-8 text of a list of strings (kept for the writer so it is made once); null when it is too long for one piece
  function joinText(vals, n) {
    var lens = new Uint32Array(n), total = 0, i, l, joined, bytes;
    for (i = 0; i < n; i++) { l = vals[i].length; lens[i] = l; total += l; }
    if (total > 67108864) return null;
    joined = vals.join('');
    if (!wellFormed(joined)) return { lens: lens, joined: joined, bytes: null, ascii: false };
    bytes = TEXT_ENC.encode(joined);
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
  var TRIE_NODES = 1024, KERNELS_B64 = /*KW:BEGIN*/'AGFzbQEAAAABEwFgDn9/f39/f39/f39/f39/AX8DAgEABQYBARCAgAEGDQJ/AUGAKAt/AEGAKAsHIwMGbWVtb3J5AgAIdHBsX3NjYW4AAAtfX2hlYXBfYmFzZQMBCoAEAf0DAwx/AX4BfwJAIAIgA04NACAAQQFqIQ4gBUGABGohDwNAQQAhEAJAIAQgASACQQJ0aigCACAEaiIRTw0AIAcgAkEDdGohEkEAIRNBACEQIAQhFANAAkACQCAAIBRqIhUtAAAiFkFQakEJSw0AIBEgFEEBaiIXIBEgF0sbIhhBf2ohGUIAIRogFCEXAkADQCAaQgp+IBZBUGqtfCEaAkAgGSAXRw0AIBghGwwCCyAOIBdqIRYgF0EBaiIbIRcgFi0AACIWQVBqQQpJDQALCwJAIBsgFGsiF0EPTA0AIAIhAwwGCwJAIBMgCEgNACACIQMMBgsCQCAPIBBBggRsai8BACIWDQAgAiEDDAYLIBIgEyADbEEDdGogGro5AwACQCAXIAogE0ECdCIZaiIUKAIATg0AIBQgFzYCAAsCQCAXIAsgGWoiGSgCAEwNACAZIBc2AgALAkAgF0ECSA0AIBUtAABBMEcNACAMIBNqQQE6AAALIBNBAWohEwwBCwJAIAUgEEGCBGxqIBZBAXRqLwEAIhYNACACIQMMBQsgFEEBaiEbCyAWwSEQIBshFCAbIBFJDQALCwJAIAYgEGosAAAiF0EATg0AIAIhAwwCCyAJIAJqIBc6AAAgESEEIAJBAWoiAiADRw0ACyARIQQLIA0gBDYCBCANIAM2AgAgAws='/*KW:END*/, KW = null, KW_STATE = 0;
  function b64bytes(t) {
    var bin = typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary'), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function kwGet() {                                // the helper's instance, made on first use; null when WebAssembly is missing or the page refuses it
    var inst;
    if (KW_STATE) return KW;
    KW_STATE = 2;
    try {
      if (typeof WebAssembly !== 'object' || !KERNELS_B64) return null;
      inst = new WebAssembly.Instance(new WebAssembly.Module(b64bytes(KERNELS_B64)), {});
      KW = { x: inst.exports, mem: inst.exports.memory, base: (inst.exports.__heap_base.value + 15) & ~15 }; KW_STATE = 1;
    } catch (e) { KW = null; }
    return KW;
  }
  function kwRoom(bytes) {                          // makes sure the helper's memory holds `bytes` after its base; false if it cannot (or it would be too big to keep)
    var need = KW.base + bytes, have = KW.mem.buffer.byteLength;
    if (need > 134217728) return false;
    if (need > have) { try { KW.mem.grow(Math.ceil((need - have) / 65536)); } catch (e) { return false; } }
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
  Enc.prototype.template = function (vals, n, pre) {
    var b = pre.bytes, lens = pre.lens, lits0 = tplOf(vals[0]), R, tpls, j, t, i, widths, L, c = this.ctl, nt, total = b.length, tr, kw = null, buf, off, at;
    var next, term, slotsAll, tid, minL, maxL, lead, out, bb, ll, row, p, r;
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
      next = new Int16Array(TRIE_NODES * 257); term = new Int8Array(TRIE_NODES); bb = b; ll = lens; tid = new Uint8Array(n); slotsAll = new Float64Array(n * R);
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
    c.u8(CT_TEMPLATE); c.varint(nt); c.varint(R);
    for (t = 0; t < nt; t++) for (j = 0; j <= R; j++) c.str(tpls[t][j]);
    for (j = 0; j < R; j++) c.varint(widths[j]);
    if (nt > 1) this.blob(tid, 'template-ids');
    for (j = 0; j < R; j++) this.column(slotsAll.subarray(j * n, (j + 1) * n), n);
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
      if (wellFormed(joined)) { c.u8(0); bytes = TEXT_ENC.encode(joined); c.varint(bytes.length); this.blob(bytes, 'text'); }
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
  function patch5(b, at, v) { var i; for (i = 0; i < 4; i++) { b[at + i] = (v % 128) | 128; v = Math.floor(v / 128); } b[at + 4] = v; }
  // The columns of one list of same-shape records, each with its own key numbering, behind a directory of (control bytes, data bytes) per column
  // (written as 5-byte numbers filled in afterwards) so a reader can skip to any column.
  Enc.prototype.dirColumns = function (cols, n, keys, path) {
    var c = this.ctl, nk = cols.length, dir, j, c0, b0, saved;
    c.need(nk * 10 + 16); dir = c.p;
    for (j = 0; j < nk * 2; j++) { c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 128; c.b[c.p++] = 0; }
    for (j = 0; j < nk; j++) {
      c0 = c.p; b0 = this.blobs.pos(); saved = this.keys; this.keys = new Map();
      if (this.report) this.path = path + '.' + keys[j];
      this.column(cols[j], n);
      this.keys = saved;
      patch5(c.b, dir + j * 10, c.p - c0); patch5(c.b, dir + j * 10 + 5, this.blobs.pos() - b0);
    }
    this.path = path;
  };
  Enc.prototype.fusedRecords = function (vals, n) {
    var c = this.ctl, keys = Object.keys(vals[0]), nk = keys.length, cols, j, path = this.path;
    if (nk === 0 || nk > MAX_FUSED_KEYS) return false;
    cols = splitColumns(function (types) { return fusedExtractor(keys, types); }, 'R' + keys.join('\u0001') + '\u0002' + nk, vals[0], keys, vals, n);
    if (!cols) return false;
    c.u8(CT_RECORDS); c.varint(1); c.varint(nk);
    for (j = 0; j < nk; j++) { if (wellFormed(keys[j])) { c.u8(0); c.str(keys[j]); } else { c.u8(1); this.str16(keys[j]); } }
    this.dirColumns(cols, n, keys, path);
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
      for (j = 0; j < nk; j++) src += 'var c' + j + '=new ' + (types[j] === 'n' ? 'Float64Array' : 'Array') + '(n);r.push(c' + j + ');';
      src += 'for(i=0;i<n;i++){o=rows[i];if(typeof o!=="object"||o===null||Object.getPrototypeOf(o)!==OP)return -1;k=0;for(p in o){if(p!==keys[k++])return -1;}if(k!==' + nk + ')return -1;';
      for (j = 0; j < nk; j++) {
        if (types[j] === 'n') src += 'v=o[' + JSON.stringify(keys[j]) + '];if(typeof v!=="number")return ' + (-(2 + j)) + ';c' + j + '[i]=v;';
        else src += 'c' + j + '[i]=o[' + JSON.stringify(keys[j]) + '];';
      }
      src += '}return r;';
      f = new Function('rows', 'n', 'keys', 'OP', src);
      f = (function (g) { return function (rows, n, ks) { return g(rows, n, ks, OP); }; })(f);
    } else {
      f = function (rows, n, ks) {
        var r = [], i, jj, o, k, p, v;
        for (jj = 0; jj < nk; jj++) r.push(types[jj] === 'n' ? new Float64Array(n) : new Array(n));
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
  Col.prototype.get = function (i) { var m = this.mode; return m === 0 ? this.a[i] : m === 1 ? this.a[i] === 1 : m === 2 ? this.d[this.a[i]] : this.d; };
  Col.prototype.full = function () {
    var n = this.n, a = this.a, d = this.d, out, i, m = this.mode;
    if (m === 0 && Array.isArray(a)) return a;
    out = new Array(n);
    if (m === 0) for (i = 0; i < n; i++) out[i] = a[i];
    else if (m === 1) for (i = 0; i < n; i++) out[i] = a[i] === 1;
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
    var c = this.c, ct = c.u8(), i, j, m, k, w, e, p, base, t, a, d, out, col, lens, flat, kinds, inner;
    switch (ct) {
      case CT_CONST: return new Col(n, 3, null, this.value());
      case CT_INT: return this.intCol(n);
      case CT_DEC:
        e = c.u8(); if (e > 10) jfail('bad scale'); p = P10[e];
        col = this.intCol(n); a = col.a; t = new Float64Array(n);
        if (col.mode === 3) { for (i = 0; i < n; i++) t[i] = col.d / p; } else for (i = 0; i < n; i++) t[i] = a[i] / p;
        return new Col(n, 0, t, null);
      case CT_F32: return new Col(n, 0, this.blob(Float32Array, n), null);
      case CT_F64: return new Col(n, 0, this.blob(Float64Array, n), null);
      case CT_BOOL: t = this.blob(Uint8Array, (n + 7) >> 3); a = new Uint8Array(n); for (i = 0; i < n; i++) a[i] = (t[i >> 3] >> (i & 7)) & 1; return new Col(n, 1, a, null);
      case CT_STRD:
        m = c.varint(); this.spend(m); if (m > n) jfail('dictionary bigger than its column');
        d = this.rawStrings(m);
        a = this.blob(m <= 256 ? Uint8Array : m <= 65536 ? Uint16Array : Uint32Array, n);
        for (i = 0; i < n; i++) if (a[i] >= m) jfail('dictionary index out of range');
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
        if (k === 2) { var c0 = cols[0], c1 = cols[1]; for (i = 0; i < n; i++) out[i] = [c0.get(i), c1.get(i)]; }
        else for (i = 0; i < n; i++) { var r = new Array(k); for (j = 0; j < k; j++) r[j] = cols[j].get(i); out[i] = r; }
        return new Col(n, 0, out, null);
      case CT_ARRAYS:
        m = c.varint(); this.spend(m + n);
        lens = this.lengthCol(n);
        flat = m > 0 ? this.column(m) : null;
        out = new Array(n); var off = 0, len, row;
        for (i = 0; i < n; i++) {
          len = lens.get(i); if (off + len > m) jfail('bad array lengths');
          row = new Array(len); for (j = 0; j < len; j++) row[j] = flat.get(off + j);
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
      case CT_ANY:
        out = new Array(n); this.spend(n);
        for (i = 0; i < n; i++) out[i] = this.value();
        return new Col(n, 0, out, null);
      default: jfail('unknown column type ' + ct);
    }
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
    for (i = 0; i < n; i++) a[i] = t[i] + base;
    return new Col(n, 0, a, null);
  };
  Dec.prototype.lengthCol = function (n) {
    var c = this.c, ct = c.u8();
    if (ct === CT_CONST) return new Col(n, 3, null, c.varint());
    if (ct !== CT_INT) jfail('bad lengths');
    return this.intCol(n);
  };
  Dec.prototype.rawStrings = function (n) {
    var c = this.c, lens, pieces, out = new Array(n), q = 0, pi, kind, len, cnt, bytes, big, off, i, u, end;
    this.spend(n);
    lens = this.lengthCol(n);
    pieces = c.varint();
    if (pieces > n + 1) jfail('bad string pieces');
    for (pi = 0; pi < pieces; pi++) {
      cnt = c.varint(); if (q + cnt > n) jfail('bad string pieces');
      kind = c.u8(); len = c.varint(); this.spend(len);
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
    var e = new Enc(opts), ctlBytes, flags = 0, head, stored, packedCtl = null, ctlRaw, out, p, crc;
    e.value(value);
    ctlRaw = e.ctl.done();
    if (ctlRaw.length >= 256) {
      packedCtl = MC.pack(ctlRaw, e.mcOpts);
      if (packedCtl.length >= ctlRaw.length * 0.9) packedCtl = null;
    }
    stored = packedCtl || ctlRaw;
    if (e.refs) flags |= 1; if (packedCtl) flags |= 2; if (opts.check) flags |= 4;
    var blobsLen = e.blobs.size();
    head = new Out(); head.u8(0x4D); head.u8(0x4A); head.u8(JSO_VERSION); head.u8(flags);
    head.varint(ctlRaw.length); head.varint(stored.length);
    out = new Uint8Array(head.p + stored.length + blobsLen + (flags & 4 ? 4 : 0));
    out.set(head.done(), 0); p = head.p; out.set(stored, p); p += stored.length; p = e.blobs.copyTo(out, p);
    if (flags & 4) { crc = MC.crc32(out.subarray(0, p)); out[p] = crc; out[p + 1] = crc >>> 8; out[p + 2] = crc >>> 16; out[p + 3] = crc >>> 24; }
    if (opts.report) { opts.report.summary = { total: out.length, control: stored.length, controlRaw: ctlRaw.length, blobs: blobsLen }; }
    return out;
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

  // view(): for a packed array of objects that stays packed. Nothing is restored when it opens; a column is restored the first time it is read
  // (format 2) and objects are made one at a time. release() lets go of the restored columns again.
  function view(bytes, opts) {
    var d = open(bytes, opts), c = d.c, tag = c.u8(), n, ct, ns, nk, keys = [], cols = [], i, j, lazy, dirC = [], dirB = [], offC = [], offB = [], ctlBuf = c.b, blobBuf = d.bl.b, blobEnd = d.bl.end;
    if (tag !== T_COLS) jfail('view() needs a packed array of 16 or more objects');
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
      sub.ver = d.ver; sub.spend(n);
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
    function colBytes(x) { return x.mode === 3 ? 0 : x.a.byteLength !== undefined ? x.a.byteLength : x.a.length * 8; }
    return {
      length: n, keys: keys.slice(), lazy: lazy,
      get: function (i) { if (i < 0 || i >= n || i !== Math.floor(i)) return undefined; return (getter || makeGetter())(i); },
      field: function (i, key) { var q = index[key]; if (q === undefined || i < 0 || i >= n) return undefined; return col(q).get(i); },
      column: function (key) {                                  // the values of one key: a typed array when the column is numeric, otherwise a plain array
        var q = index[key], x; if (q === undefined) return undefined; x = col(q);
        return x.mode === 0 ? x.a : x.full();
      },
      toArray: function () { var out = new Array(n), q, g = getter || makeGetter(); for (q = 0; q < n; q++) out[q] = g(q); return out; },
      loaded: function () { return keys.filter(function (k, q) { return cols[q]; }); },
      release: function () { var q; if (!lazy) jfail('release() needs a file made by format 2 (pack it again)'); for (q = 0; q < nk; q++) cols[q] = undefined; getter = null; },
      memory: function () { var q, dec = 0; for (q = 0; q < nk; q++) if (cols[q]) dec += colBytes(cols[q]); return { packed: bytes.length, restored: dec }; }
    };
  }
