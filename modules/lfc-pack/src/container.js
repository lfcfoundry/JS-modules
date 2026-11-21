// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ container: blocks, then footer v1 (sections), then the 16-byte trailer
  var MAJOR = 1, MINOR = 0, MAGIC = [76, 70, 67, 49];   // "LFC1"
  var SEC_HEADER = 1, SEC_BLOCKS = 2, SEC_ZONE = 5, SEC_META = 6, SEC_FLAGS = 12, SEC_RAW = 9, SEC_SPELL = 15, SEC_SHARED = 16, SEC_DELTA = 17, SEC_EQF = 18, SEC_LABELS = 19, SHREG = {};   // 19: label tables of flat blocks (required, since 0.13.0)
  var KNOWN = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 9: 1, 10: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1 };   // 18: NX A equality filters (optional)   // 15 is the number-spelling section, 16 the shared tables of nested blocks   // 8 and 13 are reserved
  function writeFooter(zs, sections, compress, minor) {   // minor: 1 when a null-plane (N) column was written, else the file stays minor 0 and 0.8.x readers open it
    var parts = [], i, s, h;
    for (i = 0; i < sections.length; i++) { s = sections[i]; h = new Uint8Array(8); h[0] = s.id; h[1] = s.id >> 8; h[2] = s.flags; h[3] = s.flags >> 8; h.set(u32le(s.payload.length), 4); parts.push(h, s.payload); }
    var body = concat(parts), f = compress ? concat([new Uint8Array([1]), zs.compress(body, 3)]) : concat([new Uint8Array([0]), body]);
    var t = new Uint8Array(16); t.set(u32le(f.length), 0); t.set(u32le(crcJS(f, 0)), 4); t[8] = MAJOR; t[10] = minor > MINOR ? minor : MINOR; t.set(MAGIC, 12);
    return concat([f, t]);
  }
  function readFooter(zs, file) {
    var n = file.length; if (n < 17) throw new Error('not an LFC-pack file: too short');
    if (file[n - 4] !== 76 || file[n - 3] !== 70 || file[n - 2] !== 67 || file[n - 1] !== 49) throw new Error('not an LFC-pack file');
    var flen = rd32(file, n - 16), fcrc = rd32(file, n - 12), major = rd16(file, n - 8);
    if (major > MAJOR) throw new Error('unsupported format major ' + major);
    if (flen > n - 16) throw new Error('footer length out of range');
    var f = file.subarray(n - 16 - flen, n - 16); if (crcJS(f, 0) !== fcrc) throw new Error('footer checksum mismatch');
    var body = f[0] === 1 ? zs.decompress(f.subarray(1)) : f.subarray(1), sec = {}, p = 0, id, fl, len;
    while (p < body.length) { id = rd16(body, p); fl = rd16(body, p + 2); len = rd32(body, p + 4);
      if (KNOWN[id]) sec[id] = body.subarray(p + 8, p + 8 + len); else if (fl & 1) throw new Error('required section ' + id + ' not supported by this reader');
      p += 8 + len; }
    if (sec[SEC_LABELS]) regLabels(sec[SEC_LABELS]);
    return { major: major, minor: rd16(file, n - 6), bodyEnd: n - 16 - flen, sec: sec };
  }
  // section 19: u32 hl, hl bytes of JSON { name: [offset, length, count] }, then the joined labels (0-separated, UTF-8) of every table; a table is read by the name its blocks carry (p.sh), from any file that holds it
  function regLabels(b) {
    var hl = rd32(b, 0), t = JSON.parse(tdr.decode(b.subarray(4, 4 + hl))), id, e, base = 4 + hl;
    for (id in t) { e = t[id]; if (!Array.isArray(e) || !(e[0] >= 0 && e[1] >= 0 && base + e[0] + e[1] <= b.length) || !(e[2] >= 1)) throw new Error('damaged file: label tables'); if (!SHREG[id]) SHREG[id] = { j: b.subarray(base + e[0], base + e[0] + e[1]), n: e[2], labs: null }; }
  }
  function labsOf(id) {
    var r = SHREG[id]; if (!r) throw new Error('damaged file: label table ' + id + ' is missing');
    if (!r.labs) { r.labs = r.n === 1 && !r.j.length ? [''] : tdr.decode(r.j).split('\0'); if (r.labs.length !== r.n) { r.labs = null; throw new Error('damaged file: label table count'); } }
    return r.labs;
  }
  function labBytesOf(id) {   // a shared table as { bytes, start, end }, made once and shared by every block that names it (read-only)
    var r = SHREG[id]; if (!r) throw new Error('damaged file: label table ' + id + ' is missing');
    if (!r.lb) { r.lb = cutNul(r.j, r.n); }
    return r.lb;
  }
  function parseLabels(b, into) {   // a section's tables merged into { name: { j, n } }
    var hl = rd32(b, 0), t = JSON.parse(tdr.decode(b.subarray(4, 4 + hl))), id, e, base = 4 + hl, c = 0;
    for (id in t) { e = t[id]; if (!into[id]) { into[id] = { j: b.slice(base + e[0], base + e[0] + e[1]), n: e[2] }; c++; } }
    return c;
  }
  function labelSection(w) {   // the footer section for a piece's (or stream's) tables: { name: joined } -> payload
    var ids = Object.keys(w), t = {}, off = 0, i, parts = [], hb;
    for (i = 0; i < ids.length; i++) { t[ids[i]] = [off, w[ids[i]].j.length, w[ids[i]].n]; off += w[ids[i]].j.length; parts.push(w[ids[i]].j); }
    hb = te.encode(JSON.stringify(t)); return { id: SEC_LABELS, flags: 1, payload: concat([u32le(hb.length), hb].concat(parts)) };
  }
  function jsonSec(b) { return b ? JSON.parse(tdr.decode(b)) : undefined; }
  // optional metadata (footer section 6, see PROPOSAL-metadata-section.md): opts.meta is a plain object the app wants to travel with the file; stored as { v: 1, ...meta }, under 64 KB, optional for readers
  function metaSecs(opts) {
    var m = opts && opts.meta; if (m === undefined || m === null) return [];
    if (typeof m !== 'object' || Array.isArray(m)) throw new TypeError('LfcPack: meta must be a plain object');
    var o = { v: 1 }, k; for (k in m) if (k !== 'v') setKey(o, k, m[k]);
    var p = te.encode(JSON.stringify(o)); if (p.length > 65536) throw new RangeError('LfcPack: meta is over 64 KB');
    return [{ id: SEC_META, flags: 0, payload: p }];
  }
