// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ flat-rows block (kind 'f'): every row is an object; one presence bit plane per key, one typed column per key
  // Layout: u32 header length, JSON header, then zstd frames: meta (keys and column table), presence planes, then the frames of each column.
  // Column types: V varints (delta when sorted, zigzag otherwise, whole numbers or two-decimal numbers), B bit-packed offsets, F float64 bytes, T booleans,
  // A lists of whole numbers (link lists: lengths plus deltas), H fixed-length lowercase hex, L log templates (automatic: kept only when smaller than plain and a writer-side sample shows full-line reads are not slower (templates:true skips the read check, false turns them off)), U lowercase UUID as 16 bytes, I IPv4 as 4 bytes, D block dictionary plus codes, s strings, j JSON text (anything else).
  var LV_FLAT = 3;
  function zz(x) { return x >= 0 ? x * 2 : -x * 2 - 1; }
  function unzz(x) { return (x % 2 === 0) ? x / 2 : -(x + 1) / 2; }
  function varints(a) {
    var n = 0, i, u, o, p = 0;
    for (i = 0; i < a.length; i++) { u = a[i]; n += 1; while (u >= 128) { n++; u = Math.floor(u / 128); } }
    o = new Uint8Array(n);
    for (i = 0; i < a.length; i++) { u = a[i]; while (u >= 128) { o[p++] = (u % 128) | 128; u = Math.floor(u / 128); } o[p++] = u; }
    return o;
  }
  function unvarints(b, n) {
    var out = new Float64Array(n), p = 0, i, c, u, m;
    for (i = 0; i < n; i++) { c = b[p++]; if (c < 128) { out[i] = c; continue; } u = c & 127; m = 128; do { c = b[p++]; u += (c & 127) * m; m *= 128; } while (c & 128); out[i] = u; }
    return out;
  }
  function bitpack(codes, w) {
    var n = codes.length, out = new Uint8Array(Math.ceil(n * w / 8) + 5), bp = 0, i, byte, sh, v;
    for (i = 0; i < n; i++) { byte = bp >> 3; sh = bp & 7; v = codes[i] << sh; out[byte] |= v & 255; if (w + sh > 8) out[byte + 1] |= (v >> 8) & 255; if (w + sh > 16) out[byte + 2] |= (v >> 16) & 255; if (w + sh > 24) out[byte + 3] |= (v >>> 24) & 255; bp += w; }
    return out.subarray(0, Math.ceil(n * w / 8));
  }
  function bitunpack(b, n, w) {
    var out = w > 16 ? new Uint32Array(n) : w > 8 ? new Uint16Array(n) : new Uint8Array(n), mask = w >= 32 ? 0xFFFFFFFF : (1 << w) - 1, bp = 0, i, byte;
    for (i = 0; i < n; i++) { byte = bp >> 3; out[i] = ((b[byte] | (b[byte + 1] << 8) | (b[byte + 2] << 16) | (b[byte + 3] << 24)) >>> (bp & 7)) & mask; bp += w; }
    return out;
  }
  var HEXC = '0123456789abcdef', RX_HEX = /^[0-9a-f]+$/, RX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var RX_IP = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/, RX_LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?:[^\ud800-\udbff]|^)[\udc00-\udfff]/;
  function wellFormed(s) { return !RX_LONE.test(s); }
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
  var RX_SLOT = /-?\d+|[0-9a-f]{8,}/g, RX_CANON = /^(-?[1-9]\d{0,14}|0)$/;
  function templateFrames(v) {   // -> { frames, nT } or null
    var n = v.length, tmap = new Map(), tl = [], ids = new Array(n), slots = new Map(), i, k, t, id, ps, key, arr;
    for (i = 0; i < n; i++) {
      t = v[i]; if (t.indexOf('\x01') >= 0) return null;
      ps = t.match(RX_SLOT); t = t.replace(RX_SLOT, '\x01');
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
    return { frames: [te.encode(tl.join('\0')), ib, te.encode(txt.join('\0')), concat(num), Uint8Array.from(kinds)], nT: tl.length };
  }
  function untemplate(n, fr) {
    var tl = n ? td.decode(fr[0]).split('\0') : [], parts = tl.map(function (t) { return t.split('\x01'); }), ids = fr[1], kinds = fr[4], tx = fr[2].length ? td.decode(fr[2]).split('\0') : [], nb = fr[3];
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
  function readNoSlower(v) {
    var smp = v.length > 8192 ? v.slice(0, 8192) : v, tf = templateFrames(smp), plain, r, t0, bt = Infinity, bp = Infinity;
    if (!tf) return false;
    plain = te.encode(smp.join('\0'));
    for (r = 0; r < 6; r++) {
      t0 = clock(); touch(untemplate(smp.length, tf.frames)); t0 = clock() - t0; if (r && t0 < bt) bt = t0;
      t0 = clock(); touch(td.decode(plain).split('\0')); t0 = clock() - t0; if (r && t0 < bp) bp = t0;
    }
    return bt <= bp * 1.05;
  }
  // a column's candidate encodings; every frame is { raw: Uint8Array } and gets compressed by the caller
  function encodeColumn(v, zs, level, tmode) {   // tmode: 0 off, 1 auto (read-time checked), 2 size only
    var n = v.length, i, x, best = null;
    function stored(frames) { var t = 0, z = []; for (var q = 0; q < frames.length; q++) { var c = zs.compress(frames[q], level); if (c.length < frames[q].length) z.push([frames[q].length, c, 1]); else z.push([frames[q].length, frames[q], 0]); t += z[q][1].length; } return { z: z, size: t }; }
    function cand(t, p, frames) { var s = stored(frames); if (!best || s.size < best.size) best = { t: t, p: p, z: s.z, size: s.size, n: n }; }
    if (allOf(v, function (x) { return typeof x === 'number'; })) {
      var noNegZero = allOf(v, function (x) { return !(x === 0 && 1 / x < 0); });
      var allInt = noNegZero && allOf(v, function (x) { return Number.isInteger(x) && Math.abs(x) < 9007199254740992 / 8; }), scale = 1, base = null;
      if (!noNegZero) base = null; else if (allInt) base = v; else { base = new Array(n); for (i = 0; i < n; i++) { x = Math.round(v[i] * 100); if (!(Math.abs(x) < 9007199254740992 / 8 && x / 100 === v[i])) { base = null; break; } base[i] = x; } if (base) scale = 100; }
      if (base) {
        var mono = true, mn = Infinity, mx = -Infinity;
        for (i = 0; i < n; i++) { if (i && base[i] < base[i - 1]) mono = false; if (base[i] < mn) mn = base[i]; if (base[i] > mx) mx = base[i]; }
        var d = base.slice(); if (mono) for (i = n - 1; i > 0; i--) d[i] -= d[i - 1]; else for (i = 0; i < n; i++) d[i] = zz(d[i]);
        cand('V', { mono: mono, scale: scale }, [varints(d)]);
        if (mx - mn < 16777216) { var w = Math.max(1, 32 - Math.clz32(mx - mn)), off = new Array(n); for (i = 0; i < n; i++) off[i] = base[i] - mn; cand('B', { mn: mn, w: w, scale: scale }, [bitpack(off, w)]); }
      }
      var f = new Float64Array(v); cand('F', {}, [new Uint8Array(f.buffer)]);
      return best;
    }
    if (n && allOf(v, function (x) { return typeof x === 'boolean'; })) { var bb = new Array(n); for (i = 0; i < n; i++) bb[i] = v[i] ? 1 : 0; cand('T', {}, [bitpack(bb, 1)]); return best; }
    if (n && allOf(v, function (x) { return typeof x === 'string'; })) {
      var L = v[0].length, raw, p = 0, j;
      if (L >= 16 && L % 2 === 0 && allOf(v, function (x) { return x.length === L && RX_HEX.test(x); })) {
        raw = new Uint8Array(n * L / 2); for (i = 0; i < n; i++) for (j = 0; j < L; j += 2) raw[p++] = parseInt(v[i].substr(j, 2), 16);
        cand('H', { L: L }, [raw]); return best;
      }
      if (L === 36 && allOf(v, function (x) { return RX_UUID.test(x); })) {
        raw = new Uint8Array(n * 16); for (i = 0; i < n; i++) { var hx = v[i].replace(/-/g, ''); for (j = 0; j < 32; j += 2) raw[p++] = parseInt(hx.substr(j, 2), 16); }
        cand('U', {}, [raw]); return best;
      }
      if (allOf(v, function (x) { var m = RX_IP.exec(x); return m && m[1] < 256 && m[2] < 256 && m[3] < 256 && m[4] < 256; })) {
        raw = new Uint8Array(n * 4); for (i = 0; i < n; i++) { var m = v[i].split('.'); raw[p++] = +m[0]; raw[p++] = +m[1]; raw[p++] = +m[2]; raw[p++] = +m[3]; }
        cand('I', {}, [raw]); return best;
      }
      if (allOf(v, function (x) { return x.indexOf('\0') < 0 && wellFormed(x); })) {
        var map = new Map(), labels = [], codes = new Array(n), c;
        for (i = 0; i < n; i++) { c = map.get(v[i]); if (c === undefined) { c = labels.length; map.set(v[i], c); labels.push(v[i]); } codes[i] = c; }
        cand('s', {}, [te.encode(v.join('\0'))]);
        if (n >= 16 && labels.length * 2 > n && tmode) { var tf = templateFrames(v); if (tf) { var before = best.size, sv = stored(tf.frames); if (sv.size < before && (tmode === 2 || readNoSlower(v))) best = { t: 'L', p: {}, z: sv.z, size: sv.size, n: n }; } }
        if (labels.length * 4 <= n && labels.length < 65536) {
          var wd = Math.max(1, 32 - Math.clz32(labels.length - 1)), cb = labels.length > 256 ? new Uint8Array(new Uint16Array(codes).buffer) : Uint8Array.from(codes);
          cand('D', { w: 0, wide: labels.length > 256 }, [te.encode(labels.join('\0')), cb]);
          cand('D', { w: wd, wide: false }, [te.encode(labels.join('\0')), bitpack(codes, wd)]);
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
    cand('j', {}, [te.encode(v.map(jsonText).join('\n'))]);
    return best;
  }
  // whole numbers that fit 32 bits are handed out as Int32Array: reading one gives a small integer (no heap number), which makes the row objects lighter and the garbage collector's job smaller
  function narrow(u) {
    var n = u.length, o = new Int32Array(n), i, x;
    for (i = 0; i < n; i++) { x = u[i]; if (x > 2147483647 || x < -2147483648) return u; o[i] = x; }
    return o;
  }
  function decodeColumn(c, zs, frames) {   // -> array-like of n values
    var n = c.n, i, u, o, t = c.t, p = c.p;
    if (t === 'V') { u = unvarints(frames[0], n); if (p.mono) { var s = 0; for (i = 0; i < n; i++) { s += u[i]; u[i] = s; } } else for (i = 0; i < n; i++) u[i] = unzz(u[i]); if (p.scale !== 1) { for (i = 0; i < n; i++) u[i] /= p.scale; return u; } return narrow(u); }
    if (t === 'B') { var bu = bitunpack(frames[0], n, p.w); o = new Float64Array(n); for (i = 0; i < n; i++) o[i] = (bu[i] + p.mn) / p.scale; return p.scale === 1 ? narrow(o) : o; }
    if (t === 'F') { return new Float64Array(frames[0].buffer.slice(frames[0].byteOffset, frames[0].byteOffset + n * 8)); }
    if (t === 'T') { var tb = bitunpack(frames[0], n, 1); o = new Array(n); for (i = 0; i < n; i++) o[i] = tb[i] === 1; return o; }
    if (t === 'H') { var bl = p.L / 2, r = frames[0]; o = new Array(n); for (i = 0; i < n; i++) { var h = ''; for (var k = 0; k < bl; k++) { var b = r[i * bl + k]; h += HEXC[b >> 4] + HEXC[b & 15]; } o[i] = h; } return o; }
    if (t === 'U') { var ur = frames[0]; o = new Array(n); for (i = 0; i < n; i++) { var us = ''; for (var q = 0; q < 16; q++) { var bq = ur[i * 16 + q]; us += HEXC[bq >> 4] + HEXC[bq & 15]; if (q === 3 || q === 5 || q === 7 || q === 9) us += '-'; } o[i] = us; } return o; }
    if (t === 'I') { var ir = frames[0]; o = new Array(n); for (i = 0; i < n; i++) o[i] = ir[4 * i] + '.' + ir[4 * i + 1] + '.' + ir[4 * i + 2] + '.' + ir[4 * i + 3]; return o; }
    if (t === 'A') {
      var al = unvarints(frames[0], n), av = unvarints(frames[1], p.m), ap = 0, aa, aj, ac, an, ar = p.asc;
      o = new Array(n);
      for (i = 0; i < n; i++) { an = al[i]; aa = new Array(an); ac = 0; for (aj = 0; aj < an; aj++) { ac += ar ? av[ap++] : unzz(av[ap++]); aa[aj] = ac; } o[i] = aa; }
      return o;
    }
    if (t === 'L') return untemplate(n, frames);
    if (t === 's') return n ? td.decode(frames[0]).split('\0') : [];
    if (t === 'D') { var lab = td.decode(frames[0]).split('\0'), cd = p.w ? bitunpack(frames[1], n, p.w) : p.wide ? new Uint16Array(frames[1].buffer.slice(frames[1].byteOffset, frames[1].byteOffset + n * 2)) : frames[1]; o = new Array(n); for (i = 0; i < n; i++) o[i] = lab[cd[i]]; return o; }
    var js = n ? td.decode(frames[0]).split('\n') : []; o = new Array(n); for (i = 0; i < n; i++) o[i] = JSON.parse(js[i]); return o;
  }
  // returns null when the input is not flat rows (some line is not a JSON object)
  function writeFlatBlock(ctx, input, opts) {
    var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, text = td.decode(input), lines, rows = [], i, j, r, nl = 0, at = -1;
    // fast path: one JSON.parse of the whole block as an array (same row count as lines, or fall back to line by line)
    while ((at = text.indexOf('\n', at + 1)) >= 0) nl++;
    if (text.charCodeAt(text.length - 1) !== 10) nl++;
    try { r = JSON.parse('[' + text.replace(/\n+$/, '').replace(/\n/g, ',') + ']'); if (r.length === nl) rows = r; } catch (e) { rows = []; }
    if (rows.length) { for (i = 0; i < rows.length; i++) { r = rows[i]; if (r === null || typeof r !== 'object' || Array.isArray(r)) { rows = []; break; } } }
    lines = rows.length ? [] : text.split('\n');
    for (i = 0; i < lines.length; i++) { var l = lines[i]; if (l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1); if (!l.trim()) continue; try { r = JSON.parse(l); } catch (e) { return null; } if (r === null || typeof r !== 'object' || Array.isArray(r)) return null; rows.push(r); }
    var n = rows.length, keys = [], seen = new Map(), cols = [], k, v, jx;
    for (i = 0; i < n; i++) { r = rows[i]; for (k in r) if (!seen.has(k)) { seen.set(k, keys.length); keys.push(k); cols.push([]); } }
    var pb = (n + 7) >> 3, planes = new Uint8Array(pb * keys.length), ord = opts.exact ? { map: new Map(), list: [], ids: new Array(n) } : null, sq;
    for (i = 0; i < n; i++) {
      r = rows[i]; sq = ord ? [] : null;
      for (k in r) { jx = seen.get(k); planes[jx * pb + (i >> 3)] |= 1 << (i & 7); cols[jx].push(r[k]); if (sq) sq.push(jx); }
      if (ord) { var sk = sq.join(','), oid = ord.map.get(sk); if (oid === undefined) { oid = ord.list.length; ord.map.set(sk, oid); ord.list.push(sq); } ord.ids[i] = oid; }
    }
    var enc = [], frames = [], meta = { keys: keys, cols: [] }, zone = [];
    for (j = 0; j < cols.length; j++) {
      var e = encodeColumn(cols[j], zs, level, opts.templates === false ? 0 : opts.templates === true ? 2 : 1); enc.push(e);
      meta.cols.push({ t: e.t, p: e.p, n: e.n, f: e.z.map(function (z) { return [z[0], z[1].length, z[2]]; }) });
      for (i = 0; i < e.z.length; i++) frames.push(e.z[i][1]);
      if ((e.t === 'V' || e.t === 'B' || e.t === 'F') && cols[j].length) { var mn = Infinity, mx = -Infinity, a = cols[j]; for (i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; } zone.push([fnvStr('.' + keys[j]), mn, mx, a.length]); }
    }
    if (ord) { var oB = te.encode(JSON.stringify(ord.list)), oz = zs.compress(oB, level), od = typedColumn(ord.ids), odz = zs.compress(od[2], level); meta.ord = [oB.length, oz.length, od[0], od[2].length, odz.length]; frames.unshift(oz, odz); }
    var mB = te.encode(JSON.stringify(meta)), zm = zs.compress(mB, level), zp = zs.compress(planes, level);
    var hdr = te.encode(JSON.stringify({ k: 'f', n: n, m: [mB.length, zm.length], pl: [planes.length, zp.length] }));
    return { bytes: concat([u32le(hdr.length), hdr, zm, zp].concat(frames)), rows: n, zone: zone, kind: 'f' };
  }
  // the byte work of reading a flat block: zstd for every wanted column, and (predecode, in helper workers) the number columns turned into Float64Arrays
  function flatFrames(zs, bytes, want, predecode) {
    var ph = parseBlockHeader(bytes), h = ph.h, p = ph.p, i, j;
    function take(n) { var x = bytes.subarray(p, p + n); p += n; return x; }
    var meta = JSON.parse(td.decode(zs.decompressView(take(h.m[1]), h.m[0]))), pl = zs.decompress(take(h.pl[1]), h.pl[0]), n = h.n, K = meta.keys.length, cols = new Array(K), ordList = null, ordIds = null;
    if (meta.ord) { var om = meta.ord; ordList = JSON.parse(td.decode(zs.decompressView(take(om[1]), om[0]))); var odr = zs.decompress(take(om[4]), om[3]); ordIds = new KIND[om[2]](odr.buffer, 0, n); }
    for (j = 0; j < K; j++) {
      var c = meta.cols[j], fr = [], wanted = !want || Object.prototype.hasOwnProperty.call(want, meta.keys[j]);
      for (i = 0; i < c.f.length; i++) { var f = c.f[i], sb = take(f[1]); if (wanted) fr.push(f[2] ? zs.decompress(sb, f[0]) : sb.slice()); }
      cols[j] = !wanted ? null : (predecode && (c.t === 'V' || c.t === 'B' || c.t === 'F')) ? { pre: decodeColumn(c, zs, fr) } : { fr: fr };
    }
    return { t: 'f', n: n, meta: meta, pl: pl, ordList: ordList, ordIds: ordIds, cols: cols };
  }
  function flatTransfer(F) {
    var t = [F.pl.buffer], i, c, q; if (F.ordIds) t.push(F.ordIds.buffer);
    for (i = 0; i < F.cols.length; i++) { c = F.cols[i]; if (!c) continue; if (c.pre) t.push(c.pre.buffer); else for (q = 0; q < c.fr.length; q++) t.push(c.fr[q].buffer); }
    return t;
  }
  function makeFlatReader(zs) {
    // assemble rows from the decompressed frames of flatFrames; want: null, or an object whose own keys are the only keys to decode
    function assemble(F, want) {
      var meta = F.meta, n = F.n, K = meta.keys.length, vals = new Array(K), pl = F.pl, ordList = F.ordList, ordIds = F.ordIds, i, j;
      for (j = 0; j < K; j++) vals[j] = F.cols[j] === null ? null : F.cols[j].pre ? F.cols[j].pre : decodeColumn(meta.cols[j], zs, F.cols[j].fr);
      var pb = (n + 7) >> 3, ptr = new Int32Array(K), out = new Array(n), keys = meta.keys, o, hasProto = keys.indexOf('__proto__') >= 0;
      if (ordList) { for (i = 0; i < n; i++) { var sq2 = ordList[ordIds[i]], m2 = sq2.length; o = {}; for (j = 0; j < m2; j++) { var kk = sq2[j]; if (!vals[kk]) continue; if (hasProto) setKey(o, keys[kk], vals[kk][ptr[kk]++]); else o[keys[kk]] = vals[kk][ptr[kk]++]; } out[i] = o; } return out; }
      // column by column (the row-object rule): every row object is made first, then each key is assigned down its column, so the objects share one shape history
      for (i = 0; i < n; i++) out[i] = {};
      for (j = 0; j < K; j++) {
        var v = vals[j]; if (!v) continue;
        var key = keys[j], base = j * pb, c = 0, bits;
        if (key === '__proto__') { for (i = 0; i < n; i++) if ((pl[base + (i >> 3)] >> (i & 7)) & 1) setKey(out[i], key, v[c++]); }
        else if (v.length === n) { for (i = 0; i < n; i++) out[i][key] = v[i]; }
        else { for (i = 0; i < n; i++) { if (i % 8 === 0) { bits = pl[base + (i >> 3)]; if (bits === 0) { i += 7; continue; } } if ((bits >> (i & 7)) & 1) out[i][key] = v[c++]; } }
      }
      return out;
    }
    function readBlock(bytes, want) { return assemble(flatFrames(zs, bytes, want, false), want); }
    return { readBlock: readBlock, assemble: assemble };
  }
