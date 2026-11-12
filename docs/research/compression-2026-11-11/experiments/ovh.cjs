// Copyright (c) 2026 LFC Foundry. MIT License.
// where the bytes of a small LFC-pack file go: trailer, footer, block headers, meta, planes, column data, zstd frame headers; and gzip/xz of the same JSON
const fs = require('fs'), zlib = require('zlib'), cp = require('child_process');
let rec = null; globalThis.__H = { c() {}, d(src, out) { if (rec) rec.push([src.slice(), out.length]); } };
const L = require(process.argv[2]);
function zhdr(f) {   // zstd frame header + block headers + checksum bytes (RFC 8878); the rest is compressed payload
  if (f[0] !== 0x28 || f[1] !== 0xb5 || f[2] !== 0x2f || f[3] !== 0xfd) return null;
  const d = f[4], ss = (d >> 5) & 1, fcs = [ss ? 1 : 0, 2, 4, 8][d >> 6], did = [0, 1, 2, 4][d & 3], ck = (d >> 2) & 1 ? 4 : 0;
  let p = 5 + (ss ? 0 : 1) + did + fcs, h = p, nb = 0;
  for (;;) { const b = f[p] | (f[p + 1] << 8) | (f[p + 2] << 16), last = b & 1, ty = (b >> 1) & 3, sz = b >>> 3; p += 3 + (ty === 1 ? 1 : sz); nb++; if (last) break; }
  return h + 3 * nb + ck;
}
L.init().then(() => {
  console.log('file                 json   gzip9     xz | lfc  = trail footer bhdr   meta planes cols  (zhdr) | meta+fixed share');
  for (const f of process.argv.slice(3)) {
    const txt = fs.readFileSync(f), tables = f.endsWith('.json');
    const p = tables ? L.packTables(JSON.parse(txt)) : L.pack(txt);
    rec = []; tables ? L.unpackTables(p) : L.unpack(p); const fr = rec; rec = null;
    // footer: the first frame decoded; per flat block: meta, planes, then columns (z=1 only; stored frames are not decoded)
    const tl = 16, footer = fr[0][0].length; let zh = 0; for (const [s] of fr) zh += zhdr(s) || 0;
    // block headers: u32 + JSON; find each "{"k":" header in the body and read its u32 length just before it
    let bh = 0, meta = 0, planes = 0, q = 0, s = Buffer.from(p.buffer, p.byteOffset, p.length).toString('latin1');
    for (let i = s.indexOf('{"k":'); i >= 4; i = s.indexOf('{"k":', i + 1)) { const hl = p[i - 4] | (p[i - 3] << 8) | (p[i - 2] << 16) | (p[i - 1] << 24); if (hl <= 0 || hl > 4096) continue; let h; try { h = JSON.parse(s.substr(i, hl)); } catch (e) { continue; } bh += 4 + hl; if (h.m) meta += h.m[1]; if (h.pl) planes += h.pl[1]; }
    const cols = p.length - tl - footer - bh - meta - planes;
    const gz = zlib.gzipSync(txt, { level: 9 }).length, xz = cp.execFileSync('xz', ['-9e', '-c'], { input: txt }).length;
    console.log(f.padEnd(18), String(txt.length).padStart(7), String(gz).padStart(7), String(xz).padStart(6), '|', String(p.length).padStart(6), '=', tl, String(footer).padStart(5), String(bh).padStart(5), String(meta).padStart(6), String(planes).padStart(5), String(cols).padStart(6), ' (' + zh + ')', '|', (100 * (tl + footer + bh + meta + planes) / p.length).toFixed(0) + '%');
  }
});
