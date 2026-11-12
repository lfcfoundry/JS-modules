# Copyright (c) 2026 LFC Foundry. MIT License.
# research prototype B18b: packRows on flat rows (plain objects, scalar values only) hands the row objects straight to the flat writer in row slices of about one block, no JSON text. Anything else takes the old path. usage: python3 b18b-patch-rows-to-columns.py <module dir>
import sys, os
d = sys.argv[1]
p = os.path.join(d, 'src/flat.js'); s = open(p).read()
a = "var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, text = td.decode(input), lines, rows = [], i, j, r, nl = 0, at = -1;"
assert s.count(a) == 1
s = s.replace(a, "var zs = ctx.zs, level = opts.level == null ? LV_FLAT : opts.level, rowsIn = input && input.rowsIn, text = rowsIn ? '' : td.decode(input), lines, rows = rowsIn || [], i, j, r, nl = 0, at = -1;\n    if (!rowsIn) {   // B18b: row objects given, no text to parse")
a = "    var n = rows.length, keys = [], seen = new Map(), cols = [], k, v, jx;"
assert s.count(a) == 1
s = s.replace(a, "    }\n" + a)
open(p, 'w').write(s)
p = os.path.join(d, 'src/api.js'); s = open(p).read()
a = "  function packRows(rows, opts) { return pack(rowsBytes(rows), opts); }"
assert s.count(a) == 1
s = s.replace(a, """  function packRows(rows, opts) { var po = packOpts(opts); if (!po.exact && !po.block && !po.share && rows.length > 4096 && flatScalars(rows) && b18Pays(rows)) return packManyNow([{ name: null, rowsArr: rows, bytes: new Uint8Array(0) }], po); return pack(rowsBytes(rows), opts); }
  // B18b gate (Chromium 156 sweep on 0.9.3, 15 files): the row path wins when the rows would make more than 16 MB of text (the text path then leaves the wasm scanner), or when fewer than 40% of the cells are strings; string-heavy tables under 16 MB pack faster through the wasm text scanner (1.1 to 1.5 times slower otherwise)
  function b18Pays(rows) { var n = rows.length, k = Math.min(1024, n), est = JSON.stringify(rows.slice(0, k)).length / k * n, i, r, c = 0, st = 0;
    if (est > 16 * 1048576) return true;
    for (i = 0; i < Math.min(256, n); i++) { r = rows[i]; for (var q in r) { c++; if (typeof r[q] === 'string') st++; } }
    return st < c * 0.4; }
  // B18b: true when every row is a plain object whose values are strings, booleans, null or finite numbers other than -0 (so JSON.stringify would write each value as is and keep every key)
  function flatScalars(rows) { var i, r, k, v, t, P = Object.prototype; for (i = 0; i < rows.length; i++) { r = rows[i]; if (r === null || typeof r !== 'object' || Array.isArray(r)) return false; t = Object.getPrototypeOf(r); if (t !== P && t !== null) return false;
    for (k in r) { v = r[k]; t = typeof v; if (t === 'number') { if (v !== v || v === Infinity || v === -Infinity || (v === 0 && 1 / v < 0)) return false; } else if (t !== 'string' && t !== 'boolean' && v !== null) return false; } } return true; }""")
a = "    b = inputs[ti].bytes; p = 0; tail = b.length === 0 || b[b.length - 1] === 10; retry.length = 0;"
assert s.count(a) == 1
s = s.replace(a, """    if (inputs[ti].rowsArr) {   // B18b: row objects, in slices of about one block of text
      var RA = inputs[ti].rowsArr, est = JSON.stringify(RA.slice(0, 1024)).length / Math.min(1024, RA.length) + 1, stp = Math.max(1024, Math.floor(bb / est)), ra, sl;
      for (ra = 0; ra < RA.length; ra += stp) { sl = RA.slice(ra, ra + stp); blk = writeFlatBlock(ctx, { rowsIn: sl }, opts); if (!blk) return packManyNow([{ name: inputs[ti].name, bytes: rowsBytes(RA) }], opts);
        blocks.push(blockEntry(opts, off, blk.bytes, blk.rows, blk.kind || 'n', ti)); zone.push(blk.zone); parts.push(blk.bytes); off += blk.bytes.length; rows += blk.rows; }
      tail = true; continue;
    }
""" + a)
open(p, 'w').write(s)
# B18b part 2: on the row-object path, try both varint forms of an integer or short-decimal column (as the fast writer does) instead of compressing only the one whose varints are not 5% longer; this keeps file sizes even with the fast writer (taxi 1.010 -> 0.999)
p = os.path.join(d, 'src/flat.js'); s = open(p).read()
a = "if (!dl2 || sa <= sb * 1.05) cand('V'"
assert s.count(a) == 1; s = s.replace(a, "if (B18_ALLV || !dl2 || sa <= sb * 1.05) cand('V'")
a = "if (dl2 && sb <= sa * 1.05) cand('V'"
assert s.count(a) == 1; s = s.replace(a, "if (dl2 && (B18_ALLV || sb <= sa * 1.05)) cand('V'")
a = "  function writeFlatBlockFast(ctx, input, opts) {"
assert s.count(a) == 1; s = s.replace(a, "  var B18_ALLV = false;   // B18b: set while the row-object path encodes a block\n" + a)
a = "  function writeFlatBlock(ctx, input, opts) {"
assert s.count(a) == 1; s = s.replace(a, "  function writeFlatBlock(ctx, input, opts) { B18_ALLV = !!(input && input.rowsIn); try { return writeFlatBlock0(ctx, input, opts); } finally { B18_ALLV = false; } }\n  function writeFlatBlock0(ctx, input, opts) {")
open(p, 'w').write(s)
