// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ delta saves v2 (prototype, off by default): packTables(x, { base }) / unpackTables(file, { base })
  // A delta file is a normal file (written by packTables) holding a patch: for every table of x, the base rows to drop and the new rows to put in their place, in order, so any row shape (flat,
  // nested, optional keys) works and an edit costs about its own rows. The rows are found by comparing each row's JSON text with the base's, so no zstd or layout knowledge is involved.
  // Footer section 17 (required) = { v: 2, base: XXH64 of the base file's bytes }: a reader without the base, or with another one, refuses. The base must be a full file, not a delta.
  // The base's row texts are kept for the next save (one base only, until clearCache()), so the second delta save against the same base is a compare and a small pack.
  var DELTA_VERSION = 2, DELTA_BASE = null;
  var DELTA_CHUNK = 64;   // rows compared as one text first: a chunk that did not change costs one JSON.stringify instead of one per row
  function baseChunk(B, name, g) {   // the text JSON.stringify gives for rows g*64.. of the base (kept, built from the row texts)
    var cs = B.cs[name] || (B.cs[name] = []), c = cs[g];
    if (c === undefined) cs[g] = c = '[' + B.strs[name].slice(g * DELTA_CHUNK, (g + 1) * DELTA_CHUNK).join(',') + ']';
    return c;
  }
  // rows of one table: a chunk-wise first pass finds the chunks that changed, and only their rows are compared one by one; many changed chunks (rows inserted or removed shift all that follows): the whole table row by row
  function diffTable(B, name, v) {
    var a = B.strs[name], na = a.length, nv = v.length, G = DELTA_CHUNK, nc = Math.ceil(Math.max(na, nv) / G), g, dirty = 0, runs = [], run = null, i, j, texts, d, ops = [], ins = [], x, b;
    for (g = 0; g < nc; g++) {
      if (g * G < nv && g * G < na && JSON.stringify(v.slice(g * G, (g + 1) * G)) === baseChunk(B, name, g)) { run = null; continue; }
      dirty++; if (dirty > 8 && dirty * 5 > g + 1) return fullDiff(a, v);
      if (run && run[1] === g) run[1] = g + 1; else { run = [g, g + 1]; runs.push(run); }
    }
    for (i = 0; i < runs.length; i++) {
      b = runs[i][0] * G; x = Math.min(nv, runs[i][1] * G); texts = new Array(Math.max(0, x - b));
      for (j = b; j < x; j++) texts[j - b] = rowText(v[j]) || 'null';
      d = diffRows(a.slice(b, Math.min(na, runs[i][1] * G)), texts);
      for (j = 0; j < d.ops.length; j += 3) ops.push(d.ops[j] + b, d.ops[j + 1], d.ops[j + 2]);
      for (j = 0; j < d.ins.length; j++) ins.push(d.ins[j] + b);
    }
    return { ops: ops, ins: ins };
  }
  // opts.dirty = { table: [row numbers that may have changed] }: when the table has as many rows as the base, only those rows are compared (the others are taken as unchanged, so the caller must list every edit)
  function dirtyDiff(a, v, rows) {
    var idx = Array.from(new Set(rows)).filter(function (q) { return q >= 0 && q < v.length; }).sort(function (p, q) { return p - q; }), ops = [], ins = [], i, q, last = -2;
    for (i = 0; i < idx.length; i++) {
      q = idx[i];
      if ((rowText(v[q]) || 'null') === a[q]) continue;
      if (q === last + 1 && ops.length) { ops[ops.length - 2]++; ops[ops.length - 1]++; } else ops.push(q, 1, 1);
      ins.push(q); last = q;
    }
    return { ops: ops, ins: ins };
  }
  function fullDiff(a, v) { var t = new Array(v.length), j; for (j = 0; j < v.length; j++) t[j] = rowText(v[j]) || 'null'; return diffRows(a, t); }
  function rowText(r) { var t = JSON.stringify(r); return t === undefined ? null : t; }
  function deltaBaseInfo(base) {
    var bytes = bytesOf(base), h, f, t, names, strs = {}, i, j, a, s;
    if (DELTA_BASE && (DELTA_BASE.bytes === bytes || (DELTA_BASE.bytes.length === bytes.length && DELTA_BASE.hash === hash(bytes, 'xxh64')))) return DELTA_BASE;
    f = openFile(bytes);
    if (f.footer.sec[SEC_DELTA]) throw new Error('LfcPack: base must be a full save, not a delta');
    h = hash(bytes, 'xxh64'); t = unpackTables(bytes); names = Object.keys(t);
    for (i = 0; i < names.length; i++) { a = t[names[i]]; if (Array.isArray(a)) { s = new Array(a.length); for (j = 0; j < a.length; j++) s[j] = rowText(a[j]) || 'null'; strs[names[i]] = s; } else strs[names[i]] = rowText(a); }
    return (DELTA_BASE = { bytes: bytes, hash: h, strs: strs, cs: {} });
  }
  // rows of a (base texts) to rows of b (new texts) -> { ops: [at, del, count, ...], ins: indices of the new rows that are put in }; the common start and end are not listed
  function diffRows(a, b) {
    var na = a.length, nb = b.length, i = 0, j = 0, ea = na, eb = nb, ops = [], ins = [], at = -1, del = 0, cnt = 0, W = 48, k, kd, ki;
    while (i < na && j < nb && a[i] === b[j]) { i++; j++; }
    while (ea > i && eb > j && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    while (i < ea || j < eb) {
      if (i < ea && j < eb && a[i] === b[j]) { if (at >= 0) { ops.push(at, del, cnt); at = -1; del = 0; cnt = 0; } i++; j++; continue; }
      if (at < 0) at = i;
      if (i >= ea) { ins.push(j++); cnt++; continue; }
      if (j >= eb) { del++; i++; continue; }
      if (i + 1 < ea && j + 1 < eb && a[i + 1] === b[j + 1]) { del++; i++; ins.push(j++); cnt++; continue; }
      kd = 0; ki = 0;
      for (k = 1; k <= W && (!kd || !ki); k++) { if (!kd && i + k < ea && a[i + k] === b[j]) kd = k; if (!ki && j + k < eb && b[j + k] === a[i]) ki = k; }
      if (kd && (!ki || kd <= ki)) { del += kd; i += kd; }
      else if (ki) { for (k = 0; k < ki; k++) { ins.push(j++); cnt++; } }
      else { del++; i++; ins.push(j++); cnt++; }
    }
    if (at >= 0) ops.push(at, del, cnt);
    return { ops: ops, ins: ins };
  }
  function footerParts(zs, file) {   // the footer's sections with their flags, in file order
    var n = file.length, flen = rd32(file, n - 16), f = file.subarray(n - 16 - flen, n - 16), body = f[0] === 1 ? zs.decompress(f.subarray(1)) : f.subarray(1), out = [], p = 0;
    while (p < body.length) { var len = rd32(body, p + 4); out.push({ id: rd16(body, p), flags: rd16(body, p + 2), payload: body.slice(p + 8, p + 8 + len) }); p += 8 + len; }
    return { secs: out, bodyEnd: n - 16 - flen };
  }
  function packDelta(obj, opts) {
    var B = deltaBaseInfo(opts.base), names = Object.keys(obj), meta = [], P = {}, vals = {}, nv = 0, i, j, v, d, rows, texts, popts = {}, k, any = 0, out, fp, zs;
    for (k in opts) if (k !== 'base' && k !== 'meta' && k !== 'dirty') popts[k] = opts[k];
    for (i = 0; i < names.length; i++) {
      v = obj[names[i]];
      if (Array.isArray(v)) {
        d = !Array.isArray(B.strs[names[i]]) ? fullDiff([], v) : (opts.dirty && Array.isArray(opts.dirty[names[i]]) && v.length === B.strs[names[i]].length) ? dirtyDiff(B.strs[names[i]], v, opts.dirty[names[i]]) : diffTable(B, names[i], v);
        rows = new Array(d.ins.length); for (j = 0; j < d.ins.length; j++) rows[j] = v[d.ins[j]];
        meta.push({ n: names[i], k: 'r', len: v.length, ops: d.ops }); P['t' + i] = rows;
      } else {
        texts = rowText(v === undefined ? null : v);
        if (texts === B.strs[names[i]] && !Array.isArray(B.strs[names[i]])) meta.push({ n: names[i], k: 'v', same: 1 });
        else { meta.push({ n: names[i], k: 'v' }); vals[names[i]] = v === undefined ? null : v; nv++; }
      }
    }
    P.meta = { d: meta }; P.vals = vals;
    out = packTables(P, popts); zs = S.zfull;
    fp = footerParts(S.zdec, out);
    fp.secs.push({ id: SEC_DELTA, flags: 1, payload: te.encode(JSON.stringify({ v: DELTA_VERSION, base: B.hash })) });
    return concat([out.subarray(0, fp.bodyEnd), writeFooter(zs, fp.secs, true, rd16(out, out.length - 8))]);
  }
  function deltaInfo(file) { var s = file.footer.sec[SEC_DELTA]; return s ? JSON.parse(tdr.decode(s)) : null; }
  // the tables a delta stands for: the base's rows with the patch applied
  function unpackDelta(bytes, opts) {
    var file = openFile(bytes), info = deltaInfo(file), P, base, bt, out = {}, i, j, m, a, ins, res, ai, ii, o;
    if (!opts || !opts.base) throw new Error('LfcPack: this file is a delta: pass { base } (the full save it was made against)');
    base = bytesOf(opts.base);
    if (info.v !== DELTA_VERSION) throw new Error('LfcPack: unknown delta version ' + info.v);
    if (info.base !== hash(base, 'xxh64')) throw new Error('LfcPack: this delta belongs to a different base save');
    if (deltaInfo(openFile(base))) throw new Error('LfcPack: base must be a full save, not a delta');
    P = unpackTablesPlain(bytes, {}); bt = opts.baseTables || unpackTables(base); // opts.baseTables: the tables the base was saved from or read into (unmodified); their rows are shared with the result, not copied
    for (i = 0; i < P.meta.d.length; i++) {
      m = P.meta.d[i];
      if (m.k === 'v') { out[m.n] = m.same ? bt[m.n] : P.vals[m.n]; continue; }
      a = Array.isArray(bt[m.n]) ? bt[m.n] : []; ins = P['t' + i] || []; res = []; ai = 0; ii = 0;
      for (j = 0; j < m.ops.length; j += 3) {
        for (; ai < m.ops[j]; ai++) res.push(a[ai]);
        ai += m.ops[j + 1];
        for (o = 0; o < m.ops[j + 2]; o++) res.push(ins[ii++]);
      }
      for (; ai < a.length; ai++) res.push(a[ai]);
      if (res.length !== m.len) throw new Error('LfcPack: the delta does not fit its base (table ' + m.n + ')');
      out[m.n] = res;
    }
    return out;
  }
  function dropDeltaBase() { DELTA_BASE = null; }
