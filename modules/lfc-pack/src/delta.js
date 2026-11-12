// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ delta saves (prototype, off by default): pack(x, { base }) / packTables(x, { base }) / unpack(file, { base })
  // A delta file is a normal file whose flat blocks have their meta frame, plane frame and column frames compressed against the same frames of a base file (an earlier full save):
  // zstd --patch-from per frame. Frames are matched by block number, column key and frame number. Nested and raw blocks, and blocks without a flat partner in the base, are kept as
  // they are. Footer section 17 (required) names the base by the XXH64 of its bytes; a reader refuses a delta without that exact base. Same rows as the full file; only the frames change.
  var DELTA_VERSION = 1;
  // the raw (decompressed) parts of a flat block without key-order lists: the meta and plane bytes, and every column's raw frames with the original compressed bytes beside them
  function rawParts(zs, bytes) {
    var ph = parseBlockHeader(bytes), h = ph.h, p = ph.p, j, i, c, f, sb;
    function take(n) { var x = bytes.subarray(p, p + n); p += n; return x; }
    if (h.k !== 'f' || h.d) return null;
    var m = zs.decompress(take(h.m[1]), h.m[0]), meta = JSON.parse(tdr.decode(m)), pl = zs.decompress(take(h.pl[1]), h.pl[0]);
    if (meta.ord) return null;
    var cols = {}, comp = {};
    for (j = 0; j < meta.cols.length; j++) {
      c = meta.cols[j]; cols[meta.keys[j]] = []; comp[meta.keys[j]] = [];
      for (i = 0; i < c.f.length; i++) { f = c.f[i]; sb = take(f[1]); cols[meta.keys[j]].push(f[2] ? zs.decompress(sb, f[0]) : sb.slice()); comp[meta.keys[j]].push(sb.slice()); }
    }
    return { h: h, m: m, meta: meta, pl: pl, cols: cols, comp: comp };
  }
  // one flat block against the same block of the base -> { bytes, prefix } or null when the pair has nothing to share
  function deltaFlat(zs, bb, baseBb, level) {
    var N = rawParts(zs, bb), B = rawParts(zs, baseBb), meta, j, i, c, f, key, raw, pre, z, nf, frames = [], check, hdr, zm, zp, out, h, got = 0;
    if (!N || !B) return null;
    meta = N.meta; check = meta.cols.length && typeof meta.cols[0].x === 'string';
    for (j = 0; j < meta.cols.length; j++) {
      c = meta.cols[j]; key = meta.keys[j]; nf = []; c._z = [];
      for (i = 0; i < c.f.length; i++) {
        f = c.f[i]; raw = N.cols[key][i]; pre = B.cols[key] && B.cols[key][i];
        z = pre && pre.length && raw.length ? zs.compressPrefix(raw, level, pre) : null;
        if (z && z.length < (f[2] ? f[1] : raw.length)) { nf.push([raw.length, z.length, 1, 1]); c._z.push([raw.length, z, 1]); frames.push(z); got++; }
        else { nf.push(f.slice(0, 3)); c._z.push([f[0], N.comp[key][i], f[2]]); frames.push(N.comp[key][i]); }
      }
      c.f = nf;
    }
    if (!got) return null;
    withColumnInfo(meta, check ? { check: 'xxh64' } : null, zs);
    var mB = te.encode(JSON.stringify(meta));
    zm = zs.compressPrefix(mB, level, B.m); zp = zs.compressPrefix(N.pl, level, B.pl);
    h = {}; for (key in N.h) h[key] = N.h[key]; h.m = [mB.length, zm.length]; h.pl = [N.pl.length, zp.length]; h.d = 1;
    hdr = te.encode(JSON.stringify(h));
    out = concat([u32le(hdr.length), hdr, zm, zp].concat(frames));
    return { bytes: out, prefix: out.length - colBytes(meta) };
  }
  // the footer's sections with their flags, in file order
  function footerParts(zs, file) {
    var n = file.length, flen = rd32(file, n - 16), f = file.subarray(n - 16 - flen, n - 16), body = f[0] === 1 ? zs.decompress(f.subarray(1)) : f.subarray(1), out = [], p = 0;
    while (p < body.length) { var len = rd32(body, p + 4); out.push({ id: rd16(body, p), flags: rd16(body, p + 2), payload: body.slice(p + 8, p + 8 + len) }); p += 8 + len; }
    return out;
  }
  function deltify(bytes, baseBytes, opts) {
    need(true); bytes = bytesOf(bytes); baseBytes = bytesOf(baseBytes);
    var zs = S.zfull, level = opts && opts.level != null ? opts.level : LV_FLAT, F = openFile(bytes), B = openFile(baseBytes), i, nb, d, e, parts = [], blocks = [], off = 0, secs, k, any = 0;
    if (!zs.compressPrefix) throw new Error('LfcPack: this build has no delta support (zstd without the prefix calls)');
    if (F.footer.sec[SEC_DELTA]) throw new Error('LfcPack: the new file is already a delta');
    if (B.footer.sec[SEC_DELTA]) throw new Error('LfcPack: base must be a full save, not a delta');
    for (i = 0; i < F.blocks.length; i++) {
      nb = blockBytes(F, i); e = F.blocks[i].slice(); d = null;
      if (e[4] === 'f' && B.blocks[i] && B.blocks[i][4] === 'f') d = deltaFlat(zs, nb, blockBytes(B, i), level);
      if (d) { nb = d.bytes; any++; }
      e[0] = off; e[1] = nb.length; e[2] = crcOf(nb);
      if (e.length > 6) { e[6] = hash(nb, 'xxh64'); if (d && typeof e[7] !== 'undefined') e[7] = [d.prefix, hash(nb.subarray(0, d.prefix), 'xxh64')]; }
      blocks.push(e); parts.push(nb); off += nb.length;
    }
    if (!any) return bytes;   // nothing shared with the base: the full file is the answer (a reader given a base opens it as it is)
    secs = footerParts(S.zdec, bytes);
    for (k = 0; k < secs.length; k++) if (secs[k].id === SEC_BLOCKS) secs[k].payload = te.encode(JSON.stringify(blocks));
    secs.push({ id: SEC_DELTA, flags: 1, payload: te.encode(JSON.stringify({ v: DELTA_VERSION, base: hash(baseBytes, 'xxh64'), blocks: any })) });
    parts.push(writeFooter(zs, secs, true, F.footer.minor));
    return concat(parts);
  }
  // reading: the base's raw frames for block i, found by column key and frame number
  function deltaProvider(zs, base, i) {
    var parts = null;
    return {
      get: function () { if (!parts) { if (!base.blocks[i] || base.blocks[i][4] !== 'f') throw new Error('LfcPack: the base has no flat block ' + i); parts = rawParts(zs, blockBytes(base, i)); if (!parts) throw new Error('LfcPack: the base block ' + i + ' cannot be used'); } return parts; },
      get m() { return this.get().m; }, get pl() { return this.get().pl; },
      col: function (key, n) { var c = this.get().cols[key]; if (!c || !c[n]) throw new Error('LfcPack: the base has no column ' + key + ' frame ' + n); return c[n]; }
    };
  }
  function unpackDelta(bytes, base) {
    var file = openFile(bytes), bf, sec = file.footer.sec[SEC_DELTA], info, zs, rf, rn, out = [], i, kd, r, j, prev;
    bf = openFile(base);
    if (!sec) return unpack(bytes);   // a full file: the base is not needed
    info = JSON.parse(tdr.decode(sec));
    if (info.base !== hash(bytesOf(base), 'xxh64')) throw new Error('LfcPack: this delta belongs to a different base save');
    zs = S.zdec; if (!zs.decompressPrefix) throw new Error('LfcPack: this build has no delta support (zstd without the prefix calls)');
    rn = makeNestedReader(zs, sharedOf(file)); rf = makeFlatReader(zs); prev = zs.dp;
    try {
      for (i = 0; i < file.blocks.length; i++) {
        kd = file.blocks[i][4]; zs.dp = deltaProvider(zs, bf, i);
        r = kd === 'r' ? rawRows(readRawBlock(zs, blockBytes(file, i))) : (kd === 'f' ? rf : rn).readBlock(blockBytes(file, i));
        for (j = 0; j < r.length; j++) out.push(r[j]);
      }
    } finally { zs.dp = prev; }
    return out;
  }
  // a delta of a pack result: the same call as pack/packTables plus { base: bytes of an earlier full save }
  function withBase(fn) {
    return function (x, opts) {
      var r = fn.apply(null, arguments);
      return opts && opts.base ? deltify(r, opts.base, opts) : r;
    };
  }
