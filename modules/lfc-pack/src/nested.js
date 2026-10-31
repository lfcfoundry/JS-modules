// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ nested block (kind 'n'): shape table, per-block string dictionary, typed-byte columns, all zstd
  // Layout: u32 header length, JSON header, then zstd frames in this order: dictionary text, side strings, shapes, row shape ids, then each column.
  // Column = typed bytes at the narrowest width that holds every value: 0 u8, 1 u16, 2 u32, 3 i8, 4 i16, 5 i32, 6 f64, 7 decimals (writer only: see decimalColumn).
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
  // width 7: a column of whole numbers or decimals (up to nine decimals, exact) whose varints are clearly shorter than its typed bytes, kept when it also compresses smaller: byte 0 is the decimals d in bits 0 to 3 (bit 7 set: differences against the value k places back instead of the numbers, with k - 1 in bits 4 to 6), then the varints of z(whole) or z(whole - previous whole) with whole = value * 10^d; value = whole / 10^d. null when it does not pay (not exact, or the varints would take half of the doubles' size or more)
  function decimalColumn(c, rawBytes) {
    var n = c.length, i, sc, d, x, p = 0, prev, sa = 0, sb = 0, allInt = true, out, u, delta;
    if (n < 2 || rawBytes <= n) return null;   // one byte per value or less: varints (at least one byte each) cannot be clearly shorter
    for (i = 0; i < n; i++) { x = c[i]; if (!(x - x === 0) || (x === 0 && 1 / x < 0)) return null; if (allInt && !(Number.isInteger(x) && x < 1125899906842624 && x > -1125899906842624)) allInt = false; }
    if (allInt) sc = 1; else { sc = decimalScale(c); if (!sc) return null; }
    var b = allInt ? c : DS_INTS; DS_INTS = null;   // decimalScale left the exact whole numbers behind
    // varint sizes: counted on the whole column up to 4096 values, otherwise on 8 windows of 512 values spread evenly (the choice only has to be clear, the frame that is written is exact). Differences are taken against the value k places back, k = 1 to 4: a column that interleaves series (the x and y of coordinate pairs) is much smaller with k = 2
    var win = n <= 4096 ? 1 : 8, wl = n <= 4096 ? n : 512, w, from, cnt = 0, k, sk = [0, 0, 0, 0, 0];
    for (w = 0; w < win; w++) {
      from = win === 1 ? 0 : Math.floor((n - wl) * w / (win - 1));
      for (i = from; i < from + wl; i++) {
        x = b[i]; sa += vlen(x >= 0 ? x * 2 : -x * 2 - 1); cnt++;
        for (k = 1; k <= 4; k++) { u = x - (i >= k ? b[i - k] : 0); sk[k] += vlen(u >= 0 ? u * 2 : -u * 2 - 1); }
      }
    }
    sa = sa * n / cnt; for (k = 1; k <= 4; k++) sk[k] = sk[k] * n / cnt;
    var bk = 1; for (k = 2; k <= 4; k++) if (sk[k] < sk[bk] * 0.95) bk = k;   // a larger stride has to be clearly better
    sb = sk[bk];
    if (Math.min(sa, sb) >= rawBytes * 0.6) return null;   // only a column whose varints are clearly shorter than its typed bytes is compressed both ways
    delta = sb < sa;
    var tot = 0; for (i = 0; i < n; i++) { x = b[i]; u = delta ? x - (i >= bk ? b[i - bk] : 0) : x; tot += vlen(u >= 0 ? u * 2 : -u * 2 - 1); }
    d = Math.round(Math.log10(sc)); out = new Uint8Array(1 + tot); out[0] = d | (delta ? 128 | ((bk - 1) << 4) : 0); p = 1;
    for (i = 0; i < n; i++) {
      x = b[i]; u = delta ? x - (i >= bk ? b[i - bk] : 0) : x; u = u >= 0 ? u * 2 : -u * 2 - 1;
      while (u >= 128) { out[p++] = (u % 128) | 128; u = Math.floor(u / 128); }
      out[p++] = u;
    }
    return out;
  }
  function decodeDecimalColumn(raw, n) {
    var d = raw[0] & 15, delta = raw[0] & 128, k = ((raw[0] >> 4) & 7) + 1, u = unvarints(raw.subarray(1), n), sc = Math.pow(10, d), o = new Float64Array(n), w = new Float64Array(n), i, s;
    if (d > 9) throw new Error('damaged block: bad decimal column');
    for (i = 0; i < n; i++) { if (delta) { s = (i >= k ? w[i - k] : 0) + unzz(u[i]); w[i] = s; o[i] = s / sc; } else o[i] = unzz(u[i]) / sc; }
    return new Uint8Array(o.buffer);
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
    var ns = sideStr.length, dlen = Math.max(olen - 1, 0), N = codes.length, m;
    // first-appearance flags: the writer renumbers the dictionary in order of first use (unused entries drop out), so a string's first appearance always carries "the next number" and only repeats need a stored code
    var old = new Uint8Array(mem.buffer, X.dd_out_ptr(), dlen), offs = new Uint32Array(dN + 1), pos = 0, nz;
    for (i = 0; i < dN; i++) { offs[i] = pos; nz = old.indexOf(0, pos); pos = nz < 0 ? dlen + 1 : nz + 1; } offs[dN] = dlen + 1;
    var remap = new Int32Array(dN).fill(-1), used = [], nu = 0, c;
    for (i = 0; i < N; i++) { c = codes[i]; if (c < dN && remap[c] < 0) { remap[c] = nu++; used.push(c); } }
    var flags = new Uint8Array((N + 7) >> 3), rep = [], seenF = new Uint8Array(nu);
    for (i = 0; i < N; i++) { c = codes[i]; if (c < dN) { m = remap[c]; if (!seenF[m]) { seenF[m] = 1; flags[i >> 3] |= 1 << (i & 7); } else rep.push(m); } else rep.push(nu + (c - dN)); }
    var tl = 0; for (i = 0; i < nu; i++) tl += offs[used[i] + 1] - offs[used[i]];
    var E = nu + ns, text = new Uint8Array(E > 0 ? tl - nu + E - 1 + (nu > 0 ? 0 : 0) : 0), tp = 0;
    for (i = 0; i < nu; i++) { var a0 = offs[used[i]], a1 = offs[used[i] + 1] - 1; text.set(old.subarray(a0, a1), tp); tp += a1 - a0; if (i < E - 1) tp++; }
    var sideIdx = []; for (i = 0; i < ns; i++) sideIdx.push(nu + i);
    var cols = s.cols, repT = typedColumn(rep), zflags = zs.compress(flags, level), zrep = zs.compress(repT[2], level);
    var ztext = zs.compress(text, level), sideB = te.encode(JSON.stringify({ idx: sideIdx, str: sideStr })), zside = zs.compress(sideB, level);
    var skB = te.encode(s.skelList.join('\n')), zskel = zs.compress(skB, level);
    var tid = typedColumn(s.ids), zids = zs.compress(tid[2], level);
    var zc = [], zone = [];
    cols.forEach(function (c, hash) {
      var t = typedColumn(c), dc = hash !== CODES_KEY ? decimalColumn(c, t[2].length) : null, zdc = dc ? zs.compress(dc, level) : null, zraw = null;
      if (zdc && dc.length <= t[2].length * 0.3) zc.push([hash, 7, t[1], zdc, dc.length]);   // varints under 30% of the typed bytes: the typed bytes are not even compressed
      else { zraw = zs.compress(t[2], level); if (zdc && zdc.length < zraw.length) zc.push([hash, 7, t[1], zdc, dc.length]); else zc.push([hash, t[0], t[1], zraw]); }
      if (hash !== CODES_KEY && c.length) { var mn = Infinity, mx = -Infinity, j; for (j = 0; j < c.length; j++) { if (c[j] < mn) mn = c[j]; if (c[j] > mx) mx = c[j]; } zone.push([hash, mn, mx, c.length]); }
    });
    // column table (hash, width code, count, frame length) is its own zstd frame: files with many distinct paths have thousands of entries
    var cmB = te.encode(JSON.stringify(zc.map(function (z) { return z.length > 4 ? [z[0], z[1], z[2], z[3].length, z[4]] : [z[0], z[1], z[2], z[3].length]; }))), zcm = zs.compress(cmB, level);
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, count: E, fa: [flags.length, zflags.length, repT[0], repT[1], zrep.length, N], len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], cm: [cmB.length, zcm.length] }));
    var parts = [u32le(hdr.length), hdr, zcm, ztext, zside, zskel, zids, zflags, zrep]; for (i = 0; i < zc.length; i++) parts.push(zc[i][3]);
    return { bytes: concat(parts), rows: s.n, zone: zone, skelList: s.skelList, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback };
  }

  // ---- reader: one shared descriptor walker builds the rows of every shape; plans are cached per shape for the whole file
  function parseBlockHeader(bytes) {
    var hl = rd32(bytes, 0); return { h: JSON.parse(tdr.decode(bytes.subarray(4, 4 + hl))), p: 4 + hl };
  }
  // the byte work of reading a block (zstd and parsing the small tables); also what a helper worker runs. Everything returned owns its buffer, so it can be transferred.
  function nestedFrames(zs, bytes) {
    var ph = parseBlockHeader(bytes), h = ph.h, p = ph.p, i;
    function take(n) { var x = bytes.subarray(p, p + n); p += n; return x; }
    var cmeta = JSON.parse(tdr.decode(zs.decompressView(take(h.cm[1]), h.cm[0])));
    var dict = zs.decompress(take(h.p[0]), h.len[0]);
    var side = JSON.parse(tdr.decode(zs.decompressView(take(h.p[1]), h.len[1])));
    var skel = tdr.decode(zs.decompressView(take(h.p[2]), h.len[2]));
    var ids = [h.ids[0], h.ids[1], zs.decompress(take(h.ids[2]), h.ids[1] * KIND[h.ids[0]].BYTES_PER_ELEMENT)], cols = [];
    var zfl = zs.decompress(take(h.fa[1]), h.fa[0]), zrp = zs.decompress(take(h.fa[4]), h.fa[3] * KIND[h.fa[2]].BYTES_PER_ELEMENT);
    for (i = 0; i < cmeta.length; i++) { var cd = cmeta[i]; if (cd[1] === 7) cols.push([cd[0], 6, cd[2], decodeDecimalColumn(zs.decompress(take(cd[3]), cd[4]), cd[2])]); else cols.push([cd[0], cd[1], cd[2], zs.decompress(take(cd[3]), cd[2] * KIND[cd[1]].BYTES_PER_ELEMENT)]); }
    // codes back from the flags: a flagged cell takes the next new number, any other cell takes the next stored repeat
    var NC = h.fa[5], rp = new KIND[h.fa[2]](zrp.buffer, zrp.byteOffset, h.fa[3]), ck = h.count < 256 ? 0 : h.count < 65536 ? 1 : 2, codes = new KIND[ck](NC), nxt = 0, r = 0;
    var fb, e8, q, ib = 0;
    for (; ib + 8 <= NC; ib += 8) {   // eight cells per flag byte: all new (255) and all repeats (0) are the common bytes
      fb = zfl[ib >> 3];
      if (fb === 0) { codes[ib] = rp[r]; codes[ib + 1] = rp[r + 1]; codes[ib + 2] = rp[r + 2]; codes[ib + 3] = rp[r + 3]; codes[ib + 4] = rp[r + 4]; codes[ib + 5] = rp[r + 5]; codes[ib + 6] = rp[r + 6]; codes[ib + 7] = rp[r + 7]; r += 8; }
      else if (fb === 255) { for (q = 0; q < 8; q++) codes[ib + q] = nxt++; }
      else for (q = 0; q < 8; q++) codes[ib + q] = (fb >> q) & 1 ? nxt++ : rp[r++];
    }
    for (; ib < NC; ib++) codes[ib] = (zfl[ib >> 3] >> (ib & 7)) & 1 ? nxt++ : rp[r++];
    cols.push([CODES_KEY, ck, NC, new Uint8Array(codes.buffer)]);
    return { t: 'n', n: h.n, dict: dict, side: side, skel: skel, ids: ids, cols: cols };
  }
  nestedFrames = guard(nestedFrames);
  function nestedTransfer(F) { var t = [F.dict.buffer, F.ids[2].buffer], i; for (i = 0; i < F.cols.length; i++) t.push(F.cols[i][3].buffer); return t; }
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
    // assemble one block from its decompressed frames (nestedFrames): the dictionary strings and column arrays the row builder reads
    function openBlock(F) {
      var D = tlat.decode(F.dict).split('\0'), sd = F.side, i, cols = new Map();
      for (i = 0; i < sd.idx.length; i++) D[sd.idx[i]] = sd.str[i];
      for (i = 0; i < F.cols.length; i++) { var cd = F.cols[i]; cols.set(cd[0], new KIND[cd[1]](cd[3].buffer, cd[3].byteOffset, cd[2])); }
      return { n: F.n, ids: new KIND[F.ids[0]](F.ids[2].buffer, F.ids[2].byteOffset, F.ids[1]), skel: F.skel.split('\n'), cols: cols, dict: D, codes: cols.get(CODES_KEY) };
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
    openBlock = guard(openBlock); rowsOf = guard(rowsOf);
    return { open: openBlock, rowsOf: rowsOf, readBlock: function (bytes) { return rowsOf(openBlock(nestedFrames(zs, bytes))); }, assemble: function (F) { return rowsOf(openBlock(F)); } };
  }
