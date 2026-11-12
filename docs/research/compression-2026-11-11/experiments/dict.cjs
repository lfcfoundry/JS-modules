// Copyright (c) 2026 LFC Foundry. MIT License.
// estimate a built-in zstd dictionary for the small format frames (footer, block meta): size with dictionary ~= c(D + x) - c(D) + frame header bytes,
// D = the footer and meta texts of the OTHER file families (leave one family out), so no file is helped by its own text
const fs = require('fs');
let rec = null; globalThis.__H = { c() {}, d(src, out) { if (rec) rec.push([src.length, out.slice()]); } };
const L = require(process.env.INST || './inst-src.js');
const files = process.argv.slice(2), fam = f => f.replace(/-\d+\.(nd)?json$/, '');
L.init().then(() => {
  const info = {};
  for (const f of files) { const txt = fs.readFileSync(f), t = f.endsWith('.json'); const p = t ? L.packTables(JSON.parse(txt)) : L.pack(txt);
    rec = []; t ? L.unpackTables(p) : L.unpack(p); const fr = rec; rec = null;
    // the footer, and each meta frame (JSON text starting {"keys":) are the format frames
    const fmt = fr.filter((x, i) => i === 0 || (x[1][0] === 123 && x[1][1] === 34 && x[1][2] === 107)); info[f] = { size: p.length, fmt }; }
  const C = b => { const r = globalThis.__ZC(b, 3); return r.length; };
  const cat = a => { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); n = 0; for (const x of a) { o.set(x, n); n += x.length; } return o; };
  console.log('file                 lfc  formatFrames  withDict  saved  share-of-file');
  let tot = [0, 0];
  for (const f of files) {
    const D = cat(files.filter(g => fam(g) !== fam(f)).flatMap(g => info[g].fmt.map(x => x[1]))).slice(0, 65536), cD = C(D);
    let now = 0, est = 0;
    for (const [s, raw] of info[f].fmt) { now += s; const e = C(cat([D, raw])) - cD + 6; est += Math.min(e, raw.length + 0, s); }
    tot[0] += now; tot[1] += est;
    console.log(f.padEnd(18), String(info[f].size).padStart(6), String(now).padStart(12), String(est).padStart(9), String(now - est).padStart(6), (100 * (now - est) / info[f].size).toFixed(1).padStart(8) + '%');
  }
});
