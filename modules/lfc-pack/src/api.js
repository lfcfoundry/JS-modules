// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ public API
  var BLOCK_BYTES = 13 << 20;
  function flatSkeletons(list) {
    for (var i = 0; i < list.length; i++) { var t = list[i]; if (t.charCodeAt(0) !== 123 || t.indexOf('{', 1) >= 0 || t.indexOf('[') >= 0) return false; }
    return list.length > 0;
  }
  function looksFlat(chunk) {   // the first 40 lines are objects whose values are scalars
    var s0 = td.decode(chunk.subarray(0, Math.min(chunk.length, 16384))).split('\n'), i, l, c = 0;
    for (i = 0; i < s0.length - 1 && c < 40; i++) { l = s0[i]; if (!l) return false; if (l.charCodeAt(0) !== 123 || l.indexOf('{', 1) >= 0 || l.indexOf('[') >= 0) return false; c++; }
    return c > 0;
  }
  function init(opts) {   // -> Promise; loads the wasm modules once. { readOnly: true } skips the zstd encoder.
    var ro = !!(opts && opts.readOnly) || !WASM['zstd-full'];   // the decoder-only build has no encoder inside
    if (S.ready && (ro || S.zfull)) return S.ready;
    var names = [ro ? 'zstd-dec' : 'zstd-full'].concat(ro ? [] : [coreName()]);
    S.ready = loadAsync(names).then(function (r) {
      if (ro) S.zdec = makeZstd(r[0]); else { S.zfull = makeZstd(r[0]); S.core = r[1]; S.sh = makeShredder(r[1]); S.zdec = S.zfull; }
      return api;
    });
    return S.ready;
  }
  // trim(): gives back the WebAssembly memory that earlier jobs grew (memory only grows; a new instance of each compiled module starts small and the old memory goes with the old instance). Call it between jobs, never during one.
  function trim() {
    if (S.zfull) { S.zfull = makeZstd(loadSync('zstd-full')); S.zdec = S.zfull; } else if (S.zdec) S.zdec = makeZstd(loadSync('zstd-dec'));
    trimPacker();
  }
  // the packer's memory only (the tokenizer and string dictionary, which holds most of what a pack grows): the zstd memory stays, so the next job does not grow it again.
  // Pack helpers can do this when they go idle (pool.js, _helperTrimMs); by default they keep it until they close 3 s after the last call, since growing it again cost every call 7 to 25%.
  function trimPacker() {
    if (S.idle) { clearTimeout(S.idle); S.idle = null; }
    if (S.core) { S.core = loadSync(coreName()); S.sh.rebind(S.core); }
    dropSmallWasm();
  }
  function need(w) { if (w && !S.sh) throw new Error('LfcPack: call init() first'); if (!S.zdec) throw new Error('LfcPack: call init({readOnly:true}) or init() first'); }
  function pack(input, opts) { return packMany([{ name: null, bytes: bytesOf(input) }], packOpts(opts)); }
  // ---- row objects in, bytes out (no NDJSON text needed); packTables keeps several named tables and plain values in one file
  function rowsText(rows) { var o = new Array(rows.length), i; for (i = 0; i < rows.length; i++) o[i] = JSON.stringify(rows[i]); return o.length ? o.join('\n') + '\n' : ''; }
  function packRows(rows, opts) { return pack(te.encode(rowsText(rows)), opts); }
  function packTables(obj, opts) {
    var names = Object.keys(obj), inputs = [], i, v;
    for (i = 0; i < names.length; i++) {
      v = obj[names[i]];
      if (Array.isArray(v)) inputs.push({ name: names[i], kind: 'rows', bytes: te.encode(rowsText(v)) });
      else inputs.push({ name: names[i], kind: 'value', bytes: te.encode(JSON.stringify({ v: v === undefined ? null : v }) + '\n') });
    }
    return packMany(inputs, packOpts(opts));
  }
  // idle auto-trim: 30 s after the last pack, the packer's memory goes back (trimPacker: about 38 MB after a 66.6 MB pack, up to about 250 MB with big blocks).
  // The zstd memory stays, so reads stay fast, and trimPacker keeps the warmed-up shredder (rebind), so the next pack is not slower in Chromium or Firefox.
  var AUTO_TRIM_MS = 30000;
  function packMany(inputs, opts) {
    if (S.idle) { clearTimeout(S.idle); S.idle = null; }
    try { return packManyNow(inputs, opts); }
    finally { armTrim(); }
  }
  function armTrim() {
    if (!(AUTO_TRIM_MS > 0) || typeof setTimeout !== 'function') return;
    S.idle = setTimeout(function () { S.idle = null; trimPacker(); }, AUTO_TRIM_MS);
    if (S.idle && S.idle.unref) S.idle.unref(); // never keeps Node running
  }
  function packManyNow(inputs, opts) {
    opts = opts || {}; need(true);
    var ti, b, bb = opts.blockBytes || BLOCK_BYTES, p, blocks = [], parts = [], zone = [], off = 0, rows = 0, tail = true;
    var exact = !!opts.exact, st = opts.share && !exact ? (opts._st || sharedState()) : null, ctx = { zs: S.zfull, sh: S.sh, st: st, paths: opts.paths === 'only' ? 'only' : opts.paths !== false }, exc = {}, spl = {}, fatal = new TextDecoder('utf-8', { fatal: true });
    var retry = [], s0, e, chunk, kind, blk, ex, fb, r0, mid;
    for (ti = 0; ti < inputs.length; ti++) {
    b = inputs[ti].bytes; p = 0; tail = b.length === 0 || b[b.length - 1] === 10; retry.length = 0;
    while (retry.length || p < b.length) {
      if (retry.length) { r0 = retry.pop(); s0 = r0[0]; e = r0[1]; }
      else { s0 = p; e = Math.min(b.length, p + bb); if (e < b.length) { var nl = b.indexOf(10, e); e = nl < 0 ? b.length : nl + 1; } p = e; }
      chunk = b.subarray(s0, e); kind = opts.block; blk = null; if (st) st.j = null;
      if (exact && !exactSafe(chunk, fatal)) { blk = writeRawBlock(ctx.zs, chunk, opts); blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, 'r', ti)); zone.push([]); parts.push(blk.bytes); off += blk.bytes.length; rows += blk.rows; continue; }
      try {
        // auto: big blocks whose first rows are all flat objects go straight to the flat layout (it won on every flat-object set measured, and skipping the nested pass saves about 30% of pack time)
        if ((!kind || kind === 'flat') && !exact) { blk = writeFlatBlockFast(ctx, chunk, kind ? opts : Object.assign({}, opts, { noLists: true })); if (blk) kind = 'flat'; }   // auto leaves rows with list columns to the nested layout (lists read faster there); { block: 'flat' } takes them
        if (kind !== 'flat' && !kind && chunk.length > 262144 && looksFlat(chunk)) { blk = writeFlatBlock(ctx, chunk, opts); if (blk) { kind = 'flat'; } }
        else if (kind === 'flat' && !blk) blk = writeFlatBlock(ctx, chunk, opts);
        if (kind !== 'flat' || !blk) {
          blk = writeNestedBlock(ctx, chunk, opts);
          // auto: the flat layout is also tried when every row is a flat object, or when shapes are nearly all different (it then keeps nested values as JSON text, which packs far smaller)
          if (!kind && (flatSkeletons(blk.skelList) || blk.skelList.length * 4 > blk.rows)) { fb = writeFlatBlock(ctx, chunk, opts); if (fb && fb.bytes.length < blk.bytes.length + (blk.gnew || 0) / 2) { if (st) sharedUndo(st); blk = fb; } }   // with shared tables, the nested block also pays for about half the raw size of the strings it moved to the shared tables
        }
      } catch (err) {   // a block over the wasm limits (rows, numbers, strings, bytes) is cut in two at a line end and both halves are tried again
        if (st) sharedUndo(st);
        mid = /capacity|too large/.test(String(err && err.message)) ? b.indexOf(10, s0 + ((e - s0) >> 1)) : -1;
        if (mid < 0 || mid + 1 >= e) throw err;
        retry.push([mid + 1, e], [s0, mid + 1]); continue;
      }
      if (exact) { ex = exceptionsOf(blk, chunk, blk.kind || 'n'); if (ex) { if (ex.raw.length) exc[blocks.length] = ex.raw; if (ex.spell.length) spl[blocks.length] = ex.spell; } }
      blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, blk.kind || 'n', ti, blk.kind === 'f' ? blk.prefix : undefined)); zone.push(blk.zone); parts.push(blk.bytes);
      off += blk.bytes.length; rows += blk.rows;
    }
    }
    var secs = [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify(inputs[0].name === null ? { rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' } : { rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.1', tables: inputs.map(function (x) { return [x.name, x.kind]; }) })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: exact, tail: tail })) }
    ];
    secs = secs.concat(metaSecs(opts));
    if (st && !opts._st && st.used) secs.push(sharedSection(st));
    if (exact && Object.keys(exc).length) secs.push(excSection(exc));
    if (exact && Object.keys(spl).length) secs.push(spellSection(spl));
    parts.push(writeFooter(S.zfull, secs, true));
    return concat(parts);
  }
  function sharedSection(st) { return { id: SEC_SHARED, flags: 1, payload: te.encode(JSON.stringify({ v: 1, s: st.s, k: st.k })) }; }
  // ---- byte-exact switch: rows whose canonical text differs from the input line keep their original bytes (section 9, the raw-line store)
  function exactSafe(chunk, fatal) {   // blank lines, carriage returns and invalid UTF-8 cannot be told apart from rows: those blocks are kept whole
    if (chunk.indexOf(13) >= 0) return false;
    var i = 0, n = chunk.length; if (n && chunk[0] === 10) return false;
    for (; (i = chunk.indexOf(10, i)) >= 0; i++) if (chunk[i + 1] === 10) return false;
    try { fatal.decode(chunk); } catch (e) { return false; }
    return true;
  }
  function lineSpans(chunk) {
    var out = [], p = 0, e; while (p < chunk.length) { e = chunk.indexOf(10, p); if (e < 0) e = chunk.length; out.push([p, e]); p = e + 1; } return out;
  }
  function exceptionsOf(blk, chunk, kind) {   // read the block back and compare each row's canonical text with its input line
    var rows = (kind === 'f' ? makeFlatReader(S.zdec) : makeNestedReader(S.zdec, null)).readBlock(blk.bytes), sp = lineSpans(chunk), list = [], i, line;
    if (rows.length !== sp.length) throw new Error('row count mismatch while checking exactness');
    var spells = [];
    for (i = 0; i < rows.length; i++) {
      line = chunk.subarray(sp[i][0], sp[i][1]); var txt = null; try { txt = JSON.stringify(rows[i]); } catch (e) { txt = null; }
      if (txt === null) { list.push([i, line]); continue; }
      var lt = td.decode(line); if (lt === txt) continue;
      var sw = spellDiff(txt, lt); if (sw) spells.push([i, sw]); else list.push([i, line]);
    }
    return list.length || spells.length ? { raw: list, spell: spells } : null;
  }
  // the line differs from the canonical text only in how some numbers are written: -> [[tokenIndex, spelledText], ...], else null
  function spellDiff(canon, line) {
    var a = numTokens(canon), b = numTokens(line), k, p = 0, q = 0, out = [];
    if (a.length !== b.length) return null;
    for (k = 0; k < a.length; k++) {
      if (canon.slice(p, a[k][0]) !== line.slice(q, b[k][0])) return null;
      var ct = canon.slice(a[k][0], a[k][1]), lt2 = line.slice(b[k][0], b[k][1]);
      if (ct !== lt2) out.push([k, lt2]);
      p = a[k][1]; q = b[k][1];
    }
    if (canon.slice(p) !== line.slice(q) || !out.length) return null;
    return respell(canon, out) === line ? out : null;
  }
  function spellSection(sp) {
    return { id: SEC_SPELL, flags: 1, payload: te.encode(JSON.stringify(sp)) };
  }
  function excSection(exc) {
    var idx = {}, parts = [], k;
    for (k in exc) { idx[k] = exc[k].map(function (x) { parts.push(x[1]); return [x[0], x[1].length]; }); }
    var hb = te.encode(JSON.stringify(idx));
    return { id: SEC_RAW, flags: 1, payload: concat([u32le(hb.length), hb].concat(parts)) };
  }
  // ---- number spellings (section 15): a row whose text differs from the canonical text only in how some numbers are written (0.0, 1E5, 1.50)
  var RX_NUMTOK = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  function numTokens(text) {   // -> [[start, end], ...] of the number tokens outside strings, left to right
    var out = [], i = 0, n = text.length, c, m;
    while (i < n) {
      c = text.charCodeAt(i);
      if (c === 34) { i++; while (i < n && text.charCodeAt(i) !== 34) i += text.charCodeAt(i) === 92 ? 2 : 1; i++; }
      else if (c === 45 || (c >= 48 && c <= 57)) { RX_NUMTOK.lastIndex = i; m = RX_NUMTOK.exec(text); if (!m) { i++; continue; } out.push([i, i + m[0].length]); i += m[0].length; }
      else i++;
    }
    return out;
  }
  function respell(canon, spells) {   // spells: [[tokenIndex, text], ...]
    var toks = numTokens(canon), rep = {}, out = '', p = 0, k;
    for (k = 0; k < spells.length; k++) rep[spells[k][0]] = spells[k][1];
    for (k = 0; k < toks.length; k++) { out += canon.slice(p, toks[k][0]) + (rep[k] !== undefined ? rep[k] : canon.slice(toks[k][0], toks[k][1])); p = toks[k][1]; }
    return out + canon.slice(p);
  }
  function readSpell(b) {   // -> { blockIndex: { row: spells } }
    if (!b) return {};
    var raw = JSON.parse(tdr.decode(b)), out = {}, k, i;
    for (k in raw) { out[k] = {}; for (i = 0; i < raw[k].length; i++) out[k][raw[k][i][0]] = raw[k][i][1]; }
    return out;
  }
  function readExc(b) {
    if (!b) return {};
    var hl = rd32(b, 0), idx = JSON.parse(tdr.decode(b.subarray(4, 4 + hl))), p = 4 + hl, out = {}, k, i;
    for (k in idx) { out[k] = {}; for (i = 0; i < idx[k].length; i++) { out[k][idx[k][i][0]] = b.subarray(p, p + idx[k][i][1]); p += idx[k][i][1]; } }
    return out;
  }
  // raw block (kind 'r'): the block text as one zstd frame; used by the byte-exact switch for text that is not plain rows
  function writeRawBlock(zs, chunk, opts) {
    var z = zs.compress(chunk, opts.level == null ? 3 : opts.level), n = 0, i = 0;
    for (; (i = chunk.indexOf(10, i)) >= 0; i++) n++;
    if (chunk.length && chunk[chunk.length - 1] !== 10) n++;
    return { bytes: concat([u32le(chunk.length), z]), rows: n };
  }
  function readRawBlock(zs, bytes) { return zs.decompress(bytes.subarray(4), rd32(bytes, 0)); }
  function unpackText(bytes) {   // -> Uint8Array: the NDJSON text. Byte-for-byte the input when the file was packed with { exact: true }; canonical JSON text per row otherwise
    var file = openFile(bytes), rn = makeNestedReader(S.zdec, sharedOf(file)), rf = makeFlatReader(S.zdec), flags = jsonSec(file.footer.sec[SEC_FLAGS]) || {}, exc = readExc(file.footer.sec[SEC_RAW]), spell = readSpell(file.footer.sec[SEC_SPELL]), sp, parts = [], i, j, rows, ex, last, nl = new Uint8Array([10]);
    for (i = 0; i < file.blocks.length; i++) {
      var kind = file.blocks[i][4], bb = blockBytes(file, i);
      if (kind === 'r') { parts.push(readRawBlock(S.zdec, bb)); continue; }
      rows = (kind === 'f' ? rf : rn).readBlock(bb); ex = exc[i] || {}; sp = spell[i] || {}; last = 0;
      for (j = 0; j < rows.length; j++) parts.push(ex[j] ? ex[j] : te.encode(sp[j] ? respell(JSON.stringify(rows[j]), sp[j]) : JSON.stringify(rows[j])), nl);
    }
    var out = concat(parts); if (flags.tail === false && out.length && file.blocks[file.blocks.length - 1][4] !== 'r') out = out.subarray(0, out.length - 1);
    return out;
  }
  function openFile(bytes) {
    need(false); bytes = bytesOf(bytes);
    var f = readFooter(S.zdec, bytes), blocks = jsonSec(f.sec[SEC_BLOCKS]);
    if (!blocks) throw new Error('damaged file: block table missing');
    return { bytes: bytes, footer: f, blocks: blocks, header: jsonSec(f.sec[SEC_HEADER]), zone: jsonSec(f.sec[SEC_ZONE]), meta: jsonSec(f.sec[SEC_META]) };
  }
  // the shared tables of nested blocks (section 16, written with { share: true }), parsed once per opened file; null when the file has none
  function sharedOf(file) {
    if (file.shared !== undefined) return file.shared;
    var t = jsonSec(file.footer.sec[SEC_SHARED]) || null, i;
    if (t) {
      if (!Array.isArray(t.s) || !Array.isArray(t.k)) throw new Error('damaged file: shared tables');
      for (i = 0; i < t.s.length; i++) if (typeof t.s[i] !== 'string') throw new Error('damaged file: shared tables');
      for (i = 0; i < t.k.length; i++) if (typeof t.k[i] !== 'string') throw new Error('damaged file: shared tables');
    }
    return (file.shared = t);
  }
  // pack options: { access: 'random' } is the read-friendly preset (256 KB blocks of input and shared tables, so that reading a few rows decodes little; per-path strings are on by default anyway); options given next to it win
  function packOpts(opts) {
    opts = opts || {};
    if (opts.access === undefined || opts.access === 'whole') return opts;
    if (opts.access !== 'random') throw new Error('LfcPack: access must be \'random\' or \'whole\'');
    var o = {}, k; for (k in opts) o[k] = opts[k];
    if (o.blockBytes === undefined) o.blockBytes = 262144;
    if (o.share === undefined) o.share = true;
    return o;
  }
  // block checksum: the CRC-32 loop inside the zstd WebAssembly module when it is loaded (slicing by 8; both the full and the read-only build have it); the plain JavaScript loop otherwise or for small blocks
  function crcOf(x) { return S.zdec && S.zdec.crc32 && x.length >= 4096 ? S.zdec.crc32(x) : crcJS(x, 0); }
  var RX_X64 = /^[0-9a-f]{16}$/;
  // block table entry: [offset, length, crc32, rows, kind, table] and, with { check: 'xxh64' } (needs init()), a seventh item: the XXH64 of the block as 16 hex digits, and for flat blocks an eighth: [length of the part before the column frames, its XXH64]
  function blockEntry(opts, off, bytes, rows, kind, ti, prefix) {
    var e = [off, bytes.length, crcOf(bytes), rows, kind, ti];
    if (opts && opts.check === 'xxh64') { if (!S.zdec || !S.zdec.xxh64) throw new Error('LfcPack: check xxh64 needs init() first'); e.push(hash(bytes, 'xxh64')); if (typeof prefix === 'number') e.push([prefix, hash(bytes.subarray(0, prefix), 'xxh64')]); }
    return e;
  }
  // flat block read for some columns only: when the block table has item 8 and the prefix checks out, the block is not checked as a whole (flatFrames checks the wanted columns); null otherwise
  function partialBytes(file, i) {
    var b = file.blocks[i], q = b[7], x = file.bytes.subarray(b[0], b[0] + b[1]);
    if (b[4] !== 'f' || !Array.isArray(q) || typeof q[0] !== 'number' || typeof q[1] !== 'string' || !RX_X64.test(q[1]) || !S.zdec || !S.zdec.xxh64 || q[0] < 0 || q[0] > b[1] || b[0] + b[1] > file.footer.bodyEnd) return null;
    if (hash(x.subarray(0, q[0]), 'xxh64') !== q[1]) throw new Error('block ' + i + ' checksum mismatch');
    return x;
  }
  function blockBytes(file, i) {
    var b = file.blocks[i], x = file.bytes.subarray(b[0], b[0] + b[1]);
    if (b[0] + b[1] > file.footer.bodyEnd) throw new Error('block ' + i + ' out of range');
    if (typeof b[6] === 'string' && RX_X64.test(b[6]) && S.zdec && S.zdec.xxh64 ? hash(x, 'xxh64') !== b[6] : crcOf(x) !== b[2]) throw new Error('block ' + i + ' checksum mismatch');
    return x;
  }
  function rawRows(t) { return tdr.decode(t).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return JSON.parse(l); }); }
  // zone maps: a block is skipped when the number column for opts.range.key has no value inside [min, max]
  function blockMayMatch(file, i, range) {
    if (!range || !file.zone || !file.zone[i]) return true;
    var h = fnvStr('.' + range.key), z = file.zone[i], q;
    for (q = 0; q < z.length; q++) if (z[q][0] === h) return !(z[q][2] < range.min || z[q][1] > range.max);
    return true;
  }
  function keepRows(rows, range) {
    if (!range) return rows;
    var out = [], i, v; for (i = 0; i < rows.length; i++) { v = rows[i][range.key]; if (typeof v === 'number' && v >= range.min && v <= range.max) out.push(rows[i]); }
    return out;
  }
  function projectRows(rows, want) {
    var out = new Array(rows.length), i, k, o; for (i = 0; i < rows.length; i++) { o = {}; for (k in want) if (Object.prototype.hasOwnProperty.call(rows[i], k)) setKey(o, k, rows[i][k]); out[i] = o; }
    return out;
  }
  // unpack(bytes, { keys: ['ts', 'ms'], range: { key: 'ts', min: 10, max: 20 } }): only those keys, only rows whose number is in range; blocks outside the range are never decoded
  function unpack(bytes, opts) {   // -> array of row objects
    if (opts) return unpackSome(bytes, opts);
    var file = openFile(bytes), rn = makeNestedReader(S.zdec, sharedOf(file)), rf = makeFlatReader(S.zdec), out = [], i, r, j, kd;
    for (i = 0; i < file.blocks.length; i++) { kd = file.blocks[i][4]; r = kd === 'r' ? rawRows(readRawBlock(S.zdec, blockBytes(file, i))) : (kd === 'f' ? rf : rn).readBlock(blockBytes(file, i)); for (j = 0; j < r.length; j++) out.push(r[j]); }
    return out;
  }
  function unpackSome(bytes, opts) {
    var file = openFile(bytes), rn = makeNestedReader(S.zdec, sharedOf(file)), rf = makeFlatReader(S.zdec), out = [], i, j, r, kd, want = null, range = opts.range || null;
    rf.generated(opts.rows === 'generated');
    if (opts.keys) { want = {}; for (i = 0; i < opts.keys.length; i++) want[opts.keys[i]] = 1; if (range) want[range.key] = 1; }
    for (i = 0; i < file.blocks.length; i++) {
      if (opts.table != null && (file.blocks[i][5] || 0) !== opts.table) continue;
      if (!blockMayMatch(file, i, range)) continue;
      kd = file.blocks[i][4];
      if (kd === 'r') r = rawRows(readRawBlock(S.zdec, blockBytes(file, i))); else if (kd === 'f') { var pbk = want ? partialBytes(file, i) : null; r = rf.readBlock(pbk || blockBytes(file, i), want, !!pbk); } else r = rn.readBlock(blockBytes(file, i));
      if (want && kd !== 'f') r = projectRows(r, want);
      r = keepRows(r, range);
      if (opts.keys && range && opts.keys.indexOf(range.key) < 0) r = projectRows(r, (function () { var w = {}; opts.keys.forEach(function (k) { w[k] = 1; }); return w; })());
      for (j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }
  // unpackColumns(bytes, { keys }): flat-row blocks come back as typed columns, no row objects (experimental): [{ n, keys, cols, present }] one entry per block; other block kinds throw
  function unpackColumns(bytes, opts) {
    var file = openFile(bytes), rf = makeFlatReader(S.zdec), out = [], i, want = null, k;
    opts = opts || {}; if (opts.keys) { want = {}; for (k = 0; k < opts.keys.length; k++) want[opts.keys[k]] = 1; }
    for (i = 0; i < file.blocks.length; i++) { if (file.blocks[i][4] !== 'f') throw new Error('LfcPack: unpackColumns needs flat-row blocks'); { var pbc = want ? partialBytes(file, i) : null; out.push(rf.columnsOf(pbc || blockBytes(file, i), want, !!pbc)); } }
    return out;
  }
  // the object packTables was given: arrays come back as arrays of rows, other values as they were
  function unpackTables(bytes, opts) {
    var file = openFile(bytes), t = (file.header && file.header.tables) || [['', 'rows']], out = {}, i, r;
    for (i = 0; i < t.length; i++) { r = unpackSome(file.bytes, Object.assign({}, opts || {}, { table: i })); out[t[i][0]] = t[i][1] === 'value' ? (r.length ? r[0].v : null) : r; }
    return out;
  }
  function metadata(bytes) { var m = openFile(bytes).meta; return m === undefined ? null : m; }   // the metadata object the file was packed with (opts.meta), or null; reads the footer only
  // unpackRows(bytes, { from, count, table }): the rows from..from+count-1 (of the table, default the first) without decoding blocks outside that range. Files with raw blocks (their block row count includes blank lines) are read whole and cut.
  function unpackRows(bytes, opts) {
    opts = opts || {}; var from = opts.from || 0, count = opts.count == null ? Infinity : opts.count, file = openFile(bytes), tb = opts.table || 0, i, kd, start = 0, out = [], r, b, lo, hi, rn, rf;
    for (i = 0; i < file.blocks.length; i++) if (file.blocks[i][4] === 'r') return unpackSome(bytes, { table: tb }).slice(from, count === Infinity ? undefined : from + count);
    rn = makeNestedReader(S.zdec, sharedOf(file)); rf = makeFlatReader(S.zdec);
    for (i = 0; i < file.blocks.length && out.length < count; i++) {
      b = file.blocks[i]; if ((b[5] || 0) !== tb) continue;
      if (start + b[3] > from) { kd = b[4]; lo = Math.max(0, from - start); hi = Math.min(b[3], lo + (count - out.length)); if (kd === 'f') { r = rf.readRange(blockBytes(file, i), lo, hi); for (lo = 0; lo < r.length; lo++) out.push(r[lo]); } else { r = rn.readBlock(blockBytes(file, i)); hi = Math.min(r.length, hi); for (; lo < hi; lo++) out.push(r[lo]); } }
      start += b[3];
    }
    return out;
  }
  // stats(bytes): what the footer and the block headers say, without decoding any column: [{ kind, rows, table, keys: [{ key, type, n, distinct?, nulls? }] }] (keys only for flat blocks)
  function stats(bytes) {
    var file = openFile(bytes), rf = makeFlatReader(S.zdec), out = [], i, b, o;
    for (i = 0; i < file.blocks.length; i++) { b = file.blocks[i]; o = { kind: b[4], rows: b[3], table: b[5] || 0 }; if (b[4] === 'f') o.keys = flatMeta(S.zdec, blockBytes(file, i)); out.push(o); }
    return out;
  }
  function info(bytes) { var f = openFile(bytes); return { rows: f.header.rows, blocks: f.blocks.length, size: f.bytes.length, major: f.footer.major, minor: f.footer.minor }; }
  // ---- streaming pack: packStream({ blockBytes }) -> { push(bytes) -> [Uint8Array blocks ready to write], finish() -> [last blocks + footer] }. The output parts joined are the same bytes pack() gives for the same text and blockBytes; only one block of text is held at a time. Value-exact mode only.
  function packStream(opts) {
    opts = packOpts(opts); need(true);
    if (opts.exact) throw new Error('LfcPack: packStream does not support exact mode yet');
    var st = opts.share ? sharedState() : null, mopts = st ? Object.assign({}, opts, { _st: st }) : opts;
    var bb = opts.blockBytes || BLOCK_BYTES, buf = new Uint8Array(0), blocks = [], zone = [], off = 0, rows = 0, tail = true, done = false;
    function cut(chunk) {   // one chunk of whole lines -> its block bytes, with the table entries moved to this file's offsets
      var mini = packMany([{ name: null, bytes: chunk }], mopts), f = openFile(mini), out = [], i, b, e;
      for (i = 0; i < f.blocks.length; i++) {
        b = f.blocks[i]; e = mini.subarray(b[0], b[0] + b[1]);
        blocks.push([off].concat(b.slice(1, 5), 0, b.slice(6))); zone.push(f.zone[i] || []); off += b[1]; rows += b[3]; out.push(e);
      }
      return out;
    }
    function take(final) {
      var out = [], e, nl;
      while (buf.length) {
        if (buf.length > bb && (nl = buf.indexOf(10, bb)) >= 0) e = nl + 1; else if (final) e = buf.length; else break;
        out = out.concat(cut(buf.subarray(0, e))); buf = buf.subarray(e);
      }
      return out;
    }
    return {
      push: function (bytes) {
        if (done) throw new Error('LfcPack: packStream is finished');
        bytes = bytesOf(bytes); if (!bytes.length) return [];
        var nb = new Uint8Array(buf.length + bytes.length); nb.set(buf); nb.set(bytes, buf.length); buf = nb; tail = bytes[bytes.length - 1] === 10;
        return take(false);
      },
      finish: function () {
        if (done) throw new Error('LfcPack: packStream is finished');
        done = true; var out = take(true);
        out.push(writeFooter(S.zfull, [
          { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' })) },
          { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
          { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
          { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false, tail: tail })) }].concat(metaSecs(opts), st && st.used ? [sharedSection(st)] : []), true));
        return out;
      }
    };
  }
  // hash(bytes, kind): 'crc32' (default; the number the file's checksums use) or 'xxh64' (16 lowercase hex digits); WebAssembly when init() has run, plain JavaScript for crc32 otherwise
  function hash(bytes, kind) {
    kind = kind || 'crc32'; if (!(bytes instanceof Uint8Array)) throw new Error('LfcPack: hash needs a Uint8Array');
    if (kind === 'crc32') return S.zdec && S.zdec.crc32 ? S.zdec.crc32(bytes) : crcJS(bytes, 0);
    if (kind !== 'xxh64') throw new Error('LfcPack: unknown hash ' + kind);
    if (!S.zdec || !S.zdec.xxh64) throw new Error('LfcPack: xxh64 needs init() first');
    var h = S.zdec.xxh64(bytes); return (h[1] + 4294967296).toString(16).slice(1) + (h[0] + 4294967296).toString(16).slice(1);
  }
  var api = { trim: trim, _trimPacker: trimPacker, _helperTrimMs: function (ms) { HELPER_TRIM_MS = ms; }, _autoTrimMs: function (ms) { AUTO_TRIM_MS = ms; if (S.idle) { clearTimeout(S.idle); S.idle = null; } }, hash: hash, unpackColumns: unpackColumns, packRows: packRows, packTables: packTables, unpackTables: unpackTables, pool: function (o) { return init({ readOnly: true }).then(function () { return makePool(o); }); }, _job: function (m) { return runJob(m); }, init: init, pack: pack, packParallel: packParallel, warmPack: warmPack, packStream: packStream, unpack: unpack, info: info, metadata: metadata, unpackRows: unpackRows, stats: stats, unpackText: unpackText, version: '0.4.5', apiVersion: 0 };
