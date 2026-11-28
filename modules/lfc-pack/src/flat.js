// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ flat-rows block (kind 'f'): every row is an object; one presence bit plane per key, one typed column per key
  // Layout: u32 header length, JSON header, then zstd frames: meta (keys and column table), presence planes, then the frames of each column.
  // Column types: V varints (delta when sorted, zigzag otherwise, whole numbers or two-decimal numbers), B bit-packed offsets, F float64 bytes, T booleans,
  // A lists of whole numbers (link lists: lengths plus deltas), H fixed-length lowercase hex, L log templates (automatic: kept only when 5% smaller than plain and a writer-side sample shows full-line reads are not slower (templates:true skips the read check, false turns them off)), U lowercase UUID as 16 bytes, I IPv4 as 4 bytes, D block dictionary plus codes, s strings, j JSON text (anything else).
  var LV_FLAT = 2;   // B46 (owner 11.14): level 2 saves logs 0.86-0.90 of level 3 for +0.4% bytes; taxi the same time and slightly smaller
  function vlen(x) { return x < 128 ? 1 : x < 16384 ? 2 : x < 2097152 ? 3 : x < 268435456 ? 4 : x < 34359738368 ? 5 : x < 4398046511104 ? 6 : x < 562949953421312 ? 7 : 8; }
  function zz(x) { return x >= 0 ? x * 2 : -x * 2 - 1; }
  function unzz(x) { return (x % 2 === 0) ? x / 2 : -(x + 1) / 2; }
  function varints(a) {
    var n = 0, i, u, o, p = 0;
    for (i = 0; i < a.length; i++) { u = a[i]; n += 1; while (u >= 128) { n++; u = Math.floor(u / 128); } }
    o = new Uint8Array(n);
    for (i = 0; i < a.length; i++) { u = a[i]; while (u >= 128) { o[p++] = (u % 128) | 128; u = Math.floor(u / 128); } o[p++] = u; }
    return o;
  }
  // same as unvarints, into an Int32Array so list values stay small integers (packed integer arrays are cheaper to make and to read); null when a value needs 31 bits or more
  function unvarints32(b, n) {
    var out = new Int32Array(n), p = 0, i, c, u;
    for (i = 0; i < n; i++) {
      c = b[p++]; if (c < 128) { out[i] = c; continue; }
      u = c & 127; c = b[p++]; if (c < 128) { out[i] = u + c * 128; continue; }
      u += (c & 127) * 128; c = b[p++]; if (c < 128) { out[i] = u + c * 16384; continue; }
      u += (c & 127) * 16384; c = b[p++]; if (c < 128) { out[i] = u + c * 2097152; continue; }
      return null;   // 28 bits or more: leave it to the general reader
    }
    return out;
  }
  function unvarints(b, n) {
    var out = new Float64Array(n), p = 0, i, c, u, m;
    for (i = 0; i < n; i++) {
      c = b[p++]; if (c < 128) { out[i] = c; continue; }
      u = c & 127; c = b[p++]; if (c < 128) { out[i] = u + c * 128; continue; }   // two bytes: the common case for ids below 16384
      u += (c & 127) * 128; c = b[p++]; if (c < 128) { out[i] = u + c * 16384; continue; }
      u += (c & 127) * 16384; m = 2097152; do { c = b[p++]; u += (c & 127) * m; m *= 128; } while (c & 128); out[i] = u;
    }
    return out;
  }
  function bitpack(codes, w) {
    var n = codes.length, out = new Uint8Array(Math.ceil(n * w / 8) + 5), bp = 0, i, byte, sh, v;
    for (i = 0; i < n; i++) { byte = bp >> 3; sh = bp & 7; v = codes[i] << sh; out[byte] |= v & 255; if (w + sh > 8) out[byte + 1] |= (v >> 8) & 255; if (w + sh > 16) out[byte + 2] |= (v >> 16) & 255; if (w + sh > 24) out[byte + 3] |= (v >>> 24) & 255; bp += w; }
    return out.subarray(0, Math.ceil(n * w / 8));
  }
  function bitunpack(b, n, w) {
    var out = w > 16 ? new Uint32Array(n) : w > 8 ? new Uint16Array(n) : new Uint8Array(n), mask = w >= 32 ? 0xFFFFFFFF : (1 << w) - 1, bp = 0, i, byte;
    var safe = b.length >= 4 ? Math.min(n, Math.floor(((b.length - 4) * 8) / w) + 1) : 0;   // values whose 4-byte window stays inside b: no out-of-range reads in the hot loop (they slow Firefox)
    for (i = 0; i < safe; i++) { byte = bp >> 3; out[i] = ((b[byte] | (b[byte + 1] << 8) | (b[byte + 2] << 16) | (b[byte + 3] << 24)) >>> (bp & 7)) & mask; bp += w; }
    for (; i < n; i++) { byte = bp >> 3; out[i] = (((b[byte] | 0) | ((b[byte + 1] | 0) << 8) | ((b[byte + 2] | 0) << 16) | ((b[byte + 3] | 0) << 24)) >>> (bp & 7)) & mask; bp += w; }
    return out;
  }
  var HEXC = '0123456789abcdef', HEXA = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]), HEX2 = (function () { var b = new Uint8Array(512), i; for (i = 0; i < 256; i++) { b[2 * i] = HEXA[i >> 4]; b[2 * i + 1] = HEXA[i & 15]; } return new Uint16Array(b.buffer); })(), RX_HEX = /^[0-9a-f]+$/, RX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var RX_IP = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/, RX_LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?:[^\ud800-\udbff]|^)[\udc00-\udfff]/;
  var NATIVE_WF = typeof ''.isWellFormed === 'function';
  function hexv(c) { return c < 58 ? c - 48 : c - 87; }   // '0'-'9', 'a'-'f' (the column check already proved the characters)
  function wellFormed(s) { return NATIVE_WF ? s.isWellFormed() : !RX_LONE.test(s); }
  function allOf(v, f) { for (var i = 0; i < v.length; i++) if (!f(v[i])) return false; return true; }
  function hasNegZero(x) {
    var st = [x], v, k, i;
    while (st.length) { v = st.pop(); if (typeof v === 'number') { if (v === 0 && 1 / v < 0) return true; } else if (v !== null && typeof v === 'object') { if (Array.isArray(v)) for (i = 0; i < v.length; i++) st.push(v[i]); else for (k in v) st.push(v[k]); } }
    return false;
  }
  function jsonx(x) {   // JSON text that keeps -0
    if (typeof x === 'number') return x === 0 && 1 / x < 0 ? '-0' : JSON.stringify(x);
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    var i, o = [];
    if (Array.isArray(x)) { for (i = 0; i < x.length; i++) o.push(jsonx(x[i])); return '[' + o.join(',') + ']'; }
    for (var k in x) o.push(JSON.stringify(k) + ':' + jsonx(x[k]));
    return '{' + o.join(',') + '}';
  }
  function jsonText(x) { return hasNegZero(x) ? jsonx(x) : JSON.stringify(x); }
  // ---- log templates: digit and long-hex runs become slots; the template text, template ids, pooled numeric slots and pooled text slots are separate streams
  // template slots: a run of 8 or more lowercase hex characters with at least one letter is one slot (tried first), any other number is a number slot.
  // (Trying digits first split ids like 1789c0bf1b into 1789, c, 0, bf, 1, b: 7,159 templates instead of 1 on the logs sample.)
  var RX_SLOT = /(?=[0-9a-f]{8,})[0-9a-f]*[a-f][0-9a-f]*|-?\d+/g, RX_CANON = /^(-?[1-9]\d{0,14}|0)$/;
  // auto mode only: templates can only be smaller when many values share a template, so look at up to 512 evenly spaced values first (near-unique columns skip the full pass, which cost half of the flat pack time on a 40-key set)
  function templatesPlausible(v) {
    var n = v.length, step = Math.max(1, Math.floor(n / 512)), seen = new Set(), c = 0, i;
    var ps = [];
    for (i = 0; i < n && c < 512; i += step, c++) seen.add(slotScan(v[i], ps));
    return seen.size * 2 <= c;
  }
  // RX_SLOT by hand, one pass: returns t with every slot replaced by \x01 and puts the slot texts in ps (what t.replace(RX_SLOT, '\x01') and t.match(RX_SLOT) give, without two regex runs)
  function slotScan(t, ps) {
    var n = t.length, i = 0, last = 0, out = '', c, j, h;
    ps.length = 0;
    while (i < n) {
      c = t.charCodeAt(i);
      if ((c >= 48 && c <= 57) || (c >= 97 && c <= 102)) {   // a run of 8 or more hex digits from here with a letter in it
        j = i; h = false;
        while (j < n) { c = t.charCodeAt(j); if (c >= 97 && c <= 102) h = true; else if (c < 48 || c > 57) break; j++; }
        if (h && j - i >= 8) { out += t.slice(last, i) + '\x01'; ps.push(t.slice(i, j)); i = last = j; continue; }
        c = t.charCodeAt(i);
      }
      j = c === 45 ? i + 1 : i;   // -?\d+
      if (j < n && (c = t.charCodeAt(j)) >= 48 && c <= 57) { j++; while (j < n && (c = t.charCodeAt(j)) >= 48 && c <= 57) j++; out += t.slice(last, i) + '\x01'; ps.push(t.slice(i, j)); i = last = j; continue; }
      i++;
    }
    return last ? out + t.slice(last) : t;
  }
  function templateFrames(v) {   // -> { frames, nT } or null
    var n = v.length, tmap = new Map(), tl = [], ids = new Array(n), slots = new Map(), i, k, t, id, ps = [], key, arr;
    for (i = 0; i < n; i++) {
      t = v[i]; if (t.indexOf('\x01') >= 0) return null;
      t = slotScan(t, ps);
      id = tmap.get(t); if (id === undefined) { id = tl.length; if (id > 65535) return null; tmap.set(t, id); tl.push(t); }
      ids[i] = id;
      if (ps) for (k = 0; k < ps.length; k++) { key = id * 4096 + k; if (k >= 4096) return null; arr = slots.get(key); if (!arr) { arr = []; slots.set(key, arr); } arr.push(ps[k]); }
    }
    var kinds = [], num = [], txt = [];
    slots.forEach(function (vals) {
      if (allOf(vals, function (x) { return RX_CANON.test(x); })) {
        kinds.push(1); var d = new Array(vals.length), prev = 0; for (var q = 0; q < vals.length; q++) { var x = +vals[q]; d[q] = zz(x - prev); prev = x; } num.push(varints(d));
      } else { kinds.push(0); txt.push(vals.join('\n')); }
    });
    var ib = new Uint8Array(n * 2); for (i = 0; i < n; i++) { ib[i] = ids[i] & 255; ib[n + i] = ids[i] >> 8; }
    return { frames: [te.encode(tl.join('\0')), ib, te.encode(txt.join('\0')), concat(num), new Uint8Array(kinds)], nT: tl.length };
  }
  // Rebuild of the template lines in a small wasm module (tpl4.c; build.sh makes tpl4.wasm, the string below is its base64): one pass writes every line as bytes, then one decode and one split like plain strings.
  // Linear memory is sized from the frame lengths for every call (memory.grow, never shrunk); more than 1.5 GB or no WebAssembly -> the JS path below.
  var TPLW = null, TPLB64 = "/*TPL:BEGIN*//*TPL:END*/";
  function tplw() {
    if (TPLW) return TPLW;
    if (!MODS['TPLB64']) MODS['TPLB64'] = new WebAssembly.Module(fromB64(TPLB64));
    var x = new WebAssembly.Instance(MODS['TPLB64'], {}).exports;
    return (TPLW = { x: x, heap: x.__heap_base.value });
  }
  function untemplate(n, fr) {
    if (!n) return [];
    if (typeof WebAssembly !== 'object' || fr[0].length > 8000000 || n > 4000000) return untemplateJS(n, fr);
    var f0 = fr[0], ids = fr[1], nb = fr[3], tx = fr[2], kd = fr[4], q, t, nt = 1, nm = 0;
    for (q = 0; q < f0.length; q++) { if (f0[q] === 0) nt++; else if (f0[q] === 1) nm++; }
    if (nt > 65536) return untemplateJS(n, fr);
    var tlen = new Uint32Array(nt), tmk = new Uint32Array(nt), cnt = new Uint32Array(nt);
    for (q = 0, t = 0; q < f0.length; q++) { if (f0[q] === 0) t++; else { tlen[t]++; if (f0[q] === 1) tmk[t]++; } }
    for (q = 0; q < n; q++) { t = ids[q] | (ids[n + q] << 8); if (t >= nt) return untemplateJS(n, fr); cnt[t]++; }
    var bound = n + tx.length + 16;
    for (t = 0; t < nt; t++) bound += cnt[t] * (tlen[t] - tmk[t] + tmk[t] * 21);
    var W = tplw(), o = W.heap + 15 & ~15, P = {}, end;
    function lay(name, bytes) { P[name] = o; o = (o + bytes + 15) & ~15; }
    lay('tb', f0.length + 1); lay('ib', ids.length); lay('nb', nb.length + 1); lay('tx', tx.length + 1); lay('kd', Math.max(nm, 1)); lay('out', bound);
    lay('toff', 4 * (nt + 1)); lay('sb', 4 * nt); lay('tc', 4 * nt); lay('seen', nt); lay('ms', 4 * (nt + 1)); lay('mk', 4 * Math.max(nm, 1)); lay('npos', 4 * Math.max(nm, 1)); lay('tpos', 4 * Math.max(nm, 1)); lay('acc', 8 * Math.max(nm, 1));
    end = o; if (end > 1610612736) return untemplateJS(n, fr);
    var mem = W.x.memory; if (end > mem.buffer.byteLength) mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536));
    var m8 = new Uint8Array(mem.buffer);
    m8.set(f0, P.tb); m8.set(ids, P.ib); m8.set(nb, P.nb); m8.set(tx, P.tx); m8.set(kd, P.kd);
    var r = W.x.rebuild(P.tb, f0.length, nt, P.ib, n, P.nb, P.tx, tx.length, P.kd, P.out, P.toff, P.sb, P.tc, P.seen, P.ms, P.mk, P.npos, P.tpos, P.acc);
    if (r > bound) throw new Error('LfcPack: template rebuild overran its buffer');
    return td.decode(m8.subarray(P.out, P.out + r)).split('\0');
  }
  function untemplateJS(n, fr) {
    var tl = n ? tdr.decode(fr[0]).split('\0') : [], parts = tl.map(function (t) { return t.split('\x01'); }), ids = fr[1], kinds = fr[4], tx = fr[2].length ? td.decode(fr[2]).split('\0') : [], nb = fr[3];
    var i, k, cnt = new Uint32Array(tl.length), id, first = new Uint8Array(tl.length), order = [];
    for (i = 0; i < n; i++) { id = ids[i] | (ids[n + i] << 8); cnt[id]++; if (!first[id]) { first[id] = 1; for (k = 0; k < parts[id].length - 1; k++) order.push(id * 4096 + k); } }
    var store = new Map(), np = 0, tp = 0, j, m, c, u, mul, a, vals, out = new Array(n);
    for (j = 0; j < order.length; j++) {
      c = cnt[(order[j] / 4096) | 0];
      if (kinds[j]) { vals = new Array(c); a = 0; for (m = 0; m < c; m++) { var b = nb[np++]; u = b & 127; mul = 128; while (b & 128) { b = nb[np++]; u += (b & 127) * mul; mul *= 128; } a += unzz(u); vals[m] = String(a); } }
      else vals = tx[tp++].split('\n');
      store.set(order[j], vals);
    }
    // per template: its slot value arrays, looked up once instead of once per cell
    var slotArr = new Array(tl.length), arr, s, vs, m;
    for (id = 0; id < tl.length; id++) { arr = parts[id]; vs = new Array(arr.length - 1); for (k = 1; k < arr.length; k++) vs[k - 1] = store.get(id * 4096 + k - 1); slotArr[id] = vs; }
    var seen = new Uint32Array(tl.length);
    for (i = 0; i < n; i++) {
      id = ids[i] | (ids[n + i] << 8); arr = parts[id]; vs = slotArr[id]; c = seen[id]++; m = arr.length;
      if (m === 1) { out[i] = arr[0]; continue; }
      s = arr[0];
      for (k = 1; k < m; k++) s += vs[k - 1][c] + arr[k];
      out[i] = s;
    }
    return out;
  }
  function isIdList(a) {
    if (!Array.isArray(a)) return false;
    for (var i = 0; i < a.length; i++) { var x = a[i]; if (typeof x !== 'number' || !(x >= 0 && x < 4294967296) || x % 1 !== 0 || (x === 0 && 1 / x < 0)) return false; }
    return true;
  }
  // writer-side sample check: rebuilding full lines from templates must not be slower than splitting plain strings (best of 5 on up to 8192 values, each line touched so joined strings are flattened; run only when templates are already smaller)
  var clock = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
  function touch(a) { var x = 0, i; for (i = 0; i < a.length; i++) x += a[i].charCodeAt(0) | 0; return x; }   // reading a character flattens the joined strings, as any use of a line does
  // time fn over enough repeats to fill about 8 ms (a 1 ms browser clock then reads within about 12%, enough for a 5% margin over several rounds), per call
  function perCall(fn) {
    var reps = 1, t0, dt;
    for (;;) { t0 = clock(); for (var r = 0; r < reps; r++) fn(); dt = clock() - t0; if (dt >= 8 || reps >= 256) return dt / reps; reps *= 2; }
  }
  // the template read check (readNoSlower) times reads for at least about 48 ms, so it runs at most once per column key per session: tmplSlow is set when one column failed it
  // (other columns and later blocks and calls skip templates and stay plain), tmplPass holds the keys that passed
  // auto mode starts with tmplSlow set: the check failed on every column we measured (template reads 1.3 to 4.3 times slower than the plain layout in Chromium, Firefox, WebKitGTK and Node,
  // 2026.11.05), so it cost 115 to 155 ms of every first logs or events pack only to choose the plain layout; templates stay available with { templates: true }
  var tmplSlow = true, tmplPass = new Set();
  function templatesReadOk(v, key) {
    if (tmplSlow) return false;
    if (key !== undefined && tmplPass.has(key)) return true;
    if (readNoSlower(v)) { if (key !== undefined) tmplPass.add(key); return true; }
    tmplSlow = true; return false;
  }
  function readNoSlower(v) {
    var smp = v.length > 8192 ? v.slice(0, 8192) : v, tf = templateFrames(smp), plain, r, bt = Infinity, bp = Infinity, x;
    if (!tf) return false;
    plain = te.encode(smp.join('\0'));
    for (r = 0; r < 3; r++) {
      x = perCall(function () { touch(untemplate(smp.length, tf.frames)); }); if (r && x < bt) bt = x;
      x = perCall(function () { touch(td.decode(plain).split('\0')); }); if (r && x < bp) bp = x;
    }
    return bt <= bp * 1.05;
  }
  // a column's candidate encodings; every frame is { raw: Uint8Array } and gets compressed by the caller
  // numbers with up to 9 decimals: the smallest power of ten that turns every value into a whole number and back exactly (value = whole / scale), or 0 when there is none; the decimals are counted on up to 512 evenly spaced values and then checked on all of them (a miss counts all values once)
  function decimalsSlow(x) { var t = String(x), e = t.indexOf('.'); return e < 0 ? 0 : t.indexOf('e') >= 0 ? -1 : t.length - e - 1; }
  var P10D = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];
  // same answer as decimalsSlow (the digits after the point in the shortest text of x), but found by trying round trips for magnitudes below 4e6 instead of formatting the number (formatting costs about 0.5 us per value)
  function decimalsOf(x) {
    var a = x < 0 ? -x : x, d, s;
    if (a < 1e21 && a === Math.floor(a)) return 0;   // a whole number below 1e21 prints without a point (this also skips the slow formatting of large whole numbers such as microsecond timestamps)
    if (a < 4e6 && a >= 1e-6) { for (d = 1; d <= 9; d++) { s = P10D[d]; if (Math.round(x * s) / s === x) return d; } }
    return decimalsSlow(x);
  }
  function scaledInts(v, scale) { var n = v.length, b = new Float64Array(n), i, x; for (i = 0; i < n; i++) { x = Math.round(v[i] * scale); if (!(Math.abs(x) < 9007199254740992 / 8 && x / scale === v[i])) return null; b[i] = x; } return b; }
  var DS_INTS = null;   // the whole numbers of the column decimalScale just accepted (so the caller does not compute them again)
  function decimalScale(v) {
    var n = v.length, st = Math.max(1, Math.floor(n / 512)), d = 0, i, q, pass, sc;
    for (pass = 0; pass < 2; pass++) {
      d = 0;
      for (i = 0; i < n; i += pass ? 1 : st) { q = decimalsOf(v[i]); if (q < 0 || q > 9) return 0; if (q > d) d = q; }
      sc = Math.pow(10, d); if (d && (DS_INTS = scaledInts(v, sc))) return sc;
      if (pass === 0 && st === 1) return 0;
    }
    return 0;
  }
  // decimalScale for a typed column given to the encoder (n >= NK_MIN): the same answer, but the whole-number check is one pass in the number kernel's memory (scaleints) and the whole numbers stay there as a view (DS_INTS) for the kernel run, so no array of n doubles is built and copied. Valid only until the kernel's memory grows.
  function decimalScaleW(v) {
    var n = v.length, K;
    if (!(v instanceof Float64Array) || n < NK_MIN || !(K = nkw()).x.scaleints) return decimalScale(v);
    var st = Math.max(1, Math.floor(n / 512)), d, i, q, pass, sc, X, mem;
    for (pass = 0; pass < 2; pass++) {
      d = 0;
      if (pass && K.x.maxdec) {   // since 0.26.6 the full pass runs in the kernel (maxdec: the same digit counts as decimalsOf); values it cannot decide come back here one at a time
        K = nkLoad(v, n); var dr = new Float64Array(K.x.memory.buffer, (K.heap + n * 8 + 7) & ~7, 1);   // the kernel's result slot, free until numcol
        for (i = 0; i < n; i++) { dr[0] = d; i = K.x.maxdec(K.heap, n, i, dr.byteOffset); d = dr[0]; if (i >= n) break; q = decimalsOf(v[i]); if (q < 0 || q > 9) return 0; if (q > d) d = q; } }
      else for (i = 0; i < n; i += pass ? 1 : st) { q = decimalsOf(v[i]); if (q < 0 || q > 9) return 0; if (q > d) d = q; }
      sc = Math.pow(10, d);
      if (d) {
        K = nkLoad(v, n); mem = K.x.memory; X = (K.heap + n * 40 + 512 + 7) & ~7;
        if (X + n * 8 + 229536 > mem.buffer.byteLength) mem.grow(Math.ceil((X + n * 8 + 229536 - mem.buffer.byteLength) / 65536));   // + numcolc's tables past them (nkRun reads them in place)
        if (K.x.scaleints(K.heap, n, sc, X)) { DS_INTS = new Float64Array(mem.buffer, X, n); return sc; }
      }
      if (pass === 0 && st === 1) return 0;
    }
    return 0;
  }
  // Choosing a column's layout: each candidate's compressed size is estimated, and only the winner is compressed in full. A frame of 64 KB or less is compressed exactly (that result is
  // kept); a longer one is estimated from 4 evenly spaced 16 KB slices, scaled up and capped at its raw size. When the best two estimates are within 2% of each other both are compressed in
  // full and the smaller is kept (a tie goes to the candidate tried first), so a close call is always decided exactly. Same file format; a column's pick can differ from an exact pick only
  // when the estimates were more than 2% apart yet wrong.
  // since 0.14.6: a frame that two layout candidates share (the dictionary's label bytes) is compressed once; the same frame object, level and compressor give the same bytes
  var Z_MEMO = typeof WeakMap === 'function' ? new WeakMap() : null;
  function zMemo(zs, f, level) { var m = Z_MEMO && Z_MEMO.get(f); if (m && m.zs === zs && m.lv === level) return m.c; var c = zs.compress(f, level); if (Z_MEMO) Z_MEMO.set(f, { zs: zs, lv: level, c: c }); return c; }
  function sizeOf(zs, level, fr) {
    var t = 0, z = [], exact = true, q, f, L, c, k, o, s, K = 4, sl = 16384;
    for (q = 0; q < fr.length; q++) {
      f = fr[q]; L = f.length;
      if (L <= 65536) { c = zMemo(zs, f, level); if (c.length < L) { z.push([L, c, 1]); t += c.length; } else { z.push([L, f, 0]); t += L; } }
      else { exact = false; s = new Uint8Array(K * sl); for (k = 0; k < K; k++) { o = Math.floor((L - sl) * k / (K - 1)) & ~7; s.set(f.subarray(o, o + sl), k * sl); } c = zs.compress(s, level); t += Math.min(L, Math.ceil(c.length * L / s.length)); }
    }
    return { size: t, z: exact ? z : null };
  }
  function addCand(zs, level, best, t, p, fr, n, st) {   // -> the new best (it carries the runner-up in .next)
    var e = sizeOf(zs, level, fr), c = { lv: level, t: t, p: p, fr: fr, z: e.z, size: e.size, n: n, st: st, next: null, ord: best ? best.cnt : 0, cnt: best ? best.cnt + 1 : 1 };
    if (!best) return c;
    best.cnt = c.cnt;
    if (e.size < best.size) { c.next = best; return c; }
    if (!best.next || e.size < best.next.size) best.next = c;
    return best;
  }
  function fullOf(zs, level, c) {
    var t = 0, z = [], q, f, k;
    if (c.z) return c;
    if (c.lv !== undefined) level = c.lv;
    for (q = 0; q < c.fr.length; q++) { f = c.fr[q]; k = zs.compress(f, level); if (k.length < f.length) { z.push([f.length, k, 1]); t += k.length; } else { z.push([f.length, f, 0]); t += f.length; } }
    c.z = z; c.size = t; return c;
  }
  function settle(zs, level, best) {   // the chosen candidate with its real frames
    var b = best, r, o;
    if (!b || !b.fr) return b;
    r = b.next;
    if (r && r.size <= b.size * 1.02 && (!b.z || !r.z)) { fullOf(zs, level, b); fullOf(zs, level, r); if (r.size < b.size || (r.size === b.size && r.ord < b.ord)) b = r; }
    else fullOf(zs, level, b);
    if ((b.t === 's' || b.t === 'D') && !(b.p && b.p.sh)) { b.r0 = b.fr[0]; b.dl = b.fr.dl; }   // NX A: the uncompressed values (or labels), for the block filter
    b.fr = null; b.next = null; return b;
  }
  // 'W' (since 0.11.0): a text column whose every cell is a date-time written "YYYY-MM-DDTHH:MM:SS.mmm" (f 0) or "YYYY-MM-DDTHH:MM:SS" (f 1), a real calendar date in years 1970 to 9999, no nulls. Stored as the epoch
  // milliseconds (whole numbers, the number layouts V/B/F) and rebuilt as the same text, so it reads back identical. Anything else is written as before.
  var DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function dig(x, i, k) { var r = 0, c; for (; k > 0; k--, i++) { c = x.charCodeAt(i) - 48; if (c < 0 || c > 9) return -1; r = r * 10 + c; } return r; }
  function dateParts(y, mo, d, h, mi, se, ms) {   // -> epoch ms (1970 on), or NaN if the parts are not a real date-time
    if (!(y >= 1970) || mo < 1 || mo > 12 || d < 1 || h < 0 || h > 23 || mi < 0 || mi > 59 || se < 0 || se > 59 || ms < 0) return NaN;
    if (d > DIM[mo - 1] + (mo === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 1 : 0)) return NaN;
    var yy = mo <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400, doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return (((era * 146097 + doe - 719468) * 24 + h) * 60 + mi) * 60000 + se * 1000 + ms;
  }
  // The date forms (the W column's f): bit 1 (value 1) = no fraction, bit 2 (value 2) = a space between the date and the time instead of T, bit 4 = six fraction digits stored as whole microseconds (years up to 2255); f 0 = T and .mmm, 1 = T only, 2 = space and .mmm, 3 = space only, 4 = T and .uuuuuu, 6 = space and .uuuuuu. The values are epoch milliseconds, or microseconds for 4 and 6.
  function dateW(f) { return f & 4 ? 26 : f & 1 ? 19 : 23; }
  function dateForm(len, s10) { var f = len === 19 ? 1 : len === 23 ? 0 : len === 26 ? 4 : -1; return f < 0 ? -1 : s10 === 84 ? f : s10 === 32 ? f | 2 : -1; }
  var DM_KEY = -1, DM_DAYS = 0;   // the last year-month-day seen by dateMs and its day number (a column of timestamps mostly repeats the day, so the calendar arithmetic runs once per day)
  function dateMs(x, f) {   // -> the epoch value (ms, or us for forms 4 and 6), or NaN if x is not exactly that form
    if (x.length !== dateW(f) || x.charCodeAt(4) !== 45 || x.charCodeAt(7) !== 45 || x.charCodeAt(10) !== (f & 2 ? 32 : 84) || x.charCodeAt(13) !== 58 || x.charCodeAt(16) !== 58 || (!(f & 1) && x.charCodeAt(19) !== 46)) return NaN;
    var u = f & 4, fr = 0, c, k, i;
    if (!(f & 1)) { for (k = u ? 6 : 3, i = 20; k > 0; k--, i++) { c = x.charCodeAt(i) - 48; if (c < 0 || c > 9) return NaN; fr = fr * 10 + c; } }
    var a = x.charCodeAt(0) - 48, b = x.charCodeAt(1) - 48, c2 = x.charCodeAt(2) - 48, d3 = x.charCodeAt(3) - 48, mo = (x.charCodeAt(5) - 48) * 10 + x.charCodeAt(6) - 48, dd = (x.charCodeAt(8) - 48) * 10 + x.charCodeAt(9) - 48;
    var h = (x.charCodeAt(11) - 48) * 10 + x.charCodeAt(12) - 48, mi = (x.charCodeAt(14) - 48) * 10 + x.charCodeAt(15) - 48, se = (x.charCodeAt(17) - 48) * 10 + x.charCodeAt(18) - 48;
    // every digit is checked once, together: a non-digit makes one of the 0..9 tests fail (the pairs above can hide a +/- cancel, so the digits are tested one by one)
    var q = x.charCodeAt(5) - 48, r2 = x.charCodeAt(6) - 48, s8 = x.charCodeAt(8) - 48, s9 = x.charCodeAt(9) - 48, h1 = x.charCodeAt(11) - 48, h2 = x.charCodeAt(12) - 48, m1 = x.charCodeAt(14) - 48, m2 = x.charCodeAt(15) - 48, e1 = x.charCodeAt(17) - 48, e2 = x.charCodeAt(18) - 48;
    if (a < 0 || a > 9 || b < 0 || b > 9 || c2 < 0 || c2 > 9 || d3 < 0 || d3 > 9 || q < 0 || q > 9 || r2 < 0 || r2 > 9 || s8 < 0 || s8 > 9 || s9 < 0 || s9 > 9 || h1 < 0 || h1 > 9 || h2 < 0 || h2 > 9 || m1 < 0 || m1 > 9 || m2 < 0 || m2 > 9 || e1 < 0 || e1 > 9 || e2 < 0 || e2 > 9) return NaN;
    if (h > 23 || mi > 59 || se > 59) return NaN;
    var y = a * 1000 + b * 100 + c2 * 10 + d3, key = (y * 100 + mo) * 100 + dd, days;
    if (key === DM_KEY) days = DM_DAYS;
    else {
      var t0 = dateParts(y, mo, dd, 0, 0, 0, 0); if (t0 !== t0) return NaN;
      days = t0 / 86400000; DM_KEY = key; DM_DAYS = days;
    }
    var t = ((days * 24 + h) * 60 + mi) * 60000 + se * 1000 + (u ? 0 : fr);
    if (!u) return t; t = t * 1000 + fr; return t <= 9007199254740991 ? t : NaN;
  }
  function digB(b, i, k) { var r = 0, c; for (; k > 0; k--, i++) { c = b[i] - 48; if (c < 0 || c > 9) return -1; r = r * 10 + c; } return r; }
  function dateAt(b, o, f) {   // one date-time (19, 23 or 26 bytes by the form f) at o -> the epoch value (ms, or us for forms 4 and 6), or NaN
    if (b[o + 4] !== 45 || b[o + 7] !== 45 || b[o + 10] !== (f & 2 ? 32 : 84) || b[o + 13] !== 58 || b[o + 16] !== 58 || (!(f & 1) && b[o + 19] !== 46)) return NaN;
    var u = f & 4, fr = f & 1 ? 0 : digB(b, o + 20, u ? 6 : 3); if (!(fr >= 0)) return NaN;
    var t = dateParts(digB(b, o, 4), digB(b, o + 5, 2), digB(b, o + 8, 2), digB(b, o + 11, 2), digB(b, o + 14, 2), digB(b, o + 17, 2), u ? 0 : fr);
    if (!u) return t; t = t * 1000 + fr; return t <= 9007199254740991 ? t : NaN;
  }
  // The same answer as a Set of the values, from an open-addressing table over the double's two 32-bit halves (-0 and 0 count as one value, as does NaN; 8 to 12 times faster than the Set on 100,000 dates in Node 22): a Float64Array takes the table, anything else the Set
  function dateMany(a, n) {
    var half = n >> 1, i;
    if (!(a instanceof Float64Array) || n < 64) { var h = new Set(); for (i = 0; i < n; i++) { h.add(a[i]); if (h.size > half) return true; } return false; }
    var sz = 16, tab, u, cnt = 0, lo, hi, x, q, j;
    while (sz < (half + 2) * 2) sz <<= 1;
    tab = new Int32Array(sz).fill(-1); u = new Uint32Array(a.buffer, a.byteOffset, n * 2);
    for (i = 0; i < n; i++) {
      x = a[i]; if (x === 0) { lo = 0; hi = 0; } else if (x !== x) { lo = 0; hi = 2146959360; } else { lo = u[2 * i]; hi = u[2 * i + 1]; }
      q = Math.imul(lo, 0x9E3779B1) ^ Math.imul(hi, 0x85EBCA77); q = (q ^ (q >>> 15)) & (sz - 1);
      for (;;) { j = tab[q]; if (j < 0) { tab[q] = i; if (++cnt > half) return true; break; } if (x === a[j] || (x !== x && a[j] !== a[j])) break; q = (q + 1) & (sz - 1); }
    }
    return false;
  }   // more than n / 2 distinct values: fewer would be written as a dictionary
  function dateNumsB(b, n) {   // b: n values joined by 0 bytes (ASCII), more than n / 2 distinct (the caller knows) -> { f, a } or null
    if (n < 2) return null;
    var f = b.length === n * 20 - 1 ? 1 : b.length === n * 24 - 1 ? 0 : b.length === n * 27 - 1 ? 4 : -1, w, a, i, o, t; if (f < 0 || (b[10] !== 84 && b[10] !== 32)) return null; if (b[10] === 32) f |= 2; w = dateW(f) + 1;
    a = new Float64Array(n);
    for (i = 0, o = 0; i < n; i++, o += w) { if (i < n - 1 && b[o + w - 1] !== 0) return null; t = dateAt(b, o, f); if (!(t >= 0)) return null; a[i] = t; }
    return { f: f, a: a };
  }
  function dateNumsBC(B, S, E, a0, n) {   // a text column as bytes plus offsets -> { f, a } or null (also null when fewer than n / 2 + 1 values differ)
    if (n < 2) return null;
    var f = dateForm(E[a0] - S[a0], B[S[a0] + 10]), w = dateW(f), arr = new Float64Array(n), i, t; if (f < 0) return null;
    if (n >= 1024) {   // B72: three windows (start, middle, end) of 256 values; when each holds at most 60% distinct values the column cannot pass the more-than-half rule worth taking, so the full parse is skipped (a column of 15 distinct dates cost +51% to refuse, a 46% distinct one +54%)
      var wi, wo, wj, ws, lo = [0, (n >> 1) - 128, n - 256], dist = 0, sd;
      for (wi = 0; wi < 3; wi++) { wo = lo[wi]; sd = new Set(); for (wj = 0; wj < 256; wj++) { if (E[a0 + wo + wj] - S[a0 + wo + wj] !== w) return null; ws = dateAt(B, S[a0 + wo + wj], f); if (!(ws >= 0)) return null; sd.add(ws); } if (sd.size * 5 > 256 * 3) dist = 1; }
      if (!dist) return null;
    }
    for (i = 0; i < n; i++) { if (E[a0 + i] - S[a0 + i] !== w) return null; t = dateAt(B, S[a0 + i], f); if (!(t >= 0)) return null; arr[i] = t; }
    return dateMany(arr, n) ? { f: f, a: arr } : null;
  }
  function p2(v) { return v < 10 ? '0' + v : '' + v; }
  function dateText(t, f) {
    var ms = t % 1000, s = (t - ms) / 1000, sec = s % 60, m = (s - sec) / 60, min = m % 60, hq = (m - min) / 60, h = hq % 24, z = (hq - h) / 24 + 719468, era = Math.floor(z / 146097), doe = z - era * 146097,
      yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365), y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153),
      d = doy - Math.floor((153 * mp + 2) / 5) + 1, mo = mp < 10 ? mp + 3 : mp - 9; if (mo <= 2) y++;
    return y + '-' + p2(mo) + '-' + p2(d) + 'T' + p2(h) + ':' + p2(min) + ':' + p2(sec) + (f ? '' : '.' + (ms < 10 ? '00' : ms < 100 ? '0' : '') + ms);
  }
  var P2 = new Uint8Array(200); for (var pi = 0; pi < 100; pi++) { P2[pi * 2] = 48 + ((pi / 10) | 0); P2[pi * 2 + 1] = 48 + (pi % 10); }
  function dateCol(nums, n, f, raw) {   // the text of n epoch-millisecond values: the digits go into one byte buffer (the calendar day is worked out once per day), decoded and cut once
    var sc = f & 8 ? (f & 4 ? 1e6 : 1000) : 1; f &= 7;   // form bit 8 (since 0.12.3): the stored numbers are whole seconds, the text needs them times 1,000 (times 1,000,000 for the six-digit forms)
    if (f !== 0 && f !== 1 && f !== 2 && f !== 3 && f !== 4 && f !== 6) throw new Error('damaged block: unknown date form');
    var X = BD_DEC && n >= 512 ? bdx() : null;
    if (X && X.datefmt) {   // the digits are written in WebAssembly (bdec.wasm, datefmt); a value outside the date range makes it stop and the JavaScript loop below refuses the block
      var ww = dateW(f) + 1, L = bdLay([n * 8, n * ww]), mem = bdMem(L.end), put = new Float64Array(mem, L.at[0], n), ii;
      for (ii = 0; ii < n; ii++) put[ii] = nums[ii] * sc;
      if (X.datefmt(L.at[0], n, f, L.at[1]) === 0) return raw ? { b: new Uint8Array(X.memory.buffer, L.at[1], n * ww - 1).slice(), w: ww } : tdr.decode(new Uint8Array(X.memory.buffer, L.at[1], n * ww - 1)).split('\0');
    }
    var w = dateW(f), u = f & 4, us = 0, buf = new Uint8Array(n * (w + 1)), o = 0, i, t, day, lastDay = -1, rem, ms, sod, hh, mm, ss, x, y = 0, mo = 0, d = 0, ymd0 = 0, ymd1 = 0, ymd2 = 0, ymd3 = 0, ymd5 = 0, ymd6 = 0, ymd8 = 0, ymd9 = 0;
    for (i = 0; i < n; i++, o += w + 1) {
      t = nums[i] * sc; if (!(t >= 0 && t <= (u ? 9007199254740991 : 253402300799999) && t % 1 === 0)) throw new Error('damaged block: date out of range');
      if (u) { us = t % 1000; t = (t - us) / 1000; }
      day = Math.floor(t / 86400000);
      if (day !== lastDay) { lastDay = day; var z = day + 719468, era = Math.floor(z / 146097), doe = z - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365), doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
        y = yoe + era * 400; d = doy - Math.floor((153 * mp + 2) / 5) + 1; mo = mp < 10 ? mp + 3 : mp - 9; if (mo <= 2) y++;
        ymd0 = 48 + ((y / 1000) | 0); ymd1 = 48 + (((y / 100) | 0) % 10); ymd2 = 48 + (((y / 10) | 0) % 10); ymd3 = 48 + (y % 10); ymd5 = 48 + ((mo / 10) | 0); ymd6 = 48 + (mo % 10); ymd8 = 48 + ((d / 10) | 0); ymd9 = 48 + (d % 10); }
      buf[o] = ymd0; buf[o + 1] = ymd1; buf[o + 2] = ymd2; buf[o + 3] = ymd3; buf[o + 4] = 45; buf[o + 5] = ymd5; buf[o + 6] = ymd6; buf[o + 7] = 45; buf[o + 8] = ymd8; buf[o + 9] = ymd9; rem = (t - day * 86400000) | 0; ms = rem % 1000; sod = (rem - ms) / 1000; hh = (sod / 3600) | 0; mm = ((sod - hh * 3600) / 60) | 0; ss = sod - hh * 3600 - mm * 60;
      buf[o + 10] = f & 2 ? 32 : 84; buf[o + 11] = P2[hh * 2]; buf[o + 12] = P2[hh * 2 + 1]; buf[o + 13] = 58; buf[o + 14] = P2[mm * 2]; buf[o + 15] = P2[mm * 2 + 1]; buf[o + 16] = 58; buf[o + 17] = P2[ss * 2]; buf[o + 18] = P2[ss * 2 + 1];
      if (!(f & 1)) { x = (ms / 100) | 0; ms -= x * 100; buf[o + 19] = 46; buf[o + 20] = 48 + x; buf[o + 21] = P2[ms * 2]; buf[o + 22] = P2[ms * 2 + 1]; if (u) { x = (us / 100) | 0; us -= x * 100; buf[o + 23] = 48 + x; buf[o + 24] = P2[us * 2]; buf[o + 25] = P2[us * 2 + 1]; } }
      buf[o + w] = 0;
    }
    return raw ? { b: buf.slice(0, o - 1), w: w + 1 } : n ? tdr.decode(buf.subarray(0, o - 1)).split('\0') : [];
  }
  var DATES_LOG = null;   // while a read asks for dates: 'numbers', the date columns it decoded as { a: Float64Array, f: form }
  function setDatesLog(l) { var o = DATES_LOG; DATES_LOG = l; return o; }
  // text: 'bytes' (since 0.14.0): plain text columns come back as { bytes, start, end } and dictionary columns as { kind: 'dict', labels: { bytes, start, end }, ids }, the shapes packBlock takes, with no JavaScript string built per value; other text layouts (templates, hex, dates as text, columns with empty cells stored as nulls) still come back as strings; dictionary columns that use a shared label table share one read-only labels object
  var TEXT_BYTES = false;
  function setTextBytes(v) { var o = TEXT_BYTES; TEXT_BYTES = v; return o; }
  function cutNul(u, n) {   // u: n values joined by 0 bytes -> { bytes (a copy), start, end }
    var b = u.slice(), start, end, pos = 0, i, k, len = b.length, K, X, p, bp, sp, ep, buf, c;
    if (n > 1 && len >= 8192 && hasSimd()) {   // since 0.14.9: one 16-byte-at-a-time pass in wasm (nulpos in flatscan.c) finds every cut, about 5 times faster than one indexOf per value
      try {
        K = sdw(); X = K.x; p = K.heap; bp = p; p = (p + len + 31) & ~15; sp = p; p = (p + n * 4 + 15) & ~15; ep = p; p = (p + n * 4 + 15) & ~15;
        if (X.nulpos && p <= 1610612736) {
          if (p > X.memory.buffer.byteLength) X.memory.grow(Math.ceil((p - X.memory.buffer.byteLength) / 65536));
          buf = X.memory.buffer; new Uint8Array(buf, bp, len).set(b); c = X.nulpos(bp, len, sp, ep, n - 1);
          if (c < n - 1) throw new Error('damaged block: text column cut off');
          start = new Int32Array(buf, sp, n).slice(); end = new Int32Array(buf, ep, n).slice(); start[0] = 0; end[n - 1] = len;
          return { bytes: b, start: start, end: end };
        }
      } catch (e) { if (e && /damaged block/.test(e.message)) throw e; }
    }
    start = new Int32Array(n); end = new Int32Array(n);
    for (i = 0; i < n; i++) { k = i === n - 1 ? len : b.indexOf(0, pos); if (k < 0) throw new Error('damaged block: text column cut off'); start[i] = pos; end[i] = k; pos = k + 1; }
    return { bytes: b, start: start, end: end };
  }
  function dictBytes(frames, n, p) {
    var u = frames[0], nl = 1, k, ids, lb;
    if (p.sh) { lb = labBytesOf(p.sh); nl = lb.start.length; } else { k = u.indexOf(0); while (k >= 0) { nl++; k = u.indexOf(0, k + 1); } lb = cutNul(u, nl); }
    ids = p.w ? bitunpack(frames[1], n, p.w) : p.wide ? new Uint16Array(frames[1].buffer.slice(frames[1].byteOffset, frames[1].byteOffset + n * 2)) : frames[1].slice(0, n);
    if (ids instanceof Uint32Array) ids = new Int32Array(ids.buffer);
    for (k = 0; k < n; k++) if (ids[k] >= nl) throw new Error('damaged block: dictionary code out of range');
    return { kind: 'dict', labels: lb, ids: ids };
  }
  function dateFmt(f) { return 'YYYY-MM-DD' + (f & 2 ? ' ' : 'T') + 'HH:MM:SS' + (f & 1 ? '' : f & 4 ? '.ffffff' : '.fff'); }
  function dateNums(v, n) {   // -> { f, a } or null
    if (n < 2 || typeof v[0] !== 'string') return null;
    var f = dateForm(v[0].length, v[0].charCodeAt(10)), a = new Float64Array(n), i, t; if (f < 0) return null;
    for (i = 0; i < n; i++) { if (typeof v[i] !== 'string') return null; t = dateMs(v[i], f); if (!(t >= 0)) return null; a[i] = t; }
    return dateMany(a, n) ? { f: f, a: a } : null;
  }
  // since 0.15.0: while a column summary is being made, every number and date column the writer reads leaves its part here per block (SUMCAP.cols[key][first row], blockStats), so the summary needs no pass of its own
  var SUMCAP = null, SUMA = 0;
  function sumCapDates(key, a, f) { var e = blockStats(a, a.length, SUMA, SUMCAP.R); e.u = f & 4; capPut(SUMCAP, key, e); }   // six-digit forms hold microseconds (scaled when merged)
  var WMARK = 0, W3MARK = 0;   // count the date columns written (WMARK), and those in a space-separated or six-digit form (W3MARK), so a pack call can tell whether its file needs format minor 2 or 3
  function dateWrap(dn, zs, level, key) {   // the date numbers as the best number layout, as one 'W' column; null if the number layouts did not get a typed column
    var a = dn.a, nn = a.length, D = dn.f & 4 ? 1e6 : 1000, i, f = dn.f, b;
    if (SUMCAP && typeof key === 'string') sumCapDates(key, a, f);
    for (i = 0; i < nn && a[i] % D === 0; i++);
    if (i === nn && nn > 0) { b = new Float64Array(nn); for (i = 0; i < nn; i++) b[i] = a[i] / D; a = b; f |= 8; }   // every value a whole number of seconds (taxi timestamps, plain YYYY-MM-DDTHH:MM:SS): store seconds, 4 bytes where the text form needs 8
    var wi = settle(zs, level, encodeColumn0(a, zs, level, 0, undefined, key, { nz: 0, ai: 1 }));
    if (!wi || !(wi.t === 'V' || wi.t === 'B' || wi.t === 'F')) return null;
    WMARK++; if (f >= 2) W3MARK++; return { t: 'W', p: { t: wi.t, p: wi.p, f: f }, n: wi.n, z: wi.z, size: wi.size, st: wi.st };
  }
  function encodeColumn(v, zs, level, tmode, sj, key) {
    var nb = nullBest(v, zs, level, tmode, key); if (nb) return nb;
    if (DATE_MODE) { var dn = dateNums(v, v.length), w = dn && dateWrap(dn, zs, level, key); if (w) return w; }
    return settle(zs, level, encodeColumn0(v, zs, level, tmode, sj, key));
  }
  var DATE_MODE = !(typeof globalThis !== 'undefined' && globalThis.__NODATE);
  // research prototype (null plane, type N): a column whose values are one scalar kind plus some nulls keeps the typed encoding of its non-null values, plus one bit plane that marks the nulls
  var NMARK = 0;   // counts the null-plane (N) columns written, so a pack call can tell whether its file needs format minor 1
  var NULL_MODE = (typeof globalThis !== 'undefined' && globalThis.__NULLMODE) || 'plane';
  // B13 fused pass: a column of numbers and nulls in one scan: the null bit plane, the numbers in a Float64Array, and what the number encoder would otherwise scan for (negative zero, whole numbers). undefined: some value is not a number or null, or there is no null or no number
  var NN_FLAGS = [0, 0];
  function nullNumbers(v, n) {
    var nn = new Float64Array(n), pl = new Uint8Array((n + 7) >> 3), m = 0, i, x, nz = 0, ai = 1;
    for (i = 0; i < n; i++) {
      x = v[i];
      if (x === null) pl[i >> 3] |= 1 << (i & 7);
      else if (typeof x === 'number') { nn[m++] = x; if (ai && !(x % 1 === 0 && x < 1125899906842624 && x > -1125899906842624)) ai = 0; if (x === 0 && 1 / x < 0) nz = 1; }
      else return undefined;
    }
    if (m === 0 || m === n) return undefined;
    NN_FLAGS[0] = nz; NN_FLAGS[1] = ai;
    return { nn: nn.subarray(0, m), pl: pl, m: m, nz: nz, ai: ai };
  }
  function nullNumBest(fz, v, n, zs, level, tmode, key) {
    var inner = settle(zs, level, encodeColumn0(fz.nn, zs, level, tmode, undefined, key, fz));
    if (inner.t === 'j') return null;
    var pl = fz.pl, pz = zs.compress(pl, level), pzz = pz.length < pl.length ? [pl.length, pz, 1] : [pl.length, pl, 0], size = pzz[1].length, i;
    for (i = 0; i < inner.z.length; i++) size += inner.z[i][1].length;
    if (NULL_MODE === 'both') { var j = settle(zs, level, encodeColumn0(v, zs, level, tmode, undefined, key)); if (j.size <= size) return j; }
    NMARK++; return { t: 'N', p: { t: inner.t, p: inner.p, m: fz.m }, n: n, z: [pzz].concat(inner.z), size: size, nn: fz.nn, r0: inner.r0, dl: inner.dl };
  }
  function nullBest(v, zs, level, tmode, key) {
    var n = v.length, i, x, k = null, m = 0, kind;
    if (NULL_MODE === 'off') return null;
    if (n > 1 && typeof v === 'object' && v[0] !== undefined) { var fz = nullNumbers(v, n); if (fz !== undefined) return nullNumBest(fz, v, n, zs, level, tmode, key); }
    for (i = 0; i < n; i++) { x = v[i]; if (x === null) continue; kind = typeof x; if (kind !== 'number' && kind !== 'boolean' && kind !== 'string') return null; if (k === null) k = kind; else if (k !== kind) return null; m++; }
    if (k === null || m === n) return null;
    var nn = new Array(m), pl = new Uint8Array((n + 7) >> 3); for (i = 0, m = 0; i < n; i++) { if (v[i] === null) pl[i >> 3] |= 1 << (i & 7); else nn[m++] = v[i]; }
    var inner = settle(zs, level, encodeColumn0(nn, zs, level, tmode, undefined, key));
    if (inner.t === 'j') return null;
    var pz = zs.compress(pl, level), pzz = pz.length < pl.length ? [pl.length, pz, 1] : [pl.length, pl, 0];
    var size = pzz[1].length; for (i = 0; i < inner.z.length; i++) size += inner.z[i][1].length;
    if (NULL_MODE === 'both') { var j = settle(zs, level, encodeColumn0(v, zs, level, tmode, undefined, key)); if (j.size <= size) return j; }
    NMARK++; return { t: 'N', p: { t: inner.t, p: inner.p, m: m }, n: n, z: [pzz].concat(inner.z), size: size, nn: nn, r0: inner.r0, dl: inner.dl };
  }
  // the V and B candidates of a number column held as scaled whole numbers (base), by the general writer's rules: the delta form only when its varints are not clearly longer (5%), the bit-packed form when the range is under 2^24
  function numGeneral(cand, bestOf, base, n, scale) {
    if (n >= NK_MIN) { var R = nkRun(base, n, 0, NKD.want && !NKD.res ? scale : 0, true), a = R.a, dd = R.d, bb = R.b, mn0 = R.mn, w0 = R.w;
      if (a) cand('V', { mono: R.mono, scale: scale }, [a]);
      if (dd) cand('V', { mono: false, scale: scale, delta: true }, [dd]);
      if (bb) cand('B', { mn: mn0, w: w0, scale: scale }, [bb]);
      nkKeep(bestOf(), (a || dd || bb || {}).buffer); return; }
    numStats(base, n, NST); var mono = NST[0] === 1, mn = NST[1], mx = NST[2], d = numFirst(base, n, mono), dz2 = null, sa = 0, sb = 0;
    if (!mono && n > 1) { dz2 = numDeltaZz(base, n); sa = vlenSum(d, n); sb = vlenSum(dz2, n); }
    if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, n)]);
    if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, n)]);
    if (mx - mn < 16777216) { var w = Math.max(1, 32 - Math.clz32(mx - mn)); cand('B', { mn: mn, w: w, scale: scale }, [bitpack(numOff(base, n, mn), w)]); }
  }
  function encodeColumn0(v, zs, level, tmode, sj, key, pre) {   // tmode: 0 off, 1 auto (read-time checked), 2 size only; sj (fast flat writer): an ASCII string column of more than n / 2 distinct values, its values joined by 0 bytes; key: the column's key, for the once-per-call template read check
    var n = v.length, i, x, best = null;
    function stored(frames) { var t = 0, z = []; for (var q = 0; q < frames.length; q++) { var c = zs.compress(frames[q], level); if (c.length < frames[q].length) z.push([frames[q].length, c, 1]); else z.push([frames[q].length, frames[q], 0]); t += z[q][1].length; } return { z: z, size: t }; }
    function cand(t, p, frames, st) { best = addCand(zs, level, best, t, p, frames, n, st); }
    if (pre || allOf(v, function (x) { return typeof x === 'number'; })) {
      var noNegZero = pre ? !pre.nz : allOf(v, function (x) { return !(x === 0 && 1 / x < 0); });
      var allInt = noNegZero && (pre ? !!pre.ai : allOf(v, function (x) { return Number.isInteger(x) && Math.abs(x) < 9007199254740992 / 8; })), scale = 1, base = null;
      if (!noNegZero) base = null; else if (allInt) base = v; else { scale = decimalScaleW(v); base = scale ? DS_INTS : null; DS_INTS = null; if (!base) { scale = 1; base = null; } }
      if (base && n > 0) {   // scaled whole numbers: the typed-array passes the fast writer uses (same candidates, same rules, same bytes)
        numGeneral(cand, function () { return best; }, base instanceof Float64Array ? base : new Float64Array(base), n, scale);
        if (n >= NK_MIN) { NKZ.v = v; NKZ.mn = NKR.mn / scale; NKZ.mx = NKR.mx / scale; }
      } else if (base) {
        var mono = base.length === 0 || base[0] >= 0, mn = Infinity, mx = -Infinity;
        for (i = 0; i < n; i++) { if (i && base[i] < base[i - 1]) mono = false; if (base[i] < mn) mn = base[i]; if (base[i] > mx) mx = base[i]; }
        var d = base.slice(); if (mono) for (i = n - 1; i > 0; i--) d[i] -= d[i - 1]; else for (i = 0; i < n; i++) d[i] = zz(d[i]);
        var dl2 = null, sa = 0, sb = 0;
        if (!mono && n > 1) { dl2 = new Array(n); dl2[0] = zz(base[0]); for (i = 1; i < n; i++) dl2[i] = zz(base[i] - base[i - 1]); for (i = 0; i < n; i++) { sa += vlen(d[i]); sb += vlen(dl2[i]); } }
        if (B18_ALLV || !dl2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varints(d)]);   // only the variant whose varints are not clearly longer is compressed
        if (dl2 && (B18_ALLV || sb <= sa * 1.05)) cand('V', { mono: false, scale: scale, delta: true }, [varints(dl2)]);   // differences between neighbors: slowly changing values (sensors, prices, coordinates) cost far less than their absolute values
        if (mx - mn < 16777216) { var w = Math.max(1, 32 - Math.clz32(mx - mn)), off = new Array(n); for (i = 0; i < n; i++) off[i] = base[i] - mn; cand('B', { mn: mn, w: w, scale: scale }, [bitpack(off, w)]); }
      }
      if (!best || best.size > n * 4) { var f = new Float64Array(v); cand('F', {}, [new Uint8Array(f.buffer)]); }   // raw doubles are only tried when the scaled whole numbers did not already get under half of their size
      return best;
    }
    if (n && allOf(v, function (x) { return typeof x === 'boolean'; })) { var bb = new Array(n); for (i = 0; i < n; i++) bb[i] = v[i] ? 1 : 0; cand('T', {}, [bitpack(bb, 1)]); return best; }
    if (n && allOf(v, function (x) { return typeof x === 'string'; })) {
      var L = v[0].length, raw, p = 0, j;
      if (L >= 16 && L % 2 === 0 && (raw = hexRaw(v, n, L))) { cand('H', { L: L }, [raw]); return best; }   // B45: one pass checks and packs (was a regex pass, then a packing pass)
      if (L === 36 && allOf(v, function (x) { return RX_UUID.test(x); })) {
        raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < 36; j += 2) { if (j === 8 || j === 13 || j === 18 || j === 23) j++; raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); } }
        cand('U', {}, [raw]); return best;
      }
      if ((raw = ipRaw(v, n))) {   // B45: one character pass checks (as RX_IP with parts under 256) and packs
        cand('I', {}, [raw]); return best;
      }
      var map, labels = [], codes, c, tp = n >= 16 && tmode && !(tmode === 1 && tmplSlow), cap = tp ? 2 : 4, jn = null, nD, labB = null, r59 = null, sd = 0;   // B45: when the template layout cannot be tried, the count can stop at n / 4 (all the dictionary test needs)
      if (FAST_ON && FLT !== null) level = FLT;   // fast: text frames at a faster zstd level
      if (!sj && FAST_ON && FSK && n >= 4096 && manyDistinct(v)) sj = STR_ASCII ? strAscii(v, n) : null, sj = sj || (function () { var j = strJoinOk(v, n); return j === null ? null : te.encode(j); })(), sj = sj || undefined;   // fast: a column whose first 1,024 values are nearly all different skips the dictionary count (the plain layout, as the fast flat writer does)
      if (sj) nD = (n >> 1) + 1;   // where the loop below would stop
      else if (B59 && B62 && n >= 4096 && (sd = someDistinct(v)) > 128 && sd < B62 && (codes = new Array(n), (nD = hxBig(v, n, cap, labels, codes)) >= 0)) { }   // B62 (Firefox): many, but not nearly all, distinct values: a JS table hashed on every char of a short value
      else if (B59 && n >= 4096 && (sd || (sd = someDistinct(v))) > 128 && (r59 = sdzCol(v, n, cap))) { nD = r59.D; codes = r59.codes; labB = r59.lab; jn = r59.all; }   // B59 (Firefox): the count, codes and bytes from wasm (a Map of strings costs about 5x Chromium's there)
      else if (B59 && sd > 0 && sd <= 128 && (codes = hxCodes(n), (nD = hxCount(v, n, cap, labels, codes)) >= 0)) { }   // B60
      else { labels.length = 0; map = new Map(); codes = new Array(n); for (i = 0; i < n; i++) { c = map.get(v[i]); if (c === undefined) { if (labels.length * cap > n) break; c = labels.length; map.set(v[i], c); labels.push(v[i]); } codes[i] = c; } nD = labels.length; }   // past n / 2 distinct values the column is neither a dictionary nor sharing templates cheaply, and the full count is not needed
      // B45: the check (no 0 char, well formed) runs once on one join: of every value when the plain layout is next, or of the distinct values only when the loop above saw them all (a dictionary), which is the same test
      var sOk = !!sj || !!r59; if (!sOk) { if (nD * 4 > n || nD >= 65536) { jn = STR_ASCII ? strAscii(v, n) : null; if (jn === null) { jn = strJoinOk(v, n); if (jn !== null) jn = te.encode(jn); } sOk = jn !== null; } else sOk = strJoinOk(labels, nD) !== null; }
      if (sOk) {   // sj: ASCII without 0 bytes, so well formed
        if (nD * 4 > n || nD >= 65536) cand('s', {}, dlOf([sj || jn], nD));   // a dictionary this small is the smaller layout; skip compressing the plain one as well
        // once the read check has failed (auto mode) the template layout can no longer win, so it is not built
        if (n >= 16 && nD * 2 > n && tmode && !(tmode === 1 && tmplSlow) && (tmode === 2 || templatesPlausible(v))) { var tf = tplBytes(sj || jn, n); if (tf === undefined) tf = templateFrames(v); if (tf) { var sv = stored(tf.frames); if (B57B && sv.size < best.size * 0.8 && (tmode === 2 || templatesReadOk(v, key))) best = { t: 'L', p: {}, z: sv.z, size: sv.size, n: n }; else { best = settle(zs, level, best); var before = best.size; if (sv.size < before * 0.95 && (tmode === 2 || templatesReadOk(v, key))) best = { t: 'L', p: {}, z: sv.z, size: sv.size, n: n }; } } }   // B57b: templates under 0.8 of the plain layout's sampled size win without compressing the plain layout in full
        if (nD * 4 <= n && nD < 65536) {
          var wd = Math.max(1, 32 - Math.clz32(nD - 1)), cb = nD > 256 ? new Uint8Array(new Uint16Array(codes).buffer) : new Uint8Array(codes);
          if (!labB) labB = te.encode(labels.join('\0'));
          cand('D', { w: 0, wide: nD > 256 }, [labB, cb], { distinct: nD });
          cand('D', { w: wd, wide: false }, [labB, bitpack(codes, wd)], { distinct: nD });
        }
        return best;
      }
    }
    if (n && allOf(v, isIdList)) {   // link lists: each value is an array of whole numbers 0..2^32-1; lengths, then deltas (zigzag when some list is not ascending)
      var ln = new Array(n), tot = 0, asc = true, a, q;
      for (i = 0; i < n; i++) { a = v[i]; ln[i] = a.length; tot += a.length; for (q = 1; q < a.length; q++) if (a[q] < a[q - 1]) asc = false; }
      var dl = new Array(tot), w = 0, pv;
      for (i = 0; i < n; i++) { a = v[i]; pv = 0; for (q = 0; q < a.length; q++) { dl[w++] = asc ? a[q] - pv : zz(a[q] - pv); pv = a[q]; } }
      cand('A', { m: tot, asc: asc }, [varints(ln), varints(dl)]);
    }
    if (best && best.t === 'A') return best;   // lists of whole numbers: the list encoding wins over JSON text in every case measured, so the text candidate is not built
    var nulls = 0; for (i = 0; i < n; i++) if (v[i] === null) nulls++;
    if (nulls === n && n) { var nb5 = new Uint8Array(n * 5 - 1); for (i = 0; i < nb5.length; i += 5) { nb5[i] = 110; nb5[i + 1] = 117; nb5[i + 2] = 108; nb5[i + 3] = 108; if (i + 4 < nb5.length) nb5[i + 4] = 10; } cand('j', {}, [nb5], { nulls: nulls }); return best; }   // B21b: all null, "null" lines filled as bytes
    cand('j', {}, [te.encode(v.map(jsonText).join('\n'))], nulls ? { nulls: nulls } : undefined);
    return best;
  }
  // whole numbers that fit 32 bits are handed out as Int32Array: reading one gives a small integer (no heap number), which makes the row objects lighter and the garbage collector's job smaller
  function narrow(u) {
    var n = u.length, o = new Int32Array(n), i, x;
    for (i = 0; i < n; i++) { x = u[i]; if (x > 2147483647 || x < -2147483648) return u; o[i] = x; }
    return o;
  }
  // which engine runs the list builders above; the output is the same either way, only the speed differs
  var V8 = (typeof process === 'object' && process !== null && !!process.versions && !!process.versions.v8) || (typeof navigator === 'object' && navigator !== null && /Chrome\//.test(navigator.userAgent));
  // Firefox (Gecko) only: joining four short pieces makes one flat string there (no rope), and that beats writing the digits and cutting them out of one decoded text (cloud Firefox 158, 300,000 log rows: unpack 0.87 of the time). Chromium keeps ipColV8; WebKitGTK, whose joins make ropes, keeps ipCol
  var GECKO = !V8 && typeof navigator === 'object' && navigator !== null && /Firefox\//.test(navigator.userAgent);
  // ascending id lists for Firefox and WebKitGTK: array literals for 1 to 4 items (packed arrays, no growth), a push loop beyond. Kept out of decodeColumn on purpose: adding it inline slowed the plain fill that V8 uses
  function ascLit(o, al, av, n) {
    var i, an, aa, ac, aj, a3, ap = 0;
    for (i = 0; i < n; i++) {
      an = al[i];
      if (an === 1) o[i] = [av[ap++]];
      else if (an === 2) { ac = av[ap++]; o[i] = [ac, ac += av[ap++]]; }
      else if (an === 3) { ac = av[ap++]; aj = ac + av[ap++]; o[i] = [ac, aj, aj + av[ap++]]; }
      else if (an === 4) { ac = av[ap++]; aj = ac + av[ap++]; a3 = aj + av[ap++]; o[i] = [ac, aj, a3, a3 + av[ap++]]; }
      else { aa = []; ac = 0; for (aj = 0; aj < an; aj++) { ac += av[ap++]; aa.push(ac); } o[i] = aa; }
    }
    return o;
  }
  // the same for lists that are not ascending (zigzag deltas)
  function zzLit(o, al, av, n) {
    var i, an, aa, ac, aj, a3, ap = 0;
    for (i = 0; i < n; i++) {
      an = al[i];
      if (an === 1) o[i] = [unzz(av[ap++])];
      else if (an === 2) { ac = unzz(av[ap++]); o[i] = [ac, ac += unzz(av[ap++])]; }
      else if (an === 3) { ac = unzz(av[ap++]); aj = ac + unzz(av[ap++]); o[i] = [ac, aj, aj + unzz(av[ap++])]; }
      else if (an === 4) { ac = unzz(av[ap++]); aj = ac + unzz(av[ap++]); a3 = aj + unzz(av[ap++]); o[i] = [ac, aj, a3, a3 + unzz(av[ap++])]; }
      else { aa = []; ac = 0; for (aj = 0; aj < an; aj++) { ac += unzz(av[ap++]); aa.push(ac); } o[i] = aa; }
    }
    return o;
  }
  // each column kind is read by its own small function (keep it that way): with all the loops inside decodeColumn, every hot loop made Chromium rebuild fast code for the whole big function on the first open of a page (a hex id column took 88 ms on that open, 7 ms later; 100,000 log rows opened in 0.66 of the time once split). The hex column also writes two letters per step through HEX2.
  function hexCol(r, n, L) { var bl = L / 2, L2 = L, i, o, hb = new Uint16Array(n * bl), big; for (i = 0; i < n * bl; i++) hb[i] = HEX2[r[i]]; big = tlat.decode(hb); o = new Array(n); for (i = 0; i < n; i++) o[i] = big.substring(i * L2, i * L2 + L2); return o; }
  function uuidCol(frames0, n) { var i, o, ur = frames0, ub = new Uint8Array(n * 36), up = 0, uq, uv; for (i = 0; i < n; i++) { for (uq = 0; uq < 16; uq++) { uv = ur[i * 16 + uq]; ub[up++] = HEXA[uv >> 4]; ub[up++] = HEXA[uv & 15]; if (uq === 3 || uq === 5 || uq === 7 || uq === 9) ub[up++] = 45; } } var ubig = tlat.decode(ub); o = new Array(n); for (i = 0; i < n; i++) o[i] = ubig.substring(i * 36, i * 36 + 36); return o; }
  // Chromium (V8) only: each byte's digits come from a 256-entry table, three bytes copied and the length added (cloud Chromium 155, 300,000 log rows: with the column-at-a-time dense read below, unpack took 0.93 of the time; Firefox was no faster, so it keeps the digit math)
  var IPD = new Uint8Array(1024); (function () { for (var v = 0; v < 256; v++) { var s = String(v); IPD[v * 4] = s.length; for (var k = 0; k < s.length; k++) IPD[v * 4 + 1 + k] = s.charCodeAt(k); } })();
  function ipColV8(frames0, n) { var i, o, ir = frames0, ib = new Uint8Array(n * 16), ip = 0, io = new Uint32Array(n + 1), iq, iv; for (i = 0; i < n; i++) { io[i] = ip; for (iq = 0; iq < 4; iq++) { iv = ir[4 * i + iq] << 2; ib[ip] = IPD[iv + 1]; ib[ip + 1] = IPD[iv + 2]; ib[ip + 2] = IPD[iv + 3]; ip += IPD[iv]; ib[ip++] = 46; } ip--; } io[n] = ip; var ibig = tlat.decode(ib.subarray(0, ip)); o = new Array(n); for (i = 0; i < n; i++) o[i] = ibig.substring(io[i], io[i + 1]); return o; }
  function ipCol(frames0, n) { var i, o, ir = frames0, ib = new Uint8Array(n * 15), ip = 0, io = new Uint32Array(n + 1), iq, iv; for (i = 0; i < n; i++) { io[i] = ip; for (iq = 0; iq < 4; iq++) { iv = ir[4 * i + iq]; if (iv >= 100) { ib[ip++] = 48 + ((iv / 100) | 0); ib[ip++] = 48 + (((iv / 10) | 0) % 10); ib[ip++] = 48 + iv % 10; } else if (iv >= 10) { ib[ip++] = 48 + ((iv / 10) | 0); ib[ip++] = 48 + iv % 10; } else ib[ip++] = 48 + iv; if (iq < 3) ib[ip++] = 46; } } io[n] = ip; var ibig = tlat.decode(ib.subarray(0, ip)); o = new Array(n); for (i = 0; i < n; i++) o[i] = ibig.substring(io[i], io[i + 1]); return o; }
  function colZZ(b, n, sc) { var out = new Float64Array(n), p = 0, i, c, u, m;
    for (i = 0; i < n; i++) { c = b[p++];
      if (c < 128) { out[i] = ((c >>> 1) ^ -(c & 1)) / sc; continue; }
      u = c & 127; c = b[p++]; if (c < 128) { u += c << 7; out[i] = ((u >>> 1) ^ -(u & 1)) / sc; continue; }
      u += (c & 127) << 7; c = b[p++]; if (c < 128) { u += c << 14; out[i] = ((u >>> 1) ^ -(u & 1)) / sc; continue; }
      u += (c & 127) << 14; m = 2097152; do { c = b[p++]; u += (c & 127) * m; m *= 128; } while (c & 128); out[i] = unzz(u) / sc; }
    return out; }
  // since 0.26.9: a long varint column decoded in bdec.wasm (decV: the same doubles, about 4x quicker than the JS loop); damaged bytes fall back to the JS path below, which reports them
  function colVw(b, n, p) { var X = n >= 4096 ? bdx() : null; if (!X || !X.decV) return null; var w = p.scale === 1, L = bdLay(w ? [b.length, n * 8, n * 4] : [b.length, n * 8]), buf = bdMem(L.end); bdPut(new Uint8Array(buf), L.at[0], b);
    var r = X.decV(L.at[0], b.length, n, p.mono ? 1 : p.delta ? 2 : 0, p.scale, L.at[1], w ? L.at[2] : 0);   // 2: whole numbers that fit 32 bits, also written as int32 (what narrow gives), so no JS pass over them
    if (r === 2) return new Int32Array(X.memory.buffer, L.at[2], n).slice(); if (r) return null; return new Float64Array(X.memory.buffer, L.at[1], n).slice(); }
  function colV(frames, n, p) { var i, u, o; if ((u = colVw(frames[0], n, p))) return u; if (!p.mono && !p.delta && n >= 16384) { u = colZZ(frames[0], n, p.scale); return p.scale !== 1 ? u : narrow(u); } u = unvarints(frames[0], n); if (p.mono) { var s = 0; for (i = 0; i < n; i++) { s += u[i]; u[i] = s; } if (s > 9007199254740992) throw new Error('damaged block: number column out of range'); } else if (p.delta) { var s2 = 0; for (i = 0; i < n; i++) { s2 += unzz(u[i]); if (s2 > 9007199254740992 || s2 < -9007199254740992) throw new Error('damaged block: number column out of range'); u[i] = s2; } } else for (i = 0; i < n; i++) u[i] = unzz(u[i]); if (p.scale !== 1) { for (i = 0; i < n; i++) u[i] /= p.scale; return u; } return narrow(u); }
  // B51: an all-ASCII string column without 0 chars written straight to its bytes (values joined by 0 bytes), with no joined string and no TextEncoder pass; null at the first other char (the join path then decides). The same bytes as te.encode(v.join('\0')).
  // Chromium and WebKitGTK only: there TextEncoder on the joined text is the slow part (Chromium 156 about 4 ms per MB); Firefox encodes fast and keeps the join path
  var STR_ASCII = !GECKO;
  function strAscii(v, n) { var L = n ? n - 1 : 0, i, k, x, c, p = 0; for (i = 0; i < n; i++) L += v[i].length;
    var u = new Uint8Array(L); for (i = 0; i < n; i++) { x = v[i]; if (i) u[p++] = 0; for (k = 0; k < x.length; k++) { c = x.charCodeAt(k); if (c > 127 || c === 0) return null; u[p++] = c; } } return u; }
  // B45: the values of an all-string column joined by 0 chars, or null when some value holds a 0 char or is not well formed (the same test as checking each value: joining with 0 chars cannot pair surrogates)
  function strJoinOk(v, n) { var j = v.join('\0'), z = 0, k = j.indexOf('\0'); while (k >= 0) { z++; k = j.indexOf('\0', k + 1); } if (z !== (n ? n - 1 : 0)) return null; return (NATIVE_WF ? j.isWellFormed() : !RX_LONE.test(j)) ? j : null; }
  // B57: one wasm instance of flatscan for the template builder (its own memory, so the flat writer's layout is untouched)
  var SDW = null;
  function sdw() { if (SDW) return SDW; fsw(); var fk = hasSimd() ? 'FSB64' : 'FSP64', x = new WebAssembly.Instance(MODS[fk], {}).exports; return (SDW = { x: x, heap: (x.__heap_base.value + 7) & ~7 }); }
  // B57: the template layout's frames built in wasm (tplbuild in flatscan.c, its own instance) from the column's bytes (values joined by 0 bytes, as the plain layout holds them):
  // the same frames as templateFrames, without a JS string per template or slot. -> { frames, nT }, null (no template layout, as templateFrames), or undefined (not built here: the JS path runs)
  var B57B = (typeof globalThis !== 'undefined' && globalThis.__B57B !== undefined) ? globalThis.__B57B : 1;
  var B57 = (typeof globalThis !== 'undefined' && globalThis.__B57 !== undefined) ? globalThis.__B57 : 1;
  function tplBytes(u, n) {
    if (!B57 || !u || !n) return undefined;
    var K = sdw(), x = K.x, mem = x.memory, len = u.length, S = len + 16, GC = Math.min(S, 65536 * 64) + 16, T = 16; while (T < 2 * Math.min(n, 65536) + 2) T *= 2;
    var o = K.heap, P = {}; function lay(k, b) { P[k] = o; o = (o + b + 15) & ~15; }
    lay('in', len + 8); lay('tl', len + n + 16); lay('ids', 4 * n); lay('sg', 4 * S); lay('ss', 4 * S); lay('sl', 4 * S); lay('gb', 4 * 65537); lay('gc', 4 * GC); lay('ht', 16 * T); lay('txt', len + n + 16); lay('num', 10 * S); lay('kinds', GC); lay('ord', 4 * S); lay('res', 32);
    if (o > 1610612736) return undefined;
    if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
    new Uint8Array(mem.buffer, P['in'], len).set(u);
    if (x.tplbuild(P['in'], len, n, P.tl, P.ids, P.sg, P.ss, P.sl, S, P.gb, P.gc, GC, P.ht, T, P.txt, P.num, P.kinds, P.ord, P.res)) return null;
    var r = new Uint32Array(mem.buffer, P.res, 6), ids = new Uint32Array(mem.buffer, P.ids, n), ib = new Uint8Array(n * 2), i;
    for (i = 0; i < n; i++) { ib[i] = ids[i] & 255; ib[n + i] = ids[i] >> 8; }
    return { frames: [new Uint8Array(mem.buffer, P.tl, r[0]).slice(), ib, new Uint8Array(mem.buffer, P.txt, r[2]).slice(), new Uint8Array(mem.buffer, P.num, r[3]).slice(), new Uint8Array(mem.buffer, P.kinds, r[1]).slice()], nT: r[4] };
  }
  // B59 (Firefox only): a text column whose first 1,024 values hold more than 128 distinct values is counted in wasm from its bytes (sdz, B53's kernel): the same count, codes and bytes
  var B59 = (typeof globalThis !== 'undefined' && globalThis.__B59 !== undefined) ? globalThis.__B59 : (GECKO ? 1 : 0);
  function someDistinct(v) { var s = new Set(), i; for (i = 0; i < 1024; i++) s.add(v[i]); return s.size; }
  // B60 (Firefox only): first-seen dictionary codes of a column with few distinct values from a small open-addressing table hashed on a value's length and four chars (=== compares the content), instead of a Map of strings; -> the distinct count, or -1 past 2,048 distinct values (the Map path runs). The same labels and codes.
  var HXK = null, HXV = null;
  // B70 (Firefox): the codes go into one reused Uint16Array view (the Uint8/Uint16 copy and bitpack read it; both copy)
  var HXC = null;
  function hxCodes(n) { if (!HXC || HXC.byteLength < 2 * n) HXC = new ArrayBuffer(2 * n); return new Uint16Array(HXC, 0, n); }
  function hxCount(v, n, cap, labels, codes) {
    var M = 4095, x, L, h, k, c, i; if (!HXK) { HXK = new Array(4096); HXV = new Int32Array(4096); } HXK.fill(undefined);
    for (i = 0; i < n; i++) { x = v[i]; L = x.length; h = L; if (L) { h = (h * 31 + x.charCodeAt(0)) | 0; h = (h * 31 + x.charCodeAt(L - 1)) | 0; h = (h * 31 + x.charCodeAt(L >> 1)) | 0; if (L > 2) h = (h * 31 + x.charCodeAt(L - 2)) | 0; } h = (h ^ (h >>> 7)) & M;
      for (;;) { k = HXK[h]; if (k === undefined) { if (labels.length * cap > n) return labels.length; if (labels.length >= 2048) return -1; c = labels.length; HXK[h] = x; HXV[h] = c; labels.push(x); break; } if (k === x) { c = HXV[h]; break; } h = (h + 1) & M; }
      codes[i] = c; }
    return labels.length; }
  // B62 (Firefox, with B59): first-seen codes from an open-addressing table sized for every label up to the stop (labels * cap > n); values up to 16 chars hash every char (multiplicative mix); same labels and codes as the Map count
  var B62 = (typeof globalThis !== 'undefined' && globalThis.__B62 !== undefined) ? globalThis.__B62 : 0;   // B67: off (on the Workbench-style score column the wasm count after one join was faster: 51-55 against 62-72 ms)
  var HBK = null, HBV = null;
  function hxBig(v, n, cap, labels, codes) {
    var T = 4096, M, x, L, h, k, c, i, q, lim = Math.floor(n / cap) + 2;
    while (T < 2 * lim) T *= 2; M = T - 1; var SH = 32 - (31 - Math.clz32(T));
    if (!HBK || HBK.length < T) { HBK = new Array(T); HBV = new Int32Array(T); } HBK.fill(undefined, 0, T);
    for (i = 0; i < n; i++) { x = v[i]; L = x.length; h = L;
      if (L <= 16) { for (q = 0; q < L; q++) h = (h * 31 + x.charCodeAt(q)) | 0; }
      else { h = (h * 31 + x.charCodeAt(0)) | 0; h = (h * 31 + x.charCodeAt(L - 1)) | 0; h = (h * 31 + x.charCodeAt(L >> 1)) | 0; h = (h * 31 + x.charCodeAt(L - 2)) | 0; h = (h * 31 + x.charCodeAt(L >> 2)) | 0; }
      h = Math.imul(h, -1640531535) >>> SH;
      for (;;) { k = HBK[h]; if (k === undefined) { if (labels.length * cap > n) return labels.length; c = labels.length; HBK[h] = x; HBV[h] = c; labels.push(x); break; } if (k === x) { c = HBV[h]; break; } h = (h + 1) & M; }
      codes[i] = c; }
    return labels.length; }
  // B63 (Firefox, with B59): a column whose values average more than 8 chars reaches wasm as one join plus TextEncoder.encodeInto (native), not a charCodeAt loop; sdz checks the 0 bytes (chk) and isWellFormed the text: the same bytes
  var B63 = (typeof globalThis !== 'undefined' && globalThis.__B63 !== undefined) ? globalThis.__B63 : 0.001;   // B67: every B59 column goes through one join plus encodeInto (was: values averaging more than 8 chars)
  function sdzCol(v, n, cap) {   // -> { D, codes, lab, all } or null (a value holds a 0 char or is not well formed: the Map path decides, as before)
    var K = sdw(), x = K.x, mem = x.memory, i, k, q, c, L = n - 1, j = null, len = -1, chk = 0, T = 16, dm = Math.floor(n / cap) + 2, u, p = 0;
    for (i = 0; i < n; i++) L += v[i].length;
    while (T < 2 * dm) T *= 2;
    function lay(inCap) { var o = K.heap, P = { inP: o }; o = (o + inCap + 15) & ~15; P.ht = o; o += 16 * T; P.codes = o; o += 4 * (n + dm + 1); P.out = o; o = (o + inCap + 31) & ~15; P.res = o; o += 16; if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536)); return P; }
    var P = null;
    if (STR_ASCII && !(B59 && B63 && L > B63 * n)) { P = lay(L); u = new Uint8Array(mem.buffer, P.inP, L);
      outer: for (i = 0; i < n; i++) { q = v[i]; if (i) u[p++] = 0; for (k = 0; k < q.length; k++) { c = q.charCodeAt(k); if (c > 127 || c === 0) { p = -1; break outer; } u[p++] = c; } }
      if (p >= 0) len = L; }
    if (len < 0) { j = v.join('\0'); if (!(NATIVE_WF ? j.isWellFormed() : !RX_LONE.test(j))) return null; P = lay(3 * j.length); len = te.encodeInto(j, new Uint8Array(mem.buffer, P.inP, 3 * j.length)).written; chk = 1; }
    var D = x.sdz(P.inP, len, n, cap, chk, T, P.ht, P.codes, P.out, P.res);
    if (D === 0xFFFFFFFF || D < 0) return null;
    var dict = D * 4 <= n && D < 65536, r = new Uint32Array(mem.buffer, P.res, 2);
    return { D: D, codes: dict ? new Uint32Array(mem.buffer, P.codes, n).slice() : null, lab: dict ? new Uint8Array(mem.buffer, P.out, r[0]).slice() : null, all: dict ? null : new Uint8Array(mem.buffer, P.inP, len).slice() };
  }
  // fast: true (owner name 11.14): opt-in quicker saves of text-heavy rows, a little larger
  var FAST_DEFAULT = !(typeof globalThis !== 'undefined' && globalThis.__FAST_DEFAULT === 0);   // B72 (owner 11.15): fast is on unless opts.fast === false
  var FAST_ON = false, FLT = 1, FSK = 1;   // FLT: the zstd level of text columns under fast; FSK: skip the dictionary count of nearly-distinct columns
  function manyDistinct(v) { var s = new Set(), i; for (i = 0; i < 1024; i++) s.add(v[i]); return s.size > 900; }
  var MDB_T = null;
  function manyDistinctBC(B, S, E, a) { var T = MDB_T || (MDB_T = new Int32Array(2048)), nd = 0, i, j, h, x, y, L, q, eq; T.fill(-1);   // distinct byte strings, counted exactly (bytes compared, not only hashes); no text is made
    for (i = 0; i < 1024; i++) { x = S[a + i]; L = E[a + i] - x; h = L; for (q = 0; q < L; q++) h = Math.imul(h ^ B[x + q], 16777619); h = (h >>> 21) & 2047;
      for (;;) { j = T[h]; if (j < 0) { T[h] = i; nd++; break; } y = S[a + j]; if (E[a + j] - y === L) { eq = true; for (q = 0; q < L; q++) if (B[x + q] !== B[y + q]) { eq = false; break; } if (eq) break; } h = (h + 1) & 2047; } }
    return nd > 900; }   // the same test on a byte column: fast skips the dictionary count of a column whose first 1,024 values are nearly all different. Valid UTF-8 has exactly as many distinct strings as distinct byte strings, and a column that is not valid throws in utf8Check on either path (since 0.26.10; from the Workbench thread: Wikimedia import 6-7% quicker)
  var MDC_T = null;
  function manyDistinctDC(dc, a) { var T = MDC_T || (MDC_T = new Int32Array(2048)), nd = 0, i, c, h, ids = dc.ids; T.fill(-1);   // distinct codes first (no text made): never fewer than distinct texts, so 900 or fewer answers without decoding
    for (i = 0; i < 1024; i++) { c = ids[a + i] | 0; h = Math.imul(c, -1640531535) >>> 21; for (;;) { var j = T[h]; if (j < 0) { T[h] = i; nd++; break; } if ((ids[a + j] | 0) === c) break; h = (h + 1) & 2047; } }
    if (nd <= 900) return false;
    var s = new Set(), i, D = dc.labels; for (i = 0; i < 1024; i++) { var c = dc.ids[a + i]; s.add(c >= 0 && c < D.start.length ? td.decode(D.bytes.subarray(D.start[c], D.end[c])) : c); } return s.size > 900; }
  // B45: hex and IPv4 string columns checked and packed in one pass, no regex, no slices; the same acceptance as RX_HEX (lowercase) and RX_IP with parts under 256, the same bytes
  var HEXN = (function () { var t = new Int8Array(128), c; t.fill(-1); for (c = 48; c < 58; c++) t[c] = c - 48; for (c = 97; c < 103; c++) t[c] = c - 87; return t; })();
  function hexRaw(v, n, L) {
    var raw = new Uint8Array(n * L / 2), p = 0, i, j, x, a, b;
    for (i = 0; i < n; i++) { x = v[i]; if (x.length !== L) return null;
      for (j = 0; j < L; j += 2) { a = x.charCodeAt(j); b = x.charCodeAt(j + 1); if (a > 127 || b > 127) return null; a = HEXN[a]; b = HEXN[b]; if ((a | b) < 0) return null; raw[p++] = (a << 4) | b; } }
    return raw;
  }
  function ipRaw(v, n) {
    var raw = new Uint8Array(n * 4), p = 0, i, x, k, L, part, c, d, q;
    for (i = 0; i < n; i++) { x = v[i]; L = x.length; k = 0;
      for (part = 0; part < 4; part++) {
        if (part) { if (k >= L || x.charCodeAt(k) !== 46) return null; k++; }
        c = k < L ? x.charCodeAt(k) - 48 : -1; if (c < 0 || c > 9) return null; k++; q = c;
        if (c !== 0) for (d = 0; d < 2 && k < L; d++) { c = x.charCodeAt(k) - 48; if (c < 0 || c > 9) break; q = q * 10 + c; k++; }
        if (q > 255) return null; raw[p++] = q; }
      if (k !== L) return null; }
    return raw;
  }
  // B40/B41 (research): bdec.wasm, kernels for bit-packed number columns. One small instance with its own memory (grown as needed, dropped by trim()).
  // B41: colB unpacks in wasm in Chrome/Edge and Firefox (1M taxi rows, whole-table unpackRows 0.92 Chromium 156, 0.78 Firefox 158; one column 0.84 / 0.78); WebKitGTK 2.52.6 was 1.19x slower in wasm, so Safari-family engines keep the JS loop
  var BDX = null, BDB64 = "/*BD:BEGIN*//*BD:END*/", BD_DEC = V8 || GECKO;
  function bdx() { if (BDX === null) { try { if (!MODS['BDB64']) MODS['BDB64'] = new WebAssembly.Module(fromB64(BDB64)); BDX = new WebAssembly.Instance(MODS['BDB64'], {}).exports; } catch (e) { BDX = false; } } return BDX; }
  function bdMem(need) { var m = BDX.memory, have = m.buffer.byteLength; if (need > have) m.grow(Math.ceil((need - have) / 65536)); return m.buffer; }
  function bdLay(parts) { var p = (BDX.__heap_base.value + 7) & ~7, at = [], q; for (q = 0; q < parts.length; q++) { at.push(p); p = (p + parts[q] + 8 + 7) & ~7; } return { at: at, end: p }; }   // each part gets 8 zero-filled bytes after it (the kernels read 8 bytes at a time)
  // B49: 1 bits in len bytes of u8 from at; long runs are counted in bdec.wasm (popc, 8 bytes at a time): the plain loop runs cold on the first read of a page (about 1 ms per 1M-row column in Chromium)
  function popcBytes(u8, at, len) { var X = len >= 4096 ? bdx() : null, c = 0, b;
    if (X && X.popc) { var L = bdLay([len]), m = new Uint8Array(bdMem(L.end)); bdPut(m, L.at[0], u8.subarray(at, at + len)); return X.popc(L.at[0], len) >>> 0; }
    for (b = 0; b < len; b++) c += popc8[u8[at + b]]; return c; }
  // B50: a few hundred tiny calls of each bdec kernel in warm(), so the engines compile them to their optimizing tier before the first real call (one long first call otherwise runs in the baseline tier the whole way); -> ms spent
  function bdWarm(reps) { var X = bdx(), t0 = Date.now(), i; if (!X) return 0;
    var L = bdLay([256, 32, 256, 2048, 1024, 16]), u = new Uint8Array(bdMem(L.end)); u.fill(0, L.at[0], L.end); for (i = 0; i < 256; i++) { u[L.at[0] + i] = i * 37; u[L.at[2] + i] = i * 11; } u[L.at[1]] = 85;
    for (i = 0; i < reps; i++) { X.sumI(L.at[0], 0, 256, 7, L.at[5]); X.sumI(L.at[0], L.at[1], 200, 7, L.at[5]); X.grpI(L.at[0], 0, 256, 7, L.at[2], 8, L.at[3], L.at[4]); X.grpI(L.at[0], L.at[1], 200, 7, L.at[2], 8, L.at[3], L.at[4]); X.popc(L.at[0], 256); }
    return Date.now() - t0; }
  function bdPut(u8, at, b) { u8.set(b, at); u8.fill(0, at + b.length, at + b.length + 8); }
  // CP2-1 (research): a null-plane number column read with nulls: 'NaN' expands straight from the wasm output, skipping one full-size copy
  var CP2_1 = true;
  function bdIntOk(p) { return p.scale === 1 && p.w <= 24 && p.mn === (p.mn | 0) && p.mn + (Math.pow(2, p.w) - 1) <= 2147483647; }   // every value of a scale-1 'B' column fits 32 bits (mn .. mn + 2^w - 1)
  function colBw(b, n, p, view) { var X = bdx(); if (!X || p.w > 24) return null; var L = bdLay([b.length, n * 8]), buf = bdMem(L.end); bdPut(new Uint8Array(buf), L.at[0], b);
    if (!view && bdIntOk(p) && X.decBi) { X.decBi(L.at[0], n, p.w, p.mn, L.at[1]); return new Int32Array(X.memory.buffer, L.at[1], n).slice(); }   // since 0.26.12: every value fits 32 bits, so the int32 narrow would give, written in wasm
    X.decB(L.at[0], n, p.w, p.mn, p.scale, L.at[1]); var f = new Float64Array(X.memory.buffer, L.at[1], n); return view ? f : f.slice(); }   // view: a live view of wasm memory, valid only until the next bdec call (CP2-1)
  // B42 nulls: 'NaN' (name picked by the owner 11.14): a block's columns entry where every number column has one value per row: a number column (typed, or a list of only numbers and nulls) becomes a Float64Array (typed columns of one kind keep their kind when no row is empty), with NaN for null and for rows that lack the key; other columns are left as they are
  function intoSlot(a, k, off, n) { if (!(a instanceof Float64Array)) throw new Error('LfcPack: into.' + k + ' must be a Float64Array'); if (off + n > a.length) throw new Error('LfcPack: into.' + k + ' holds ' + a.length + ' values but the file needs ' + (off + n)); return a.subarray(off, off + n); }
  function nanCols(e) {
    var n = e.n, k, v, pr, o, i, z, y, ok;
    for (k in e.cols) { v = e.cols[k]; pr = e.present[k];
      if (!Array.isArray(v)) { if (!pr) continue; o = new Float64Array(n); for (i = 0, z = 0; i < n; i++) o[i] = (pr[i >> 3] >> (i & 7)) & 1 ? v[z++] : NaN; e.cols[k] = o; e.present[k] = null; continue; }
      ok = true; for (i = 0; i < v.length; i++) { y = v[i]; if (y !== null && typeof y !== 'number') { ok = false; break; } } if (!ok) continue;
      o = new Float64Array(n); if (!pr) { for (i = 0; i < n; i++) o[i] = v[i] === null ? NaN : v[i]; } else for (i = 0, z = 0; i < n; i++) { if ((pr[i >> 3] >> (i & 7)) & 1) { y = v[z++]; o[i] = y === null ? NaN : y; } else o[i] = NaN; }
      e.cols[k] = o; e.present[k] = null; }
    return e;
  }
  // B44 (research): files carry per-column XXH64 checks by default (as { check: 'xxh64' } did), so a read of a few columns checks only those; { check: 'crc32' } keeps the old whole-block-only table
  var B44_DEFAULT = true; function chkX(o) { return o && o.check ? o.check === 'xxh64' : B44_DEFAULT; }
  function colB(frames, n, p, tgt) { if ((BD_DEC || (!tgt && bdIntOk(p))) && n >= 256 && p.w <= 24) { var ow = colBw(frames[0], n, p, tgt ? 1 : 0); if (ow) { if (tgt) { tgt.set(ow); return tgt; } return p.scale === 1 && !(ow instanceof Int32Array) ? narrow(ow) : ow; } } var i, u, o; var bu = bitunpack(frames[0], n, p.w); o = new Float64Array(n); for (i = 0; i < n; i++) o[i] = (bu[i] + p.mn) / p.scale; return p.scale === 1 ? narrow(o) : o; }
  function colT(frames, n, p) { var i, u, o; var tb = bitunpack(frames[0], n, 1); o = new Array(n); for (i = 0; i < n; i++) o[i] = tb[i] === 1; return o; }
  function colD(frames, n, p) { var i, u, o; var lab = p.sh ? labsOf(p.sh) : tdr.decode(frames[0]).split('\0'), cd = p.w ? bitunpack(frames[1], n, p.w) : p.wide ? new Uint16Array(frames[1].buffer.slice(frames[1].byteOffset, frames[1].byteOffset + n * 2)) : frames[1]; o = new Array(n); for (i = 0; i < n; i++) o[i] = lab[cd[i]]; return o; }

  // B19b: values of column c at value positions vi[0..m) (ascending), or null when this kind is decoded whole
  var B19B = 'on', P14 = 'on', P14B = 'on', NX_B = 'on', NX_C = 'on';
  // NX: segments of big (separated by the char code sep) that equal needle -> their positions; character loop, any text
  function sepFind(big, needle, sep) {
    var out = [], L = needle.length, x = big.indexOf(needle), k = 0, a = 0, BL = big.length;
    for (; x >= 0; x = big.indexOf(needle, x + 1)) {
      if ((x > 0 && big.charCodeAt(x - 1) !== sep) || (x + L < BL && big.charCodeAt(x + L) !== sep)) continue;
      for (; a < x; a++) if (big.charCodeAt(a) === sep) k++;
      out.push(k);
    }
    return out;
  }
  function AnyOf(list) { this.list = list; this.set = new Set(list); }   // NX C: equals.anyOf
  // P14: rows (into sel) whose value in column cm === val, matched in the stored bytes; -1 = read it the usual way
  function p14Sel(cm, cfr, val, pl, base, n, sel, kv) {
    var ii, mm;
    var isN = cm.t === 'N';
    if (val instanceof AnyOf) {   // NX C: the union of each value's rows; kv gets each kept row's value
      if (NX_C !== 'on' || !kv) return -1;
      var vl = Array.from(val.set), mk = new Int32Array(n).fill(-1), tt = new Int32Array(n), z, mz, hits = 0;
      for (z = 0; z < vl.length; z++) { mz = p14Sel(cm, cfr, vl[z], pl, base, n, tt, null); if (mz < 0) return -1; for (ii = 0; ii < mz; ii++) mk[tt[ii]] = z; hits += mz; }
      if (!hits) return 0;
      for (ii = 0, mm = 0; ii < n; ii++) if (mk[ii] >= 0) { kv[mm] = vl[mk[ii]]; sel[mm++] = ii; } return mm;
    }
    var vq = isN ? eqAt({ t: cm.p.t, p: cm.p.p, n: cm.p.m }, cfr.slice(1), val) : eqAt(cm, cfr, val), m = 0, i, c, qq;
    if (!vq) return -1;
    var nq = vq.length, vi2 = 0, ni = 0, np2 = isN ? cfr[0] : null, pos = np2 ? new Int32Array(nq) : vq;
    if (np2) for (qq = 0; qq < nq; qq++) { for (; ; vi2++) { if (!((np2[vi2 >> 3] >> (vi2 & 7)) & 1)) { if (ni === vq[qq]) break; ni++; } } pos[qq] = vi2++; ni++; }   // inner positions skip the nulls
    if (cm.n === n) { for (qq = 0; qq < nq; qq++) sel[m++] = pos[qq]; return m; }
    for (i = 0, c = 0, qq = 0; i < n && qq < nq; i++) if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (c++ === pos[qq]) { sel[m++] = i; qq++; } }
    return m;
  }
  // P14: value positions (ascending) of column c whose value === val, matched in the column's own bytes with no string per row; null = read it the usual way
  function eqAt(c, frames, val) {
    var t = c.t, p = c.p, n = c.n, f = frames[0], out = [], i, j, w, nd, b0;
    if (P14 !== 'on') return null;
    if (t === 'j' && NX_B === 'on') {   // NX B: mixed cells are JSON text, one per line, each written by jsonText: the same text means the same value
      if (val === null || typeof val === 'boolean' || typeof val === 'string' || (typeof val === 'number' && val !== 0 && val === val)) { var jt = tdr.decode(f), nd2 = jsonText(val); return jt.indexOf(nd2) < 0 ? out : sepFind(jt, nd2, 10); }
      return typeof val === 'object' || typeof val === 'function' ? out : null;
    }
    if (typeof val !== 'string') return null;
    if (t === 's') {
      if (val === '') return null;
      if (val.indexOf('\0') >= 0) return out;
      var big = tdr.decode(f), L = val.length, x = big.indexOf(val), k = 0, a = 0, e;
      if (x < 0) return out;
      if (big.length !== f.length) return null;   // not all ASCII: character and byte offsets differ
      for (; x >= 0; x = big.indexOf(val, x + 1)) {
        if ((x > 0 && f[x - 1] !== 0) || (x + L < f.length && f[x + L] !== 0)) continue;
        for (e = x; a < e; a++) if (f[a] === 0) k++;
        out.push(k);
      }
      return out;
    }
    if (t === 'U' || t === 'H' || t === 'I') {
      w = t === 'U' ? 16 : t === 'I' ? 4 : p.L / 2; if (f.length < n * w) return null; nd = new Uint8Array(w);
      if (t === 'I') { var mi = RX_IP.exec(val); if (!mi) return out; for (j = 0; j < 4; j++) { if (+mi[j + 1] > 255) return out; nd[j] = +mi[j + 1]; } }
      else { if (val.length !== (t === 'U' ? 36 : w * 2)) return out; var hc = 0, hh, hv, hn = 0; for (j = 0; j < val.length; j++) { hh = val.charCodeAt(j); if (t === 'U' && (j === 8 || j === 13 || j === 18 || j === 23)) { if (hh !== 45) return out; continue; } hv = hh >= 48 && hh <= 57 ? hh - 48 : hh >= 97 && hh <= 102 ? hh - 87 : -1; if (hv < 0) return out; if (hn & 1) nd[hn >> 1] = hc * 16 + hv; else hc = hv; hn++; } }
      if ((t === 'U' ? uuidCol(nd, 1) : t === 'H' ? hexCol(nd, 1, p.L) : ipCol(nd, 1))[0] !== val) return out;   // the column only holds what its decoder writes
      b0 = nd[0];
      outer: for (i = 0; i < n; i++) { var o = i * w; if (f[o] !== b0) continue; for (j = 1; j < w; j++) if (f[o + j] !== nd[j]) continue outer; out.push(i); }
      return out;
    }
    return null;
  }
  function bitAt(b, i, w) { var bp = i * w, by = bp >> 3; return ((((b[by] | 0) | ((b[by + 1] | 0) << 8) | ((b[by + 2] | 0) << 16) | ((b[by + 3] | 0) << 24)) >>> (bp & 7)) & ((1 << w) - 1)) >>> 0; }
  function decodeAt(c, frames, vi, m) {
    var t = c.t, p = c.p, n = c.n, o = new Array(m), i, f, k, q, a, cd;
    if (B19B === 'off' || m * 8 > n) return null;   // more than 1 in 8 rows: the whole-column decoders are quicker
    if (t === 's') { f = frames[0]; var big = tdr.decode(f), x; k = 0; q = 0; a = 0;
      if (big.length === f.length) { while (q < m) { x = big.indexOf('\0', a); if (x < 0) x = big.length; if (k === vi[q]) o[q++] = big.substring(a, x); else if (x === big.length) return null; k++; a = x + 1; } return o; }   // all ASCII: one character per byte
      var sp = big.split('\0'); if (sp.length < n) return null; for (q = 0; q < m; q++) o[q] = sp[vi[q]]; return o; }
    if (t === 'D') { var lab = p.sh ? labsOf(p.sh) : tdr.decode(frames[0]).split('\0'); cd = frames[1];
      for (i = 0; i < m; i++) o[i] = lab[p.w ? bitAt(cd, vi[i], p.w) : p.wide ? (cd[vi[i] * 2] | (cd[vi[i] * 2 + 1] << 8)) : cd[vi[i]]]; return o; }
    if (t === 'T') { f = frames[0]; for (i = 0; i < m; i++) o[i] = bitAt(f, vi[i], 1) === 1; return o; }
    if (P14B === 'on' && (t === 'U' || t === 'H' || t === 'I')) { var w = t === 'U' ? 16 : t === 'I' ? 4 : p.L / 2; f = frames[0]; if (f.length < n * w) return null; var g = new Uint8Array(m * w); for (q = 0; q < m; q++) g.set(f.subarray(vi[q] * w, vi[q] * w + w), q * w); return t === 'U' ? uuidCol(g, m) : t === 'H' ? hexCol(g, m, p.L) : V8 ? ipColV8(g, m) : ipCol(g, m); }   // P14: only the asked values
    if (P14B === 'on' && t === 'V') { f = frames[0]; var vs = 0, vx, vc, vm, vp = 0; q = 0;
      for (k = 0; q < m && vp < f.length; k++) { vx = 0; vm = 1; do { vc = f[vp++]; vx += (vc & 127) * vm; vm *= 128; } while (vc & 128);
        if (p.mono) vs += vx; else if (p.delta) vs += unzz(vx);
        if (k === vi[q]) { o[q] = p.mono || p.delta ? vs : unzz(vx); if (p.scale !== 1) o[q] /= p.scale; q++; } }
      return q === m ? o : null; }
    if (t === 'B' && p.w <= 24) { f = frames[0]; for (i = 0; i < m; i++) o[i] = (bitAt(f, vi[i], p.w) + p.mn) / p.scale; return o; }
    if (t === 'N') {   // null plane: frame 0 marks the nulls; the other values are the inner column, in order
      var np = frames[0], ii = new Int32Array(m), im = 0, nn = 0, at = 0, wi = [];
      for (q = 0; q < m; q++) { for (; at < vi[q]; at++) if ((np[at >> 3] >> (at & 7)) & 1) nn++; if ((np[at >> 3] >> (at & 7)) & 1) o[q] = null; else { ii[im++] = vi[q] - nn; wi.push(q); } }
      if (!im) return o;
      var iv = decodeAt({ t: p.t, p: p.p, n: p.m }, frames.slice(1), ii, im); if (!iv) return null;
      for (q = 0; q < im; q++) o[wi[q]] = iv[q]; return o; }
    return null;
  }
  function decodeColumn(c, zs, frames, nan, tgt) {   // -> array-like of n values (nan: B42, a null-plane number column comes back as a Float64Array with NaN for null)
    var n = c.n, i, u, o, t = c.t, p = c.p;
    if (t === 'N') { var iv = CP2_1 && nan && p.t === 'B' && BD_DEC && p.m >= 256 && p.p.w <= 24 ? colBw(frames[1], p.m, p.p, 1) : null; if (!iv) { var tbN = TEXT_BYTES; TEXT_BYTES = false; try { iv = decodeColumn({ t: p.t, p: p.p, n: p.m }, zs, frames.slice(1)); } finally { TEXT_BYTES = tbN; } } var pn = frames[0], q = 0; if (nan && !Array.isArray(iv)) { if (pn.length < (n + 7) >> 3) throw new Error('damaged block: N plane cut off'); o = tgt || new Float64Array(n); for (i = 0; i < n; i++) o[i] = (pn[i >> 3] >> (i & 7)) & 1 ? NaN : iv[q++]; if (q !== p.m) throw new Error('damaged block: N count'); return o; } o = new Array(n); if (pn.length < (n + 7) >> 3) throw new Error('damaged block: N plane cut off'); for (i = 0; i < n; i++) o[i] = (pn[i >> 3] >> (i & 7)) & 1 ? null : iv[q++]; if (q !== p.m) throw new Error('damaged block: N count'); return o; }
    if (t === 'V') return colV(frames, n, p);
    if (t === 'B') return colB(frames, n, p, tgt);
    if (t === 'F') { return new Float64Array(frames[0].buffer.slice(frames[0].byteOffset, frames[0].byteOffset + n * 8)); }
    if (t === 'T') return colT(frames, n, p);
    // hex, UUID and address columns: the ASCII text of the whole column is written into one buffer and decoded once, then every value is cut out of it (decode once per column, slice)
    if ((t === 'H' && frames[0].length < n * (p.L / 2)) || (t === 'U' && frames[0].length < n * 16) || (t === 'I' && frames[0].length < n * 4)) throw new Error('damaged block: ' + t + ' column cut off');   // fixed-width columns: the frame must hold n values
    if (t === 'H') return hexCol(frames[0], n, p.L);
    if (t === 'U') return uuidCol(frames[0], n);
    if (t === 'I') return V8 ? ipColV8(frames[0], n) : ipCol(frames[0], n);   // Firefox too (since 0.5.8): it used to join four pieces per address, and the two throwaway pieces per address kept Firefox copying every new value out of its young memory for the first reads of a page (cloud Firefox 158, 100k log rows: young-memory cleanup per read 29 and 27 ms -> 10 and 1 ms; reads 1-2 80, 79 -> 74, 63 ms; warm reads 47 -> 43 ms)
    if (t === 'A') {
      var al = unvarints32(frames[0], n) || unvarints(frames[0], n), av = unvarints32(frames[1], p.m) || unvarints(frames[1], p.m), ap = 0, aa, aj, ac, an, ar = p.asc;
      o = new Array(n);
      if (!V8) return (ar ? ascLit : zzLit)(o, al, av, n);   // Firefox and WebKitGTK: see ascLit and zzLit
      for (i = 0; i < n; i++) { an = al[i]; aa = new Array(an); ac = 0; for (aj = 0; aj < an; aj++) { ac += ar ? av[ap++] : unzz(av[ap++]); aa[aj] = ac; } o[i] = aa; }
      return o;
    }
    if (t === 'W') {
      if (DATES_LOG) {   // dates: 'numbers' (since 0.13.6): the epoch values, in milliseconds (microseconds for the six-digit forms), not their text
        var dv = decodeColumn({ t: p.t, p: p.p, n: n }, zs, frames), dsc = p.f & 8 ? (p.f & 4 ? 1e6 : 1000) : 1, dout = new Float64Array(n), dk; for (dk = 0; dk < n; dk++) dout[dk] = dv[dk] * dsc;
        DATES_LOG.push({ a: dout, f: p.f & 7 }); return dout;
      }
      if (TEXT_BYTES) {   // text: 'bytes': the formatted dates as { bytes, start, end } (fixed width), no strings
        if (!n) return { bytes: new Uint8Array(0), start: new Int32Array(0), end: new Int32Array(0) };
        var dr = dateCol(decodeColumn({ t: p.t, p: p.p, n: n }, zs, frames), n, p.f, true), dst = new Int32Array(n), den = new Int32Array(n), dq; for (dq = 0; dq < n; dq++) { dst[dq] = dq * dr.w; den[dq] = dq * dr.w + dr.w - 1; }
        return { bytes: dr.b, start: dst, end: den };
      }
      return dateCol(decodeColumn({ t: p.t, p: p.p, n: n }, zs, frames), n, p.f);
    }
    if (t === 'L') return untemplate(n, frames);
    if (t === 's') return n ? (TEXT_BYTES ? cutNul(frames[0], n) : tdr.decode(frames[0]).split('\0')) : [];
    if (t === 'D') return TEXT_BYTES ? dictBytes(frames, n, p) : colD(frames, n, p);
    if (n && jnulls(frames[0], n)) { o = new Array(n); for (i = 0; i < n; i++) o[i] = null; return o; } var js = n ? tdr.decode(frames[0]).split('\n') : []; o = new Array(n); if (V8 || GECKO) { for (i = 0; i < n; i++) o[i] = jcell(js[i]); return o; } for (i = 0; i < n; i++) o[i] = JSON.parse(js[i]); return o;
  }
  // 'j' cells: most are null, true, false or whole numbers; JSON.parse per cell costs about 80 ns, so read those by hand (whole numbers of up to 15 characters, digits only, no leading zero, are exact in a double); anything else goes to JSON.parse. Chromium and Firefox only: in WebKitGTK the per-cell reader was slower than JSON.parse (cloud WebKitGTK 2.52.6, 100,000 orders: unpackColumns 1.08 to 1.20 of the time), so it keeps JSON.parse there; the all-null check runs in every engine
  function jnulls(f, n) { if (f.length !== n * 5 - 1) return false; for (var i = 0; i < f.length; i += 5) if (f[i] !== 110 || f[i + 1] !== 117 || f[i + 2] !== 108 || f[i + 3] !== 108 || (i + 4 < f.length && f[i + 4] !== 10)) return false; return true; }
  function jcell(s) { var c0 = s.charCodeAt(0), L = s.length, i, v, d; if (c0 === 110 && s === 'null') return null; if (c0 === 116 && s === 'true') return true; if (c0 === 102 && s === 'false') return false; if (L <= 15) { i = c0 === 45 ? 1 : 0; if (i < L && (s.charCodeAt(i) !== 48 || L === i + 1)) { v = 0; for (; i < L; i++) { d = s.charCodeAt(i) - 48; if (d < 0 || d > 9) break; v = v * 10 + d; } if (i === L) return c0 === 45 ? -v : v; } } return JSON.parse(s); }
  // returns null when the input is not flat rows (some line is not a JSON object)
  // B26 (research): packRows skips its flatScalars pass; the row scatter checks each row and value the same way and throws B26_BAIL on the first one that is not a flat scalar (packRows then takes the text path, as before)
  var B26_BAIL = { b26: 1 }, OP26 = Object.prototype;
  // B61: the B21a row loop with two changes, same columns and planes: (1) a row that holds every key seen so far, in the order of the row before, sets no presence bit per cell (one bit in a
  // whole-row plane, folded into each key's plane at the end, or before a new key appears); (2) outside Firefox, text and other generic columns are filled by index into an array made n long, not by push
  var B61 = (typeof globalThis !== 'undefined' && globalThis.__B61 !== undefined) ? globalThis.__B61 : 1;
  var B61I = true;   // indexed fill: Chromium 156 0.96, WebKitGTK 0.97; Firefox 158 keeps push (indexed fill made the later column passes slower there: Workbench-style 0.98, logs 1.02, against 0.92 / 0.985 with push)
  function b61Fold(full, pls, pb) { for (var j = 0; j < pls.length; j++) { var pl = pls[j]; for (var b = 0; b < pb; b++) pl[b] |= full[b]; } full.fill(0); }
  function b61Gen(c, n) { var a = new Array(n), i, k = 0; for (i = 0; i < c.c; i++) a[i] = c.np !== null && (c.np[i >> 3] >> (i & 7)) & 1 ? null : c.nb[k++]; return a; }
  function b61Loop(rows, n, pb, keys, seen, cols, cs21, pls, chk) {
    var full = new Uint8Array(pb), any = 0, pk = [], pc = [], px = [], i, r, k, q, jx, dev, x21, c21, t, nk;
    for (i = 0; i < n; i++) {
      r = rows[i]; q = 0; dev = false; nk = keys.length;
      if (chk && (r === null || typeof r !== 'object' || Array.isArray(r) || ((t = Object.getPrototypeOf(r)) !== OP26 && t !== null))) throw B26_BAIL;   // B65: b26Rows' check, in the same pass
      for (k in r) {
        if (pk[q] === k) c21 = pc[q];   // B64: the column state is cached per key position too
        else { dev = true; jx = seen.get(k); if (jx === undefined) { if (any) { b61Fold(full, pls, pb); any = 0; } jx = keys.length; seen.set(k, jx); keys.push(k); cols.push(null); cs21.push({ a: null, nb: new Float64Array(n), np: null, m: 0, c: 0 }); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; pc[q] = c21 = cs21[jx]; }
        q++; x21 = r[k];
        if (c21.a !== null) { if (B61I) c21.a[c21.c++] = x21; else c21.a.push(x21); } else if (typeof x21 === 'number') { c21.nb[c21.m++] = x21; c21.c++; } else if (x21 === null) { if (c21.np === null) c21.np = new Uint8Array(pb); c21.np[c21.c >> 3] |= 1 << (c21.c & 7); c21.c++; } else { c21.a = B61I ? b61Gen(c21, n) : b21Generic(c21); c21.nb = null; if (B61I) c21.a[c21.c++] = x21; else c21.a.push(x21); }
      }
      if (!dev && q === nk && q === keys.length) { full[i >> 3] |= 1 << (i & 7); any = 1; }
      else for (t = 0; t < q; t++) pls[px[t]][i >> 3] |= 1 << (i & 7);
    }
    if (any) b61Fold(full, pls, pb);
    if (B61I) for (t = 0; t < cs21.length; t++) { c21 = cs21[t]; if (c21.a !== null) c21.a.length = c21.c; }
  }
  function b26Rows(rows, n) { for (var i = 0, r, t; i < n; i++) { r = rows[i]; if (r === null || typeof r !== 'object' || Array.isArray(r) || ((t = Object.getPrototypeOf(r)) !== OP26 && t !== null)) throw B26_BAIL; } }
  function b26Vals(a) { for (var i = 0, x, t; i < a.length; i++) { x = a[i]; t = typeof x; if (t === 'number') { if (x - x !== 0 || (x === 0 && 1 / x < 0)) throw B26_BAIL; } else if (t !== 'string' && t !== 'boolean' && x !== null) throw B26_BAIL; } }
  function writeFlatBlock(ctx, input, opts) { B18_ALLV = !!(input && (input.rowsIn || input.colsIn)); var shw0 = SHW, sc0 = SUMCAP; SHW = ctx && ctx.shw || null; SUMCAP = input && (input.colsIn ? input.colsIn.sumCap : input.sumCap) || null; if (SUMCAP) SUMA = input.colsIn ? input.colsIn.a : input.sumA; try { return writeFlatBlock0(ctx, input, opts); } finally { B18_ALLV = false; SHW = shw0; SUMCAP = sc0; } }
  function b21Generic(c) { var a = new Array(c.c), i, k = 0; for (i = 0; i < c.c; i++) a[i] = c.np !== null && (c.np[i >> 3] >> (i & 7)) & 1 ? null : c.nb[k++]; return a; }   // B21c: back to a generic array (values in order)
  function b21Flags(a, m) { if (m >= NK_MIN) return nkFlags(a, m); return b21FlagsJ(a, m); }
  function b21FlagsJ(a, m) { var nz = 0, ai = 1, nf = 0, i, x; for (i = 0; i < m; i++) { x = a[i]; if (ai && !(x % 1 === 0 && x < 1125899906842624 && x > -1125899906842624)) ai = 0; if (x === 0 && 1 / x < 0) nz = 1; if (x - x !== 0) nf = 1; } return { nz: nz, ai: ai, nf: nf }; }

  // NX A: per flat block, a Bloom filter of each text column's stored values (UTF-8 text and labels), so an equality read skips blocks that cannot hold the value.
  // Built in the writer from the column's uncompressed bytes (labels for a dictionary: their count is the distinct count, no fold)
  var NX_A = 8, NX_A_BUDGET = 0.02, NX_A_MAXB = 1048576;
  function eqHash(b, s0, e0) {   // FNV-1a of the bytes (long values: first, middle and last 8 bytes), then the length
    var h = 2166136261, i, mid, L = e0 - s0;
    if (L <= 24) for (i = s0; i < e0; i++) h = Math.imul(h ^ b[i], 16777619);
    else { mid = (s0 + e0 - 8) >> 1; for (i = s0; i < s0 + 8; i++) h = Math.imul(h ^ b[i], 16777619); for (i = mid; i < mid + 8; i++) h = Math.imul(h ^ b[i], 16777619); for (i = e0 - 8; i < e0; i++) h = Math.imul(h ^ b[i], 16777619); }
    return Math.imul(h ^ L, 16777619) >>> 0;
  }
  function eqH2(h) { h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) | 1) >>> 0; }
  function b64e(u) { var s = '', i; for (i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
  function b64d(s) { var t = atob(s), u = new Uint8Array(t.length), i; for (i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }
  function eqWant(opts) { return NX_A && !opts._noeq && (opts.blockBytes || BLOCK_BYTES) <= NX_A_MAXB; }
  function eqBloomCols(keys, es, blen) {   // es[j]: the chosen encoding of column j (with r0 for text columns); -> {key: [b64 bits, k, inner type, has null]} within the byte budget
    var j, cs = [], res = {}, tot = 0, cap = NX_A_BUDGET * blen, k = Math.max(1, Math.round(NX_A * 0.5)), any = false;
    var ord = [], lb = 0;
    for (j = 0; j < keys.length; j++) {   // smallest possible filter of each text column (dictionary: exact; text: from a lower bound on its distinct count), so columns that cannot fit are not hashed
      var e = es[j], it = e.t === 'N' ? e.p.t : e.t, mm = 64, dd;
      if ((it !== 's' && it !== 'D') || !e.r0) continue;
      dd = it === 'D' ? dictCount(e) : (e.dl || 1); while (mm < NX_A * dd && mm < 1048576) mm <<= 1;
      ord.push([mm >> 3, j, dd, e.r0.length / (e.t === 'N' ? e.p.m : e.n)]);
    }
    ord.sort(function (a, b) { return a[0] - b[0] || a[3] - b[3]; });   // ties: shorter values first (more often few distinct values, and cheaper to hash)
    for (var oi = 0; oi < ord.length; oi++) {
      if (lb + ord[oi][0] > cap) break; lb += ord[oi][0]; j = ord[oi][1];
      var e = es[j], it = e.t === 'N' ? e.p.t : e.t, f = e.r0, m = 64, bits, i, a, h1, h2, q, x, cnt, ones = 0, fl;
      if (it === 'D') cnt = ord[oi][2]; else cnt = e.t === 'N' ? e.p.m : e.n;
      while (m < NX_A * cnt && m < 1048576) m <<= 1;
      if (it === 'D' && m >> 3 > cap) continue;   // a dictionary filter is final size: too big for the budget
      bits = new Uint8Array(m >> 3);
      for (a = 0, fl = f.length; a <= fl; a = i + 1) {   // each value's end found natively, then its hash
        i = f.indexOf(0, a); if (i < 0) i = fl;
        h1 = eqHash(f, a, i); h2 = eqH2(h1);
        for (q = 0; q < k; q++) { x = (h1 + Math.imul(q, h2)) & (m - 1); bits[x >> 3] |= 1 << (x & 7); } }
      if (it === 's') { for (i = 0; i < bits.length; i++) ones += popc8[bits[i]];
        var dist = ones >= m ? cnt : -m * Math.log(1 - ones / m) / k, want = 64; while (want < NX_A * dist && want < m) want <<= 1;
        while (m > want) { m >>= 1; var lo = bits.subarray(0, m >> 3), hi = bits.subarray(m >> 3, m >> 2); for (i = 0; i < lo.length; i++) lo[i] |= hi[i]; bits = lo; } }
      lb += bits.length - ord[oi][0];   // the real size once known
      cs.push([keys[j], bits, it, e.t === 'N' && e.p.m < e.n ? 1 : 0]);
    }
    cs.sort(function (a, b) { return a[1].length - b[1].length; });
    for (j = 0; j < cs.length; j++) { if (tot + cs[j][1].length > cap) break; tot += cs[j][1].length; res[cs[j][0]] = [cs[j][1].slice(), k, cs[j][2], cs[j][3]]; any = true; }
    return any ? res : 0;
  }
  function eqRegion(eqf) {   // the filters of all blocks, stored after the blocks (not in the footer, which every open reads): u32 index length, index JSON, filter bits
    var idx = [], parts = [], at = 0, i, k, e, o;
    for (i = 0; i < eqf.length; i++) { if (!eqf[i]) { idx.push(0); continue; } o = {}; for (k in eqf[i]) { e = eqf[i][k]; o[k] = [at, e[0].length, e[1], e[2], e[3]]; parts.push(e[0]); at += e[0].length; } idx.push(o); }
    var ij = te.encode(JSON.stringify(idx)); return concat([u32le(ij.length), ij].concat(parts));
  }
  function eqRegionRead(r) {   // -> per block {key: [bits, k, type, has null]}
    var il = rd32(r, 0), idx = JSON.parse(tdr.decode(r.subarray(4, 4 + il))), b0 = 4 + il, i, k, e;
    for (i = 0; i < idx.length; i++) if (idx[i]) for (k in idx[i]) { e = idx[i][k]; idx[i][k] = [r.subarray(b0 + e[0], b0 + e[0] + e[1]), e[2], e[3], e[4]]; }
    return idx;
  }
  function eqOf(blk) { var q = blk.eqf; return q ? eqBloomCols(q[0], q[1], q[2]) : 0; }
  function dlOf(fr, dl) { fr.dl = dl; return fr; }
  function dictCount(e) { var f = e.r0, i, c = 1; for (i = 0; i < f.length; i++) if (f[i] === 0) c++; return c; }
  function eqNeedles(ev) {   // once per query: each value's two hashes (null: matches only a column with nulls; not text: no text column holds it)
    var vs = ev instanceof AnyOf ? ev.list : [ev], out = [], i, v, nd, h1;
    for (i = 0; i < vs.length; i++) { v = vs[i]; if (v === null) out.push(null); else if (typeof v === 'string') { nd = te.encode(v); h1 = eqHash(nd, 0, nd.length); out.push([h1, eqH2(h1)]); } }
    return out;
  }
  function eqSkipBlock(z, key, nds) {   // true when block filter z proves no row has key equal to any needle's value
    if (!z) return false; var e = Object.prototype.hasOwnProperty.call(z, key) ? z[key] : null, i, q, x, h, bits, m;
    if (!e) return false;
    bits = e[0]; m = bits.length << 3;
    for (i = 0; i < nds.length; i++) { h = nds[i]; if (h === null) { if (e[3] === 1) return false; continue; }
      for (q = 0; q < e[1]; q++) { x = (h[0] + Math.imul(q, h[1])) & (m - 1); if (!((bits[x >> 3] >> (x & 7)) & 1)) break; }
      if (q === e[1]) return false; }
    return true;
  }
  function writeFlatBlock0(ctx, input, opts) {
    FAST_ON = opts.fast === undefined ? FAST_DEFAULT : !!opts.fast;
    var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, colsIn = input && input.colsIn || null, rowsIn = input && (input.rowsIn || (colsIn ? [] : null)), text = rowsIn ? '' : td.decode(input), lines, rows = rowsIn || [], i, j, r, nl = 0, at = -1;
    if (!rowsIn) {   // B18b: row objects given, no text to parse
    // fast path: one JSON.parse of the whole block as an array (same row count as lines, or fall back to line by line)
    while ((at = text.indexOf('\n', at + 1)) >= 0) nl++;
    if (text.charCodeAt(text.length - 1) !== 10) nl++;
    for (j = text.length; j > 0 && text.charCodeAt(j - 1) === 10; j--);     // trailing newlines off by hand: /\n+$/ retried every run of newlines (slow, and quadratic on a long run of blank lines)
    try { r = JSON.parse('[' + (j < text.length ? text.slice(0, j) : text).replace(/\n/g, ',') + ']'); if (r.length === nl) rows = r; } catch (e) { rows = []; }
    if (rows.length) { for (i = 0; i < rows.length; i++) { r = rows[i]; if (r === null || typeof r !== 'object' || Array.isArray(r)) { rows = []; break; } } }
    lines = rows.length ? [] : text.split('\n');
    for (i = 0; i < lines.length; i++) { var l = lines[i]; if (l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1); if (!l.trim()) continue; try { r = JSON.parse(l); } catch (e) { return null; } if (r === null || typeof r !== 'object' || Array.isArray(r)) return null; rows.push(r); }
    }
    var n = colsIn ? colsIn.b - colsIn.a : rows.length, keys = [], seen = new Map(), cols = [], k, v, jx;
    var chk26 = !!(rowsIn && opts._b26), t26, pb = (n + 7) >> 3, ord = opts.exact ? { map: new Map(), list: [], ids: new Array(n) } : null, sq, pk = [], px = [], q, pls = [], cs21 = [], c21, x21, pre21 = [];
    if (chk26 && !colsIn && !(B61 && !ord)) b26Rows(rows, n);   // B65: b61Loop checks each row as it reads it
    if (colsIn) b34Fill(colsIn, n, pb, keys, seen, cols, cs21, pls);
    else if (B61 && !ord) b61Loop(rows, n, pb, keys, seen, cols, cs21, pls, chk26);
    else for (i = 0; i < n; i++) {   // B21a: one pass; a key at the same position as in the previous row is matched by a string compare, not a Map lookup
      r = rows[i]; sq = ord ? [] : null; q = 0;
      for (k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push(null); cs21.push({ a: null, nb: new Float64Array(n), np: null, m: 0, c: 0 }); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; }
        q++; pls[jx][i >> 3] |= 1 << (i & 7); x21 = r[k]; c21 = cs21[jx];
        if (c21.a !== null) c21.a.push(x21); else if (typeof x21 === 'number') { c21.nb[c21.m++] = x21; c21.c++; } else if (x21 === null) { if (c21.np === null) c21.np = new Uint8Array(pb); c21.np[c21.c >> 3] |= 1 << (c21.c & 7); c21.c++; } else { c21.a = b21Generic(c21); c21.a.push(x21); c21.nb = null; }
        if (sq) sq.push(jx); }
      if (ord) { var sk = sq.join(','), oid = ord.map.get(sk); if (oid === undefined) { oid = ord.list.length; ord.map.set(sk, oid); ord.list.push(sq); } ord.ids[i] = oid; }
    }
    var fl21 = []; var planes = new Uint8Array(pb * keys.length); for (j = 0; j < pls.length; j++) planes.set(pls[j], j * pb);
    for (j = 0; j < cs21.length; j++) { c21 = cs21[j]; pre21.push(null); if (c21.bc) { cols[j] = c21; pre21[j] = 3; continue; } if (c21.a !== null) { cols[j] = c21.a; if (chk26) b26Vals(c21.a); continue; }   // B21c: number columns, typed
      if (c21.m === c21.c && c21.c > 0) { cols[j] = c21.nb.subarray(0, c21.c); pre21[j] = 1; fl21[j] = c21.fl || null; }   // B25d: flags are taken just before the column is encoded, so the kernel reads the column once
      else if (c21.m > 0 && c21.c > 1 && NULL_MODE === 'plane') { cols[j] = c21; pre21[j] = 2; }
      else { cols[j] = b21Generic(c21); if (chk26) b26Vals(cols[j]); } }
    var enc = [], frames = [], meta = { keys: keys, cols: [] }, zone = [];
    var tm21 = opts.templates === false ? 0 : opts.templates === true ? 2 : 1, es = new Array(cols.length), wait = null, rc = opts._rcol, capB = SUMCAP, sqB = capB ? { a0: SUMA, R: capB.R } : null;   // capB: where this block's summary parts go (the block may finish after SUMCAP is reset)
    for (j = 0; j < cols.length; j++) {
      if (rc && pre21[j] && pre21[j] !== 3 && (pre21[j] === 1 ? cols[j].length : cols[j].c) >= B28_MIN) {   // B28: a big typed number column is encoded in a helper (its Float64Array moves there)
        (wait || (wait = [])).push(rc(j, pre21[j], cols[j], keys[j], level, tm21, chk26, sqB && (pre21[j] === 1 ? cols[j].length : cols[j].c) === n ? sqB : null).then(function (j2) { return function (r) { if (r.bail) throw B26_BAIL; if (r.e.t === 'N') NMARK++; if (r.e.t === 'W') WMARK++; if (r.sb && capB) capPut(capB, keys[j2], r.sb); es[j2] = r; }; }(j)));
        cols[j] = []; continue; }
      es[j] = b28Col(pre21[j], cols[j], keys[j], zs, level, tm21, chk26, fl21[j], sqB && (pre21[j] === 1 || pre21[j] === 2) && (pre21[j] === 1 ? cols[j].length : cols[j].c) === n ? sqB : null); if (es[j].sb && capB) capPut(capB, keys[j], es[j].sb);
    }
    function finish() {
      for (j = 0; j < cols.length; j++) {
        var e = es[j].e;
        meta.cols.push({ t: e.t, p: e.p, n: e.n, f: e.z.map(function (z) { return [z[0], z[1].length, z[2]]; }), st: e.st, _z: e.z });
        for (i = 0; i < e.z.length; i++) frames.push(e.z[i][1]);
        if (es[j].zn) zone.push([fnvStr('.' + keys[j]), es[j].zn[0], es[j].zn[1], es[j].zn[2]]);
      }
    if (ord) { var oB = te.encode(JSON.stringify(ord.list)), oz = zs.compress(oB, level), od = typedColumn(ord.ids), odz = zs.compress(od[2], level); meta.ord = [oB.length, oz.length, od[0], od[2].length, odz.length]; frames.unshift(oz, odz); }
    var mB = te.encode(JSON.stringify(withColumnInfo(meta, opts, zs))), zm = zs.compress(mB, level), zp = zs.compress(planes, level);
    var hdr = te.encode(JSON.stringify({ k: 'f', n: n, m: [mB.length, zm.length], pl: [planes.length, zp.length] }));
    var out = concat([u32le(hdr.length), hdr, zm, zp].concat(frames)); return { bytes: out, rows: n, zone: zone, kind: 'f', prefix: out.length - colBytes(meta), eqf: !ord && eqWant(opts) && out.length <= NX_A_MAXB ? [keys, es.map(function (x) { return x.e; }), out.length] : 0 };   // built only for the block that is kept (eqOf)
    }
    if (wait) return { wait: Promise.all(wait).then(finish) };
    return finish();
  }
  // Text columns given as bytes ({ bytes: Uint8Array of UTF-8, start, end: one offset pair per value, value i = bytes[start[i] .. end[i]) }), as Arrow keeps text: the plain ('s') and
  // dictionary ('D') layouts are built straight from the bytes, by the same rules and with the same frames the string path builds from the same values (labels in first-seen order,
  // the count stopping where the string path stops), so the file is the same bytes and no JS string is made. Values that could take another layout (hex, UUID, IPv4: tested on the
  // first value), a 0 byte inside a value, or templates: true go through the string path instead (same file, slower).
  function isByteHolder(x) { return !!x && !ArrayBuffer.isView(x) && x.bytes instanceof Uint8Array && x.start instanceof Int32Array && x.end instanceof Int32Array; }   // since 0.15.0: the arrays a text:'bytes' read fills (unpackColumns { into: { key: { bytes, start, end } } })
  function isByteCol(x) { return !!x && !Array.isArray(x) && !ArrayBuffer.isView(x) && x.bytes instanceof Uint8Array && x.start != null && x.end != null && typeof x.start.length === 'number' && x.start.length === x.end.length; }
  function byteColStrings(bc, a, n) { var out = new Array(n), B = bc.bytes, S = bc.start, E = bc.end, i; for (i = 0; i < n; i++) out[i] = td.decode(B.subarray(S[a + i], E[a + i])); return out; }
  // byteCol kernel (from the text-columns research; source in wasm/flatscan.c: bcscan, bcdict, bcjoin): the checks, the distinct-value hash and the joins of a text column given as bytes, in WebAssembly (the template builder's instance)
  var BK = (typeof globalThis !== 'undefined' && globalThis.__BK !== undefined) ? globalThis.__BK : 1;
  function bkLoad() { if (!BK) return null; try { var K = sdw(); return K.x.bcscanw ? K : null; } catch (e) { return null; } }
  function bkPrep(K, B, S, E, a, n, HB) {
    var X = K.x, blen = B.length, p = K.heap, L = {};
    function take(z) { var r = p; p = (p + z + 15) & ~15; return r; }
    L.B = take(blen + 16); L.S = take(n * 4); L.E = take(n * 4); L.codes = take(n * 4); L.lab = take(n * 4); L.lh = take(n * 4); L.tab = take(HB * 4); L.idx = take(n * 4); L.out = take(blen + n + 16);
    if (p > 1610612736) return null;
    if (p > X.memory.buffer.byteLength) X.memory.grow(Math.ceil((p - X.memory.buffer.byteLength) / 65536));
    var buf = X.memory.buffer; new Uint8Array(buf, L.B, blen).set(B); new Int32Array(buf, L.S, n).set(S.subarray(a, a + n)); new Int32Array(buf, L.E, n).set(E.subarray(a, a + n));
    return L;
  }
  function bkJoin(K, L, rows, cnt) {
    var X = K.x, ip = 0; if (rows) { new Int32Array(X.memory.buffer, L.idx, cnt).set(rows); ip = L.idx; }
    var len = (L.w ? X.bcjoinw : X.bcjoin)(L.B, L.S, L.E, ip, cnt, L.out); return new Uint8Array(X.memory.buffer, L.out, len).slice();
  }
  function bcUniqueFixed(B, S, E, a, n) { var m = n < 8 ? n : 8, i, j, k, l = E[a] - S[a], s0, s1; for (i = 1; i < m; i++) if (E[a + i] - S[a + i] !== l) return false; for (i = 1; i < m; i++) for (j = 0; j < i; j++) { s0 = S[a + i]; s1 = S[a + j]; for (k = 0; k < l && B[s0 + k] === B[s1 + k]; k++); if (k === l) return false; } return true; }   // the first 8 values are one length and pairwise different (unique hex ids, UUIDs): only then do the 16+ even and 36 length tests keep the string path; rule from the text-columns research
  var BC_UTF8 = null;
  // dictionary column input { kind: 'dict', labels: { bytes, start, end }, ids: Uint8Array|Uint16Array|Int32Array (one label number per row) }; the block's labels are renumbered in first-seen order so the bytes equal packing the same text. Idea and first version: the parse-research thread
  function isDictCol(x) { return !!x && !Array.isArray(x) && !ArrayBuffer.isView(x) && x.kind === 'dict' && isByteCol(x.labels) && x.ids && ArrayBuffer.isView(x.ids) && typeof x.ids.length === 'number'; }
  // Typed timestamp columns (since 0.13.4): { kind: 'ts', unit: 's' | 'ms' | 'us', values: Float64Array (NaN = empty), fmt?: 'YYYY-MM-DD[T ]HH:MM:SS[.fff|.ffffff]' } is the same column as the text it stands for (the date column W, or the
  // text path's own answer when W does not apply), with no text built or parsed. Without fmt the form is T and no fraction for 's', T.fff for 'ms', T.ffffff for 'us'.
  function isTsCol(x) { return !!x && !Array.isArray(x) && !ArrayBuffer.isView(x) && x.kind === 'ts' && (x.unit === 's' || x.unit === 'ms' || x.unit === 'us') && x.values instanceof Float64Array; }
  function tsForm(x) {
    var m, f;
    if (x.fmt === undefined) return x.unit === 's' ? 1 : x.unit === 'ms' ? 0 : 4;
    m = /^YYYY-MM-DD([T ])HH:MM:SS(?:\.(f{3}|f{6}))?$/.exec(String(x.fmt)); if (!m) throw new Error('LfcPack: timestamp column fmt must be YYYY-MM-DD[T or space]HH:MM:SS with no fraction, .fff or .ffffff');
    f = !m[2] ? 1 : m[2].length === 3 ? 0 : 4; return m[1] === ' ' ? f | 2 : f;
  }
  function tsStore(x, a0, n, f) {   // the values a0..a0+n as stored numbers (ms, or us for the six-digit forms); null when one is NaN; throws when a value does not fit its form
    var v = x.values, out = new Float64Array(n), mul = x.unit === 's' ? (f & 4 ? 1e6 : 1000) : x.unit === 'ms' ? (f & 4 ? 1000 : 1) : (f & 4 ? 1 : 0.001), i, t, nan = false, lim = f & 4 ? 9007199254740991 : 253402300799999, cut = f & 1 ? (f & 4 ? 1e6 : 1000) : 1;
    for (i = 0; i < n; i++) { t = v[a0 + i]; if (t !== t) { nan = true; continue; } t *= mul;
      if (!(t >= 0 && t <= lim && t % cut === 0)) throw new Error('LfcPack: timestamp column value ' + (a0 + i) + ' is outside the years 1970 to 9999 or has more precision than its fmt'); out[i] = t; }
    return nan ? null : out;
  }
  function tsText(x, a0, n, f) {   // the text of the values (null for NaN): what a caller would have handed over as strings
    var v = x.values, mul = x.unit === 's' ? (f & 4 ? 1e6 : 1000) : x.unit === 'ms' ? (f & 4 ? 1000 : 1) : (f & 4 ? 1 : 0.001), keep = [], nums = [], i, t, out = new Array(n), txt, q = 0, lim = f & 4 ? 9007199254740991 : 253402300799999, cut = f & 1 ? (f & 4 ? 1e6 : 1000) : 1;
    for (i = 0; i < n; i++) { t = v[a0 + i]; if (t !== t) { out[i] = null; continue; } t *= mul;
      if (!(t >= 0 && t <= lim && t % cut === 0)) throw new Error('LfcPack: timestamp column value ' + (a0 + i) + ' is outside the years 1970 to 9999 or has more precision than its fmt'); keep.push(i); nums.push(t); }
    txt = nums.length ? dateCol(Float64Array.from(nums), nums.length, f) : []; for (i = 0; i < keep.length; i++) out[keep[i]] = txt[q++]; return out;
  }
  function tsCol(x, a0, n, zs, level, tmode, key) {
    var f = tsForm(x), a = tsStore(x, a0, n, f), w;
    if (a && n >= 2 && DATE_MODE && dateMany(a, n)) { w = dateWrap({ f: f, a: a }, zs, level, key); if (w) return w; }
    return encodeColumn(tsText(x, a0, n, f), zs, level, tmode, undefined, key);   // empty cells, few different values or a short column: the text path decides, so the bytes are the text's
  }
  function dictStrings(dc, a, n) { var D = dc.labels, B = D.bytes, out = new Array(n), cache = new Array(D.start.length), i, c; for (i = 0; i < n; i++) { c = dc.ids[a + i]; out[i] = cache[c] !== undefined ? cache[c] : (cache[c] = td.decode(B.subarray(D.start[c], D.end[c]))); } return out; }
  function dcUniqueFixed(D, ids, a, n) { var m = n < 8 ? n : 8, i, j, k, l = D.end[ids[a]] - D.start[ids[a]], s0, s1, B = D.bytes; for (i = 1; i < m; i++) if (D.end[ids[a + i]] - D.start[ids[a + i]] !== l) return false; for (i = 1; i < m; i++) for (j = 0; j < i; j++) { s0 = D.start[ids[a + i]]; s1 = D.start[ids[a + j]]; for (k = 0; k < l && B[s0 + k] === B[s1 + k]; k++); if (k === l) return false; } return true; }   // bcUniqueFixed on a dictionary column's first values
  // Shared label tables (since 0.13.0): a dictionary column that a caller hands over whole (packBlock, { kind: 'dict', labels, ids }) and that is cut into several blocks writes its labels once, in a footer table (section 19)
  // named by the XXH64 of the labels joined by 0; each block's 'D' layout then carries p.sh (the name) and only the piece-wide codes. SHW is the table list of the piece being written (set around the block calls).
  var SHW = null;
  function setSHW(x) { var o = SHW; SHW = x; return o; }
  function DL(p, f) { return p.sh ? labsOf(p.sh) : tdr.decode(f).split('\0'); }
  function shJoin(dc, hi) {   // the labels joined by 0 and their name, or null when this column cannot be shared
    var D = dc.labels, B = D.bytes, S = D.start, E = D.end, NL = S.length, len = 0, i, p = 0, o, j, id;
    if (!(S3_OK && NL > 1)) return null;
    for (i = 0; i < NL; i++) len += E[i] - S[i];
    o = new Uint8Array(len + NL - 1); for (i = 0; i < NL; i++) { if (i) o[p++] = 0; o.set(B.subarray(S[i], E[i]), p); p += E[i] - S[i]; }
    if ((hi & 128) && !utf8Valid(o)) return null;
    try { id = hash(o, 'xxh64'); } catch (e2) { return null; }
    return { j: o, id: id, n: NL };
  }
  var S3_OK = true;
  function byteColDict(dc, a, n, zs, level, tmode, key) {
    var D = dc.labels, B = D.bytes, S = D.start, E = D.end, NL = S.length, codes = dc.ids, i, k, s, e, hi = 0, best = null;
    var fb = function () { return encodeColumn(dictStrings(dc, a, n), zs, level, tmode, undefined, key); };
    if (!n || tmode === 2) return fb();
    for (i = 0; i < NL; i++) { s = S[i]; e = E[i]; if (!(s >= 0 && e >= s && e <= B.length)) throw new Error('LfcPack: text column "' + key + '": label ' + i + ' has offsets outside its bytes'); for (k = s; k < e; k++) { if (B[k] === 0) return fb(); hi |= B[k]; } }
    var c0 = codes[a]; if (!(c0 >= 0 && c0 < NL)) throw new Error('LfcPack: text column "' + key + '": code out of range');
    s = S[c0]; e = E[c0]; var L0 = e - s, ip = L0 >= 7 && L0 <= 15, dots = 0;
    for (k = s; k < e && ip; k++) { if (B[k] === 46) dots++; else if (B[k] < 48 || B[k] > 57) ip = false; }
    if ((((L0 >= 16 && (L0 & 1) === 0) || L0 === 36) && dcUniqueFixed(D, codes, a, n)) || (ip && dots === 3)) { var asc0 = true; for (k = s; k < e; k++) if (B[k] > 127) asc0 = false; if (asc0) return fb(); }
    var cap = tmode && n >= 16 && !(tmode === 1 && tmplSlow) ? 2 : 4;
    if (cap === 2) return fb();
    if (FAST_ON && FLT !== null) level = FLT;   // fast: text frames at the faster zstd level, as the string path does
    if (FAST_ON && FSK && n >= 4096 && manyDistinctDC(dc, a)) return fb();
    if (SHW && n < codes.length && NL * 4 <= codes.length && NL < 65536) {   // a block of a bigger piece: the labels go once into the piece's table, the codes stay the piece's own
      var sj = dc.__shj; if (sj === undefined) { sj = dc.__shj = shJoin(dc, hi); }
      if (sj && NL > 256) {   // wider piece-wide codes than the block needs: share only when the labels saved pay for the extra code bits (taxi fares)
        var sn = new Uint8Array(NL), nd = 0, lbb = 0, ex;
        for (i = 0; i < n; i++) { ex = codes[a + i]; if (ex >= 0 && ex < NL && !sn[ex]) { sn[ex] = 1; nd++; lbb += E[ex] - S[ex] + 1; } }
        if (((32 - Math.clz32(NL - 1)) - Math.max(1, 32 - Math.clz32(nd - 1))) * n / 8 > lbb * 0.25) sj = null;
      }
      if (sj) {
        if (!SHW.tabs[sj.id]) { SHW.tabs[sj.id] = sj; SHW.n++; }
        var cg = new Array(n), cx, wg = Math.max(1, 32 - Math.clz32(NL - 1)), cbg, bestg = null;
        for (i = 0; i < n; i++) { cx = codes[a + i]; if (!(cx >= 0 && cx < NL)) throw new Error('LfcPack: text column "' + key + '": code out of range'); cg[i] = cx; }
        if (NL > 256) { var u16g = new Uint16Array(n); for (i = 0; i < n; i++) u16g[i] = cg[i]; cbg = new Uint8Array(u16g.buffer); } else { cbg = new Uint8Array(n); for (i = 0; i < n; i++) cbg[i] = cg[i]; }
        bestg = addCand(zs, level, bestg, 'D', { w: 0, wide: NL > 256, sh: sj.id }, [new Uint8Array(0), cbg], n, { distinct: NL });
        bestg = addCand(zs, level, bestg, 'D', { w: wg, wide: false, sh: sj.id }, [new Uint8Array(0), bitpack(cg, wg)], n, { distinct: NL });
        return settle(zs, level, bestg);
      }
    }
    var map = new Int32Array(NL).fill(-1), lab = [], cc = new Int32Array(n), c;
    for (i = 0; i < n; i++) { c = codes[a + i]; if (!(c >= 0 && c < NL)) throw new Error('LfcPack: text column "' + key + '": code out of range'); if (map[c] < 0) { if (lab.length * 4 > n) return fb(); map[c] = lab.length; lab.push(c); } cc[i] = map[c]; }
    var nl = lab.length; if (nl * 4 > n || nl >= 65536) return fb();
    if (hi & 128) { if (!BC_UTF8) BC_UTF8 = new TextDecoder('utf-8', { fatal: true }); for (i = 0; i < nl; i++) try { BC_UTF8.decode(B.subarray(S[lab[i]], E[lab[i]])); } catch (er) { throw new Error('LfcPack: text column "' + key + '" is not valid UTF-8'); } }
    var len = 0, j, p = 0, o; for (j = 0; j < nl; j++) len += E[lab[j]] - S[lab[j]]; o = new Uint8Array(len + (nl ? nl - 1 : 0)); for (j = 0; j < nl; j++) { if (j) o[p++] = 0; o.set(B.subarray(S[lab[j]], E[lab[j]]), p); p += E[lab[j]] - S[lab[j]]; }
    var lb = o, wd = Math.max(1, 32 - Math.clz32(nl - 1)), cb, ca = new Array(n);
    for (i = 0; i < n; i++) ca[i] = cc[i];
    if (nl > 256) { var u16 = new Uint16Array(n); for (i = 0; i < n; i++) u16[i] = cc[i]; cb = new Uint8Array(u16.buffer); } else { cb = new Uint8Array(n); for (i = 0; i < n; i++) cb[i] = cc[i]; }
    function cand(t, p2, frames, st) { best = addCand(zs, level, best, t, p2, frames, n, st); }
    cand('D', { w: 0, wide: nl > 256 }, [lb, cb], { distinct: nl });
    cand('D', { w: wd, wide: false }, [lb, bitpack(ca, wd)], { distinct: nl });
    return settle(zs, level, best);
  }
  function byteCol(bc, a, n, zs, level, tmode, key) {
    var B = bc.bytes, S = bc.start, E = bc.end, BL = B.length, i, k, s, e, tot = 0, hi = 0, best = null;
    var bk = n >= 16 ? bkLoad() : null, KL = null, wide = false, fl = 0, HB = 1 << Math.max(10, Math.min(20, 32 - Math.clz32(n * 2)));
    if (bk) { for (i = 0, k = n < 64 ? n : 64, s = 0; i < k; i++) s += E[a + i] - S[a + i]; wide = s >= k * 16;   // values of 16 bytes or more on average (first 64 sampled): the 16-byte-at-a-time scan, 8-byte hash and memory.copy join; short values keep the byte loops, which are faster for them
      KL = bkPrep(bk, B, S, E, a, n, HB); if (KL) { KL.w = wide; fl = (wide ? bk.x.bcscanw : bk.x.bcscan)(KL.B, BL, KL.S, KL.E, n); if (fl & 3) KL = null; else { hi = fl & 4 ? 128 : 0; tot = bk.x.bctot(); } } }
    if (!KL) { for (i = 0; i < n; i++) { s = S[a + i]; e = E[a + i]; if (!(s >= 0 && e >= s && e <= BL)) throw new Error('LfcPack: text column "' + key + '": value ' + (a + i) + ' has offsets outside its bytes'); for (k = s; k < e; k++) { if (B[k] === 0) return encodeColumn(byteColStrings(bc, a, n), zs, level, tmode, undefined, key); hi |= B[k]; } tot += e - s; } }
    if (n >= 2 && DATE_MODE) { var dnC = dateNumsBC(B, S, E, a, n), wC = dnC && dateWrap(dnC, zs, level, key); if (wC) return wC; }
    if (!n || tmode === 2) return encodeColumn(byteColStrings(bc, a, n), zs, level, tmode, undefined, key);
    s = S[a]; e = E[a]; var L0 = e - s, ip = L0 >= 7 && L0 <= 15, dots = 0;
    for (k = s; k < e && ip; k++) { if (B[k] === 46) dots++; else if (B[k] < 48 || B[k] > 57) ip = false; }
    if ((((L0 >= 16 && (L0 & 1) === 0) || L0 === 36) && bcUniqueFixed(B, S, E, a, n)) || (ip && dots === 3)) { var asc0 = true; for (k = s; k < e; k++) if (B[k] > 127) asc0 = false; if (asc0) return encodeColumn(byteColStrings(bc, a, n), zs, level, tmode, undefined, key); }
    var cap = tmode && n >= 16 && !(tmode === 1 && tmplSlow) ? 2 : 4;
    if (cap === 2) return encodeColumn(byteColStrings(bc, a, n), zs, level, tmode, undefined, key);   // the template layout can be tried: the string path decides
    if (FAST_ON && FLT !== null) level = FLT;   // fast: text frames at the faster zstd level, as the string path does
    // distinct values, first-seen order, stopping where the string path's Map count stops (labels * 4 > n at a new value)
    var head = new Int32Array(KL ? 1 : HB).fill(-1), nxt = [], lab = [], codes = new Int32Array(n), stop = FAST_ON && FSK && n >= 4096 && manyDistinctBC(B, S, E, a), h, c, q, ls, le, m;   // fast: a column whose first 1,024 values are nearly all different skips the dictionary count (the string path decides the same way)
    if (stop) { }
    else if (KL) { var X = bk.x; new Uint32Array(X.memory.buffer, KL.tab, HB).fill(0); var r0 = (KL.w ? X.bcdictw : X.bcdict)(KL.B, KL.S, KL.E, n, KL.codes, KL.lab, KL.lh, KL.tab, HB) >>> 0; if (r0 === 0xFFFFFFFF) stop = true; else { var bf = X.memory.buffer; lab = Array.from(new Int32Array(bf, KL.lab, r0)); codes = new Int32Array(bf, KL.codes, n).slice(); } }
    else for (i = 0; i < n; i++) {
      s = S[a + i]; e = E[a + i]; h = 2166136261; for (k = s; k < e; k++) h = Math.imul(h ^ B[k], 16777619); h = (h ^ (e - s)) >>> 0;
      c = head[h & (HB - 1)];
      while (c >= 0) { ls = S[a + lab[c]]; le = E[a + lab[c]]; if (le - ls === e - s) { for (m = 0; m < e - s && B[ls + m] === B[s + m]; m++); if (m === e - s) break; } c = nxt[c]; }
      if (c < 0) { if (lab.length * 4 > n) { stop = true; break; } c = lab.length; lab.push(i); nxt.push(head[h & (HB - 1)]); head[h & (HB - 1)] = c; }
      codes[i] = c;
    }
    function joinOf(idx, cnt) { var len = 0, j, p = 0, o; for (j = 0; j < cnt; j++) len += E[a + idx(j)] - S[a + idx(j)]; o = new Uint8Array(len + (cnt ? cnt - 1 : 0)); for (j = 0; j < cnt; j++) { if (j) o[p++] = 0; var x = S[a + idx(j)], y = E[a + idx(j)]; if (y - x > 16) { o.set(B.subarray(x, y), p); p += y - x; } else while (x < y) o[p++] = B[x++]; } return o; }
    function utf8Check(u) { if ((hi & 128) && !utf8Valid(u)) throw new Error('LfcPack: text column "' + key + '" is not valid UTF-8'); }
    function cand(t, p, frames, st) { best = addCand(zs, level, best, t, p, frames, n, st); }
    var nl = lab.length;
    if (stop || nl * 4 > n || nl >= 65536) { var all = KL ? bkJoin(bk, KL, null, n) : joinOf(function (j) { return j; }, n); utf8Check(all); cand('s', {}, dlOf([all], nl)); return settle(zs, level, best); }
    var lb = KL ? bkJoin(bk, KL, lab, nl) : joinOf(function (j) { return lab[j]; }, nl); utf8Check(lb);   // B73: every value is one of the labels, so checking the distinct values checks them all
    var wd = Math.max(1, 32 - Math.clz32(nl - 1)), cb, ca = new Array(n);
    for (i = 0; i < n; i++) ca[i] = codes[i];
    if (nl > 256) { var u16 = new Uint16Array(n); for (i = 0; i < n; i++) u16[i] = codes[i]; cb = new Uint8Array(u16.buffer); } else { cb = new Uint8Array(n); for (i = 0; i < n; i++) cb[i] = codes[i]; }
    cand('D', { w: 0, wide: nl > 256 }, [lb, cb], { distinct: nl });
    cand('D', { w: wd, wide: false }, [lb, bitpack(ca, wd)], { distinct: nl });
    return settle(zs, level, best);
  }
  // Well-formed UTF-8 (the same bytes TextDecoder fatal accepts: no overlongs, no surrogates, nothing past U+10FFFF), checked in place: no string is made (since 0.26.7; from the Workbench thread: Wikimedia H4 import 9% quicker in Chromium). ASCII runs go 4 bytes at a time.
  function utf8Valid(u) {
    var n = u.length, i = 0, w = null, wb = 0, off = u.byteOffset, c, c1, c2, c3, k, m;
    if (n >= 64) { wb = off & ~3; w = new Uint32Array(u.buffer, wb, (off + n - wb) >> 2); }   // whole words of the buffer: an ASCII run is read 4 bytes at a time whatever the view's offset
    while (i < n) {
      c = u[i];
      if (c < 128) {
        if (w !== null && ((off + i) & 3) === 0) { k = (off + i - wb) >> 2; m = w.length; while (k < m && (w[k] & 0x80808080) === 0) k++; i = (k << 2) + wb - off; if (i >= n) break; c = u[i]; if (c < 128) { i++; continue; } }
        else { i++; continue; }
      }
      if (c < 0xC2) return false;
      if (c < 0xE0) { if (i + 1 >= n || (u[i + 1] & 0xC0) !== 0x80) return false; i += 2; continue; }
      if (c < 0xF0) { if (i + 2 >= n) return false; c1 = u[i + 1]; c2 = u[i + 2]; if ((c1 & 0xC0) !== 0x80 || (c2 & 0xC0) !== 0x80 || (c === 0xE0 && c1 < 0xA0) || (c === 0xED && c1 > 0x9F)) return false; i += 3; continue; }
      if (c < 0xF5) { if (i + 3 >= n) return false; c1 = u[i + 1]; c2 = u[i + 2]; c3 = u[i + 3]; if ((c1 & 0xC0) !== 0x80 || (c2 & 0xC0) !== 0x80 || (c3 & 0xC0) !== 0x80 || (c === 0xF0 && c1 < 0x90) || (c === 0xF4 && c1 > 0x8F)) return false; i += 4; continue; }
      return false;
    }
    return true;
  }
  var B28_MIN = 8192;
  // B74p6: a Float64Array column with NaN (an empty cell) becomes the numbers-and-nulls state the row loop builds ({ nb: the numbers, np: null plane, m, c }), in one pass: the same bytes as a plain array with nulls, without the generic path (7-9x slower in Chromium and Firefox)
  var NANFL = null;   // the flags the kernel computed for the column nanSplit just found free of NaN (so b28Col does not read the column again)
  function nanSplit(v, n, pb) { var i, m = 0, np = null, o; NANFL = null; if (n >= NK_MIN && v instanceof Float64Array) { var f0 = nkFlags(v, n); if (!f0.nf) { NANFL = f0; return null; } } for (i = 0; i < n; i++) if (v[i] !== v[i]) break; if (i === n) return null; o = new Float64Array(n); np = new Uint8Array(pb); for (i = 0; i < n; i++) { if (v[i] !== v[i]) np[i >> 3] |= 1 << (i & 7); else o[m++] = v[i]; } return { a: null, nb: o, np: np, m: m, c: n }; }
  // B34 (research): a block given as columns ({ keys, A: one array per key, a, b }) fills the same column state the B21a row loop builds, with no row objects. Every row holds every key.
  function b34Fill(ci, n, pb, keys, seen, cols, cs21, pls) {
    var full = new Uint8Array(pb), j, i, x, c21, arr, a = ci.a; full.fill(255); if (n & 7) full[pb - 1] = (1 << (n & 7)) - 1;
    for (j = 0; j < ci.keys.length; j++) { keys.push(ci.keys[j]); seen.set(ci.keys[j], j); cols.push(null); pls.push(full); arr = ci.A[j];
      if (isDictCol(arr)) { cs21.push({ a: null, nb: null, np: null, m: 0, c: n, bc: arr, a0: a, dc: true }); continue; }
      if (isTsCol(arr)) { cs21.push({ a: null, nb: null, np: null, m: 0, c: n, bc: arr, a0: a, ts: true }); continue; }
      if (isByteCol(arr)) { cs21.push({ a: null, nb: null, np: null, m: 0, c: n, bc: arr, a0: a }); continue; }   // a text column as UTF-8 bytes plus value offsets: encoded from the bytes (byteCol), no strings
      if (!Array.isArray(arr)) { if (ci.view && arr instanceof Float64Array) { var vw = arr.subarray(a, a + n); c21 = nanSplit(vw, n, pb); cs21.push(c21 || { a: null, nb: vw, np: null, m: n, c: n, fl: NANFL }); continue; } c21 = { a: null, nb: new Float64Array(n), np: null, m: n, c: n }; c21.nb.set(arr.subarray(a, a + n)); c21 = nanSplit(c21.nb, n, pb) || c21; cs21.push(c21); continue; }   // ci.view (packBlock(columns), no helpers): a Float64Array is read in place, not copied   // a typed number column: one copy, no per-value work
      c21 = { a: null, nb: new Float64Array(n), np: null, m: 0, c: 0 }; cs21.push(c21);
      for (i = 0; i < n; i++) { x = arr[a + i];
        if (c21.a !== null) c21.a.push(x); else if (typeof x === 'number') { c21.nb[c21.m++] = x; c21.c++; } else if (x === null) { if (c21.np === null) c21.np = new Uint8Array(pb); c21.np[c21.c >> 3] |= 1 << (c21.c & 7); c21.c++; } else { c21.a = b21Generic(c21); c21.a.push(x); c21.nb = null; } } }
  }
  // one column of the general flat writer, as writeFlatBlock0 encodes it: pre 1 = a typed number column, 2 = numbers and nulls ({ nb, np, m, c }), else a generic array; -> { e, zn: zone entry [min, max, count] or null }
  function nz0(pre, a) { var v = pre === 2 ? a.nb.slice(0, a.m) : new a.constructor(a), i; for (i = 0; i < v.length; i++) if (v[i] === 0) v[i] = 0; return pre === 2 ? { a: a.a, nb: v, np: a.np, m: a.m, c: a.c } : v; }   // a copy with every -0 made 0 (the caller's arrays are never changed)
  function b28Col(pre, a, key, zs, level, tm21, chk26, pf, sq) {   // sq (since 0.15.0): { a0, R } when the save wants this block's part of the column summary (blockStats), read before the column is encoded
    var e, fl = null, zn = null, i, mn, mx, c21, sb = null, rr, k;
    if (sq && pre === 1) sb = blockStats(a, a.length, sq.a0, sq.R);
    else if (sq && pre === 2) { rr = new Float64Array(a.c); for (i = 0, k = 0; i < a.c; i++) rr[i] = a.np && (a.np[i >> 3] >> (i & 7) & 1) ? NaN : a.nb[k++]; sb = blockStats(rr, a.c, sq.a0, sq.R); }
    NKD.want = !!sb && sb.dtw === sb.dtw && sb.dtw !== false; NKD.lo = NKD.want ? sb.dtw : 0; NKD.res = null;
    if (pre === 1) fl = pf || b21Flags(a, a.length); else if (pre === 2) fl = b21Flags(a.nb, a.m);
    if (chk26 && fl && fl.nz && !fl.nf && (pre === 1 || pre === 2)) return b28Col(pre, nz0(pre, a), key, zs, level, tm21, chk26, undefined, sq);   // since 0.26.13: -0 is stored as 0, as the text path (JSON) always did, instead of sending the whole block down the text path
    if (chk26 && fl && (fl.nz || fl.nf)) throw B26_BAIL;
    if (pre === 2) { c21 = a; NN_FLAGS[0] = fl.nz; NN_FLAGS[1] = fl.ai; e = nullNumBest({ nn: c21.nb.subarray(0, c21.m), pl: c21.np, m: c21.m, nz: fl.nz, ai: fl.ai }, null, c21.c, zs, level, tm21, key); if (!e) e = encodeColumn(b21Generic(c21), zs, level, tm21, undefined, key); a = []; }
    else if (pre === 3) e = a.ts ? tsCol(a.bc, a.a0, a.c, zs, level, tm21, key) : a.dc ? byteColDict(a.bc, a.a0, a.c, zs, level, tm21, key) : byteCol(a.bc, a.a0, a.c, zs, level, tm21, key);
    else if (pre === 1) e = settle(zs, level, encodeColumn0(a, zs, level, tm21, undefined, key, fl));
    else e = encodeColumn(a, zs, level, tm21, undefined, key);
    NK_BUF = null; if (NKD.res && sb) sb.dt = NKD.res; NKD.want = false; NKD.res = null;
    if (e.t === 'N' && (e.p.t === 'V' || e.p.t === 'B' || e.p.t === 'F') && e.nn.length) { mn = Infinity; mx = -Infinity; if (NKZ.v === e.nn) { mn = NKZ.mn; mx = NKZ.mx; i = e.nn.length; } else i = 0; for (; i < e.nn.length; i++) { if (e.nn[i] < mn) mn = e.nn[i]; if (e.nn[i] > mx) mx = e.nn[i]; } zn = [mn, mx, e.n]; }
    if ((e.t === 'V' || e.t === 'B' || e.t === 'F') && a.length) { mn = Infinity; mx = -Infinity; if (NKZ.v === a) { mn = NKZ.mn; mx = NKZ.mx; i = a.length; } else i = 0; for (; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; } zn = [mn, mx, a.length]; }
    return { e: e, zn: zn, sb: sb };
  }
  function b28Job(m) {   // in a helper: one column -> { msg, transfer }
    try {
      var a = m.pre === 2 ? { nb: m.nb, np: m.np, m: m.m, c: m.c } : m.nb, r; B18_ALLV = true;
      try { r = b28Col(m.pre, a, m.key, S.zfull, m.level, m.tm, m.chk, undefined, m.sq); } finally { B18_ALLV = false; }
      var e = r.e; return { msg: { id: m.id, e: { t: e.t, p: e.p, n: e.n, z: e.z, st: e.st }, zn: r.zn, sb: r.sb }, transfer: sbMoves(r.sb) };
    } catch (er) { if (er === B26_BAIL) return { msg: { id: m.id, bail: 1 }, transfer: [] }; return { msg: { id: m.id, error: String(er && er.message || er) }, transfer: [] }; }
  }
  // ---- flat writer, fast path (flatscan.c): rows whose values are all numbers or arrays of whole numbers are read straight from the text bytes in wasm, no JSON.parse; anything else returns null and the JSON.parse path runs
  function dropSmallWasm() { BDX = null; TPLW = null; FSW = null; NKW = null; NK_SRC = null; NK_N = -1; NK_BUF = null; NKZ.v = null; }   // trim(): the template and flat-scan helpers start again small when next needed
  var FSW = null, FSB64 = "/*FS:BEGIN*//*FS:END*/", FSP64 = "/*FP:BEGIN*//*FP:END*/";
  function fsw() {
    if (FSW) return FSW;
    var fk = hasSimd() ? 'FSB64' : 'FSP64';   // flatscan.wasm counts with SIMD; flatscan-plain.wasm is the same code without it (same results)
    if (!MODS[fk]) MODS[fk] = new WebAssembly.Module(fromB64(fk === 'FSB64' ? FSB64 : FSP64));
    var x = new WebAssembly.Instance(MODS[fk], {}).exports;
    return (FSW = { x: x, heap: x.__heap_base.value });
  }
  // B25 (research): number-column kernel (numcol in flatscan.c) on its own instance of the flat-scan module, so it never meets the fast writer's memory
  var NKW = null, NK_MIN = (typeof globalThis !== 'undefined' && globalThis.__NKMIN !== undefined) ? globalThis.__NKMIN : 64, NKR = { mono: false, mn: 0, mx: 0, a: null, d: null, b: null, w: 0 };
  function nkw() {
    if (NKW) return NKW;
    fsw(); var fk = hasSimd() ? 'FSB64' : 'FSP64', x = new WebAssembly.Instance(MODS[fk], {}).exports;
    return (NKW = { x: x, heap: (x.__heap_base.value + 7) & ~7, f: null, r: null });
  }
  var NK_SRC = null, NK_N = -1, NK_BUF = null, NK_OFF = -1, NKZ = { v: null, mn: 0, mx: 0 };   // the array (and length) now in the kernel's input, and the last kernel column's min and max in its own units (for the zone maps)
  function nkLoad(a, n) {
    var K = nkw(), mem = K.x.memory, need = K.heap + n * 35 + 256 + 229536, have = mem.buffer.byteLength;   // + room for numcolc's value table (keys 64 KB, counts 32 KB, plus numcolc's window 128 KB) so it never grows memory under a live view
    if (need > have) mem.grow(Math.ceil((need - have) / 65536));
    if (a !== NK_SRC || n !== NK_N) {   // B25d: the same typed array memory (a view of it) is not copied again; the cache is cleared after each column
      if (a.buffer !== undefined && a.buffer === NK_BUF && a.byteOffset === NK_OFF && n === NK_N) NK_SRC = a;
      else { new Float64Array(mem.buffer, K.heap, n).set(n === a.length ? a : a.subarray(0, n)); NK_SRC = a; NK_N = n; NK_BUF = a.buffer !== undefined ? a.buffer : null; NK_OFF = a.byteOffset; } }
    return K;
  }
  var NKD = { want: false, lo: 0, res: null };   // since 0.26.6: one column's value counts for the summary's exact table, counted by the kernel in its encoding pass (numcolc); lo: a low value of the block's sorted sample (the start of the direct-count window)
  function nkKeep(c, buf) {   // the candidates kept (best and the chain behind it): frames still in the kernel's memory (nkRun views) copied out, with their compression memo, before the kernel runs again
    var q, f, g, m, z; if (!buf) return;
    for (; c; c = c.next) {   // every candidate still referenced (best, then each one it replaced)
      for (q = 0; q < c.fr.length; q++) { f = c.fr[q]; if (f.buffer !== buf) continue; g = f.slice(); m = Z_MEMO && Z_MEMO.get(f); if (m) Z_MEMO.set(g, m); c.fr[q] = g;
        if (c.z) for (z = 0; z < c.z.length; z++) if (c.z[z][1] === f) c.z[z][1] = g; } }
  }
  function nkFlags(a, m) { var K = nkLoad(a, m), resP = K.heap + m * 8; K.x.numflags(K.heap, m, resP); var r = new Float64Array(K.x.memory.buffer, resP, 3); return { nz: r[0], ai: r[1], nf: r[2] }; }
  function nkRun(base, n, mode, csc, vw) {   // vw (since 0.26.8): the frames as views of the kernel's memory, for numGeneral, which copies only the ones it keeps (nkKeep)
     // -> NKR filled: the stats and the candidate frames (copies); csc (since 0.26.6): the column's scale when the summary wants every value's count (NKD.res)
    var K = nkw(), x = K.x, mem = x.memory, inP, resP, outP, tot, cP, kP, nP, dP, j, h, d;
    if (base.buffer === mem.buffer && base.byteOffset >= K.heap + n * 35 + 256 && base.byteOffset + n * 8 + 229536 <= mem.buffer.byteLength) inP = base.byteOffset;   // since 0.26.6: whole numbers decimalScaleW left in the kernel's memory are read where they are (no copy to the heap)
    else { K = nkLoad(base, n); inP = K.heap; }
    resP = K.heap + n * 8; outP = resP + 128;
    if (csc && x.numcolc) { cP = (Math.max(K.heap + n * 35 + 256, inP + n * 8) + 7) & ~7; kP = cP + 32; nP = kP + 8 * 8192; dP = nP + 4 * 8192;   // nkLoad keeps this room
      j = new Uint32Array(mem.buffer, cP, 3); j[0] = 8192; j[1] = 32768; j[2] = SUM_QE; new Float64Array(mem.buffer, cP + 16, 1)[0] = Math.round(NKD.lo * csc) - 256 || 0;
      tot = x.numcolc(inP, n, outP, resP, mode, cP, kP, nP, dP); d = new Float64Array(mem.buffer, resP, 12)[11];
      if (d > 0) { var ks = new Float64Array(mem.buffer, kP, 8192), cs = new Uint32Array(mem.buffer, nP, 8192), ov = new Float64Array(d), oc = new Int32Array(d);
        for (h = 0, j = 0; h < 8192; h++) if (cs[h]) { ov[j] = ks[h] / csc; oc[j++] = cs[h]; }
        NKD.res = { v: ov, n: oc }; } }
    else tot = x.numcol(inP, n, outP, resP, mode);
    var r = new Float64Array(mem.buffer, resP, 11), u = new Uint8Array(mem.buffer, outP, tot), A = r[3], B = r[4], oa = r[8], od = r[9], ob = r[10];
    NKR.mono = r[0] === 1; NKR.mn = r[1]; NKR.mx = r[2]; NKR.w = r[5];
    NKR.a = A >= 0 ? (vw ? u.subarray(oa, oa + A) : u.slice(oa, oa + A)) : null;
    NKR.d = B >= 0 ? (vw ? u.subarray(od, od + B) : u.slice(od, od + B)) : null;
    NKR.b = NKR.w ? (vw ? u.subarray(ob, tot) : u.slice(ob, tot)) : null;
    NK_SRC = null; NK_BUF = null;   // the input is only reused between a column's flags and its kernel call
    return NKR;
  }
  // FD: a number column's scale is 10 to its largest fraction digit count, at least 100 for 1 or 2 digits (as before: same files), up to 9 digits like the JSON.parse path
  var P10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9], FD = [0, 2, 2, 3, 4, 5, 6, 7, 8, 9], FSTD = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  function varintsT(a, m) {   // a: typed array of non-negative whole numbers (first m entries) -> varint bytes
    var n = 0, i, u, o, p = 0;
    for (i = 0; i < m; i++) { u = a[i]; n++; if (u >= 128) { n++; if (u >= 16384) { n++; if (u >= 2097152) { n++; if (u >= 268435456) { var w = Math.floor(u / 268435456); n++; while (w >= 128) { n++; w = Math.floor(w / 128); } } } } } }
    o = new Uint8Array(n);
    for (i = 0; i < m; i++) { u = a[i]; if (u < 2147483648) { while (u >= 128) { o[p++] = (u & 127) | 128; u >>>= 7; } o[p++] = u; } else { while (u >= 128) { o[p++] = (u % 128) | 128; u = Math.floor(u / 128); } o[p++] = u; } }
    return o;
  }
  function repeats(a, c) {   // do at most half as many distinct values as entries appear (counts a sample of up to 65,536 entries)
    var m = Math.min(c, 65536), seen = new Set(), i;
    for (i = 0; i < m; i++) seen.add(a[i]);
    return seen.size * 2 <= m;
  }
  // the fast writer's per-value passes over number and list columns, as small functions: inside the very large writer function SpiderMonkey ran these loops 4 to 8 times slower than Chromium
  var NST = new Float64Array(3);
  function numStats(b, c, r) { var mono = c > 0 && b[0] >= 0, mn = Infinity, mx = -Infinity, i, v; for (i = 0; i < c; i++) { v = b[i]; if (i && v < b[i - 1]) mono = false; if (v < mn) mn = v; if (v > mx) mx = v; } r[0] = mono ? 1 : 0; r[1] = mn; r[2] = mx; }
  function numFirst(b, c, mono) { var d = new Float64Array(c), i; if (mono) { d[0] = b[0]; for (i = 1; i < c; i++) d[i] = b[i] - b[i - 1]; } else for (i = 0; i < c; i++) d[i] = b[i] >= 0 ? b[i] * 2 : -b[i] * 2 - 1; return d; }
  function numDeltaZz(b, c) { var dz = new Float64Array(c), i, q; dz[0] = b[0] >= 0 ? b[0] * 2 : -b[0] * 2 - 1; for (i = 1; i < c; i++) { q = b[i] - b[i - 1]; dz[i] = q >= 0 ? q * 2 : -q * 2 - 1; } return dz; }
  function vlenSum(a, c) { var s = 0, i; for (i = 0; i < c; i++) s += vlen(a[i]); return s; }
  function numOff(b, c, mn) { var off = new Uint32Array(c), i; for (i = 0; i < c; i++) off[i] = b[i] - mn; return off; }
  function numDiv(b, c, scale) { var f = new Float64Array(c), i; for (i = 0; i < c; i++) f[i] = b[i] / scale; return f; }
  function listAsc(ln, dl, c) { var asc = true, ai = 0, i, q, v, pv; for (i = 0; i < c; i++) { pv = 0; for (q = 0; q < ln[i]; q++) { v = dl[ai + q]; if (v < pv) asc = false; pv = v; } ai += ln[i]; } return asc; }
  function listDeltas(ln, dl, c, asc) { var dd = new Float64Array(dl.length), ai = 0, i, q, v, pv; for (i = 0; i < c; i++) { pv = 0; for (q = 0; q < ln[i]; q++) { v = dl[ai + q]; dd[ai + q] = asc ? v - pv : (v - pv >= 0 ? (v - pv) * 2 : -(v - pv) * 2 - 1); pv = v; } ai += ln[i]; } return dd; }
  var B18_ALLV = false;   // B18b: set while the row-object path encodes a block
  function writeFlatBlockFast(ctx, input, opts) {
    if (opts.exact || typeof WebAssembly !== 'object' || input.length < 64) return null;
    if (!opts.pre && input.length > 262144) {   // cheap bail: try the first 64 KB (up to a line end) before copying a whole block into wasm
      var cut = input.subarray(0, 65536).lastIndexOf(10);
      if (cut > 0 && !writeFlatBlockFast(ctx, input.subarray(0, cut + 1), Object.assign({}, opts, { pre: true }))) return null;
    }
    FAST_ON = opts.fast === undefined ? FAST_DEFAULT : !!opts.fast; var clv = 0;
    var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, W = fsw(), len = input.length, o = (W.heap + 15) & ~15, P = {}, q, i, j, c, nrows;
    function lay(name, bytes) { P[name] = o; o = (o + bytes + 15) & ~15; }
    lay('in', len + 8); lay('cnt', 16);
    var mem = W.x.memory; if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
    var m8 = new Uint8Array(mem.buffer); m8.set(input, P['in']);
    var cn = new Uint32Array(mem.buffer, P.cnt, 4), nl = 0, colons = 0, commas = 0, allowStr = 2, asciiIn = true, ca;
    for (ca = 0; ca < len; ca += 262144) { W.x.count(P['in'] + ca, Math.min(262144, len - ca), P.cnt); nl += cn[0]; colons += cn[1]; commas += cn[2]; if (cn[3]) asciiIn = false; }   // 256 KB a call, like scan
    nrows = nl + (input[len - 1] === 10 ? 0 : 1);
    var pb = (nrows + 7) >> 3, NK = 128, cells = colons + 1, lvals = commas + colons + 16;
    lay('planes', NK * pb); lay('keyoff', 4 * NK); lay('keylen', 4 * NK); lay('ktype', NK); lay('kfd', NK); lay('st', 32); lay('ckey', cells); lay('cval', 8 * cells); lay('cfd', cells); lay('llen', 4 * cells); lay('lval', 4 * lvals); lay('clen', 4 * cells); lay('gcnt', 4 * NK); lay('gtot', 4 * NK); lay('goff', 4 * NK); lay('gout', 8 * cells);
    if (o > 1610612736) return null;
    if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536));
    m8 = new Uint8Array(mem.buffer); m8.fill(0, P.planes, P.planes + NK * pb);
    var rc = 100, sp = 0; while (rc === 100) { sp += 262144; rc = W.x.scan(P['in'], len, nrows, P.planes, pb, P.keyoff, P.keylen, P.ktype, P.kfd, P.st, P.ckey, P.cval, P.cfd, P.llen, P.lval, P.clen, allowStr, sp === 262144 ? 1 : 0, sp); }   // 256 KB a call (see scan in flatscan.c)
    if (rc !== 0) return null;
    var st = new Uint32Array(mem.buffer, P.st, 8), nk = st[0], nc = st[1], nlist = st[2], nlv = st[3];
    if (opts.noLists && nlist) return null;
    // scratch for text columns (hex ids, dictionaries, joined values), laid out only when the block has a text column: number-only blocks keep their wasm memory smaller
    var hasStr = 0, kt0 = new Uint8Array(mem.buffer, P.ktype, nk); for (j = 0; j < nk; j++) if (kt0[j] === 3) hasStr = 1;
    var has7 = 0; for (j = 0; j < nk; j++) if (kt0[j] === 7) has7 = 1;   // B3b: mixed-kind keys need the cell lists and the join buffer even without a text column
    if (has7 && NULL_MODE === 'plane') { lay('lnum', 10 * cells + 16); lay('lst', 16); }   // B13 typed nullable numbers
    if (has7 && !(asciiIn && hasStr)) { lay('kix', 4 * cells); lay('kixo', 4 * NK); lay('sout', len + cells + 16); if (o > 1610612736) return null; if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536)); m8 = new Uint8Array(mem.buffer); }
    if (asciiIn && hasStr) { lay('hexL', 4 * NK); lay('hoff', 4 * NK); lay('hex', (len >> 1) + 16); var T2 = 16; while (T2 < nrows + 2) T2 *= 2; lay('sht', 16 * T2); lay('kix', 4 * cells); lay('kixo', 4 * NK); lay('scodes', 4 * nrows + 16); lay('slab', 4 * nrows + 16);   /* a key has at most one value a row (scan rejects repeated keys), so the dictionary scratch is sized by rows */ lay('sout', len + cells + 16); lay('sres', 16); }
    if (asciiIn && hasStr) { if (o > 1610612736) return null; if (o > mem.buffer.byteLength) mem.grow(Math.ceil((o - mem.buffer.byteLength) / 65536)); m8 = new Uint8Array(mem.buffer); }
    var keys = [], ktype = new Uint8Array(mem.buffer, P.ktype, NK), kfd = new Uint8Array(mem.buffer, P.kfd, NK);
    var ckey = new Uint8Array(mem.buffer, P.ckey, nc), cval = new Float64Array(mem.buffer, P.cval, nc), cfd = new Uint8Array(mem.buffer, P.cfd, nc), llen = new Uint32Array(mem.buffer, P.llen, nlist), lval = new Uint32Array(mem.buffer, P.lval, nlv), clen = new Uint32Array(mem.buffer, P.clen, nc), text = null;
    var koff = new Uint32Array(mem.buffer, P.keyoff, nk), klen = new Uint32Array(mem.buffer, P.keylen, nk);
    for (j = 0; j < nk; j++) keys.push(td.decode(input.subarray(koff[j], koff[j] + klen[j])));
    if (W.x.gather(nc, P.ckey, P.cval, P.cfd, P.ktype, P.kfd, nk, P.llen, P.gcnt, P.gtot, P.goff, P.gout)) return null;   // counts, list totals and the number columns, in wasm
    var count = new Uint32Array(mem.buffer, P.gcnt, nk).slice(), tot = new Uint32Array(mem.buffer, P.gtot, nk).slice(), goff = new Uint32Array(mem.buffer, P.goff, nk).slice(), pos = new Uint32Array(nk), colv = new Array(nk), coll = new Array(nk), vpos = new Uint32Array(nk);
    // hex id columns (every value the same even length of 16 or more, lowercase hex: encodeColumn's 'H'): with ASCII input the offsets are byte offsets, so their bytes are read straight from the input, no strings
    var hexL = new Int32Array(nk), hoff = null;
    if (asciiIn && hasStr && W.x.hexcols(P['in'], nc, P.ckey, P.cval, P.clen, P.ktype, nk, P.hexL, P.hoff, P.hex)) { hexL.set(new Int32Array(mem.buffer, P.hexL, nk)); hoff = new Uint32Array(mem.buffer, P.hoff, nk); }
    // other string columns of few distinct values: the dictionary (or the joined values) straight from the bytes, so no text is decoded and no strings are made
    var kixo = null, byB = new Uint8Array(nk), ipK = new Uint8Array(nk), sOnly = new Uint8Array(nk), sdD = new Uint32Array(nk), sdOut = new Array(nk), sdCodes = new Array(nk), sdMany = new Array(nk), D2, sr, ipOk, tm = opts.templates === false ? 0 : opts.templates === true ? 2 : 1;
    for (j = 0; j < nk; j++) {
      if (hexL[j] > 0) { byB[j] = 1; continue; }
      if (!asciiIn || ktype[j] !== 3 || kfd[j]) continue;   // kfd 1 on a string key: some value has escapes, so its bytes are not its text
      if (!kixo) { W.x.keyix(nc, P.ckey, nk, P.gcnt, P.kix, P.kixo); kixo = new Uint32Array(mem.buffer, P.kixo, nk); }
      // IPv4 first: such a column is only digits and dots, so strdict would give it no dictionary and the result would be this 'I' column anyway; ipcol stops at the first value that is not one
      if (W.x.ipcol(P['in'], P.cval, P.clen, P.kix + 4 * kixo[j], count[j], P.sout)) { byB[j] = 1; sdOut[j] = new Uint8Array(mem.buffer, P.sout, count[j] * 4).slice(); ipK[j] = 1; continue; }
      D2 = W.x.strdict(P['in'], P.cval, P.clen, P.kix + 4 * kixo[j], count[j], P.sht, P.scodes, P.slab, P.sout, P.sres);
      if (!D2) {
        sr = new Uint32Array(mem.buffer, P.sres, 4);
        if (sr[2]) sdMany[j] = new Uint8Array(mem.buffer, P.sout, sr[0]).slice();   // more than n / 2 distinct values, joined by 0 bytes
        // many values, not hex, UUID or IPv4, and no template layout possible (templates off, or the read check already failed): encodeColumn would write the joined values, so the strings are never made
        if (sr[2] && !sr[3] && (tm === 0 || (tm === 1 && tmplSlow))) { byB[j] = 1; sOnly[j] = 1; }
        continue;
      }
      byB[j] = 1; sdD[j] = D2; sdOut[j] = new Uint8Array(mem.buffer, P.sout, new Uint32Array(mem.buffer, P.sres, 1)[0]).slice();
      sdCodes[j] = D2 * 4 > count[j] || D2 >= 65536 ? null : new Uint32Array(mem.buffer, P.scodes, count[j]).slice();
    }
    for (j = 0; j < nk; j++) { if (ktype[j] === 1) colv[j] = new Float64Array(mem.buffer, P.gout + 8 * goff[j], count[j]).slice(); else if (ktype[j] === 2) { colv[j] = new Uint32Array(count[j]); coll[j] = new Uint32Array(tot[j]); } else if (hexL[j] > 0) colv[j] = new Uint8Array(mem.buffer, P.hex + hoff[j], count[j] * (hexL[j] === 3600 ? 16 : hexL[j] / 2)).slice(); else if (byB[j]) colv[j] = null; else if (ktype[j] === 3 && asciiIn) {   // the column's literals as one JSON array (written over the dictionary scratch, already copied out), parsed at once: no whole-input text and no per-value slices (escapes decoded by JSON.parse as before)
        if (!kixo) { W.x.keyix(nc, P.ckey, nk, P.gcnt, P.kix, P.kixo); kixo = new Uint32Array(mem.buffer, P.kixo, nk); }
        colv[j] = JSON.parse(FSTD.decode(new Uint8Array(mem.buffer, P.sout, W.x.rawjoin(P['in'], P.cval, P.clen, P.kix + 4 * kixo[j], count[j], P.sout)))); byB[j] = 2; }
      else { colv[j] = new Array(count[j]); if ((ktype[j] === 3 || ((ktype[j] === 6 || ktype[j] === 7) && asciiIn) || (ktype[j] === 7 && kfd[j] === 3)) && !text) { try { text = FSTD.decode(input); } catch (e) { return null; } } } }
    // B13: a mixed key that is numbers and nulls (a nullable number column): the numbers go straight to scaled whole numbers and the nulls to a bit plane, in wasm, with no JS array of mixed values
    var elig = null, nnv = null, npl = null, nmc = null, lst = null;
    if (NULL_MODE === 'plane' && asciiIn && W.x.litnum) {
      for (j = 0; j < nk; j++) {
        if (ktype[j] !== 7 || kfd[j] === 3 || kfd[j] === 4 || kfd[j] === 5 || count[j] < 2) continue;
        if (!kixo) { W.x.keyix(nc, P.ckey, nk, P.gcnt, P.kix, P.kixo); kixo = new Uint32Array(mem.buffer, P.kixo, nk); }
        var cn = count[j], rm = W.x.litnum(P['in'], P.cval, P.clen, P.cfd, P.kix + 4 * kixo[j], cn, P.lnum, P.lst);
        if (rm < 0 || rm === 0 || rm === cn) continue;
        if (!elig) { elig = new Int8Array(nk).fill(-1); nnv = new Array(nk); npl = new Array(nk); nmc = new Uint32Array(nk); }
        elig[j] = new Uint32Array(mem.buffer, P.lst, 1)[0]; nmc[j] = rm; nnv[j] = new Float64Array(mem.buffer, P.lnum, rm).slice(); npl[j] = new Uint8Array(mem.buffer, P.lnum + 9 * cn, (cn + 7) >> 3).slice();
      }
    }
    var lp = 0, sc, m, v, pre7 = null, k7;
    var rest = 0; for (j = 0; j < nk; j++) if (ktype[j] !== 1 && !byB[j]) rest = 1;   // cells the wasm passes did not already gather
    if (rest) for (i = 0; i < nc; i++) {
      j = ckey[i];
      if (ktype[j] === 1) continue;
      else if (ktype[j] === 3) { if (byB[j] === 0) colv[j][pos[j]++] = cfd[i] ? JSON.parse(text.slice(cval[i] - 1, cval[i] + clen[i] + 1)) : text.slice(cval[i], cval[i] + clen[i]); }
      else if (ktype[j] === 4) colv[j][pos[j]++] = cfd[i] === 2 ? null : cval[i] === 1;
      else if (ktype[j] === 5) colv[j][pos[j]++] = null;
      else if (ktype[j] === 7) {   // B3b: a key with mixed JSON kinds; cells before the switch keep the first type's form, the literal cells after it (cfd 255) are parsed together below
        if (elig && elig[j] >= 0) { pos[j]++; continue; }
        if (cfd[i] === 255) { pos[j]++; if (!pre7) pre7 = new Int32Array(nk).fill(-1); if (pre7[j] < 0) pre7[j] = pos[j] - 1; }
        else { k7 = kfd[j]; colv[j][pos[j]++] = k7 === 3 ? (cfd[i] ? JSON.parse(text.slice(cval[i] - 1, cval[i] + clen[i] + 1)) : text.slice(cval[i], cval[i] + clen[i])) : k7 === 4 || k7 === 5 ? (cfd[i] === 2 ? null : cval[i] === 1) : clen[i] ? (asciiIn ? +text.slice(cval[i], cval[i] + clen[i]) : +String.fromCharCode.apply(null, input.subarray(cval[i], cval[i] + clen[i]))) : cval[i] / P10[cfd[i]]; }
      }
      else if (ktype[j] === 6) colv[j][pos[j]++] = clen[i] ? (asciiIn ? +text.slice(cval[i], cval[i] + clen[i]) : +String.fromCharCode.apply(null, input.subarray(cval[i], cval[i] + clen[i]))) : cval[i] / P10[cfd[i]];   // B3: a number the scanner kept as text (long, exponent, -0); earlier plain cells of the key are mantissa / 10^digits, the value JSON.parse gives
      else { m = llen[cval[i]]; colv[j][pos[j]++] = m; if (m) { coll[j].set(lval.subarray(lp, lp + m), vpos[j]); vpos[j] += m; lp += m; } }
    }
    if (pre7) for (j = 0; j < nk; j++) if (ktype[j] === 7 && pre7[j] >= 0 && !(elig && elig[j] >= 0)) {   // one JSON.parse per mixed key over its literals, joined in wasm
      if (!kixo) { W.x.keyix(nc, P.ckey, nk, P.gcnt, P.kix, P.kixo); kixo = new Uint32Array(mem.buffer, P.kixo, nk); }
      var pv7 = JSON.parse(FSTD.decode(new Uint8Array(mem.buffer, P.sout, W.x.litjoin(P['in'], P.cval, P.clen, P.cfd, P.kix + 4 * kixo[j], count[j], P.sout)))), b7 = pre7[j], q7;
      if (b7 === 0) colv[j] = pv7; else for (q7 = 0; q7 < pv7.length; q7++) colv[j][b7 + q7] = pv7[q7];
    }
    var frames = [], meta = { keys: keys, cols: [] }, zone = [], best, cd, z, k2, t, dnB, wB;
    var ENCS = [];
    function cand(tn, p, fr, n) { best = addCand(zs, clv ? FLT : level, best, tn, p, fr, n); }   // fast: text columns at the fast level
    function numCands(base, c, scale, key, zc) {   // the candidates of a number column held as scaled whole numbers (mantissas), as the general writer would try them
        if (c >= NK_MIN) { var R = nkRun(base, c, scale > 100 ? 0 : 1), a = R.a, dd = R.d, bb = R.b, mnk = R.mn, mxk = R.mx, wk = R.w, monok = R.mono;
          if (a) cand('V', { mono: monok, scale: scale }, [a], c);
          if (dd) cand('V', { mono: false, scale: scale, delta: true }, [dd], c);
          if (bb) cand('B', { mn: mnk, w: wk, scale: scale }, [bb], c);
          if (scale > 100) { if (!best || best.size > c * 4) cand('F', {}, [new Uint8Array(numDiv(base, c, scale).buffer)], c); }
          else if (c > 1 && !monok && best.size > c * 0.25 && repeats(base, c)) cand('F', {}, [new Uint8Array(numDiv(base, c, scale).buffer)], c);
          zone.push([fnvStr('.' + key), mnk / scale, mxk / scale, zc === undefined ? c : zc]);
          return; }
        numStats(base, c, NST); var mono = NST[0] === 1, mn = NST[1], mx = NST[2];
        var d = numFirst(base, c, mono);
        if (scale > 100) {   // 3 to 9 fraction digits (columns the JSON.parse path used to write): the same candidates as encodeColumn there, so the same bytes and no extra compressions
          var dz2 = null, sa = 0, sb = 0;
          if (!mono && c > 1) { dz2 = numDeltaZz(base, c); sa = vlenSum(d, c); sb = vlenSum(dz2, c); }
          if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, c)], c);
          if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, c)], c);
          if (mx - mn < 16777216) { var w3 = Math.max(1, 32 - Math.clz32(mx - mn)); cand('B', { mn: mn, w: w3, scale: scale }, [bitpack(numOff(base, c, mn), w3)], c); }
          if (!best || best.size > c * 4) cand('F', {}, [new Uint8Array(numDiv(base, c, scale).buffer)], c);
          if (c) zone.push([fnvStr('.' + key), mn / scale, mx / scale, zc === undefined ? c : zc]);
        } else {
        cand('V', { mono: mono, scale: scale }, [varintsT(d, c)], c);
        if (!mono && c > 1) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(numDeltaZz(base, c), c)], c);
        if (mx - mn < 16777216) { var w = Math.max(1, 32 - Math.clz32(mx - mn)); cand('B', { mn: mn, w: w, scale: scale }, [bitpack(numOff(base, c, mn), w)], c); }
        if (c > 1 && !mono && best.size > c * 0.25 && repeats(base, c)) cand('F', {}, [new Uint8Array(numDiv(base, c, scale).buffer)], c);   /* raw doubles win when the values repeat a long pattern (zstd finds the repeat), as in the general writer; tried only when the other forms leave more than 2 bits a value and values do repeat */
        if (c) zone.push([fnvStr('.' + key), mn / scale, mx / scale, zc === undefined ? c : zc]);
        }
    }
    for (j = 0; j < nk; j++) {
      best = null; c = count[j]; clv = FAST_ON && FLT !== null && ktype[j] === 3 && !hexL[j] && !ipK[j] ? 1 : 0;
      if (hexL[j] === 3600) cand('U', {}, [colv[j]], c);   // as encodeColumn writes a UUID column
      else if (hexL[j] > 0) cand('H', { L: hexL[j] }, [colv[j]], c);   // as encodeColumn writes a hex column
      else if (ipK[j]) cand('I', {}, [sdOut[j]], c);   // as encodeColumn writes an IPv4 column
      else if (sOnly[j] && DATE_MODE && (dnB = dateNumsB(sdMany[j], c)) && (wB = dateWrap(dnB, zs, level, keys[j]))) best = wB;   // a date column read from its bytes: no strings, stored as epoch milliseconds
      else if (sOnly[j]) cand('s', {}, dlOf([sdMany[j]], (c >> 1) + 1), c);   // as encodeColumn writes a many-value string column without templates
      else if (sdD[j]) {   // as encodeColumn writes a string column of at most n / 2 distinct values
        var D3 = sdD[j], cds = sdCodes[j];
        if (!cds) cand('s', {}, dlOf([sdOut[j]], sdMany[j] ? (c >> 1) + 1 : D3 || (c >> 2)), c);
        else { var wd3 = Math.max(1, 32 - Math.clz32(D3 - 1)); cand('D', { w: 0, wide: D3 > 256 }, [sdOut[j], D3 > 256 ? new Uint8Array(new Uint16Array(cds).buffer) : new Uint8Array(cds)], c); cand('D', { w: wd3, wide: false }, [sdOut[j], bitpack(cds, wd3)], c); if (best.t === 'D') best.st = { distinct: D3 }; }
      }
      else if (elig && elig[j] >= 0) {   // the typed nullable-number path
        var m8n = nmc[j], plb = npl[j], scn = P10[elig[j]]; best = null;
        numCands(nnv[j], m8n, scn, keys[j], c); var inn = settle(zs, level, best); best = null;
        var pzn = zs.compress(plb, level), pzzn = pzn.length < plb.length ? [plb.length, pzn, 1] : [plb.length, plb, 0], szn = pzzn[1].length;
        for (i = 0; i < inn.z.length; i++) szn += inn.z[i][1].length;
        NMARK++; best = { t: 'N', p: { t: inn.t, p: inn.p, m: m8n }, n: c, z: [pzzn].concat(inn.z), size: szn };
      }
      else if (ktype[j] >= 3) { best = encodeColumn(colv[j], zs, level, opts.templates === false ? 0 : opts.templates === true ? 2 : 1, sdMany[j], keys[j]); if (best.t === 'N' && (best.p.t === 'V' || best.p.t === 'B' || best.p.t === 'F') && best.nn.length) { var mnN = Infinity, mxN = -Infinity; for (i = 0; i < best.nn.length; i++) { if (best.nn[i] < mnN) mnN = best.nn[i]; if (best.nn[i] > mxN) mxN = best.nn[i]; } zone.push([fnvStr('.' + keys[j]), mnN, mxN, c]); } if ((ktype[j] === 6 || ktype[j] === 7) && (best.t === 'V' || best.t === 'B' || best.t === 'F') && c) { var mn6 = Infinity, mx6 = -Infinity, a6 = colv[j]; for (i = 0; i < a6.length; i++) { if (a6[i] < mn6) mn6 = a6[i]; if (a6[i] > mx6) mx6 = a6[i]; } zone.push([fnvStr('.' + keys[j]), mn6, mx6, a6.length]); } }
      else if (ktype[j] === 1) numCands(colv[j], c, P10[FD[kfd[j]]], keys[j]);
      else {
        var ln = colv[j], dl = coll[j], t2 = dl.length, asc = listAsc(ln, dl, c);
        cand('A', { m: t2, asc: asc }, [varintsT(ln, c), varintsT(listDeltas(ln, dl, c, asc), t2)], c);
      }
      best = settle(zs, level, best); ENCS.push(best); meta.cols.push({ t: best.t, p: best.p, n: best.n, f: best.z.map(function (zz3) { return [zz3[0], zz3[1].length, zz3[2]]; }), st: best.st, _z: best.z });
      for (i = 0; i < best.z.length; i++) frames.push(best.z[i][1]);
    }
    var planes = m8.slice(P.planes, P.planes + nk * pb), mB = te.encode(JSON.stringify(withColumnInfo(meta, opts, zs))), zm = zs.compress(mB, level), zp = zs.compress(planes, level);
    var hdr = te.encode(JSON.stringify({ k: 'f', n: nrows, m: [mB.length, zm.length], pl: [planes.length, zp.length] }));
    var out = concat([u32le(hdr.length), hdr, zm, zp].concat(frames)), k67 = false; for (j = 0; j < nk; j++) if (ktype[j] >= 6) k67 = true; return { bytes: out, rows: nrows, zone: zone, kind: 'f', prefix: out.length - colBytes(meta), k67: k67, eqf: eqWant(opts) && out.length <= NX_A_MAXB ? [meta.keys, ENCS, out.length] : 0 };   // k67: some key needed the per-column fallback (long numbers, mixed kinds); see api.js
  }
  // with { check: 'xxh64' }: each column gets `o` (where its first frame starts, counted from the first column frame) and `x` (the XXH64 of its frames, 16 hex digits), so a reader that wants a few columns goes straight to them and checks only their bytes
  function colBytes(meta) { var t = 0, j, i; for (j = 0; j < meta.cols.length; j++) for (i = 0; i < meta.cols[j].f.length; i++) t += meta.cols[j].f[i][1]; return t; }
  function xhex(zs, b) { var h = zs.xxh64(b); return (h[1] + 4294967296).toString(16).slice(1) + (h[0] + 4294967296).toString(16).slice(1); }
  function withColumnInfo(meta, opts, zs) {
    var o = 0, j, c, check = chkX(opts) && !!(zs && zs.xxh64);
    for (j = 0; j < meta.cols.length; j++) {
      c = meta.cols[j];
      if (check) { c.o = o; c.x = xhex(zs, concat(c._z.map(function (z) { return z[1]; }))); o += c.f.reduce(function (a, f) { return a + f[1]; }, 0); }
      delete c._z;
    }
    return meta;
  }
  // the byte work of reading a flat block: zstd for every wanted column, and (predecode, in helper workers) the number columns turned into Float64Arrays
  // verify: the block's header part was checked by the caller (block table item 8) and the block as a whole was not, so every wanted column must carry `o` and `x` and is checked here; columns that are not wanted are not read at all
  function flatFrames(zs, bytes, want, predecode, verify, lazy) {
    var ph = parseBlockHeader(bytes), h = ph.h, p = ph.p, i, j, base;
    function take(n) { var x = bytes.subarray(p, p + n); p += n; return x; }
    var meta = JSON.parse(tdr.decode(zs.decompressView(take(h.m[1]), h.m[0]))), pl = zs.decompress(take(h.pl[1]), h.pl[0]), n = h.n, K = meta.keys.length, cols = new Array(K), ordList = null, ordIds = null;
    if (meta.ord) { var om = meta.ord; ordList = JSON.parse(tdr.decode(zs.decompressView(take(om[1]), om[0]))); var odr = zs.decompress(take(om[4]), om[3]); ordIds = new KIND[om[2]](odr.buffer, odr.byteOffset, n); }
    base = p;
    for (j = 0; j < K; j++) {
      var c = meta.cols[j], fr = [], wanted = !want || Object.prototype.hasOwnProperty.call(want, meta.keys[j]);
      if (verify) {
        if (typeof c.o !== 'number' || typeof c.x !== 'string') throw new Error('damaged block: column offsets missing');
        if (!wanted) { cols[j] = null; continue; }
        var tl = 0, st0 = base + c.o; for (i = 0; i < c.f.length; i++) tl += c.f[i][1];
        if (st0 < base || st0 + tl > bytes.length || xhex(zs, bytes.subarray(st0, st0 + tl)) !== c.x) throw new Error('block checksum mismatch (column ' + meta.keys[j] + ')');
        p = st0;
      }
      if (lazy && wanted) { var zf = []; for (i = 0; i < c.f.length; i++) zf.push([c.f[i], take(c.f[i][1])]); cols[j] = { fr: null, zf: zf, zs: zs }; continue; }   // B19: compressed frames kept, decompressed on first use
      for (i = 0; i < c.f.length; i++) { var f = c.f[i], sb = take(f[1]); if (wanted) fr.push(f[2] ? zs.decompress(sb, f[0]) : sb.slice()); }
      cols[j] = !wanted ? null : (predecode && (c.t === 'V' || c.t === 'B' || c.t === 'F')) ? { pre: decodeColumn(c, zs, fr) } : { fr: fr };
    }
    if (!ordList) {   // the presence bits of a key must be as many as its column has values (a dense column is read without looking at its bits, so a damaged bit plane would otherwise go unnoticed there)
      var pb = (n + 7) >> 3, cnt, b;
      if (pl.length < K * pb) throw new Error('damaged block: presence bits cut off');
      for (j = 0; j < K; j++) {
        if (!cols[j]) continue;
        base = j * pb; cnt = 0;
        cnt = popcBytes(pl, base, n >> 3);
        for (i = n & ~7; i < n; i++) cnt += (pl[base + (i >> 3)] >> (i & 7)) & 1;
        if (cnt !== meta.cols[j].n) throw new Error('damaged block: presence bits do not match the column');
      }
    }
    return { t: 'f', n: n, meta: meta, pl: pl, ordList: ordList, ordIds: ordIds, cols: cols };
  }
  flatFrames = guard(flatFrames);
  // B19 helpers: frame k of a lazily read column, all its frames, every column of a lazily read block
  function frOne(c, k) { if (c.fr) return c.fr[k]; if (!c.one) c.one = []; if (!c.one[k]) { var f = c.zf[k][0], sb = c.zf[k][1]; c.one[k] = f[2] ? (c.keep ? c.zs.decompress(sb, f[0]).slice() : c.zs.decompress(sb, f[0])) : sb.slice(); } return c.one[k]; }
  function frAll(c) { if (!c.fr) { var o = [], k; for (k = 0; k < c.zf.length; k++) o.push(frOne(c, k)); c.fr = o; } return c.fr; }
  function frBlock(F) { for (var j = 0; j < F.cols.length; j++) if (F.cols[j] && !F.cols[j].pre) frAll(F.cols[j]); }
  // the footer-sized view of a flat block: keys, column types, counts and the optional statistics, from the meta frame only
  function flatMeta(zs, bytes) {
    var ph = parseBlockHeader(bytes), h = ph.h, m = JSON.parse(tdr.decode(zs.decompressView(bytes.subarray(ph.p, ph.p + h.m[1]), h.m[0])));
    return m.keys.map(function (k, j) { var c = m.cols[j], o = { key: k, type: c.t, n: c.n }; if (c.st) for (var q in c.st) o[q] = c.st[q]; return o; });
  }
  flatMeta = guard(flatMeta);
  function flatTransfer(F) {
    var t = [F.pl.buffer], i, c, q; if (F.ordIds) t.push(F.ordIds.buffer);
    for (i = 0; i < F.cols.length; i++) { c = F.cols[i]; if (!c) continue; if (c.pre) t.push(c.pre.buffer); else for (q = 0; q < c.fr.length; q++) t.push(c.fr[q].buffer); }
    return t;
  }
  // dense rows: cloning one object that already has every key lays each row out once; that wins from about 16 keys in Chromium, Firefox and WebKitGTK, and under that the plain way (objects first, then one key at a time down its column) is as fast. A fixed rule: the timing probe it replaced cost 30 to 90 ms on the first big read of each key count (a fresh page with 5 key counts read 0.30 to 0.50 of the time without it), and its pick flipped between runs below 16 keys
  var CLONE_KEYS = 16;
  // opt-in generated row builders ({ rows: 'generated' }): one function per key set that fills a row with plain assignments. Needs 'unsafe-eval' in the page's security policy; if the engine refuses, the normal ways are used. Never used unless asked for.
  var genCache = {}, genRefused = false;
  function rowBuilder(keys) {
    var id = keys.join('\u0000') + '\u0001' + keys.length, f = genCache[id], j, src;
    if (f !== undefined) return f;
    if (genRefused) return null;
    try { src = 'var o={};'; for (j = 0; j < keys.length; j++) src += 'o[' + JSON.stringify(keys[j]) + ']=c[' + j + '][i];'; f = genCache[id] = new Function('c', 'i', src + 'return o;'); }
    catch (e) { genRefused = true; return null; }
    return f;
  }
  var popc8 = new Uint8Array(256); (function () { for (var i = 1; i < 256; i++) popc8[i] = (i & 1) + popc8[i >> 1]; })();

  /* rows: 'lazy' and 'lazycols' (opt-in, no generated code). A row is a small object holding only its index (under a symbol, so it never clashes with a key and
     Object.keys(row) is empty); each key is a getter on one class per block. JSON.stringify gives the same text through toJSON and for..in lists the keys,
     but Object.keys, spread, hasOwnProperty, structuredClone and postMessage do not carry the values. 'lazycols' also decodes a column the first time any
     row reads its key, so a damaged column throws on that first read instead of at unpack. */
  var ROWI = typeof Symbol === 'function' ? Symbol('row') : '\u0001row';
  function lazyRows(keys, vals, n) {
    var K = keys.length, j;
    function R(i) { this[ROWI] = i; }
    for (j = 0; j < K; j++) (function (arr, key) { Object.defineProperty(R.prototype, key, { get: function () { return arr[this[ROWI]]; }, enumerable: true, configurable: true }); })(vals[j], keys[j]);
    Object.defineProperty(R.prototype, 'toJSON', { value: function () { var o = {}, k; for (k = 0; k < K; k++) o[keys[k]] = vals[k][this[ROWI]]; return o; }, enumerable: false });
    var out = new Array(n), i; for (i = 0; i < n; i++) out[i] = new R(i);
    return out;
  }
  function lazyRows2(keys, K, n, decodeAt) {
    var cols = new Array(K), j;
    function R(i) { this[ROWI] = i; }
    for (j = 0; j < K; j++) (function (j, key) { Object.defineProperty(R.prototype, key, { get: function () { var a = cols[j]; if (a === undefined) a = cols[j] = decodeAt(j); return a[this[ROWI]]; }, enumerable: true, configurable: true }); })(j, keys[j]);
    Object.defineProperty(R.prototype, 'toJSON', { value: function () { var o = {}, k; for (k = 0; k < K; k++) o[keys[k]] = this[keys[k]]; return o; }, enumerable: false });
    var out = new Array(n), i; for (i = 0; i < n; i++) out[i] = new R(i);
    return out;
  }
  // P13d gate (0.10.6, shared with P13e): row-at-a-time runs from 24 wanted keys, or when at least 1 row in 8 of the first 1,024 has every key; with 16 to 23 keys and almost no complete rows the clone never applies and plain objects were up to 1.4x slower in Chromium
  function rowWise(vals, K, n, pl, pb, sel, m) { var nb = 0, sj = [], ns = 0, j, i, r, all, t = m < 1024 ? m : 1024, c = 0; for (j = 0; j < K; j++) if (vals[j]) { nb++; if (vals[j].length !== n) sj[ns++] = j * pb; } if (nb >= 24) return true; for (i = 0; i < t; i++) { r = sel ? sel[i] : i; all = true; for (j = 0; j < ns && all; j++) all = ((pl[sj[j] + (r >> 3)] >> (r & 7)) & 1) === 1; if (all) c++; } return c * 8 >= t; }
  function makeFlatReader(zs) {
    // assemble rows from the decompressed frames of flatFrames; want: null, or an object whose own keys are the only keys to decode
    var gen = false, lazyOn = false;
    function assemble(F, want) {
      var meta = F.meta, n = F.n, K = meta.keys.length, vals = new Array(K), pl = F.pl, ordList = F.ordList, ordIds = F.ordIds, i, j;
      var pb = (n + 7) >> 3, ptr = new Int32Array(K), out = new Array(n), keys = meta.keys, o, hasProto = keys.indexOf('__proto__') >= 0;
      // Chromium (V8) only, a dense block (plain rows, or clones from CLONE_KEYS keys; no generated code): each column is decoded, assigned down and dropped, so fewer column arrays are alive at the next young-generation collection. Same objects, same key order
      var lazyOk = lazyOn && !hasProto && keys.indexOf('toJSON') < 0;   // a key named toJSON or __proto__ keeps plain rows
      if (lazyOk && lazyOn === 2 && !ordList && K > 0 && K <= 250 && n >= 1) {
        var dl = true; for (j = 0; j < K && dl; j++) dl = F.cols[j] !== null && (F.cols[j].pre ? F.cols[j].pre.length === n : meta.cols[j].n === n);
        if (dl) { for (j = 0; j < K; j++) if (F.cols[j].fr) F.cols[j].fr = F.cols[j].fr.map(function (x) { return x.slice(); }); }   // the frames may be views of memory the next block reuses: keep copies
        if (dl) return lazyRows2(keys, K, n, function (c) { return F.cols[c].pre ? F.cols[c].pre : decodeColumn(meta.cols[c], zs, F.cols[c].fr); });
      }
      if (V8 && !ordList && !gen && !lazyOn && !hasProto && K > 0 && K <= 250 && n >= 2000) {
        var allDense = true, nk = 0; for (j = 0; j < K && allDense; j++) if (F.cols[j] !== null) { nk++; allDense = F.cols[j].pre ? F.cols[j].pre.length === n : meta.cols[j].n === n; } if (!nk) allDense = false;
        if (allDense) {
          if (nk >= CLONE_KEYS) { var ts0 = '{', f0 = 1; for (j = 0; j < K; j++) if (F.cols[j] !== null) { ts0 += (f0 ? '' : ',') + JSON.stringify(keys[j]) + ':null'; f0 = 0; } var tpl0 = JSON.parse(ts0 + '}'); for (i = 0; i < n; i++) out[i] = { ...tpl0 }; } else for (i = 0; i < n; i++) out[i] = {};
          for (j = 0; j < K; j++) { if (F.cols[j] === null) continue; var vv = F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr), kj = keys[j]; for (i = 0; i < n; i++) out[i][kj] = vv[i]; }
          return out;
        }
      }
      for (j = 0; j < K; j++) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr);
      if (ordList) { for (i = 0; i < n; i++) { var sq2 = ordList[ordIds[i]], m2 = sq2.length; o = {}; for (j = 0; j < m2; j++) { var kk = sq2[j]; if (!vals[kk]) continue; if (hasProto) setKey(o, keys[kk], vals[kk][ptr[kk]++]); else o[keys[kk]] = vals[kk][ptr[kk]++]; } out[i] = o; } return out; }
      // column by column (the row-object rule): every row object is made first, then each key is assigned down its column, so the objects share one shape history
      // dense block (every key in every row): cloning one object that already has all the keys lays each row out once. Whether that is faster depends on the engine, so it is timed once against the plain way on the first dense block and the answer is kept per number of keys
      var dense = !hasProto && K > 0 && K <= 250, tpl, ts;
      var allK = true, nk2 = 0; for (j = 0; j < K && dense; j++) { if (!vals[j]) { allK = false; continue; } nk2++; if (vals[j].length !== n) dense = false; } if (!nk2) dense = false;
      if (dense) { var f1 = 1; for (j = 0, ts = '{'; j < K; j++) if (vals[j]) { ts += (f1 ? '' : ',') + JSON.stringify(keys[j]) + ':null'; f1 = 0; } tpl = JSON.parse(ts + '}'); }
      var useClone = dense && nk2 >= CLONE_KEYS && (allK || V8);
      if (dense && allK && lazyOk && n >= 1) return lazyRows(keys, vals, n);
      if (dense && allK && gen && n >= 1) { var mk = rowBuilder(keys); if (mk) { for (i = 0; i < n; i++) out[i] = mk(vals, i); return out; } }
      // V8 only, a block whose rows lack some keys (from 8 keys): one key at a time down every column gives each row a long chain of shape changes. Here each row is made at once, its keys in file order: rows with every key start as a clone of one template, the others are plain objects, which from 24 keys start in V8's hash-table form (one key added and removed) instead of walking up to 24+ shapes. Same objects, same key order. Firefox and WebKitGTK were slower this way, so they keep the column-at-a-time path
      if (V8 && !dense && !hasProto && K >= 8) {
        var RB = [], RV = [], RK = [], nb = 0, ns = 0, sj = [], ts2 = '{';
        for (j = 0; j < K; j++) if (vals[j]) { RB[nb] = j * pb; RV[nb] = vals[j]; RK[nb] = keys[j]; ts2 += (nb ? ',' : '') + JSON.stringify(keys[j]) + ':null'; nb++; }
        var full = new Uint8Array(nb), pt = new Int32Array(nb), tp2 = JSON.parse(ts2 + '}'), toHash = nb >= 24;
        for (j = 0; j < nb; j++) { full[j] = RV[j].length === n ? 1 : 0; if (!full[j]) sj[ns++] = RB[j]; }
        if (rowWise(vals, K, n, pl, pb, null, n)) {   // P13d gate (0.10.6)
        for (i = 0; i < n; i++) { var by = i >> 3, bt = i & 7, all = true;
          for (j = 0; j < ns && all; j++) all = ((pl[sj[j] + by] >> bt) & 1) === 1;
          if (all) { o = { ...tp2 }; for (j = 0; j < nb; j++) o[RK[j]] = full[j] ? RV[j][i] : RV[j][pt[j]++]; out[i] = o; continue; }
          o = {}; if (toHash) { o.__h = 0; delete o.__h; }
          for (j = 0; j < nb; j++) { if (full[j]) o[RK[j]] = RV[j][i]; else if ((pl[RB[j] + by] >> bt) & 1) o[RK[j]] = RV[j][pt[j]++]; }
          out[i] = o; }
        return out;
        }
      }
      if (useClone) { for (i = 0; i < n; i++) out[i] = { ...tpl }; }
      else for (i = 0; i < n; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        var v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb, c = 0, bits;
        if (key === '__proto__') { for (i = 0; i < n; i++) if ((pl[base + (i >> 3)] >> (i & 7)) & 1) setKey(out[i], key, v[c++]); }
        else if (v.length === n) { for (i = 0; i < n; i++) out[i][key] = v[i]; }
        else { for (i = 0; i < n; i++) { if (i % 8 === 0) { bits = pl[base + (i >> 3)]; if (bits === 0) { i += 7; continue; } } if ((bits >> (i & 7)) & 1) out[i][key] = v[c++]; } }
      }
      return out;
    }
    assemble = guard(assemble);
    function readBlock(bytes, want, verify) { return assemble(flatFrames(zs, bytes, want, false, verify), want); }
    // rows lo..hi-1 of a block only: the columns are decoded whole, but row objects are made for the range alone (making them is most of a whole read). Same objects, same key order, as readBlock(...).slice(lo, hi)
    function readRange(bytes, lo, hi, verify) {
      var F = flatFrames(zs, bytes, null, false, verify), meta = F.meta, n = F.n, K = meta.keys.length, vals = new Array(K), pl = F.pl, keys = meta.keys, i, j, o, m, hasProto = keys.indexOf('__proto__') >= 0;
      lo = Math.max(0, Math.min(lo, n)); hi = Math.max(lo, Math.min(hi, n)); m = hi - lo;
      for (j = 0; j < K; j++) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr);
      var out = new Array(m), ptr = new Int32Array(K), pb = (n + 7) >> 3;
      if (F.ordList) {
        var ordList = F.ordList, ordIds = F.ordIds, sq, kk;
        for (i = 0; i < lo; i++) { sq = ordList[ordIds[i]]; for (j = 0; j < sq.length; j++) ptr[sq[j]]++; }
        for (i = lo; i < hi; i++) { sq = ordList[ordIds[i]]; o = {}; for (j = 0; j < sq.length; j++) { kk = sq[j]; if (!vals[kk]) continue; if (hasProto) setKey(o, keys[kk], vals[kk][ptr[kk]++]); else o[keys[kk]] = vals[kk][ptr[kk]++]; } out[i - lo] = o; }
        return out;
      }
      if (!hasProto && m) { var sr = new Int32Array(m); for (i = 0; i < m; i++) sr[i] = lo + i; if (sparseV8(F, K, n, sr, m)) return selRows(F, vals, sr, m); }
      if (!V8 && !hasProto && !F.ordList && b36Dense(vals, K, n)) return b36Rows(out, m, F, keys, K, n, vals, lo, hi);
      lateInit(out, m, F, keys, K, n);
      for (j = 0; j < K; j++) {
        var v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb, c = 0, b;
        if (v.length === n && key !== '__proto__') { for (i = lo; i < hi; i++) out[i - lo][key] = v[i]; continue; }
        for (b = 0; b < (lo >> 3); b++) c += popc8[pl[base + b]];
        for (i = lo & ~7; i < lo; i++) if ((pl[base + (i >> 3)] >> (i & 7)) & 1) c++;
        for (i = lo; i < hi; i++) if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (key === '__proto__') setKey(out[i - lo], key, v[c++]); else out[i - lo][key] = v[c++]; }
      }
      return out;
    }
    readRange = guard(readRange);
    // rows of a block whose number under key rk is in [min, max]: the range column is tested first and row objects are made for the matching rows alone. Same objects, same key order, as keepRows(readBlock(...)). null when the block needs the full path
    function readSel(bytes, want, verify, rk, min, max) {
      if (gen || lazyOn) return null;
      var F = flatFrames(zs, bytes, want, false, verify), meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, keys = meta.keys, i, j, c, s, m, jr = keys.indexOf(rk);
      if (F.ordList || keys.indexOf('__proto__') >= 0) return assembleKeep(F, want, rk, min, max);
      if (jr < 0 || F.cols[jr] === null) return [];
      var vals = new Array(K), pb = (n + 7) >> 3, rv = F.cols[jr].pre ? F.cols[jr].pre : decodeColumn(meta.cols[jr], zs, F.cols[jr].fr), sel = new Int32Array(n), v, x;
      vals[jr] = rv; m = 0;
      if (rv.length === n) { for (i = 0; i < n; i++) { x = rv[i]; if (typeof x === 'number' && x >= min && x <= max) sel[m++] = i; } }
      else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { x = rv[c++]; if (typeof x === 'number' && x >= min && x <= max) sel[m++] = i; } }
      if (m * 2 > n) { F.cols[jr].pre = rv; return assembleKeep(F, want, rk, min, max); }   // more than half the rows match: the whole-block path (with its engine fast paths) is quicker; the range column is not decoded twice
      var out = new Array(m); if (!m) return out;
      for (j = 0; j < K; j++) if (j !== jr) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr);
      if (sparseV8(F, K, n, sel, m)) return selRows(F, vals, sel, m);
      lateInit(out, m, F, keys, K, n);
      for (j = 0; j < K; j++) {
        v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb, q;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }
        for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) out[q][key] = v[c]; c++; } if (i === sel[q]) q++; }
      }
      return out;
    }
    function assembleKeep(F, want, rk, min, max) { var r = assemble(F, want), out = [], i, x; for (i = 0; i < r.length; i++) { x = r[i][rk]; if (typeof x === 'number' && x >= min && x <= max) out.push(r[i]); } return out; }
    readSel = guard(readSel);
    // W1: positions: the block-local numbers of the rows readSel / readEq would return, as an Int32Array, with no row objects made; null means the row path is needed (same rules as readSel / readEq)
    function readPos(bytes, rk, val, mode, min, max) {
      if (gen || lazyOn) return null;
      var want = null;
      var rg = mode === 'range', codes = mode === 'codes', F = flatFrames(zs, bytes, want, false, false, codes), meta = F.meta, n = F.n, pl = F.pl, keys = meta.keys, jr = keys.indexOf(rk), i, c, s, m = 0, x, rv;
      if (F.ordList || keys.indexOf('__proto__') >= 0) return null;
      if (jr < 0 || F.cols[jr] === null) return new Int32Array(0);
      var cm = meta.cols[jr], col = F.cols[jr], pb = (n + 7) >> 3, sel = new Int32Array(n), dense = cm.n === n, isN = cm.t === 'N';
      if (rg) {
        rv = col.pre ? col.pre : decodeColumn(cm, zs, col.fr);
        if (rv.length === n) { for (i = 0; i < n; i++) { x = rv[i]; if (typeof x === 'number' && x >= min && x <= max) sel[m++] = i; } }
        else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { x = rv[c++]; if (typeof x === 'number' && x >= min && x <= max) sel[m++] = i; } }
      } else if (codes && (cm.t === 'D' || (isN && cm.p.t === 'D'))) {
        var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, c0 = -1, anyv = val instanceof AnyOf, amk = null, anull = anyv && val.set.has(null);
        if (anyv) { var alb = DL(dp, frOne(col, o)), az; amk = new Uint8Array(alb.length + 1); for (az = 0; az < alb.length; az++) if (val.set.has(alb[az])) { amk[az] = 1; c0 = 0; } if (c0 < 0 && !(isN && anull)) return new Int32Array(0); }
        else if (typeof val === 'string') c0 = DL(dp, frOne(col, o)).indexOf(val);
        if (c0 < 0 && !(isN && val === null) && !anyv) return new Int32Array(0);
        var cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0;
        for (i = 0, s = jr * pb; i < n; i++) { if (!dense && !((pl[s + (i >> 3)] >> (i & 7)) & 1)) continue;
          if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; if (val === null || anull) sel[m++] = i; continue; } at++;
          if (anyv ? amk[cd[k++]] : (cd[k++] === c0 && c0 >= 0)) sel[m++] = i; }
      } else {
        var kvA = val instanceof AnyOf ? new Array(n) : null, cfr = codes ? frAll(col) : col.fr; m = p14Sel(cm, cfr, val, pl, jr * pb, n, sel, kvA);
        if (m < 0) { m = 0; rv = decodeColumn(cm, zs, cfr);
          if (kvA) { var vs = val.set; if (rv.length === n) { for (i = 0; i < n; i++) if (vs.has(rv[i])) sel[m++] = i; } else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { if (vs.has(rv[c++])) sel[m++] = i; } } }
          else if (rv.length === n) { for (i = 0; i < n; i++) if (rv[i] === val) sel[m++] = i; }
          else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { if (rv[c++] === val) sel[m++] = i; } } }
      }
      return sel.subarray(0, m);
    }
    readPos = guard(readPos);
    // chosen rows of a block (open().block(i, { rows }), since 0.10.26): rows at the block-local positions pos, in the order asked (a repeated position gives the same object twice).
    // Each column gives only the asked values where it can (selAt / decodeAt, as equality reads do); the other row objects are never made. Same objects, same key order, as readBlock(...)[p]
    function readRows(bytes, pos, want, verify) {
      var F = flatFrames(zs, bytes, want, false, verify), meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, pb = (n + 7) >> 3, L = pos.length, i, j, p, m = 0;
      var srt = new Int32Array(L), out = new Array(L), at, rows;
      for (i = 0; i < L; i++) { p = pos[i]; if (typeof p !== 'number' || p !== Math.floor(p) || p < 0 || p >= n) throw new RangeError('LfcPack: block(i, { rows }): row ' + p + ' is not in this block (0 to ' + (n - 1) + ')'); srt[i] = p; }
      if (!L) return out;
      srt.sort();
      var sel = new Int32Array(L); for (i = 0; i < L; i++) if (!m || srt[i] !== sel[m - 1]) sel[m++] = srt[i];
      sel = sel.subarray(0, m);
      if (gen || lazyOn || F.ordList || meta.keys.indexOf('__proto__') >= 0 || m * 2 > n) { rows = assemble(F, want); for (i = 0; i < L; i++) out[i] = rows[pos[i]]; return out; }   // half the block or more, or a layout the column path does not build: the whole-block read
      var vals = new Array(K), sv;
      for (j = 0; j < K; j++) {
        if (F.cols[j] === null) { vals[j] = null; continue; }
        if (F.cols[j].pre) { vals[j] = F.cols[j].pre; continue; }
        sv = selAt(meta.cols[j], F.cols[j].fr, pl, j * pb, n, sel, m);
        if (sv) { sv[1].m = 1; sv[1].sp = meta.cols[j].n !== n; vals[j] = sv[1]; } else vals[j] = decodeColumn(meta.cols[j], zs, F.cols[j].fr);
      }
      rows = selRows(F, vals, sel, m);
      for (i = 0; i < L; i++) { p = pos[i]; var lo = 0, hi = m - 1; while (lo < hi) { at = (lo + hi) >> 1; if (sel[at] < p) lo = at + 1; else hi = at; } out[i] = rows[lo]; }
      return out;
    }
    readRows = guard(readRows);
    // B19: rows of a block whose value under key rk === val. mode 'plain' or 'codes' (see the patch notes). Same objects and key order as filtering readBlock(...)
    function readEq(bytes, want, verify, rk, val, mode, bc) {
      if (gen || lazyOn) return null;
      if (bc) return readEqCached(bytes, want, verify, rk, val, bc);
      var codes = mode === 'codes', F = flatFrames(zs, bytes, want, false, verify, codes), meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, keys = meta.keys, i, j, c, s, m = 0, jr = keys.indexOf(rk), q, x;
      if (F.ordList || keys.indexOf('__proto__') >= 0) { if (codes) frBlock(F); return eqKeep(F, want, rk, val); }
      if (jr < 0 || F.cols[jr] === null) return [];
      var cm = meta.cols[jr], col = F.cols[jr], pb = (n + 7) >> 3, sel = new Int32Array(n), dense = cm.n === n, rv = null, isN = cm.t === 'N';
      if (codes && (cm.t === 'D' || (isN && cm.p.t === 'D'))) {
        var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, c0 = -1;
        var anyv = val instanceof AnyOf, amk = null, anull = anyv && val.set.has(null);
        if (anyv) { var alb = DL(dp, frOne(col, o)), az; amk = new Uint8Array(alb.length + 1); for (az = 0; az < alb.length; az++) if (val.set.has(alb[az])) { amk[az] = 1; c0 = 0; } if (c0 < 0 && !(isN && anull)) return []; }
        else if (typeof val === 'string') c0 = DL(dp, frOne(col, o)).indexOf(val);
        if (c0 < 0 && !(isN && val === null) && !anyv) return [];   // the value is not in this block's labels: no other frame is decompressed
        var cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0;
        for (i = 0, s = jr * pb; i < n; i++) { if (!dense && !((pl[s + (i >> 3)] >> (i & 7)) & 1)) continue;
          if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; if (val === null || anull) sel[m++] = i; continue; } at++;
          if (anyv ? amk[cd[k++]] : (cd[k++] === c0 && c0 >= 0)) sel[m++] = i; }
        if (m * 2 > n) { var labs = typeof val === 'string' || anyv ? DL(dp, frOne(col, o)) : (cnt ? DL(dp, frOne(col, o)) : []), pre = new Array(cm.n), kk = 0; at = 0;
          if (np) { for (i = 0; i < cm.n; i++) pre[i] = (np[i >> 3] >> (i & 7)) & 1 ? null : labs[cd[kk++]]; } else for (i = 0; i < cnt; i++) pre[i] = labs[cd[i]];
          col.pre = pre; frBlock(F); var allr = assemble(F, want), pk = new Array(m); for (i = 0; i < m; i++) pk[i] = allr[sel[i]]; return pk; }
      } else {
        var kvA = val instanceof AnyOf ? new Array(n) : null, cfr = codes ? frAll(col) : col.fr; m = p14Sel(cm, cfr, val, pl, jr * pb, n, sel, kvA);
        if (m >= 0) rv = false;
        else { m = 0;
        rv = decodeColumn(cm, zs, cfr);
        if (kvA) { var vs = val.set; if (rv.length === n) { for (i = 0; i < n; i++) if (vs.has(rv[i])) sel[m++] = i; } else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { if (vs.has(rv[c++])) sel[m++] = i; } } }
        else if (rv.length === n) { for (i = 0; i < n; i++) if (rv[i] === val) sel[m++] = i; }
        else { for (i = 0, c = 0, s = jr * pb; i < n; i++) if ((pl[s + (i >> 3)] >> (i & 7)) & 1) { if (rv[c++] === val) sel[m++] = i; } }
        }
      }
      if (m * 2 > n) { if (codes) frBlock(F); if (rv) col.pre = rv; return eqKeep(F, want, rk, val); }
      if (rv === false && !m) return [];
      var out = new Array(m), vals = new Array(K), v; if (!m) return out;
      if (sparseV8(F, K, n, sel, m)) {
        for (j = 0; j < K; j++) {
          if (F.cols[j] === null) { vals[j] = null; continue; }
          if (j === jr && rv === false) { var gv = new Array(m); for (i = 0; i < m; i++) gv[i] = val; gv.m = 1; gv.sp = 0; vals[j] = gv; continue; }
          if (codes && !F.cols[j].pre && !(j === jr && rv)) { var sv0 = selAt(meta.cols[j], frAll(F.cols[j]), pl, j * pb, n, sel, m); if (sv0) { sv0[1].m = 1; sv0[1].sp = meta.cols[j].n !== n; vals[j] = sv0[1]; continue; } }
          vals[j] = F.cols[j].pre ? F.cols[j].pre : (j === jr && rv) ? rv : decodeColumn(meta.cols[j], zs, codes ? frAll(F.cols[j]) : F.cols[j].fr);
        }
        return selRows(F, vals, sel, m);
      }
      lateInit(out, m, F, keys, K, n);
      for (j = 0; j < K; j++) {
        if (F.cols[j] === null) continue;
        var key = keys[j], base = j * pb;
        if (j === jr && rv === false) { if (kvA) { for (i = 0; i < m; i++) out[i][key] = kvA[i]; } else for (i = 0; i < m; i++) out[i][key] = val; continue; }   // P14: every kept row holds val here
        if (codes && !F.cols[j].pre && !(j === jr && rv)) { var sv = selAt(meta.cols[j], frAll(F.cols[j]), pl, base, n, sel, m); if (sv) { for (i = 0; i < m; i++) if (sv[0][i] >= 0) out[i][key] = sv[1][i]; continue; } }   // B19b
        v = F.cols[j].pre ? F.cols[j].pre : (j === jr && rv) ? rv : decodeColumn(meta.cols[j], zs, codes ? frAll(F.cols[j]) : F.cols[j].fr);
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }
        for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) out[q][key] = v[c]; c++; } if (i === sel[q]) q++; }
      }
      return out;
    }
    // B19 cache: bc is this block's cache object ({} the first time). Same rows as readEq
    function readEqCached(bytes, want, verify, rk, val, bc) {
      var F = bc.F, j, i, c, m = 0, q, x;
      if (!F) { F = bc.F = flatFrames(zs, bytes, want, false, verify, true); F.pl = F.pl.slice(); bc.vals = []; for (j = 0; j < F.cols.length; j++) if (F.cols[j]) F.cols[j].keep = 1; }
      var meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, keys = meta.keys, jr = keys.indexOf(rk), pb = (n + 7) >> 3;
      if (F.ordList || keys.indexOf('__proto__') >= 0) { frBlock(F); return eqKeep(F, want, rk, val); }
      if (jr < 0 || F.cols[jr] === null) return [];
      var rc = bc['k' + jr], sel = new Int32Array(n), pk = -1, colOf = function (j) { var v = bc.vals[j]; if (v === undefined) v = bc.vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, frAll(F.cols[j])); return v; };
      var tk = meta.cols[jr].t === 'N' ? meta.cols[jr].p.t : meta.cols[jr].t;
      if (!rc && bc.vals[jr] === undefined && !F.cols[jr].pre && (tk === 'U' || tk === 'H' || tk === 'I')) { pk = p14Sel(meta.cols[jr], frAll(F.cols[jr]), val, pl, jr * pb, n, sel); m = pk < 0 ? 0 : pk; }   // P14: ID and address keys match in their kept bytes, no per-row strings kept (plain text keeps its strings: repeated searches of the whole text were slower)
      if (pk >= 0) {} else if (!rc) {   // per row: the label index (D) or the value itself; -1 / undefined for rows without the key, -2 for null
        var cm = meta.cols[jr], col = F.cols[jr], isN = cm.t === 'N', dense = cm.n === n;
        if (cm.t === 'D' || (isN && cm.p.t === 'D')) {
          var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, lab = DL(dp, frOne(col, o)), cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0, codeRow = new Int32Array(n).fill(-1);
          for (i = 0; i < n; i++) { if (!dense && !((pl[jr * pb + (i >> 3)] >> (i & 7)) & 1)) continue; if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; codeRow[i] = -2; continue; } at++; codeRow[i] = cd[k++]; }
          var lm = new Map(); for (i = 0; i < lab.length; i++) lm.set(lab[i], i);
          rc = bc['k' + jr] = { d: true, row: codeRow, lm: lm };
        } else {
          var rv = colOf(jr), byRow = new Array(n);
          if (rv.length === n) for (i = 0; i < n; i++) byRow[i] = rv[i]; else for (i = 0, c = 0; i < n; i++) if ((pl[jr * pb + (i >> 3)] >> (i & 7)) & 1) byRow[i] = rv[c++];
          rc = bc['k' + jr] = { d: false, row: byRow };
        }
      }
      if (pk >= 0) {} else if (rc.d) { var c0 = val === null ? -2 : typeof val === 'string' && rc.lm.has(val) ? rc.lm.get(val) : -3; if (c0 === -3) return []; var R = rc.row; for (i = 0; i < n; i++) if (R[i] === c0) sel[m++] = i; }
      else { var R2 = rc.row; for (i = 0; i < n; i++) if (R2[i] === val && (val !== undefined)) sel[m++] = i; }
      var out = new Array(m), v; if (!m) return out;
      if (m * 2 > n) { frBlock(F); for (j = 0; j < K; j++) if (F.cols[j] !== null && !F.cols[j].pre) F.cols[j].pre = colOf(j); var all = assemble(F, want), oo = new Array(m); for (i = 0; i < m; i++) oo[i] = all[sel[i]]; return oo; }
      if (sparseV8(F, K, n, sel, m)) {
        var cv = new Array(K);
        for (j = 0; j < K; j++) {
          if (F.cols[j] === null) { cv[j] = null; continue; }
          if (j === jr && pk >= 0) { var gw = new Array(m); for (i = 0; i < m; i++) gw[i] = val; gw.m = 1; gw.sp = 0; cv[j] = gw; continue; }
          if (bc.vals[j] === undefined && !F.cols[j].pre) { bc.hits = bc.hits || []; if (!bc.hits[j]) { bc.hits[j] = 1; var sw = selAt(meta.cols[j], frAll(F.cols[j]), pl, j * pb, n, sel, m); if (sw) { sw[1].m = 1; sw[1].sp = meta.cols[j].n !== n; cv[j] = sw[1]; continue; } } }
          cv[j] = colOf(j);
        }
        return selRows(F, cv, sel, m);
      }
      lateInit(out, m, F, keys, K, n);
      for (j = 0; j < K; j++) {
        if (F.cols[j] === null) continue;
        var key = keys[j], base = j * pb;
        if (j === jr && pk >= 0) { for (i = 0; i < m; i++) out[i][key] = val; continue; }
        if (bc.vals[j] === undefined && !F.cols[j].pre) { bc.hits = bc.hits || []; if (!bc.hits[j]) { bc.hits[j] = 1; var sv = selAt(meta.cols[j], frAll(F.cols[j]), pl, base, n, sel, m); if (sv) { for (i = 0; i < m; i++) if (sv[0][i] >= 0) out[i][key] = sv[1][i]; continue; } } }   // B19b: the first use decodes only the matching positions
        v = colOf(j); if (!v) continue;
        if (v.length === n) { for (i = 0; i < m; i++) out[i][key] = v[sel[i]]; continue; }
        for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) out[q][key] = v[c]; c++; } if (i === sel[q]) q++; }
      }
      return out;
    }
    // B19b: [value position per selected row (-1 = the row lacks the key), values] for column cm, or null to decode whole
    // P13k: in V8 a typed array of more than 64 bytes gets its own backing store, about a microsecond each; with 256 KB blocks this ran once per wanted column per block (3 per call), which made selAt 8 times slower than with 13 MB blocks. V8 reuses one scratch list for the asked positions (decodeAt reads it during the call only) and keeps the positions of the rows in a plain list; the other engines keep typed arrays (no gain in Firefox 158 or WebKitGTK 2.52.6)
    var SA_VI = new Int32Array(1024);
    function selAt(cm, frames, pl, base, n, sel, m) {
      if (V8 && SA_VI.length < m) SA_VI = new Int32Array(Math.max(m, SA_VI.length * 2));
      var dense = cm.n === n, vi = V8 ? SA_VI : new Int32Array(m), mi = V8 ? new Array(m) : new Int32Array(m), i, c, q, k = 0;
      if (dense) { for (q = 0; q < m; q++) { vi[q] = sel[q]; mi[q] = q; } k = m; }
      else { for (i = 0, c = 0, q = 0; q < m; i++) { var has = (pl[base + (i >> 3)] >> (i & 7)) & 1; if (i === sel[q]) { if (has) { vi[k] = c; mi[q] = k++; } else mi[q] = -1; q++; } if (has) c++; } }
      var got = decodeAt(cm, frames, vi, k); if (!got) return null;
      var out = new Array(m); for (q = 0; q < m; q++) out[q] = mi[q] >= 0 ? got[mi[q]] : undefined; return [mi, out];   // mi is the position list (it used to be copied)
    }
    // P13e, V8 only: the selected rows of a block whose rows lack some keys (from 20 wanted keys, gated as P13d: with 16 keys row windows were 1.10-1.15 warm) are made one row at a time from per-row value lists, as P13d does for whole blocks (assigning one key at a time down the selected rows gave each row a long chain of shape changes, so a 40% match read took longer than reading every row). Same objects, same key order
    function sparseV8(F, K, n, sel, m) { if (!V8 || K < 20 || K > 250 || F.ordList) return false; var j, nk = 0, sp = false, pv = new Array(K); for (j = 0; j < K; j++) if (F.cols[j] !== null) { nk++; pv[j] = { length: F.cols[j].pre ? F.cols[j].pre.length : F.meta.cols[j].n }; if (pv[j].length !== n) sp = true; } return sp && nk >= 20 && rowWise(pv, K, n, F.pl, (n + 7) >> 3, sel, m); }
    function gatherCol(v, pl, base, n, sel, m) { var G = new Array(m), i, c, q; if (v.length === n) { for (q = 0; q < m; q++) G[q] = v[sel[q]]; return G; } for (q = 0; q < m; q++) G[q] = undefined; for (i = 0, c = 0, q = 0; q < m; i++) { if ((pl[base + (i >> 3)] >> (i & 7)) & 1) { if (i === sel[q]) G[q] = v[c]; c++; } if (i === sel[q]) q++; } return G; }
    function rowsFromCols(m, keys, K, Gs) {
      var RK = [], RG = [], SG = [], nb = 0, ns = 0, ts = '{', i, j, o, x, all, out = new Array(m);
      for (j = 0; j < K; j++) if (Gs[j]) { RK[nb] = keys[j]; RG[nb] = Gs[j]; if (Gs[j].sp) SG[ns++] = Gs[j]; ts += (nb ? ',' : '') + JSON.stringify(keys[j]) + ':null'; nb++; }
      var tp = JSON.parse(ts + '}'), toHash = nb >= 24;
      for (i = 0; i < m; i++) { all = true; for (j = 0; j < ns && all; j++) all = SG[j][i] !== undefined;
        if (all) { o = { ...tp }; for (j = 0; j < nb; j++) o[RK[j]] = RG[j][i]; out[i] = o; continue; }
        o = {}; if (toHash) { o.__h = 0; delete o.__h; }
        for (j = 0; j < nb; j++) { x = RG[j][i]; if (x !== undefined) o[RK[j]] = x; }
        out[i] = o; }
      return out;
    }
    function selRows(F, vals, sel, m) {   // vals[j]: the decoded column (block-wide, dense or packed), an m-long list (.m set: values of the selected rows), or null
      var keys = F.meta.keys, K = keys.length, n = F.n, pb = (n + 7) >> 3, Gs = new Array(K), j, v, g;
      for (j = 0; j < K; j++) { v = vals[j]; if (!v) { Gs[j] = null; continue; } if (v.m) { g = v; g.sp = v.sp; } else { g = gatherCol(v, F.pl, j * pb, n, sel, m); g.sp = v.length !== n; } Gs[j] = g; }
      return rowsFromCols(m, keys, K, Gs);
    }
    // matching rows of a wide dense block start as clones of one template, as whole-block reads do (from 16 keys), so building only the matches never costs more than building every row
    // B36: outside V8, a dense block (every present key in every row) is built 1,024 rows at a time: the rows of a chunk are made, then each column is assigned down the chunk.
    // Same objects and key order as lateInit plus the column loop below; the rows are filled while they are still young, and the chunk's slice of each column stays in cache.
    function b36Dense(vals, K, n) { var j, nk = 0; for (j = 0; j < K; j++) if (vals[j]) { nk++; if (vals[j].length !== n) return false; } return nk > 0; }
    function b36Rows(out, m, F, keys, K, n, vals, lo, hi) {
      var i, j, i0, i1, nk = 0, ts = '{', tpl = null, v, key;
      for (j = 0; j < K; j++) if (vals[j]) { ts += (nk ? ',' : '') + JSON.stringify(keys[j]) + ':null'; nk++; }
      if (K <= 250 && nk >= CLONE_KEYS && (nk === K || V8)) tpl = JSON.parse(ts + '}');
      for (i0 = lo; i0 < hi; i0 = i1) { i1 = i0 + 1024 < hi ? i0 + 1024 : hi;
        if (tpl) for (i = i0; i < i1; i++) out[i - lo] = { ...tpl }; else for (i = i0; i < i1; i++) out[i - lo] = {};
        for (j = 0; j < K; j++) { v = vals[j]; if (!v) continue; key = keys[j]; for (i = i0; i < i1; i++) out[i - lo][key] = v[i]; } }
      return out;
    }
    function lateInit(out, m, F, keys, K, n) {
      var i, j, ok = K <= 250 && !F.ordList && keys.indexOf('__proto__') < 0, ts, tpl, nk = 0, f = 1;
      for (j = 0; j < K && ok; j++) if (F.cols[j] !== null) { nk++; ok = F.cols[j].pre ? F.cols[j].pre.length === n : F.meta.cols[j].n === n; }
      if (nk < CLONE_KEYS || (nk < K && !V8)) ok = false;
      if (!ok) { for (i = 0; i < m; i++) out[i] = {}; return; }
      for (j = 0, ts = '{'; j < K; j++) if (F.cols[j] !== null) { ts += (f ? '' : ',') + JSON.stringify(keys[j]) + ':null'; f = 0; } tpl = JSON.parse(ts + '}');
      for (i = 0; i < m; i++) out[i] = { ...tpl };
    }
    function eqKeep(F, want, rk, val) { var r = assemble(F, want), out = [], i; if (val instanceof AnyOf) { for (i = 0; i < r.length; i++) if (Object.prototype.hasOwnProperty.call(r[i], rk) && val.set.has(r[i][rk])) out.push(r[i]); return out; } for (i = 0; i < r.length; i++) if (r[i][rk] === val) out.push(r[i]); return out; }
    readEq = guard(readEq);
    // typed-columns read (no row objects): { n, keys, cols: { key: values }, present: { key: Uint8Array bit plane or null when every row has it } }; a key missing from some rows has values only for the rows that carry it, in row order
    function columns(F, want, nan, into, off) {
      var meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, pb = (n + 7) >> 3, cols = {}, present = {}, j, v;
      if (F.ordList) throw new Error('LfcPack: columns read needs a block without key-order lists');
      for (j = 0; j < K; j++) {
        if (want && !want[meta.keys[j]]) continue;
        var tg = into && into[meta.keys[j]] && meta.cols[j].n === n && !isByteHolder(into[meta.keys[j]]) ? intoSlot(into[meta.keys[j]], meta.keys[j], off, n) : null;   // 0.10.33 into: the caller's Float64Array, the n values of this block
        v = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr, nan, tg);
        if (tg && v && v !== tg && v.length === n && (v instanceof Float64Array || v instanceof Int32Array)) { tg.set(v); v = tg; }
        if (!v) continue;
        cols[meta.keys[j]] = v; present[meta.keys[j]] = v.length === n ? null : pl.subarray(j * pb, (j + 1) * pb);
      }
      var out = { n: n, keys: Object.keys(cols), cols: cols, present: present };
      return nan ? nanCols(out) : out;
    }
    return { generated: function (on) { gen = !!on; }, lazy: function (on) { lazyOn = on; }, readBlock: readBlock, readRange: readRange, readSel: readSel, readPos: readPos, readRows: readRows, readEq: readEq, assemble: assemble, columns: columns, columnsOf: function (bytes, want, verify, nan, into, off) { return columns(flatFrames(zs, bytes, want, false, verify), want, nan, into, off); } };
  }
