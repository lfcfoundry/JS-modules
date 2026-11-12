// Copyright (c) 2026 LFC Foundry. MIT License.
// dump each decoded zstd frame of a packed file (raw bytes + stored size) for zdict.py. usage: node dumpfr.cjs BUILD.js OUTDIR file...
const fs = require('fs'), path = require('path');
let rec = null; globalThis.__H = { c() {}, d(src, out) { if (rec) rec.push([src.length, out.slice()]); } };
const L = require(path.resolve(process.argv[2])), out = process.argv[3];
L.init().then(() => { for (const f of process.argv.slice(4)) { const txt = fs.readFileSync(f), t = f.endsWith('.json'); const p = t ? L.packTables(JSON.parse(txt)) : L.pack(txt);
  rec = []; t ? L.unpackTables(p) : L.unpack(p); const seen = new Set(), fr = rec.filter(x => { const k = x[0] + ':' + Buffer.from(x[1]).toString('base64'); if (seen.has(k)) return false; seen.add(k); return true; }); rec = null;
  const d = path.join(out, path.basename(f)); fs.mkdirSync(d, { recursive: true }); fr.forEach((x, i) => fs.writeFileSync(path.join(d, i + '.bin'), x[1]));
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ size: p.length, stored: fr.map(x => x[0]) })); } });
