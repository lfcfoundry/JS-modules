// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ public API
  var BLOCK_BYTES = 13 << 20;
  // B22 (0.10.2): a save of more than HEAD_MIN bytes of row text (with big blocks) cuts its FIRST block at the first line end at or after HEAD_BYTES, so a viewer shows rows at once; the rest use the normal block size. Writer only: same rows, same format.
  var HEAD_MIN = 4 << 20, HEAD_BYTES = 65536;
  function headOn(total, bb) { return total > HEAD_MIN && bb > HEAD_MIN; }
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
    dropDeltaBase();
    if (S.zfull) { S.zfull = makeZstd(loadSync('zstd-full')); S.zdec = S.zfull; } else if (S.zdec) S.zdec = makeZstd(loadSync('zstd-dec'));
    trimPacker(); arenaDrop(); WA.est = WA.want = 0;   // the fresh decoder sizes its frame buffer from the next block, not from older big ones
  }
  // the packer's memory only (the tokenizer and string dictionary, which holds most of what a pack grows): the zstd memory stays, so the next job does not grow it again.
  // Pack helpers can do this when they go idle (pool.js, _helperTrimMs); by default they keep it until they close 3 s after the last call, since growing it again cost every call 7 to 25%.
  function trimPacker() {
    if (S.idle) { clearTimeout(S.idle); S.idle = null; }
    if (S.core) { S.core = loadSync(coreName()); S.sh.rebind(S.core); }
    RS = null;   // rowscan uses the tokenizer's memory: let the old memory go with it
    dropSmallWasm();
  }
  function need(w) { if (w && !S.sh) throw new Error('LfcPack: call init() first'); if (!S.zdec) throw new Error('LfcPack: call init({readOnly:true}) or init() first'); }
  function pack(input, opts) { return packMany([{ name: null, bytes: bytesOf(input) }], packOpts(opts)); }
  // ---- row objects in, bytes out (no NDJSON text needed); packTables keeps several named tables and plain values in one file
  function rowsText(rows) { var o = new Array(rows.length), i; for (i = 0; i < rows.length; i++) o[i] = JSON.stringify(rows[i]); return o.length ? o.join('\n') + '\n' : ''; }
  // rowsBytes: the same bytes as te.encode(rowsText(rows)), from one JSON.stringify of the whole array; rowscan.wasm turns its top-level commas into line ends.
  // The text is encoded straight into the tokenizer's input buffer (memory the pack touches next anyway), so no extra memory is held.
  // Rows that JSON.stringify writes differently inside an array (undefined, functions, symbols, a toJSON that reads its key) keep the per-row path.
  var RSB64 = "/*RS:BEGIN*//*RS:END*/", RS = null;
  function rowsBytes(rows) {
    var n = rows.length, i, r, t;
    if (!n) return new Uint8Array(0);
    for (i = 0; i < n; i++) { r = rows[i]; t = typeof r; if (t === 'undefined' || t === 'function' || t === 'symbol' || (r !== null && t === 'object' && typeof r.toJSON === 'function')) return te.encode(rowsText(rows)); }
    // the buffer may grow only as far as one block would grow it (or already is), so a big table does not leave the tokenizer holding more memory
    var j = JSON.stringify(rows), X = S.sh && S.sh.x, ip = X ? X.in_reserve(16) : 0, mem = ip ? S.sh.mem : null, room = ip ? Math.max(mem.buffer.byteLength - ip - 16, BLOCK_BYTES + (BLOCK_BYTES >> 2)) : 0, w;
    if (j.length > room || !X.in_reserve(j.length + 16)) return rowsScanJs(te.encode(j));
    w = te.encodeInto(j, new Uint8Array(mem.buffer, ip, j.length + 16));
    if (w.read < j.length) {   // not all ASCII: room for the longest UTF-8 form
      if (j.length * 3 > room || !X.in_reserve(j.length * 3 + 16)) return rowsScanJs(te.encode(j));
      w = te.encodeInto(j, new Uint8Array(mem.buffer, ip, j.length * 3 + 16));
    }
    if (!MODS['RSB64']) MODS['RSB64'] = new WebAssembly.Module(fromB64(RSB64));
    if (!RS || RS.m !== mem) RS = { m: mem, x: new WebAssembly.Instance(MODS['RSB64'], { env: { memory: mem } }).exports };
    RS.x.scan(ip, w.written);
    return new Uint8Array(mem.buffer, ip + 1, w.written - 1).slice();
  }
  function rowsScanJs(b) {   // the same scan in JavaScript (an input too big for the tokenizer buffer)
    var e = b.length - 1, d = 0, c, i;
    for (i = 1; i < e; i++) {
      c = b[i];
      if (c === 34) { for (i++; (c = b[i]) !== 34; i++) if (c === 92) i++; }
      else if (c === 123 || c === 91) d++;
      else if (c === 125 || c === 93) d--;
      else if (c === 44 && d === 0) b[i] = 10;
    }
    b[e] = 10; return b.subarray(1);
  }
  var B26 = !(typeof globalThis !== 'undefined' && globalThis.__B26 === 0);
  function packRows(rows, opts) { var po = packOpts(opts), pay;
    if (B26 && !po.exact && !po.block && !po.share && rows.length > 4096 && flatScalars(rows.length > 2048 ? rows.slice(0, 1024).concat(rows.slice(-1024)) : rows) && (pay = b18Pays(rows))) {   // B26: the row scatter checks the rest
      try { return packManyNow([{ name: null, rowsArr: rows, bytes: new Uint8Array(0) }], Object.assign({}, po, { _b26: 1, _hb: pay === 2 })); } catch (e) { if (e !== B26_BAIL) throw e; return pack(rowsBytes(rows), opts); } }
    if (!B26 && !po.exact && !po.block && !po.share && rows.length > 4096 && flatScalars(rows) && (pay = b18Pays(rows))) return packManyNow([{ name: null, rowsArr: rows, bytes: new Uint8Array(0) }], Object.assign({}, po, { _hb: pay === 2 })); return pack(rowsBytes(rows), opts); }
  // B18b gate (Chromium 156 sweep on 0.9.3, 15 files): the row path wins when the rows would make more than 16 MB of text (the text path then leaves the wasm scanner), or when fewer than 40% of the cells are strings; string-heavy tables under 16 MB pack faster through the wasm text scanner (1.1 to 1.5 times slower otherwise)
  function b18Pays(rows) { var n = rows.length, k = Math.min(1024, n), est = JSON.stringify(rows.slice(0, k)).length / k * n, i, r, c = 0, st = 0;
    if (est > 16 * 1048576) return true;
    var seen = {}, v, sk, all = 0;   // P13i: what slows the row path is many different strings (the wasm text scanner makes those faster; logs with long unique strings were 1.29-1.38x on laptop Chrome 157 and Firefox 160); repeated labels are quicker on the row path in all three engines, so the share counted is of strings seen for the first time under their key
    for (i = 0; i < Math.min(256, n); i++) { r = rows[i]; for (var q in r) { c++; v = r[q]; if (typeof v === 'string') { all++; sk = seen[q] || (seen[q] = new Map()); if (!sk.has(v)) { sk.set(v, 1); st++; } } } }
    return st >= c * 0.4 ? false : all >= c * 0.4 ? 2 : true; }   // 2: the row path, for a table the 0.10.8 rule sent to the text path (it keeps that path's B22 head block)
  // B18b: true when every row is a plain object whose values are strings, booleans, null or finite numbers other than -0 (so JSON.stringify would write each value as is and keep every key)
  function flatScalars(rows) { var i, r, k, v, t, P = Object.prototype; for (i = 0; i < rows.length; i++) { r = rows[i]; if (r === null || typeof r !== 'object' || Array.isArray(r)) return false; t = Object.getPrototypeOf(r); if (t !== P && t !== null) return false;
    for (k in r) { v = r[k]; t = typeof v; if (t === 'number') { if (v !== v || v === Infinity || v === -Infinity || (v === 0 && 1 / v < 0)) return false; } else if (t !== 'string' && t !== 'boolean' && v !== null) return false; } } return true; }
  function packTables(obj, opts) {
    var names = Object.keys(obj), inputs = [], i, v;
    for (i = 0; i < names.length; i++) {
      v = obj[names[i]];
      if (Array.isArray(v)) inputs.push({ name: names[i], kind: 'rows', bytes: rowsBytes(v) });
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
  // paths: 'auto' pick from a sample: the first PATHS_SAMPLE bytes of the input packed with per-path strings everywhere and with none; the smaller wins.
  // pack() and packParallel() both pick this way before any block is made, so they write the same bytes with no second try
  var PATHS_RULE = true, PATHS_SAMPLE = 0;   // off: a 128 KB sample picked wrong on some data (see PATHS-PICK.md); the trial decides
  function samplePick(b, opts) {
    var e = b.length > PATHS_SAMPLE ? b.indexOf(10, PATHS_SAMPLE) : -1, sb = e < 0 ? b : b.subarray(0, e + 1), o = {}, k;
    for (k in opts) if (k !== 'share' && k !== '_st' && k !== 'timing' && k !== 'workers') o[k] = opts[k];
    o._pick = 1; o.paths = 'only'; var a1 = packManyNow([{ name: null, bytes: sb }], o).length;
    o.paths = false; var a0 = packManyNow([{ name: null, bytes: sb }], o).length;
    return a1 <= a0 ? 1 : 0;
  }
  function packManyNow(inputs, opts) {
    opts = opts || {}; need(true);
    var ti, b, bb = opts.blockBytes || BLOCK_BYTES, p, blocks = [], parts = [], zone = [], eqf = [], eqAny = false, off = 0, rows = 0, tail = true, nm0 = NMARK;
    var exact = !!opts.exact, st = opts.share && !exact ? (opts._st || sharedState()) : null, ctx = { zs: S.zfull, sh: S.sh, st: st, paths: opts.paths === 'only' ? 'only' : opts.paths !== false, pick: opts._pick }, exc = {}, spl = {}, fatal = new TextDecoder('utf-8', { fatal: true });
    var retry = [], s0, e, chunk, kind, blk, ex, fb, r0, mid;
    // paths: 'auto' (opt-in): an input of PATHS_TRY blocks or more picks the string layout of its big nested blocks from a 128 KB sample (samplePick)
    // (real FHIR records: 13% smaller and about 22% faster without per-path strings); a shorter input keeps per-path strings.
    // With PATHS_SAMPLE = 0 the first big nested block is built both ways instead (the trial, kept for comparison)
    if (ctx.pick == null && opts.paths !== 'auto' && !PATHS_RULE) ctx.pick = 1;   // without the rule the pick is opt-in: paths: 'auto'
    if (ctx.pick == null && opts.paths !== false && opts.paths !== 'only' && PATHS_RULE) ctx.pick = 2;   // since 0.4.6 by default: each big block judges by itself (dupShare), no trial
    if (ctx.pick == null && !opts._tryFirst) { for (ti = 0, mid = 0; ti < inputs.length; ti++) mid += inputs[ti].bytes.length; ctx.pick = mid < PATHS_TRY * bb ? 1 : (typeof PATHS_SAMPLE !== 'undefined' && PATHS_SAMPLE > 0 ? samplePick(inputs[0].bytes, opts) : null); mid = undefined; }
    for (ti = 0; ti < inputs.length; ti++) {
    if (inputs[ti].rowsArr) {   // B18b: row objects, in slices of about one block of text
      var RA = inputs[ti].rowsArr, est = JSON.stringify(RA.slice(0, 1024)).length / Math.min(1024, RA.length) + 1, stp = Math.max(1024, Math.floor(bb / est)), ra, sl, cnt;
      var hb0 = opts._hb && headOn(est * RA.length, bb) ? Math.max(1, Math.ceil(HEAD_BYTES / est)) : 0;   // P13i: the B22 head block for tables that took the text path before
      for (ra = 0, cnt = hb0 || stp;   /* B22 is for the text path: a head block on row saves made the first saves 1.2x slower (10 MB table, Chromium) */ ra < RA.length; ra += cnt, cnt = stp) { sl = RA.slice(ra, ra + cnt); blk = writeFlatBlock(ctx, { rowsIn: sl }, opts); if (!blk) return packManyNow([{ name: inputs[ti].name, bytes: rowsBytes(RA) }], opts); if (blk.rows <= B39_ROWS && ra === 0 && sl.length === RA.length && inputs.length === 1) { blk = b39Small(ctx, blk, sl, opts, st); if (blk.kind === 'r') NMARK = nm0; }
        blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, blk.kind || 'n', ti)); zone.push(blk.zone); var eqb = blk.kind === 'f' ? eqOf(blk) : 0; eqf.push(eqb); if (eqb) eqAny = true; parts.push(blk.bytes); off += blk.bytes.length; rows += blk.rows; }
      tail = true; continue;
    }
    b = inputs[ti].bytes; p = 0; var hd = !opts._nohead && headOn(b.length, bb); tail = b.length === 0 || b[b.length - 1] === 10; retry.length = 0;
    while (retry.length || p < b.length) {
      if (retry.length) { r0 = retry.pop(); s0 = r0[0]; e = r0[1]; }
      else { s0 = p; e = Math.min(b.length, p + (hd ? HEAD_BYTES : bb)); hd = false; if (e < b.length) { var nl = b.indexOf(10, e); e = nl < 0 ? b.length : nl + 1; } p = e; }
      chunk = b.subarray(s0, e); kind = opts.block; blk = null; if (st) st.j = null;
      if (exact && !exactSafe(chunk, fatal)) { blk = writeRawBlock(ctx.zs, chunk, opts); blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, 'r', ti)); zone.push([]); eqf.push(0); parts.push(blk.bytes); off += blk.bytes.length; rows += blk.rows; continue; }
      try {
        // auto: big blocks whose first rows are all flat objects go straight to the flat layout (it won on every flat-object set measured, and skipping the nested pass saves about 30% of pack time)
        if ((!kind || kind === 'flat') && !exact) { blk = writeFlatBlockFast(ctx, chunk, kind ? opts : Object.assign({}, opts, { noLists: true })); if (blk && blk.k67 && !kind && !(chunk.length > 262144 && looksFlat(chunk))) blk = null; if (blk) kind = 'flat'; }   // a block the fast writer kept only through the per-column fallback goes the old way when auto would have compared it with the nested layout, so the same layout wins   // auto leaves rows with list columns to the nested layout (lists read faster there); { block: 'flat' } takes them
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
      if (!exact && s0 === 0 && e === b.length && inputs.length === 1 && !retry.length) { blk = b39Small(ctx, blk, chunk, opts, st); if (blk.kind === 'r') NMARK = nm0; }
      if (exact) { ex = exceptionsOf(blk, chunk, blk.kind || 'n'); if (ex) { if (ex.raw.length) exc[blocks.length] = ex.raw; if (ex.spell.length) spl[blocks.length] = ex.spell; } }
      blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, blk.kind || 'n', ti, blk.kind === 'f' ? blk.prefix : undefined)); zone.push(blk.zone); var eqb = blk.kind === 'f' ? eqOf(blk) : 0; eqf.push(eqb); if (eqb) eqAny = true; parts.push(blk.bytes);
      off += blk.bytes.length; rows += blk.rows;
    }
    }
    if (opts._eqout) for (var eqi = 0; eqi < eqf.length; eqi++) opts._eqout.push(eqf[eqi]);   // a helper's run: the caller joins the filters
    var eqs = null; if (eqAny && blocks.length > 1) { var eqr = eqRegion(eqf), eqz = S.zfull.compress(eqr, 3), eqn = 0; if (eqz.length < eqr.length) { eqn = eqr.length; eqr = eqz; } parts.push(eqr); eqs = { id: SEC_EQF, flags: 0, payload: te.encode(JSON.stringify([off, eqr.length, crcJS(eqr, 0), eqn])) }; }   // NX A
    var secs = [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify(inputs[0].name === null ? { rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' } : { rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.1', tables: inputs.map(function (x) { return [x.name, x.kind]; }) })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: exact, tail: tail })) }
    ];
    if (blocks.length === 1 && rows < 100 && !opts._piece) secs.splice(2, 1);   // B39: a one-block table under 100 rows skips the zone maps (60-200 bytes; with one block they never skip anything)
    if (eqs) secs.push(eqs);
    secs = secs.concat(metaSecs(opts));
    if (st && !opts._st && st.used) secs.push(sharedSection(st));
    if (exact && Object.keys(exc).length) secs.push(excSection(exc));
    if (exact && Object.keys(spl).length) secs.push(spellSection(spl));
    parts.push(writeFooter(S.zfull, secs, true, NMARK > nm0 ? 1 : 0));
    if (opts._tryFirst) opts._picked = ctx.pick;
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
  // B39 (research): the only block of a table of at most B39_ROWS rows (flat or nested) is stored as a raw block (the row text in one zstd frame) when that is smaller: under about 20-50 rows the per-column description and frames cost more than they save
  var B39_ROWS = 32, B39_LEVEL = 3;
  function b39Small(ctx, blk, text, opts, st) {
    if (opts._piece || opts.block || st || !blk || ((blk.kind || 'n') !== 'f' && (blk.kind || 'n') !== 'n') || blk.rows > B39_ROWS) return blk;
    // the raw text keeps every row's keys in the block's key order (first seen), so rows read back exactly as the flat block gives them (key order included);
    // a row already in that order keeps its own text (or JSON.stringify for row input), only rows in another order are written again (text rows with an integer-like key too: JavaScript lists those first, and the text must read back in that order)
    var isText = typeof text === 'string' || ArrayBuffer.isView(text), src = isText ? tdr.decode(text).split('\n').filter(function (l) { return l.trim(); }) : null, rows = isText ? src.map(function (l) { return JSON.parse(l); }) : text, K = [], seen = Object.create(null), i, k, j, q, lines = new Array(rows.length);
    var bad = [], v, p;   // one pass: the key order (first seen, positions in seen), and the rows whose text must be written again (another key order; for row input also -0, Infinity, NaN or an object value, which JSON.stringify would not keep)
    for (i = 0; i < rows.length; i++) { var r = rows[i], last = -1, ok = true; if (!r || typeof r !== 'object' || Array.isArray(r)) return blk;
      for (k in r) { if (k === '__proto__') return blk; if (isText && ok && k.charCodeAt(0) < 58 && /^(0|[1-9][0-9]*)$/.test(k)) ok = false; p = seen[k]; if (p === undefined) { p = seen[k] = K.length; K.push(k); } if (p < last) ok = false; last = p;
        if (!isText) { v = r[k]; if (typeof v === 'number' ? (v === 0 && 1 / v < 0) || v !== v || v === Infinity || v === -Infinity : v !== null && typeof v === 'object') ok = false; } }
      if (ok) lines[i] = isText ? src[i] : JSON.stringify(r); else bad.push(i); }
    for (q = 0; q < bad.length; q++) { i = bad[q]; var r = rows[i];
      var parts = []; for (j = 0; j < K.length; j++) if (Object.prototype.hasOwnProperty.call(r, K[j]) && r[K[j]] !== undefined) { var jv = b39Json(r[K[j]]); if (jv === null) return blk; parts.push(JSON.stringify(K[j]) + ':' + jv); }
      lines[i] = '{' + parts.join(',') + '}'; }
    var raw = writeRawBlock(ctx.zs, te.encode(lines.join('\n') + '\n'), opts.level == null ? Object.assign({}, opts, { level: B39_LEVEL }) : opts);   // level 3: level 19 made tiny saves 4 to 17 times slower in browsers
    return raw.rows === blk.rows && raw.bytes.length < blk.bytes.length ? { bytes: raw.bytes, rows: raw.rows, kind: 'r', zone: [] } : blk;
  }
  function b39Json(v) {   // JSON text that parses back to the same value, -0 included; null (skip the raw block) for a number JSON cannot hold
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : isFinite(v) ? JSON.stringify(v) : null;
    if (v && typeof v === 'object') { var p = [], q, x;
      if (Array.isArray(v)) { for (q = 0; q < v.length; q++) { x = b39Json(v[q]); if (x === null) return null; p.push(x); } return '[' + p.join(',') + ']'; }
      for (q in v) if (Object.prototype.hasOwnProperty.call(v, q) && v[q] !== undefined) { x = b39Json(v[q]); if (x === null) return null; p.push(JSON.stringify(q) + ':' + x); } return '{' + p.join(',') + '}'; }
    return v === undefined ? null : JSON.stringify(v);
  }
  // B39: unpackColumns on a raw block builds the same column form a flat block gives: Int32Array or Float64Array for number-only keys, a plain array otherwise, and a presence bitmap when some rows lack the key
  function b39Cols(rows, want) {
    var keys = [], seen = {}, i, k, j, n = rows.length, cols = {}, present = {};
    for (i = 0; i < n; i++) for (k in rows[i]) if (!seen[k] && (!want || want[k])) { seen[k] = 1; keys.push(k); }
    for (j = 0; j < keys.length; j++) { k = keys[j]; var v = [], pr = new Uint8Array((n + 7) >> 3), all = true, num = true, int = true, x;
      for (i = 0; i < n; i++) { if (Object.prototype.hasOwnProperty.call(rows[i], k)) { x = rows[i][k]; pr[i >> 3] |= 1 << (i & 7); v.push(x); if (typeof x !== 'number') num = false; else if (!(x === (x | 0)) || Object.is(x, -0)) int = false; } else all = false; }
      cols[k] = num && v.length ? (int ? Int32Array.from(v) : Float64Array.from(v)) : v; if (!all) present[k] = pr; }
    return { n: n, keys: keys, cols: cols, present: present };
  }
  function readRawBlock(zs, bytes) { return zs.decompress(bytes.subarray(4), rd32(bytes, 0)); }
  function unpackText(bytes) {   // -> Uint8Array: the NDJSON text. Byte-for-byte the input when the file was packed with { exact: true }; canonical JSON text per row otherwise
    var file = openFile(bytes), rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), flags = jsonSec(file.footer.sec[SEC_FLAGS]) || {}, exc = readExc(file.footer.sec[SEC_RAW]), spell = readSpell(file.footer.sec[SEC_SPELL]), sp, parts = [], i, j, rows, ex, last, nl = new Uint8Array([10]);
    for (i = 0; i < file.blocks.length; i++) {
      var kind = file.blocks[i][4], bb = blockBytes(file, i);
      if (kind === 'r') { parts.push(readRawBlock(S.zdec, bb)); continue; }
      rows = (kind === 'f' ? rf : rn).readBlock(bb); ex = exc[i] || {}; sp = spell[i] || {}; last = 0;
      var buf = []; for (j = 0; j < rows.length; j++) { if (ex[j]) { if (buf.length) { parts.push(te.encode(buf.join('\n') + '\n')); buf = []; } parts.push(ex[j], nl); } else { buf.push(sp[j] ? respell(JSON.stringify(rows[j]), sp[j]) : JSON.stringify(rows[j])); if (buf.length >= 1024) { parts.push(te.encode(buf.join('\n') + '\n')); buf = []; } } } if (buf.length) parts.push(te.encode(buf.join('\n') + '\n'));   // text for 1,024 rows is encoded in one call (was one encode and two parts per row: 1,043 ms to 475 ms for 200,000 log rows in Chromium)
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
  function rawRows0(x) { return x.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return JSON.parse(l); }); }
  // NX B: a raw block whose text has no backslash writes every string as itself, so a string value whose JSON text is absent is in no row
  function rawMiss(tx, eq) { if (tx.indexOf('\\') >= 0) return false; var vs = eq.anyOf || [eq.value], i, t; for (i = 0; i < vs.length; i++) { if (typeof vs[i] !== 'string') return false; t = JSON.stringify(vs[i]); if (t.indexOf('\\') >= 0 || tx.indexOf(t) >= 0) return false; } return true; }
  function rawRows(t) { return tdr.decode(t).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return JSON.parse(l); }); }
  // zone maps: a block is skipped when the number column for opts.range.key has no value inside [min, max]
  function blockMayMatch(file, i, range) {
    if (!range || !file.zone || !file.zone[i]) return true;
    var h = fnvStr('.' + range.key), z = file.zone[i], q;
    for (q = 0; q < z.length; q++) if (z[q][0] === h) return !(z[q][2] < range.min || z[q][1] > range.max);
    return true;
  }
  function blockInside(file, i, range) {   // every number under range.key in block i is inside [min, max] (zone map), so no row-by-row test is worth making before the rows
    if (!file.zone || !file.zone[i]) return false;
    var h = fnvStr('.' + range.key), z = file.zone[i], q;
    for (q = 0; q < z.length; q++) if (z[q][0] === h) return z[q][1] >= range.min && z[q][2] <= range.max;
    return false;
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
  // ---- frame arena (main-thread reads): a block's decompressed frames go into one kept buffer, used again by the next block and the next call, instead of a fresh copy per frame.
  // Fresh memory costs a first write (about 0.7 ms per MB) and garbage; the rows never point into frames, so the next block may overwrite them. Helpers and unpackColumns keep owned copies.
  // When a block needs more than the buffer holds, the rest of it gets plain copies and the next block gets a bigger buffer. Dropped 4 s after the last read, and by trim().
  var ARENA = { buf: null, at: 0, want: 0, drop: null }, ARENA_ON = true, ARENA_MS = 4000;
  function arenaDrop() { if (ARENA.drop) { clearTimeout(ARENA.drop); ARENA.drop = null; } ARENA.buf = null; ARENA.at = ARENA.want = 0; }
  function arenaReset() {
    if (ARENA.want > (ARENA.buf ? ARENA.buf.byteLength : 0)) ARENA.buf = new ArrayBuffer(Math.ceil(ARENA.want * 1.25 / 65536) * 65536);
    ARENA.at = 0; ARENA.want = 0;
    if (ARENA.drop) clearTimeout(ARENA.drop);
    if (typeof setTimeout === 'function') { ARENA.drop = setTimeout(arenaDrop, ARENA_MS); if (ARENA.drop && ARENA.drop.unref) ARENA.drop.unref(); }
  }
  // W-arena (research): frames decompress straight into the decoder's own output buffer, one after another, so the JavaScript arena and its copy go away.
  // A block reserves the input buffer at the block's compressed length (no frame can be longer) and the output buffer at the largest block seen (x1.25).
  // If a frame would not fit, or the wasm memory moved (a view over the old memory would be stale), the block starts again after a bigger reserve.
  var WA = { at: 0, want: 0, est: 0, buf: null, restarts: 0, moved: 0, over: 0 }, WA_ON = !(typeof process !== 'undefined' && !!process.env && process.env.LFC_WA === '0'), WA_RESTART = { wa: 1 };
  function waZs(zs) {
    var z = Object.create(zs);
    z.decompress = z.decompressView = function (src, outLen) {
      if (outLen == null) outLen = zs.contentSize(src); if (outLen < 0) throw new Error('zstd: unknown content size');
      var at = (WA.at + 7) & ~7; WA.at = at + outLen; if (WA.at > WA.want) WA.want = WA.at;
      if (WA.at > zs.outCap()) { WA.over = 1; throw WA_RESTART; }
      var v = zs.decompressAt(src, outLen, at);
      if (zs.memBuf() !== WA.buf) { WA.moved++; throw WA_RESTART; }
      return v;
    };
    return z;
  }
  function waRun(zs, bytes, fn) {
    var t; for (t = 0; t < 8; t++) {
      var need = Math.max(WA.est, Math.ceil(WA.want * 1.25)); zs.reserve(bytes ? bytes.length : 0, need);
      WA.buf = zs.memBuf(); WA.at = 0; WA.want = 0; WA.over = 0;
      try { return fn(); } catch (e) { if (e !== WA_RESTART) throw e; WA.restarts++; if (WA.over) WA.est = Math.max(need * 2, Math.ceil(WA.want * 1.25), bytes ? Math.ceil(bytes.length * 1.5) : 0); }
    }
    throw new Error('LfcPack: block too big for the frame buffer');
  }
  function arenaZs(zs, small) {
    if (WA_ON && small) return waZs(zs);
    if (!ARENA_ON) return zs;
    var z = Object.create(zs);
    z.decompress = function (src, outLen) {
      var v = zs.decompressView(src, outLen), n = v.length, at = (ARENA.at + 7) & ~7;   // 8-byte steps: frames are read as 16-, 32- and 64-bit arrays in place
      ARENA.want = at + n;
      if (!ARENA.buf || at + n > ARENA.buf.byteLength) { ARENA.at = at + n; return v.slice(); }
      var out = new Uint8Array(ARENA.buf, at, n); out.set(v); ARENA.at = at + n; return out;
    };
    return z;
  }
  function arenaReader(rd, small) {   // each block starts at the front of the buffer again
    if (WA_ON && small) {
      var w = Object.create(rd), zs = S.zdec;
      w.readBlock = function (a, b, c) { return waRun(zs, a, function () { return rd.readBlock(a, b, c); }); };
      if (rd.readRange) w.readRange = function (a, b, c) { return waRun(zs, a, function () { return rd.readRange(a, b, c); }); };
      if (rd.readSel) w.readSel = function (a, b, c, d, e, f) { return waRun(zs, a, function () { return rd.readSel(a, b, c, d, e, f); }); };
      if (rd.readPos) w.readPos = function (a, b, c, d, e, f) { return waRun(zs, a, function () { return rd.readPos(a, b, c, d, e, f); }); };
      if (rd.readEq) w.readEq = function (a, b, c, d, e, f, g) { return waRun(zs, a, function () { return rd.readEq(a, b, c, d, e, f, g); }); };
      return w;
    }
    if (!ARENA_ON) return rd;
    var r = Object.create(rd);
    r.readBlock = function (a, b, c) { arenaReset(); return rd.readBlock(a, b, c); };
    if (rd.readRange) r.readRange = function (a, b, c) { arenaReset(); return rd.readRange(a, b, c); };
    if (rd.readSel) r.readSel = function (a, b, c, d, e, f) { arenaReset(); return rd.readSel(a, b, c, d, e, f); };
    if (rd.readPos) r.readPos = function (a, b, c, d, e, f) { arenaReset(); return rd.readPos(a, b, c, d, e, f); };
    if (rd.readEq) r.readEq = function (a, b, c, d, e, f, g) { arenaReset(); return rd.readEq(a, b, c, d, e, f, g); };
    return r;
  }
  // unpack(bytes, { keys: ['ts', 'ms'], range: { key: 'ts', min: 10, max: 20 } }): only those keys, only rows whose number is in range; blocks outside the range are never decoded
  function unpack(bytes, opts) {   // -> array of row objects
    var f0 = openFile(bytes);
    if (f0.footer.sec[SEC_DELTA]) { if (opts && (opts.equals || opts.range || opts.keys || opts.lazy)) throw new Error('LfcPack: a delta file reads whole (no equals, range, keys or lazy): rebuild the rows with unpackTables(file, { base }) first'); var dt = unpackDelta(bytes, opts), dn, dr = []; for (dn in dt) if (Array.isArray(dt[dn])) for (var di = 0; di < dt[dn].length; di++) dr.push(dt[dn][di]); return dr; }   // a delta: the rows of its tables, with { base }
    if (opts) return unpackSome(bytes, opts);
    var file = f0, rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), out = [], i, r, j, kd;
    for (i = 0; i < file.blocks.length; i++) { kd = file.blocks[i][4]; r = kd === 'r' ? rawRows(readRawBlock(S.zdec, blockBytes(file, i))) : (kd === 'f' ? rf : rn).readBlock(blockBytes(file, i)); for (j = 0; j < r.length; j++) out.push(r[j]); }
    return out;
  }
  // equality reads: unpack(file, { equals: { key, value }, keys?, cache? }) -> the rows whose value under key is === value (a missing key never matches null), with the same rows and key order as unpack(file).filter(...)
  // cache: true keeps, between queries on the same file bytes, each touched block's parsed frames, decoded columns and one code per row for the asked key; kept bytes are counted and the least recently used blocks go first once they pass EQ_LIMIT (clearCache() drops all)
  var EQ_CACHE = new WeakMap(), EQ_LRU = new Map(), EQ_LIMIT = 67108864, EQ_TOTAL = 0, EQ_ID = 0;
  function eqSize(bc) {   // an estimate of the bytes one block's cache holds
    var t = 0, j, k, v, F = bc.F;
    if (!F) return 0;
    if (F.pl) t += F.pl.length;
    for (j = 0; j < F.cols.length; j++) { var c = F.cols[j]; if (c && c.one) for (k in c.one) if (c.one[k] && c.one[k].length) t += c.one[k].length; }
    for (j = 0; j < bc.vals.length; j++) { v = bc.vals[j]; if (v) t += v.byteLength !== undefined ? v.byteLength : v.length * 8; }
    for (k in bc) if (k.charAt(0) === 'k' && bc[k] && bc[k].row) { v = bc[k].row; t += v.byteLength !== undefined ? v.byteLength : v.length * 8; if (bc[k].lm) t += bc[k].lm.size * 48; }
    return t;
  }
  function eqTouch(ent, bc) {   // count this block's cache, mark it most recently used, evict the oldest while over the limit (a block bigger than the limit is not kept)
    var sz = eqSize(bc), old = ent.size, k, e;
    EQ_TOTAL += sz - old; ent.size = sz; EQ_LRU.delete(ent.id); EQ_LRU.set(ent.id, ent);
    for (k of EQ_LRU.keys()) {
      if (EQ_TOTAL <= EQ_LIMIT) break;
      e = EQ_LRU.get(k); EQ_LRU.delete(k); EQ_TOTAL -= e.size; delete e.EC[e.ck];
    }
  }
  function clearCache() { EQ_LRU.forEach(function (e) { delete e.EC[e.ck]; }); EQ_LRU.clear(); EQ_TOTAL = 0; }
  function cacheLimit(n) { if (n !== undefined) { EQ_LIMIT = Math.max(0, +n || 0); eqTouchAll(); } return EQ_LIMIT; }
  function eqTouchAll() { var k, e; for (k of EQ_LRU.keys()) { if (EQ_TOTAL <= EQ_LIMIT) break; e = EQ_LRU.get(k); EQ_LRU.delete(k); EQ_TOTAL -= e.size; delete e.EC[e.ck]; } }
  function cacheBytes() { return EQ_TOTAL; }
  var EQF_CACHE = new WeakMap();
  function eqfOf(arg, file) {   // NX A: the block filters (section 18), parsed once per file bytes
    var k = arg !== null && typeof arg === 'object' ? arg : null, v = k ? EQF_CACHE.get(k) : undefined;
    if (v === undefined) { var q = file.footer.sec[SEC_EQF] ? jsonSec(file.footer.sec[SEC_EQF]) : null, rg; v = null;
      if (Array.isArray(q) && q[0] >= 0 && q[0] + q[1] <= file.footer.bodyEnd) { rg = file.bytes.subarray(q[0], q[0] + q[1]); if (crcJS(rg, 0) === q[2]) { try { v = eqRegionRead(q[3] ? S.zdec.decompress(rg, q[3]).slice() : rg); } catch (e) { v = null; } } }   // damaged filters: read without them
      if (k) EQF_CACHE.set(k, v); }
    return v;
  }
  function unpackEq(bytes, opts) {
    var file = openFile(bytes), rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), out = [], i, j, r, kd, want = null, eq = opts.equals, evOk = !eq.anyOf || NX_C === 'on', ev = eq.anyOf && NX_C === 'on' ? new AnyOf(eq.anyOf) : eq.value, mode = opts._eq || 'codes', useCache = !eq.anyOf && !!opts.cache && mode === 'codes' && bytes !== null && typeof bytes === 'object';
    if (opts.keys) { want = {}; for (i = 0; i < opts.keys.length; i++) want[opts.keys[i]] = 1; want[eq.key] = 1; }
    var EQF = evOk && file.blocks.length > 1 ? eqfOf(bytes, file) : null; var EQN = EQF ? eqNeedles(ev) : null;
    for (i = 0; i < file.blocks.length; i++) {
      if (opts.table != null && (file.blocks[i][5] || 0) !== opts.table) continue;
      kd = file.blocks[i][4]; r = null;
      if (kd === 'f' && EQF && EQF[i] && eqSkipBlock(EQF[i], eq.key, EQN)) continue;   // NX A
      if (kd === 'f' && mode !== 'off') {
        var pbk = want ? partialBytes(file, i) : null, bc = null, ent = null;
        if (useCache) {
          var EC = EQ_CACHE.get(bytes); if (!EC) { EC = {}; EQ_CACHE.set(bytes, EC); }
          var ck = i + (want ? ':' + Object.keys(want).sort().join(',') : ''); bc = EC[ck];
          if (!bc) { bc = EC[ck] = {}; bc._ent = { id: ++EQ_ID, EC: EC, ck: ck, size: 0 }; }
          ent = bc._ent;
        }
        r = !evOk ? null : rf.readEq(pbk || blockBytes(file, i), want, !!pbk, eq.key, ev, mode, bc);
        if (ent) eqTouch(ent, bc);
      }
      if (!r && kd === 'n' && mode !== 'off' && !eq.anyOf) r = rn.readEq(blockBytes(file, i), want, eq.key, eq.value);   // nested blocks: matching rows are found first, and only they are built
      if (!r && kd === 'r' && NX_B === 'on') { var rtx = tdr.decode(readRawBlock(S.zdec, blockBytes(file, i))); if (rawMiss(rtx, eq)) continue; r = rawRows0(rtx); if (want) r = projectRows(r, want); var kq = [], eS = eq.anyOf ? new Set(eq.anyOf) : null; for (j = 0; j < r.length; j++) if (eS ? Object.prototype.hasOwnProperty.call(r[j], eq.key) && eS.has(r[j][eq.key]) : r[j][eq.key] === eq.value) kq.push(r[j]); r = kq; }
      if (!r) { r = kd === 'r' ? rawRows(readRawBlock(S.zdec, blockBytes(file, i))) : (kd === 'f' ? rf.readBlock(blockBytes(file, i), want) : rn.readBlock(blockBytes(file, i), want)); if (want && kd === 'r') r = projectRows(r, want); var kp = [], es = eq.anyOf ? new Set(eq.anyOf) : null; for (j = 0; j < r.length; j++) if (es ? Object.prototype.hasOwnProperty.call(r[j], eq.key) && es.has(r[j][eq.key]) : r[j][eq.key] === eq.value) kp.push(r[j]); r = kp; }
      if (opts.keys && opts.keys.indexOf(eq.key) < 0) r = projectRows(r, (function () { var w = {}; opts.keys.forEach(function (k) { w[k] = 1; }); return w; })());
      for (j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }
  // W1: unpack(file, { equals | range, positions: true }) -> a Uint32Array of the row numbers (in the order unpack(file) returns the rows; with `table`, in that table's rows) of the rows the same query would return, and no row objects; keys, rows and cache have no effect
  function unpackPositions(bytes, opts) {
    var eq = opts.equals, range = opts.range || null;
    if (!eq && !range) throw new Error('LfcPack: positions needs equals or range');
    var file = openFile(bytes), rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), i, j, r, kd, base = 0, got = new Uint32Array(1024), m = 0, tb;
    var evOk = !eq || !eq.anyOf || NX_C === 'on', ev = eq ? (eq.anyOf && NX_C === 'on' ? new AnyOf(eq.anyOf) : eq.value) : null, md = eq ? (opts._eq || 'codes') : 'range';
    var EQF = eq && evOk && file.blocks.length > 1 ? eqfOf(bytes, file) : null, EQN = EQF ? eqNeedles(ev) : null, es = eq && eq.anyOf ? new Set(eq.anyOf) : null;
    for (i = 0; i < file.blocks.length; i++) {
      tb = file.blocks[i][5] || 0;
      if (opts.table != null && tb !== opts.table) continue;
      var nb = file.blocks[i][3], b0 = base; base += nb; kd = file.blocks[i][4]; r = null;
      if (range && !blockMayMatch(file, i, range)) continue;
      if (eq && kd === 'f' && EQF && EQF[i] && eqSkipBlock(EQF[i], eq.key, EQN)) continue;
      if (kd === 'f' && md !== 'off' && evOk) r = rf.readPos(blockBytes(file, i), eq ? eq.key : range.key, ev, md, range ? range.min : 0, range ? range.max : 0);
      if (!r) {   // other blocks, and flat blocks the fast path declines: the rows are read and tested as the row queries test them
        var rows = kd === 'r' ? rawRows(readRawBlock(S.zdec, blockBytes(file, i))) : (kd === 'f' ? rf.readBlock(blockBytes(file, i), null) : rn.readBlock(blockBytes(file, i), null)), q = [], v;
        for (j = 0; j < rows.length; j++) {
          if (range) { v = rows[j][range.key]; if (typeof v === 'number' && v >= range.min && v <= range.max) q.push(j); }
          else if (es ? Object.prototype.hasOwnProperty.call(rows[j], eq.key) && es.has(rows[j][eq.key]) : rows[j][eq.key] === eq.value) q.push(j);
        }
        r = q;
      }
      if (m + r.length > got.length) { var g2 = new Uint32Array(Math.max(got.length * 2, m + r.length)); g2.set(got.subarray(0, m)); got = g2; }
      for (j = 0; j < r.length; j++) got[m++] = b0 + r[j];
    }
    return got.slice(0, m);
  }
  function unpackSome(bytes, opts) {
    if (opts.positions) return unpackPositions(bytes, opts);
    if (opts.equals) return unpackEq(bytes, opts);
    var file = openFile(bytes), rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))), rf = arenaReader(makeFlatReader(arenaZs(S.zdec))), out = [], i, j, r, kd, want = null, range = opts.range || null;
    rf.generated(opts.rows === 'generated'); rf.lazy(opts.rows === 'lazy' ? 1 : opts.rows === 'lazycols' ? 2 : false);
    if (opts.keys) { want = {}; for (i = 0; i < opts.keys.length; i++) want[opts.keys[i]] = 1; if (range) want[range.key] = 1; }
    for (i = 0; i < file.blocks.length; i++) {
      if (opts.table != null && (file.blocks[i][5] || 0) !== opts.table) continue;
      if (!blockMayMatch(file, i, range)) continue;
      kd = file.blocks[i][4];
      if (kd === 'r') r = rawRows(readRawBlock(S.zdec, blockBytes(file, i))); else if (kd === 'f') { var pbk = want ? partialBytes(file, i) : null; r = range && !blockInside(file, i, range) ? rf.readSel(pbk || blockBytes(file, i), want, !!pbk, range.key, range.min, range.max) : null; if (r) kd = 'fs'; else r = rf.readBlock(pbk || blockBytes(file, i), want, !!pbk); } else if (kd === 'n' && range && !blockInside(file, i, range)) { r = rn.readSel(blockBytes(file, i), want, false, range.key, range.min, range.max); kd = 'fs'; } else r = rn.readBlock(blockBytes(file, i), want);   // P13f: nested blocks test the range key before making rows
      if (want && kd === 'r') r = projectRows(r, want);
      if (kd !== 'fs') r = keepRows(r, range);
      if (opts.keys && range && opts.keys.indexOf(range.key) < 0) r = projectRows(r, (function () { var w = {}; opts.keys.forEach(function (k) { w[k] = 1; }); return w; })());
      for (j = 0; j < r.length; j++) out.push(r[j]);
    }
    return out;
  }
  // B40 aggregate(bytes, { key, by }) (research, name picked by the owner 11.14): sum, count and average of one number column, optionally per group of another column, without building either column.
  // -> { sum, count, avg } or, with by, { keys, sum, count, avg } (arrays, groups in first-seen order). Values that are not numbers (null, text, missing) are skipped; avg of no values is NaN.
  // Bit-packed number columns are summed as exact whole-number codes in bdec.wasm and divided once per scale: the result is the decimal sum as written, rounded once (a plain loop can differ in the last digits).
  // Group keys: whole-number columns of up to 16 bits and text dictionary columns go through the wasm kernel; any other column kind (and any value column that is not bit-packed) takes a plain loop with the same results.
  // Repeat calls on the same bytes object reuse the checked block headers and frames of that block (AGC), so a block is checked once per bytes object.
  var AGC = typeof WeakMap === 'function' ? new WeakMap() : null;
  function aggFrames(file, i, want, wkey) {
    var c = AGC ? AGC.get(file.bytes) : null; if (AGC && !c) { c = {}; AGC.set(file.bytes, c); }
    var ck = i + '|' + wkey; if (c && c[ck]) return c[ck];
    var pbc = partialBytes(file, i), F = flatFrames(S.zdec, pbc || blockBytes(file, i), want, false, !!pbc, true);
    if (c) c[ck] = F; return F;
  }
  function aggFr(col) { if (col.fr) return col.fr; var o = [], q; for (q = 0; q < col.zf.length; q++) o.push(col.zf[q][0][2] ? col.zs.decompress(col.zf[q][1], col.zf[q][0][0]) : col.zf[q][1]); return o; }
  function aggregate(bytes, o) {
    o = o || {}; if (typeof o.key !== 'string') throw new Error('LfcPack: aggregate needs { key }');
    var file = openFile(bytes), key = o.key, by = o.by == null ? null : String(o.by), want = {}, i, X = bdx(), G = by !== null ? new Map() : null, isum = {}, loose = 0, cnt = 0, wkey = key + '\0' + (by === null ? '' : by);
    want[key] = 1; if (by !== null) want[by] = 1;
    function gget(k) { var g = G.get(k); if (!g) { g = { s: {}, l: 0, c: 0 }; G.set(k, g); } return g; }
    for (i = 0; i < file.blocks.length; i++) {
      if (file.blocks[i][4] === 'r') {   // B39k small raw block (32 rows or fewer): plain loop over its rows
        var rr = rawRows(readRawBlock(S.zdec, blockBytes(file, i))), ri, rv, rg;
        for (ri = 0; ri < rr.length; ri++) { rv = rr[ri] !== null && typeof rr[ri] === 'object' ? rr[ri][key] : undefined; if (typeof rv !== 'number') continue; if (by === null) { loose += rv; cnt++; } else { rg = gget(Object.prototype.hasOwnProperty.call(rr[ri], by) ? rr[ri][by] : undefined); rg.l += rv; rg.c++; } }
        continue; }
      if (file.blocks[i][4] !== 'f') throw new Error('LfcPack: aggregate needs flat-row blocks');
      var F = aggFrames(file, i, want, wkey), n = F.n, ks = F.meta.keys, jv = ks.indexOf(key), jb = by !== null ? ks.indexOf(by) : -1;
      if (F.ordList) throw new Error('LfcPack: aggregate needs a block without key-order lists');
      if (jv < 0 || !F.cols[jv]) continue;
      var cm = F.meta.cols[jv], fr = aggFr(F.cols[jv]), vin = null, np = null, vp = null, m = cm.n;
      if (cm.t === 'B' && cm.p.w <= 24) { vin = fr[0]; vp = cm.p; } else if (cm.t === 'N' && cm.p.t === 'B' && cm.p.p.w <= 24) { vin = fr[1]; np = fr[0]; vp = cm.p.p; }
      var exact = X && vin && m * (Math.pow(2, vp.w) + Math.abs(vp.mn)) < 4e15;   // whole-number sums stay exact in a double
      if (by === null) {
        if (exact) { var L1 = bdLay([vin.length, np ? np.length : 0, 16]), u8 = new Uint8Array(bdMem(L1.end)); bdPut(u8, L1.at[0], vin); if (np) bdPut(u8, L1.at[1], np); var a8 = new Float64Array(X.memory.buffer, L1.at[2], 2); a8[0] = 0; a8[1] = 0; X.sumI(L1.at[0], np ? L1.at[1] : 0, m, vp.w, L1.at[2]); a8 = new Float64Array(X.memory.buffer, L1.at[2], 2); isum[vp.scale] = (isum[vp.scale] || 0) + a8[0] + a8[1] * vp.mn; cnt += a8[1]; }
        else { var v = decodeColumn(cm, S.zdec, fr), q, y; for (q = 0; q < v.length; q++) { y = v[q]; if (typeof y === 'number') { loose += y; cnt++; } } }
        continue;
      }
      var cb = jb >= 0 && F.cols[jb] ? F.meta.cols[jb] : null, fb = cb ? aggFr(F.cols[jb]) : null, kin = null, kw = 0, lab = null;
      if (cb && cb.n === n && cb.t === 'B' && cb.p.w <= 16) { kin = fb[0]; kw = cb.p.w; lab = (function (p) { return function (k) { return (k + p.mn) / p.scale; }; })(cb.p); }
      else if (cb && cb.n === n && cb.t === 'D' && !(cb.p.w === 0 && cb.p.wide)) { var labs = tdr.decode(fb[0]).split('\0'); kin = fb[1]; kw = cb.p.w || 8; lab = function (k) { return labs[k]; }; }
      if (exact && kin && m === n && kw > 0 && kw <= 16) {
        var nk = 1 << kw, L2 = bdLay([vin.length, np ? np.length : 0, kin.length, nk * 8, nk * 4]), u = new Uint8Array(bdMem(L2.end)), k, g, c2;
        bdPut(u, L2.at[0], vin); if (np) bdPut(u, L2.at[1], np); bdPut(u, L2.at[2], kin); u.fill(0, L2.at[3], L2.at[4] + nk * 4);
        X.grpI(L2.at[0], np ? L2.at[1] : 0, n, vp.w, L2.at[2], kw, L2.at[3], L2.at[4]);
        var su = new BigUint64Array(X.memory.buffer, L2.at[3], nk), cn = new Uint32Array(X.memory.buffer, L2.at[4], nk);
        for (k = 0; k < nk; k++) if ((c2 = cn[k])) { g = gget(lab(k)); g.s[vp.scale] = (g.s[vp.scale] || 0) + Number(su[k]) + c2 * vp.mn; g.c += c2; }
        continue;
      }
      // any other kinds: build both columns of this block and loop (rows without the group key group under undefined)
      var V = decodeColumn(cm, S.zdec, fr), K2 = cb ? decodeColumn(cb, S.zdec, fb) : null, pr = F.pl, pb = (n + 7) >> 3, r, vi = 0, ki = 0, hv, hk, kk, yy, gg;
      for (r = 0; r < n; r++) { hv = m === n || ((pr[jv * pb + (r >> 3)] >> (r & 7)) & 1); hk = cb && (cb.n === n || ((pr[jb * pb + (r >> 3)] >> (r & 7)) & 1)); yy = hv ? V[vi++] : undefined; kk = hk ? K2[ki++] : undefined; if (typeof yy !== 'number') continue; gg = gget(kk); gg.l += yy; gg.c++; }
    }
    function fin(sm, l) { var t = l, s2; for (s2 in sm) t += sm[s2] / +s2; return t; }
    if (by === null) { var tt = fin(isum, loose); return { sum: tt, count: cnt, avg: cnt ? tt / cnt : NaN }; }
    var out = { keys: [], sum: [], count: [], avg: [] }; G.forEach(function (g2, k2) { var t2 = fin(g2.s, g2.l); out.keys.push(k2); out.sum.push(t2); out.count.push(g2.c); out.avg.push(t2 / g2.c); }); return out;
  }
  // unpackColumns(bytes, { keys }): flat-row blocks come back as typed columns, no row objects (experimental): [{ n, keys, cols, present }] one entry per block; other block kinds throw
  function nullsOpt(o) { var v = o && o.nulls; if (v === undefined || v === null) return false; if (v === 'NaN') return true; throw new Error("LfcPack: nulls must be 'NaN'"); }
  function unpackColumns(bytes, opts) {
    var file = openFile(bytes), rf = makeFlatReader(S.zdec), out = [], i, want = null, k, nan = nullsOpt(opts);
    opts = opts || {}; if (opts.keys) { want = {}; for (k = 0; k < opts.keys.length; k++) want[opts.keys[k]] = 1; }
    for (i = 0; i < file.blocks.length; i++) { if (file.blocks[i][4] === 'r') { { var rb = b39Cols(rawRows(readRawBlock(S.zdec, blockBytes(file, i))), want); out.push(nan ? nanCols(rb) : rb); } continue; } if (file.blocks[i][4] !== 'f') throw new Error('LfcPack: unpackColumns needs flat-row blocks'); { var pbc = want ? partialBytes(file, i) : null; out.push(rf.columnsOf(pbc || blockBytes(file, i), want, !!pbc, nan)); } }
    return out;
  }
  // the object packTables was given: arrays come back as arrays of rows, other values as they were
  function unpackTables(bytes, opts) {
    var f0 = openFile(bytes);
    if (f0.footer.sec[SEC_DELTA]) return unpackDelta(bytes, opts);
    return unpackTablesPlain(bytes, opts);
  }
  function unpackTablesPlain(bytes, opts) {
    var file = openFile(bytes), t = (file.header && file.header.tables) || [['', 'rows']], out = {}, i, r;
    for (i = 0; i < t.length; i++) { r = unpackSome(file.bytes, Object.assign({}, opts || {}, { table: i })); out[t[i][0]] = t[i][1] === 'value' ? (r.length ? r[0].v : null) : r; }
    return out;
  }
  function metadata(bytes) { var m = openFile(bytes).meta; return m === undefined ? null : m; }   // the metadata object the file was packed with (opts.meta), or null; reads the footer only
  // unpackRows(bytes, { from, count, table }): the rows from..from+count-1 (of the table, default the first) without decoding blocks outside that range. Files with raw blocks (their block row count includes blank lines) are read whole and cut.
  function unpackRows(bytes, opts) {
    opts = opts || {}; var from = opts.from || 0, count = opts.count == null ? Infinity : opts.count, file = openFile(bytes), tb = opts.table || 0, i, kd, start = 0, out = [], r, b, lo, hi, rn, rf;
    for (i = 0; i < file.blocks.length; i++) if (file.blocks[i][4] === 'r') return unpackSome(bytes, { table: tb }).slice(from, count === Infinity ? undefined : from + count);
    rn = arenaReader(makeNestedReader(arenaZs(S.zdec), sharedOf(file))); rf = arenaReader(makeFlatReader(arenaZs(S.zdec)));
    for (i = 0; i < file.blocks.length && out.length < count; i++) {
      b = file.blocks[i]; if ((b[5] || 0) !== tb) continue;
      if (start + b[3] > from) { kd = b[4]; lo = Math.max(0, from - start); hi = Math.min(b[3], lo + (count - out.length)); if (kd === 'f') { r = rf.readRange(blockBytes(file, i), lo, hi); for (lo = 0; lo < r.length; lo++) out.push(r[lo]); } else { hi = Math.min(b[3], hi); r = rn.readRange(blockBytes(file, i), lo, hi); for (lo = 0; lo < r.length; lo++) out.push(r[lo]); } }   // P13f: nested blocks make only the rows in the window
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
    var st = opts.share ? sharedState() : null, mopts = Object.assign({}, opts, st ? { _st: st } : {}, { _nohead: true, _piece: true });   // each chunk is one block: the head rule is applied here, not inside packMany
    var bb = opts.blockBytes || BLOCK_BYTES, blocks = [], zone = [], off = 0, rows = 0, tail = true, done = false, fmin = 0;
    var b39Last = null; function cut(chunk) { b39Last = chunk; return add(packMany([{ name: null, bytes: chunk }], mopts)); }   // one chunk of whole lines -> its block bytes
    function add(mini) {   // a one-chunk file -> its block bytes, with the table entries moved to this file's offsets
      var f = openFile(mini), out = [], i, b, e; if (f.footer.minor > fmin) fmin = f.footer.minor;
      for (i = 0; i < f.blocks.length; i++) {
        b = f.blocks[i]; e = mini.subarray(b[0], b[0] + b[1]);
        blocks.push([off].concat(b.slice(1, 5), 0, b.slice(6))); zone.push(f.zone[i] || []); off += b[1]; rows += b[3]; out.push(e);
      }
      return out;
    }
    /* the text not yet packed is kept as a list of pushed pieces (parts, plen bytes in all) and joined only when a block is cut, so many small pushes
       do not copy the waiting text again on every push (since 0.6.2); scan says how far the search for a line end past the block size has already gone */
    var parts = [], plen = 0, scan = 0;
    function joined() { if (parts.length === 1) return parts[0]; var u = new Uint8Array(plen), p = 0, i; for (i = 0; i < parts.length; i++) { u.set(parts[i], p); p += parts[i].length; } parts = [u]; return u; }
    var head = true;   // B22: until the first block is cut
    function take(final) {
      var out = [], e, nl, u;
      while (plen) {
        if (head && bb > HEAD_MIN) {   /* hold the first cut until more than HEAD_MIN bytes wait (or finish), then cut it at the first line end at or after HEAD_BYTES */
          if (plen <= HEAD_MIN) { if (!final) break; head = false; continue; }
          head = false; nl = -1; for (var hi = 0, hp = 0; hi < parts.length && nl < 0; hi++) { var ha = parts[hi]; if (hp + ha.length > HEAD_BYTES) { var hk = ha.indexOf(10, Math.max(0, HEAD_BYTES - hp)); if (hk >= 0) nl = hp + hk; } hp += ha.length; }
          e = nl < 0 ? plen : nl + 1; u = joined(); out = out.concat(cut(u.subarray(0, e))); u = u.subarray(e); parts = u.length ? [u] : []; plen = u.length; scan = 0; continue;
        }
        if (plen > bb) {
          /* find the first line end at or after bb without joining: walk the pieces from where the last search stopped */
          nl = -1; var p0 = 0, i, a, from;
          for (i = 0; i < parts.length && nl < 0; i++) { a = parts[i]; if (p0 + a.length > Math.max(bb, scan)) { from = Math.max(0, Math.max(bb, scan) - p0); var k = a.indexOf(10, from); if (k >= 0) nl = p0 + k; } p0 += a.length; }
          if (nl < 0) { scan = plen; if (!final) break; e = plen; } else e = nl + 1;
        } else if (final) e = plen; else break;
        u = joined(); out = out.concat(cut(u.subarray(0, e))); u = u.subarray(e); parts = u.length ? [u] : []; plen = u.length; scan = 0;
      }
      return out;
    }
    return {
      push: function (bytes) {
        if (done) throw new Error('LfcPack: packStream is finished');
        bytes = bytesOf(bytes); if (!bytes.length) return [];
        parts.push(bytes); plen += bytes.length; tail = bytes[bytes.length - 1] === 10;
        var out = take(false), i;
        for (i = 0; i < parts.length; i++) if (parts[i].buffer === bytes.buffer) parts[i] = parts[i].slice();   /* only what waits is copied: the caller may reuse its buffer after push */
        return out;
      },
      /* pushPacked(bytes): append a chunk that packBlock() packed (in a worker, say), in text order, instead of pushing its text. Chunks must be cut where
         push would cut them: at the first line end at or after blockBytes (the last chunk may be shorter). Then the file is the same bytes as push gives (since 0.7.0) */
      pushPacked: function (mini) {
        if (done) throw new Error('LfcPack: packStream is finished');
        if (st) throw new Error('LfcPack: pushPacked does not support share (each worker would build its own tables); pass share: false');
        if (plen) throw new Error('LfcPack: pushPacked cannot follow text that push has not packed yet; push whole blocks or use one of the two');
        var f = openFile(bytesOf(mini)), fl = jsonSec(f.footer.sec[SEC_FLAGS]) || {};
        if (fl.exact || f.footer.sec[SEC_SHARED]) throw new Error('LfcPack: pushPacked needs a file from packBlock');
        if (!f.blocks.length) return [];
        tail = fl.tail !== false; return add(f.bytes);
      },
      finish: function () {
        if (done) throw new Error('LfcPack: packStream is finished');
        done = true; var nb0 = blocks.length, out = take(true);
        if (nb0 === 0 && blocks.length === 1 && rows <= B39_ROWS && !st && b39Last) return [packMany([{ name: null, bytes: b39Last }], opts)];   // B39: a one-block stream is written as pack would write it (small-table layout)
        out.push(writeFooter(S.zfull, [
          { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' })) },
          { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
          { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
          { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false, tail: tail })) }].concat(metaSecs(opts), st && st.used ? [sharedSection(st)] : []), true, fmin));
        return out;
      }
    };
  }
  /* packBlock(chunk, opts): pack one chunk of whole lines on its own, for packStream().pushPacked() to append; the work can run in any worker, since the result
     is plain bytes (a small file of the chunk's blocks). Use the options the stream uses; share and exact are not supported (since 0.7.0) */
  function packBlock(chunk, opts) {
    opts = packOpts(opts); need(true);
    if (opts.exact) throw new Error('LfcPack: packBlock does not support exact mode');
    if (opts.share) throw new Error('LfcPack: packBlock does not support share (each worker would build its own tables); pass share: false');
    var o = { _piece: true }, k; for (k in opts) if (k !== 'meta') o[k] = opts[k];
    return packMany([{ name: null, bytes: bytesOf(chunk) }], o);
  }
  // hash(bytes, kind): 'crc32' (default; the number the file's checksums use) or 'xxh64' (16 lowercase hex digits); WebAssembly when init() has run, plain JavaScript for crc32 otherwise
  function hash(bytes, kind) {
    kind = kind || 'crc32'; if (!(bytes instanceof Uint8Array)) throw new Error('LfcPack: hash needs a Uint8Array');
    if (kind === 'crc32') return S.zdec && S.zdec.crc32 ? S.zdec.crc32(bytes) : crcJS(bytes, 0);
    if (kind !== 'xxh64') throw new Error('LfcPack: unknown hash ' + kind);
    if (!S.zdec || !S.zdec.xxh64) throw new Error('LfcPack: xxh64 needs init() first');
    var h = S.zdec.xxh64(bytes); return (h[1] + 4294967296).toString(16).slice(1) + (h[0] + 4294967296).toString(16).slice(1);
  }
  // ---- open(src): read a file a block at a time, without holding all of it. src is a Blob or File, a function read(offset, length) -> Uint8Array (or a promise of one), or bytes.
  // Reads the 16-byte trailer and the footer first; rows({ from, count, table }) and block(i) then fetch only the byte ranges of the blocks they need. Rows are the same as unpackRows gives.
  // Memory is bounded by the footer and one block. Files with raw blocks (exact mode) are read whole on the first rows() or block() call.
  function open(src) {
    return init({ readOnly: true }).then(function () {
      var size, read, whole = null;
      if (src && typeof src.slice === 'function' && typeof src.size === 'number' && typeof src.arrayBuffer === 'function') { size = src.size; read = function (o, n) { return src.slice(o, o + n).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }; }
      else if (typeof src === 'function') { if (typeof src.size !== 'number') throw new Error('LfcPack.open: a read function needs its file size as read.size'); size = src.size; read = function (o, n) { return Promise.resolve(src(o, n)).then(bytesOf); }; }
      else { whole = bytesOf(src); size = whole.length; read = function (o, n) { return Promise.resolve(whole.subarray(o, o + n)); }; }
      if (size < 17) throw new Error('not an LFC-pack file: too short');
      return read(size - 16, 16).then(function (t) {
        if (t.length !== 16 || t[12] !== 76 || t[13] !== 70 || t[14] !== 67 || t[15] !== 49) throw new Error('not an LFC-pack file');
        var flen = rd32(t, 0); if (flen > size - 16) throw new Error('footer length out of range');
        return read(size - 16 - flen, flen + 16);
      }).then(function (tail) {
        var f = readFooter(S.zdec, tail), blocks = jsonSec(f.sec[SEC_BLOCKS]), i, raw = false, starts = {}, at = {};
        if (!blocks) throw new Error('damaged file: block table missing');
        f.bodyEnd = size - tail.length;
        var file = { bytes: null, footer: f, blocks: blocks, header: jsonSec(f.sec[SEC_HEADER]), zone: jsonSec(f.sec[SEC_ZONE]), meta: jsonSec(f.sec[SEC_META]) };
        for (i = 0; i < blocks.length; i++) { if (blocks[i][4] === 'r') raw = true; var tb = blocks[i][5] || 0; at[i] = starts[tb] || 0; starts[tb] = at[i] + blocks[i][3]; }
        var full = null, getAll = function () { return full || (full = (whole ? Promise.resolve(whole) : read(0, size)).then(function (b) { return b; })); };
        var fetch = function (i) {   /* one block's bytes, checked like blockBytes() */
          var b = blocks[i]; if (!b) return Promise.reject(new Error('block ' + i + ' out of range'));
          if (b[0] + b[1] > f.bodyEnd) return Promise.reject(new Error('block ' + i + ' out of range'));
          return read(b[0], b[1]).then(function (x) {
            if (x.length !== b[1]) throw new Error('block ' + i + ' short read');
            if (typeof b[6] === 'string' && RX_X64.test(b[6]) && S.zdec && S.zdec.xxh64 ? hash(x, 'xxh64') !== b[6] : crcOf(x) !== b[2]) throw new Error('block ' + i + ' checksum mismatch');
            return x;
          });
        };
        var rn = null, rf = null, cf = null, readers = function () { if (!rf) { rn = arenaReader(makeNestedReader(arenaZs(S.zdec, true), sharedOf(file)), true); rf = arenaReader(makeFlatReader(arenaZs(S.zdec, true)), true); } };   // W-arena: open() block reads only (small reads); whole-file and equality reads keep the arena
        var seen = {}, tail = Promise.resolve(), ahead = Promise.resolve();
        var decode = function (i, x, lo, hi) { seen[i] = 1; readers(); var b = blocks[i], r; if (b[4] === 'f') return rf.readRange(x, lo, hi); if (lo > 0 || hi < b[3]) return rn.readRange(x, lo, Math.min(hi, b[3])); return rn.readBlock(x); };   // P13f: a part of a nested block makes only those rows
        var R = {
          size: size, blocks: blocks.map(function (b, k) { return { offset: b[0], length: b[1], rows: b[3], kind: b[4], table: b[5] || 0, first: at[k] }; }),
          info: { rows: file.header.rows, blocks: blocks.length, size: size, major: f.major, minor: f.minor }, meta: file.meta === undefined ? null : file.meta,
          block: function (i) {
            if (raw) return getAll().then(function (all) { var b = blocks[i]; if (!b) throw new Error('block ' + i + ' out of range'); return unpackRows(all, { table: b[5] || 0, from: at[i], count: b[3] }); });
            return fetch(i).then(function (x) { return decode(i, x, 0, blocks[i][3]); });
          },
          // columns(i, { keys }) (since 0.5.9): block i as typed columns, the same entry unpackColumns gives for that block, fetching only that block. Flat-row blocks only (others throw)
          columns: function (i, o) {
            var b = blocks[i]; if (!b) return Promise.reject(new Error('block ' + i + ' out of range'));
            if (b[4] !== 'f') return Promise.reject(new Error('LfcPack: columns() needs a flat-row block; block ' + i + ' is ' + (b[4] === 'r' ? 'raw (exact mode)' : 'nested') + ': read it with block(i)'));
            var want = null, q; if (o && o.keys) { want = {}; for (q = 0; q < o.keys.length; q++) want[o.keys[q]] = 1; }
            var nan2 = nullsOpt(o); return fetch(i).then(function (x) { if (!cf) cf = makeFlatReader(S.zdec); return cf.columnsOf(x, want, false, nan2); });   /* its own reader, not the shared arena: the arrays stay valid after the next block */
          },
          // zone(i, key) (since 0.5.9): { min, max, count } of the number column key in block i, from the footer (nothing is decoded), or null when the block has none for that key. A filter such as id >= 7000000 can skip block i when max < 7000000
          zone: function (i, key) {
            var z = file.zone && file.zone[i], h = fnvStr('.' + key), q; if (!z) return null;
            for (q = 0; q < z.length; q++) if (z[q][0] === h) return { min: z[q][1], max: z[q][2], count: z[q][3] };
            return null;
          },
          rows: function (o) {
            o = o || {}; var from = o.from || 0, count = o.count == null ? Infinity : o.count, tb = o.table || 0, out = [], k = 0;
            if (raw) return getAll().then(function (all) { return unpackRows(all, o); });
            var step = function () {   /* one block at a time, in order: memory holds one block */
              while (k < blocks.length && ((blocks[k][5] || 0) !== tb || at[k] + blocks[k][3] <= from)) k++;
              if (k >= blocks.length || out.length >= count) return out;
              var i = k++, lo = Math.max(0, from - at[i]), hi = Math.min(blocks[i][3], lo + (count - out.length));
              return fetch(i).then(function (x) { var r = decode(i, x, lo, hi); for (var q = 0; q < r.length; q++) out.push(r[q]); return step(); });
            };
            return Promise.resolve().then(step);
          }
        };
        // readAhead() (since 0.10.2, opt-in): when the page is idle, read and decode the first block not read yet (block 1 after a first screen), so the next big read does not
        // pay the browser's warm-up. One block per call, one at a time, after any read in progress. true when a block was read, false for a raw or fully read file or on an error (it is only a hint).
        ['rows', 'block'].forEach(function (nm) { var f0 = R[nm]; R[nm] = function () { var p = f0.apply(R, arguments); tail = p.then(function () {}, function () {}); return p; }; });
        R.readAhead = function () {
          var job = function () {
            return new Promise(function (res) { if (typeof requestIdleCallback === 'function') requestIdleCallback(function () { res(); }, { timeout: 1000 }); else setTimeout(res, 0); }).then(function () { return tail; }).then(function () {
              var i = 0; if (raw) return false; while (i < blocks.length && seen[i]) i++;
              if (i >= blocks.length) return false;
              return R.block(i).then(function () { return true; });
            }).catch(function () { return false; });
          };
          return (ahead = ahead.then(job, job));
        };
        return R;
      });
    });
  }
  // ---- one call without init() (since 0.5.1): before init() has finished, pack and the readers load the WebAssembly themselves and give a promise of the usual result,
  // so `await LfcPack.pack(text)` and `await LfcPack.unpack(bytes)` work as the only line. Once loaded they answer at once, as before (await works on both).
  function auto(fn, write) {
    return function () {
      var a = arguments;
      if (write ? S.sh : S.zdec) return fn.apply(null, a);
      if (write && !WASM['zstd-full']) return fn.apply(null, a);   /* the read-only build: the usual message */
      return init(write ? undefined : { readOnly: true }).then(function () { return fn.apply(null, a); });
    };
  }
  // warm(): opt-in, call once when the page is idle (since 0.6.1). Starts the WebAssembly, then packs and opens one made-up 400-row table set, each step in a task of
  // its own, so the first real save and open skip most of the compile and warm-up cost. Returns the same promise every time: true, or false if it could not run.
  var warmP = null;
  function warm() {
    if (warmP) return warmP;
    var later = function (f) { return new Promise(function (res) { setTimeout(function () { try { res(f()); } catch (e) { res(false); } }, 0); }); };
    var file = null;
    warmP = init().then(function () { return later(function () {
      var nodes = [], links = [], i;
      for (i = 0; i < 400; i++) nodes.push({ id: 'n' + i, label: 'Item ' + (i % 97), group: 'g' + (i % 7), x: i * 1.25, y: (i * 7919) % 1000 / 10, size: i % 13, on: i % 3 === 0, tags: i % 5 ? ['a', 'b' + (i % 4)] : [], attrs: { kind: 'k' + (i % 3), score: i / 7 } });
      for (i = 0; i < 1200; i++) links.push({ source: 'n' + (i % 400), target: 'n' + ((i * 31 + 7) % 400), value: (i % 17) + 0.5, label: i % 9 ? '' : 'link ' + i });
      file = packTables({ meta: { name: 'warm', created: 1700000000000 }, nodes: nodes, links: links }); return true;
    }); }).then(function (ok) { return ok && later(function () { unpackTables(file); file = null; return true; }); }).then(function (ok) { return ok === true; }, function () { return false; });
    return warmP;
  }
  var api = { _waStats: function () { var z = S.zdec; return { restarts: WA.restarts, moved: WA.moved, want: WA.want, outCap: z && z.outCap ? z.outCap() : 0, inCap: z && z.inCap ? z.inCap() : 0, mem: z ? z.memBuf().byteLength : 0, arena: ARENA.buf ? ARENA.buf.byteLength : 0 }; }, _wa: function (on, est) { WA_ON = !!on; if (est != null) WA.est = est; arenaDrop(); return { restarts: WA.restarts, moved: WA.moved, want: WA.want, outCap: S.zdec && S.zdec.outCap ? S.zdec.outCap() : 0, inCap: S.zdec && S.zdec.inCap ? S.zdec.inCap() : 0, mem: S.zdec ? S.zdec.memBuf().byteLength : 0 }; }, _arena: function (on, ms) { ARENA_ON = !!on; if (ms != null) ARENA_MS = ms; arenaDrop(); return ARENA_ON; }, _arenaBytes: function () { return ARENA.buf ? ARENA.buf.byteLength : 0; }, trim: trim, clearCache: clearCache, cacheLimit: cacheLimit, cacheBytes: cacheBytes, _trimPacker: trimPacker, _helperTrimMs: function (ms) { HELPER_TRIM_MS = ms; }, _autoTrimMs: function (ms) { AUTO_TRIM_MS = ms; if (S.idle) { clearTimeout(S.idle); S.idle = null; } }, hash: hash, aggregate: auto(aggregate, false), unpackColumns: auto(unpackColumns, false), packRows: auto(packRows, true), packTables: auto(function (x, o) { return o && o.base ? packDelta(x, o) : packTables(x, o); }, true), unpackTables: auto(unpackTables, false), pool: function (o) { return init({ readOnly: true }).then(function () { return makePool(o); }); }, _job: function (m) { return runJob(m); }, init: init, pack: auto(pack, true), packRowsParallel: packRowsParallel, packColumnsParallel: packColumnsParallel, unpackColumnsParallel: unpackColumnsParallel, unpackRowsParallel: unpackRowsParallel, packParallel: packParallel, packParallelStream: packParallelStream, warmPack: warmPack, warm: warm, packStream: packStream, packBlock: packBlock, unpack: auto(unpack, false), info: auto(info, false), metadata: auto(metadata, false), unpackRows: auto(unpackRows, false), open: open, stats: auto(stats, false), unpackText: auto(unpackText, false), version: '0.10.21', apiVersion: 0 };
