// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ flat-rows block (kind 'f'): every row is an object; one presence bit plane per key, one typed column per key
  // Layout: u32 header length, JSON header, then zstd frames: meta (keys and column table), presence planes, then the frames of each column.
  // Column types: V varints (delta when sorted, zigzag otherwise, whole numbers or two-decimal numbers), B bit-packed offsets, F float64 bytes, T booleans,
  // A lists of whole numbers (link lists: lengths plus deltas), H fixed-length lowercase hex, L log templates (automatic: kept only when 5% smaller than plain and a writer-side sample shows full-line reads are not slower (templates:true skips the read check, false turns them off)), U lowercase UUID as 16 bytes, I IPv4 as 4 bytes, D block dictionary plus codes, s strings, j JSON text (anything else).
  var LV_FLAT = 3;
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
  function decimalsOf(x) { var t = String(x), e = t.indexOf('.'); return e < 0 ? 0 : t.indexOf('e') >= 0 ? -1 : t.length - e - 1; }
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
  // Choosing a column's layout: each candidate's compressed size is estimated, and only the winner is compressed in full. A frame of 64 KB or less is compressed exactly (that result is
  // kept); a longer one is estimated from 4 evenly spaced 16 KB slices, scaled up and capped at its raw size. When the best two estimates are within 2% of each other both are compressed in
  // full and the smaller is kept (a tie goes to the candidate tried first), so a close call is always decided exactly. Same file format; a column's pick can differ from an exact pick only
  // when the estimates were more than 2% apart yet wrong.
  function sizeOf(zs, level, fr) {
    var t = 0, z = [], exact = true, q, f, L, c, k, o, s, K = 4, sl = 16384;
    for (q = 0; q < fr.length; q++) {
      f = fr[q]; L = f.length;
      if (L <= 65536) { c = zs.compress(f, level); if (c.length < L) { z.push([L, c, 1]); t += c.length; } else { z.push([L, f, 0]); t += L; } }
      else { exact = false; s = new Uint8Array(K * sl); for (k = 0; k < K; k++) { o = Math.floor((L - sl) * k / (K - 1)) & ~7; s.set(f.subarray(o, o + sl), k * sl); } c = zs.compress(s, level); t += Math.min(L, Math.ceil(c.length * L / s.length)); }
    }
    return { size: t, z: exact ? z : null };
  }
  function addCand(zs, level, best, t, p, fr, n, st) {   // -> the new best (it carries the runner-up in .next)
    var e = sizeOf(zs, level, fr), c = { t: t, p: p, fr: fr, z: e.z, size: e.size, n: n, st: st, next: null, ord: best ? best.cnt : 0, cnt: best ? best.cnt + 1 : 1 };
    if (!best) return c;
    best.cnt = c.cnt;
    if (e.size < best.size) { c.next = best; return c; }
    if (!best.next || e.size < best.next.size) best.next = c;
    return best;
  }
  function fullOf(zs, level, c) {
    var t = 0, z = [], q, f, k;
    if (c.z) return c;
    for (q = 0; q < c.fr.length; q++) { f = c.fr[q]; k = zs.compress(f, level); if (k.length < f.length) { z.push([f.length, k, 1]); t += k.length; } else { z.push([f.length, f, 0]); t += f.length; } }
    c.z = z; c.size = t; return c;
  }
  function settle(zs, level, best) {   // the chosen candidate with its real frames
    var b = best, r, o;
    if (!b || !b.fr) return b;
    r = b.next;
    if (r && r.size <= b.size * 1.02 && (!b.z || !r.z)) { fullOf(zs, level, b); fullOf(zs, level, r); if (r.size < b.size || (r.size === b.size && r.ord < b.ord)) b = r; }
    else fullOf(zs, level, b);
    b.fr = null; b.next = null; return b;
  }
  function encodeColumn(v, zs, level, tmode, sj, key) { var nb = nullBest(v, zs, level, tmode, key); if (nb) return nb; return settle(zs, level, encodeColumn0(v, zs, level, tmode, sj, key)); }
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
    NMARK++; return { t: 'N', p: { t: inner.t, p: inner.p, m: fz.m }, n: n, z: [pzz].concat(inner.z), size: size, nn: fz.nn };
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
    NMARK++; return { t: 'N', p: { t: inner.t, p: inner.p, m: m }, n: n, z: [pzz].concat(inner.z), size: size, nn: nn };
  }
  // the V and B candidates of a number column held as scaled whole numbers (base), by the general writer's rules: the delta form only when its varints are not clearly longer (5%), the bit-packed form when the range is under 2^24
  function numGeneral(cand, bestOf, base, n, scale) {
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
      if (!noNegZero) base = null; else if (allInt) base = v; else { scale = decimalScale(v); base = scale ? DS_INTS : null; DS_INTS = null; if (!base) { scale = 1; base = null; } }
      if (base && n > 0) {   // scaled whole numbers: the typed-array passes the fast writer uses (same candidates, same rules, same bytes)
        numGeneral(cand, function () { return best; }, base instanceof Float64Array ? base : new Float64Array(base), n, scale);
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
      if (L >= 16 && L % 2 === 0 && allOf(v, function (x) { return x.length === L && RX_HEX.test(x); })) {
        raw = new Uint8Array(n * L / 2); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < L; j += 2) raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); }
        cand('H', { L: L }, [raw]); return best;
      }
      if (L === 36 && allOf(v, function (x) { return RX_UUID.test(x); })) {
        raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { x = v[i]; for (j = 0; j < 36; j += 2) { if (j === 8 || j === 13 || j === 18 || j === 23) j++; raw[p++] = (hexv(x.charCodeAt(j)) << 4) | hexv(x.charCodeAt(j + 1)); } }
        cand('U', {}, [raw]); return best;
      }
      if (allOf(v, function (x) { var m = RX_IP.exec(x); return m && m[1] < 256 && m[2] < 256 && m[3] < 256 && m[4] < 256; })) {
        raw = new Uint8Array(n * 4); for (i = 0; i < n; i++) { x = v[i]; var o1 = x.indexOf('.'), o2 = x.indexOf('.', o1 + 1), o3 = x.indexOf('.', o2 + 1); raw[p++] = +x.slice(0, o1); raw[p++] = +x.slice(o1 + 1, o2); raw[p++] = +x.slice(o2 + 1, o3); raw[p++] = +x.slice(o3 + 1); }
        cand('I', {}, [raw]); return best;
      }
      if (sj || allOf(v, function (x) { return x.indexOf('\0') < 0 && wellFormed(x); })) {   // sj: ASCII without 0 bytes, so well formed
        var map = new Map(), labels = [], codes = new Array(n), c;
        if (sj) labels.length = (n >> 1) + 1;   // where the loop below would stop
        else for (i = 0; i < n; i++) { c = map.get(v[i]); if (c === undefined) { if (labels.length * 2 > n) break; c = labels.length; map.set(v[i], c); labels.push(v[i]); } codes[i] = c; }   // past n / 2 distinct values the column is neither a dictionary nor sharing templates cheaply, and the full count is not needed
        if (labels.length * 4 > n || labels.length >= 65536) cand('s', {}, [sj || te.encode(v.join('\0'))]);   // a dictionary this small is the smaller layout; skip compressing the plain one as well
        // once the read check has failed (auto mode) the template layout can no longer win, so it is not built
        if (n >= 16 && labels.length * 2 > n && tmode && !(tmode === 1 && tmplSlow) && (tmode === 2 || templatesPlausible(v))) { var tf = templateFrames(v); if (tf) { best = settle(zs, level, best); var before = best.size, sv = stored(tf.frames); if (sv.size < before * 0.95 && (tmode === 2 || templatesReadOk(v, key))) best = { t: 'L', p: {}, z: sv.z, size: sv.size, n: n }; } }
        if (labels.length * 4 <= n && labels.length < 65536) {
          var wd = Math.max(1, 32 - Math.clz32(labels.length - 1)), cb = labels.length > 256 ? new Uint8Array(new Uint16Array(codes).buffer) : new Uint8Array(codes);
          cand('D', { w: 0, wide: labels.length > 256 }, [te.encode(labels.join('\0')), cb], { distinct: labels.length });
          cand('D', { w: wd, wide: false }, [te.encode(labels.join('\0')), bitpack(codes, wd)], { distinct: labels.length });
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
  function colV(frames, n, p) { var i, u, o; if (!p.mono && !p.delta && n >= 16384) { u = colZZ(frames[0], n, p.scale); return p.scale !== 1 ? u : narrow(u); } u = unvarints(frames[0], n); if (p.mono) { var s = 0; for (i = 0; i < n; i++) { s += u[i]; u[i] = s; } if (s > 9007199254740992) throw new Error('damaged block: number column out of range'); } else if (p.delta) { var s2 = 0; for (i = 0; i < n; i++) { s2 += unzz(u[i]); if (s2 > 9007199254740992 || s2 < -9007199254740992) throw new Error('damaged block: number column out of range'); u[i] = s2; } } else for (i = 0; i < n; i++) u[i] = unzz(u[i]); if (p.scale !== 1) { for (i = 0; i < n; i++) u[i] /= p.scale; return u; } return narrow(u); }
  function colB(frames, n, p) { var i, u, o; var bu = bitunpack(frames[0], n, p.w); o = new Float64Array(n); for (i = 0; i < n; i++) o[i] = (bu[i] + p.mn) / p.scale; return p.scale === 1 ? narrow(o) : o; }
  function colT(frames, n, p) { var i, u, o; var tb = bitunpack(frames[0], n, 1); o = new Array(n); for (i = 0; i < n; i++) o[i] = tb[i] === 1; return o; }
  function colD(frames, n, p) { var i, u, o; var lab = tdr.decode(frames[0]).split('\0'), cd = p.w ? bitunpack(frames[1], n, p.w) : p.wide ? new Uint16Array(frames[1].buffer.slice(frames[1].byteOffset, frames[1].byteOffset + n * 2)) : frames[1]; o = new Array(n); for (i = 0; i < n; i++) o[i] = lab[cd[i]]; return o; }

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
    if (t === 'D') { var lab = tdr.decode(frames[0]).split('\0'); cd = frames[1];
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
  function decodeColumn(c, zs, frames) {   // -> array-like of n values
    var n = c.n, i, u, o, t = c.t, p = c.p;
    if (t === 'N') { var iv = decodeColumn({ t: p.t, p: p.p, n: p.m }, zs, frames.slice(1)), pn = frames[0], q = 0; o = new Array(n); if (pn.length < (n + 7) >> 3) throw new Error('damaged block: N plane cut off'); for (i = 0; i < n; i++) o[i] = (pn[i >> 3] >> (i & 7)) & 1 ? null : iv[q++]; if (q !== p.m) throw new Error('damaged block: N count'); return o; }
    if (t === 'V') return colV(frames, n, p);
    if (t === 'B') return colB(frames, n, p);
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
    if (t === 'L') return untemplate(n, frames);
    if (t === 's') return n ? tdr.decode(frames[0]).split('\0') : [];
    if (t === 'D') return colD(frames, n, p);
    if (n && jnulls(frames[0], n)) { o = new Array(n); for (i = 0; i < n; i++) o[i] = null; return o; } var js = n ? tdr.decode(frames[0]).split('\n') : []; o = new Array(n); if (V8 || GECKO) { for (i = 0; i < n; i++) o[i] = jcell(js[i]); return o; } for (i = 0; i < n; i++) o[i] = JSON.parse(js[i]); return o;
  }
  // 'j' cells: most are null, true, false or whole numbers; JSON.parse per cell costs about 80 ns, so read those by hand (whole numbers of up to 15 characters, digits only, no leading zero, are exact in a double); anything else goes to JSON.parse. Chromium and Firefox only: in WebKitGTK the per-cell reader was slower than JSON.parse (cloud WebKitGTK 2.52.6, 100,000 orders: unpackColumns 1.08 to 1.20 of the time), so it keeps JSON.parse there; the all-null check runs in every engine
  function jnulls(f, n) { if (f.length !== n * 5 - 1) return false; for (var i = 0; i < f.length; i += 5) if (f[i] !== 110 || f[i + 1] !== 117 || f[i + 2] !== 108 || f[i + 3] !== 108 || (i + 4 < f.length && f[i + 4] !== 10)) return false; return true; }
  function jcell(s) { var c0 = s.charCodeAt(0), L = s.length, i, v, d; if (c0 === 110 && s === 'null') return null; if (c0 === 116 && s === 'true') return true; if (c0 === 102 && s === 'false') return false; if (L <= 15) { i = c0 === 45 ? 1 : 0; if (i < L && (s.charCodeAt(i) !== 48 || L === i + 1)) { v = 0; for (; i < L; i++) { d = s.charCodeAt(i) - 48; if (d < 0 || d > 9) break; v = v * 10 + d; } if (i === L) return c0 === 45 ? -v : v; } } return JSON.parse(s); }
  // returns null when the input is not flat rows (some line is not a JSON object)
  function writeFlatBlock(ctx, input, opts) { B18_ALLV = !!(input && input.rowsIn); try { return writeFlatBlock0(ctx, input, opts); } finally { B18_ALLV = false; } }
  function b21Generic(c) { var a = new Array(c.c), i, k = 0; for (i = 0; i < c.c; i++) a[i] = c.np !== null && (c.np[i >> 3] >> (i & 7)) & 1 ? null : c.nb[k++]; return a; }   // B21c: back to a generic array (values in order)
  function b21Flags(a, m) { var nz = 0, ai = 1, i, x; for (i = 0; i < m; i++) { x = a[i]; if (ai && !(x % 1 === 0 && x < 1125899906842624 && x > -1125899906842624)) ai = 0; if (x === 0 && 1 / x < 0) nz = 1; } return { nz: nz, ai: ai }; }
  function writeFlatBlock0(ctx, input, opts) {
    var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, rowsIn = input && input.rowsIn, text = rowsIn ? '' : td.decode(input), lines, rows = rowsIn || [], i, j, r, nl = 0, at = -1;
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
    var n = rows.length, keys = [], seen = new Map(), cols = [], k, v, jx;
    var pb = (n + 7) >> 3, ord = opts.exact ? { map: new Map(), list: [], ids: new Array(n) } : null, sq, pk = [], px = [], q, pls = [], cs21 = [], c21, x21, pre21 = [];
    for (i = 0; i < n; i++) {   // B21a: one pass; a key at the same position as in the previous row is matched by a string compare, not a Map lookup
      r = rows[i]; sq = ord ? [] : null; q = 0;
      for (k in r) { if (pk[q] === k) jx = px[q]; else { jx = seen.get(k); if (jx === undefined) { jx = keys.length; seen.set(k, jx); keys.push(k); cols.push(null); cs21.push({ a: null, nb: new Float64Array(n), np: null, m: 0, c: 0 }); pls.push(new Uint8Array(pb)); } pk[q] = k; px[q] = jx; }
        q++; pls[jx][i >> 3] |= 1 << (i & 7); x21 = r[k]; c21 = cs21[jx];
        if (c21.a !== null) c21.a.push(x21); else if (typeof x21 === 'number') { c21.nb[c21.m++] = x21; c21.c++; } else if (x21 === null) { if (c21.np === null) c21.np = new Uint8Array(pb); c21.np[c21.c >> 3] |= 1 << (c21.c & 7); c21.c++; } else { c21.a = b21Generic(c21); c21.a.push(x21); c21.nb = null; }
        if (sq) sq.push(jx); }
      if (ord) { var sk = sq.join(','), oid = ord.map.get(sk); if (oid === undefined) { oid = ord.list.length; ord.map.set(sk, oid); ord.list.push(sq); } ord.ids[i] = oid; }
    }
    var planes = new Uint8Array(pb * keys.length); for (j = 0; j < pls.length; j++) planes.set(pls[j], j * pb);
    for (j = 0; j < cs21.length; j++) { c21 = cs21[j]; pre21.push(null); if (c21.a !== null) { cols[j] = c21.a; continue; }   // B21c: number columns, typed
      if (c21.m === c21.c && c21.c > 0) { cols[j] = c21.nb.subarray(0, c21.c); pre21[j] = b21Flags(cols[j], c21.c); }
      else if (c21.m > 0 && c21.c > 1 && NULL_MODE === 'plane') { cols[j] = c21; pre21[j] = b21Flags(c21.nb, c21.m); }
      else cols[j] = b21Generic(c21); }
    var enc = [], frames = [], meta = { keys: keys, cols: [] }, zone = [];
    for (j = 0; j < cols.length; j++) {
      var tm21 = opts.templates === false ? 0 : opts.templates === true ? 2 : 1, e;
      if (pre21[j] && cols[j].nb) { c21 = cols[j]; NN_FLAGS[0] = pre21[j].nz; NN_FLAGS[1] = pre21[j].ai; e = nullNumBest({ nn: c21.nb.subarray(0, c21.m), pl: c21.np, m: c21.m, nz: pre21[j].nz, ai: pre21[j].ai }, null, c21.c, zs, level, tm21, keys[j]); if (!e) e = encodeColumn(b21Generic(c21), zs, level, tm21, undefined, keys[j]); cols[j] = []; }
      else if (pre21[j]) e = settle(zs, level, encodeColumn0(cols[j], zs, level, tm21, undefined, keys[j], pre21[j]));
      else e = encodeColumn(cols[j], zs, level, tm21, undefined, keys[j]);
      enc.push(e);
      meta.cols.push({ t: e.t, p: e.p, n: e.n, f: e.z.map(function (z) { return [z[0], z[1].length, z[2]]; }), st: e.st, _z: e.z });
      for (i = 0; i < e.z.length; i++) frames.push(e.z[i][1]);
      if (e.t === 'N' && (e.p.t === 'V' || e.p.t === 'B' || e.p.t === 'F') && e.nn.length) { var mnN = Infinity, mxN = -Infinity; for (i = 0; i < e.nn.length; i++) { if (e.nn[i] < mnN) mnN = e.nn[i]; if (e.nn[i] > mxN) mxN = e.nn[i]; } zone.push([fnvStr('.' + keys[j]), mnN, mxN, e.n]); }
      if ((e.t === 'V' || e.t === 'B' || e.t === 'F') && cols[j].length) { var mn = Infinity, mx = -Infinity, a = cols[j]; for (i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; } zone.push([fnvStr('.' + keys[j]), mn, mx, a.length]); }
    }
    if (ord) { var oB = te.encode(JSON.stringify(ord.list)), oz = zs.compress(oB, level), od = typedColumn(ord.ids), odz = zs.compress(od[2], level); meta.ord = [oB.length, oz.length, od[0], od[2].length, odz.length]; frames.unshift(oz, odz); }
    var mB = te.encode(JSON.stringify(withColumnInfo(meta, opts, zs))), zm = zs.compress(mB, level), zp = zs.compress(planes, level);
    var hdr = te.encode(JSON.stringify({ k: 'f', n: n, m: [mB.length, zm.length], pl: [planes.length, zp.length] }));
    var out = concat([u32le(hdr.length), hdr, zm, zp].concat(frames)); return { bytes: out, rows: n, zone: zone, kind: 'f', prefix: out.length - colBytes(meta) };
  }
  // ---- flat writer, fast path (flatscan.c): rows whose values are all numbers or arrays of whole numbers are read straight from the text bytes in wasm, no JSON.parse; anything else returns null and the JSON.parse path runs
  function dropSmallWasm() { TPLW = null; FSW = null; }   // trim(): the template and flat-scan helpers start again small when next needed
  var FSW = null, FSB64 = "/*FS:BEGIN*//*FS:END*/", FSP64 = "/*FP:BEGIN*//*FP:END*/";
  function fsw() {
    if (FSW) return FSW;
    var fk = hasSimd() ? 'FSB64' : 'FSP64';   // flatscan.wasm counts with SIMD; flatscan-plain.wasm is the same code without it (same results)
    if (!MODS[fk]) MODS[fk] = new WebAssembly.Module(fromB64(fk === 'FSB64' ? FSB64 : FSP64));
    var x = new WebAssembly.Instance(MODS[fk], {}).exports;
    return (FSW = { x: x, heap: x.__heap_base.value });
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
    var frames = [], meta = { keys: keys, cols: [] }, zone = [], best, cd, z, k2, t;
    function cand(tn, p, fr, n) { best = addCand(zs, level, best, tn, p, fr, n); }
    function numCands(base, c, scale, key, zc) {   // the candidates of a number column held as scaled whole numbers (mantissas), as the general writer would try them
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
      best = null; c = count[j];
      if (hexL[j] === 3600) cand('U', {}, [colv[j]], c);   // as encodeColumn writes a UUID column
      else if (hexL[j] > 0) cand('H', { L: hexL[j] }, [colv[j]], c);   // as encodeColumn writes a hex column
      else if (ipK[j]) cand('I', {}, [sdOut[j]], c);   // as encodeColumn writes an IPv4 column
      else if (sOnly[j]) cand('s', {}, [sdMany[j]], c);   // as encodeColumn writes a many-value string column without templates
      else if (sdD[j]) {   // as encodeColumn writes a string column of at most n / 2 distinct values
        var D3 = sdD[j], cds = sdCodes[j];
        if (!cds) cand('s', {}, [sdOut[j]], c);
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
      best = settle(zs, level, best); meta.cols.push({ t: best.t, p: best.p, n: best.n, f: best.z.map(function (zz3) { return [zz3[0], zz3[1].length, zz3[2]]; }), st: best.st, _z: best.z });
      for (i = 0; i < best.z.length; i++) frames.push(best.z[i][1]);
    }
    var planes = m8.slice(P.planes, P.planes + nk * pb), mB = te.encode(JSON.stringify(withColumnInfo(meta, opts, zs))), zm = zs.compress(mB, level), zp = zs.compress(planes, level);
    var hdr = te.encode(JSON.stringify({ k: 'f', n: nrows, m: [mB.length, zm.length], pl: [planes.length, zp.length] }));
    var out = concat([u32le(hdr.length), hdr, zm, zp].concat(frames)), k67 = false; for (j = 0; j < nk; j++) if (ktype[j] >= 6) k67 = true; return { bytes: out, rows: nrows, zone: zone, kind: 'f', prefix: out.length - colBytes(meta), k67: k67 };   // k67: some key needed the per-column fallback (long numbers, mixed kinds); see api.js
  }
  // with { check: 'xxh64' }: each column gets `o` (where its first frame starts, counted from the first column frame) and `x` (the XXH64 of its frames, 16 hex digits), so a reader that wants a few columns goes straight to them and checks only their bytes
  function colBytes(meta) { var t = 0, j, i; for (j = 0; j < meta.cols.length; j++) for (i = 0; i < meta.cols[j].f.length; i++) t += meta.cols[j].f[i][1]; return t; }
  function xhex(zs, b) { var h = zs.xxh64(b); return (h[1] + 4294967296).toString(16).slice(1) + (h[0] + 4294967296).toString(16).slice(1); }
  function withColumnInfo(meta, opts, zs) {
    var o = 0, j, c, check = opts && opts.check === 'xxh64';
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
        for (b = 0; b < (n >> 3); b++) cnt += popc8[pl[base + b]];
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
        if (anyv) { var alb = tdr.decode(frOne(col, o)).split('\0'), az; amk = new Uint8Array(alb.length + 1); for (az = 0; az < alb.length; az++) if (val.set.has(alb[az])) { amk[az] = 1; c0 = 0; } if (c0 < 0 && !(isN && anull)) return []; }
        else if (typeof val === 'string') c0 = tdr.decode(frOne(col, o)).split('\0').indexOf(val);
        if (c0 < 0 && !(isN && val === null) && !anyv) return [];   // the value is not in this block's labels: no other frame is decompressed
        var cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0;
        for (i = 0, s = jr * pb; i < n; i++) { if (!dense && !((pl[s + (i >> 3)] >> (i & 7)) & 1)) continue;
          if (np && (np[at >> 3] >> (at & 7)) & 1) { at++; if (val === null || anull) sel[m++] = i; continue; } at++;
          if (anyv ? amk[cd[k++]] : (cd[k++] === c0 && c0 >= 0)) sel[m++] = i; }
        if (m * 2 > n) { var labs = typeof val === 'string' || anyv ? tdr.decode(frOne(col, o)).split('\0') : (cnt ? tdr.decode(frOne(col, o)).split('\0') : []), pre = new Array(cm.n), kk = 0; at = 0;
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
          var dp = isN ? cm.p.p : cm.p, cnt = isN ? cm.p.m : cm.n, o = isN ? 1 : 0, lab = tdr.decode(frOne(col, o)).split('\0'), cf = frOne(col, o + 1), cd = dp.w ? bitunpack(cf, cnt, dp.w) : dp.wide ? new Uint16Array(cf.buffer.slice(cf.byteOffset, cf.byteOffset + cnt * 2)) : cf, np = isN ? frOne(col, 0) : null, k = 0, at = 0, codeRow = new Int32Array(n).fill(-1);
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
    function selAt(cm, frames, pl, base, n, sel, m) {
      var dense = cm.n === n, vi = new Int32Array(m), vv = [], mi = new Int32Array(m), i, c, q, k = 0;
      if (dense) { for (q = 0; q < m; q++) { vi[q] = sel[q]; mi[q] = q; } k = m; }
      else { for (i = 0, c = 0, q = 0; q < m; i++) { var has = (pl[base + (i >> 3)] >> (i & 7)) & 1; if (i === sel[q]) { if (has) { vi[k] = c; mi[q] = k++; } else mi[q] = -1; q++; } if (has) c++; } }
      var got = decodeAt(cm, frames, vi, k); if (!got) return null;
      var pos = new Int32Array(m), out = new Array(m); for (q = 0; q < m; q++) { pos[q] = mi[q]; out[q] = mi[q] >= 0 ? got[mi[q]] : undefined; } return [pos, out];
    }
    // matching rows of a wide dense block start as clones of one template, as whole-block reads do (from 16 keys), so building only the matches never costs more than building every row
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
    function columns(F, want) {
      var meta = F.meta, n = F.n, K = meta.keys.length, pl = F.pl, pb = (n + 7) >> 3, cols = {}, present = {}, j, v;
      if (F.ordList) throw new Error('LfcPack: columns read needs a block without key-order lists');
      for (j = 0; j < K; j++) {
        if (want && !want[meta.keys[j]]) continue;
        v = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr);
        if (!v) continue;
        cols[meta.keys[j]] = v; present[meta.keys[j]] = v.length === n ? null : pl.subarray(j * pb, (j + 1) * pb);
      }
      return { n: n, keys: Object.keys(cols), cols: cols, present: present };
    }
    return { generated: function (on) { gen = !!on; }, lazy: function (on) { lazyOn = on; }, readBlock: readBlock, readRange: readRange, readSel: readSel, readEq: readEq, assemble: assemble, columns: columns, columnsOf: function (bytes, want, verify) { return columns(flatFrames(zs, bytes, want, false, verify), want); } };
  }
