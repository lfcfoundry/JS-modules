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
    for (i = 0; i < n; i++) { if (delta) { s = (i >= k ? w[i - k] : 0) + unzz(u[i]); if (s > 9007199254740992 || s < -9007199254740992) throw new Error('damaged block: number column out of range'); w[i] = s; o[i] = s / sc; } else o[i] = unzz(u[i]) / sc; }
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
    if (ctx.st) return sharedNestedBlock(ctx, s, codes, dN, dN ? tlat.decode(new Uint8Array(mem.buffer, X.dd_out_ptr(), dlen)).split('\0') : [], sideStr, level);
    var pb = opts.paths ? pathNestedBlock(ctx, s, codes, dN, dlen, sideStr, level) : null;   // with paths: both ways, the smaller one is kept
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
    var nc = nestedCols(zs, cols, level), zc = nc.zc, zone = nc.zone, cmB = nc.cmB, zcm = nc.zcm;
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, count: E, fa: [flags.length, zflags.length, repT[0], repT[1], zrep.length, N], len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], cm: [cmB.length, zcm.length] }));
    var parts = [u32le(hdr.length), hdr, zcm, ztext, zside, zskel, zids, zflags, zrep]; for (i = 0; i < zc.length; i++) parts.push(zc[i][3]);
    var bytes = concat(parts); if (pb && (opts.paths === 'only' || pb.bytes.length <= bytes.length)) return pb;
    return { bytes: bytes, rows: s.n, zone: zone, skelList: s.skelList, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback };
  }

  // ---- per-path strings ({ paths: true }, header sp: 1): every string path of the block (".properties.name", ".items[].sku") has its own run of dictionary entries, first-appearance flags and repeats.
  // A path's strings are few and alike, so its repeats are small numbers that compress well; a string used at two paths is kept once for each.
  function stringPaths(t) {   // the paths of the string cells of one shape, in walk order (shape 1 and 5)
    var out = [];
    (function walk(s, p) { var i, k; if (s === 1 || s === 5) out.push(p); else if (Array.isArray(s)) { for (i = 0; i < s.length; i++) walk(s[i], p + '[]'); } else if (s && typeof s === 'object') { for (k in s) walk(s[k], p + '.' + k); } })(JSON.parse(t), '');
    return out;
  }
  // the string cells regrouped by path: cell codes path after path, and per path its entries (codes in order of first use there), a flag per cell (flag bytes start fresh for each path) and a repeat for every cell that is not a first use
  function byPath(s, codes, M) {
    var N = codes.length, sk = s.skelList, K = sk.length, i, j, k, c, p, q, a;
    var sp = new Array(K), pix = new Map(), ph = [];
    for (k = 0; k < K; k++) { var ps = stringPaths(sk[k]); a = new Int32Array(ps.length); for (j = 0; j < ps.length; j++) { var h = fnvStr(ps[j]); q = pix.get(h); if (q === undefined) { q = ph.length; pix.set(h, q); ph.push(h); } a[j] = q; } sp[k] = a; }
    var P = ph.length, cnt = new Uint32Array(P), cp = new Uint32Array(N), ci = 0, ids = s.ids;
    for (i = 0; i < s.n; i++) { a = sp[ids[i]]; for (j = 0; j < a.length; j++) { if (ci >= N) throw new Error('string cell count'); cp[ci++] = a[j]; cnt[a[j]]++; } }
    if (ci !== N) throw new Error('string cell count');
    var st = new Uint32Array(P + 1), fill = new Uint32Array(P), pc = new Uint32Array(N), nfb = 0;
    for (p = 0; p < P; p++) { st[p + 1] = st[p] + cnt[p]; nfb += (cnt[p] + 7) >> 3; }
    for (i = 0; i < N; i++) { p = cp[i]; pc[st[p] + fill[p]++] = codes[i]; }
    var stamp = new Int32Array(M).fill(-1), loc = new Uint32Array(M), ent = [], rep = [], flags = new Uint8Array(nfb), fb = 0, table = [], e0, o;
    for (p = 0; p < P; p++) {
      e0 = ent.length;
      for (i = st[p]; i < st[p + 1]; i++) { c = pc[i]; o = i - st[p]; if (stamp[c] !== p) { stamp[c] = p; loc[c] = ent.length - e0; ent.push(c); flags[fb + (o >> 3)] |= 1 << (o & 7); } else rep.push(loc[c]); }
      table.push([ph[p], ent.length - e0, cnt[p]]); fb += (cnt[p] + 7) >> 3;
    }
    return { ent: ent, rep: rep, flags: flags, table: table };
  }
  function pathFrames(zs, bp, level) {   // -> [header sf, frames]
    var repT = typedColumn(bp.rep), zflags = zs.compress(bp.flags, level), zrep = zs.compress(repT[2], level), tabB = te.encode(JSON.stringify(bp.table)), ztab = zs.compress(tabB, level);
    return [[tabB.length, ztab.length, bp.flags.length, zflags.length, repT[0], repT[1], zrep.length], [ztab, zflags, zrep]];
  }
  function pathNestedBlock(ctx, s, codes, dN, dlen, sideStr, level) {
    var zs = ctx.zs, X = ctx.sh.x, mem = ctx.sh.mem, sk = s.skelList, ids = s.ids, i, k, c;
    var bp = byPath(s, codes, dN + sideStr.length), ent = bp.ent;
    // dictionary text: the entries in that order, ASCII strings from the tokenizer's dictionary, an empty placeholder for each side string
    var old = new Uint8Array(mem.buffer, X.dd_out_ptr(), dlen), offs = new Uint32Array(dN + 1), pos = 0, nz;
    for (i = 0; i < dN; i++) { offs[i] = pos; nz = old.indexOf(0, pos); pos = nz < 0 ? dlen + 1 : nz + 1; } offs[dN] = dlen + 1;
    var E = ent.length, tl = 0, sideIdx = [], sideS = [];
    for (i = 0; i < E; i++) { c = ent[i]; if (c < dN) tl += offs[c + 1] - offs[c] - 1; else { sideIdx.push(i); sideS.push(sideStr[c - dN]); } }
    var text = new Uint8Array(E > 0 ? tl + E - 1 : 0), tp = 0;
    for (i = 0; i < E; i++) { c = ent[i]; if (c < dN) { text.set(old.subarray(offs[c], offs[c + 1] - 1), tp); tp += offs[c + 1] - 1 - offs[c]; } if (i < E - 1) tp++; }
    var pf = pathFrames(zs, bp, level);
    var ztext = zs.compress(text, level), sideB = te.encode(JSON.stringify({ idx: sideIdx, str: sideS })), zside = zs.compress(sideB, level);
    var skB = te.encode(sk.join('\n')), zskel = zs.compress(skB, level);
    var tid = typedColumn(ids), zids = zs.compress(tid[2], level);
    var nc = nestedCols(zs, s.cols, level), zc = nc.zc;
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, sp: 1, count: E, len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], sf: pf[0], cm: [nc.cmB.length, nc.zcm.length] }));
    var parts = [u32le(hdr.length), hdr, nc.zcm, ztext, zside, zskel, zids].concat(pf[1]); for (k = 0; k < zc.length; k++) parts.push(zc[k][3]);
    return { bytes: concat(parts), rows: s.n, zone: nc.zone, skelList: sk, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback };
  }

  function nestedCols(zs, cols, level) {   // the number columns of a nested block: frames, zone-map entries and the column table
    var zc = [], zone = [];
    cols.forEach(function (c, hash) {
      var t = typedColumn(c), dc = hash !== CODES_KEY ? decimalColumn(c, t[2].length) : null, zdc = dc ? zs.compress(dc, level) : null, zraw = null;
      if (zdc && dc.length <= t[2].length * 0.3) zc.push([hash, 7, t[1], zdc, dc.length]);   // varints under 30% of the typed bytes: the typed bytes are not even compressed
      else { zraw = zs.compress(t[2], level); if (zdc && zdc.length < zraw.length) zc.push([hash, 7, t[1], zdc, dc.length]); else zc.push([hash, t[0], t[1], zraw]); }
      if (hash !== CODES_KEY && c.length) { var mn = Infinity, mx = -Infinity, j; for (j = 0; j < c.length; j++) { if (c[j] < mn) mn = c[j]; if (c[j] > mx) mx = c[j]; } zone.push([hash, mn, mx, c.length]); }
    });
    // column table (hash, width code, count, frame length) is its own zstd frame: files with many distinct paths have thousands of entries
    var cmB = te.encode(JSON.stringify(zc.map(function (z) { return z.length > 4 ? [z[0], z[1], z[2], z[3].length, z[4]] : [z[0], z[1], z[2], z[3].length]; }))), zcm = zs.compress(cmB, level);
    return { zc: zc, zone: zone, cmB: cmB, zcm: zcm };
  }
  // ---- shared tables ({ share: true }): a string or row shape that an earlier block of the file already had moves to file-wide tables (footer section 16) when it is seen again; everything else stays in the block's own lists, as in a plain nested block.
  // In such a block (header g: 1) a string code below the block's own entry count picks the block's entry, a higher one the file-wide string (code - count); shape ids work the same with the block's own shape count (kc). No first-appearance flags: the codes are stored as typed bytes.
  var SEEN_CAP = 1 << 20;   // strings and shapes remembered as "seen once" (a cap on writer memory; past it, new strings stay in their blocks)
  function sharedState() { return { sm: new Map(), s: [], ss: new Map(), km: new Map(), k: [], ks: new Map(), j: null }; }
  function stPlace(map, list, seen, str, j) {   // -> file-wide id, or -1 when the block keeps the value
    var g = map.get(str);
    if (g !== undefined) return g;
    if (seen.has(str)) { g = list.length; list.push(str); map.set(str, g); seen.delete(str); j.ops.push([seen, str, map]); j.gnew += str.length; return g; }
    if (seen.size < SEEN_CAP) { seen.set(str, 1); j.ops.push([seen, str, null]); }
    return -1;
  }
  function sharedUndo(st) {   // the block was not kept (the flat layout won, or it is cut and retried): forget what it added
    var j = st.j, i, o; if (!j) return;
    for (i = j.ops.length - 1; i >= 0; i--) { o = j.ops[i]; if (o[2]) { o[2].delete(o[1]); o[0].set(o[1], 1); } else o[0].delete(o[1]); }
    st.s.length = j.sl; st.k.length = j.kl; st.used = j.pu; st.j = null;
  }
  function sharedNestedBlock(ctx, s, codes, dN, dstr, sideStr, level) {
    var st = ctx.st, zs = ctx.zs, N = codes.length, M = dN + sideStr.length, i, c, str, g;
    st.j = { sl: st.s.length, kl: st.k.length, ops: [], gnew: 0, pu: !!st.used }; st.used = true;
    // strings: one decision per distinct string, in order of first use; the block's own ASCII strings first, then its own side strings (as in a plain block)
    var fin = new Int32Array(M).fill(-1), how = new Uint8Array(M), asc = [], sid = [];
    for (i = 0; i < N; i++) {
      c = codes[i]; if (how[c]) continue;
      str = c < dN ? dstr[c] : sideStr[c - dN]; g = stPlace(st.sm, st.s, st.ss, str, st.j);
      if (g >= 0) { fin[c] = g; how[c] = 3; } else if (c < dN) { fin[c] = asc.length; asc.push(str); how[c] = 1; } else { fin[c] = sid.length; sid.push(str); how[c] = 2; }
    }
    var nu = asc.length, L = nu + sid.length, out = new Uint32Array(N);
    for (c = 0; c < M; c++) if (how[c] === 2) fin[c] += nu; else if (how[c] === 3) fin[c] += L;
    for (i = 0; i < N; i++) out[i] = fin[codes[i]];
    // row shapes
    var sk = s.skelList, K = sk.length, kf = new Int32Array(K), kg = new Uint8Array(K), kloc = [];
    for (i = 0; i < K; i++) { g = stPlace(st.km, st.k, st.ks, sk[i], st.j); if (g >= 0) { kf[i] = g; kg[i] = 1; } else { kf[i] = kloc.length; kloc.push(sk[i]); } }
    var LK = kloc.length; for (i = 0; i < K; i++) if (kg[i]) kf[i] += LK;
    var ids = new Uint32Array(s.n); for (i = 0; i < s.n; i++) ids[i] = kf[s.ids[i]];
    var pb = ctx.paths ? sharedPathBlock(ctx, s, out, L, asc, sid, kloc, ids, level) : null;   // with paths: both ways, the smaller one is kept (per-path strings lose on very small blocks)
    var sideIdx = []; for (i = 0; i < sid.length; i++) sideIdx.push(nu + i);
    var text = te.encode(L ? asc.concat(sid.map(function () { return ''; })).join('\0') : ''), ztext = zs.compress(text, level);
    var sideB = te.encode(JSON.stringify({ idx: sideIdx, str: sid })), zside = zs.compress(sideB, level);
    var skB = te.encode(kloc.join('\n')), zskel = zs.compress(skB, level);
    var tid = typedColumn(ids), zids = zs.compress(tid[2], level), tcd = typedColumn(out), zcd = zs.compress(tcd[2], level);
    var nc = nestedCols(zs, s.cols, level), zc = nc.zc, k;
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, g: 1, count: L, kc: LK, len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], cd: [tcd[0], tcd[1], zcd.length], cm: [nc.cmB.length, nc.zcm.length] }));
    var parts = [u32le(hdr.length), hdr, nc.zcm, ztext, zside, zskel, zids, zcd]; for (k = 0; k < zc.length; k++) parts.push(zc[k][3]);
    var bytes = concat(parts); if (pb && (ctx.paths === 'only' || pb.bytes.length <= bytes.length)) return pb;
    return { bytes: bytes, rows: s.n, zone: nc.zone, skelList: s.skelList, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback, gnew: st.j.gnew };
  }

  // shared tables and per-path strings together (header g: 1 and sp: 1): the codes of 3.6 regrouped by path; each path entry is the block's next own string (0) or shared string v - 1 (entry list, typed bytes)
  function sharedPathBlock(ctx, s, out, L, asc, sid, kloc, ids, level) {
    var zs = ctx.zs, st = ctx.st, nu = asc.length, bp = byPath(s, out, L + st.s.length), ent = bp.ent, E = ent.length, i, k, c;
    var gr = new Uint32Array(E), own = [], sideIdx = [], sideS = [];
    for (i = 0; i < E; i++) { c = ent[i]; if (c < L) { if (c >= nu) { sideIdx.push(own.length); sideS.push(sid[c - nu]); own.push(''); } else own.push(asc[c]); } else gr[i] = c - L + 1; }
    var LT = own.length, text = te.encode(LT ? own.join('\0') : ''), ztext = zs.compress(text, level);
    var sideB = te.encode(JSON.stringify({ idx: sideIdx, str: sideS })), zside = zs.compress(sideB, level);
    var skB = te.encode(kloc.join('\n')), zskel = zs.compress(skB, level), LK = kloc.length;
    var tid = typedColumn(ids), zids = zs.compress(tid[2], level), tgr = typedColumn(gr), zgr = zs.compress(tgr[2], level);
    var pf = pathFrames(zs, bp, level), nc = nestedCols(zs, s.cols, level), zc = nc.zc;
    var hdr = te.encode(JSON.stringify({ k: 'n', n: s.n, g: 1, sp: 1, count: LT, kc: LK, len: [text.length, sideB.length, skB.length], p: [ztext.length, zside.length, zskel.length],
      ids: [tid[0], tid[1], zids.length], sf: pf[0], gr: [tgr[0], tgr[1], zgr.length], cm: [nc.cmB.length, nc.zcm.length] }));
    var parts = [u32le(hdr.length), hdr, nc.zcm, ztext, zside, zskel, zids].concat(pf[1], [zgr]); for (k = 0; k < zc.length; k++) parts.push(zc[k][3]);
    return { bytes: concat(parts), rows: s.n, zone: nc.zone, skelList: s.skelList, oddRows: s.oddRows, spell: s.spell, fallback: s.fallback, gnew: st.j.gnew };
  }
  // per-path strings (sp = 1): the path table, then each path's codes from its own flags and repeats, path after path -> { tab, codes: entry numbers (path base + local number), NT, ET }
  function pathCodes(zs, h, take) {
    var sf = h.sf, tab = JSON.parse(tdr.decode(zs.decompressView(take(sf[1]), sf[0]))), pfl = zs.decompress(take(sf[3]), sf[2]), i;
    if (!(sf[4] >= 0 && sf[4] <= 2)) throw new Error('damaged block: bad repeat width');
    var prz = zs.decompress(take(sf[6]), sf[5] * KIND[sf[4]].BYTES_PER_ELEMENT), prp = new KIND[sf[4]](prz.buffer, prz.byteOffset, sf[5]);
    if (!Array.isArray(tab)) throw new Error('damaged block: string path table');
    var NT = 0, ET = 0, RT = 0, FT = 0, te_, x;
    for (i = 0; i < tab.length; i++) { te_ = tab[i]; if (!Array.isArray(te_) || te_.length < 3 || !(te_[1] >= 0 && te_[2] >= te_[1] && (te_[1] > 0 || te_[2] === 0)) || te_[1] % 1 || te_[2] % 1) throw new Error('damaged block: string path table'); NT += te_[2]; ET += te_[1]; RT += te_[2] - te_[1]; FT += (te_[2] + 7) >> 3; }
    if (RT !== sf[5] || FT !== sf[2]) throw new Error('damaged block: string path table');
    var pco = new Uint32Array(NT), base = 0, cell = 0, rr = 0, fo = 0, e, nx, m8, b8, u;
    for (i = 0; i < tab.length; i++) {
      e = tab[i][1]; m8 = tab[i][2]; nx = 0;
      for (u = rr; u < rr + m8 - e; u++) if (prp[u] >= e) throw new Error('damaged block: string code out of range');
      for (u = 0; u + 8 <= m8; u += 8) {
        b8 = pfl[fo + (u >> 3)];
        if (b8 === 0) { for (x = 0; x < 8; x++) pco[cell++] = base + prp[rr++]; }
        else if (b8 === 255) { for (x = 0; x < 8; x++) pco[cell++] = base + nx++; }
        else for (x = 0; x < 8; x++) pco[cell++] = (b8 >> x) & 1 ? base + nx++ : base + prp[rr++];
      }
      for (; u < m8; u++) pco[cell++] = (pfl[fo + (u >> 3)] >> (u & 7)) & 1 ? base + nx++ : base + prp[rr++];
      if (nx !== e) throw new Error('damaged block: string flags');
      base += e; fo += (m8 + 7) >> 3;
    }
    return { tab: tab, codes: pco, NT: NT, ET: ET };
  }
  function codeColumn(a, top) { var k = top < 256 ? 0 : top < 65536 ? 1 : 2, o = new KIND[k](a.length), i; for (i = 0; i < a.length; i++) o[i] = a[i]; return [CODES_KEY, k, a.length, new Uint8Array(o.buffer)]; }
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
    if (h.g === 1) {   // shared tables: the string codes are stored as they are
      var gtab = null, gcc = null;
      if (h.sp === 1) {   // with per-path strings: path entries, each the block's next own string (0) or shared string v - 1, then codes = entry -> block code (own: 0.., shared: count + v - 1)
        var gq = pathCodes(zs, h, take);
        if (!(h.gr[0] >= 0 && h.gr[0] <= 2) || h.gr[1] !== gq.ET) throw new Error('damaged block: bad string entry list');
        var grz = zs.decompress(take(h.gr[2]), h.gr[1] * KIND[h.gr[0]].BYTES_PER_ELEMENT), gra = new KIND[h.gr[0]](grz.buffer, grz.byteOffset, h.gr[1]), GE = new Float64Array(gq.ET), lt = 0, top = 0;
        for (i = 0; i < gq.ET; i++) { GE[i] = gra[i] === 0 ? lt++ : h.count + gra[i] - 1; if (GE[i] > top) top = GE[i]; }
        if (lt !== h.count) throw new Error('damaged block: string entry list');
        var gco = gq.codes; for (i = 0; i < gco.length; i++) gco[i] = GE[gco[i]];
        gtab = gq.tab; gcc = codeColumn(gco, top);
      } else if (!(h.cd[0] >= 0 && h.cd[0] <= 2)) throw new Error('damaged block: bad string code width');
      var gcd = gcc ? null : zs.decompress(take(h.cd[2]), h.cd[1] * KIND[h.cd[0]].BYTES_PER_ELEMENT);
      for (i = 0; i < cmeta.length; i++) { var cg = cmeta[i]; if (cg[1] === 7) cols.push([cg[0], 6, cg[2], decodeDecimalColumn(zs.decompress(take(cg[3]), cg[4]), cg[2])]); else cols.push([cg[0], cg[1], cg[2], zs.decompress(take(cg[3]), cg[2] * KIND[cg[1]].BYTES_PER_ELEMENT)]); }
      cols.push(gcc || [CODES_KEY, h.cd[0], h.cd[1], gcd]);
      return { t: 'n', n: h.n, g: 1, sp: gtab, count: h.count, kc: h.kc, dict: dict, side: side, skel: skel, ids: ids, cols: cols };
    }
    if (h.sp === 1 && h.g !== 1) {   // per-path strings
      var pq = pathCodes(zs, h, take);
      for (i = 0; i < cmeta.length; i++) { var cs = cmeta[i]; if (cs[1] === 7) cols.push([cs[0], 6, cs[2], decodeDecimalColumn(zs.decompress(take(cs[3]), cs[4]), cs[2])]); else cols.push([cs[0], cs[1], cs[2], zs.decompress(take(cs[3]), cs[2] * KIND[cs[1]].BYTES_PER_ELEMENT)]); }
      if (pq.ET !== h.count) throw new Error('damaged block: string path table');
      cols.push(codeColumn(pq.codes, pq.ET));
      return { t: 'n', n: h.n, sp: pq.tab, count: h.count, dict: dict, side: side, skel: skel, ids: ids, cols: cols };
    }
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
  var NONASCII = /[\x80-\xff]/;   // dictionary text is ASCII (LAYOUT-SPEC 3.4)
  // tables: the file's shared tables ({ s: strings, k: row shapes }, footer section 16), or null
  function makeNestedReader(zs, tables) {
    var STRS = null, TI = 0, COLS = new Map(), SCOLS = new Map(), PLAN = new Map(), SPLAN = new Map(), GPLN = [], GPLS = [], SPM = false;
    // plans are cached per shape text; blocks with per-path strings (sp) get their own plans, whose string cells read from the column of their path
    function planOf(t) { var P = SPM ? SPLAN : PLAN, f = P.get(t); if (!f) { f = desc(JSON.parse(t), ''); P.set(t, f); } return f; }
    function col(h) { var c = COLS.get(h); if (!c) { c = { h: h, a: null, i: 0 }; COLS.set(h, c); } return c; }
    function scol(h) { var c = SCOLS.get(h); if (!c) { c = { h: h, a: null, i: 0, e: 0 }; SCOLS.set(h, c); } return c; }
    function desc(s, p) {
      if (s === 1) return SPM ? { t: 8, c: scol(fnvStr(p)) } : { t: 1 };
      if (s === 2) return { t: 2, c: col(fnvStr(p)) };
      if (s === 3) return { t: 3, c: col(fnvStr(p + '?')) };
      if (s === 4) return { t: 4 };
      if (s === 5) return SPM ? { t: 9, c: scol(fnvStr(p)) } : { t: 5 };
      var i;
      if (Array.isArray(s)) { var subs = []; for (i = 0; i < s.length; i++) subs.push(desc(s[i], p + '[]')); return { t: 6, subs: subs }; }
      var keys = Object.keys(s), n = keys.length, kind = new Uint8Array(n), cc = new Array(n), sb = new Array(n), proto = false;
      for (i = 0; i < n; i++) { var c = s[keys[i]]; if (keys[i] === '__proto__') proto = true;
        if (c === 1) { if (SPM) { kind[i] = 8; cc[i] = scol(fnvStr(p + '.' + keys[i])); } else kind[i] = 1; } else if (c === 2) { kind[i] = 2; cc[i] = col(fnvStr(p + '.' + keys[i])); } else if (c === 3) { kind[i] = 3; cc[i] = col(fnvStr(p + '.' + keys[i] + '?')); }
        else if (c === 4) kind[i] = 4; else { kind[i] = 0; sb[i] = desc(c, p + '.' + keys[i]); } }
      return { t: 7, keys: keys, kind: kind, cc: cc, subs: sb, proto: proto, n: n };
    }
    function build(p) {
      var t = p.t, c, i;
      if (t === 7) {
        var keys = p.keys, kind = p.kind, cc = p.cc, subs = p.subs, n = p.n, o = {}, v;
        for (i = 0; i < n; i++) {
          switch (kind[i]) { case 1: v = STRS[TI++]; break; case 8: c = cc[i]; v = c.a[c.i++]; break; case 2: c = cc[i]; v = c.a[c.i++]; break; case 3: c = cc[i]; v = c.a[c.i++] === 1; break; case 4: v = null; break; default: v = build(subs[i]); }
          if (p.proto && keys[i] === '__proto__') Object.defineProperty(o, keys[i], { value: v, enumerable: true, writable: true, configurable: true }); else o[keys[i]] = v;
        }
        return o;
      }
      if (t === 1) return STRS[TI++];
      if (t === 2) { c = p.c; return c.a[c.i++]; }
      if (t === 3) { c = p.c; return c.a[c.i++] === 1; }
      if (t === 4) return null;
      if (t === 5) return JSON.parse(STRS[TI++]);
      if (t === 8) { c = p.c; return c.a[c.i++]; }
      if (t === 9) { c = p.c; return JSON.parse(c.a[c.i++]); }
      var sb = p.subs, m = sb.length, arr = new Array(m); for (i = 0; i < m; i++) arr[i] = build(sb[i]); return arr;
    }
    // assemble one block from its decompressed frames (nestedFrames): the dictionary strings and column arrays the row builder reads
    function openBlock(F) {
      var dt = tlat.decode(F.dict), D, sd = F.side, i, cols = new Map(), g = F.g === 1;
      if (NONASCII.test(dt)) throw new Error('damaged block: dictionary text is not ASCII');
      D = dt.split('\0');
      if (F.sp && !g && !(F.count === 0 || D.length === F.count)) throw new Error('damaged block: dictionary count');
      if (g) { if (!tables) throw new Error('damaged file: shared tables missing'); if (!(F.count >= 0 && (F.count === 0 || D.length === F.count))) throw new Error('damaged block: dictionary count'); }
      for (i = 0; i < sd.idx.length; i++) { if (!(sd.idx[i] >= 0 && sd.idx[i] < D.length)) throw new Error('damaged block: side list index out of range'); D[sd.idx[i]] = sd.str[i]; }
      for (i = 0; i < F.cols.length; i++) { var cd = F.cols[i]; cols.set(cd[0], new KIND[cd[1]](cd[3].buffer, cd[3].byteOffset, cd[2])); }
      var skl = g && !F.kc ? [] : F.skel.split('\n');
      if (g && skl.length !== F.kc) throw new Error('damaged block: shape count');
      return { n: F.n, g: g, sp: F.sp || null, L: g ? F.count : 0, ids: new KIND[F.ids[0]](F.ids[2].buffer, F.ids[2].byteOffset, F.ids[1]), skel: skl, cols: cols, dict: D, codes: cols.get(CODES_KEY) };
    }
    function rowsOf(b) {
      var D = b.dict, cd = b.codes, n = cd ? cd.length : 0, E = new Array(n), i, c;
      if (b.g) { var L = b.L, GS = tables.s; for (i = 0; i < n; i++) { c = cd[i]; if ((E[i] = c < L ? D[c] : GS[c - L]) === undefined) throw new Error('damaged block: string code out of range'); } }
      else for (i = 0; i < n; i++) { if ((E[i] = D[cd[i]]) === undefined) throw new Error('damaged block: string code out of range'); }
      STRS = E; TI = 0; SPM = !!b.sp;
      var sl = b.skel, fnById = new Array(sl.length);
      for (i = 0; i < sl.length; i++) fnById[i] = planOf(sl[i]);
      var ids = b.ids, out = new Array(b.n), LK = sl.length, id, tab = b.sp, sc, GPL = SPM ? GPLS : GPLN;
      if (b.g) { var GK = tables.k;   // plans of the shared shapes this block uses, before the columns are bound (a plan registers its columns)
        for (i = 0; i < b.n; i++) { id = ids[i]; if (id >= LK && GPL[id - LK] === undefined) { if (id - LK >= GK.length) throw new Error('damaged block: shape id out of range'); GPL[id - LK] = planOf(GK[id - LK]); } } }
      if (tab) {   // every path of the table reads its own stretch of the codes; a path no shape has, two entries for one path, or a stretch not read to its end is damage
        SCOLS.forEach(function (x) { x.a = null; x.i = 0; x.e = -1; });
        for (i = 0, c = 0; i < tab.length; i++) { sc = SCOLS.get(tab[i][0]); if (!sc || sc.e !== -1) throw new Error('damaged block: string path table'); sc.a = E; sc.i = c; c += tab[i][2]; sc.e = c; }
      }
      COLS.forEach(function (c) { c.a = b.cols.get(c.h); c.i = 0; });
      if (b.g) for (i = 0; i < b.n; i++) { id = ids[i]; out[i] = build(id < LK ? fnById[id] : GPL[id - LK]); }
      else for (i = 0; i < b.n; i++) out[i] = build(fnById[ids[i]]);
      if (tab) for (i = 0; i < tab.length; i++) { sc = SCOLS.get(tab[i][0]); if (sc.i !== sc.e) throw new Error('damaged block: string cells left over'); }
      return out;
    }
    openBlock = guard(openBlock); rowsOf = guard(rowsOf);
    return { open: openBlock, rowsOf: rowsOf, readBlock: function (bytes) { return rowsOf(openBlock(nestedFrames(zs, bytes))); }, assemble: function (F) { return rowsOf(openBlock(F)); } };
  }
