// Copyright (c) 2026 LFC Foundry. MIT License.
// per-frame zstd dictionary estimate for small LFC-pack files. Size with dictionary D ~= c(D + x) - c(D) + 6 (zstd level 3, raw-content prefix).
// usage: node frames.cjs BUILD.js test.ndjson[=train.ndjson] ...   (".json" = packTables). Static D = footer+meta frames of the OTHER families' training files.
// Modes: none (today), static (built-in format dictionary), trained (same app's earlier data, disjoint rows), both, prev (train file is an earlier save of the same document).
const fs = require('fs');
let rec = null; globalThis.__H = { c() {}, d(src, out) { if (rec) rec.push([src.length, out.slice()]); } };
const L = require(require('path').resolve(process.argv[2]));
const fam = f => f.replace(/^tr-/, '').replace(/-(\d+|200e)\.(nd)?json$/, '').replace(/\.(nd)?json$/, '');
const isFmt = (x, i) => i === 0 || (x[1][0] === 123 && x[1][1] === 34 && x[1][2] === 107);
function frames(f) { const txt = fs.readFileSync(f), t = f.endsWith('.json'); const p = t ? L.packTables(JSON.parse(txt)) : L.pack(txt);
  rec = []; t ? L.unpackTables(p) : L.unpack(p); const seen = new Set(), fr = rec.filter(x => { const k = x[0] + ':' + Buffer.from(x[1]).toString('base64'); if (seen.has(k)) return false; seen.add(k); return true; }); rec = null; return { size: p.length, fr }; }  // unpackTables decodes some frames twice
const cat = a => { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); n = 0; for (const x of a) { o.set(x, n); n += x.length; } return o; };
function capped(fr, cap) { const per = Math.max(64, Math.floor(cap / Math.max(1, fr.length))); return cat(fr.map(x => x.slice(0, per))).slice(0, cap); }
L.init().then(() => {
  const C = b => globalThis.__ZC(b, 3).length;
  const specs = process.argv.slice(3).map(s => s.split('=')), trains = [...new Set(specs.map(s => s[1]).filter(Boolean))];
  const T = {}; for (const t of trains) T[t] = frames(t);
  const est = (fr, D) => { if (!D) return fr.reduce((a, x) => a + x[0], 0); const cD = C(D); let e = 0; for (const [s, raw] of fr) e += Math.min(s, C(cat([D, raw])) - cD + 6); return e; };
  console.log('file              size  frames  static  trained   both  | file size: static trained both');
  for (const [f, tr] of specs) { const a = frames(f), other = a.size - est(a.fr);
    const Ds = capped(trains.filter(t => fam(t) !== fam(f)).flatMap(t => T[t].fr.filter(isFmt).map(x => x[1])), 16384);
    const Dt = tr ? capped(T[tr].fr.map(x => x[1]), +(process.env.CAP || 65536)) : null, Db = Dt ? cat([Ds, Dt]).slice(-65536) : null;
    const r = [est(a.fr), est(a.fr, Ds), Dt ? est(a.fr, Dt) : NaN, Db ? est(a.fr, Db) : NaN];
    const pct = v => isNaN(v) ? '   -' : (100 * (other + v) / a.size).toFixed(0).padStart(3) + '%';
    console.log(f.padEnd(15), String(a.size).padStart(6), ...r.map(v => String(v).padStart(7)), ' |', pct(r[1]), pct(r[2]), pct(r[3])); }
});
