// Copyright (c) 2026 LFC Foundry. MIT License. Source part of json-format.js (joined by build.py).

  // ================================================================ nested block (kind 'n'): shape table, per-block string dictionary, typed-byte columns, all zstd
  // Layout: u32 header length, JSON header, then zstd frames in this order: dictionary text, side strings, shapes, row shape ids, then each column.
  // Column = typed bytes at the narrowest width that holds every value: 0 u8, 1 u16, 2 u32, 3 i8, 4 i16, 5 i32, 6 f64.
  var KIND = [Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float64Array];
  function colKind(c) {
    var mn = Infinity, mx = -Infinity, i, x;
    for (i = 0; i < c.length; i++) { x = c[i]; if (x !== Math.floor(x) || x === Infinity || x === -Infinity || (x === 0 && 1 / x < 0)) return 6; if (x < mn) mn = x; if (x > mx) mx = x; }
    if (mn >= 0) return mx < 256 ? 0 : mx < 65536 ? 1 : mx < 4294967296 ? 2 : 6;
    return mn >= -128 && mx < 128 ? 3 : mn >= -32768 && mx < 32768 ? 4 : mn >= -2147483648 && mx < 2147483648 ? 5 : 6;
  }
  function typedColumn(c) {   // -> [kind, count, bytes]
    var k = colKind(c), t = (c instanceof KIND[k]) ? c : KIND[k].from(c);
    return [k, c.length, new Uint8Array(t.buffer, t.byteOffset, t.byteLength)];
  }
  function writeNestedBlock(ctx, input, opts) {
    var zs = ctx.zs, level = opts.level == null ? 3 : opts.level;
    var s = ctx.sh.shred(input, opts), X = ctx.sh.x, mem = ctx.sh.mem, i;
    var nn = X.dd_run(s.textLen, s.count); if (nn !== s.count) throw new Error('capacity');
    var dN = X.dd_n(), olen = X.dd_out_len();
    var codes = new Uint32Array(mem.buffer, X.dd_codes_ptr(), nn).slice();
    // strings with escapes or non-ASCII characters are kept once each in a side list; their codes point past the dictionary
    var sideMap = new Map(), sideStr = [];
    for (i = 0; i < s.side.length; i++) { var str = s.side[i][1], k = sideMap.get(str); if (k === undefined) { k = sideStr.length; sideMap.set(str, k); sideStr.push(str); } codes[s.side[i][0]] = dN + k; }
    var ns = sideStr.length, dlen = Math.max(olen - 1, 0), text = new Uint8Array(dlen + ns);
    text.set(new Uint8Array(mem.buffer, X.dd_out_ptr(), dlen));
    var sideIdx = []; for (i = 0; i < ns; i++) sideIdx.push(dN + i);
    var cols = s.cols; cols.set(CODES_KEY, codes);
    var ztext = zs.compress(text, level), sideB = te.encode(JSON.stringify({ idx: sideIdx, str: sideStr })), zside = zs.compress(sideB, level);
    var skB = te.encode(s.skelList.join('\n')), zskel = zs.compress(skB, level);
    var tid = typedColumn(s.ids), zids = zs.compress(tid[2], level);
    var zc = [], zone = [];
    cols.forEach(function (c, hash) {
      var t = typedColumn(c); zc.push([hash, t[0], t[1], zs.compress(t[2], level)]);
      if (hash !== CODES_KEY && c.length) { var mn = Infinity, mx = -Infinity, j; for (j = 0; j < c.length; j++) { if (c[j] < mn) mn = c[j]; if (c[j] > mx) mx = c[j]; } zone.push([hash, mn, mx, c.length]); }
    });
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, count: dN + ns, len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], cols: zc.map(function (z) { return [z[0], z[1], z[2], z[3].length]; }) }));
    var parts = [u32le(hdr.length), hdr, ztext, zside, zskel, zids]; for (i = 0; i < zc.length; i++) parts.push(zc[i][3]);
    return { bytes: concat(parts), rows: s.n, zone: zone, skelList: s.skelList, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback };
  }

  // ---- reader: one shared descriptor walker builds the rows of every shape; plans are cached per shape for the whole file
  function parseBlockHeader(bytes) {
    var hl = rd32(bytes, 0); return { h: JSON.parse(td.decode(bytes.subarray(4, 4 + hl))), p: 4 + hl };
  }
  function makeNestedReader(zs) {
    var STRS = null, TI = 0, COLS = new Map(), PLAN = new Map();
    function col(h) { var c = COLS.get(h); if (!c) { c = { h: h, a: null, i: 0 }; COLS.set(h, c); } return c; }
    function desc(s, p) {
      if (s === 1) return { t: 1 };
      if (s === 2) return { t: 2, c: col(fnvStr(p)) };
      if (s === 3) return { t: 3, c: col(fnvStr(p + '?')) };
      if (s === 4) return { t: 4 };
      if (s === 5) return { t: 5 };
      var i;
      if (Array.isArray(s)) { var subs = []; for (i = 0; i < s.length; i++) subs.push(desc(s[i], p + '[]')); return { t: 6, subs: subs }; }
      var keys = Object.keys(s), n = keys.length, kind = new Uint8Array(n), cc = new Array(n), sb = new Array(n), proto = false;
      for (i = 0; i < n; i++) { var c = s[keys[i]]; if (keys[i] === '__proto__') proto = true;
        if (c === 1) kind[i] = 1; else if (c === 2) { kind[i] = 2; cc[i] = col(fnvStr(p + '.' + keys[i])); } else if (c === 3) { kind[i] = 3; cc[i] = col(fnvStr(p + '.' + keys[i] + '?')); }
        else if (c === 4) kind[i] = 4; else { kind[i] = 0; sb[i] = desc(c, p + '.' + keys[i]); } }
      return { t: 7, keys: keys, kind: kind, cc: cc, subs: sb, proto: proto, n: n };
    }
    function build(p) {
      var t = p.t, c, i;
      if (t === 7) {
        var keys = p.keys, kind = p.kind, cc = p.cc, subs = p.subs, n = p.n, o = {}, v;
        for (i = 0; i < n; i++) {
          switch (kind[i]) { case 1: v = STRS[TI++]; break; case 2: c = cc[i]; v = c.a[c.i++]; break; case 3: c = cc[i]; v = c.a[c.i++] === 1; break; case 4: v = null; break; default: v = build(subs[i]); }
          if (p.proto && keys[i] === '__proto__') Object.defineProperty(o, keys[i], { value: v, enumerable: true, writable: true, configurable: true }); else o[keys[i]] = v;
        }
        return o;
      }
      if (t === 1) return STRS[TI++];
      if (t === 2) { c = p.c; return c.a[c.i++]; }
      if (t === 3) { c = p.c; return c.a[c.i++] === 1; }
      if (t === 4) return null;
      if (t === 5) return JSON.parse(STRS[TI++]);
      var sb = p.subs, m = sb.length, arr = new Array(m); for (i = 0; i < m; i++) arr[i] = build(sb[i]); return arr;
    }
    // decode the frames of one block: { n, ids, skel, cols (Map hash -> typed array), strings (expanded: one per string slot) }
    function openBlock(bytes) {
      var ph = parseBlockHeader(bytes), h = ph.h, p = ph.p, i;
      function take(n) { var x = bytes.subarray(p, p + n); p += n; return x; }
      var D = tlat.decode(zs.decompressView(take(h.p[0]), h.len[0])).split('\0');
      var sd = JSON.parse(td.decode(zs.decompressView(take(h.p[1]), h.len[1])));
      for (i = 0; i < sd.idx.length; i++) D[sd.idx[i]] = sd.str[i];
      var skel = td.decode(zs.decompressView(take(h.p[2]), h.len[2])).split('\n');
      function column(kind, count, plen) {
        var w = KIND[kind].BYTES_PER_ELEMENT, raw = zs.decompress(take(plen), count * w); return new KIND[kind](raw.buffer, 0, count);
      }
      var ids = column(h.ids[0], h.ids[1], h.ids[2]), cols = new Map();
      for (i = 0; i < h.cols.length; i++) { var cd = h.cols[i]; cols.set(cd[0], column(cd[1], cd[2], cd[3])); }
      return { n: h.n, ids: ids, skel: skel, cols: cols, dict: D, codes: cols.get(CODES_KEY) };
    }
    function rowsOf(b) {
      var D = b.dict, cd = b.codes, n = cd ? cd.length : 0, E = new Array(n), i;
      for (i = 0; i < n; i++) E[i] = D[cd[i]];
      STRS = E; TI = 0;
      var sl = b.skel, fnById = new Array(sl.length);
      for (i = 0; i < sl.length; i++) { var f = PLAN.get(sl[i]); if (!f) { f = desc(JSON.parse(sl[i]), ''); PLAN.set(sl[i], f); } fnById[i] = f; }
      COLS.forEach(function (c) { c.a = b.cols.get(c.h); c.i = 0; });
      var ids = b.ids, out = new Array(b.n);
      for (i = 0; i < b.n; i++) out[i] = build(fnById[ids[i]]);
      return out;
    }
    return { open: openBlock, rowsOf: rowsOf, readBlock: function (bytes) { return rowsOf(openBlock(bytes)); } };
  }
